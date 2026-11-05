# Deployment - all free, forever tiers

This is the complete path from this repository to a live stockpoint where the
laptop browser and the Android phone show the same stock, the same orders and the
same dashboard.

Total cost: **$0**. Services used:

| Piece | Service | Free-tier limit that matters |
|---|---|---|
| API + MySQL | ByetHost | 5 GB disk, unlimited bandwidth, 400 databases, no Node |
| Web app | GitHub Pages | 100 GB/month, 1 GB site |
| Android build + download | GitHub Actions + Releases | 2 000 CI minutes/month |
| Play Store (optional) | Google Play Console | one-off $25 registration |

> **Why ByetHost and not InfinityFree?** InfinityFree puts a JavaScript
> anti-bot challenge in front of every request. Native Android clients cannot
> solve it, and `OPTIONS` preflights are challenged too, so the web app's CORS
> calls fail. ByetHost serves the same PHP 8 + MySQL stack with no challenge.

---

## 0. What you need first

- The repository pushed to `https://github.com/aiforabraar-debug/dxn-stockpoint`.
- A ByetHost account (free signup at <https://byet.host/signup.php>, email
  activation required).
- For CI deploys: **Settings → Secrets and variables → Actions**.

---

## 1. Create the ByetHost host + database

1. Sign up at <https://byet.host/signup.php> and pick a subdomain, e.g.
   `dxnstock.byethost7.com`.
2. Activate the account from the email link.
3. Open the control panel - **HTTP only**:
   <http://cpanel.byethost7.com>.
4. Go to **MySQL Databases → Create New Database**, name it `dxn`. The panel
   prefixes it, producing `b7_43359047_dxn`.
5. Write down the values:
   - Host - `sql209.byethost7.com` *(never `localhost`)*
   - Database - `b7_43359047_dxn`
   - Username - `b7_43359047`
   - Password - your vPanel password

> SSL is automatic on `*.byethost7.com` subdomains. The panel's **SSL/TLS**
> page confirms it: *"Subdomains have SSL automatically enabled."* HTTPS starts
> working as soon as the vhost finishes provisioning.

### Create `api/config/config.php`

Two ways, pick one:

**a) File Manager (no tooling needed)**
Control Panel → **Online File Manager** → `htdocs/api/config/` → create
`config.php` with the contents of [`api/config/config.sample.php`](../api/config/config.sample.php),
filling in:

```php
'driver' => 'mysql',
'db' => [
    'host' => 'sql209.byethost7.com',
    'name' => 'b7_43359047_dxn',
    'user' => 'b7_43359047',
    'pass' => 'your-panel-password',
],
'admin_key'      => 'paste-64-random-hex-chars',
'install_key'    => 'paste-another-random-string',
'allowed_origins'=> '*',
```

Generate the random strings locally:

```powershell
-join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
```

**b) Local file + FTP upload** - copy the sample to `api/config/config.php`,
edit it, upload with FileZilla to `htdocs/api/config/config.php`.
It is git-ignored and the deploy workflow explicitly excludes it, so CI will
never overwrite it.

---

## 2. Upload the API

### Option A - GitHub Actions (recommended, repeatable)

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**:

   | Secret | Value |
   |---|---|
   | `FTP_SERVER` | `ftpupload.net` (ByetHost FTP host) |
   | `FTP_USERNAME` | `b7_43359047` |
   | `FTP_PASSWORD` | your vPanel password |

2. Push to `main` (or run **Actions → Deploy API (ByetHost) → Run workflow**).

The workflow lints every PHP file, boots the API against a throwaway SQLite
database, runs a smoke suite, and only then mirrors:

```
htdocs/api/index.php     ← api/public/index.php
htdocs/api/install.php   ← api/public/install.php
htdocs/api/.htaccess     ← api/public/.htaccess
htdocs/api/src/**        ← api/src/**
htdocs/api/config/**     ← api/config/**   (config.php excluded)
htdocs/api/storage/**    ← api/storage/**  (guard file only)
```

> PowerShell FTP alternative: `WinSCP` or `FTP-Deploy-Action` locally; the
> layout above is the only thing that matters.

### Option B - manual

Upload the same four folders into `htdocs/api/` with FileZilla. Keep
`config.php`, `installed.lock`, and all storage/database files on the server.

Quick manual upload with curl:

```powershell
$ftp = "ftp://ftpupload.net/htdocs/api"
curl.exe -s -T api/public/index.php   -u "b7_43359047:PASSWORD" "$ftp/index.php"
curl.exe -s -T api/public/install.php -u "b7_43359047:PASSWORD" "$ftp/install.php"
curl.exe -s -T api/public/.htaccess   -u "b7_43359047:PASSWORD" "$ftp/.htaccess"
# create the folders first: ftp://ftpupload.net/htdocs/api/{src,config,storage}
```

---

## 3. Install the database (once)

Open in a browser:

