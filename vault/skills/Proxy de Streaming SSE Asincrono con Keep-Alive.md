---
title: "Proxy de Streaming SSE Asíncrono con Keep-Alive"
category: "skills"
status: "active"
tags:
  - "project/antigravity"
  - "tech/fastapi"
  - "tech/httpx"
  - "type/pattern"
summary: "Patrón para proxies de streaming Server-Sent Events (SSE) asíncronos que envían pings periódicos y cabeceras anti-buffering para evitar cierres de Cloudflare."
created: "2026-06-10"
updated: "2026-06-10"
---

# 📌 Proxy de Streaming SSE Asíncrono con Keep-Alive

Este patrón permite implementar proxies de transmisión de eventos del servidor (Server-Sent Events) en FastAPI que no sufren desconexiones al ser expuestos a través de túneles como **Cloudflare Tunnel** o Nginx con buffering activado.

## Implementación de Referencia en FastAPI

```python
import asyncio
import json
import httpx
from fastapi import FastAPI, Query
from fastapi.responses import StreamingResponse

app = FastAPI()

@app.get("/api/proxy/stream")
async def stream_proxy(target_url: str):
    # Definición del generador asíncrono
    async def forward_stream():
        try:
            # timeout=None es obligatorio para streams persistentes
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", target_url) as r:
                    iterator = r.aiter_lines().__aiter__()
                    while True:
                        try:
                            # Esperar hasta 15s por el siguiente fragmento
                            line = await asyncio.wait_for(iterator.__anext__(), timeout=15.0)
                            if line:
                                yield line + "\n\n"
                        except asyncio.TimeoutError:
                            # Comentario SSE para mantener viva la conexion en Cloudflare
                            yield ": ping\n\n"
                        except StopAsyncIteration:
                            break
        except Exception as err:
            yield f"data: {json.dumps({'status': 'error', 'message': str(err)})}\n\n"

    # Cabeceras cruciales para impedir que los proxies hagan buffer del stream
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    }
    return StreamingResponse(forward_stream(), media_type="text/event-stream", headers=headers)
```

## Beneficios
1. **Evita el Buffering**: `X-Accel-Buffering: no` y `Cache-Control: no-cache` forzarán a proxies intermedios a emitir los fragmentos inmediatamente sin acumularlos.
2. **Previene Expiración por Silencio**: El envío regular del comentario `: ping\n\n` previene que Cloudflare decida terminar la conexión inactiva (que usualmente expira a los 30 segundos).
3. **No Bloquea el Threadpool**: Al usar `httpx` de forma asíncrona en lugar de `requests` síncrono, se previene el consumo ineficiente de hilos del servidor.
