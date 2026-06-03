---
title: "Sesión de Desarrollo - Second Brain 2026-06-03"
category: journal
status: active
tags:
  - journal
  - desarrollo
  - second-brain
  - bugs
  - sesion
created: 2026-06-03
updated: 2026-06-03
---
# Sesión de Desarrollo - Second Brain 2026-06-03

## Resumen de la Sesión
Sesión de debugging y desarrollo de nuevas funcionalidades en la consola web del Second Brain. Hora: 00:25 - 00:50 (Madrid, UTC+2).

## Bugs Resueltos Hoy

### 🔴 Mapa Global no funcionaba
- **Causa**: El tab "🕸️ Mapa Global" tenía el HTML pero no tenía código JS para cambiar entre tabs ni para renderizar el grafo D3
- **Fix**: Implementado sistema de tabs + función `initGlobalGraph()` con D3 force simulation, zoom, tooltips y filtros

### 🔴 Connection Radar siempre en blanco
- **Causa primaria**: `.hidden` no estaba definida en CSS → `classList.remove("hidden")` no hacía nada
- **Causa secundaria**: `getLinkId()` usaba `node.id` en vez de `node.path` para resolver referencias de objetos D3
- **Fix**: Añadida regla global `.hidden { display: none !important }` + corrección de `getLinkId`

### 🔴 Event listeners duplicados en filtros del grafo
- **Causa**: `addEventListener` dentro de `initGlobalGraph()` se registraba múltiples veces
- **Fix**: Guard con `data-graphListenerBound` para registrar solo una vez

### 🔴 "Vault not found" al abrir Obsidian
- **Causa**: Usaba `obsidian://open?path=<ruta_absoluta>` que requiere vault registrado
- **Fix**: Cambiado a `obsidian://open?vault=vault&file=<ruta_relativa>` + setup inicial en Obsidian

### 🟡 GitHub sin UI para vincular repositorio
- **Situación**: Solo mostraba el estado del remote pero no permitía configurarlo desde la UI
- **Fix**: Nuevo formulario en modal de Configuración + endpoint `POST /api/git/set-remote`

## Lo Que Funciona Ahora

| Feature | Estado |
|---------|--------|
| Cronología de notas | ✅ |
| Mapa Global (D3) | ✅ |
| Connection Radar | ✅ |
| Abrir en Obsidian | ✅ |
| Git sync con GitHub | ✅ |
| Vincular GitHub desde UI | ✅ |
| Inbox de borradores | ✅ |
| SCoA Debate Tribunal | ✅ |
| Conflictos Git split-view | ✅ |
| Modo Offline | ✅ |

## Próximas Ideas
- Quick Capture: añadir notas directamente desde la UI sin Obsidian
- Top Tags widget en el panel izquierdo
- Atajos de teclado (Ctrl+K búsqueda, Ctrl+N captura)
- Nota aleatoria (serendipity)
- Word count + tiempo de lectura en el inspector

## Aprendizajes del Día
- Siempre definir clases utilitarias CSS (`.hidden`, `.active`) al inicio del stylesheet
- D3 muta los objetos de nodos/links → siempre pasar copias
- `obsidian://open?vault=NAME` es más robusto que `?path=RUTA`
- Event listeners dentro de funciones llamadas repetidamente = bug de duplicación

## Conectado a
- [[Second Brain Console - Arquitectura]]
- [[CSS Hidden Class Sin Efecto]]
- [[Event Listeners Duplicados D3 Graph]]
- [[Obsidian Vault Not Found Error]]

---

# Sesión Tarde (12:00 - 12:45)

## Bugs Resueltos

### 🔴 Click en conexión navega al medio/final de la nota
- **Causa 1**: `scrollIntoView` calculaba la posición de scroll **durante** la transición CSS de `grid-template-rows` (300ms), cuando las alturas eran intermedias
- **Causa 2**: `scrollIntoView` desplazaba el contenedor padre equivocado (`timeline-viewport` en vez de `timeline-stream`) por tener dos `overflow-y: auto` anidados
- **Fix**: Desactivar transiciones con clase `no-transitions`, forzar reflow con `.offsetHeight`, calcular offset exacto con `getBoundingClientRect()`, y usar `scrollTo()` sobre el contenedor correcto

### 🟡 Browser cache impedía cargar JS actualizado
- **Causa**: Chrome/Edge cachean agresivamente `app.js` y no lo recargan aunque el archivo cambie en el servidor
- **Fix**: Cache-buster `app.js?v=14` → `v=15`. Instrucción al usuario de usar `Ctrl+F5`

## Notas Creadas Hoy

### Errores
- [[ScrollIntoView Conflicto con CSS Transitions]]
- [[ScrollIntoView Desplaza Contenedor Equivocado]]
- [[Browser Cache Impide Cargar JS Actualizado]]

### Skills
- [[DOM Scroll Positioning Patterns]]
- [[CSS Grid Collapsible Animation Pattern]]

## Aprendizajes de la Sesión
- `scrollIntoView` es impredecible en layouts multi-panel → usar `getBoundingClientRect` + `scrollTo`
- Nunca calcular posiciones de scroll durante transiciones CSS → desactivar primero
- Un solo `overflow-y: auto` por columna del DOM, nunca anidar dos
- Siempre usar cache-busting en archivos estáticos en desarrollo
- `.offsetHeight` fuerza un reflow síncrono → útil para obtener dimensiones finales tras un cambio de clase

---

# Sesión Tarde-Noche (17:15 - 17:30)

## Características Implementadas

### 💡 Captura Rápida (Quick Capture)
- Endpoint `POST /api/notes/capture` en FastAPI que genera automáticamente nombres de archivo sanitizados únicos añadiendo sufijos numéricos ante colisiones.
- Interfaz de modal `#quick-capture-modal` en HTML con campos para título, categoría, estado (borrador/activa), etiquetas y cuerpo en Markdown.
- Botón "Nueva Captura" en el panel izquierdo.

### 🛠️ Widget de Tags Populares
- Función `renderTopTags()` en frontend que extrae, cuenta y ordena las 10 etiquetas más utilizadas de la base de notas.
- Los tags del widget filtran el timeline al hacer clic con foco en la barra de búsqueda.
- Backend optimizado para admitir búsquedas de hashtags (stripping `#` de los términos en `/api/timeline`).

### ⌨️ Atajos de Teclado
- `Ctrl+K` para enfocar y seleccionar la barra de búsqueda global.
- `Ctrl+N` para disparar el modal de captura rápida de notas de forma inmediata.

## Código Modificado
- [main.py](file:///c:/Users/Estudiante/Downloads/seond-brain/backend/main.py)
- [app.js](file:///c:/Users/Estudiante/Downloads/seond-brain/frontend/app.js) (incrementado a `v=16`)
- [index.html](file:///c:/Users/Estudiante/Downloads/seond-brain/frontend/index.html)
- [style.css](file:///c:/Users/Estudiante/Downloads/seond-brain/frontend/style.css) (incrementado a `v=6`)

## Verificación de Servidor
- Servidor iniciado vía PowerShell con recarga de cambios activa.
- Test de captura mediante script en scratch exitoso (Response Code 200, duplicados resueltos con sufijos).
- Repositorio sincronizado, comprometido y subido a GitHub de forma exitosa.


