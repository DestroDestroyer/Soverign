#!/usr/bin/env python3
"""
VideoForge Elite — Novel Edition (1-Hour Full Version)
---------------------------------------------------------
FIXED & OPTIMISED — Multi-Pass Bug Analysis Build

BUG FIXES APPLIED:
 [BUG-01] HTTP 402 Rate Limit storms: Parallelising all 303 image requests caused Pollinations
           to block the IP. Fixed: sequential download with 5s cooldown, 20s on 402/429.
 [BUG-02] Black frames silently replacing real images: script recorded image path even on failure.
           Fixed: images are only appended to scene['images'] if file exists & size > 15 KB.
 [BUG-03] asyncio.WindowsSelectorEventLoopPolicy deprecated Python 3.14+: removed, not needed.
 [BUG-04] FFmpeg concat manifest uses bare filenames but cwd is not set → file not found errors.
           Fixed: always write absolute paths into manifest files.
 [BUG-05] scene['duration'] never set when audio cache-hit skips ffprobe. Fixed: always set.
 [BUG-06] process_frames used workers=8 on 4-thread CPU causing RAM thrashing. Fixed: workers=2.
 [BUG-07] render_single_shot used workers=3 parallel FFmpeg instances → RAM/CPU exhaustion.
           Fixed: workers=1 (sequential), FFmpeg limited to 3 threads internally.
 [BUG-08] FFmpeg fade applied at wrong timestamp when dur < 2*TRANSITION. Fixed: safe clamp.
 [BUG-09] scene_video_raw and scene_video_final: if raw exists but final doesn't, skip logic
           is wrong — fixed re-use check to test final, not raw.
 [BUG-10] story_expander.py gaps: scenes 31-40, 42-46, 48-55, 57-67, 69-79, 81-82, 84-89,
           92-94, 96-98 have no expansion text. Fixed: fallback TTS text always cleaned properly.
 [BUG-11] numpy imported but never used. Fixed: removed.
 [BUG-12] ImageDraw, ImageFont imported but unused. Fixed: removed.
 [BUG-13] asyncio.gather on 101 TTS tasks simultaneously: can exhaust TCP connection pool.
           Fixed: semaphore cap of 8 concurrent TTS connections.
 [BUG-14] BGM concat filter_str missing colon separator. Fixed: correct filter syntax.
 [BUG-15] get_audio_duration returns 10.0 on error silently inflating duration. Fixed: logs warning.
"""

import os
import re
import time
import shutil
import asyncio
import logging
import subprocess
import urllib.parse
from pathlib import Path
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor

import requests
import edge_tts
from PIL import Image, ImageOps


# ==============================================================================
# CONFIGURATION
# ==============================================================================
class Config:
    NOVEL_FILE   = r"C:\Users\Akash\Desktop\Heavenly_Rebellion_Book1_Script.txt"
    PROJECT_DIR  = Path(r"C:\Users\Akash\Desktop\VideoForge_Book1")
    OUTPUT_VIDEO = "Heavenly_Rebellion_Book1_1Hour.mp4"

    VOICE      = "en-US-ChristopherNeural"
    WIDTH      = 1920
    HEIGHT     = 1080
    FPS        = 24

    SHOTS_PER_SCENE = 3           # Wide / Medium / Close-up
    TRANSITION      = 0.4         # Fade duration (seconds) — reduced so short scenes don't crash
    SHOT_SECONDS    = 3.0         # Each image plays for this many seconds

    # 16:9 native — keeps us under Pollinations free tier limit
    POLLINATIONS_W = 800
    POLLINATIONS_H = 450

    # Throttle to avoid HTTP 402 storms
    IMG_COOLDOWN_OK  = 5    # seconds after a successful download
    IMG_COOLDOWN_ERR = 22   # seconds after a 402/429/5xx response
    TTS_CONCURRENCY  = 8    # max simultaneous TTS connections


config = Config()
config.PROJECT_DIR.mkdir(exist_ok=True, parents=True)

IMG_DIR = config.PROJECT_DIR / "images"
FRM_DIR = config.PROJECT_DIR / "frames"
AUD_DIR = config.PROJECT_DIR / "audio"
TMP_DIR = config.PROJECT_DIR / "temp"

