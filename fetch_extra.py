#!/usr/bin/env python3
"""Add hand-picked series that miss AniList's top list (extra.json) to top.json, seasons.json and tags.json,
with covers in web/covers. Runs in GitHub Actions (.github/workflows/fetch-extra.yml): the build sandbox
can't reach AniList.

extra.json: [{"id": "berserk2016", "title": "Berserk (2016)", "seasons": [21560, 97643], "manga": 30002, "kind": "manga"}]
"""
import json, os, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
COVERS = os.path.join(HERE, "web", "covers")
Q = """query($ids:[Int]){Page(perPage:50){media(id_in:$ids){id type format status episodes seasonYear averageScore meanScore popularity genres
  title{romaji english native} coverImage{extraLarge large color} siteUrl idMal chapters volumes
  tags{name rank category isAdult isMediaSpoiler isGeneralSpoiler}}}}"""
def get(url, body=None):
    for i in range(8):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "animeter extra"})
            with urllib.request.urlopen(req, timeout=40) as r: return r.read()
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, flush=True)
            if e.code in (429, 500, 502, 503): time.sleep(int(e.headers.get("Retry-After") or 0) or 5 * (i + 1)); continue
            raise
def load(name, default):
    try: return json.load(open(os.path.join(HERE, name)))
    except FileNotFoundError: return default
top, runs, tags = load("top.json", []), load("seasons.json", {}), load("tags.json", {})
for x in load("extra.json", []):
    ids = x["seasons"] + ([x["manga"]] if x.get("manga") else [])
    m = {a["id"]: a for a in json.loads(get("https://graphql.anilist.co", {"query": Q, "variables": {"ids": ids}}))["data"]["Page"]["media"]}
    ss = [m[i] for i in x["seasons"] if i in m]
    first, manga = ss[0], m.get(x.get("manga"))
    eps = sum(a.get("episodes") or 0 for a in ss)
    pops = [a.get("popularity") or 0 for a in ss]
    scores = [(a.get("averageScore") or a.get("meanScore"), a.get("popularity") or 1) for a in ss if (a.get("averageScore") or a.get("meanScore"))]
    entry = {"id": x["id"], "title": x["title"], "romaji": first["title"]["romaji"], "jp": first["title"]["native"] or "",
             "kind": x.get("kind", "original"), "format": first["format"], "eps": eps, "status": ss[-1]["status"],
             "year": first.get("seasonYear"), "score": round(sum(s*p for s, p in scores) / sum(p for _, p in scores)) if scores else None,
             "popularity": max(pops), "genres": first.get("genres") or [], "tone": (first.get("coverImage") or {}).get("color") or "#4a5160",
             "rank": len(top) + 1, "mal": first.get("idMal"), "anilist": first["id"], "seasonsInTop": 1,
             "source": {"id": manga["id"], "format": manga["format"], "status": manga["status"], "chapters": manga.get("chapters"),
                        "volumes": manga.get("volumes"), "url": manga["siteUrl"]} if manga else None}
    top = [t for t in top if t["id"] != x["id"]] + [entry]
    runs[x["id"]] = {"seasons": [{"id": a["id"], "title": a["title"]["english"] or a["title"]["romaji"], "format": a["format"], "year": a.get("seasonYear"),
                                  "status": a["status"], "url": a["siteUrl"], "eps": a.get("episodes"), "aired": a.get("episodes")} for a in ss], "extras": []}
    tags[x["id"]] = [[t["name"], t["rank"], t["category"]] for t in first["tags"]
                     if not t["isAdult"] and not t["isMediaSpoiler"] and not t["isGeneralSpoiler"] and (t["rank"] or 0) >= 50]
    for kind, a in (("anime", first), ("manga", manga)):
        if not a: continue
        url = (a.get("coverImage") or {}).get("extraLarge") or (a.get("coverImage") or {}).get("large")
        if url: open(os.path.join(COVERS, f'{x["id"]}-{kind}.jpg'), "wb").write(get(url))
    print("added", x["id"], entry["score"], eps, "eps", len(ss), "seasons")
    time.sleep(2)
json.dump(top, open(os.path.join(HERE, "top.json"), "w"), ensure_ascii=False)
json.dump(runs, open(os.path.join(HERE, "seasons.json"), "w"), ensure_ascii=False)
json.dump(tags, open(os.path.join(HERE, "tags.json"), "w"), ensure_ascii=False, indent=0, sort_keys=True)
