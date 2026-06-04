import asyncio
import subprocess
import time
import urllib.request
import json
import base64
import os
import websockets

async def main():
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    ]

    chrome_path = None
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_path = path
            break

    if not chrome_path:
        print("Chrome executable not found.")
        return

    # Window size should be nice and large to fit the dashboard and editor
    cmd = [
        chrome_path,
        "--headless",
        "--disable-gpu",
        "--window-size=1280,800",
        "--remote-debugging-port=9222",
        "http://127.0.0.1:8080/"
    ]

    print("Launching Chrome...")
    chrome_proc = subprocess.Popen(cmd)
    
    # Wait for page to initially load
    await asyncio.sleep(6)

    try:
        # Query DevTools active tabs
        with urllib.request.urlopen("http://127.0.0.1:9222/json") as url:
            targets = json.loads(url.read().decode())
        
        target_ws = None
        for t in targets:
            if "127.0.0.1:8080" in t.get("url", "") or "localhost:8080" in t.get("url", ""):
                target_ws = t.get("webSocketDebuggerUrl")
                break
                
        if not target_ws:
            print("Could not find active dashboard tab in DevTools.")
            return
            
        print(f"Connecting to tab WebSocket: {target_ws}")
        async with websockets.connect(target_ws) as ws:
            # 1. Switch to Antigravity tab
            print("Switching tab to 'antigravity-ide'...")
            switch_cmd = {
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": "switchTab('antigravity-ide')",
                    "returnByValue": True
                }
            }
            await ws.send(json.dumps(switch_cmd))
            await ws.recv() # discard response
            
            # Wait for the iframe and Monaco editor to load completely
            print("Waiting 12 seconds for the editor to load inside the iframe...")
            await asyncio.sleep(12)
            
            # 2. Capture screenshot
            print("Capturing screenshot...")
            screenshot_cmd = {
                "id": 2,
                "method": "Page.captureScreenshot",
                "params": {
                    "format": "png"
                }
            }
            await ws.send(json.dumps(screenshot_cmd))
            
            res = json.loads(await ws.recv())
            img_data = res.get("result", {}).get("data")
            if img_data:
                # Save to artifacts directory
                artifacts_dir = r"C:\Users\Estudiante\.gemini\antigravity\brain\dd0953e3-741a-4068-91c3-94d10a87163c"
                os.makedirs(artifacts_dir, exist_ok=True)
                
                # Make a timestamped filename
                filename = f"media_editor_dashboard.png"
                file_path = os.path.join(artifacts_dir, filename)
                
                with open(file_path, "wb") as f:
                    f.write(base64.b64decode(img_data))
                print(f"Screenshot successfully saved to: {file_path}")
            else:
                print("Failed to capture screenshot data.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        print("Terminating Chrome...")
        chrome_proc.terminate()
        chrome_proc.wait()

asyncio.run(main())
