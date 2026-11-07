# DXN Stockpoint — Customer / Client App Spec

Separate app from the staff/stockpoint app. No admin PIN, no stock management, no sync.
Purely: browse catalogue, place orders, track orders.

## Target users
- Walk-in / regular customers of the DXN stockpoint
- DXN members (with member ID) and non-members
- Places orders for cash/COD pickup or delivery

## API contract (all public, no bearer token required)

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /api/v1/health` | GET | Health check / install status |
| `GET /api/v1/config` | GET | Public settings (branch name, currency, phone, address) |
| `GET /api/v1/products` | GET | Active catalogue (server filters `is_active = 1`) |
| `GET /api/v1/products/{id}` | GET | Single product detail |
| `POST /api/v1/orders` | POST | Place an order (idempotent via `client_uuid`) |
| `GET /api/v1/orders/{id}` | GET | View one order (by number, matched by phone/name) |
| `GET /api/v1/courier/status/{id}` | GET | Courier tracking for a shipped order |
| `GET /api/v1/courier/balance` | GET | (Optional) show if COD available |

Order create body (from `OrderController::create`):
```json
{
  "client_uuid": "<device-generated UUID, retry-safe>",
  "customer_name": "John Doe",
  "customer_phone": "017xxxxxxxx",
  "dxn_member_id": "DXN123456",   // optional
  "is_member": false,            // optional
  "payment_method": "CASH",      // CASH | BKA | NAGAD | ROCKET | CARD
  "note": "",                    // optional
  "items": [
    { "product_sku": "DXN-...", "quantity": 2 },
    { "product_id": 42, "quantity": 1, "unit_price": 250, "unit_pv": 10 }
  ]
}
```
Idempotency: re-sending the same `client_uuid` returns the existing order (`duplicate: true`) instead of creating a second one.

## App screens

### 1. Home / Catalogue
- Search bar (by name or SKU)
- Category filter chips (from `categories` in product list)
- Grid of active products: image, name, category, retail price, member price, PV points, stock badge ("In stock" / "Low stock" / "Out of stock")
- "Add to cart" / "+" on each product card
- Floating cart badge with item count

### 2. Product detail
- Larger image, full name, category, description
- Retail price vs member price (show member price only if member toggle on)
- PV points
- Quantity stepper (bounded by available stock_qty)
- "Add to cart" (disabled if out of stock)

### 3. Cart
- List: product thumb, name, qty stepper, line total, remove button
- Subtotal, discount (manual input), grand total, total PV
- Currency from public settings
- "Proceed to checkout" (disabled when empty)

### 4. Checkout / Place order
Fields:
- Customer name (required)
- Customer phone (required)
- DXN member ID (optional)
- "I am a DXN member" toggle (switches to member_price)
- Payment method: CASH / bKash / Nagad / Rocket / Card
- Notes (optional)
- Order summary (items, subtotal, discount, total, PV)
- "Place order" button → POST `/api/v1/orders`

On success: show order number, status (CONFIRMED), total, and a "Track order" / "View receipt" action.
Store `client_uuid` locally so a retry after network loss is safe.

### 5. Order tracking
- Enter order number OR phone number to look up an order
- Show: order number, date, customer, status badge (CONFIRMED/PACKED/DELIVERED/CANCELLED/RETURNED), payment method, items, total
- If courier shipped: consignment ID + tracking code + courier status (from `/courier/status/{id}`)
- "Print receipt" / "Share receipt" (plain text from `receiptText`)

### 6. Settings / About (customer-facing, read-only)
- Branch name, address, phone (from `/api/v1/config`)
- Currency
- "Ordering enabled" flag (if disabled, show a message and hide checkout)
- App version, privacy link

### 7. Member toggle (global)
- Persist `is_member` preference locally so prices shown across the app reflect member vs retail.

## Key behaviors

- **Offline-first queue:** if `POST /orders` fails (no network), persist the order payload + `client_uuid` to local DB and show "Order queued — will send when back online". Auto-retry on app open / connectivity change.
- **Price toggle:** member vs retail price applied at product list + detail; also sent as `is_member` at checkout so the server bills correctly.
- **Stock awareness:** "Add to cart" greyed out when `stock_qty` is 0; cart qty capped at `stock_qty`.
- **No login screen:** customers order as guests identified by name + phone (+ optional member ID). No admin PIN ever appears in this app.
- **Duplicate-safe:** every order gets a random `client_uuid`; retries never double-charge.

## What this app does NOT have (staff app owns these)
- Admin PIN login
- Stock takes / adjustments
- Product create/edit/archive
- Sync revision pulls
- Courier settings / shipping labels
- Dashboard / reports

## Build notes
- Kotlin + Jetpack Compose, same package ID style as the staff app but a distinct applicationId (e.g. `com.dxn.stockpoint.customer`)
- Reuse `ChallengeInterceptor` only if InfinityFree serves the AES challenge to this host too; otherwise plain HTTPS is fine
- Gson model: `CustomerProduct` (id, sku, name, category, retail_price, member_price, pv_points, stock_qty, low_stock_at, image_url, is_active: Int, rev) — **Int, not Boolean** (matching the `is_active` fix)
- Order model uses `client_uuid` for idempotency

## Suggested file layout
```
android/DXNStockpointCustomer/
  app/src/main/java/com/dxn/stockpoint/customer/
    data/model/
      CustomerProduct.kt
      Order.kt
      OrderItem.kt
      ApiResponse.kt
    network/
      ApiClient.kt        (OkHttp + base URL + challenge interceptor if needed)
      ApiService.kt       (endpoints)
    viewmodel/
      CatalogViewModel.kt
      CartViewModel.kt
      CheckoutViewModel.kt
      OrderViewModel.kt
    ui/
      screens/
        HomeScreen.kt
        ProductDetailScreen.kt
        CartScreen.kt
        CheckoutScreen.kt
        OrderTrackingScreen.kt
        SettingsScreen.kt
    local/
      OrderQueueDao.kt    (offline retry queue)
```
