#!/usr/bin/env python3
"""
VideoForge — Open-Source CLI Video Composer
============================================
Features:
  - Compose & trim video clips with transitions (fade, cut, wipe)
  - Add TTS-generated voice dialogue via edge-tts (Microsoft neural voices)
  - Render styled subtitle overlays using Pillow
  - Add scene-synced background music with volume & fade control
  - Define everything in a single YAML or JSON project file

Usage:
  python videoforge.py render project.yaml
  python videoforge.py render project.yaml --output my_video.mp4
  python videoforge.py render project.yaml --preview
  python videoforge.py validate project.yaml
  python videoforge.py voices
  python videoforge.py example

Install dependencies:
  pip install moviepy edge-tts Pillow pyyaml click

System requirement:
  FFmpeg must be installed and available in PATH.
"""

import asyncio
import hashlib
import json
import os
import sys
import textwrap
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Lazy imports with friendly error messages
# ─────────────────────────────────────────────────────────────────────────────

def _require(package: str, install_name: str = None):
    """Import a package or exit with a helpful install message."""
    import importlib
    try:
        return importlib.import_module(package)
    except ImportError:
        name = install_name or package
        print(f"[ERROR] Missing dependency '{name}'. Install it with:\n"
              f"        pip install {name}")
        sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DialogueLine:
    text: str
    start: float                            # seconds into the scene clip
    duration: float
    voice: str = "en-US-AriaNeural"
    style: str = "general"
    position: str = "bottom"               # top | center | bottom
    font_size: int = 48
    color: str = "#FFFFFF"
    background: bool = True               # semi-transparent box behind text
    font_path: Optional[str] = None       # override default font


@dataclass
class BGMConfig:
    file: str
    volume: float = 0.4                    # 0.0 – 1.0
    fade_in: float = 1.0                   # seconds
    fade_out: float = 1.0                  # seconds
    loop: bool = False


@dataclass
class Scene:
    id: str
    clip: str
    trim: Optional[Tuple[float, float]] = None   # [start_sec, end_sec]
    transition_in: str = "cut"             # fade | cut | wipe
    transition_out: str = "cut"
    transition_duration: float = 0.5      # seconds for fade/wipe
    dialogue: List[DialogueLine] = field(default_factory=list)
    bgm: Optional[BGMConfig] = None


@dataclass
class Project:
    name: str
    output: str
    scenes: List[Scene]
    resolution: Tuple[int, int] = (1920, 1080)
    fps: int = 30
    font: str = "Arial"


# ─────────────────────────────────────────────────────────────────────────────
# Scene File Loader (YAML / JSON)
# ─────────────────────────────────────────────────────────────────────────────

