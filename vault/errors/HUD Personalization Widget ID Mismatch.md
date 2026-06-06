---
category: errors
created: 2026-06-04
status: resolved
summary: Discrepancia en IDs de Checkboxes de Personalización del HUD Descripción
  del Bug Al marcar o desmarcar las casillas para...
tags:
- type/error
- tech/javascript
- tech/html
- tag/bug
- tag/frontend
title: Discrepancia en IDs de Checkboxes de Personalización del HUD
updated: 2026-06-04
---

# Discrepancia en IDs de Checkboxes de Personalización del HUD

## Descripción del Bug
Al marcar o desmarcar las casillas para ocultar o mostrar widgets del dashboard (diagnósticos, capturas, debates, etc.), la interfaz no realizaba ninguna acción. Los cambios no se persistían al recargar la página.

## Causa Raíz
Había una discrepancia entre los identificadores (IDs) de los elementos checkbox definidos en `index.html` y la lógica que los controlaba en `app.js`:
- En `index.html` los checkboxes tenían IDs abreviados como `chk-wdg-telemetry`, `chk-wdg-capture`, etc.
- En `app.js` la lógica iteraba usando la clave del widget original (`widget-telemetry`, etc.), buscando en el DOM identificadores de la forma `chk-widget-telemetry`, `chk-widget-capture`.

Al no encontrar el elemento con ID `chk-widget-*`, la variable `chk` resultaba `null`. Al intentar leer la propiedad `.checked` en `toggleWidgetVisibility`:
`if (chk.checked) { ... }`
El script arrojaba un error de tipo `TypeError: Cannot read properties of null (reading 'checked')` y detenía la ejecución de JavaScript de la página. Esto impedía guardar las preferencias en `localStorage` y bloqueaba otros flujos interactivos de la UI en dispositivos móviles.

## Solución Aplicada
Se renombraron todos los IDs de los checkboxes de visibilidad en el archivo `index.html` para alinearse con la estructura que gestiona el script:
- `chk-wdg-telemetry` -> `chk-widget-telemetry`
- `chk-wdg-capture` -> `chk-widget-capture`
- `chk-wdg-debate` -> `chk-widget-debate`
- `chk-wdg-recent` -> `chk-widget-recent`
- `chk-wdg-antigravity` -> `chk-widget-antigravity`

Tras este cambio, la manipulación de visibilidad funciona correctamente en ordenadores y teléfonos, y el estado de visibilidad de los paneles se persiste de forma transparente entre recargas.