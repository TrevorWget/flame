# syntax=docker/dockerfile:1

# Multi-platform index digest; keep the tag and digest in sync when bumping
ARG NODE_IMAGE=node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85

# The client bundle is platform independent, so build it natively instead of under QEMU
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS client

WORKDIR /client

COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY client/ ./
RUN npm run build


FROM ${NODE_IMAGE} AS deps

# Toolchain for native modules (sqlite3) when no prebuilt binary matches the platform
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force


FROM ${NODE_IMAGE} AS source

WORKDIR /app

COPY . .

# The root .env is excluded from the build context; VERSION is still required (DB backup names)
RUN version="$(sed -n 's/^VITE_APP_VERSION=//p' client/.env | tr -d '\r')" \
    && test -n "$version" \
    && printf 'VERSION=%s\n' "$version" > .env \
    && rm -rf client .docker


FROM ${NODE_IMAGE}

RUN apk add --no-cache tini su-exec

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=source /app ./
COPY --from=client /client/dist ./public
COPY .docker/entrypoint.sh /usr/local/bin/flame-entrypoint

# App code stays root-owned and read-only for the runtime user. public/flame.css is
# rewritten from data/flame.css on every start, so it points into /tmp where any
# --user UID can create it.
RUN chmod 755 /usr/local/bin/flame-entrypoint \
    && mkdir -p data \
    && chown node:node data \
    && ln -sf /tmp/flame.css public/flame.css

ENV NODE_ENV=production \
    PORT=5005

EXPOSE 5005

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1

ENTRYPOINT ["/sbin/tini", "--", "flame-entrypoint"]
CMD ["node", "server.js"]
