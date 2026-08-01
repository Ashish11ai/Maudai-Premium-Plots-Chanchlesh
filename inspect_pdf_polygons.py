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

# Step 1: Extract all text label positions and bounding boxes
text_page = page.get_text('dict')
labels = {}
for b in text_page['blocks']:
    if 'lines' in b:
        for l in b['lines']:
            for s in l['spans']:
                txt = s['text'].strip()
                if txt.isdigit():
                    num = int(txt)
                    if 1 <= num <= 96:
                        bbox = s['bbox']
                        cx = (bbox[0] + bbox[2]) / 2
                        cy = (bbox[1] + bbox[3]) / 2
                        if cx > 160 and cy > 100:
                            if num not in labels or s['size'] > labels[num]['size']:
                                labels[num] = {'num': num, 'cx': cx, 'cy': cy, 'bbox': bbox, 'size': s['size']}

# Step 2: Extract all vector drawings (lines, rects, quads, paths)
drawings = page.get_drawings()

# Collect line segments
lines = []
for d in drawings:
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            lines.append((p1.x, p1.y, p2.x, p2.y))
        elif item[0] == 're':
            r = item[1]
            lines.append((r.x0, r.y0, r.x1, r.y0))
            lines.append((r.x1, r.y0, r.x1, r.y1))
            lines.append((r.x1, r.y1, r.x0, r.y1))
            lines.append((r.x0, r.y1, r.x0, r.y0))

print(f"Extracted {len(labels)} labels and {len(lines)} vector lines from PDF")

# For each plot, find surrounding lines (top, bottom, left, right relative to label center)
plot_polygons_exact = {}

for num in range(1, 97):
    lbl = labels.get(num)
    if not lbl:
        continue
    lcx, lcy = lbl['cx'], lbl['cy']

    # Search for nearby horizontal-ish and vertical-ish lines
    # Find closest lines in 4 cardinal directions (or rotated principal axes)
    lefts = []
    rights = []
    tops = []
    bottoms = []

    for l in lines:
        x1, y1, x2, y2 = l
        mx = (x1 + x2) / 2
        my = (y1 + y2) / 2
        dist = math.hypot(mx - lcx, my - lcy)
        if dist > 60:
            continue

        # Check line direction
        dx = x2 - x1
        dy = y2 - y1
        length = math.hypot(dx, dy)
        if length < 2:
            continue

        angle = math.degrees(math.atan2(dy, dx)) % 180

        # Classify line by position relative to label center
        if mx < lcx and abs(my - lcy) < 40:
            lefts.append((abs(lcx - mx), l))
        if mx > lcx and abs(my - lcy) < 40:
            rights.append((abs(mx - lcx), l))
        if my < lcy and abs(mx - lcx) < 40:
            tops.append((abs(lcy - my), l))
        if my > lcy and abs(mx - lcx) < 40:
            bottoms.append((abs(my - lcy), l))

    lefts.sort(key=lambda item: item[0])
    rights.sort(key=lambda item: item[0])
    tops.sort(key=lambda item: item[0])
    bottoms.sort(key=lambda item: item[0])

    # Determine bounding box from nearest surrounding lines
    l_x = lefts[0][1][0] if lefts else (lcx - 15)
    r_x = rights[0][1][0] if rights else (lcx + 15)
    t_y = tops[0][1][1] if tops else (lcy - 20)
    b_y = bottoms[0][1][1] if bottoms else (lcy + 20)

    min_x = min(l_x, r_x)
    max_x = max(l_x, r_x)
    min_y = min(t_y, b_y)
    max_y = max(t_y, b_y)

    # Convert 4 corners to 3D layout coordinates
    tl = pdf_to_3d(min_x, min_y)
    tr = pdf_to_3d(max_x, min_y)
    br = pdf_to_3d(max_x, max_y)
    bl = pdf_to_3d(min_x, max_y)

    plot_polygons_exact[str(num)] = [tl, tr, br, bl]

print(f"Sample Plot 40 polygon: {plot_polygons_exact.get('40')}")
print(f"Sample Plot 21 polygon: {plot_polygons_exact.get('21')}")
