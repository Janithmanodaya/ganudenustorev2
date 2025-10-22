@echo off
REM Launcher to run the PowerShell dev server script and keep the window open
cd /d "%~dp0"

echo.
echo Select backend to run:
echo   [1] Node.js (server/index.js)
echo   [2] PHP (php/index.php)
echo.
set /p choice=Enter 1 or 2 (default 1): 

if "%choice%"=="2" (
  powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0run-dev-server-php.ps1"
) else (
  powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0run-dev-server-node.ps1"
)