from scrapling.fetchers import Fetcher

p = Fetcher.get("https://quotes.toscrape.com/", impersonate="chrome", timeout=20000)
el = p.css("body")[0]
print("element attrs:", [a for a in dir(el) if not a.startswith("_")][:40])
print("has text:", hasattr(el, "text"))
try:
    print("text value:", el.text[:80])
except Exception as e:
    print("text error:", e)
