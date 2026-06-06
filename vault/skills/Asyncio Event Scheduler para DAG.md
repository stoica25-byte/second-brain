---
category: skills
created: 2026-06-03
status: active
summary: 'Patrón: Asyncio Event Scheduler para DAG Concepto Para ejecutar un flujo
  de tareas representadas como un Grafo Acíclico...'
tags:
- type/skill
- tech/python
- tag/asyncio
- tag/concurrency
- tag/scheduler
- tag/dag
title: 'Patrón: Asyncio Event Scheduler para DAG'
updated: 2026-06-03
---

# Patrón: Asyncio Event Scheduler para DAG

## Concepto
Para ejecutar un flujo de tareas representadas como un Grafo Acíclico Dirigido (DAG) en Python de manera asíncrona y paralela, podemos crear una corrutina para cada tarea. La sincronización se realiza de manera nativa utilizando `asyncio.Event`.

Cada tarea tiene un evento de finalización (`completed_event`). Las tareas hijas esperan a que se disparen (haciendo `.wait()`) los eventos de todas sus tareas padres (dependencias) antes de iniciar su propia ejecución.

## Implementación de Referencia

```python
import asyncio
from typing import List, Dict

class Task:
    def __init__(self, id: str, dependencies: List[str], duration: float):
        self.id = id
        self.dependencies = dependencies
        self.duration = duration
        self.state = "PENDING"

class DAGScheduler:
    def __init__(self, tasks: List[Task]):
        self.tasks = tasks
        self.events: Dict[str, asyncio.Event] = {t.id: asyncio.Event() for t in tasks}
        self.task_map = {t.id: t for t in tasks}

    async def run_task(self, task_id: str):
        task = self.task_map[task_id]
        
        # 1. Esperar a que se completen todas las dependencias
        if task.dependencies:
            dep_futures = [self.events[dep].wait() for dep in task.dependencies]
            await asyncio.gather(*dep_futures)
            
            # (Opcional) Verificar si alguna dependencia falló para abortar en cadena
        
        # 2. Ejecutar la lógica de la tarea
        task.state = "RUNNING"
        print(f"Ejecutando tarea: {task_id}")
        await asyncio.sleep(task.duration)
        task.state = "SUCCESS"
        
        # 3. Notificar que se completó
        print(f"Tarea {task_id} finalizada")
        self.events[task_id].set()

    async def execute(self):
        # Crear corrutinas de forma paralela en el bucle de eventos
        coroutines = [asyncio.create_task(self.run_task(t.id)) for t in self.tasks]
        await asyncio.gather(*coroutines)
```

## Beneficios
1. **Concurrencia Óptima**: Las tareas que no tienen dependencias comunes se ejecutan en paralelo de inmediato gracias a `asyncio`.
2. **Sin Hilos ni Bloqueos Complejos**: No requiere semáforos, bloqueos de concurrencia (`Lock`) ni colas pesadas de mensajería; `asyncio.Event` provee un mecanismo ultraligero de notificación.
3. **Manejo del Ciclo de Vida**: Si una tarea falla, puede activar su evento pero marcar su estado como `FAILED`, permitiendo que las tareas dependientes lean este estado tras el `.wait()` y decidan abortarse ordenadamente (`DEPENDENCY_FAILED`).

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-03]]
- **MOC Temático**: [[Welcome Hub]]
- **Notas Afines**: [[Error: Browser Cache Impide Cargar JS Actualizado]], [[Discrepancia en IDs de Checkboxes de Personalización del HUD]]