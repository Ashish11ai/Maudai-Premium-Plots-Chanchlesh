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

# Step 1: Extract all plot label centers
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

print(f"Extracted {len(labels)} plot labels from PDF")

# Step 2: Extract ALL vector line segments from page drawings
drawings = page.get_drawings()
all_lines = []
for d in drawings:
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            length = math.hypot(p2.x - p1.x, p2.y - p1.y)
            if length > 3:  # Filter noise dots
                all_lines.append((p1.x, p1.y, p2.x, p2.y))

print(f"Extracted {len(all_lines)} vector line segments")

def line_intersection(line1, line2):
    x1, y1, x2, y2 = line1
    x3, y3, x4, y4 = line2
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-6:
        return None
    px = ((x1*y2 - y1*x2)*(x3 - x4) - (x1 - x2)*(x3*y4 - y3*x4)) / denom
    py = ((x1*y2 - y1*x2)*(y3 - y4) - (y1 - y2)*(x3*y4 - y3*x4)) / denom
    return (px, py)

def find_plot_corners(lcx, lcy):
    # Find lines surrounding label (lcx, lcy)
    # Group lines by their angle relative to CAD axes (-22.5 deg, +67.5 deg, 0 deg, 90 deg)
    nearby_lines = []
    for line in all_lines:
        x1, y1, x2, y2 = line
        mx = (x1 + x2) / 2
        my = (y1 + y2) / 2
        dist = math.hypot(mx - lcx, my - lcy)
        if dist < 45:
            dx = x2 - x1
            dy = y2 - y1
            angle = math.degrees(math.atan2(dy, dx)) % 180
            nearby_lines.append((dist, angle, line))

    nearby_lines.sort(key=lambda item: item[0])
    
    # Classify into 2 principal parallel line sets (side 1 lines vs side 2 lines)
    set1 = []
    set2 = []
    if not nearby_lines:
        return None

    main_angle = nearby_lines[0][1]
    for dist, angle, line in nearby_lines:
        diff = min(abs(angle - main_angle), 180 - abs(angle - main_angle))
        if diff < 30:
            set1.append(line)
        elif abs(diff - 90) < 30:
            set2.append(line)

    if len(set1) < 2 or len(set2) < 2:
        return None

    # Pick 2 lines on opposite sides for set1, and 2 lines for set2
    # Sort set1 lines by distance to center
    l1a = set1[0]
    l1b = set1[1]
    l2a = set2[0]
    l2b = set2[1]

    # Compute 4 corner intersections
    c1 = line_intersection(l1a, l2a)
    c2 = line_intersection(l1a, l2b)
    c3 = line_intersection(l1b, l2b)
    c4 = line_intersection(l1b, l2a)

    if not (c1 and c2 and c3 and c4):
        return None

    # Check that corner points form a reasonable polygon around (lcx, lcy)
    poly = [pdf_to_3d(*c1), pdf_to_3d(*c2), pdf_to_3d(*c3), pdf_to_3d(*c4)]
    return poly

plot_polygons_exact = {}
for num in range(1, 97):
    lbl = labels.get(num)
    if lbl:
        poly = find_plot_corners(lbl['cx'], lbl['cy'])
        if poly:
            plot_polygons_exact[str(num)] = poly

print(f"Successfully extracted {len(plot_polygons_exact)} exact vector polygons from PDF lines!")
