# DXN Stockpoint — Local Backend Server

A zero-cost, offline-first Node.js + Express + SQLite API server for managing DXN products, orders, and stock.

## Setup

```bash
cd backend
npm install
```

## Seed Sample Products

```bash
npm run seed
```

This will insert 12 real DXN products into the local database.

## Run the Server

```bash
npm start          # production
npm run dev        # with auto-reload (nodemon)
```

Server starts at `http://localhost:3000`

## Expose to Internet (Free HTTPS Tunnel)

```bash
# Option A — Ngrok
npx ngrok http 3000

# Option B — Cloudflare Tunnel (no account needed)
cloudflared tunnel --url http://localhost:3000
```

Copy the generated HTTPS URL (e.g. `https://dxn-abc123.trycloudflare.com`) and paste it into the Android app's Settings screen as the Base URL.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/products` | List all products |
| `POST` | `/api/v1/products` | Add a new product |
| `PUT` | `/api/v1/products/:id` | Edit a product |
| `POST` | `/api/v1/stock/update` | Update stock quantity |
| `GET` | `/api/v1/orders` | List all orders (last 100) |
| `GET` | `/api/v1/orders/:id` | Get order with items |
| `POST` | `/api/v1/orders` | Place a new order |
| `GET` | `/api/v1/dashboard` | Dashboard stats |

### POST `/api/v1/orders` — Request Body
```json
{
  "customerName": "John Doe",
  "isMember": true,
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 5, "quantity": 1 }
  ]
}
```

### POST `/api/v1/stock/update` — Request Body
```json
{
  "productId": 3,
  "newQuantity": 50
}
```

### POST `/api/v1/products` — Request Body
```json
{
  "sku": "DXN-CUSTOM-01",
  "name": "Custom Product",
  "category": "Supplements",
  "retail_price": 100.0,
  "member_price": 80.0,
  "pv_points": 52.0,
  "stock_qty": 30
}
```

