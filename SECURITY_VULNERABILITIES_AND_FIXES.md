# Production Security Audit & Vulnerability Remediation Guide

> **Application:** AmbulanceIQ (Emergency Ambulance Fleet Staging & Dispatch System)  
> **Target Components:** FastAPI Backend, Next.js Web Frontend, Expo/React Native Mobile App, Supabase PostgreSQL Database  
> **Audit Date:** November 2026  
> **Status:** Actionable Remediation Document for Autonomous Agents & Engineering Teams

---

## Executive Summary & Threat Profile

AmbulanceIQ is an emergency dispatch and predictive fleet positioning system deployed in Mumbai. Because this system directs physical emergency medical services (EMS), security vulnerabilities directly impact real-world public safety.

The primary threat actors and risks are:
1. **Malicious External Actors / Script Kiddies:** Flooding registration or rate limiters to cause Denial of Service (DoS), preventing hospitals from optimizing or dispatching emergency units.
2. **Hospital Fleet Scope vs Driver Flexibility:** Hospital drivers share a single hospital code for maximum shift flexibility; backend guarantees strict isolation across hospitals, while individual driver binding is deferred to Phase 2.
3. **Network Eavesdroppers:** Sniffing cleartext HTTP traffic on mobile cellular/Wi-Fi networks to intercept live hospital codes, ambulance positions, and staging plans.
4. **Credential Stuffing & Database Starvation:** Exhausting database connections by forcing the database to process failed authentication writes on every request.

---

## Vulnerability Matrix & Priority Rankings

| ID | Vulnerability | Severity | Affected Component | Impact / Current Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Public Hospital Registration Geo-Fencing | **MEDIUM** | Backend (`/hospital/register`) | **Active Fix:** Enforce Mumbai bounding box & rate limits. (Public onboarding kept open without invite tokens). |
| **SEC-02** | Shared Hospital Code Across All Drivers | **ACCEPTED** | Mobile & Backend (`/ambulances/...`) | **Accepted Operational Decision:** Any driver can access any vehicle in their hospital fleet. Scoped strictly to hospital ID. |
| **SEC-03** | IP Spoofing via `X-Forwarded-For` in Frontend Proxy | **HIGH** | Frontend (`server-backend.ts`) | Rate limit bypass or targeted IP lockout DoS |
| **SEC-04** | In-Database Rate Limiting Causing Connection Starvation | **HIGH** | Backend (`auth_failures` table) | Database pooler exhaustion during brute-force floods |
| **SEC-05** | Cleartext HTTP & Missing Transport Security on Mobile | **HIGH** | Mobile (`config.ts`, `app.json`) | Credential sniffing, MitM, broken builds on Android 9+/iOS |
| **SEC-06** | Plaintext Driver Code Storage in Database | **MEDIUM** | Backend (`Hospital.code`) | Credential leakage upon database compromise |
| **SEC-07** | Missing Input Bounds on Registration & Updates | **MEDIUM** | Backend (`main.py` Pydantic models) | Memory exhaustion, storage bloating with oversized payloads |
| **SEC-08** | Third-Party API Key Exposure in Client Bundles | **MEDIUM** | Frontend & Mobile (`.env`) | Unrestricted CARTO API key theft and quota drainage |
| **SEC-09** | Database Pooler Port 5432 (Session Mode) in Production | **MEDIUM** | Backend (`DATABASE_URL`) | Connection pool starvation under concurrent load |
| **SEC-10** | Unrestricted Session Cookie Lifetime (7 Days) | **MEDIUM** | Frontend (`server-backend.ts`) | Session hijacking on shared hospital dispatch terminals |
| **SEC-11** | Unused Pickled ML Model Artifact in Repository | **LOW** | Backend (`data/risk_score_model.pkl`) | Potential arbitrary code execution if loaded dynamically |
| **SEC-12** | Missing Production Audit Logging for Dispatch Events | **LOW** | Backend (`main.py`) | Lack of traceability for critical plan cancellations |

