import asyncio
import subprocess
import time
import urllib.request
import json
import websockets

async def main():
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    ]

    chrome_path = None
    import os
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_path = path
            break

    if not chrome_path:
        print("Chrome executable not found.")
        return

    cmd = [
        chrome_path,
        "--headless",
        "--disable-gpu",
        "--remote-debugging-port=9222",
        "http://127.0.0.1:8080/api/antigravity/proxy/"
    ]

    chrome_proc = subprocess.Popen(cmd)
    await asyncio.sleep(3)

    try:
        with urllib.request.urlopen("http://127.0.0.1:9222/json") as url:
            targets = json.loads(url.read().decode())
        
        target_ws = None
        for t in targets:
            if "api/antigravity/proxy" in t.get("url", ""):
                target_ws = t.get("webSocketDebuggerUrl")
                break
                
        if not target_ws:
            print("Could not find active proxy tab in DevTools.")
            return
            
        print(f"Connecting to tab WebSocket: {target_ws}")
        async with websockets.connect(target_ws) as ws:
            # Test: Can we shadow location globally using var or function scopes?
            expr = """
            (function() {
                try {
                    // Test if global 'location' can be shadowed inside a closure
                    var location = { pathname: '/shadowed-path' };
                    return "Shadowed location.pathname inside closure: " + location.pathname;
                } catch(e) {
                    return "Shadow fail: " + e.message;
                }
            })()
            """
            eval_cmd = {
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": True}
            }
            await ws.send(json.dumps(eval_cmd))
            res1 = json.loads(await ws.recv())
            print(res1.get("result", {}).get("result", {}).get("value"))

    except Exception as e:
        print(f"Error: {e}")
    finally:
        chrome_proc.terminate()
        chrome_proc.wait()

asyncio.run(main())
