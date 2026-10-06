@echo off
rem Launches MySQL Forge Studio (web build) locally and opens it in your browser.
rem Interim launcher: used until the native installer (Tauri) can be built.
setlocal
set "ROOT=%~dp0.."
cd /d "%ROOT%\frontend" || (echo Frontend folder not found & pause & exit /b 1)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install || (pause & exit /b 1)
)
if not exist "dist\index.html" (
  echo Building MySQL Forge Studio...
  call npm run build || (pause & exit /b 1)
)

rem Start the static server minimised, then open the IDE.
start "MySQL Forge Studio server" /min cmd /c "npx vite preview --port 4173 --strictPort"
timeout /t 3 /nobreak >nul
start "" "http://localhost:4173/app"
endlocal
