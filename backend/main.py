import os
import re
import json
import secrets
import sys
import asyncio

if sys.platform == 'win32':
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception as e:
        print(f"Error setting WindowsProactorEventLoopPolicy: {e}")

import subprocess
import time
import tempfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Header, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
import frontmatter
import aiofiles
from debate_engine import run_debate_stream, get_api_key, get_api_keys
from contextlib import asynccontextmanager

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

# Generate or load X-Ingest-Token without deleting pre-existing environment variables
def get_ingest_token() -> str:
    token = None
    lines = []
    if TOKEN_FILE.exists():
        try:
            with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                lines = f.readlines()
            for line in lines:
                if line.strip().startswith("INGEST_TOKEN="):
                    parts = line.strip().split("=", 1)
                    if len(parts) > 1:
                        token = parts[1].strip()
                        break
        except Exception as e:
            print(f"Error reading token file: {e}")

    if token:
        return token

    # Generate new token if not exists
    token = secrets.token_hex(24)
    token_found = False
    new_lines = []
    
    for line in lines:
        if line.strip().startswith("INGEST_TOKEN="):
            new_lines.append(f"INGEST_TOKEN={token}\n")
            token_found = True
        else:
            new_lines.append(line)
            
    if not token_found:
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines[-1] += "\n"
        new_lines.append(f"INGEST_TOKEN={token}\n")

    try:
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        print(f"Generated new secure INGEST_TOKEN: {token}")
    except Exception as e:
        print(f"Error saving new token: {e}")
        
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

class NotePromote(BaseModel):
    category: str = Field(..., description="Target category: ideas, skills, errors, journal, sources")
    title: str = Field(..., description="New title of the promoted note")
    content: str = Field(..., description="Markdown content body")
    tags: List[str] = Field(default_factory=list, description="Associated tags")
    source_type: Optional[str] = ""
    source_url: Optional[str] = ""

class NoteMetadataUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    source_type: Optional[str] = None
    source_url: Optional[str] = None

class ResolveConflictPayload(BaseModel):
    filepath: str            # relative path from vault, e.g. "ideas/test-note.md"
    resolution_type: str     # "local" | "remote" | "manual"
    manual_content: Optional[str] = None

class IngestPayload(BaseModel):
    title: str
    content: str
    source_type: str
    source_url: Optional[str] = ""
    tags: List[str] = []

class RenameRequest(BaseModel):
    category: str
    filename: str
    new_title: str

# Helper: Clean filenames
def sanitize_filename(name: str) -> str:
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = re.sub(r'\s+', " ", clean).strip()
    return clean

# Helper: Secure Path Verification supporting subdirectories
def get_secure_path(category: str, filepath: str) -> Path:
    if category not in CATEGORY_MAP:
        raise HTTPException(status_code=404, detail="Invalid category")
    
    parts = re.split(r'[/\\]', filepath)
    sanitized_parts = []
    for part in parts:
        if not part or part in (".", ".."):
            continue
        sanitized = sanitize_filename(part)
        if sanitized:
            sanitized_parts.append(sanitized)
            
    if not sanitized_parts:
        raise HTTPException(status_code=400, detail="Invalid file path")
        
    last_part = sanitized_parts[-1]
    if not last_part.endswith(".md"):
        sanitized_parts[-1] = f"{last_part}.md"
        
    category_dir = Path(CATEGORY_MAP[category]).resolve()
    target_path = category_dir
    for part in sanitized_parts:
        target_path = target_path / part
    target_path = target_path.resolve()
    
    # 1. Path Traversal Check
    if not target_path.is_relative_to(category_dir):
        raise HTTPException(status_code=400, detail="Access denied: path traversal detected")
        
    # 2. Symlink Verification Check
    current = target_path
    while current != VAULT_DIR:
        if current.is_symlink():
            raise HTTPException(status_code=400, detail="Access denied: symbolic link detected in path hierarchy")
        current = current.parent
        if current == current.parent:
            break
            
    return target_path

# Helper: Windows file-lock retry backoff wrapper
def write_file_blocking(target_path: Path, content: str):
    directory = target_path.parent
    directory.mkdir(parents=True, exist_ok=True)
    
    attempts = 3
    last_err = None
    for attempt in range(attempts):
        fd, temp_path_str = tempfile.mkstemp(dir=str(directory), suffix=".tmp", text=True)
        temp_path = Path(temp_path_str)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as tmp:
                tmp.write(content)
            # Safe replacement
            os.replace(temp_path, target_path)
            return
        except PermissionError as pe:
            last_err = pe
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            if attempt < attempts - 1:
                time.sleep(0.25 * (2 ** attempt))  # Exponential backoff (0.25s, 0.5s)
        except Exception as e:
            last_err = e
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            raise e
    if last_err:
        raise last_err

# Helper: Atomic Note Writes running in executor
async def save_note_atomically(target_path: Path, content: str):
    try:
        await asyncio.to_thread(write_file_blocking, target_path, content)
    except PermissionError as pe:
        # HTTP 423 Locked when file is blocked by Obsidian or another process
        raise HTTPException(status_code=423, detail=f"File is locked by another process (e.g. Obsidian or Git): {pe}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Atomic write failed: {e}")

# Helper: Fenced & Inline Code-Block Filtering
def strip_code_blocks(text: str) -> str:
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'`[^`\n]+`', '', text)
    return text

