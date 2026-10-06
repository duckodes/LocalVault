@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-browser-bridge.ps1"
if errorlevel 1 (
  echo.
  echo Browser bridge removal failed.
  pause
  exit /b 1
)
echo.
pause
