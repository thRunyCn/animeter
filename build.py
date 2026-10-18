#!/usr/bin/env python3
"""Build index.html from page.src.html + series.json (hand-checked hand-off data) + meta.json (AniList)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
def load():
  """Return (series list merged with AniList meta, details by id, fetched date)."""
  series = json.load(open(os.path.join(HERE, "series.json")))
  try: meta = json.load(open(os.path.join(HERE, "meta.json")))
  except FileNotFoundError: meta = {}
  out = []
  for s in series:
      a = (meta.get(s["id"]) or {}).get("anime") or {}
      if a:
          s["score"] = a.get("averageScore") or a.get("meanScore")
          s["popularity"] = a.get("popularity")
          s["year"] = a.get("seasonYear")
          s["genres"] = (a.get("genres") or [])[:3]
          if not s.get("eps"): s["eps"] = a.get("episodes")
          if a.get("color") and not s.get("tone"): s["tone"] = a["color"]
          if not s.get("jp"): s["jp"] = (a.get("title") or {}).get("native") or ""
          if not s.get("kind"):
              src = a.get("source") or "MANGA"
              s["kind"] = "original" if src == "ORIGINAL" else "vn" if src in ("VISUAL_NOVEL","VIDEO_GAME") else "novel" if src in ("LIGHT_NOVEL","NOVEL","WEB_NOVEL") else "manga"
      if not s.get("eps"):
          print("skip (no episode count):", s["id"], file=sys.stderr); continue
      s.setdefault("kind", "manga")
      s.setdefault("epsLabel", "Season 1")
      out.append(s)
  details = {}
  ddir = os.path.join(HERE, "details")
  ids = {s["id"] for s in out}
  for f in sorted(os.listdir(ddir)) if os.path.isdir(ddir) else []:
      if not f.endswith(".json"): continue
      try: d = json.load(open(os.path.join(ddir, f)))
      except Exception as e: print("bad details file", f, e, file=sys.stderr); continue
      if d.get("id") in ids: details[d["id"]] = d
  return out, details, meta.get("_fetched", "")

if __name__ == "__main__":
  out, details, fetched = load()
  page = open(os.path.join(HERE, "page.src.html")).read()
  page = page.replace("/*SERIES*/[]", json.dumps(out, ensure_ascii=False)).replace("/*DETAILS*/{}", json.dumps(details, ensure_ascii=False)).replace('/*FETCHED*/""', json.dumps(fetched))
  open(os.path.join(HERE, "index.html"), "w").write(page)
  print(f"built index.html with {len(out)} series, {len(details)} with arc/filler details")
