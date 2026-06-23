import os

roles_to_patch = [
    '/root/.bun/install/global/node_modules/@usesoverign/brain/roles/personal-assistant.yaml',
    '/root/.bun/install/global/node_modules/@usesoverign/brain/roles/dev-lead.yaml'
]

patch_text = """
  UPGRADE INSTRUCTIONS & SYSTEM INTEGRATIONS:
  1. PROJECT RULES & CONTEXT: Always check for an `agents.md` or `.cursorrules` file at the root of the project you are working on (e.g., in `/root/.soverign/projects/`). Parse it to understand the tech stack, style guidelines, and design requirements, and follow it strictly.
  2. COMMUNITY SKILLS RESOURCE: You have access to a rich repository of community-curated developer skills at `/root/.soverign/projects/community-skills/`. Refer to individual skill folders (e.g. `python-pro/SKILL.md`, `nextjs-best-practices/SKILL.md`) to guide your coding decisions, security audits, and deployment pipeline creation.
  3. DEVELOPER REFERENCE TEMPLATES: Check reference repositories like `bulletproof-react`, `tailwindcss`, `ant-design`, `awesome-prompts` for blueprints.
  4. UNIVERSAL MCP INTEGRATION: You are fully integrated with the Model Context Protocol (MCP). Use `/mnt/c/Ai/project/soverign_integrations/mcp_client.py` to interface with MCP servers (e.g. tools, prompts, resources) dynamically.
  5. API MASTERY: Read the `/mnt/c/Ai/project/soverign_integrations/.env.soverign` file to access your API keys (OpenAI, Anthropic, Gemini, Composio). You are empowered to write Python or shell scripts to hit these APIs directly whenever your built-in tools are insufficient.
  6. OMNI-MODEL DELEGATION: If a task requires specialized reasoning (e.g., vision processing via Gemini, ultra-fast coding via Groq, complex reasoning via OpenAI o1), write scripts that query those external model APIs and parse the results back into your workspace. You are not limited to your host model.
  7. SYSTEM SELF-UPGRADE: Modify your own role descriptions (located in `/root/.bun/install/global/node_modules/@usesoverign/brain/roles/`) to adapt your instructions or append new tools permanently.
"""

def patch_role_file(wsl_path):
    if not os.path.exists(wsl_path):
        print(f"Error: Role file {wsl_path} does not exist.")
        return False
        
    with open(wsl_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if 'UNIVERSAL MCP INTEGRATION' in content:
        print(f"Role file {wsl_path} is already fully patched.")
        return True
        
    target = 'responsibilities:'
    if target not in content:
        print(f"Error: Could not find target '{target}' in {wsl_path}.")
        return False
        
    # Remove previous UPGRADE INSTRUCTIONS if they exist
    if 'UPGRADE INSTRUCTIONS & SYSTEM INTEGRATIONS:' in content:
        parts = content.split('UPGRADE INSTRUCTIONS & SYSTEM INTEGRATIONS:')
        content = parts[0] + target + parts[1].split(target)[1]
        
    parts = content.split(target)
    new_content = parts[0] + patch_text + "\n" + target + parts[1]
    
    with open(wsl_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print(f"Successfully fully patched {wsl_path}!")
    return True

if __name__ == '__main__':
    print("Starting Comprehensive Soverign integration patching...")
    success = True
    for r in roles_to_patch:
        if not patch_role_file(r):
            success = False
    if success:
        print("Soverign omni-integration upgrade completed successfully!")
    else:
        print("Some roles could not be fully patched.")
