#!/usr/bin/env bash
# Khmer Vox TTS — Oracle Cloud Free Tier VM setup script
# Clones from GitHub, installs deps, builds, and starts via PM2 + Nginx.
#
# Run as root (or with sudo) on a fresh Ubuntu 24.04 ARM instance.
# Usage: sudo bash deploy/vm-setup.sh

set -euo pipefail

REPO_URL="https://github.com/RosielReaksa/khmer-vox-tts"
APP_USER="voxtts"
APP_DIR="/home/${APP_USER}/khmer-vox-vm"
DB_NAME="voxtts"

log() { echo ""; echo "=== $* ==="; }

log "[1/9] System dependencies"
export DEBIAN_FRONTEND=noninteractive
sudo apt update -y
sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx ffmpeg unzip ufw

log "[2/9] Node.js 22 (NodeSource ARM)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi
echo "Node: $(node -v)  NPM: $(npm -v)"

log "[3/9] PostgreSQL 16"
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql

log "[4/9] PostgreSQL database"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres createdb "${DB_NAME}"
echo "Database '${DB_NAME}' ready."

log "[5/9] App user + clone repo"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  sudo useradd -m -s /bin/bash "${APP_USER}"
fi
if [ ! -d "${APP_DIR}/.git" ]; then
  sudo -u "${APP_USER}" git clone "${REPO_URL}" "${APP_DIR}"
  echo "Cloned ${REPO_URL}"
else
  echo "Repo already present at ${APP_DIR}"
fi

if [ ! -f "${APP_DIR}/.env" ]; then
  echo ""
  echo ">>> .env not found at ${APP_DIR}/.env"
  echo ">>> Copy your production .env there now, then re-run this script."
  echo ">>>   scp deploy/vm-production.env ${APP_USER}@<VM-IP>:~/khmer-vox-vm/.env  (then edit CHANGEME values)"
  exit 1
fi

log "[6/9] Database schema"
cd "${APP_DIR}"
sudo -u "${APP_USER}" node scripts/db.mjs setup
sudo -u "${APP_USER}" node scripts/db.mjs check

log "[7/9] Build"
sudo -u "${APP_USER}" npm ci
sudo -u "${APP_USER}" npm run build

log "[8/9] PM2 process manager"
sudo npm install -g pm2
cd "${APP_DIR}"
sudo -u "${APP_USER}" pm2 delete all >/dev/null 2>&1 || true
sudo -u "${APP_USER}" pm2 start deploy/pm2.ecosystem.config.cjs
sudo -u "${APP_USER}" pm2 save
# Print the startup command to enable auto-restart on boot
sudo env PATH="$PATH" pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" 2>/dev/null || true

log "[9/9] Nginx reverse proxy"
sudo tee /etc/nginx/sites-available/voxtts >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
        proxy_send_timeout 300;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/voxtts /etc/nginx/sites-enabled/voxtts
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

log "Firewall"
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status verbose

echo ""
echo "============================================"
echo "  Base deploy complete."
echo "============================================"
echo ""
echo "PM2 status:"
sudo -u "${APP_USER}" pm2 status
echo ""
echo "Health check (local):"
curl -s http://127.0.0.1:3000/api/health || echo "  (app may still be starting)"
echo ""
echo "NEXT STEPS:"
echo "  1. Point voxtts.online DNS A record to this VM's public IP."
echo "  2. Once DNS resolves, obtain SSL:"
echo "       sudo certbot --nginx -d voxtts.online -d www.voxtts.online"
echo "  3. Run the printed 'pm2 startup' sudo command (if any) to enable boot auto-restart."
echo "  4. Open https://voxtts.online and sign in."
echo ""
