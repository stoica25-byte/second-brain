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
from debate_engine import run_debate_stream, get_api_key, get_api_keys, get_semantic_links
from contextlib import asynccontextmanager

# Resolve paths relative to project root (parent of backend folder)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Cargar variables de entorno locales de forma nativa al inicio
def load_env_native():
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        os.environ[k.strip()] = v.strip()
        except Exception as e:
            print(f"Error loading .env file: {e}")

load_env_native()

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

class CapturePayload(BaseModel):
    title: str
    category: str
    content: str
    tags: List[str] = []
    status: str = "draft"


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
# @section: App-Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Verify index integrity on startup
    await verify_index_integrity()
    # Start background watcher
    watcher_task = asyncio.create_task(file_watcher_background_task())
    # Start Video Ingest worker and Telegram poller
    video_worker_task = asyncio.create_task(video_queue_worker())
    telegram_poller_task = asyncio.create_task(telegram_bot_poller())
    yield
    # Clean up background tasks on shutdown
    watcher_task.cancel()
    video_worker_task.cancel()
    telegram_poller_task.cancel()
    try:
        await asyncio.gather(watcher_task, video_worker_task, telegram_poller_task, return_exceptions=True)
    except Exception:
        pass
# @end: App-Lifespan

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
            
            # Auto-promote to active if a draft/unread note is moved to a main note category
            if current_status in ("draft", "unread") and new_category in ("ideas", "skills", "errors", "journal"):
                new_status = "active"
            
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

@app.post("/api/notes/capture")
async def capture_note(payload: CapturePayload):
    category = payload.category
    if category not in CATEGORY_MAP:
        raise HTTPException(status_code=400, detail="Categoría inválida")
        
    filename = sanitize_filename(payload.title)
    if not filename:
        raise HTTPException(status_code=400, detail="Título inválido")
        
    filepath = f"{filename}.md"
    file_path = get_secure_path(category, filepath)
    
    async with write_lock:
        base_name = filename
        counter = 1
        while file_path.exists():
            filepath = f"{base_name}-{counter}.md"
            file_path = get_secure_path(category, filepath)
            counter += 1
            
        post = frontmatter.Post(payload.content)
        post.metadata["title"] = payload.title
        post.metadata["category"] = category
        post.metadata["tags"] = payload.tags or []
        post.metadata["status"] = payload.status or "draft"
        post.metadata["created"] = datetime.now().strftime("%Y-%m-%d")
        post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
        
        try:
            await save_note_atomically(file_path, frontmatter.dumps(post))
            await rebuild_index_internal()
            return {"status": "success", "filepath": filepath, "category": category}
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al guardar la nota capturada: {e}")

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

    search_terms = [t.strip().lower().lstrip('#') for t in query.split() if t.strip()] if query else []

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
    
    def register_path(key: str, rel_path: str):
        norm_key = normalize_string(key)
        if not norm_key:
            return
        if norm_key not in title_to_rel_paths:
            title_to_rel_paths[norm_key] = []
        if rel_path not in title_to_rel_paths[norm_key]:
            title_to_rel_paths[norm_key].append(rel_path)

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
                title = post.get("title")
                if not title:
                    h1_match = re.search(r'^#\s+(.+)$', post.content, re.MULTILINE)
                    title = h1_match.group(1).strip() if h1_match else file_path.stem
                
                rel_path = file_path.relative_to(VAULT_DIR).as_posix()
                
                total_notes += 1
                cat_distribution[cat] += 1
                
                if status not in ("draft", "unread"):
                    active_notes += 1
                    all_active_paths.add(rel_path)
                    
                    register_path(title, rel_path)
                    register_path(file_path.stem, rel_path)
                    register_path(file_path.relative_to(VAULT_DIR).with_suffix("").as_posix(), rel_path)
                    
                    clean_content = strip_code_blocks(post.content)
                    found = WIKILINK_REGEX.findall(clean_content)
                    links = [item[0].strip() for item in found]
                    links_map[rel_path] = links
                else:
                    draft_notes += 1
            except Exception:
                continue

    in_degrees = {p: 0 for p in all_active_paths}
    out_degrees = {p: 0 for p in all_active_paths}
    
    for source_path, target_titles in links_map.items():
        for target_title in target_titles:
            target_key = normalize_string(target_title)
            target_path = resolve_proximity(source_path, target_key, title_to_rel_paths)
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


