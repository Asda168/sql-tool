@echo off
rem MySQL Forge Studio - Windows setup. Double-click to install; run again any time to update.
rem Needs Node.js 20+ (https://nodejs.org). Installs to %LOCALAPPDATA%\MySQLForgeStudio\app and adds a Desktop shortcut.
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -Raw -LiteralPath '%~f0') -split '(?m)^#PS#')[1]"
echo.
pause
exit /b
#PS#
$ErrorActionPreference = 'Stop'
$repo = 'Asda168/sql-tool'
$dir  = Join-Path $env:LOCALAPPDATA 'MySQLForgeStudio'
$app  = Join-Path $dir 'app'
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
try {
  Step 'Checking Node.js'
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20+ is required. Install it from https://nodejs.org and run this setup again.' }
  $major = [int]((node -v).TrimStart('v').Split('.')[0])
  if ($major -lt 20) { throw "Node.js 20+ is required (found $(node -v))." }

  Step 'Downloading the latest version'
  New-Item -ItemType Directory -Force $dir | Out-Null
  $zip = Join-Path $dir 'source.zip'; $tmp = Join-Path $dir 'extract'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest "https://codeload.github.com/$repo/zip/refs/heads/main" -OutFile $zip -UseBasicParsing
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive $zip $tmp -Force
  $src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName

  Step 'Installing files'
  foreach ($d in 'frontend', 'desktop\host', 'scripts') {
    $to = Join-Path $app $d
    New-Item -ItemType Directory -Force $to | Out-Null
    # keep node_modules between updates; replace everything else
    Get-ChildItem $to -Force | Where-Object { $_.Name -ne 'node_modules' } | Remove-Item -Recurse -Force
    Get-ChildItem (Join-Path $src $d) -Force | Where-Object { $_.Name -ne 'node_modules' } | Copy-Item -Destination $to -Recurse -Force
  }
  Remove-Item $zip, $tmp -Recurse -Force

  Step 'Installing components (first time takes a minute)'
  Push-Location (Join-Path $app 'frontend')
  npm install --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install failed (frontend)' }
  Step 'Building the interface'
  npm run build; if ($LASTEXITCODE) { throw 'Build failed' }
  Pop-Location
  Push-Location (Join-Path $app 'desktop\host')
  npm install --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install failed (host)' }
  Pop-Location

  Step 'Creating shortcuts'
  $vbs = Join-Path $app 'scripts\launch-forge.vbs'
  $ico = Join-Path $app 'scripts\forge.ico'
  $ws = New-Object -ComObject WScript.Shell
  foreach ($loc in [Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')) {
    $lnk = $ws.CreateShortcut((Join-Path $loc 'MySQL Forge Studio.lnk'))
    $lnk.TargetPath = 'wscript.exe'; $lnk.Arguments = "`"$vbs`""; $lnk.WorkingDirectory = Split-Path $vbs
    $lnk.Description = 'MySQL Forge Studio'; $lnk.IconLocation = "$ico,0"; $lnk.Save()
  }
  # Start the background services (no window) at Windows login so Laragon connections work as soon as the app opens
  $su = $ws.CreateShortcut((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\MySQL Forge Studio services.lnk'))
  $su.TargetPath = 'wscript.exe'; $su.Arguments = "`"$vbs`" --background"; $su.WorkingDirectory = Split-Path $vbs
  $su.WindowStyle = 7; $su.Description = 'MySQL Forge Studio background services'; $su.IconLocation = "$ico,0"; $su.Save()

  Write-Host "`nDone. Start 'MySQL Forge Studio' from the Desktop or the Start menu." -ForegroundColor Green
  $go = Read-Host 'Launch it now? (Y/n)'
  if ($go -ne 'n') { Start-Process wscript.exe "`"$vbs`"" }
} catch { Write-Host "`nSetup failed: $($_.Exception.Message)" -ForegroundColor Red }
