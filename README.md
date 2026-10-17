# CardScan: Automated Gift Card Scanning Platform

A complete, production-grade automated gift card scanning platform featuring client-side real-time computer vision (OpenCV.js), homography perspective rectification, transactional scan-limit accounting, secure numeric access PINs with server-side keyed HMAC, and an administrative management dashboard.

---

## 1. System Architecture

```
                       ┌───────────────────────────────┐
                       │       Browser Client          │
                       │    (Next.js / TypeScript)     │
                       └──────────────┬────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │ MediaDevices Stream     │ REST API (JSON/Blobs)   │ Real-time Vision
            ▼                         ▼                         ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│ Camera Viewport       │ │ FastAPI Backend       │ │ OpenCV.js Engine      │
│ - Real-time Overlays  │ │ - Rate Limiting & Auth│ │ - Canny Edge & Contour│
│ - Stability Tracking  │ │ - State Machine       │ │ - Quad Polygon Approx │
│ - Quality Assessment  │ │ - Transactional DB    │ │ - Homography Warp     │
└───────────────────────┘ └───────────┬───────────┘ └───────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
              ┌─────────────────────┐   ┌─────────────────────┐
              │ PostgreSQL Database │   │ Private Storage     │
              │ - Users & Roles     │   │ - Local Filesystem  │
              │ - Access PIN HMACs  │   │ - S3 Private Bucket │
              │ - Cards & Images    │   │ - Short-lived URLs  │
              │ - Audit Trail Logs  │   │ - Auto Thumbnails   │
              └─────────────────────┘   └─────────────────────┘
```

---

## 2. Key Features

### Customer-Facing Scanning Interface (`/` & `/scan`)
- **4–5 Digit Numeric Access PIN Entry**:
  - Configurable 4 or 5 digits, preserving leading zeroes (e.g., `0047`).
  - Keypad & physical keyboard support, paste handling, backspace, clear.
  - Constant-time verification against **Server-Side Keyed HMAC-SHA256**.
  - Progressive rate-limiting lockout against brute-force enumeration.
  - Generic error messages preventing PIN existence leakage.
  - HttpOnly SameSite cookie session (`cardscan_session`).
- **Real-Time Computer Vision Scanning Engine**:
  - Efficient downscaled detection canvas for 30fps smooth performance.
  - Preprocessing: Grayscale, Gaussian blur, Canny edge detection, contour hierarchy.
  - Quadrilateral detection: Convexity test, area threshold (>15%), aspect ratio scoring centered on standard gift card ratio (~1.586:1).
  - Corner tracking & temporal stability: requires low Euclidean corner displacement across consecutive frames over a configurable stability duration (500–1000ms).
  - Status indicators: `"Looking for gift card..."` &rarr; `"Card detected"` &rarr; `"Hold still..."` (with real-time percentage progress bar) &rarr; `"Capturing..."`.
  - Automatic capture lock: stops repeated captures until explicit continuation.
  - Image quality assessment: Laplacian sharpness score, glare/exposure analysis, boundary margin completeness check.
  - Perspective transformation: warps 4 ordered corners to extract the straightened card from the high-resolution camera frame without the surrounding desk.
  - Fallback manual capture button.
- **Card Type Workflows**:
  - **Single-Sided (`single`)**: Detect &rarr; Capture front &rarr; Process &rarr; Review/Retake &rarr; Accept & Save &rarr; Completed.
  - **Two-Sided (`double`)**: Detect &rarr; Capture front &rarr; Flip prompt (*"Front captured successfully. Flip your card to scan the back."*) &rarr; Detect &rarr; Capture back &rarr; Review both side-by-side &rarr; Independent retake of front or back &rarr; Accept & Save &rarr; Completed.
  - **Scan Limit Accounting**: Counts completed gift card records (1 completed card = 1 scan allowance, whether single or double-sided). Retakes do not consume extra scans. Missing back image on a two-sided card is rejected transactionally.

### Role-Based Access Control (RBAC) & Staff Portal (`/admin`)
- **Multi-Role User Architecture (`admin` & `employee`)**:
  - **Admin**: Full administrative authority. Can create and manage staff accounts (`admin` and `employee`), generate access PINs, review gift cards, inspect images, update metadata, archive, and **permanently delete** gift cards.
  - **Employee**: Specifically tailored for front-desk operators. Can generate customer access PINs (single & batch) and inspect/review received gift cards. **Employees CANNOT delete gift cards** (the Delete action is hidden/disabled in the UI, and the backend strictly returns `403 Forbidden`).
