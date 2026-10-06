@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-browser-bridge.ps1"
if errorlevel 1 (
  echo.
  echo Browser bridge installation failed.
  pause
  exit /b 1
)
echo.
pause
