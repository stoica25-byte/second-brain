---
category: journal
created: 2026-06-03
status: active
summary: Sesión de Desarrollo Second Brain 20260603 Resumen de la Sesión Sesión de
  debugging y desarrollo de nuevas funcionalidad...
tags:
- type/journal
- tag/type/journal
- tag/tag/type/journal
- tag/tag/tag/desarrollo
- tag/tag/tag/second-brain
- tag/tag/tag/bugs
- tag/tag/tag/sesion
title: Sesión de Desarrollo - Second Brain 2026-06-03
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

## 🔗 Conexiones
- [[Second Brain Console - Arquitectura]]
- [[CSS Hidden Class Sin Efecto]]
- [[Event Listeners Duplicados D3 Graph]]
- [[Obsidian Vault Not Found Error]]
- [[ScrollIntoView Conflicto con CSS Transitions]]
- [[ScrollIntoView Desplaza Contenedor Equivocado]]
- [[Browser Cache Impide Cargar JS Actualizado]]
- [[DOM Scroll Positioning Patterns]]
- [[CSS Grid Collapsible Animation Pattern]]
- [[FastAPI StaticFiles Directorio No Encontrado]]
- [[Asyncio Event Scheduler para DAG]]