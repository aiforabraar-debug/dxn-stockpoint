# Mohammadpur Stock Point v2.1.2 🛒

An offline-first stockpoint POS for Mohammadpur Stock Point, a DXN distributor —
**one PHP API, two clients that stay in sync**: an installable web app and a
native Android app. Everything runs on free, forever tiers: GitHub Pages, GitHub
Releases, InfinityFree (PHP 8 + MySQL), and Google Play.

| | |
|---|---|
| 🌐 Web app | https://abraar05.github.io/dxn-stockpoint/ |
| 📱 Android | GitHub Releases → `dxn-stockpoint-2.1.2-debug.apk` |
| 🔌 API | InfinityFree — `https://<your-site>/api/v1/...` |
| 🔒 Privacy | https://abraar05.github.io/dxn-stockpoint/privacy.html |

---

## How the pieces fit

```
        ┌───────────────────────┐
        │  PHP 8 + MySQL  API   │   single source of truth
        │  api/  (InfinityFree) │   revision counter on every row
        └───────────┬───────────┘
                    │  GET /api/v1/sync?since=<rev>
        ┌───────────┴───────────┐
        │                       │
┌───────▼────────┐     ┌────────▼─────────┐
│  Web (PWA)     │     │  Android         │
│  docs/         │     │  android/        │
│  localStorage  │     │  JSON cache      │
│  + outbox      │     │  + outbox        │
└────────────────┘     └──────────────────┘
```

- **One write path.** A sale made on the phone shows up on the shop laptop
  within 20 seconds (and vice versa) because both read the same revision feed.
- **Every row carries `rev`.** Clients store the highest revision they have seen
  and ask only for what changed — cheap on mobile data.
- **Orders are idempotent.** The client generates a `client_uuid`; replaying a
  queued order after a dropped connection can never double-book a sale.
- **Stock is decremented atomically** (`UPDATE … WHERE stock_qty >= ?`), so two
  cashiers selling the last unit produce one sale and one clear `409`.
- **Nothing is lost offline.** Sales queue in an outbox and replay automatically
  when the connection returns.

## Repository layout

| Path | What it is |
|---|---|
| `api/` | PHP 8 API — no Composer, no framework, drop-in on shared hosting |
| `docs/` | The web app (ES modules, no build step) + PWA manifest & service worker |
| `android/DXNStockpoint/` | Kotlin + Jetpack Compose app |
| `scripts/` | Local dev server, toolchain provisioning, verification suites |
| `.github/workflows/` | Pages deploy, InfinityFree FTP deploy, APK/AAB build |

> `backend/` is the retired v1 Node/SQLite server. It is kept for reference only;
> nothing in v2 talks to it.

## Run it locally

```powershell
# API on :8099 and the web app on :8100, SQLite, PIN 2468
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Fresh -Pin 2468
```

Open http://127.0.0.1:8100, go to **Settings → Connection**, paste
`http://127.0.0.1:8099`, press **Test connection**, then **Save & sync**.
The sync pill in the header turns green and reads **Live**.

Build the Android app:

```powershell
# one-off: downloads JDK-independent SDK + Gradle into .tooling/
powershell -ExecutionPolicy Bypass -File scripts/provision-android.ps1
# then
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

The emulator reaches the local API at `http://10.0.2.2:8099` (the app's default).

### Prove it is actually in sync

Two scripts run against a live API (`scripts/dev.ps1` first) and exit non-zero
on any failure:

```powershell
# 22 checks: a web-shaped sale and an android-shaped sale land in one feed,
# draw down one stock ledger, replay safely, and a settled client pulls nothing
powershell -ExecutionPolicy Bypass -File scripts/verify-two-client-sync.ps1

# 55 checks: the exact wire contract the Kotlin client is bound to
powershell -ExecutionPolicy Bypass -File scripts/verify-android-contract.ps1
```

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

1. **API** → InfinityFree. Fill in `api/config/config.php`, upload, open
   `…/api/install.php?key=<install_key>` once.
2. **Web** → push to `main`; `pages.yml` publishes `docs/` to GitHub Pages.
3. **Android** → push to `main`; `build.yml` publishes the APK/AAB to Releases.
   Upload the `.aab` to Google Play, or sideload the `.apk`.
4. Point both clients at the same API origin — they now share live data.

## API surface

`GET /api/v1/health` · `/config` · `/products` · `/products/{id}` · `/stock/movements`
`POST /api/v1/auth/login` · `/products` · `/stock/update` · `/stock/adjust` · `/orders`
`PUT /api/v1/products/{id}` · `/settings` · `PATCH` same
`POST /api/v1/orders/{id}/status` · `GET` `/orders` · `/orders/{id}` · `/orders/{id}/receipt`
`GET /api/v1/dashboard` · `/reports/sales` · `/settings` · `/sync` · `/sync/status`

Auth is either `X-Api-Key: <admin_key>` (machines) or
`Authorization: Bearer <token>` from `POST /auth/login` with the shop PIN.

## Licence

Private project for DXN stockpoint operations.
