#!/usr/bin/env python3
"""Grow the catalogue from AniList's top-rated anime.

1. AniList (graphql.anilist.co) gives the list by average score, with metadata, relations and covers.
3. Entries that are seasons/sequels/films of the same franchise are folded together
   (union over PREQUEL/SEQUEL/PARENT/SIDE_STORY/SUMMARY edges), so each franchise appears once.
4. Franchises already in series.json are skipped. Stops at TARGET franchises in total.

Writes top.json (new series, rank order) and downloads covers to covers/<id>-anime.jpg and,
for manga / light novel sources, covers/<id>-manga.jpg.
Needs network access to graphql.anilist.co and s4.anilist.co.

  python3 fetch_top.py            # full run
  python3 fetch_top.py --no-covers
"""
import json, os, re, sys, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
COVERS = os.path.join(HERE, "covers"); os.makedirs(COVERS, exist_ok=True)
UA = "Mozilla/5.0 (animeter catalogue builder)"
TARGET = 1000                      # franchises in total, existing ones included
MAX_PAGES = 60                     # 50 entries per AniList page -> up to 3000 ranked entries
FOLD = {"PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "SUMMARY"}

def get(url, data=None, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504): time.sleep(int(e.headers.get("Retry-After") or 0) or 2 * (i + 1)); continue
            raise
        except Exception:
            time.sleep(2 * (i + 1))
    raise RuntimeError("giving up on " + url)

# ---------- 1+2. AniList ranking (by average score), with metadata, relations and covers ----------
# The user chose AniList's ranking over MyAnimeList's (Jikan is blocked where this runs).
# MIN_POP keeps out obscure entries whose score rests on a handful of votes.
MIN_POP = 15000
Q = """query($page:Int){Page(page:$page,perPage:50){pageInfo{hasNextPage}
 media(type:ANIME,sort:SCORE_DESC,isAdult:false,popularity_greater:%d){
 id idMal format status episodes seasonYear startDate{year month} source averageScore meanScore popularity genres
 title{romaji english native} coverImage{extraLarge large color} siteUrl
 relations{edges{relationType(version:2) node{id idMal type format status chapters volumes title{romaji english} coverImage{extraLarge large} siteUrl}}}}}}""" % MIN_POP
os.makedirs(os.path.join(HERE, "research"), exist_ok=True)
cache_al = os.path.join(HERE, "research", "anilist_top.json")
try: pages = json.load(open(cache_al))
except Exception: pages = []
existing = json.load(open(os.path.join(HERE, "series.json")))
meta = json.load(open(os.path.join(HERE, "meta.json")))
while len(pages) < MAX_PAGES:
    res = json.loads(get("https://graphql.anilist.co", json.dumps({"query": Q, "variables": {"page": len(pages) + 1}}).encode()))
    pages.append(res["data"]["Page"]["media"])
    json.dump(pages, open(cache_al, "w"))
    print(f"AniList page {len(pages)}: {sum(len(p) for p in pages)} entries", flush=True)
    if not res["data"]["Page"]["pageInfo"]["hasNextPage"] or sum(len(p) for p in pages) >= 2600: break
    time.sleep(2.2)
ranked, al = [], {}
for m in (m for p in pages for m in p):
    if m["format"] in ("MUSIC", "SPECIAL"): continue
    ranked.append({"key": str(m["id"]), "rank": len(ranked) + 1, "score": m.get("averageScore")})
    al[str(m["id"])] = m

# ---------- 3. fold franchises ----------
parent = {}
def find(x):
    parent.setdefault(x, x)
    while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
    return x
def union(a, b): parent[find(a)] = find(b)
for m in al.values():
    if not m: continue
    find(m["id"])
    for e in m["relations"]["edges"]:
        if e["relationType"] in FOLD and e["node"]["type"] == "ANIME": union(m["id"], e["node"]["id"])
# Relation chains break when a middle season isn't in the list, so also fold by title:
# "Shingeki no Kyojin: The Final Season" joins "Shingeki no Kyojin".
norm = lambda t: re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()
heads = []                                     # (normalised romaji, anilist id), shortest first
for s in existing:
    a = (meta.get(s["id"]) or {}).get("anime") or {}
    if a.get("id"): find(a["id"]); heads.append((norm((a.get("title") or {}).get("romaji")), a["id"]))
for m in al.values():
    if m and m["format"] in ("TV", "ONA", "TV_SHORT"): heads.append((norm(m["title"]["romaji"]), m["id"]))
heads = sorted({h for h in heads if len(h[0]) >= 5}, key=lambda h: len(h[0]))
for m in al.values():
    if not m: continue
    t = norm(m["title"]["romaji"])
    for h, hid in heads:
        if len(h) >= len(t): break
        if t.startswith(h + " "): union(m["id"], hid); break
have_ids = {}
for s in existing:
    a = (meta.get(s["id"]) or {}).get("anime") or {}
    if a.get("id"): have_ids[find(a["id"])] = s["id"]
groups, order = {}, []
for r in ranked:
    m = al.get(r["key"])
    if not m: continue
    g = find(m["id"])
    if g not in groups: groups[g] = []; order.append(g)
    groups[g].append((r, m))
taken = {s["id"] for s in existing}
def slug(t):
    s = re.sub(r"[^a-z0-9]+", "", (t or "").lower())[:24] or "anime"
    base, n = s, 2
    while s in taken: s = f"{base}{n}"; n += 1
    taken.add(s); return s
SRC = {"MANGA": "manga", "WEB_MANGA": "manga", "LIGHT_NOVEL": "novel", "NOVEL": "novel", "WEB_NOVEL": "novel", "VISUAL_NOVEL": "vn", "VIDEO_GAME": "vn", "ORIGINAL": "original"}
out, total = [], len(existing)
for g in order:
    if total >= TARGET: break
    if g in have_ids: continue
    entries = groups[g]
    best = entries[0]                                        # best-ranked entry of the franchise
    def start(e): d = e[1]["startDate"] or {}; return (d.get("year") or 9999, d.get("month") or 12)
    tv = [e for e in entries if e[1]["format"] in ("TV", "ONA", "TV_SHORT")]
    first = min(tv or entries, key=start)                     # first season present = the page's anchor
    r, m = first
    t = m["title"]
    src = None
    for e in m["relations"]["edges"]:
        n = e["node"]
        if e["relationType"] == "SOURCE" and n["type"] == "MANGA": src = n; break
    out.append({
        "id": slug(t.get("english") or t.get("romaji")),
        "title": t.get("english") or t.get("romaji"), "romaji": t.get("romaji"), "jp": t.get("native") or "",
        "kind": SRC.get(m.get("source") or "", "manga" if src else "original"),
        "format": m["format"], "eps": m.get("episodes"), "status": m["status"],
        "year": m.get("seasonYear") or (m.get("startDate") or {}).get("year"),
        "score": m.get("averageScore") or m.get("meanScore"), "popularity": m.get("popularity"),
        "genres": (m.get("genres") or [])[:3], "tone": (m.get("coverImage") or {}).get("color"),
        "rank": best[0]["rank"], "mal": m.get("idMal"), "anilist": m["id"],
        "seasonsInTop": len(entries),
        "source": {"id": src["id"], "format": src["format"], "status": src["status"], "chapters": src.get("chapters"), "volumes": src.get("volumes"),
                   "url": src["siteUrl"]} if src else None,
        "_cover": (m.get("coverImage") or {}).get("extraLarge") or (m.get("coverImage") or {}).get("large"),
        "_srcCover": ((src or {}).get("coverImage") or {}).get("extraLarge") or ((src or {}).get("coverImage") or {}).get("large"),
    })
    total += 1
print(f"{len(out)} new franchises (total {total}) from {len(ranked)} ranked AniList entries", flush=True)

# ---------- 4. covers ----------
if "--no-covers" not in sys.argv:
    for i, s in enumerate(out):
        for key, suffix in (("_cover", "anime"), ("_srcCover", "manga")):
            url, path = s.get(key), os.path.join(COVERS, f"{s['id']}-{suffix}.jpg")
            if not url or os.path.exists(path): continue
            try: open(path, "wb").write(get(url))
            except Exception as e: print("cover failed", s["id"], suffix, e, flush=True)
            time.sleep(0.15)
        if i % 50 == 0: print(f"covers {i}/{len(out)}", flush=True)
for s in out: s.pop("_cover", None); s.pop("_srcCover", None)
json.dump(out, open(os.path.join(HERE, "top.json"), "w"), ensure_ascii=False, indent=1)
print("wrote top.json")
