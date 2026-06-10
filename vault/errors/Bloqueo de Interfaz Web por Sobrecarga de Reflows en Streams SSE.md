---
title: "Bloqueo de Interfaz Web por Sobrecarga de Reflows en Streams SSE"
category: "errors"
status: "resolved"
tags:
  - "project/antigravity"
  - "tech/javascript"
  - "type/error"
summary: "Fallo de bloqueo en el hilo de renderizado del navegador al pintar actualizaciones SSE de alta frecuencia en el DOM, resuelto con Fetch ReadableStream y setTimeout."
created: "2026-06-10"
updated: "2026-06-10"
---

# ❌ Bloqueo de Interfaz Web por Sobrecarga de Reflows en Streams SSE

## Descripción del Problema
Al intentar realizar un debate de agentes (SCoA) en el panel de control remoto, el navegador web Chromium se quedaba congelado de forma indefinida ("La página no responde"), obligando al usuario a forzar el cierre de la pestaña o a esperar largos periodos de bloqueo.

## Análisis y Causa Raíz
1. **Frecuencia de Actualización Excesiva**: El backend emite eventos SSE a una velocidad muy alta durante las fases de deliberación.
2. **Saturación del Hilo Principal (Main Thread)**: El handler de `EventSource.onmessage` insertaba cada micro-chunk directamente en el DOM llamando a `consoleEl.innerText += chunk`.
3. **Reflows Ininterrumpidos**: Modificar el texto del DOM a una velocidad de cientos de veces por segundo obliga al navegador a recalcular layouts de forma continua (reflow y repaint). Al no dar respiro al planificador de tareas del navegador, se colapsa la cola de eventos de la interfaz de usuario.

## Solución Aplicada
1. **Migración a Fetch y ReadableStream**: En lugar de `EventSource`, se implementó una consulta asíncrona mediante `fetch()` leyendo el stream mediante un lector recursivo (`ReadableStream.getReader()`).
2. **Yielding en el Bucle del Stream**: Se introdujo una pausa controlada en cada ciclo de lectura del buffer utilizando `await new Promise(resolve => setTimeout(resolve, 0))`. Esto cede temporalmente el control al bucle de eventos del navegador, permitiendo realizar repaints y procesar clicks de botones.
3. **Optimización del Renderizado**: Durante el streaming se inyecta texto plano rápido (`innerText`), y únicamente cuando el estado de la fase es `done` se realiza un parseo Markdown completo a HTML (`innerHTML`), reduciendo los reflows costosos.

---
## Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-10]]
- **MOC Temático**: [[Welcome Hub]]
- **Notas Afines**: [[Renderizado de Streams Asincronos con Control de Reflow en Frontend]], [[Conexion Stream Debate Cortada en Cloudflare Tunnel]]
