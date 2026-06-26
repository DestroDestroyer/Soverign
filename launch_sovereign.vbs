' Sovereign AI - Silent Launcher
' Starts the daemon in background and opens the Electron UI
' No CMD window flash

Option Explicit

On Error Resume Next

Dim oShell, oFSO
Set oShell = CreateObject("WScript.Shell")
Set oFSO = CreateObject("Scripting.FileSystemObject")

If Err.Number <> 0 Then
    MsgBox "Failed to initialize Shell/FileSystem objects.", 16, "Sovereign Error"
    WScript.Quit 1
End If

' Dynamically resolve root path from script location to prevent hardcoded typos
Dim sRoot
sRoot = oFSO.GetParentFolderName(WScript.ScriptFullName)

Dim sCoreDir
sCoreDir = sRoot & "\sovereign-core"

Dim sDesktopDir
sDesktopDir = sRoot & "\sovereign-desktop"

Dim sDataDir
sDataDir = oShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.sovereign"

Dim sLogFile
sLogFile = sDataDir & "\sovereign.log"

Dim sElectronExe
sElectronExe = sDesktopDir & "\node_modules\electron\dist\electron.exe"

' Create data directory if missing
If Not oFSO.FolderExists(sDataDir) Then
    oFSO.CreateFolder(sDataDir)
End If

' Check if daemon is already running on port 3142
Dim bDaemonRunning
bDaemonRunning = False

' PowerShell port check (reliable TCP Client check)
Dim sCheckCmd
sCheckCmd = "powershell -NoProfile -WindowStyle Hidden -Command """ & _
    "$t = New-Object System.Net.Sockets.TcpClient; " & _
    "try { " & _
    "  $c = $t.ConnectAsync('127.0.0.1', 3142); " & _
    "  if ($c.Wait(1000) -and $t.Connected) { " & _
    "    $t.Close(); exit 0; " & _
    "  } " & _
    "} catch {} exit 1;"""

Dim nResult
nResult = oShell.Run(sCheckCmd, 0, True)
bDaemonRunning = (nResult = 0)

' Start daemon if not running
If Not bDaemonRunning Then
    ' Check if bun is installed/available
    Dim nBunCheck
    nBunCheck = oShell.Run("cmd /c where bun", 0, True)
    If nBunCheck <> 0 Then
        ' Attempt to find bun in user profile fallback
        Dim sUserBun
        sUserBun = oShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.bun\bin\bun.exe"
        If Not oFSO.FileExists(sUserBun) Then
            MsgBox "Bun is not installed or not in PATH." & Chr(10) & _
                   "Please install Bun from https://bun.sh", 16, "Sovereign Error"
            WScript.Quit 1
        End If
    End If

    Dim sDaemonCmd
    sDaemonCmd = "cmd.exe /c cd /d """ & sCoreDir & """ && bun run src\daemon\index.ts >> """ & sLogFile & """ 2>&1"
    oShell.Run sDaemonCmd, 0, False  ' 0 = hidden, False = don't wait
    
    ' Wait up to 30 seconds for daemon to start
    Dim i
    For i = 1 To 30
        WScript.Sleep 1000
        nResult = oShell.Run(sCheckCmd, 0, True)
        If nResult = 0 Then
            bDaemonRunning = True
            Exit For
        End If
    Next
End If

' Launch Electron
If oFSO.FileExists(sElectronExe) Then
    oShell.Run """" & sElectronExe & """ """ & sDesktopDir & """", 1, False
Else
    MsgBox "Electron not found at: " & sElectronExe & Chr(10) & _
           "Please run: cd sovereign-desktop && npm install", 16, "Sovereign Error"
End If

Set oShell = Nothing
Set oFSO = Nothing
