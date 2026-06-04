---
title: "Caída de Autenticación por Cabecera Bearer Vacía en el Cliente"
category: errors
status: resolved
tags:
  - python
  - fastapi
  - auth
  - bug
  - jwt
created: 2026-06-04
updated: 2026-06-04
---

# Caída de Autenticación por Cabecera Bearer Vacía en el Cliente

## Descripción del Bug
Al activar la consola de logs de diagnóstico del cliente, la terminal negra se abría por una fracción de segundo y se cerraba de inmediato. En el portátil, la casilla de verificación no permitía mantenerse marcada. En dispositivos móviles, la casilla se marcaba pero la consola inferior no se visualizaba.

## Causa Raíz
El backend de FastAPI en `api/index.py` define una dependencia de autenticación `get_current_user` con un mecanismo de bypass para desarrollo local:
```python
def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization:
        return {"username": "admin", "role": "admin"}
```
Si el cliente no envía la cabecera `Authorization`, se asume el usuario administrador.
Sin embargo, en el frontend `app.js`, al consultar la configuración o pedir los logs, se envía el token guardado en la configuración local:
`headers: { "Authorization": "Bearer " + config.access_token }`

Dado que el usuario accede por primera vez y no ha iniciado sesión mediante JWT (el dashboard está abierto por defecto para control cómodo local), `config.access_token` está vacío (`""`). 
Esto hace que el cliente envíe la cabecera:
`Authorization: Bearer `

Dado que la cabecera está presente en la solicitud, el condicional `if not authorization:` del backend **no se cumple**. El analizador avanza al decodificador de JWT, y al intentar validar el token vacío `""`, la librería de JWT arroja una excepción `jwt.PyJWTError`, devolviendo un código de estado `401 Unauthorized` al navegador.

Al recibir un 401, el frontend interpretaba que la sesión no tenía permisos de logs, forzando al checkbox a desmarcarse y ocultando de nuevo la terminal en el DOM (creando el efecto de parpadeo y cierre instantáneo).

## Solución Aplicada
Se corrigió la dependencia de seguridad en el backend en `api/index.py` para interceptar cabeceras vacías o con el prefijo Bearer sin cuerpo:
```python
def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or authorization.strip() in ("", "Bearer"):
        return {"username": "admin", "role": "admin"}
```
Con este ajuste, si el token no está inicializado en el cliente, el backend concede el bypass del administrador de forma transparente, permitiendo activar la monitorización de logs y personalizar los paneles del HUD sin fallos por autorización.
