# Production Security & Deployment Hardening Checklist

> **Target Systems:** FastAPI Backend | Next.js Frontend | React Native (Expo) Mobile | Supabase PostgreSQL  
> **Objective:** Prevent credential leakage, defend against OWASP Top 10 vulnerabilities, protect mobile apps from tampering, and harden the system for live production deployment.

---

## Executive Summary & Threat Profile

The application handles emergency ambulance dispatching and hospital fleet optimization in Mumbai. Security failures can result in:
1. **Denial of Service (DoS)** preventing emergency ambulance routing.
2. **Unauthorized vehicle status changes** (marking ambulances responding or unavailable).
3. **Admin impersonation** (manipulating operating radius, triggers, fleet data).
4. **Data exposure** (unmasking fleet real-time readiness, driver assignments, and admin credentials).

---

## 1. Critical Priority: Immediate Fixes Before Deployment

### 1.1 Synchronize Proxy Shared Secret Between Frontend & Backend
- [ ] **Problem:** `backend/.env` defines `PROXY_SHARED_SECRET`, but `frontend/.env` is missing it.
- [ ] **Risk:** 
  - Without `PROXY_SHARED_SECRET` in `frontend/.env`, the Next.js server proxy (`/api/backend/[...path]`) cannot authenticate its `X-Client-IP` header with the FastAPI backend.
  - As a result, the backend falls back to `request.client.host` (the Next.js server's internal IP address, e.g., `127.0.0.1` or the container IP).
  - **Single Point of Failure / Shared Lockout DoS:** If one attacker or mistyped login fails 10 times, the backend rate limiter blocks the *entire frontend server IP*, locking out **all** legitimate hospital staff using the web application!
- [ ] **Action Required:**
  - Add `PROXY_SHARED_SECRET` to `frontend/.env` with the exact same value as `backend/.env`.
  - In production hosting (Vercel, Render, AWS, Railway), set `PROXY_SHARED_SECRET` as an environment variable in both frontend and backend project settings.

```bash
# Add to frontend/.env (MUST match backend/.env):
PROXY_SHARED_SECRET=<long_random_64_character_hex_or_base64_string>
```

---

### 1.2 Restrict Public Hospital Registration (`POST /hospital/register`)
- [ ] **Problem:** `POST /hospital/register` is an open public endpoint with only a basic IP rate limit (5 attempts per hour).
- [ ] **Risk:** 
  - Attackers or bots can spam hospital registrations, generating thousands of dummy ambulances and flooding the Supabase database.
  - False hospital records pollute city-wide spatial queries and optimization algorithms.
- [ ] **Action Required:**
  - Add an registration master key (`REGISTRATION_TOKEN` or `INVITE_CODE`) requirement to `POST /hospital/register` in `backend/main.py`.
  - Alternatively, put the registration behind an administrative approval workflow or reCAPTCHA v3 / Cloudflare Turnstile token validation.

---

### 1.3 Secure API Keys & Remove Client Leaks
- [ ] **Problem:** `NEXT_PUBLIC_CARTO_API_KEY` is present in `frontend/.env` and `mobile/.env.example`.
- [ ] **Risk:** Any variable starting with `NEXT_PUBLIC_` or `EXPO_PUBLIC_` is inlined into the client-side JavaScript bundle and Android APK/iOS IPA. Anyone using DevTools or inspecting network traffic can extract the key.
- [ ] **Action Required:**
  - In the CARTO dashboard, configure domain whitelisting and HTTP Referrer restrictions for the web app domain (e.g., `https://ambulanceiq.yourdomain.com`).
  - Restrict the CARTO API token scopes to Read-Only basemap tiles.
  - Delete unused `NEXT_PUBLIC_API_URL` from `frontend/.env` (the frontend cleanly uses `/api/backend` proxy).

---

### 1.4 Enforce Strict HTTPS & Block Cleartext Traffic on Mobile
- [ ] **Problem:** `mobile/src/lib/config.ts` defaults to HTTP: `http://${host}:8000`.
- [ ] **Risk:** Android 9+ (API 28+) and iOS block cleartext HTTP by default. In release builds, mobile apps will silently fail network calls unless HTTPS is enforced. Furthermore, HTTP allows network eavesdropping on driver codes.
- [ ] **Action Required:**
  - Configure a production domain with SSL/TLS (e.g., `https://api.ambulanceiq.yourdomain.com`).
  - Set `EXPO_PUBLIC_API_URL=https://api.ambulanceiq.yourdomain.com` in mobile release builds.
  - Ensure `android:usesCleartextTraffic="false"` is set in Android production manifests.

---

## 2. High Priority: Backend & API Security (FastAPI & Supabase)

### 2.1 Transition Rate Limiting from PostgreSQL to In-Memory/Redis
- [ ] **Current State:** Rate limits and failed auth attempts are stored in the PostgreSQL `auth_failures` table with a 1% chance random purge query (`_maybe_purge`).
- [ ] **Vulnerability:** Under an aggressive credential stuffing attack or volumetric flood, writing rows to PostgreSQL for every attempt and running table scans can saturate Supabase connection pool limits and degrade the database for real ambulance dispatch operations.
- [ ] **Action Required:**
  - For small/single-instance deploys: Use an in-memory sliding window cache (like `cachetools` or `slowapi`) with bounded memory.
  - For multi-instance / distributed production deploys: Connect `slowapi` or Redis (`redis-py`) to handle rate limiting in RAM (< 1ms latency) rather than disk I/O.
  - Protect endpoints with Cloudflare WAF / rate limiting at the edge before requests reach the FastAPI backend.

---

### 2.2 Protect Pepper Key & Database URL
- [ ] **Current State:** `KEY_PEPPER` in `backend/.env` is used to HMAC-SHA256 admin keys.
- [ ] **Security Measures:**
  - Ensure `backend/.env` is never committed to Git (verified: `.gitignore` currently ignores it, keep this intact).
  - Back up `KEY_PEPPER` in a secure password manager or cloud secret store (AWS Secrets Manager, Doppler, or Infisical). If `KEY_PEPPER` is lost, **every existing hospital admin key in the database becomes permanently invalidated**.
  - Supabase Database URL: Use the connection pooler URL (`aws-0-ap-northeast-1.pooler.supabase.com:6543` in Transaction mode) instead of direct port 5432 for serverless/scalable environments.

---

### 2.3 Add Global Error Sanitization
- [ ] **Current State:** `_db_unavailable` outputs:
  ```python
  reason = str(getattr(exc, "orig", exc)).strip().splitlines()[0]
  return HTTPException(status_code=503, detail=f"Database unreachable: {reason}")
  ```
- [ ] **Risk:** Internal database driver errors might occasionally leak table structures, foreign key constraints, or hostnames to unauthenticated callers.
- [ ] **Action Required:**
  - In production (`ENVIRONMENT=production`), log the detailed exception to internal logs with `logger.error()`, but return a generic message to clients: `"Database service temporarily unavailable"`.

---

### 2.4 Production CORS Configuration
- [ ] **Current State:** `ALLOWED_ORIGINS` defaults to `http://localhost:3000`.
- [ ] **Action Required:**
  - In production, set `ALLOWED_ORIGINS=https://ambulanceiq.yourdomain.com` in `backend/.env`.
  - Avoid using wildcard `["*"]` with `allow_credentials=True` (browsers reject this combination, and it violates CORS safety).

---

## 3. High Priority: Frontend & Web Application Security (Next.js)

### 3.1 Implement OWASP Security Headers in `next.config.mjs`
- [ ] **Current State:** No HTTP security headers are set in `next.config.mjs`.
- [ ] **Action Required:** Add security headers to protect against Clickjacking, MIME-sniffing, XSS, and Referrer leakage.

```javascript
// Add to frontend/next.config.mjs:
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org; connect-src 'self' https://*.basemaps.cartocdn.com; font-src 'self'; frame-ancestors 'none';",
  },
]

export default {
  ...nextConfig,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}
```

---

### 3.2 Fix TypeScript Build Error Ignoring
- [ ] **Problem:** `frontend/next.config.mjs` has:
  ```javascript
  typescript: {
    ignoreBuildErrors: true,
  }
  ```
- [ ] **Risk:** Build errors can conceal critical type mismatch bugs, broken authentication checks, or missing parameters before deployment.
- [ ] **Action Required:** Fix underlying type errors and set `ignoreBuildErrors: false` before shipping to production.

---

### 3.3 Validate and Restrict Session Cookies
- [ ] **Current State:** In `frontend/lib/server-backend.ts`:
  - `httpOnly: true` (Protects cookies against XSS theft).
  - `secure: process.env.NODE_ENV === 'production'` (Must ensure `NODE_ENV=production` is always active in deployment).
  - `sameSite: 'lax'` (Provides CSRF protection).
- [ ] **Checklist:**
  - Verify that HTTPS is active on the frontend domain so that `secure: true` cookies are sent.
  - Consider reducing `SESSION_MAX_AGE_S` from 7 days to 24-48 hours with idle timeouts for high-security medical and administrative portals.

---

## 4. Mobile Application Security (Expo & React Native)

### 4.1 Secure Storage for Sensitive Values
- [ ] **Current State:** Mobile uses `@react-native-async-storage/async-storage` for:
  - `ambulanceiq.hospitalCode`
  - `ambulanceiq.hospitalName`
  - `ambulanceiq.unit`
- [ ] **Assessment:**
  - The driver code is intentionally human-readable and designed to be entered by drivers on mobile devices.
  - However, unencrypted `AsyncStorage` is accessible on rooted/jailbroken devices or via backup extraction.
- [ ] **Recommendation:**
  - Migrate sensitive tokens or driver codes to `expo-secure-store` (backed by Android Keystore and iOS Keychain with hardware-backed encryption).
  - Never store administrative keys (`admin_key`) on mobile client devices under any circumstances.

---

### 4.2 Application Transport Security (ATS) & Network Security Config
- [ ] **Android Configuration (`android/app/src/main/res/xml/network_security_config.xml`):**
  - Ensure cleartext traffic is explicitly disabled for production builds:
  ```xml
  <network-security-config>
      <base-config cleartextTrafficPermitted="false">
          <trust-anchors>
              <certificates src="system" />
          </trust-anchors>
      </base-config>
  </network-security-config>
  ```
- [ ] **iOS Configuration (`Info.plist`):**
  - Verify `NSAppTransportSecurity` does not have `NSAllowsArbitraryLoads` set to `true`.

---

### 4.3 App Tampering & Certificate Pinning (Optional for High-Security Live Deployment)
- [ ] For production fleets handling sensitive emergency response:
  - Implement SSL certificate pinning (e.g., using `react-native-ssl-pinning` or Expo plugins) to prevent Man-in-the-Middle (MitM) attacks on compromised networks.
  - Strip console logs (`console.log`, `console.debug`) in production release builds using Babel plugin `babel-plugin-transform-remove-console`.

---

## 5. Deployment & Infrastructure Hardening

| Component | Setting / Checklist Item | Recommended Production Value |
| :--- | :--- | :--- |
| **ASGI Server** | Do NOT use `uvicorn --reload` | Gunicorn with `UvicornWorker`: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app` |
| **Process Manager** | Restart on crash & resource limits | Systemd service / Docker container with memory caps |
| **Reverse Proxy** | Nginx / Caddy / Cloudflare | Terminate TLS, buffer requests, enforce HTTP/2 or HTTP/3 |
| **DDoS Mitigation** | Cloudflare Proxy | Cloudflare WAF enabled, Bot Fight Mode active |
| **Database Pooler** | Supabase Connection Limits | Connect to Port 6543 (Transaction Pooler) to avoid connection starvation |
| **Secrets Manager** | Never commit `.env` to Git | Store secrets in Vercel / Render / AWS Parameter Store |
| **Monitoring** | Log monitoring & alerts | Sentry for error tracking; Datadog / Prometheus for API metrics |

---

## 6. Pre-Launch Verification Run-Sheet

Before flipping DNS to live production:

- [ ] 1. Run `git status` and verify no `.env` or sensitive credential files are untracked or staged.
- [ ] 2. Confirm `PROXY_SHARED_SECRET` is set and identical in both Backend and Frontend production environments.
- [ ] 3. Verify `KEY_PEPPER` is securely backed up in an encrypted vault.
- [ ] 4. Confirm `ALLOWED_ORIGINS` in FastAPI matches the exact production frontend domain (`https://...`).
- [ ] 5. Test sign-in failure lockout: verify that failing 10 times from an individual client IP locks out *only* that IP and does *not* lock out other devices on the web frontend.
- [ ] 6. Trigger an optimizer run (`/optimize`) and inspect network traffic in browser DevTools to ensure no admin key or internal database connection strings are exposed in response bodies.
- [ ] 7. Perform mobile release build test on both a physical Android and iOS device over LTE/4G/5G to verify HTTPS calls succeed with no cleartext warnings.
