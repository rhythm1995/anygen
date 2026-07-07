# @helix/agent (eve)

The Helix content-production agent, built on Vercel's open-source **eve** framework
and run **fully self-hosted** (zero Vercel infrastructure — see
[vercel-labs/steve](https://github.com/vercel-labs/steve)).

## Layout

```
agent/
  agent.ts            # model + self-hosted Postgres Workflow world
  instructions.md     # the always-on system prompt
  lib/model.ts        # provider picker (OpenAI or Anthropic, direct)
  tools/
    query_kb.ts       # search the exchange knowledge base (ground every fact)
    check_compliance.ts
    http_get.ts       # fetch cited reference URLs
  skills/
    brand-tone.md exchange-style.md geo-checklist.md compliance.md crypto-glossary.md
  subagents/
    drafter/          # long-form ops content
    geo-writer/       # structured GEO content
    editor/           # final polish
```

## Run (needs Node >= 24 + a model key)

```bash
pnpm install
cp .env.example .env     # set OPENAI_API_KEY or ANTHROPIC_API_KEY + WORKFLOW_POSTGRES_URL
pnpm dev                 # eve dev --no-ui  →  http://localhost:3040
```

The NestJS API talks to this service over HTTP (`EVE_API_URL`). When it is absent or
no model key is set, the API falls back to the local mock generator, so the platform
runs end-to-end without it.

## Version coupling (important)

Self-hosted durability depends on a matched set (from steve's Gotchas):

| Package | Version |
| --- | --- |
| `eve` | `0.15.0` |
| `@workflow/world-postgres` | `5.0.0-beta.19` |
| `WORKFLOW_QUEUE_NAMESPACE` | must be `eve` |

If you bump `eve`, re-check `world-postgres` compatibility — a mismatch makes runs
fail mid-execution with a `ZodError` (`attr_set` event).
