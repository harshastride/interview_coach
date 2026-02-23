# Akamai Deployment Runbook

This guide covers:
- How to run the app locally
- How to push code changes
- How to deploy updates to an Akamai server using Docker Compose

## 1) Local Run (Development)

### Prerequisites
- Node.js 22+
- npm
- Docker (optional, if you want local Postgres in container)

### Steps
1. Install dependencies:
```bash
npm install
```
2. Create env file:
```bash
cp .env.example .env
```
3. Fill required values in `.env`:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `APP_URL` (for local: `http://localhost:3000`)
- `GEMINI_API_KEY`
4. Start app:
```bash
npm run dev
```
5. Open:
- `http://localhost:3000`

## 2) Local Run (Full Docker)

1. Ensure `.env` has real values (especially OAuth + Gemini values).
2. Start containers:
```bash
docker compose up -d --build
```
3. Check containers:
```bash
docker compose ps
```
4. App URL:
- `http://localhost:3000`

## 3) Push Code (Your Laptop)

Run this every time before deploying.

1. Validate build:
```bash
npm run lint
npm run build
```
2. Commit and push (inside your git repo):
```bash
git add .
git commit -m "your change summary"
git push origin main
```

If your default branch is not `main`, replace it with your branch name.

## 4) First-Time Akamai Server Setup

Use an Ubuntu server in Akamai Connected Cloud.

1. SSH into server:
```bash
ssh <user>@<server-ip>
```
2. Install Docker + Compose plugin:
```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
sudo usermod -aG docker $USER
newgrp docker
```
3. Clone your repo:
```bash
git clone <your-repo-url>
cd azure-data-engineering-flashcards
```
4. Create server env file:
```bash
cp .env.example .env
nano .env
```
5. Set production values in `.env`:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `GEMINI_API_KEY`
- `APP_URL=https://<your-domain-or-server-url>`

Important: if you use Google OAuth, update Google Cloud Console:
- Authorized JavaScript origin: `https://<your-domain>`
- Authorized redirect URI: `https://<your-domain>/api/auth/google/callback`

6. Start app:
```bash
docker compose up -d --build
```
7. Verify:
```bash
docker compose ps
docker compose logs -f app
```

## 5) Deploy New Changes to Akamai (Repeatable)

After you push code from laptop:

1. SSH to server:
```bash
ssh <user>@<server-ip>
```
2. Go to project:
```bash
cd ~/azure-data-engineering-flashcards
```
3. Pull latest code:
```bash
git pull origin main
```
4. Rebuild and restart:
```bash
docker compose up -d --build
```
5. Check status/logs:
```bash
docker compose ps
docker compose logs --tail=100 app
```

## 6) Quick Troubleshooting

1. Port already in use:
```bash
sudo lsof -i :3000
```
2. App not reachable:
- Open firewall for TCP 3000 (or put Nginx in front and expose 80/443)
- Confirm container is healthy with `docker compose ps`
3. OAuth login fails:
- `APP_URL` must exactly match deployed URL
- Google OAuth origins/redirects must match exactly
4. DB connection fails:
- Ensure `postgres` service is running
- `docker compose logs postgres`

## 7) Optional Production Hardening

- Put Nginx/Caddy reverse proxy in front of app
- Serve HTTPS (Let's Encrypt)
- Restrict direct port 3000 exposure
- Add daily DB backups for Postgres volume
