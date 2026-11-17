@echo off
title Visa File Review
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules\tesseract.js\dist (
  echo Installing components - first run only...
  call npm install --no-audit --no-fund
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5178"
node server.mjs
pause
