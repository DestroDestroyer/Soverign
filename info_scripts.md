# Information on Python Scripts Created

This file provides details about the purpose, location, and functionality of all Python scripts developed for the Heavenly Rebellion video project.

## 1. Cloud-Targeted Execution Pipeline

### [colab_pipeline.py](file:///C:/Ai/project/colab_pipeline.py)
* **Description:** The core script designed to execute in high-performance cloud environments (Google Colab or Kaggle).
* **Capabilities:** 
  - Downloads wuxia scene assets (images, audio narration) from Google Drive.
  - Fits and enhances frames to `1920x1080` using Pillow.
  - Computes and applies a dynamic Ken Burns zoom/pan effect (with out-of-bound protections to prevent crashes).
  - Renders individual scene MP4 files in parallel (utilizing GPU acceleration via `h264_nvenc` if detected, otherwise falling back to CPU `libx264`).
  - Concatenates clips and mixes background music (BGM) with active volume attenuation and compressor filters.
  - Uploads the final output file `Heavenly_Rebellion_Book1_1Hour_Smooth.mp4` to Google Drive and sets a `DONE.flag` file.

### [story_expander.py](file:///C:/Ai/project/story_expander.py)
* **Description:** A metadata database containing scene expansions for the wuxia novel.
* **Capabilities:** Contains descriptive scene metadata, visual cues, and image prompts for the intro and all 101 scenes in the novel, helping the image generation model create consistent wuxia concept art.

---

## 2. Local Orchestration & Control

### [run_kaggle.py](file:///C:/Ai/project/run_kaggle.py)
* **Description:** The orchestrator script that manages the cloud execution cycle on Kaggle.
* **Capabilities:**
  - Moves `kaggle.json` credentials from the local Downloads folder to `.kaggle/` folder.
  - Automatically compiles a Jupyter notebook (`heavenly_rebellion_kaggle.ipynb`).
  - Injects `colab_pipeline.py`, `story_expander.py`, credentials, and wuxia scripts directly into the notebook.
  - Pushes the notebook to Kaggle to trigger headless cloud execution.
  - Monitors execution status (polling status via Kaggle API) and automatically downloads the finished output video to the local Windows Desktop.

### [rebuild_video_locally.py](file:///C:/Ai/project/rebuild_video_locally.py)
* **Description:** The local fallback video generator designed specifically for the user's Ryzen 3 3250U laptop.
* **Capabilities:**
  - Performs CPU-only video compilation, bypassing DaVinci Resolve GPU driver blockers.
  - Syncs completed assets (images/audios) from Google Drive.
  - Limits parallel rendering to `max_workers=2` to prevent CPU overheating and system freezing.
  - Applies identical Ken Burns pan/zoom motions and BGM audio mixing, exporting the video directly to the Desktop.

---

## 3. Legacy Iterations (Preserved)
* **[videoforge.py](file:///C:/Ai/project/videoforge.py)**: Original prototype of the video generator.
* **[videoforge_elite.py](file:///C:/Ai/project/videoforge_elite.py)**: Version using MoviePy, preserved but replaced due to memory leaks and GPU dependency.
* **[videoforge_novel_edition.py](file:///C:/Ai/project/videoforge_novel_edition.py)**: Prototype for parsing wuxia novels.
