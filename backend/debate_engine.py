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
from typing import AsyncGenerator, Any, List

# System Prompts for specialized Justices (Spanish translation/instruction)
JUSTICE_PROMPTS = {
    "jurado": (
        "Eres el Jurado de Cohesión en el Tribunal Supremo de Agentes (Supreme Court of Agents), compuesto virtualmente por 5 jueces:\n"
        "Juez de Innovación, Juez de Factibilidad, Juez de Alineación Estratégica, Juez de Integración y Juez de Escalabilidad.\n"
        "Tu tarea es evaluar la propuesta técnica inicial y responder colectivamente sobre su viabilidad y cohesión técnica:\n"
        "1. ¿Tiene sentido desarrollar esta propuesta? ¿Es técnicamente viable?\n"
        "2. Evalúa la cohesión arquitectónica y la integración estratégica inicial.\n"
        "3. Emite un dictamen preliminar (Luz Verde para continuar / Luz Amarilla con dudas / Luz Roja para descartar).\n"
        "Tu respuesta debe estar completamente en ESPAÑOL. Formatea en Markdown con el tag #jurado."
    ),
    "fiscalia": (
        "Eres la Fiscalía (Prosecution) en el Tribunal Supremo de Agentes (Supreme Court of Agents), compuesta virtualmente por 4 jurados:\n"
        "Fiscal de Huecos Técnicos, Fiscal de Falacias, Fiscal de Riesgos y Fiscal de Fricción.\n"
        "Tu tarea es actuar como acusador implacable y desmantelar la propuesta técnica buscando todas sus debilidades:\n"
        "1. Identifica contradicciones, fallas lógicas, huecos de diseño y falacias técnicas en la propuesta.\n"
        "2. Detalla los riesgos de seguridad (vulnerabilidades, fugas) y la fricción que causará a nivel de usabilidad/desarrollo.\n"
        "3. Presenta una acusación técnica sólida, argumentando por qué esta idea podría fallar en condiciones reales.\n"
        "Tu respuesta debe estar completamente en ESPAÑOL. Formatea en Markdown con el tag #fiscalia."
    ),
    "analistas": (
        "Eres el equipo de Analistas de Investigación en el Tribunal Supremo de Agentes (Supreme Court of Agents), compuesto por 3 peritos:\n"
        "Analista de Datos Web, Analista de Casos de Estudio y Analista de Pruebas de Carga.\n"
        "Tu tarea es actuar como investigadores contrastando las acusaciones de la Fiscalía utilizando tu herramienta de búsqueda web (Google Search):\n"
        "1. Busca en la web soluciones existentes, benchmarks reales o casos de fallo documentados relacionados con la propuesta y las acusaciones de la Fiscalía.\n"
        "2. Presenta pruebas reales (hechos, benchmarks, datos verídicos de internet) para demostrar o desmentir las hipótesis y riesgos de la Fiscalía.\n"
        "3. Haz una prueba de presión con logística y datos del mundo real.\n"
        "Tu respuesta debe estar completamente en ESPAÑOL e incluir referencias o enlaces (citaciones) de tus hallazgos. Formatea en Markdown con el tag #analistas."
    ),
    "tribunal": (
        "Eres el Magistrado del Tribunal de Enjuiciamiento en el Tribunal Supremo de Agentes (Supreme Court of Agents).\n"
        "Tu tarea consiste en revisar minuciosamente todo el expediente de la causa:\n"
        "- La propuesta original.\n"
        "- El veredicto de viabilidad del Jurado.\n"
        "- Los cargos y fallos expuestos por la Fiscalía.\n"
        "- Las pruebas y benchmarks contrastados por los Analistas.\n"
        "Tu función es organizar todo el caso, estructurando de manera neutral los argumentos a favor y los argumentos en contra. Prepara el expediente unificado del caso para que el Abogado Supremo dicte la resolución.\n"
        "Tu respuesta debe estar completamente en ESPAÑOL. Formatea en Markdown con el tag #tribunal."
    ),
    "dictamen": (
        "Eres el Abogado General del Tribunal Supremo (Chief Advocate) en el Tribunal Supremo de Agentes.\n"
        "Tu tarea es leer el expediente procesal unificado preparado por el Tribunal de Enjuiciamiento y dictar la resolución y veredicto definitivo de la propuesta.\n"
        "Tu dictamen debe estar completamente en ESPAÑOL y contener:\n"
        "1. Resumen Ejecutivo y Veredicto Final Inapelable (Aprobado / Aprobado con Condiciones / Denegado) con la justificación principal.\n"
        "2. Especificaciones Técnicas y Pautas de Desarrollo: pautas claras de implementación que incluyan las optimizaciones de rendimiento y las mitigaciones de seguridad obligatorias basadas en todo el historial.\n"
        "3. Tabla de Calificaciones Resumen (Cohesión, Resistencia a fallos, Sustento real y Viabilidad de implementación).\n"
        "Formatea en Markdown estructurado con el tag #dictamen."
    )
}

