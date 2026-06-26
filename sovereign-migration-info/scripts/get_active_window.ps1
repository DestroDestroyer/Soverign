Add-Type @'
  using System;
  using System.Runtime.InteropServices;
  public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  }
'@

$hwnd = [Win32]::GetForegroundWindow()
$processId = 0
[Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId)

$title = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($hwnd, $title, 256)

$rect = New-Object Win32+RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect)

$p = Get-Process -Id $processId -ErrorAction SilentlyContinue

$info = @{
  pid = $processId
  title = $title.ToString()
  className = if ($p) { $p.ProcessName } else { "Unknown" }
  bounds = @{
    x = $rect.Left
    y = $rect.Top
    width = $rect.Right - $rect.Left
    height = $rect.Bottom - $rect.Top
  }
  focused = $true
}

$info | ConvertTo-Json
