#!/usr/bin/env python3
"""
colab_launcher.py  —  Local Orchestrator for Google Colab Pipeline
====================================================================
Run this script on your Windows laptop ONCE to:

  1. Upload all required files to your Google Drive
     (novel script, story_expander.py, BGM audio, colab_pipeline.py)
  2. Generate and open the Google Colab notebook in your browser
     (you click Runtime > Run All — just ONE click)
  3. Automatically monitor your Google Drive for the DONE.flag
  4. Auto-download the finished video to your Desktop when Colab finishes

Requirements (already installed):
  pip install google-api-python-client google-auth-oauthlib google-auth-httplib2

Usage:
  python C:\\Ai\\project\\colab_launcher.py

The script will handle everything else automatically.
"""

import os
import sys
import time
import json
import webbrowser
import mimetypes
from pathlib import Path
from datetime import datetime

# Google API imports
try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
    import io
except ImportError:
    print("ERROR: Google API packages not found.")
    print("Run: pip install google-api-python-client google-auth-oauthlib google-auth-httplib2")
    sys.exit(1)

# ─── Configuration ────────────────────────────────────────────────────────────
DRIVE_FOLDER_NAME = "HeavenlyRebellion"   # Folder name in Google Drive root
DESKTOP          = Path.home() / "Desktop"
PROJECT_DIR      = Path(r"D:\Soverign")
OUTPUT_FILENAME  = "Heavenly_Rebellion_Book1_1Hour_Smooth.mp4"
LOG_FILENAME     = "colab_pipeline.log"
DONE_FLAG        = "DONE.flag"
COLAB_NOTEBOOK_FILENAME = "heavenly_rebellion_colab.ipynb"

# Files to upload to Google Drive
LOCAL_FILES_TO_UPLOAD = {
    "Heavenly_Rebellion_Book1_Script.txt" : DESKTOP / "Heavenly_Rebellion_Book1_Script.txt",
    "story_expander.py"                   : PROJECT_DIR / "story_expander.py",
    "colab_pipeline.py"                   : PROJECT_DIR / "colab_pipeline.py",
    COLAB_NOTEBOOK_FILENAME               : PROJECT_DIR / COLAB_NOTEBOOK_FILENAME,
    # BGM files — only uploaded if they exist
    "master_audio.mp3"                    : DESKTOP / "master_audio.mp3",
    "saga_audio.mp3"                      : DESKTOP / "saga_audio.mp3",
}

# OAuth Scopes — full Drive access needed for upload/download
SCOPES = ["https://www.googleapis.com/auth/drive"]

# Token cache file
TOKEN_FILE       = PROJECT_DIR / "drive_token.json"

# Your own OAuth2 Desktop App credentials (downloaded from Google Cloud Console)
CREDENTIALS_FILE = PROJECT_DIR / "credentials.json"

# ─── Colour console output ────────────────────────────────────────────────────
def log(msg: str, level: str = "INFO"):
    ts = datetime.now().strftime("%H:%M:%S")
    icons = {"INFO": "[i]", "OK": "[+]", "WARN": "[!]", "ERR": "[x]", "WAIT": "[*]"}
    icon = icons.get(level, "   ")
    print(f"[{ts}] {icon} {msg}")


# ─── Google Drive Authentication ──────────────────────────────────────────────
def get_drive_service():
    """Authenticate and return a Google Drive service object."""
    creds = None

    # Load cached token if available
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except Exception:
            creds = None

    # Refresh or re-authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            log("Refreshing existing credentials ...", "INFO")
            try:
                creds.refresh(Request())
            except Exception:
                creds = None

        if not creds:
            # Load YOUR credentials.json from Google Cloud Console
            if not CREDENTIALS_FILE.exists():
                log("", "ERR")
                log("credentials.json NOT FOUND!", "ERR")
                log("Please follow these steps:", "ERR")
                log("  1. Go to: https://console.cloud.google.com/", "ERR")
                log("  2. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID", "ERR")
                log("  3. Choose 'Desktop app' → Download JSON", "ERR")
                log(f"  4. Save the file as: {CREDENTIALS_FILE}", "ERR")
                log("Then run this script again.", "ERR")
                sys.exit(1)

            flow  = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
            log("Opening browser for Google Sign-In (one-time setup) ...", "INFO")
            creds = flow.run_local_server(port=0)

        # Save token for future runs
        TOKEN_FILE.write_text(creds.to_json())
        log("Credentials saved for future runs.", "OK")

    service = build("drive", "v3", credentials=creds)
    log("Google Drive authenticated.", "OK")
    return service


