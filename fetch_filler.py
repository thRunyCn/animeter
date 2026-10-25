#!/usr/bin/env python3
"""Filler lists for the series that have no hand-researched details, from Anime Filler List (animefillerlist.com).

Matches each AFL show to a site series by title (the series' own titles and every season title in seasons.json,
English and romaji), then reads the show's episode table: manga canon, mixed canon/filler, filler, anime canon.
A series that matches several AFL shows (one per season) gets them joined in season order, numbered continuously.

Writes research/filler_afl.json: {series_id: {"pages": [{"slug", "title", "eps"}], "filler": [[a, b]], "mixed": [...],
"anime_canon": [...], "total": n}} and research/afl_shows.json (every AFL show, for checking unmatched titles).
Needs www.animefillerlist.com, so it runs in GitHub Actions.
"""
import json, os, re, time, html, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://www.animefillerlist.com"
UA = "Mozilla/5.0 (compatible; animeter filler list; +https://thrunycn.github.io/animeter/)"

def get(url, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=40) as r: return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(4 * (i + 1))
        except Exception: time.sleep(4 * (i + 1))
    raise RuntimeError("failed: " + url)

def norm(t):
    t = html.unescape(t or "").lower().replace("&", " and ")
    t = re.sub(r"\(tv\)|\btv\b|\bthe\b", " ", t)
    return re.sub(r"[^a-z0-9]+", "", t)

def ranges(nums):
    out = []
    for n in sorted(set(nums)):
        if out and n == out[-1][1] + 1: out[-1][1] = n
        else: out.append([n, n])
    return out

ROW = re.compile(r'<tr[^>]*class="([^"]*)"[^>]*>\s*<td[^>]*class="Number"[^>]*>\s*(\d+)\s*</td>(.*?)</tr>', re.S)
def episodes(page):
    """[(number, kind)] with kind in canon / mixed / filler / anime_canon."""
    eps = []
    for cls, num, rest in ROW.findall(page):
        typ = re.search(r'class="Type"[^>]*>(.*?)</td>', rest, re.S)
        word = re.sub(r"<[^>]+>", "", typ.group(1) if typ else cls).strip().lower()
        if "mixed" in word or "mixed" in cls: k = "mixed"
        elif "anime canon" in word or "anime_canon" in cls: k = "anime_canon"
        elif "filler" in word or cls.split()[0:1] == ["filler"]: k = "filler"
        else: k = "canon"
        eps.append((int(num), k))
    return eps

def main():
    shows_html = get(BASE + "/shows")
    shows = {}
    for slug, title in re.findall(r'href="/shows/([a-z0-9\-]+)"[^>]*>([^<]+)</a>', shows_html):
        shows.setdefault(slug, html.unescape(title).strip())
    json.dump([{"slug": k, "title": v} for k, v in shows.items()], open(os.path.join(HERE, "research", "afl_shows.json"), "w"), ensure_ascii=False, indent=0)
    print(f"{len(shows)} AFL shows", flush=True)

    top = json.load(open(os.path.join(HERE, "top.json")))
    seasons = json.load(open(os.path.join(HERE, "seasons.json")))
    try: media = json.load(open(os.path.join(HERE, "research", "anilist_media.json")))
    except FileNotFoundError: media = {}
    have = {f[:-5] for f in os.listdir(os.path.join(HERE, "details")) if f.endswith(".json")}
    try: manual = json.load(open(os.path.join(HERE, "research", "afl_map.json")))   # {"afl-slug": "series_id" | null}
    except FileNotFoundError: manual = {}

    # title key -> (series id, season order); a series' own titles count as season 0
    key = {}
    for t in top:
        if t["id"] in have: continue
        names = [(t["title"], 0), (t.get("romaji"), 0)]
        for i, s in enumerate((seasons.get(t["id"]) or {}).get("seasons") or []):
            m = media.get(str(s["id"])) or {}
            ti = m.get("title") or {}
            names += [(s.get("title"), i), (ti.get("english"), i), (ti.get("romaji"), i)]
        for n, i in names:
            k = norm(n)
            if len(k) >= 3 and k not in key: key[k] = (t["id"], i)

    matched = {}
    for slug, title in shows.items():
        if slug in manual:
            if manual[slug]: matched.setdefault(manual[slug], []).append((0, slug, title))
            continue
        hit = key.get(norm(title)) or key.get(norm(slug.replace("-", " ")))
        if hit: matched.setdefault(hit[0], []).append((hit[1], slug, title))
    print(f"{len(matched)} series matched", flush=True)

    out = {}
    for sid, pages in sorted(matched.items()):
        pages = sorted(set(pages))
        offset, kinds, info = 0, {}, []
        for _, slug, title in pages:
            page = get(f"{BASE}/shows/{slug}")
            time.sleep(1.2)
            eps = episodes(page or "")
            if not eps: print("no episodes:", sid, slug, flush=True); continue
            for n, k in eps: kinds[offset + n] = k
            last = max(n for n, _ in eps)
            info.append({"slug": slug, "title": title, "eps": last, "from": offset + 1})
            offset += last
        if not info: continue
        out[sid] = {"pages": info, "total": offset,
                    **{k: ranges(n for n, v in kinds.items() if v == k) for k in ("filler", "mixed", "anime_canon")}}
        f = sum(b - a + 1 for a, b in out[sid]["filler"])
        print(f"{sid}: {', '.join(p['slug'] for p in info)}: {offset} episodes, {f} filler", flush=True)
    json.dump(out, open(os.path.join(HERE, "research", "filler_afl.json"), "w"), ensure_ascii=False, indent=1)
    print(f"wrote filler for {len(out)} series", flush=True)
    unmatched = [f"{s}\t{t}" for s, t in shows.items() if not any(s == p[1] for v in matched.values() for p in v)]
    print(f"{len(unmatched)} AFL shows unmatched:\n" + "\n".join(unmatched), flush=True)

if __name__ == "__main__": main()
