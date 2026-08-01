import fitz
import json

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (1191.0 / 1684.0) # 70.72447
H_3d = 100.0

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

lines = []
for d in page.get_drawings():
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            lines.append((p1.x, p1.y, p2.x, p2.y))

plot_3d_exact = {}

for num in range(1, 97):
    if num not in plot_labels:
        continue
    lbl = plot_labels[num]
    lcx, lcy = lbl['cx'], lbl['cy']
    
    # Filter horizontal and vertical CAD lines enclosing lcx, lcy
    lefts = [l[0] for l in lines if min(l[1], l[3]) <= lcy <= max(l[1], l[3]) and l[0] <= lcx and (lcx - l[0]) < 80]
    rights = [l[0] for l in lines if min(l[1], l[3]) <= lcy <= max(l[1], l[3]) and l[0] >= lcx and (l[0] - lcx) < 80]
    tops = [l[1] for l in lines if min(l[0], l[2]) <= lcx <= max(l[0], l[2]) and l[1] <= lcy and (lcy - l[1]) < 80]
    bottoms = [l[1] for l in lines if min(l[0], l[2]) <= lcx <= max(l[0], l[2]) and l[1] >= lcy and (l[1] - lcy) < 80]
    
    if not lefts:
        lefts = [l[0] for l in lines if abs((l[1]+l[3])/2 - lcy) < 20 and l[0] <= lcx and (lcx - l[0]) < 80]
    if not rights:
        rights = [l[0] for l in lines if abs((l[1]+l[3])/2 - lcy) < 20 and l[0] >= lcx and (l[0] - lcx) < 80]
    if not tops:
        tops = [l[1] for l in lines if abs((l[0]+l[2])/2 - lcx) < 20 and l[1] <= lcy and (lcy - l[1]) < 80]
    if not bottoms:
        bottoms = [l[1] for l in lines if abs((l[0]+l[2])/2 - lcx) < 20 and l[1] >= lcy and (l[1] - lcy) < 80]
    
    min_x = max(lefts) if lefts else (lcx - 15)
    max_x = min(rights) if rights else (lcx + 15)
    min_y = max(tops) if tops else (lcy - 15)
    max_y = min(bottoms) if bottoms else (lcy + 15)
    
    # Exact center in PDF points
    pcx = (min_x + max_x) / 2
    pcy = (min_y + max_y) / 2
    pw = max_x - min_x
    ph = max_y - min_y
    
    # Convert PDF points directly to local 3D coordinates
    x3d = (pcx / W_pdf - 0.5) * W_3d
    z3d = (pcy / H_pdf - 0.5) * H_3d
    w3d = (pw / W_pdf) * W_3d
    d3d = (ph / H_pdf) * H_3d
    
    plot_3d_exact[str(num)] = {
        'x': round(x3d, 4),
        'z': round(z3d, 4),
        'width': round(w3d, 4),
        'depth': round(d3d, 4),
        'rotation': 0.0
    }

# Update plot_positions.json and site_infrastructure.json
with open('data/site_infrastructure.json') as f:
    infra = json.load(f)

infra['plot_3d'] = plot_3d_exact

with open('data/site_infrastructure.json', 'w') as f:
    json.dump(infra, f, indent=2)

print("Saved exact layout plot boxes to data/site_infrastructure.json!")
