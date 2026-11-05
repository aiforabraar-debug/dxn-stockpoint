# Verifies that the live API speaks exactly the contract the Android client is
# bound to (snake_case fields, revision sync, idempotent orders).
#
#   powershell -ExecutionPolicy Bypass -File scripts/verify-android-contract.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/verify-android-contract.ps1 -Base http://127.0.0.1:8099 -Pin 2468
#
param(
    [string]$Base = 'http://127.0.0.1:8099',
    [string]$Pin  = '2468'
)

$ErrorActionPreference = 'Stop'
$script:pass = 0
$script:fail = 0

function Check([string]$name, [bool]$ok, [string]$detail = '') {
    if ($ok) {
        $script:pass++
        Write-Host ("  ok   {0}" -f $name) -ForegroundColor DarkGreen
    } else {
        $script:fail++
        Write-Host ("  FAIL {0} {1}" -f $name, $detail) -ForegroundColor Red
    }
}

function Get-Json([string]$path, [string]$token = '') {
    $headers = @{}
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    try {
        return Invoke-RestMethod -Uri "$Base$path" -Headers $headers -TimeoutSec 15
    } catch {
        return $null
    }
}

function Post-Json([string]$path, $body, [string]$token = '') {
    $headers = @{ 'Content-Type' = 'application/json' }
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    $json = $body | ConvertTo-Json -Depth 8 -Compress
    try {
        return Invoke-RestMethod -Uri "$Base$path" -Method Post -Headers $headers -Body $json -TimeoutSec 15
    } catch {
        $response = $_.Exception.Response
        if ($response) {
            $reader = New-Object IO.StreamReader($response.GetResponseStream())
            return ($reader.ReadToEnd() | ConvertFrom-Json)
        }
        return $null
    }
}

Write-Host "`nMohammadpur Stock Point — Android API contract check against $Base`n"

# ── 1. Health ───────────────────────────────────────────────────────────────
$health = Get-Json '/api/v1/health'
Check 'health returns success' ($health.success -eq $true)
Check 'health reports version 2.1.2' ($health.version -eq '2.1.2') "got '$($health.version)'"
Check 'health exposes server_rev' ($null -ne $health.server_rev)

# ── 2. Public sync (the anonymous catalogue pull) ───────────────────────────
$sync = Get-Json '/api/v1/sync?since=0'
Check 'public sync succeeds' ($sync.success -eq $true)
Check 'public sync hides orders' (@($sync.orders).Count -eq 0)
Check 'public sync hides settings' ($null -eq $sync.settings)
Check 'public sync has products' (@($sync.products).Count -ge 12) "got $(@($sync.products).Count)"

$p = @($sync.products)[0]
foreach ($field in 'id','sku','name','category','retail_price','member_price','pv_points','stock_qty','low_stock_at','is_active','rev') {
    Check "product serialises '$field'" ($null -ne $p.$field)
}

# ── 3. Shop PIN login (HMAC bearer) ─────────────────────────────────────────
$login = Post-Json '/api/v1/auth/login' @{ pin = $Pin }
Check 'PIN login returns a token' (-not [string]::IsNullOrWhiteSpace($login.token))
Check 'PIN login returns expiry' (-not [string]::IsNullOrWhiteSpace($login.expires_at))
$token = $login.token

$me = Get-Json '/api/v1/auth/me' $token
Check 'token identifies an admin' ($me.role -eq 'admin')

$badLogin = Post-Json '/api/v1/auth/login' @{ pin = 'definitely-wrong' }
Check 'wrong PIN is rejected' ($badLogin.success -eq $false)

# ── 4. Admin sync ───────────────────────────────────────────────────────────
$adminSync = Get-Json '/api/v1/sync?since=0' $token
Check 'admin sync reports admin scope' ($adminSync.scope -eq 'admin')
Check 'admin sync includes settings' ($null -ne $adminSync.settings)
Check 'admin settings redact nothing sensitive' ($null -ne $adminSync.settings.branch_name)

