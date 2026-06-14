# Dev-mode Dockerfile.
# Uses Next.js dev server with hot-reload (volume-mounted source in compose).
# For production we'd want a multi-stage build with `next build` + `next start`,
# but dev mode keeps hot reload during development.

FROM node:22-alpine

WORKDIR /app

# NEXT_PUBLIC_* are bundled into the client at build time when running
# `next build`. We accept it as an ARG so production builds can bake in
# the real API URL (e.g. https://api.bitcoincoding.dev). In dev mode
# (next dev), Next.js reads it from runtime env instead.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Install dependencies first for cache efficiency.
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the source (overlaid by volume mount in compose anyway).
COPY . .

EXPOSE 3000

# Bind to 0.0.0.0 so it's reachable from the host (not just the container).
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]
