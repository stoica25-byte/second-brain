import os
import re
import json
import secrets
import asyncio
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import frontmatter
import aiofiles
from debate_engine import run_debate_stream, get_api_key

app = FastAPI(title="Visual Second Brain API")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve paths relative to project root (parent of backend folder)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

CATEGORY_MAP = {
    "ideas": str(PROJECT_ROOT / "vault" / "ideas"),
    "errors": str(PROJECT_ROOT / "vault" / "errors"),
    "skills": str(PROJECT_ROOT / "vault" / "skills"),
    "journal": str(PROJECT_ROOT / "vault" / "journal"),
    "sources": str(PROJECT_ROOT / "vault" / "sources")
}

VAULT_DIR = (PROJECT_ROOT / "vault").resolve()
WIKILINK_REGEX = re.compile(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]')
write_lock = asyncio.Lock()
TOKEN_FILE = (PROJECT_ROOT / ".env").resolve()

# Ensure subdirectories exist
for path in CATEGORY_MAP.values():
    Path(path).mkdir(parents=True, exist_ok=True)
(PROJECT_ROOT / "vault" / "templates").mkdir(parents=True, exist_ok=True)

# Generate or load X-Ingest-Token
def get_ingest_token() -> str:
    if TOKEN_FILE.exists():
        with open(TOKEN_FILE, "r") as f:
            for line in f:
                if line.startswith("INGEST_TOKEN="):
                    return line.strip().split("=", 1)[1]
    
    # Generate new token if not exists
    token = secrets.token_hex(24)
    with open(TOKEN_FILE, "w") as f:
        f.write(f"INGEST_TOKEN={token}\n")
    print(f"Generated new secure INGEST_TOKEN: {token}")
    return token

INGEST_TOKEN = get_ingest_token()

# Models
class NoteUpdate(BaseModel):
    title: str
    content: str
    tags: List[str] = []
    status: Optional[str] = ""
    source_type: Optional[str] = ""
    source_url: Optional[str] = ""

class IngestPayload(BaseModel):
    title: str
    content: str
    source_type: str
    source_url: Optional[str] = ""
    tags: List[str] = []

# Helper: Clean filenames
def sanitize_filename(name: str) -> str:
    # Remove characters not allowed in filenames
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    # Replace spaces and multiple dashes with a single space
    clean = re.sub(r'\s+', " ", clean).strip()
    return clean

# Helper: Secure Path Verification
def get_secure_path(category: str, filename: str) -> Path:
    if category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    sanitized_name = sanitize_filename(filename)
    if not sanitized_name.endswith(".md"):
        sanitized_name = f"{sanitized_name}.md"
        
    category_dir = Path(CATEGORY_MAP[category]).resolve()
    target_path = (category_dir / sanitized_name).resolve()
    
    # Check for path traversal
    if not target_path.is_relative_to(VAULT_DIR):
        raise HTTPException(status_code=400, detail="Access denied: path traversal detected")
        
    return target_path

