---
category: skills
created: 2026-06-03
status: active
summary: Obsidian URI Protocol Integración con Apps Web Qué Es Obsidian registra un
  manejador de protocolo en el sistema operativ...
tags:
- type/skill
- tag/obsidian
- tag/uri-protocol
- tech/javascript
- tag/integracion
- tag/desktop
title: Obsidian URI Protocol
updated: 2026-06-03
---

# Obsidian URI Protocol - Integración con Apps Web

## Qué Es
Obsidian registra un manejador de protocolo `obsidian://` en el sistema operativo. Cualquier app puede abrir archivos o vaults de Obsidian lanzando una URI con este esquema.

## Formas de Abrir

### Abrir vault completo
```
obsidian://open?vault=NOMBRE_VAULT
```

### Abrir archivo específico dentro de un vault
```
obsidian://open?vault=NOMBRE_VAULT&file=categoria/nombre-nota.md
```

### Abrir por ruta absoluta (MENOS RECOMENDADO)
```
obsidian://open?path=C%3A%5Cruta%5Cabsoluta%5Carchivo.md
```
⚠️ Este método falla si el vault no está registrado en Obsidian.

## Cómo Lanzar la URI desde JavaScript

```javascript
// ✅ Método correcto: link invisible (no navega la SPA)
function launchObsidianUri(uri) {
    const a = document.createElement("a");
    a.href = uri;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 200);
}

// ❌ Método incorrecto: navega la página
window.location.href = uri;
```

## Detectar si se Abrió Correctamente

Se puede usar el evento `blur` del window para detectar si el foco se perdió (lo que indica que Obsidian se abrió):

```javascript
let fallbackTimer = setTimeout(() => showError(), 1800);

const cancelFallback = () => {
    clearTimeout(fallbackTimer); // se abrió → cancelar error
    window.removeEventListener("blur", cancelFallback);
};

window.addEventListener("blur", cancelFallback);
launchObsidianUri(uri);
```

## Setup Inicial Requerido
El vault debe estar registrado en Obsidian al menos una vez:
1. Obsidian → "Abrir otro vault" → "Abrir carpeta como vault"
2. Seleccionar la carpeta del vault
3. A partir de ahí, `obsidian://open?vault=NombreVault` funciona siempre

## El `NOMBRE_VAULT` es el nombre de la carpeta
Si el vault está en `C:\proyectos\mi-brain\vault`, el nombre es `vault`.

---
*Notas Relacionadas:*
- [[Error: Obsidian Vault Not Found al abrir desde URI]]
- [[Second Brain Console - Arquitectura]]