---
category: ideas
created: 2026-06-02
status: active
summary: 'SCoA Debate: Visual Redesign & Graph Interactions This document details
  the debate and implementation plans for three ma...'
tags:
- type/idea
- project/scoa
- tag/design
- tag/interaction
title: 'SCoA: Diseño Visual e Interacciones'
updated: 2026-06-02
---

# SCoA Debate: Visual Redesign & Graph Interactions

This document details the debate and implementation plans for three major frontend systems: the visual theme redesign, the graph node interaction paradigm, and the SCoA (Courtroom of Agents) debate progress tracking interface.

---

## 1. UI Redesign: Glassmorphic Cyber-Noir vs. Minimalist Neo-Brutalist

We compare two highly distinct visual directions for a developer-oriented note-taking dashboard:

| Design Aspect | Glassmorphic Cyber-Noir (Futuristic Sci-Fi) | Minimalist Neo-Brutalist (IDE/Terminal Clean) |
| :--- | :--- | :--- |
| **Backgrounds** | Radial gradients, deep violet/blue overlays, translucent glass. | Solid pitch charcoal (`#0c0c0c`), deep gray panels (`#141414`). |
| **Borders** | Rounded corners (`12px`), glowing neon drop-shadows. | Sharp corners (`2px` or `0px`), flat borders (`1px solid #262626`). |
| **Typography** | Sans-serif headings (`Inter`), Monospace code snippets. | Strict monospace (`JetBrains Mono`) for all UI labels, headings, body text. |
| **Visual Noise** | High (translucent stacking can cause legibility distractions). | Extremely low (high-contrast flat structure maximizes focus). |
| **Feel** | Cyberpunk, immersive presentation, high aesthetics. | Ultra-premium, clean, developer-focused, professional IDE. |

### Recommendation & Implementation
While the **Cyber-Noir** theme is immersive, the **Minimalist Neo-Brutalist** theme is cleaner and feels more professional for daily engineering work. 

To solve this, we implemented a **Dynamic Theme Switcher**. A theme toggle button has been added to the header next to settings, storing the preference in `localStorage`. 
- When switching to **Minimalist**, the app updates all panel variables, uses `JetBrains Mono` everywhere, replaces glass blurs with flat solid backgrounds, and removes glowing drop-shadows.
- The graph background colors adjust dynamically from `#09070f` (Cyber-Noir) to `#0c0c0c` (Minimalist).

---

## 2. Interaction Overhaul: Node Interaction & Direct Labels

### Node Interactions: Single-Click Selection vs. Double-Click Open
Previously, single-clicking a node immediately opened the editor/viewer. This caused high friction when developers just wanted to navigate, zoom, or inspect node linkages.

*   **Single-Click Action:** Centers the camera at a comfortable zoom level (`2.2x`) on the node, highlights the node on the graph (drawing a neon or solid border), highlights connected edge linkages, and scrolls/highlights the corresponding item in the sidebar directory.
*   **Double-Click Action:** Triggers the note inspection/opening flow, displaying the markdown content in the inspector.

### Direct Node Canvas Labels
To eliminate the need to hover or search for notes, labels are now rendered directly on the canvas using a legibility-optimized tag/capsule system:
1.  **Capsule Tag:** A solid background tag is drawn behind the label text (`#121212` or `#09070f`) to block out crossing edge lines.
2.  **Corner Adapting:** Capsule corners are rounded (`3px`) in Cyber-Noir and sharp (`0px`) in Minimalist.
3.  **Active borders:** When selected or active, the capsule border lights up with the matching category color (e.g., lavender for ideas, teal for skills).

---

## 3. SCoA Debate Room Clarity: Interactive Split-Tab View

Deliberations from multiple agents (Security, Performance, UI/UX, and Moderator) can be overwhelming when streamed sequentially into a single scrollable panel.

### Re-designed Layout
We transformed the courtroom modal progress matrix into a **split-tabbed dashboard**:
1.  **Judges Cards as Tabs:** The four agent cards at the top of the deliberation panel act as interactive tabs. Clicking a judge card focuses the debate record exclusively on their critique.
2.  **Active Stage Pulsing:** The agent card of the currently deliberating judge flashes/pulses in real-time.
3.  **Auto-Follow Stream:** During active debate execution, the tab automatically switches to the agent currently writing.
4.  **Static Inspection:** At any point, the user can click on any judge's card to switch back and inspect their arguments without disrupting the live stream.

---

## 🔗 Conexiones
- **Diario de Desarrollo**: [[2026-06-02]]
- **MOC Temático**: [[SCoA MOC]]
- **Notas Afines**: [[SCoA: Diagnósticos y Telemetría HUD]], [[Debate SCoA: Dashboard móvil y gratuito para controlar Antigravity]]