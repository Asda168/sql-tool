@echo off
rem Launches MySQL Forge Studio in its own app window with real database, file and Git access.
rem   1) static server for the UI on :4173   2) local host service on 127.0.0.1:4174 (random token per launch)
setlocal
set "ROOT=%~dp0.."

cd /d "%ROOT%\frontend" || (echo Frontend folder not found & pause & exit /b 1)
if not exist "node_modules" (
  echo Installing frontend dependencies...
  call npm install || (pause & exit /b 1)
)
if not exist "dist\index.html" (
  echo Building MySQL Forge Studio...
  call npm run build || (pause & exit /b 1)
)

cd /d "%ROOT%\desktop\host" || (echo Host folder not found & pause & exit /b 1)
if not exist "node_modules" (
  echo Installing host dependencies...
  call npm install || (pause & exit /b 1)
)

rem Fresh random access token for this launch; restart any previous host so the old token stops working.
for /f %%t in ('node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))"') do set "FORGE_TOKEN=%%t"
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
start "MySQL Forge Studio host" /min cmd /c "node server.mjs"

cd /d "%ROOT%\frontend"
start "MySQL Forge Studio UI" /min cmd /c "npx vite preview --port 4173 --strictPort"
timeout /t 3 /nobreak >nul

start "" msedge --app="http://localhost:4173/app?forgeHost=http://127.0.0.1:4174&forgeToken=%FORGE_TOKEN%" --window-size=1440,900 --user-data-dir="%LOCALAPPDATA%\MySQLForgeStudio\profile"
endlocal
