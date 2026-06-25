import os
import re

input_file = r"C:\Users\Akash\.gemini\antigravity\brain\4b850ce7-17bf-4916-8610-18f34fd2108f\extracted_user_code.md"
output_dir = r"d:\Soverign\soverign-core\src"

with open(input_file, 'r', encoding='utf-8') as f:
    content = f.read()

# The full code block starts after "## Full Source Code (All Files in One Block)"
if "## Full Source Code (All Files in One Block)" in content:
    content = content.split("## Full Source Code (All Files in One Block)")[1]
    # Remove the ```typescript and ``` markdown
    content = content.replace("```typescript\n", "").replace("\n```\n", "")
else:
    print("Could not find the full source code section.")
    exit(1)

# Split based on the block
# // ================================
# // FILE: filename.ts
# // ================================
pattern = re.compile(r'// ================================\n// FILE: (.+?)\n// ================================')

parts = pattern.split(content)

if len(parts) > 1:
    for i in range(1, len(parts), 2):
        filename = parts[i].strip()
        code = parts[i+1].strip()
        
        os.makedirs(output_dir, exist_ok=True)
        file_path = os.path.join(output_dir, filename)
        
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, 'w', encoding='utf-8') as out:
            out.write(code + '\n')
        print(f"Written {file_path}")
else:
    print("No files found!")
