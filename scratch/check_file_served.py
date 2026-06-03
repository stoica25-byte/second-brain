import urllib.request

try:
    url = "http://127.0.0.1:8000/app.js?v=14"
    with urllib.request.urlopen(url) as response:
        content = response.read().decode('utf-8')
        if "note.title" in content and "filtersCleared" in content:
            print("SUCCESS: The server is serving the updated app.js (v=14)!")
            # Find the fallback block to verify
            idx = content.find("// If still not found")
            if idx != -1:
                print("Fallback code block found:")
                print(content[idx:idx+400])
        else:
            print("ERROR: The server is serving an OLD app.js version!")
except Exception as e:
    print(f"Error fetching app.js: {e}")
