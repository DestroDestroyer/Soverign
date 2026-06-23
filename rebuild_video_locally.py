#!/usr/bin/env python3
import os
import sys
import re
import time
import shutil
import asyncio
import logging
import subprocess
import urllib.parse
from pathlib import Path
from typing import List, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

# PIL
try:
    from PIL import Image, ImageOps, ImageEnhance
except ImportError:
    print("Installing Pillow...")
    subprocess.run([sys.executable, "-m", "pip", "install", "Pillow"], check=True)
    from PIL import Image, ImageOps, ImageEnhance

# Google API
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# ─── Configuration ────────────────────────────────────────────────────────────
DESKTOP = Path.home() / "Desktop"
PROJECT_DIR = Path(r"D:\Soverign")
TOKEN_FILE = PROJECT_DIR / "drive_token.json"
CREDENTIALS_FILE = PROJECT_DIR / "credentials.json"
SCOPES = ["https://www.googleapis.com/auth/drive"]

NOVEL_FILE = DESKTOP / "Demonic_Rebirth_Script.txt"
if not NOVEL_FILE.exists():
    NOVEL_FILE = PROJECT_DIR / "Demonic_Rebirth_Script.txt"

BGM_FILES = [DESKTOP / "master_audio.mp3", DESKTOP / "saga_audio.mp3"]
OUTPUT_VIDEO = DESKTOP / "demonic_rebirth.mp4"

WORK_DIR = PROJECT_DIR / "work"
IMG_DIR = WORK_DIR / "images"
FRM_DIR = WORK_DIR / "frames"
AUD_DIR = WORK_DIR / "audio"
TMP_DIR = WORK_DIR / "temp"

for d in (WORK_DIR, IMG_DIR, FRM_DIR, AUD_DIR, TMP_DIR):
    d.mkdir(exist_ok=True, parents=True)

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(WORK_DIR / "rebuild_local.log", encoding="utf-8"),
    ]
)
def log(msg, level="INFO"):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [{level}] {msg}")

# Constants
WIDTH, HEIGHT = 1920, 1080
FPS = 30
TRANSITION = 0.5
SHOT_SECONDS = 4.0
SHOTS_PER_SCENE = 5
STYLE = (
    "hyperrealistic wuxia concept art, gorgeous details, 8K resolution, "
    "high contrast chiaroscuro lighting, cinematic color grading, "
    "epic fantasy atmosphere, no text, no watermark, no UI elements, "
    "award-winning digital art"
)
SHOT_TYPES = [
    "epic wide establishing shot, vast cinematic landscape scale, sweeping panorama, dramatic sky with volumetric clouds",
    "dramatic medium shot, powerful dynamic camera angle, intense atmospheric perspective, detailed character presence",
    "extreme cinematic close-up, deep emotional focus, razor-sharp detail, dramatic shallow depth of field bokeh",
    "dynamic action shot, intense movement and speed, martial arts posture, spectacular lighting particle effects",
    "mystical atmospheric detail, close-up on elements, glowing runes, celestial energy swirls",
]

ENCODER = "libx264"
NVENC_PRESET = "p3"
NVENC_CQ = "16"
NVENC_BITRATE = "30M"

def detect_encoder() -> str:
    global NVENC_PRESET, ENCODER
    try:
        r = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        if "h264_nvenc" in r.stdout:
            # Verify NVENC works on Windows/Linux by using TMP_DIR
            test_file = TMP_DIR / "nvenc_test.mp4"
            test = subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=black:s=128x72:d=0.1",
                 "-c:v", "h264_nvenc", "-preset", NVENC_PRESET,
                 "-rc", "vbr", "-cq", NVENC_CQ, str(test_file)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            if test.returncode == 0:
                log(f"GPU NVENC confirmed: h264_nvenc {NVENC_PRESET} CQ{NVENC_CQ}")
                try:
                    test_file.unlink(missing_ok=True)
                except Exception:
                    pass
                return "h264_nvenc"
            
            # Try legacy preset
            test_legacy = subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=black:s=128x72:d=0.1",
                 "-c:v", "h264_nvenc", "-preset", "slow",
                 "-rc", "vbr", "-cq", NVENC_CQ, str(test_file)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            if test_legacy.returncode == 0:
                log(f"GPU NVENC confirmed: h264_nvenc slow CQ{NVENC_CQ}")
                NVENC_PRESET = "slow"
                try:
                    test_file.unlink(missing_ok=True)
                except Exception:
                    pass
                return "h264_nvenc"
    except Exception as e:
        log(f"Failed to detect GPU encoder: {e}. Defaulting to CPU.", "WARN")
    
    log("Using CPU mode: libx264 slow CRF16")
    return "libx264"

