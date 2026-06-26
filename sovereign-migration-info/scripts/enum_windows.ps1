Add-Type @'
  using System;
  using System.Collections.Generic;
  using System.Runtime.InteropServices;
  using System.Text;

  public class EnumWindowsUtil {
      public delegate bool EnumWindowsProc(IntPtr hWnd, int lParam);

      [DllImport("user32.dll")]
      public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, int lParam);

      [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
      public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

      [DllImport("user32.dll")]
      public static extern bool IsWindowVisible(IntPtr hWnd);

      [DllImport("user32.dll")]
      public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);

      public static List<string> GetWindows() {
          List<string> list = new List<string>();
          EnumWindows(delegate(IntPtr hWnd, int lParam) {
              if (IsWindowVisible(hWnd)) {
                  StringBuilder sb = new StringBuilder(256);
                  GetWindowText(hWnd, sb, 256);
                  string title = sb.ToString();
                  if (!string.IsNullOrEmpty(title)) {
                      int pid = 0;
                      GetWindowThreadProcessId(hWnd, out pid);
                      list.Add(pid + " | " + title);
                  }
              }
              return true;
          }, 0);
          return list;
      }
  }
'@

$wins = [EnumWindowsUtil]::GetWindows()
Write-Host "Visible windows found: $($wins.Count)"
foreach ($w in $wins) {
  Write-Host $w
}
