---
category: skills
created: 2026-06-03
status: active
summary: Git Remote Setup Dinámico desde una Web App Contexto El Second Brain necesita
  sincronizar el vault con GitHub. El reto e...
tags:
- type/skill
- tech/git
- tech/fastapi
- tech/python
- tag/backend
title: Git Remote Setup Dinámico desde una Web App
updated: 2026-06-03
---

# Git Remote Setup Dinámico desde una Web App

## Contexto
El Second Brain necesita sincronizar el vault con GitHub. El reto es que el usuario puede no tener un remote configurado, y queremos que lo pueda hacer desde la UI sin tocar la terminal.

## Endpoint Backend (FastAPI)

```python
class SetRemotePayload(BaseModel):
    remote_url: str

@app.post("/api/git/set-remote")
async def set_git_remote(payload: SetRemotePayload):
    remote_url = payload.remote_url.strip()
    if not remote_url:
        raise HTTPException(status_code=400, detail="remote_url cannot be empty")
    
    # Verificar si ya existe un remote
    ret_check, _, _ = await run_git_command(["remote", "get-url", "origin"])
    
    if ret_check == 0:
        # Remote existe → actualizar URL
        ret_set, _, set_err = await run_git_command(["remote", "set-url", "origin", remote_url])
    else:
        # No hay remote → añadir
        ret_set, _, set_err = await run_git_command(["remote", "add", "origin", remote_url])
    
    if ret_set != 0:
        return {"status": "error", "message": f"Error: {set_err}"}
    
    return {"status": "success", "message": f"Remote configurado: {remote_url}"}
```

## Frontend

```javascript
async function handleSetRemote() {
    const remoteUrl = document.getElementById("github-remote-url").value.trim();
    
    const res = await fetch("/api/git/set-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remote_url: remoteUrl })
    });
    
    const result = await res.json();
    if (result.status === "success") {
        showToast("success", "Repositorio vinculado ✅");
        // Refrescar estado git en el modal
        const status = await fetch("/api/git/status").then(r => r.json());
        renderGitStatusCard(status);
    }
}
```

## Patrón: `git remote set-url` vs `git remote add`
- Si ya existe un remote `origin`: usar `git remote set-url origin <url>`
- Si no existe ningún remote: usar `git remote add origin <url>`
- Siempre verificar primero con `git remote get-url origin` (exit code 0 = existe)

## Prerequisitos para que funcione el push
El usuario debe tener configuradas credenciales de Git:
- **SSH**: clave pública añadida a GitHub, usando URL `git@github.com:user/repo.git`
- **HTTPS con token**: Personal Access Token de GitHub en el Credential Manager de Windows

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-03]]
- **MOC Temático**: [[Git MOC]]
- **Notas Afines**: Ninguna