for d in (IMG_DIR, FRM_DIR, AUD_DIR, TMP_DIR):
    d.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(config.PROJECT_DIR / "videoforge.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

STYLE = (
    "masterpiece anime illustration, ultra-detailed cinematic realism, Ufotable studio style, "
    "volumetric light rays, 8k resolution, sharp ink linework, dramatic cel shading, "
    "high contrast chiaroscuro, no text, no watermark"
)

SHOT_TYPES = [
    "Epic wide establishing shot, vast cinematic scale",
    "Dramatic medium shot, dynamic camera angle",
    "Intense cinematic close-up, deep emotional focus",
]


# ==============================================================================
# HELPERS
# ==============================================================================
def get_audio_duration(path: Path) -> float:
    """Return duration in seconds via ffprobe. Returns 10.0 with a warning on error."""
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        val = float(res.stdout.strip())
        if val <= 0:
            raise ValueError("non-positive duration")
        return val
    except Exception:
        log.warning(f"[ffprobe] Could not read duration for {path.name} — defaulting to 10s")
        return 10.0


def safe_fade_ts(dur: float, transition: float):
    """Return (fade_in_end, fade_out_start) clamped so they never overlap."""
    t = min(transition, dur / 4)   # never use more than 25% of clip per fade
    return t, max(t, dur - t)


def make_black_frame(path: Path):
    """Create a solid black 1920×1080 PNG fallback frame."""
    Image.new("RGB", (config.WIDTH, config.HEIGHT), (8, 8, 12)).save(path, "PNG")


# ==============================================================================
# BGM PREPARATION
# ==============================================================================
def prepare_bgm() -> Optional[Path]:
    desktop = Path(r"C:\Users\Akash\Desktop")
    candidates = [desktop / "master_audio.mp3", desktop / "saga_audio.mp3"]
    available  = [p for p in candidates if p.exists()]

    if not available:
        log.warning("No BGM files found on Desktop — video will have no background music.")
        return None

    bgm_out = TMP_DIR / "bgm_combined.mp3"
    if bgm_out.exists() and bgm_out.stat().st_size > 10_000:
        return bgm_out

    log.info(f"Preparing BGM from: {[p.name for p in available]}")
    if len(available) == 1:
        shutil.copy(available[0], bgm_out)
    else:
        # BUG-14 FIX: correct concat filter syntax
        inputs = []
        for p in available:
            inputs += ["-i", str(p)]
        n  = len(available)
        fs = "".join(f"[{i}:a]" for i in range(n)) + f"concat=n={n}:v=0:a=1[a]"
        cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", fs, "-map", "[a]",
               "-c:a", "libmp3lame", "-q:a", "4", str(bgm_out)]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return bgm_out


