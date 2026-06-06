---
title: "Conexiones de Red Subestimadas en Estadísticas"
category: "errors"
status: "resolved"
tags:
  - "project/second-brain"
  - "tech/fastapi"
  - "type/error"
summary: "Resolución del bug en get_stats donde la API no usaba la normalización del indexador, subestimando las conexiones de wiki links y marcando erróneamente notas como huérfanas."
created: "2026-06-07"
updated: "2026-06-07"
---

# Conexiones de Red Subestimadas en Estadísticas

## ❌ Descripción del Bug
El panel de "Estadísticas del Vault" mostraba únicamente **53 conexiones** activas a pesar de tener 53 notas en total con más de 136 wiki-links en sus textos. Esto causaba además un conteo erróneo de 16 notas marcadas como huérfanas y un valor muy bajo de densidad del grafo.

## 🔍 Causa Raíz
El endpoint `/api/stats` en `backend/main.py` usaba una lógica de resolución de enlaces simplificada en comparación con el indexador principal (`rebuild_index_internal`):
1. **Falta de normalización alfanumérica**: El endpoint solo convertía a minúsculas (`.lower()`) en lugar de limpiar tildes y caracteres especiales mediante `normalize_string`. Esto rompía coincidencias de palabras con acentos (como "Sesión" o "diseño").
2. **Ignorar nombres de archivo (stems)**: El mapa de títulos del endpoint (`title_to_rel_paths`) solo registraba el título de la nota definido en el frontmatter. Si una nota enlazaba a otra mediante su nombre de archivo físico en disco (ej. `[[Sesion Desarrollo Second Brain 2026-06-07]]`) en lugar de su título enriquecido (ej. `"Sesión de Desarrollo - Second Brain 2026-06-07"`), el resolvedor determinaba que el enlace estaba roto.

## 🛠️ Solución Aplicada
Se refactorizó el endpoint `@app.get("/api/stats")` en [main.py](file:///c:/Users/Estudiante/Downloads/seond-brain/backend/main.py) para alinearse 1:1 con el indexador principal:
1. Se incorporó la función local `register_path(key, rel_path)` que ejecuta `normalize_string(key)`.
2. Se registran para cada nota activa el título del frontmatter, el `file_path.stem` y el path relativo sin extensión.
3. Se normaliza la clave destino (`target_key = normalize_string(target_title)`) antes de llamar al resolvedor de proximidad.

Tras aplicar los cambios y reiniciar el backend, las estadísticas se actualizaron correctamente a:
- **137 conexiones válidas** (antes 53).
- **0 notas huérfanas** (antes 16).
- **0.0497 de densidad del grafo** (antes 0.0192).

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-07]]
- **MOC Temático**: [[FastAPI MOC]]
- **Notas Afines**: [[Deadlock por Bloqueo de Lock en Llamada API de Larga Duración]], [[Caída de Autenticación por Cabecera Bearer Vacía en el Cliente]]