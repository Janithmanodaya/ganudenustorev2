# Run Dev Server (PowerShell) - starts backend and frontend, stays open and shows full logs

# Always run from the directory of this script
Set-Location -LiteralPath $PSScriptRoot

Write-Host "Checking Node.js and npm..."
$nodeVersion = node -v 2>$null
$npmVersion = npm -v 2>$null

if (-not $nodeVersion) {
  Write-Host "ERROR: Node.js not found in PATH. Install from https://nodejs.org"
  Read-Host "Press Enter to close"
  exit 1
}
if (-not $npmVersion) {
  Write-Host "ERROR: npm not found in PATH. Reinstall Node.js from https://nodejs.org"
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host "Node: $nodeVersion"
Write-Host "npm: $npmVersion"

# Install dependencies if missing
if (-not (Test-Path "node_modules")) {
  Write-Host "node_modules not found. Installing dependencies..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed (exit code $LASTEXITCODE)"
    Read-Host "Press Enter to close"
    exit $LASTEXITCODE
  }
}

# Ensure react-router-dom is installed
Write-Host ""
Write-Host "Verifying react-router-dom is installed..."
npm ls react-router-dom | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "react-router-dom not found. Installing..."
  npm install react-router-dom
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install react-router-dom (exit code $LASTEXITCODE)"
    Read-Host "Press Enter to close"
    exit $LASTEXITCODE
  }
}

# Start backend server using Node (avoids quoting issues with special characters in paths)
Write-Host ""
Write-Host "Starting backend server at http://localhost:5174 ..."
Start-Process -FilePath "node" -ArgumentList "server/index.js" -WorkingDirectory $PSScriptRoot -WindowStyle Normal | Out-Null

Write-Host ""
Write-Host "Starting Vite dev server (host enabled) at http://localhost:5173 ..."
Write-Host "Press Ctrl+C to stop the frontend server in this window."
Write-Host ""

# Run dev server and keep PowerShell open
npm run dev -- --host
Write-Host ""
Write-Host "Frontend dev server exited with code: $LASTEXITCODE"
Read-Host "Press Enter to close"