import requests
import re

url = "http://localhost:8080/api/antigravity/proxy/main.js"
try:
    print("Requesting main.js from FastAPI proxy...")
    res = requests.get(url, timeout=5.0)
    print(f"Response: Status={res.status_code}, Length={len(res.text)}")
    
    # 1. Search for b.window.__fakePathname (which would be a corrupt replacement)
    corrupt_matches = re.findall(r'[a-zA-Z0-9_]\.window\.__fakePathname', res.text)
    print(f"Corrupt replacements found (should be 0): {len(corrupt_matches)}")
    if corrupt_matches:
        for m in corrupt_matches[:5]:
            print(f" -> Found corrupt: {m}")
            
    # 2. Search for valid window.__fakePathname replacements
    valid_matches = re.findall(r'window\.__fakePathname', res.text)
    print(f"Valid replacements found (should be > 0): {len(valid_matches)}")
    
    # 3. Check for specific occurrences of location.pathname that should have changed
    # For example, location.pathname==="/multi" -> window.__fakePathname==="/multi"
    multi_match = "window.__fakePathname===\"/multi\"" in res.text
    print(f"Did bare location.pathname==='/multi' change to window.__fakePathname==='/multi'? {multi_match}")
    
    # 4. Check for original b.location.pathname which should NOT have changed
    router_location_match = "b.location.pathname" in res.text
    print(f"Is original b.location.pathname intact? {router_location_match}")

except Exception as e:
    print(f"Error checking proxy: {e}")
