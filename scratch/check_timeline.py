import urllib.request
import json

url = "http://127.0.0.1:8000/api/timeline?page=1&limit=15"
try:
    with urllib.request.urlopen(url) as response:
        html = response.read().decode('utf-8')
        data = json.loads(html)
        print(f"Total count: {data['total_count']}")
        print(f"Total pages: {data['total_pages']}")
        print(f"Current page: {data['current_page']}")
        for idx, ev in enumerate(data['events']):
            print(f"{idx+1:02d}. Date: {ev['date']} | Cat: {ev['category']} | Title: {ev['title']} | Path: {ev['path']}")
except Exception as e:
    print(f"Error: {e}")
