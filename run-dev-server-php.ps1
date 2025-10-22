# Run Dev Server (PHP backend) - starts PHP built-in server and Vite frontend, shows full logs

# Always run from the directory of this script
Set-Location -LiteralPath $PSScriptRoot

Write-Host "Checking PHP, Node.js and npm..."
$phpVersion  = php -v 2>$null
$nodeVersion = node -v 2>$null
$npmVersion  = npm -v 2>$null

if (-not $phpVersion) {
  Write-Host "ERROR: PHP not found in PATH. Install PHP 8+ and ensure 'php' is in PATH."
  Read-Host "Press Enter to close"
  exit 1
}
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

Write-Host "PHP: $($phpVersion.Split("`n")[0])"
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

# Start PHP backend
Write-Host ""
$backendUrl = "http://127.0.0.1:5174"
Write-Host "Starting PHP built-in server (router: php/index.php) at $backendUrl ..."
# Use router-only form so current directory is the docroot; router handles routing.
$phpArgs = @("-S", "127.0.0.1:5174", "$PSScriptRoot\php\index.php")
$phpProc = Start-Process -FilePath "php" -ArgumentList $phpArgs -WorkingDirectory $PSScriptRoot -PassThru -WindowStyle Normal
Start-Sleep -Milliseconds 500

# Probe backend health up to ~10 seconds
$maxTries = 20
$started = $false
for ($i = 0; $i -lt $maxTries; $i++) {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "$backendUrl/api/health" -TimeoutSec 1
    if ($resp.StatusCode -eq 200) {
      $started = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

if (-not $started) {
  Write-Host "WARNING: PHP server did not respond on $backendUrl. Frontend proxy may fail."
}

Write-Host ""
Write-Host "Starting Vite dev server (host enabled) at http://localhost:5173 ..."
Write-Host "Proxy targets: /api and /uploads -> $backendUrl"
Write-Host "Press Ctrl+C to stop the frontend server in this window."
Write-Host ""

# Run dev server and keep PowerShell open
npm run dev -- --host
Write-Host ""
Write-Host "Frontend dev server exited with code: $LASTEXITCODE"

# Attempt to stop PHP server
try {
  if ($phpProc) {
    $proc = Get-Process -Id $phpProc.Id -ErrorAction SilentlyContinue
    if ($proc) { Stop-Process -Id $phpProc.Id -Force }
  }
} catch { }

Read-Host "Press Enter to close"