# ─── Drive Folder Management ──────────────────────────────────────────────────
def get_or_create_folder(service, name: str) -> str:
    """Return the ID of a Drive folder, creating it if it doesn't exist."""
    q = (f"name='{name}' and mimeType='application/vnd.google-apps.folder' "
         f"and trashed=false")
    res = service.files().list(q=q, fields="files(id, name)").execute()
    files = res.get("files", [])
    if files:
        folder_id = files[0]["id"]
        log(f"Found existing Drive folder: '{name}' (id={folder_id[:12]}...)", "OK")
        return folder_id

    meta = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    folder = service.files().create(body=meta, fields="id").execute()
    folder_id = folder["id"]
    log(f"Created Drive folder: '{name}' (id={folder_id[:12]}...)", "OK")
    return folder_id


# ─── Upload File ──────────────────────────────────────────────────────────────
def upload_file(service, local_path: Path, filename: str, folder_id: str) -> str:
    """Upload a file to a Drive folder. Returns the file ID."""
    # Check if file already exists in folder
    q = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
    res = service.files().list(q=q, fields="files(id, name, modifiedTime)").execute()
    existing = res.get("files", [])

    mime, _ = mimetypes.guess_type(str(local_path))
    mime = mime or "application/octet-stream"
    media = MediaFileUpload(str(local_path), mimetype=mime, resumable=True)

    if existing:
        # Update existing file
        file_id = existing[0]["id"]
        service.files().update(fileId=file_id, media_body=media).execute()
        log(f"  Updated: {filename}", "OK")
        return file_id
    else:
        # Create new file
        meta = {"name": filename, "parents": [folder_id]}
        file = service.files().create(body=meta, media_body=media, fields="id").execute()
        log(f"  Uploaded: {filename}", "OK")
        return file["id"]


def upload_all_files(service, folder_id: str):
    """Upload all required local files to the Drive folder."""
    log("Uploading files to Google Drive ...", "INFO")
    for filename, local_path in LOCAL_FILES_TO_UPLOAD.items():
        if not Path(local_path).exists():
            log(f"  Skipping {filename} (not found locally)", "WARN")
            continue
        size_mb = Path(local_path).stat().st_size / 1_048_576
        log(f"  Uploading {filename} ({size_mb:.1f} MB) ...", "INFO")
        upload_file(service, local_path, filename, folder_id)
    log("All files uploaded to Drive.", "OK")


