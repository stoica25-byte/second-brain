---
category: errors
created: 2026-06-04
status: resolved
summary: Caída de Sintaxis en Script de Lote de Windows por Paréntesis Anidados Descripción
  del Bug El script por lotes de Window...
tags:
- type/error
- tech/windows
- tag/batch
- tag/syntax-error
- tag/cmd
title: Caída de Sintaxis en Script de Lote de Windows por Paréntesis Anidados
updated: 2026-06-04
---

# Caída de Sintaxis en Script de Lote de Windows por Paréntesis Anidados

## Descripción del Bug
El script por lotes de Windows (`.bat` o `.cmd`) fallaba abruptamente al ejecutarse en consola arrojando el error `No se esperaba . en este momento.` (Unexpected . at this time) o cerrándose silenciosamente.

## Causa Raíz
En los intérpretes de comandos de Windows (`cmd.exe`), los bloques condicionales e iterativos (como `if` y `for`) se delimitan con paréntesis `( )`. Cuando se escribe un bloque multilinea con paréntesis:

```batch
if not "!MiVariable!"=="" (
    for /f "usebackq tokens=*" %%p in (`powershell -NoProfile -Command "(Get-Process).Name"`) do set "ProcName=%%p"
    echo El estado es (Activo)
)
```

El analizador sintáctico de CMD no realiza un análisis semántico del contenido de los strings o comandos en backticks; simplemente busca el primer carácter `)` de cierre para determinar el fin del bloque condicional `if`. En el ejemplo anterior:
1. El paréntesis de cierre de `(Get-Process)` o el paréntesis de `(Activo)` cierran prematuramente el bloque del `if`.
2. Lo que queda después (como `.Name"` o `)` de la línea de echo) es interpretado como un comando nuevo mal formado en el nivel raíz del script, disparando el error.

## Solución Aplicada
Para prevenir la caída de sintaxis en CMD en bloques condicionales:

1. **Evitar Paréntesis en PowerShell**: Se refactorizaron las llamadas para usar tuberías (`pipes`) en lugar de envolver sentencias entre paréntesis para acceder a propiedades.
   - *Incorrecto*: `"(Get-Process -Id !PID!).Name"`
   - *Correcto*: `"Get-Process -Id !PID! | Select-Object -ExpandProperty Name"`

2. **Evitar Paréntesis en echo**: Sustituir paréntesis por corchetes `[ ]` o caracteres alternativos en los mensajes impresos en pantalla dentro de bloques `if`.
   - *Incorrecto*: `echo Acceso Red Local (WiFi): http://!LocalIP!:8080`
   - *Correcto*: `echo Acceso Red Local [WiFi]: http://!LocalIP!:8080`

3. **Escapar Paréntesis**: Si es estrictamente necesario incluir un paréntesis literal, escaparlo usando el caracter de escape de CMD (`^`):
   - *Ejemplo*: `echo Acceso Red Local ^(WiFi^): http://!LocalIP!:8080`

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-04]]
- **MOC Temático**: [[Windows MOC]]
- **Notas Afines**: [[Consulta de Puertos e IP Local desde Script de Lote de Windows mediante PowerShell]]