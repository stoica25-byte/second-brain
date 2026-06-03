import json
with open('vault/brain_index.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
for k, v in data['notes'].items():
    print(f"{k} -> Title: {v.get('title')} | Category: {v.get('category')}")
