---
category: ideas
created: 2026-06-02
status: active
summary: 'SCoA Debate: HUD Telemetry & Graph Diagnostics This document details the
  visual design changes, mathematical formulas, a...'
tags:
- type/idea
- project/scoa
- tag/hud
- tag/metrics
title: 'SCoA: Diagnósticos y Telemetría HUD'
updated: 2026-06-02
---

# SCoA Debate: HUD Telemetry & Graph Diagnostics

This document details the visual design changes, mathematical formulas, and JavaScript algorithms implemented for the visual second brain dashboard.

---

## 1. Visual Design Architecture (CSS / HTML)

To transform the standard glass containers into tech-telemetry displays, we established the following style rules in [[style.css]]:

1. **Subtle Background Grids**: Overlaying a 10px / 8px micro-grid in the background of panels using CSS linear-gradients.
2. **Corner Frame Accents**: Positioning four absolute-corner brackets (`hud-corner-tl`, `tr`, `bl`, `br`) around telemetry containers to mimic military radar and sensor displays.
3. **Monospace Metrics**: Enforcing `'JetBrains Mono', monospace` for all quantitative indicators and tag elements.
4. **Glowing Status Indicators**: Incorporating blinking/glowing dots (`hud-glow-dot`) next to headers.
5. **Theme Cohesion**: Adding specific dark/minimal overrides so the tech panels remain flat and clean in Minimal Dark theme.

---

## 2. Metrics Algorithms & Formulas (JS)

The following metrics are dynamically computed in [[app.js]]:

### Maturity Index
$$\text{Maturity Index} = \frac{\text{Connected Notes}}{\text{Total Notes}} \times 100$$
- **Connection Rule**: A note is considered connected if it has at least one valid outgoing link (targeting an existing note) or at least one incoming link (backlinks).
- **JS Implementation**:
  ```javascript
  let connectedCount = 0;
  Object.values(notes).forEach(note => {
      const hasValidOutLinks = note.links && note.links.some(linkTitle => notes[linkTitle]);
      const hasInLinks = note.backlinks && note.backlinks.length > 0;
      if (hasValidOutLinks || hasInLinks) {
          connectedCount++;
      }
  });
  ```

### Velocity Index
- **Formula**: Count of unique notes created or updated in the last 7 calendar days.
- **JS Implementation**:
  Using midnight-to-midnight millisecond calculations to prevent timezone shifts:
  ```javascript
  function isWithinLast7Days(dateStr) {
      if (!dateStr || dateStr.trim() === "" || dateStr === "n/a") return false;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return false;
      const now = new Date();
      const midnightNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const midnightDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const diffTime = midnightNow - midnightDate;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 7;
  }
  ```

### Connected Components / Clusters
- **Formula**: Number of independent graph islands/components $C$ in the active node graph.
- **Algorithm**: DFS (Depth-First Search) traversal over the adjacency list of the filtered graph.
- **JS Implementation**:
  ```javascript
  function calculateClusters(visibleNodes, visibleLinks) {
      if (!visibleNodes || visibleNodes.length === 0) return 0;
      
      const getLinkId = (linkNode) => {
          return (linkNode && typeof linkNode === 'object') ? linkNode.id : linkNode;
      };
      
      const adj = {};
      visibleNodes.forEach(node => {
          adj[node.id] = [];
      });
      
      visibleLinks.forEach(link => {
          const u = getLinkId(link.source);
          const v = getLinkId(link.target);
          if (adj[u] && adj[v]) {
              adj[u].push(v);
              adj[v].push(u);
          }
      });
      
      const visited = new Set();
      let clustersCount = 0;
      
      function dfs(nodeId) {
          visited.add(nodeId);
          const neighbors = adj[nodeId] || [];
          for (const neighbor of neighbors) {
              if (!visited.has(neighbor)) {
                  dfs(neighbor);
              }
          }
      }
      
      visibleNodes.forEach(node => {
          if (!visited.has(node.id)) {
              clustersCount++;
              dfs(node.id);
          }
      });
      
      return clustersCount;
  }
  ```

### Top Tags Extrapolation
- **Formula**: Extracts tags from all note objects, aggregates counts, and takes the top 5 sorted by frequency descending.
- **JS Implementation**:
  ```javascript
  const tagCounts = {};
  Object.values(notes).forEach(note => {
      if (note.tags && Array.isArray(note.tags)) {
          note.tags.forEach(tag => {
              const cleanTag = tag.trim();
              if (cleanTag) tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
          });
      }
  });
  const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5);
  ```

---

## 🔗 Conexiones
- **Diario de Desarrollo**: [[2026-06-02]]
- **MOC Temático**: [[SCoA MOC]]
- **Notas Afines**: [[SCoA: Diseño Visual e Interacciones]], [[Debate SCoA: Dashboard móvil y gratuito para controlar Antigravity]]