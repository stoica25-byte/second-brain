with open("main_ag.js", "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

idx = content.find("parseLocation??")
if idx != -1:
    print("Found parseLocation context:")
    start = max(0, idx - 800)
    end = min(len(content), idx + 200)
    print(content[start:end])
else:
    print("parseLocation not found in main_ag.js")
