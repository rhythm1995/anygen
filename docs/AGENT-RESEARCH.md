# AGENT-RESEARCH — 内嵌 Agent 技术调研报告

> 📌 **结论以 [CONCLUSIONS.md](./CONCLUSIONS.md) 为准，本文为过程档案。**


> 状态：**调研稿，等你选定路线后才进架构/代码**。
> 问题：即梦「Agent 模式」需要一个跑在云端的编排 agent——理解意图 → 拆解任务 → 调用平台生成能力（图/视频/音乐）→ 汇总交付。选哪条技术路线？
> **范围决策（2026-08-30）**：一次性按 v2 规模设计实现（短链路 + 长链路多分镜编排都在范围内）；B 与 C 进行正式对比后定夺。

## 0.5 先回答：eve 是不是路线 B 的一种？

**不是——B 和 C 的分野在于「谁负责把步骤状态做对」，这正是两路线的核心差异点：**

- **B（AI SDK 自建 loop）**：LLM 循环由**我们的代码**驱动。每一步调用 `generateText`/`streamText`，循环的继续/停止/重试逻辑手写，步骤状态**手写落库**（agent_steps 表 + 状态机，像 generation_tasks 那样）。灵活度最高（LLM 随时动态决定下一步），但持久化正确性靠自己写测试保证。
- **C（eve durable workflow）**：编排是**预先定义的 workflow 代码**（`@workflow` 装饰的函数），运行时框架**自动**做步骤持久化 + 断点恢复（`@workflow/world-postgres` 落 Postgres）。你写的是确定性的步骤图（每个 workflow step 自动记住自己跑完没有），LLM 只在个别 step 内部被调用。牺牲"LLM 自由决策"的动态性，换"永不丢步骤"的确定性。

一句话：**B 是"应用内 agent，自己管状态"；C 是"durable workflow 框架，框架管状态"。** eve 不是 B 的子集，它俩是同一个问题的两种答案。若长链路（多分镜、数十分钟、每步都花钱）是硬需求，C 的"框架管状态"优势会被放大——这正是你要求一次性做 v2 的原因，下面对比按 v2 基线重新加权。

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

## 2. 按 v2 基线的推荐排序（一次性做全量）

| 排名 | 路线 | v2 基线下的关键差异 |
|---|---|---|
| **1** | **B：AI SDK 自建 loop** | v2 需要补齐：并行步骤调度器（分镜并行提交）、步骤重试与恢复、预算中断——这些本来就要写，工作量 +3~5 天；换来完全的动态灵活性 |
| **1'（并列）** | **C：eve durable workflows** | v2 的并行/重试/断点恢复**框架原生给**（省 3~5 天且更可靠）；代价：编排结构需预定义为 workflow（LLM 动态决策要收窄为"每步内的局部决策"）；beta 依赖链风险仍在 |
| 3 | D：LangGraph.js | checkpointer 能力与 C 类似但抽象更重；无优势 |
| 4 | A：pi 云端内嵌 | 不推荐（定位错配） |
| 5 | E：OpenAI Agents SDK | 供应商锁定，排除 |

**v2 基线下的裁决要点**（等你拍板）：
- 若「剧情短片」这类任务以**官方技能模板**（固定流程：大纲→分镜→逐镜→合成）为主 → **选 C**：框架免费拿到断点恢复，省下的正是 v2 最贵的部分
- 若「自由对话式创作」（用户意图发散，LLM 每步自己决定调什么工具）为主 → **选 B**：C 会把动态性磨没
- **混合现实解**：C 做骨架（会话=workflow，步骤持久化/恢复/并行交给框架）+ 每个 step 内部用 AI SDK 的 `generateText` 做 LLM 决策（tool calling 仍可用）——这其实是两路线优点合并，代价是同时引入两套依赖

**推荐：C 为骨架 + B 为步骤内引擎的混合形态**（v2 规模下一次性做对，避免先 B 后迁 C 的二次返工）。若你更在意依赖轻量与自主可控，纯 B 也可行，差价约 3~5 天调度器开发 + 自担持久化正确性。

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

---

# 业内实践调研（2026-08-30 补充 · 回答"业内怎么做这类 Agent"）

## A. 产品界怎么做创作 Agent（三类代表）

