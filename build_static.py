#!/usr/bin/env python3
"""Build the standalone site into docs/ (served by GitHub Pages): one static HTML page per route; output goes to docs/, (home, each series,
each series tab), shared style.css / app.js / data.js / config.js, covers, sitemap and robots.

  python3 build_static.py https://thrunycn.github.io/animeter/      # site URL used in canonical links + sitemap
  node web/prerender.js                                          # fills each page's #app with rendered HTML

Supabase settings live in web/config.json ({"supabaseUrl": "...", "supabaseKey": "<anon public key>"}).
"""
import json, os, re, shutil, sys, html, glob
from build import load, load_runs, apply_seasons, HERE

SITE = (sys.argv[1] if len(sys.argv) > 1 else "https://thrunycn.github.io/animeter/").rstrip("/") + "/"
WEB = os.path.join(HERE, "web")
DIST = os.path.join(HERE, "docs")       # GitHub Pages serves main:/docs
COVERS = os.path.join(WEB, "covers")          # downscaled copies (460px) of ../covers
TABS = [("overview", "Overview"), ("seasons", "Seasons"), ("arcs", "Arcs"), ("events", "Key events"), ("filler", "Filler"), ("manga", "Manga")]

series, details, fetched = load()
RUNS = load_runs()
# AniList tags per series (fetch_tags.py, run in GitHub Actions): [[name, rank, category], ...]
try: TAGS = json.load(open(os.path.join(HERE, "tags.json")))
except FileNotFoundError: TAGS = {}
def tag_group(x):
    c = x[2] or ""
    return "Audience" if c == "Demographic" else "Themes" if c.startswith("Theme") else "Setting" if c.startswith("Setting") else "Cast" if c.startswith("Cast") else None
TAGCAT = {x[0]: tag_group(x) for l in TAGS.values() for x in l if tag_group(x)}
# AniList top-rated franchises (fetch_top.py). Hand-off, arcs and filler aren't researched for these yet.
try: top = json.load(open(os.path.join(HERE, "top.json")))
except FileNotFoundError: top = []
try: ABOUT = json.load(open(os.path.join(HERE, "synopsis.json")))
except FileNotFoundError: ABOUT = {}
KIND_WORD = {"manga": "manga", "novel": "light novel"}
# Where each anime ends in its source, researched per series (research/handoff/out_*.json).
HANDOFF, TRIED = {}, set()
t_src = {t["id"]: t.get("source") for t in top}
for f in sorted(glob.glob(os.path.join(HERE, "research", "handoff", "*.json"))):
    if os.path.basename(f) == "todo.json" or os.path.basename(f).startswith("in_"): continue
    try:
        rows = [h for h in json.load(open(f)) if isinstance(h, dict) and h.get("id")]
        TRIED.update(h["id"] for h in rows if h.get("src") or re.search(r"out_r([245]|9z)_", f))   # rounds 2, 4, 5 and 9z searched every item
        HANDOFF.update({h["id"]: h for h in rows if h.get("confidence") in ("high", "medium") and h.get("src")})
    except Exception as e: print("skipping", f, e)
END = {"fully_adapted": ("Fully adapted", "Done"), "anime_original_ending": ("Own ending", "Own end"), "unknown": ("Unclear", "Unclear")}
def apply_handoff(s, h):
    nxt = str(h["next"]).strip() if h.get("next") not in (None, "") else None
    if not nxt and not h.get("note"): return
    unit = (h.get("unit") or ("Volume" if s["kind"] == "novel" else "Chapter")).strip().capitalize()
    s.update(mangaChecked=True, unit=unit, next=nxt, unitShort={"Chapter": "Ch. ", "Volume": "Vol. "}.get(unit, unit + " "),
             note=h.get("note") or s["note"],
             seasons=[x for x in h.get("seasons") or [] if isinstance(x, dict) and isinstance(x.get("end"), int) and x.get("l")])
    m = re.match(r"\d+", nxt or "")
    s["nextNum"] = int(m.group()) if m else None
    src = t_src.get(s["id"]) or {}
    if src.get("status") == "FINISHED": s["total"] = src.get("chapters") if unit == "Chapter" else src.get("volumes") if unit == "Volume" else None
    if s["seasons"] and s.get("total") and s["total"] < s["seasons"][-1]["end"]: s["total"] = None
    if not nxt: s["endWord"], s["endShort"] = END.get(h.get("status"), END["unknown"])
    seen = {u for _, u in s["src"]}
    s["src"] += [[n, u] for n, u in (h.get("src") or [])[:2] if isinstance(u, str) and u.startswith("http") and u not in seen]
