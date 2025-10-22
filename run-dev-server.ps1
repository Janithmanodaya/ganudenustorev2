# Run Dev Server (PowerShell) - starts backend (PHP or Node) and frontend, stays open and shows full logs

# Always run from the directory of this script
Set-Location -LiteralPath $PSScriptRoot

Write-Host "Checking tools..."
$nodeVersion = node -v 2>$null
$npmVersion = npm -v 2>$null
$phpVersion  = php -v 2>$null

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
if ($phpVersion) { Write-Host "PHP: $($phpVersion.Split("`n")[0])" } else { Write-Host "PHP: not found (will use Node backend)" }

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

# Start backend on port 5174
Write-Host ""
if ($phpVersion -and (Test-Path "$PSScriptRoot\php\index.php")) {
  Write-Host "Starting PHP built-in server (router: php/index.php) at http://localhost:5174 ..."
  # Use PHP built-in server with router script to mimic Apache .htaccess rewrites
  $phpArgs = @("-S", "localhost:5174", "-t", "$PSScriptRoot\php", "$PSScriptRoot\php\index.php")
  Start-Process -FilePath "php" -ArgumentList $phpArgs -WorkingDirectory $PSScriptRoot -WindowStyle Normal | Out-Null
} else {
  Write-Host "Starting Node backend server at http://localhost:5174 ..."
  Start-Process -FilePath "node" -ArgumentList "server/index.js" -WorkingDirectory $PSScriptRoot -WindowStyle Normal | Out-Null
}

Write-Host ""
Write-Host "Starting Vite dev server (host enabled) at http://localhost:5173 ..."
Write-Host "Proxy targets: /api and /uploads -> http://localhost:5174"
Write-Host "Press Ctrl+C to stop the frontend server in this window."
Write-Host ""

# Run dev server and keep PowerShell open
npm run dev -- --host
Write-Host ""
Write-Host "Frontend dev server exited with code: $LASTEXITCODE"
Read-Host "Press Enter to close"