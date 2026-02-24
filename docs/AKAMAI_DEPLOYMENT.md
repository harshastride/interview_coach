# Akamai Deployment Runbook

This guide covers:
- How to run the app locally
- How to push code changes
- How to deploy updates to an Akamai server using Docker Compose
- **Nginx** as reverse proxy and **Certbot** (Let's Encrypt) for HTTPS

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
2. Start containers (app, Postgres, and Nginx; Nginx listens on 80 and 443):
```bash
docker compose up -d --build
```
3. Check containers:
```bash
docker compose ps
```
4. App URL:
- **With Nginx:** `http://localhost` (port 80). HTTPS is used in production after running Certbot (see §4).
- App is only exposed via Nginx; port 3000 is not published to the host.

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
- `APP_URL=https://<your-domain>`
- `DOMAIN=<your-domain>` (e.g. `app.example.com`) — used by Nginx and Certbot
- `LETSENCRYPT_EMAIL=<your-email>` — for Let's Encrypt certificate expiry notices

Important: if you use Google OAuth, update Google Cloud Console:
- Authorized JavaScript origin: `https://<your-domain>`
- Authorized redirect URI: `https://<your-domain>/api/auth/google/callback`

6. Start the stack (Nginx will serve HTTP only until you obtain a certificate):
```bash
docker compose up -d --build
```

7. **Obtain HTTPS certificate (first time only):**  
   Ensure DNS for your domain points to this server and port 80 is open, then run:
```bash
chmod +x scripts/*.sh
./scripts/certbot-init.sh
```
   This gets a Let's Encrypt certificate and restarts Nginx to enable HTTPS.

8. Verify:
```bash
docker compose ps
docker compose logs -f app
docker compose logs nginx
```
   Open `https://<your-domain>` in a browser.

9. **Certificate renewal (optional):** Add a cron job to renew certs, e.g. twice daily:
```bash
0 0,12 * * * cd /path/to/azure-data-engineering-flashcards && ./scripts/certbot-renew.sh >> /var/log/certbot-renew.log 2>&1
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

## 6) When port 80 is already in use (another Nginx / container)

If another service (e.g. host Nginx) is already using ports 80 and 443, use one of these approaches.

### Option A — Run this app’s Nginx on different ports

1. In `.env` set:
   ```bash
   NGINX_HTTP_PORT=8080
   NGINX_HTTPS_PORT=8443
   ```
2. Start the stack: `docker compose up -d --build`. This app’s Nginx will listen on **8080** (HTTP) and **8443** (HTTPS).
3. In your **existing** Nginx (the one on 80/443), add a `server` block for this app’s domain and proxy to this stack:

   ```nginx
   # In your existing nginx config (e.g. /etc/nginx/sites-available/your-site)
   server {
       listen 80;
       server_name your-flashcards-domain.com;

       location /.well-known/acme-challenge/ {
           proxy_pass http://127.0.0.1:8080;
           proxy_set_header Host $host;
       }
       location / {
           return 301 https://$host$request_uri;
       }
   }
   server {
       listen 443 ssl;
       server_name your-flashcards-domain.com;
       # your existing ssl_certificate / ssl_certificate_key for this domain

       location / {
           proxy_pass https://127.0.0.1:8443;
           proxy_ssl_verify off;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   Reload your existing Nginx after editing. Get/renew certificates with Certbot on the **existing** Nginx (recommended). If you use this stack’s Certbot instead, ensure the existing Nginx proxies `/.well-known/acme-challenge/` to `http://127.0.0.1:8080` as in the snippet above.

### Option B — Use only the existing Nginx (no Nginx in this stack)

1. Run the app **without** this project’s Nginx and expose the app on localhost:
   - Copy the example override: `cp docker-compose.override.example-no-nginx.yml docker-compose.override.yml`
   - Start only app and Postgres: `docker compose up -d --build postgres app` (do not start `nginx`).
   - The app will be reachable on `127.0.0.1:3000` for your existing Nginx to proxy to.
2. In your **existing** Nginx, add a `server` (and optional HTTPS `server`) that proxy to the app:

   ```nginx
   server {
       listen 80;
       server_name your-flashcards-domain.com;
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   Add a matching `listen 443 ssl;` server block with your existing SSL config and `proxy_pass http://127.0.0.1:3000;`. Get/renew certificates with Certbot on the existing Nginx as usual.

3. Do **not** run `./scripts/certbot-init.sh` or `certbot-renew.sh` for this app; the existing Nginx handles SSL.

---

## 7) Quick Troubleshooting

1. Port already in use:
```bash
sudo lsof -i :80
sudo lsof -i :443
```
2. App not reachable:
- Open firewall for **TCP 80 and 443** (Nginx). The app is not exposed on 3000 to the host.
- Confirm containers: `docker compose ps` and `docker compose logs nginx`
3. OAuth login fails:
- `APP_URL` must exactly match deployed URL (e.g. `https://your-domain.com`)
- Google OAuth origins/redirects must match exactly
4. DB connection fails:
- Ensure `postgres` service is running
- `docker compose logs postgres`
5. Nginx fails to start (e.g. "no such file" for SSL):
- Run `./scripts/certbot-init.sh` first so certificates and `ssl-dhparams.pem` exist. Until then, Nginx runs in HTTP-only mode (port 80 only).

## 8) Nginx + HTTPS (included)

- **Nginx** runs as a reverse proxy in front of the app (ports 80 and 443).
- **Certbot** is used to obtain and renew Let's Encrypt certificates.
- **First certificate:** run `./scripts/certbot-init.sh` once (requires `DOMAIN` and `LETSENCRYPT_EMAIL` in `.env`).
- **Renewal:** run `./scripts/certbot-renew.sh` via cron (e.g. twice daily).
- App is only reachable via Nginx; port 3000 is not published.
- Optional: add daily DB backups for the Postgres volume.
