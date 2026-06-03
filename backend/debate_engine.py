import os
import re
import sys
import json
import asyncio
import argparse
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Any

# System Prompts for specialized Justices
JUSTICE_PROMPTS = {
    "security": (
        "You are the SecurityReviewer justice on the Supreme Court of Agents.\n"
        "Your task is to analyze the technical proposal or design for security implications:\n"
        "1. Identify vulnerabilities (injection, XSS, path traversal, authentication, leaks).\n"
        "2. Rate the proposal's security from A (Exemplary) to F (Critical issues).\n"
        "3. List mandatory security mitigations.\n"
        "Focus ONLY on security. Ignore speed or aesthetics. Format in Markdown with tag #security."
    ),
    "performance": (
        "You are the PerformanceExpert justice on the Supreme Court of Agents.\n"
        "Your task is to analyze the technical proposal or design for efficiency implications:\n"
        "1. Identify bottlenecks, CPU/memory bloat, lock contentions, disk I/O issues, or latency.\n"
        "2. Rate the proposal's performance from A (Highly Efficient) to F (Severe Bottlenecks).\n"
        "3. List optimization steps (caching, indices, algorithm modifications).\n"
        "Focus ONLY on speed. Ignore security or UX. Format in Markdown with tag #performance."
    ),
    "uiux": (
        "You are the UIUXDesigner justice on the Supreme Court of Agents.\n"
        "Your task is to analyze the technical proposal or design for usability implications:\n"
        "1. Identify user friction, layout inconsistencies, layout structure issues, accessibility flaws.\n"
        "2. Rate the proposal's developer/user experience from A (Seamless) to F (Confusing/High Friction).\n"
        "3. Suggest visual or user-flow improvements.\n"
        "Focus ONLY on usability and design. Ignore security or speed. Format in Markdown with tag #ui-ux."
    ),
    "moderator": (
        "You are the Chief Justice and Moderator of the Supreme Court of Agents.\n"
        "Your task is to read the original proposal, the three specialized reviews (Security, Performance, UIUX), "
        "resolve any conflicting goals (e.g. security checks vs. latency), map the Pareto Frontier, and write a unified synthesis.\n"
        "Your output must contain:\n"
        "1. Executive Summary & Verdict (Approved / Approved with Conditions / Rejected) with core reasons.\n"
        "2. The Pareto Frontier: clear analysis of the trade-offs.\n"
        "3. Actionable Specifications: combined implementation guidelines.\n"
        "4. Summary Grade Table (Security, Performance, UI/UX).\n"
        "Format in structured Markdown with tag #synthesis."
    )
}

def get_api_keys() -> dict:
    keys = {"GEMINI_API_KEY": "", "OPENROUTER_API_KEY": ""}
    # 1. Look in Environment
    if os.environ.get("GEMINI_API_KEY"):
        keys["GEMINI_API_KEY"] = os.environ["GEMINI_API_KEY"]
    if os.environ.get("OPENROUTER_API_KEY"):
        keys["OPENROUTER_API_KEY"] = os.environ["OPENROUTER_API_KEY"]
    
    # 2. Look in local .env files
    project_root = Path(__file__).resolve().parent.parent
    env_paths = [project_root / ".env", project_root / "backend" / ".env"]
    for path in env_paths:
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line_stripped = line.strip()
                        if line_stripped.startswith("GEMINI_API_KEY="):
                            keys["GEMINI_API_KEY"] = line_stripped.split("=", 1)[1].strip('"\' ')
                        elif line_stripped.startswith("OPENROUTER_API_KEY="):
                            keys["OPENROUTER_API_KEY"] = line_stripped.split("=", 1)[1].strip('"\' ')
            except Exception:
                pass
    return keys

def get_api_key() -> str:
    keys = get_api_keys()
    return keys["GEMINI_API_KEY"] or keys["OPENROUTER_API_KEY"]

# Model fallback chain — tried in order if the previous one hits quota/404
MODEL_FALLBACK_CHAIN = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-8b",
]

def _parse_api_error(http_err) -> str:
    """Returns a clean human-readable error from an HTTPError response."""
    try:
        body = http_err.read().decode("utf-8", errors="ignore")
        data = json.loads(body)
        # Unwrap list wrapper if present
        if isinstance(data, list):
            data = data[0] if data else {}
        err = data.get("error", {})
        code = err.get("code", http_err.code)
        message = err.get("message", "Unknown API error")
        if code == 429 or "RESOURCE_EXHAUSTED" in str(err.get("status", "")):
            return (
                f"⚠️ Cuota de Gemini agotada (429).\n"
                f"Has superado el límite gratuito diario de la API.\n"
                f"Opciones:\n"
                f"  • Espera ~24h a que se restablezca la cuota\n"
                f"  • Activa facturación en https://ai.google.dev\n"
                f"  • Usa otra API key en Configuración o configura OPENROUTER_API_KEY en .env"
            )
        if code == 404:
            return f"❌ Modelo no disponible (404): {message}"
        return f"Error {code}: {message}"
    except Exception:
        return f"HTTP Error {http_err.code}: respuesta no interpretable"