def get_api_keys() -> dict:
    keys = {"GEMINI_API_KEY": "", "OPENROUTER_API_KEY": ""}    # 1. Look in Environment
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
        with urllib.request.urlopen(req, timeout=15) as response:
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


def call_gemini_stream_sync(api_key: str, system_instruction: str, user_prompt: str, enable_search: bool = False):
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
        if enable_search:
            payload["tools"] = [{"google_search": {}}]
            
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
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


def get_semantic_links(api_key_or_keys: Any, proposal: str, notes_list: List[dict]) -> List[str]:
    """Uses Gemini or OpenRouter API to semantically evaluate and recommend relevant existing notes to link."""
    if not notes_list:
        return []
        
    gemini_key = ""
    openrouter_key = ""
    if isinstance(api_key_or_keys, dict):
        gemini_key = api_key_or_keys.get("GEMINI_API_KEY") or ""
        openrouter_key = api_key_or_keys.get("OPENROUTER_API_KEY") or ""
    elif isinstance(api_key_or_keys, str):
        if api_key_or_keys.startswith("sk-or-"):
            openrouter_key = api_key_or_keys
        else:
            gemini_key = api_key_or_keys

    system_instruction = (
        "Eres un clasificador semántico para una base de conocimiento personal (Second Brain).\n"
        "Tu tarea consiste en analizar la propuesta técnica del usuario y determinar qué notas existentes en el sistema "
        "tienen una relación semántica estrecha con la propuesta (por tecnologías compartidas, conceptos técnicos comunes o área de arquitectura).\n"
        "Devuelve ÚNICAMENTE un array JSON que contenga los nombres exactos (filename) de las notas recomendadas, sin explicaciones ni formato markdown de código. "
        "Ejemplo de salida:\n"
        "[\"Nota A\", \"Nota B\"]\n"
        "Si ninguna nota es relevante, devuelve un array vacío []."
    )
    
    # Format notes list as a clean bulleted list for context
    notes_context = "\n".join([
        f"- Nota: \"{n['filename']}\" | Título: \"{n['title']}\" | Tags: {', '.join(n['tags'])}"
        for n in notes_list
    ])
    
    user_prompt = (
        f"Propuesta Técnica a Evaluar:\n{proposal}\n\n"
        f"Notas Existentes en el Sistema:\n{notes_context}\n\n"
        f"Recomienda cuáles de las notas existentes son relevantes para enlazar semánticamente con la propuesta técnica."
    )
    
    response_text = ""
    
    # 1. Try Gemini first if key is present
    if gemini_key:
        try:
            iterator = call_gemini_stream_sync(gemini_key, system_instruction, user_prompt)
            response_text = "".join(list(iterator))
        except Exception:
            pass
            
    # 2. Fallback to OpenRouter if Gemini failed or wasn't provided
    if not response_text and openrouter_key:
        try:
            iterator = call_openrouter_stream_sync(openrouter_key, system_instruction, user_prompt)
            response_text = "".join(list(iterator))
        except Exception:
            pass
            
    if not response_text:
        return []
        
    try:
        # Clean up any potential markdown backticks or markdown wrapping
        response_text = re.sub(r'```(?:json)?|```', '', response_text).strip()
        
        # Extract JSON list
        match = re.search(r'\[\s*".*?"\s*\]|\[\s*\]', response_text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        
        # Fallback manual regex parsing if json decoding fails
        items = re.findall(r'"([^"]+)"', response_text)
        return [item.strip() for item in items if item.strip()]
    except Exception:
        # Fail silently and return empty list on API or parsing failures
        return []


def generate_short_title(api_key_or_keys: Any, proposal: str) -> str:

    """Generates a short, concise title (4-8 words) from a long proposal using the LLM."""
    first_line = proposal.split("\n")[0].strip()
    first_line_clean = re.sub(r'^(?:#\s*)?', '', first_line).strip()
    
    if len(first_line_clean) <= 60:
        return first_line_clean
        
    system_instruction = (
        "Eres un resumidor preciso. Tu tarea es leer la propuesta técnica del usuario "
        "y devolver un título corto y conciso (máximo 8 palabras) en español que resuma el tema principal. "
        "No agregues puntuación, comillas ni texto introductorio. Devuelve únicamente el título."
    )
    
    gemini_key = ""
    openrouter_key = ""
    if isinstance(api_key_or_keys, dict):
        gemini_key = api_key_or_keys.get("GEMINI_API_KEY") or ""
        openrouter_key = api_key_or_keys.get("OPENROUTER_API_KEY") or ""
    elif isinstance(api_key_or_keys, str):
        if api_key_or_keys.startswith("sk-or-"):
            openrouter_key = api_key_or_keys
        else:
            gemini_key = api_key_or_keys

    response_text = ""
    if gemini_key:
        try:
            iterator = call_gemini_stream_sync(gemini_key, system_instruction, proposal)
            response_text = "".join(list(iterator))
        except Exception:
            pass
            
    if not response_text and openrouter_key:
        try:
            iterator = call_openrouter_stream_sync(openrouter_key, system_instruction, proposal)
            response_text = "".join(list(iterator))
        except Exception:
            pass
            
    clean_title = response_text.strip().strip('"\'#* ')
    if clean_title and len(clean_title) < 100:
        return clean_title
        
    # Fallback to simple word-based truncation
    words = first_line_clean.split()
    fallback_title = " ".join(words[:8])
    if len(first_line_clean) > len(fallback_title):
        fallback_title += "..."
    return fallback_title


async def run_debate_stream(proposal: str, api_key_or_keys: Any, category: str = "ideas") -> AsyncGenerator[dict, None]:
    """Async generator wrapper that executes the debate stages sequentially."""
    stages = ["jurado", "fiscalia", "analistas", "tribunal", "dictamen"]
    critiques = {}
    
    # Identify title
    title_match = re.search(r'^(?:#\s*)?(.+)', proposal)
    raw_title = title_match.group(1).strip() if title_match else "SCoA Debate Proposal"
    
    for stage in stages:
        yield {"stage": stage, "status": "start"}
        
        # Build prompt history for current agent
        if stage == "jurado":
            prompt = proposal
        elif stage == "fiscalia":
            prompt = (
                f"Propuesta Original:\n{proposal}\n\n"
                f"Veredicto del Jurado de Cohesión:\n{critiques['jurado']}"
            )
        elif stage == "analistas":
            prompt = (
                f"Propuesta Original:\n{proposal}\n\n"
                f"Veredicto del Jurado de Cohesión:\n{critiques['jurado']}\n\n"
                f"Acusación de la Fiscalía:\n{critiques['fiscalia']}"
            )
        elif stage == "tribunal":
            prompt = (
                f"Propuesta Original:\n{proposal}\n\n"
                f"Veredicto del Jurado de Cohesión:\n{critiques['jurado']}\n\n"
                f"Acusación de la Fiscalía:\n{critiques['fiscalia']}\n\n"
                f"Investigación de los Analistas:\n{critiques['analistas']}"
            )
        elif stage == "dictamen":
            prompt = (
                f"Expediente del Caso Preparado por el Tribunal:\n{critiques['tribunal']}"
            )
            
        full_text = ""
        try:
            # Run blocking stream in the loop's default executor
            loop = asyncio.get_running_loop()
            enable_search = (stage == "analistas")
            
            if isinstance(api_key_or_keys, dict):
                openrouter_key = api_key_or_keys.get("OPENROUTER_API_KEY")
                gemini_key = api_key_or_keys.get("GEMINI_API_KEY")
                if openrouter_key:
                    iterator = call_openrouter_stream_sync(openrouter_key, JUSTICE_PROMPTS[stage], prompt)
                elif gemini_key:
                    iterator = call_gemini_stream_sync(gemini_key, JUSTICE_PROMPTS[stage], prompt, enable_search=enable_search)
                else:
                    raise ValueError("No API key available for debate.")
            else:
                iterator = call_gemini_stream_sync(api_key_or_keys, JUSTICE_PROMPTS[stage], prompt, enable_search=enable_search)

            
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

    # Generate clean short title using LLM or fallback if it's too long
    title = generate_short_title(api_key_or_keys, raw_title)

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
    veredicto_match = re.search(r'\*\*Veredicto:\*\*\s*(.+)', critiques["dictamen"], re.IGNORECASE)
    veredicto = veredicto_match.group(1).strip().replace("**", "").replace("*", "") if veredicto_match else ""
    
    if veredicto:
        summary = f"Dictamen SCoA: {veredicto} | {title}"
    else:
        summary = f"Resolución de Debate de SCoA sobre: {title}"
        
    summary = summary[:150] + "..." if len(summary) > 150 else summary


    # Auto-link scanning
    index_file = project_root / "vault" / "brain_index.json"
    auto_links = []
    notes_list = []
    full_text_to_scan = proposal + "\n" + "\n".join(critiques.values())
    if index_file.exists():
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                idx = json.load(f)
                for note_key, note_info in idx.get("notes", {}).items():
                    note_title = note_info.get("title", "")
                    note_filename = Path(note_info.get("filename", "")).stem
                    
                    # Store in list for semantic search later
                    notes_list.append({
                        "filename": note_filename,
                        "title": note_title,
                        "tags": note_info.get("tags", [])
                    })
                    
                    if note_filename == filename or note_title.lower() == title.lower() or note_filename.lower() == title.lower():
                        continue
                    
                    # Scan for either the title or the filename stem in the generated text
                    match_found = False
                    link_name = ""
                    if len(note_title) > 3 and note_title.lower() in full_text_to_scan.lower():
                        match_found = True
                        link_name = note_filename
                    elif len(note_filename) > 3 and note_filename.lower() in full_text_to_scan.lower():
                        match_found = True
                        link_name = note_filename
                        
                    if match_found and link_name:
                        auto_links.append(link_name)
        except Exception:
            pass
            
    # LLM-based Semantic Linking (AI-driven classification)
    if api_key_or_keys and notes_list:
        try:
            semantic_recommendations = get_semantic_links(api_key_or_keys, proposal, notes_list)
            for rec in semantic_recommendations:
                # Sanity filter: avoid linking to itself or duplicates
                if rec != filename and rec not in auto_links:
                    # Double-check that it exists in the notes list
                    if any(n["filename"] == rec for n in notes_list):
                        auto_links.append(rec)
        except Exception:
            pass
            
    frontmatter = (
        "---\n"
        f"title: \"Debate SCoA: {title}\"\n"
        f"category: \"{category}\"\n"
        f"tags: [\"scoa-debate\", \"{category}\"]\n"
        f"created: \"{datetime.now().strftime('%Y-%m-%d')}\"\n"
        f"updated: \"{datetime.now().strftime('%Y-%m-%d')}\"\n"
        "status: \"proposed\"\n"
        f"summary: \"{summary}\"\n"
        "---\n\n"
    )
    
    content = (
        f"# Debate SCoA: {title}\n\n"
        f"## El Dictamen del Abogado Supremo\n\n{critiques['dictamen']}\n\n"
        f"## Actas y Expediente del Tribunal\n\n"
        f"### ⚖️ Veredicto de Cohesión del Jurado\n{critiques['jurado']}\n\n"
        f"### 🔥 Acusaciones de la Fiscalía\n{critiques['fiscalia']}\n\n"
        f"### 🔍 Pruebas de los Analistas (Deep Research)\n{critiques['analistas']}\n\n"
        f"### 🏛️ Expediente Preparado por el Tribunal\n{critiques['tribunal']}\n"
    )
    
    # Always include a connection section pointing to the Welcome Hub to avoid orphan nodes
    content += "\n--- \n### Conexiones\n"
    content += "- [[Welcome Hub]]\n"
    if auto_links:
        for link in set(auto_links):
            if link != "Welcome Hub" and link != "welcome":
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
    
    if args.api_key:
        keys = args.api_key
    else:
        keys = get_api_keys()
        
    if isinstance(keys, dict):
        if not keys.get("GEMINI_API_KEY") and not keys.get("OPENROUTER_API_KEY"):
            print("Error: Neither GEMINI_API_KEY nor OPENROUTER_API_KEY found in environment or .env files.", file=sys.stderr)
            sys.exit(1)
    else:
        if not keys:
            print("Error: API Key override is empty.", file=sys.stderr)
            sys.exit(1)
        
    print(f"\n=== Commencing SCoA Debate Room ({args.category.upper()}) ===")
    
    async def run():
        async for msg in run_debate_stream(args.prompt, keys, args.category):
            stage = msg["stage"]
            if "status" in msg and msg["status"] == "start":
                print(f"\n>>> Calling {stage.upper()} Justice...")
            elif "chunk" in msg:
                # Decode chunk in ascii to prevent terminal encoding failures
                clean_chunk = msg["chunk"].encode("ascii", "ignore").decode("ascii")
                print(clean_chunk, end="", flush=True)
            elif "status" in msg and msg["status"] == "saved":
                print(f"\n\n[SUCCESS] Debate logged to vault: {msg['path']}")
            elif "error" in msg:
                print(f"\n[ERROR] In stage {stage}: {msg['error']}", file=sys.stderr)
                
    asyncio.run(run())

if __name__ == "__main__":
    main()
