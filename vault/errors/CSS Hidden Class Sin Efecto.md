---
title: "Error: Clase .hidden Sin Efecto en CSS"
category: errors
status: resolved
tags:
  - error
  - css
  - javascript
  - debug
created: 2026-06-03
updated: 2026-06-03
---
# Error: Clase .hidden Sin Efecto en CSS

## Error Details
- **Environment**: Second Brain Console - Frontend
- **Symptom**: El Connection Radar (ego-graph) nunca aparecía al abrir una nota. La sección `#ego-radar-section` tenía la clase `hidden` en el HTML inicial y el JS hacía `classList.remove("hidden")`, pero el elemento no aparecía.

## Root Cause Analysis
La clase `.hidden` **no estaba definida** en `style.css`. El HTML y JS la usaban como utilidad genérica pero nunca se añadió la regla CSS correspondiente.

```javascript
// El JS hacía esto:
radarSection.classList.remove("hidden"); // ← No hacía nada porque .hidden no ocultaba nada
radarSection.classList.add("hidden");    // ← Tampoco ocultaba
```

Sin la regla CSS, la clase era solo un atributo decorativo sin efecto visual.

## Solución Aplicada

Añadir la regla global al principio de `style.css`:

```css
/* Global utility: hides any element */
.hidden {
    display: none !important;
}
```

El `!important` es necesario para que la clase tenga prioridad sobre cualquier `display` que otros selectores puedan definir.

## Síntomas Adicionales Relacionados
Otros elementos que usaban `classList.add/remove("hidden")` también podían estar afectados:
- `#view-graph-container` (Mapa Global)
- `#view-timeline-container`
- `#scoa-progress-container`
- `#inbox-empty`

## Prevention & Learnings
- Siempre definir las clases utilitarias (`.hidden`, `.visible`, `.active`) en un reset global al inicio del CSS
- Al debuggear elementos que no aparecen/desaparecen, verificar que la clase CSS existe antes de asumir que el JS falla
- Conectado a: [[Connection Radar - Implementación]], [[CSS Utility Classes Pattern]]
