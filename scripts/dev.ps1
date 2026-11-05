# Local development: PHP API (SQLite) + static web app, both off the workspace.
#
#   powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Fresh   # reinstall the database
#
# Defaults match the ones used in the docs:
#   API   http://127.0.0.1:8099
#   Web   http://127.0.0.1:8100   (paste the API URL into Settings the first time)
#
param(
    [int]$ApiPort = 8099,
    [int]$WebPort = 8100,
    [switch]$Fresh,
    [switch]$Lan,
    [string]$Pin = "2468"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$apiDir = Join-Path $root "api"
$docsDir = Join-Path $root "docs"
$storage = Join-Path $apiDir "storage"

$phpCommand = Get-Command php -ErrorAction SilentlyContinue
if (-not $phpCommand) { throw "PHP is not on PATH. Install PHP 8.1+ first." }
$php = $phpCommand.Source
$extDir = Join-Path (Split-Path $php -Parent) "ext"

$flags = @()
if (Test-Path $extDir) {
    $flags += @("-d", "extension_dir=$extDir")
    foreach ($dll in @("php_pdo_sqlite.dll", "php_pdo_mysql.dll", "php_mbstring.dll")) {
        if (Test-Path (Join-Path $extDir $dll)) {
            $flags += @("-d", ("extension=" + [System.IO.Path]::GetFileNameWithoutExtension($dll)))
        }
    }
}

if (-not (Test-Path $storage)) { New-Item -ItemType Directory -Path $storage | Out-Null }
$env:DXN_DRIVER = "sqlite"
$env:DXN_DB_PATH = Join-Path $storage "dev.sqlite"
$env:DXN_ADMIN_KEY = "local-dev-admin-key-change-me"
$env:DXN_INSTALL_KEY = "local-dev"
$env:DXN_DEBUG = "1"

if ($Fresh -and (Test-Path $env:DXN_DB_PATH)) { Remove-Item $env:DXN_DB_PATH -Force }

$apiHost = if ($Lan) { "0.0.0.0" } else { "127.0.0.1" }
$webHost = if ($Lan) { "0.0.0.0" } else { "127.0.0.1" }

Write-Host "Installing schema (idempotent)…"
& $php @flags (Join-Path $apiDir "bin\install.php") "--pin=$Pin" | Write-Host

$apiLog = Join-Path $storage "server.out.log"
$apiErr = Join-Path $storage "server.err.log"

Write-Host "Starting API on http://${apiHost}:${ApiPort}"
$api = Start-Process -FilePath $php `
    -ArgumentList (@($flags) + @("-S", "${apiHost}:${ApiPort}", "-t", (Join-Path $apiDir "public"), (Join-Path $apiDir "public\index.php"))) `
    -WorkingDirectory $root -RedirectStandardOutput $apiLog -RedirectStandardError $apiErr `
    -WindowStyle Hidden -PassThru

Write-Host "Starting web app on http://${webHost}:${WebPort}"
$web = Start-Process -FilePath $php `
    -ArgumentList (@($flags) + @("-S", "${webHost}:${WebPort}", "-t", $docsDir)) `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru

Start-Sleep -Milliseconds 900
try {
    $health = Invoke-RestMethod "http://127.0.0.1:$ApiPort/api/v1/health" -TimeoutSec 8
    Write-Host ("API  : {0} ({1}), revision {2}" -f $health.status, $health.driver, $health.server_rev)
} catch {
    Write-Warning "API did not answer yet. Check $apiErr"
}

Write-Host ""
Write-Host "Open   http://127.0.0.1:$WebPort"
Write-Host "API    http://127.0.0.1:$ApiPort/api/v1/health"
if ($Lan) {
    $addresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
        Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
        ForEach-Object { $_.IPAddressToString } |
        Where-Object { $_ -notlike '127.*' } |
        Select-Object -Unique
    foreach ($ip in $addresses) {
        Write-Host "LAN    http://${ip}:${WebPort}  (API base http://${ip}:${ApiPort}/)"
    }
    Write-Host "Android Settings → Server URL → http://<this-PC-LAN-IP>:${ApiPort}/"
}
Write-Host "PIN    $Pin"
Write-Host ""
Write-Host "Process ids: api=$($api.Id) web=$($web.Id)"
Write-Host "Stop with:  Stop-Process -Id $($api.Id),$($web.Id)"
