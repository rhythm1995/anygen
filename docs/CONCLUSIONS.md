# CONCLUSIONS — 调研结论与决策总表（权威文档）

> 本项目所有调研的**最终结论以本文为准**；过程档案见各专题文档（AGENT-RESEARCH.md / ADMIN.md / UI-SPEC-CN.md / MODERATION.md / VENDOR-OPENMONTAGE.md）。
> 更新纪律：任何决策变更必须同步改本文并注明日期。

## 0. 文档地图与治理（防漂移）

| 层 | 文档 | 性质 | 权威范围 |
|---|---|---|---|
| 决策层 | **CONCLUSIONS.md** | **唯一权威** | 全部决策（D1-D14）、事实速查、里程碑现状 |
| 契约层 | ADMIN · UI-SPEC-CN · VENDOR-OPENMONTAGE · DATA-MODEL 增量节 | 已定稿规格 | 各自领域实现规格；与 CONCLUSIONS 冲突时以 CONCLUSIONS 为准 |
| 过程层 | AGENT-RESEARCH · MODERATION（搁置储备） | 调研档案 | 仅作依据追溯，不含"现状" |
| 历史层 | ARCHITECTURE · UI-SPEC · PLAN · TESTING（M1 部分） · `.dreamina-clone/NOTES` | M1 快照 | 记录已交付状态，不描述未来 |

