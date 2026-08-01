import fitz
import json
import math

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (W_pdf / H_pdf)  # ~70.72447
H_3d = 100.0

def pdf_to_3d(px, py):
    x3d = round((px / W_pdf - 0.5) * W_3d, 4)
    z3d = round((py / H_pdf - 0.5) * H_3d, 4)
    return [x3d, z3d]

# Step 1: Extract all plot label numbers and their exact center coordinates
text_page = page.get_text('dict')
labels = {}
for b in text_page['blocks']:
    if 'lines' not in b:
        continue
    for l in b['lines']:
        for s in l['spans']:
            txt = s['text'].strip()
            if not txt.isdigit():
                continue
            num = int(txt)
            if 1 <= num <= 96:
                bbox = s['bbox']
                cx = (bbox[0] + bbox[2]) / 2
                cy = (bbox[1] + bbox[3]) / 2
                if cx > 160 and cy > 100:
                    if num not in labels or s['size'] > labels[num]['size']:
                        labels[num] = {'num': num, 'cx': cx, 'cy': cy, 'bbox': bbox, 'size': s['size']}

print(f"Found {len(labels)} plot number text labels in PDF")

# Step 2: Parse all drawing path entities in the PDF
drawings = page.get_drawings()
path_entities = []

for d in drawings:
    pts = []
    for item in d['items']:
        if item[0] == 'm':  # move to
            p = item[1]
            pts.append((p.x, p.y))
        elif item[0] == 'l':  # line to
            p1, p2 = item[1], item[2]
            if not pts or math.hypot(pts[-1][0] - p1.x, pts[-1][1] - p1.y) > 0.1:
                pts.append((p1.x, p1.y))
            pts.append((p2.x, p2.y))
        elif item[0] == 're':  # rectangle
            r = item[1]
            pts = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]

    # Deduplicate consecutive points
    clean_pts = []
    for p in pts:
        if not clean_pts or math.hypot(clean_pts[-1][0] - p[0], clean_pts[-1][1] - p[1]) > 0.2:
            clean_pts.append(p)

    if len(clean_pts) >= 3:
        xs = [p[0] for p in clean_pts]
        ys = [p[1] for p in clean_pts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        w, h = max_x - min_x, max_y - min_y
        area = w * h

        # Filter out whole-page border frames or tiny decorative ticks
        if 8 < w < 250 and 8 < h < 250 and 50 < area < 40000:
            cx = (min_x + max_x) / 2
            cy = (min_y + max_y) / 2
            path_entities.append({
                'pts': clean_pts,
                'cx': cx, 'cy': cy,
                'bbox': (min_x, min_y, max_x, max_y),
                'w': w, 'h': h
            })

print(f"Found {len(path_entities)} candidate CAD polygon path entities in PDF")

# Step 3: Match each plot number label to its exact surrounding CAD path entity
plot_polygons_exact = {}

for num, lbl in labels.items():
    lcx, lcy = lbl['cx'], lbl['cy']

    # Find candidate path entity enclosing or closest to (lcx, lcy)
    best_entity = None
    min_dist = 999.0

    for entity in path_entities:
        bx0, by0, bx1, by1 = entity['bbox']
        # Check if label center is inside the path entity bbox
        if (bx0 - 5) <= lcx <= (bx1 + 5) and (by0 - 5) <= lcy <= (by1 + 5):
            dist = math.hypot(entity['cx'] - lcx, entity['cy'] - lcy)
            if dist < min_dist:
                min_dist = dist
                best_entity = entity

    if best_entity:
        poly_3d = [pdf_to_3d(p[0], p[1]) for p in best_entity['pts']]
        plot_polygons_exact[str(num)] = poly_3d

print(f"Successfully matched {len(plot_polygons_exact)} plots to their EXACT PDF CAD polygon entities!")

# Print sample plot shapes
for pid in ['1', '2', '3', '4', '7', '40', '81', '96']:
    if pid in plot_polygons_exact:
        print(f"Plot {pid} exact entity polygon ({len(plot_polygons_exact[pid])} vertices): {plot_polygons_exact[pid][:4]}")