### A1. Runway Agent（闭源产品标杆，行为可逆向）
官方帮助文档披露的完整产品形态：
- **会话式 agent + 内置时间线编辑器**：New chat（从零创作）/ New timeline（剪辑已有素材）双入口
- **计划-确认门**：Agent 先出 plan（含模型/prompt/预估 credit 成本）→「Ask before generating」或自动生成两种模式
- **模型选择偏好**：用户设 Speed/Cost/Quality，agent 在每步自动挑模型（Gen-4.5/Seedance 2.0/Kling/Veo…**Runway 也是多供应商聚合**，与即梦同构）
- **产物聚合**：会话内全部产物进 Generations 页网格；多镜头视频自动拼进 Final Cut 时间线
- **Agent Skills**：`/` 触发的预制工作流（Ad Campaign、Mood Board）——与即梦「技能」完全同概念
- **计费**：按模型+输出类型扣 credit，分辨率 480p→4K 分档

**对我们的启示**：计划确认门（预算内暂停问用户）、Speed/Cost/Quality 三档偏好、Final Cut 式产物聚合，都应进 AGENT.md 设计。

### A2. OpenMontage（开源界最完整的 agentic 视频生产系统，AGPLv3）
"agent-first 架构——没有代码编排器，AI 编码助手就是编排器"：
```
research → proposal → script → scene_plan → assets → edit → compose
```
- **三层知识架构**：tools/(100+ 注册工具) + pipeline_defs/(YAML 流程清单) + skills/(Markdown 阶段导演技能)——**流程与知识全是声明式文件**，代码只提供工具与持久化
- **7 维供应商打分选择器**（task fit 30%/质量20%/控制15%/可靠性15%/成本10%/延迟5%/连续性5%），每次选择带决策日志
- **预算治理**：执行前估价 → 预留 → 事后对账；observe/warn/cap 三模式；单动作超 $0.50 暂停审批；总预算帽默认 $10
- **质量门**：人工审批门（proposal/script/scene plan/assets/publish 五道）+ 预合成校验（防"PPT式"视频）+ 渲染后自检（ffprobe/抽帧/音频分析）
- **Checkpoint JSON**：每阶段可恢复、含决策日志与成本快照

**对我们的启示**：声明式 pipeline + 审批门 + 预算治理三件套是业内共识，可直接映射到我们的 agent_steps + ledger + SSE。

### A3. 其他代表
- **UniVA**（开源视频通用 Agent）：Plan-Act 双智体架构（规划器拆任务 + 执行器调工具）
- **LibTV**（智源）：Skill 接口打包创作能力给 agent 调用——"产品同时为人和 agent 设计"
- **即梦自己**（上轮侦察实证）：agent 的生成能力全部包成 **MCP 工具对**（text2image/image2image），libra abtest 按场景切换工具集——**工具粒度 = 生成能力原子化**

## B. 编排框架界的实践（生产级 durable 路线）

### B1. LangGraph 官方 vs Temporal 对比（LangChain 官方文档）
业界对"agent 编排选 durable 引擎还是 agent 框架"的正式答案：
- **分层共识**："For most production agents the answer is **both, layered**: LangChain for reasoning and tools, Temporal for durable orchestration"（cordum.io 总结）——**推理层 + 持久化层分开选型**
- Temporal 的坑：无 SSE 流式、HITL 要自己拿 signal 拼、**2MB payload 上限**（媒体任务必须外置存储只传 ID——我们恰好这么设计了）、无 LLM 观测
- LangGraph 的强项：checkpointer 落 Postgres、interrupt() 一行做 HITL、token/cost 自动采集
- Reddit 生产实践帖："agent 进程跑在 Temporal 外部长驻容器——**不把整个对话建模成一个 workflow**"

### B2. eve 官方执行模型（Vercel 出品，比 Helix 时代成熟了）
- 三层嵌套：**session（天级持久对话）→ turn（一次用户消息的全部工作）→ step（step 边界自动 checkpoint）**
- "Crash the process, hit a timeout, or redeploy mid-turn, and the run picks up from the last completed step. **Completed steps never re-run; eve replays the recorded result**"
- 自托管：`@workflow/world-postgres`（graphile-worker 驱动），或本地磁盘 world——**不绑 Vercel 平台**
- 明确告诫：被打断的 step 会重跑 → **非幂等副作用（扣费！）必须自己做幂等**——我们 ledger 的幂等 refund 设计正好接上
- 生态信号：Platformatic 写了 K8s 部署指南、vercel-labs/steve 自托管 PoC、Eve vs Flue 对比文——框架活跃度真实

### B3. Restate + Vercel AI SDK
"用 Restate 给 AI SDK agent 加 durable"的官方合作范式——印证了「**AI SDK loop + 外挂持久化层**」正是 B 路线的行业标配玩法（Restate 是 durable 引擎，eve/Temporal 同位竞品）。

