# ── Stage 1: build the Vite app ───────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve with nginx ─────────────────────────────────────────────────
FROM nginx:alpine

# envsubst (for runtime API_UPSTREAM) ships in gettext.
RUN apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-nexus.sh
RUN chmod +x /docker-entrypoint-nexus.sh

EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint-nexus.sh"]
