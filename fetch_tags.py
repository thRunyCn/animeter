#!/usr/bin/env python3
"""Fetch AniList tags (Shounen, Isekai, Time Travel...) for every series and write tags.json.

{"<series id>": [["Shounen", 95, "Demographic"], ["Isekai", 88, "Theme-Fantasy"], ...]}
Only non-adult, non-spoiler tags with rank >= 50. Runs in GitHub Actions (.github/workflows/fetch-tags.yml)
because the build sandbox can't reach graphql.anilist.co.
"""
import json, os, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
ids = {}
for k, v in json.load(open(os.path.join(HERE, "meta.json"))).items():
    a = (v.get("anime") if isinstance(v, dict) else None) or {}
    if a.get("id"): ids[a["id"]] = k
for t in json.load(open(os.path.join(HERE, "top.json"))):
    if t.get("anilist"): ids[t["anilist"]] = t["id"]
Q = "query($ids:[Int],$p:Int){Page(page:$p,perPage:50){media(id_in:$ids,type:ANIME){id tags{name rank category isAdult isMediaSpoiler isGeneralSpoiler}}}}"
def post(body):
    for i in range(8):
        try:
            req = urllib.request.Request("https://graphql.anilist.co", data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "animeter tags"})
            with urllib.request.urlopen(req, timeout=40) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, e.read()[:300], flush=True)
            if e.code in (429, 500, 502, 503): time.sleep(int(e.headers.get("Retry-After") or 0) or 5 * (i + 1)); continue
            raise
    raise SystemExit("AniList kept failing")
out, keys = {}, list(ids)
for i in range(0, len(keys), 50):
    chunk = keys[i:i+50]
    d = post({"query": Q, "variables": {"ids": chunk, "p": 1}})
    for m in d["data"]["Page"]["media"]:
        out[ids[m["id"]]] = [[t["name"], t["rank"], t["category"]] for t in m["tags"]
                             if not t["isAdult"] and not t["isMediaSpoiler"] and not t["isGeneralSpoiler"] and (t["rank"] or 0) >= 50]
    time.sleep(2.5)
json.dump(out, open(os.path.join(HERE, "tags.json"), "w"), ensure_ascii=False, indent=0, sort_keys=True)
print(len(out), "series tagged of", len(ids))
