# 🧠 Visual Second Brain & SCoA Agent Debate

Un sistema interactivo de **Segundo Cerebro** visual, compatible con **Obsidian**, con sincronización automática en la nube mediante Git, ingesta de datos a través de MCP (Model Context Protocol, ej. NotebookLM) y un motor de toma de decisiones autónomo por agentes llamado **SCoA** (Supreme Court of Agents) con streaming en tiempo real.

---

## 🚀 Características Clave

1. **Visualización de Grafo Interactivo 2D**:
   - Renderizado en canvas con títulos en cápsulas para facilitar la lectura.
   - Centrado y zoom animado fluido con un solo clic.
   - Filtros dinámicos por categorías (`ideas`, `skills`, `errors`, `journal`, `sources`).
   - Soporte nativo para enlaces de Obsidian (`[[Nota]]` o `[[Nota|Alias]]`).
   - Funciona 100% offline (librerías locales pre-cargadas en `frontend/vendor/`).

2. **SCoA: Sala de Debate del Tribunal de Agentes (Supreme Court of Agents)**:
   - Resuelve decisiones de diseño y propuestas técnicas complejas mediante el debate de jueces de IA especializados (Seguridad, Rendimiento, Diseño e Interfaz) moderados por una síntesis final.
   - Interfaz en tiempo real en la **Sala del Tribunal** que muestra el flujo progresivo del debate (stepper) y una terminal de consola retro con logs de streaming mediante Server-Sent Events (SSE).
   - Generación automática de notas Markdown de Obsidian con YAML frontmatter y enlaces relacionales automáticos con otras notas del vault.

3. **Panel HUD de Telemetría y Diagnóstico de Grafo**:
   - Diseño estilo consola Sci-Fi premium con rejilla técnica de alineación, indicadores de estado parpadeantes y tipografía monoespaciada de alta fidelidad.
   - **Métricas reales**:
     - *Maturity Index*: Relación de notas conectadas vs. huérfanas.
     - *Velocity*: Notas creadas o editadas en los últimos 7 días.
     - *Connected Components (Clusters)*: Algoritmo DFS (Depth-First Search) implementado en tiempo real en el frontend para identificar islas de conocimiento aisladas.
     - *Top Tags*: Extracción dinámica de las 5 etiquetas más utilizadas.

4. **Sincronización Git y Control de Conflictos**:
   - Integración automática con GitHub.
   - Mecanismo integrado de resolución de conflictos que genera notas duplicadas no destructivas (ej. `Nota (Sync Conflict AAAA-MM-DD).md`) para evitar pérdida de datos si editas en múltiples dispositivos.
   - Realiza un autocommit y pull antes de arrancar la aplicación para mantener tus notas al día.

5. **Entrada MCP Ingest (NotebookLM)**:
   - Endpoint `/api/ingest` seguro mediante token `X-Ingest-Token`.
   - Vinculación inteligente: analiza el texto entrante y crea enlaces bidireccionales automáticos a notas existentes.

---

## 📁 Estructura del Proyecto

```text
second-brain/
├── backend/
│   ├── main.py              # Servidor FastAPI e indexador de vault/git
│   ├── debate_engine.py      # Motor de debate SCoA (sin dependencias SDK externas, usa urllib streaming)
│   └── requirements.txt     # Dependencias de Python (fastapi, uvicorn, python-frontmatter, aiofiles)
├── frontend/
│   ├── index.html           # Interfaz HUD y Sala del Tribunal SCoA
│   ├── style.css            # Estilos Cyber-Noir & Minimalist Dark
│   ├── app.js               # Lógica del frontend y render del ForceGraph
│   └── vendor/              # Librerías locales (force-graph, marked, DOMPurify)
├── vault/                   # Tu bóveda Obsidian (ideas, skills, journal, errors, sources, templates)
├── .gitignore               # Configuración de exclusiones de Git
├── run.bat                  # Lanzador rápido en Windows (hace doble clic)
├── run.ps1                  # Script de automatización de entorno y arranque
└── README.md                # Este documento
```

---

## 🛠️ Instalación y Configuración

El proyecto está diseñado para configurarse solo con **un clic** en entornos Windows.

### Requisitos Previos

- Tener instalado [Python 3.10+](https://www.python.org/downloads/) (y agregado al PATH del sistema).
- Tener instalado [Git](https://git-scm.com/).

### Paso 1: Configurar Clave de API de Gemini
Para que el tribunal **SCoA** pueda deliberar, crea un archivo `.env` en el directorio raíz o en `backend/` con tu clave de API:

```env
GEMINI_API_KEY=tu_clave_api_de_gemini_aqui
INGEST_TOKEN=ef241a5977e8e1e78b042d1546daa381984ef7d37346adc1
```

*(El token de ingesta sirve para validar peticiones externas de MCP, puedes personalizarlo).*

### Paso 2: Ejecutar el Proyecto
Simplemente haz **doble clic** en [run.bat](file:///c:/Users/Estudiante/Downloads/seond-brain/run.bat) en la raíz del proyecto. 

El script de PowerShell asociado ([run.ps1](file:///c:/Users/Estudiante/Downloads/seond-brain/run.ps1)) se encargará de:
1. Crear el entorno virtual de Python (`venv/`) si no existe.
2. Instalar todas las dependencias necesarias de `requirements.txt`.
3. Sincronizar automáticamente tus notas haciendo `git pull --rebase` (si ya tienes configurado GitHub).
4. Abrir la interfaz en tu navegador por defecto en `http://127.0.0.1:8000`.
5. Arrancar el servidor Uvicorn en segundo plano.

---

## 🐙 Sincronización con GitHub

Ya hemos configurado tu repositorio remoto en la base local:
`https://github.com/stoica25-byte/second-brain.git`

Para subir tus notas locales y código a GitHub por primera vez, abre una terminal en el directorio raíz del proyecto y ejecuta:

```bash
# Cambiar el nombre de la rama principal a master (o main si lo prefieres en GitHub)
git branch -M master

# Subir los archivos locales a tu repositorio en GitHub
git push -u origin master
```

Una vez hecho esto, cada vez que abras la aplicación con el script de inicio, se descargará cualquier cambio que hayas hecho externamente, y desde el menú del panel podrás hacer **Sync** en caliente con un simple botón.

---

## 🏛️ ¿Cómo usar la Sala de Debate SCoA?

1. En el panel superior derecho, haz clic en **🏛️ Sala del Tribunal (SCoA)**.
2. Escribe una idea o dilema técnico (por ejemplo, `"Elegir entre SQLite y PostgreSQL para una aplicación de notas local"`).
3. Selecciona la categoría donde quieres registrar la conclusión (`ideas`, `skills`, `journal`, etc.).
4. Haz clic en **Iniciar Argumentos**.
5. Verás cómo los jueces debaten en tiempo real y, al finalizar, la nota redactada por el moderador se guardará en tu vault y se abrirá automáticamente en tu editor.

---

## 🎨 Temas Disponibles

En la barra de herramientas del encabezado encontrarás un botón para alternar el tema visual:
- **Cyber-Noir (Predeterminado)**: Estética de ciencia ficción oscura con brillos de neón violeta, paneles translúcidos y transiciones dinámicas.
- **Minimalist Modern Dark**: Interfaz limpia y purista sin degradados, con bordes definidos de 2px, tipografía monoespaciada compacta y fondos oscuros planos para evitar distracciones.
