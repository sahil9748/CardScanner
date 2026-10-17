#!/usr/bin/env bash
# ==============================================================================
# CARDSCAN - AUTOMATED UPDATE SCRIPT FOR VPS
# Pulls latest code, rebuilds containers, runs migrations, & cleans dangling images
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
NC="\033[0m"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

get_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

echo -e "\n${CYAN}${BOLD}=== CardScan: Pulling Latest Updates & Rebuilding ===${NC}\n"

# 1. Verify Git and Pull Latest Commits
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_error "Not inside a git repository."
    exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
log_info "Fetching latest commits from remote for branch '${BRANCH}'..."
git fetch origin "$BRANCH"

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
    log_info "Code is already up to date with origin/$BRANCH ($LOCAL_HASH)."
    read -r -p "Do you still want to force rebuild & restart containers? (y/N): " FORCE_REBUILD
    if [[ ! "$FORCE_REBUILD" =~ ^[Yy]$ ]]; then
        log_success "Deployment is already on latest code. Exiting."
        exit 0
    fi
else
    log_info "New commits found. Pulling changes..."
    git pull origin "$BRANCH"
    log_success "Git repository updated to $(git rev-parse --short HEAD)."
fi

# 2. Check Docker Compose
COMPOSE_CMD=$(get_compose_cmd)
if [ -z "$COMPOSE_CMD" ]; then
    log_error "Docker Compose not found. Please ensure Docker is running."
    exit 1
fi

# 3. Build & Restart Updated Containers
log_info "Rebuilding and restarting updated containers..."
$COMPOSE_CMD up -d --build

# 4. Verify Migrations
log_info "Ensuring database migrations are up to date..."
sleep 3
$COMPOSE_CMD exec -T backend alembic upgrade head || true

# 5. Clean up dangling images to free up VPS disk space
log_info "Cleaning up old dangling images to reclaim VPS disk space..."
docker image prune -f || true

# 6. Check Health
log_info "Verifying service health..."
attempts=0
ready=false
while [ $attempts -lt 15 ]; do
    if $COMPOSE_CMD exec -T backend curl -s http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 2
    attempts=$((attempts + 1))
done

if [ "$ready" = true ]; then
    echo -e "\n${GREEN}${BOLD}==============================================================================${NC}"
    echo -e "${GREEN}${BOLD}             CARDSCAN HAS BEEN UPDATED SUCCESSFULLY!                          ${NC}"
    echo -e "${GREEN}${BOLD}==============================================================================${NC}"
    echo -e "Current commit: ${CYAN}$(git log -1 --oneline)${NC}"
    echo -e "Services status: run ${CYAN}${COMPOSE_CMD} ps${NC} to view container status."
    echo -e "Logs:           run ${CYAN}${COMPOSE_CMD} logs -f${NC} to view live logs.\n"
else
    log_warn "Update finished, but backend health check took longer than expected."
    echo -e "Check logs with: ${CYAN}${COMPOSE_CMD} logs --tail 50 backend${NC}"
fi