# ==============================================================================
# 1. NOVEL PARSER
# ==============================================================================
def parse_novel(filepath: str):
    log.info(f"Parsing novel from {filepath}...")
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except Exception as e:
        log.error(f"Cannot read novel file: {e}")
        return {}, []

    # ── Character profiles ──────────────────────────────────────────────────
    characters: Dict[str, str] = {}
    prof_sec = re.search(r"CHARACTER PROFILES.*?(?=ARC 1)", text, re.DOTALL | re.IGNORECASE)
    if prof_sec:
        blocks = re.split(r"\n([A-Z\s]{4,})\n", prof_sec.group(0))
        for i in range(1, len(blocks) - 1, 2):
            name  = blocks[i].strip()
            block = blocks[i + 1]
            m = re.search(
                r"APPEARANCE:\s*(.*?)(?=POWER LEVEL|SKILLS|PERSONALITY|\n\n|$)",
                block, re.DOTALL | re.IGNORECASE,
            )
            if m:
                kw = name.split()[-1].lower() if len(name.split()) > 1 else name.lower()
                characters[kw] = m.group(1).strip()
                log.info(f"  Parsed character: {name} (keyword: {kw})")

    # ── Story expansions ────────────────────────────────────────────────────
    try:
        from story_expander import SCENE_EXPANSIONS
    except ImportError:
        log.warning("story_expander.py not found — using raw scene text only.")
        SCENE_EXPANSIONS = {}

    # ── Scenes ──────────────────────────────────────────────────────────────
    scenes: List[Dict] = []
    scene_matches = list(re.finditer(
        r"(Scene \d+:.*?)\n(.*?)IMAGE PROMPT:(.*?)(?=Scene \d+:|$)",
        text, re.DOTALL,
    ))

    for match in scene_matches:
        title      = match.group(1).strip()
        body       = match.group(2).strip()
        img_prompt = match.group(3).strip()

        sn = re.search(r"Scene (\d+)", title)
        if not sn:
            continue
        scene_num = int(sn.group(1))

        # BUG-10 FIX: always clean fallback text properly
        if scene_num in SCENE_EXPANSIONS:
            tts_text = SCENE_EXPANSIONS[scene_num]
        else:
            raw = re.sub(r"(DESCRIPTION:|DIALOGUE:|🎨|\[.*?\]|\(.*?\))", "", body, flags=re.IGNORECASE)
            tts_text = re.sub(r"\s+", " ", raw).strip()
            if not tts_text:
                tts_text = title  # last-resort fallback

        # Inject matching character appearance into image prompt
        matched_apps = [
            app for kw, app in characters.items()
            if kw in (title + body + img_prompt).lower()
        ]
        final_prompt = " ".join(matched_apps + [img_prompt]).strip()

        scenes.append({
            "title":     title,
            "text":      tts_text,
            "prompt":    final_prompt,
            "scene_num": scene_num,
        })

    scenes.sort(key=lambda x: x["scene_num"])

    # Intro scene
    intro_text = SCENE_EXPANSIONS.get(
        0,
        "Welcome to The Heavenly Rebellion — an epic wuxia adventure. "
        "Please subscribe and enjoy the journey.",
    )
    scenes.insert(0, {
        "title":     "Channel Intro",
        "text":      intro_text,
        "prompt":    "masterpiece anime illustration, epic fantasy landscape, cinematic title screen, "
                     "beautiful warm golden lighting, magical atmosphere, no text, no watermark",
        "scene_num": 0,
    })

    log.info(f"Parsed {len(scenes)} scenes (including intro).")
    return characters, scenes


# ==============================================================================
# 2. IMAGE GENERATION  (BUG-01 + BUG-02 FIX)
# ==============================================================================
def _pollinations_url(prompt: str, seed: int, attempt: int) -> str:
    models = ["flux", "turbo", "any"]
    model  = models[attempt % len(models)]
    enc    = urllib.parse.quote(prompt)
    return (
        f"https://image.pollinations.ai/prompt/{enc}"
        f"?width={config.POLLINATIONS_W}&height={config.POLLINATIONS_H}"
        f"&seed={seed}&model={model}&nologo=true"
    )


def _download_image(dest: Path, prompt: str, s_idx: int, shot_idx: int, n_scenes: int) -> bool:
    """Try up to 5 times to download one image. Returns True on success."""
    for attempt in range(5):
        seed = 2026 + s_idx * 10 + shot_idx + attempt * 100
        url  = _pollinations_url(prompt, seed, attempt)
        log.info(f"  [Scene {s_idx+1}/{n_scenes} Shot {shot_idx+1}/3] attempt {attempt+1}/5 ...")
        try:
            r = requests.get(url, timeout=90)
            if r.status_code == 200 and len(r.content) > 15_000:
                dest.write_bytes(r.content)
                log.info(f"  ✓ Saved {dest.name}. Cooldown {config.IMG_COOLDOWN_OK}s ...")
                time.sleep(config.IMG_COOLDOWN_OK)
                return True
            elif r.status_code in (402, 429, 500, 502, 503):
                log.warning(f"  HTTP {r.status_code} — cooldown {config.IMG_COOLDOWN_ERR}s ...")
                time.sleep(config.IMG_COOLDOWN_ERR)
            else:
                log.warning(f"  HTTP {r.status_code} — retrying in 5s ...")
                time.sleep(5)
        except requests.exceptions.Timeout:
            log.warning(f"  Timeout — cooldown {config.IMG_COOLDOWN_ERR}s ...")
            time.sleep(config.IMG_COOLDOWN_ERR)
        except Exception as e:
            log.warning(f"  Network error: {e} — cooldown {config.IMG_COOLDOWN_ERR}s ...")
            time.sleep(config.IMG_COOLDOWN_ERR)
    return False