**治理纪律**（对所有 agent 与人生效，AGENTS.md 同步）：
1. 决策变更：**先改本文（含日期）**，再动规格文档，最后才写代码
2. 每份文档首行必须携带状态横幅（已定稿/待实施/已搁置/历史快照），状态变化只改横幅
3. 历史层文档**不更新内容**，只允许加横幅指向权威文档
4. 端口/命令/价格等易变事实只允许出现在一个权威处：端口→AGENTS.md，价格→admin models seed + CONCLUSIONS §3.2（vendor 仅对照源）
5. **纯参考不入库（2026-09-01）**：侦察证据库本地为 `.dreamina-clone/`（原 `dreamina-clone/`）；UI 验证截图本地为 `docs/.verify/`（原 `docs/verify/`）。均 `.gitignore`，不进 git / 不同步 GitHub。历史文档里的旧路径视为档案，以本文与 AGENTS.md 为准。

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
| D6 | Vendor 边界 | **vendor 只作只读蓝本，运行时零进入**（2026-09-01 用户修订）。`vendor/openmontage`、`vendor/infinite-canvas` 同步制对照源，禁止手改、禁止 import/spawn。音乐/配音/克隆在 `apps/api` 用 TS HTTP 直连 ElevenLabs / 豆包语音（契约对照 vendor 工具，不执行其代码）；画布已在 `apps/web` 改写（D12）。`vendor-overlay` 仅离线 seed/对照，不在请求路径。AGPL 内部使用合法，产品化前必须剥离 | 08-30 / **09-01 修订** | VENDOR-OPENMONTAGE |
| D7 | 生成后端 | 只接真模型（Ark 优先），无 mock；四新类型（音乐/配音/数字人/动作模仿）**已接通真引擎（D13）**：music→`apps/api` ElevenLabs Music HTTP；dubbing→`apps/api` 豆包 TTS HTTP（有 `reference_audio` 时改 ElevenLabs clone+TTS）；digital_human / motion_mimic→Ark Seedance 参考图/参考视频。未配对应 key 仍 503，禁 mock | 08-29 / 09-01 修订 | PLAN + D13 |
| D8 | 资产库完整版 | 按 2026-08-31 CDP 侦察复刻 /ai-tool/asset：生成历史（主 tab：生成历史/主体/画布；子 tab：图片/视频/音频/文档 + 筛选/时间/排序 + 搜索 + 批量操作），**去掉「同步到剪映」**；资产卡点击开详情弹层（大图+提示词+同任务缩略图条+操作区）。筛选面板真实选项：操作=收藏；类型=超清；分辨率=1K/2K/4K/8K；比例=21:9/16:9/3:2/4:3/1:1/3:4/2:3/9:16；时间=自定义起止日期+全部/最近一周/最近一个月/最近三个月；排序=近→远(默认)/远→近。批量栏=已选择N项内容+删除/下载/发布/收藏/取消选择。API：GET /assets 扩展过滤参数（保持裸数组兼容）+ PATCH /assets/:id（收藏）+ POST /assets/batch（批量删除/收藏/发布）；assets 表加 favorited/published 列（迁移 0009）。主体 tab 空态（无主体库）；画布 tab 复用 projects 列表。详情不可用的高级编辑动作（智能超清/多角度/对口型等）原样展示、点击 toast「建设中」，可用动作真实跳转 | 08-31 | asset-recon |
| D9 | 视频生成面板 | 按 2026-08-31 CDP 登录态侦察（RECON/auth/generate-video/）把 composer 的 video 模式重构为**原版大面板形态**：左侧参考素材叠卡（整体倾斜：单卡 -8°、首尾帧/智能编辑双卡 -8°/+8° 扇形、全能参考/超长视频的参考内容卡为**双层叠卡**背卡 +8° 右上露出；隐藏 file input 接受图/视频(mp4,mov)/音频(mp3,wav)）+ 右侧描述区（占位文案逐模式照抄原版）+ 底部工具条（类型 accent chip｜模型 chip 名称+✦（无徽标无 chevron）｜参考模式 chip｜**比例+分辨率+数量合并 chip**｜时长 chip｜价格位｜提交钮）。五个菜单/弹层全按原版：类型菜单（创作类型头部+原版 SVG 图标+选中 accent✓）、参考模式菜单（原版图标+Beta 徽标+选中高亮✓）、模型菜单（「选择模型：X」头部+图标块+✦+New 徽标+描述+✓；**不渲染 "by seed" 来源后缀**——公共 API 有意不暴露 provider）、比例弹层（选择比例 6 格+选择分辨率 3 格✦+选择生成数量 4 格）、时长组件=**滑条弹层**（非菜单；400×96 弹层 bg rgb(28,30,34)/radius 16/p-4，标题「选择视频生成时长」12px/500，滑条轨道 254×12 rail rgba(204,221,255,0.08)+fill rgba(224,245,255,0.2)+白色滑块 20×16，下方刻度按钮普通 0/5/10/15、超长 0/30/…/180 可点击，右侧数值输入框 90×36 bg rgba(204,221,255,0.08)/radius 8 带 s 后缀、placeholder 显示范围 4-15/30-180；滑条域 0→max、低于下限吸附 min）。模式切换自动匹配支持该模式的模型 + toast「已为您匹配至最佳模型」（智能多帧→1.0 Fast 档/智能编辑·超长·首尾帧→2.5 档；支持矩阵见迁移 0010 `reference_modes`）。上传/引用管线未接入前点击上传 toast 如实提示；**价格位保留美元计价**（D2 优先于原版积分展示，智能多帧空态不仿原版显 0s/0 价——后端按时长计费，显示必须等于实扣）；菜单图标用抓包提取的原版 SVG（禁 emoji 近似）；video 数量 N 按 N 条计费（pricing per_second × count，TDD 见 cn-creation.spec） | 08-31 | video-panel-recon |
| D10 | 用户洞察 | **admin 即超级管理员**（不另设 super_admin 角色）；新增只读 360° 用户洞察页 `/admin/user-insights`（主从布局：左用户列表+搜索，右身份/余额/用量统计/最近生成/最近账变/最近 Agent 会话）；入口=主站侧栏**退出按钮上方**「用户」钮（role=admin 可见；原「管理」入口位置不变）；API：`GET /api/admin/insights/users`（列表+RPC 聚合+auth.users 邮箱）、`GET /api/admin/insights/users/:id`（详情），复用 AdminGuard（非 admin 404）；聚合走 RPC `admin_user_stats(p_user)`（security definer，revoke anon/authenticated，仅 service_role 可调）；余额调整不在此页（留在 /admin/users） | 08-31 | 用户指令 |
| D11 | 资产标签 + 能力卡联动 | ①资产自定义标签：assets 加 `tags text[] default '{}'`（GIN 索引，0011）；PATCH /assets/:id 可改 tags；GET /assets?tag=x 过滤（contains 任一命中）；GET /assets/tags 返回用户全量去重标签；详情弹层可增删标签，筛选面板新增「标签」分组（多选，OR 语义）。②首页能力卡只留 AI 视频/AI 图片（黏土渲染、智能编辑隐藏），点击走 pending-prefill 通道跳生成页并预选对应创作类型。③比例弹层按原版实测收敛尺寸（RECON 30-ratio-styles.json：比例格 48×56 gap2 无边框、选中亮底 pill；分辨率格高 36、数量格高 34；弹层宽 330） | 08-31 | 用户指令 |
| D13 | 剩余缺口收口 | **一次做完** M2/M3/M7 留下的产品缺口（用户 2026-09-01）：①四类真引擎见 D7 修订；②D9 素材上传/引用管线接通（既有 `/assets/presign` 直传），视频第六参考模式 **视频续写 `extend`**；③Agent「生成偏好」写入 `profiles.preferences`（PATCH /me/preferences）；自定义技能 CRUD（官方只读，「用 Agent 创建技能」走 LLM 起草 plan_template，无 key 时改手动表单）；④Admin 供应商 `/admin/providers` + Key `/admin/providers/:id/keys` + 定价 `/admin/pricing`（AES-256-GCM，`ENCRYPTION_KEY`；明文不回传；生成密钥 **env 回退**）。审核页仍 M6+；⑤音乐/配音在 `apps/api` TS HTTP 适配器直连上游（对照 vendor 工具契约；**不 spawn Python、不 import vendor**；图/视频仍 Ark/OpenRouter，参考素材按 Ark 官方 content 角色挂载）；⑥画布会话拆表见 D12⑤ v2；⑦M7 stub 拆除：导演台按钮创建节点并打开覆盖层；助手「我的素材」打开资产选择器；画布 `generate_audio` 走 music/dubbing 计费管线；⑧资产详情高级动作真实跳转（用作参考图=`input_images` 预填；智能超清/超清=4K 图生图；智能改图/细节修复/局部重绘/扩图/消除笔=带参考图进生成页或画布蒙版；多角度=画布项目预填；对口型=数字人预填）。主体库仍空态（D8） | 09-01 | 用户指令 |
| D14 | M8 余量收口 | 用户 2026-09-01：缺口里**能做的全做**，有依赖的落档 §7。①图/视频生成 **请求时** 读 admin `api_keys`（env 回退；`withCredentials`，禁启动时钉死 env）。②资产详情 ⋯ 菜单=复制提示词/复制链接/发布/删除（不再 toast 建设中）。③配音克隆：有参考音频时走 overlay `elevenlabs_voice_clone` → `elevenlabs_tts`（需 `ELEVENLABS_API_KEY`）；无参考仍走 `doubao_tts`。④智能编辑「高级编辑」=本地视频矩形标注，区域写入 prompt（非原站框选编辑器）。依赖项见 §7 | 09-01 | 用户指令 |
| D12 | 无限画布 v2 | **vendor 化 tigerowo/infinite-canvas（AGPL-3.0，同步制 `tools/sync-infinite-canvas.sh`，产品化前必须剥离；D6 同款纪律）对照重写**：①范围=全量（画布引擎/生成闭环/画布 Agent/全景图/导演台/生图工作台/创作工作流/摄像机参数）；②组件 **shadcn/ui 化改写**（不引 antd，映射表见 CANVAS-RESEARCH 附录A，同步上游按表重放）；③移植物文件头标注来源+AGPL+剥离标记；④**画布内一切生成走既有 POST /generation/tasks 计费管线**（零新扣费点，tryDebit/refund 幂等复用；无 ARK key 时节点 error 态显示 503 明确文案，禁 mock）；⑤画布 Agent LLM 走 `POST /api/agent/canvas/turn`（服务端持 LLM_API_KEY）；会话持久化 **v2（2026-09-01 D13）=agent_sessions.project_id 拆表（kind=canvas）与 graph.chatSessions 双写**（tigerowo 同构保留内嵌，insights/列表走拆表）；⑥文档模型对齐 tigerowo CanvasProject；⑦模型清单 admin models 表驱动（D4）；⑧推测项按 tigerowo 设计并在代码标注「推测」；⑨xyflow 退役。⑩提示词中心 /ai-tool/prompts。侦察证据 RECON/auth/canvas-editor/；调研档案 docs/CANVAS-RESEARCH.md | 09-01 | canvas-recon + 用户指令 |

