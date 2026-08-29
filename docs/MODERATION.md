# MODERATION — 内容审核管线设计

> 📌 **结论以 [CONCLUSIONS.md](./CONCLUSIONS.md) 为准，本文为过程档案。**


> 状态：设计稿（用户已拍板：纳入本期，schema + admin 队列一次建对，供应商接口可后接）。
> 目标：生成内容合规（国内红线），同时把误杀率和人工成本压在可运营范围。

## 1. 双闸模型

```
                    ┌──────────── 闸1：提交时 ────────────┐
用户 prompt ──► 预审（文本机审，同步，<300ms）──► 拦截：任务不建，直接拒绝并提示
                    └──────────────────────────────────┘
                    ┌──────────── 闸2：产物入库前 ────────┐
生成产物（图/视频） ──► 复审（多模态机审，异步）──► pass：正常入库可见
                                            └► review：入库但 only-self 可见，进 admin 人工队列
                                            └► block：不入库，任务置 failed（内容违规），按失败退款
                    └──────────────────────────────────┘
发布到 feed ──► 复用闸2结果；feed 举报 ──► admin 队列重审
```

- 闸1 同步做（任务创建路径内），预算 <300ms；供应商超时 → **fail-open**（放行 + 标记 pending 复审，不阻塞主流程）
- 闸2 异步做（生成完成回调内），不拖慢任务完成态

## 2. 状态机（贯穿三张表）

`tasks/assets/feed_items` 各加 `moderation_status text default 'pending'`：

```
pending → approved | rejected | human_review → (approved | rejected)
```

- prompt 预审结果写 `moderation_events(target_type='prompt', target_id=task_id)`
- 产物复审写 `moderation_events(target_type='asset', target_id=asset_id)`
- 举报写 `user_reports` → admin 处理时联动改 target 的 moderation_status

## 3. 供应商选型对比（实现前二选一）

| | 火山引擎内容安全 | 阿里云内容安全（绿网） |
|---|---|---|
| 文本审 | ✅ 中文强 | ✅ 中文强 |
| 图审 | ✅ | ✅ |
| 视频审 | ✅（抽帧+原声） | ✅ |
| 与现有 Ark 集成 | **同账号同控制台**（现成 key 可能直接可用） | 需新开阿里账号 |
| 计费 | 约 ¥0.5-1.5/千条（量价） | 约 ¥1/千条起 |
| SDK | Volcengine HTTP 签名（自封装简单） | ali-sdk 成熟 |

**推荐：火山内容安全**——与 Ark 同供应商、key 管理复用 admin 的 api_keys 体系（provider=volc-moderation）。

## 4. 机审结果模型

```json
{
  "verdict": "pass | review | block",
  "score": 0.87,
  "labels": ["porn", "politic"],       // 命中标签
  "provider": "volc-moderation",
  "raw": { ... }                        // 原始响应（审计用，90 天过期清理）
}
```

阈值（admin/moderation 可配，改阈值写审计）：
- score ≥ 0.9 或 labels 命中硬红线（politic/terror）→ block
- 0.6 ≤ score < 0.9 → human_review
- < 0.6 → approved

## 5. Admin 审核队列（/admin/moderation）

- 列表：status=human_review 的事件，按 score 降序 + 时间；显示缩略图/原文、机审标签、用户信息
- 操作：通过（→approved）/ 驳回（→rejected，联动：asset 下架 + 用户通知 + 累计违规计数）/ 加黑（用户封禁）
- 键盘快捷流：J/K 上下、1 通过、2 驳回（运营批量处理体验）
- 复审裁决全部写 admin_audit_log

## 6. 用户侧

- 被拦截：提交时红字提示「内容涉嫌违规，请修改后重试」（不透出具体标签）
- 被驳回：站内通知（alerts）+ 违规记录；累计 3 次自动进 human_review 优先队列
- 举报入口：feed 卡片 `···` 菜单 → 举报（reason 枚举：色情/政治/暴力/侵权/其他）

## 7. 数据保留与合规

- moderation_events.raw 保留 90 天后清理（定时任务）
- 被驳回内容：asset 软删（下架但保留 30 天供申诉），后物理删除
- 用户申诉：v1 邮件人工，v2 站内申诉表

## 8. TDD 要点（实现时）
- 阈值判定纯函数：score/labels → verdict（边界值表驱动测试）
- 状态机迁移合法性（pending→rejected 等）
- fail-open 路径：供应商超时 → 任务正常建 + event 标 pending
- block 路径：任务 failed + 幂等退款（复用 ledger 测试）
- 队列操作联动：驳回 → asset 下架 + ledger 不退（违规不退款，需用户确认口径，见 §9）

