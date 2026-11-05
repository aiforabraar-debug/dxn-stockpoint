# Provisions a local JDK-less Android build toolchain (SDK + Gradle) so the APK
# can be compiled and verified without Android Studio.
#
#   powershell -ExecutionPolicy Bypass -File scripts/provision-android.ps1
#
$ErrorActionPreference = 'Stop'

$root   = Join-Path (Split-Path -Parent $PSScriptRoot) '.tooling'
$sdk    = Join-Path $root 'android-sdk'
$gradle = Join-Path $root 'gradle-8.9'
$jdk    = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'

New-Item -ItemType Directory -Force -Path $root | Out-Null

if (-not (Test-Path (Join-Path $jdk 'bin\java.exe'))) { throw "JDK 17 not found at $jdk" }

function Get-Zip([string]$url, [string]$dest) {
    if (Test-Path $dest) {
        Write-Host "  cached  $dest"
        return
    }
    Write-Host "  fetching $url"
    & curl.exe -L --retry 4 --retry-delay 3 --connect-timeout 30 -o $dest $url
    if ($LASTEXITCODE -ne 0) { throw "download failed: $url" }
    Write-Host "  saved   $dest ($([math]::Round((Get-Item $dest).Length/1MB,1)) MB)"
}

# ── 1. Android command line tools ────────────────────────────────────────────
$sdkManager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkManager)) {
    Write-Host '==> Android command line tools'
    $zip = Join-Path $root 'commandlinetools.zip'
    Get-Zip 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' $zip

    New-Item -ItemType Directory -Force -Path (Join-Path $sdk 'cmdline-tools') | Out-Null
    Expand-Archive -Path $zip -DestinationPath (Join-Path $sdk 'cmdline-tools') -Force
    $inner = Join-Path $sdk 'cmdline-tools\cmdline-tools'
    if (Test-Path $inner) { Rename-Item -Path $inner -NewName 'latest' -Force }
}
if (-not (Test-Path $sdkManager)) { throw 'sdkmanager.bat missing after extraction' }

# ── 2. SDK packages ─────────────────────────────────────────────────────────
$env:JAVA_HOME      = $jdk
$env:ANDROID_HOME   = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH           = "$(Join-Path $jdk 'bin');$sdk\cmdline-tools\latest\bin;$sdk\platform-tools;$env:PATH"

Write-Host '==> Accepting SDK licences'
$yes = ("y`n" * 40)
$yes | & $sdkManager --sdk_root=$sdk --licenses | Out-Null

Write-Host '==> Installing platform + build tools (this is the big download)'
& $sdkManager --sdk_root=$sdk 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'
if ($LASTEXITCODE -ne 0) { throw 'sdkmanager failed' }

# ── 3. Gradle ───────────────────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $gradle 'bin\gradle.bat'))) {
    Write-Host '==> Gradle 8.9'
    $zip = Join-Path $root 'gradle-8.9-bin.zip'
    Get-Zip 'https://services.gradle.org/distributions/gradle-8.9-bin.zip' $zip
    Expand-Archive -Path $zip -DestinationPath $root -Force
}

Write-Host ''
Write-Host 'Toolchain ready:'
Write-Host "  ANDROID_HOME = $sdk"
Write-Host "  GRADLE       = $(Join-Path $gradle 'bin\gradle.bat')"