## 3. 关键事实速查（侦察实证，实现时直接引用）

### 3.1 即梦国内版创作体系（RECON/jimeng-cn/，2026-08-30 抓取）
- **7 创作类型与 URL**：agent(默认)/image/video/music/audio(配音)/digitalHuman(imitator)动作模仿
- **图片 9 模型**：5.0 Pro(high_aes_general_v50p_large)✦New/5.0 Lite/4.7✦/4.6/4.5/4.1/4.0/3.1/3.0；分辨率 1.5k/2k/4k × 8 比例精确 W×H 矩阵；数量 1-4 默认 2
- **视频 11 模型**：Seedance 2.5(dreamina_seedance_45_pro)/2.0 mini/Fast VIP/VIP/Fast/2.0/1.5 Pro/1.0/1.0 Fast + **MiniMax H3、HappyHorse 1.1（第三方聚合）**；比例 21:9-9:16 六种、480p/720p/1080p、时长 4-15s（超长 30-180s）、6 种参考模式（首尾帧/全能参考/智能多帧/智能编辑/超长视频/视频续写）
- **官方技能 4**（API 实测）：web_agent_skill_story 影视故事短片/ecommerce 电商套图/poster 海报设计/brand Logo设计
- **即梦 Agent 的工具形态**：生成能力包成 MCP 工具对（bytedance.mcp.creation_*），libra abtest 按场景切工具集；reference 上限 30图/10视频/10音频
- **配音**=tts_model_v3（SAMI wss）；**音乐**=SeedMusic 1.0 Preview；**数字人**=快速模式+上传音频+双段 prompt；**动作模仿**=大师/生动模型

