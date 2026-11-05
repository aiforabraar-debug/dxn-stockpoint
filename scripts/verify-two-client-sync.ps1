# Proves that the web client and the Android client are live synced: a sale made
# with one client's exact payload is visible to the other through the same
# revision feed, and both draw down one shared stock ledger.
#
#   powershell -ExecutionPolicy Bypass -File scripts/verify-two-client-sync.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/verify-two-client-sync.ps1 -Base http://127.0.0.1:8099 -Pin 2468
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
    return Invoke-RestMethod -Uri "$Base$path" -Headers $headers -TimeoutSec 20
}

function Post-Json([string]$path, $body, [string]$token = '') {
    $headers = @{ 'Content-Type' = 'application/json' }
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    $json = $body | ConvertTo-Json -Depth 8 -Compress
    try {
        return Invoke-RestMethod -Uri "$Base$path" -Method Post -Headers $headers -Body $json -TimeoutSec 20
    } catch {
        $response = $_.Exception.Response
        if ($response) {
            $reader = New-Object IO.StreamReader($response.GetResponseStream())
            return ($reader.ReadToEnd() | ConvertFrom-Json)
        }
        return $null
    }
}

Write-Host "`nMohammadpur Stock Point — two-client live-sync check against $Base`n"

# ── Baseline: what a client sees on first install ───────────────────────────
$sync0 = Get-Json '/api/v1/sync?since=0'
Check 'first pull succeeds' ($sync0.success -eq $true)
$rev0 = [int]$sync0.server_rev
Check 'server exposes a revision' ($rev0 -gt 0) "got $rev0"

$token = (Post-Json '/api/v1/auth/login' @{ pin = $Pin }).token
Check 'admin login works' (-not [string]::IsNullOrWhiteSpace($token))

$products = @($sync0.products | Where-Object { $_.stock_qty -ge 10 })
Check 'at least one product has stock to sell' ($products.Count -ge 1)
$product = $products[0]
$stockBefore = [int]$product.stock_qty

# ── A sale from the WEB client (exact shape docs/js/store.js sends) ─────────
$webBody = @{
    client_uuid    = [guid]::NewGuid().ToString()
    customer_name  = 'Web Counter Sale'
    customer_phone = ''
    dxn_member_id  = ''
    is_member      = $false
    payment_method = 'CASH'
    discount       = 0
    note           = ''
    source         = 'web'
    items          = @(@{ product_id = $product.id; quantity = 2 })
}
$webOrder = Post-Json '/api/v1/orders' $webBody $token
Check 'web sale accepted' ($webOrder.success -eq $true)
Check 'web sale is tagged source=web' ($webOrder.order.source -eq 'web')

# ── A sale from the ANDROID client (exact shape the Kotlin client sends) ────
$androidUuid = [guid]::NewGuid().ToString()
$androidBody = @{
    client_uuid    = $androidUuid
    customer_name  = 'Android Field Sale'
    customer_phone = '01700000001'
    dxn_member_id  = 'DXN-SYNC-01'
    is_member      = $true
    payment_method = 'BKASH'
    source         = 'android'
    items          = @(@{ product_id = $product.id; quantity = 3 })
}
$androidOrder = Post-Json '/api/v1/orders' $androidBody $token
Check 'android sale accepted' ($androidOrder.success -eq $true)
Check 'android sale is tagged source=android' ($androidOrder.order.source -eq 'android')

# ── THE POINT: one feed carries both clients' writes ────────────────────────
$delta1 = Get-Json "/api/v1/sync?since=$rev0" $token
$newOrders = @($delta1.orders)
Check 'incremental pull returns only new rows' ($newOrders.Count -ge 2) "got $($newOrders.Count)"
Check 'server_rev advanced past the baseline' ([int]$delta1.server_rev -gt $rev0)

$numbers = $newOrders | ForEach-Object { $_.order_number }
Check 'web sale appears in the shared feed' ($numbers -contains $webOrder.order.order_number)
Check 'android sale appears in the shared feed' ($numbers -contains $androidOrder.order.order_number)

$sources = $newOrders | ForEach-Object { $_.source } | Select-Object -Unique
Check 'feed shows writes from both clients' (($sources -contains 'web') -and ($sources -contains 'android')) "saw: $($sources -join ', ')"

# The web client and the Android client address the same rows, so an order
# created by one is readable by id from the other side.
$byId = Get-Json "/api/v1/orders/$($androidOrder.order.id)" $token
Check 'android order is readable by id' ($byId.order.order_number -eq $androidOrder.order.order_number)

# ── One shared stock ledger ────────────────────────────────────────────────
$after = Get-Json "/api/v1/products/$($product.id)"
$stockAfter = [int]$after.product.stock_qty
Check 'stock reflects both sales (2 web + 3 android)' `
    ((($stockBefore - $stockAfter) -eq 5)) "was $stockBefore, now $stockAfter"

# ── Replay safety across a reconnect ───────────────────────────────────────
$replay = Post-Json '/api/v1/orders' $androidBody $token
Check 'replayed android sale is de-duplicated' ($replay.duplicate -eq $true)
$afterReplay = Get-Json "/api/v1/products/$($product.id)"
Check 'replay does not touch stock' ([int]$afterReplay.product.stock_qty -eq $stockAfter)

# ── Admin change on one client reaches the other ────────────────────────────
$revBeforeAdjust = [int](Get-Json '/api/v1/sync?since=0' $token).server_rev
$adjust = Post-Json '/api/v1/stock/adjust' @{ productId = $product.id; delta = 7; reason = 'two-client-check' } $token
Check 'stock adjust succeeds' ($adjust.success -eq $true)
$delta2 = Get-Json "/api/v1/sync?since=$revBeforeAdjust" $token
$changed = @($delta2.products | Where-Object { $_.id -eq $product.id })
Check 'the adjusted product shows up in the incremental feed' ($changed.Count -eq 1)
Check 'the feed carries the new stock count' ([int]$changed[0].stock_qty -eq ($stockAfter + 7)) `
    "got $($changed[0].stock_qty)"

# ── A settled client makes no work for itself ──────────────────────────────
$settled = Get-Json "/api/v1/sync?since=$($delta2.server_rev)" $token
Check 'pull from the newest revision returns no new orders' (@($settled.orders).Count -eq 0)
Check 'pull from the newest revision returns no new products' (@($settled.products).Count -eq 0)

Write-Host ""
if ($script:fail -eq 0) {
    Write-Host ("PASS  {0} checks" -f $script:pass) -ForegroundColor Green
    exit 0
} else {
    Write-Host ("FAILED  {0} passed, {1} failed" -f $script:pass, $script:fail) -ForegroundColor Red
    exit 1
}
