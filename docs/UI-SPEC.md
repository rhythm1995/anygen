# UI-SPEC

> 所有色值/字体来自真浏览器计算样式（非目测）。证据：
> `dreamina-clone/RECON/style-probe-3.json`（全页扫描）、`RECON/style-probe.json`（字体栈）、
> `assets/fonts/fonts.css`。布局基准截图：`RECON/screenshots/original-*-1440.png`。

## 设计 token（Tailwind v4 `@theme`）

```css
@theme {
  --color-dm-bg: #0f0f12;            /* 页面背景 rgb(15,15,18) */
  --color-dm-surface: #15161a;       /* 卡片/输入框表面 rgb(21,22,26) */
  --color-dm-surface-2: #22252a;     /* 高一级表面 rgb(34,37,42) */
  --color-dm-glass: rgb(32 33 39 / 72%);  /* 任务指示器玻璃层 */
  --color-dm-accent: #00cae0;        /* 青色强调 rgb(0,202,224) */
  --color-dm-accent-dim: rgb(0 202 224 / 12%);
  --color-dm-text: #f5fbff;          /* 主文字 rgb(245,251,255) */
  --color-dm-text-2: rgb(224 245 255 / 60%);
  --color-dm-text-3: rgb(224 245 255 / 48%);
  --color-dm-text-4: rgb(224 245 255 / 35%);
  --color-dm-border: rgb(204 221 255 / 6%);
  --color-dm-border-2: rgb(204 221 255 / 8%);
  --color-dm-divider: rgb(224 245 255 / 20%);
  --radius-dm: 8px;                  /* chips/按钮 */
  --font-dm-body: "CapCut Sans", "PingFang SC", Arial, sans-serif;
  --font-dm-label: "Montserrat", "CapCut Sans", Arial, sans-serif;  /* 12px/450 */
}
```

shadcn/ui 主题映射：`--background`→dm-bg、`--card`→dm-surface、`--primary`→dm-accent（前景用深色 #15161a）、`--border`→dm-border、`--ring`→dm-accent。

字体自托管：`apps/web/public/fonts/` ← `dreamina-clone/assets/fonts/`（CapCutSans Text Regular/Medium/Bold .woff2；Montserrat 400/500/600 subset），`@font-face` 本地声明，禁止系统字体近似。

## 全局壳（三页共用）
- 左侧图标栏 `SideRail`：宽 76px、padding 20px 10px、背景透明悬浮；纵向：logo（顶部，蓝色星形）→ Explore / Create / Assets / Canvas / Octo(Beta 徽标，登录态) → 底部：Upgrade(+50 徽标，登录态) / 通知 / API / 3D / 设置；文字 `--font-dm-label` 12px，选中态文字 `--color-dm-text` + 图标激活色，未选中 `--color-dm-text-3`
- 登录态差异：匿名显示 Sign in 按钮与 Free credits 标签（home 页左下，青色小字）
- 顶栏（home）：右侧 Assets 按钮 + 头像/积分胶囊（登录态）

## /ai-tool/home（匿名基线：original-home-1440.png）
1. `Hero`：居中标题 "Start Creating With " + 白色粗体 + "AI Agent"（青色 + 下拉箭头，Montserrat）；下方大输入卡（max-w ~1000px，bg dm-surface，radius ~16px，边框 dm-border）：左上附件缩略占位（+ 按钮）、placeholder "Start with an idea or script. Add elements with mentions or type \"/\" for skills."（dm-text-3）；底部行：`AI Agent ∨`（青字，带图标）、`Auto`、`Skills` 三个 chip（h-36px、radius-8px、border dm-border、Montserrat 12px/450），右侧圆形提交按钮（bg rgba(204,221,255,.16)，↑ 图标）
2. `ModelCards`：4 张横排卡（w≈240px h≈64px bg dm-surface radius 12px）：图标(44px 圆角图) + 标题白字 + 副标题 dm-text-3：
   - AI Video / Seedance 2.5（蓝色角标 "25"）
   - AI Image / Seedream 5.0（角标 "5.0"）
   - Clay Renderer / Plugin for Seedance 2.5
   - Smart edit ✨ / Upload your media（右上 "New" 青字角标）
