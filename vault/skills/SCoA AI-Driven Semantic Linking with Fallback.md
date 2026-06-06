---
category: skills
created: '2026-06-04'
status: active
summary: Patrón de enlazado semántico automatizado con fallback a OpenRouter cuando
  la API Key de Gemini supera su cuota o falla.
tags:
- type/skill
- tag/type/skill
- tag/tag/type/skill
- project/scoa
- tag/tag/tag/ai
- tag/tag/tag/semantic-linking
- tag/tag/tag/openrouter
- tag/tag/tag/gemini
- tag/tag/tag/fallback
title: 'SCoA: Enlazado Semántico por IA con Fallback'
updated: '2026-06-04'
---

# SCoA: Enlazado Semántico por IA con Fallback

Esta habilidad describe el patrón técnico utilizado en el motor de debates **SCoA (Supreme Court of Agents)** para generar conexiones semánticas inteligentes entre notas nuevas y notas existentes del vault de Obsidian.

---

## 1. Concepto de Enlazado Semántico
A diferencia del enlazado simple por texto exacto (que escanea títulos o términos concretos), el enlazado semántico utiliza un LLM para evaluar la propuesta técnica redactada y relacionarla con otras notas que compartan temas generales, arquitecturas afines, tecnologías o conceptos abstractos subyacentes.

Esto evita que las notas generadas queden como nodos huérfanos y enriquece la topología del grafo del Second Brain.

---

## 2. Flujo de Control con Fallback Resiliente

Para asegurar que el proceso de enlazado no falle si la cuota de la API Key principal de Gemini está agotada (error 429), se implementa un fallback dinámico a OpenRouter.

```mermaid
graph TD
    A[Inicio de Enlazado Semántico] --> B{¿Hay clave Gemini?}
    B -- Sí --> C[Intentar clasificar con Gemini]
    B -- No --> D{¿Hay clave OpenRouter?}
    C -- Éxito --> E[Retornar array JSON de links]
    C -- Excepción / 429 --> D
    D -- Sí --> F[Intentar clasificar con OpenRouter Free]
    D -- No --> G[Retornar vacío []]
    F -- Éxito --> E
    F -- Excepción --> G
```

---

## 3. Implementación del Clasificador Semántico

El método `get_semantic_links` recibe la propuesta, un listado de metadatos de las notas existentes (nombre, título, tags) y la estructura de claves de la API para decidir de manera transparente qué canal utilizar:

```python
def get_semantic_links(api_key_or_keys: Any, proposal: str, notes_list: List[dict]) -> List[str]:
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
        "Devuelve ÚNICAMENTE un array JSON que contenga los nombres exactos (filename) de las notas recomendadas, sin explicaciones ni formato markdown de código.\n"
        "Ejemplo de salida:\n"
        "[\"Nota A\", \"Nota B\"]\n"
        "Si ninguna nota es relevante, devuelve un array vacío []."
    )
    
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
    
    # 1. Intentar Gemini
    if gemini_key:
        try:
            iterator = call_gemini_stream_sync(gemini_key, system_instruction, user_prompt)
            response_text = "".join(list(iterator))
        except Exception:
            pass
            
    # 2. Fallback a OpenRouter
    if not response_text and openrouter_key:
        try:
            iterator = call_openrouter_stream_sync(openrouter_key, system_instruction, user_prompt)
            response_text = "".join(list(iterator))
        except Exception:
            pass
            
    if not response_text:
        return []
        
    try:
        response_text = re.sub(r'```(?:json)?|```', '', response_text).strip()
        match = re.search(r'\[\s*".*?"\s*\]|\[\s*\]', response_text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        items = re.findall(r'"([^"]+)"', response_text)
        return [item.strip() for item in items if item.strip()]
    except Exception:
        return []
```

---

## 4. Mitigaciones y Reglas de Sanidad
1. **Prevención de bucles y autoreferencias**: Filtrar la recomendación devuelta por la IA para asegurar que la nota nunca se enlace a sí misma (comparando contra el nombre final del archivo generado).
2. **Validación de Existencia**: Comprobar que los nombres recomendados realmente existan en el vault (`any(n["filename"] == rec for n in notes_list)`) antes de añadirlos.
3. **Evitar huérfanos**: Asegurar siempre un enlace por defecto a `[[Welcome Hub]]` en la sección de Conexiones de manera estructural.

---

## Véase también
- [[Welcome Hub]]
- [[Agent Debate Protocol]]
- [[SCoA API Integration and Free Tier]]