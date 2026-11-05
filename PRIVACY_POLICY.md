# Privacy Policy — Mohammadpur Stock Point POS

**Last updated:** 1 November 2026
**Applies to:** the Android app (`com.dxn.stockpoint`) and the web app at
<https://abraar05.github.io/dxn-stockpoint/>

Mohammadpur Stock Point is a point-of-sale and stock-control tool for a single DXN
distributor's shop. It is not a consumer social app: it records the sales the
shopkeeper enters, and nothing else.

The short version: there are no analytics, no advertising, no trackers and no
third-party SDKs. Everything the app records goes to the shop's own server —
the one the shopkeeper runs at their own domain — or stays on the device.

---

## 1. What is collected

Only what the shopkeeper types in:

| Data | Why | Where it ends up |
|---|---|---|
| Product catalogue, prices, PV points, stock counts | To price a sale and track stock | Your own server + on-device cache |
| Order records: order number, line items, totals, payment method, date, status | To keep the sales ledger and print/deliver a receipt | Your own server + on-device cache |
| Customer name and phone number | Optional. Only stored when the shopkeeper enters them for a saved customer or a WhatsApp receipt | Your own server + on-device cache |
| DXN member ID | Optional. Used to apply member pricing | Your own server + on-device cache |
| A free-text note on an order | Optional | Your own server + on-device cache |
| Shop settings: branch name, currency, receipt footer, WhatsApp number | To render the app and receipts | Your own server + on-device cache |
| A shop PIN | To unlock the admin screens | Stored **only** as a bcrypt hash on your server; never on the device and never in a token |

**Not collected:** location, contacts, calendar, photos, camera, microphone,
advertising ID, device identifiers, usage analytics, crash telemetry, or
anything about the person holding the phone.

## 2. Where it lives

- **On the device.** The Android app keeps a JSON snapshot of products and
  orders, plus a queue of sales that have not synced yet, in app-private
  storage (`SharedPreferences` + files under the app's `filesDir`). The web
  app keeps the same data in the browser's `localStorage`. Both are cleared
  when the app data is cleared.
- **On your server.** If a server URL is configured, the data is sent over
  HTTPS to the PHP + MySQL API that the shopkeeper deployed (for example on
  InfinityFree). That server is operated by the shop, not by the app author.
  The app author has no access to it and receives no copy of the data.

## 3. Permissions and why each is needed

| Permission | Purpose |
|---|---|
| `INTERNET` | Talking to the shop's own API over HTTPS |
| `ACCESS_NETWORK_STATE` | Detecting whether a sale can be sent now or must be queued for later |

The app declares no other permissions.

## 4. When data leaves the device

- **To the shop's API** — during sync, when a sale is placed, and when stock
  or settings are changed. This is HTTPS to the origin the shopkeeper entered
  in Settings.
- **To WhatsApp** — only when the shopkeeper taps *Send via WhatsApp*. The app
  opens a `https://wa.me/…` deep link with a pre-written receipt. Nothing is
  sent until that tap, and the message then travels through WhatsApp under
  WhatsApp's own privacy policy.
- **To nobody else.** There is no upload to the app author, no cloud backup
  operated by the author, and no data broker.

## 5. Retention and deletion

- On the device: *Settings → Reset device* clears the cache, the queue and the
  stored token.
- On the server: the shopkeeper owns the MySQL database and can delete order
  rows, customers or the whole database from phpMyAdmin (or by re-running the
  installer on a fresh database).
- Uninstalling the app removes all local data with it.

## 6. Children

The app is a business tool and is not directed at children under 13. It does
not knowingly record any information about a child; any customer name entered
is supplied by the shopkeeper for their own customer records.

## 7. Security

- Transport is HTTPS; the shipped web config redirects plain HTTP to HTTPS.
- The admin PIN is verified against a bcrypt hash and exchanged for a signed,
  expiring token; the PIN itself is never stored on the device.
- Failed PIN attempts are rate-limited per IP address.

No system is perfectly secure. If the phone is lost or shared, change the shop
PIN and rotate `token_secret` in the server config, which invalidates every
issued token at once.

## 8. Changes

Material changes to this policy will be committed to this repository, so the
history at
<https://github.com/abraar05/dxn-stockpoint/commits/main/PRIVACY_POLICY.md>
is the record of what changed and when.

## 9. Contact

Questions, corrections or a data request:
<https://github.com/abraar05/dxn-stockpoint/issues>