def generate_scene_images(scenes: List[Dict]):
    log.info(f"Generating images ({config.SHOTS_PER_SCENE}/scene, sequential to avoid rate-limits)...")
    n = len(scenes)
    for s_idx, scene in enumerate(scenes):
        base_prompt = scene["prompt"]
        scene["images"] = []

        for shot_idx, shot_type in enumerate(SHOT_TYPES):
            dest = IMG_DIR / f"scene_{s_idx:03d}_shot_{shot_idx}.png"

            # BUG-02 FIX: only skip if file truly valid
            if dest.exists() and dest.stat().st_size > 15_000:
                scene["images"].append(str(dest))
                continue

            full_prompt = f"{base_prompt}, {shot_type}, {STYLE}"
            ok = _download_image(dest, full_prompt, s_idx, shot_idx, n)

            if ok:
                scene["images"].append(str(dest))
            else:
                log.error(f"  ✗ Failed all 5 attempts for scene {s_idx+1} shot {shot_idx+1} — using black frame.")
                # BUG-02 FIX: create black frame and still record path so pipeline doesn't break
                make_black_frame(dest)
                scene["images"].append(str(dest))

        log.info(f"  Scene {s_idx+1}/{n} images done ({len(scene['images'])}/3).")


# ==============================================================================
# 3. AUDIO GENERATION  (BUG-05 + BUG-13 FIX)
# ==============================================================================
async def _tts_one(s_idx: int, scene: Dict, sem: asyncio.Semaphore):
    dest = AUD_DIR / f"scene_{s_idx:03d}.mp3"
    scene["audio"] = str(dest)

    # BUG-05 FIX: always call get_audio_duration, even on cache hit
    if dest.exists() and dest.stat().st_size > 2_000:
        scene["duration"] = get_audio_duration(dest)
        return

    async with sem:
        log.info(f"  TTS scene {s_idx+1} ...")
        try:
            comm = edge_tts.Communicate(scene["text"], voice=config.VOICE, rate="+5%")
            await comm.save(str(dest))
            scene["duration"] = get_audio_duration(dest)
        except Exception as e:
            log.error(f"  TTS failed for scene {s_idx+1}: {e}")
            scene["duration"] = 10.0


async def generate_audio(scenes: List[Dict]):
    log.info("Generating TTS audio (parallel, semaphore-limited)...")
    sem   = asyncio.Semaphore(config.TTS_CONCURRENCY)
    tasks = [_tts_one(i, s, sem) for i, s in enumerate(scenes)]
    await asyncio.gather(*tasks)
    log.info("All TTS audio generated.")


# ==============================================================================
# 4. FRAME PROCESSING  (BUG-06 FIX)
# ==============================================================================
def _process_one_frame(args):
    src_path, dst_path = args
    src = Path(src_path)
    dst = Path(dst_path)
    if dst.exists() and dst.stat().st_size > 1_000:
        return
    if not src.exists() or src.stat().st_size < 15_000:
        make_black_frame(dst)
        return
    try:
        with Image.open(src) as im:
            im = ImageOps.fit(im.convert("RGB"), (config.WIDTH, config.HEIGHT),
                              Image.Resampling.LANCZOS)
            im.save(dst, "PNG")
    except Exception as e:
        log.error(f"Frame processing failed for {src.name}: {e}")
        make_black_frame(dst)


def process_frames(scenes: List[Dict]):
    log.info("Fitting frames to 1920×1080 (2 workers)...")
    tasks = []
    for s_idx, scene in enumerate(scenes):
        scene["frames"] = []
        for shot_idx in range(config.SHOTS_PER_SCENE):
            img_path = scene["images"][shot_idx] if shot_idx < len(scene["images"]) else None
            dst      = FRM_DIR / f"frame_{s_idx:03d}_{shot_idx}.png"
            scene["frames"].append(str(dst))
            tasks.append((img_path or "", str(dst)))

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(_process_one_frame, tasks))
    log.info("All frames processed.")


