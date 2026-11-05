# Builds the Android app with the toolchain provisioned by provision-android.ps1.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Task bundleRelease
#
param(
    [string]$Task = 'assembleDebug',
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$tooling  = Join-Path $repoRoot '.tooling'
$sdk      = Join-Path $tooling 'android-sdk'
$gradle   = Join-Path $tooling 'gradle-8.9\bin\gradle.bat'
$jdk      = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'

if (-not (Test-Path $gradle)) { throw "Gradle missing. Run scripts\provision-android.ps1 first." }
if (-not (Test-Path $sdk))    { throw "Android SDK missing. Run scripts\provision-android.ps1 first." }
if (-not (Test-Path (Join-Path $jdk 'bin\java.exe'))) { throw "JDK 17 not found at $jdk" }

$env:JAVA_HOME        = $jdk
$env:ANDROID_HOME     = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH             = "$(Join-Path $jdk 'bin');$sdk\platform-tools;$env:PATH"

$project = Join-Path $repoRoot 'android\DXNStockpoint'
$tasks   = if ($Clean) { @('clean', $Task) } else { @($Task) }

Write-Host "Building $($tasks -join ', ') ..."
& $gradle -p $project @tasks --no-daemon --console=plain
$exit = $LASTEXITCODE

if ($exit -ne 0) { throw "Gradle failed with exit code $exit" }

$out = Join-Path $project 'app\build\outputs'
Get-ChildItem -Path $out -Recurse -File -Include *.apk,*.aab -ErrorAction SilentlyContinue |
    ForEach-Object { "  $(($_.Length / 1MB).ToString('0.0')) MB  $($_.FullName)" }
