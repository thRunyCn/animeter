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
  python3 fetch_top.py --popular  # add AniList's most popular franchises (top POP_TARGET by popularity) to top.json,
                                  # keeping the series already there; covers go straight to web/covers at 460px
"""
import json, os, re, sys, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
COVERS = os.path.join(HERE, "covers"); os.makedirs(COVERS, exist_ok=True)
UA = "Mozilla/5.0 (animeter catalogue builder)"
TARGET = 1000                      # franchises in total, existing ones included
MAX_PAGES = 60                     # 50 entries per AniList page -> up to 3000 ranked entries
FOLD = {"PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "SUMMARY", "ALTERNATIVE"}  # ALTERNATIVE: remakes (FMA/FMAB, HxH 1999/2011)

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
POPULAR = "--popular" in sys.argv     # rank by popularity instead of score
POP_TARGET = 1000                     # the most popular franchises on AniList, counting ones the site already has
Q = """query($page:Int){Page(page:$page,perPage:50){pageInfo{hasNextPage}
 media(type:ANIME,sort:%s,isAdult:false,popularity_greater:%d){
 id idMal format status episodes seasonYear startDate{year month} source averageScore meanScore popularity genres
 title{romaji english native} coverImage{extraLarge large color} siteUrl
 relations{edges{relationType(version:2) node{id idMal type format status chapters volumes title{romaji english} coverImage{extraLarge large} siteUrl}}}}}}""" % (("POPULARITY_DESC", 1000) if POPULAR else ("SCORE_DESC", MIN_POP))
os.makedirs(os.path.join(HERE, "research"), exist_ok=True)
cache_al = os.path.join(HERE, "research", "anilist_popular.json" if POPULAR else "anilist_top.json")
try: pages = json.load(open(cache_al))
except Exception: pages = []
existing = json.load(open(os.path.join(HERE, "series.json")))
try: prev_top = json.load(open(os.path.join(HERE, "top.json")))
except FileNotFoundError: prev_top = []
meta = json.load(open(os.path.join(HERE, "meta.json")))
while len(pages) < MAX_PAGES and sum(len(p) for p in pages) < 2600:
    res = json.loads(get("https://graphql.anilist.co", json.dumps({"query": Q, "variables": {"page": len(pages) + 1}}).encode()))
    pages.append(res["data"]["Page"]["media"])
    json.dump(pages, open(cache_al, "w"))
    print(f"AniList page {len(pages)}: {sum(len(p) for p in pages)} entries", flush=True)
    if not res["data"]["Page"]["pageInfo"]["hasNextPage"] or sum(len(p) for p in pages) >= 2600: break
    time.sleep(2.2)
ranked, al = [], {}
for m in (m for p in pages for m in p):
    if m["format"] in ("MUSIC", "SPECIAL") or m["status"] in ("NOT_YET_RELEASED", "CANCELLED"): continue
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
# Parentheticals like "(TV)" or "(2011)" are dropped so "JoJo no Kimyou na Bouken (TV)" heads its OVA and films.
norm = lambda t: re.sub(r"[^a-z0-9]+", " ", re.sub(r"\(.*?\)", " ", (t or "").lower())).strip()
heads = []                                     # (normalised romaji, anilist id), shortest first
for s in existing:
    a = (meta.get(s["id"]) or {}).get("anime") or {}
    if a.get("id"): find(a["id"]); heads.append((norm((a.get("title") or {}).get("romaji")), a["id"]))
if POPULAR:                                   # series added by earlier runs head their franchise too
    for t in prev_top:
        if t.get("anilist"): find(t["anilist"]); heads.append((norm(t.get("romaji")), t["anilist"]))
for m in al.values():
    if m and m["format"] in ("TV", "ONA", "TV_SHORT"): heads.append((norm(m["title"]["romaji"]), m["id"]))
heads = sorted({h for h in heads if len(h[0]) >= 5}, key=lambda h: len(h[0]))
for m in al.values():
    if not m: continue
    t = norm(m["title"]["romaji"])
    for h, hid in heads:
        if len(h) > len(t): break
        if hid != m["id"] and (t == h or t.startswith(h + " ")): union(m["id"], hid); break
# "Fate/stay night", "Fate/Zero", "Fate/strange Fake": the part before the slash names the franchise.
slash = {}
for m in al.values():
    r = (m["title"]["romaji"] or "")
    if "/" in r and len(r.split("/")[0].strip()) >= 3: slash.setdefault(norm(r.split("/")[0]), []).append(m["id"])
for ids in slash.values():
    for x in ids[1:]: union(x, ids[0])
# Same text before a colon is the same franchise too ("Code Geass: Boukoku no Akito" joins "Code Geass: Hangyaku no Lelouch").
colon = {}
for t, i in [(((meta.get(s_["id"]) or {}).get("anime") or {}).get("title", {}).get("romaji"), ((meta.get(s_["id"]) or {}).get("anime") or {}).get("id")) for s_ in existing] + [(m["title"]["romaji"], m["id"]) for m in al.values()]:
    if not t or not i or ":" not in t: continue
    k = norm(t.split(":")[0])
    if len(k) >= 5: colon.setdefault(k, []).append(i)
for ids in colon.values():
    for x in ids[1:]: union(x, ids[0])
# Hand-made folds that neither relations nor titles catch: (anilist id, anilist id of the same franchise).
for x, y in [(128207, 170)]:        # THE FIRST SLAM DUNK -> Slam Dunk
    union(x, y)
have_ids = {}
for s in existing:
    a = (meta.get(s["id"]) or {}).get("anime") or {}
    if a.get("id"): have_ids[find(a["id"])] = s["id"]
if POPULAR:
    for t in prev_top:
        if t.get("anilist"): have_ids[find(t["anilist"])] = t["id"]
groups, order = {}, []
for r in ranked:
    m = al.get(r["key"])
    if not m: continue
    g = find(m["id"])
    if g not in groups: groups[g] = []; order.append(g)
    groups[g].append((r, m))
# The first season may be outside the top list (Arifureta's TV season scores below its Prologue), so walk
# PREQUEL/SEQUEL edges to whichever season aired earlier. Story order differs from airing order both ways:
# Fate/Zero is a prequel that aired later, and Arifureta's Prologue is a prequel to the earlier TV season.
cache_x = os.path.join(HERE, "research", "anilist_extra.json")
try: extra = json.load(open(cache_x))
except Exception: extra = {}
QX = "query($id:Int){Media(id:$id)" + Q[Q.index("{\n id "):-2] + "}"   # same fields as Q, one item by id
def full(i):
    if str(i) in al: return al[str(i)]
    if str(i) not in extra:
        extra[str(i)] = json.loads(get("https://graphql.anilist.co", json.dumps({"query": QX, "variables": {"id": i}}).encode()))["data"]["Media"]
        json.dump(extra, open(cache_x, "w")); time.sleep(2.2)
    return extra[str(i)]
def sd(m): d = m.get("startDate") or {}; return (d.get("year") or 9999, d.get("month") or 12)
def earliest(m):
    for _ in range(12):
        pre = [e["node"]["id"] for e in m["relations"]["edges"] if e["relationType"] in ("PREQUEL", "SEQUEL") and e["node"]["type"] == "ANIME"
               and e["node"]["format"] in ("TV", "ONA", "TV_SHORT")]
        cands = [x for x in (full(i) for i in pre) if x and sd(x) < sd(m)]
        if not cands: return m
        m = min(cands, key=sd)
    return m
taken = {s["id"] for s in existing} | {t["id"] for t in prev_top}
def slug(t):
    s = re.sub(r"[^a-z0-9]+", "", (t or "").lower())[:24] or "anime"
    base, n = s, 2
    while s in taken: s = f"{base}{n}"; n += 1
    taken.add(s); return s
SRC = {"MANGA": "manga", "WEB_MANGA": "manga", "LIGHT_NOVEL": "novel", "NOVEL": "novel", "WEB_NOVEL": "novel", "VISUAL_NOVEL": "vn", "VIDEO_GAME": "vn", "ORIGINAL": "original"}
out, total = [], len(existing)
seen = 0                                                     # --popular: franchises walked, in popularity order
for g in order:
    if POPULAR:
        seen += 1
        if seen > POP_TARGET: break
    elif total >= TARGET: break
    if g in have_ids: continue
    entries = groups[g]
    best = entries[0]                                        # best-ranked entry of the franchise
    def start(e): d = e[1]["startDate"] or {}; return (d.get("year") or 9999, d.get("month") or 12)
    tv = [e for e in entries if e[1]["format"] in ("TV", "ONA", "TV_SHORT")]
    first = min(tv + [best], key=start)                      # first season present = the page's anchor; the best-ranked
    # entry also counts, so an OVA-first classic (Legend of the Galactic Heroes, 1988) isn't anchored on its 2018 remake
    r, m = first
    m = earliest(m)
    t = m["title"]
    src = None
    for e in m["relations"]["edges"]:
        n = e["node"]
        if e["relationType"] == "SOURCE" and n["type"] == "MANGA": src = n; break
    out.append({
        "id": slug(t.get("english") or t.get("romaji")),
        "title": re.sub(r"(?<=\w)\u2018(?=\w)", "\u2019", t.get("english") or t.get("romaji")),   # AniList has "Howl‘s" "romaji": t.get("romaji"), "jp": t.get("native") or "",
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
if POPULAR: COVERS = os.path.join(HERE, "web", "covers")      # the site's own 460px copies; no root covers/ in the repo
def save(path, data):
    if not POPULAR: open(path, "wb").write(data); return
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if im.width > 460: im = im.resize((460, round(im.height * 460 / im.width)), Image.LANCZOS)
    im.save(path, "JPEG", quality=82, optimize=True, progressive=True)
if "--no-covers" not in sys.argv:
    for i, s in enumerate(out):
        for key, suffix in (("_cover", "anime"), ("_srcCover", "manga")):
            url, path = s.get(key), os.path.join(COVERS, f"{s['id']}-{suffix}.jpg")
            if not url or os.path.exists(path): continue
            try: save(path, get(url))
            except Exception as e: print("cover failed", s["id"], suffix, e, flush=True)
            time.sleep(0.15)
        if i % 50 == 0: print(f"covers {i}/{len(out)}", flush=True)
for s in out: s.pop("_cover", None); s.pop("_srcCover", None)
json.dump(prev_top + out if POPULAR else out, open(os.path.join(HERE, "top.json"), "w"), ensure_ascii=False, indent=1)
print("wrote top.json")
