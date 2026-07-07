# syntax=docker/dockerfile:1
# eve requires Node >= 24.
FROM node:24-alpine
RUN corepack enable
WORKDIR /app
ENV HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" ALL_PROXY="" all_proxy="" NO_PROXY="*"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/agent/package.json apps/agent/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/shared ./packages/shared
COPY apps/agent ./apps/agent

WORKDIR /app/apps/agent
ENV AGENT_PORT=3040
EXPOSE 3040
# `eve start` runs the built agent host with the self-hosted Postgres world.
CMD ["pnpm", "start"]
