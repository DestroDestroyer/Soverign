#!/usr/bin/env python3
"""
colab_pipeline.py  —  Heavenly Rebellion | MAX QUALITY Cloud Pipeline
======================================================================
Tuned specifically for Google Colab Free Tier with Tesla T4 GPU:
  CPU  : ~4 vCPUs (Intel Xeon)
  RAM  : ~12-15 GB
  GPU  : NVIDIA Tesla T4  16 GB VRAM  — h264_nvenc hardware encoding
  Net  : ~200-300 Mbps

MAX QUALITY settings enabled:
  - 1920x1080 source images from Pollinations (flux model only)
  - h264_nvenc  p7 preset (slowest/highest quality NVENC mode)
  - CQ 18 rate control (visually lossless)
  - 8 Mbps target bitrate cap
  - High444p pixel format on GPU path
  - Smooth Ken Burns zoompan on every shot
  - 30 FPS (smoother than cinematic 24)
  - 192 kbps AAC audio
  - 16 frame-fit workers (fully saturates Xeon cores)
  - 4 shot-render workers (fully saturates T4 NVENC engines)
"""

import os, re, sys, time, shutil, asyncio, logging, subprocess, urllib.parse
from pathlib import Path
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import edge_tts
from PIL import Image, ImageOps, ImageFilter, ImageEnhance

# Google Drive API support for caching
try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
    import io
    import zipfile
    HAS_DRIVE_API = True
except ImportError:
    HAS_DRIVE_API = False

# ─── Paths and Environment Detection ──────────────────────────────────────────
IS_KAGGLE = Path("/kaggle").exists()
IS_COLAB  = Path("/content").exists()

if IS_KAGGLE:
    DRIVE_ROOT = Path("/kaggle/working")
    WORK_DIR   = Path("/kaggle/working/work")
elif IS_COLAB:
    DRIVE_ROOT = Path("/content/drive/MyDrive/HeavenlyRebellion")
    WORK_DIR   = Path("/content/VideoForge_Work")
else:
    DRIVE_ROOT = Path("./HeavenlyRebellion")
    WORK_DIR   = Path("./VideoForge_Work")

NOVEL_FILE   = DRIVE_ROOT / "Demonic_Rebirth_Script.txt"
EXPANDER_SRC = DRIVE_ROOT / "story_expander.py"
BGM_FILES    = [DRIVE_ROOT / "master_audio.mp3", DRIVE_ROOT / "saga_audio.mp3"]
OUTPUT_VIDEO = DRIVE_ROOT / "demonic_rebirth.mp4"
DONE_FLAG    = DRIVE_ROOT / "DONE.flag"

IMG_DIR  = WORK_DIR / "images"
FRM_DIR  = WORK_DIR / "frames"
AUD_DIR  = WORK_DIR / "audio"

# Use RAM-disk (/dev/shm) only in Colab/Local, NOT in Kaggle to avoid RAM starvation/OOM crashes.
if Path("/dev/shm").exists() and not IS_KAGGLE:
    TMP_DIR = Path("/dev/shm/VideoForge_Temp")
else:
    TMP_DIR = WORK_DIR / "temp"

for d in (DRIVE_ROOT, WORK_DIR, IMG_DIR, FRM_DIR, AUD_DIR, TMP_DIR):
    d.mkdir(exist_ok=True, parents=True)

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(WORK_DIR / "colab_pipeline.log", encoding="utf-8"),
    ],
)
class CallableLogger:
    def __init__(self, name):
        self._logger = logging.getLogger(name)
    def __call__(self, msg, *args, **kwargs):
        self._logger.info(msg, *args, **kwargs)
    def info(self, msg, *args, **kwargs):
        self._logger.info(msg, *args, **kwargs)
    def warning(self, msg, *args, **kwargs):
        self._logger.warning(msg, *args, **kwargs)
    def error(self, msg, *args, **kwargs):
        self._logger.error(msg, *args, **kwargs)
    def exception(self, msg, *args, **kwargs):
        self._logger.exception(msg, *args, **kwargs)

log = CallableLogger("VideoForge")

# ─── MAX QUALITY Config ───────────────────────────────────────────────────────
WIDTH, HEIGHT     = 3840, 2160   # 4K UHD Master output
FPS               = 30           # Smooth cinematic (30fps feels premium)
TRANSITION        = 0.5          # Fade duration in seconds
Original_SHOT_SEC = 4.0          # Seconds per shot
SHOT_SECONDS      = 4.0          # Seconds per shot (longer = more cinematic)
SHOTS_PER_SCENE   = 5
VOICE             = "en-US-ChristopherNeural"

# Pollinations: request full 1920x1080 images (max quality)
POLL_W, POLL_H    = 1920, 1080

# Encoder quality settings
NVENC_PRESET      = "p3"         # Faster NVENC preset — huge speedup, same visual quality
NVENC_CQ          = "16"         # Visually lossless (0=perfect, 51=worst) - increased quality
NVENC_BITRATE     = "30M"        # 30 Mbps cap — pristine 4K quality
CPU_PRESET        = "slow"       # Slower CPU preset fallback for better compression
CPU_CRF           = "16"         # Increased quality for CPU fallback

# Concurrency — fully saturate Colab's resources
FRAME_WORKERS     = 16           # Saturate all 4 vCPUs with PIL tasks
RENDER_WORKERS    = 2            # Run 2 concurrent rendering tasks to avoid GPU memory overflow at 4K

# Prompt engineering for max visual quality
STYLE = (
    "masterpiece anime illustration, ultra-detailed cinematic realism, "
    "Ufotable studio quality, dramatic volumetric god rays, photorealistic "
    "8K resolution textures, sharp detailed ink linework, dynamic cel shading, "
    "high contrast chiaroscuro lighting, cinematic color grading, "
    "epic fantasy atmosphere, no text, no watermark, no UI elements, "
    "award-winning digital art"
)

SHOT_TYPES = [
    "epic wide establishing shot, vast cinematic landscape scale, sweeping panorama, "
    "dramatic sky with volumetric clouds",
    "dramatic medium shot, powerful dynamic camera angle, intense atmospheric perspective, "
    "detailed character presence",
    "extreme cinematic close-up, deep emotional focus, razor-sharp detail, "
    "dramatic shallow depth of field bokeh",
    "dynamic action shot, intense movement and speed, martial arts posture, spectacular lighting particle effects",
    "mystical atmospheric detail, close-up on elements, glowing runes, celestial energy swirls",
]