def call_openrouter_stream_sync(api_key: str, system_instruction: str, user_prompt: str):
    url = "https://openrouter.ai/api/v1/chat/completions"
    payload = {
        "model": "openrouter/free",
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.2,
        "stream": True
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://github.com/stoica25-byte/second-brain",
            "X-Title": "Second Brain Console"
        }
    )
    try:
        with urllib.request.urlopen(req) as response:
            buffer = ""
            for chunk in response:
                if not chunk:
                    continue
                buffer += chunk.decode("utf-8", errors="ignore")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    if line.startswith("data:"):
                        data_content = line[5:].strip()
                        if data_content == "[DONE]":
                            break
                        try:
                            json_data = json.loads(data_content)
                            choices = json_data.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except Exception:
                            pass
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
            err_msg = json.loads(body).get("error", {}).get("message", str(e))
        except Exception:
            err_msg = str(e)
        raise RuntimeError(f"OpenRouter Error {e.code}: {err_msg}")
    except Exception as e:
        raise RuntimeError(f"OpenRouter Connection Error: {e}")


def call_gemini_stream_sync(api_key: str, system_instruction: str, user_prompt: str):
    """Sync generator that tries each model in the fallback chain until one succeeds."""
    last_error = None
    
    for model in MODEL_FALLBACK_CHAIN:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:streamGenerateContent?key={api_key}"
        )
        payload = {
            "contents": [{"parts": [{"text": user_prompt}]}],
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "generationConfig": {"temperature": 0.2}
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                buffer = ""
                for chunk in response:
                    if not chunk:
                        continue
                    buffer += chunk.decode("utf-8", errors="ignore")
                    matches = list(re.finditer(r'"text"\s*:\s*"((?:[^"\\]|\\.)*)"', buffer))
                    if not matches:
                        continue
                    last_end = 0
                    for match in matches:
                        text_escaped = match.group(1)
                        try:
                            text_decoded = json.loads(f'"{text_escaped}"')
                            yield text_decoded
                        except Exception:
                            text_decoded = (
                                text_escaped
                                .replace('\\n', '\n')
                                .replace('\\t', '\t')
                                .replace('\\"', '"')
                            )
                            yield text_decoded
                        last_end = match.end()
                    if last_end > 0:
                        buffer = buffer[last_end:]
            return  # success — stop trying fallbacks
            
        except urllib.error.HTTPError as e:
            clean_msg = _parse_api_error(e)
            last_error = clean_msg
            # Only retry on 429 (quota) or 404 (model not found); fail fast on 400/401
            if e.code in (429, 404, 503):
                continue  # try next model
            raise RuntimeError(clean_msg)
        except Exception as e:
            last_error = f"Error de conexión: {e}"
            raise RuntimeError(last_error)
    
    # All models exhausted
    raise RuntimeError(
        last_error or
        "⚠️ Todos los modelos de Gemini han agotado su cuota.\n"
        "Espera 24h o activa facturación en https://ai.google.dev"
    )


async def run_debate_stream(proposal: str, api_key_or_keys: Any, category: str = "ideas") -> AsyncGenerator[dict, None]:
    """Async generator wrapper that executes the debate stages sequentially."""
    stages = ["security", "performance", "uiux", "moderator"]
    critiques = {}
    
    # Identify title
    title_match = re.search(r'^(?:#\s*)?(.+)', proposal)
    title = title_match.group(1).strip() if title_match else "SCoA Debate Proposal"
    
    for stage in stages:
        yield {"stage": stage, "status": "start"}
        
        # Build prompt history for current agent
        if stage == "moderator":
            prompt = (
                f"Original Proposal:\n{proposal}\n\n"
                f"Security Justice Critique:\n{critiques['security']}\n\n"
                f"Performance Justice Critique:\n{critiques['performance']}\n\n"
                f"UI/UX Justice Critique:\n{critiques['uiux']}"
            )
        else:
            prompt = proposal
            
        full_text = ""
        try:
            # Run blocking stream in the loop's default executor
            loop = asyncio.get_running_loop()
            
            if isinstance(api_key_or_keys, dict):
                openrouter_key = api_key_or_keys.get("OPENROUTER_API_KEY")
                gemini_key = api_key_or_keys.get("GEMINI_API_KEY")
                if openrouter_key:
                    iterator = call_openrouter_stream_sync(openrouter_key, JUSTICE_PROMPTS[stage], prompt)
                elif gemini_key:
                    iterator = call_gemini_stream_sync(gemini_key, JUSTICE_PROMPTS[stage], prompt)
                else:
                    raise ValueError("No API key available for debate.")
            else:
                iterator = call_gemini_stream_sync(api_key_or_keys, JUSTICE_PROMPTS[stage], prompt)

            
            def get_next():
                try:
                    return next(iterator)
                except StopIteration:
                    return None
            
            while True:
                chunk = await loop.run_in_executor(None, get_next)
                if chunk is None:
                    break
                full_text += chunk
                yield {"stage": stage, "chunk": chunk}
                
        except Exception as e:
            yield {"stage": stage, "error": str(e)}
            return
            
        critiques[stage] = full_text
        yield {"stage": stage, "status": "done", "full_text": full_text}

    # Write SCoA debate file to vault
    project_root = Path(__file__).resolve().parent.parent
    vault_path = project_root / "vault" / category
    vault_path.mkdir(parents=True, exist_ok=True)
    
    # Sanitized filename mapping
    clean_title = re.sub(r'[\\/*?:"<>|]', "", title)
    clean_title = re.sub(r'\s+', "-", clean_title).strip().lower()
    filename = f"scoa-debate-{clean_title[:30]}"
    file_path = vault_path / f"{filename}.md"
    
    # Prevent collision
    if file_path.exists():
        timestamp = datetime.now().strftime("%Y%m%d-%H%M")
        file_path = vault_path / f"{filename}-{timestamp}.md"
        
    # Extract short summary for Frontmatter
    summary_match = re.search(r'Executive Summary\s*(.+)', critiques["moderator"], re.IGNORECASE)
    summary = ""
    if summary_match:
         summary = summary_match.group(1).strip()
         summary = re.sub(r'[#*`_\-\[\]]', '', summary)
         summary = re.sub(r'\s+', ' ', summary).strip()
         summary = summary[:120] + "..." if len(summary) > 120 else summary
    if not summary:
         summary = f"SCoA Debate resolution concerning: {title}"

    # Auto-link scanning
    index_file = project_root / "vault" / "brain_index.json"
    auto_links = []
    if index_file.exists():
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                idx = json.load(f)
                for note_title in idx.get("notes", {}).keys():
                    if len(note_title) > 3 and note_title.lower() in proposal.lower():
                        auto_links.append(note_title)
        except Exception:
            pass
            
    frontmatter = (
        "---\n"
        f"title: \"SCoA Debate: {title}\"\n"
        f"category: \"{category}\"\n"
        f"tags: [\"scoa-debate\", \"{category}\"]\n"
        f"created: \"{datetime.now().strftime('%Y-%m-%d')}\"\n"
        f"updated: \"{datetime.now().strftime('%Y-%m-%d')}\"\n"
        "status: \"proposed\"\n"
        f"summary: \"{summary}\"\n"
        "---\n\n"
    )
    
    content = (
        f"# SCoA Debate: {title}\n\n"
        f"## The Court Verdict\n\n{critiques['moderator']}\n\n"
        f"## The Court Records\n\n"
        f"### Security Reviewer Critique\n{critiques['security']}\n\n"
        f"### Performance Expert Critique\n{critiques['performance']}\n\n"
        f"### UI/UX Designer Critique\n{critiques['uiux']}\n"
    )
    
    if auto_links:
        content += "\n--- \n### Auto-detected Connections\n"
        for link in set(auto_links):
            content += f"- [[{link}]]\n"
            
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(frontmatter + content)
        yield {
            "stage": "file_write", 
            "status": "saved", 
            "filename": file_path.name,
            "path": file_path.relative_to(project_root).as_posix()
        }
    except Exception as e:
        yield {"stage": "file_write", "error": f"Failed to save file: {e}"}

def main():
    parser = argparse.ArgumentParser(description="Supreme Court of Agents (SCoA) Debate CLI")
    parser.add_argument("--prompt", required=True, help="Technical proposal to debate")
    parser.add_argument("--category", default="ideas", choices=["ideas", "skills", "journal"], help="Vault target category")
    parser.add_argument("--api-key", help="Gemini API Key override")
    args = parser.parse_args()
    
    api_key = args.api_key or get_api_key()
    if not api_key:
        print("Error: GEMINI_API_KEY not found in environment or .env files.", file=sys.stderr)
        sys.exit(1)
        
    print(f"\n=== Commencing SCoA Debate Room ({args.category.upper()}) ===")
    
    async def run():
        async for msg in run_debate_stream(args.prompt, api_key, args.category):
            stage = msg["stage"]
            if "status" in msg and msg["status"] == "start":
                print(f"\n>>> Calling {stage.upper()} Justice...")
            elif "chunk" in msg:
                print(msg["chunk"], end="", flush=True)
            elif "status" in msg and msg["status"] == "saved":
                print(f"\n\n[SUCCESS] Debate logged to vault: {msg['path']}")
            elif "error" in msg:
                print(f"\n[ERROR] In stage {stage}: {msg['error']}", file=sys.stderr)
                
    asyncio.run(run())

if __name__ == "__main__":
    main()