- **Authentication**: Native bcrypt password hashing, rate-limited login, secure admin session cookie (`cardscan_admin_session`).
- **Live Dashboard**: Real-time stats queried directly from PostgreSQL/SQLite (Total cards, completed scans, incomplete scans, scans today, active access PINs, recent activity feed).
- **Gift Card Management**:
  - Search by reference code, brand, or internal notes.
  - Filters by card type (`single`/`double`) and status (`completed`/`archived`).
  - Detail inspection modal: processed and original images (front & back), metadata inspection (width, height, file size, mime type), editable internal notes, brand, and denomination.
  - Authorized image downloads with `Content-Disposition: attachment`.
  - Card deletion with confirmation (Strictly restricted to `admin`).
- **Access PIN Management**:
  - Accessible to both `admin` and `employee`.
  - Single PIN generation and batch generation (up to 50 PINs at once).
  - Configurable length: 4 or 5 digits (cryptographic RNG preserving leading zeroes).
  - Configurable completed scan limits (e.g. 1, 5, or unlimited).
  - Optional expiration date and label.
  - **Plaintext PIN is revealed ONCE upon creation with one-click copy button**; only keyed HMACs are stored in the database.
  - Immediate revocation action.
- **Audit Logging**: Comprehensive audit trail logging staff logins, user creation, PIN creation, PIN revocation, card completion, image downloads, and card deletions.

---

## 3. Turnkey One-Click VPS Deployment

CardScan includes an automated, production-ready one-click deployment script with **automatic SSL certificate provisioning via Caddy**, PostgreSQL, FastAPI, and Next.js.

### One-Command Deployment on Ubuntu / Debian / CentOS VPS:

```bash
git clone https://github.com/sahil9748/CardScanner.git
cd CardScanner
chmod +x deploy.sh
./deploy.sh
```

