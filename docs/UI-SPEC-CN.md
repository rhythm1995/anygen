# UI-SPEC-CN — 即梦（国内版）创作模式面板规格

> 状态：**已定稿，待实施（M3）**。UI 事实来源 = 用户提供的 8 张截图（2026-08-30）+ §6 实测侦察；数据来源 = **ADMIN.md 的 models/creation_modes 配置表**（admin 配什么，面板显示什么）。
> 原则：全站文案切 zh-Hans；本规格只覆盖与创作模式相关的增量，三页既有布局（UI-SPEC.md）不变。

## 1. 创作类型下拉（截图1）

Composer 底部工具条第一个 chip：`⚡ Agent 模式 ∨`（青色高亮，当前选中类型）。

点击弹出「创作类型」菜单：

| 类型 | 值 | 图标语义 |
|---|---|---|
| Agent 模式（默认✓） | agent | 双斜杠闪电 |
| 图片生成 | image | 图片+齿轮 |
| 视频生成 | video | 播放圆环 |
| 音乐生成 | music | 音符 |
| 配音生成 | dubbing | 波形话筒 |
| 数字人 | digital_human | 人像唇形 |
| 动作模仿 | motion_mimic | 运动人形 |

行为：勾选态（右侧 ✓ + 底色高亮）；切换后**整条工具条随类型重渲染**（见 §4/§5）；菜单项数据来自 `creation_modes` 表（enabled 过滤）。

## 2. 生成偏好弹层（截图2，原「自动」chip）

chip：`☰ 自动`（Agent 模式下显示）。点击弹「生成偏好」：

- 右上 `自动` toggle（开=青色）
- 双 tab：`图片` | `视频`（分段控件，选中底色 dm-surface-2）
- **选择比例**（图片 tab）：`智能` + 21:9 / 16:9 / 3:2 / 4:3 / 1:1 / 3:4 / 2:3 / 9:16（每个比例一个小矩形示意图标；选中底色高亮）
- **其他设置**（图片 tab）：`图片 4.0 ∨` | `高清 2K ∨` 两个下拉按钮
- 视频 tab：比例子集 + 分辨率子集（复用 §5 数据）

此弹层 = Agent 模式下用户对默认生成行为的偏好，写入用户 profile 偏好字段，Agent 计划时继承。

## 3. 技能弹层（截图3）

chip：`🔧 技能`。点击弹层（宽 ~640px）：

- 顶部：`🔍 搜索技能` 输入框 + 右侧 `更多技能 >` 链接
- 技能列表（来自 agent_skills，`official=true` 显示「官方」角标）：
  - **剧情短片**：帮你自动生成故事大纲、分镜脚本并产出短片
  - **电商套图**：生成风格统一的商品全套视觉素材，适用于各大电商平台
  - **海报设计**：生成更有创意的海报内容，擅长营销场景和节日热点
  - **品牌设计**：根据公司名称、业务与客群，生成品牌 Logo 与视觉方案
- 底部固定两项：`＋ 用 Agent 创建技能`、`☰ 管理技能`
- 搜索：前端过滤（名称/描述 contains）
- 选中技能 → Composer placeholder 替换为技能描述，提交时走 agent_sessions（带 skill_id）

## 4. 图片生成模式（截图4/5）

切到「图片生成」后工具条：`🖼 图片生成 ∨`（青）| `📦 图片 5.0 Pro ✦` | `□ 1:1 | 2K✦ | 2` | `T₂，` | `@`

### 4.1 模型下拉（数据源 models where creation_type='image'）
标题：`选择模型：图片 5.0 Pro by Seedream 5.0 Pro`（当前值 by 供应商系列名）

| 模型 | badge | 描述 |
|---|---|---|
| 图片 5.0 Pro ✦ | New | 商业设计、影视、高密度图文等场景效果全面提升 |
| 图片 5.0 Lite | | 指令响应更精准，生成效果更智能 |
| 图片 4.7 | New | 画质全面优化，指令响应能力再次提升 |
| 图片 4.6 | | 人像一致性保持更好，性价比更高 |
| 图片 4.5 | | 强化一致性、风格与图文响应 |

行结构：`图标 | 名称+badge✦ | 描述（次级色）| 选中✓`。

