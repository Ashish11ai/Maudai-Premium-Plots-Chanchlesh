import fitz
import json
import math
import re

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

text_page = page.get_text('dict')

dim_texts = []

for b in text_page['blocks']:
    if 'lines' not in b:
        continue
    for l in b['lines']:
        for s in l['spans']:
            txt = s['text'].strip()
            # Match dimension strings like 30'-1", 111'-8", 50'-0", 60'-0", 141'-1", 100'-2", etc.
            if re.search(r"\d+['\’-]\d+", txt) or 'FT' in txt.upper() or 'M' in txt:
                bbox = s['bbox']
                cx = (bbox[0] + bbox[2]) / 2
                cy = (bbox[1] + bbox[3]) / 2
                dim_texts.append({'text': txt, 'cx': cx, 'cy': cy, 'bbox': bbox})

print(f"Extracted {len(dim_texts)} text dimension annotations from PDF")
for d in dim_texts[:20]:
    print(f"Dim Text: {d['text']} at ({d['cx']:.1f}, {d['cy']:.1f})")