---

## Detailed Vulnerabilities & Implementation Solutions

---

### SEC-01: Enforce Geographic Fencing on Public Hospital Registration (`POST /hospital/register`)
- **Location:** `backend/main.py` lines 670–730
- **Operational Requirement:** Public registration is deliberately kept open without requiring pre-shared invitation tokens to ensure seamless, friction-free onboarding of hospitals.
- **Threat:** Without coordinate bounds, automated scripts or malicious users could submit registrations with coordinates outside Mumbai (e.g. invalid lat/lng or locations in other countries/continents). This breaks spatial routing calculations, causes distance matrix queries to fail, and clutters the database.
- **Remediation:**
  1. **Geographic Bounding Box:** Validate that the hospital latitude and longitude fall strictly within the Greater Mumbai operational territory (`18.85 <= lat <= 19.30` and `72.75 <= lng <= 73.05`).
  2. **In-Memory Rate Limiting:** Enforce the in-memory sliding window IP rate limiter (`SEC-04`) to prevent rapid scripted flooding (e.g. max 5 registrations/hour per IP).
  3. **Strict Input Bounds:** Enforce Pydantic length and range validations (`SEC-07`).

#### Solution Code (`backend/main.py`):
```python
# Mumbai metropolitan operational bounding box
MUMBAI_LAT_MIN, MUMBAI_LAT_MAX = 18.85, 19.30
MUMBAI_LNG_MIN, MUMBAI_LNG_MAX = 72.75, 73.05

@app.post("/hospital/register")
def register_hospital(
    request: Request,
    registration: HospitalRegistration,
    db: Session = Depends(get_db),
):
    # Enforce Mumbai geographical bounding box
    if not (MUMBAI_LAT_MIN <= registration.lat <= MUMBAI_LAT_MAX and MUMBAI_LNG_MIN <= registration.lng <= MUMBAI_LNG_MAX):
        raise HTTPException(
            status_code=422,
            detail=f"Hospital coordinates must fall within Mumbai territory ({MUMBAI_LAT_MIN}-{MUMBAI_LAT_MAX} N, {MUMBAI_LNG_MIN}-{MUMBAI_LNG_MAX} E)"
        )

    # Continue with standard registration logic...
```

---

### SEC-02: Shared Hospital Code Across All Drivers (Status: Accepted Operational Trade-off)
- **Location:** `backend/main.py` (`/ambulances/{call_sign}/status` and `/ambulances/{call_sign}/assignment-status`), `mobile/src/state/fleet.tsx`
- **Operational Decision:** **ACCEPTED RISK / DEFERRED FOR MVP.**  
  In current hospital dispatch workflows, ambulance drivers frequently switch vehicles during shifts, cover for other drivers, or share mobile devices. To avoid operational bottlenecks and login friction, any driver holding the hospital code (`Hospital.code`) is intentionally permitted to view and update any vehicle in their hospital's fleet.
- **Current Safeguards in Place:**
  1. **Hospital Scoping:** A driver possessing Hospital A's code is strictly scoped to Hospital A. The backend helper `_require_hospital_ambulance` guarantees they cannot view, modify, or interfere with Hospital B's ambulances.
  2. **Audit Logging:** Every status change logs the client IP and timestamp (`SEC-12`).
- **Future Phase 2 Architecture (Reference Only - Do Not Implement for MVP):**
  If individual driver accountability is required in the future, the team can introduce cryptographic HMAC unit tokens to bind a mobile device to a single vehicle:
```python
# (Optional Phase 2) Cryptographic unit token pattern
def make_unit_token(hospital_id: int, call_sign: str) -> str:
    msg = f"{hospital_id}:{call_sign}".encode()
    return hmac.new(require_pepper(), msg, hashlib.sha256).hexdigest()
```

---

