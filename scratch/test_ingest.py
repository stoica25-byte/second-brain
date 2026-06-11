import sys
import os
import asyncio
from pathlib import Path

# Resolver directorios relativas
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT / "backend"))

# Cargar variables de entorno de forma nativa
def load_env_native(env_path):
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip()

load_env_native(PROJECT_ROOT / ".env")

async def test_run():
    # Importar la tarea del backend
    from main import process_video_task
    
    # URL de prueba (un video corto estable)
    test_task = {
        "url": "https://www.instagram.com/reel/C8C8a21uXWv/",
        "tags": ["test-automatizacion"],
        "chat_id": None
    }
    
    print("[INFO] Iniciando prueba del pipeline de ingesta y auditoria...")
    try:
        await process_video_task(test_task)
        print("[SUCCESS] Ejecucion del pipeline finalizada.")
        
        # Buscar si se creó la nota
        sources_dir = PROJECT_ROOT / "vault" / "sources"
        created_notes = list(sources_dir.glob("video-*.md"))
        if created_notes:
            print("\n[SUCCESS] Prueba Exitosa! Se ha creado la nota de auditoria:")
            for note in created_notes:
                print(f" - {note.name}")
        else:
            print("\n[ERROR] El pipeline termino pero no se encontro la nota Markdown en vault/sources/.")
            
    except Exception as e:
        print(f"\n[ERROR] Error critico durante la prueba: {e}")

if __name__ == "__main__":
    asyncio.run(test_run())
