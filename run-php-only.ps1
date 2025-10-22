# Run PHP backend only (no Node/npm, no frontend). Keeps window open and shows logs.

# Always run from the directory of this script
Set-Location -LiteralPath $PSScriptRoot

Write-Host "Checking PHP..." -ForegroundColor Cyan
$phpVersion  = php -v 2>$null
if (-not $phpVersion) {
  Write-Host "ERROR: PHP not found in PATH. Install PHP 8+ and ensure 'php' is in PATH." -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}
Write-Host "PHP: $($phpVersion.Split("`n")[0])"

# Start PHP built-in server on 127.0.0.1:5174 using php/ as docroot and php/index.php as router
$backendUrl = "http://127.0.0.1:5174"
$docroot = Join-Path $PSScriptRoot "php"
Write-Host ""
Write-Host "Starting PHP built-in server (docroot: $docroot, router: index.php) at $backendUrl ..." -ForegroundColor Green
$phpArgs = @("-S", "127.0.0.1:5174", "index.php")
$phpProc = Start-Process -FilePath "php" -ArgumentList $phpArgs -WorkingDirectory $docroot -PassThru -WindowStyle Normal

# Probe backend health up to ~10 seconds
Start-Sleep -Milliseconds 500
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
if ($started) {
  Write-Host "PHP backend is responding at $backendUrl" -ForegroundColor Green
} else {
  Write-Host "WARNING: PHP backend did not respond on $backendUrl (health endpoint). Check PHP server window." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "This window will keep the PHP server running. Close it to stop the backend."
Write-Host "Press Enter to stop the PHP server and close this window."
Read-Host | Out-Null

# Attempt to stop PHP server
try {
  if ($phpProc) {
    $proc = Get-Process -Id $phpProc.Id -ErrorAction SilentlyContinue
    if ($proc) { Stop-Process -Id $phpProc.Id -Force }
  }
} catch { }