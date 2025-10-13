@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Automated git add/commit/push script
REM Usage:
REM   git-auto-push.cmd [optional commit message]
REM If no commit message is provided, a timestamp-based message will be used.

REM Ensure Git is available
git --version >nul 2>&1
if errorlevel 1 (
  echo [error] Git is not installed or not in PATH.
  exit /b 1
)

REM Ensure we are in a git repository
if not exist ".git" (
  echo [error] No .git directory found in the current path: %cd%
  echo        Please run this script from the root of a git repository.
  exit /b 1
)

REM Determine current branch (fallback to main)
for /f "usebackq tokens=*" %%B in (`git rev-parse --abbrev-ref HEAD 2^>nul`) do set BRANCH=%%B
if "%BRANCH%"=="" set BRANCH=main

REM Check for changes
set HASCHANGES=
git status --porcelain > "%TEMP%\__git_status.tmp" 2>nul
for /f "usebackq tokens=*" %%S in ("%TEMP%\__git_status.tmp") do set HASCHANGES=1
del "%TEMP%\__git_status.tmp" >nul 2>&1

REM Add all changes if there are any
if defined HASCHANGES (
  echo [info] Staging all changes...
  git add -A
) else (
  echo [info] No local changes detected.
)

REM Build commit message
set MSG=%*
if "%MSG%"=="" (
  set MSG=Auto commit: %DATE% %TIME%
)

REM Commit if there are staged changes
if defined HASCHANGES (
  echo [info] Committing changes...
  git commit -m "%MSG%"
  if errorlevel 1 (
    echo [error] Commit failed.
    exit /b 1
  )
) else (
  echo [info] Skipping commit step (no changes).
)

REM Push to origin
echo [info] Pushing branch "%BRANCH%" to origin...
git push origin %BRANCH%
if errorlevel 1 (
  echo [error] Push failed. Please check your remote settings or authentication.
  exit /b 1
)

echo [ok] Done. Pushed "%BRANCH%" to origin successfully.
exit /b 0