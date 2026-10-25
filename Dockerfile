FROM debian:bookworm-slim AS updater-build
WORKDIR /src
RUN apt-get update \
  && apt-get install --yes --no-install-recommends g++-mingw-w64-x86-64-posix \
  && rm -rf /var/lib/apt/lists/*
COPY tools/ordis-prime-updater ./tools/ordis-prime-updater
RUN mkdir -p /dist \
  && x86_64-w64-mingw32-g++-posix -std=c++20 -O2 -static -static-libgcc -static-libstdc++ \
    -DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -DNOMINMAX \
    tools/ordis-prime-updater/src/main.cpp \
    tools/ordis-prime-updater/src/pairing.cpp \
    tools/ordis-prime-updater/src/scheduler.cpp \
    -lwinhttp -ladvapi32 -lbcrypt -lshell32 \
    -o /dist/ordis-prime-updater-windows-x64.exe \
  && sha256sum /dist/ordis-prime-updater-windows-x64.exe \
    | sed 's|  /dist/|  |' \
    > /dist/ordis-prime-updater-windows-x64.exe.sha256

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
# Next evaluates server modules while collecting routes. This value exists only
# in the build stage; Compose must still provide the runtime authentication key.
RUN ORDIS_AUTH_SECRET=ordis-prime-build-placeholder-not-for-runtime pnpm build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 ORDIS_DATA_DIR=/data ORDIS_MIGRATIONS_DIR=/app/migrations
RUN useradd --system --uid 10001 ordis && mkdir -p /data && chown ordis:ordis /data
COPY --from=build --chown=ordis:ordis /app/apps/web/.next/standalone ./
COPY --from=build --chown=ordis:ordis /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=ordis:ordis /app/apps/web/public ./apps/web/public
COPY --from=updater-build --chown=ordis:ordis /dist/ordis-prime-updater-windows-x64.exe ./apps/web/public/downloads/ordis-prime-updater-windows-x64.exe
COPY --from=updater-build --chown=ordis:ordis /dist/ordis-prime-updater-windows-x64.exe.sha256 ./apps/web/public/downloads/ordis-prime-updater-windows-x64.exe.sha256
COPY --from=updater-build --chown=ordis:ordis /src/tools/ordis-prime-updater/THIRD_PARTY_NOTICES.md ./apps/web/public/downloads/THIRD_PARTY_NOTICES.md
COPY --from=updater-build --chown=ordis:ordis /src/tools/ordis-prime-updater/licenses/warframe-api-helper-LICENSE ./apps/web/public/downloads/warframe-api-helper-LICENSE
COPY --from=build --chown=ordis:ordis /app/packages/db/migrations ./migrations
USER ordis
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM node:24-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production ORDIS_DATA_DIR=/data
RUN useradd --system --uid 10001 ordis && mkdir -p /data && chown ordis:ordis /data
COPY --from=build --chown=ordis:ordis /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build --chown=ordis:ordis /app/node_modules ./node_modules
COPY --from=build --chown=ordis:ordis /app/packages ./packages
USER ordis
VOLUME ["/data"]
CMD ["./packages/ingestion/node_modules/.bin/tsx", "packages/ingestion/src/worker-cli.ts"]