for t in top:
    src = t.get("source") or {}
    eps = t.get("eps")
    fmt = t.get("format")
    if t["kind"] in KIND_WORD:
        size = f'{src["chapters"]} chapters' if src.get("chapters") else f'{src["volumes"]} volumes' if src.get("volumes") else ""
        state = {"FINISHED": "finished", "RELEASING": "still running", "HIATUS": "on hiatus"}.get(src.get("status"), "")
        bits = ", ".join(b for b in (size, state) if b)
        note = (f'We looked for where the anime ends in the {KIND_WORD[t["kind"]]} but found no source we trust yet.' if t["id"] in TRIED else
                f'We haven\'t checked where the anime ends in the {KIND_WORD[t["kind"]]} yet.') + (f' The {KIND_WORD[t["kind"]]} is {bits}.' if bits else "")
    elif t["kind"] == "original": note = "An anime original, so there is no manga to pick up from."
    else: note = "Adapted from a game, so there is no manga to pick up from."
    series.append({
        "id": t["id"], "title": t["title"], "jp": t.get("jp") or "", "kind": t["kind"], "format": fmt,
        "eps": eps or 12, "epsLabel": "Movie" if fmt == "MOVIE" else "Season 1" if eps else "First 12 episodes",
        "seasons": [], "next": None, "unchecked": True, "note": note,
        "score": t.get("score"), "popularity": t.get("popularity"), "year": t.get("year"), "genres": t.get("genres") or [],
        "tone": t.get("tone"),
        "src": [["AniList", f'https://anilist.co/anime/{t["anilist"]}']] + ([["MyAnimeList", f'https://myanimelist.net/anime/{t["mal"]}']] if t.get("mal") else [])
               + ([["Source on AniList", src["url"]]] if src.get("url") else []),
    })
    if fmt != "MOVIE": apply_seasons(series[-1], RUNS)
    if t["id"] in HANDOFF: apply_handoff(series[-1], HANDOFF[t["id"]])
    elif t["id"] in TRIED and t["kind"] in KIND_WORD: series[-1].update(mangaChecked=True, endWord="No source yet", endShort="Unclear")
    if ABOUT.get(t["id"]): series[-1]["about"] = ABOUT[t["id"]]
# Filler lists from Anime Filler List for series without a hand-written guide (fetch_filler.py, run in GitHub Actions).
try: AFL = json.load(open(os.path.join(HERE, "research", "filler_afl.json")))
except FileNotFoundError: AFL = {}
def afl_details(sid, a):
    n = lambda k: sum(b - x + 1 for x, b in a.get(k) or [])
    nf, nm, nc, tot = n("filler"), n("mixed"), n("anime_canon"), a["total"]
    note = (f"{nf} of {tot} episodes are filler" + (f" and {nm} mix canon with filler" if nm else "") + "." if nf or nm
            else f"No filler: all {tot} episodes are canon.")
    if nc: note += f" {nc} anime-original episode{'s' if nc > 1 else ''} count{'' if nc > 1 else 's'} as canon."
    if len(a["pages"]) > 1:
        note += " Episodes are numbered straight through: " + ", ".join(f'{p["title"]} {p["from"]}–{p["from"] + p["eps"] - 1}' for p in a["pages"]) + "."
    return {"id": sid, "arcs": [], "filler": {"filler": a.get("filler") or [], "mixed": a.get("mixed") or [], "recap": [], "total": tot, "note": note},
            "src": [["Anime Filler List", f'https://www.animefillerlist.com/shows/{p["slug"]}'] for p in a["pages"]][:3]}