# --- AI Semantic Linking Optimizer ---
import hashlib

CONNECTIONS_SECTION_RE = re.compile(
    r'(?:\n\s*(?:---|___)?\s*)?\n\s*#+\s*(?:Conexiones|Conectado a|Connected to|Relaciones|Enlaces)\b.*$',
    re.IGNORECASE | re.DOTALL
)

def split_note_content(raw_content: str) -> tuple[str, str]:
    """
    Divide el contenido de la nota en (cuerpo_principal, seccion_conexiones).
    Si no hay sección de conexiones, retorna (raw_content, "").
    """
    match = CONNECTIONS_SECTION_RE.search(raw_content)
    if match:
        split_pos = match.start()
        cuerpo = raw_content[:split_pos].rstrip()
        conexiones = raw_content[split_pos:].strip()
        return cuerpo, conexiones
    return raw_content.rstrip(), ""

def extract_wikilinks(text: str) -> set[str]:
    """Extrae títulos de WikiLinks del texto omitiendo bloques de código."""
    clean_text = strip_code_blocks(text)
    links = WIKILINK_REGEX.findall(clean_text)
    return {link[0].strip() for link in links if link[0]}

def merge_and_filter_links(
    filename_stem: str,
    title: str,
    cuerpo: str,
    conexiones_antiguas: str,
    sugerencias_ia: list[str],
    valid_filenames: set[str]
) -> list[str]:
    """Combina enlaces antiguos y sugerencias de la IA aplicando las 3 capas de filtros."""
    # 1. Enlaces en el cuerpo (excluir de la sección final)
    cuerpo_links = {link.lower() for link in extract_wikilinks(cuerpo)}
    
    # 2. Enlaces previos de la sección de conexiones (conservar manuales)
    preexistentes = extract_wikilinks(conexiones_antiguas)
    
    # 3. Combinar todo
    candidatos = set(list(preexistentes) + sugerencias_ia)
    
    enlaces_finales = []
    # Siempre asegurar Welcome Hub por defecto
    enlaces_finales.append("Welcome Hub")
    
    for link in candidatos:
        link_lower = link.lower()
        # Regla A: Evitar autolink (por nombre de archivo o título)
        if link_lower == filename_stem.lower() or link_lower == title.lower():
            continue
        # Regla B: Evitar duplicar enlaces que ya están en el texto del cuerpo
        if link_lower in cuerpo_links:
            continue
        # Regla C: Validar existencia en el Vault
        if link_lower != "welcome hub" and link_lower not in {f.lower() for f in valid_filenames}:
            continue
            
        if link not in enlaces_finales and link_lower != "welcome hub":
            enlaces_finales.append(link)
            
    return enlaces_finales

class OptimizeLinksPayload(BaseModel):
    category: Optional[str] = None
    filepath: Optional[str] = None
    limit: int = 5
    confirmed_links: Optional[List[str]] = None