# Helper: Rebuild Index JSON
async def rebuild_index_internal() -> dict:
    notes = {}
    title_to_metadata = {}
    
    # First pass: Index note metadata
    for category, folder_path in CATEGORY_MAP.items():
        folder = Path(folder_path)
        for file_path in folder.glob("**/*.md"):
            if not file_path.is_file():
                continue
            if "templates" in file_path.parts:
                continue
            try:
                post = frontmatter.load(file_path)
                content = post.content
                
                title = post.get("title")
                if not title:
                    h1_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
                    if h1_match:
                        title = h1_match.group(1).strip()
                    else:
                        title = file_path.stem
                
                rel_path = file_path.relative_to(VAULT_DIR).as_posix()
                
                title_to_metadata[title.lower()] = {
                    "title": title,
                    "category": category,
                    "filename": file_path.name,
                    "rel_path": rel_path
                }
                
                # Dynamic summary
                summary = post.get("summary") or post.get("description")
                if not summary:
                    clean_text = re.sub(r'[#*`_\-\[\]]', '', content)
                    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                    summary = clean_text[:120] + "..." if len(clean_text) > 120 else clean_text
                
                notes[title] = {
                    "title": title,
                    "category": category,
                    "filename": file_path.name,
                    "path": rel_path,
                    "tags": post.get("tags") or [],
                    "summary": summary,
                    "created": str(post.get("created") or ""),
                    "updated": str(post.get("updated") or ""),
                    "status": post.get("status") or "",
                    "source_type": post.get("source_type") or "",
                    "source_url": post.get("source_url") or "",
                    "raw_links": [],
                    "links": [],
                    "backlinks": []
                }
                
                # Extract links
                links_found = WIKILINK_REGEX.findall(content)
                raw_links = [link[0].strip() for link in links_found]
                notes[title]["raw_links"] = list(set(raw_links))
                
            except Exception as e:
                print(f"Error parsing {file_path}: {e}")
                
    # Second pass: Resolve links and backlinks
    for note_title, note_data in notes.items():
        resolved_links = []
        for raw_link in note_data["raw_links"]:
            target_key = raw_link.lower()
            if target_key in title_to_metadata:
                resolved_title = title_to_metadata[target_key]["title"]
                resolved_links.append(resolved_title)
                if resolved_title in notes and note_title not in notes[resolved_title]["backlinks"]:
                    notes[resolved_title]["backlinks"].append(note_title)
            else:
                # Store unresolved (broken) links for visual visualization/creation
                resolved_links.append(raw_link)
        note_data["links"] = list(set(resolved_links))
        
    # Compile graph links
    graph_links = []
    for source_title, note_data in notes.items():
        for target_title in note_data["links"]:
            graph_links.append({
                "source": source_title,
                "target": target_title
            })
            
    index_data = {
        "notes": notes,
        "graph": {
            "nodes": [
                {
                    "id": note["title"],
                    "title": note["title"],
                    "category": note["category"],
                    "tags": note["tags"],
                    "summary": note["summary"],
                    "created": note["created"],
                    "updated": note["updated"],
                    "status": note["status"],
                    "path": note["path"]
                }
                for note in notes.values()
            ],
            "links": graph_links
        }
    }
    
    # Save index
    index_file = VAULT_DIR / "brain_index.json"
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)
        
    return index_data

