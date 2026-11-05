# Deployment — all free, forever tiers

This is the complete path from this repository to a live stockpoint where the
laptop browser and the Android phone show the same stock, the same orders and the
same dashboard.

Total cost: **$0**. Services used:

| Piece | Service | Free-tier limit that matters |
|---|---|---|
| API + MySQL | InfinityFree | 5 GB disk, ~50k hits/day, no cron, no Node |
| Web app | GitHub Pages | 100 GB/month, 1 GB site |
| Android build + download | GitHub Actions + Releases | 2 000 CI minutes/month |
| Play Store (optional) | Google Play Console | one-off $25 registration |

---

## 0. What you need first

- The repository pushed to `https://github.com/abraar05/dxn-stockpoint`.
- An InfinityFree account (free signup, no card).
- For CI deploys: **Settings → Secrets and variables → Actions**.

---

## 1. Create the InfinityFree host + database

1. Register at <https://infinityfree.com> → **Create Account**.
2. Pick a free subdomain, e.g. `dxn-stockpoint.infinityfreeapp.com`.
3. Open the account → **MySQL Databases** → **Create Database**, name it `dxn`.
4. Write down the four values shown. They look like:
   - Host — `sql301.infinityfree.com` *(never `localhost`)*
   - Database — `if0_12345678_dxn`
   - Username — `if0_12345678`
   - Password — whatever you chose

> InfinityFree suspends accounts that look idle on their login pages, but the
> API is a plain PHP app — no control-panel dependency at runtime.

### Create `api/config/config.php`

Two ways, pick one:

**a) File Manager (no tooling needed)**
Control Panel → **Online File Manager** → `htdocs/api/config/` → create
`config.php` with the contents of [`api/config/config.sample.php`](../api/config/config.sample.php),
filling in:

```php
'driver' => 'mysql',
'db' => [
    'host' => 'sql301.infinityfree.com',
    'name' => 'if0_12345678_dxn',
    'user' => 'if0_12345678',
    'pass' => 'your-database-password',
],
'admin_key'      => 'paste-64-random-hex-chars',
'install_key'    => 'paste-another-random-string',
'allowed_origins'=> 'https://abraar05.github.io',
```

Generate the random strings locally:

```powershell
-join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
```

**b) Local file + FTP upload** — copy the sample to `api/config/config.php`,
edit it, upload with FileZilla to `htdocs/api/config/config.php`.
It is git-ignored and the deploy workflow explicitly excludes it, so CI will
never overwrite it.

---

## 2. Upload the API

### Option A — GitHub Actions (recommended, repeatable)

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**:

   | Secret | Value |
   |---|---|
   | `FTP_SERVER` | `ftpupload.net` (InfinityFree FTP host) |
   | `FTP_USERNAME` | `if0_12345678` |
   | `FTP_PASSWORD` | your InfinityFree password |

2. Push to `main` (or run **Actions → Deploy API (InfinityFree) → Run workflow**).

The workflow lints every PHP file, boots the API against a throwaway SQLite
database, runs a smoke suite, and only then mirrors:

```
dxn.infy.click/htdocs/api/index.php     ← api/public/index.php
dxn.infy.click/htdocs/api/install.php   ← api/public/install.php
dxn.infy.click/htdocs/api/.htaccess     ← api/public/.htaccess
dxn.infy.click/htdocs/api/src/**       ← api/src/**
dxn.infy.click/htdocs/api/config/**    ← api/config/**   (config.php excluded)
dxn.infy.click/htdocs/api/storage/**   ← api/storage/**  (guard file only)
```

> PowerShell FTP alternative: `WinSCP` or `FTP-Deploy-Action` locally; the
> layout above is the only thing that matters.

### Option B — manual

Upload the same four folders into `dxn.infy.click/htdocs/api/` with FileZilla.
Keep `config.php`, `installed.lock`, and all storage/database files on the server.

---

## 3. Install the database (once)

Open in a browser:

```
https://dxn.infy.click/api/install.php?key=<install_key>
```

For a new installation it creates tables, seeds the 51-item approved catalog,
and stores a hashed shop PIN. Do not resubmit the installer on an existing shop;
use the idempotent migration endpoint instead so the current PIN is unchanged.

**Upgrading an existing shop?** Upload the new `api/` files, keep your existing
`config.php`, `installed.lock`, and database, then run `GET /api/v1/migrate`.
The migration refreshes the 51 catalog rows, preserves on-hand quantities and
sales history, and soft-archives retired starter SKUs; it does not change the
shop PIN.

Verify:

```powershell
curl.exe https://dxn.infy.click/api/v1/health
```

Expected: `{"success":true,"status":"ok","version":"2.1.2","driver":"mysql",...}`

> If you see `database_unavailable`, the DB host/user/pass in `config.php` are
> wrong — InfinityFree always uses `sqlNNN.infinityfree.com`, not `localhost`.

---

## 4. Publish the web app (GitHub Pages)

