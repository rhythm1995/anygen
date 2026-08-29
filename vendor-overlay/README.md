# vendor-overlay — 对 OpenMontage 的本地定制层

**铁律：永远不修改 vendor/openmontage/ 内的任何文件**（同步会覆盖）。

本目录存放：
- `bridge/` — NestJS ↔ Python JSON 桥（调用 vendored 工具的唯一入口）
- `patches/` — 确需改上游行为的补丁（同步后人工重放，逐个列出）
- `seed/` — 从 vendored 代码提取的定价/参数数据 → admin models seed 生成器

桥接协议（JSON over stdin/stdout）：
```bash
echo '{"tool":"seedance_ark","action":"estimate_cost","inputs":{...}}' \
  | vendor-overlay/bridge/run.py
# → stdout: {"ok":true,"result":{...}} / {"ok":false,"error":"..."}
```
