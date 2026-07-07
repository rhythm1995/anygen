# syntax=docker/dockerfile:1
FROM node:22-alpine
RUN corepack enable
WORKDIR /app
# Don't inherit the host proxy inside the container (BuildKit injects HTTP_PROXY).
ENV HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" ALL_PROXY="" all_proxy="" NO_PROXY="*"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @helix/shared build && pnpm --filter @helix/web build

ENV NODE_ENV=production
ENV WEB_PORT=3000
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["npm", "run", "start"]
