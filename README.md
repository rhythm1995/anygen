# Helix — AI Content Midplatform

An AI content production platform for **crypto exchange operations** and **GEO**
(Generative Engine Optimization) content — the content AI answer engines cite.

Built with **NestJS** (API/orchestration) + **Supabase** (data) + **Next.js** (workbench)
+ **eve** (the agent framework, fully self-hosted).

> Ships with a **mock mode** that runs the entire pipeline end-to-end with zero keys,
> so you can demo it in 60 seconds. Flip env vars to switch on the real eve agent
> and Supabase persistence.

---

## What it does

- **Briefs → Content.** Define a content brief (subject, type, language, key points,
  keywords); the platform produces a draft via the agent.
- **Two content families.**
  - **Ops:** announcements, market analysis, trading guides, listings, social, educational, AMA recaps.
  - **GEO:** `geo_faq`, `geo_explainer`, `geo_comparison`, `geo_definition` — structured,
    sourced, JSON-LD-ready, optimized to be cited by ChatGPT/Perplexity/Claude.
- **Compliance built-in.** Scans every draft for banned/required phrasing
  ("guaranteed profit", missing risk disclaimer, …) before it can ship.
- **GEO readiness score.** Each piece is scored against quality gates (direct answer,
  sourced claims, entity definition, JSON-LD, reading level, compliance).
- **Pipeline.** `draft → reviewing → approved → published`, with bulk actions and exports
  (Markdown / HTML+JSON-LD / JSON-LD).
- **AI actions** on existing drafts: improve, shorten, expand FAQ, SEO, translate.
- **Batch jobs.** Fan-out dozens of briefs with a concurrency cap; each is a durable session.
- **llms.txt + JSON-LD feed.** Publishes GEO artifacts for AI crawlers.
- **Knowledge base & brand profile** that ground the agent (brand voice, glossary, disclaimers).

## Architecture

```
┌──────── Next.js workbench (apps/web) ─────────┐
│  dashboard · briefs · content review · KB ·    │
│  brand · compliance · jobs · GEO/llms.txt      │
└───────────────────┬───────────────────────────┘
                    │ REST (NEXT_PUBLIC_API_URL)
┌───────────────────▼───────────────────────────┐
│  NestJS API (apps/api)                         │
│  briefs · content · jobs · knowledge · brand · │
│  compliance · geo · health                     │
│  └─ BatchRunner (concurrency-limited fan-out)  │
│  └─ AgentService → eve HTTP client | mock gen  │
└───────┬───────────────────────────┬───────────┘
        │ tools (HTTP)              │ durability
┌───────▼──────────────┐    ┌───────▼──────────────────────┐
│ eve agent (apps/agent)│    │ Postgres (Supabase)          │
│  instructions + skills│    │  · app data                  │
│  tools: query_kb,     │    │  · eve Workflow world        │
│  check_compliance…    │    │    (self-hosted, see steve)  │
│  subagents: drafter / │    └──────────────────────────────┘
│  geo-writer / editor  │
└───────────────────────┘
```

`@helix/shared` (packages/shared) holds the domain model, enums and Zod DTOs shared
across API + web.

## Quick start

### Option A — Docker (zero keys, full mock demo)

```bash
docker compose up -d --build
# web → http://localhost:3000     api → http://localhost:4000/api
```

Ports taken on your machine? Override them:

```bash
HELIX_API_PORT=4010 HELIX_WEB_PORT=3002 HELIX_PG_PORT=5433 docker compose up -d --build
```

### Option B — Local dev (mock)

```bash
pnpm install                 # also builds @helix/shared (postinstall)
pnpm dev                     # api:4000 · web:3000 · agent (needs node 24 + keys)
```

Open http://localhost:3000. The API is in mock mode (in-memory, seeded) — create a
brief, hit **Generate**, review, publish, and watch `/api/geo/llms.txt` update.

### Option C — Real eve agent + Supabase persistence