# ── 5. Idempotent order create (what CartScreen pushes) ─────────────────────
$product = @($sync.products | Where-Object { $_.stock_qty -gt 0 })[0]
$uuid = [guid]::NewGuid().ToString()
$orderBody = @{
    client_uuid   = $uuid
    customer_name = 'Android Contract Check'
    customer_phone = '01700000000'
    dxn_member_id = 'DXN-TEST-01'
    is_member     = $true
    payment_method = 'CASH'
    source        = 'android'
    items         = @(@{ product_id = $product.id; quantity = 1 })
}

$created = Post-Json '/api/v1/orders' $orderBody
Check 'order create succeeds' ($created.success -eq $true)
Check 'order has a number' (-not [string]::IsNullOrWhiteSpace($created.order.order_number)) "got '$($created.order.order_number)'"
Check 'order is priced by the server' ([double]$created.order.total_amount -gt 0)
Check 'order line keeps snake_case fields' ($null -ne $created.order.items[0].line_total)
Check 'order echoes the client_uuid' ($created.order.client_uuid -eq $uuid)
Check 'member pricing applied' ([double]$created.order.items[0].unit_price -eq [double]$product.member_price)

$replay = Post-Json '/api/v1/orders' $orderBody
Check 'replay is de-duplicated' ($replay.duplicate -eq $true)
Check 'replay returns the same order' ($replay.order.order_number -eq $created.order.order_number)

# ── 6. Stock decremented exactly once ───────────────────────────────────────
$after = Get-Json "/api/v1/products/$($product.id)"
Check 'stock moved by exactly one unit' (([int]$product.stock_qty - [int]$after.product.stock_qty) -eq 1) `
    "was $($product.stock_qty), now $($after.product.stock_qty)"

# ── 7. Oversell is refused with 409 ─────────────────────────────────────────
$oversell = Post-Json '/api/v1/orders' @{
    client_uuid = [guid]::NewGuid().ToString()
    customer_name = 'Oversell Check'
    source = 'android'
    items = @(@{ product_id = $product.id; quantity = 999999 })
}
Check 'oversell returns an error' ($oversell.success -eq $false)
Check 'oversell names the code' ($oversell.error.code -eq 'insufficient_stock') "got '$($oversell.error.code)'"

# ── 8. Dashboard keys match the Kotlin model ────────────────────────────────
$dash = Get-Json '/api/v1/dashboard' $token
foreach ($field in 'total_orders','total_revenue','total_pv','today_orders','today_revenue','total_products','stock_units','stock_value','low_stock_count','low_stock_products','top_products','recent_orders','sales_by_day') {
    Check "dashboard serialises '$field'" ($null -ne $dash.data.$field)
}

# ── 9. Order status + stock adjust ──────────────────────────────────────────
$status = Post-Json "/api/v1/orders/$($created.order.id)/status" @{ status = 'PACKED' } $token
Check 'order status updates' ($status.order.status -eq 'PACKED')

$adjust = Post-Json '/api/v1/stock/adjust' @{ productId = $product.id; delta = 2; reason = 'contract-check' } $token
Check 'stock adjust succeeds' ($adjust.success -eq $true)
Check 'stock adjust returns the new count' ($adjust.stock_qty -eq ([int]$after.product.stock_qty + 2))

# ── 10. Settings reachable by both clients ──────────────────────────────────
$settings = Get-Json '/api/v1/settings' $token
Check 'settings expose branch_name' (-not [string]::IsNullOrWhiteSpace($settings.settings.branch_name))
$publicSettings = Get-Json '/api/v1/settings'
Check 'settings are readable without a token' ($publicSettings.success -eq $true)
Check 'anonymous settings hide the PIN hash' ($null -eq $publicSettings.settings.admin_pin_hash)

Write-Host ""
if ($script:fail -eq 0) {
    Write-Host ("PASS  {0} checks" -f $script:pass) -ForegroundColor Green
    exit 0
} else {
    Write-Host ("FAILED  {0} passed, {1} failed" -f $script:pass, $script:fail) -ForegroundColor Red
    exit 1
}