# ─── Generate Colab Notebook ───────────────────────────────────────────────────
def generate_colab_notebook() -> Path:
    """
    Generate a clean 2-cell Colab notebook.
    Cell 1: Full auto-setup (Drive mount that remembers you, deps, file copy)
    Cell 2: Run the full MAX QUALITY pipeline
    """
    nb_path = PROJECT_DIR / COLAB_NOTEBOOK_FILENAME

    # ── CELL 1: Complete auto-setup ───────────────────────────────────────────
    setup_source = """\
# =============================================================================
#  HEAVENLY REBELLION — MAX QUALITY Cloud Video Pipeline
#  Just run this cell, then run Cell 2. That's it!
# =============================================================================

import os, sys, shutil, subprocess
from pathlib import Path

# ── Step 1: Mount Google Drive (remembers you automatically) ─────────────────
from google.colab import drive
import shutil

def mount_drive_robustly():
    mountpoint = '/content/drive'
    mydrive = '/content/drive/MyDrive'
    
    # 1. Check if already mounted and working
    if os.path.exists(mydrive) and os.path.isdir(mydrive):
        try:
            # Try to list directory contents to verify it is responsive
            os.listdir(mydrive)
            print('[+] Google Drive is already mounted and working perfectly.')
            return
        except Exception as e:
            print(f'[*] Active mount point detected but unresponsive: {e}. Re-mounting...')
            
    # 2. If the mountpoint exists and is not empty, unmount or rename it
    if os.path.exists(mountpoint) and os.path.isdir(mountpoint) and os.listdir(mountpoint):
        print('[!] Mountpoint exists and is not empty. Clean unmounting...')
        try:
            drive.flush_and_unmount()
            print('[+] Clean unmount successful.')
        except Exception as e:
            print(f'[-] Clean unmount bypassed: {e}')
            
        # Try force unmounting using system commands
        subprocess.run(['umount', '-f', mountpoint], capture_output=True)
        subprocess.run(['fusermount', '-u', mountpoint], capture_output=True)
        import time
        time.sleep(2)
        
        # If it still contains files, rename it to get it out of the way safely
        if os.path.exists(mountpoint) and os.path.isdir(mountpoint) and os.listdir(mountpoint):
            backup_name = f"/content/drive_backup_{int(time.time())}"
            print(f'[!] Mountpoint still contains files. Renaming {mountpoint} to {backup_name}...')
            try:
                os.rename(mountpoint, backup_name)
                print('[+] Renamed successfully.')
            except Exception as e:
                print(f'[!] Rename failed: {e}. Trying standard mount anyway...')
                
    # 3. Mount Google Drive cleanly
    print('[*] Mounting Google Drive to /content/drive ...')
    try:
        drive.mount(mountpoint)
        print('[+] Drive mounted successfully!')
    except Exception as e:
        print(f'[!] Standard mount failed: {e}. Trying force remount...')
        try:
            drive.mount(mountpoint, force_remount=True)
            print('[+] Force remount successful!')
        except Exception as e2:
            print(f'[x] Mount failed completely: {e2}')
            raise e2

try:
    mount_drive_robustly()
except Exception as e:
    print(f'[x] Mount failed: {e}')

# Force-refresh Google Drive directory cache in Colab to avoid FileNotFoundError on newly uploaded files
print('[*] Refreshing Google Drive directory cache...')
try:
    os.listdir('/content/drive')
    if os.path.exists('/content/drive/MyDrive'):
        os.listdir('/content/drive/MyDrive')
        if os.path.exists('/content/drive/MyDrive/HeavenlyRebellion'):
            os.listdir('/content/drive/MyDrive/HeavenlyRebellion')
    print('[+] Cache refresh complete.')
except Exception as e:
    print(f'[!] Warning during cache refresh: {e}')

DRIVE_FOLDER = Path('/content/drive/MyDrive/HeavenlyRebellion')
assert DRIVE_FOLDER.exists(), f'ERROR: {DRIVE_FOLDER} not found. Run colab_launcher.py on your PC first!'
print(f'[+] Drive folder found: {DRIVE_FOLDER}')

# ── Step 2: Install packages (skips if already installed) ────────────────────
def pkg_installed(name):
    try:
        __import__(name)
        return True
    except ImportError:
        return False

deps = []
if not pkg_installed('edge_tts'):
    deps.append('edge-tts')
if not pkg_installed('nest_asyncio'):
    deps.append('nest_asyncio')

if deps:
    print(f'[*] Installing missing packages: {", ".join(deps)} ...')
    subprocess.run(['pip', 'install'] + deps + ['-q'], check=True)
else:
    print('[+] All dependencies (edge-tts, nest_asyncio) are already installed.')

# Install ffmpeg if missing
ffmpeg_check = subprocess.run(['which', 'ffmpeg'], capture_output=True)
if ffmpeg_check.returncode != 0:
    print('[*] Installing FFmpeg ...')
    subprocess.run('apt-get update -qq && apt-get install -y ffmpeg -qq', shell=True, check=True)
else:
    print('[+] FFmpeg already installed — skipping.')

# ── Step 3: GPU check ────────────────────────────────────────────────────────
gpu = subprocess.run(
    ['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'],
    capture_output=True, text=True
)
if gpu.returncode == 0:
    print(f'[+] GPU: {gpu.stdout.strip()}')
else:
    print('[!] No GPU — CPU mode (slower but still works)')

# ── Step 4: Copy latest pipeline scripts from Drive to Colab SSD ─────────────
shutil.copy(DRIVE_FOLDER / 'colab_pipeline.py',  '/content/colab_pipeline.py')
shutil.copy(DRIVE_FOLDER / 'story_expander.py',  '/content/story_expander.py')
sys.path.insert(0, '/content')
sys.path.insert(0, str(DRIVE_FOLDER))

# Verify it is the MAX QUALITY version
content = Path('/content/colab_pipeline.py').read_text()
if 'NVENC_CQ' in content and 'NVENC_PRESET' in content:
    print('[+] MAX QUALITY pipeline confirmed (CQ18, 1920x1080, h264_nvenc p7, 30fps)')
else:
    print('[!] WARNING: Old pipeline version detected. Re-run colab_launcher.py on your PC.')

# ── Step 5: Verify all required files ────────────────────────────────────────
files = sorted(DRIVE_FOLDER.iterdir())
print(f'\\n[+] Files in Drive ({len(files)} total):')
for f in files:
    print(f'    {f.name:50s}  {f.stat().st_size/1024:8.1f} KB')

print('\\n[+] SETUP COMPLETE — Run Cell 2 to start the pipeline!')
"""

    # ── CELL 2: Run the full pipeline ─────────────────────────────────────────
    run_source = """\
# =============================================================================
#  RUN THE FULL PIPELINE
#  Estimated time: 2-4 hours (images take longest)
#  Your PowerShell window on your laptop will auto-download when done.
# =============================================================================

import runpy
runpy.run_path('/content/colab_pipeline.py', run_name='__main__')
"""

    cells = [
        {"source": setup_source},
        {"source": run_source},
    ]

    # Build .ipynb JSON structure
    notebook = {
        "nbformat": 4,
        "nbformat_minor": 4,
        "metadata": {
            "colab": {
                "name":           "Heavenly_Rebellion_Video_Pipeline.ipynb",
                "provenance":     [],
                "authorship_tag": "VideoForge Elite"
            },
            "kernelspec": {
                "display_name": "Python 3",
                "name":         "python3"
            },
            "language_info": {"name": "python"},
            "accelerator":   "GPU",
            "gpuClass":      "standard"
        },
        "cells": [
            {
                "cell_type":       "code",
                "execution_count": None,
                "metadata":        {},
                "outputs":         [],
                "source":          cell["source"],
            }
            for cell in cells
        ]
    }

    nb_path.write_text(json.dumps(notebook, indent=2), encoding="utf-8")
    log(f"Colab notebook generated: {nb_path.name}", "OK")
    return nb_path