try: SEASONS = json.load(open(os.path.join(HERE, "seasons.json")))
except FileNotFoundError: SEASONS = {}
for s_ in series:
    a = AFL.get(s_["id"])
    if not a or details.get(s_["id"]): continue
    eps = [x.get("aired") or x.get("eps") or 0 for x in (SEASONS.get(s_["id"]) or {}).get("seasons") or []]
    if eps and a["total"] < eps[0]:       # AFL's list stops partway through the first season: too partial to show
        print("filler list too short, skipped:", s_["id"], a["total"], "of", eps[0]); continue
    d = afl_details(s_["id"], a)
    if eps and a["total"] < sum(eps) * 0.9:
        d["filler"]["note"] += f' Anime Filler List covers the first {a["total"]} of {sum(eps)} episodes so far.'
    details[s_["id"]] = d
    s_["hf"] = 1          # has a filler tab even without a full guide
for s_ in series:
    tg = sorted((x for x in TAGS.get(s_["id"], []) if tag_group(x) and x[0] not in (s_.get("genres") or [])), key=lambda x: (x[2] != "Demographic", -(x[1] or 0)))
    s_["tags"] = [x[0] for x in tg][:15]
src = open(os.path.join(HERE, "page.src.html")).read()
css = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
js = re.search(r"<script>(.*?)</script>", src, re.S).group(1)
_bd = re.search(r'(<div class="bg".*?</div>)', src, re.S); backdrop = _bd.group(1) if _bd else ""
footer = re.search(r"(<footer[^>]*>.*?</footer>)", src, re.S).group(1)
# fonts ship with the site (web/fonts), so pages don't wait on a third-party font host
FONTS = [("instrument-sans-latin-ext-standard-normal", "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"),
         ("instrument-sans-latin-standard-normal", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD")]
fontface = "".join(f'@font-face{{font-family:"Instrument Sans";font-weight:400 700;font-stretch:75% 100%;font-style:normal;font-display:swap;src:url(fonts/{f}.woff2) format("woff2");unicode-range:{u}}}\n' for f, u in FONTS)
fonts = '<link rel="preload" href="{root}fonts/instrument-sans-latin-standard-normal.woff2" as="font" type="font/woff2" crossorigin>'
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

def has_seasons(s): return len(s.get("run") or []) > 1 or bool(s.get("extras"))

def short(t, n=34):
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0].rstrip(":,-") + "…"

def meta_for(s, tab):
    """Title (aim: under 60 characters) and description per page."""
    t, d = s["title"], details.get(s["id"])
    n_arcs, fc, te = len((d or {}).get("arcs") or []), filler_count(d), total_eps(s, d)
    ho = handoff(s)
    st = short(t)
    if tab == "overview":
        title = f"Is {st} worth watching? Drop points"
        desc = f"Is {t} worth watching? See where viewers drop it and where it clicks, by episode" + (f", and where the anime ends in the source ({ho})." if ho else ".")
    elif tab == "seasons":
        run = s.get("run") or []
        title = f"{st} watch order: {len(run)} seasons" if len(run) > 1 else f"{st} watch order with films"
        desc = f"Every season of {t} in watch order with episode counts and years" + (", plus films and OVAs." if s.get("extras") else ".")
    elif tab == "arcs":
        title = f"{st} arcs in order with episodes"
        desc = f"All {n_arcs} {t} arcs in order with episode and chapter ranges, and which arcs are filler." if n_arcs else f"{t} arcs in order."
    elif tab == "events":
        title = f"{st} key events by arc, spoiler-free"
        desc = f"The important moments of every {t} arc, blurred until you tap them so you can check without spoilers."
    elif tab == "filler":
        fd = ((d or {}).get("filler") or {})
        te = fd.get("total") or te
        title = (f"{st} filler list: {fc} episodes to skip" if fc else f"Does {st} have filler? No" if fd else f"{st} filler list")
        desc = (f"{t} has {fc} filler episodes out of {te}. Every filler, mixed and canon episode, plus a copyable skip list." if fc
                else f"{t} has no filler episodes. All {te} episodes are canon." if fd else f"Filler episodes in {t}.")
    else:
        title = f"Where does the {st} anime end? {ho[0].upper()+ho[1:]}" if ho else f"Where does the {st} anime end?"
        desc = (f"The {t} anime ends around {ho}. Here is where to start reading after the anime, season by season." if ho
                else f"Where the {t} anime leaves off in the source material.")
    if len(title) <= 48: title += " · Animeter"
    return title, desc

def thin(s, tab):
    """Pages with no real answer yet: kept for visitors, hidden from search."""
    if tab == "manga": return bool(s.get("unchecked")) and not handoff(s) and not s.get("endWord") in ("Fully adapted", "Own ending")
    if tab == "filler": return not (details.get(s["id"]) or {}).get("filler")
    return False

def jsonld(s, tab, url, title, desc):
    crumbs = [("Animeter", SITE), (s["title"], SITE + s["id"] + "/")] + ([(dict(TABS)[tab], url)] if tab != "overview" else [])
    g = [{"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)]},
         {"@type": "Movie" if s.get("format") == "MOVIE" else "TVSeries", "name": s["title"], "url": SITE + s["id"] + "/",
          **({"alternateName": s["jp"]} if s.get("jp") else {}), **({"startDate": str(s["year"])} if s.get("year") else {}),
          **({"numberOfEpisodes": s["eps"]} if s.get("eps") and s.get("format") != "MOVIE" else {}),
          "genre": s.get("genres") or [], "image": f'{SITE}covers/{s["id"]}-anime.jpg', "inLanguage": "ja"}]
    ho = handoff(s)
    if tab == "manga" and ho:
        g.append({"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": f'Where does the {s["title"]} anime end in the {KIND_WORD.get(s.get("kind"), "source")}?',
                  "acceptedAnswer": {"@type": "Answer", "text": desc}}]})
    return '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@graph": g}, ensure_ascii=False).replace("</", "<\\/") + "</script>"

