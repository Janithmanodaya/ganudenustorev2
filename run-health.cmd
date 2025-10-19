@echo off
REM One-click health check runner (Windows CMD)
SETLOCAL

echo Installing dependencies...
npm install

echo Running full health checks (public + authenticated)...
npm run health:full

ENDLOCAL