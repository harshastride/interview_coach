#!/usr/bin/env bash
# Obtain the first Let's Encrypt certificate (run once per domain).
# Requires: DOMAIN and LETSENCRYPT_EMAIL in .env. Nginx must be running (HTTP on 80).
set -e

cd "$(dirname "$0")/.."
source .env 2>/dev/null || true

DOMAIN="${DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

if [[ -z "$DOMAIN" || -z "$LETSENCRYPT_EMAIL" ]]; then
  echo "Set DOMAIN and LETSENCRYPT_EMAIL in .env (e.g. DOMAIN=app.example.com, LETSENCRYPT_EMAIL=you@example.com)"
  exit 1
fi

echo "Obtaining certificate for $DOMAIN (email: $LETSENCRYPT_EMAIL)"
echo "Ensure DNS for $DOMAIN points to this server and the app is reachable on port 80."

# Use compose certbot service (same volumes as nginx) with webroot
docker compose run --rm --profile certbot certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --non-interactive \
  --agree-tos \
  --email "$LETSENCRYPT_EMAIL" \
  -d "$DOMAIN"

# Generate ssl-dhparams.pem (nginx uses this for DH ciphers)
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$(pwd)")}"
docker run --rm -v "${PROJECT_NAME}_letsencrypt:/etc/letsencrypt" alpine/openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048

echo "Certificate obtained. Restarting nginx to enable HTTPS..."
docker compose restart nginx