# Git Helpers
def run_git_command(args: List[str]) -> tuple:
    try:
        result = subprocess.run(
            ["git"] + args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            cwd=".",
            errors="ignore"
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except Exception as e:
        return -1, "", str(e)

# --- Endpoints ---

@app.get("/api/index")
async def get_index():
    async with write_lock:
        index_file = VAULT_DIR / "brain_index.json"
        if not index_file.exists():
            return await rebuild_index_internal()
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return await rebuild_index_internal()

@app.post("/api/index/rebuild")
async def rebuild_index():
    async with write_lock:
        return await rebuild_index_internal()

@app.get("/api/notes/{category}/{filename}")
async def get_note(category: str, filename: str):
    file_path = get_secure_path(category, filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Note not found")
    
    try:
        post = frontmatter.load(file_path)
        return {
            "title": post.get("title") or file_path.stem,
            "content": post.content,
            "category": category,
            "tags": post.get("tags") or [],
            "status": post.get("status") or "",
            "source_type": post.get("source_type") or "",
            "source_url": post.get("source_url") or "",
            "created": str(post.get("created") or ""),
            "updated": str(post.get("updated") or ""),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Read error: {e}")

@app.post("/api/notes/{category}/{filename}")
async def create_or_update_note(category: str, filename: str, note_data: NoteUpdate):
    file_path = get_secure_path(category, filename)
    
    async with write_lock:
        # Load or create metadata
        post = frontmatter.Post("")
        if file_path.exists():
            try:
                post = frontmatter.load(file_path)
            except Exception:
                pass
        
        # Apply changes
        post.content = note_data.content
        post.metadata["title"] = note_data.title
        post.metadata["category"] = category
        post.metadata["tags"] = note_data.tags
        post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
        if "created" not in post.metadata or not post.metadata["created"]:
            post.metadata["created"] = datetime.now().strftime("%Y-%m-%d")
            
        if note_data.status:
            post.metadata["status"] = note_data.status
        if note_data.source_type:
            post.metadata["source_type"] = note_data.source_type
        if note_data.source_url:
            post.metadata["source_url"] = note_data.source_url
            
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(frontmatter.dumps(post))
            # Refresh index
            await rebuild_index_internal()
            return {"status": "success", "path": file_path.name}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Write error: {e}")

@app.delete("/api/notes/{category}/{filename}")
async def delete_note(category: str, filename: str):
    file_path = get_secure_path(category, filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Note not found")
        
    async with write_lock:
        try:
            file_path.unlink()
            await rebuild_index_internal()
            return {"status": "success"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Delete error: {e}")

# Ingestion API (MCP)
@app.post("/api/ingest", status_code=201)
async def ingest_note(payload: IngestPayload, authorization: Optional[str] = Header(None), request: Request = None):
    # Verify authentication token
    token = authorization or ""
    if token.startswith("Bearer "):
        token = token.split(" ", 1)[1]
        
    if token != INGEST_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid X-Ingest-Token")
        
    # Standardize content with automatic title and category
    category = "sources"
    filename = f"{payload.title}.md"
    file_path = get_secure_path(category, filename)
    
    async with write_lock:
        # Load existing index to find titles for auto-linking
        index_file = VAULT_DIR / "brain_index.json"
        existing_titles = []
        if index_file.exists():
            try:
                with open(index_file, "r", encoding="utf-8") as f:
                    index_data = json.load(f)
                    existing_titles = list(index_data.get("notes", {}).keys())
            except Exception:
                pass
        
        # Scrape content for auto connections
        content = payload.content
        auto_links = []
        for ext_title in existing_titles:
            # Skip short words and case-insensitive check
            if len(ext_title) > 3 and ext_title.lower() != payload.title.lower():
                # Word boundary check
                pattern = re.compile(rf'\b{re.escape(ext_title)}\b', re.IGNORECASE)
                if pattern.search(content):
                    auto_links.append(ext_title)
                    
        # Append connections if found
        if auto_links:
            connection_block = "\n\n--- \n## Auto-detected Connections\n"
            for link in set(auto_links):
                connection_block += f"- [[{link}]]\n"
            content += connection_block

        # Create frontmatter post
        post = frontmatter.Post(content)
        post.metadata["title"] = payload.title
        post.metadata["category"] = category
        post.metadata["source_type"] = payload.source_type
        post.metadata["source_url"] = payload.source_url or ""
        post.metadata["status"] = "unread" # Starts in Inbox curation queue
        post.metadata["tags"] = payload.tags or ["mcp-ingest"]
        post.metadata["created"] = datetime.now().strftime("%Y-%m-%d")
        post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
        
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(frontmatter.dumps(post))
            await rebuild_index_internal()
            return {"status": "success", "title": payload.title, "category": category}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ingestion write error: {e}")

@app.post("/api/notes/promote/{category}/{filename}")
async def promote_note(category: str, filename: str, target: NoteUpdate):
    # Move source file to ideas or skills
    source_path = get_secure_path(category, filename)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source note not found")
        
    target_category = target.category if hasattr(target, 'category') else "ideas"
    if target_category not in ["ideas", "skills"]:
         target_category = "ideas"
         
    target_path = get_secure_path(target_category, filename)
    
    async with write_lock:
        try:
            # Parse source file
            post = frontmatter.load(source_path)
            post.metadata["category"] = target_category
            post.metadata["status"] = "read" # Clear Inbox status
            post.metadata["tags"] = target.tags
            post.metadata["title"] = target.title
            post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
            post.content = target.content
            
            # Delete original
            source_path.unlink()
            
            # Write to new path
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(frontmatter.dumps(post))
                
            await rebuild_index_internal()
            return {"status": "success", "new_category": target_category, "path": target_path.name}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Promotion failed: {e}")

# Git Integrations
@app.get("/api/git/status")
async def get_git_status():
    ret_remote, remote_out, _ = run_git_command(["remote", "get-url", "origin"])
    has_remote = (ret_remote == 0)
    
    ret_status, status_out, _ = run_git_command(["status", "--porcelain"])
    has_local_changes = bool(status_out.strip())
    
    branch = "main"
    if has_remote:
        _, branch_out, _ = run_git_command(["branch", "--show-current"])
        branch = branch_out.strip() or "main"
        
    return {
        "has_remote": has_remote,
        "remote_url": remote_out if has_remote else "",
        "has_local_changes": has_local_changes,
        "branch": branch,
        "status_summary": status_out
    }

@app.post("/api/git/sync")
async def git_sync():
    # 1. Check remote
    ret_remote, remote_out, _ = run_git_command(["remote", "get-url", "origin"])
    if ret_remote != 0:
        # No remote, just commit locally!
        run_git_command(["add", "."])
        ret_status, status_out, _ = run_git_command(["status", "--porcelain"])
        if not status_out.strip():
            return {"status": "success", "message": "No changes to back up. Link a GitHub remote to sync online."}
        
        ret_commit, _, _ = run_git_command(["commit", "-m", "Brain Sync: Local auto-save"])
        if ret_commit == 0:
            return {"status": "success", "message": "Saved changes locally! Link a GitHub repository to back up online."}
        return {"status": "error", "message": "Failed to commit local changes."}

    # Remote exists
    branch = "main"
    _, branch_out, _ = run_git_command(["branch", "--show-current"])
    branch = branch_out.strip() or "main"
    
    async with write_lock:
        # 2. Stage and commit local changes
        run_git_command(["add", "."])
        ret_status, status_out, _ = run_git_command(["status", "--porcelain"])
        if status_out.strip():
            # Commit local edits
            run_git_command(["commit", "-m", f"Brain Sync: Updates on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"])
            
        # 3. Pull rebase
        ret_pull, pull_stdout, pull_stderr = run_git_command(["pull", "--rebase", "origin", branch])
        if ret_pull != 0:
            # CONFLICT detected
            # Read status to find unmerged files
            _, conflict_out, _ = run_git_command(["status", "--porcelain"])
            conflicting_files = []
            for line in conflict_out.splitlines():
                if line.startswith("UU ") or line.startswith("U ") or line.startswith("AA "):
                    parts = line.strip().split(" ", 1)
                    if len(parts) > 1:
                        conflicting_files.append(parts[1].strip())
            
            # Abort rebase to safe state
            run_git_command(["rebase", "--abort"])
            
            if not conflicting_files:
                return {
                    "status": "error", 
                    "message": f"Sync failed during pull. Network error or remote conflict: {pull_stderr or pull_stdout}"
                }
            
            # Fetch remote origin first
            run_git_command(["fetch", "origin"])
            
            # Process duplicate conflict files
            conflicts_created = []
            for file_path_str in conflicting_files:
                file_path = Path(file_path_str)
                if file_path.exists() and file_path.is_relative_to(VAULT_DIR):
                    try:
                        # Read current local state
                        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                            local_content = await f.read()
                            
                        # Save local content as conflict copy
                        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M")
                        conflict_filename = f"{file_path.stem} (Sync Conflict {timestamp}){file_path.suffix}"
                        conflict_path = file_path.parent / conflict_filename
                        
                        async with aiofiles.open(conflict_path, "w", encoding="utf-8") as f:
                            await f.write(local_content)
                            
                        # Overwrite active file with remote origin version
                        run_git_command(["checkout", f"origin/{branch}", "--", file_path_str])
                        conflicts_created.append(file_path.name)
                    except Exception as e:
                        print(f"Error handling conflict duplicate: {e}")
            
            # Re-commit the changes: stages the checkout values and the new conflict files
            run_git_command(["add", "."])
            run_git_command(["commit", "-m", "Brain Sync: Isolated conflict duplicate files"])
            
            # Pull rebase again (should succeed since local files match remote)
            ret_pull_2, _, _ = run_git_command(["pull", "--rebase", "origin", branch])
            if ret_pull_2 != 0:
                 return {"status": "error", "message": "Failed to pull even after isolating conflict files."}
                 
            # Push changes
            ret_push, _, push_err = run_git_command(["push", "origin", branch])
            await rebuild_index_internal()
            
            return {
                "status": "conflict",
                "message": f"Conflict resolved: {', '.join(conflicts_created)} had conflicting updates. We kept the remote cloud version and saved your local version as duplicate copies for you to review.",
                "conflicts": conflicts_created
            }
            
        # Pull succeeded normally, now push local commits
        ret_push, _, push_err = run_git_command(["push", "origin", branch])
        if ret_push != 0:
            return {"status": "error", "message": f"Committed locally, but push failed: {push_err}"}
            
        await rebuild_index_internal()
        return {"status": "success", "message": "Vault successfully synced to GitHub!"}

@app.get("/api/settings")
async def get_settings():
    return {
        "ingest_token": INGEST_TOKEN
    }

@app.get("/api/debate/stream")
async def api_debate_stream(proposal: str, category: str = "ideas"):
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY not configured in backend/.env")
        
    async def sse_generator():
        try:
            async for event in run_debate_stream(proposal, api_key, category):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")

# Serve Frontend static files
# Resolves in order: api endpoints above take precedence, then files in static directory
app.mount("/", StaticFiles(directory=str(PROJECT_ROOT / "frontend"), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    # Bind strictly to local loopback interface for safety
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
