# Helix — Architecture & Decisions

## 1. Goals

A content midplatform for a **crypto exchange** that:

1. **Operationalizes AI** — produce announcements, market analysis, trading guides,
   social, educational content at the cadence an exchange needs.
2. **Produces GEO content** — content engineered to be cited by AI answer engines
   (ChatGPT, Perplexity, Claude), because that's where users now ask "is X exchange safe"
   / "how does slippage work".

…without gluing a dozen point solutions together.

## 2. Key decisions (locked during the 5h build)

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | **Three services**: NestJS API, Next.js web, eve agent | Clean separation: API = platform (data, jobs, orchestration), web = workbench, eve = agent runtime. The API talks to eve over HTTP — eve's default, and the most faithful use of the framework. |
| 2 | **One Postgres, two roles** | Supabase's Postgres also backs eve's `@workflow/world-postgres` durability (self-hosted, [vercel-labs/steve](https://github.com/vercel-labs/steve)). No extra datastore. |
| 3 | **Mock fallback everywhere** | No LLM key / no Supabase → the API uses an in-memory store + a type-aware stub generator. The whole pipeline is demonstrable in 60s. Flip env to go real. |
| 4 | **Repository abstraction** | `Repositories` interface with `InMemory` + `Supabase` impls, selected by `HELIX_MODE`. Business logic is storage-agnostic. |
| 5 | **Compliance is pure logic, not LLM** | Banned/required term scanning is deterministic (substring on title+summary+body). The agent self-checks via `check_compliance`; the API re-scores on demand. Crypto content must never ship on a model's "probably fine". |
| 6 | **GEO readiness scoring is heuristic + explicit** | Six gates (direct answer, sourced claims, entity definition, JSON-LD, reading level, compliance) — visible in the UI, not a black-box score. |
| 7 | **Batch fan-out is code, not model loop** | A concurrency-limited `pool()` runs one durable session per brief. Don't burn model tokens on orchestration. |
| 8 | **Brand/compliance → eve skills** | Brand voice, glossary, disclaimers, banned terms live as Markdown skills loaded by relevance — not crammed into every prompt. |

## 3. Data model

See `packages/shared/src/types.ts` and `supabase/migrations/0001_init.sql`.

```
orgs ──< brand_profiles          (1 per org; drives brand-tone skill)
      ──< knowledge_items        (素材库; agent query_kb; optional pgvector)
      ──< compliance_terms       (banned / restricted / required)
      ──< briefs ──< content_items   (a brief produces ≥1 content item)
      ──< content_jobs           (batch; brief_ids[] → results map)
```

Column naming is **snake_case throughout** (including TS interfaces), so Supabase rows
map 1:1 to domain types with no camelCase conversion. (`references` is quoted in DDL —
it's a reserved word — but exposed as `references` over the wire.)

### Content pipeline

```
draft ──▶ reviewing ──▶ approved ──▶ published
  │           │            │
  └──────────▶└──────────▶ rejected / archived
```

`published_at` is stamped on transition to `published`. Only `published` GEO content
appears in `/api/geo/llms.txt` and `/api/geo/feed`.

## 4. The eve agent (`apps/agent`)

Self-hosted (zero Vercel infra) per steve:

- **agent.ts** — direct OpenAI/Anthropic provider (no AI Gateway) +
  `experimental.workflow.world = "@workflow/world-postgres"` for durable sessions.
- **instructions.md** — always-on system prompt: identity, process, non-negotiables
  (no hype, cite sources, GEO structure, output format).
- **skills/** — `brand-tone`, `exchange-style`, `geo-checklist`, `compliance`,
  `crypto-glossary`. Loaded by relevance.
- **tools/** — `query_kb` (ground every fact), `check_compliance` (self-check),
  `http_get` (read cited references).
- **subagents/** — `drafter` (long-form ops), `geo-writer` (structured GEO), `editor`
  (polish). Each is the same agent shape one level down with its own clean context.

**Version coupling (from steve's Gotchas):** `eve@0.15.0` ↔
`@workflow/world-postgres@5.0.0-beta.19`, and `WORKFLOW_QUEUE_NAMESPACE` **must** be
`eve`. A mismatch fails runs mid-execution with a `ZodError` on the `attr_set` event.

### Why eve (and the honest caveat)

eve treats an agent as a directory and bakes in durability, sandboxes, approvals,
channels, tracing and evals — exactly the "shape" a content pipeline has. The
self-hosted path (steve) means it runs on our own Postgres, no Vercel lock-in.

**Caveat:** the agent package is **implemented per docs** but was not runtime-tested in
this build (needs Node ≥ 24 + a model key). The API's `EveClient` is implemented against
the documented session HTTP API and **falls back to the mock generator on any error**, so
the platform is fully functional without eve.

## 5. The mock generator (`apps/api/src/agent/mock-generator.ts`)

Deterministic, type-aware template that stitches a brief + brand + knowledge into a
realistic draft — including GEO structures (FAQ, JSON-LD, entities, citations). This is
what makes the platform demoable with zero keys, and what the API uses whenever eve is
unreachable. It is a 1:1 stand-in: replace it by configuring eve.

## 6. GEO strategy

GEO content is written for **LLM retrieval**, not just humans. The platform enforces:

1. **Direct answer first** (≤50 words) — the snippet an AI cites.
2. **Entity definition** explicit.
3. **Every claim sourced** inline.
4. **FAQPage/Article JSON-LD** generated from the FAQ + body (see
   `content.service.ts → toJsonLd`).
5. **`llms.txt` + JSON-LD feed** (`/api/geo/*`) to publish for AI crawlers.

The readiness score is the gate: nothing geo_* should go `published` under 100.

## 7. Batch orchestration

`BatchRunner` (`apps/api/src/agent/batch.runner.ts`):

- concurrency cap (default 5) via a tiny `pool()`;
- one `AgentService.generate()` per brief → persist draft → auto-run compliance;
- per-item results aggregated onto the `content_jobs` row;
- final status `completed | partial | failed`;
- a crash mid-batch loses only in-flight items (each completed draft is already
  persisted; in eve mode, per-item durable sessions resume).

Designed for **tens of articles per batch** (the agreed scale). Hundreds would warrant a
real queue + dead-letter table on top — the seam is `BatchRunner`.

## 8. Security / auth

- **Mock mode:** open (internal demo).
- **Supabase mode:** `AuthGuard` verifies the Bearer JWT via `supabase.auth.getUser` and
  attaches the user; the service-role key is server-side only.
- **Compliance** is a first-class guardrail, not an afterthought — critical for crypto.
- **Sandbox:** omitted (content generation doesn't execute untrusted code). If an agent
  ever needs to run scripts (data crunching), enable eve's Docker sandbox adapter.

## 9. Tradeoffs & future work

- **Multi-tenancy:** `org_id` + `x-org-id` are wired through; UI is single-org.
- **Auth UI:** no login screen yet (internal-tool assumption).
- **Streaming:** the API→web content flow is request/response; live token streaming to
  the workbench is the obvious next step (eve streams NDJSON; `EveClient` already parses it).
- **Evals:** eve ships evals; wiring `eve eval` into CI as a publish gate is the next
  quality step.
- **Vector search:** `0002_embeddings.sql` + `match_knowledge` exist; `query_kb` falls
  back to FTS when embeddings are absent.