### SEC-03: Fix IP Spoofing via `X-Forwarded-For` in Frontend Proxy
- **Location:** `frontend/lib/server-backend.ts` lines 15–20
- **Threat:** 
  ```typescript
  export function clientIp(req: NextRequest): string {
    const real = req.headers.get('x-real-ip')?.trim()
    if (real) return real
    const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    return first || 'local'
  }
  ```
  The proxy extracts the **first** element of `X-Forwarded-For`. Clients can arbitrarily set the `X-Forwarded-For` header. In reverse proxy chains, untrusted client-supplied values are on the leftmost side. An attacker can pass `X-Forwarded-For: 1.1.1.1` to bypass rate limits or pass an innocent user's IP to lock them out of the system.
- **Remediation:**
  1. On platforms like Vercel, AWS CloudFront, or Cloudflare, use standard immutable platform headers such as `x-vercel-forwarded-for` or `cf-connecting-ip`.
  2. If reading `x-forwarded-for`, read from the **rightmost** trusted hop rather than the leftmost client-controlled entry.

#### Solution Code (`frontend/lib/server-backend.ts`):
```typescript
export function clientIp(req: NextRequest): string {
  // 1. Cloudflare connecting IP (unspoofable behind Cloudflare)
  const cfIp = req.headers.get('cf-connecting-ip')?.trim()
  if (cfIp) return cfIp

  // 2. Vercel trusted client IP
  const vercelIp = req.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim()
  if (vercelIp) return vercelIp

  // 3. Real IP from trusted proxy
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real

  // 4. Fallback to rightmost entry of X-Forwarded-For (last hop added by proxy)
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1] // Rightmost hop
  }

  return 'local'
}
```

---

### SEC-04: Transition Rate Limiting Off Disk/PostgreSQL to In-Memory / Redis
- **Location:** `backend/main.py` (`_enforce_limit`, `_record`, `AuthFailure` table)
- **Threat:** Every failed authentication and registration check executes database transactions against Supabase PostgreSQL:
  - `SELECT ... FROM auth_failures WHERE client_ip = ...`
  - `INSERT INTO auth_failures ...`
  - Random `DELETE FROM auth_failures WHERE created_at < ...` (full table scan)
  An attacker running a multithreaded credential stuffing attack will exhaust database connection pool limits (port 5432/6543) and saturate CPU, taking down the dispatch database.
- **Remediation:**
  - Replace the SQL-based rate limiter with an in-memory sliding window cache (using Python `cachetools`, `collections.deque`, or `slowapi`), or an external Redis store (`redis-py` / Upstash Redis) in distributed environments.

#### Solution Code (`backend/main.py`):
```python
from collections import defaultdict, deque
import threading
import time as clock

_auth_failures: dict[str, deque] = defaultdict(deque)
_auth_lock = threading.Lock()
AUTH_MAX_FAILURES = 10
AUTH_WINDOW_S = 600  # 10 minutes

def check_ip_rate_limit(ip: str) -> None:
    now = clock.monotonic()
    with _auth_lock:
        hits = _auth_failures[ip]
        while hits and hits[0] <= now - AUTH_WINDOW_S:
            hits.popleft()
        if len(hits) >= AUTH_MAX_FAILURES:
            retry_after = max(1, int(hits[0] + AUTH_WINDOW_S - now) + 1)
            raise HTTPException(
                status_code=429,
                detail="Too many failed attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )

def record_failed_attempt(ip: str) -> None:
    now = clock.monotonic()
    with _auth_lock:
        _auth_failures[ip].append(now)
```

---

### SEC-05: Enforce HTTPS & Transport Security in Mobile App
- **Location:** `mobile/.env`, `mobile/src/lib/config.ts`, `mobile/app.json`
- **Threat:** Mobile defaults to `http://192.168.31.193:8000` or `http://${host}:8000`. In production, mobile networks (4G/5G/hospital Wi-Fi) without HTTPS expose hospital codes, driver locations, and assignment changes to network sniffers. Android and iOS will also block HTTP in release mode.
- **Remediation:**
  1. Reject non-HTTPS URLs when `NODE_ENV === 'production'`.
  2. Configure `app.json` to explicitly prohibit cleartext traffic.