```
https://dxnstock.byethost7.com/api/install.php?key=<install_key>
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
curl.exe https://dxnstock.byethost7.com/api/v1/health
curl.exe "https://dxnstock.byethost7.com/api/v1/products?per_page=200"
```

Expected: `{"success":true,"status":"ok","version":"2.2.0","driver":"mysql",...}`
and 51 products.

Check CORS preflight (the Android/web clients rely on it):

```powershell
curl.exe -i -X OPTIONS https://dxnstock.byethost7.com/api/v1/orders `
  -H "Origin: https://aiforabraar-debug.github.io" `
  -H "Access-Control-Request-Method: POST"
```

> If you see `database_unavailable`, the DB host/user/pass in `config.php` are
> wrong - ByetHost always uses `sqlNNN.byethost7.com`, not `localhost`.

---

## 4. Publish the web app (GitHub Pages)

Already wired: `pages.yml` publishes `docs/` on every push that touches it.

1. Repo → **Settings → Pages** → Source: **GitHub Actions**.
2. Push to `main`, or run **Actions → Deploy web app → Run workflow**.
3. Open <https://aiforabraar-debug.github.io/dxn-stockpoint/>.
4. **Settings → Connection** → the default is already
   `https://dxnstock.byethost7.com` → **Test connection** → **Save & sync**.
   The pill in the header turns green and reads **Live**.

The app is a PWA: on Android Chrome use **Install app**, on desktop use the
install icon in the address bar. It then launches offline with the last cached
catalogue.

---

## 5. Build & ship the Android app

### Automatic

`build.yml` runs on every push that touches `android/`. It produces:

- `dxn-stockpoint-2.2.0-debug.apk` - sideloadable, no signing setup needed
- `dxn-stockpoint-2.2.0.aab` - for Google Play
- `dxn-stockpoint-latest.apk` - the signed release when secrets exist, otherwise the debug APK

Both are attached to the **v2.2.0** GitHub Release.

### Signed release (Play Store)

1. Create a keystore once:

   ```powershell
   & "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot\bin\keytool.exe" -genkeypair `
     -keystore dxn-release.jks -alias dxn -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Base64 it: `[Convert]::ToBase64String([IO.File]::ReadAllBytes('dxn-release.jks'))`

3. Add secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS` (`dxn`), `ANDROID_KEY_PASSWORD`.

4. Push a tag: `git tag v2.2.0; git push origin v2.2.0`

### Google Play

1. Play Console → **Create app** → upload `dxn-stockpoint-2.2.0.aab`.
2. Store listing needs: 512x512 icon, 1024x500 feature graphic, 2+ screenshots,
   short + full description, and a privacy policy URL - use
   <https://aiforabraar-debug.github.io/dxn-stockpoint/privacy.html>
   (source: [`PRIVACY_POLICY.md`](../PRIVACY_POLICY.md)).
3. Data safety: no analytics, no ads, no third-party SDKs. Declare *collected -
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
| Android | Settings → Server URL (default is the live ByetHost API) |

Use the bare origin, with or without `https://` - both clients normalise it
(`./api/v1` and `/index.php` are stripped automatically).

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
| Back up the database | ByetHost panel → phpMyAdmin → Export |
| Update the API | `git push` to `main`, or re-upload over FTP |
| Check the API | `GET /api/v1/health` and `GET /api/v1/sync/status` |

### Security notes

- `api/config/config.php` holds the MySQL password and the HMAC secret: never
  commit it, never paste it into an issue.
- `api/config/.htaccess`, `api/src/.htaccess` and `api/storage/.htaccess` deny
  all web access to those folders - keep them in every upload.
- PIN logins are rate-limited (8 failures / 15 min / IP) and tokens expire after
  30 days. Rotating `token_secret` invalidates every token at once.
- Everything is HTTPS: ByetHost enables SSL automatically on subdomains, and
  `api/public/.htaccess` force-redirects plain HTTP.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `DNS Resolution Error - Domain Not Found` | vhost still provisioning | Wait 15-60 min, then reload `https://dxnstock.byethost7.com/` |
| Web says *Cannot reach the API* | wrong origin, or HTTPS/CORS | Re-check Settings → Connection; `curl ./api/v1/health` |
| `database_unavailable` | MySQL host is `localhost` | Use `sqlNNN.byethost7.com` |
| `404` on every endpoint | `.htaccess` not uploaded | Re-upload `api/public/.htaccess` |
| `403 ordering_disabled` | public orders turned off | Admin → Settings → allow public orders |
| `409 insufficient_stock` | someone else sold it first | Refresh; the queue marks the order failed |
| Android can't reach the API | phone has the old default | Settings → Server URL → `https://dxnstock.byethost7.com` |
| Release APK unsigned | no keystore secrets | Add the four signing secrets, or ship the debug APK |
| Pages shows a blank page | wrong Pages source | Settings → Pages → Source: GitHub Actions |
