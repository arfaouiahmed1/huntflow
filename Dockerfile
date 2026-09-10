# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall (npm ci) runs scripts/copy-pdf-worker.mjs, so the script must
# exist before install. Only this file is copied to preserve layer caching.
COPY scripts/copy-pdf-worker.mjs ./scripts/copy-pdf-worker.mjs
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Regenerate the version-pinned pdf.js worker into public/ (gitignored, so
# it is absent from the build context) ahead of the runtime COPY below.
RUN node scripts/copy-pdf-worker.mjs
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    HUNTFLOW_DATA_DIR=/app/data

# The full image intentionally includes a compact TeX Live toolchain so the
# Resume Studio can produce the same PDFs in Docker as it does locally.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      tini \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

# Debian ships the Latin Modern package files separately from the font files.
RUN apt-get update \
    && apt-get install -y --no-install-recommends lmodern \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/src/lib/pdf/templates ./src/lib/pdf/templates

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
