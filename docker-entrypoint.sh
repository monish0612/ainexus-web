#!/bin/sh
set -e

# Default to the in-network backend service name (Coolify / docker network).
: "${API_UPSTREAM:=http://ainexus-api:3000}"
export API_UPSTREAM

# Render the nginx config with the runtime upstream, then hand off to nginx.
envsubst '${API_UPSTREAM}' < /etc/nginx/templates/nginx.conf.template \
  > /etc/nginx/conf.d/default.conf

echo "[nexus-web] proxying /api -> ${API_UPSTREAM}"
exec nginx -g 'daemon off;'
