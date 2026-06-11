---
title: "Condición de Carrera de URLs Obsoletas al Iniciar FastAPI y Túnel"
category: "errors"
status: "resolved"
tags:
  - "project/antigravity"
  - "tech/fastapi"
  - "type/error"
summary: "El arranque concurrente del backend y el túnel provoca la lectura de archivos residuales antiguos, solucionándose mediante la limpieza preventiva en el script de arranque."
created: "2026-06-11"
updated: "2026-06-11"
---

# ❌ Condición de Carrera de URLs Obsoletas al Iniciar FastAPI y Túnel

## Descripción del Problema
Al arrancar concurrentemente el servidor de FastAPI (`uvicorn`) y el cliente del túnel (`cloudflared` o `ngrok`), el backend de control remoto sirve inmediatamente la URL del túnel anterior en lugar de la nueva, o incluso escribe y bloquea de nuevo la URL antigua en `tunnel_url.txt`.

## Análisis y Causa Raíz
Cuando se arranca el servidor, los navegadores y clientes abiertos anteriormente en segundo plano comienzan de inmediato a realizar solicitudes recurrentes de ping al puerto local `8080` (en este caso, `/api/tunnel-url`). 

Al procesar estas peticiones de forma instantánea en el arranque:
1. El backend FastAPI ejecuta `get_tunnel_url_from_log()`.
2. Como el script de inicio de PowerShell/Batch aún no ha terminado de negociar la nueva conexión y no ha reescrito `tunnel_url.txt`, los archivos antiguos de la ejecución anterior (`tunnel_url.txt` y `cloudflared.log`) siguen en el disco.
3. El backend lee el archivo residual de la sesión previa, interpreta que es la URL activa, y en caso de túnel rápido, la devuelve e incluso reescribe ese valor obsoleto en el archivo de texto.
4. Esto sobrescribe la nueva URL que el script de inicio intenta establecer, provocando que el sistema quede "atascado" sirviendo la dirección muerta anterior.

## Solución Aplicada
Para prevenir la lectura de datos antiguos de sesiones previas en el arranque, se introdujo una **limpieza preventiva y destructiva** de los logs y del archivo de atajo de URL en los scripts de inicio (`start_server.ps1` e `iniciar_servidores.bat`) *antes* de iniciar el proceso de Python:

En PowerShell:
```powershell
Remove-Item -Path "$ProjectDir\cloudflared.log" -ErrorAction SilentlyContinue
Remove-Item -Path "$ProjectDir\tunnel_url.txt" -ErrorAction SilentlyContinue
```

En Batch:
```batch
if exist "%ProjectDir%\cloudflared.log" del "%ProjectDir%\cloudflared.log" >nul 2>&1
if exist "%ProjectDir%\tunnel_url.txt" del "%ProjectDir%\tunnel_url.txt" >nul 2>&1
```

Esto garantiza que si el servidor arranca y procesa pings antes de que el túnel esté listo, no encuentre archivos residuales que provoquen falsos positivos de URL.

---
## Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-11]]
- **MOC Temático**: [[FastAPI MOC]]
