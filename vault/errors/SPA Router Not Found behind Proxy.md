---
title: "SPA Router Not Found behind Subpath Proxy"
category: errors
status: resolved
tags:
  - react-router
  - proxy
  - location-faking
  - wmi
  - javascript
created: 2026-06-04
updated: 2026-06-04
---

# SPA Router Not Found behind Subpath Proxy

## Detalles del Error
- **Síntoma**: Al servir una SPA (Single Page Application) basada en React Router o enrutador similar detrás de un subpath de proxy (ej. `/api/antigravity/proxy/`), la aplicación se carga pero muestra una pantalla de "Not Found" propia del router de la SPA.
- **Causa**: El enrutador de la SPA lee `window.location.pathname`, que devuelve la URL del navegador `/api/antigravity/proxy/`. Al no tener esta ruta definida en la configuración de la SPA, el router renderiza el componente "Not Found" por defecto.
- **Limitación**: Intentar sobreescribir `window.location` o `window.location.pathname` directamente en la instancia de `window.location` falla en la mayoría de navegadores modernos porque son de solo lectura y no configurables.

## Solución Aplicada
Modificar las propiedades en el prototipo del objeto `Location` (obtenido mediante `Object.getPrototypeOf(window.location)`), usando el método `toString` nativo para parsear la URL completa sin caer en recursión infinita de getters:

```javascript
(function() {
    var prefix = '/api/antigravity/proxy';
    try {
        var proto = Object.getPrototypeOf(window.location) || window.Location.prototype;
        var originalToString = proto.toString;
        
        Object.defineProperty(proto, 'pathname', {
            get: function() {
                var fullUrl = originalToString.call(this);
                var urlObj = new URL(fullUrl);
                var val = urlObj.pathname;
                if (val.indexOf(prefix) === 0) {
                    var subPath = val.substring(prefix.length);
                    return subPath === '' ? '/' : subPath;
                }
                return val;
            },
            configurable: true
        });
    } catch(e) {
        console.error('Failed to patch Location.prototype.pathname:', e);
    }
})();
```

## Prevención y Aprendizajes
- Los enrutadores SPA modernos confían en `window.location.pathname` para emparejar rutas.
- En algunos navegadores móviles (como Safari en iOS o Chrome móvil), `window.Location` puede no estar definido globalmente de la misma manera o el descriptor de `pathname` en el prototipo no tener un getter directo. Es más seguro obtener el prototipo mediante `Object.getPrototypeOf(window.location)`.
- Usar `toString.call(this)` en combinación con la clase nativa `URL` permite extraer la URL completa actual y parsear el `pathname` real de forma segura y sin riesgo de recursión infinita.

