@echo off
REM Launcher to run the PowerShell dev server script and keep the window open
cd /d "%~dp0"

echo.
echo Select backend to run:
echo   [1] Node.js (server/index.js) + Vite frontend (requires Node/npm)
echo   [2] PHP (php/index.php) + Vite frontend (requires Node/npm)
echo   [3] PHP backend only (no Node/npm, no frontend)
echo.
set /p choice=Enter 1, 2 or 3 (default 1): 

if "%choice%"=="3" (
  powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0run-php-only.ps1"
) else if "%choice%"=="2" (
  powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0run-dev-server-php.ps1"
) else (
  powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0run-dev-server-node.ps1"
)