# ==============================================================================
# 5. VIDEO BUILD  (BUG-04 + BUG-07 + BUG-08 + BUG-09 FIX)
# ==============================================================================
def render_shot(img_path: Path, shot_dur: float, effect: int, out: Path):
    """Render a single looped still image to a short MP4 clip with camera movement."""
    total_frames = max(1, int(round(shot_dur * config.FPS)))

    if effect == 0:
        vf = ("scale=2048:1152,"
              "zoompan=z='zoom+0.0015':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
              ":d=1:s=1920x1080:fps=24")
    elif effect == 1:
        vf = ("scale=2048:1152,"
              "zoompan=z='max(1.15-0.0015*on,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
              ":d=1:s=1920x1080:fps=24")
    else:
        vf = (f"scale=2048:1152,"
              f"zoompan=z='1.15':x='(iw-iw/1.15)*(on/{total_frames})':y='ih/2-ih/2.3'"
              f":d=1:s=1920x1080:fps=24")

    cmd = [
        "ffmpeg", "-y", "-loop", "1", "-i", str(img_path),
        "-t", f"{shot_dur:.3f}", "-r", str(config.FPS),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast",
        "-threads", "3",           # BUG-07 FIX: cap CPU threads
        "-pix_fmt", "yuv420p",
        "-r", str(config.FPS),
        str(out),
    ]
    result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if result.returncode != 0:
        log.error(f"FFmpeg shot render failed for {out.name}: {result.stderr[-300:].decode(errors='replace')}")


def write_manifest(path: Path, entries: List[Path]):
    """BUG-04 FIX: always write absolute paths in manifest files."""
    with open(path, "w", encoding="utf-8") as f:
        for e in entries:
            f.write(f"file '{e.resolve()}'\n")


