---
title: "Python startswith Fallará con BOM de PowerShell en Windows"
category: "errors"
status: "resolved"
tags:
  - "project/antigravity"
  - "tech/fastapi"
  - "tech/windows"
  - "type/error"
summary: "La lectura de archivos de texto generados por PowerShell en Python puede fallar en comparaciones de cadenas debido a la marca BOM (\ufeff), solucionándose mediante la codificación utf-8-sig."
created: "2026-06-11"
updated: "2026-06-11"
---

# ❌ Python startswith Fallará con BOM de PowerShell en Windows

## Descripción del Problema
Al intentar leer un archivo de texto plano como `tunnel_url.txt` en Python (`api/index.py`) generado o modificado mediante PowerShell en Windows usando el comando `Out-File -Encoding utf8`, la comparación de cadenas `url.startswith("https://")` devuelve falsamente `False` a pesar de que el contenido visual comienza exactamente con `https://`. Como resultado, la API falla en detectar la URL guardada del túnel.

## Análisis y Causa Raíz
Por defecto, en Windows PowerShell (v5.1), la codificación `utf8` añade automáticamente una **marca de orden de bytes (BOM)** (`\xef\xbb\xbf` en bytes raw, o el carácter especial `\ufeff`) al inicio del archivo.

Al leer el archivo en Python con:
```python
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()
```
Python no descarta automáticamente el BOM, sino que lo mantiene al inicio de la cadena de texto como el carácter unicode `\ufeff`. Por tanto, cualquier comprobación posterior usando `startswith("https://")` fallará porque el texto realmente empieza con `\ufeffhttps://`.

## Solución Aplicada
Para solucionar esto y asegurar la compatibilidad sin importar si el archivo contiene o no BOM, se debe abrir el archivo usando el decodificador **`utf-8-sig`**:

```python
with open(filepath, "r", encoding="utf-8-sig") as f:
    content = f.read()
```

La codificación `utf-8-sig` trata el BOM de firma UTF-8 al inicio del archivo como metadato y lo descarta automáticamente al decodificar la cadena, dejando el texto limpio de caracteres ocultos.

---
## Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-11]]
- **MOC Temático**: [[FastAPI MOC]], [[Windows MOC]]