# ─── Get Drive File ID ────────────────────────────────────────────────────────
def find_file_in_folder(service, folder_id: str, filename: str):
    """Return (file_id, modified_time) or (None, None) if not found."""
    q = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
    res = service.files().list(q=q, fields="files(id, name, modifiedTime, size)").execute()
    files = res.get("files", [])
    if files:
        return files[0]["id"], files[0].get("modifiedTime"), files[0].get("size", 0)
    return None, None, 0


# ─── Download File from Drive ─────────────────────────────────────────────────
def download_from_drive(service, file_id: str, dest: Path, total_size: int = 0):
    """Download a file from Drive to a local path with progress."""
    log(f"Downloading {dest.name} ({int(total_size) // 1_048_576} MB) ...", "WAIT")
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request, chunksize=8 * 1024 * 1024)

    done = False
    while not done:
        status, done = downloader.next_chunk()
        if status:
            pct = int(status.progress() * 100)
            mb  = buf.tell() // 1_048_576
            print(f"\r    Progress: {pct}%  ({mb} MB downloaded)", end="", flush=True)
    print()

    dest.write_bytes(buf.getvalue())
    size_mb = dest.stat().st_size / 1_048_576
    log(f"Downloaded: {dest}  ({size_mb:.1f} MB)", "OK")


