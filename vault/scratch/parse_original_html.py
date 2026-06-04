import requests
import re

# Discover Antigravity URL
try:
    res = requests.get("http://127.0.0.1:8080/api/antigravity/discover", timeout=2.0)
    data = res.json()
    ag_url = data.get("url")
except Exception:
    ag_url = "http://127.0.0.1:49702"

print(f"Connecting to Antigravity at: {ag_url}")

try:
    res = requests.get(ag_url, timeout=5.0)
    html = res.text
    
    print("\n--- SCRIPT TAGS ---")
    scripts = re.findall(r'<script.*?>.*?</script>|<script.*?>', html, re.DOTALL)
    for s in scripts:
        print(s.strip()[:200])
        
    print("\n--- LINK TAGS ---")
    links = re.findall(r'<link.*?>', html)
    for l in links:
        print(l.strip())
        
except Exception as e:
    print(f"Error: {e}")
