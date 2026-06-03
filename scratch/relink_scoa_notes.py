import os
import json
import re
from pathlib import Path

def relink_existing():
    project_root = Path(__file__).resolve().parent.parent
    vault_path = project_root / "vault"
    index_file = vault_path / "brain_index.json"
    
    if not index_file.exists():
        print("Error: brain_index.json not found.")
        return
        
    try:
        with open(index_file, "r", encoding="utf-8") as f:
            idx = json.load(f)
            notes_data = idx.get("notes", {})
    except Exception as e:
        print(f"Error reading index: {e}")
        return
        
    print(f"Loaded {len(notes_data)} notes from index.")
    
    # Find all SCoA files in vault/ideas, vault/skills, vault/journal
    scoa_files = list(vault_path.glob("**/scoa-debate-*.md"))
    
    if not scoa_files:
        print("No SCoA files found in vault.")
        return
        
    for file_path in scoa_files:
        print(f"\nProcessing: {file_path.name}")
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                
            # Extract title from frontmatter or text
            title_match = re.search(r'title:\s*"(?:Debate SCoA:|SCoA Debate:)\s*(.+?)"', content)
            title = title_match.group(1).strip() if title_match else ""
            
            # Find matches
            auto_links = []
            for note_key, note_info in notes_data.items():
                note_title = note_info.get("title", "")
                note_filename = Path(note_info.get("filename", "")).stem
                
                if note_filename == file_path.stem or (title and (note_title.lower() == title.lower() or note_filename.lower() == title.lower())):
                    continue
                
                match_found = False
                link_name = ""
                if len(note_title) > 3 and note_title.lower() in content.lower():
                    match_found = True
                    link_name = note_filename
                elif len(note_filename) > 3 and note_filename.lower() in content.lower():
                    match_found = True
                    link_name = note_filename
                    
                if match_found and link_name:
                    # Check if already linked
                    if f"[[{link_name}]]" not in content:
                        auto_links.append(link_name)
            
            # Ensure Welcome Hub is always linked to prevent orphan nodes
            if "[[Welcome Hub]]" not in content and file_path.name != "welcome.md":
                auto_links.append("Welcome Hub")

            if not auto_links:
                print("No new connections found for this file.")
                continue
                
            print(f"Found new connections: {auto_links}")
            
            # Append connections
            connections_section = "\n--- \n### Conexiones Auto-detectadas\n"
            if "### Conexiones Auto-detectadas" in content:
                # Add to existing section
                lines = content.split("\n")
                new_lines = []
                for line in lines:
                    new_lines.append(line)
                for link in set(auto_links):
                    new_lines.append(f"- [[{link}]]")
                new_content = "\n".join(new_lines)
            else:
                # Append a new section
                new_content = content.rstrip() + connections_section
                for link in set(auto_links):
                    new_content += f"- [[{link}]]\n"
                    
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
                
            print("Successfully updated file with connections!")
        except Exception as e:
            print(f"Error processing {file_path.name}: {e}")

if __name__ == "__main__":
    relink_existing()
