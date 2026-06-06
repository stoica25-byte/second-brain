---
category: errors
created: 2026-06-04
status: resolved
summary: Pantalla en Blanco en Móvil por Mixed Content y localhost Hardcoded Problema
  Al exponer una SPA local (como Antigravity...
tags:
- type/error
- tag/mobile
- tag/safari
- tag/mixed-content
- tag/cloudflare-tunnel
- tag/proxy
title: Pantalla en Blanco en Móvil por Mixed Content y localhost Hardcoded
updated: 2026-06-04
---

# Pantalla en Blanco en Móvil por Mixed Content y localhost Hardcoded

## Problema
Al exponer una SPA local (como Antigravity IDE) usando un túnel seguro de Cloudflare (`https://...trycloudflare.com`), la aplicación se carga inicialmente en el navegador móvil, pero muestra una pantalla blanca o gris vacía y las llamadas al chat fallan inmediatamente.

### Causas Raíz:
1. **API Endpoints Hardcoded**: El bundle compilado de JavaScript (`main.js`) contiene una llamada absoluta a la API apuntando a `https://127.0.0.1:port` o `http://localhost:port`. En el móvil del usuario, `127.0.0.1` apunta al propio móvil, donde no hay ningún servidor corriendo.
2. **Bloqueo por Mixed Content (Contenido Mixto)**: Si la SPA se sirve bajo `https` (Cloudflare) e intenta hacer llamadas AJAX a `http://127.0.0.1` (sin SSL), el navegador móvil (especialmente Safari en iOS) bloquea las peticiones por políticas de seguridad estrictas.

## Solución
Implementar una interceptación de peticiones y reescritura al vuelo en el backend proxy de FastAPI:

1. **Exponer el Dashboard (puerto 8080) en lugar del IDE directo**: Redirigir el túnel al Dashboard unificado.
2. **Reescritura de Enlaces Estáticos en HTML**: Al solicitar la raíz del proxy del IDE, reescribir los scripts absolutos (`href="/style.css"` -> `href="style.css"`) para forzar al navegador a pedirlos a través del proxy relativo.
3. **Dynamic API Rewriting en JS**: Al servir el JS bundle (`main.js`), reemplazar dinámicamente la expresión literal `https://127.0.0.1:${this.port}` por `window.location.origin + "/api/antigravity/proxy"` para enrutar todas las llamadas de la API a través del túnel seguro de Cloudflare.
4. **Resiliencia de Respuesta Binaria**: Retornar `res.content` en lugar de `res.text` para archivos no HTML/JS para evitar corromper activos multimedia.

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-04]]
- **MOC Temático**: [[Welcome Hub]]
- **Notas Afines**: [[Error: Browser Cache Impide Cargar JS Actualizado]], [[Discrepancia en IDs de Checkboxes de Personalización del HUD]]