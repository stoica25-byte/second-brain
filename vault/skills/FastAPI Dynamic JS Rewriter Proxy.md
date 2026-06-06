---
category: skills
created: 2026-06-04
status: active
summary: Reescritura Dinámica de Scripts en Proxy FastAPI Patrón de desarrollo para
  interceptar y modificar archivos estáticos (H...
tags:
- type/skill
- tech/fastapi
- tech/python
- tag/regex
- tag/proxy
- tag/assets
title: Reescritura Dinámica de Scripts en Proxy FastAPI
updated: 2026-06-04
---

# Reescritura Dinámica de Scripts en Proxy FastAPI

Patrón de desarrollo para interceptar y modificar archivos estáticos (HTML y JS) servidos a través de un proxy inverso de FastAPI (`requests` de Python) con el objetivo de redirigir URLs hardcodeadas de APIs locales a un túnel seguro remoto (`window.location.origin`).

## Implementación

En la ruta de proxy de FastAPI, se captura la respuesta y se interceptan los tipos de archivo adecuados utilizando la cabecera `Content-Type`:

```python
import re
import requests
from fastapi import FastAPI, Request, Response, HTTPException

app = FastAPI()

@app.api_route("/api/proxy/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def dynamic_proxy(path: str, request: Request):
    target_url = f"http://localhost:56523/{path}"
    
    # Limpiar cabeceras del Host
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    
    try:
        res = requests.request(
            method=request.method,
            url=target_url,
            headers=headers,
            data=await request.body() if request.method in ("POST", "PUT") else None,
            verify=False
        )
        
        content_type = res.headers.get("Content-Type", "")
        
        # 1. Reescribir el HTML raíz para forzar a usar recursos del proxy
        if path in ("", "index.html") and "text/html" in content_type:
            html = res.text.replace('src="/main.js"', 'src="main.js"')
            return Response(content=html, media_type="text/html", status_code=res.status_code)
            
        # 2. Reemplazar baseUrl dinámicamente en el JS bundle al vuelo
        if path.endswith("main.js"):
            js = res.text.replace(
                "get baseUrl(){return`https://127.0.0.1:${this.port}`}",
                "get baseUrl(){return`${window.location.origin}/api/proxy`}"
            )
            headers_cache = {
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
            }
            return Response(content=js, media_type="application/javascript", status_code=res.status_code, headers=headers_cache)
            
        # 3. Retornar respuestas binarias crudas para evitar corrupción de assets
        return Response(content=res.content, media_type=content_type, status_code=res.status_code)
        
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
```

## Beneficios
- **Cero cambios en producción**: El código del cliente SPA original se mantiene sin modificar; la adaptación se realiza en caliente en la capa intermedia de backend.
- **Sin problemas de SSL/TLS**: Resuelve Mixed Content al convertir todas las peticiones a HTTPS seguro provisto por la URL pública.
- **Bypass de CORS**: El origen de las APIs coincide con el origen del script (`window.location.origin`), por lo que no se requiere configuración de CORS para dispositivos externos.

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-04]]
- **MOC Temático**: [[FastAPI MOC]]
- **Notas Afines**: [[Conexiones de Red Subestimadas en Estadísticas]], [[Deadlock por Bloqueo de Lock en Llamada API de Larga Duración]]