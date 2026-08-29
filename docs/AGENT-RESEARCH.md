# AGENT-RESEARCH — 内嵌 Agent 技术调研报告

> 状态：**调研稿，等你选定路线后才进架构/代码**。
> 问题：即梦「Agent 模式」需要一个跑在云端的编排 agent——理解意图 → 拆解任务 → 调用平台生成能力（图/视频/音乐）→ 汇总交付。选哪条技术路线？

## 0. 先对齐：这个 agent 要干什么（ workload 画像）

即梦 Agent 模式的真实 workload（按上轮即梦侦察 + 截图）：
1. **短链路任务**（秒级）：「画一张赛博朋克猫」→ 意图分类 → 组装 image 生成参数 → 提交生成任务 → 等结果 → 回显。1 次 LLM 调用 + 1 次生成调用。
2. **长链路任务**（分钟级）：「帮我做一个 30s 的咖啡广告短片」→ 脚本 → 分镜（6-10 个）→ 逐镜生图/生视频（多次生成调用，每次几十秒）→ 可能的配乐 → 汇总。**几十分钟跨度、多步骤、每步都可能失败重试。**
3. **技能调用**：官方技能（剧情短片/电商套图/海报设计/品牌设计）= 预置的编排模板 + 用户参数。

由此得出选型的硬性要求：
- **多步持久化**：步骤状态必须落库，进程重启/发布不丢任务
- **断点续跑/重试**：第 7 步失败不该重跑前 6 步（每步都花钱）
- **并行生成调用**：分镜之间可并行
- **步骤级计费钩子**：预扣/按完成结算/超预算暂停
- **流式输出**：前端要能看到 agent 的中间思考/步骤进度（SSE）
- **TS 栈契合**：现有 NestJS + Next.js 全 TS

## 1. 五条候选路线

### 路线 A：pi 云端内嵌
**pi 是什么（基于你本机 `~/.pi/agent` 实测）**：TUI/CLI 形态的 coding agent（settings 里 defaultProvider=zai-coding-cn / glm-5.2，带 sessions、skills、extensions、bin 工具）。它的设计目标是**开发者本地终端**的代码工作流。

云端内嵌方案设想：每用户会话 = 一个 headless pi 进程（容器隔离），把「生图/生视频」包成它的 skills/extensions。

| 维度 | 评估 |
|---|---|
| 部署成本 | **高**：每并发用户一个 Node 进程 + 沙箱；需要进程池/冷启动管理 |
| 用户隔离 | 天然进程级隔离（优点），但资源开销大（每进程 100MB+ 内存基线） |
| 多步持久化 | **弱**：sessions 是本地文件格式，落库需自己写 adapter；无原生 workflow 持久化 |
| 断点续跑 | 无原生支持，靠 session 回放 hack |
| TS 契合 | 高（Node 生态） |
| 工具链 | 需要把平台能力包成它的 skill 格式（私有格式，社区小） |
| 定位匹配 | **差**：它是 coding agent，我们是媒体生成编排 agent。杀鸡用牛刀且刀型不对 |

**结论：不推荐作为产品内嵌 agent。** pi 的价值在「你自己的终端编码效率」，不在「跑在云端替万级用户编排生成任务」。它的会话/技能格式都是为单机单人设计的。

### 路线 B：Vercel AI SDK 自建 agent loop（应用内）
在 NestJS 里用 `ai` 包（`generateText` + `maxSteps` + tool calling）自建循环，工具 = 平台生成 API（提交生成任务/查任务/查资产），状态自己落 Postgres。

| 维度 | 评估 |
|---|---|
| 部署成本 | **最低**：零新基础设施，NestJS 加一个 module |
| 用户隔离 | 应用层（userId 贯穿），无进程隔离需求 |
| 多步持久化 | 自己写：agent_steps 表 + 每步落库（~1 天工作量，模式同现有 generation_tasks） |
| 断点续跑 | 自己写：按 steps 状态机恢复（有 generation_tasks 状态机的成熟先例） |
| TS 契合 | **最高**：AI SDK 4.x/5 原生 TS，`streamText` 开箱 SSE |
| 工具链 | tool = 普通 TS 函数，直接调我们的 service 层 |
| 风险 | 编排逻辑自己维护；复杂分支（重试/并行/人工介入）代码量可控但要有纪律 |

**结论：最务实。** 90% 的「agent 感觉」来自：好的 system prompt + 5-6 个工具（生图/生视频/查任务/搜资产/完结）+ 步骤落库。

### 路线 C：eve durable workflows（Helix 遗产）
你 Helix 项目用过的 `eve` + `@workflow/world-postgres`：durable workflow 运行时，步骤自动持久化到 Postgres，进程重启从断点恢复。

