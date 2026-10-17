#!/usr/bin/env bash
# ==============================================================================
# CARDSCAN - CLEAN RESET & REDEPLOY SCRIPT FOR VPS
# Wipes existing containers, volumes, and .env, then runs fresh deployment
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
NC="\033[0m"

echo -e "\n${RED}${BOLD}==============================================================================${NC}"
echo -e "${RED}${BOLD}            CARDSCAN: FULL SYSTEM RESET & CLEAN REDEPLOY                      ${NC}"
echo -e "${RED}${BOLD}==============================================================================${NC}\n"

echo -e "${YELLOW}${BOLD}WARNING:${NC} This will completely delete:"
echo -e "  - All running CardScan containers"
echo -e "  - Database volumes and uploaded files"
echo -e "  - Existing .env configuration and secrets\n"

if [ -t 0 ]; then
    read -r -p "Are you sure you want to proceed with full reset? (y/N): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}[INFO]${NC} Reset cancelled."
        exit 0
    fi
fi

# Detect compose command
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    echo -e "${RED}[ERROR]${NC} Docker Compose not found."
    exit 1
fi

echo -e "\n${BLUE}[1/4]${NC} Stopping and removing all containers, networks, and persistent volumes..."
$COMPOSE down -v --remove-orphans || true

echo -e "${BLUE}[2/4]${NC} Removing previous .env configuration..."
rm -f .env

echo -e "${BLUE}[3/4]${NC} Fetching and resetting to latest code on GitHub main branch..."
git fetch origin main
git reset --hard origin/main
chmod +x deploy.sh update.sh reset.sh

echo -e "${BLUE}[4/4]${NC} Launching fresh one-click deployment..."
./deploy.sh