## 9. 待你确认的口径
1. **违规内容是否退款**：现在设计 = 机审 block/人工驳回均按失败退款（体验友好）；也可改为不退（威慑）。建议：机审误杀率高，先退。
2. 阈值初值（0.9/0.6）是否认可，实现后用真实样本校准。
3. 供应商确认走火山内容安全（同 Ark 账号）？

---

# 增补：自研 AI 审核路线（2026-08-30 · 用户提议：用 AI 实现内容审核）

> 决策变更：**第一道闸用自有 LLM 实现审核**（GLM/豆包多模态），第三方审核 API 降级为可插拔后置项。

## 10. 三路线对比（LLM 自研 vs 第三方 API vs 混合）

| 维度 | LLM 自研审核 | 第三方 API（绿网/火山） |
|---|---|---|
| 单条成本 | prompt <¥0.001；图审 ¥0.002-0.01/张（多模态按 token） | 文本 ¥0.001-0.0015/条；图 ¥0.0015-1.8/张 |
| 自定义规则 | **任意**（审核标准=一段 system prompt，平台规则即提示词） | 标签固定，自定义有限 |
| 涉政细分覆盖 | 较弱（领导人肖像/敏感事件库不如专业厂商全） | **最强**（十年样本库） |
| 合规背书 | 弱（无第三方报告） | **强**（监管举证） |
| 部署 | 零接入（复用 admin api_keys/models） | 新供应商 + 充值 |
| 月成本@日均1000次 | 约 ¥30-90 | 约 ¥50-150 |

## 11. 选定架构：三层漏斗

```
层0 本地敏感词（AC 自动机，硬红线）      ¥0     <1ms    命中即 block，无网络调用
层1 LLM 自研审核（第一道闸，主力）
  ├─ 文本/prompt：GLM-4-Flash 级（同步，目标 <1.5s）
  └─ 图/视频抽帧：GLM-4V 级多模态（异步闸2）
层2 第三方 API（可插拔，默认关闭）        按量    ——    管理后台配 key 即启用，业务零改动
```

- **层0**：词表初始化自开源敏感词库（涉政硬红线子集），admin 可增删（写审计）；AC 自动机纯本地，防 LLM 失手 + 省钱
- **层1**：审核即一次 LLM 调用——`moderation` 就是一类 model（creation_type='llm' 的特殊用途），走 admin api_keys 解密通道；审核提示词版本化存库（prompt 模板表），输出结构化 JSON `{verdict, score, labels[]}`，与 §4 机审结果模型完全一致
- **层2**：`moderation_providers` 配置行（volc/ali），enabled=false 默认；启用后闸1改为"层0+层2 双跑取严"，用于上量后补合规背书

## 12. 审核提示词骨架（层1，版本化管理）

```
system: 你是内容安全审核员。判定输入是否包含：色情/涉政/暴恐/辱骂/侵权/未成年人相关风险。
输出 JSON：{"verdict":"pass|review|block","score":0-1,"labels":[]}
标准：政治人物肖像与事件=block；艺术性人体=review；明确色情=block；…
version: v1（入库，改标准=新版本，可回溯每条审核用的是哪版标准）
```

## 13. 对既有设计的影响

- §3 供应商选型改为：**层1 默认 GLM（zai 通道），层2 预留火山/绿网**
- §8 TDD 增加：层0 AC 自动机（词表匹配/边界/性能 10k 词 <5ms）；层1 提示词输出 JSON 解析容错（模型输出非法 JSON → fail-open 进 human_review）；prompt 模板版本关联
- 成本入账：层1 的 LLM 调用费记 provider_cost_cents（复用 per_token 口径），毛利报表如实反映
- fail-open 语义不变：层1 超时/异常 → 放行 + human_review（不阻塞主流程）

---

> ## ⚠️ 状态变更（2026-08-30）：**审核暂不实施**
> 用户决策：先不做审核。本文档保留作为设计储备，实施顺延至 M6+。
> 对其他文档的影响：
> - PLAN.md：M4（审核管线）移出主线，顺延为 M6+（储备）
> - DATA-MODEL.md：moderation_events/user_reports/moderation_status 迁移（0007）**暂不执行**
> - 任务流：generation_tasks 不加 moderation_status，提交流程不含预审步骤
