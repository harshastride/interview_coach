#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# ── Colours ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Interview Coach — Startup ===${NC}"

# ── 1. Check prerequisites ──────────────────────────────
for cmd in node npm docker; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Error: '$cmd' is not installed.${NC}"
    exit 1
  fi
done

# ── 2. Ensure .env exists ───────────────────────────────
if [ ! -f .env ]; then
  echo -e "${YELLOW}No .env file found — copying from .env.example${NC}"
  cp .env.example .env
  echo -e "${YELLOW}Please edit .env and fill in your secrets, then re-run this script.${NC}"
  exit 1
fi

# ── 3. Install dependencies ─────────────────────────────
echo -e "${GREEN}Installing npm dependencies...${NC}"
npm install

# ── 4. Start PostgreSQL via Docker Compose ───────────────
# docker-compose.override.yml exposes port 5432 to the host for local dev
echo -e "${GREEN}Starting PostgreSQL...${NC}"
docker compose up -d postgres
echo "Waiting for PostgreSQL to be healthy..."
until docker compose exec postgres pg_isready -U flashcards -d flashcards &>/dev/null; do
  sleep 1
done
echo -e "${GREEN}PostgreSQL is ready.${NC}"

# ── 5. Export DATABASE_URL for local dev (port 5433 to avoid conflict with local PG) ──
export DATABASE_URL="postgresql://flashcards:flashcards@localhost:5433/flashcards"

# ── 6. Start the dev server ─────────────────────────────
echo -e "${GREEN}Starting dev server at http://localhost:3000 ...${NC}"
npm run dev