# ─── GPU Detection ────────────────────────────────────────────────────────────
def detect_encoder() -> str:
    global NVENC_PRESET
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-encoders"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    if "h264_nvenc" in r.stdout:
        # Verify NVENC actually works with a tiny test (rc vbr is required for cq)
        test = subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=black:s=128x72:d=0.1",
             "-c:v", "h264_nvenc", "-preset", NVENC_PRESET,
             "-rc", "vbr", "-cq", NVENC_CQ, "/tmp/nvenc_test.mp4"],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
        )
        if test.returncode == 0:
            log(f"GPU NVENC confirmed: h264_nvenc {NVENC_PRESET} CQ{NVENC_CQ} — MAX QUALITY mode")
            return "h264_nvenc"
            
        # Try legacy preset
        log(f"GPU NVENC test with preset '{NVENC_PRESET}' failed. Trying legacy preset 'slow'...")
        test_legacy = subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=black:s=128x72:d=0.1",
             "-c:v", "h264_nvenc", "-preset", "slow",
             "-rc", "vbr", "-cq", NVENC_CQ, "/tmp/nvenc_test.mp4"],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
        )
        if test_legacy.returncode == 0:
            log(f"GPU NVENC confirmed: h264_nvenc slow CQ{NVENC_CQ} — legacy preset mode")
            NVENC_PRESET = "slow"
            return "h264_nvenc"
            
        err = test_legacy.stderr.decode(errors="replace")
        log(f"GPU NVENC test failed: {err.strip()}")
        
    log("CPU mode: libx264 slow CRF18 — high quality fallback")
    return "libx264"

ENCODER = detect_encoder()

if ENCODER == "libx264":
    log("CPU mode detected — reducing RENDER_WORKERS to 2 to avoid core thrashing.")
    RENDER_WORKERS = 2


def get_enc_args(high_quality: bool = True) -> list:
    """Return FFmpeg encoder arguments based on detected hardware."""
    if ENCODER == "h264_nvenc":
        args = [
            "-c:v", "h264_nvenc",
            "-preset", NVENC_PRESET,
            "-rc", "vbr",
            "-cq", NVENC_CQ,
            "-b:v", NVENC_BITRATE,
            "-maxrate", "40M",
            "-bufsize", "50M",
            "-profile:v", "high",
            "-level", "4.2",
        ]
    else:
        args = [
            "-c:v", "libx264",
            "-preset", CPU_PRESET if high_quality else "ultrafast",
            "-crf", CPU_CRF,
            "-b:v", "0",
        ]
    return args


# ─── Helpers ──────────────────────────────────────────────────────────────────
def get_audio_duration(path: Path) -> float:
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    try:
        v = float(res.stdout.strip())
        return v if v > 0 else 10.0
    except Exception:
        return 10.0


def safe_fade(dur: float, trans: float):
    t = min(trans, dur / 4)
    return t, max(t, dur - t)


def black_frame(path: Path):
    """Create a cinematic dark frame (not pure black — adds subtle vignette feel)."""
    img = Image.new("RGB", (WIDTH, HEIGHT), (6, 6, 10))
    fmt = "JPEG" if path.suffix.lower() in [".jpg", ".jpeg"] else "PNG"
    if fmt == "JPEG":
        img.save(path, "JPEG", quality=90)
    else:
        img.save(path, "PNG", compress_level=1)


def write_manifest(path: Path, entries: List[Path]):
    with open(path, "w", encoding="utf-8") as f:
        for e in entries:
            f.write(f"file '{e.resolve()}'\n")


def get_drive_service():
    if not HAS_DRIVE_API:
        log("Google Drive API packages not available.")
        return None
    token_path = Path("drive_token.json")
    if not token_path.exists():
        token_path = Path("/kaggle/working/drive_token.json")
        if not token_path.exists():
            log("Google Drive credentials token not found.")
            return None
    try:
        creds = Credentials.from_authorized_user_file(str(token_path), ["https://www.googleapis.com/auth/drive"])
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                token_path.write_text(creds.to_json())
        return build("drive", "v3", credentials=creds)
    except Exception as e:
        log(f"Failed to authenticate with Google Drive API: {e}")
        return None


def get_or_create_folder(service, name: str) -> str:
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    res = service.files().list(q=q, fields="files(id, name)").execute()
    files = res.get("files", [])
    if files:
        return files[0]["id"]
    meta = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    folder = service.files().create(body=meta, fields="id").execute()
    return folder["id"]


def download_cache_from_drive(service, folder_id: str):
    if not service or not folder_id:
        return
    log("Checking Google Drive for existing cache...")
    q = f"name='heavenly_rebellion_cache.zip' and '{folder_id}' in parents and trashed=false"
    res = service.files().list(q=q, fields="files(id, name)").execute()
    files = res.get("files", [])
    if not files:
        log("No existing cache zip found on Google Drive.")
        return
    
    file_id = files[0]["id"]
    log("Downloading cache zip from Google Drive...")
    request = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while done is False:
        status, done = downloader.next_chunk()
    
    log("Extracting cache zip to workspace...")
    fh.seek(0)
    with zipfile.ZipFile(fh, "r") as zip_ref:
        zip_ref.extractall(WORK_DIR)
    log(f"Cache restored successfully from Google Drive.")


def upload_cache_to_drive(service, folder_id: str):
    if not service or not folder_id:
        return
    log("Creating cache zip file...")
    zip_path = WORK_DIR / "cache_temp.zip"
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_ref:
        for folder in ["images", "frames", "audio", "temp"]:
            f_dir = WORK_DIR / folder
            if f_dir.exists():
                for file in f_dir.glob("*"):
                    if file.is_file() and file.name != "cache_temp.zip":
                        zip_ref.write(file, arcname=f"{folder}/{file.name}")
                        
    log("Uploading cache zip to Google Drive...")
    q = f"name='heavenly_rebellion_cache.zip' and '{folder_id}' in parents and trashed=false"
    res = service.files().list(q=q, fields="files(id, name)").execute()
    existing = res.get("files", [])
    
    media = MediaFileUpload(str(zip_path), mimetype="application/zip", resumable=True)
    if existing:
        file_id = existing[0]["id"]
        service.files().update(fileId=file_id, media_body=media).execute()
        log("Cache zip updated on Google Drive.")
    else:
        meta = {"name": "heavenly_rebellion_cache.zip", "parents": [folder_id]}
        service.files().create(body=meta, media_body=media).execute()
        log("Cache zip created on Google Drive.")
        
    try:
        zip_path.unlink()
    except Exception:
        pass


