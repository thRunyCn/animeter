#!/usr/bin/env python3
"""Fetch each series' AniList description, as source material for the short summaries on series pages.

Writes research/synopsis_src.json: {"<series id>": "description text"}. The text is only a reference for
writing our own one or two sentence summary (synopsis.json); it isn't published as is.
Runs in GitHub Actions (.github/workflows/fetch-synopsis.yml) because the build sandbox can't reach graphql.anilist.co.
"""
import json, os, re, html, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
ids = {}
for k, v in json.load(open(os.path.join(HERE, "meta.json"))).items():
    a = (v.get("anime") if isinstance(v, dict) else None) or {}
    if a.get("id"): ids[a["id"]] = k
for t in json.load(open(os.path.join(HERE, "top.json"))):
    if t.get("anilist"): ids[t["anilist"]] = t["id"]
Q = "query($ids:[Int],$p:Int){Page(page:$p,perPage:50){media(id_in:$ids,type:ANIME){id description(asHtml:false)}}}"
def post(body):
    for i in range(8):
        try:
            req = urllib.request.Request("https://graphql.anilist.co", data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "animeter synopsis"})
            with urllib.request.urlopen(req, timeout=40) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, flush=True)
            if e.code in (429, 500, 502, 503): time.sleep(int(e.headers.get("Retry-After") or 0) or 5 * (i + 1)); continue
            raise
        except Exception: time.sleep(5 * (i + 1))
    raise SystemExit("AniList kept failing")
out, keys = {}, list(ids)
for i in range(0, len(keys), 50):
    for m in post({"query": Q, "variables": {"ids": keys[i:i+50], "p": 1}})["data"]["Page"]["media"]:
        d = html.unescape(re.sub(r"<[^>]+>", "", m.get("description") or "")).strip()
        if d: out[ids[m["id"]]] = d
    time.sleep(2.2)
    print(f"{min(i+50, len(keys))}/{len(keys)}", flush=True)
json.dump(out, open(os.path.join(HERE, "research", "synopsis_src.json"), "w"), ensure_ascii=False, indent=0)
print(f"{len(out)} descriptions", flush=True)
