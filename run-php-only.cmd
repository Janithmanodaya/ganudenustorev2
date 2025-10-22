@echo off
REM Run only the PHP backend (no Node/npm, no Vite). Keeps this window open.

cd /d "%~dp0"

echo Starting PHP backend (built-in server) on 127.0.0.1:5174 ...
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0run-php-only.ps1"