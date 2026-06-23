# Information on MCP Tools Used

This file documents the Model Context Protocol (MCP) servers and tools leveraged throughout this project, including their roles and usage patterns.

## 1. Filesystem MCP (`filesystem`)
* **Tools Used:** `list_directory`, `read_text_file`, `write_file`, `get_file_info`, `search_files`
* **Tasks Accomplished:**
  - Explored and structured the local repository directory `C:\Ai\project`.
  - Audited code files (e.g., `colab_pipeline.py`, `colab_launcher.py`) to search for bugs.
  - Monitored the local `work/` directory size and verified output generation status.
  - Inspected the local task log files to ensure execution stability.

## 2. Git MCP (`git`)
* **Tools Used:** `git_status`, `git_diff`, `git_add`, `git_commit`
* **Tasks Accomplished:**
  - Tracked edits made to pipeline scripts.
  - Staged and committed code changes to maintain repository version history.
  - Synced modifications to Kaggle configurations and metadata scripts.

## 3. Playwright MCP (`playwright`)
* **Tools Used:** None (available for Web UI automation)
* **Status:** Pre-configured and ready if needed to automate browser interfaces, web dashboards, or online console settings.

## 4. Google Compute Engine & Spanner MCPs
* **Tools Available:** Instance creation, database management, resource tracking
* **Status:** Available but bypassed in favor of free cloud compute options (Google Colab and Kaggle API) to save user cloud costs.

## 5. Knowledge Lookup MCPs (`google-developer-knowledge`, `knowledge-catalog`)
* **Tools Available:** Search documents, answer queries
* **Status:** Used to clarify API updates, library version details, and correct syntax for Google Cloud / Drive API v3.
