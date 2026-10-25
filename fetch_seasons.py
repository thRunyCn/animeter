#!/usr/bin/env python3
"""Collect every season of every series on the site, so pages can cover the whole run, not just season 1.

For each series it starts at the anchor anime (meta.json for the hand-checked 105, top.json for the rest)
and follows SEQUEL edges on AniList. TV / TV_SHORT / ONA entries become seasons, in airing order;
films, OVAs and specials met on the way are kept as extras. The walk stops at an entry that is another
site series' anchor, or whose title no longer looks like the same franchise (Naruto -> Boruto).

Writes seasons.json: {series_id: {"seasons": [...], "extras": [...]}}.
Needs graphql.anilist.co. Caches fetched media in research/anilist_media.json, so reruns are cheap.
"""
import json, os, re, sys, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (animeter seasons)"
CACHE = os.path.join(HERE, "research", "anilist_media.json")
SEASON_FMT = {"TV", "TV_SHORT", "ONA"}
EXTRA_FMT = {"MOVIE", "OVA", "SPECIAL"}
MAX_NODES = 80

def post(q, v, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request("https://graphql.anilist.co", json.dumps({"query": q, "variables": v}).encode(),
                                         {"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503): time.sleep(int(e.headers.get("Retry-After") or 0) or 3 * (i + 1)); continue
            raise
        except Exception: time.sleep(3 * (i + 1))
    raise RuntimeError("AniList kept failing")

Q = """query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){
 id format status episodes seasonYear season startDate{year month day} title{romaji english}
 nextAiringEpisode{episode airingAt} siteUrl
 relations{edges{relationType(version:2) node{id type format}}}}}}"""
try: cache = {int(k): v for k, v in json.load(open(CACHE)).items()}
except Exception: cache = {}
def fetch(ids):
    ids = [i for i in dict.fromkeys(ids) if i not in cache]
    for k in range(0, len(ids), 50):
        chunk = ids[k:k + 50]
        res = post(Q, {"ids": chunk})
        for m in res["data"]["Page"]["media"]: cache[m["id"]] = m
        for i in chunk: cache.setdefault(i, None)
        json.dump(cache, open(CACHE, "w"))
        time.sleep(2.2)

series = json.load(open(os.path.join(HERE, "series.json")))
meta = json.load(open(os.path.join(HERE, "meta.json")))
try: top = json.load(open(os.path.join(HERE, "top.json")))
except FileNotFoundError: top = []
anchors = {}
for s in series:
    a = (meta.get(s["id"]) or {}).get("anime") or {}
    if a.get("id"): anchors[s["id"]] = a["id"]
for t in top: anchors[t["id"]] = t["anilist"]
anchor_ids = {v: k for k, v in anchors.items()}

# Sequel-marking words that can lead a title: "Zoku Owarimonogatari", "New PANTY & STOCKING", "Motto! Ojamajo Doremi".
LEAD = {"zoku", "shin", "new", "motto", "hello", "tsugu", "sayonara"}
def first(t):
    w = re.findall(r"[a-z0-9]+", (t or "").lower())
    while len(w) > 1 and w[0] in LEAD: w = w[1:]
    return (w or [""])[0]
def close(a, b):
    a, b = first(a), first(b)
    if not a or not b: return False
    if a == b: return True
    n = 0                                   # Bakemonogatari / Nisemonogatari share "monogatari"
    while n < min(len(a), len(b)) and a[-1 - n] == b[-1 - n]: n += 1
    return n >= 7
def same_franchise(root, node):
    rt, nt = root["title"], node["title"]
    return any(close(a, b) for a in (rt.get("romaji"), rt.get("english")) for b in (nt.get("romaji"), nt.get("english")))

# Breadth-first, one AniList round per depth level across all series at once.
fetch(list(anchors.values()))
state = {sid: {"seen": {aid}, "frontier": [aid], "nodes": [aid]} for sid, aid in anchors.items() if cache.get(aid)}
for depth in range(40):
    want = []
    for sid, st in state.items():
        nxt = []
        for mid in st["frontier"]:
            m = cache.get(mid)
            if not m: continue
            for e in m["relations"]["edges"]:
                n = e["node"]
                if e["relationType"] != "SEQUEL" or n["type"] != "ANIME" or n["id"] in st["seen"]: continue
                if n["id"] in anchor_ids and anchor_ids[n["id"]] != sid: continue
                if len(st["nodes"]) >= MAX_NODES: continue
                st["seen"].add(n["id"]); nxt.append(n["id"])
        st["frontier"] = nxt; want += nxt
    if not want: break
    fetch(want)
    for sid, st in state.items():
        root = cache[anchors[sid]]
        keep = [i for i in st["frontier"] if cache.get(i) and same_franchise(root, cache[i])]
        st["frontier"] = keep; st["nodes"] += keep
    print(f"depth {depth + 1}: fetched {len(want)}", flush=True)

def when(m):
    d = m.get("startDate") or {}
    return (d.get("year") or 9999, d.get("month") or 12, d.get("day") or 31)
def aired(m):
    nae = m.get("nextAiringEpisode") or {}
    if m.get("status") == "RELEASING" and nae.get("episode"): return m.get("episodes"), nae["episode"] - 1
    return m.get("episodes"), m.get("episodes")
out = {}
for sid, st in state.items():
    ms = sorted((cache[i] for i in st["nodes"] if cache.get(i)), key=when)
    seasons, extras = [], []
    for m in ms:
        if m["status"] == "NOT_YET_RELEASED": continue
        t = re.sub(r"(?<=\w)\u2018(?=\w)", "\u2019", m["title"].get("english") or m["title"].get("romaji"))   # AniList has "Howl‘s"
        total, done = aired(m)
        row = {"id": m["id"], "title": t, "format": m["format"], "year": (m.get("startDate") or {}).get("year"), "status": m["status"], "url": m["siteUrl"]}
        if m["format"] in SEASON_FMT:
            seasons.append({**row, "eps": total, "aired": done})
        elif m["format"] in EXTRA_FMT:
            extras.append({**row, "eps": total})
    out[sid] = {"seasons": seasons, "extras": extras}
json.dump(out, open(os.path.join(HERE, "seasons.json"), "w"), ensure_ascii=False, indent=1)
multi = sum(1 for v in out.values() if len(v["seasons"]) > 1)
print(f"wrote seasons.json for {len(out)} series ({multi} with more than one season)")
