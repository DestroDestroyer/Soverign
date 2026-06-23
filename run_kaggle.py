#!/usr/bin/env python3
import os
import sys
import json
import time
import shutil
import subprocess
from pathlib import Path

# Paths
DOWNLOADS_DIR = Path.home() / "Downloads"
KAGGLE_DIR = Path.home() / ".kaggle"
TOKEN_FILE = KAGGLE_DIR / "kaggle.json"
PROJECT_DIR = Path(r"D:\Soverign")
DESKTOP = Path.home() / "Desktop"

def log(msg, level="INFO"):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [{level}] {msg}")

def check_and_copy_token() -> bool:
    """Finds kaggle.json in Downloads and moves it to ~/.kaggle/kaggle.json"""
    if TOKEN_FILE.exists():
        log("Kaggle API token already exists in ~/.kaggle/", "OK")
        return True

    downloads_token = DOWNLOADS_DIR / "kaggle.json"
    if downloads_token.exists():
        KAGGLE_DIR.mkdir(exist_ok=True, parents=True)
        # Move token
        shutil.copy(downloads_token, TOKEN_FILE)
        log(f"Successfully moved kaggle.json from Downloads to {TOKEN_FILE}", "OK")
        return True
    
    log("kaggle.json not found in Downloads. Please download it from Kaggle Settings.", "WARN")
    return False

def install_kaggle_cli():
    """Install kaggle package if missing"""
    try:
        import kaggle
        log("Kaggle package is already installed.", "OK")
    except ImportError:
        log("Installing Kaggle CLI...", "INFO")
        subprocess.run([sys.executable, "-m", "pip", "install", "kaggle", "-q"], check=True)
        log("Kaggle CLI installed successfully.", "OK")

def get_kaggle_username() -> str:
    """Read username from kaggle.json"""
    try:
        with open(TOKEN_FILE, "r") as f:
            creds = json.load(f)
            return creds["username"]
    except Exception as e:
        log(f"Failed to read Kaggle username: {e}", "ERR")
        sys.exit(1)

