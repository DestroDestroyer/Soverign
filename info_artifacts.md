# Information on Artifacts Created

This file provides a catalog and detailed explanation of all artifacts generated during this session. These artifacts serve as the project's documentation, planning, and debugging tracking system.

## 1. High-Level Documentation & Planning

### [project_summary_report.md](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/project_summary_report.md)
* **Purpose:** Summarizes the entire project architecture, the distributed local/cloud video generation workflow, resolved bugs (over 38 issues cataloged), and status checks.
* **Role in Cloud Runs:** Represents the definitive source-of-truth document describing the current status and overall execution strategy of the pipeline.

### [implementation_plan.md](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/implementation_plan.md)
* **Purpose:** Defines the step-by-step layout for creating the video rebuilder script, debugging DaVinci Resolve GPU driver errors, and setting up the Kaggle API pipeline.
* **Role in Cloud Runs:** Details design decisions and provides review-gates before cloud execution commences.

### [task.md](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/task.md)
* **Purpose:** Living checklist for active/completed/pending tasks (e.g., setting up local scripts, installing plugins, running cloud jobs, and downloading results).

### [walkthrough.md](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/walkthrough.md)
* **Purpose:** Provides a validation and post-implementation summary of completed features, confirming they work as expected.

---

## 2. Technical Reviews & Deep Dives

### [expert_review.md](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/expert_review.md)
* **Purpose:** Architectural feedback from specialized code review subagents, detailing edge cases, error-handling bugs, and workflow bottlenecks.

### [line_review.md](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/line_review.md)
* **Purpose:** Line-by-line inspection of code syntax, module imports, and system path declarations to find logic flaws.

### [model_analysis.md](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/model_analysis.md)
* **Purpose:** Evaluation of various AI generation engines (Flux-schnell, SDXL, Pollinations, Edge-TTS) to determine the best visual style guidelines.

---

## 3. Scratch Scripts and Diagnostic Utilities
These temporary helper scripts reside in the `<appDataDir>\brain\<conversation-id>\scratch\` directory:

* **[check_resolve_dirs.py](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/check_resolve_dirs.py)**: Checks DaVinci Resolve script paths and system folders to locate the Reactor/Lua installations.
* **[count_drive_cache.py](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/count_drive_cache.py)**: Scans Google Drive cache folders to determine count of completed scene images and audios.
* **[download_kaggle.py](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/download_kaggle.py)**: Command automation utility to fetch intermediate files from Kaggle.
* **[download_log_from_drive.py](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/download_log_from_drive.py)**: Downloads the live execution logs of active cloud runs from Google Drive.
* **[download_resolve_plugins.py](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/download_resolve_plugins.py)**: Automates fetching of `Reactor-Installer.lua` and `AutoSubs` tools.
* **[extract_prompts.py](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/extract_prompts.py)**: Parses the wuxia novel script text file and extracts prompt instructions for image generation.
* **[list_drive_files.py](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/list_drive_files.py)**: Performs search queries on the Google Drive API to verify file synchronization.
* **[monitor_and_download.py](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/monitor_and_download.py)**: Background loop to download the completed video output from Kaggle.
* **[quick_status.py](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/quick_status.py)**: Queries Google Drive metadata to output progress percentage metrics.
* **[user_prompts.txt](file:///C:/Users/Akash/.gemini/antigravity/brain/4f4e2d64-f80b-406d-b578-4053d9d4f6ad/scratch/user_prompts.txt)**: Compiled list of clean scene prompts generated from parsing the novel script.