### 4.2 参数弹层（chip `□ 1:1 | 2K✦ | 2` = 当前参数回显）
- **选择比例**：智能 | 21:9 | 16:9 | 3:2 | 4:3 | 1:1(选中) | 3:4 | 2:3 | 9:16
- **选择分辨率**：`标清 1.5K` | `高清 2K✦`(选中) | `超清 4K✦`
- **选择生成数量**：1 | 2(选中) | 3 | 4
- **尺寸**：`W [2048] 🔗 H [2048] PX`（联动输入，断链后自由输入）
- 参数变更实时回显到 chip；提交时全部进 generation params，计费按 §ADMIN §4 公式（张数×分辨率系数）

## 5. 视频生成模式（截图6/7/8）

工具条：`🎬 视频生成 ∨` | `📦 即梦 Seedance 2.0 mini ✦` | `🖼 首尾帧 ∨` | `▭ 16:9 | 720P✦` | `🕐 5s`

### 5.1 模型下拉（models where creation_type='video'）
| 模型 | badge | 描述 |
|---|---|---|
| 即梦 Seedance 2.5 ✦ | New | 最强模型，支持 50 个参考，新增视频编辑、超长生成 |
| 即梦 Seedance 2.0 mini ✦ | New | 极致性价比，相近的体验，比Fast更快的推理速度 |
| 即梦 Seedance 2.0 Fast VIP ✦ | New | 极速推理，会员专属通道，音视文图均可参考（暂不支持真… |
| 即梦 Seedance 2.0 VIP ✦ | New | 全模态能力，会员专属通道，音视文图均可参考（暂不支持… |
| 即梦 Seedance 2.0 Fast | New | 高性价比，音视文图均可参考(暂不支持真人脸) |

### 5.2 参考模式下拉（首尾帧 ∨）
| 模式 | badge |
|---|---|
| 全能参考 | |
| 首尾帧（选中✓） | |
| 智能多帧 | |
| 智能编辑 | Beta |
| 超长视频 | Beta |

### 5.3 比例/分辨率弹层（▭ 16:9 | 720P✦）
- **选择比例**：21:9 | 16:9(选中) | 4:3 | 1:1 | 3:4 | 9:16（6 种，无智能/3:2）
- **选择分辨率**：`720P`(选中) | `1080P✦`

### 5.4 时长（🕐 5s）
下拉/步进：3s / 5s / 10s（以侦察为准，可配）。计费 = per_second × 秒 × 分辨率系数。

## 6. 其余三类（音乐/配音/数字人/动作模仿）
- 上轮 cookie 侦察未覆盖其面板细节；实现前用同法补抓（登录态逐面板快照）
- 面板骨架沿用：模型下拉（models where creation_type=对应值）+ 类型特化参数（音乐：时长/风格；配音：音色/语速；数字人：形象/声音；动作模仿：参考视频）
- 数据缺失时按 models 表配置渲染空态，不硬编码

## 7. 提交与回显
- 提交：POST /api/generation/tasks 携带 `{type, model_code, params:{ratio, resolution, count|duration, reference_mode, custom_size}}`
- 任务卡回显参数 chips（模型名/比例/分辨率/数量或时长）
- Agent 模式提交 → /api/agent/sessions（AGENT-RESEARCH §3）

## 8. TDD 要点（实现时）
- 面板渲染契约：models 表数据 → 工具条/弹层快照测试（含 badge/选中态/空态）
- 参数校验：比例×分辨率×模型的合法组合矩阵（非法组合禁选）
- 参数回显 chip 的格式化纯函数

---

# §6 补全：2026-08-30 实测侦察（用户 cookie 直接可用，全部真实数据）

> 侦察产物：`dreamina-clone/RECON/jimeng-cn/`（SSR 内嵌 JSON 已抽出：image/video/imitator 模型配置、agent_config、skill_list、libra abtest、explore feed）。
> 方法论验证：截图面板数据与 SSR `window.__image/video/imitator_generate_model_config__` 完全一致——**面板 = 配置渲染**，证实「admin 配置表驱动面板」架构正确。

## 6.1 URL 类型映射（实测）
| 创作类型 | URL 参数 |
|---|---|
| Agent 模式 | （默认 / ?type=agent） |
| 图片生成 | ?type=image |
| 视频生成 | ?type=video |
| 音乐生成 | ?type=music |
| 配音生成 | ?type=audio |
| 数字人 | ?type=digitalHuman |
| 动作模仿 | ?type=imitator |