def delete_cache_from_drive(service, folder_id: str):
    if not service or not folder_id:
        return
    log("Cleaning up cache zip from Google Drive...")
    q = f"name='heavenly_rebellion_cache.zip' and '{folder_id}' in parents and trashed=false"
    res = service.files().list(q=q, fields="files(id, name)").execute()
    files = res.get("files", [])
    if files:
        file_id = files[0]["id"]
        try:
            service.files().delete(fileId=file_id).execute()
            log("Cache zip deleted from Google Drive.")
        except Exception as e:
            log.warning(f"Failed to delete cache zip from Google Drive: {e}")


# ─── BGM Preparation ──────────────────────────────────────────────────────────
def prepare_bgm() -> Optional[Path]:
    try:
        available = [p for p in BGM_FILES if p.exists()]
        if not available:
            log("No BGM files found — video will have narration only.")
            return None

        out = TMP_DIR / "bgm_combined.mp3"
        if out.exists() and out.stat().st_size > 10_000:
            return out

        log(f"Combining BGM tracks: {[p.name for p in available]}")
        if len(available) == 1:
            shutil.copy(available[0], out)
        else:
            inputs = []
            for p in available:
                inputs += ["-i", str(p)]
            n  = len(available)
            fs = "".join(f"[{i}:a]" for i in range(n)) + f"concat=n={n}:v=0:a=1[a]"
            subprocess.run(
                ["ffmpeg", "-y"] + inputs +
                ["-filter_complex", fs, "-map", "[a]",
                 "-c:a", "libmp3lame", "-q:a", "2", str(out)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
            )
        return out
    except Exception as e:
        log.warning(f"Failed to prepare BGM tracks: {e}. Video will have narration only.")
        return None


# ─── 1. NOVEL PARSER ──────────────────────────────────────────────────────────
def parse_novel() -> List[Dict]:
    log(f"Parsing novel: {NOVEL_FILE}")
    with open(NOVEL_FILE, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    SCENE_EXPANSIONS: Dict = {}
    if EXPANDER_SRC.exists():
        try:
            sys.path.insert(0, "/content")
            sys.path.insert(0, str(DRIVE_ROOT))
            from story_expander import SCENE_EXPANSIONS as SE
            SCENE_EXPANSIONS = SE
            log(f"  Loaded {len(SE)} scene expansions from story_expander.py")
        except Exception as e:
            log(f"  Could not load story_expander.py: {e}")

    scenes: List[Dict] = []
    for match in re.finditer(
        r"(Scene \d+:[^\n]*)\n(.*?)(?:IMAGE\s*PROMPT:\s*(.*?))?(?=Scene \d+:|$)", 
        text, re.DOTALL | re.IGNORECASE
    ):
        title      = match.group(1).strip()
        body       = match.group(2).strip()
        img_prompt = match.group(3).strip() if match.group(3) else ""
        if not img_prompt:
            img_prompt = f"epic scene illustration, {title}"
        sn         = re.search(r"Scene (\d+)", title, re.IGNORECASE)
        if not sn:
            continue
        num = int(sn.group(1))

        if num in SCENE_EXPANSIONS:
            tts = SCENE_EXPANSIONS[num]
        else:
            raw = re.sub(
                r"(DESCRIPTION:|DIALOGUE:|IMAGE PROMPT:|\[.*?\]|\(.*?\))",
                "", body, flags=re.IGNORECASE
            )
            tts = re.sub(r"\s+", " ", raw).strip() or title

        # Extract 5 shot-specific prompts
        lines = [l.strip() for l in img_prompt.split('\n') if l.strip()]
        prompts = []
        for line in lines:
            cleaned = re.sub(r"^\d+[\.:\s\-]+", "", line).strip()
            if cleaned:
                prompts.append(cleaned)
        while len(prompts) < 5:
            prompts.append(img_prompt if img_prompt else f"epic scene illustration, {title}")
        prompts = prompts[:5]

        scenes.append({
            "title":    title,
            "text":     tts,
            "prompt":   img_prompt,
            "prompts":  prompts,
            "scene_num": num,
        })

    scenes.sort(key=lambda x: x["scene_num"])
    scenes.insert(0, {
        "title":    "Channel Intro",
        "text":     SCENE_EXPANSIONS.get(
            0, "Welcome to The Heavenly Rebellion — an epic tale of cultivation, "
               "forbidden arts, and the struggle against heaven itself."
        ),
        "prompt":   (
            "epic fantasy title card, vast golden heavenly realm, ancient cultivation world, "
            "towering jade mountains, swirling qi energy, dramatic sunrise, "
            "cinematic widescreen composition"
        ),
        "scene_num": 0,
    })
    log(f"  Total scenes parsed: {len(scenes)}")
    return scenes


# ─── 2. TTS AUDIO GENERATION ──────────────────────────────────────────────────
async def _tts_one(s_idx: int, scene: Dict, sem: asyncio.Semaphore):
    dest_local = AUD_DIR / f"scene_{s_idx:03d}.mp3"
    dest_drive = DRIVE_ROOT / "audio" / f"scene_{s_idx:03d}.mp3"
    scene["audio"] = str(dest_local)

    if dest_local.exists() and dest_local.stat().st_size > 2_000:
        scene["duration"] = get_audio_duration(dest_local)
        log(f"  TTS local cache hit: scene {s_idx+1} ({scene['duration']:.1f}s)")
        return

    if dest_drive.exists() and dest_drive.stat().st_size > 2_000:
        try:
            shutil.copy(dest_drive, dest_local)
            scene["duration"] = get_audio_duration(dest_local)
            log(f"  TTS Drive cache hit: scene {s_idx+1} ({scene['duration']:.1f}s)")
            return
        except Exception as e:
            log.warning(f"  Failed to copy audio from Drive: {e}")

    async with sem:
        success = False
        for attempt in range(3):
            try:
                comm = edge_tts.Communicate(scene["text"], voice=VOICE, rate="+5%")
                await comm.save(str(dest_local))
                scene["duration"] = get_audio_duration(dest_local)
                log(f"  TTS [{s_idx+1}] {scene['title'][:45]}  ({scene['duration']:.1f}s)")
                success = True
                
                try:
                    (DRIVE_ROOT / "audio").mkdir(exist_ok=True, parents=True)
                    shutil.copy(dest_local, dest_drive)
                except Exception as e:
                    log.warning(f"  Failed to cache audio to Drive: {e}")
                break
            except Exception as e:
                log.warning(f"  TTS Attempt {attempt+1} failed for scene {s_idx}: {e}")
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
        
        if not success:
            log.error(f"  TTS FAILED scene {s_idx} after 3 attempts. Generating silent fallback audio.")
            scene["duration"] = 10.0
            # Generate silent fallback audio
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=24000",
                "-t", "10.0", "-c:a", "libmp3lame", str(dest_local)
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


async def generate_audio(scenes: List[Dict]):
    log("=== PHASE 1: TTS Audio Generation (15 concurrent) ===")
    sem = asyncio.Semaphore(15)
    await asyncio.gather(*[_tts_one(i, s, sem) for i, s in enumerate(scenes)])
    total = sum(s.get("duration", 0) for s in scenes)
    log(f"  Audio complete. Total narration: {total/60:.1f} minutes")


# ─── 3. IMAGE GENERATION (MAX QUALITY) ───────────────────────────────────────
def _download_img(dest: Path, prompt: str, s_idx: int, shot_idx: int, n: int) -> bool:
    """Download a 1920x1080 image from Pollinations using flux model with stable-diffusion fallbacks."""
    import random
    # Truncate prompt to 1000 chars to avoid HTTP 414 URI Too Long
    prompt = prompt[:1000]
    for attempt in range(6):
        seed  = 7777 + s_idx * 31 + shot_idx * 7 + attempt * 999
        
        # Self-healing fallback: use stable-diffusion-xl if flux fails or rate limits
        model = "flux"
        if attempt >= 2:
            model = "stable-diffusion-xl"
            log(f"🤖 [Agent] Switching image model to stable-diffusion-xl (attempt {attempt+1})")
        elif attempt >= 4:
            model = "turbo"
            log(f"🤖 [Agent] Switching image model to turbo (attempt {attempt+1})")

        url   = (
            f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt, safe='')}"
            f"?width={POLL_W}&height={POLL_H}&seed={seed}"
            f"&model={model}&enhance=true&nologo=true&safe=false"
        )
        log(f"  Image [{s_idx+1}/{n} shot {shot_idx+1}] attempt {attempt+1} ({model})")
        try:
            r = requests.get(url, timeout=120, stream=True)
            if r.status_code == 200:
                content = r.content
                if len(content) > 20_000:   # Valid image must be >20KB
                    # Verify it's a valid image using PIL
                    try:
                        from PIL import Image
                        import io
                        with Image.open(io.BytesIO(content)) as temp_img:
                            temp_img.verify()
                        
                        dest.write_bytes(content)
                        # Add jittered polite rate limit sleep
                        time.sleep(3 + random.uniform(0, 2))
                        return True
                    except Exception as verify_err:
                        log(f"    Corrupted image or invalid format downloaded: {verify_err} — retry")
                        time.sleep(5 + random.uniform(0, 2))
                else:
                    log(f"    Too small ({len(content)} bytes) — retry")
                    time.sleep(5 + random.uniform(0, 2))
            elif r.status_code in (402, 429):
                wait = 30 + attempt * 15 + random.uniform(0, 5) # Jitter wait
                log(f"    Rate limited (HTTP {r.status_code}) — wait {wait:.1f}s")
                time.sleep(wait)
            elif r.status_code >= 500:
                wait = 20 + random.uniform(0, 5)
                log(f"    Server error (HTTP {r.status_code}) — wait {wait:.1f}s")
                time.sleep(wait)
            else:
                time.sleep(8 + random.uniform(0, 2))
        except requests.exceptions.Timeout:
            log(f"    Timeout — retry after 15s")
            time.sleep(15 + random.uniform(0, 2))
        except Exception as e:
            log(f"    Network error: {e} — retry after 15s")
            time.sleep(15 + random.uniform(0, 2))
    log(f"  All attempts failed — black frame fallback")
    return False


