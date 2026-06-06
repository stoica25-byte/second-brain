---
category: errors
created: 2026-06-03
status: resolved
summary: 'Error: Obsidian Vault Not Found al abrir desde URI Error Details Environment:
  Windows 11, Obsidian Desktop, Chrome Sympt...'
tags:
- type/error
- tag/obsidian
- tag/uri-protocol
- tech/javascript
title: 'Error: Obsidian Vault Not Found al abrir desde URI'
updated: 2026-06-03
---

# Error: Obsidian Vault Not Found al abrir desde URI

## Error Details
- **Environment**: Windows 11, Obsidian Desktop, Chrome
- **Symptom/Log**:
  ```
  Vault not found.
  Unable to find a vault for the URL
  ...://open?path=c%3A%5CUsers%5CEstudiante%5CDownloads%5Cseond-brain%5Cvault%...
  ```

## Root Cause Analysis
El URI `obsidian://open?path=<ruta_absoluta>` requiere que Obsidian **ya tenga la carpeta registrada como vault**. Si es la primera vez que se usa, Obsidian no reconoce la ruta y lanza el error.

Además, el código original usaba `window.location.href = obsidianUri` lo que hacía que el navegador intentase navegar a un protocolo externo, con comportamiento impredecible.

## Solución Aplicada

**Cambiar el esquema de URI:**
```javascript
// ❌ Antes (ruta absoluta - falla si vault no está registrado)
const obsidianUri = `obsidian://open?path=${encodeURIComponent(fileDiskPath)}`;

// ✅ Después (por nombre de vault - funciona siempre)
const obsidianUri = `obsidian://open?vault=${encodeURIComponent("vault")}&file=${encodeURIComponent(note.path)}`;
```

**Cambiar cómo se lanza el URI:**
```javascript
// ❌ Antes (navega la página, comportamiento raro)
window.location.href = obsidianUri;

// ✅ Después (link invisible, no afecta la SPA)
const a = document.createElement("a");
a.href = uri;
a.style.display = "none";
document.body.appendChild(a);
a.click();
setTimeout(() => a.remove(), 200);
```

## Setup Inicial Requerido (solo una vez)
1. Abrir Obsidian Desktop
2. "Abrir otro vault" → "Abrir carpeta como vault"
3. Seleccionar: `C:\Users\Estudiante\Downloads\seond-brain\vault`
4. A partir de ahí funciona automáticamente

## Prevention & Learnings
- El protocolo `obsidian://open?vault=NAME` es más robusto que `?path=RUTA_ABSOLUTA`
- Nunca usar `window.location.href` para protocolos externos en SPAs

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-03]]
- **MOC Temático**: [[Welcome Hub]]
- **Notas Afines**: [[Error: Browser Cache Impide Cargar JS Actualizado]], [[Discrepancia en IDs de Checkboxes de Personalización del HUD]]