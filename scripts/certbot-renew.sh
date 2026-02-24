#!/usr/bin/env bash
# Renew Let's Encrypt certificates (run via cron, e.g. twice daily).
set -e

cd "$(dirname "$0")/.."
source .env 2>/dev/null || true

docker compose run --rm --profile certbot certbot renew \
  --webroot \
  --webroot-path=/var/www/certbot \
  --quiet

# Reload nginx to pick up new certs
docker compose exec -T nginx nginx -s reload 2>/dev/null || true
