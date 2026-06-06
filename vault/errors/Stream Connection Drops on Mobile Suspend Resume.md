---
category: errors
created: 2026-06-04
status: resolved
summary: Stream Connection Drops on Mobile Suspend/Resume El Error Al cerrar el navegador
  móvil, bloquear el terminal o cambiar d...
tags:
- type/error
- tag/type/error
- tag/tag/type/error
- tag/tag/tag/mobile
- tag/tag/tag/network
- tag/tag/tag/grpc
- tag/tag/tag/debugging
title: Stream Connection Drops on Mobile Suspend Resume
updated: 2026-06-04
---

# Stream Connection Drops on Mobile Suspend/Resume

## El Error
Al cerrar el navegador móvil, bloquear el terminal o cambiar de aplicación en iOS/Android, el sistema suspende la ejecución de JavaScript y aborta de forma abrupta las conexiones HTTP/gRPC persistentes. 

Al reactivar el navegador, la aplicación SPA intenta reanudar las subscripciones a streams (ej. `ProjectUpdates`, `TrajectorySummaries`, `AppState`), arrojando errores en consola como:
- `stream error: ConnectError: [unknown] missing trailer`
- `stream error: ConnectError: [unknown] Failed to fetch`

Estos errores son normales en la reconexión de redes móviles, pero el script de depuración `dbg-overlay` los interceptaba a través de `console.error` mostrando banners rojos de error persistentes que confundían al usuario.

## Solución
Implementar filtros condicionales en el capturador del `dbg-overlay` para omitir y no pintar en pantalla los mensajes asociados a caídas de streams y fallos de fetch comunes por suspensión del dispositivo, manteniendo el logging limpio para errores de sintaxis o runtime críticos reales.

```javascript
function showErr(msg, stack) {
    if (!msg) return;
    var msgStr = String(msg);
    if (msgStr.indexOf('stream error') !== -1 || 
        msgStr.indexOf('missing trailer') !== -1 || 
        msgStr.indexOf('Failed to fetch') !== -1 || 
        msgStr.indexOf('ConnectError') !== -1) {
        return; // Ignorar desconexiones normales por suspensión/reanudación
    }
    // Mostrar errores reales en el banner...
}
```