1. **Supabase** (local or cloud): `supabase start` (local) or point at your project.
   ```bash
   supabase db reset        # applies supabase/migrations + seed
   ```
2. **eve agent** (needs Node ≥ 24 + a model key):
   ```bash
   cd apps/agent && cp .env.example .env   # set OPENAI_API_KEY, WORKFLOW_POSTGRES_URL
   pnpm dev
   ```
3. Point the API at them:
   ```bash
   # apps/api/.env
   HELIX_MODE=supabase
   SUPABASE_URL=...        SUPABASE_SERVICE_ROLE_KEY=...
   EVE_API_URL=http://localhost:3040
   OPENAI_API_KEY=...
   ```

When the API can't reach eve (or no model key), it transparently falls back to the
local mock generator — the pipeline always responds.

## Project layout

```
apps/
  api/      NestJS — REST API, batch runner, eve client, mock generator
  web/      Next.js — workbench UI
  agent/    eve — instructions, skills, tools, subagents (self-hosted)
packages/
  shared/   domain types, enums, Zod schemas, content-type metadata
supabase/
  migrations/   0001_init.sql (portable) + 0002_embeddings.sql (pgvector, optional)
  seed.sql
docker-compose.yml
```

## API (prefix `/api`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | mode, supabase/eve flags, eve reachability |
| GET | `/health/stats` | counts by status/type |
| CRUD | `/briefs` | content briefs |
| CRUD | `/content` | produced content (+ `?status=&type=&q=`) |
| POST | `/content/:id/status` | transition `draft→reviewing→approved→published` |
| POST | `/content/:id/compliance` | re-run compliance scan |
| GET | `/content/:id/readiness` | GEO quality score + gates |
| GET | `/content/:id/export?format=md\|html\|jsonld` | export |
| POST | `/content/:id/action` | `improve\|shorten\|expand_faq\|seo\|translate` |
| POST | `/content/bulk/status` | bulk transition |
| POST | `/jobs` | create batch job (fans out) |
| POST | `/jobs/generate` | generate a single brief now |
| CRUD | `/knowledge` | knowledge base (grounding material) |
| GET/POST | `/brand` | brand profile → brand-tone skill |
| CRUD | `/compliance` | banned/restricted/required terms |
| GET | `/geo/llms.txt` · `/geo/llms-full.txt` · `/geo/feed` | GEO artifacts |

All write endpoints accept JSON; pass `x-org-id` to scope (defaults to the seeded org).

## Testing & verification

The repo was verified end-to-end in mock mode:

- **Schema** — applied against a throwaway Postgres container (`supabase/migrations/0001_init.sql` + `seed.sql`).
- **API** — typecheck + build + live curl of the full pipeline (brief → generate → batch → compliance → readiness → export → AI action → publish → llms.txt).
- **Web** — typecheck + `next build` (12 routes) + live render against the API.
- **Docker** — `docker compose up` brings up postgres (seeded) + api + web, all healthy.

Reproduce:

```bash
pnpm typecheck
pnpm --filter @helix/api build && HELIX_MODE=mock API_PORT=4010 node apps/api/dist/main.js
pnpm --filter @helix/web build
docker compose up -d --build
```

## Scope & limitations

- **eve agent** is implemented faithfully (instructions, skills, tools, subagents,
  self-hosted Postgres world per [vercel-labs/steve](https://github.com/vercel-labs/steve))
  but requires **Node ≥ 24 + a model key** to run. The mock generator stands in for it
  everywhere else so the platform is fully usable without it.
- **Mock mode** uses an in-memory store (seeded) — no persistence. Switch to Supabase
  for durability.
- **Auth** is bypassed in mock mode; in Supabase mode the API verifies Supabase JWTs.
  The web does not yet ship a login screen (single-org internal tool assumption).
- **Single-org.** Multi-tenancy hooks exist (`org_id` everywhere, `x-org-id` header)
  but the UI assumes one org.

## License

Apache-2.0 (matches eve).
