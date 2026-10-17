#!/usr/bin/env bash
# ==============================================================================
# CARDSCAN - AUTOMATED GIFT CARD SCANNING PLATFORM
# One-Click Production Deployment Script for VPS (Linux / macOS)
# ==============================================================================

set -euo pipefail

# Text formatting
BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
NC="\033[0m" # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo -e "${CYAN}${BOLD}"
    cat << "EOF"
  ____              _ ____                  
 / ___|__ _ _ __ __| / ___|  ___ __ _ _ __  
| |   / _` | '__/ _` \___ \ / __/ _` | '_ \ 
| |__| (_| | | | (_| |___) | (_| (_| | | | |
 \____\__,_|_|  \__,_|____/ \___\__,_|_| |_|
 Automated Gift Card Scanning Platform
 Turnkey VPS One-Click Deployment
EOF
    echo -e "${NC}"
}

# Determine sudo requirement
SUDO=""
if [ "$EUID" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        log_warn "Running as non-root and sudo is not installed. Some operations might require elevated privileges."
    fi
fi

# Detect Docker Compose command (docker compose plugin vs docker-compose v1)
get_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

install_docker_if_needed() {
    if ! command -v docker >/dev/null 2>&1; then
        log_info "Docker is not installed. Installing Docker..."
        curl -fsSL https://get.docker.com | $SUDO sh
        if [ -n "$SUDO" ]; then
            $SUDO usermod -aG docker "$USER" || true
        fi
        $SUDO systemctl enable --now docker || true
        log_success "Docker installed successfully."
    else
        log_info "Docker is already installed ($(docker --version))."
    fi

    COMPOSE_CMD=$(get_compose_cmd)
    if [ -z "$COMPOSE_CMD" ]; then
        log_info "Installing Docker Compose plugin..."
        if [ -f /etc/debian_version ]; then
            $SUDO apt-get update && $SUDO apt-get install -y docker-compose-plugin
        elif [ -f /etc/redhat-release ]; then
            $SUDO yum install -y docker-compose-plugin
        fi
        COMPOSE_CMD=$(get_compose_cmd)
    fi

    if [ -z "$COMPOSE_CMD" ]; then
        log_error "Could not locate or install Docker Compose. Please install Docker Compose and re-run."
        exit 1
    fi
}

setup_environment() {
    log_info "Checking environment configuration (.env)..."
    
    if [ -f .env ]; then
        log_info "Existing .env file detected. Keeping current configuration."
        # Source existing variables
        set -a
        source .env
        set +a
    else
        log_info "No .env found. Generating secure production configuration..."

        # Detect Public IP
        DETECTED_IP=$(curl -s --connect-timeout 3 ifconfig.me || echo "localhost")

        # Interactive prompts (or defaults if running non-interactively)
        if [ -t 0 ]; then
            echo -e "\n${BOLD}--- Production Configuration Prompts ---${NC}"
            read -r -p "Enter your Domain Name or VPS IP [Default: ${DETECTED_IP}]: " INPUT_DOMAIN
            DOMAIN="${INPUT_DOMAIN:-$DETECTED_IP}"

            read -r -p "Enter Admin Email [Default: admin@cardscan.local]: " INPUT_EMAIL
            ADMIN_EMAIL="${INPUT_EMAIL:-admin@cardscan.local}"

            DEFAULT_PASS=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9!@#%')
            read -r -p "Enter Admin Password [Default: generated secure password]: " INPUT_PASS
            ADMIN_PASSWORD="${INPUT_PASS:-$DEFAULT_PASS}"
        else
            DOMAIN="${DETECTED_IP}"
            ADMIN_EMAIL="admin@cardscan.local"
            ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9!@#%')
        fi

        # Generate cryptographic secrets
        SECRET_KEY=$(openssl rand -hex 32)
        PIN_HMAC_SECRET=$(openssl rand -hex 32)
        POSTGRES_PASSWORD=$(openssl rand -hex 16)

        # Check if domain is using SSL
        COOKIE_SECURE="false"
        if [[ "$DOMAIN" != "localhost" && "$DOMAIN" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            COOKIE_SECURE="true"
        fi

        cat > .env << EOF
# ==============================================================================
# CARDSCAN PRODUCTION ENVIRONMENT CONFIGURATION
# Generated automatically on $(date)
# ==============================================================================

ENVIRONMENT=production
DEBUG=false
DOMAIN=${DOMAIN}
ACME_EMAIL=${ADMIN_EMAIL}

# Application & Security Secrets
SECRET_KEY=${SECRET_KEY}
PIN_HMAC_SECRET=${PIN_HMAC_SECRET}

# Database
POSTGRES_DB=cardscan
POSTGRES_USER=cardscan
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Storage
STORAGE_BACKEND=local
LOCAL_STORAGE_DIR=/app/uploads

# Session & Security
COOKIE_SECURE=${COOKIE_SECURE}
COOKIE_SAMESITE=lax
SESSION_EXPIRY_MINUTES=30
ADMIN_SESSION_EXPIRY_HOURS=12

# HTTP Ports (Leave as 80/443 unless ports are already bound)
HTTP_PORT=80
HTTPS_PORT=443

# Initial Admin bootstrap variables for setup script
INITIAL_ADMIN_EMAIL=${ADMIN_EMAIL}
INITIAL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

        log_success ".env file created with cryptographically secure random secrets."
    fi
}

deploy_containers() {
    COMPOSE_CMD=$(get_compose_cmd)
    log_info "Building and starting CardScan containers via ${COMPOSE_CMD}..."
    $COMPOSE_CMD up -d --build

    log_info "Waiting for database and backend services to initialize..."
    local attempts=0
    local max_attempts=30
    local ready=false

    while [ $attempts -lt $max_attempts ]; do
        if $COMPOSE_CMD exec -T backend curl -s http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
            ready=true
            break
        fi
        sleep 2
        attempts=$((attempts + 1))
        echo -n "."
    done
    echo ""

    if [ "$ready" = false ]; then
        log_warn "Backend did not respond immediately. Fetching container logs:"
        $COMPOSE_CMD logs --tail 30 backend
    else
        log_success "All CardScan services are healthy and running!"
    fi
}

bootstrap_admin() {
    COMPOSE_CMD=$(get_compose_cmd)
    
    # Check if admin email and password are provided in .env
    set -a
    source .env
    set +a

    EMAIL="${INITIAL_ADMIN_EMAIL:-admin@cardscan.local}"
    PASSWORD="${INITIAL_ADMIN_PASSWORD:-AdminSecure2026!}"

    log_info "Configuring initial Administrator account (${EMAIL})..."
    $COMPOSE_CMD exec -T backend python -m app.cli create-admin \
        --email "$EMAIL" \
        --password "$PASSWORD" \
        --role admin || true
}

show_completion_summary() {
    set -a
    source .env
    set +a

    local PROTOCOL="http"
    if [ "${COOKIE_SECURE:-false}" = "true" ]; then
        PROTOCOL="https"
    fi

    local BASE_URL="${PROTOCOL}://${DOMAIN:-localhost}"
    if [ "${HTTP_PORT:-80}" != "80" ] && [ "$PROTOCOL" = "http" ]; then
        BASE_URL="${BASE_URL}:${HTTP_PORT}"
    fi

    echo -e "\n${GREEN}${BOLD}==============================================================================${NC}"
    echo -e "${GREEN}${BOLD}               CARDSCAN DEPLOYMENT COMPLETED SUCCESSFULLY!                    ${NC}"
    echo -e "${GREEN}${BOLD}==============================================================================${NC}\n"

    echo -e "${BOLD}Application Endpoints:${NC}"
    echo -e "  Customer Scanning Portal: ${CYAN}${BASE_URL}/${NC}"
    echo -e "  Staff & Admin Portal:     ${CYAN}${BASE_URL}/admin${NC}"
    echo -e "  API Health Check:         ${CYAN}${BASE_URL}/api/v1/health${NC}\n"

    echo -e "${BOLD}Administrator Login Credentials:${NC}"
    echo -e "  Email:    ${YELLOW}${INITIAL_ADMIN_EMAIL:-admin@cardscan.local}${NC}"
    echo -e "  Password: ${YELLOW}${INITIAL_ADMIN_PASSWORD:-<configured-in-.env>}${NC}\n"

    echo -e "${BOLD}Role-Based Access Control (RBAC):${NC}"
    echo -e "  - ${BOLD}Admin${NC}: Full permissions, create Employees, generate PINs, delete card records."
    echo -e "  - ${BOLD}Employee${NC}: Can generate customer PINs and inspect received cards, but ${RED}CANNOT${NC} delete cards."
    echo -e "  - Manage employees in: ${CYAN}${BASE_URL}/admin${NC} -> ${BOLD}Users & Roles${NC} tab.\n"

    echo -e "${BOLD}Useful Management Commands:${NC}"
    echo -e "  View status:     ${CYAN}${COMPOSE_CMD} ps${NC}"
    echo -e "  View live logs:  ${CYAN}${COMPOSE_CMD} logs -f${NC}"
    echo -e "  Restart stack:   ${CYAN}${COMPOSE_CMD} restart${NC}"
    echo -e "  Stop stack:      ${CYAN}${COMPOSE_CMD} down${NC}"
    echo -e "  Generate PIN CLI:${CYAN}${COMPOSE_CMD} exec backend python -m app.cli create-pin --length 4 --scans 1${NC}\n"
    echo -e "${GREEN}${BOLD}==============================================================================${NC}\n"
}

main() {
    print_banner
    install_docker_if_needed
    setup_environment
    deploy_containers
    bootstrap_admin
    show_completion_summary
}

main "$@"
