import subprocess
import time
import requests
import json

# Locate Chrome executable
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
    exit(1)

print(f"Chrome found at: {chrome_path}")

# Start Chrome in headless debugging mode
cmd = [
    chrome_path,
    "--headless",
    "--disable-gpu",
    "--remote-debugging-port=9222",
    "http://127.0.0.1:8080/api/antigravity/proxy/"
]

print("Launching Chrome...")
chrome_proc = subprocess.Popen(cmd)

# Wait for Chrome to load and open the page
time.sleep(5)

try:
    # Query DevTools HTTP interface for list of targets
    res = requests.get("http://127.0.0.1:9222/json", timeout=2.0)
    targets = res.json()
    print("Active tabs in headless Chrome:")
    print(json.dumps(targets, indent=2))
    
    # We can connect via WebSocket to the first target and read logs,
    # but the simplest way is to check the FastAPI server logs for any new
    # [CLIENT DEBUG LOG] lines printed since we loaded the page!
    
except Exception as e:
    print(f"Failed to query DevTools: {e}")

finally:
    print("Terminating headless Chrome process...")
    chrome_proc.terminate()
    chrome_proc.wait()
