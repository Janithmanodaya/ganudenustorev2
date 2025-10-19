# One-click health check runner (PowerShell)
param(
  [switch]$SkipInstall
)

Write-Host "Health check runner (PowerShell)" -ForegroundColor Cyan

if (-not $SkipInstall) {
  Write-Host "Installing dependencies..." -ForegroundColor Yellow
  npm install
} else {
  Write-Host "Skipping npm install..." -ForegroundColor Yellow
}

Write-Host "Running full health checks (public + authenticated)..." -ForegroundColor Green
npm run health:full