---
title: "Error: Event Listeners Duplicados en D3 Graph"
category: errors
status: resolved
tags:
  - error
  - javascript
  - d3js
  - eventos
  - performance
created: 2026-06-03
updated: 2026-06-03
---
# Error: Event Listeners Duplicados en D3 Graph

## Error Details
- **Environment**: Second Brain Console - Global Graph (Mapa Global)
- **Symptom**: Al cambiar los filtros del grafo (checkboxes de categoría), el gráfico se re-renderizaba múltiples veces de forma exponencial. Después de N cambios de filtros, cada checkbox disparaba N+1 handlers simultáneamente.

## Root Cause Analysis

La función `initGlobalGraph()` registraba event listeners en los checkboxes **dentro del propio cuerpo de la función**:

```javascript
function initGlobalGraph() {
    // ... renderiza grafo ...
    
    // ❌ BUG: Esto se ejecuta cada vez que initGlobalGraph() es llamada
    document.querySelectorAll(".graph-filter-chk").forEach(chk => {
        chk.addEventListener("change", () => {
            // Este handler llama a initGlobalGraph() de nuevo
            // Lo que añade OTRO listener... y así infinitamente
            initGlobalGraph();
        });
    });
}
```

**Ciclo del bug:**
1. Usuario abre Mapa Global → `initGlobalGraph()` añade 5 listeners (uno por categoría)
2. Usuario cambia un filtro → se disparan los 5 handlers → `initGlobalGraph()` se llama 5 veces
3. Cada llamada añade 5 listeners más → ahora hay 30 listeners
4. Siguiente cambio de filtro → se disparan 30 handlers...

## Solución Aplicada

Usar un flag `data-*` en cada elemento para detectar si ya tiene listener:

```javascript
document.querySelectorAll(".graph-filter-chk").forEach(chk => {
    // ✅ Solo registrar una vez
    if (chk.dataset.graphListenerBound) return;
    chk.dataset.graphListenerBound = "1";
    
    chk.addEventListener("change", () => {
        activeCategoryFilters = Array.from(
            document.querySelectorAll(".graph-filter-chk:checked")
        ).map(el => el.getAttribute("data-category"));
        initGlobalGraph();
    });
});
```

## Alternativas Consideradas
- `removeEventListener` antes de añadir → requiere guardar referencia a la función
- `AbortController` con signal → más limpio pero más verboso
- Mover los listeners fuera de `initGlobalGraph()` → solución arquitectural correcta a largo plazo

## Prevention & Learnings
- **Nunca registrar event listeners dentro de funciones que se llaman repetidamente** sin limpiarlos antes
- El patrón `data-listenerBound` es un guard simple y efectivo para prevenir duplicados
- Alternativa moderna: usar `{ once: true }` cuando solo se necesita un disparo
- Conectado a: [[D3.js Force Graph - Implementación]], [[JavaScript Event Listener Patterns]]
