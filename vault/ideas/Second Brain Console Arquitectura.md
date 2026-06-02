---
title: "Second Brain Console - Arquitectura"
category: ideas
status: active
tags:
  - arquitectura
  - second-brain
  - fastapi
  - javascript
  - d3js
  - obsidian
created: 2026-06-03
updated: 2026-06-03
---
# Second Brain Console - Arquitectura

## Visión General
Una consola web visual para gestionar un vault de Obsidian como un **grafo de conocimiento vivo**. El backend sirve los datos y gestiona los archivos Markdown; el frontend los visualiza con D3.js y permite interactuar con ellos.

## Stack Tecnológico

| Capa | Tecnología | Rol |
|------|-----------|-----|
| Backend | Python + FastAPI | API REST, indexado del vault, integración Git |
| Frontend | HTML + CSS + JavaScript vanilla | SPA sin framework |
| Grafos | D3.js v7 | Force-directed graph (global y ego-graph local) |
| Markdown | marked.js + DOMPurify | Renderizado seguro de Markdown |
| Vault | Obsidian + archivos .md | Almacenamiento real de conocimiento |
| Sync | Git + GitHub | Backup y control de versiones |

## Estructura de Directorios
```
seond-brain/
├── backend/
│   ├── main.py          # FastAPI app + todos los endpoints
│   └── debate_engine.py # Motor SCoA con streaming de agentes IA
├── frontend/
│   ├── index.html       # SPA principal
│   ├── app.js           # Lógica completa (~1900 líneas)
│   ├── style.css        # CSS (~1870 líneas)
│   └── vendor/          # D3, marked, DOMPurify (offline)
└── vault/               # El cerebro real (Obsidian vault)
    ├── ideas/
    ├── skills/
    ├── errors/
    ├── journal/
    └── sources/
```

## Flujo de Datos

```
Obsidian (.md files) → FastAPI (rebuild_index) → brain_index.json
                                                       ↓
                                              GET /api/index → graphData + notes
                                                       ↓
                                              D3.js renderiza el grafo
                                              Timeline muestra eventos
                                              Radar muestra ego-graph local
```

## Componentes Frontend

### Panel Izquierdo
- Botón Obsidian (deep link)
- Stats HUD (notas, conexiones, densidad, borradores)
- Git status + botón sync

### Panel Central (tabs)
- **Cronología**: eventos paginados, expandibles, con vista de markdown
- **Mapa Global**: D3 force graph con filtros y zoom

### Panel Derecho
- Inbox Queue (borradores en curation)
- Note Inspector: metadata, markdown, tags, backlinks
- Connection Radar: ego-graph 1-2 hop

### Modales
- Configuración (token MCP, estado Git, vincular GitHub)
- SCoA Tribunal (debate multi-agente con Gemini)
- Resolución de conflictos Git (split-view diff)

## Endpoints Clave

| Método | Ruta | Función |
|--------|------|---------|
| GET | `/api/index` | Todos los datos (notas + grafo) |
| GET | `/api/timeline` | Eventos paginados y filtrables |
| GET | `/api/stats` | Estadísticas del vault |
| GET | `/api/drafts` | Borradores pendientes de curation |
| POST | `/api/git/sync` | Sync con GitHub (pull+push) |
| POST | `/api/git/set-remote` | Vincular repositorio remoto |
| GET | `/api/git/status` | Estado del repositorio |
| POST | `/api/debate/stream` | SSE del debate SCoA |

## Decisiones de Diseño Importantes
- **Sin framework frontend**: vanilla JS para máxima flexibilidad y cero dependencias de build
- **Vendor offline**: D3, marked, DOMPurify como archivos locales (funciona sin internet)
- **WikiLinks como grafo**: los `[[enlaces]]` en Markdown se convierten en aristas del grafo
- **Token MCP**: permite ingestión automática desde NotebookLM u otros agentes IA

## Conectado a
- [[D3js Force Graph Implementacion]]
- [[Git Remote Setup desde Web App]]
- [[Obsidian URI Protocol Integracion]]
- [[Agent Debate Protocol]]
