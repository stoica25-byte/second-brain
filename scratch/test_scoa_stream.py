import urllib.request
import json
import sys

def test_scoa():
    proposal = "Implementar WebSockets para notificaciones en tiempo real en la consola"
    category = "ideas"
    url = f"http://127.0.0.1:8000/api/debate/stream?proposal={urllib.parse.quote(proposal)}&category={category}"
    
    print(f"Triggering SCoA debate stream on: {url}\n")
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            buffer = ""
            for chunk in response:
                if not chunk:
                    continue
                line = chunk.decode('utf-8', errors='ignore')
                buffer += line
                while "\n" in buffer:
                    line_data, buffer = buffer.split("\n", 1)
                    line_data = line_data.strip()
                    if line_data.startswith("data:"):
                        data_content = line_data[5:].strip()
                        try:
                            event = json.loads(data_content)
                            stage = event.get("stage")
                            status = event.get("status")
                            text_chunk = event.get("chunk")
                            filename = event.get("filename")
                            error = event.get("error")
                            
                            if error:
                                print(f"\n[ERROR in stage {stage}]: {error}")
                            elif status == "start":
                                print(f"\n>>> Stage started: {stage.upper()}")
                            elif text_chunk:
                                print(text_chunk, end="", flush=True)
                            elif status == "done":
                                print(f"\n<<< Stage completed: {stage.upper()}")
                            elif status == "saved":
                                print(f"\n\n[SUCCESS] File saved as: {filename}")
                        except Exception as e:
                            # Not JSON or parse error, skip or print
                            pass
    except Exception as e:
        print(f"Failed to connect or read stream: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    test_scoa()
