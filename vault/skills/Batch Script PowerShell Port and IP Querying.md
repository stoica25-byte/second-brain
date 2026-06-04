---
title: "Consulta de Puertos e IP Local desde Script de Lote de Windows mediante PowerShell"
category: skills
status: active
tags:
  - windows
  - batch
  - powershell
  - ipconfig
  - netstat
created: 2026-06-04
updated: 2026-06-04
---

# Consulta de Puertos e IP Local desde Script de Lote de Windows mediante PowerShell

## Resumen
Al diseñar scripts de lanzamiento locales en Windows (`.bat` o `.cmd`), es habitual necesitar información del sistema que la sintaxis nativa de CMD procesa con dificultad, como la dirección IP local de red inalámbrica/cableada o los identificadores de proceso (PID) que bloquean ciertos puertos. Integrar llamadas rápidas a PowerShell desde el lote resuelve esto de forma robusta.

## Patrón de Autodetección de IP Local
Para evitar los parsers inestables de `ipconfig` en archivos por lotes que varían según el idioma del sistema operativo, se puede utilizar el cmdlet `Get-NetIPAddress` filtrando interfaces virtuales o de bucle local:

```batch
rem Autodetectar la IP local para acceso wifi directo en red local
set "LocalIP="
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress"`) do set "LocalIP=%%i"

if not "!LocalIP!"=="" (
    echo  - Enlace de Red WiFi Local: http://!LocalIP!:8080
)
```

> [!NOTE]
> La variable `$_` se pasa de forma literal desde CMD a PowerShell sin problemas, pero si se invoca el lote desde una consola interactiva compleja, es fundamental asegurar que no se expanda prematuramente.

## Comprobación de Sockets y Nombre de Proceso (PID)
Si un puerto crítico está en uso, podemos averiguar qué proceso lo tiene ocupado y su nombre descriptivo:

```batch
set "Port8080PID="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr LISTENING ^| findstr :8080') do set "Port8080PID=%%a"

if not "!Port8080PID!"=="" (
    set "Port8080Name=Desconocido"
    for /f "usebackq tokens=*" %%p in (`powershell -NoProfile -Command "(Get-Process -Id !Port8080PID! -ErrorAction SilentlyContinue).Name"`) do set "Port8080Name=%%p"
    echo [ADVERTENCIA] El puerto 8080 está ocupado por "!Port8080Name!" (PID: !Port8080PID!).
)
```

## Beneficios
1. **Independencia de Idioma**: Funciona de forma idéntica en Windows en inglés, español o cualquier otra localización.
2. **Cero Dependencias**: No requiere compilar utilidades externas ni instalar binarios de terceros.
3. **Resiliencia**: Si ocurre un error, el flag `-ErrorAction SilentlyContinue` asegura que el script continúe sin interrumpir el flujo del cargador principal.
