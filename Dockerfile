# ── Stage 1: build the Vite app ───────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
# `npm install` (not `npm ci`): the build image's npm (10.x on node:20-alpine)
# differs from the npm that generated the lockfile (11.x), and npm ci is strict
# about the cross-platform optional @esbuild/* entries — it would fail on that
# drift. `npm install` resolves directly from package.json and is tolerant.
# --include=dev forces devDependencies (Vite/TS/Tailwind) even if Coolify
# injects NODE_ENV=production at build time.
RUN npm install --include=dev --no-audit --no-fund

COPY . .
RUN npm run build

# ── Stage 2: serve with nginx ─────────────────────────────────────────────────
FROM nginx:alpine

# envsubst (for runtime API_UPSTREAM) ships in gettext.
RUN apk add --no-cache gettext

# Served under /nexusai/, so the files live in a matching subdirectory
# (URL /nexusai/assets/x.js -> /usr/share/nginx/html/nexusai/assets/x.js).
COPY --from=build /app/dist /usr/share/nginx/html/nexusai
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-nexus.sh
RUN chmod +x /docker-entrypoint-nexus.sh

EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint-nexus.sh"]
