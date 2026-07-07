# syntax=docker/dockerfile:1
FROM node:22-alpine
RUN corepack enable
WORKDIR /app
# Don't inherit the host proxy inside the container (BuildKit injects HTTP_PROXY).
ENV HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" ALL_PROXY="" all_proxy="" NO_PROXY="*"

# --- manifest-first install for cache ---
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- source + build ---
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @helix/shared build && pnpm --filter @helix/api build

ENV NODE_ENV=production
ENV API_PORT=4000
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