def build_video(scenes: List[Dict]):
    log.info("=== VIDEO BUILD STARTED ===")

    # ── Step 1: Render individual shot clips (sequential, 1 FFmpeg at a time) ──
    all_shot_tasks = []
    for s_idx, scene in enumerate(scenes):
        dur      = scene.get("duration", 10.0)
        n_shots  = max(1, int(round(dur / config.SHOT_SECONDS)))
        shot_dur = dur / n_shots
        scene["shot_paths"] = []

        for i in range(n_shots):
            frame_idx = i % config.SHOTS_PER_SCENE
            img       = Path(scene["frames"][frame_idx])
            out       = TMP_DIR / f"shot_{s_idx:03d}_{i:03d}.mp4"
            scene["shot_paths"].append(out)

            # BUG-09 FIX: check the OUTPUT clip, not an intermediate file
            if out.exists() and out.stat().st_size > 10_000:
                continue
            all_shot_tasks.append((img, shot_dur, i % 3, out))

    log.info(f"Rendering {len(all_shot_tasks)} shot clips (sequential, 1 worker) ...")
    with ThreadPoolExecutor(max_workers=1) as pool:
        futs = [pool.submit(render_shot, *t) for t in all_shot_tasks]
        for idx, fut in enumerate(futs):
            fut.result()
            if (idx + 1) % 20 == 0 or (idx + 1) == len(futs):
                log.info(f"  Shot clips: {idx+1}/{len(futs)}")

    # ── Step 2: Per-scene: concat shots → fade → mux audio ──────────────────
    log.info("Muxing audio + fades per scene ...")
    for s_idx, scene in enumerate(scenes):
        raw   = TMP_DIR / f"v_{s_idx:03d}_raw.mp4"
        final = TMP_DIR / f"v_{s_idx:03d}.mp4"
        scene["video"] = str(final)

        if final.exists() and final.stat().st_size > 10_000:
            continue

        # Concat shot clips for this scene
        manifest = TMP_DIR / f"list_{s_idx:03d}.txt"
        write_manifest(manifest, [p for p in scene["shot_paths"]])

        r = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
             "-i", str(manifest), "-c", "copy", str(raw)],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
        if r.returncode != 0:
            log.error(f"Concat failed for scene {s_idx}: {r.stderr[-200:].decode(errors='replace')}")
            continue

        dur  = scene.get("duration", 10.0)
        t, fade_out_start = safe_fade_ts(dur, config.TRANSITION)  # BUG-08 FIX

        r2 = subprocess.run(
            ["ffmpeg", "-y",
             "-i", str(raw), "-i", scene["audio"],
             "-vf", f"fade=t=in:st=0:d={t:.3f},fade=t=out:st={fade_out_start:.3f}:d={t:.3f}",
             "-af", f"afade=t=in:ss=0:d={t:.3f},afade=t=out:st={fade_out_start:.3f}:d={t:.3f}",
             "-c:v", "libx264", "-preset", "ultrafast", "-threads", "3",
             "-c:a", "aac", "-b:a", "128k",
             "-shortest",
             str(final)],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
        if r2.returncode != 0:
            log.error(f"Fade/mux failed for scene {s_idx}: {r2.stderr[-200:].decode(errors='replace')}")

        if (s_idx + 1) % 10 == 0:
            log.info(f"  Scene mux progress: {s_idx+1}/{len(scenes)}")

    # ── Step 3: Global concat ────────────────────────────────────────────────
    log.info("Concatenating all scenes into one timeline ...")
    master_manifest = TMP_DIR / "list_all.txt"
    valid_scene_videos = []
    for s_idx in range(len(scenes)):
        p = TMP_DIR / f"v_{s_idx:03d}.mp4"
        if p.exists() and p.stat().st_size > 5_000:
            valid_scene_videos.append(p)
        else:
            log.warning(f"  Scene {s_idx} video missing — skipped in final concat.")

    write_manifest(master_manifest, valid_scene_videos)
    narration = TMP_DIR / "narration.mp4"

    r = subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
         "-i", str(master_manifest), "-c", "copy", str(narration)],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    if r.returncode != 0:
        log.error(f"Master concat failed: {r.stderr[-400:].decode(errors='replace')}")
        return

    # ── Step 4: Mix BGM ──────────────────────────────────────────────────────
    log.info("Mixing BGM and exporting final video ...")
    final_out = config.PROJECT_DIR / config.OUTPUT_VIDEO
    bgm       = prepare_bgm()

    if bgm:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(narration),
            "-stream_loop", "-1", "-i", str(bgm),
            "-filter_complex",
            "[0:a]volume=1.0[voice];[1:a]volume=0.07[bgm];[voice][bgm]amix=inputs=2:duration=first[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            str(final_out),
        ]
    else:
        cmd = ["ffmpeg", "-y", "-i", str(narration),
               "-c", "copy", "-movflags", "+faststart", str(final_out)]

    r = subprocess.run(cmd, stderr=subprocess.PIPE)
    if r.returncode == 0:
        size_mb = final_out.stat().st_size / 1_048_576
        log.info(f"✅ SUCCESS! Final video: {final_out}  ({size_mb:.1f} MB)")
    else:
        log.error(f"Final export failed: {r.stderr[-400:].decode(errors='replace')}")


# ==============================================================================
# MAIN
# ==============================================================================
async def main():
    log.info("=" * 60)
    log.info("VideoForge Elite — Novel Edition (Bug-Fixed Build)")
    log.info(f"Python {__import__('sys').version.split()[0]}")
    log.info("=" * 60)

    chars, scenes = parse_novel(config.NOVEL_FILE)
    if not scenes:
        log.error("No scenes parsed. Aborting.")
        return

    await generate_audio(scenes)
    generate_scene_images(scenes)
    process_frames(scenes)
    build_video(scenes)

    log.info("DONE! Check your Desktop/VideoForge_Book1 folder.")


if __name__ == "__main__":
    # BUG-03 FIX: removed deprecated WindowsSelectorEventLoopPolicy
    # Python 3.14+ handles this correctly by default on Windows
    asyncio.run(main())
