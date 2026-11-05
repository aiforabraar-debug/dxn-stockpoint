# Deployment — live cloud + local servers

The shop now has one canonical cloud origin and two optional local origins:

| Piece | Where | URL |
|---|---|---|
| Web app + PHP API + MySQL | InfinityFree | **https://dxn.10001mb.com/** |
| Android client | GitHub Releases | `dxn-stockpoint-latest.apk` |
| GitHub Pages mirrors | GitHub | redirect to the custom domain |
| Local API (Android/Termux) | on the phone | `http://127.0.0.1:8099/` |
| Local API (Windows) | on the PC | `http://127.0.0.1:8099/` |

All clients use the same API contract. The cloud install is already live and
seeded with the 51-product catalogue; the shop PIN is `2468`.

---

## 1. How the cloud deployment works

`.github/workflows/api-deploy.yml` runs on every push that touches `api/`,
`docs/`, or `scripts/production-install.mjs`:

1. **Lint** — parses every PHP file, installs a throwaway SQLite database and
   runs a smoke suite (health, 51 products, offline SKU replay, sync, auth).
2. **Generate `api/config/config.php`** — from repository secrets, so the MySQL
   password is never committed. `installed.lock` is preserved between deploys.
3. **FTP upload** to InfinityFree:
   - `api/public/**` → `/dxn.10001mb.com/htdocs/api/`
   - `api/src/**` → `/dxn.10001mb.com/htdocs/api/src/`
   - `api/config/**` → `/dxn.10001mb.com/htdocs/api/config/`
   - `api/storage/**` → `/dxn.10001mb.com/htdocs/api/storage/`
   - `docs/**` → `/dxn.10001mb.com/htdocs/`
4. **Install + verify** — `scripts/production-install.mjs` solves the
   InfinityFree `__test` challenge, runs `install.php` on the first deploy, then
   checks health, login with the shop PIN, `/auth/me`, catalogue and sync.

### Repository secrets

Set these under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `FTP_SERVER` | `ftpupload.net` |
| `FTP_USERNAME` | InfinityFree account username |
| `FTP_PASSWORD` | InfinityFree account password |
| `DB_HOST` | MySQL host (e.g. `sql113.infinityfree.com`) |
| `DB_NAME` | database name (e.g. `if0_40744395_dxn_ver0`) |
| `DB_USER` | database user |
| `DB_PASS` | database password |
| `DXN_ADMIN_KEY` | random 48+ hex chars; machine/admin API key |
| `DXN_INSTALL_KEY` | random string; required by `install.php` |
| `DXN_TOKEN_SECRET` | random 64 hex chars; signs bearer tokens |

The deploy writes these into `api/config/config.php`. Rotating
`DXN_TOKEN_SECRET` invalidates every issued token.

### The InfinityFree challenge

InfinityFree puts a JavaScript `/aes.js` puzzle in front of every URL:

- The web app is served **from the same origin** as the API, so the browser
  already carries the `__test` cookie and normal fetch calls work.
- The Android app includes `ChallengeInterceptor` (AES-128-CBC, no padding),
  which solves the puzzle, caches the cookie and retries the request.
- `scripts/production-install.mjs` implements the same solver for CI.
- The service worker deliberately never intercepts `/api/**`, so sync always
  reaches the real server.

### Web app mirrors

`docs/index.html` redirects `*.github.io` hosts to the custom domain, and
`apps/frontend/index.html` in the enterprise repo does the same. The Pages
workflow remains as a fallback mirror, but the canonical app is the custom
domain.

---

## 2. Rebuild the cloud host from scratch

1. Create an InfinityFree account and add the custom domain
   `dxn.10001mb.com` (document root `dxn.10001mb.com/htdocs`).
2. Create a MySQL database; note the host, name, user and password.
3. Add the secrets above.
4. Push to `main`, or run **Actions → Deploy API + web app (InfinityFree) →
   Run workflow**.
5. The first run installs the schema, seeds 51 products and sets the PIN from
   `DXN_SHOP_PIN` (default `2468`).
6. Open <https://dxn.10001mb.com/> in a browser. The InfinityFree challenge
   clears automatically.

> Manual FTP is also possible, but the PHP files and `install.php` need the
> generated `config.php`. The GitHub Actions path is the supported one.

Verify from a machine that can solve the challenge:

```bash
DXN_ORIGIN=https://dxn.10001mb.com \
DXN_INSTALL_KEY='<install key>' \
node scripts/production-install.mjs
```

Expected tail:

```
Health: ok, driver mysql, installed true
Catalogue: 51 products
Login: success, role admin
Token check: role admin
Production install and verification passed.
```

---

## 3. Install the web app / Android app

### Web (PWA)

Open <https://dxn.10001mb.com/>. The app is installable:

- Android Chrome: **Install app**
- Desktop Chrome/Edge: install icon in the address bar

The app shell is cached; sales queue offline and replay when the connection
returns. API responses are never cached.

### Android

Download the latest APK from
<https://github.com/aiforabraar-debug/dxn-stockpoint/releases/latest>:

- `dxn-stockpoint-latest.apk` — sideloadable debug build
- `dxn-stockpoint-2.2.0.aab` — Play Store bundle

Fresh installs default to `https://dxn.10001mb.com/`. The app solves the host
challenge natively; no browser is involved. Admin screens use PIN `2468`.

### Signed release (optional)

