---
category: skills
created: 2026-06-04
status: active
summary: Safe Area Notch Spacing in Embedded Webview Contexto En layouts web adaptados
  a móviles (responsive), el uso de permite...
tags:
- type/skill
- tag/type/skill
- tag/tag/type/skill
- tag/tag/tag/layout
- tech/css
- tag/tag/tag/ios
- tag/tag/tag/responsive
title: Safe Area Notch Spacing in Embedded Webview
updated: 2026-06-04
---

# Safe Area Notch Spacing in Embedded Webview

## Contexto
En layouts web adaptados a móviles (responsive), el uso de `viewport-fit=cover` permite que la aplicación aproveche todo el tamaño físico de la pantalla. Sin embargo, en dispositivos iOS (iPhones con notch o Dynamic Island), las barras del sistema (reloj, nivel de batería) y los agujeros físicos de la cámara se solapan con elementos interactivos situados en la parte superior.

Cuando un panel o iframe embebido se expande al 100% de la altura de forma transparente, es necesario empujar su contenido interactivo por debajo del área segura del notch.

## Patrón de Diseño
Aplicar la variable CSS `env(safe-area-inset-top)` con un fallback adecuado (`34px` o `44px`) en el contenedor del iframe de forma condicional para las vistas móviles.

```css
@media (max-width: 768px) {
  #panel-antigravity-ide {
    padding: 0 !important;
    padding-top: env(safe-area-inset-top, 34px) !important;
    height: 100%;
  }
}
```

Esto garantiza que:
1. En dispositivos con notch, el panel se desplace exactamente por debajo de la cámara/status bar.
2. En navegadores o dispositivos sin notch, aplique un fallback limpio de `34px` evitando superposiciones con los controles del navegador.
3. El iframe interno se autoajusta al tamaño restante debido a `box-sizing: border-box`.