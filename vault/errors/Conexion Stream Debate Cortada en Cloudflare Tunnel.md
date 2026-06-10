---
category: errors
created: '2026-06-10'
semantic_optimized_hash: 778e24efea375c36df3dbd9d38c693395484cb1ead023db2d25a33263d1aa569
status: resolved
summary: Resolución de cortes de conexión del stream de debate SSE debido a buffering
  y falta de keep-alive en Cloudflare Tunnel, y ReferenceError por resizeCanvas.
tags:
- project/antigravity
- tech/fastapi
- tech/cloudflare
- type/error
title: Conexión de Stream de Debate Cortada en Cloudflare Tunnel
updated: '2026-06-10'
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

--- 
## Conectado a
- [[Welcome Hub]]
- [[Obsidian Vault Not Found Error]]
- [[Offline Form Sync Queue with LocalStorage]]
- [[JavaScript Event Listener Patterns]]
- [[CSS Grid Collapsible Animation Pattern]]
- [[ScrollIntoView Conflicto con CSS Transitions]]
- [[SCoA API Integration and Free Tier]]
- [[Lag de Rendering en D3js por Consultas DOM en Tick]]
- [[SCoA HUD Diagnostics]]
- [[Empty Bearer Token Auth Bypass Crash]]
- [[JS Proxy Illegal Invocation and Constructor Prototype Loss]]
- [[Bloqueo de Interfaz Web por Sobrecarga de Reflows en Streams SSE]]
- [[Deadlock por Bloqueo de Lock en Llamada API de Larga Duracion]]
- [[Obsidian URI Protocol]]
- [[Descarga e Inspeccion Segura de Archivos en FastAPI]]
- [[Force Directed Graph Parameter Tuning]]
- [[Python PATH Execution Bug]]
- [[D3js Fisicas y Performance Avanzado]]
- [[welcome]]
- [[Stream Connection Drops on Mobile Suspend Resume]]
- [[Windows MOC]]
- [[Agent Debate Protocol]]
- [[Git Sync Proxy Read Timeout]]
- [[HUD Personalization Widget ID Mismatch]]
- [[Conexiones de Red Subestimadas en Estadisticas]]
- [[DOM Scroll Positioning Patterns]]
- [[Python List Type Annotation NameError]]
- [[CSS Utility Classes Pattern]]
- [[SCoA AI-Driven Semantic Linking with Fallback]]
- [[Second Brain Console Arquitectura]]
- [[Batch Script PowerShell Port and IP Querying]]
- [[FastAPI Endpoints - Patrones]]
- [[Asyncio Event Scheduler para DAG]]
- [[FastAPI Dynamic JS Rewriter Proxy]]
- [[Connection Radar - Implementación]]
- [[Enlazado Trilateral Contextual Automatizado]]
- [[Mobile Blank Screen and Mixed Content]]
- [[Windows Batch Parenthesis Syntax Crash]]
- [[FastAPI StaticFiles Directorio No Encontrado]]
- [[Git Remote Setup desde Web App]]
- [[Mobile Bottom Safe Area Iframe Margin]]
- [[Renderizado de Streams Asincronos con Control de Reflow en Frontend]]
- [[SPA Router Not Found behind Proxy]]
- [[Event Listeners Duplicados D3 Graph]]
- [[D3js Force Graph Implementacion]]
- [[test-note]]
- [[Browser Cache Impide Cargar JS Actualizado]]
- [[ScrollIntoView Desplaza Contenedor Equivocado]]