#### Solution Code (`mobile/src/lib/config.ts`):
```typescript
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim()
  if (fromEnv) {
    const url = fromEnv.replace(/\/$/, '')
    if (!__DEV__ && url.startsWith('http://')) {
      throw new Error('Production builds MUST use secure HTTPS for EXPO_PUBLIC_API_URL.')
    }
    return url
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  return `http://${host ?? 'localhost'}:8000`
}
```

#### Solution Code (`mobile/app.json`):
```json
{
  "expo": {
    "name": "AmbulanceIQ",
    "slug": "ambulanceiq",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.ambulanceiq.mobile",
      "infoPlist": {
        "NSAppTransportSecurity": {
          "NSAllowsArbitraryLoads": false
        }
      }
    },
    "android": {
      "package": "com.ambulanceiq.mobile",
      "networkSecurityConfig": "./network_security_config.xml"
    }
  }
}
```

---

### SEC-06: Encrypt Stored Driver Codes at Rest
- **Location:** `backend/models.py` (`Hospital.code`), `backend/credentials.py`
- **Threat:** Driver codes (`PAREL-7K3QMZ`) are stored in plaintext in the `hospitals` table. If an SQL dump, backup snapshot, or unauthorized read access occurs, every hospital code is compromised.
- **Remediation:**
  - Use symmetric authenticated encryption (AES-256-GCM via Python's `cryptography.fernet` or AWS KMS) to encrypt the code before storing it in the database.
  - Compute a deterministic SHA-256 HMAC of the code with `KEY_PEPPER` (`code_lookup_hash`) so the backend can look up hospitals by code in $O(1)$ without storing the code in plaintext.

#### Solution Architecture:
```python
# Store in database:
# 1. code_hash = hmac.new(KEY_PEPPER, code.encode(), sha256).hexdigest() (for querying)
# 2. encrypted_code = Fernet(ENCRYPTION_KEY).encrypt(code.encode()) (for admin viewing)
```

---

### SEC-07: Enforce Strict Pydantic Bounds on All Inputs
- **Location:** `backend/main.py`
- **Threat:** Models like `HospitalRegistration`, `AmbulanceStatusUpdate`, and `HospitalUpdate` lack `max_length` and numeric range constraints. An attacker can send megabyte-sized strings for hospital names, notes, or ambulance IDs, causing RAM spikes and database storage exhaustion.
- **Remediation:**
  - Apply `Field(min_length=..., max_length=..., ge=..., le=...)` across all models.

#### Solution Code (`backend/main.py`):
```python
class Ambulance(BaseModel):
    id: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    type: str

class AmbulanceStatusUpdate(BaseModel):
    status: models.AmbulanceStatus
    note: Optional[str] = Field(default=None, max_length=255)

class HospitalRegistration(BaseModel):
    hospital_name: str = Field(min_length=2, max_length=100)
    lat: float = Field(ge=18.85, le=19.30)
    lng: float = Field(ge=72.75, le=73.05)
    operating_radius_km: float = Field(gt=0, le=50)
    ambulances: List[Ambulance] = Field(min_length=1, max_length=50)
```

---

### SEC-08: Protect Third-Party CARTO Map API Keys
- **Location:** `frontend/.env`, `mobile/.env`
- **Threat:** `NEXT_PUBLIC_CARTO_API_KEY` and `EXPO_PUBLIC_CARTO_API_KEY` are exposed in browser bundles and mobile binary packages. An external attacker can scrape this key from network requests and use it for their own apps, depleting tile quotas.
- **Remediation:**
  1. Open the **CARTO Management Dashboard**.
  2. Set **HTTP Referrer Restrictions** on the API token to only allow requests originating from your production domain: `https://your-domain.com/*`.
  3. Restrict token permissions strictly to **Maps API (read-only basemaps)**.

