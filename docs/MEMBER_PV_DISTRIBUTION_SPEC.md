# DXN Stockpoint — Member Login & PV Distribution (Enterprise)

Separate member-facing auth + staff PV distribution layer on top of the existing stockpoint API.

## Architecture
- **Member auth**: HMAC bearer tokens, role `member`, separate from admin `auth/login`
- **Staff auth**: existing `Auth::requireAdmin()` (role `admin` / `X-Api-Key`)
- **PV source of truth**: `customers.total_pv` (running balance) + `pv_distributions` audit ledger
- **Idempotency**: every distribution carries a `reference_id` (order UUID or manual ref) to prevent double-credit on retry

## Database migration (`api/migrations/2026_member_pv.sql`)

```sql
-- Member login credentials (separate from admin PIN)
CREATE TABLE IF NOT EXISTS member_auth (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    customer_id   BIGINT       NOT NULL,
    member_id     VARCHAR(40)  NOT NULL,
    pin_hash      VARCHAR(255) NOT NULL,
    created_at    DATETIME     NOT NULL,
    updated_at    DATETIME     NOT NULL,
    rev           BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_member_auth_member (member_id),
    KEY idx_member_auth_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PV distribution audit ledger (append-only, never delete)
CREATE TABLE IF NOT EXISTS pv_distributions (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    member_id      VARCHAR(40)  NOT NULL,
    staff_id       BIGINT       NULL,
    pv_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
    reason         VARCHAR(160) NOT NULL,
    reference_type VARCHAR(32)  NULL,      -- 'order' | 'manual' | 'adjustment'
    reference_id   VARCHAR(64)  NULL,      -- order_number or manual ref
    created_at     DATETIME     NOT NULL,
    rev            BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pv_dist_ref (reference_type, reference_id),
    KEY idx_pv_dist_member (member_id),
    KEY idx_pv_dist_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index for fast member lookup by member_id
ALTER TABLE customers ADD UNIQUE KEY uk_customers_member (dxn_member_id);
```

## API contract

### Member (public, no bearer token until logged in)

| Endpoint | Method | Body / Query | Auth |
|---|---|---|---|
| `POST /api/v1/member/login` | POST | `{ member_id, pin }` | none |
| `GET /api/v1/member/me` | GET | — | Bearer token (role=member) |
| `GET /api/v1/member/pv-history` | GET | `?limit=50&offset=0` | Bearer token (role=member) |

Login response:
```json
{
  "success": true,
  "token": "<hmac bearer token>",
  "expires_at": "2026-...",
  "role": "member",
  "member": {
    "id": 123,
    "member_id": "DXN123456",
    "name": "John Doe",
    "phone": "017xxxxxxxx",
    "total_pv": 450.00,
    "total_orders": 8,
    "total_spent": 12500.00
  }
}
```

### Staff (admin only)

| Endpoint | Method | Body / Query | Auth |
|---|---|---|---|
| `POST /api/v1/staff/pv-distribute` | POST | `{ member_id, pv_amount, reason, reference_type, reference_id }` | Bearer (role=admin) |
| `GET /api/v1/staff/members` | GET | `?q=&limit=100` | Bearer (role=admin) |
| `GET /api/v1/staff/pv-distributions` | GET | `?q=&limit=100&offset=0` | Bearer (role=admin) |

Distribute response:
```json
{
  "success": true,
  "distribution": {
    "id": 9001,
    "member_id": "DXN123456",
    "pv_amount": 50.00,
    "reason": "Product purchase bonus",
    "reference_type": "order",
    "reference_id": "DXN-20261107-001",
    "new_balance": 500.00,
    "created_at": "2026-11-07T..."
  }
}
```

## Security
- Member PIN hashed with `password_hash()` / `password_verify()`
- Brute-force guard on member login (same `auth_attempts` table, tracked by member_id + IP)
- HMAC token with 30-day TTL, role claim `member`
- Staff distribution requires admin role; every distribution writes an audit row
- `pv_distributions` has a UNIQUE key on `(reference_type, reference_id)` — retry-safe
- All money/PV values use `DECIMAL(12,2)` — never float

## Android app — member screens

1. **Member Login** — member_id + PIN, "Remember me", "Forgot PIN" (contacts stockpoint)
2. **Member Dashboard** — PV balance, member tier, total orders, total spent, quick actions (View PV history, Scan order QR)
3. **PV History** — list of distributions: date, reason, PV ±, running balance, reference
4. **Order PV lookup** — enter order number to see PV earned from that order

## Android app — staff screens (added to existing staff app)

5. **Staff: PV Distribution** — search member by ID/name/phone, enter PV amount + reason, optional order reference, confirm → POST distribute
6. **Staff: Member Directory** — searchable list of members with PV balance
7. **Staff: PV Audit Log** — all distributions with staff attribution, filterable by date/member

## Build script
`scripts/build-member-pv.sh` generates all files below and runs the API smoke test.