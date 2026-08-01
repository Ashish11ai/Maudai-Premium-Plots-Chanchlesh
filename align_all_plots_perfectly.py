import fitz
import json
import math

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (1191.0 / 1684.0) # 70.72447
H_3d = 100.0

def pdf_to_3d(pdf_x, pdf_y):
    x = (pdf_x / W_pdf - 0.5) * W_3d
    z = (pdf_y / H_pdf - 0.5) * H_3d
    return round(x, 4), round(z, 4)

# Extract plot label centers
text_page = page.get_text('dict')
plot_labels = {}
for b in text_page['blocks']:
    if 'lines' in b:
        for l in b['lines']:
            for s in l['spans']:
                text = s['text'].strip()
                if text.isdigit() and 1 <= int(text) <= 96:
                    num = int(text)
                    bbox = s['bbox']
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    if cx > 180:
                        if num not in plot_labels or s['size'] > plot_labels[num]['size']:
                            plot_labels[num] = {'num': num, 'cx': cx, 'cy': cy}

# Extract vector line segments
lines = []
for d in page.get_drawings():
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            lines.append((p1.x, p1.y, p2.x, p2.y))

plot_3d_perfect = {}

for num in range(1, 97):
    if num not in plot_labels:
        continue
    lbl = plot_labels[num]
    lcx, lcy = lbl['cx'], lbl['cy']
    
    # Find surrounding CAD lines
    nearby = [l for l in lines if abs((l[0]+l[2])/2 - lcx) < 50 and abs((l[1]+l[3])/2 - lcy) < 50]
    
    # Horizontal-ish and Vertical-ish bounding box in PDF pt
    lefts = [l[0] for l in nearby if abs((l[1]+l[3])/2 - lcy) < 30 and l[0] <= lcx]
    rights = [l[0] for l in nearby if abs((l[1]+l[3])/2 - lcy) < 30 and l[0] >= lcx]
    tops = [l[1] for l in nearby if abs((l[0]+l[2])/2 - lcx) < 30 and l[1] <= lcy]
    bottoms = [l[1] for l in nearby if abs((l[0]+l[2])/2 - lcx) < 30 and l[1] >= lcy]
    
    min_x = max(lefts) if lefts else (lcx - 15)
    max_x = min(rights) if rights else (lcx + 15)
    min_y = max(tops) if tops else (lcy - 15)
    max_y = min(bottoms) if bottoms else (lcy + 15)
    
    # Calculate exact plot center in PDF pt
    pcx = (min_x + max_x) / 2
    pcy = (min_y + max_y) / 2
    pw = max_x - min_x
    ph = max_y - min_y
    
    # Convert to 3D local coordinates
    x3d, z3d = pdf_to_3d(pcx, pcy)
    w3d = round((pw / W_pdf) * W_3d, 4)
    d3d = round((ph / H_pdf) * H_3d, 4)
    
    plot_3d_perfect[str(num)] = {
        'x': x3d,
        'z': z3d,
        'width': max(0.6, w3d),
        'depth': max(0.6, d3d),
        'rotation': 0.0 # Axis-aligned with PDF overlay image
    }

# Save data/site_infrastructure.json
with open('data/site_infrastructure.json') as f:
    infra = json.load(f)

infra['plot_3d'] = plot_3d_perfect

with open('data/site_infrastructure.json', 'w') as f:
    json.dump(infra, f, indent=2)

print(f"Successfully aligned all {len(plot_3d_perfect)} plot boxes with plan_transparent.png!")