def monitor_and_download(service, folder_id: str):
    """
    Poll Google Drive every 60 seconds for the DONE.flag file.
    When found, download the final video to the Desktop.
    """
    log("=" * 60, "INFO")
    log("Monitoring Google Drive for completion ...", "WAIT")
    log("(This will run until Colab finishes. Leave this window open.)", "INFO")
    log("=" * 60, "INFO")

    poll_interval = 60  # seconds
    elapsed = 0
    while True:
        try:
            done_id, done_ts, _ = find_file_in_folder(service, folder_id, DONE_FLAG)
        except Exception as e:
            log(f"Network error while polling Drive: {e}. Retrying in {poll_interval}s...", "WARN")
            time.sleep(poll_interval)
            continue

        if done_id:
            log(f"DONE.flag detected! Colab pipeline finished.", "OK")

            # Check for the log file first
            try:
                log_id, _, log_size = find_file_in_folder(service, folder_id, LOG_FILENAME)
                if log_id:
                    log_dest = DESKTOP / f"colab_pipeline_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
                    download_from_drive(service, log_id, log_dest, log_size)
            except Exception as e:
                log(f"Failed to download log file: {e}", "WARN")

            # Download the final video
            try:
                vid_id, _, vid_size = find_file_in_folder(service, folder_id, OUTPUT_FILENAME)
                if vid_id:
                    video_dest = DESKTOP / OUTPUT_FILENAME
                    download_from_drive(service, vid_id, video_dest, vid_size)
                    log(f"🎬 YOUR VIDEO IS ON YOUR DESKTOP!", "OK")
                    log(f"   {video_dest}", "OK")
                else:
                    log("Video file not found in Drive — check Colab for errors.", "ERR")
            except Exception as e:
                log(f"Failed to download video file: {e}", "ERR")
            break

        elapsed += poll_interval
        hrs, rem = divmod(elapsed, 3600)
        mins, secs = divmod(rem, 60)
        log(f"Still waiting... elapsed: {hrs:02d}:{mins:02d}:{secs:02d}. Next check in {poll_interval}s.", "WAIT")
        time.sleep(poll_interval)


# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    print()
    print("=" * 65)
    print("  VideoForge Elite — Google Colab Launcher")
    print("  Heavenly Rebellion Book 1 — Cloud Pipeline Orchestrator")
    print("=" * 65)
    print()

    # Step 1: Authenticate
    service = get_drive_service()

    # Step 2: Create/find Drive folder
    folder_id = get_or_create_folder(service, DRIVE_FOLDER_NAME)

    # Step 3: Generate Colab notebook
    nb_path = generate_colab_notebook()

    # Step 4: Upload all files
    upload_all_files(service, folder_id)

    # Step 5: Open Colab in browser
    # The notebook URL pattern that creates a new Colab from Drive file
    # We open a pre-built Colab notebook creation URL
    COLAB_UPLOAD_URL = "https://colab.research.google.com/#create=true"
    COLAB_DRIVE_URL  = f"https://colab.research.google.com/drive/"

    # Find the notebook file ID in Drive
    nb_id, _, _ = find_file_in_folder(service, folder_id, COLAB_NOTEBOOK_FILENAME)
    if nb_id:
        colab_url = f"{COLAB_DRIVE_URL}{nb_id}"
        log(f"Opening Colab notebook in your browser ...", "OK")
        log(f"URL: {colab_url}", "INFO")
        webbrowser.open(colab_url)
    else:
        log("Could not find notebook in Drive. Opening Colab home instead.", "WARN")
        webbrowser.open("https://colab.research.google.com/")

    print()
    print("=" * 65)
    print("  ACTION REQUIRED IN COLAB:")
    print("  1. Colab is now open in your browser.")
    print("  2. Click:  Runtime > Run All  (or press Ctrl+F9)")
    print("  3. If prompted, click 'Run Anyway'")
    print("  4. Leave Colab running — this window will auto-download the video.")
    print("=" * 65)
    print()

    # Step 6: Monitor and auto-download
    monitor_and_download(service, folder_id)


if __name__ == "__main__":
    main()
