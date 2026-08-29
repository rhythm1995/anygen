# VENDOR-OPENMONTAGE — 上游 core 模块接入规范

> 决策（用户 2026-08-30 拍板）：OpenMontage **直接作为 anygen 的上游 core 模块**，用户说「同步」时执行 `tools/sync-openmontage.sh` 拉最新。

## 1. 目录约定

```
vendor/openmontage/     # 上游原样副本（同步覆盖，禁止手改）
  UPSTREAM_COMMIT       # 当前同步的上游 commit
vendor-overlay/         # 我们的定制层（同步不影响）
  bridge/run.py         # JSON 桥：调用 vendor 工具的唯一入口
  patches/              # （如需）对上游的补丁，同步后人工重放
  seed/                 # 从 vendor 提取定价/参数 → admin models seed
tools/sync-openmontage.sh
```

## 2. 同步流程（用户说「同步 OpenMontage」时）
1. 跑 `./tools/sync-openmontage.sh`（浅克隆上游 → rsync 排除重资产 → 记录 UPSTREAM_COMMIT）
2. 排除项：`.git/.venv/node_modules/projects//music_library//assets/*.mp4/sponsors/__pycache__`（170MB → ~33MB）
3. diff 审查：`git diff --stat vendor/openmontage` 重点看 `tools/`（接口变化）、`schemas/`（契约变化）
4. 重放 `vendor-overlay/patches/`（如有）
5. 跑桥冒烟：`echo '{"tool":"seedance_ark","action":"estimate_cost","inputs":{"model_variant":"standard","resolution":"720p","duration_seconds":5}}' | <py-with-deps> vendor-overlay/bridge/run.py` 应返回 `cost_usd: 0.69` 量级
6. commit：`chore(vendor): sync openmontage @ <short-hash>`

## 3. 运行环境
- vendor 不带 venv；桥需要装有上游依赖的解释器（本机 `~/openmontage-study/.venv` 可用，或在 vendor 内自建）
- 生产/CI：`python3 -m venv vendor/openmontage/.venv && pip install -r vendor/openmontage/requirements.txt`

## 4. 集成边界（M5 Agent 实施时落地）
- **NestJS ↔ Python 只走 JSON 桥**：spawn 子进程，stdin 请求 / stdout 响应；禁止在 TS 里重新实现供应商逻辑
- admin 的模型能力矩阵（价格/上限/分辨率）**以 vendor 代码内嵌数据为准**，由 `vendor-overlay/seed/` 生成器提取——单一事实源，同步即刷新
- Agent 技能模板（plan_template）的阶段划分对齐 vendor 的 pipeline_defs 语义

## 5. AGPL 合规标注 ⚠️
- 当前项目**内部使用**：AGPLv3 无触发条件，vendor 合法 ✅
- **产品化红线**：一旦对外提供网络服务/分发，vendor 部分必须剥离或整体开源——届时用桥的接口形状自研替换（接口已隔离在 bridge，替换面收敛）
