# Multi-stage production Dockerfile.
# Stage 1 builds the app; stage 2 runs the standalone Next.js server with
# only the files it needs. Final image ~200 MB vs ~600 MB for dev mode,
# and the runtime uses ~150 MB RAM vs ~1 GB for `next dev` with Turbopack.

# === Builder ===========================================================
FROM node:22-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* env vars are baked into the client bundle at `next build`
# time. Set this to the public API URL when deploying — local dev defaults
# to http://localhost:8000.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Install deps separately from source for cache efficiency.
COPY package.json package-lock.json* ./
RUN npm ci

# Build with a heap cap so this works on small VMs (e.g. e2-small w/ 2 GB).
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

# === Runner ============================================================
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# next.config.ts has `output: "standalone"`, so .next/standalone contains
# a minimal server.js + only the node_modules it actually needs. Public
# assets and the static chunks must be copied separately.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
