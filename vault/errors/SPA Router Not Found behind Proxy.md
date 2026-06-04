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
Modificar las propiedades en el prototipo de `Location` (`window.Location.prototype`), las cuales sí son configurables y escribibles en los navegadores modernos, para enmascarar dinámicamente la ruta leída por el enrutador:

```javascript
(function() {
    var prefix = '/api/antigravity/proxy';
    try {
        var proto = window.Location.prototype;
        var desc = Object.getOwnPropertyDescriptor(proto, 'pathname');
        if (desc && desc.get) {
            var originalPathnameGet = desc.get;
            Object.defineProperty(proto, 'pathname', {
                get: function() {
                    var val = originalPathnameGet.call(this);
                    if (val.indexOf(prefix) === 0) {
                        var subPath = val.substring(prefix.length);
                        return subPath === '' ? '/' : subPath;
                    }
                    return val;
                },
                configurable: true
            });
        }
    } catch(e) {
        console.error('Failed to patch Location.prototype.pathname:', e);
    }
})();
```

## Prevención y Aprendizajes
- Los enrutadores SPA modernos confían en `window.location.pathname` para emparejar rutas.
- Modificar `Location.prototype` permite cambiar de forma global el comportamiento de la propiedad `pathname` sin interferir con la resolución de URLs relativas del navegador que se basan en `href`.