@app.post("/api/notes/optimize-links")
async def optimize_links_endpoint(payload: OptimizeLinksPayload):
    # Leer index directamente de disco para evitar deadlock
    index_file = VAULT_DIR / "brain_index.json"
    if not index_file.exists():
        async with write_lock:
            index_data = await rebuild_index_internal()
    else:
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                index_data = json.load(f)
        except Exception:
            async with write_lock:
                index_data = await rebuild_index_internal()
            
    notes = index_data.get("notes", {})
    valid_filenames = {note["filename"].replace(".md", "") for note in notes.values()}
    
    # 1. Determinar qué notas procesar
    target_notes = []
    if payload.category and payload.filepath:
        target_path = get_secure_path(payload.category, payload.filepath)
        if target_path.exists():
            target_notes.append((payload.category, payload.filepath, target_path))
    else:
        # Lote: Buscar notas activas con menor número de conexiones
        active_notes = [
            n for n in notes.values()
            if n.get("status", "") not in ("draft", "unread", "archived")
        ]
        # Ordenar por cantidad de conexiones (links + backlinks) ascendente para priorizar huérfanos
        active_notes.sort(key=lambda x: len(x.get("links", [])) + len(x.get("backlinks", [])))
        
        for note_info in active_notes[:payload.limit]:
            parts = note_info["id"].split("/", 1)
            if len(parts) == 2:
                cat, rpath = parts
                target_notes.append((cat, rpath, VAULT_DIR / note_info["id"]))

    if not target_notes:
        return {"status": "success", "message": "No notes found to optimize", "processed": []}

    processed_summary = []
    api_keys = get_api_keys()
    
    # Si se envían enlaces ya confirmados manualmente desde el modal del editor
    if payload.confirmed_links is not None and len(target_notes) == 1:
        cat, rpath, file_path = target_notes[0]
        try:
            async with write_lock:
                post = frontmatter.load(file_path)
            cuerpo, conexiones_antiguas = split_note_content(post.content)
            cuerpo_hash = hashlib.sha256(cuerpo.encode("utf-8")).hexdigest()
            
            enlaces_finales = merge_and_filter_links(
                filename_stem=file_path.stem,
                title=post.get("title") or file_path.stem,
                cuerpo=cuerpo,
                conexiones_antiguas=conexiones_antiguas,
                sugerencias_ia=payload.confirmed_links,
                valid_filenames=valid_filenames
            )
            
            # Escribir con formato ## Conectado a
            nuevas_conexiones_str = "\n\n--- \n## Conectado a\n" + "\n".join(
                [f"- [[{link}]]" for link in enlaces_finales]
            ) + "\n"
            
            post.content = cuerpo + nuevas_conexiones_str
            post.metadata["semantic_optimized_hash"] = cuerpo_hash
            post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
            
            async with write_lock:
                await save_note_atomically(file_path, frontmatter.dumps(post))
                await rebuild_index_internal()
            
            return {
                "status": "success",
                "processed": [{
                    "filename": file_path.name,
                    "status": "optimized",
                    "links_added": len(enlaces_finales) - 1
                }]
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save confirmed links: {e}")

    # Flujo automático o en lote (con consulta al LLM)
    for idx, (cat, rpath, file_path) in enumerate(target_notes):
        try:
            async with write_lock:
                post = frontmatter.load(file_path)
            cuerpo, conexiones_antiguas = split_note_content(post.content)
            cuerpo_hash = hashlib.sha256(cuerpo.encode("utf-8")).hexdigest()
            
            # Verificar hash de optimización
            if post.metadata.get("semantic_optimized_hash") == cuerpo_hash:
                processed_summary.append({
                    "filename": file_path.name,
                    "status": "skipped",
                    "reason": "already_optimized"
                })
                continue
            
            # Preparar contexto para el LLM
            notes_context_list = [
                {
                    "filename": note["filename"].replace(".md", ""),
                    "title": note["title"],
                    "tags": note["tags"]
                }
                for note in notes.values()
                if note["filename"] != file_path.name
            ]
            
            # Rate limiting para API de IA (RPM) en procesamiento por lotes
            if idx > 0:
                await asyncio.sleep(4.5)
            
            # Invocar la API en un hilo secundario para no bloquear el event loop principal de FastAPI
            sugerencias_ia = await asyncio.to_thread(get_semantic_links, api_keys, cuerpo, notes_context_list)
            
            # Si viene del editor individual, devolvemos las sugerencias directamente sin grabarlas
            if len(target_notes) == 1 and payload.confirmed_links is None:
                sugerencias_filtradas = []
                cuerpo_links = {link.lower() for link in extract_wikilinks(cuerpo)}
                for sug in sugerencias_ia:
                    sug_lower = sug.lower()
                    if sug_lower == file_path.stem.lower() or sug_lower == (post.get("title") or "").lower():
                        continue
                    if sug_lower in cuerpo_links:
                        continue
                    if sug_lower != "welcome hub" and sug_lower not in {f.lower() for f in valid_filenames}:
                        continue
                    sugerencias_filtradas.append(sug)
                
                return {
                    "status": "preview",
                    "filename": file_path.name,
                    "suggestions": sugerencias_filtradas
                }

            # Guardado automático para procesos en lote (batch)
            enlaces_finales = merge_and_filter_links(
                filename_stem=file_path.stem,
                title=post.get("title") or file_path.stem,
                cuerpo=cuerpo,
                conexiones_antiguas=conexiones_antiguas,
                sugerencias_ia=sugerencias_ia,
                valid_filenames=valid_filenames
            )
            
            nuevas_conexiones_str = "\n\n--- \n## Conectado a\n" + "\n".join(
                [f"- [[{link}]]" for link in enlaces_finales]
            ) + "\n"
            
            post.content = cuerpo + nuevas_conexiones_str
            post.metadata["semantic_optimized_hash"] = cuerpo_hash
            post.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
            
            async with write_lock:
                await save_note_atomically(file_path, frontmatter.dumps(post))
            
            processed_summary.append({
                "filename": file_path.name,
                "status": "optimized",
                "links_added": len(enlaces_finales) - 1
            })
            
        except RuntimeError as re_err:
            if "cuota" in str(re_err).lower() or "429" in str(re_err):
                async with write_lock:
                    await rebuild_index_internal()
                return {
                    "status": "partial_success",
                    "error": f"Límite de API alcanzado. Deteniendo lote. Detalle: {re_err}",
                    "processed": processed_summary
                }
            processed_summary.append({
                "filename": file_path.name,
                "status": "failed",
                "error": str(re_err)
            })
        except PermissionError as pe:
            processed_summary.append({
                "filename": file_path.name,
                "status": "failed",
                "error": f"Locked: {pe}"
            })
        except Exception as e:
            processed_summary.append({
                "filename": file_path.name,
                "status": "failed",
                "error": str(e)
            })
    
    async with write_lock:
        await rebuild_index_internal()
    return {"status": "success", "processed": processed_summary}


# @section: Video-Ingest-Engine
# Lógica para la ingesta remota y de baja fricción de videos cortos (TikTok/Reels)
# e integración de auditoría técnica por Gemini API para desarmar el humo de automatizaciones.

import base64
import httpx
import secrets

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

video_queue = asyncio.Queue()
video_semaphore = asyncio.Semaphore(1)

class SharePayload(BaseModel):
    url: str
    token: str
    tags: List[str] = []

@app.post("/api/capture/share")
async def capture_share(payload: SharePayload):
    if payload.token != INGEST_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized token")
    await video_queue.put({
        "url": payload.url,
        "tags": payload.tags,
        "chat_id": None
    })
    return {"status": "accepted", "message": "Video queued for processing"}

async def send_telegram_message(client: httpx.AsyncClient, chat_id: int, text: str):
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        await client.post(url, json={"chat_id": chat_id, "text": text})
    except Exception as e:
        print(f"Failed to send Telegram message: {e}")

async def video_queue_worker():
    while True:
        task = await video_queue.get()
        try:
            async with video_semaphore:
                await process_video_task(task)
        except Exception as e:
            print(f"Error in video worker loop: {e}")
        finally:
            video_queue.task_done()

async def telegram_bot_poller():
    if not TELEGRAM_BOT_TOKEN:
        print("TELEGRAM_BOT_TOKEN not found in environment. Telegram Bot Ingestion disabled.")
        return
    
    print("Starting Telegram Bot Ingestion Poller...")
    offset = 0
    async with httpx.AsyncClient(timeout=45.0) as client:
        while True:
            try:
                url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates"
                params = {"offset": offset, "timeout": 30}
                response = await client.get(url, params=params)
                if response.status_code == 200:
                    data = response.json()
                    if data.get("ok"):
                        for update in data.get("result", []):
                            offset = update["update_id"] + 1
                            message = update.get("message")
                            if message:
                                chat_id = message["chat"]["id"]
                                text = message.get("text", "")
                                # Buscar enlaces de TikTok o Reels
                                urls = re.findall(r'https?://[^\s]+', text)
                                if urls:
                                    for media_url in urls:
                                        if "tiktok.com" in media_url or "instagram.com" in media_url:
                                            tags = [tag.strip("#") for tag in text.split() if tag.startswith("#")]
                                            await video_queue.put({
                                                "url": media_url,
                                                "tags": tags,
                                                "chat_id": chat_id
                                            })
                                            await send_telegram_message(client, chat_id, "📥 Enlace encolado con éxito. Procesando en tu Second Brain...")
                                        else:
                                            await send_telegram_message(client, chat_id, "⚠️ Solo se admiten enlaces de TikTok o Instagram Reels.")
                                elif text.startswith("/start"):
                                    await send_telegram_message(client, chat_id, "👋 ¡Hola! Envíame un enlace de TikTok o Instagram Reel y realizaré una auditoría técnica en tu Second Brain.")
            except Exception as e:
                print(f"Error in Telegram Bot Poller loop: {e}")
            await asyncio.sleep(3.0)

async def update_reels_moc(note_title: str, note_filename: str):
    moc_path = PROJECT_ROOT / "vault" / "ideas" / "Reels y TikToks MOC.md"
    if not moc_path.exists():
        print(f"[AUTO-MOC] Reels y TikToks MOC.md not found at {moc_path}")
        return
        
    try:
        async with aiofiles.open(moc_path, "r", encoding="utf-8") as f:
            content = await f.read()
            
        post = frontmatter.loads(content)
        lines = post.content.splitlines()
        
        header_idx = -1
        for i, line in enumerate(lines):
            if line.strip().startswith("## 📥 Vídeos Auditados"):
                header_idx = i
                break
                
        if header_idx == -1:
            print("[AUTO-MOC] Header '## 📥 Vídeos Auditados' not found in MOC")
            return
            
        list_items = []
        end_idx = len(lines)
        
        # Collect list items under this header until next header
        for i in range(header_idx + 1, len(lines)):
            line = lines[i]
            stripped = line.strip()
            if stripped.startswith("##"):
                end_idx = i
                break
            if stripped.startswith("- "):
                list_items.append((line, stripped))
                
        # Check if already present
        new_stem = note_filename.replace(".md", "")
        already_exists = False
        for _, item_str in list_items:
            if f"[[{new_stem}" in item_str:
                already_exists = True
                break
                
        if already_exists:
            print(f"[AUTO-MOC] Note {new_stem} already linked in MOC")
            return
            
        # Add new item
        clean_title = note_title.replace("Auditoría: ", "")
        new_line = f"- [[{new_stem}|Auditoría: {clean_title}]]"
        new_item_tuple = (new_line, new_line)
        
        all_items = list_items + [new_item_tuple]
        
        # Sort items alphabetically by filename (stem) inside the wikilink
        def get_sort_key(item_tuple):
            match = re.search(r'\[\[([^\]|]+)', item_tuple[1])
            return match.group(1).lower() if match else item_tuple[1].lower()
            
        all_items.sort(key=get_sort_key)
        new_list_lines = [item[0].rstrip() for item in all_items]
        
        # Reconstruct lines:
        before_list = lines[:header_idx + 1]
        after_list = lines[end_idx:]
        
        final_content_lines = before_list + new_list_lines
        if after_list:
            final_content_lines.append("")
            final_content_lines.extend(after_list)
            
        post.content = "\n".join(final_content_lines)
        
        await save_note_atomically(moc_path, frontmatter.dumps(post))
        print(f"[AUTO-MOC] Successfully added {note_filename} to Reels y TikToks MOC.md")
    except Exception as e:
        print(f"[AUTO-MOC] Error updating Reels y TikToks MOC.md: {e}")

def run_subprocess_blocking(cmd: list) -> tuple:
    import subprocess
    try:
        res = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120.0
        )
        if res.returncode != 0:
            err_details = res.stderr.decode("utf-8", errors="ignore").strip()
            print(f"[SUBPROCESS ERROR] Command failed with code {res.returncode}. Stderr: {err_details}")
        return res.returncode, res.stdout, res.stderr
    except subprocess.TimeoutExpired as te:
        raise RuntimeError(f"El subproceso excedió el tiempo límite (120 segundos): {te}")
    except Exception as e:
        raise RuntimeError(f"Fallo al ejecutar el subproceso: {e}")

