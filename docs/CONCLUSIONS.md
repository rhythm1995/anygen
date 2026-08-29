# CONCLUSIONS — 调研结论与决策总表（权威文档）

> 本项目所有调研的**最终结论以本文为准**；过程档案见各专题文档（AGENT-RESEARCH.md / ADMIN.md / UI-SPEC-CN.md / MODERATION.md / VENDOR-OPENMONTAGE.md）。
> 更新纪律：任何决策变更必须同步改本文并注明日期。

## 0. 文档地图与治理（防漂移）

| 层 | 文档 | 性质 | 权威范围 |
|---|---|---|---|
| 决策层 | **CONCLUSIONS.md** | **唯一权威** | 全部决策（D1-D7）、事实速查、里程碑现状 |
| 契约层 | ADMIN · UI-SPEC-CN · VENDOR-OPENMONTAGE · DATA-MODEL 增量节 | 已定稿规格 | 各自领域实现规格；与 CONCLUSIONS 冲突时以 CONCLUSIONS 为准 |
| 过程层 | AGENT-RESEARCH · MODERATION（搁置储备） | 调研档案 | 仅作依据追溯，不含"现状" |
| 历史层 | ARCHITECTURE · UI-SPEC · PLAN · TESTING（M1 部分） · dreamina-clone/NOTES | M1 快照 | 记录已交付状态，不描述未来 |

**治理纪律**（对所有 agent 与人生效，AGENTS.md 同步）：
1. 决策变更：**先改本文（含日期）**，再动规格文档，最后才写代码
2. 每份文档首行必须携带状态横幅（已定稿/待实施/已搁置/历史快照），状态变化只改横幅
3. 历史层文档**不更新内容**，只允许加横幅指向权威文档
4. 端口/命令/价格等易变事实只允许出现在一个权威处：端口→AGENTS.md，价格→vendor 数据+CONCLUSIONS §3.2

## 1. 项目定位

**anygen = 即梦（国内版 jimeng.jianying.com）的内部复刻平台**。内部使用、不对外服务、无支付。
技术栈（已建成）：Turborepo · Next.js 16 + React 19 + Tailwind v4 + shadcn · NestJS 11 · Supabase(Postgres+Auth) · S3 兼容(MinIO)。

## 2. 已拍板决策表

| # | 领域 | 决策 | 日期 | 出处 |
|---|---|---|---|---|
| D1 | 复刻范围 | 即梦**国内版**三页 + 7 创作类型完整面板，全站 zh-Hans | 08-29 | UI-SPEC-CN |
| D2 | 计费 | **美元美分整数记账**（内部核算用），无积分/无赠金/无支付；新用户由 admin 发 initial_grant（默认 $5） | 08-30 | ADMIN |
| D3 | 审核 | **不做**（设计储备保留于 MODERATION.md，含 LLM 自研三层漏斗方案） | 08-30 | MODERATION 横幅 |
| D4 | 模型管理 | admin 后台统一配置供应商/Key(pgcrypto 加密)/模型/单价，**面板由 models 表驱动**（admin 配什么面板显示什么） | 08-30 | ADMIN |
| D5 | Agent 路线 | **技能模板执行器 v1 + 自由 agent v2**；引擎=纯 B（Vercel AI SDK loop + 自建 agent_steps 状态机），不用 eve/Temporal/pi | 08-30 | AGENT-RESEARCH §C/D |
| D6 | OpenMontage | **vendor 为上游 core 模块**（`vendor/openmontage`，同步制），定制走 `vendor-overlay`，集成只走 JSON 桥；AGPL 内部使用合法，产品化前必须剥离 | 08-30 | VENDOR-OPENMONTAGE |
| D7 | 生成后端 | 只接真模型（Ark 优先），无 mock；四新类型（音乐/配音/数字人/动作模仿）Provider 接口预留、未配置返回 503 | 08-29 | PLAN |

## 3. 关键事实速查（侦察实证，实现时直接引用）