# Helper: Proximity Resolution for wiki links in duplicate titles
def resolve_proximity(source_rel_path: str, target_key: str, title_to_rel_paths: Dict[str, List[str]]) -> Optional[str]:
    candidates = title_to_rel_paths.get(target_key)
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
        
    source_parts = source_rel_path.split('/')
    best_cand = candidates[0]
    best_score = -1
    for cand in candidates:
        cand_parts = cand.split('/')
        score = 0
        for sp, cp in zip(source_parts[:-1], cand_parts[:-1]):
            if sp == cp:
                score += 1
            else:
                break
        if score > best_score:
            best_score = score
            best_cand = cand
    return best_cand

# Helper: 7-Day TTL decay cleaner for drafts
async def perform_draft_decay() -> int:
    now = datetime.now()
    decay_count = 0
    
    for category, folder_path in CATEGORY_MAP.items():
        folder = Path(folder_path)
        for file_path in folder.glob("**/*.md"):
            if "templates" in file_path.parts or "archive" in file_path.parts:
                continue
            try:
                post = frontmatter.load(file_path)
                status = post.get("status")
                if status == "draft" or status == "unread":
                    created_str = post.get("created")
                    if created_str:
                        created_date = datetime.strptime(created_str, "%Y-%m-%d")
                        if (now - created_date).days >= 7:
                            archive_dir = VAULT_DIR / "archive" / category
                            archive_dir.mkdir(parents=True, exist_ok=True)
                            
                            post.metadata["status"] = "archived"
                            post.metadata["archived_at"] = now.strftime("%Y-%m-%d")
                            
                            target_path = archive_dir / file_path.name
                            await save_note_atomically(target_path, frontmatter.dumps(post))
                            file_path.unlink()
                            decay_count += 1
            except Exception as e:
                print(f"Error processing TTL decay for {file_path.name}: {e}")
    return decay_count

# Helper: Rebuild Index JSON with multi-map mapping & proximity
def normalize_string(s: str) -> str:
    if not s:
        return ""
    import unicodedata
    # Normalize to NFD and remove diacritics
    s_norm = unicodedata.normalize('NFKD', s)
    s_clean = "".join([c for c in s_norm if not unicodedata.combining(c)])
    # Lowercase and keep only alphanumeric
    return re.sub(r'[^a-z0-9]', '', s_clean.lower())

