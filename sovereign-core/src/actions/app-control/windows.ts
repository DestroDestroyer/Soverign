import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'bun';
import type { AppController, WindowInfo, UIElement } from './interface.ts';

export class WindowsAppController implements AppController {
  private runPowerShell(script: string, args: string[] = []): string {
    const tempFile = join(tmpdir(), `sovereign-automation-${Math.random().toString(36).slice(2)}.ps1`);
    try {
      writeFileSync(tempFile, script, 'utf8');
      const result = spawnSync(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tempFile, ...args], {});
      const stdout = result.stdout?.toString() ?? '';
      return stdout;
    } catch (e) {
      console.error('[WindowsAppController] PowerShell execution failed:', e);
      return '';
    } finally {
      try {
        if (existsSync(tempFile)) unlinkSync(tempFile);
      } catch {}
    }
  }

  async getActiveWindow(): Promise<WindowInfo> {
    const list = await this.listWindows();
    const active = list.find(w => w.focused);
    if (active) return active;
    if (list.length > 0) return list[0]!;
    
    // Session 0 fallback
    return {
      pid: process.pid,
      title: 'Sovereign Active Window (Fallback)',
      className: 'SovereignApp',
      bounds: { x: 0, y: 0, width: 1024, height: 768 },
      focused: true
    };
  }

  async listWindows(): Promise<WindowInfo[]> {
    const script = `
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

            [DllImport("user32.dll")]
            public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

            [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
            public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

            [DllImport("user32.dll")]
            public static extern IntPtr GetForegroundWindow();

            [StructLayout(LayoutKind.Sequential)]
            public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

            public class WindowInfo {
                public int pid;
                public string title;
                public string className;
                public int x;
                public int y;
                public int width;
                public int height;
                public bool focused;
            }

            public static List<WindowInfo> GetWindows() {
                List<WindowInfo> list = new List<WindowInfo>();
                IntPtr activeHwnd = GetForegroundWindow();
                EnumWindows(delegate(IntPtr hWnd, int lParam) {
                    if (IsWindowVisible(hWnd)) {
                        StringBuilder sb = new StringBuilder(256);
                        GetWindowText(hWnd, sb, 256);
                        string title = sb.ToString();
                        
                        StringBuilder cb = new StringBuilder(256);
                        GetClassName(hWnd, cb, 256);
                        string className = cb.ToString();
                        
                        if (!string.IsNullOrEmpty(title)) {
                            int pid = 0;
                            GetWindowThreadProcessId(hWnd, out pid);
                            RECT rect = new RECT();
                            GetWindowRect(hWnd, out rect);
                            
                            WindowInfo info = new WindowInfo();
                            info.pid = pid;
                            info.title = title;
                            info.className = className;
                            info.x = rect.Left;
                            info.y = rect.Top;
                            info.width = rect.Right - rect.Left;
                            info.height = rect.Bottom - rect.Top;
                            info.focused = (hWnd == activeHwnd);
                            list.Add(info);
                        }
                    }
                    return true;
                }, 0);
                return list;
            }
        }
      '@

      $wins = [EnumWindowsUtil]::GetWindows()
      if ($wins) {
        $wins | ConvertTo-Json
      } else {
        "[]"
      }
    `;

    try {
      const output = this.runPowerShell(script);
      if (!output || !output.trim()) return [];
      const rawWins = JSON.parse(output);
      const wins = Array.isArray(rawWins) ? rawWins : [rawWins];
      return wins.map((w: any) => ({
        pid: w.pid,
        title: w.title,
        className: w.className,
        bounds: { x: w.x, y: w.y, width: w.width, height: w.height },
        focused: w.focused,
      }));
    } catch (e) {
      console.warn('[WindowsAppController] listWindows failed:', e);
      return [];
    }
  }

  async getWindowTree(pid: number): Promise<UIElement[]> {
    const script = `
      Add-Type -AssemblyName UIAutomationClient
      Add-Type -AssemblyName UIAutomationTypes

      $pid = $args[0]
      if (-not $pid) { exit 1 }

      $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if (-not $process) {
        exit 1
      }

      $hwnd = $process.MainWindowHandle
      if ($hwnd -eq [IntPtr]::Zero) {
        exit 1
      }

      $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)

      function Get-ElementTree($element, $depth, $maxElements) {
          if ($global:elementCount -ge $maxElements) { return $null }
          
          $global:elementCount++
          $id = $global:elementCount.ToString()
          
          $name = $element.Current.Name
          $role = $element.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
          $value = $null
          
          try {
              if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valPattern)) {
                  $value = $valPattern.Current.Value
              }
          } catch {}
          
          $rect = $element.Current.BoundingRectangle
          $bounds = @{
              x = [int]$rect.X
              y = [int]$rect.Y
              width = [int]$rect.Width
              height = [int]$rect.Height
          }
          
          $children = @()
          if ($depth -gt 0) {
              $condition = [System.Windows.Automation.Condition]::TrueCondition
              $rawChildren = $element.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
              foreach ($child in $rawChildren) {
                  $childTree = Get-ElementTree $child ($depth - 1) $maxElements
                  if ($childTree) {
                      $children += $childTree
                  }
              }
          }
          
          return @{
              id = $id
              role = $role
              name = $name
              value = $value
              bounds = $bounds
              children = $children
              properties = @{}
          }
      }

      $global:elementCount = 0
      $tree = Get-ElementTree $root 5 80
      if ($tree) {
        $tree | ConvertTo-Json -Depth 10
      } else {
        "[]"
      }
    `;

    try {
      const output = this.runPowerShell(script, [pid.toString()]);
      if (!output || !output.trim()) return [];
      const parsed = JSON.parse(output);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      console.warn('[WindowsAppController] getWindowTree failed:', e);
      return [];
    }
  }

  async clickElement(element: UIElement): Promise<void> {
    const { x, y, width, height } = element.bounds;
    const clickX = Math.round(x + width / 2);
    const clickY = Math.round(y + height / 2);

    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32Mouse {
          [DllImport("user32.dll")]
          public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
          [DllImport("user32.dll")]
          public static extern bool SetCursorPos(int X, int Y);
        }
      "@
      [Win32Mouse]::SetCursorPos(${clickX}, ${clickY})
      [Win32Mouse]::mouse_event(0x0002, 0, 0, 0, 0)
      Start-Sleep -m 50
      [Win32Mouse]::mouse_event(0x0004, 0, 0, 0, 0)
    `;
    this.runPowerShell(script);
  }

  async typeText(text: string): Promise<void> {
    const escaped = text
      .replace(/[{}]/g, '{$&}')
      .replace(/[+^%~()]/g, '{$&}');

    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait("${escaped}")
    `;
    this.runPowerShell(script);
  }

  async pressKeys(keys: string[]): Promise<void> {
    const mapped = keys.map(k => {
      const lower = k.toLowerCase();
      if (lower === 'enter') return '{ENTER}';
      if (lower === 'tab') return '{TAB}';
      if (lower === 'escape' || lower === 'esc') return '{ESC}';
      if (lower === 'backspace') return '{BACKSPACE}';
      if (lower === 'delete' || lower === 'del') return '{DEL}';
      if (lower === 'up') return '{UP}';
      if (lower === 'down') return '{DOWN}';
      if (lower === 'left') return '{LEFT}';
      if (lower === 'right') return '{RIGHT}';
      if (lower === 'space') return ' ';
      return k;
    }).join('');

    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait("${mapped}")
    `;
    this.runPowerShell(script);
  }

  async captureScreen(): Promise<Buffer> {
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing

      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      $bounds = $screen.Bounds
      $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $graphics.Dispose()

      $ms = New-Object System.IO.MemoryStream
      $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $bitmap.Dispose()

      [Convert]::ToBase64String($ms.ToArray())
    `;

    try {
      const output = this.runPowerShell(script);
      return Buffer.from(output.trim(), 'base64');
    } catch (e) {
      console.warn('[WindowsAppController] captureScreen failed:', e);
      return Buffer.from([]);
    }
  }

  async captureWindow(pid: number): Promise<Buffer> {
    const script = `
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

      $pid = $args[0]
      $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if (-not $p -or $p.MainWindowHandle -eq [IntPtr]::Zero) {
        Add-Type -AssemblyName System.Windows.Forms
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      } else {
        $rect = New-Object Win32+RECT
        [Win32]::GetWindowRect($p.MainWindowHandle, [ref]$rect)
        $bounds = New-Object System.Drawing.Rectangle $rect.Left, $rect.Top, ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top)
      }

      Add-Type -AssemblyName System.Drawing
      $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $graphics.Dispose()

      $ms = New-Object System.IO.MemoryStream
      $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $bitmap.Dispose()

      [Convert]::ToBase64String($ms.ToArray())
    `;

    try {
      const output = this.runPowerShell(script, [pid.toString()]);
      return Buffer.from(output.trim(), 'base64');
    } catch (e) {
      console.warn('[WindowsAppController] captureWindow failed:', e);
      return Buffer.from([]);
    }
  }

  async focusWindow(pid: number): Promise<void> {
    const script = `
      $pid = $args[0]
      $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
        $hwnd = $p.MainWindowHandle
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32Focus {
            [DllImport("user32.dll")]
            public static extern bool SetForegroundWindow(IntPtr hWnd);
            [DllImport("user32.dll")]
            public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          }
        "@
        [Win32Focus]::ShowWindow($hwnd, 9)
        [Win32Focus]::SetForegroundWindow($hwnd)
      }
    `;
    this.runPowerShell(script, [pid.toString()]);
  }
}

