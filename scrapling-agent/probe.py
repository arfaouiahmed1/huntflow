from scrapling.fetchers import Fetcher

p = Fetcher.get("https://quotes.toscrape.com/", impersonate="chrome", timeout=20000)
scripts = p.css('script[type="application/ld+json"]')
print("scripts:", len(scripts))
el = scripts[0] if scripts else None
print("el.text callable:", callable(getattr(el, "text", None)))
if el and callable(getattr(el, "text", None)):
    print("raw:", repr(el.text())[:150])
txt = p.css("body *::text").getall()
print("text nodes:", len(txt))
print("sample:", [t.strip()[:30] for t in txt if len(t.strip()) > 1][:3])
