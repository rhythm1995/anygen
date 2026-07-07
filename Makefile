.PHONY: install dev build test typecheck db-local db-reset docker-up docker-down clean

install:
	pnpm install

dev:
	pnpm dev

build:
	pnpm build

typecheck:
	pnpm typecheck

# ── Local Supabase (real persistence) ───────────────────────────────────────
db-local:
	supabase start

db-reset:
	supabase db reset

db-types:
	supabase gen types typescript --local > packages/shared/src/supabase-generated.ts

# ── Docker (zero-config mock demo) ──────────────────────────────────────────
docker-up:
	docker compose up -d --build

docker-up-agent:
	docker compose --profile agent up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

clean:
	pnpm -r exec rm -rf dist .next || true
	rm -rf .postgres-data
