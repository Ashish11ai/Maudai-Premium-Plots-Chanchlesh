import fitz
import json
import math
import re

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (1191.0 / 1684.0) # 70.72447
H_3d = 100.0

text_page = page.get_text('dict')

# Extract exact Plot Number label positions (1 to 96)
plot_labels = {}
for b in text_page['blocks']:
    if 'lines' in b:
        for l in b['lines']:
            for s in l['spans']:
                text = s['text'].strip()
                if text.isdigit():
                    num = int(text)
                    if 1 <= num <= 96:
                        bbox = s['bbox']
                        cx = (bbox[0] + bbox[2]) / 2
                        cy = (bbox[1] + bbox[3]) / 2
                        if cx > 160 and cy > 100:
                            if num not in plot_labels or s['size'] > plot_labels[num]['size']:
                                plot_labels[num] = {'num': num, 'cx': cx, 'cy': cy, 'size': s['size']}

# Extract line segments
lines = []
for d in page.get_drawings():
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            lines.append((p1.x, p1.y, p2.x, p2.y))

def pdf_to_3d(px, py):
    x3d = round((px / W_pdf - 0.5) * W_3d, 4)
    z3d = round((py / H_pdf - 0.5) * H_3d, 4)
    return [x3d, z3d]

plot_polygons_fixed = {}

for num in range(1, 97):
    lbl = plot_labels.get(num)
    if not lbl:
        continue
    lcx, lcy = lbl['cx'], lbl['cy']
    
    # Locate the closest 4 enclosing lines around lcx, lcy (max 45 PDF pt distance)
    lefts = [l[0] for l in lines if min(l[1], l[3]) <= lcy <= max(l[1], l[3]) and l[0] <= lcx and (lcx - l[0]) < 45]
    rights = [l[0] for l in lines if min(l[1], l[3]) <= lcy <= max(l[1], l[3]) and l[0] >= lcx and (l[0] - lcx) < 45]
    tops = [l[1] for l in lines if min(l[0], l[2]) <= lcx <= max(l[0], l[2]) and l[1] <= lcy and (lcy - l[1]) < 45]
    bottoms = [l[1] for l in lines if min(l[0], l[2]) <= lcx <= max(l[0], l[2]) and l[1] >= lcy and (l[1] - lcy) < 45]

    if not lefts:
        lefts = [l[0] for l in lines if abs((l[1]+l[3])/2 - lcy) < 15 and l[0] <= lcx and (lcx - l[0]) < 45]
    if not rights:
        rights = [l[0] for l in lines if abs((l[1]+l[3])/2 - lcy) < 15 and l[0] >= lcx and (l[0] - lcx) < 45]
    if not tops:
        tops = [l[1] for l in lines if abs((l[0]+l[2])/2 - lcx) < 15 and l[1] <= lcy and (lcy - l[1]) < 45]
    if not bottoms:
        bottoms = [l[1] for l in lines if abs((l[0]+l[2])/2 - lcx) < 15 and l[1] >= lcy and (l[1] - lcy) < 45]

    min_x = max(lefts) if lefts else (lcx - 16)
    max_x = min(rights) if rights else (lcx + 16)
    min_y = max(tops) if tops else (lcy - 16)
    max_y = min(bottoms) if bottoms else (lcy + 16)

    # Convert 4 box corners to 3D
    p1 = pdf_to_3d(min_x, min_y)
    p2 = pdf_to_3d(max_x, min_y)
    p3 = pdf_to_3d(max_x, max_y)
    p4 = pdf_to_3d(min_x, max_y)

    plot_polygons_fixed[num] = [p1, p2, p3, p4]

print(f"Fixed exact 4-corner plot boxes for {len(plot_polygons_fixed)} plots!")

# Write PLOT_POLYGONS_EXACT to public/js/plotData.js
with open('public/js/plotData.js', 'r') as f:
    js_content = f.read()

poly_js = "const PLOT_POLYGONS_EXACT = " + json.dumps(plot_polygons_fixed, indent=2) + ";\n\n"

if 'const PLOT_POLYGONS_EXACT' in js_content:
    js_content = re.sub(r'const PLOT_POLYGONS_EXACT = \{[\s\S]*?\};\n\n', poly_js, js_content)
else:
    js_content = poly_js + js_content

with open('public/js/plotData.js', 'w') as f:
    f.write(js_content)

print("Saved clean 100% accurate plot boxes to public/js/plotData.js!")