def get_enc_args() -> list:
    if ENCODER == "h264_nvenc":
        return [
            "-c:v", "h264_nvenc",
            "-preset", NVENC_PRESET,
            "-rc", "vbr",
            "-cq", NVENC_CQ,
            "-b:v", NVENC_BITRATE,
            "-maxrate", "40M",      # Fixed: maxrate must be >= target bitrate (was 10M vs 30M)
            "-bufsize", "50M",
            "-profile:v", "high",
            "-level", "4.2",
        ]
    else:
        return [
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "16",
        ]

# ─── Google Drive Service ─────────────────────────────────────────────────────
def get_drive_service():
    if not TOKEN_FILE.exists():
        log("drive_token.json not found in project directory. Google Drive download disabled.", "WARN")
        return None
    try:
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                TOKEN_FILE.write_text(creds.to_json())
        return build("drive", "v3", credentials=creds)
    except Exception as e:
        log(f"Failed to authenticate Google Drive: {e}", "WARN")
        return None

# ─── Parse Script ─────────────────────────────────────────────────────────────
def parse_novel() -> List[Dict]:
    if not NOVEL_FILE.exists():
        log(f"ERROR: Script file {NOVEL_FILE} not found.", "ERR")
        sys.exit(1)
        
    with open(NOVEL_FILE, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    pattern = re.compile(
        r"Scene\s+(\d+):\s*(.*?)\n(?:DESCRIPTION:\n(.*?)\n)?(?:DIALOGUE:\n(.*?)\n)?(?:IMAGE PROMPT:\s*(.*?)(?=\nScene|\n\n|\Z))?",
        re.DOTALL | re.IGNORECASE
    )
    
    matches = pattern.findall(text)
    scenes = []
    
    # 1. Parse scenes from script
    for m in matches:
        s_num = int(m[0])
        s_title = m[1].strip()
        s_desc = m[2].strip() if m[2] != "" else ""
        s_diag = m[3].strip() if m[3] != "" else ""
        s_prompt = m[4].strip() if m[4] != "" else f"Wuxia scene: {s_title}"
        
        # Extract 5 shot-specific prompts
        lines = [l.strip() for l in s_prompt.split('\n') if l.strip()]
        prompts = []
        for line in lines:
            cleaned = re.sub(r"^\d+[\.:\s\-]+", "", line).strip()
            if cleaned:
                prompts.append(cleaned)
        while len(prompts) < 5:
            prompts.append(s_prompt if s_prompt else f"Wuxia scene: {s_title}")
        prompts = prompts[:5]
        
        scenes.append({
            "num": s_num,
            "title": s_title,
            "prompt": s_prompt,
            "prompts": prompts,
            "dialogue": s_diag,
            "description": s_desc,
        })
        
    scenes.sort(key=lambda x: x["num"])
    
    # 2. Inject Intro Scene (Scene 0)
    import story_expander
    if hasattr(story_expander, "SCENE_EXPANSIONS") and 0 in story_expander.SCENE_EXPANSIONS:
        entry = story_expander.SCENE_EXPANSIONS[0]
        if isinstance(entry, dict):
            intro_desc = entry.get("description", "Welcome to The Heavenly Rebellion.")
            intro_prompt = entry.get("image_prompt", "epic fantasy title card, cultivation world")
        else:
            intro_desc = str(entry)
            intro_prompt = (
                "epic fantasy title card, vast golden heavenly realm, ancient cultivation world, "
                "towering jade mountains, swirling qi energy, dramatic sunrise, "
                "cinematic widescreen composition"
            )
        scenes.insert(0, {
            "num": 0,
            "title": "Intro Story",
            "prompt": intro_prompt,
            "prompts": [intro_prompt] * 5,
            "dialogue": "",
            "description": intro_desc,
        })
    return scenes

# ─── Drive Download Helper ────────────────────────────────────────────────────
def download_drive_folder(service, folder_name: str, subfolder_name: str, local_dest: Path):
    log(f"Checking Google Drive for {subfolder_name} files...")
    # Find folder
    q = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    res = service.files().list(q=q, fields="files(id)").execute()
    folders = res.get("files", [])
    if not folders:
        log(f"Google Drive folder '{folder_name}' not found.", "WARN")
        return
    folder_id = folders[0]["id"]
    
    # Find subfolder
    q = f"name='{subfolder_name}' and '{folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    res = service.files().list(q=q, fields="files(id)").execute()
    subfolders = res.get("files", [])
    if not subfolders:
        log(f"Subfolder '{subfolder_name}' not found in Drive.", "WARN")
        return
    subfolder_id = subfolders[0]["id"]
    
    # List all files in subfolder
    drive_files = {}
    page_token = None
    while True:
        q = f"'{subfolder_id}' in parents and trashed=false"
        res = service.files().list(q=q, fields="nextPageToken, files(id, name, size)", pageToken=page_token).execute()
        for f in res.get("files", []):
            drive_files[f["name"]] = (f["id"], int(f.get("size", 0)))
        page_token = res.get("nextPageToken")
        if not page_token:
            break
            
    # Download missing files
    downloaded = 0
    skipped = 0
    
    for name, (file_id, size) in drive_files.items():
        local_path = local_dest / name
        if local_path.exists() and local_path.stat().st_size == size:
            skipped += 1
            continue
            
        # Download file
        try:
            request = service.files().get_media(fileId=file_id)
            fh = open(local_path, "wb")
            downloader = MediaIoBaseDownload(fh, request, chunksize=1024*1024)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            fh.close()
            downloaded += 1
        except Exception as e:
            log(f"Failed to download {name}: {e}", "WARN")
            
    log(f"Done syncing {subfolder_name}: downloaded {downloaded} files, skipped {skipped} existing.")

# ─── Pollinations Download Fallback ───────────────────────────────────────────
def download_missing_from_pollinations(scenes: List[Dict]):
    log("Checking if any images are missing and downloading from Pollinations...")
    missing_tasks = []
    
    for s_idx, scene in enumerate(scenes):
        for shot_idx, shot_type in enumerate(SHOT_TYPES):
            local_path = IMG_DIR / f"scene_{s_idx:03d}_shot_{shot_idx}.png"
            if not local_path.exists() or local_path.stat().st_size < 20000:
                scene_prompt = scene.get("prompts", [scene["prompt"]]*5)[shot_idx]
                full_prompt = f"{scene_prompt}, {shot_type}, {STYLE}"
                missing_tasks.append((local_path, full_prompt, s_idx, shot_idx))
                
    if not missing_tasks:
        log("No images missing. All cached.")
        return
        
    log(f"Found {len(missing_tasks)} missing images. Downloading...")
    
    import requests
    def download_one(dest, prompt, s, sh):
        url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt, safe='')}?width={WIDTH}&height={HEIGHT}&nologo=true"
        for attempt in range(3):
            try:
                r = requests.get(url, timeout=60)
                if r.status_code == 200 and len(r.content) > 20000:
                    dest.write_bytes(r.content)
                    return True
                time.sleep(3)
            except Exception:
                time.sleep(3)
        return False

    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [pool.submit(download_one, *t) for t in missing_tasks]
        for fut in as_completed(futs):
            fut.result()
    log("All missing images processed.")

