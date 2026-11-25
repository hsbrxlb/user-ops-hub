#!/usr/bin/env python3
"""Shrink public images above the size limit (same name, same format) so they never block publishing.
Originals are moved to build-artifacts/originals/ (git-ignored), never kept in assets/.
Usage: compress-public-images.py [--check]   (--check only lists oversize files, exits 1 if any)"""
import os, sys, shutil, subprocess
from pathlib import Path
from PIL import Image

root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
LIMIT = 1024 * 1024
SKIP = {'assets/hub-light.webp'}  # hash-pinned background
EXT = {'.webp', '.jpg', '.jpeg', '.png'}
check = '--check' in sys.argv
changed, over = [], []

def save(img, path, q):
    ext = path.suffix.lower()
    if ext == '.webp':
        img.save(path, 'WEBP', quality=q, method=6)
    elif ext in ('.jpg', '.jpeg'):
        img.convert('RGB').save(path, 'JPEG', quality=q, optimize=True)
    else:  # png: quantize to shrink, keep format
        img.convert('RGBA').quantize(256 if q > 60 else 128, method=Image.Quantize.FASTOCTREE).save(path, 'PNG', optimize=True)

for f in sorted((root / 'assets').rglob('*')):
    rel = f.relative_to(root).as_posix()
    if not f.is_file() or f.suffix.lower() not in EXT or rel in SKIP or rel.startswith('assets/generated-source/'):
        continue
    if f.stat().st_size <= LIMIT:
        continue
    over.append(rel)
    if check:
        continue
    backup = root / 'build-artifacts' / 'originals' / rel
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(f, backup)
    img = Image.open(backup); img.load()
    tmp = f.with_name(f.stem + '.tmp' + f.suffix)
    ok = False
    for scale in (1.0, 0.85, 0.7, 0.55):
        work = img if scale == 1.0 else img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
        for q in (88, 80, 72, 64, 55, 45):
            save(work, tmp, q)
            if tmp.stat().st_size <= LIMIT * 0.95:
                ok = True; break
        if ok: break
    if ok:
        os.replace(tmp, f); changed.append(rel)
        print(f'compressed {rel}: {backup.stat().st_size//1024}KB -> {f.stat().st_size//1024}KB')
    else:
        tmp.unlink(missing_ok=True); print(f'could not shrink {rel}', file=sys.stderr)

if check and over:
    print('Oversize public images (run scripts/compress-public-images.py before committing):', *over, sep='\n  ')
    sys.exit(1)
if changed:
    subprocess.run(['git', '-C', str(root), 'add', '--', *changed], check=False)