### 3.1 即梦国内版创作体系（RECON/jimeng-cn/，2026-08-30 抓取）
- **7 创作类型与 URL**：agent(默认)/image/video/music/audio(配音)/digitalHuman(imitator)动作模仿
- **图片 9 模型**：5.0 Pro(high_aes_general_v50p_large)✦New/5.0 Lite/4.7✦/4.6/4.5/4.1/4.0/3.1/3.0；分辨率 1.5k/2k/4k × 8 比例精确 W×H 矩阵；数量 1-4 默认 2
- **视频 11 模型**：Seedance 2.5(dreamina_seedance_45_pro)/2.0 mini/Fast VIP/VIP/Fast/2.0/1.5 Pro/1.0/1.0 Fast + **MiniMax H3、HappyHorse 1.1（第三方聚合）**；比例 21:9-9:16 六种、480p/720p/1080p、时长 4-15s（超长 30-180s）、6 种参考模式（首尾帧/全能参考/智能多帧/智能编辑/超长视频/视频续写）
- **官方技能 4**（API 实测）：web_agent_skill_story 影视故事短片/ecommerce 电商套图/poster 海报设计/brand Logo设计
- **即梦 Agent 的工具形态**：生成能力包成 MCP 工具对（bytedance.mcp.creation_*），libra abtest 按场景切工具集；reference 上限 30图/10视频/10音频
- **配音**=tts_model_v3（SAMI wss）；**音乐**=SeedMusic 1.0 Preview；**数字人**=快速模式+上传音频+双段 prompt；**动作模仿**=大师/生动模型

### 3.2 定价（OpenMontage vendor 内置官方价，实测提取）
Seedance Ark（USD，5 秒）：standard 480p $0.32 / 720p **$0.69** / 1080p $1.72；fast $0.26/$0.56；mini $0.16/$0.35；带视频参考约再降 40%。→ admin seed 第一手数据源。

### 3.3 Agent 业内共识（AGENT-RESEARCH §C）
推理层与持久化分层选型；completed steps never re-run + 副作用幂等；媒体大 payload 外置只传 ID；计划确认门+预算治理（估价→预留→对账+cap）；生成能力原子化为工具；技能=声明式模板；供应商打分选择。

## 4. 架构定论图

```
Next.js (zh-Hans 三页+7类型面板+admin) ←models 表驱动→ NestJS API
   │ Supabase Auth/JWT                      ├─ ledger(美分,幂等) ── admin 定价
   │ S3 预签名直传                           ├─ agent_sessions/steps ── 技能 plan_template
   ▼                                        └─ JSON 桥 ── vendor/openmontage(121工具)
用户/浏览器                                        │ 同步制(用户说同步→sync脚本)
                                                  ▼
                                          上游 OpenMontage (AGPL, 内部用)
```

## 5. 里程碑（当前有效）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | 三页全栈复刻（国际版）+ TDD 42 测试 | ✅ 已交付(1ade47c) |
| M1.5 | CN 侦察（7 类型/模型矩阵/技能） | ✅ 已交付(8498add) |
| **M2** | **Admin 后台 + 美元计费迁移**（providers/keys/models/ledger/pricing/usage，TDD） | ⬅ 下一步 |
| M3 | 即梦 CN 创作面板（吃 models 表）+ zh-Hans | 排队 |
| M4 | Agent v1：技能模板执行器（plan_template + steps 状态机 + 审批门 + 预算护栏 + JSON 桥接 vendor 工具） | 排队 |
| M5 | Agent v2：自由 agent loop（AI SDK）+ SSE | 排队 |
| M6+ | 审核管线（如解封）、产品化剥离（AGPL） | 储备 |

## 6. 风险登记

| 风险 | 缓解 |
|---|---|
| AGPL 产品化传染 | 集成面收敛在 bridge；剥离预案见 VENDOR-OPENMONTAGE §5 |
| 即梦 cookie 失效影响后续侦察 | 已有资产足够 M2-M4；需要时再要新 curl |
| 上游 OpenMontage 快速变化破坏桥 | 同步脚本含冒烟测试；接口消费点集中在 bridge/seed |
| seed 图片版权 | 仅内部学习；商用前替换（NOTES 清单） |