## 6.2 图片生成（实测 9 个模型，配置含完整参数矩阵）
| 模型 | model_req_key | New |
|---|---|---|
| 图片 5.0 Pro | high_aes_general_v50p_large | ✓ |
| 图片 5.0 Lite | high_aes_general_v50 | |
| 图片 4.7 | high_aes_general_v43 | ✓ |
| 图片 4.6 | high_aes_general_v42 | |
| 图片 4.5 | high_aes_general_v40l | |
| 图片 4.1 | high_aes_general_v41 | |
| 图片 4.0 | high_aes_general_v40 | |
| 图片 3.1 | high_aes_general_v30l_art_fangzhou:general_v3.0_18b | |
| 图片 3.0 | high_aes_general_v30l:general_v3.0_18b | |

参数矩阵（每模型自带）：
- **分辨率**：1.5k / 2k / 4k（名称 标清1.5K·高清2K·超清4K），每档带 8 种 ratio_type 的精确 W×H（如 2k: 1:1=2048², 3:4=1728×2304…）+ min/max/max_pixel_num 约束
- **数量**：generate_count_options=[1,2,3,4]，默认 2
- 默认模型：default_model_index；step 范围 sample_steps（10-41，默认16）

## 6.3 视频生成（实测 11 个模型）
| 模型 | model_req_key |
|---|---|
| 即梦 Seedance 2.5 | dreamina_seedance_45_pro |
| 即梦 Seedance 2.0 mini | dreamina_seedance_40_mini |
| 即梦 Seedance 2.0 Fast VIP | dreamina_seedance_40_vision |
| 即梦 Seedance 2.0 VIP | dreamina_seedance_40_pro_vision |
| 即梦 Seedance 2.0 Fast | dreamina_seedance_40 |
| 即梦 Seedance 2.0 | dreamina_seedance_40_pro |
| 即梦 Seedance 1.5 Pro | dreamina_ic_generate_video_model_vgfm_3.5_pro |
| 即梦 Seedance 1.0 | dreamina_ic_generate_video_model_vgfm_3.0_pro |
| 即梦 Seedance 1.0 Fast | dreamina_ic_generate_video_model_vgfm_3.0_fast |
| MiniMax H3 | dreamina_minimax_h3 |
| HappyHorse 1.1 | dreamina_happyhorse_v1_1 |

参数（Seedance 2.5 options 实测）：
- 比例 enum：21:9 / 16:9(默认) / 4:3 / 1:1 / 3:4 / 9:16
- 分辨率 enum：480p / 720p / 1080p（UI 显示 720P/1080P✦）
- 时长：duration_ms 4000-15000（全局 video_duration_display_range）
- 长视频模式（超长视频Beta）：30s-180s step 1s；帧数 frames enum 96-504+；fps 24
- 参考模式 options：first_frame/end_frame（首尾帧）、extend（视频续写）、edit（智能编辑）、unified_edit（全能参考，素材上限 30 图/10 视频）、input_media_type enum
- 第三方模型（MiniMax H3 / HappyHorse 1.1）也在下拉里——**供应商聚合入口**，佐证 admin 多供应商设计

## 6.4 音乐生成（实测）
- URL ?type=music；模型下拉：**SeedMusic 1.0 Preview**（唯一）；按钮：**智能时长**
- 配置 API 未在 SSR；切换类型时按需加载（实现时抓 network 补）

## 6.5 配音生成（实测）
- URL ?type=audio；无模型下拉；按钮：**克隆声音**
- 配置线索（SSR）：`audio_generate_ab: {default_model_req_key: "tts_model_v3", tts_generate_switch: true}`；TTS 域名 `wss://sami.bytedance.com`（SAMI websocket）
- 参考资源约束（reference_resource_config）：max_audio_count=10, max_audio_duration=30.2s, min_audio_duration=1.8s

## 6.6 数字人（实测）
- URL ?type=digitalHuman
- 模式下拉：**快速模式**（另有选项待抓，通常有 精细模式）
- 按钮：**上传音频**
- textarea 双段 placeholder：「说话内容\n\n请输入你希望角色说出的内容\n动作描述\n\n(可选) 添加动作描述和镜头语言，如：镜头推进，他摘下眼镜，对着镜头…」

## 6.7 动作模仿（实测，SSR imitator 配置）
- URL ?type=imitator；模型下拉来自 imitator config：**大师**（效果最佳，画质超清，icon_tag=new）等；风格 combobox「生动」
- 模型 icon 为数字人形象图（actor_m15-pro 等）