def create_kaggle_notebook():
    """Generates the .ipynb notebook to run on Kaggle"""
    notebook_path = PROJECT_DIR / "heavenly_rebellion_kaggle.ipynb"
    
    # ── CELL 1: Setup and copy files ──────────────────────────────────────────
    setup_source = """# Setup and verify the workspace on Kaggle
import os, sys, shutil
from pathlib import Path

# Create work directories
WORK_DIR = Path("/kaggle/working/work")
for d in (WORK_DIR, WORK_DIR / "images", WORK_DIR / "frames", WORK_DIR / "audio", WORK_DIR / "temp"):
    d.mkdir(exist_ok=True, parents=True)

# Restore cache from previous run if available
PREV_RUN_DIR = Path("/kaggle/input/heavenly-rebellion-video-pipeline/work")
if PREV_RUN_DIR.exists():
    print("[+] Found cache directory from previous run. Restoring...")
    for sub in ["images", "frames", "audio", "temp"]:
        src_sub = PREV_RUN_DIR / sub
        dst_sub = WORK_DIR / sub
        if src_sub.exists():
            print(f"  Restoring {sub}...")
            shutil.copytree(src_sub, dst_sub, dirs_exist_ok=True)
    
    # Also copy cache from root /kaggle/working/images & audio if they exist
    PREV_ROOT = Path("/kaggle/input/heavenly-rebellion-video-pipeline")
    for sub in ["images", "audio"]:
        src_sub = PREV_ROOT / sub
        dst_sub = Path("/kaggle/working") / sub
        if src_sub.exists():
            print(f"  Restoring root {sub}...")
            shutil.copytree(src_sub, dst_sub, dirs_exist_ok=True)
            
    print("[+] Cache restoration completed.")
else:
    print("[-] No previous cache found.")

print("[+] Kaggle Workspace configured successfully.")
"""

    # ── CELL 2: Install dependencies ──────────────────────────────────────────
    install_source = """# Install required packages
!pip install edge-tts nest_asyncio google-api-python-client google-auth-oauthlib google-auth-httplib2 google-generativeai -q
print("[+] Dependencies installed.")
"""

    # ── CELL 3: Run the modified colab_pipeline.py ───────────────────────────
    run_source = r'''# Patch and run colab_pipeline.py with AI Self-Healing Loop
import os
import sys
import subprocess
import traceback
import threading
from pathlib import Path

pipeline_src = Path("/kaggle/working/colab_pipeline.py")

# Step 1: Patch paths in colab_pipeline.py initially
if pipeline_src.exists():
    with open(pipeline_src, "r") as f:
        code = f.read()

    # Modify paths for Kaggle environment
    code = code.replace('Path("/content/drive/MyDrive/HeavenlyRebellion")', 'Path("/kaggle/working")')
    code = code.replace('Path("/content/VideoForge_Work")', 'Path("/kaggle/working/work")')

    with open(pipeline_src, "w") as f:
        f.write(code)

    print("[+] Patched paths in colab_pipeline.py.")
else:
    print("[x] ERROR: colab_pipeline.py not found in working directory.")
    sys.exit(1)

# Helper to get Gemini API key
def get_gemini_api_key():
    # 1. Try Kaggle secrets
    try:
        from kaggle_secrets import UserSecretsClient
        user_secrets = UserSecretsClient()
        key = user_secrets.get_secret("GEMINI_API_KEY")
        if key:
            print("[+] Retrieved GEMINI_API_KEY from Kaggle Secrets.")
            return key
    except Exception:
        pass
        
    # 2. Try environment variable
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        print("[+] Retrieved GEMINI_API_KEY from environment variables.")
        return key

    # 3. Try local gemini_key.txt file if it was uploaded
    key_file = Path("/kaggle/working/gemini_key.txt")
    if key_file.exists():
        key = key_file.read_text().strip()
        if key:
            print("[+] Retrieved GEMINI_API_KEY from gemini_key.txt.")
            return key
            
    return None

# Helper to call Gemini API and get fixed code
def call_gemini_to_fix(error_trace, current_code):
    api_key = get_gemini_api_key()
    if not api_key:
        print("[x] ERROR: GEMINI_API_KEY not found. Cannot perform AI self-healing.")
        return None
        
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        
        # Using gemini-1.5-flash for fast and reliable fixes
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        prompt = f"""You are an expert Python self-healing agent. The script colab_pipeline.py failed with an error in the Kaggle environment.
Here is the traceback / error output:
{error_trace}

Here is the current content of colab_pipeline.py:
{current_code}

Identify the root cause of the bug, fix it, and return the complete updated python code for colab_pipeline.py.
Important requirements:
1. Do not use any markdown formatting, backticks, or explanations in your response.
2. Return ONLY the complete corrected Python code.
3. Make sure to keep the Kaggle path replacements intact (e.g. using /kaggle/working instead of /content/drive/MyDrive/HeavenlyRebellion).
"""
        print("[*] Calling Gemini API to analyze traceback and repair code...")
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Clean response text in case it wrapped it in markdown code blocks
        if response_text.startswith("```"):
            first_newline = response_text.find("\n")
            if first_newline != -1:
                response_text = response_text[first_newline+1:]
            else:
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
        
        return response_text.strip()
    except Exception as e:
        print(f"[x] Failed to call Gemini API or parse response: {e}")
        traceback.print_exc()
        return None

# Run loop with self-healing
max_attempts = 3
attempt = 1
success = False

while attempt <= max_attempts:
    print(f"\n[*] Launching pipeline script (Attempt {attempt} of {max_attempts})...")
    
    # Run in a subprocess, capturing output in case of failure
    # We use -u for unbuffered output so we can see print statements in real-time
    process = subprocess.Popen(
        ["python", "-u", "colab_pipeline.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    stdout_lines = []
    stderr_lines = []
    
    # Threaded reader to print outputs in real-time and capture them
    def read_stream(stream, lines_list, out_stream):
        for line in iter(stream.readline, ""):
            out_stream.write(line)
            out_stream.flush()
            lines_list.append(line)
            
    t1 = threading.Thread(target=read_stream, args=(process.stdout, stdout_lines, sys.stdout))
    t2 = threading.Thread(target=read_stream, args=(process.stderr, stderr_lines, sys.stderr))
    
    t1.start()
    t2.start()
    
    process.wait()
    t1.join()
    t2.join()
    
    returncode = process.returncode
    
    if returncode == 0:
        print(f"\n[+] Pipeline completed successfully on attempt {attempt}!")
        success = True
        break
    else:
        print(f"\n[x] Pipeline failed with exit code {returncode}")
        stdout_text = "".join(stdout_lines)
        stderr_text = "".join(stderr_lines)
        
        # Combine stderr and the last few lines of stdout for context
        error_context = f"--- STDERR ---\n{stderr_text}\n--- LAST STDOUT ---\n" + "".join(stdout_lines[-30:])
        
        if attempt == max_attempts:
            print("[x] Maximum self-healing attempts reached. Execution failed.")
            raise RuntimeError(f"Pipeline failed after {max_attempts} attempts.")
            
        print(f"🤖 [Self-Healing] Attempting to self-heal (Attempt {attempt} failed)...")
        
        # Read current code
        with open(pipeline_src, "r") as f:
            current_code = f.read()
            
        fixed_code = call_gemini_to_fix(error_context, current_code)
        if fixed_code and len(fixed_code) > 1000:  # Simple sanity check
            # Save a backup of the broken file
            backup_path = pipeline_src.with_name(f"colab_pipeline_failed_attempt_{attempt}.py")
            with open(backup_path, "w") as f:
                f.write(current_code)
            print(f"[+] Saved backup of failed code to {backup_path.name}")
            
            # Write corrected code
            with open(pipeline_src, "w") as f:
                f.write(fixed_code)
            print("[+] Overwritten colab_pipeline.py with corrected code from Gemini.")
            attempt += 1
        else:
            print("[x] Gemini API did not return valid code. Restarting with original code on next attempt.")
            attempt += 1

if not success:
    raise RuntimeError("Pipeline failed to complete successfully.")
'''


    notebook = {
        "nbformat": 4,
        "nbformat_minor": 4,
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "name": "python"
            }
        },
        "cells": [
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": setup_source.splitlines(keepends=True)
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": install_source.splitlines(keepends=True)
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": run_source.splitlines(keepends=True)
            }
        ]
    }

    with open(notebook_path, "w", encoding="utf-8") as f:
        json.dump(notebook, f, indent=2)
    log(f"Generated Kaggle notebook: {notebook_path.name}", "OK")

