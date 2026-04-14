#!/bin/bash
# KhaanRate — One-command deploy from GitHub
# Usage: bash deploy.sh

set -e

echo "🦁 KhaanRate deploying..."

# Install Node.js if missing
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Install PM2 if missing
if ! command -v pm2 &> /dev/null; then
  echo "📦 Installing PM2..."
  sudo npm install -g pm2
fi

# Clone or update
if [ -d "khaanrate" ]; then
  echo "📥 Updating..."
  cd khaanrate && git pull origin master
else
  echo "📥 Cloning..."
  git clone https://github.com/Purevsuren46/khaanrate.git
  cd khaanrate
fi

# Install deps
echo "📦 Installing dependencies..."
npm install

# Check .env
if [ ! -f ".env" ]; then
  echo "⚠️  .env file missing! Copy from .env.example and fill in values."
  cp .env.example .env
  echo "Edit .env then run: pm2 start ecosystem.config.js"
  exit 1
fi

# Start with PM2
echo "🚀 Starting bot..."
pm2 start ecosystem.config.js --update-env 2>/dev/null || pm2 restart khaanrate --update-env 2>/dev/null
pm2 save

# Auto-start on reboot
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "✅ KhaanRate deployed!"
echo "📊 Status: pm2 status"
echo "📋 Logs: pm2 logs khaanrate"
