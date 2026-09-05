# Multi-stage build for the realtime WebSocket server.
# Build from the MONOREPO ROOT: docker build -f apps/server/Dockerfile .
FROM node:20-slim AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
WORKDIR /repo
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @handsign/shared build || true
RUN pnpm --filter @handsign/server build

FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/server ./apps/server
WORKDIR /repo/apps/server
EXPOSE 8080
CMD ["node", "dist/index.js"]
