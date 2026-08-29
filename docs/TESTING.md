# TESTING（TDD 策略）

> 📌 §核心功能表 = M1 已交付（42 测试绿，见文末执行结果）。M2 起的计费/契约类测试以 [CONCLUSIONS.md](./CONCLUSIONS.md) D2（美分制）与本文件结构模式为准。

> 纪律：核心功能**测试先行**——先写失败测试（红），再实现至绿，最后重构。
> 测试即规格：本文表内的每条用例就是验收标准，实现不得只为凑绿而绕过断言。

## 工具链
| 层 | 工具 | 位置 |
|---|---|---|
| shared 契约 / 前端纯逻辑 | vitest | packages/shared, apps/web |
| API 单元 | jest（NestJS 默认栈） | apps/api |
| API e2e | jest + supertest（起完整 Nest app，依赖可注入替身） | apps/api/test |
| HTTP 打桩 | nock（Ark Provider 测试） | apps/api |
| 组件冒烟（少量） | vitest + @testing-library/react | apps/web |
| 汇总 | `turbo test`（红=不许合） | root |

测试数据来源：`dreamina-clone/RECON/**` 的真实 fixtures 直接作为测试夹具（复制进各 app 的 `test/fixtures/`，不跨包引用）。

## 核心功能 TDD 表

### 1. shared 数据契约（packages/shared）
夹具：mweb-v1-feed.json、get_agent_config.json、get_user_info.json、user_credit.json、list_project.json
- [x-先写] feedItemSchema.parse(真实 feed item) 不抛；缺 title 字段容错（默认 ""）
- [x] agentConfigSchema：model_list/skill_data 字段齐活；unknown 字段 strip 不报错
- [x] round-trip：parse 后 re-stringify 关键字段值不变（id/cover/尺寸）
- [x] 非法输入（id 缺失）→ 明确 ZodError path

### 2. Auth Guard（apps/api）
- [x] 无 Authorization 头 → 401
- [x] 假 token → 401（SupabaseClient mock getUser 抛错）
- [x] 真 token → 放行且 req.user = {id, email}
- [x] 未配置 Supabase（HE—LIX 模式未启用）→ 明确 503 而非放行（与 Helix 的 mock 放行**不同**：本项目安全优先）

### 3. 积分账本 credits
- [x] tryDebit 成功：余额减少、ledger 一条负记录、balance_after 正确
- [x] 余额不足：抛 InsufficientCredits → HTTP 402，ledger 无记录
- [x] 并发扣减：两条并发 tryDebit 只允许一条成功（DB 原子守卫测试，事务内 update...where balance>=cost）
- [x] refund(taskId)：同 task 幂等（重复 refund 拒绝）；ledger 正记录

### 4. 生成任务状态机 generation
- [x] 合法迁移 queued→running→succeeded / →failed
- [x] 非法迁移（succeeded→running 等）抛 InvalidTransition
- [x] 提交流程编排（service 测试，依赖全 mock）：扣分→插 queued→provider.submit→置 running；submit 抛错→置 failed+退分
- [x] 轮询聚合：provider.poll 返回完成 → 产物转存（storage.upload 被调）→ assets 落库 → succeeded
- [x] 超时回收：running 超过 TIMEOUT → failed + refund

### 5. Ark Provider（协议边界）
nock 打桩 `ARK_BASE_URL`：
- [x] submit：请求路径/鉴权头/模型 id 来自 env；body 含 prompt/params；返回 remote_id
- [x] poll：running 中间态解析 / 完成态取产物 URL 列表 / 失败态取错误信息
- [x] 超时/5xx → 抛 ProviderError（触发状态机失败路径）
- [x] 集成开关：无 ARK_API_KEY 时 provider.submit 抛 MissingProviderConfig（e2e 里表现为明确 503 文案）

### 6. S3 存储 storage
- [x] presign：返回的 key 形如 `${kind}/${userId}/uuid.${ext}`；contentType 白名单（image/jpeg…）；过期时间 = env 配置
- [x] 非法 kind / 超大 filename → 400
- [x] register(key)：幂等（同 key 二次登记不重复建行）；url 拼接 CDN_BASE_URL
- [x] （集成）MinIO 真传一张图 → GET url 200（标记 @integrations，CI 可跳过）

### 7. feed 分页
supertest e2e（测试库 seed 25 条）：
- [x] GET /feed?offset=0 → 20 条 + has_more=true
- [x] offset=20 → 5 条 + has_more=false；offset 越界 → 空数组不报错
- [x] 未登录 → 401（feed 要求登录，与原站匿名可读不同：本项目数据私有化）

### 8. projects / chats
- [x] create → 默认名 "New project"、graph='{}'
- [x] patch graph：合法 xyflow 结构（nodes/edges/viewport）通过 zod 校验落库；含非法节点类型 → 422
- [x] 列表按 updated_at 倒序；他人物目 404（RLS + API 双保险）
- [x] chats：create 默认 "New chat"；messages 追加 role 校验

## DoD（每个 TDD 单元）
1. 测试先提交且为红（CI 记录可查）
2. 实现后该单元全绿 + `turbo test` 无回归
3. 无 skip/only 残留；不 mock 被测对象本身
4. 覆盖率不设硬指标，但状态机/账本分支覆盖率须 100%（金额与不可逆操作零容错）

## 已知不测
- 原站像素级还原本身（用截图对照，非单测）
- Supabase/Ark/MinIO 真服务的可用性（集成测试手动标记跑）

## 执行结果（2026-08-30）
- shared 契约 14 ✅ · api 单元 27 ✅ · api e2e 15 ✅ —— `turbo run typecheck test` 6/6 任务全绿
- UI e2e（tools/e2e-ui.mjs，真实浏览器 + CDP 真实输入）：注册→首页 feed→生成提交→画布建项目→节点增删→自动保存落库，page errors 0
- 截图：docs/verify/{home-anon,home-authed,generate-submit,canvas-entry,canvas-editor}.png
- 修复记录：Next 16 dev origin 保护拦 127.0.0.1（allowedDevOrigins）；xyflow 容器需显式 height（h-[calc] 类在 flex 容器下塌陷为 0）；tsx 不支持 emitDecoratorMetadata（dev 改 nest start --watch）；supertest v7 interop 问题改用原生 fetch