## C. 业内共识总结（直接回答你的问题）

| 共识 | 出处 | 对应我们的设计 |
|---|---|---|
| 1. 推理层与持久化层**分层选型**，不找全能框架 | LangChain官方/cordium/Reddit | 混合形态：eStep内 AI SDK 推理 + 外层 durable 编排 |
| 2. **Completed steps never re-run** + 非幂等副作用自己做幂等 | eve 官方 | ledger 幂等扣退（已 TDD）+ step 状态机 |
| 3. 媒体大 payload **外置存储只传 ID** | Temporal 2MB 限制 | 产物全走 S3，步骤只存 asset_id（已如此） |
| 4. **计划-确认门 + 预算治理**（估价/预留/对账/cap） | Runway/OpenMontage | agent_sessions.budget_cents + 每步预扣 + 超预算暂停 |
| 5. 生成能力**原子化为工具**（MCP 化） | 即梦 MCP 工具对/LibTV Skill | 工具集 = submit_image/video/music + check_task |
| 6. 供应商**打分选择**而非硬编码 | Runway Speed/Cost/Quality、OpenMontage 7维 | admin models 表 price+cost 字段天然支持 |
| 7. 技能 = **预制工作流模板**（YAML/Markdown 声明式） | OpenMontage pipelines/即梦官方技能 | agent_skills.plan_template jsonb |
| 8. 人机同构产品（同一能力人能用 agent 也能用） | LibTV | 创作面板与 agent 工具共用同一 API |

## D. 调研后的最终推荐（更新）

业内证据把之前的推荐进一步坐实并微调：

**推荐：AI SDK loop（推理）+ 自建 steps 状态机（持久化），即"纯 B"，但吸收 OpenMontage 的声明式 pipeline 与审批门。**

理由修正（相比上版"混合 C"）：
1. 业内分层共识（B1）说明 eve/Temporal 的角色是"durable 引擎"，而 eve 当前绑定自家 agent 目录约定（channels/agent.ts 形态），**嵌入我们的 NestJS 业务进程不如自建 steps 表直接**（我们有 generation_tasks 状态机 + TDD 的成熟先例）
2. Restate+AI SDK 范式证明 B 路线配持久化是标准玩法；我们的持久化层就是 agent_steps 表 + 幂等 ledger，不需要再引第三个引擎
3. OpenMontage 的"声明式 pipeline_defs + skills"直接抄：官方技能 = plan_template JSON（步骤序列+参数模板），执行器读模板跑——比纯 LLM 自由决策可控，比 eve workflow 轻量
4. 计费/审批/产物聚合照 Runway 的产品形态设计（Speed/Cost/Quality 偏好、计划确认门）

（若未来多用户高并发长链路成为主力负载，届时把执行器迁移到 eve/Temporal 是局部替换——steps 表的 schema 不变。）