### What `deploy.sh` does automatically:
1. **Installs Docker & Docker Compose** if not already present on the VPS.
2. **Generates High-Entropy Production Secrets** (`SECRET_KEY`, `PIN_HMAC_SECRET`, `POSTGRES_PASSWORD`) automatically using `openssl`.
3. **Prompts for your Domain or VPS IP** and your initial Admin email & password.
4. **Builds & Launches the Production Containers**:
   - PostgreSQL 16 (internal network, persistent volume).
   - FastAPI Backend (Uvicorn with reverse-proxy forwarded IP support).
   - Next.js 16 Frontend (optimized standalone multi-stage build).
   - Caddy Reverse Proxy (automated Let's Encrypt / ZeroSSL TLS certificates and 35MB upload limits).
5. **Runs Database Migrations** (`alembic upgrade head`).
6. **Bootstraps the Initial Admin User**.

### Updating Your Deployment When Pushing Changes

Whenever you push new code to GitHub, update your VPS deployment using either of the following methods:

#### Option A: One-Command Update on the VPS (Recommended)
SSH into your VPS and run:
```bash
cd CardScanner
./update.sh
```
What `update.sh` does:
- Pulls the latest commits from GitHub (`git pull origin main`).
- Automatically rebuilds only the updated containers (`docker compose up -d --build`).
- Runs any new database migrations (`alembic upgrade head`).
- Automatically prunes dangling images to reclaim VPS disk space.
- Verifies health check status.

#### Option B: Fully Automated Push-to-Deploy via GitHub Actions
A pre-configured GitHub Actions workflow is included at `.github/workflows/deploy.yml`. To enable zero-touch auto-deployment whenever you run `git push origin main`:
1. In your GitHub repository, go to **Settings > Secrets and variables > Actions**.
2. Add the following repository secrets:
   - `VPS_HOST`: Your VPS IP address or hostname.
   - `VPS_USERNAME`: SSH user (e.g., `root` or `ubuntu`).
   - `VPS_SSH_KEY`: Private SSH key configured on your VPS.
   - `VPS_APP_DIR` *(Optional)*: Path to the CardScanner folder on your VPS (defaults to `~/CardScanner`).
3. Now, every push to `main` will automatically test your code and deploy it to your VPS without logging in!

---

## 4. Local Development Quickstart

### Prerequisites
- Node.js 18+ (tested on Node v22.14.0)
- Python 3.10+
- npm 9+

### Step 1: Clone and Set Up Backend
```bash
# In project root
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Run database migrations
cd backend
PYTHONPATH=. alembic upgrade head
```

### Step 2: Bootstrap First Administrator & Create Test PIN
```bash
# In backend/ directory with .venv active:
python -m app.cli create-admin --email admin@cardscan.io --password "AdminPassword123!"

# Generate a sample 4-digit PIN:
python -m app.cli create-pin --length 4 --label "VIP Customer" --max-scans 5
```

### Step 3: Run Backend Server
```bash
# In backend/ directory:
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation is available at:
- Swagger UI: `http://localhost:8000/api/v1/docs`
- Health check: `http://localhost:8000/api/v1/health`

### Step 4: Run Frontend Server
```bash
# In a new terminal window:
cd frontend
npm install --legacy-peer-deps
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 4. Docker Deployment

Launch PostgreSQL, FastAPI backend, and Next.js frontend with Docker Compose:

```bash
docker compose up -d --build
```

Services started:
- PostgreSQL on `localhost:5432`
- FastAPI Backend on `localhost:8000`
- Next.js Frontend on `localhost:3000`

---

## 5. Automated Test Suites

### Backend Unit & Integration Tests (18 Tests)
```bash
source .venv/bin/activate
cd backend
PYTHONPATH=. pytest -v
```
Test coverage includes:
- 4-digit and 5-digit PIN generation
- Preservation of leading zeroes (e.g. `0047`)
- Rate limiting lockout after repeated failed PIN attempts (HTTP 429)
- Rejection of invalid, expired, revoked, and exhausted PINs
- Single-sided workflow completion
- Two-sided workflow requiring both sides (rejection when missing back image)
- Independent retakes preserving scan allowances
- Customer session isolation (no IDOR vulnerabilities)
- Admin authentication and role-based access control
- Computer vision image validation and thumbnail generation

### Frontend Unit & Component Tests (8 Tests)
```bash
cd frontend
npm test
```
Test coverage includes:
- Euclidean distance and polygon geometry calculations
- Quadrilateral corner ordering (TL, TR, BR, BL)
- Aspect ratio calculations (~1.586:1)
- Convexity and polygon area computation
- Customer PIN keypad interactions and leading zero display

---

## 6. Production Deployment & Security Checklist

### 1. Reverse Proxy & HTTPS
- Place the application behind Nginx, Caddy, Cloudflare, or AWS ALB.
- In production, camera access via `navigator.mediaDevices.getUserMedia` **strictly requires HTTPS** (except on `localhost`).
- Enable `COOKIE_SECURE=true` in production `.env`.

### 2. Secrets Management
- Rotate `SECRET_KEY` and `PIN_HMAC_SECRET` using high-entropy keys:
  ```bash
  openssl rand -hex 32
  ```
- Keep `PIN_HMAC_SECRET` outside the database so an attacker with a database backup cannot reverse 4-5 digit numeric PINs.

### 3. Private Object Storage (S3 / Cloudflare R2 / MinIO)
- Configure `STORAGE_BACKEND=s3` in production.
- Buckets must have **all public access blocked**.
- All image access uses authenticated streaming proxies or short-lived signed URLs.

### 4. Database Backup & Recovery Guidance
- **Daily Automated Backup**:
  ```bash
  pg_dump -U cardscan -h localhost -d cardscan -F c -b -v -f /backups/cardscan_$(date +%Y%m%d_%H%M%S).dump
  ```
- **Recovery Procedure**:
  ```bash
  pg_restore -U cardscan -h localhost -d cardscan -v -c /backups/cardscan_YYYYMMDD_HHMMSS.dump
  ```

---

## 7. Project File Structure

```
CardScanner/
├── backend/
│   ├── alembic/              # Database schema migrations
│   │   ├── versions/
│   │   └── env.py
│   ├── app/
│   │   ├── api/              # REST API v1 endpoints
│   │   │   ├── deps.py       # Session & Admin authorization dependencies
│   │   │   └── v1/
│   │   │       ├── api.py    # Main API router
│   │   │       └── endpoints/
│   │   ├── core/             # Configuration, rate-limiting, and security
│   │   │   ├── config.py
│   │   │   ├── rate_limit.py
│   │   │   └── security.py
│   │   ├── db/               # SQLAlchemy engine and base
│   │   ├── models/           # User, AccessPin, ScanSession, GiftCard, Images, Audit
│   │   ├── schemas/          # Pydantic v2 validation models
│   │   ├── services/         # Business logic, state machines, and audit logging
│   │   ├── storage/          # Local filesystem and S3 private storage providers
│   │   ├── vision/           # Backend image validation and thumbnail generator
│   │   ├── cli.py            # Administrative CLI for bootstrapping admin and PINs
│   │   └── main.py           # FastAPI entry point
│   ├── tests/                # Automated pytest suite
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── page.tsx          # Customer 4-5 digit PIN entry with keypad
│   │   ├── scan/
│   │   │   └── page.tsx      # Real-time OpenCV scanning interface
│   │   ├── admin/
│   │   │   └── page.tsx      # Admin dashboard, card catalog, PINs, audit
│   │   ├── globals.css       # Tailwind stylesheet
│   │   └── layout.tsx
│   ├── hooks/
│   │   └── useCamera.ts      # Camera stream, enumeration, and cleanup hook
│   ├── lib/
│   │   ├── api.ts            # Client API client with credentials
│   │   └── vision/           # OpenCV loader, geometry, quality, and scanning engine
│   ├── tests/                # Vitest unit and component tests
│   ├── package.json
│   ├── vitest.config.ts
│   └── Dockerfile
├── .github/
│   └── workflows/
│       └── deploy.yml        # Automated CI & optional push-to-deploy workflow
├── deploy/
│   ├── caddy/Caddyfile       # Caddy reverse proxy with automatic SSL
│   └── nginx/nginx.conf      # Optional Nginx alternative configuration
├── deploy.sh                 # Turnkey initial one-click VPS deployment script
├── update.sh                 # One-command VPS update script (git pull & rebuild)
├── docker-compose.yml        # PostgreSQL, Backend, Frontend, Caddy orchestration
├── .env.example              # Documented configuration variables
└── README.md
```

---

## 8. Implemented Features & Verification Matrix

| Requirement | Implementation Status | Verification Method |
| :--- | :--- | :--- |
| **Numeric PIN Entry (4-5 digits)** | ✅ Fully Implemented | Keypad UI, `test_pins.py`, `pin_component.test.tsx` |
| **Leading Zero Preservation (e.g. 0047)** | ✅ Fully Implemented | `test_pin_preserves_leading_zeros`, Keypad test |
| **Keyed HMAC-SHA256 for PINs** | ✅ Fully Implemented | `backend/app/core/security.py`, `test_pins.py` |
| **IP-Based Progressive Rate Limiting** | ✅ Fully Implemented | `backend/app/core/rate_limit.py`, `test_rate_limiting_lockout` |
| **Real-time OpenCV.js Card Detection** | ✅ Fully Implemented | `frontend/lib/vision/detector.ts`, Next.js build |
| **Temporal Stability & Corner Tracking** | ✅ Fully Implemented | `CardScanningEngine` 800ms stability timer |
| **Perspective Warp Rectification** | ✅ Fully Implemented | Homography warp on full-res frame in `detector.ts` |
| **Single-Sided Scanning Workflow** | ✅ Fully Implemented | `test_single_sided_card_completion`, UI workflow |
| **Two-Sided Scanning Workflow** | ✅ Fully Implemented | Flip card prompt, `test_double_sided_rejection_when_missing_back` |
| **Independent Front/Back Retakes** | ✅ Fully Implemented | `test_independent_retake_does_not_consume_extra_allowance` |
| **Scan Limit Accounting (1 scan/card)** | ✅ Fully Implemented | Row-level DB lock, atomic increment |
| **Private Object Storage Abstraction** | ✅ Fully Implemented | `LocalStorageProvider`, `S3StorageProvider` |
| **Customer Session Isolation (No IDOR)** | ✅ Fully Implemented | `test_customer_session_isolation` |
| **Admin Dashboard with Live DB Stats** | ✅ Fully Implemented | `/api/v1/admin/dashboard`, `AdminPortal` |
| **Admin PIN Generation (Single & Batch)** | ✅ Fully Implemented | `/api/v1/admin/access-pins`, Plaintext reveal modal |
| **Admin Image Downloads** | ✅ Fully Implemented | `Content-Disposition: attachment` streaming |
| **Role-Based Access Control (Admin/Employee)** | ✅ Fully Implemented | Admin full access, Employee card deletion restricted (HTTP 403), `test_admin_and_security.py` |
| **User & Staff Account Management** | ✅ Fully Implemented | User CRUD in `/admin` portal, password hashing, role enforcement |
| **Turnkey VPS One-Click Deployment** | ✅ Fully Implemented | `deploy.sh`, Caddy auto-SSL reverse proxy, Docker Compose |
| **Docker Compose Orchestration** | ✅ Fully Implemented | `docker-compose.yml`, multi-stage Dockerfiles |
| **Automated Test Coverage** | ✅ Fully Implemented | 19 backend tests (100%), 8 frontend tests (100%) |

---

## 9. License

Proprietary &bull; Built for Enterprise Card Processing.
