#!/usr/bin/env python3
"""Weekly (GitHub Actions, .github/workflows/weekly-seasons.yml): refresh seasons.json from AniList and log
every season that finished airing or newly appeared since last week in research/recent_finished.json,
so the weekly Claude routine knows which "where does the anime end in the manga" answers to research."""
import json, os, subprocess, sys, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(HERE, "seasons.json"); LOG = os.path.join(HERE, "research", "recent_finished.json")
old = json.load(open(P))
subprocess.run([sys.executable, os.path.join(HERE, "fetch_seasons.py")], check=True)
new = json.load(open(P))
was = {x["id"]: x["status"] for v in old.values() for x in v.get("seasons", [])}
try: log = json.load(open(LOG))
except FileNotFoundError: log = []
seen = {(e["series"], e["season_id"]) for e in log}
today = datetime.date.today().isoformat()
for sid, v in new.items():
    for i, x in enumerate(v.get("seasons", [])):
        if x["status"] == "FINISHED" and was.get(x["id"]) != "FINISHED" and (sid, x["id"]) not in seen:
            log.append({"series": sid, "season_id": x["id"], "season": x["title"], "number": i + 1, "eps": x.get("eps"),
                        "found": today, "handled": False})
json.dump(log, open(LOG, "w"), ensure_ascii=False, indent=1)
print(sum(1 for e in log if e["found"] == today), "seasons finished since last run")
