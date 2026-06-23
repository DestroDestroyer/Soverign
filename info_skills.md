# Information on Agent Skills Used

This file documents the specialized agent skills loaded and utilized during the project execution to ensure robust development, debugging, and execution.

## 1. System Reliability Skills
* **Skills Loaded:** `windows-shell-reliability`, `powershell-windows`
* **Application:** 
  - Ensured correct path formatting (handling Windows backslashes `\` and space characters).
  - Executed PowerShell subprocesses with proper escaping (`& "path\to\exe" args`).
  - Safe subprocess management with asynchronous tracking (background task logs).

## 2. Code Quality & Formatting Skills
* **Skills Loaded:** `python-pro`, `clean-code`
* **Application:**
  - Written clean, modular code with descriptive variable names and structured classes.
  - Implemented automatic package installs (`sys.executable -m pip install`) inside the scripts to make them self-contained.
  - Added robust exception handling (e.g. silent audio fallbacks, scale fallbacks in FFmpeg zoompan).

## 3. Context & Token Management Skills
* **Skills Loaded:** `context-window-management`, `context-compression`, `efficient-web-research`
* **Application:**
  - Structured project summary documents to allow rapid context restoration after server restarts.
  - Designed files to be parsed at a high level rather than reading massive script files, staying token-efficient.

## 4. Debugging & Forensic Skills
* **Skills Loaded:** `debugger`, `debugging-strategies`, `error-detective`
* **Application:**
  - Analyzed FFmpeg crop/zoompan boundary errors and speech truncation bugs.
  - Parsed syntax compilation failures (like `global` declaration issues) and applied immediate inline code patches.
  - Isolated GPU runtime errors on AMD Vega 3 integrated graphics and designed CPU-only fallback configurations.