def create_kernel_metadata(username: str):
    """Create kernel-metadata.json required by Kaggle CLI"""
    metadata_path = PROJECT_DIR / "kernel-metadata.json"
    
    metadata = {
        "id": f"{username}/heavenly-rebellion-video-pipeline",
        "title": "Heavenly Rebellion Video Pipeline",
        "code_file": "heavenly_rebellion_kaggle.ipynb",
        "language": "python",
        "kernel_type": "notebook",
        "is_private": "true",
        "enable_gpu": "true",
        "enable_internet": "true",
        "dataset_sources": [],
        "competition_sources": [],
        "kernel_sources": [f"{username}/heavenly-rebellion-video-pipeline"]
    }
    
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    log("Generated kernel-metadata.json", "OK")

def copy_helper_files():
    """Copy script, expander, and pipeline directly into notebook cells"""
    notebook_path = PROJECT_DIR / "heavenly_rebellion_kaggle.ipynb"
    with open(notebook_path, "r", encoding="utf-8") as f:
        nb = json.load(f)
        
    # Read helper files
    with open(PROJECT_DIR / "colab_pipeline.py", "r", encoding="utf-8") as f:
        pipeline_code = f.read()
        
    with open(PROJECT_DIR / "story_expander.py", "r", encoding="utf-8") as f:
        expander_code = f.read()
        
    script_path = DESKTOP / "Demonic_Rebirth_Script.txt"
    if not script_path.exists():
        script_path = PROJECT_DIR / "Demonic_Rebirth_Script.txt"
        
    with open(script_path, "r", encoding="utf-8", errors="replace") as f:
        script_text = f.read()
        
    # Read credentials and token if they exist
    creds_content = ""
    if (PROJECT_DIR / "credentials.json").exists():
        with open(PROJECT_DIR / "credentials.json", "r", encoding="utf-8") as f:
            creds_content = f.read()
            
    token_content = ""
    if (PROJECT_DIR / "drive_token.json").exists():
        with open(PROJECT_DIR / "drive_token.json", "r", encoding="utf-8") as f:
            token_content = f.read()
            
    writer_cells = [
        {
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [
                "%%writefile colab_pipeline.py\n",
                pipeline_code
            ]
        },
        {
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [
                "%%writefile story_expander.py\n",
                expander_code
            ]
        },
        {
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [
                "%%writefile Demonic_Rebirth_Script.txt\n",
                script_text
            ]
        }
    ]
    
    if creds_content:
        writer_cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [
                "%%writefile credentials.json\n",
                creds_content
            ]
        })
        
    if token_content:
        writer_cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [
                "%%writefile drive_token.json\n",
                token_content
            ]
        })
        
    # Inject Gemini API key if present locally
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if gemini_key:
        writer_cells.append({
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [
                "%%writefile gemini_key.txt\n",
                gemini_key
            ]
        })
    
    nb["cells"] = writer_cells + nb["cells"]
    
    with open(notebook_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, indent=2)
    log("Injected scripts and novel text directly into the notebook cells.", "OK")

