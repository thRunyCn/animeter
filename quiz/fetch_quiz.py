"""Fetch characters, studios and banners from AniList for the quiz pool."""
import json, os, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
top = json.load(open(os.path.join(ROOT, 'top.json')))
pool = [t for t in top if t.get('anilist') and t.get('format') in ('TV', 'MOVIE', 'ONA', 'OVA', 'TV_SHORT')
        and os.path.exists(os.path.join(ROOT, 'web/covers', t['id'] + '-anime.jpg'))]
pool.sort(key=lambda t: -t['popularity'])
pool = pool[:240]
Q = '''query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id bannerImage
 title{english romaji} studios(isMain:true){nodes{name}}
 characters(sort:[ROLE,FAVOURITES_DESC],perPage:4){edges{role node{id name{full} image{large}}}}}}}'''
out = {}
for i in range(0, len(pool), 50):
    ids = [t['anilist'] for t in pool[i:i+50]]
    req = urllib.request.Request('https://graphql.anilist.co', json.dumps({'query': Q, 'variables': {'ids': ids}}).encode(),
                                 {'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'curl/8.5.0'})
    for m in json.load(urllib.request.urlopen(req, timeout=60))['data']['Page']['media']:
        out[m['id']] = m
    time.sleep(2)
res = []
for t in pool:
    m = out.get(t['anilist'])
    if not m: continue
    res.append({'id': t['id'], 'title': t['title'], 'jp': t['jp'], 'year': t['year'], 'score': t['score'],
                'genres': t['genres'], 'pop': t['popularity'],
                'studio': (m['studios']['nodes'] or [{}])[0].get('name'),
                'banner': m['bannerImage'],
                'chars': [{'id': e['node']['id'], 'name': e['node']['name']['full'], 'img': e['node']['image']['large']}
                          for e in m['characters']['edges'] if 'default' not in (e['node']['image']['large'] or '')][:3]})
json.dump(res, open(os.path.join(ROOT, 'quiz/raw.json'), 'w'), ensure_ascii=False, indent=0)
print(len(res), sum(len(r['chars']) for r in res), sum(1 for r in res if r['banner']))
