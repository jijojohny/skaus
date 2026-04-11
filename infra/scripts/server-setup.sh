#!/usr/bin/env bash
# One-time VPS provisioning script.
# Run as root on a fresh Ubuntu 22.04 / Debian 12 server from the repo root.
#
# Usage:
#   export DOMAIN=skaus.me
#   export EMAIL=you@example.com
#   export GITHUB_REPOSITORY_OWNER=your-github-username
#   sudo -E bash infra/scripts/server-setup.sh

set -euo pipefail

DEPLOY_DIR=/opt/skaus

: "${DOMAIN:?Set DOMAIN=yourdomain.com}"
: "${EMAIL:?Set EMAIL=your@email.com}"
: "${GITHUB_REPOSITORY_OWNER:?Set GITHUB_REPOSITORY_OWNER=your-github-username}"

# ── 1. Install Docker ─────────────────────────────────────────────────────────
echo "==> Installing Docker"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg lsb-release gettext-base

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

# ── 2. Create deploy user ─────────────────────────────────────────────────────
echo "==> Creating deploy user"
if ! id -u deploy &>/dev/null; then
  useradd -m -s /bin/bash deploy
  usermod -aG docker deploy
fi
mkdir -p /home/deploy/.ssh
# Copy root's authorized_keys so the CI SSH key also works for 'deploy'
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
  chown -R deploy:deploy /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys
fi

# ── 3. Set up deploy directory ────────────────────────────────────────────────
echo "==> Setting up ${DEPLOY_DIR}"
mkdir -p "${DEPLOY_DIR}/infra/docker"
chown -R deploy:deploy "${DEPLOY_DIR}"

# Copy compose + nginx template from repo (script must be run from repo root)
cp docker-compose.prod.yml                  "${DEPLOY_DIR}/"
cp infra/docker/nginx.prod.conf.template    "${DEPLOY_DIR}/infra/docker/"

# Persist DOMAIN so the CI deploy job can re-generate nginx.conf on each deploy
echo "DOMAIN=${DOMAIN}" >> /etc/environment
export DOMAIN

# ── 4. Generate nginx.conf from template ─────────────────────────────────────
echo "==> Generating nginx.conf for ${DOMAIN}"
envsubst '${DOMAIN}' \
  < "${DEPLOY_DIR}/infra/docker/nginx.prod.conf.template" \
  > "${DEPLOY_DIR}/infra/docker/nginx.conf"

# ── 5. Issue Let's Encrypt certificate ───────────────────────────────────────
echo "==> Obtaining TLS certificate for ${DOMAIN}"

# Create named volumes certbot will use
docker volume create certbot_www
docker volume create certbot_certs

# Temporarily serve ACME challenge on port 80
docker run -d --name certbot_bootstrap \
  -p 80:80 \
  -v certbot_www:/usr/share/nginx/html:ro \
  nginx:1.27-alpine \
  sh -c "mkdir -p /usr/share/nginx/html/.well-known/acme-challenge && nginx -g 'daemon off;'"

sleep 2  # let nginx start

docker run --rm \
  -v certbot_certs:/etc/letsencrypt \
  -v certbot_www:/var/www/certbot \
  certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    -d "${DOMAIN}" \
    --email "${EMAIL}" \
    --agree-tos --non-interactive

docker stop certbot_bootstrap && docker rm certbot_bootstrap

# ── 6. Print next steps ───────────────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me || echo "<server-ip>")

echo ""
echo "══════════════════════════════════════════════════════════════════"
echo " Server setup complete. Follow these steps to finish deployment:"
echo "══════════════════════════════════════════════════════════════════"
echo ""
echo " 1. Create the .env file on the server:"
echo "      cp .env.example ${DEPLOY_DIR}/.env"
echo "      nano ${DEPLOY_DIR}/.env   # fill all [REQUIRED] values"
echo ""
echo " 2. Start all services:"
echo "      cd ${DEPLOY_DIR}"
echo "      docker compose -f docker-compose.prod.yml up -d"
echo ""
echo " 3. Add these secrets to your GitHub repo"
echo "    (Settings → Secrets → Actions):"
echo ""
echo "    DEPLOY_HOST      = ${SERVER_IP}"
echo "    DEPLOY_USER      = deploy"
echo "    DEPLOY_SSH_KEY   = <your private SSH key content>"
echo "    GHCR_TOKEN       = <GitHub PAT with read:packages scope>"
echo "    NEXT_PUBLIC_PRIVY_APP_ID = <from privy.io>"
echo "    RELAYER_PRIVATE_KEY      = <base58 keypair>"
echo ""
echo " 4. Add these variables to your GitHub repo"
echo "    (Settings → Variables → Actions):"
echo ""
echo "    NEXT_PUBLIC_GATEWAY_URL              = (leave empty — nginx proxies)"
echo "    NEXT_PUBLIC_SOLANA_RPC_URL           = https://your-rpc-provider.com"
echo "    NEXT_PUBLIC_CLUSTER                  = mainnet-beta"
echo "    NEXT_PUBLIC_PROGRAM_ID               = ${STEALTH_POOL_PROGRAM_ID:-<program-id>}"
echo "    NEXT_PUBLIC_NAME_REGISTRY_PROGRAM_ID = ${NAME_REGISTRY_PROGRAM_ID:-<program-id>}"
echo "    NEXT_PUBLIC_TOKEN_MINT               = <token mint address>"
echo "    NEXT_PUBLIC_PUBLIC_LINK_BASE         = https://${DOMAIN}"
echo ""
echo " 5. Push to master — CI will build images and auto-deploy."
echo "══════════════════════════════════════════════════════════════════"
