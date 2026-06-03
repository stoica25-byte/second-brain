import pathlib
import frontmatter

vault_path = pathlib.Path("vault")
events = []
for p in vault_path.glob("**/*.md"):
    if any(x in p.parts for x in ["templates", "archive"]):
        continue
    try:
        post = frontmatter.load(p)
        status = post.get("status")
        if status not in ["draft", "unread"]:
            created = str(post.get("created") or "")
            title = post.get("title") or p.stem
            category = post.get("category") or p.parent.name
            events.append({
                "path": p.relative_to(vault_path).as_posix(),
                "created": created,
                "title": title,
                "category": category
            })
    except Exception as e:
        print(f"Error {p}: {e}")

events.sort(key=lambda x: x["created"], reverse=True)
for idx, ev in enumerate(events):
    print(f"{idx+1:02d}. Date: {ev['created']} | Cat: {ev['category']} | Title: {ev['title']} | Path: {ev['path']}")
