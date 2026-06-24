' Soverign AI - Silent Launcher
' Starts the daemon in background and opens the Electron UI
' No CMD window flash

Option Explicit

Dim oShell, oFSO
Set oShell = CreateObject("WScript.Shell")
Set oFSO = CreateObject("Scripting.FileSystemObject")

Dim sRoot
sRoot = "D:\Soverign"

Dim sCoreDir
sCoreDir = sRoot & "\soverign-core"

Dim sDesktopDir
sDesktopDir = sRoot & "\soverign-desktop"

Dim sDataDir
sDataDir = oShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.soverign"

Dim sLogFile
sLogFile = sDataDir & "\soverign.log"

Dim sElectronExe
sElectronExe = sDesktopDir & "\node_modules\electron\dist\electron.exe"

' Create data directory if missing
If Not oFSO.FolderExists(sDataDir) Then
    oFSO.CreateFolder(sDataDir)
End If

' Check if daemon is already running on port 3142
Dim bDaemonRunning
bDaemonRunning = False

Dim oNet
Set oNet = CreateObject("WScript.Network")

' Use PowerShell to check port
Dim sCheckCmd
sCheckCmd = "powershell -NoProfile -WindowStyle Hidden -Command """ & _
    "$t=New-Object System.Net.Sockets.TcpClient;" & _
    "try{$t.ConnectAsync('127.0.0.1',3142).Wait(500)|Out-Null;" & _
    "if($t.Connected){$t.Close();exit 0}else{exit 1}}catch{exit 1}" & """"

Dim nResult
nResult = oShell.Run(sCheckCmd, 0, True)
bDaemonRunning = (nResult = 0)

' Start daemon if not running
If Not bDaemonRunning Then
    Dim sDaemonCmd
    sDaemonCmd = "cmd /c ""cd /d """ & sCoreDir & """ && bun run src\daemon\index.ts >> """ & sLogFile & """ 2>&1"""
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
           "Please run: cd soverign-desktop && npm install", 16, "Soverign Error"
End If

Set oShell = Nothing
Set oFSO = Nothing
