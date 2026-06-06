---
category: errors
created: 2026-06-04
status: resolved
summary: Excedido el Tiempo de Espera (Read Timeout) en el Proxy de Git Sync Descripción
  del Bug Al pulsar el botón "Sincronizar...
tags:
- type/error
- tech/python
- tech/fastapi
- tech/git
- tag/bug
- tag/proxy
title: Excedido el Tiempo de Espera (Read Timeout) en el Proxy de Git Sync
updated: 2026-06-04
---

# Excedido el Tiempo de Espera (Read Timeout) en el Proxy de Git Sync

## Descripción del Bug
Al pulsar el botón "Sincronizar Git" desde la interfaz del dashboard, se presentaba una alerta de error después de exactamente 5 segundos indicando:
`Fallo en la sincronización: Second Brain local está desconectado (HTTPConnectionPool(host='localhost', port=8000): Read timed out. (read timeout=5.0))`

## Causa Raíz
La sincronización de Git se procesa a través del endpoint proxy general de FastAPI `/api/secondbrain/proxy/{path:path}`. 
En `api/index.py`, todas las peticiones con el método `POST` tenían asignado un límite de tiempo de espera (`timeout`) rígido de **5.0 segundos**:
`res = requests.post(url, json=body, headers=headers, timeout=5.0)`

Sin embargo, el proceso de sincronización remota (`git pull --rebase` y `git push`) en el backend del Second Brain debe:
1. Esperar un retraso de cortesía de 3.0 segundos para asegurar que los archivos del disco se estabilicen (`wait_for_settled_files`).
2. Conectarse a través de la red con el servidor de GitHub para descargar y fusionar commits locales.
3. Volver a conectarse para subir los cambios locales a la nube.

Esta secuencia de red y comprobaciones supera con facilidad el límite rígido de 5 segundos. Como consecuencia, la librería `requests` abortaba la conexión y FastAPI devolvía un error de desconexión por falso positivo al cliente, a pesar de que el proceso Git se estaba ejecutando con normalidad en segundo plano.

## Solución Aplicada
Se parametrizó de forma dinámica el valor de `timeout` en la redirección proxy del método `POST` en `api/index.py`:
```python
elif method == "POST":
    # Aumentar timeout para sincronización remota con GitHub (git/sync)
    t_out = 60.0 if "git/sync" in path else 5.0
    res = requests.post(url, params=params, json=body, headers=headers, timeout=t_out)
```
Al asignar un límite de 60 segundos específicamente a las consultas de `git/sync`, se da el margen de tiempo suficiente para completar las operaciones de red con GitHub, resolviendo el Read Timeout.

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-04]]
- **MOC Temático**: [[FastAPI MOC]]
- **Notas Afines**: [[Conexiones de Red Subestimadas en Estadísticas]], [[Deadlock por Bloqueo de Lock en Llamada API de Larga Duración]]