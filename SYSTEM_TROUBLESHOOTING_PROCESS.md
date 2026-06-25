# Soverign System Troubleshooting Processes

This file outlines the standard processes to follow when encountering specific known issues with the Soverign system, particularly involving the daemon, background service, and the UI.

## Issue 1: Black Command Prompt Window Remains on Screen
**Symptom:** After installing and launching the background service, a persistent blank command prompt window remains on the desktop with a black screen (without the "Administrator" title).
**Cause:** The Windows Scheduled Task was launching `cmd.exe /c` directly. Even with the Task Scheduler `-Hidden` setting, the console window can be forced visible by the system for the logged-in interactive user.
**Process to Fix:**
1. Do not use `cmd.exe` or `powershell.exe` directly as the Scheduled Task action.
2. Ensure the install script (`d:\Soverign\soverign-desktop\scripts\install-windows-tasks.ps1`) dynamically creates a `run-hidden.vbs` script.
3. Configure the Scheduled Task to run `wscript.exe` passing the VBScript and the command arguments. 
4. The VBScript uses `WshShell.Run WScript.Arguments(0), 0, False` (0 means `vbHide`) to silently launch the background daemon.

## Issue 2: White Screen with "Not Found" in the Desktop Console
**Symptom:** The Soverign Desktop Console opens, connects to the daemon, but shows a white screen with "Not found" in the upper-left corner.
**Cause:** The daemon hosts the UI statically at `http://localhost:3142/` by serving `soverign-core/ui/dist`. If the UI is not built, or the build failed (e.g., due to missing OpenWakeWord model files during `copy:models`), the `ui/dist` folder will be empty or missing `index.html`.
**Process to Fix:**
1. Check if `d:\Soverign\soverign-core\ui\index.html` exists. If not, create a basic `index.html` file in `ui/` to serve as the entry point.
2. Open `d:\Soverign\soverign-core\package.json`. If the `copy:models` script is failing due to missing `.onnx` files, remove the references to the non-existent files (such as `hey_soverign_v0.1.onnx`) so the build can proceed.
3. Run `bun run build:ui` in the `d:\Soverign\soverign-core` directory.
4. Verify that `d:\Soverign\soverign-core\ui\dist\index.html` was generated successfully.
5. Restart the Desktop application to reload the webview; the UI should now render successfully.