async def rebuild_index_internal() -> dict:
    await perform_draft_decay()
    
    notes = {}
    title_to_rel_paths = {}  # Dict[str, List[str]] to support duplicate titles
    
    # Register helper for multiple keys mapping
    def register_path(key: str, rel_path: str):
        norm_key = normalize_string(key)
        if not norm_key:
            return
        if norm_key not in title_to_rel_paths:
            title_to_rel_paths[norm_key] = []
        if rel_path not in title_to_rel_paths[norm_key]:
            title_to_rel_paths[norm_key].append(rel_path)

    # First Pass: Register paths and construct title maps (excluding archives)
    for category, folder_path in CATEGORY_MAP.items():
        folder = Path(folder_path)
        for file_path in folder.glob("**/*.md"):
            if not file_path.is_file() or "templates" in file_path.parts or "archive" in file_path.parts:
                continue
            try:
                post = frontmatter.load(file_path)
                title = post.get("title")
                if not title:
                    h1_match = re.search(r'^#\s+(.+)$', post.content, re.MULTILINE)
                    if h1_match:
                        title = h1_match.group(1).strip()
                    else:
                        title = file_path.stem
                
                rel_path = file_path.relative_to(VAULT_DIR).as_posix()
                
                # Multi-map lists for collision management: match title, filename, and path
                register_path(title, rel_path)
                register_path(file_path.stem, rel_path)
                register_path(file_path.relative_to(VAULT_DIR).with_suffix("").as_posix(), rel_path)
                
                summary = post.get("summary") or post.get("description")
                if not summary:
                    clean_text = strip_code_blocks(post.content)
                    clean_text = re.sub(r'[#*`_\-\[\]]', '', clean_text)
                    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                    summary = clean_text[:120].strip() + "..." if len(clean_text) > 120 else clean_text
                
                notes[rel_path] = {
                    "id": rel_path,
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
            except Exception as e:
                print(f"Error indexing {file_path.name}: {e}")
                
    # Second Pass: WikiLink extraction & Proximity-based cross-resolution
    for rel_path, note_data in notes.items():
        file_path = VAULT_DIR / rel_path
        try:
            async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                content = await f.read()
            post = frontmatter.loads(content)
            
            # Clean content prevents matching links inside markdown code blocks
            clean_content = strip_code_blocks(post.content)
            
            links_found = WIKILINK_REGEX.findall(clean_content)
            raw_links = list(set([link[0].strip() for link in links_found]))
            note_data["raw_links"] = raw_links
            
            resolved_links = []
            for raw_link in raw_links:
                target_key = normalize_string(raw_link)
                resolved_path = resolve_proximity(rel_path, target_key, title_to_rel_paths)
                if resolved_path:
                    resolved_links.append(resolved_path)
                    # Register backlink
                    if resolved_path in notes and rel_path not in notes[resolved_path]["backlinks"]:
                        notes[resolved_path]["backlinks"].append(rel_path)
                else:
                    resolved_links.append(f"unresolved/{raw_link}")
            note_data["links"] = resolved_links
        except Exception as e:
            print(f"Error resolving links in {rel_path}: {e}")

            
    # Build D3 Graph Nodes & Links
    graph_nodes = []
    graph_links = []
    for rel_path, note in notes.items():
        graph_nodes.append({
            "id": note["id"],
            "title": note["title"],
            "category": note["category"],
            "tags": note["tags"],
            "summary": note["summary"],
            "created": note["created"],
            "updated": note["updated"],
            "status": note["status"],
            "path": note["path"]
        })
        for target_rel_path in note["links"]:
            if not target_rel_path.startswith("unresolved/"):
                graph_links.append({
                    "source": note["id"],
                    "target": target_rel_path
                })
                
    index_data = {
        "notes": notes,
        "graph": {
            "nodes": graph_nodes,
            "links": graph_links
        }
    }
    
    index_file = VAULT_DIR / "brain_index.json"
    await save_note_atomically(index_file, json.dumps(index_data, ensure_ascii=False, indent=2))
    return index_data

# Startup Integrity Scanner
async def verify_index_integrity():
    index_file = VAULT_DIR / "brain_index.json"
    if not index_file.exists():
        print("Index file not found. Rebuilding...")
        await rebuild_index_internal()
        return
        
    try:
        # Check if the existing index is using the old schema (keys are titles rather than paths)
        with open(index_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        notes_keys = list(data.get("notes", {}).keys())
        if notes_keys and not any("/" in k for k in notes_keys):
            print("Old title-based index schema detected. Rebuilding index...")
            await rebuild_index_internal()
            return

        index_mtime = os.path.getmtime(index_file)
        needs_rebuild = False
        
        for category, folder_path in CATEGORY_MAP.items():
            folder = Path(folder_path)
            for file_path in folder.glob("**/*.md"):
                if not file_path.is_file() or "templates" in file_path.parts or "archive" in file_path.parts:
                    continue
                if os.path.getmtime(file_path) > index_mtime:
                    needs_rebuild = True
                    print(f"File {file_path.name} was modified after index. Rebuilding index...")
                    break
            if needs_rebuild:
                break
                
        if needs_rebuild:
            await rebuild_index_internal()
        else:
            print("Index integrity verified. No rebuild needed.")
    except Exception as e:
        print(f"Error checking index integrity: {e}. Rebuilding...")
        await rebuild_index_internal()

# Background real-time folder scanner
async def file_watcher_background_task():
    print("Starting background folder watcher...")
    last_state = {}
    
    # Initialize baseline
    for category, folder_path in CATEGORY_MAP.items():
        folder = Path(folder_path)
        if folder.exists():
            for file_path in folder.glob("**/*.md"):
                if "templates" in file_path.parts or "archive" in file_path.parts:
                    continue
                try:
                    last_state[file_path.as_posix()] = os.path.getmtime(file_path)
                except Exception:
                    pass
                    
    while True:
        await asyncio.sleep(4.0)
        current_state = {}
        changed = False
        
        for category, folder_path in CATEGORY_MAP.items():
            folder = Path(folder_path)
            if folder.exists():
                for file_path in folder.glob("**/*.md"):
                    if "templates" in file_path.parts or "archive" in file_path.parts:
                        continue
                    try:
                        posix_path = file_path.as_posix()
                        mtime = os.path.getmtime(file_path)
                        current_state[posix_path] = mtime
                        if posix_path not in last_state or last_state[posix_path] != mtime:
                            changed = True
                    except Exception:
                        pass
                        
        if set(current_state.keys()) != set(last_state.keys()):
            changed = True
            
        if changed:
            print("Detected external filesystem changes, rebuilding index...")
            last_state = current_state
            async with write_lock:
                try:
                    await rebuild_index_internal()
                except Exception as e:
                    print(f"Error rebuilding index in background watcher: {e}")

def sync_run_git(args: List[str], env: dict, cwd: str) -> tuple:
    try:
        res = subprocess.run(
            ["git"] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=cwd,
            timeout=15.0
        )
        return res.returncode, res.stdout.decode("utf-8", errors="ignore").strip(), res.stderr.decode("utf-8", errors="ignore").strip()
    except subprocess.TimeoutExpired:
        return -2, "", "Git command timed out after 15 seconds"
    except Exception as e:
        return -1, "", str(e)

# Async Git Command Helper
async def run_git_command(args: List[str]) -> tuple:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_SSH_COMMAND"] = "ssh -o BatchMode=yes"
    try:
        return await asyncio.to_thread(sync_run_git, args, env, str(PROJECT_ROOT))
    except Exception as e:
        import traceback
        traceback.print_exc()
        return -1, "", str(e)


# Conflict isolation rename wrapper
def rename_file_safe_retry(src: Path, dst: Path):
    attempts = 3
    for attempt in range(attempts):
        try:
            os.rename(src, dst)
            return
        except PermissionError as pe:
            if attempt < attempts - 1:
                time.sleep(0.25 * (2 ** attempt))
            else:
                raise pe

# Lifespan manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Verify index integrity on startup
    await verify_index_integrity()
    # Start background watcher
    watcher_task = asyncio.create_task(file_watcher_background_task())
    yield
    # Clean up background tasks on shutdown
    watcher_task.cancel()
    try:
        await watcher_task
    except asyncio.CancelledError:
        pass

# Initialize app with lifespan handler
app = FastAPI(title="Visual Second Brain API", lifespan=lifespan)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/api/drafts")
async def get_drafts():
    drafts = []
    categories = ["ideas", "errors", "skills", "journal", "sources"]
    for cat in categories:
        cat_dir = VAULT_DIR / cat
        if not cat_dir.exists():
            continue
        for file_path in cat_dir.glob("**/*.md"):
            if "templates" in file_path.parts or "archive" in file_path.parts:
                continue
            try:
                post = frontmatter.load(file_path)
                status = post.get("status")
                if status == "draft" or status == "unread":
                    drafts.append({
                        "filename": file_path.relative_to(cat_dir).as_posix(),
                        "category": cat,
                        "title": post.get("title") or file_path.stem,
                        "created": str(post.get("created") or ""),
                        "updated": str(post.get("updated") or ""),
                        "status": status,
                        "path": file_path.relative_to(VAULT_DIR).as_posix(),
                        "content": post.content,
                        "tags": post.get("tags") or [],
                        "source_type": post.get("source_type") or "",
                        "source_url": post.get("source_url") or ""
                    })
            except Exception as e:
                print(f"Error loading draft {file_path.name}: {e}")
    return drafts

@app.get("/api/notes/{category}/{filepath:path}")
async def get_note(category: str, filepath: str):
    file_path = get_secure_path(category, filepath)
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

@app.post("/api/notes/{category}/{filepath:path}")
async def create_or_update_note(category: str, filepath: str, note_data: NoteUpdate):
    file_path = get_secure_path(category, filepath)
    
    async with write_lock:
        post = frontmatter.Post("")
        if file_path.exists():
            try:
                post = frontmatter.load(file_path)
            except Exception:
                pass
        
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
            await save_note_atomically(file_path, frontmatter.dumps(post))
            await rebuild_index_internal()
            return {"status": "success", "path": file_path.relative_to(VAULT_DIR).as_posix()}
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Write error: {e}")

@app.patch("/api/notes/metadata/{category}/{filepath:path}")
async def patch_note_metadata(category: str, filepath: str, data: NoteMetadataUpdate):
    source_path = get_secure_path(category, filepath)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Note not found")
        
    async with write_lock:
        try:
            post = frontmatter.load(source_path)
            
            # Extract current metadata values
            current_title = post.get("title") or source_path.stem
            current_category = category
            current_status = post.get("status") or ""
            
            new_title = data.title if data.title is not None else current_title
            new_category = data.category if data.category is not None else current_category
            new_status = data.status if data.status is not None else current_status
            
            if new_category not in CATEGORY_MAP:
                raise HTTPException(status_code=400, detail="Invalid target category")
                
            sanitized_title = sanitize_filename(new_title)
            new_filename = f"{sanitized_title}.md"
            
            # If renamed, keep target in source subdirectory structure relative to target category
            category_dir = Path(CATEGORY_MAP[category]).resolve()
            rel_sub_dir = source_path.parent.relative_to(category_dir)
            target_category_dir = Path(CATEGORY_MAP[new_category]).resolve()
            
            target_path = (target_category_dir / rel_sub_dir / new_filename).resolve()
            
            if target_path.resolve() != source_path.resolve() and target_path.exists():
                raise HTTPException(status_code=400, detail="A note with that title already exists in the target directory")
                
            # Update fields
            post.metadata["title"] = new_title
            post.metadata["category"] = new_category
            post.metadata["status"] = new_status
            post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
            
            if data.tags is not None:
                post.metadata["tags"] = data.tags
            if data.source_type is not None:
                post.metadata["source_type"] = data.source_type
            if data.source_url is not None:
                post.metadata["source_url"] = data.source_url
                
            await save_note_atomically(target_path, frontmatter.dumps(post))
            
            if target_path.resolve() != source_path.resolve():
                source_path.unlink()
                
                # If note was active and renamed, perform cascade WikiLink updates
                if current_status not in ("draft", "unread") and current_title != new_title:
                    escaped_old_title = re.escape(current_title)
                    WIKILINK_RENAME_PATTERN = re.compile(
                        rf'\[\[{escaped_old_title}(#[^|\]]+)?(\|([^\]]+))?\]\]', 
                        re.IGNORECASE
                    )
                    
                    for cat, cat_dir in CATEGORY_MAP.items():
                        folder = Path(cat_dir)
                        for file_path in folder.glob("**/*.md"):
                            if file_path.resolve() == target_path.resolve() or "archive" in file_path.parts:
                                continue
                            try:
                                async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                                    file_content = await f.read()
                                
                                if WIKILINK_RENAME_PATTERN.search(file_content):
                                    def replace_link(match):
                                        header = match.group(1) or ""
                                        alias_clause = match.group(2) or ""
                                        return f"[[{new_title}{header}{alias_clause}]]"
                                        
                                    new_file_content = WIKILINK_RENAME_PATTERN.sub(replace_link, file_content)
                                    await save_note_atomically(file_path, new_file_content)
                            except Exception as e:
                                print(f"Error propagating links in {file_path.name}: {e}")
                                
            await rebuild_index_internal()
            return {
                "status": "success",
                "category": new_category,
                "filename": target_path.name,
                "path": target_path.relative_to(VAULT_DIR).as_posix()
            }
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to patch metadata: {e}")

@app.delete("/api/notes/{category}/{filepath:path}")
async def delete_note(category: str, filepath: str):
    file_path = get_secure_path(category, filepath)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Note not found")
        
    try:
        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            content = await f.read()
        post = frontmatter.loads(content)
        deleted_title = post.get("title") or file_path.stem
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file metadata: {e}")
        
    async with write_lock:
        try:
            file_path.unlink()
            
            # Cascade Soft Unlinking across all subdirectories
            escaped_title = re.escape(deleted_title)
            DELETION_PATTERN = re.compile(
                rf'\[\[{escaped_title}(#[^|\]]+)?(\|([^\]]+))?\]\]', 
                re.IGNORECASE
            )
            
            for cat, cat_dir in CATEGORY_MAP.items():
                folder = Path(cat_dir)
                for other_file in folder.glob("**/*.md"):
                    if "archive" in other_file.parts:
                        continue
                    try:
                        async with aiofiles.open(other_file, "r", encoding="utf-8") as f:
                            file_content = await f.read()
                        
                        if DELETION_PATTERN.search(file_content):
                            def replace_deleted(match):
                                alias_text = match.group(3)
                                if alias_text:
                                    return alias_text
                                header_text = match.group(1) or ""
                                return f"{deleted_title}{header_text}"
                                
                            new_content = DELETION_PATTERN.sub(replace_deleted, file_content)
                            await save_note_atomically(other_file, new_content)
                    except Exception as e:
                         print(f"Error during soft-unlinking in {other_file.name}: {e}")
            
            await rebuild_index_internal()
            return {"status": "success", "message": f"Note '{deleted_title}' successfully deleted."}
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Delete error: {e}")

# Ingestion API (MCP)
@app.post("/api/ingest", status_code=201)
async def ingest_note(payload: IngestPayload, authorization: Optional[str] = Header(None), request: Request = None):
    token = authorization or ""
    if token.startswith("Bearer "):
        token = token.split(" ", 1)[1]
        
    if token != INGEST_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid X-Ingest-Token")
        
    category = "sources"
    filename = f"{payload.title}.md"
    file_path = get_secure_path(category, filename)
    
    async with write_lock:
        index_file = VAULT_DIR / "brain_index.json"
        existing_titles = []
        if index_file.exists():
            try:
                with open(index_file, "r", encoding="utf-8") as f:
                    index_data = json.load(f)
                    existing_titles = [note["title"] for note in index_data.get("notes", {}).values()]
            except Exception:
                pass
        
        content = payload.content
        auto_links = []
        for ext_title in existing_titles:
            if len(ext_title) > 3 and ext_title.lower() != payload.title.lower():
                pattern = re.compile(rf'\b{re.escape(ext_title)}\b', re.IGNORECASE)
                if pattern.search(content):
                    auto_links.append(ext_title)
                    
        if auto_links:
            connection_block = "\n\n--- \n## Auto-detected Connections\n"
            for link in set(auto_links):
                connection_block += f"- [[{link}]]\n"
            content += connection_block

        post = frontmatter.Post(content)
        post.metadata["title"] = payload.title
        post.metadata["category"] = category
        post.metadata["source_type"] = payload.source_type
        post.metadata["source_url"] = payload.source_url or ""
        post.metadata["status"] = "unread"
        post.metadata["tags"] = payload.tags or ["mcp-ingest"]
        post.metadata["created"] = datetime.now().strftime("%Y-%m-%d")
        post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
        
        try:
            await save_note_atomically(file_path, frontmatter.dumps(post))
            await rebuild_index_internal()
            return {"status": "success", "title": payload.title, "category": category}
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ingestion write error: {e}")

@app.post("/api/notes/promote/{category}/{filepath:path}")
async def promote_note(category: str, filepath: str, target: NotePromote):
    source_path = get_secure_path(category, filepath)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source note not found")
        
    target_category = target.category
    if target_category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Invalid target category")
         
    sanitized_title = sanitize_filename(target.title)
    target_filename = f"{sanitized_title}.md"
    
    # Place target in category directory matching the source relative sub-hierarchy if possible
    category_dir = Path(CATEGORY_MAP[category]).resolve()
    rel_sub_dir = source_path.parent.relative_to(category_dir)
    target_category_dir = Path(CATEGORY_MAP[target_category]).resolve()
    
    target_path = (target_category_dir / rel_sub_dir / target_filename).resolve()
    
    async with write_lock:
        try:
            post = frontmatter.load(source_path)
            
            if source_path.resolve() != target_path.resolve():
                source_path.unlink()
                
            post.content = target.content
            post.metadata["category"] = target_category
            post.metadata["status"] = "active"
            post.metadata["tags"] = target.tags
            post.metadata["title"] = target.title
            post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
            
            if target.source_type:
                post.metadata["source_type"] = target.source_type
            if target.source_url:
                post.metadata["source_url"] = target.source_url
            
            await save_note_atomically(target_path, frontmatter.dumps(post))
            await rebuild_index_internal()
            return {
                "status": "success", 
                "new_category": target_category, 
                "filename": target_filename,
                "path": target_path.relative_to(VAULT_DIR).as_posix()
            }
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Promotion failed: {e}")

@app.post("/api/notes/rename")
async def rename_note(payload: RenameRequest):
    old_path = get_secure_path(payload.category, payload.filename)
    if not old_path.exists():
        raise HTTPException(status_code=404, detail="Source file not found")
        
    try:
        async with aiofiles.open(old_path, "r", encoding="utf-8") as f:
            content = await f.read()
        post = frontmatter.loads(content)
        old_title = post.get("title") or old_path.stem
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

    new_filename = sanitize_filename(payload.new_title)
    if not new_filename.endswith(".md"):
        new_filename += ".md"
        
    # Place target in the same parent directory to preserve sub-hierarchies
    new_path = (old_path.parent / new_filename).resolve()
    
    if new_path.exists() and new_path.resolve() != old_path.resolve():
        raise HTTPException(status_code=400, detail="A note with that title already exists in the folder")

    async with write_lock:
        try:
            post.metadata["title"] = payload.new_title
            post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
            
            await save_note_atomically(new_path, frontmatter.dumps(post))
            if old_path.resolve() != new_path.resolve():
                old_path.unlink()
            
            # Cascade refactoring of WikiLinks with title updates
            escaped_old_title = re.escape(old_title)
            WIKILINK_RENAME_PATTERN = re.compile(
                rf'\[\[{escaped_old_title}(#[^|\]]+)?(\|([^\]]+))?\]\]', 
                re.IGNORECASE
            )
            
            for cat, cat_dir in CATEGORY_MAP.items():
                folder = Path(cat_dir)
                for file_path in folder.glob("**/*.md"):
                    if file_path.resolve() == new_path.resolve() or "archive" in file_path.parts:
                        continue
                    try:
                        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                            file_content = await f.read()
                        
                        if WIKILINK_RENAME_PATTERN.search(file_content):
                            def replace_link(match):
                                header = match.group(1) or ""
                                alias_clause = match.group(2) or ""
                                return f"[[{payload.new_title}{header}{alias_clause}]]"
                                
                            new_file_content = WIKILINK_RENAME_PATTERN.sub(replace_link, file_content)
                            await save_note_atomically(file_path, new_file_content)
                    except Exception as e:
                        print(f"Error propagating links in {file_path.name}: {e}")
            
            await rebuild_index_internal()
            return {
                "status": "success", 
                "new_path": new_path.relative_to(VAULT_DIR).as_posix(),
                "filename": new_filename
            }
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Cascade rename failed: {e}")

@app.get("/api/timeline")
async def get_timeline(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1),
    query: Optional[str] = Query(None),
    categories: Optional[str] = Query(None)  # comma-separated list e.g. "ideas,skills"
):
    # Determine which categories to include
    active_cats = ["ideas", "errors", "skills", "journal", "sources"]
    if categories:
        requested = [c.strip().lower() for c in categories.split(",") if c.strip()]
        if requested:
            active_cats = [c for c in active_cats if c in requested]

    search_terms = [t.strip().lower() for t in query.split() if t.strip()] if query else []

    events = []
    for cat in active_cats:
        cat_dir = VAULT_DIR / cat
        if not cat_dir.exists():
            continue
        for file_path in cat_dir.glob("**/*.md"):
            if "templates" in file_path.parts or "archive" in file_path.parts:
                continue
            try:
                async with aiofiles.open(file_path, mode="r", encoding="utf-8") as f:
                    content = await f.read()
                post = frontmatter.loads(content)
                status = post.get("status")
                if status != "draft" and status != "unread":
                    created_date = post.get("created", "")
                    title = post.get("title") or file_path.stem
                    tags = post.get("tags") or []
                    summary = post.get("summary") or post.get("description")
                    if not summary:
                        clean_text = strip_code_blocks(post.content)
                        clean_text = re.sub(r'[#*`_\-\[\]]', '', clean_text)
                        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                        summary = clean_text[:120].strip() + "..." if len(clean_text) > 120 else clean_text

                    # Full-text search filter
                    if search_terms:
                        searchable = " ".join([
                            title.lower(),
                            str(summary).lower(),
                            " ".join(str(t).lower() for t in tags),
                            post.content.lower()
                        ])
                        if not all(term in searchable for term in search_terms):
                            continue

                    events.append({
                        "title": title,
                        "category": cat,
                        "date": str(created_date),
                        "summary": str(summary),
                        "path": file_path.relative_to(VAULT_DIR).as_posix(),
                        "filename": file_path.name,
                        "content": post.content,
                        "tags": tags
                    })
            except Exception:
                continue

    events.sort(key=lambda x: x["date"], reverse=True)

    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_events = events[start_idx:end_idx]
    total_pages = max(1, (len(events) + limit - 1) // limit)

    return {
        "events": paginated_events,
        "total_pages": total_pages,
        "current_page": page,
        "total_count": len(events)
    }

@app.get("/api/stats")
async def get_stats():
    total_notes = 0
    active_notes = 0
    draft_notes = 0
    cat_distribution = {"ideas": 0, "errors": 0, "skills": 0, "journal": 0, "sources": 0}
    total_wiki_links = 0
    
    all_active_paths = set()
    links_map = {}
    title_to_rel_paths = {}
    
    for cat in cat_distribution.keys():
        cat_dir = VAULT_DIR / cat
        if not cat_dir.exists():
            continue
        for file_path in cat_dir.glob("**/*.md"):
            if "templates" in file_path.parts or "archive" in file_path.parts:
                continue
            try:
                post = frontmatter.load(file_path)
                status = post.get("status", "")
                title = post.get("title") or file_path.stem
                rel_path = file_path.relative_to(VAULT_DIR).as_posix()
                
                total_notes += 1
                cat_distribution[cat] += 1
                
                if status not in ("draft", "unread"):
                    active_notes += 1
                    all_active_paths.add(rel_path)
                    
                    title_lower = title.lower()
                    if title_lower not in title_to_rel_paths:
                        title_to_rel_paths[title_lower] = []
                    title_to_rel_paths[title_lower].append(rel_path)
                    
                    clean_content = strip_code_blocks(post.content)
                    found = WIKILINK_REGEX.findall(clean_content)
                    links = [item[0].strip().lower() for item in found]
                    links_map[rel_path] = links
                else:
                    draft_notes += 1
            except Exception:
                continue

    in_degrees = {p: 0 for p in all_active_paths}
    out_degrees = {p: 0 for p in all_active_paths}
    
    for source_path, target_titles in links_map.items():
        for target_title in target_titles:
            target_path = resolve_proximity(source_path, target_title, title_to_rel_paths)
            if target_path:
                if target_path in in_degrees:
                    in_degrees[target_path] += 1
                    out_degrees[source_path] += 1
                    total_wiki_links += 1

    orphan_count = sum(1 for p in all_active_paths if in_degrees[p] == 0 and out_degrees[p] == 0)
    
    density = 0.0
    N = len(all_active_paths)
    if N > 1:
        density = round(total_wiki_links / (N * (N - 1)), 4)
        
    return {
        "total_notes": total_notes,
        "active_notes": active_notes,
        "draft_notes": draft_notes,
        "category_distribution": cat_distribution,
        "total_connections": total_wiki_links,
        "orphan_count": orphan_count,
        "graph_density": density
    }

# Git Integrations
SYNC_LOCK_FILE = VAULT_DIR / ".git-sync.lock"

async def acquire_git_sync_lock() -> bool:
    if SYNC_LOCK_FILE.exists():
        if time.time() - os.path.getmtime(SYNC_LOCK_FILE) > 300:
            try:
                SYNC_LOCK_FILE.unlink()
            except Exception:
                pass
        else:
            return False
    try:
        with open(SYNC_LOCK_FILE, "x") as f:
            f.write(str(os.getpid()))
        return True
    except FileExistsError:
        return False

def release_git_sync_lock():
    if SYNC_LOCK_FILE.exists():
        try:
            SYNC_LOCK_FILE.unlink()
        except Exception:
            pass

async def wait_for_settled_files(settle_seconds: float = 3.0, poll_interval: float = 0.5) -> bool:
    start_time = time.time()
    max_wait = 10.0
    while time.time() - start_time < max_wait:
        recent_modifications = False
        now = time.time()
        for folder_path in CATEGORY_MAP.values():
            for file_path in Path(folder_path).glob("**/*.md"):
                if "templates" in file_path.parts or "archive" in file_path.parts:
                    continue
                try:
                    mtime = os.path.getmtime(file_path)
                    if now - mtime < settle_seconds:
                        recent_modifications = True
                        break
                except Exception:
                    continue
            if recent_modifications:
                break
        
        if not recent_modifications:
            return True
        await asyncio.sleep(poll_interval)
    return False

@app.get("/api/git/status")
async def get_git_status():
    ret_remote, remote_out, remote_err = await run_git_command(["remote", "get-url", "origin"])
    print(f"[GIT STATUS DEBUG] remote command: ret={ret_remote}, out={remote_out!r}, err={remote_err!r}")
    has_remote = (ret_remote == 0)
    
    ret_status, status_out, status_err = await run_git_command(["status", "--porcelain"])
    print(f"[GIT STATUS DEBUG] status command: ret={ret_status}, out={status_out!r}, err={status_err!r}")
    has_local_changes = bool(status_out.strip())
    
    branch = "main"
    if has_remote:
        ret_br, branch_out, branch_err = await run_git_command(["branch", "--show-current"])
        print(f"[GIT STATUS DEBUG] branch command: ret={ret_br}, out={branch_out!r}, err={branch_err!r}")
        branch = branch_out.strip() or "main"
        
    return {
        "has_remote": has_remote,
        "remote_url": remote_out if has_remote else "",
        "has_local_changes": has_local_changes,
        "branch": branch,
        "status_summary": status_out
    }

class SetRemotePayload(BaseModel):
    remote_url: str

@app.post("/api/git/set-remote")
async def set_git_remote(payload: SetRemotePayload):
    """Vinculates or updates the git remote 'origin' to the given URL."""
    remote_url = payload.remote_url.strip()
    if not remote_url:
        raise HTTPException(status_code=400, detail="remote_url cannot be empty")
    
    # Check if a remote already exists and remove it first
    ret_check, _, _ = await run_git_command(["remote", "get-url", "origin"])
    if ret_check == 0:
        # Remote exists – update it
        ret_set, _, set_err = await run_git_command(["remote", "set-url", "origin", remote_url])
    else:
        # No remote yet – add it
        ret_set, _, set_err = await run_git_command(["remote", "add", "origin", remote_url])
    
    if ret_set != 0:
        return {"status": "error", "message": f"Error al configurar el remoto: {set_err}"}
    
    return {"status": "success", "message": f"Remoto 'origin' configurado a: {remote_url}"}

@app.post("/api/git/sync")
async def git_sync():
    if not await acquire_git_sync_lock():
        raise HTTPException(status_code=409, detail="A sync operation is already in progress.")
        
    try:
        await wait_for_settled_files(settle_seconds=3.0)
        
        ret_remote, remote_out, _ = await run_git_command(["remote", "get-url", "origin"])
        if ret_remote != 0:
            async with write_lock:
                await run_git_command(["add", "."])
                ret_status, status_out, _ = await run_git_command(["status", "--porcelain"])
                if not status_out.strip():
                    return {"status": "success", "message": "No changes to back up. Link a GitHub remote to sync online."}
                
                ret_commit, _, _ = await run_git_command(["commit", "-m", "Brain Sync: Local auto-save"])
                if ret_commit == 0:
                    return {"status": "success", "message": "Saved changes locally! Link a GitHub repository to back up online."}
                return {"status": "error", "message": "Failed to commit local changes."}

        branch = "main"
        _, branch_out, _ = await run_git_command(["branch", "--show-current"])
        branch = branch_out.strip() or "main"
        
        async with write_lock:
            await run_git_command(["add", "."])
            ret_status, status_out, _ = await run_git_command(["status", "--porcelain"])
            if status_out.strip():
                await run_git_command(["commit", "-m", f"Brain Sync: Updates on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"])
                
            ret_pull, pull_stdout, pull_stderr = await run_git_command(["pull", "--rebase", "origin", branch])
            if ret_pull != 0:
                _, conflict_out, _ = await run_git_command(["status", "--porcelain"])
                conflicting_files = []
                for line in conflict_out.splitlines():
                    if line.startswith("UU ") or line.startswith("U ") or line.startswith("AA "):
                        parts = line.strip().split(" ", 1)
                        if len(parts) > 1:
                            conflicting_files.append(parts[1].strip())
                
                await run_git_command(["rebase", "--abort"])
                
                if not conflicting_files:
                    return {
                        "status": "error", 
                        "message": f"Sync failed during pull: {pull_stderr or pull_stdout}"
                    }
                
                await run_git_command(["fetch", "origin"])
                
                conflicts_created = []
                for file_path_str in conflicting_files:
                    file_path = Path(file_path_str)
                    if file_path.exists() and file_path.is_relative_to(VAULT_DIR):
                        try:
                            timestamp = datetime.now().strftime("%Y-%m-%d-%H%M")
                            conflict_filename = f"{file_path.stem} (Sync Conflict {timestamp}){file_path.suffix}"
                            conflict_path = file_path.parent / conflict_filename
                            
                            # Safe retry renaming for Windows locking
                            await asyncio.to_thread(rename_file_safe_retry, file_path, conflict_path)
                            conflicts_created.append(file_path.name)
                            
                            ret_chk, stdout_chk, stderr_chk = await run_git_command(
                                ["checkout", f"origin/{branch}", "--", file_path_str]
                            )
                            if ret_chk != 0:
                                print(f"Git checkout failed for {file_path_str}: {stderr_chk or stdout_chk}")
                        except Exception as e:
                            print(f"Error handling conflict duplicate for {file_path.name}: {e}")
                
                await run_git_command(["add", "."])
                await run_git_command(["commit", "-m", "Brain Sync: Isolated conflict duplicate files"])
                
                ret_pull_2, _, _ = await run_git_command(["pull", "--rebase", "origin", branch])
                if ret_pull_2 != 0:
                    return {"status": "error", "message": "Failed to pull even after isolating conflict files."}
                     
                ret_push, _, push_err = await run_git_command(["push", "origin", branch])
                await rebuild_index_internal()
                
                return {
                    "status": "conflict",
                    "message": f"Conflict resolved: conflict duplicate copies were created. Review conflict cards in Obsidian.",
                    "conflicts": conflicts_created
                }
                
            ret_push, _, push_err = await run_git_command(["push", "origin", branch])
            if ret_push != 0:
                return {"status": "error", "message": f"Committed locally, but push failed: {push_err}"}
                
            await rebuild_index_internal()
            return {"status": "success", "message": "Vault successfully synced to GitHub!"}
    finally:
        release_git_sync_lock()

@app.post("/api/git/resolve-conflict")
async def resolve_conflict_endpoint(payload: ResolveConflictPayload):
    parts = payload.filepath.split("/", 1)
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Invalid relative path format")
    category, filename = parts[0], parts[1]
    
    file_path = get_secure_path(category, filename)
    if not file_path.exists():
         raise HTTPException(status_code=404, detail="Target conflict file not found")
         
    async with write_lock:
        try:
            if payload.resolution_type == "local":
                await run_git_command(["add", str(file_path)])
            elif payload.resolution_type == "remote":
                _, branch_out, _ = await run_git_command(["branch", "--show-current"])
                branch_name = branch_out.strip() or "main"
                await run_git_command(["checkout", f"origin/{branch_name}", "--", str(file_path)])
            elif payload.resolution_type == "manual":
                if not payload.manual_content:
                    raise HTTPException(status_code=400, detail="Manual content body is missing")
                await save_note_atomically(file_path, payload.manual_content)
                await run_git_command(["add", str(file_path)])
            else:
                raise HTTPException(status_code=400, detail="Invalid resolution type")
                
            await run_git_command(["rebase", "--continue"])
            await rebuild_index_internal()
            return {
                "status": "success",
                "message": "Git merge conflict successfully resolved"
            }
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to reconcile git merge conflict: {str(e)}")

@app.get("/api/settings")
async def get_settings():
    return {
        "ingest_token": INGEST_TOKEN
    }

@app.get("/api/debate/stream")
async def api_debate_stream(proposal: str, category: str = "ideas"):
    keys = get_api_keys()
    if not keys.get("GEMINI_API_KEY") and not keys.get("OPENROUTER_API_KEY"):
        raise HTTPException(status_code=400, detail="Ni GEMINI_API_KEY ni OPENROUTER_API_KEY están configuradas en el archivo .env")
        
    async def sse_generator():
        try:
            async for event in run_debate_stream(proposal, keys, category):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")


# Serve Frontend static files
app.mount("/", StaticFiles(directory=str(PROJECT_ROOT / "frontend"), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