# ─── Frame Preparation ────────────────────────────────────────────────────────
def _enhance_one_image(src_path: Path, dst_path: Path):
    if dst_path.exists() and dst_path.stat().st_size > 1000:
        return
    if not src_path.exists() or src_path.stat().st_size < 20000:
        # Create black frame
        im = Image.new("RGB", (WIDTH, HEIGHT), "black")
        im.save(dst_path, "PNG")
        return
    try:
        with Image.open(src_path) as im:
            rgb = im.convert("RGB")
            fitted = ImageOps.fit(rgb, (WIDTH, HEIGHT), Image.Resampling.LANCZOS)
            
            # Subtle enhancements
            fitted = ImageEnhance.Contrast(fitted).enhance(1.08)
            fitted = ImageEnhance.Sharpness(fitted).enhance(1.15)
            fitted = ImageEnhance.Color(fitted).enhance(1.05)
            
            fitted.save(dst_path, "PNG", compress_level=1)
    except Exception as e:
        log(f"Failed enhancing image {src_path.name}: {e}", "WARN")

def prepare_all_frames(scenes: List[Dict]):
    log(f"=== Fitting and Enhancing Frames to {WIDTH}x{HEIGHT}... ===")
    tasks = []
    for s_idx, scene in enumerate(scenes):
        scene["frames"] = []
        for shot_idx in range(SHOTS_PER_SCENE):
            src = IMG_DIR / f"scene_{s_idx:03d}_shot_{shot_idx}.png"
            dst = FRM_DIR / f"frame_{s_idx:03d}_{shot_idx}.png"
            scene["frames"].append(str(dst))
            tasks.append((src, dst))
            
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_enhance_one_image, src, dst) for src, dst in tasks]
        for fut in as_completed(futures):
            fut.result()
    log("Frame enhancement completed.")

