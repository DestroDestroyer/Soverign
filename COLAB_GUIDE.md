# Heavenly Rebellion — Google Colab Cloud Pipeline
## How to Generate Your 1-Hour Video COMPLETELY FOR FREE in the Cloud

---

## What This System Does

```
Your Laptop                          Google Colab (Cloud)
─────────────                        ────────────────────────────────────
colab_launcher.py ──upload files──▶  Google Drive/HeavenlyRebellion/
     │                                    │
     │                                    ▼
     │               ┌────────── Colab Notebook (GPU enabled)
     │               │           • TTS audio  (15 concurrent)
     │               │           • 303 images (Pollinations AI)
     │               │           • 1080p frames
     │               │           • FFmpeg h264_nvenc GPU render
     │               │           • BGM mixing
     │               └──────────▶ Saves video to Drive
     │
     └──monitors Drive──▶ Detects DONE.flag
     └──auto-downloads──▶ Desktop/Heavenly_Rebellion_Book1_1Hour.mp4
```

**Your laptop does NO rendering at all. Colab does everything.**

---

## Files Created

| File | Location | Purpose |
|---|---|---|
| `colab_launcher.py` | `D:\Soverign\` | Run this on your laptop. Handles everything. |
| `colab_pipeline.py` | `D:\Soverign\` | Uploaded to Drive. Runs inside Colab. |
| `heavenly_rebellion_colab.ipynb` | `D:\Soverign\` | Colab notebook. Auto-generated and uploaded. |

---

## Step-by-Step Instructions

### Step 1 — Run the Launcher (One Command)

Open PowerShell and run:
```powershell
python D:\Soverign\colab_launcher.py
```

This will:
- Open your browser to **sign in with Google** (one-time only)
- Upload all files to Google Drive automatically
- Open the Colab notebook in your browser
- Start monitoring for the finished video

### Step 2 — Two Clicks in Colab

When the Colab notebook opens in your browser:
1. Click **Runtime** (top menu)
2. Click **Run All**  (or press `Ctrl + F9`)
3. If a warning pops up, click **Run Anyway**

That's it! Colab will do everything automatically.

### Step 3 — Walk Away

Your PowerShell window is now monitoring Google Drive.
When Colab finishes (30–90 minutes), the video automatically
downloads to your Desktop.

You will see this message in PowerShell when done:
```
✅ YOUR VIDEO IS ON YOUR DESKTOP!
   C:\Users\Akash\Desktop\Heavenly_Rebellion_Book1_1Hour.mp4
```

---

## Speed Comparison

| Task | Your Laptop | Google Colab (Free) |
|---|---|---|
| TTS Audio (101 scenes) | ~17 minutes | ~2 minutes |
| Image Generation | ~6–8 hours | ~2–3 hours |
| Video Rendering (1 hr) | ~3–4 hours | ~15–30 minutes |
| **TOTAL** | **~10–13 hours** | **~2.5–4 hours** |

Colab uses **NVIDIA T4 GPU** (16GB VRAM) for encoding — 
your laptop has no dedicated GPU at all.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Sign-in browser didn't open" | Run the launcher again — token may have expired |
| Colab shows "RAM limit exceeded" | Go to Runtime > Disconnect and Delete Runtime, then Run All again |
| "No GPU available" | Colab assigns GPU randomly. Still works, just slower. Try reconnecting. |
| Video not downloaded automatically | Manually download from Google Drive > HeavenlyRebellion folder |
| "DONE.flag not appearing" | Check Colab for errors in the last cell output |

---

## Google Drive Folder Structure (auto-created)

```
My Drive/
└── HeavenlyRebellion/
    ├── Heavenly_Rebellion_Book1_Script.txt   ← Novel script
    ├── story_expander.py                     ← Scene expansions
    ├── colab_pipeline.py                     ← Cloud pipeline
    ├── heavenly_rebellion_colab.ipynb        ← Colab notebook
    ├── master_audio.mp3                      ← BGM (if exists)
    ├── DONE.flag                             ← Written when finished
    ├── colab_pipeline.log                    ← Full run log
    └── Heavenly_Rebellion_Book1_1Hour.mp4   ← YOUR FINAL VIDEO
```

---

## Important Notes

- **Free Colab** gives you ~12 hours of session time per day
- **Google Drive** gives you 15 GB free — the final video is ~3–6 GB
- The launcher script will auto-re-authenticate if your token expires
- Run the launcher as many times as needed — it skips already-uploaded files