def footer_for(root): return footer.replace("{ROOT}", root or "./").replace('<span id="fetched"></span>', f'<span id="fetched">{fetched}</span>')

def page(route, root, title, desc, url, image=None, head="", body="", scripts=""):
    img = f'\n<meta property="og:image" content="{SITE}{image}">' if image else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#09090a">
<meta name="color-scheme" content="dark">
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
<link rel="icon" href="{root}favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="{root}apple-touch-icon.png">{head}
{fonts.replace("{root}", root)}
<link rel="stylesheet" href="{root}style.css">
<script>if(!/[?&]prerender/.test(location.search)&&!matchMedia("(prefers-reduced-motion: reduce)").matches){{document.documentElement.classList.add("gs");setTimeout(function(){{document.documentElement.classList.add("gsr")}},2500)}}</script>
</head>
<body data-root="{root}" data-route="{route}">
{backdrop}
<div class="wrap">
  <div id="app">{body}</div>
  {footer_for(root)}
</div>
<script src="{root}config.js"></script>
<script src="{root}data.js"></script>{scripts}
<script src="{root}vendor/gsap.min.js"></script>
<script src="{root}vendor/ScrollTrigger.min.js"></script>
<script src="{root}vendor/SplitText.min.js"></script>
<script src="{root}vendor/lenis.min.js"></script>
<script src="{root}app.js"></script>
</body>
</html>
"""

if os.path.isdir(DIST): shutil.rmtree(DIST)
os.makedirs(DIST)
w = lambda rel, text: (os.makedirs(os.path.dirname(os.path.join(DIST, rel)) or DIST, exist_ok=True), open(os.path.join(DIST, rel), "w").write(text))
w("style.css", fontface + css.strip() + "\n")
shutil.copytree(os.path.join(WEB, "fonts"), os.path.join(DIST, "fonts"))
shutil.copytree(os.path.join(WEB, "vendor"), os.path.join(DIST, "vendor"))
w("app.js", js.strip() + "\n")
COUNTS = {"guides": sum(1 for x in series if (details.get(x["id"]) or {}).get("arcs")), "arcs": sum(len((details.get(x["id"]) or {}).get("arcs") or []) for x in series),
          "events": sum(len(a.get("events") or []) for x in series for a in (details.get(x["id"]) or {}).get("arcs") or []),
          "filler": sum(filler_count(details.get(x["id"])) for x in series)}
for x in series:     # the hand-off point spelled out, for tooltips and sentences ("Steel Ball Run chapter 24" behind "SBR 24")
    if x.get("next"):
        u = x.get("unit") or ("Volume" if x.get("kind") == "novel" and not x.get("unitShort") else "Chapter")
        x["hoLong"] = f'{u} {x["next"]}'
HEAVY = ("run", "extras", "src", "note", "seasons", "nextNum", "total", "unit", "endWord", "about")
tagnames = sorted({t for x in series for t in x.get("tags") or []})
tix = {t: i for i, t in enumerate(tagnames)}
slim = [{**{k: v for k, v in x.items() if k not in HEAVY and k != "tags"}, "tg": [tix[t] for t in x.get("tags") or []]} for x in series]
w("data.js", "window.ANIMETER=" + json.dumps({"series": slim, "details": {}, "fetched": fetched, "tagcat": TAGCAT, "tagnames": tagnames, "counts": COUNTS}, ensure_ascii=False, separators=(",", ":")) + ";\n")
for x in series:     # the heavy part of each series, loaded only on its own pages
    w(f's/{x["id"]}.js', "window.ANIMETER_FULL=" + json.dumps({"id": x["id"], "series": {k: x[k] for k in HEAVY if k in x}, "details": details.get(x["id"])}, ensure_ascii=False, separators=(",", ":")) + ";\n")
w("config.js", "window.ANIMETER_CONFIG=" + json.dumps(cfg) + ";\n")
FAV = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#141414"/><path d="M18 8h28v48l-14-10-14 10z" fill="#d7261e"/></svg>\n'
w("favicon.svg", FAV)
for f in ("favicon-32.png", "apple-touch-icon.png"):
    if os.path.exists(os.path.join(WEB, f)): shutil.copy(os.path.join(WEB, f), os.path.join(DIST, f))
w(".nojekyll", "")
w("robots.txt", f"User-agent: *\nAllow: /\nDisallow: /profile/\nSitemap: {SITE}sitemap.xml\n")
if os.path.exists(os.path.join(WEB, "CNAME")): shutil.copy(os.path.join(WEB, "CNAME"), os.path.join(DIST, "CNAME"))

urls = []
home_desc = f"Rankings of {len(series)} anime with filler lists, watch order, arcs, where viewers drop each show and which manga chapter to read after the anime."
w("index.html", page("", "", "Animeter: anime filler lists and where the manga continues", home_desc, SITE))
urls.append(SITE)
w("profile/index.html", page("profile", "../", "My list · Animeter", "Your anime list on Animeter: watching, completed, plan to watch, dropped and your ratings.", SITE + "profile/").replace('<meta name="description"', '<meta name="robots" content="noindex">\n<meta name="description"', 1))
w("404.html", page("404", "/" + SITE.split("/", 3)[3] if SITE.count("/") > 3 else "/", "Page not found · Animeter", home_desc, SITE).replace('<meta name="description"', '<meta name="robots" content="noindex">\n<meta name="description"', 1))
for s in series:
    for k, _ in TABS:
        rel = f'{s["id"]}/' + ("" if k == "overview" else f"{k}/")
        root = "../" * rel.count("/")
        title, desc = meta_for(s, k)
        if s.get("unchecked") and (k in ("arcs", "events") or k == "filler" and not s.get("hf")): continue     # nothing to show yet
        if k == "seasons" and not has_seasons(s): continue
        img = f'covers/{s["id"]}-anime.jpg' if os.path.exists(os.path.join(COVERS, f'{s["id"]}-anime.jpg')) else None
        head = "\n" + jsonld(s, k, SITE + rel, title, desc) + ('\n<meta name="robots" content="noindex,follow">' if thin(s, k) else "")
        w(rel + "index.html", page(s["id"] + ("" if k == "overview" else "." + k), root, title, desc, SITE + rel, img, head=head,
                                   scripts=f'\n<script src="{root}s/{s["id"]}.js"></script>'))
        if not thin(s, k): urls.append(SITE + rel)

# hub pages: plain HTML lists so every series is two clicks from home
def hub(rel, title, desc, inner):
    root = "../" * rel.count("/")
    home = root or "./"
    links = f'<a href="{home}#rankings">Rankings</a><a href="{root}anime/">A to Z</a><a href="{root}genre/">Genres</a>'
    icon = re.search(r"const SEARCH_ICON = `(.*?)`;", js).group(1)     # same header as the app's mastHTML()
    body = (f'<header class="mast"><a class="wm" href="{home}">Animeter</a><nav class="mastnav" aria-label="Main"><span class="navlinks">{links}</span>'
            f'<details class="navmenu"><summary>Menu</summary><div class="navpanel">{links}</div></details>'
            f'<a class="srch" href="{home}#find" data-find>{icon}<span>Search</span></a><a class="melink" href="{root}profile/">My list</a></nav></header><main class="hub">{inner}</main>')
    w(rel + "index.html", page("static", root, title, desc, SITE + rel, body=body))
    urls.append(SITE + rel)
def li(x, root):
    sc = f'{x["score"] / 10:.1f}' if x.get("score") else ""
    return f'<li><a href="{root}{x["id"]}/">{html.escape(x["title"])}</a><small>{x.get("year") or ""}{" · " + sc if sc else ""}</small></li>'
by_letter = {}
for x in sorted(series, key=lambda x: x["title"].lower()):
    c = x["title"][0].upper(); c = c if c.isalpha() else "#"
    by_letter.setdefault(c, []).append(x)
hub("anime/", "All anime A–Z · Animeter", f"Every one of the {len(series)} anime on Animeter, A to Z, with filler lists, watch order and where the manga continues.",
    f'<h1>All anime, A to Z</h1><p class="lede">{len(series)} series. Each has where viewers drop it, its seasons in order and, where we have it, the filler list and the chapter to read after the anime.</p>'
    + '<nav class="letters" aria-label="Letters">' + "".join(f'<a href="#l-{c}">{c}</a>' for c in by_letter) + "</nav>"
    + "".join(f'<h2 id="l-{c}">{c}</h2><ul>' + "".join(li(x, "../") for x in xs) + "</ul>" for c, xs in by_letter.items()))
slug = lambda g: re.sub(r"[^a-z0-9]+", "-", g.lower()).strip("-")
groups = {}
for x in series:
    for g in (x.get("genres") or []) + [t for t in x.get("tags") or [] if TAGCAT.get(t) in ("Audience", "Themes", "Setting")]:
        groups.setdefault(g, []).append(x)
groups = {g: xs for g, xs in groups.items() if len(xs) >= 12}
for g, xs in groups.items():
    xs = sorted(xs, key=lambda x: -(x.get("score") or 0))
    hub(f"genre/{slug(g)}/", f"Best {g} anime, ranked · Animeter", f"The {len(xs)} best-rated {g} anime by AniList score, with filler lists and where the manga continues.",
        f'<h1>Best {html.escape(g)} anime</h1><p class="lede">{len(xs)} {html.escape(g)} anime ranked by AniList score.</p><ol class="hubrank">' + "".join(li(x, "../../") for x in xs) + "</ol>")
hub("genre/", "Anime by genre and theme · Animeter", "Browse anime by genre, audience and theme: shounen, seinen, isekai, romance, action and more.",
    '<h1>Anime by genre and theme</h1><p class="lede">Pick a genre, an audience such as Shounen, or a theme such as Isekai.</p><ul>'
    + "".join(f'<li><a href="{slug(g)}/">{html.escape(g)}</a><small>{len(xs)}</small></li>' for g, xs in sorted(groups.items(), key=lambda kv: -len(kv[1]))) + "</ul>")
hub("about/", "About Animeter", "What Animeter is, where its data comes from and how to get in touch.",
    '<div class="prose"><h1>About Animeter</h1><p>Animeter is a fan-made guide to anime. It ranks about a thousand series and answers the questions people ask before and after watching: is it worth pushing through, which episodes are filler, what order to watch in, and which chapter of the manga or light novel to read once the anime ends.</p>'
    '<h2>Where the data comes from</h2><p>Scores, popularity, genres, tags, covers and season lists come from <a href="https://anilist.co">AniList</a>. Filler and arc data and the manga hand-off points are researched per series, and each series page links its sources. Drop points and Animeter ratings come from visitors who sign in and report.</p>'
    '<h2>Corrections and contact</h2><p>Spotted a wrong chapter or a missing series? Open an issue on <a href="https://github.com/thRunyCn/animeter/issues">GitHub</a>.</p></div>')
hub("privacy/", "Privacy policy · Animeter", "What Animeter stores about you and why.",
    f'<div class="prose"><h1>Privacy policy</h1><p>Last updated {fetched}.</p>'
    '<h2>What we store</h2><p>If you sign in, we store your email address and the ratings, list entries and drop-point reports you make, so you can see and change them. Sign-in and storage are handled by <a href="https://supabase.com">Supabase</a>. Your ratings and reports are counted, without your email, in the public totals on each series page.</p>'
    '<h2>On your device</h2><p>Your browser keeps your sign-in session and a few display choices (such as list or cover view) in local storage. We use no tracking cookies and no advertising.</p>'
    '<h2>Your choices</h2><p>You can sign out at any time. To have your account and data deleted, open an issue on <a href="https://github.com/thRunyCn/animeter/issues">GitHub</a> or write to the address you signed in with and ask; we delete it within 30 days.</p>'
    '<h2>Others</h2><p>Covers are served from this site. Fonts are served from this site too. Links to AniList, MyAnimeList and other sources take you to sites with their own policies.</p></div>')

w("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + "".join(f"  <url><loc>{u}</loc><lastmod>{fetched}</lastmod></url>\n" for u in urls) + "</urlset>\n")
# small copies of the most popular covers for the drifting wall on the first screen (the page falls back to the full cover)
try:
    from PIL import Image
    os.makedirs(os.path.join(COVERS, "w"), exist_ok=True)
    for x in sorted((x for x in series if x.get("popularity")), key=lambda x: -x["popularity"])[:56]:
        src, dst = os.path.join(COVERS, f'{x["id"]}-anime.jpg'), os.path.join(COVERS, "w", f'{x["id"]}.jpg')
        if os.path.exists(src) and not os.path.exists(dst):
            im = Image.open(src).convert("RGB"); im.thumbnail((200, 290)); im.save(dst, quality=72, optimize=True, progressive=True)
except ImportError: pass
if os.path.isdir(COVERS): shutil.copytree(COVERS, os.path.join(DIST, "covers"))
print(f"web/dist: {len(urls)} pages for {SITE}, supabase {'on' if cfg.get('supabaseUrl') else 'off'}")
