---
category: skills
created: '2026-06-07'
semantic_optimized_hash: eb8ce7d7b697c164016e87f71c23629b8c760f2f1a7b55d0d3841d83e4d6a53b
status: active
summary: Patrón técnico para exponer archivos del workspace local y sesiones del agente
  de forma segura limitando extensiones e impidiendo path traversal en FastAPI.
tags:
- project/antigravity
- tech/fastapi
- type/pattern
title: Descarga e Inspección Segura de Archivos Locales en FastAPI
updated: '2026-06-10'
---

# Descarga e Inspección Segura de Archivos Locales en FastAPI

Al exponer directorios locales a través de APIs web (especialmente en entornos remotos o accesibles por túneles públicos), es imperativo limitar las lecturas a archivos no sensibles y bloquear intentos de escape del directorio raíz.

## Implementación en FastAPI

### 1. Validación de Path Traversal
Para evitar el acceso a archivos de sistema mediante inyecciones como `../../`, se debe verificar que la ruta absoluta resultante resida estrictamente dentro del directorio configurado como raíz:

```python
import os
from fastapi import HTTPException

def secure_resolve_path(root_dir: str, rel_path: str) -> str:
    # Bloquear referencias obvias a directorios superiores
    if ".." in rel_path or rel_path.startswith("/") or rel_path.startswith("\\"):
        raise HTTPException(status_code=400, detail="Ruta inválida")
        
    abs_root = os.path.abspath(root_dir)
    file_path = os.path.abspath(os.path.join(abs_root, rel_path))
    
    # Confirmar que el archivo sigue estando dentro del directorio raíz
    if not file_path.startswith(abs_root):
        raise HTTPException(status_code=403, detail="Acceso denegado")
        
    return file_path
```

### 2. Filtro de Extensiones de Texto Permitidas
Para impedir la lectura de binarios pesados o archivos de bases de datos configurables (`.db`, `.sqlite`, `.exe`), se define una lista blanca de extensiones permitidas:

```python
VALID_EXTENSIONS = {
    ".html", ".css", ".js", ".py", ".json", ".md", 
    ".txt", ".bat", ".ps1", ".yml", ".yaml", ".sh", ".vbs"
}

ext = os.path.splitext(file_path)[1].lower()
if ext not in VALID_EXTENSIONS:
    raise HTTPException(status_code=400, detail="Tipo de archivo no permitido")
```

## Beneficios
* **Aislamiento**: Los agentes o interfaces web solo leen archivos estrictamente relacionados con el desarrollo del proyecto o sus sesiones de chat.
* **Compatibilidad Móvil**: Permite que el frontend lea directamente textos planos y los represente en el visor del dispositivo móvil.

## 🔗 Conexiones
* **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-07]]
* **MOC Temático**: [[FastAPI MOC]]

--- 
## Conectado a
- [[Welcome Hub]]
- [[FastAPI Dynamic JS Rewriter Proxy]]
- [[Mobile Blank Screen and Mixed Content]]
- [[FastAPI StaticFiles Directorio No Encontrado]]
- [[Second Brain Console Arquitectura]]
- [[Python PATH Execution Bug]]
- [[FastAPI Endpoints - Patrones]]