---
title: "Conexión de Stream de Debate Cortada en Cloudflare Tunnel"
category: "errors"
status: "resolved"
tags:
  - "project/antigravity"
  - "tech/fastapi"
  - "tech/cloudflare"
  - "type/error"
summary: "Resolución de cortes de conexión del stream de debate SSE debido a buffering y falta de keep-alive en Cloudflare Tunnel, y ReferenceError por resizeCanvas."
created: "2026-06-10"
updated: "2026-06-10"
---

# ❌ Conexión de Stream de Debate Cortada en Cloudflare Tunnel

## Descripción del Problema
Al intentar realizar un debate de agentes (SCoA), la conexión del stream Server-Sent Events (SSE) se perdía de forma abrupta al poco tiempo con el mensaje: `[ERROR] Se perdió la conexión con el stream de debate.` y en el log del Cloudflare Tunnel figuraba `stream canceled by remote with error code 0`. Al mismo tiempo, la interfaz web del control remoto mostraba desconexión persistente y los botones no respondían debido a un error de ejecución en `DOMContentLoaded`.

## Análisis y Causa Raíz
1. **Falta de Keep-Alives en SSE**: El proxy de debate en FastAPI (`api/index.py`) utilizaba `requests.get` de forma síncrona. Si el debate no emitía eventos frecuentemente, Cloudflare cortaba la conexión por inactividad.
2. **Buffering del Proxy**: Ausencia de cabeceras de desactivación de buffering como `X-Accel-Buffering: no` y `Cache-Control: no-cache` que forzaran a Cloudflare a streamear los fragmentos de forma inmediata en lugar de acumularlos.
3. **ReferenceError de JavaScript**: En `frontend/app.js` se llamaba a `resizeCanvas()` dentro del listener de redimensión. Al haber removido el canvas de D3 en la actualización anterior de archivos, esto arrojaba un `ReferenceError` que bloqueaba el resto de la ejecución inicial de JavaScript, deshabilitando todos los eventos de los botones.
4. **Fallo de persistencia de URL**: El autodescubrimiento local del puerto del IDE (`discover`) actualizaba la URL en memoria, pero no la persistía en `localStorage`, provocando que pings futuros consultaran el puerto obsoleto almacenado en caché.

## Solución Aplicada
1. **Proxy SSE Asíncrono**: Refactorización de la llamada con `httpx.AsyncClient` y uso de `asyncio.wait_for` para interceptar silencios mayores a 15 segundos y emitir un comentario SSE `: ping\n\n` que mantiene el canal del túnel abierto.
2. **Cabeceras de Stream**: Inclusión de cabeceras de no-cache y no-buffering.
3. **Remoción de código D3 obsoleto**: Eliminación de la llamada a `resizeCanvas()`.
4. **Persistencia**: Llamar a `saveSettings()` tras el autodescubrimiento exitoso del IDE.
