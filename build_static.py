#!/usr/bin/env python3
"""Build the standalone site into docs/ (served by GitHub Pages): one static HTML page per route; output goes to docs/, (home, each series,
each series tab), shared style.css / app.js / data.js / config.js, covers, sitemap and robots.

  python3 build_static.py https://thrunycn.github.io/animeter/      # site URL used in canonical links + sitemap
  node web/prerender.js                                          # fills each page's #app with rendered HTML

Supabase settings live in web/config.json ({"supabaseUrl": "...", "supabaseKey": "<anon public key>"}).
"""
import json, os, re, shutil, sys, html
from build import load, HERE

SITE = (sys.argv[1] if len(sys.argv) > 1 else "https://thrunycn.github.io/animeter/").rstrip("/") + "/"
WEB = os.path.join(HERE, "web")
DIST = os.path.join(HERE, "docs")       # GitHub Pages serves main:/docs
COVERS = os.path.join(WEB, "covers")          # downscaled copies (460px) of ../covers
TABS = [("overview", "Overview"), ("arcs", "Arcs"), ("events", "Key events"), ("filler", "Filler"), ("manga", "Manga")]

series, details, fetched = load()
src = open(os.path.join(HERE, "page.src.html")).read()
css = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
js = re.search(r"<script>(.*?)</script>", src, re.S).group(1)
backdrop = re.search(r'(<div class="bg".*?</div>)', src, re.S).group(1)
footer = re.search(r"(<footer>.*?</footer>)", src, re.S).group(1)
fonts = "\n".join(l for l in src.splitlines() if "fonts.g" in l)
try: cfg = json.load(open(os.path.join(WEB, "config.json")))
except FileNotFoundError: cfg = {"supabaseUrl": "", "supabaseKey": ""}

def ints(ranges):
    n = set()
    for r in ranges or []:
        if isinstance(r, (int, float)): r = [r, r]
        if len(r) == 2 and all(isinstance(x, int) for x in r): n.update(range(r[0], r[1] + 1))
    return n

def filler_count(d):
    f = (d or {}).get("filler") or {}
    return len(ints(f.get("filler")))

def total_eps(s, d):
    arcs = (d or {}).get("arcs") or []
    ends = [a["eps"][1] for a in arcs if a.get("eps") and isinstance(a["eps"][1], int)]
    return max(ends) if ends else s.get("eps")

def handoff(s):
    if s.get("next") and s["next"] != "?": return f'{s.get("unit") or "chapter"} {s["next"]}'.strip()
    return None

def meta_for(s, tab):
    t, d = s["title"], details.get(s["id"])
    n_arcs, fc, te = len((d or {}).get("arcs") or []), filler_count(d), total_eps(s, d)
    ho = handoff(s)
    if tab == "overview":
        title = f"{t}: is it worth watching? Drop points and where the manga continues"
        desc = f"Where people drop {t} and where it clicks, by episode, from viewer reports. Plus the {t} filler list, arcs and where to continue in the source after the anime."
    elif tab == "arcs":
        title = f"{t} arcs in order, with episodes and chapters"
        desc = f"All {n_arcs} {t} arcs in order with episode and manga chapter ranges and which arcs are filler." if n_arcs else f"{t} arcs in order."
    elif tab == "events":
        title = f"{t} key events by arc (spoilers hidden)"
        desc = f"The important moments of every {t} arc, blurred until you tap them so you can check without spoilers."
    elif tab == "filler":
        title = f"{t} filler list: {fc} filler episodes to skip" if fc else f"{t} filler list: no filler episodes"
        desc = (f"{t} has {fc} filler episodes out of {te}. Episode-by-episode filler, mixed and canon guide with a skip list." if fc
                else f"{t} has no filler episodes. Episode-by-episode canon guide for all {te} episodes.")
    else:
        title = f"Where does the {t} anime end? Continue from {ho}" if ho else f"Where does the {t} anime end in the source?"
        desc = (f"The {t} anime ends around {ho}. Where to start reading after the anime, season by season." if ho
                else f"Where the {t} anime leaves off in the source material, season by season.")
    return title + " · Animeter", desc

def page(route, root, title, desc, url, image=None):
    img = f'\n<meta property="og:image" content="{SITE}{image}">' if image else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Animeter">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">{img}
<meta name="twitter:card" content="summary">
<link rel="icon" href="{root}favicon.svg" type="image/svg+xml">
{fonts}
<link rel="stylesheet" href="{root}style.css">
</head>
<body data-root="{root}" data-route="{route}">
{backdrop}
<div class="wrap">
  <div id="app"></div>
  {footer}
</div>
<script src="{root}config.js"></script>
<script src="{root}data.js"></script>
<script src="{root}app.js"></script>
</body>
</html>
"""

if os.path.isdir(DIST): shutil.rmtree(DIST)
os.makedirs(DIST)
w = lambda rel, text: (os.makedirs(os.path.dirname(os.path.join(DIST, rel)) or DIST, exist_ok=True), open(os.path.join(DIST, rel), "w").write(text))
w("style.css", css.strip() + "\n")
w("app.js", js.strip() + "\n")
w("data.js", "window.ANIMETER=" + json.dumps({"series": series, "details": details, "fetched": fetched}, ensure_ascii=False, separators=(",", ":")) + ";\n")
w("config.js", "window.ANIMETER_CONFIG=" + json.dumps(cfg) + ";\n")
w("favicon.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#16181d"/><text x="32" y="47" font-family="Arial Black,Impact,sans-serif" font-size="40" text-anchor="middle" fill="#e8336f">A</text></svg>\n')
w(".nojekyll", "")
w("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE}sitemap.xml\n")

urls = []
home_desc = f"Rankings of {len(series)} anime with filler lists, arcs, key events, where people drop each show and which manga chapter to continue from after the anime."
w("index.html", page("", "", "Animeter · Anime rankings, filler lists and where to continue the manga", home_desc, SITE))
urls.append(SITE)
w("404.html", page("", "/" + SITE.split("/", 3)[3] if SITE.count("/") > 3 else "/", "Page not found · Animeter", home_desc, SITE))
for s in series:
    for k, _ in TABS:
        rel = f'{s["id"]}/' + ("" if k == "overview" else f"{k}/")
        root = "../" * rel.count("/")
        title, desc = meta_for(s, k)
        img = f'covers/{s["id"]}-anime.jpg' if os.path.exists(os.path.join(COVERS, f'{s["id"]}-anime.jpg')) else None
        w(rel + "index.html", page(s["id"] + ("" if k == "overview" else "." + k), root, title, desc, SITE + rel, img))
        urls.append(SITE + rel)
w("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n")
if os.path.isdir(COVERS): shutil.copytree(COVERS, os.path.join(DIST, "covers"))
print(f"web/dist: {len(urls)} pages for {SITE}, supabase {'on' if cfg.get('supabaseUrl') else 'off'}")
