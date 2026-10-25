"""Download each show's AniList cover (extraLarge) into docs/quiz/img/cv/ and flag low-resolution ones in data.json."""
import io, json, os, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs/quiz/img/cv')
os.makedirs(OUT, exist_ok=True)
top = {t['id']: t for t in json.load(open(os.path.join(ROOT, 'top.json')))}
data = json.load(open(os.path.join(ROOT, 'quiz/data.json')))
H = {'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'curl/8.5.0'}
Q = 'query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id coverImage{extraLarge}}}}'
ids = [top[d['id']]['anilist'] for d in data]
url = {}
for i in range(0, len(ids), 50):
    req = urllib.request.Request('https://graphql.anilist.co', json.dumps({'query': Q, 'variables': {'ids': ids[i:i + 50]}}).encode(), H)
    for m in json.load(urllib.request.urlopen(req, timeout=60))['data']['Page']['media']:
        url[m['id']] = m['coverImage']['extraLarge']
    time.sleep(1)

def get(d):
    req = urllib.request.Request(url[top[d['id']]['anilist']], headers={'User-Agent': 'curl/8.5.0'})
    im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read())).convert('RGB')
    if im.width > 460: im = im.resize((460, round(im.height * 460 / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, d['id'] + '.jpg'), quality=80, optimize=True, progressive=True)
    if im.width < 400: d['lo'] = 1
    else: d.pop('lo', None)

with ThreadPoolExecutor(8) as ex: list(ex.map(get, data))
json.dump(data, open(os.path.join(ROOT, 'quiz/data.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
