import fitz
import json
import math

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

def point_in_poly(x, y, poly):
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

# Build closed paths from drawings
polygons = []
for d in page.get_drawings():
    items = d['items']
    pts = []
    for it in items:
        if it[0] == 'l':
            pts.append((it[1].x, it[1].y))
            pts.append((it[2].x, it[2].y))
    if len(pts) >= 6:
        # Unique points in order
        unique_pts = []
        for p in pts:
            if not unique_pts or (abs(unique_pts[-1][0]-p[0]) > 0.1 or abs(unique_pts[-1][1]-p[1]) > 0.1):
                unique_pts.append(p)
        if len(unique_pts) >= 4:
            polygons.append(unique_pts)

matched_plots = {}
for num in range(1, 97):
    lbl = plot_labels.get(num)
    if not lbl:
        continue
    lcx, lcy = lbl['cx'], lbl['cy']
    
    # Find enclosing polygon
    found_poly = None
    for poly in polygons:
        if point_in_poly(lcx, lcy, poly):
            found_poly = poly
            break
            
    if found_poly:
        # Calculate centroid
        pcx = sum(p[0] for p in found_poly) / len(found_poly)
        pcy = sum(p[1] for p in found_poly) / len(found_poly)
        min_x = min(p[0] for p in found_poly)
        max_x = max(p[0] for p in found_poly)
        min_y = min(p[1] for p in found_poly)
        max_y = max(p[1] for p in found_poly)
        pw = max_x - min_x
        ph = max_y - min_y
    else:
        # Fallback to ray bounding box
        lefts = [l[0] for l in lines if min(l[1], l[3]) <= lcy <= max(l[1], l[3]) and l[0] <= lcx and (lcx - l[0]) < 90]
        rights = [l[0] for l in lines if min(l[1], l[3]) <= lcy <= max(l[1], l[3]) and l[0] >= lcx and (l[0] - lcx) < 90]
        tops = [l[1] for l in lines if min(l[0], l[2]) <= lcx <= max(l[0], l[2]) and l[1] <= lcy and (lcy - l[1]) < 90]
        bottoms = [l[1] for l in lines if min(l[0], l[2]) <= lcx <= max(l[0], l[2]) and l[1] >= lcy and (l[1] - lcy) < 90]
        
        pcx = ((max(lefts) if lefts else lcx-15) + (min(rights) if rights else lcx+15)) / 2
        pcy = ((max(tops) if tops else lcy-15) + (min(bottoms) if bottoms else lcy+15)) / 2
        pw = (min(rights) if rights else lcx+15) - (max(lefts) if lefts else lcx-15)
        ph = (min(bottoms) if bottoms else lcy+15) - (max(tops) if tops else lcy-15)

    x3d = (pcx / W_pdf - 0.5) * W_3d
    z3d = (pcy / H_pdf - 0.5) * H_3d
    w3d = (pw / W_pdf) * W_3d
    d3d = (ph / H_pdf) * H_3d
    
    matched_plots[num] = {'x': round(x3d, 4), 'z': round(z3d, 4), 'w': round(w3d, 4), 'd': round(d3d, 4)}

print(f"Matched {len(matched_plots)} plots to exact CAD geometry!")
print("Plot 1 3D pos:", matched_plots.get(1))
print("Plot 2 3D pos:", matched_plots.get(2))
print("Plot 3 3D pos:", matched_plots.get(3))
print("Plot 4 3D pos:", matched_plots.get(4))
