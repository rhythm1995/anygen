# CANVAS-RESEARCH — 无限画布：原站全景 + 开源调研 + vendor 化设计依据

> 状态横幅：**调研结论（2026-09-01），已由 CONCLUSIONS.md D12 采纳**。本文是过程档案与移植手册；与 CONCLUSIONS 冲突时以 CONCLUSIONS 为准。
> 原站侦察证据：`dreamina-clone/RECON/auth/canvas-editor/`（canvas-editor-summary.md + api/ api2/ fixtures + 截图/DOM）。

## §1 原站（即梦 CN）无限画布到底是什么

**一句话：Agent 驱动的图层式无限画布创作台**——不是节点连线画板（但允许连线类增强交互）。

| 维度 | 实测结论 |
|---|---|
| 入口 | 侧栏「画布」→ `/ai-tool/assets-canvas`（首页：大 composer「输入想法、剧本或上传参考，支持"/"使用技能，添加主体，和Agent一起创作」+ Agent模式/自动/灵感搜索/创意设计 + 6 张灵感模板卡 + 新建项目/最近项目） |
| 编辑器 | `/ai-tool/canvas/:id`；顶栏（返回/项目名/积分/「对话」开关）+ 无限画布（空态：本地上传/选择资产）+ **底部同款 composer** + 右侧 Agent 对话侧栏（会话+历史生成记录） |
| 核心交互 | 空格/中键移动画布（Figma 式）；空画布右键=粘贴⌘V/居中视图⌘0；左下缩放%；选中图片/视频展开编辑；上传先审核（TOS→imagex audit）过审才落画布 |
| 文档模型 | draft = `{meta, layers[], aiGeneratorReference, references}`——图层模型；draft_id+version 快照同步（fetch_snapshot 批量拉） |
| 渲染 | 自研离屏画布（`offscreenCanvas-dreamina-infinite`）+ DOM img 混合，非 react-flow/konva/tldraw |
| API | infinite_canvas/*：list_project / project_detail / v1/fetch_snapshot / get_conversation_list / share_project / delete_project / v1/get_canvas_custom_ratio；画布内 Agent 会话挂在 project 上 |
| 计费 | `infinite_canvas_credit_consume_warn`（画布操作扣积分）；分享独立 token |
| 灰度能力 | blend（混合）、form_generate、placeholder_mode、rotate_clip（视频片段旋转）、workflow/story 模式、发布（publish_canvas/draft） |
| 已知缺口（推测项依据） | layer 字段级 schema 未抓到；选中态工具条未捕获 |

## §2 开源梯队（活跃度 + license 双筛，2026-09-01 实查）

### T1 形态最像

| 项目 | ★ | 推送 | License | 判断 |
|---|---|---|---|---|
| **tigerowo/infinite-canvas**（**D12 vendor 对象**） | 636 | 2026-08-30 日更 | AGPL-3.0 | basketikun 全栈化重构：Go(Gin+GORM+SQLite/S3) 后端 + 前端迁 **Next.js 16**（与我们同栈）。能力：多画布/连线/小地图/撤销重做/导入导出、四类节点(image/text/config/video)+全景图+导演台、画布 Agent（12 技能）、生图工作台、创作工作流、摄像机参数、提示词库、素材库、账号云同步。**自研画布引擎（无任何画布库依赖）、导演台无 three.js（轻量自研 3D）** |
| basketikun/infinite-canvas（上游底座） | 5.9k | 2026-08-27 | AGPL-3.0（LICENSE 实文；GitHub API 误报 MIT） | 纯前端 local-first 原版：IndexedDB/localforage + WebDAV 同步 + canvas-agent(Bun/MCP) + 插件系统 |

### T2 画布 SDK 底座（不采用）
- tldraw 50k★：自定义 license（企业年收入 ≥$5M 付费/水印）；我们已被 tigerowo 引擎替换 xyflow，无需。
- xyflow（现用，MIT）：D12 后退役出画布。

### T3 只可参考、不可引入
- 11cafe/jaaz 6.6k★：双许可（社区版禁改/禁团队部署/禁再分发，UI 商标保护）→ 只看架构思路（providers 含豆包 Seedream/Seedance/Kling/Veo3；Agent=OpenAI Agents+LangGraph；Electron）。
- ComfyUI（GPL-3）/ Krita AI Diffusion：节点工作流/桌面形态，不对标。

### T4 不入流
fal-ai-community/infinite-kanvus（无 license 文件，停更）；SparkSylva/Omnigen（30★停更）；mrslimslim/gpt-image-canvas（MIT 活跃但 tldraw 底座连带许可）。

## §3 tigerowo 深读笔记（移植依据）

### 3.1 画布文档模型（docs/backend/canvas-data-structure.md）

```ts
CanvasProject = { id, title, createdAt, updatedAt,
  nodes: CanvasNodeData[], connections: {id, fromNodeId, toNodeId}[],
  chatSessions: CanvasAssistantSession[], activeChatId,
  backgroundMode: "lines"|"dots"|"blank", viewport: {x, y, k} }
CanvasNodeData = { id, type: "image"|"text"|"config"|"video"(+panorama/director),
  title, position{x,y}, width, height,
  metadata: { content, prompt, status(idle|success|loading|error), errorDetails,
    fontSize, generationMode(text|image|video), model, size, count,
    naturalWidth/Height, freeResize, isBatchRoot, batchRootId, batchChildIds,
    primaryImageId, imageBatchExpanded, inputOrder, storageKey, mimeType, bytes } }
```
- 连线只存节点 ID，渲染时按节点盒算路径；删节点级联删连线；删批量组根节点连子节点一起删。
- 图片长期标识是 storageKey（blob URL 仅会话内有效）→ 我们落地改为 assetId+url（服务端存储，无补水/引用清理负担）。
- 批量生成：根节点 isBatchRoot/batchChildIds/primaryImageId/imageBatchExpanded（叠卡预览/展开/设主图）。
- 生成配置节点（config）：generationMode+model+size+count，上游输入经 connections 计算 + inputOrder 排序预览。

### 3.2 画布 Agent（agent/canvas-agent-runtime.ts）
- 浏览器端 loop：MAX_AGENT_STEPS=12、协议消息裁剪 120 条；**原生 tool calling + 无工具模型 JSON 兜底**（usedJsonFallback 则禁 tools）。
- 状态机 phase（intake→…）+ approvedNodeIds/referenceNodeIds/pendingTaskIds/completedTaskIds；媒体类工具并发执行、其余串行。
- 引用构建：选中节点 + 上游节点自动纳入；按模型名正则决定是否带 image_url 输入。
- 「整理画布」类动作仅在用户文本明确要求时放行（防误动）。
- 技能 12：core/organize/script/image/image-character-sheet/image-storyboard/video-single-shot/video-multi-shot/video-editing/video-extension/audio/workflow。
- 首次成功创建主剧本 → 自动命名项目；手动改名/导入后不再覆盖。

### 3.3 依赖清单（web/package.json，Next 16.2 + React 19.2 + Tailwind 4 + TanStack Query 5 与我们同栈）
新增需引：zustand、@photo-sphere-viewer/core、@uiw/react-codemirror(+@codemirror/lang-json)、file-saver、fflate、react-markdown(+remark-gfm)、motion、nanoid、lucide-react(已有)、radix-ui(已有)、copy-to-clipboard、dayjs(已有路径不同)。**不引** antd 全家桶（D12：shadcn 化改写）。

### 3.4 后端参考（不采用 Go，按其模型在 NestJS 扩展）
- handler/model：canvas_project、canvas_image_task、canvas_audio_task、video_task、media_reference、generation_log、assets、workflow、settings。
- 视频走 OpenAI 风格 `/v1/videos` 或火山 Agent Plan `/contents/generations/tasks`（我们的 Ark provider 已覆盖同类语义）。
- 媒体引用须公网 URL（PUBLIC_BASE_URL 生成）→ 对应我们的 S3 预签名直传 + 公开读 URL。

## §4 与本项目对照（改造边界）

| 维度 | tigerowo | 我们（D12 后） |
|---|---|---|
| 存储 | localforage + Go 云同步(可选) | Supabase projects.graph（服务端唯一真源）+ assets/MinIO |
| 生成 | 浏览器直连 OpenAI 兼容 / Go 代理多渠道 | **一律 POST /api/generation/tasks**（tryDebit/refund 幂等计费，D2 美元） |
| LLM | 浏览器直连（用户 key） | **POST /api/agent/canvas/turn**（服务端持 LLM_API_KEY，浏览器不下发） |
| 模型清单 | 用户渠道配置 | admin models 表驱动（D4，禁前端硬编码） |
| Auth | 自建 JWT/管理员 | Supabase Auth + JWT guard（不变） |
| 组件库 | antd 6 | shadcn/ui（D12 改写） |

## 附录 A：antd→shadcn 改写映射表（同步上游时按表重放）

| antd | shadcn/ui 对应 | 备注 |
|---|---|---|
| Popover | components/ui/popover.tsx | 画布 settings popover 全量替换 |
| Modal | components/ui/dialog.tsx | crop/mask/upscale/split/angle/asset-picker/prompt-library |
| Select | components/ui/select.tsx（或自研 listbox） | 模型/比例选择 |
| Tooltip | components/ui/tooltip.tsx | 工具条提示 |
| Slider | 自研（D9 时长滑条模式） | 视口/参数滑杆 |
| Tabs | components/ui/tabs.tsx | 工作台/侧栏分类 |
| Drawer | 自研 sheet（右侧面板已是自研） | 侧边工作台 |
| Input/Textarea/Button/Checkbox/Switch/Spin/Radio | components/ui/* 对应件 | 常规替换 |
| message/Toast | sonner（已在用） | 操作反馈 |
| Table/Transfer/TreeSelect | 按需自研简化版 | 场景树用自研树（antd Tree→自研递归组件） |

## 附录 B：推测项登记（原站无证据，按 tigerowo 设计，代码注明「推测」）

| 项 | 推测设计 | 依据 |
|---|---|---|
| layer 字段 schema | 对齐 CanvasNodeData（§3.1） | 原站 draft 只见空 layers[] |
| 选中态工具条 | hover-toolbar + 裁剪/蒙版/放大/分割/角度 | 原站引导文案「选中展开更多编辑能力」 |
| 画布内生成面板 | config 节点 + 底部 composer 并存 | 原站有底部 composer，面板未见 |
| 画布生成计费位 | 复用 D9 价格位样式（美元） | D2 铁律 |

## 附录 C：明确不做（登记 v2+）
share_project 分享令牌、blend/rotate_clip（原站灰度中）、画布发布、上传审核（MODERATION 储备）、未登录本地直连模式（内部平台无意义）。