def _process_one_image(args):
    s_idx, shot_idx, shot_type, scene, n, drive_img_dir = args
    dest_local = IMG_DIR / f"scene_{s_idx:03d}_shot_{shot_idx}.jpg"
    dest_drive = drive_img_dir / f"scene_{s_idx:03d}_shot_{shot_idx}.jpg"

    # 1. Check local cache
    if dest_local.exists() and dest_local.stat().st_size > 20_000:
        return str(dest_local)

    # 2. Check Drive cache
    if dest_drive.exists() and dest_drive.stat().st_size > 20_000:
        log(f"  Drive cache hit: copying {dest_drive.name} to SSD...")
        try:
            shutil.copy(dest_drive, dest_local)
            return str(dest_local)
        except Exception as e:
            log.warning(f"  Failed to copy image from Drive: {e}")

    scene_prompt = scene.get("prompts", [scene["prompt"]]*5)[shot_idx]
    full_prompt = f"{scene_prompt}, {shot_type}, {STYLE}"
    ok = _download_img(dest_local, full_prompt, s_idx, shot_idx, n)
    if not ok:
        black_frame(dest_local)
    
    # Cache to Drive
    try:
        shutil.copy(dest_local, dest_drive)
    except Exception as e:
        log.warning(f"  Failed to cache image to Drive: {e}")

    return str(dest_local)


