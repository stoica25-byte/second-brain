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
    await asyncio.sleep(4)

    try:
        # Check main.js proxy content directly
        print("Fetching main.js from proxy...")
        with urllib.request.urlopen("http://127.0.0.1:8080/api/antigravity/proxy/main.js") as response:
            js_text = response.read().decode('utf-8', errors='ignore')
            
        print(f"main.js fetched. Length: {len(js_text)}")
        print(f"Start of main.js: {repr(js_text[:150])}")
        print(f"End of main.js: {repr(js_text[-150:])}")

        # Query DevTools HTTP interface for active tabs
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
            # 1. Evaluate window.__fakeLocation.pathname
            eval_cmd = {
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": "window.__fakeLocation.pathname",
                    "returnByValue": True
                }
            }
            await ws.send(json.dumps(eval_cmd))
            res1 = json.loads(await ws.recv())
            val1 = res1.get("result", {}).get("result", {}).get("value")
            print(f"Evaluated window.__fakeLocation.pathname: {repr(val1)}")

            # 2. Evaluate window.__fakeWindow.location.pathname
            eval_cmd = {
                "id": 2,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": "window.__fakeWindow.location.pathname",
                    "returnByValue": True
                }
            }
            await ws.send(json.dumps(eval_cmd))
            res2 = json.loads(await ws.recv())
            val2 = res2.get("result", {}).get("result", {}).get("value")
            print(f"Evaluated window.__fakeWindow.location.pathname: {repr(val2)}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        chrome_proc.terminate()
        chrome_proc.wait()

asyncio.run(main())
