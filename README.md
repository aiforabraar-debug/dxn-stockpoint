# Mohammadpur Stock Point v2.2.0 🛒

An offline-first stockpoint POS for Mohammadpur Stock Point, a DXN distributor -
**one PHP API, two clients that stay in sync**: an installable web app and a
native Android app. Everything runs on free, forever tiers: GitHub Pages, GitHub
Releases, InfinityFree (PHP 8 + MySQL), and Google Play.

| | |
|---|---|
| 🌐 Web app | https://dxn.10001mb.com/ (the GitHub Pages URL redirects here) |
| 📱 Android | GitHub Releases → `dxn-stockpoint-2.2.0-debug.apk` |
| 🔌 API | InfinityFree - `https://dxn.10001mb.com/api/v1/...` |
| 🔒 Privacy | https://aiforabraar-debug.github.io/dxn-stockpoint/privacy.html |

---

## How the pieces fit

```
        ┌─────────────────────────┐
        │  PHP 8 + MySQL  API     │   single source of truth
        │  api/  (InfinityFree)   │   revision counter on every row
        └─────────────────────────┘
                    │  GET /api/v1/sync?since=<rev>
        ┌───────────┴───────────┐
        │                       │
┌───────────────┐     ┌─────────────────┐
│  Web (PWA)    │     │  Android        │
│  docs/        │     │  android/       │
│  localStorage │     │  JSON cache     │
│  + outbox     │     │  + outbox       │
└───────────────┘     └─────────────────┘
```

- **One write path.** A sale made on the phone shows up on the shop laptop
  within 20 seconds (and vice versa) because both read the same revision feed.
- **Every row carries `rev`.** Clients store the highest revision they have seen
  and ask only for what changed - cheap on mobile data.
- **Orders are idempotent.** The client generates a `client_uuid`; replaying a
  queued order after a dropped connection can never double-book a sale.
- **Stock is decremented atomically** (`UPDATE … WHERE stock_qty >= ?`), so two
  cashiers selling the last unit produce one sale and one clear `409`.
- **Nothing is lost offline.** Sales queue in an outbox and replay automatically
  when the connection returns.

## Repository layout

| Path | What it is |
|---|---|
| `api/` | PHP 8 API - no Composer, no framework, drop-in on shared hosting |
| `docs/` | The web app (ES modules, no build step) + PWA manifest & service worker |
| `android/DXNStockpoint/` | Kotlin + Jetpack Compose app |
| `scripts/` | Local dev server, toolchain provisioning, verification suites |
| `.github/workflows/` | Pages mirror, InfinityFree FTP deploy, APK/AAB build |

> `backend/` is the retired v1 Node/SQLite server. It is kept for reference only;
> nothing in v2 talks to it.

## Run it locally

**Windows (one click):**

```bat
scripts\windows-server.cmd
```

This runs `scripts\dev.ps1 -Lan`: API on `:8099`, web app on `:8100`, SQLite,
PIN `2468`, and the LAN address printed for the Android app. Open
<http://127.0.0.1:8100>; the API base is pre-filled automatically. The servers
keep running after the window closes.

**Android / Termux (24/7):**

```bash
pkg install php php-sqlite3 git
git clone https://github.com/aiforabraar-debug/dxn-stockpoint.git
cd dxn-stockpoint
./scripts/android-server.sh start
# API http://127.0.0.1:8099/ · web app http://127.0.0.1:8099/app/ · PIN 2468
```

`./scripts/android-server.sh install-boot` makes it start with Termux:Boot.
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for LAN, tunnel and Windows
Firewall details.

Build the Android app:

```powershell
# one-off: downloads JDK-independent SDK + Gradle into .tooling/
powershell -ExecutionPolicy Bypass -File scripts/provision-android.ps1
# then
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

The emulator reaches the local API at `http://10.0.2.2:8099` (the app's dev
fallback). Fresh installs default to the live InfinityFree API at
https://dxn.10001mb.com/.

### Prove it is actually in sync

Two scripts run against a live API (`scripts/dev.ps1` first) and exit non-zero
on any failure. `test-api.mjs` boots its own throwaway server:

