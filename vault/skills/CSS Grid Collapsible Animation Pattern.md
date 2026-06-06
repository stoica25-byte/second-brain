---
category: skills
created: 2026-06-03
status: active
summary: CSS Grid Collapsible Animation Pattern Técnica moderna para animar la expansión
  y colapso de contenido con altura descon...
tags:
- type/skill
- tech/css
- tag/animation
- tag/grid
- tag/collapsible
- tag/transitions
- tag/patterns
- tag/frontend
title: CSS Grid Collapsible Animation Pattern
updated: 2026-06-03
---

# CSS Grid Collapsible Animation Pattern

Técnica moderna para animar la expansión y colapso de contenido con altura desconocida, sin usar JavaScript para calcular `max-height`.

## El Problema Clásico
CSS no puede animar `height: 0` → `height: auto` directamente. La solución legacy era usar `max-height` con un valor arbitrario alto, pero esto genera:
- Delays visibles si `max-height` es mucho mayor que el contenido real
- Cortes si el contenido es más alto que el `max-height`

## La Solución: grid-template-rows

```css
/* Estado colapsado */
.collapsible {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.25s ease;
    opacity: 0;
}

/* Estado expandido */
.parent.expanded .collapsible {
    grid-template-rows: 1fr;
    opacity: 1;
}

/* El hijo directo DEBE tener overflow: hidden */
.collapsible > .content {
    overflow: hidden;
}
```

```html
<div class="parent">
    <div class="header">Título (siempre visible)</div>
    <div class="collapsible">
        <div class="content">
            <!-- Contenido de altura variable -->
            <p>Texto largo que se expande...</p>
        </div>
    </div>
</div>
```

## Por Qué Funciona
1. `grid-template-rows: 0fr` → la fila ocupa 0 espacio (mínimo posible)
2. `grid-template-rows: 1fr` → la fila ocupa todo el espacio necesario (equivalente a `auto`)
3. CSS **sí puede** interpolar entre `0fr` y `1fr`, a diferencia de `0` → `auto`
4. `overflow: hidden` en el hijo evita que el contenido se desborde cuando está colapsado

## ⚠️ Cuidado: Conflicto con Scroll

Si necesitas calcular la posición de scroll de un elemento que usa esta técnica, **desactiva la transición primero**:

```javascript
container.classList.add("no-transitions");
element.classList.add("expanded");
element.offsetHeight; // Forzar reflow
// Ahora getBoundingClientRect() devuelve la altura final real
```

Ver [[DOM Scroll Positioning Patterns]] para el patrón completo.

## Compatibilidad
- ✅ Chrome 107+ (Oct 2022)
- ✅ Firefox 116+ (Aug 2023)
- ✅ Safari 16.4+ (Mar 2023)
- ✅ Edge 107+

## Alternativa Legacy: max-height
Para navegadores antiguos que no soportan la interpolación de `fr`:

```css
.collapsible-legacy {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
}
.parent.expanded .collapsible-legacy {
    max-height: 2000px; /* Valor arbitrario alto */
}
```

---
*Notas Relacionadas:*
- [[DOM Scroll Positioning Patterns]]
- [[CSS Utility Classes Pattern]]
- [[ScrollIntoView Conflicto con CSS Transitions]]