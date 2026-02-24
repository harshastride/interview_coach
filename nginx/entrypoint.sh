#!/bin/sh
set -e
export DOMAIN="${DOMAIN:-localhost}"

# Use full config (HTTP + HTTPS) if certs exist; otherwise HTTP-only (for first run / certbot)
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
if [ -f "$CERT_PATH" ]; then
  envsubst '${DOMAIN}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
else
  cp /etc/nginx/conf.d/default-http-only.conf.template /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
