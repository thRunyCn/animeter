# Animeter

Anime rankings, filler lists, arcs, key events, where people drop each show, and which manga chapter to continue from after the anime.

Live site: https://thrunycn.github.io/animeter/

## How it's built

- `series.json`: each series, its seasons and the manga chapter to continue from (with sources).
- `meta.json`: AniList scores, popularity, genres and episode counts.
- `details/<id>.json`: arcs, key events and filler ranges per series (with sources).
- `page.src.html`: the page (styles + script). The same file also builds the claude.ai version via `build.py`.
- `build_static.py`: writes one static page per route into `docs/`, plus `sitemap.xml` and `robots.txt`.
- `web/prerender.js`: fills each page with its rendered HTML so search engines can read it.

Rebuild after editing data:

```
python3 build_static.py https://thrunycn.github.io/animeter/
node web/prerender.js        # needs playwright
```

## Voting

Ratings and drop reports are stored in Supabase (`web/supabase.sql`). Visitors sign in with an emailed link; row-level security lets each account change only its own rows. `web/config.json` holds the project URL and the public anon key.
