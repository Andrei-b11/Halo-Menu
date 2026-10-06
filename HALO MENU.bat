@echo off
setlocal
cd /d "%~dp0"
if exist "node_modules\electron\dist\electron.exe" (
  set ELECTRON_RUN_AS_NODE=
  start "" "node_modules\electron\dist\electron.exe" .
  exit /b
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js LTS para preparar HALO MENU por primera vez.
  pause
  exit /b 1
)
call npm.cmd ci
if errorlevel 1 (
  pause
  exit /b 1
)
call node node_modules\electron\install.js
if errorlevel 1 (
  pause
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=
start "" "node_modules\electron\dist\electron.exe" .