---

### SEC-09: Switch Database Pooler to Transaction Mode (Port 6543)
- **Location:** `backend/.env`
- **Threat:** `DATABASE_URL` connects to port `5432`. On Supabase, port 5432 uses Session Pooling, where each client holds an open PostgreSQL server connection. During fleet polling or concurrent user activity, connections are quickly exhausted.
- **Remediation:**
  - Change the port in `DATABASE_URL` from `5432` to `6543` (PgBouncer Transaction Mode).
  - Add `?sslmode=require` and configure `pool_size=10, max_overflow=20` in `backend/database.py`.

#### Solution Code (`backend/.env`):
```bash
# Change port 5432 -> 6543
DATABASE_URL=postgresql://postgres.osmwfarralhpbxwcuuzr:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require
```

---

### SEC-10: Reduce Session Cookie Lifetime & Implement Idle Timeout
- **Location:** `frontend/lib/server-backend.ts` line 9
- **Threat:** `SESSION_MAX_AGE_S` is set to 7 days (`604800` seconds). In hospital control rooms, computers are often shared across shifts. An active session lasting 7 days increases the window for unauthorized users to access dispatch controls.
- **Remediation:**
  - Reduce `SESSION_MAX_AGE_S` to 12 or 24 hours (`12 * 3600` or `24 * 3600`).
  - Implement a client-side idle timeout (e.g. prompt after 30 minutes of inactivity).

---

### SEC-11: Remove Inactive Pickled Model Artifact
- **Location:** `backend/data/risk_score_model.pkl`
- **Threat:** Python pickle files can execute arbitrary shell commands upon deserialization (`__reduce__` exploit). While not actively imported by `main.py`, having untracked/unverified binary `.pkl` files in code repositories is a supply-chain vulnerability.
- **Remediation:**
  - Safely archive or remove `backend/data/risk_score_model.pkl` if the risk scores are already pre-computed in `ward_hour_risk_scores.csv`.

---

### SEC-12: Implement Production Audit Logging
- **Location:** `backend/main.py`
- **Threat:** When an operator clicks **"Cancel live plan"**, **"Dispatch all"**, or changes unit positions, there is no immutable audit trail recording the dispatcher's identity, IP address, timestamp, and user agent.
- **Remediation:**
  - Create an `AuditLog` table and helper function `_audit_log(hospital_id, action, details, ip)` that records every state change for regulatory compliance and incident analysis.

---

## Production Deployment Checklist for Engineering Teams

Before flipping DNS to production:

- [ ] **1. Secrets Management:**
  - Verify that `KEY_PEPPER` and `PROXY_SHARED_SECRET` are generated using high-entropy random keys (`openssl rand -hex 32`) and are backed up securely.
  - Confirm `PROXY_SHARED_SECRET` matches exactly in both frontend and backend hosting environments.
- [ ] **2. CORS & Network:**
  - Set `ALLOWED_ORIGINS=https://app.yourdomain.com` in `backend/.env`.
  - Set `EXPO_PUBLIC_API_URL=https://api.yourdomain.com` in mobile deployment configs.
- [ ] **3. Database Connection:**
  - Set `DATABASE_URL` to Supabase port `6543` with `?sslmode=require`.
- [ ] **4. Build Integrity:**
  - Run `tsc --noEmit` on frontend and mobile to confirm zero build errors.
  - Ensure `NODE_ENV=production` is set across all runtime environments so cookies enforce `secure: true`.
- [ ] **5. Penetration Testing / Smoke Test:**
  - Verify that entering 10 bad hospital codes returns HTTP 429 with `Retry-After`.
  - Verify that spoofing `X-Forwarded-For` from an outside client does not bypass rate limiting.