Sources: [LangGraph vs Temporal (LangChain官方)](https://www.langchain.com/resources/langgraph-vs-temporal) · [Temporal vs LangChain 分层共识](https://cordum.io/blog/temporal-vs-langchain) · [eve 执行模型与持久化](https://eve.dev/docs/concepts/execution-model-and-durability) · [Restate + Vercel AI SDK durable agents](https://www.restate.dev/blog/building-durable-agents-with-vercel-and-restate) · [Runway Agent 官方文档](https://help.runwayml.com/hc/en-us/articles/51601639579667-Creating-with-Runway-Agent) · [OpenMontage (GitHub)](https://github.com/calesthio/OpenMontage) · [Vercel AI SDK Agents](https://ai-sdk.dev/docs/agents/overview) · [eve K8s 自托管 (Platformatic)](https://blog.platformatic.dev/run-durable-eve-agents-on-kubernetes-with-platformatic)

---

# E. OpenMontage 直接复用评估（2026-08-30 · 回答"能不能直接拿来用"）

## 结论先行：能"用"，但不是"嵌进产品"，而是三条路径选一条

OpenMontage 的本质：**没有运行时编排器**——它是"一堆 Python 工具 + YAML 流程清单 + Markdown 技能 + 检查点文件系统"，**大脑是你的 coding agent**（Claude Code/Cursor/Codex），它在**你的本地终端**里跑。它从不在运行时调用 LLM API；也没有 HTTP/SDK 形式的"流水线执行服务"可供你的 NestJS 调用（Backlot 只是一个只读监控 Web 面板）。

## 三条复用路径

### 路径一：直接拿来用（个人工具形态）——今天就能跑 ✅
```bash
git clone calesthio/OpenMontage && make setup
# 在 Claude Code/Codex 里说 "Make a 60-second explainer about X"
```
- **定位**：你自己的本地视频生产 CLI 工具，与 anygen 产品**并行存在**，互不干扰
- 适合：你个人快速出片、验证各家模型效果、给 anygen 选型攒经验
- 成本：零集成工作；AGPLv3 仅约束分发/网络服务，个人本地用无任何问题
- 局限：没有用户体系/计费/多租户——它不是产品后端

### 路径二：把 OpenMontage 当"执行引擎"嵌进 anygen ❌ 不建议
设想：NestJS 生成任务 → 起一个 headless coding-agent 进程驱动 OpenMontage → 回收产物。
问题：
1. **回到 pi 云端内嵌的老路**：每任务一个 LLM agent 进程，贵、慢、隔离复杂——正是调研 A 里已否决的形态
2. **编排不可编程**：它的"编排"是 Markdown 指令给 coding agent 读的，不是 API；你无法从代码里确定性地说"跑 cinematic pipeline 第 3 阶段"
3. **AGPLv3 传染**：通过网络提供服务 = 分发，你的整个 anygen 后端将被要求开源（内部使用可豁免，但产品化即触发）
4. 检查点在本地文件系统，多用户并发/多机都自己搞

### 路径三：抄设计不抄代码（推荐）✅✅
把 OpenMontage 验证过的**模式**移植进我们的纯 B 路线，零 license 风险：
| OpenMontage 的资产 | 移植方式 |
|---|---|
| pipeline_defs/*.yaml（12 条流水线阶段定义） | 语义翻译进 agent_skills.plan_template（jsonb）：research→proposal→script→scene_plan→assets→edit→compose 七阶段即我们的步骤模板 |
| skills/ 阶段导演技能（Markdown） | 变成我们 agent 每 stage 的 system prompt 片段（存库、版本化）|
| 7 维供应商打分选择器 | 简化为 3 维（cost/quality/speed，即 Runway 的用户偏好），数据源=admin models 表的 price/cost 字段 |
| 质量门 + 审批门（proposal/script/assets/publish） | agent_steps 状态机加 `awaiting_approval` 态 + SSE 通知（对齐 Runway 计划确认门）|
| 预算治理（estimate→reserve→reconcile + cap） | 直接映射我们 ledger 的预扣/结算/预算帽——设计已就位 |
| 渲染后自检（ffprobe/抽帧/音频分析） | 后置到 compose 步骤（FFmpeg 我们本来就要用）|
| Backlot 只读监控板 | 我们的 SSE 会话流 + 任务卡已有同位能力 |

另可直接复用的**零风险部件**（AGPL 不传染数据/接口/思路）：
- 它的 `docs/PROVIDERS.md`（60+ 供应商接入要点/价格）作为 admin 配置参考手册
- 供应商提示词约定（如 Seedance 8 组件提示词结构）——纯知识，写进我们的模型 skills

## 建议
1. **本周就 clone 下来当个人工具玩**（路径一），用它实测 Ark/Kling 的真实出片质量与成本——为 anygen 的 models 定价提供实测数据
2. **产品内走路径三**：纯 B + plan_template，吸收它的阶段划分/质量门/预算治理设计
3. 路径二永久排除（AGPL + 形态错配）

---

# F. OpenMontage 实测研究报告（2026-08-30 · clone 到 ~/openmontage-study 深读源码+跑通 preflight）

> 本节修正 §E 的纸面结论。clone 170MB，venv + requirements.txt 装完直接跑通 `registry.discover()` 与 provider_menu_summary()。

## F1. 实测确认的事实

**工具层完全是普通 Python 库，可编程直调（重大修正）**：
```python
from tools.video.seedance_ark import SeedanceArkVideo
t = SeedanceArkVideo()
t.estimate_cost({'model_variant':'standard','resolution':'720p','duration_seconds':5})  # → $0.69
t.execute(inputs)  # create/query/cancel/generate 四合一同步入口
```
- **121 个工具全部继承 BaseTool**，统一契约：`execute(inputs)->ToolResult / estimate_cost / dry_run / estimate_runtime / estimate_token_usage / check_dependencies / get_info / idempotency_key`
- 元数据齐全：`tier(generate/edit/analysis…) / capability / provider / stability / execution_mode(async) / determinism / runtime`——**这就是我们 admin models 表想要的形状，且是现成参照**
- 无 LLM 依赖：工具直接打各家 API（fal/Ark/Runway/Kling/Suno/ElevenLabs…）；"大脑"只在编排层

**实测成本矩阵（Seedance Ark，官方 2026-07 定价内置）**：
| 变体 | 480p/5s | 720p/5s | 1080p/5s |
|---|---|---|---|
| standard | $0.32 | $0.69 | $1.72 |
| fast | $0.26 | $0.56 | – |
| mini | $0.16 | $0.35 | – |
（带视频参考再降 ~40%："with_video" 价；estimate_cost 内置 CNY/USD 换算）→ **我们 admin 定价 seed 的第一手数据源**

**编排=纯指令，无运行时引擎**（确认 §E）：
- `AGENT_GUIDE.md`(720行) 是写给 coding agent 的硬契约：Rule Zero（一切经 pipeline）、决策沟通契约（付费调用前必须播报 provider/model/理由）、双渲染引擎必须同时呈现给用户选（HARD RULE）、禁止未经批准换供应商、decision_log 只追加
- `pipeline_defs/cinematic.yaml`：12 流水线声明 stage/skill/tools/审批门/review_focus/success_criteria + EP 编排模式（budget_default_usd、max_revisions、wall_time 上限）
- `skills/pipelines/cinematic/` 10 个"导演"技能共 1421 行 Markdown；`skills/meta/` 含 checkpoint-protocol（写检查点前必须过 reviewer）、reviewer（CHAI 批评协议）
- **三层知识**：tools(121) → skills(项目约定) → `.agents/skills/`(90 个供应商级技术包，如 seedance-2-5 的提示词契约/参考上限/各路由差异)

**checkpoint 与预算治理是可独立复用的 Python 库**（此前低估）：
- `lib/checkpoint.py`：init_project/write_checkpoint/get_next_stage；**门禁在写入时强制**——manifest 要求审批的 stage，没带 human_approved=True 就写不进 completed（GI-4 门禁硬化，社区 issue 修复过"检查点是建议性"漏洞）
- `tools/cost_tracker.py`：estimate→reserve→reconcile + observe/warn/cap 三模式 + 单动作审批阈值($0.50) + BudgetExceededError——**与我们 ledger 预扣设计同构，接口可直接抄**

**Backlot**：只读磁盘的监控面板（fs 监听 + "永不阻塞"降级渲染 + run 回放），agent 唯一职责是开工时 `python -m backlot open <id>`

## F2. 对 §E 结论的修正

| §E 纸面结论 | 实测修正 |
|---|---|
| "不可编程调用" | **半错**：编排层确实是指令非 API；但**工具层/checkpoint/cost_tracker 都是干净 Python 库，可直接 import** |
| 三路径建议 | 路径三升级：不只抄"设计"，**可以直接以 AGPL 之外的方式复用其接口形状与数据**（成本矩阵、参考上限、提示词契约都是事实数据，不受版权传染） |

**新增路径 1.5（实测后发现的最优解）：把它当"供应商 SDK + 定价数据库"用**
- 121 个 provider 适配器 = 免费的供应商接入调研库：接新供应商前先读它的实现（限流/轮询/重试/价格），我们的 ArkProvider/后续 KlingProvider 照它的 battle-tested 形状写
- `estimate_cost` 内置的**官方价格表**（按模型×分辨率×时长×是否带参考）直接抄进 admin models 的 price_cents/provider_cost_cents seed
- `.agents/skills/` 90 个供应商技能 = prompt 工程知识库（如 Seedance 2.5 的多镜头 "Hard cut" 分解法、角色一致性 named locks、30图/10视频/10音频参考上限）→ 进我们 agent 的工具使用说明

## F3. 最终定论（替代 §E 建议）

1. **个人工具**（路径一）：照旧，`make setup` 后在 Claude Code 里用；我们实测已装好 venv
2. **产品集成**（最终形态）：纯 B 路线不变，但把 OpenMontage 当**外部参考实现**分四级取用：
   - L1 接口形状：BaseTool 契约（execute/estimate_cost/dry_run/idempotency_key）→ 我们的 GenerationProvider 接口对齐
   - L2 事实数据：官方价格矩阵/参考上限/分辨率支持 → admin models seed + 参数校验
   - L3 流程模式：七阶段+审批门+预算治理 → plan_template 与 agent_steps 状态机（已定）
   - L4 供应商实现参考：接 Kling/Runway/fal 时读它的源码（不复制代码，AGPL）
3. 路径二（嵌进程）维持排除：AGPL 传染 + 每任务一个 agent 进程的形态缺陷