| 维度 | 评估 |
|---|---|
| 部署成本 | 中：独立 agent app（Helix 是独立 apps/agent），需要 world-postgres 表 |
| 用户隔离 | workflow 级隔离 |
| 多步持久化 | **最强（原生）**：durable execution 就是干这个的 |
| 断点续跑 | **原生**：进程死了从上一步恢复，免费拿到 |
| TS 契合 | 高 |
| 工具链 | workflow 代码内直接调 service |
| 风险 | **版本风险**：当时用的是 `ai 7.0.0-canary` + `@workflow 5.0.0-beta`（beta 依赖链）；你已体验过它，但 API 稳定性存疑；且「agent 的灵活性」弱于 B——workflow 是预先定义好的图，LLM 动态决定下一步的场景适配要绕 |

**结论：如果 Agent 模式以「预定义编排模板」（官方技能=固定流程）为主，C 最稳；如果以「LLM 自由决策」为主，C 会别扭。**

### 路线 D：LangGraph.js
图编排框架：节点/边/状态机 + checkpointer 落库 + 内置 human-in-loop。

| 维度 | 评估 |
|---|---|
| 部署成本 | 低-中（库级依赖 + checkpointer 表） |
| 持久化/断点 | 强（checkpointer 原生 Postgres） |
| TS 契合 | 中（LangGraph.js 是 Python 侧的移植，API 较重，抽象层多） |
| 风险 | LangChain 系抽象重、调试体验一般、版本迭代快；Python 生态才是主战场 |

**结论：能力匹配但抽象重。在已有清晰状态机经验的团队里，B 手写的循环比 D 更好维护。**

### 路线 E：OpenAI Agents SDK（TS）
OpenAI 官方 agents 框架（handoffs/guardrails/tracing）。

| 维度 | 评估 |
|---|---|
| 契合 | 中：设计围绕 OpenAI 模型；我们要接 GLM/豆包等多家（admin 多供应商），锁定单家不合适 |
| 持久化 | 一般（tracing ≠ 持久化） |
| 风险 | 供应商锁定 + 本项目用户量级用不到 handoffs 的高级编排 |

**结论：排除。**

## 2. 推荐排序

| 排名 | 路线 | 一句话 |
|---|---|---|
| **1** | **B：AI SDK 自建 loop** | 零新基建、TS 原生、工作量可控；持久化照抄 generation_tasks 状态机模式 |
| 2 | C：eve durable workflows | 若官方技能（固定流程）成为主形态，升级到 C；或 B 起步、长任务迁移 C |
| 3 | D：LangGraph.js | B 遇到复杂分支瓶颈再考虑 |
| 4 | A：pi 云端内嵌 | 不推荐（定位错配）；但 pi 可继续作为**你自己的开发工具** |
| 5 | E：OpenAI Agents SDK | 供应商锁定，排除 |

**推荐落地路径**：B 起步（1 个 `agent` module + agent_sessions/agent_steps 两张表 + 5 个工具），官方技能做成 B 里的「预置 system prompt + 参数模板」；若后期固定流程任务占比高、需要更强的断点保证，把「剧情短片」这类长链路迁移到 C。

## 3. Agent 模式编排设计（路线 B 的骨架，待你确认后细化）

```
用户输入 ──► POST /api/agent/sessions {prompt}
              │
              ▼
        agent_sessions (status=planning)
              │  LLM#1 意图+计划（输出 JSON：steps[]，每步 type/prompt/params）
              ▼
        agent_steps 批量插入（pending）
              │  预算评估：Σ每步预估费用 vs 用户余额 → 不足则拒绝
              ▼
        执行器（step scheduler）
              ├─ 并行跑独立 steps（分镜 1..N 同时提交 generation）
              ├─ 依赖 steps 等前置完成（合成等最后一张图）
              ├─ 每步完成落 assets + ledger(agent_step)
              └─ 失败重试 ×1 → 仍失败：会话置 failed，已完成步骤不退（按步结算）
              ▼
        SSE /api/agent/sessions/:id/stream
              │  前端实时渲染：计划列表 + 每步状态 + 产物缩略图
              ▼
        agent_sessions (status=succeeded, summary)
```

- 表：`agent_sessions(id,user_id,prompt,plan jsonb,status,budget_cents,spent_cents,summary)`、`agent_steps(id,session_id,seq,type,prompt,params,status,task_id,asset_id,error,cost_cents)`
- 工具集（LLM 可调用）：`plan_generation`（产出计划）、`submit_image`、`submit_video`、`submit_music`、`check_task`、`finish(summary)`
- 技能 = 预置 plan 模板：`skill_data` 表已有，挂 `plan_template jsonb`，LLM 只填参数
- 计费：LLM token（per_token）+ 每步生成费（per_image/per_second）双轨，预算护栏在会话级

## 4. 等你拍板的三个子问题
1. 路线选定：B / C / B→C 混合？
2. Agent 模式 v1 范围：只做短链路（意图→单次生成）还是直接上长链路（多分镜编排）？建议 v1 短链路 + 官方技能模板，长链路 v2。
3. LLM 供应商：走 admin 的 models 表（creation_type=llm），推荐先接 GLM（你现有 zai 通道）+ 豆包（同 Ark key），双通道互备。
