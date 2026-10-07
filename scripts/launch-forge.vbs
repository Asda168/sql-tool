' MySQL Forge Studio launcher: starts the background services with NO console windows, then opens the app window.
'   1) UI server on :4173   2) local host service on 127.0.0.1:4174 (random token per launch)
' The services stop on their own 30 minutes after the app window is closed, unless Laragon/XAMPP/WAMP's database is still running.
Option Explicit

Dim sh, fso, root, front, host, rc, token, url, i, env

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
front = root & "\frontend"
host = root & "\desktop\host"

Function RunHidden(cmd, cwd, wait)
  sh.CurrentDirectory = cwd
  RunHidden = sh.Run(cmd, 0, wait)
End Function

Function IsUp(u)
  On Error Resume Next
  Dim http
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 500, 500, 500, 500
  http.open "GET", u, False
  http.send
  IsUp = (Err.Number = 0 And http.status = 200)
  On Error GoTo 0
End Function

Function HostUp(tk)
  On Error Resume Next
  Dim http
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 500, 500, 500, 500
  http.open "GET", "http://127.0.0.1:4174/ping", False
  http.setRequestHeader "X-Forge-Token", tk
  http.send
  HostUp = (Err.Number = 0 And http.status = 200)
  On Error GoTo 0
End Function

Function NewToken()
  Dim g1, g2
  g1 = Mid(CreateObject("Scriptlet.TypeLib").GUID, 2, 36)
  g2 = Mid(CreateObject("Scriptlet.TypeLib").GUID, 2, 36)
  NewToken = Replace(g1 & g2, "-", "")
End Function

' First start: install components (hidden, but tell the user why it takes a while)
If Not fso.FolderExists(front & "\node_modules") Or Not fso.FolderExists(host & "\node_modules") Then
  MsgBox "First start: installing components. This can take a minute, then the app opens.", 64, "MySQL Forge Studio"
  If Not fso.FolderExists(front & "\node_modules") Then
    rc = RunHidden("cmd /c npm install", front, True)
    If rc <> 0 Then MsgBox "Could not install the interface components (npm install failed).", 16, "MySQL Forge Studio" : WScript.Quit 1
  End If
  If Not fso.FolderExists(host & "\node_modules") Then
    rc = RunHidden("cmd /c npm install", host, True)
    If rc <> 0 Then MsgBox "Could not install the local service components (npm install failed).", 16, "MySQL Forge Studio" : WScript.Quit 1
  End If
End If

If Not fso.FileExists(front & "\dist\index.html") Then
  rc = RunHidden("cmd /c npm run build", front, True)
  If rc <> 0 Then MsgBox "Could not build the interface (npm run build failed).", 16, "MySQL Forge Studio" : WScript.Quit 1
End If

' The access token is kept per user so windows that are already open keep working when the host restarts
Dim tokenDir, tokenFile, ts
tokenDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\MySQLForgeStudio"
tokenFile = tokenDir & "\host-token"
token = ""
If fso.FileExists(tokenFile) Then
  Set ts = fso.OpenTextFile(tokenFile, 1)
  If Not ts.AtEndOfStream Then token = Trim(ts.ReadLine())
  ts.Close
End If
If Len(token) < 24 Then
  token = NewToken()
  If Not fso.FolderExists(tokenDir) Then fso.CreateFolder tokenDir
  Set ts = fso.CreateTextFile(tokenFile, True)
  ts.WriteLine token
  ts.Close
End If

Set env = sh.Environment("Process")
env("FORGE_TOKEN") = token
env("FORGE_UI_PORT") = "4173"
If WScript.Arguments.Count > 0 Then If LCase(WScript.Arguments(0)) = "--background" Then env("FORGE_IDLE_MINUTES") = "1440"

' Reuse services that are already running (they keep serving Laragon connections); start only what is missing
If Not IsUp("http://localhost:4173/app") Then
  RunHidden "powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command ""Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }""", root, True
  RunHidden "node node_modules\vite\bin\vite.js preview --port 4173 --strictPort", front, False
End If
If Not HostUp(token) Then
  RunHidden "powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command ""Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }""", root, True
  RunHidden "node server.mjs", host, False
End If

For i = 1 To 40
  If IsUp("http://localhost:4173/app") Then Exit For
  WScript.Sleep 500
Next
If Not IsUp("http://localhost:4173/app") Then
  MsgBox "The interface server did not start. Make sure Node.js is installed.", 16, "MySQL Forge Studio"
  WScript.Quit 1
End If

' Started at Windows login: keep the services running but do not open a window
If WScript.Arguments.Count > 0 Then If LCase(WScript.Arguments(0)) = "--background" Then WScript.Quit 0

url = "http://localhost:4173/app?forgeHost=http://127.0.0.1:4174&forgeToken=" & token
sh.Run """msedge"" --app=""" & url & """ --window-size=1440,900 --user-data-dir=""" & sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\MySQLForgeStudio\profile""", 1, False
