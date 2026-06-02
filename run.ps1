# 🧠 Visual Second Brain - Runner Script
# This PowerShell script automates the environment activation and launches the dashboard.

$ErrorActionPreference = "Stop"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🧠 INICIANDO VISUAL SECOND BRAIN..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Locate/Create virtual environment
$VenvPath = Join-Path $PSScriptRoot "venv"
$PythonPath = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
$PipPath = Join-Path $PSScriptRoot "venv\Scripts\pip.exe"
$UvicornPath = Join-Path $PSScriptRoot "venv\Scripts\uvicorn.exe"

if (-not (Test-Path $PythonPath)) {
    Write-Host "[*] Entorno virtual no detectado. Creando 'venv'..." -ForegroundColor Yellow
    
    # Try finding python.exe dynamically if not in PATH
    $PythonExe = "python"
    try {
        $check = Get-Command python -ErrorAction SilentlyContinue
        if (-not $check) {
             # Search in AppData fallback
             $AppDataPython = Join-Path $env:USERPROFILE "AppData\Local\Programs\Python\Python312\python.exe"
             if (Test-Path $AppDataPython) {
                 $PythonExe = $AppDataPython
             } else {
                 # Search Program Files
                 $ProgFilesPython = "C:\Program Files\Python312\python.exe"
                 if (Test-Path $ProgFilesPython) {
                     $PythonExe = $ProgFilesPython
                 } else {
                     throw "Python 3.12 no detectado en las rutas estándar. Por favor instálalo."
                 }
             }
        }
    } catch {
        Write-Host "[!] Error buscando Python: $_" -ForegroundColor Red
        Exit 1
    }
    
    # Run venv creation
    Write-Host "[*] Usando python: $PythonExe" -ForegroundColor Gray
    & $PythonExe -m venv venv
    Write-Host "[+] Entorno virtual creado con éxito." -ForegroundColor Green
}

# 2. Install requirements if needed
Write-Host "[*] Verificando dependencias instaladas..." -ForegroundColor Yellow
$ReqFile = Join-Path $PSScriptRoot "backend\requirements.txt"
& $PipPath install -r $ReqFile --quiet
Write-Host "[+] Dependencias listas." -ForegroundColor Green

# 3. Initial Git pull (rebase) on start to keep notes synced
Write-Host "[*] Verificando actualizaciones en GitHub..." -ForegroundColor Yellow
try {
    # Check if origin is configured
    $remoteCheck = & git remote get-url origin 2>$null
    if ($LASTEXITCODE -eq 0 -and $remoteCheck) {
        $branch = & git branch --show-current
        Write-Host "[*] Ejecutando pull desde GitHub (rama: $branch)..." -ForegroundColor Gray
        & git pull --rebase origin $branch
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[⚠️] Conflicto o error al actualizar desde GitHub. Resolviendo en el arranque abortando el rebase..." -ForegroundColor Red
            & git rebase --abort 2>$null
            Write-Host "[*] El backend manejará la resolución de conflictos al sincronizar en la app." -ForegroundColor Yellow
        } else {
            Write-Host "[+] Notas sincronizadas con éxito antes de iniciar." -ForegroundColor Green
        }
    } else {
        Write-Host "[i] No hay repositorio de GitHub vinculado (Modo local)." -ForegroundColor Gray
    }
} catch {
    Write-Host "[!] Advertencia de Git: $_" -ForegroundColor DarkYellow
}

# 4. Open default browser
Write-Host "[*] Abriendo panel visual en el navegador..." -ForegroundColor Yellow
Start-Process "http://127.0.0.1:8000"

# 5. Start FastAPI server
Write-Host "[+] Iniciando servidor Uvicorn en http://127.0.0.1:8000..." -ForegroundColor Green
Write-Host "--- Presiona Ctrl+C para detener el servidor ---" -ForegroundColor DarkGray

# Set current directory to backend to run main
Set-Location (Join-Path $PSScriptRoot "backend")
& $UvicornPath main:app --host 127.0.0.1 --port 8000 --reload