async def process_video_task(task: dict):
    url = task["url"]
    tags = task["tags"]
    chat_id = task["chat_id"]
    
    # Sanitización estricta por regex
    if not re.match(r'^https?://[a-zA-Z0-9.\-_~:/?#\[\]@!$&\'()*+,;=]+$', url):
        if chat_id:
            async with httpx.AsyncClient() as client:
                await send_telegram_message(client, chat_id, "❌ Error: La URL contiene caracteres no permitidos por seguridad.")
        return

    print(f"Starting processing task for URL: {url} (tags: {tags})")
    
    temp_dir = PROJECT_ROOT / "scratch" / "temp_media"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    temp_id = secrets.token_hex(8)
    media_path = None
    info_path = temp_dir / f"info_{temp_id}.json"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # 1. Obtener metadatos básicos
            cmd_info = [
                str(PROJECT_ROOT / "venv" / "Scripts" / "python.exe"),
                "-m", "yt_dlp",
                "--skip-download",
                "--write-info-json",
                "-o", str(temp_dir / f"info_{temp_id}"),
                "--no-playlist",
                url
            ]
            
            await asyncio.to_thread(run_subprocess_blocking, cmd_info)
            
            # Localizar el archivo JSON
            generated_files = list(temp_dir.glob(f"info_{temp_id}*"))
            for f in generated_files:
                if f.suffix == ".json":
                    info_path = f
                    break
            
            video_title = "Video Importado"
            video_creator = "Creador Desconocido"
            video_description = ""
            
            if info_path.exists():
                async with aiofiles.open(info_path, "r", encoding="utf-8") as f:
                    metadata = json.loads(await f.read())
                video_title = metadata.get("title", video_title)
                video_creator = metadata.get("uploader", metadata.get("channel", video_creator))
                video_description = metadata.get("description", "")
            
            # 2. Descargar contenido optimizado (ba/worst descarga audio o el video mas ligero que contenga audio)
            is_visual = "visual" in tags
            format_selector = "worst" if is_visual else "ba/worst"
            
            out_template = str(temp_dir / f"media_{temp_id}.%(ext)s")
            cmd_download = [
                str(PROJECT_ROOT / "venv" / "Scripts" / "python.exe"),
                "-m", "yt_dlp",
                "-f", format_selector,
                "-o", out_template,
                "--no-playlist",
                url
            ]
            
            await asyncio.to_thread(run_subprocess_blocking, cmd_download)
            
            media_files = list(temp_dir.glob(f"media_{temp_id}.*"))
            if media_files:
                media_path = media_files[0]
                
            if not media_path or not media_path.exists():
                raise Exception("Fallo en la descarga del recurso multimedia mediante yt-dlp.")
            
            # 3. Codificar en Base64
            async with aiofiles.open(media_path, "rb") as f:
                media_bytes = await f.read()
            media_b64 = base64.b64encode(media_bytes).decode("utf-8")
            
            suffix = media_path.suffix.lower()
            if suffix == ".mp4":
                mime_type = "video/mp4"
            elif suffix == ".webm":
                mime_type = "video/webm"
            elif suffix == ".3gp":
                mime_type = "video/3gpp"
            elif suffix == ".m4a":
                mime_type = "audio/mp4"
            elif suffix == ".ogg":
                mime_type = "audio/ogg"
            elif suffix == ".wav":
                mime_type = "audio/wav"
            elif suffix == ".aac":
                mime_type = "audio/aac"
            elif suffix == ".mp3":
                mime_type = "audio/mp3"
            else:
                mime_type = "video/mp4"
            
            # 4. Auditoría con Gemini API
            if not GEMINI_API_KEY:
                raise Exception("Falta GEMINI_API_KEY en las variables del entorno.")
                
            system_instructions = (
                "Eres un auditor técnico senior de la Corte Suprema de Agentes (SCoA). Tu objetivo es analizar "
                "el contenido del audio/video adjunto (un TikTok o Instagram Reel) y desarmar con total objetividad "
                "y de manera crítica cualquier afirmación exagerada, automatización irreal de 'no-code/IA', SaaS milagroso, "
                "o 'hype' de captación de leads (marketing), evaluando su viabilidad real para un proyecto de producción.\n\n"
                "Genera un reporte técnico Markdown en español estructurado exactamente con las siguientes secciones:\n"
                "1. **Transcripción Literal**: Transcribe el contenido hablado completo del video.\n"
                "2. **Semáforo de Utilidad**: Evalúa usando emojis:\n"
                "   - Factibilidad Técnica: ⭐ a ⭐⭐⭐⭐⭐\n"
                "   - Complejidad Oculta: 🟢 (Baja), 🟡 (Media), 🔴 (Alta)\n"
                "   - Mantenibilidad: 🟢, 🟡, 🔴\n"
                "3. **Análisis Hype vs. Realidad**: Contrasta de forma incisiva las promesas del video contra la realidad técnica.\n"
                "4. **Puntos Críticos de Falla**: Detalla 2 o 3 razones técnicas precisas por las cuales este flujo fallará o se romperá (ej. límites de API, bloqueos, problemas de tokens).\n"
                "5. **Estructura de Costes Ocultos**: Estima costes mensuales reales en APIs (tokens) o plataformas intermedias para ejecutar este caso de uso.\n"
                "6. **Diagrama de Bloques Mermaid**: Dibuja un diagrama `mermaid` limpio que ilustre la arquitectura técnica simplificada de este proceso (usando código de bloques).\n"
                "7. **El Poso Útil**: Describe el aprendizaje real, truco de código o patrón de ingeniería utilizable que se puede rescatar."
            )
            
            gemini_payload = {
                "contents": [{
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": media_b64
                            }
                        },
                        {
                            "text": f"Analiza críticamente el recurso del video '{video_title}' de '{video_creator}'.\nDescripción: {video_description}\n\nInstrucciones:\n{system_instructions}"
                        }
                    ]
                }]
            }
            
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
            
            # Mecanismo de reintentos para API de Gemini (saturación o sobrecarga)
            max_retries = 5
            backoff = 2
            response = None
            for attempt in range(max_retries):
                try:
                    response = await client.post(gemini_url, json=gemini_payload, headers={"Content-Type": "application/json"})
                    if response.status_code == 200:
                        break
                    elif response.status_code in (503, 429, 500, 502, 504):
                        print(f"Intento {attempt + 1} fallido con codigo {response.status_code}. Reintentando en {backoff}s...")
                        if chat_id:
                            await send_telegram_message(client, chat_id, f"⚠️ Servidor sobrecargado (Error {response.status_code}). Reintentando analisis en {backoff} segundos (intento {attempt + 1}/{max_retries})...")
                        await asyncio.sleep(backoff)
                        backoff *= 2
                    else:
                        raise Exception(f"Fallo en la llamada a la API de Gemini: {response.text}")
                except httpx.RequestError as req_ex:
                    print(f"Error de red en intento {attempt + 1}: {req_ex}")
                    if attempt == max_retries - 1:
                        raise req_ex
                    await asyncio.sleep(backoff)
                    backoff *= 2
            
            if not response or response.status_code != 200:
                error_body = response.text if response else "Sin respuesta"
                raise Exception(f"Fallo persistente en la llamada a la API de Gemini despues de {max_retries} intentos: {error_body}")
                
            gemini_res = response.json()
            try:
                audit_content = gemini_res["candidates"][0]["content"]["parts"][0]["text"]
            except Exception:
                raise Exception(f"Estructura de respuesta inválida de Gemini: {gemini_res}")
                
            # 5. Crear nota de Obsidian
            sanitized_title = sanitize_filename(video_title)
            if len(sanitized_title) > 50:
                sanitized_title = sanitized_title[:50].strip()
            
            filename = f"video-{sanitized_title}.md"
            target_path = get_secure_path("sources", filename)
            
            post_content = frontmatter.Post(audit_content)
            post_content.metadata["title"] = f"Auditoría: {video_title}"
            post_content.metadata["category"] = "sources"
            post_content.metadata["status"] = "unread"
            post_content.metadata["tags"] = ["project/antigravity", "type/video-audit"] + [f"tag/{t}" for t in tags]
            post_content.metadata["source_type"] = "video"
            post_content.metadata["source_url"] = url
            post_content.metadata["created"] = datetime.now().strftime("%Y-%m-%d")
            post_content.metadata["updated"] = datetime.now().strftime("%Y-%m-%d")
            post_content.metadata["summary"] = f"Auditoría de caso de uso del video '{video_title}' por {video_creator}."
            
            async with write_lock:
                await save_note_atomically(target_path, frontmatter.dumps(post_content))
                await update_reels_moc(post_content.metadata["title"], filename)
                await rebuild_index_internal()
                
            # 6. Notificar a Telegram
            if chat_id:
                wiki_link = f"[[{post_content.metadata['title']}]]"
                await send_telegram_message(client, chat_id, f"✅ Auditoría completada con éxito:\n{wiki_link}\n\nNota disponible en tu bandeja de entrada.")
                
        except Exception as ex:
            import traceback
            traceback.print_exc()
            err_msg = str(ex).replace("ó", "o").replace("í", "i").replace("á", "a").replace("é", "e").replace("ú", "u")
            if not err_msg:
                err_msg = f"Error interno en el worker (tipo: {type(ex).__name__})"
            print(f"Error in video task worker: {err_msg}")
            if chat_id:
                await send_telegram_message(client, chat_id, f"❌ Fallo al procesar el video:\n{err_msg[:150]}...")
        finally:
            # Limpiar temporales
            try:
                if info_path and info_path.exists(): info_path.unlink()
                if media_path and media_path.exists(): media_path.unlink()
            except Exception:
                pass
# @end: Video-Ingest-Engine

# Serve Frontend static files
app.mount("/", StaticFiles(directory=str(PROJECT_ROOT / "frontend"), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