# ─── Ken Burns Filter Generator ───────────────────────────────────────────────
def _ken_burns_vf(shot_idx: int, n_frames: int) -> str:
    zoom_speed = 0.0008
    if shot_idx % 5 == 0:
        motion = (
            f"scale={int(WIDTH*1.2)}:{int(HEIGHT*1.2)},"
            f"zoompan=z='min(zoom+{zoom_speed},1.2)':"
            f"x='trunc(iw/2-(iw/zoom/2))':y='trunc(ih/2-(ih/zoom/2))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    elif shot_idx % 5 == 1:
        motion = (
            f"scale={int(WIDTH*1.2)}:{int(HEIGHT*1.2)},"
            f"zoompan=z='max(1.2-{zoom_speed}*on,1.0)':"
            f"x='trunc(iw/2-(iw/zoom/2))':y='trunc(ih/2-(ih/zoom/2))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    elif shot_idx % 5 == 2:
        motion = (
            f"scale={int(WIDTH*1.15)}:{int(HEIGHT*1.15)},"
            f"zoompan=z='1.1':"
            f"x='trunc(min((iw-iw/zoom)*(on/{n_frames}),iw-iw/zoom))':"
            f"y='trunc(ih/2-(ih/zoom/2))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    elif shot_idx % 5 == 3:
        motion = (
            f"scale={int(WIDTH*1.15)}:{int(HEIGHT*1.15)},"
            f"zoompan=z='1.1':"
            f"x='trunc(min((iw-iw/zoom)*((n_frames-on)/n_frames),iw-iw/zoom))':"
            f"y='trunc(ih/2-(ih/zoom/2))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    else:
        motion = (
            f"scale={int(WIDTH*1.2)}:{int(HEIGHT*1.2)},"
            f"zoompan=z='min(zoom+{zoom_speed},1.2)':"
            f"x='trunc(min({zoom_speed}*on*iw,iw-iw/zoom))':"
            f"y='trunc(min({zoom_speed}*on*ih,ih-ih/zoom))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    return motion

# ─── Scene Rendering ──────────────────────────────────────────────────────────
def get_audio_duration(path: str) -> float:
    try:
        r = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path
        ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        return float(r.stdout.strip())
    except Exception:
        return 10.0

def render_scene(s_idx: int, scene: Dict, out: Path):
    audio_path = AUD_DIR / f"scene_{s_idx:03d}.mp3"
    if not audio_path.exists():
        audio_path = AUD_DIR / f"scene_{s_idx:03d}_fallback.mp3"
        if not audio_path.exists():
            # Create a 10s silent fallback
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=24000",
                "-t", "10", "-c:a", "libmp3lame", str(audio_path)
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
    dur = get_audio_duration(str(audio_path))
    n_shots = max(1, int(round(dur / SHOT_SECONDS)))
    s_dur = dur / n_shots
    
    cmd = ["ffmpeg", "-y"]
    # 1. Add image inputs with correct input framerate
    for i in range(n_shots):
        img_path = Path(scene["frames"][i % SHOTS_PER_SCENE])
        cmd += ["-framerate", str(FPS), "-loop", "1", "-t", f"{s_dur:.3f}", "-i", str(img_path)]
        
    # 2. Add audio input
    cmd += ["-i", str(audio_path)]
    
    # 3. Build filter complex
    filters = []
    for i in range(n_shots):
        vf = _ken_burns_vf(i, int(round(s_dur * FPS)))
        filters.append(f"[{i}:v]{vf}[v{i}]")
        
    concat_str = "".join(f"[v{i}]" for i in range(n_shots)) + f"concat=n={n_shots}:v=1:a=0[rawv]"
    
    # Safe fade durations
    t_fade = min(TRANSITION, dur / 4)
    fade_out = dur - t_fade
    fade_str = f"[rawv]fade=t=in:st=0:d={t_fade:.3f},fade=t=out:st={fade_out:.3f}:d={t_fade:.3f}[outv]"
    
    filter_complex = ";".join(filters) + ";" + concat_str + ";" + fade_str
    
    cmd += ["-filter_complex", filter_complex]
    cmd += ["-map", "[outv]", "-map", f"{n_shots}:a"]
    
    # Pristine CPU quality parameters
    cmd += get_enc_args() + [
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-r", str(FPS),
        str(out)
    ]
    
    # Run FFmpeg
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if r.returncode != 0:
        err = r.stderr.decode(errors="replace")
        log(f"  Warning: Scene {s_idx} failed with Ken Burns. Falling back to simple scale. Details: {err[-150:].strip()}", "WARN")
        
        # Fallback without zoompan to ensure the scene compiles
        cmd_fallback = ["ffmpeg", "-y"]
        for i in range(n_shots):
            img_path = Path(scene["frames"][i % SHOTS_PER_SCENE])
            cmd_fallback += ["-framerate", str(FPS), "-loop", "1", "-t", f"{s_dur:.3f}", "-i", str(img_path)]
        cmd_fallback += ["-i", str(audio_path)]
        
        fallback_filters = [f"[{i}:v]scale={WIDTH}:{HEIGHT}[v{i}]" for i in range(n_shots)]
        fallback_concat = "".join(f"[v{i}]" for i in range(n_shots)) + f"concat=n={n_shots}:v=1:a=0[outv]"
        
        cmd_fallback += ["-filter_complex", ";".join(fallback_filters) + ";" + fallback_concat]
        cmd_fallback += ["-map", "[outv]", "-map", f"{n_shots}:a"]
        cmd_fallback += get_enc_args() + [
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            str(out)
        ]
        subprocess.run(cmd_fallback, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# ─── Compile Video ────────────────────────────────────────────────────────────
def build_final_video(scenes: List[Dict]):
    log("=== Rendering individual scene clips (using 2 parallel workers to avoid thrashing)... ===")
    tasks = []
    for s_idx, scene in enumerate(scenes):
        out = TMP_DIR / f"v_{s_idx:03d}.mp4"
        scene["video"] = str(out)
        if out.exists() and out.stat().st_size > 10000:
            continue
        tasks.append((s_idx, scene, out))
        
    done = 0
    with ThreadPoolExecutor(max_workers=2) as pool:
        futs = {pool.submit(render_scene, *t): t[0] for t in tasks}
        for fut in as_completed(futs):
            s_idx = futs[fut]
            try:
                fut.result()
            except Exception as e:
                log(f"  CRITICAL: Scene {s_idx} failed rendering: {e}", "ERR")
            done += 1
            if done % 5 == 0 or done == len(tasks):
                print(f"  Progress: {done}/{len(tasks)} scenes rendered.")
                
    # Concatenate all scene clips
    log("=== Concatenating all scenes... ===")
    concat_list_path = WORK_DIR / "concat_list.txt"
    with open(concat_list_path, "w", encoding="utf-8") as f:
        for scene in scenes:
            v_path = Path(scene["video"]).absolute()
            f.write(f"file '{str(v_path).replace(chr(92), '/')}'\n")
            
    temp_full_video = WORK_DIR / "temp_full.mp4"
    concat_cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_list_path),
        "-c", "copy", "-movflags", "+faststart",
        str(temp_full_video)
    ]
    subprocess.run(concat_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Mix Background Music
    log("=== Mixing Background Music and exporting final master video... ===")
    active_bgm = [f for f in BGM_FILES if f.exists()]
    if active_bgm:
        bgm = active_bgm[0]
        log(f"  Mixing BGM: {bgm.name}")
        
        final_cmd = [
            "ffmpeg", "-y",
            "-i", str(temp_full_video),
            "-stream_loop", "-1", "-i", str(bgm),
            "-filter_complex",
            "[0:a]volume=1.0,acompressor=threshold=0.089:ratio=4:attack=5:release=50[voice];"
            "[1:a]volume=0.07[bgm];"
            "[voice][bgm]amix=inputs=2:duration=first:dropout_transition=3:normalize=0[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest", "-movflags", "+faststart",
            str(OUTPUT_VIDEO)
        ]
    else:
        log("  No BGM files found. Exporting without music.")
        final_cmd = [
            "ffmpeg", "-y", "-i", str(temp_full_video),
            "-c", "copy", "-movflags", "+faststart",
            str(OUTPUT_VIDEO)
        ]
        
    r = subprocess.run(final_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if r.returncode == 0:
        log(f"🎬 SUCCESS! Final high-quality video created at: {OUTPUT_VIDEO}", "OK")
        size_gb = OUTPUT_VIDEO.stat().st_size / 1024 / 1024 / 1024
        log(f"🎬 Size: {size_gb:.2f} GB", "OK")
        # Clean up temp
        try:
            shutil.rmtree(FRM_DIR)
            shutil.rmtree(TMP_DIR)
            temp_full_video.unlink(missing_ok=True)
            concat_list_path.unlink(missing_ok=True)
        except Exception:
            pass
    else:
        err = r.stderr.decode(errors="replace")
        log(f"Export failed: {err[-400:].strip()}", "ERR")

# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    global ENCODER
    log("=========================================================")
    log("  VideoForge Rebuilder — Smooth 30FPS & High Quality")
    log("=========================================================")
    ENCODER = detect_encoder()
    
    # 1. Google Drive Auth
    service = get_drive_service()
    if not service:
        log("Google Drive credentials not found or invalid. Checking for local assets...", "WARN")
        img_count = len(list(IMG_DIR.glob("*.png")))
        aud_count = len(list(AUD_DIR.glob("*.mp3")))
        if img_count == 0 or aud_count == 0:
            log("Missing local assets (images/audio) and cannot sync from Google Drive. Aborting.", "ERR")
            sys.exit(1)
        else:
            log(f"Found {img_count} local images and {aud_count} local audio files. Continuing offline with local assets.", "INFO")
    else:
        # 2. Sync Assets from Drive
        download_drive_folder(service, "HeavenlyRebellion", "images", IMG_DIR)
        download_drive_folder(service, "HeavenlyRebellion", "audio", AUD_DIR)
    
    # 3. Parse script and check images
    scenes = parse_novel()
    log(f"Parsed {len(scenes)} scenes from novel script.")
    
    # Download missing from pollinations if any
    download_missing_from_pollinations(scenes)
    
    # 4. Fit & Enhance
    prepare_all_frames(scenes)
    
    # 5. Render & Build
    build_final_video(scenes)

if __name__ == "__main__":
    main()