def generate_scene_images(scenes: List[Dict]):
    log(f"=== PHASE 2: Image Generation (1920x1080, flux model, {len(scenes)*5} total) ===")
    n = len(scenes)
    drive_img_dir = DRIVE_ROOT / "images"
    drive_img_dir.mkdir(exist_ok=True, parents=True)

    tasks = []
    for s_idx, scene in enumerate(scenes):
        scene["images"] = [None] * len(SHOT_TYPES)
        for shot_idx, shot_type in enumerate(SHOT_TYPES):
            tasks.append((s_idx, shot_idx, shot_type, scene, n, drive_img_dir))

    # Download in parallel using 5 concurrent workers
    log(f"  Downloading images using 5 concurrent workers...")
    done = 0
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_process_one_image, t): t for t in tasks}
        for fut in as_completed(futures):
            s_idx, shot_idx, _, scene, _, _ = futures[fut]
            try:
                res_path = fut.result()
                scene["images"][shot_idx] = res_path
            except Exception as e:
                log.error(f"  Error processing image for scene {s_idx} shot {shot_idx}: {e}")
                fallback_path = str(IMG_DIR / f"scene_{s_idx:03d}_shot_{shot_idx}.jpg")
                black_frame(Path(fallback_path))
                scene["images"][shot_idx] = fallback_path
            
            done += 1
            if done % 10 == 0 or done == len(tasks):
                pct = done / len(tasks) * 100
                log(f"  Image downloads: {done}/{len(tasks)} complete ({pct:.0f}%)")

    log("=== PHASE 2 COMPLETE: All images downloaded ===")


# ─── 3.5. REAL-ESRGAN AI UPSCALING (MAX QUALITY 4K) ───────────────────────────
def setup_realesrgan() -> bool:
    binary = Path("realesrgan-ncnn-vulkan")
    if binary.exists():
        return True

    log("🤖 [Agent] Downloading Real-ESRGAN NCNN Vulkan Linux binary for 4K upscaling...")
    url = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip"
    zip_path = Path("realesrgan.zip")
    
    try:
        # Download with stream to handle large files stably
        r = requests.get(url, timeout=120, stream=True)
        r.raise_for_status()
        with open(zip_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

        # Extract
        log("🤖 [Agent] Extracting Real-ESRGAN package...")
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall("realesrgan_extracted")

        # Find binary and models folder recursively
        bin_path = None
        models_path = None
        for p in Path("realesrgan_extracted").rglob("*"):
            if p.name == "realesrgan-ncnn-vulkan" and p.is_file():
                bin_path = p
            elif p.name == "models" and p.is_dir():
                models_path = p

        if bin_path and models_path:
            shutil.move(str(bin_path), "./realesrgan-ncnn-vulkan")
            if Path("./models").exists():
                shutil.rmtree("./models")
            shutil.move(str(models_path), "./models")
            Path("./realesrgan-ncnn-vulkan").chmod(0o755)
            shutil.rmtree("realesrgan_extracted")
            log("🤖 [Agent] Real-ESRGAN NCNN Vulkan installed and configured successfully.")
            return True
        else:
            log.warning("🤖 [Agent] Real-ESRGAN binary or models directory not found in zip.")
            return False
    except Exception as e:
        log.warning(f"🤖 [Agent] Failed to install Real-ESRGAN: {e}")
        return False
    finally:
        if zip_path.exists():
            zip_path.unlink()

def upscale_images_realesrgan(scenes: List[Dict]):
    if not setup_realesrgan():
        log.warning("🤖 [Agent] Real-ESRGAN setup failed. Skipping 4K AI upscaling.")
        return

    log("=== PHASE 2.5: Real-ESRGAN 4K AI Upscaling (Anime Model) ===")
    
    # Gather unique image paths
    img_paths = []
    for scene in scenes:
        for img in scene.get("images", []):
            if img and Path(img).exists() and not Path(img).name.startswith("black_"):
                img_paths.append(Path(img))

    img_paths = list(set(img_paths))
    total = len(img_paths)
    log(f"  Upscaling {total} unique source images to 4K resolution...")

    def _upscale_one(img_path: Path):
        temp_out = img_path.parent / f"up_{img_path.name}"
        # -s 2 scales 1920x1080 to 3840x2160 (4K)
        # -n realesrgan-x4plus-anime is optimized for anime artwork
        cmd = [
            "./realesrgan-ncnn-vulkan",
            "-i", str(img_path),
            "-o", str(temp_out),
            "-s", "2",
            "-n", "realesrgan-x4plus-anime"
        ]
        r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if r.returncode == 0 and temp_out.exists() and temp_out.stat().st_size > img_path.stat().st_size:
            shutil.move(str(temp_out), str(img_path))
            return True
        else:
            err = r.stderr.decode(errors="replace") if r.stderr else "Unknown error"
            log.warning(f"  Failed to upscale {img_path.name}: {err.strip()}")
            if temp_out.exists():
                temp_out.unlink()
            return False

    done = 0
    # Run with 2 workers to leverage T4 GPU without overloading Vulkan memory
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(_upscale_one, p): p for p in img_paths}
        for fut in as_completed(futures):
            fut.result()
            done += 1
            if done % 10 == 0 or done == total:
                pct = done / total * 100
                log(f"  Upscaling progress: {done}/{total} complete ({pct:.0f}%)")

    log("=== PHASE 2.5 COMPLETE: All images upscaled to 4K ===")


# ─── 4. FRAME PROCESSING (MAX QUALITY) ───────────────────────────────────────
def _enhance_and_fit(src_path: str, dst_path: str):
    """
    Fit image to 3840x2160 with high-quality Lanczos resampling.
    Also applies subtle contrast + sharpness enhancement for a cinematic look.
    """
    src, dst = Path(src_path), Path(dst_path)
    if dst.exists() and dst.stat().st_size > 1_000:
        return
    if not src.exists() or src.stat().st_size < 20_000:
        black_frame(dst)
        return
    try:
        with Image.open(src) as im:
            rgb = im.convert("RGB")

            # High-quality Lanczos fit to exact WIDTHxHEIGHT (3840x2160)
            fitted = ImageOps.fit(rgb, (WIDTH, HEIGHT), Image.Resampling.LANCZOS)

            # Subtle cinematic enhancements
            fitted = ImageEnhance.Contrast(fitted).enhance(1.08)    # +8% contrast
            fitted = ImageEnhance.Sharpness(fitted).enhance(1.15)   # +15% sharpness
            fitted = ImageEnhance.Color(fitted).enhance(1.05)       # +5% saturation

            fitted.save(dst, "JPEG", quality=95)   # Save as JPEG for disk space efficiency
    except Exception as e:
        log(f"  Frame enhance error {src.name}: {e}")
        black_frame(dst)


