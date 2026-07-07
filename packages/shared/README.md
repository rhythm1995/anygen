# @helix/shared

Domain model shared by the Helix API (NestJS), web (Next.js) and agent (eve).

Exports:
- `enums` — content types, statuses, languages, run modes
- `types` — `Brief`, `ContentItem`, `BrandProfile`, `KnowledgeItem`, `ContentJob`, etc.
- `constants` — `CONTENT_TYPE_META` (per-type production outlines), `GEO_QUALITY_GATES`
- `schemas` — Zod DTO schemas for the REST API

Build: `pnpm --filter @helix/shared build` (emits CJS to `dist/`). The root
`postinstall` builds this automatically so app packages can resolve it.
