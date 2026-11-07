# DXN Stockpoint — Member Android App (PV Distribution)

Separate app from the staff/stockpoint app. Members log in with DXN member ID + PIN
to view their PV balance and distribution history.

## Package
- `com.dxn.stockpoint.member` (distinct from staff app)
- Kotlin + Jetpack Compose
- Minimum SDK 21, target SDK 34

## Screens

### 1. Member Login
- Fields: Member ID (DXNxxxxxx), PIN (4-6 digits, numeric)
- "Remember me" checkbox (stores member_id locally, never the PIN)
- "Forgot PIN?" → shows stockpoint WhatsApp number (from /api/v1/config)
- POST /api/v1/member/login → saves bearer token to EncryptedSharedPreferences
- On success → Member Dashboard

### 2. Member Dashboard
- Big PV balance (e.g. "1,250.00 PV")
- Member tier badge (from member_id prefix or custom logic)
- Total orders, total spent
- Quick chips: "View PV History", "Scan Order QR", "Contact Stockpoint"
- Logout button (clears token, returns to login)

### 3. PV History
- List: date, reason, PV amount (green +), reference (order # or manual)
- Running balance column
- Pull-to-refresh
- Empty state: "No PV distributions yet"

### 4. Settings (member)
- Change PIN (requires current PIN + new PIN)
- App version, privacy policy link
- Logout

## API calls (all with Bearer token, role=member)

| Call | Endpoint | Method |
|---|---|---|
| Login | /api/v1/member/login | POST |
| Profile + PV balance | /api/v1/member/me | GET |
| PV history | /api/v1/member/pv-history | GET |
| Public config (branch, phone) | /api/v1/config | GET |

## Models (Kotlin data classes)

```kotlin
data class MemberProfile(
    val id: Int,
    val memberId: String,
    val name: String,
    val phone: String?,
    val totalPv: Double,
    val totalOrders: Int,
    val totalSpent: Double,
)

data class PvDistribution(
    val id: Int,
    val memberId: String,
    val staffId: Int?,
    val pvAmount: Double,
    val reason: String,
    val referenceType: String?,
    val referenceId: String?,
    val createdAt: String,
)
```

## Network
- Reuse `ChallengeInterceptor` if InfinityFree serves the AES challenge on this domain
- Token expiry: 30 days; auto-redirect to login on 401
- Retry with exponential backoff on network failure

## Staff app additions (existing staff app gets 3 new screens)

### Staff: PV Distribution
- Search member by ID / name / phone
- Enter PV amount + reason
- Optional: link to an order number (idempotency reference)
- Confirm → POST /api/v1/staff/pv-distribute
- Shows new balance after success

### Staff: Member Directory
- Searchable list: member ID, name, phone, total PV
- Tap to open quick-distribute dialog

### Staff: PV Audit Log
- All distributions, filterable by date range / member
- Export to CSV option