## 6.8 Agent 配置与技能（实测 API）
- `POST /mweb/v1/creation_agent/v2/get_agent_config`：image_data(9 模型) + video_data(11 模型) + skill_data + reference_resource_config + user_custom_skills_config
- `POST /mweb/v1/creation_agent/v2/skill/list`：official_skills 实测 4 个：
  - web_agent_skill_story **影视故事短片**「帮你自动生成故事大纲、分镜脚本并产出短片」market_tag=film_short
  - web_agent_skill_ecommerce **电商套图**
  - web_agent_skill_poster **海报设计**
  - web_agent_skill_brand **Logo设计**（截图里叫"品牌设计"，以 API name 为准）
  - 字段含 showcase_media（案例图）、market_enabled、default_desc/default_title
- Agent 的 MCP 工具配置（libra abtest）：text2image/image2image 端点对（bytedance.mcp.creation_*40 / agent31 / agentic_gen_image_ppe）——即梦把 agent 的生成能力包成 MCP 工具，**与我们 AGENT-RESEARCH 的工具集设计同构**，工具粒度参照
- reference_resource_config：max_image_count 30 / max_video_count 10 / max_audio_count 10 / max_video_file_size_mb 200 / min_duration 1.8s

## 6.9 seed 数据结论
- models 表 seed 直接从 `RECON/jimeng-cn/*.json` 生成（不再手抄截图）：image 9 + video 11 + imitator N + music 1 + tts 1，含 badge/description/默认值/参数矩阵原样入库
- creation_modes seed：7 类型（含 URL type 值）
- agent_skills seed：4 官方技能（含 showcase 链接——注意签名过期，需转存本地图）

## 7. 无限画布 v2 规格（D12，2026-09-01 新增）

> 状态：**已定稿（依据 CONCLUSIONS D12），实施中（M7）**。蓝本 = vendor/infinite-canvas（tigerowo，AGPL，shadcn 化改写）；即梦侧事实 = RECON/auth/canvas-editor/；移植手册 = docs/CANVAS-RESEARCH.md。
> 本节只列"对齐即梦"的增量要求；移植自 tigerowo 的交互细节以其源码+文档为准，不在此重复。

### 7.1 路由与入口
- 列表页 `/ai-tool/assets-canvas`（保持现有路由）：标题「今天想创作点什么？」；composer placeholder=「输入想法、剧本或上传参考，支持 "/"使用技能，添加主体，和Agent一起创作」；灵感模板 6 卡 CN 原文（中式茶饮品牌VI设计/IP潮玩人物设定及表情包/宇宙迷航短片分镜/香水产品系列海报/治愈系插画故事绘本/超现实梦境MV概念分镜）+「新建项目」「最近项目」
- 列表页 composer 提交 = 新建画布项目并带入 prompt 预填（不再跳生成页）
- 编辑器 `/ai-tool/assets-canvas/project/[id]`（保持现有路由）：顶栏=返回/项目名(可编辑)/保存态/「对话」开关/积分余额；空态 hero=「这次创作想从哪里开始？」+ 本地上传/选择资产 +「没有好创意？先和Agent聊聊，或者搜一搜站内灵感吧！」；左下缩放百分比；空画布右键=粘贴 ⌘V/居中视图 ⌘0（推测项：菜单具体项按 tigerowo context-menu 扩展）

### 7.2 文案纪律
- 即梦侧已实测文案照抄上文原文；未实测处（标注「推测」）采用 tigerowo 中文文案；全站 zh-Hans（D1）
- 生成计费位=美元同位展示（D2），画布内价格显示必须等于实扣

### 7.3 与 tigerowo 的差异（改造点，移植时必改）
1. 生成调用 → `/api/generation/tasks`（提交+GET 轮询）；模型清单来自 admin models 表
2. 图片/视频/音频上传 → 我们上传管线（MinIO/assets），节点存 assetId+url；storageKey/补水/引用清理体系删除
3. LLM → `/api/agent/canvas/turn`（服务端 key）；其 AiConfig/本地渠道体系删除
4. 会话持久化 → agent_sessions(project_id, 0012) + messages；chatSessions 不再内嵌 graph
5. antd → shadcn/ui（映射表 CANVAS-RESEARCH 附录A）
6. 未登录本地直连模式删除（内部平台）
