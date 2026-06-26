Add-Type @'
  using System;
  using System.Runtime.InteropServices;
  public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  }
'@

$processes = Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle }
$windows = @()

foreach ($p in $processes) {
  $rect = New-Object Win32+RECT
  $ok = [Win32]::GetWindowRect($p.MainWindowHandle, [ref]$rect)
  
  $windows += @{
    pid = $p.Id
    title = $p.MainWindowTitle
    className = $p.ProcessName
    bounds = @{
      x = $rect.Left
      y = $rect.Top
      width = $rect.Right - $rect.Left
      height = $rect.Bottom - $rect.Top
    }
    focused = $false
  }
}

$windows | ConvertTo-Json -Depth 5
