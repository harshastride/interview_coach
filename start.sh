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
for cmd in node npm; do
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

# ── 4. Ensure DATABASE_URL is configured ────────────────
if ! grep -Eq '^DATABASE_URL=' .env; then
  echo -e "${RED}Error: DATABASE_URL is missing in .env.${NC}"
  exit 1
fi

if grep -Eq '^\s*DATABASE_URL=.*\[YOUR-PASSWORD\]' .env; then
  echo -e "${RED}Error: Replace [YOUR-PASSWORD] in DATABASE_URL before starting the app.${NC}"
  exit 1
fi

# ── 5. Start Ollama if AI_PROVIDER=local ────────────────
if grep -Eq '^AI_PROVIDER=local' .env 2>/dev/null; then
  if command -v ollama &>/dev/null; then
    if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
      echo -e "${GREEN}Starting Ollama...${NC}"
      ollama serve &>/dev/null &
      sleep 2
    fi
    echo -e "${GREEN}Ollama is running ($(ollama list 2>/dev/null | tail -1 | awk '{print $1}'))${NC}"
  else
    echo -e "${YELLOW}Warning: AI_PROVIDER=local but Ollama is not installed. Install from https://ollama.com${NC}"
  fi
fi

# ── 6. Start the dev server ─────────────────────────────
echo -e "${GREEN}Starting dev server at http://localhost:3000 ...${NC}"
npm run dev