def process_frames(scenes: List[Dict]):
    log(f"=== PHASE 3: Frame Enhancement ({FRAME_WORKERS} parallel workers) ===")
    tasks = []
    for s_idx, scene in enumerate(scenes):
        scene["frames"] = []
        for shot_idx in range(SHOTS_PER_SCENE):
            src = scene["images"][shot_idx] if shot_idx < len(scene.get("images", [])) else ""
            dst = str(FRM_DIR / f"frame_{s_idx:03d}_{shot_idx}.jpg")
            scene["frames"].append(dst)
            tasks.append((src, dst))

    with ThreadPoolExecutor(max_workers=FRAME_WORKERS) as pool:
        futs = {pool.submit(_enhance_and_fit, s, d): (s, d) for s, d in tasks}
        done = 0
        for fut in as_completed(futs):
            fut.result()
            done += 1
            if done % 50 == 0 or done == len(tasks):
                log(f"  Frames processed: {done}/{len(tasks)}")

    log("  All frames enhanced.")


# ─── 5. VIDEO BUILD (MAX QUALITY) ────────────────────────────────────────────
def _ken_burns_vf(shot_idx: int, n_frames: int) -> str:
    """
    Generate a smooth Ken Burns (zoom + pan) effect for each shot.
    5 different motions to keep the video dynamic.
    """
    n_frames = max(1, n_frames) # Prevent division by zero
    zoom_speed = 0.0008   # Very gentle zoom — feels premium

    if shot_idx % 5 == 0:
        # Slow zoom in from wide
        motion = (
            f"scale={int(WIDTH*1.2)}:{int(HEIGHT*1.2)},"
            f"zoompan=z='min(zoom+{zoom_speed},1.2)':"
            f"x='trunc(iw/2-(iw/zoom/2))':y='trunc(ih/2-(ih/zoom/2))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    elif shot_idx % 5 == 1:
        # Slow zoom out from close
        motion = (
            f"scale={int(WIDTH*1.2)}:{int(HEIGHT*1.2)},"
            f"zoompan=z='max(1.2-{zoom_speed}*on,1.0)':"
            f"x='trunc(iw/2-(iw/zoom/2))':y='trunc(ih/2-(ih/zoom/2))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    elif shot_idx % 5 == 2:
        # Pan right while maintaining slight zoom
        motion = (
            f"scale={int(WIDTH*1.15)}:{int(HEIGHT*1.15)},"
            f"zoompan=z='1.1':"
            f"x='trunc(min((iw-iw/zoom)*(on/{n_frames}),iw-iw/zoom))':"
            f"y='trunc(ih/2-(ih/zoom/2))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    elif shot_idx % 5 == 3:
        # Pan left while maintaining slight zoom
        motion = (
            f"scale={int(WIDTH*1.15)}:{int(HEIGHT*1.15)},"
            f"zoompan=z='1.1':"
            f"x='trunc(min((iw-iw/zoom)*((n_frames-on)/n_frames),iw-iw/zoom))':"
            f"y='trunc(ih/2-(ih/zoom/2))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    else:
        # Diagonal slow zoom-in from top-left
        motion = (
            f"scale={int(WIDTH*1.2)}:{int(HEIGHT*1.2)},"
            f"zoompan=z='min(zoom+{zoom_speed},1.2)':"
            f"x='trunc(min({zoom_speed}*on*iw,iw-iw/zoom))':"
            f"y='trunc(min({zoom_speed}*on*ih,ih-ih/zoom))':"
            f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS}"
        )
    return motion


class SelfHealingAgent:
    @staticmethod
    def analyze_and_resolve_ffmpeg_error(cmd: List[str], stderr: str) -> Optional[List[str]]:
        """Analyze FFmpeg error and return a corrected command or new settings."""
        stderr_lower = stderr.lower()
        log(f"🤖 [Agent] Analyzing FFmpeg failure: {stderr[-200:].strip()}")
        
        # 1. GPU/NVENC failure -> switch to CPU libx264
        if any(x in stderr_lower for x in ["nvenc", "cuda", "device", "cuinit", "no hardware"]):
            log("🤖 [Agent] Detected NVENC/GPU encoder failure. Switching to CPU (libx264) globally.", "WARN")
            global ENCODER
            ENCODER = "libx264"
            # Reconstruct command replacing nvenc arguments with cpu arguments
            new_cmd = []
            skip = False
            for arg in cmd:
                if skip:
                    skip = False
                    continue
                if arg == "h264_nvenc":
                    new_cmd.append("libx264")
                elif arg in ["-preset", "-rc", "-cq", "-maxrate", "-bufsize", "-profile:v", "-level"]:
                    # Skip these nvenc specific args and their values
                    skip = True
                else:
                    new_cmd.append(arg)
            # Add basic CPU arguments
            try:
                insert_idx = new_cmd.index("libx264") + 1
            except ValueError:
                insert_idx = len(new_cmd)
            new_cmd[insert_idx:insert_idx] = ["-preset", "ultrafast", "-crf", "23"]
            return new_cmd
            
        # 2. Zoompan/filter failure -> fall back to simple scale
        if any(x in stderr_lower for x in ["zoompan", "parsed_zoompan", "filter", "reinitializing"]):
            log("🤖 [Agent] Detected zoompan/filter failure. Removing zoompan motion and falling back to static scale.", "WARN")
            new_cmd = []
            skip_next = False
            for i, arg in enumerate(cmd):
                if skip_next:
                    skip_next = False
                    continue
                if arg == "-vf":
                    new_cmd.append("-vf")
                    new_cmd.append(f"scale={WIDTH}:{HEIGHT}")
                    skip_next = True
                else:
                    new_cmd.append(arg)
            return new_cmd
            
        # 3. Disk full error -> clear temp/cache or warn user
        if any(x in stderr_lower for x in ["no space left on device", "error 28", "write error"]):
            log("🤖 [Agent] CRITICAL: Disk full detected during FFmpeg execution! Cleaning up frame files to attempt recovery...", "ERROR")
            for file in FRM_DIR.glob("*"):
                try:
                    file.unlink()
                except Exception:
                    pass
            
        return None


def _cleanup_scene_frames(scene: Dict):
    """Delete enhanced frames for a scene after rendering to conserve disk space."""
    for f in scene.get("frames", []):
        try:
            p = Path(f)
            if p.exists():
                p.unlink()
        except Exception as e:
            log.warning(f"Failed to delete frame {f}: {e}")

def render_scene(s_idx: int, scene: Dict, out: Path):
    """Render a single scene video with all its shots, narration, and fades in one step."""
    if out.exists() and out.stat().st_size > 10_000:
        return

    dur = scene.get("duration", 10.0)
    n_shots = max(1, int(round(dur / SHOT_SECONDS)))
    s_dur = dur / n_shots
    audio_path = scene.get("audio", "")

    # If audio doesn't exist, we fall back to a silent frame or log it
    if not Path(audio_path).exists():
        log(f"  [Warning] Audio missing for scene {s_idx}, creating silent fallback.")
        audio_path = str(AUD_DIR / f"scene_{s_idx:03d}_fallback.mp3")
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=channel_layout=mono:sample_rate=24000",
            "-t", f"{dur:.3f}", "-c:a", "libmp3lame", audio_path
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    enc_args = get_enc_args(high_quality=True)

    cmd = ["ffmpeg", "-y"]
    # 1. Add image inputs
    for i in range(n_shots):
        img_path = Path(scene["frames"][i % SHOTS_PER_SCENE])
        if not img_path.exists():
            black_frame(img_path)
        cmd += ["-framerate", str(FPS), "-loop", "1", "-t", f"{s_dur:.3f}", "-i", str(img_path)]
        
    # 2. Add audio input
    cmd += ["-i", str(audio_path)]

    # 3. Build filter complex
    filters = []
    for i in range(n_shots):
        vf = _ken_burns_vf(i, int(round(s_dur * FPS)))
        filters.append(f"[{i}:v]{vf}[v{i}]")

    concat_str = "".join(f"[v{i}]" for i in range(n_shots)) + f"concat=n={n_shots}:v=1:a=0[rawv]"
    
    t_fade, fade_out = safe_fade(dur, TRANSITION)
    fade_str = f"[rawv]fade=t=in:st=0:d={t_fade:.3f},fade=t=out:st={fade_out:.3f}:d={t_fade:.3f}[outv]"

    filter_complex = ";".join(filters) + ";" + concat_str + ";" + fade_str
    
    cmd += ["-filter_complex", filter_complex]
    cmd += ["-map", "[outv]", "-map", f"{n_shots}:a"]
    cmd += enc_args + [
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-r", str(FPS),
        str(out)
    ]

    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if r.returncode != 0:
        err = r.stderr.decode(errors="replace")
        
        # Self-healing retry
        fixed_cmd = SelfHealingAgent.analyze_and_resolve_ffmpeg_error(cmd, err)
        if fixed_cmd:
            log(f"🤖 [Agent] Retrying scene {s_idx} with resolved command...")
            r_retry = subprocess.run(fixed_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if r_retry.returncode == 0:
                log(f"🤖 [Agent] Self-healing successful for scene {s_idx}!")
                _cleanup_scene_frames(scene)
                return
                
        log(f"  Scene render failed {out.name}: {err[-200:].strip()}")
        # CPU fallback/basic render in case of fatal failure
        cmd_fallback = ["ffmpeg", "-y"]
        for i in range(n_shots):
            img_path = Path(scene["frames"][i % SHOTS_PER_SCENE])
            cmd_fallback += ["-framerate", str(FPS), "-loop", "1", "-t", f"{s_dur:.3f}", "-i", str(img_path)]
        cmd_fallback += ["-i", str(audio_path)]
        
        # Fallback simple concat without zoompan/fades
        fallback_filters = [f"[{i}:v]scale={WIDTH}:{HEIGHT}[v{i}]" for i in range(n_shots)]
        fallback_concat = "".join(f"[v{i}]" for i in range(n_shots)) + f"concat=n={n_shots}:v=1:a=0[outv]"
        cmd_fallback += ["-filter_complex", ";".join(fallback_filters) + ";" + fallback_concat]
        cmd_fallback += ["-map", "[outv]", "-map", f"{n_shots}:a"]
        cmd_fallback += get_enc_args(high_quality=True) + [
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            str(out)
        ]
        subprocess.run(cmd_fallback, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Clean up frames immediately to conserve disk space
    _cleanup_scene_frames(scene)


def build_video(scenes: List[Dict]):
    log("=== PHASE 4: Video Build (GPU h264_nvenc, Ken Burns, 30fps) ===")

    # ── Step A: Render all scene videos ──────────────────────────────────────
    tasks = []
    for s_idx, scene in enumerate(scenes):
        out = TMP_DIR / f"v_{s_idx:03d}.mp4"
        scene["video"] = str(out)
        if out.exists() and out.stat().st_size > 10_000:
            continue
        tasks.append((s_idx, scene, out))

    log(f"  Rendering {len(tasks)} scene clips ({RENDER_WORKERS} parallel workers) ...")
    with ThreadPoolExecutor(max_workers=RENDER_WORKERS) as pool:
        futs = {pool.submit(render_scene, *t): t[0] for t in tasks}
        done = 0
        for fut in as_completed(futs):
            try:
                fut.result()
            except Exception as e:
                s_idx = futs[fut]
                log.error(f"  Error rendering scene {s_idx}: {e}")
            done += 1
            if done % 10 == 0 or done == len(tasks):
                log(f"  Scene videos: {done}/{len(tasks)}")

    # ── Step B: Master concat ─────────────────────────────────────────────────
    log("  Master concat of all scene videos ...")
    master = TMP_DIR / "list_all.txt"
    valid  = [
        TMP_DIR / f"v_{i:03d}.mp4"
        for i in range(len(scenes))
        if (TMP_DIR / f"v_{i:03d}.mp4").exists()
        and (TMP_DIR / f"v_{i:03d}.mp4").stat().st_size > 5_000
    ]
    log(f"  Valid scene clips: {len(valid)}/{len(scenes)}")
    write_manifest(master, valid)

    narration = TMP_DIR / "narration.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
         "-i", str(master), "-c", "copy", str(narration)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )

    dur_check = get_audio_duration(narration)
    log(f"  Narration video duration: {dur_check/60:.1f} minutes")

    # Clean up intermediate clips immediately to prevent disk starvation on large runs
    log("  Deleting individual scene clips to free disk space...")
    for clip in valid:
        try:
            if clip.exists():
                clip.unlink()
        except Exception as e:
            log.warning(f"Failed to delete intermediate clip {clip.name}: {e}")

    # ── Step C: BGM mix + final export ───────────────────────────────────────
    log("  Mixing BGM at cinematic levels (voice 100%, BGM 7%) ...")
    bgm = prepare_bgm()

    final_path = str(OUTPUT_VIDEO)
    if bgm:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(narration),
            "-stream_loop", "-1", "-i", str(bgm),
            "-filter_complex",
            # Voice at full volume, BGM at 7% — exactly like a movie. normalize=0 prevents volume downscaling
            "[0:a]volume=1.0,acompressor=threshold=0.089:ratio=4:attack=5:release=50[voice];"
            "[1:a]volume=0.07[bgm];"
            "[voice][bgm]amix=inputs=2:duration=first:dropout_transition=3:normalize=0[a]",
            "-map", "0:v",
            "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            "-movflags", "+faststart",
            final_path
        ]
    else:
        cmd = [
            "ffmpeg", "-y", "-i", str(narration),
            "-c", "copy", "-movflags", "+faststart",
            final_path
        ]

    log(f"  Exporting final video to Google Drive: {OUTPUT_VIDEO.name}")
    r = subprocess.run(cmd, stderr=subprocess.PIPE)
    if r.returncode != 0:
        err = r.stderr.decode(errors="replace")
        fixed_cmd = SelfHealingAgent.analyze_and_resolve_ffmpeg_error(cmd, err)
        if fixed_cmd:
            log("🤖 [Agent] Retrying final export with resolved settings...")
            r = subprocess.run(fixed_cmd, stderr=subprocess.PIPE)

    if r.returncode == 0:
        size_gb = OUTPUT_VIDEO.stat().st_size / 1_073_741_824
        log(f"  SUCCESS! Final video: {OUTPUT_VIDEO}")
        log(f"  File size: {size_gb:.2f} GB")
        
        # Clean up cache files ONLY when video is fully made
        log("🎬 Video fully made. Cleaning up cache files (images, audio, frames, temp)...")
        for d in (IMG_DIR, FRM_DIR, AUD_DIR, TMP_DIR, DRIVE_ROOT / "images", DRIVE_ROOT / "audio"):
            try:
                if d.exists():
                    shutil.rmtree(d)
                # Re-create empty directory to avoid path issues later
                d.mkdir(exist_ok=True, parents=True)
            except Exception as e:
                log.warning(f"Failed to clear cache directory {d}: {e}")
    else:
        log(f"  Final export FAILED: {r.stderr[-400:].decode(errors='replace')}")
        return

    # Copy log to Drive
    shutil.copy(WORK_DIR / "colab_pipeline.log", DRIVE_ROOT / "colab_pipeline.log")

    # Write DONE flag — local launcher will auto-download
    DONE_FLAG.write_text(
        f"DONE\n"
        f"Video: {OUTPUT_VIDEO.name}\n"
        f"Size: {OUTPUT_VIDEO.stat().st_size}\n"
        f"Duration: {dur_check:.1f}s ({dur_check/60:.1f} min)\n"
        f"Encoder: {ENCODER}\n"
        f"Quality: CQ{NVENC_CQ} {NVENC_BITRATE}bps 30fps 4K\n"
    )
    log("DONE flag written — local launcher will now download the video automatically.")


# ─── MAIN ─────────────────────────────────────────────────────────────────────
async def main():
    log("=" * 65)
    log("  VideoForge Elite — MAX QUALITY Cloud Pipeline")
    log(f"  Python {sys.version.split()[0]}  |  Encoder: {ENCODER}")
    log(f"  Resolution: {WIDTH}x{HEIGHT} @ {FPS}fps")
    log(f"  Images: {POLL_W}x{POLL_H} flux model (1080p source)")
    log(f"  Quality: CQ{NVENC_CQ}  {NVENC_BITRATE}bps  NVENC p7")
    log(f"  Workers: {FRAME_WORKERS} frame  |  {RENDER_WORKERS} render")
    log("=" * 65)

    service = None
    folder_id = None
    try:
        # Authenticate Google Drive and restore cache
        service = get_drive_service()
        if service:
            try:
                folder_id = get_or_create_folder(service, "HeavenlyRebellion")
                download_cache_from_drive(service, folder_id)
            except Exception as e:
                log.warning(f"🤖 [Agent] Failed to restore cache: {e}")

        scenes = parse_novel()
        if not scenes:
            log.error("ERROR: No scenes found — aborting.")
            return

        # Phase 1: TTS
        await generate_audio(scenes)
        if service and folder_id:
            try:
                upload_cache_to_drive(service, folder_id)
            except Exception as e:
                log.warning(f"🤖 [Agent] Failed to upload cache after TTS: {e}")

        # Phase 2: Images
        generate_scene_images(scenes)

        # Phase 2.5: 4K AI Upscaling
        upscale_images_realesrgan(scenes)
        
        if service and folder_id:
            try:
                upload_cache_to_drive(service, folder_id)
            except Exception as e:
                log.warning(f"🤖 [Agent] Failed to upload cache after images: {e}")

        # Phase 3: Frames
        process_frames(scenes)
        if service and folder_id:
            try:
                upload_cache_to_drive(service, folder_id)
            except Exception as e:
                log.warning(f"🤖 [Agent] Failed to upload cache after frames: {e}")

        # Phase 4: Video Build
        build_video(scenes)
        
        # Successful completion -> Delete the cache zip from Drive
        if service and folder_id:
            try:
                delete_cache_from_drive(service, folder_id)
            except Exception as e:
                log.warning(f"🤖 [Agent] Failed to delete cache zip on success: {e}")

        log("ALL PHASES COMPLETE!")
        log("Check your Desktop — the video will download automatically.")
    except Exception as e:
        log.exception(f"FATAL ERROR in pipeline execution: {e}")
        # Self-healing: save current state to Drive before crashing
        if service and folder_id:
            log("🤖 [Agent] Saving progress cache to Google Drive before crash...")
            try:
                upload_cache_to_drive(service, folder_id)
            except Exception as e2:
                log.warning(f"🤖 [Agent] Failed to upload crash cache: {e2}")
        raise
    finally:
        log("Pipeline execution finished.")


if __name__ == "__main__":
    import nest_asyncio
    nest_asyncio.apply()
    asyncio.run(main())
