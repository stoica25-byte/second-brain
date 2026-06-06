---
category: errors
created: 2026-06-03
status: resolved
summary: 'Error: scrollIntoView Desplaza el Contenedor Equivocado Error Details Al
  usar en un layout con múltiples contenedores co...'
tags:
- type/error
- tag/type/error
- tag/tag/type/error
- tech/javascript
- tag/tag/tag/scroll
- tag/tag/tag/layout
- tag/tag/tag/overflow
- tag/tag/tag/debug
title: 'Error: scrollIntoView Desplaza el Contenedor Equivocado'
updated: 2026-06-03
---

# Error: scrollIntoView Desplaza el Contenedor Equivocado

## Error Details
Al usar `element.scrollIntoView({ behavior: "smooth", block: "start" })` en un layout con múltiples contenedores con `overflow: auto`, el navegador a veces desplaza el `body` o un contenedor padre inesperado en vez del panel scrollable real donde reside el elemento.

## Causa Raíz
`scrollIntoView` busca **todos los ancestros scrollables** del elemento y puede desplazar cualquiera de ellos (o todos) para hacer visible el elemento. En un dashboard con layout de paneles:

```
body (overflow: hidden)
  └─ main (display: flex)
      ├─ panel-left (overflow-y: auto)   ← scrollable
      ├─ panel-center
      │   └─ timeline-viewport (overflow-y: auto)  ← scrollable
      │       └─ timeline-stream (overflow-y: auto)  ← scrollable
      │           └─ timeline-card  ← TARGET
      └─ panel-right (overflow-y: auto)  ← scrollable
```

Si hay **dos niveles de overflow** (viewport + stream), `scrollIntoView` puede elegir desplazar el viewport en vez del stream, o ambos a la vez, generando un scroll impredecible.

## Síntomas
- `scrollIntoView` funciona en algunas tarjetas pero no en otras
- El panel entero se desplaza de forma errática
- El elemento objetivo queda visible pero **no alineado** donde se esperaba

## Solución
Usar `scrollTo` directamente sobre el **contenedor de scroll correcto**:

```javascript
// ❌ INCORRECTO: scrollIntoView elige su propio contenedor
activeCard.scrollIntoView({ behavior: "smooth", block: "start" });

// ✅ CORRECTO: calcular offset y scroll en el contenedor específico
const container = document.getElementById("timeline-stream");
const relativeTop = activeCard.getBoundingClientRect().top 
    - container.getBoundingClientRect().top 
    + container.scrollTop;

container.scrollTo({
    top: Math.max(0, relativeTop - 10),  // 10px de margen visual
    behavior: "smooth"
});
```

### Prevención: Eliminar overflow redundantes
Si hay dos contenedores anidados con `overflow-y: auto`, el de afuera no debería ser scrollable:

```css
/* Contenedor exterior: NO scrollable */
.timeline-viewport {
    overflow: hidden;  /* ← cambiar de auto a hidden */
}

/* Contenedor interior: ÚNICO scrollable */
.timeline-stream {
    overflow-y: auto;
}
```

## Lección Clave
> **No usar `scrollIntoView` en layouts con múltiples contenedores scrollables anidados.** Calcular el offset manualmente con `getBoundingClientRect()` y usar `container.scrollTo()` sobre el contenedor de scroll específico. Además, asegurarse de que **solo un nivel** del DOM tiene `overflow: auto` por columna.

---
*Notas Relacionadas:*
- [[ScrollIntoView Conflicto con CSS Transitions]]
- [[CSS Hidden Class Sin Efecto]]