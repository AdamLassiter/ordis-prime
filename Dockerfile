FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ingestion/package.json packages/ingestion/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 ORDIS_DATA_DIR=/data ORDIS_MIGRATIONS_DIR=/app/migrations
RUN useradd --system --uid 10001 ordis && mkdir -p /data && chown ordis:ordis /data
COPY --from=build --chown=ordis:ordis /app/apps/web/.next/standalone ./
COPY --from=build --chown=ordis:ordis /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=ordis:ordis /app/apps/web/public ./apps/web/public
COPY --from=build --chown=ordis:ordis /app/packages/db/migrations ./migrations
USER ordis
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
