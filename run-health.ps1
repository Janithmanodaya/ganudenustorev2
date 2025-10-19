# One-click health check runner (PowerShell)
param(
  [switch]$SkipInstall
)

Write-Host "Health check runner (PowerShell)" -ForegroundColor Cyan

# Prepare report directory and file
$reportDir = "data/health-reports"
if (-not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir | Out-Null
}
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$reportFile = Join-Path $reportDir "health_$ts.txt"

"Health check started at $(Get-Date)" | Out-File -FilePath $reportFile -Encoding UTF8

if (-not $SkipInstall) {
  Write-Host "Installing dependencies..." -ForegroundColor Yellow
  & npm install 2>&1 | Tee-Object -FilePath $reportFile -Append | Write-Host
  $npmInstallCode = $LASTEXITCODE
  if ($npmInstallCode -ne 0) {
    "npm install exited with code $npmInstallCode" | Out-File -FilePath $reportFile -Append -Encoding UTF8
  }
} else {
  Write-Host "Skipping npm install..." -ForegroundColor Yellow
  "Skipping npm install..." | Out-File -FilePath $reportFile -Append -Encoding UTF8
}

Write-Host "Running full health checks (public + authenticated)..." -ForegroundColor Green
"Running full health checks (public + authenticated)..." | Out-File -FilePath $reportFile -Append -Encoding UTF8

& npm run health:full 2>&1 | Tee-Object -FilePath $reportFile -Append | Write-Host
$testExitCode = $LASTEXITCODE

"`n" | Out-File -FilePath $reportFile -Append -Encoding UTF8
if ($testExitCode -eq 0) {
  "RESULT: PASS" | Out-File -FilePath $reportFile -Append -Encoding UTF8
  Write-Host "RESULT: PASS" -ForegroundColor Green
} else {
  "RESULT: FAIL (exit code $testExitCode)" | Out-File -FilePath $reportFile -Append -Encoding UTF8
  Write-Host "RESULT: FAIL (exit code $testExitCode)" -ForegroundColor Red
}
"Completed at $(Get-Date)" | Out-File -FilePath $reportFile -Append -Encoding UTF8

exit $testExitCode