```powershell
# 22 checks: a web-shaped sale and an android-shaped sale land in one feed,
# draw down one stock ledger, replay safely, and a settled client pulls nothing
powershell -ExecutionPolicy Bypass -File scripts/verify-two-client-sync.ps1

# 55 checks: the exact wire contract the Kotlin client is bound to
powershell -ExecutionPolicy Bypass -File scripts/verify-android-contract.ps1

# 55 checks: full Node.js E2E against a throwaway SQLite database
node scripts/test-api.mjs
```

CI pipeline (`.github/workflows/`):

| Workflow | What it does |
|----------|-------------|
| `test.yml` | Runs the Node E2E suite (55 checks) against a throwaway SQLite database |
| `pages.yml` | Publishes `docs/` to GitHub Pages on every push to `main` |
| `api-deploy.yml` | Lints PHP, installs schema, smoke-tests, then FTP-deploys the API and web app to InfinityFree |
| `build.yml` | Compiles the Android APK + AAB and publishes a GitHub Release |

### Deployment checklist

1. **API + web** → InfinityFree. The workflow generates `api/config/config.php` from secrets and deploys both `api/` and `docs/` over FTP. The first run installs MySQL and seeds the catalogue automatically.
2. **Web mirror** → push to `main`; `pages.yml` publishes a redirecting copy to GitHub Pages.
3. **Android** → push to `main`; `build.yml` publishes the APK/AAB to GitHub Releases.
4. **Secrets** (repo Settings → Secrets and variables → Actions):
   - `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` - InfinityFree FTP upload
   - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` - InfinityFree MySQL
   - `DXN_ADMIN_KEY`, `DXN_INSTALL_KEY`, `DXN_TOKEN_SECRET` - API secrets (generated once)
   - `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` - for signed release APK/AAB (required for Google Play)

## Using the app

| Screen | What you can do |
|---|---|
| **Catalog** | Search, filter by category, see stock badges, add to cart (member/retail pricing) |
| **Cart** | Quantity stepper, customer details, discount, WhatsApp checkout, printable slip |
| **Orders** | History, status changes, CSV export, reprint receipt *(admin)* |
| **Admin** | Revenue/PV tiles, 7-day chart, low-stock alerts, best sellers, stock ledger, product CRUD *(admin)* |
| **Settings** | API origin, shop profile, PIN, device backup/reset |

Admin screens need the shop PIN. It is set when the API is installed
(`--pin=` / `DXN_ADMIN_PIN`) and can be changed from **Settings → Account**.

## Deploy for free

Full walkthrough in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The short version:

1. **API + web** → push to `main`. The workflow writes `api/config/config.php`
   from secrets, deploys both folders, and installs MySQL on the first run.
2. **Web mirror** → push to `main`; `pages.yml` publishes a redirecting copy to GitHub Pages.
3. **Android** → push to `main`; `build.yml` publishes the APK/AAB to Releases.
   Upload the `.aab` to Google Play, or sideload the `.apk`.
4. Point both clients at the same API origin - they now share live data.

> **The InfinityFree challenge.** The host puts a JavaScript `/aes.js` puzzle in
> front of every URL. The browser solves it automatically on the custom domain,
> so the web app and API are same-origin. The Android client includes a native
> AES solver (`ChallengeInterceptor`) that obtains the `__test` cookie and
> retries, so bearer-token requests also work.

## API surface

`GET /api/v1/health` · `/config` · `/products` · `/products/{id}` · `/stock/movements`
`POST /api/v1/auth/login` · `/products` · `/stock/update` · `/stock/adjust` · `/orders`
`PUT /api/v1/products/{id}` · `/settings` · `PATCH` same
`POST /api/v1/orders/{id}/status` · `GET` `/orders` · `/orders/{id}` · `/orders/{id}/receipt`
`POST /api/v1/orders/{id}/return` · `GET` `/dashboard` · `/reports/sales` · `/settings` · `/sync` · `/sync/status`

`GET /products` returns the whole catalogue by default (`per_page=200`). Pass
`?page=N&per_page=M` for pagination; the response carries `total`, `page`,
`per_page`, and `pages` alongside `products`.

Auth is either `X-Api-Key: <admin_key>` (machines) or
`Authorization: Bearer <token>` from `POST /auth/login` with the shop PIN.

## Licence

Private project for DXN stockpoint operations.