class SceneLoader:
    """Parses and validates a YAML or JSON project file into a Project object."""

    def load(self, path: str) -> "Project":
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Project file not found: {path}")

        raw = p.read_text(encoding="utf-8")
        if p.suffix in (".yaml", ".yml"):
            yaml = _require("yaml", "pyyaml")
            data = yaml.safe_load(raw)
        elif p.suffix == ".json":
            data = json.loads(raw)
        else:
            raise ValueError("Project file must be .yaml, .yml, or .json")

        return self._parse(data, base_dir=p.parent)

    def _parse(self, data: dict, base_dir: Path) -> "Project":
        proj = data.get("project", {})
        name = proj.get("name", "Untitled")
        output = proj.get("output", "output.mp4")
        res = tuple(proj.get("resolution", [1920, 1080]))
        fps = proj.get("fps", 30)
        font = proj.get("font", "Arial")

        scenes = []
        for s in data.get("scenes", []):
            clip_raw = s["clip"]
            clip_path = str(base_dir / clip_raw) if not Path(clip_raw).is_absolute() else clip_raw
            if not Path(clip_path).exists():
                raise FileNotFoundError(f"Clip not found: {clip_path}")

            trim = s.get("trim")
            if trim:
                trim = tuple(trim)

            dialogues = []
            for d in s.get("dialogue", []):
                dialogues.append(DialogueLine(
                    text=d["text"],
                    start=float(d.get("start", 0)),
                    duration=float(d.get("duration", 3)),
                    voice=d.get("voice", "en-US-AriaNeural"),
                    style=d.get("style", "general"),
                    position=d.get("position", "bottom"),
                    font_size=int(d.get("font_size", 48)),
                    color=d.get("color", "#FFFFFF"),
                    background=bool(d.get("background", True)),
                    font_path=d.get("font_path"),
                ))

            bgm = None
            if "bgm" in s:
                b = s["bgm"]
                bgm_raw = b["file"]
                bgm_path = str(base_dir / bgm_raw) if not Path(bgm_raw).is_absolute() else bgm_raw
                if not Path(bgm_path).exists():
                    raise FileNotFoundError(f"BGM file not found: {bgm_path}")
                bgm = BGMConfig(
                    file=bgm_path,
                    volume=float(b.get("volume", 0.4)),
                    fade_in=float(b.get("fade_in", 1.0)),
                    fade_out=float(b.get("fade_out", 1.0)),
                    loop=bool(b.get("loop", False)),
                )

            scenes.append(Scene(
                id=s.get("id", f"scene_{len(scenes)}"),
                clip=clip_path,
                trim=trim,
                transition_in=s.get("transition_in", "cut"),
                transition_out=s.get("transition_out", "cut"),
                transition_duration=float(s.get("transition_duration", 0.5)),
                dialogue=dialogues,
                bgm=bgm,
            ))

        return Project(
            name=name,
            output=output,
            scenes=scenes,
            resolution=res,
            fps=fps,
            font=font,
        )


# ─────────────────────────────────────────────────────────────────────────────
# TTS Engine (edge-tts)
# ─────────────────────────────────────────────────────────────────────────────