### 3.5 视频生成面板实测（RECON/auth/generate-video/，2026-08-31 CDP 登录态抓取）
- **落地默认 Agent 模式**（"你好，想创作什么?" + 技能卡），类型切换走 semi-design `lv-select`（点 `.lv-select-view-selector` 展开，菜单为 `.lv-select-option` portal）；类型菜单=创作类型头部 + 7 项（Agent 模式✓/图片生成/视频生成/音乐生成/配音生成/数字人/动作模仿）
- **视频 composer 是大面板**：左参考素材叠卡（`--rotate: 8deg` 外卡 / 内容 `-8deg` 反转，64×80，含隐藏 file input accept=image/* + video/mp4,mov + audio/mp3,wav）+ 右描述区（14px/21px 占位）+ 底部工具条（chip 字号 12px/字重 450、高 34-36、radius 8、边框 rgba(204,221,255,0.06)）
- **占位文案（逐模式原文）**：全能参考=「上传最多{N}个参考素材、输入文字或 @ 引用内容，自由组合图、文、音、视频多元素，定义精彩互动。例如：@图片1 模仿 @视频1 的动作，音色参考 @音频1。」（N 随模型：2.5→50、2.0 mini→12）；首尾帧=「输入文字，描述你想创作的画面内容、运动方式等。例如：一个3D形象的小男孩，在公园滑滑板。」；智能多帧=「请添加智能多帧的镜头」；智能编辑=「描述你想修改的内容，例如：把角色A替换成角色B，或使用高级编辑功能对视频画面进行标记、框选」；超长视频=同全能参考(N=50)
- **上传区按模式变形**：全能参考/超长视频=参考内容×1；首尾帧=首帧⇌尾帧（中间 swap 图标）；智能多帧=空帧×1；智能编辑=编辑视频(↑)+参考内容
- **模式→模型联动**：切智能多帧自动换 Seedance 1.0 Fast、切智能编辑/超长视频自动换 Seedance 2.5，顶部 toast「已为您匹配至最佳模型」；智能编辑额外出现「高级编辑」虚线 chip、分辨率显示「自动 720P」、时长位消失；超长视频时长 30s + hover 提示「最长可生成3分钟」
- **时长弹层实测**（RECON/auth/generate-video-duration/）：点时长 chip 弹 lv-popover-content 400×96（bg rgb(28,30,34)、radius 16、border rgba(204,221,255,0.1)、shadow 0 8px 56px rgba(0,0,0,.24)、padding 16），标题「选择视频生成时长」12px/500 rgba(224,245,255,.35)；lv-slider 域 0→max（input aria-valuemin 才是真实下限 4/30），装饰轨 slider-visual-rail/fill/tick；刻度=可点 button（tick-label 10px rgba(246,247,255,.7)）；输入框 input[role=spinbutton] placeholder="4-15"/"30-180"、90×36 bg rgba(204,221,255,.08) radius 8、12px/500、右 s 后缀 padding-right 26
- **比例弹层三段**：选择比例（21:9/16:9/4:3/1:1/3:4/9:16，图标+标签，选中亮底）+ 选择分辨率（480P✦/720P✦/1080P✦）+ 选择生成数量（1/2/3/4）；模型菜单头部=「选择模型：{name} by seed」，行=图标块+名称+✦+New 徽标+描述+✓
- **价格位**：原版积分「✦N ~~M~~」划线原价（2.5 智能编辑 100/130、超长 870/1260）→ 我们按 D2 用美元同位展示


### 3.2 定价（OpenMontage vendor 内置官方价，实测提取）
Seedance Ark（USD，5 秒）：standard 480p $0.32 / 720p **$0.69** / 1080p $1.72；fast $0.26/$0.56；mini $0.16/$0.35；带视频参考约再降 40%。→ admin seed 第一手数据源。

### 3.3 Agent 业内共识（AGENT-RESEARCH §C）
推理层与持久化分层选型；completed steps never re-run + 副作用幂等；媒体大 payload 外置只传 ID；计划确认门+预算治理（估价→预留→对账+cap）；生成能力原子化为工具；技能=声明式模板；供应商打分选择。

### 3.4 资产库页实测（RECON/auth/asset/，2026-08-31 CDP 抓取）
- **列表 API**：POST /mweb/v1/workspace/list {offset,limit:30}；收藏=batch_collect；画布 tab=infinite_canvas/list_project
- **结构**：主 tab 生成历史/主体/画布（主体与画布在我们抓取时均为空态「暂无相关资产」）；子 tab 图片/视频/音频/文档；日期分组（今天/2月10日）
- **筛选面板**（可滚动分组多选）：操作=收藏｜类型=超清｜分辨率=1K/2K/4K/8K｜比例=21:9/16:9/3:2/4:3/1:1/3:4/2:3/9:16
- **时间面板**：开始日期—结束日期（日历输入）+ 单选 全部(默认)/最近一周/最近一个月/最近三个月
- **排序面板**：顺序 标题 + 近→远(默认)/远→近
- **批量栏**：已选择 0 项内容｜删除｜下载｜发布｜收藏｜✕取消选择；卡片左上角浮出 checkbox
- **详情弹层**：左大图（AI生成角标、底部 ‹ n/n › 翻页、右侧上下切换箭头）+ 右栏（下载、星标收藏、⋯菜单 → 同任务缩略图条 → 图片提示词 → 操作区：生成视频/去画布编辑/用作参考图 + 智能超清/多角度New/超清/智能改图/细节修复/局部重绘/扩图/消除笔/对口型 + 重新编辑/再次生成/在生成页定位）

## 4. 架构定论图

```
Next.js (zh-Hans 三页+7类型面板+admin) ←models 表驱动→ NestJS API
   │ Supabase Auth/JWT                      ├─ ledger(美分,幂等) ── admin 定价
   │ S3 预签名直传                           ├─ agent_sessions/steps ── 技能 plan_template
   ▼                                        └─ HTTP 适配器（均在 apps/api）
用户/浏览器                                      Ark / OpenRouter / ElevenLabs / 豆包语音
                                          vendor/* 只读蓝本，不在请求路径
```

## 5. 里程碑（当前有效）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | 三页全栈复刻（国际版）+ TDD 42 测试 | ✅ 1ade47c |
| M1.5 | CN 侦察（7 类型/模型矩阵/技能） | ✅ 8498add |
| M2 | Admin 核心（AdminGuard/models 管理 API+审计+美分账本 RPC/初始赠金 $5）| ✅ 本轮 |
| M3 | **即梦 CN 创作面板**：7 类型工具条 + 图片模式（9 模型/分辨率矩阵/数量）+ 视频模式（11 模型/参考模式/时长）+ zh-Hans + 实时计价 | ✅ 本轮 |
| M2.5 | Admin 二级页完整版：/admin layout + 模型(改价/启停/毛利) + 用量(按日/按模型/净收入) + 用户(余额调整) + 审计 + 侧栏「管理」入口(admin 可见) | ✅ 974e486 |
| M2.6 | 用户洞察页（D10）：/admin/user-insights 360° 视图 + 侧栏「用户」入口 + insights API + admin_user_stats RPC | ✅ 本轮 |
| M4 | Agent v1：技能模板执行器（agent_sessions/steps + 4 官方技能 plan_template + advance 执行器：预算预估/步骤计费/失败重试/按完成结算 + UI 步骤卡） | ✅ 974e486 |
| M5 | Agent v2：自由 loop（OpenAI 兼容 tool calling，LLM_API_* 可配 GLM/Ark/OpenAI）+ SSE 流式事件 + 无 key 503 + UI 入口 | ✅ 974e486 |
| M6+ | 审核管线（储备）、产品化剥离（AGPL）、兑换码 | 储备 |
| M7 | **画布 v2（D12）全量交付**：P0 落档/vendor → A 引擎替换（xyflow 退役）→ B 生成闭环+节点编辑五弹窗+参考图图生图/蒙版重绘（input_images 契约+OpenRouter 多模态）→ C 画布 Agent 对话（canvas/turn+26 动作执行器+会话内嵌）→ D 摄像机/全景图（球形+定制生成+2:1 识别）/3D 导演台（iframe+postMessage，截图视频回传）/生图工作台三 tab（生成记录+提示词库远程源+创作工作流公开/个人模板）→ E 即梦文案对齐 | ✅ 2026-09-01（e87d4b3→11512ef，12 commits；门 6/6 + api e2e 45 + UI e2e 全流程绿） |
| M8 | **D13 缺口收口**：四类真引擎 + 素材上传/引用 + 视频续写 + Agent 偏好/自定义技能 + Admin 供应商/Key/定价 + OpenMontage 桥接入 + 画布会话拆表双写 + M7 stub 拆除 + 资产详情动作接通 | ✅ 2026-09-01（门 6/6 + api e2e 48） |
| M8.1 | **D14 余量**：admin key 运行时注入 Ark/OpenRouter + 资产 ⋯ 菜单 + 配音 ElevenLabs 克隆 + 智能编辑本地标注 | ✅ 2026-09-01（门 6/6 + api e2e 49） |
| M8.2 | **D6 修订**：运行时零 vendor。音乐/配音/克隆从 Python 桥迁入 `apps/api` TS HTTP；vendor 仅对照 | ✅ 2026-09-01（api 单元 43 + typecheck 绿；Nest 不再 spawn Python） |

> M2.5/M4/M5 交付（2026-08-30，974e486）：turbo 6/6 绿（api 28 单元 + e2e 21 + shared 26 = 75 测试）。UI 实测：资产库页（六类筛选/上传/删除，资产↔画布入口分离）+ admin 四页（models/usage/users/audit）+ 资产/画布按钮重叠 bug 修复（各归各位）。

## 6. 风险登记

| 风险 | 缓解 |
|---|---|
| AGPL 产品化传染 | 运行时不执行 vendor 代码（D6 修订）；画布已改写进 apps/web；剥离预案见 VENDOR-OPENMONTAGE §5 |
| 即梦 cookie 失效影响后续侦察 | 已有资产足够 M2-M4；需要时再要新 curl |
| 上游 OpenMontage 快速变化 | 运行时不依赖其代码；同步仅刷新对照与 seed 数据 |
| seed 图片版权 | 仅内部学习；商用前替换（NOTES 清单） |

## 7. 有依赖、本期不做（D14 登记）

| 项 | 依赖 / 原因 | 现状 |
|---|---|---|
| 即梦 SeedMusic 官方音乐 | 无公开 Ark SeedMusic 合同/端点 | 音乐走 `apps/api` ElevenLabs Music HTTP；无 `ELEVENLABS_API_KEY` → 503 |
| 豆包 TTS 原声克隆 | 豆包语音 API 不支持克隆（对照 vendor 工具 `supports.voice_cloning=false`） | 无参考音频仍走豆包；有参考音频改 ElevenLabs Instant Voice Clone（需 `ELEVENLABS_API_KEY`，否则 503） |
| 即梦原版智能编辑框选器 | 无原站编辑器源码/标注 API | 本地矩形标注写入 prompt，提交仍走 Seedance 参考视频 |
| 独立数字人 / 动作模仿供应商 | SadTalker 需本地 GPU；Kling avatar 需额外 key | 复用 Ark Seedance 参考图/参考视频 |
| 主体库 | D8 明确空态 | 空态文案 |
| 审核管线 / AGPL 产品化剥离 / 兑换码 / 支付 | M6+ 储备；内部平台不做支付 | 见 D3、ADMIN §8 |
| 画布分享令牌 / 发布 / blend / rotate_clip / 未登录本地模式 | CANVAS 附录 C | 明确不做 |