3. `FeedTabs`：Trends（选中：dm-surface-2 胶囊 + 白字）/ 🔥 Skills / AI Shorts / Events；右侧 "Posted by me"（dm-text-3）
4. `MasonryFeed`：CSS columns 5 列（1440 宽）、间距 12px；卡片 radius ~12px、hover 显示底部渐变+标题；数据 = GET /api/feed（offset 分页 + 无限滚动）；封面 `/seed/feed/*` 本地图
5. 首访注册弹窗（匿名）："Sign up for free credits 🎉" 卡（bg rgba(32,33,39,.72) 玻璃、radius 12px）+ "Sign in" 按钮——v1 实现 UI，登录后不出现

## /ai-tool/generate（登录基线：RECON/auth/generate-1440.png）
1. `ChatSidebar`（左，w≈240px，bg 更深）：头 "Your chats" + 折叠图标；"New chat" 按钮（bg dm-surface radius 8px）；会话列表（GET /api/chats）
2. 主区 `new-conversation` 态：
   - 标题 "What are we creating today?"（居中，dm-text，~28px semibold）
   - `Composer`（tiptap 富文本，min-h≈190px，bg dm-surface radius 16px border dm-border）：placeholder "Start with an idea or @mention elements"；`@` 触发 MentionMenu（资产/元素）、`/` 触发 SkillMenu（agent_skills 4 项，对齐 agent_config.skill_data）
   - 底部 chips：`AI Agent ∨`（青）/ `Auto` / `@`；右下圆形提交（同 home）
3. `TaskCenter`（会话内/右）：生成任务卡（缩略图 + 进度态 queued→running→succeeded）；实现 = POST /generation/tasks 后 2s 轮询 GET /generation/tasks/:id；成功卡片可直接"加入画布/存为资产"
4. 模型选择：AI Agent 下拉 → model_list（agent_models 表），图/视频双 tab

## /ai-tool/assets-canvas（登录基线：RECON/auth/canvas-clean-1440.png）
入口态（无项目打开时）：
1. 同 generate 的标题 + Composer（共用组件）
2. `IdeaCards`："Start with these ideas" 一行 5 张卡（660×110→实际 ~240×95，radius 12px，底部白字标题+→）：Urban Coffee Visual Identity / Art Toy Character Design / Stellar Odyssey Storyboard / Perfume Collection Poster / Healing Illustrated Storybook / Surreal Dreamscape Storyboard（封面 `/seed/ideas/*` 本地图）
3. `ProjectList`："Recent projects" + New project 卡（bg dm-surface、+ 居中、下方 dm-text-3 标签）；数据 GET /api/projects；点击 → 画布编辑器

编辑器（/ai-tool/assets-canvas/project/[id]）：
- @xyflow/react 全屏无限画布：bg dm-bg、点状网格
- 节点：`image`（assets/feed 图片）、`text`（便签，bg dm-surface）、`generation`（挂生成任务结果，可再次生成）
- 能力：拖拽/多选/框选/缩放平移、删除、连线（仅 generation←image/prompt 语义）、右侧属性条（bg dm-surface-2）
- 持久化：debounce 800ms PATCH /api/projects/:id {graph}（zod 校验）；重开恢复 viewport
- 头部工具条：项目名（可编辑）/ 保存态指示 / 分享按钮（占位）

## 响应式
- 1440 为基准；≥1024 三页桌面布局；768 以下：侧边栏收窄为 56px 纯图标、Composer 全宽、瀑布流 2 列（原站 390 基线：RECON/screenshots/original-home-390.png）

## 交互态清单（实现时逐个核）
- chip hover：bg → rgba(204,221,255,.08)；active：scale .98
- 输入卡 focus：border → rgba(204,221,255,.16)
- feed 卡 hover：底部渐变遮罩 + 标题上滑
- 侧栏项 hover：文字 text-3→text；选中：text + 图标 accent
- 生成任务卡：queued（灰点脉冲）/ running（进度条 accent）/ succeeded（图淡入）/ failed（红字原因 + 重试）