class TTSEngine:
    """
    Generates TTS audio for each dialogue line using edge-tts.
    Audio files are cached in .videoforge_cache/ to avoid re-generating on
    subsequent renders if the text + voice + style haven't changed.
    """

    CACHE_DIR = Path(".videoforge_cache") / "tts"

    def __init__(self):
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _cache_key(self, text: str, voice: str, style: str) -> str:
        h = hashlib.md5(f"{text}|{voice}|{style}".encode()).hexdigest()
        return h

    def _cache_path(self, key: str) -> Path:
        return self.CACHE_DIR / f"{key}.mp3"

    async def _generate_one(self, text: str, voice: str, out_path: Path):
        """Generate a single TTS audio file asynchronously using edge-tts."""
        edge_tts = _require("edge_tts", "edge-tts")
        try:
            communicate = edge_tts.Communicate(text, voice=voice)
            await communicate.save(str(out_path))
        except Exception as e:
            print(f"  [WARN] TTS failed for '{text[:40]}': {e}")
            # Create a silent fallback audio file
            self._create_silent_audio(out_path, duration=max(1.0, len(text) * 0.07))

    def _create_silent_audio(self, path: Path, duration: float = 2.0):
        """Write a silent WAV/MP3 as a fallback when TTS fails."""
        import wave, struct, math
        wav_path = path.with_suffix(".wav")
        sample_rate = 44100
        num_samples = int(sample_rate * duration)
        with wave.open(str(wav_path), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(b"\x00\x00" * num_samples)
        # Rename to the expected path
        wav_path.rename(path)

    def generate_all(self, dialogues: List[DialogueLine]) -> dict:
        """
        Pre-generate TTS audio for all dialogue lines.
        Returns a dict mapping cache_key -> Path of audio file.
        """
        results = {}
        tasks_to_run = []

        for dlg in dialogues:
            key = self._cache_key(dlg.text, dlg.voice, dlg.style)
            path = self._cache_path(key)
            results[key] = path
            if not path.exists():
                tasks_to_run.append((dlg.text, dlg.voice, path))

        if tasks_to_run:
            print(f"  Generating {len(tasks_to_run)} TTS clip(s) via edge-tts...")

            async def run_all():
                coros = [self._generate_one(t, v, p) for t, v, p in tasks_to_run]
                await asyncio.gather(*coros)

            asyncio.run(run_all())
        else:
            print("  All TTS clips found in cache — skipping generation.")

        return results

    def get_audio_path(self, dlg: DialogueLine, cache_map: dict) -> Optional[Path]:
        key = self._cache_key(dlg.text, dlg.voice, dlg.style)
        return cache_map.get(key)


# ─────────────────────────────────────────────────────────────────────────────
# Subtitle / Dialogue Overlay Renderer
# ─────────────────────────────────────────────────────────────────────────────

class SubtitleRenderer:
    """
    Renders styled subtitle/dialogue text onto a transparent RGBA canvas
    using Pillow, then wraps it in a MoviePy ImageClip for compositing.
    """

    _FONT_SEARCH_DIRS = [
        Path("C:/Windows/Fonts"),
        Path("/usr/share/fonts"),
        Path("/Library/Fonts"),
        Path("/System/Library/Fonts"),
    ]

    def find_font(self, hint: str = "Arial") -> Optional[str]:
        """Search for a TTF font by name hint across common system directories."""
        hint_lower = hint.lower().replace(" ", "")
        for d in self._FONT_SEARCH_DIRS:
            if not d.exists():
                continue
            for f in d.rglob("*.ttf"):
                if hint_lower in f.stem.lower():
                    return str(f)
        # Fallback: any TTF font we can find
        for d in self._FONT_SEARCH_DIRS:
            if not d.exists():
                continue
            ttfs = list(d.rglob("*.ttf"))
            if ttfs:
                return str(ttfs[0])
        return None

    def _hex_to_rgba(self, hex_color: str, alpha: int = 255) -> Tuple:
        h = hex_color.lstrip("#")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return (r, g, b, alpha)

    def make_subtitle_clip(
        self,
        dlg: DialogueLine,
        resolution: Tuple[int, int],
        font_path: Optional[str] = None,
    ):
        """
        Build a MoviePy ImageClip of the subtitle at the correct duration.
        The clip has a transparent background so it can be composited over video.
        """
        from PIL import Image, ImageDraw, ImageFont
        from moviepy.video.VideoClip import ImageClip
        import numpy as np

        W, H = resolution
        font_file = dlg.font_path or font_path

        # Load font
        try:
            if font_file and Path(font_file).exists():
                font = ImageFont.truetype(font_file, dlg.font_size)
            else:
                font = ImageFont.load_default()
        except Exception:
            font = ImageFont.load_default()

        # Word-wrap
        max_chars = max(10, int(W / (dlg.font_size * 0.58)))
        wrapped_lines = textwrap.fill(dlg.text, width=max_chars).split("\n")

        # Measure text extents
        probe = Image.new("RGBA", (10, 10))
        probe_draw = ImageDraw.Draw(probe)
        bboxes = [probe_draw.textbbox((0, 0), ln, font=font) for ln in wrapped_lines]
        line_heights = [bb[3] - bb[1] for bb in bboxes]
        line_widths  = [bb[2] - bb[0] for bb in bboxes]
        lh = max(line_heights) if line_heights else dlg.font_size
        lw = max(line_widths)  if line_widths  else 100
        spacing = int(lh * 0.3)
        total_h = lh * len(wrapped_lines) + spacing * (len(wrapped_lines) - 1)

        pad_x, pad_y = 28, 16
        box_w = lw + pad_x * 2
        box_h = total_h + pad_y * 2

        # Compute position
        margin = 60
        bx = (W - box_w) // 2
        if dlg.position == "bottom":
            by = H - box_h - margin
        elif dlg.position == "top":
            by = margin
        else:  # center
            by = (H - box_h) // 2

        # Render onto transparent canvas
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        if dlg.background:
            draw.rounded_rectangle(
                [bx, by, bx + box_w, by + box_h],
                radius=14,
                fill=(0, 0, 0, 178),      # ~70% opaque black
            )

        text_rgba = self._hex_to_rgba(dlg.color)
        shadow_rgba = (0, 0, 0, 180)

        for i, line in enumerate(wrapped_lines):
            lw_i = line_widths[i] if i < len(line_widths) else lw
            tx = bx + pad_x + (lw - lw_i) // 2
            ty = by + pad_y + i * (lh + spacing)
            # Shadow
            draw.text((tx + 2, ty + 2), line, font=font, fill=shadow_rgba)
            # Text
            draw.text((tx, ty), line, font=font, fill=text_rgba)

        arr = np.array(img)
        clip = ImageClip(arr, ismask=False).set_duration(dlg.duration)
        return clip


# ─────────────────────────────────────────────────────────────────────────────
# BGM Manager
# ─────────────────────────────────────────────────────────────────────────────

class BGMManager:
    """Loads, trims, loops, and volume-adjusts background music for a scene."""

    def build_bgm_clip(self, config: BGMConfig, scene_duration: float):
        """
        Return a MoviePy AudioClip for BGM, matched to scene_duration,
        with volume adjustment and fade-in/fade-out applied.
        """
        from moviepy.audio.io.AudioFileClip import AudioFileClip
        from moviepy.audio.AudioClip import concatenate_audioclips

        bgm = AudioFileClip(config.file)

        if config.loop and bgm.duration < scene_duration:
            repeats = int(scene_duration / bgm.duration) + 2
            bgm = concatenate_audioclips([bgm] * repeats)

        # Trim to scene duration
        end = min(bgm.duration, scene_duration)
        bgm = bgm.subclip(0, end)

        # Volume
        bgm = bgm.volumex(config.volume)

        # Fades
        if config.fade_in > 0:
            bgm = bgm.audio_fadein(config.fade_in)
        if config.fade_out > 0:
            bgm = bgm.audio_fadeout(config.fade_out)

        return bgm


# ─────────────────────────────────────────────────────────────────────────────
# Clip Composer — trim, resize, and transition logic
# ─────────────────────────────────────────────────────────────────────────────

class ClipComposer:
    """Handles loading, trimming, resizing, and transitioning video clips."""

    def load_and_trim(
        self,
        scene: Scene,
        resolution: Tuple[int, int],
        fps: int,
        preview: bool = False,
    ):
        from moviepy.video.io.VideoFileClip import VideoFileClip

        clip = VideoFileClip(scene.clip, audio=True)
        if scene.trim:
            start, end = scene.trim
            end = min(end, clip.duration)
            clip = clip.subclip(start, end)

        target_res = (854, 480) if preview else resolution
        clip = clip.resize(target_res)
        clip = clip.set_fps(fps)
        return clip

    def apply_transition_in(self, clip, t: str, d: float):
        if t == "fade":
            return clip.fadein(d)
        return clip

    def apply_transition_out(self, clip, t: str, d: float):
        if t == "fade":
            return clip.fadeout(d)
        return clip

    def apply_wipe(self, clip_a, clip_b, duration: float, resolution: Tuple[int, int]):
        """Left-to-right wipe transition between the tail of clip_a and the head of clip_b."""
        from moviepy.video.VideoClip import VideoClip
        import numpy as np

        W, H = resolution
        fps = clip_a.fps or 30

        def make_frame(t):
            progress = t / duration
            split_x = int(W * progress)
            frame_a = clip_a.get_frame(clip_a.duration - duration + t)
            frame_b = clip_b.get_frame(t)
            frame = frame_a.copy()
            if split_x > 0:
                frame[:, :split_x] = frame_b[:, :split_x]
            return frame

        return VideoClip(make_frame, duration=duration).set_fps(fps)

    def concatenate_with_transitions(
        self,
        clips_with_scenes: list,
        resolution: Tuple[int, int],
        fps: int,
    ):
        from moviepy.editor import concatenate_videoclips

        if len(clips_with_scenes) == 1:
            clip, scene = clips_with_scenes[0]
            clip = self.apply_transition_in(clip, scene.transition_in, scene.transition_duration)
            clip = self.apply_transition_out(clip, scene.transition_out, scene.transition_duration)
            return clip

        final_clips = []
        for i, (clip, scene) in enumerate(clips_with_scenes):
            clip = self.apply_transition_in(clip, scene.transition_in, scene.transition_duration)
            clip = self.apply_transition_out(clip, scene.transition_out, scene.transition_duration)

            if i < len(clips_with_scenes) - 1:
                next_clip, next_scene = clips_with_scenes[i + 1]
                if next_scene.transition_in == "wipe":
                    wipe = self.apply_wipe(
                        clip, next_clip, next_scene.transition_duration, resolution
                    )
                    final_clips.append(wipe)
                    continue

            final_clips.append(clip)

        return concatenate_videoclips(final_clips, method="compose")


# ─────────────────────────────────────────────────────────────────────────────
# Main Renderer — Pipeline Orchestrator
# ─────────────────────────────────────────────────────────────────────────────

class VideoForgeRenderer:
    """Orchestrates the complete rendering pipeline for a Project."""

    def __init__(self, preview: bool = False):
        self.preview = preview
        self.tts       = TTSEngine()
        self.subtitles = SubtitleRenderer()
        self.bgm_mgr   = BGMManager()
        self.composer  = ClipComposer()

    def render_scene(self, scene: Scene, project: Project, tts_cache: dict):
        """Render a single scene: clip + subtitle overlays + TTS audio + BGM."""
        from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
        from moviepy.audio.AudioClip import CompositeAudioClip

        resolution = (854, 480) if self.preview else project.resolution
        fps = project.fps

        print(f"  [{scene.id}] Loading and trimming clip...")
        clip = self.composer.load_and_trim(scene, resolution, fps, self.preview)
        duration = clip.duration

        font_path = self.subtitles.find_font(project.font)
        overlay_clips = [clip]
        audio_tracks  = [clip.audio] if clip.audio else []

        for dlg in scene.dialogue:
            # Subtitle overlay
            print(f"  [{scene.id}] Subtitle: \"{dlg.text[:50]}\"")
            sub = self.subtitles.make_subtitle_clip(dlg, resolution, font_path)
            sub = sub.set_start(dlg.start)
            overlay_clips.append(sub)

            # TTS voice audio
            tts_path = self.tts.get_audio_path(dlg, tts_cache)
            if tts_path and tts_path.exists():
                from moviepy.audio.io.AudioFileClip import AudioFileClip
                voice_clip = AudioFileClip(str(tts_path))
                max_dur = min(voice_clip.duration, duration - dlg.start)
                if max_dur > 0:
                    voice_clip = voice_clip.subclip(0, max_dur).set_start(dlg.start)
                    audio_tracks.append(voice_clip)

        # BGM
        if scene.bgm:
            print(f"  [{scene.id}] BGM: {Path(scene.bgm.file).name}")
            bgm_audio = self.bgm_mgr.build_bgm_clip(scene.bgm, duration)
            audio_tracks.append(bgm_audio)

        # Composite video
        final_clip = (
            CompositeVideoClip(overlay_clips, size=resolution)
            if len(overlay_clips) > 1 else clip
        )

        # Composite audio
        if len(audio_tracks) > 1:
            mixed = CompositeAudioClip(audio_tracks).set_duration(duration)
            final_clip = final_clip.set_audio(mixed)
        elif len(audio_tracks) == 1:
            final_clip = final_clip.set_audio(audio_tracks[0])

        return final_clip.set_duration(duration)

    def render(self, project: Project, output_path: Optional[str] = None):
        """Run the full render pipeline for all scenes and write the output file."""
        out = output_path or project.output

        print(f"\n🎬  VideoForge — {project.name}")
        print(f"    Output     : {out}")
        print(f"    Scenes     : {len(project.scenes)}")
        res = (854, 480) if self.preview else project.resolution
        print(f"    Resolution : {res[0]}x{res[1]}")
        print(f"    Preview    : {self.preview}\n")

        # Pre-generate all TTS audio up-front
        all_dialogues = [dlg for s in project.scenes for dlg in s.dialogue]
        tts_cache = {}
        if all_dialogues:
            print(f"⚙   Pre-generating TTS for {len(all_dialogues)} line(s)...")
            tts_cache = self.tts.generate_all(all_dialogues)
            print()

        # Render scenes
        rendered = []
        for i, scene in enumerate(project.scenes):
            print(f"🎞   Scene {i+1}/{len(project.scenes)}: {scene.id}")
            scene_clip = self.render_scene(scene, project, tts_cache)
            rendered.append((scene_clip, scene))
            print()

        # Concatenate with transitions
        print("🔗  Concatenating scenes...")
        final = self.composer.concatenate_with_transitions(
            rendered, project.resolution, project.fps
        )

        # Export
        print(f"💾  Writing: {out}\n")
        t0 = time.time()
        final.write_videofile(
            out,
            fps=project.fps,
            codec="libx264",
            audio_codec="aac",
            threads=4,
            preset="ultrafast" if self.preview else "medium",
            logger="bar",
        )
        print(f"\n✅  Done in {time.time() - t0:.1f}s  →  {out}")


# ─────────────────────────────────────────────────────────────────────────────
# Project Validator
# ─────────────────────────────────────────────────────────────────────────────

class ProjectValidator:
    """Validates a parsed Project and reports all errors / warnings."""

    def validate(self, project: Project) -> bool:
        errors, warnings = [], []

        for scene in project.scenes:
            if not Path(scene.clip).exists():
                errors.append(f"[{scene.id}] Clip not found: {scene.clip}")

            if scene.trim:
                s, e = scene.trim
                if s < 0 or e <= 0 or s >= e:
                    errors.append(f"[{scene.id}] Invalid trim range: [{s}, {e}]")

            for dlg in scene.dialogue:
                if not dlg.text.strip():
                    warnings.append(f"[{scene.id}] Empty dialogue text")
                if dlg.duration <= 0:
                    errors.append(f"[{scene.id}] Dialogue duration must be > 0")
                if dlg.start < 0:
                    errors.append(f"[{scene.id}] Dialogue start must be >= 0")

            if scene.bgm and not Path(scene.bgm.file).exists():
                errors.append(f"[{scene.id}] BGM file not found: {scene.bgm.file}")
            if scene.bgm and not (0.0 <= scene.bgm.volume <= 1.0):
                warnings.append(f"[{scene.id}] BGM volume {scene.bgm.volume} outside [0,1]")

        if errors:
            print("\n❌  Validation FAILED:")
            for e in errors:
                print(f"    ERROR: {e}")
        if warnings:
            print("\n⚠   Warnings:")
            for w in warnings:
                print(f"    WARN: {w}")
        if not errors:
            n_dlg = sum(len(s.dialogue) for s in project.scenes)
            n_bgm = sum(1 for s in project.scenes if s.bgm)
            print(f"\n✅  Project is valid!")
            print(f"    Scenes         : {len(project.scenes)}")
            print(f"    Dialogue lines : {n_dlg}")
            print(f"    Scenes with BGM: {n_bgm}")

        return len(errors) == 0


# ─────────────────────────────────────────────────────────────────────────────
# CLI  (Click)
# ─────────────────────────────────────────────────────────────────────────────

def main():
    click = _require("click", "click")

    @click.group()
    def cli():
        """
        \b
        VideoForge — Open-Source Python Video Composer
        ------------------------------------------------
        Compose clips · Add TTS dialogue · Sync BGM
        All defined in a single YAML/JSON project file.
        """
        pass

    # ── render ──────────────────────────────────────────────────────────────
    @cli.command()
    @click.argument("project_file", type=click.Path(exists=True))
    @click.option("--output", "-o", default=None, help="Override output file path.")
    @click.option(
        "--preview", is_flag=True, default=False,
        help="Fast low-res preview render (480p, ultrafast codec).",
    )
    def render(project_file, output, preview):
        """Render the video project defined in PROJECT_FILE (YAML or JSON)."""
        loader = SceneLoader()
        try:
            project = loader.load(project_file)
        except (FileNotFoundError, ValueError, KeyError) as e:
            click.echo(f"[ERROR] {e}", err=True)
            sys.exit(1)

        VideoForgeRenderer(preview=preview).render(project, output_path=output)

    # ── validate ─────────────────────────────────────────────────────────────
    @cli.command()
    @click.argument("project_file", type=click.Path(exists=True))
    def validate(project_file):
        """Validate a project YAML/JSON without rendering anything."""
        loader = SceneLoader()
        try:
            project = loader.load(project_file)
        except (FileNotFoundError, ValueError, KeyError) as e:
            click.echo(f"[ERROR] {e}", err=True)
            sys.exit(1)
        ok = ProjectValidator().validate(project)
        sys.exit(0 if ok else 1)

    # ── voices ───────────────────────────────────────────────────────────────
    @cli.command()
    @click.option("--filter", "lang_filter", default=None, help="Filter voices by locale (e.g. en-US)")
    def voices(lang_filter):
        """List all available edge-tts neural voices."""
        async def _list():
            edge_tts = _require("edge_tts", "edge-tts")
            vs = await edge_tts.list_voices()
            if lang_filter:
                vs = [v for v in vs if lang_filter.lower() in v["Locale"].lower()]
            click.echo(f"\n{'Voice Name':<42} {'Gender':<10} Locale")
            click.echo("─" * 72)
            for v in sorted(vs, key=lambda x: x["ShortName"]):
                click.echo(f"{v['ShortName']:<42} {v['Gender']:<10} {v['Locale']}")
            click.echo(f"\nTotal: {len(vs)} voice(s)")
        asyncio.run(_list())

    # ── example ──────────────────────────────────────────────────────────────
    @cli.command("example")
    @click.argument("output_dir", default=".", type=click.Path())
    def example(output_dir):
        """Generate an example project.yaml in OUTPUT_DIR to get started quickly."""
        template = """\
project:
  name: "My VideoForge Project"
  output: "output.mp4"
  resolution: [1920, 1080]
  fps: 30
  font: "Arial"

scenes:
  - id: "intro"
    clip: "clips/intro.mp4"        # Path to your video clip
    trim: [0, 10]                   # Use seconds 0–10 of the clip
    transition_in: "fade"
    transition_out: "fade"
    transition_duration: 0.5        # Fade duration in seconds
    dialogue:
      - text: "Welcome to my video!"
        start: 1.5                  # Appears 1.5s into the scene
        duration: 3.0               # Shown for 3 seconds
        voice: "en-US-AriaNeural"   # edge-tts voice name
        position: "bottom"          # top | center | bottom
        font_size: 52
        color: "#FFFFFF"
        background: true            # Semi-transparent background box
    bgm:
      file: "bgm/intro_music.mp3"
      volume: 0.35                  # 0.0 – 1.0
      fade_in: 1.0
      fade_out: 1.5
      loop: false

  - id: "chapter1"
    clip: "clips/scene1.mp4"
    trim: [0, 20]
    transition_in: "cut"
    transition_out: "fade"
    dialogue:
      - text: "The adventure begins here."
        start: 2.0
        duration: 4.0
        voice: "en-GB-RyanNeural"
        position: "bottom"
        font_size: 46
        color: "#FFE066"
        background: true
      - text: "Follow the path ahead."
        start: 8.0
        duration: 3.0
        voice: "en-GB-RyanNeural"
        position: "top"
        font_size: 40
        color: "#FFFFFF"
        background: true
    bgm:
      file: "bgm/adventure.mp3"
      volume: 0.3
      fade_in: 0.5
      fade_out: 1.0
      loop: true
"""
        out = Path(output_dir) / "example_project.yaml"
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        out.write_text(template, encoding="utf-8")
        click.echo(f"✅  Written: {out}")
        click.echo("\nNext steps:")
        click.echo("  1. Put your video clips in a 'clips/' folder")
        click.echo("  2. Put your BGM audio files in a 'bgm/' folder")
        click.echo("  3. python videoforge.py validate example_project.yaml")
        click.echo("  4. python videoforge.py render   example_project.yaml")

    cli()


if __name__ == "__main__":
    main()
