@echo off
REM Launcher to run the PowerShell dev server script and keep the window open
cd /d "%~dp0"
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0run-dev-server.ps1"