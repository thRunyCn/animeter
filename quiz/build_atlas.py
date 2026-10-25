"""Download character portraits and banners, pack them into JPEG atlases, and write data.json.
Covers are separate files; see fetch_covers.py."""
import io, json, os, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageOps
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs/quiz/img')
CACHE = os.path.join(ROOT, 'quiz/.cache')
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
raw = json.load(open(os.path.join(ROOT, 'quiz/raw.json')))

def get(url):
    p = os.path.join(CACHE, url.rsplit('/', 1)[1])
    if not os.path.exists(p):
        req = urllib.request.Request(url, headers={'User-Agent': 'curl/8.5.0'})
        open(p, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
    return p

urls = [c['img'] for r in raw for c in r['chars']] + [r['banner'] for r in raw if r['banner']]
with ThreadPoolExecutor(8) as ex:
    list(ex.map(lambda u: (lambda: get(u))() if True else None, urls))

def pack(name, items, cell, cols, rows):
    """items: list of image paths; returns list of [atlas, index]."""
    per = cols * rows; refs = []
    for a in range(0, len(items), per):
        sheet = Image.new('RGB', (cell[0] * cols, cell[1] * rows), (20, 20, 20))
        for i, p in enumerate(items[a:a + per]):
            im = ImageOps.fit(Image.open(p).convert('RGB'), cell, Image.LANCZOS, centering=(0.5, 0.3))
            sheet.paste(im, ((i % cols) * cell[0], (i // cols) * cell[1]))
            refs.append([a // per, i])
        sheet.save(os.path.join(OUT, f'{name}{a // per}.jpg'), quality=78, optimize=True, progressive=True)
    return refs

chars = [c for r in raw for c in r['chars']]
crefs = pack('p', [get(c['img']) for c in chars], (180, 252), 10, 10)
for c, ref in zip(chars, crefs): c['at'] = ref
withb = [r for r in raw if r['banner']]
brefs = pack('b', [get(r['banner']) for r in withb], (640, 160), 2, 20)
for r, ref in zip(withb, brefs): r['bn'] = ref
data = []
for r in raw:
    d = {k: r[k] for k in ('id', 'title', 'jp', 'year', 'score', 'genres', 'studio', 'pop')}
    if r.get('bn'): d['bn'] = r['bn']
    d['ch'] = [{'n': c['name'], 'at': c['at']} for c in r['chars']]
    data.append(d)
json.dump(data, open(os.path.join(ROOT, 'quiz/data.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(data))