Add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` secrets, then run
**Build Android (APK + AAB)**. Without them CI publishes the debug APK.

---

## 4. Local API on Android (Termux, 24/7)

The phone can be the server. It stores everything in SQLite, so it works with
no internet and no cloud account.

```bash
pkg install php php-sqlite3 git
git clone https://github.com/aiforabraar-debug/dxn-stockpoint.git
cd dxn-stockpoint

./scripts/android-server.sh start
# API  http://127.0.0.1:8099/api/v1/health
# App  http://127.0.0.1:8099/app/
# PIN  2468
```

Useful commands:

```bash
./scripts/android-server.sh status      # PIDs, health, LAN URLs
./scripts/android-server.sh stop
./scripts/android-server.sh restart
./scripts/android-server.sh install     # reinstall SQLite, reset PIN to 2468
./scripts/android-server.sh logs
./scripts/android-server.sh start --tunnel   # add a public trycloudflare URL
./scripts/android-server.sh url               # print the current tunnel URL
```

How it works:

- copies `api/` into `~/.dxn-stockpoint/api/` and writes a SQLite
  `config.php` there (the repository is untouched);
- serves the API and the web app from the same origin (`/api/...` and
  `/app/...`);
- runs a supervisor loop that restarts PHP if it crashes;
- takes `termux-wake-lock` so Android does not suspend it;
- optional `cloudflared` quick tunnel if a binary is on PATH, in
  `.tooling/cloudflared`, or in `DXN_CLOUDFLARED`;
- data lives in `~/.dxn-stockpoint/dxn.sqlite`.

### Start on boot

Install **Termux:Boot**, then:

```bash
./scripts/android-server.sh install-boot
```

It writes `~/.termux/boot/dxn-server`. Disable battery optimisation for Termux
(Android Settings → Apps → Termux → Battery → Unrestricted) for reliable 24/7
operation.

### Point the Android app at the local API

On the same phone: **Settings → Server URL** → `http://127.0.0.1:8099/`.

On another device on the same Wi-Fi: use the phone's LAN IP
(`./scripts/android-server.sh status` prints it).

> A quick tunnel URL is public. Anyone who knows it can read the catalogue and
> place orders; the shop PIN still protects admin screens. Use a named
> Cloudflare tunnel or the cloud API if you need a stable private hostname.

---

## 5. Local API on Windows

Requirements: Windows 10/11 and PHP 8.1+ with `pdo_sqlite` and `mbstring`
(<https://windows.php.net/download/> — use the Non Thread Safe x64 build and
add the `ext` directory to `php.ini`). Node is not needed.

```bat
scripts\windows-server.cmd
```

This runs `scripts/dev.ps1 -Lan`:

- installs/updates the SQLite database with PIN `2468`;
- starts the API on `0.0.0.0:8099` and the web app on `0.0.0.0:8100`;
- prints the LAN URLs and the API base to enter on the phone;
- leaves both servers running after the window closes (PIDs are printed).

Open <http://127.0.0.1:8100> on the PC. For the Android app on the same Wi-Fi,
set **Server URL** to `http://<PC-LAN-IP>:8099/`. Allow PHP through Windows
Firewall when prompted.

To keep it running 24/7, create a Task Scheduler task:

- Trigger: **At log on**
- Action: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\dxn-stockpoint\scripts\dev.ps1" -Lan`
- Settings: **Run whether user is logged on or not** (optional), restart on
  failure.

Stop it with the PIDs printed by the script:

```powershell
Stop-Process -Id <api-pid>,<web-pid>
```

---

## 6. Security notes

- `api/config/config.php` holds the MySQL password and HMAC secrets. It is
  generated on the server, is git-ignored, and is denied by
  `api/config/.htaccess`.
- `api/src/.htaccess` and `api/storage/.htaccess` deny direct web access.
  Keep them in every upload.
- `install.php` stays protected by `DXN_INSTALL_KEY`. Running it again with the
  key resets the PIN; do not share the URL/key.
- PIN logins are rate-limited (8 failures / 15 min / IP); bearer tokens expire
  after 30 days.
- The cloud site is HTTPS-only. The local servers are HTTP; use them only on a
  trusted LAN or through a tunnel.
- The quick Cloudflare tunnel is unauthenticated at the edge. Treat the URL as
  a secret and stop the tunnel when not needed.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Web shows the InfinityFree 403 page | challenge cookie missing | Reload; ensure JavaScript/cookies are enabled |
| `database_unavailable` on cloud | wrong DB host/user/pass | Recheck the `DB_*` secrets and redeploy |
| `401 Admin authentication required` | Apache stripped `Authorization` | The `.htaccess` rewrite passes it through; make sure it was uploaded |
| Android stays offline | old APK or wrong server URL | Install `dxn-stockpoint-latest.apk`; Settings → Server URL |
| Web shows stale data | old service worker | Clear site data, or wait for the r2 service worker to activate |
| Local API port busy | another server on 8099 | `DXN_PORT=8098 ./scripts/android-server.sh start` |
| Local API not reachable from phone | Windows Firewall / different Wi-Fi | Allow PHP, use the PC's LAN IP, disable AP isolation |
| `pdo_sqlite` missing on Termux | PHP extension absent | `pkg install php-sqlite3` |
| `cloudflared not found` | tunnel optional | Set `DXN_CLOUDFLARED=/path/to/cloudflared` |
