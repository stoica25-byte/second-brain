import urllib.request
import json

try:
    with urllib.request.urlopen("http://127.0.0.1:9222/json") as response:
        data = json.loads(response.read().decode('utf-8'))
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error connecting to Chrome: {e}")
