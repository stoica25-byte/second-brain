---
category: errors
created: 2026-06-07
semantic_optimized_hash: 8d04e5e5e7b84e0a5134412a1d87902b73b9c69385f5cadda191568de0f33cbf
status: resolved
summary: "Deadlock por Bloqueo de Lock en Llamada API de Larga Duración \U0001F534
  El Problema La interfaz se quedaba permanentemente conge..."
tags:
- type/error
- tag/type/error
- tag/tag/type/error
- tech/fastapi
- tag/tag/tag/deadlock
- tag/tag/tag/locks
- tag/tag/tag/timeouts
- tag/tag/tag/api-client
title: Deadlock por Bloqueo de Lock en Llamada API de Larga Duración
updated: '2026-06-07'
---

# Deadlock por Bloqueo de Lock en Llamada API de Larga Duración

## 🔴 El Problema
La interfaz se quedaba permanentemente congelada en el estado `⚡ OPTIMIZANDO...` y el backend dejaba de responder a cualquier petición de escritura o lectura protegida.

## 🔍 Causa Raíz
El bug se produjo por la combinación de dos factores:

1. **Ausencia de Timeouts en Conexiones HTTP**: Las funciones `call_gemini_stream_sync` y `call_openrouter_stream_sync` utilizaban `urllib.request.urlopen(req)` sin especificar un parámetro de `timeout`. Ante cualquier retraso o caída de conexión con Gemini/OpenRouter, el hilo de Python quedaba bloqueado indefinidamente esperando respuesta del socket TCP.
2. **Ámbito Excesivo de Locks Asíncronos (`write_lock`)**: El endpoint `/api/notes/optimize-links` envolvía toda su ejecución dentro de `async with write_lock:`. Al quedar bloqueada la llamada a la API de la IA dentro de este bloque, el lock nunca se liberaba, provocando un deadlock en cualquier otra llamada del backend que intentase adquirir el mismo lock.

## 🚀 Solución Aplicada

### 1. Establecer Timeouts Claros
Se modificaron las invocaciones de `urlopen` en [debate_engine.py](file:///c:/Users/Estudiante/Downloads/seond-brain/backend/debate_engine.py) para forzar un límite de 15 segundos:
```python
# Antes
with urllib.request.urlopen(req) as response:

# Después
with urllib.request.urlopen(req, timeout=15) as response:
```
Esto asegura que si la API de la IA se cuelga, la llamada fallará limpiamente tras 15 segundos, permitiendo continuar o reportar el error en vez de colgar el hilo del servidor.

### 2. Acotar el Ámbito del Lock
Se refactorizó el endpoint en [main.py](file:///c:/Users/Estudiante/Downloads/seond-brain/backend/main.py) para adquirir `write_lock` únicamente durante las operaciones críticas de disco (lectura/escritura de notas y reconstrucción de índices), liberándolo durante las llamadas a la IA y los retardos de rate limiting:
```python
# Correcto: El lock solo se adquiere en el momento de escribir
async with write_lock:
    await save_note_atomically(file_path, frontmatter.dumps(post))
```

## 💡 Lecciones Aprendidas
- **Nunca** realices llamadas a servicios de red externos (como APIs de LLMs o webhooks) mientras sostienes un lock de recurso local (`asyncio.Lock`, mutexes, locks de base de datos).
- Configura siempre un parámetro de `timeout` explícito en cualquier cliente HTTP (`urllib`, `requests`, `httpx`).

---

## 🔗 Conexiones
- [[Welcome Hub]]
- [[Git Sync Proxy Read Timeout]]
- [[FastAPI Endpoints - Patrones]]
- [[FastAPI StaticFiles Directorio No Encontrado]]