Already wired: `pages.yml` publishes `docs/` on every push that touches it.

1. Repo → **Settings → Pages** → Source: **GitHub Actions**.
2. Push to `main`, or run **Actions → Deploy web app → Run workflow**.
3. Open <https://abraar05.github.io/dxn-stockpoint/>.
4. **Settings → Connection** → paste `https://your-subdomain.infinityfreeapp.com`
   → **Test connection** → **Save & sync**.
   The pill in the header turns green and reads **Live**.

The app is a PWA: on Android Chrome use **Install app**, on desktop use the
install icon in the address bar. It then launches offline with the last cached
catalogue.

---

## 5. Build & ship the Android app

### Automatic

`build.yml` runs on every push that touches `android/`. It produces:

- `dxn-stockpoint-2.1.0-debug.apk` — sideloadable, no signing setup needed
- `dxn-stockpoint-2.1.0.aab` — for Google Play

Both are attached to the **v2.1.1** GitHub Release.

> `v2.0.0` on this repo predates the PHP API rewrite and is kept only as
> history. Ship `v2.1.1` — `versionCode 6` — from here on.

### Signed release (Play Store)

1. Create a keystore once:

   ```powershell
   & "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot\bin\keytool.exe" -genkeypair `
     -keystore dxn-release.jks -alias dxn -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Base64 it: `[Convert]::ToBase64String([IO.File]::ReadAllBytes('dxn-release.jks'))`

3. Add secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS` (`dxn`), `ANDROID_KEY_PASSWORD`.

4. Push a tag: `git tag v2.1.1; git push origin v2.1.1`

### Google Play

1. Play Console → **Create app** → upload `dxn-stockpoint-2.1.1.aab`.
2. Store listing needs: 512×512 icon, 1024×500 feature graphic, 2+ screenshots,
   short + full description, and a privacy policy URL — use
   <https://abraar05.github.io/dxn-stockpoint/privacy.html>
   (source: [`PRIVACY_POLICY.md`](../PRIVACY_POLICY.md)).
3. Data safety: no analytics, no ads, no third-party SDKs. Declare *collected –
   order management* for customer name/phone (optional fields the shopkeeper
   types in), transmitted to **the shop's own server**; not shared with third
   parties. Nothing else is collected.
4. Internal testing first, then production.

### Local build

```powershell
powershell -ExecutionPolicy Bypass -File scripts/provision-android.ps1   # once
powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
```

---

## 6. Point everything at the same API

The two clients are only "live synced" because they share one origin:

| Client | Where to set it |
|---|---|
| Web | Settings → Connection → API base |
| Android | Settings → Server URL (default `http://10.0.2.2:8099` for the emulator) |

Use the bare origin, with or without `https://` — both clients normalise it
(`…/api/v1` and `/index.php` are stripped automatically).

---

## 7. Day-to-day operations

| Task | How |
|---|---|
| Open the shop | Web app URL or the Android app; both work offline |
| Make a sale | Catalog → add → Cart → **Place order**; print or WhatsApp the slip |
| Offline sale | Same steps; the sale queues and the strip shows *Offline · 1 queued* |
| Receive stock | Admin → stock icon on a product → delta `+24` (or absolute count) |
| Change the PIN | Settings → Account → Change PIN |
| Export data | Orders/Admin → **CSV**; Settings → **Backup JSON** |
| Back up the database | InfinityFree → phpMyAdmin → Export |
| Update the API | `git push` to `main`, or re-upload over FTP |
| Check the API | `GET /api/v1/health` and `GET /api/v1/sync/status` |

### Security notes

- `api/config/config.php` holds the MySQL password and the HMAC secret: never
  commit it, never paste it into an issue.
- `api/config/.htaccess`, `api/src/.htaccess` and `api/storage/.htaccess` deny
  all web access to those folders — keep them in every upload.
- PIN logins are rate-limited (8 failures / 15 min / IP) and tokens expire after
  30 days. Rotating `token_secret` invalidates every token at once.
- Everything is HTTPS: InfinityFree gives you a free certificate, and
  `api/public/.htaccess` force-redirects plain HTTP.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Web says *Cannot reach the API* | wrong origin, or HTTPS/CORS | Re-check Settings → Connection; `curl …/api/v1/health` |
| `database_unavailable` | MySQL host is `localhost` | Use `sqlNNN.infinityfree.com` |
| `404` on every endpoint | `.htaccess` not uploaded | Re-upload `api/public/.htaccess` |
| `403 ordering_disabled` | public orders turned off | Admin → Settings → allow public orders |
| `409 insufficient_stock` | someone else sold it first | Refresh; the queue marks the order failed |
| Android can't reach the API | phone can't see `10.0.2.2` | Use the public InfinityFree URL |
| Release APK unsigned | no keystore secrets | Add the four signing secrets, or ship the debug APK |
| Pages shows a blank page | wrong Pages source | Settings → Pages → Source: GitHub Actions |
