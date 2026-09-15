<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

**AI agents:** Read [AGENTS.md](AGENTS.md) before working on this project for the application overview, code map, development commands, and maintenance instructions.

View your app in AI Studio: https://ai.studio/apps/bcfc8b63-f27b-4870-99a6-1fabb3724b6c

## Stack

- **Google Gemini API** – Used for TTS and quiz features (configured via `GEMINI_API_KEY`).
- **Supabase Postgres** – All data is stored in Postgres:
  - Users, sessions, allowlist, audit log
  - Uploaded terms and interview content
  - **TTS audio cache** (stored in Postgres `tts_cache`)

## Run locally

**Prerequisites:** Node.js and a Supabase Postgres database.

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment**
   - Copy [.env.example](.env.example) to `.env` or `.env.local`.
   - Set **`GEMINI_API_KEY`** in [.env](.env) or [.env.local](.env.local) to your Gemini API key.
   - Set **`DATABASE_URL`** to your Supabase connection string.
     Example: `postgresql://postgres:[YOUR-PASSWORD]@db.ykaudwlislohrwoephga.supabase.co:5432/postgres`

3. **Run the app**
   ```bash
   ./start.sh
   ```

## Run with Docker

```bash
docker compose up -d
```

App: http://localhost:8000

## Deploy

- Set `GEMINI_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`, and (for OAuth) `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` in your deployment environment.
- `DATABASE_URL` should point to Supabase Postgres, not a local Docker database.

## Optional Azure reading assessment

See [Azure setup and scoring](docs/azure-reading.md) for Indian English pronunciation checkpoints, local practice feedback, and the monthly allowance. Leave the provider flag unset until credentials and the local analysis service are configured.

## Domains and staff workspace

Admins and editors can open [Staff workspace](http://localhost:3000/staff/overview) to review requests, coach candidates and classify content. Follow [domain rollout instructions](docs/domain-access.md) before enabling restrictions.
