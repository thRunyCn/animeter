#!/usr/bin/env python3
"""Copy covers/*.jpg into web/covers/ at 460px wide (what the site serves). Skips ones already done."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SRC, DST = os.path.join(HERE, "covers"), os.path.join(HERE, "web", "covers")
os.makedirs(DST, exist_ok=True)
done = 0
for f in sorted(os.listdir(SRC)):
    if not f.endswith(".jpg") or os.path.exists(os.path.join(DST, f)): continue
    try:
        im = Image.open(os.path.join(SRC, f)).convert("RGB")
        if im.width > 460: im = im.resize((460, round(im.height * 460 / im.width)), Image.LANCZOS)
        im.save(os.path.join(DST, f), "JPEG", quality=82, optimize=True, progressive=True)
        done += 1
    except Exception as e: print("skip", f, e)
print(f"shrank {done} covers")
