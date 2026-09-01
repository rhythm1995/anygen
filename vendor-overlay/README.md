# vendor-overlay — OpenMontage 离线对照层

**铁律：永远不修改 vendor/openmontage/ 内的任何文件**（同步会覆盖）。
**铁律：apps 运行时零进入本目录**（CONCLUSIONS D6，2026-09-01）。

本目录存放：
- `bridge/` — 历史 JSON 桥，仅离线对照/冒烟；NestJS **禁止** spawn
- `patches/` — 确需改上游行为的补丁（同步后人工重放，逐个列出）
- `seed/` — 从 vendored 代码提取的定价/参数数据 → admin models seed 生成器

音乐/配音/克隆实现在 `apps/api/src/generation/providers/audio.provider.ts`。
