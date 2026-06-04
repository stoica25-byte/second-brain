import requests

url = "http://localhost:8080/api/antigravity/proxy/"
try:
    print("Requesting root editor index.html from proxy...")
    res = requests.get(url, timeout=5.0)
    print(f"Response: Status={res.status_code}, Length={len(res.text)}")
    
    # Check if the injected __fakePathname definition is present
    if "__fakePathname" in res.text:
        print(" -> SUCCESS: Injected __fakePathname script found in the HTML output.")
        # Print a snippet of the injected code to verify
        idx = res.text.find("__fakePathname")
        print(f" -> Snippet: ... {res.text[idx-100:idx+200]} ...")
    else:
        print(" -> ERROR: Injected __fakePathname script NOT found in the HTML output.")
        
except Exception as e:
    print(f"Error testing proxy HTML: {e}")
