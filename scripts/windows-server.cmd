@echo off
rem One-click local server for Windows. Installs PHP separately (see README).
rem The API binds 0.0.0.0 so the Android app can connect over the same Wi-Fi.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Lan %*
echo.
echo Server processes were started hidden and keep running.
echo Open http://127.0.0.1:8100 for the web app.
pause
