<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bcfc8b63-f27b-4870-99a6-1fabb3724b6c

## Stack

- **Google Gemini API** – Used for TTS and quiz features (configured via `GEMINI_API_KEY`).
- **PostgreSQL** – All data is stored in Postgres:
  - Users, sessions, allowlist, audit log
  - Uploaded terms and interview content
  - **TTS audio cache** (stored in Postgres `tts_cache`)

## Run locally

**Prerequisites:** Node.js, PostgreSQL (or Docker Compose).

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment**
   - Copy [.env.example](.env.example) to `.env` or `.env.local`.
   - Set **`GEMINI_API_KEY`** in [.env](.env) or [.env.local](.env.local) to your Gemini API key.
   - Set **`DATABASE_URL`** if you run local Postgres.
     Example: `postgresql://flashcards:flashcards@localhost:5432/flashcards`

3. **Run the app**
   ```bash
   npm run dev
   ```

## Run with Docker

```bash
docker compose up -d
```

App: http://localhost:3000  
Postgres: host port `5433` -> container `5432`

## Deploy

- Set `GEMINI_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`, and (for OAuth) `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` in your deployment environment.
- Detailed server push/deploy steps: [docs/AKAMAI_DEPLOYMENT.md](docs/AKAMAI_DEPLOYMENT.md)
