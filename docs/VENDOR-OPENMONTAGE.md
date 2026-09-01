# VENDOR-OPENMONTAGE — 上游对照蓝本规范

> 状态：**已定稿（CONCLUSIONS D6，2026-09-01 修订）**。vendor **只作只读对照蓝本，运行时零进入**。与 CONCLUSIONS 冲突时以 CONCLUSIONS 为准。
>
> 历史（2026-08-30）：曾把 OpenMontage 当运行时 core，NestJS spawn JSON 桥。用户 2026-09-01 否决：任何链路都不要进 vendor，实现写在 `apps/`。

## 1. 目录约定

```
vendor/openmontage/     # 上游原样副本（同步覆盖，禁止手改；不在请求路径）
  UPSTREAM_COMMIT       # 当前同步的上游 commit
vendor-overlay/         # 离线对照层（同步不影响）
  bridge/               # 历史 JSON 桥，仅离线冒烟；apps 禁止 spawn
  patches/              # （如需）对上游的补丁，同步后人工重放
  seed/                 # 从 vendor 提取定价/参数 → admin models seed
tools/sync-openmontage.sh
```

## 2. 同步流程（用户说「同步 OpenMontage」时）
1. 跑 `./tools/sync-openmontage.sh`（浅克隆上游 → rsync 排除重资产 → 记录 UPSTREAM_COMMIT）
2. 排除项：`.git/.venv/node_modules/projects//music_library//assets/*.mp4/sponsors/__pycache__`（170MB → ~33MB）
3. diff 审查：`git diff --stat vendor/openmontage` 重点看 `tools/`（接口变化）、`schemas/`（契约变化）
4. 重放 `vendor-overlay/patches/`（如有）
5. （可选、离线）对照冒烟：读 `tools/audio/music_gen.py` / `doubao_tts.py` 是否改了 HTTP 契约；**不要**把它接回 apps
6. commit：`chore(vendor): sync openmontage @ <short-hash>`

## 3. 运行环境
- **apps 进程不依赖 Python / vendor venv**。音乐、配音、克隆全部在 `apps/api` TS HTTP 适配器（`AudioProvider`）完成。
- 不要为 API 安装 `vendor/openmontage/.venv`。

## 4. 集成边界（D6 2026-09-01）
- **禁止**：`apps/*` import `vendor/*`；NestJS spawn `vendor-overlay/bridge/run.py`；请求路径加载 OpenMontage 工具注册表
- **允许**：对照 vendor 源码把公共 HTTP API 写进 `apps/api`（ElevenLabs Music / TTS / Voice Clone、豆包 Speech submit+query）
- 图/视频仍走既有 Ark/OpenRouter TS 适配器（参考素材按 Ark 官方 content 角色挂载）
- 配音带 `reference_audio` 时：`apps/api` 先调 ElevenLabs `/v1/voices/add`，再 `/v1/text-to-speech/{id}`；无参考仍豆包 TTS。缺 key → 503
- admin 模型能力矩阵可由 `vendor-overlay/seed/` **离线**从 vendor 提取后写入 migrations；运行时只读 admin `models` 表（D4）
- Agent 技能模板仍是本仓库 `plan_template`，不调用 vendor pipeline

## 5. AGPL 合规标注 ⚠️
- 当前项目**内部使用**：AGPLv3 无触发条件，vendor 树可留作对照 ✅
- **产品化红线**：一旦对外提供网络服务/分发，vendor 树与任何 AGPL 衍生代码（含 apps/web 画布移植）必须剥离或整体开源。音乐/配音适配器是自研 HTTP 客户端，不是 AGPL 衍生。