def clean_local_notebook_credentials():
    """Removes sensitive credentials from the local ipynb file to prevent accidental leaks."""
    notebook_path = PROJECT_DIR / "heavenly_rebellion_kaggle.ipynb"
    if not notebook_path.exists():
        return
    try:
        with open(notebook_path, "r", encoding="utf-8") as f:
            nb = json.load(f)
        
        # Filter out cells that write credentials.json or drive_token.json
        cleaned_cells = []
        for cell in nb.get("cells", []):
            source = "".join(cell.get("source", []))
            if "credentials.json" in source or "drive_token.json" in source:
                # Replace content with a placeholder to keep cell structure but remove secrets
                cell["source"] = ["# Credentials removed for security\n"]
            cleaned_cells.append(cell)
            
        nb["cells"] = cleaned_cells
        with open(notebook_path, "w", encoding="utf-8") as f:
            json.dump(nb, f, indent=2)
        log("Cleaned sensitive credentials from local notebook file.", "OK")
    except Exception as e:
        log(f"Failed to clean credentials from local notebook: {e}", "WARN")

def main():
    log("Starting Kaggle Pipeline Setup...", "INFO")
    
    # 1. Setup token
    if not check_and_copy_token():
        return
        
    # 2. Install CLI
    install_kaggle_cli()
    
    # 3. Read username
    username = get_kaggle_username()
    log(f"Kaggle username: {username}", "INFO")
    
    # 4. Create files
    create_kaggle_notebook()
    copy_helper_files()
    create_kernel_metadata(username)
    
    # Resolve absolute path of kaggle.exe
    import sysconfig
    kaggle_cmd = "kaggle"
    sh = shutil.which("kaggle")
    if sh:
        kaggle_cmd = sh
    else:
        for scheme in ['nt_user', 'nt']:
            try:
                s_dir = Path(sysconfig.get_path('scripts', scheme))
                k_exe = s_dir / "kaggle.exe"
                if k_exe.exists():
                    kaggle_cmd = str(k_exe)
                    break
            except Exception:
                pass
        if kaggle_cmd == "kaggle":
            appdata_path = Path.home() / "AppData" / "Roaming" / "Python" / "Python314" / "Scripts" / "kaggle.exe"
            if appdata_path.exists():
                kaggle_cmd = str(appdata_path)
                
    log(f"Resolved Kaggle command path: {kaggle_cmd}", "INFO")
    
    # 5. Push to Kaggle with retries
    log("Pushing notebook to Kaggle to start cloud execution...", "INFO")
    os.environ["KAGGLE_CONFIG_DIR"] = str(KAGGLE_DIR)
    
    success = False
    for attempt in range(1, 4):
        log(f"Pushing to Kaggle (attempt {attempt}/3)...", "INFO")
        res = subprocess.run(
            [kaggle_cmd, "kernels", "push", "-p", str(PROJECT_DIR)],
            capture_output=True, text=True
        )
        if res.returncode == 0:
            success = True
            log("Notebook successfully pushed! Cloud execution has started.", "OK")
            log(res.stdout.strip(), "INFO")
            break
        else:
            log(f"Push attempt {attempt} failed: {res.stderr.strip() or 'Connection error'}", "WARN")
            if attempt < 3:
                log("Retrying in 10 seconds...", "INFO")
                time.sleep(10)
                
    # Clean credentials from local copy immediately after pushing
    clean_local_notebook_credentials()

    if not success:
        log("All Kaggle push attempts failed. Please check your network or try running the command manually.", "ERR")
        return
    
    # 6. Monitor execution
    kernel_id = f"{username}/heavenly-rebellion-video-pipeline"
    log(f"Monitoring Kaggle kernel status for: {kernel_id} ...", "WAIT")
    
    elapsed = 0
    poll_interval = 60
    while True:
        status_res = subprocess.run(
            [kaggle_cmd, "kernels", "status", kernel_id],
            capture_output=True, text=True
        )
        if status_res.returncode != 0:
            log(f"Error checking status: {status_res.stderr}", "WARN")
            time.sleep(poll_interval)
            continue
            
        status_line = status_res.stdout.strip()
        log(status_line, "INFO")
        
        if "complete" in status_line.lower():
            log("Kaggle kernel run complete! Preparing to download output files...", "OK")
            break
        elif "error" in status_line.lower() or "failed" in status_line.lower():
            log("Kaggle kernel execution failed. Please check your notebook logs on Kaggle.", "ERR")
            return
        elif "cancel" in status_line.lower() or "abort" in status_line.lower():
            log("Kaggle kernel execution was canceled or aborted.", "ERR")
            return
            
        time.sleep(poll_interval)
        elapsed += poll_interval
        
    # 7. Download output
    log("Downloading output video and logs from Kaggle...", "INFO")
    download_res = subprocess.run(
        [kaggle_cmd, "kernels", "output", kernel_id, "-p", str(DESKTOP)],
        capture_output=True, text=True
    )
    if download_res.returncode != 0:
        log(f"Download failed: {download_res.stderr}", "ERR")
    else:
        log("Download complete!", "OK")
        log(f"🎬 Check your Desktop — the video and logs have been saved there.", "OK")

if __name__ == "__main__":
    main()
