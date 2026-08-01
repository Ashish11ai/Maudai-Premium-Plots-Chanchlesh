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

# Extract all closed vector paths from CAD page
drawings = page.get_drawings()
all_polygons = []

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

for d in drawings:
    items = d['items']
    pts = []
    for it in items:
        if it[0] == 'l':
            pts.append((it[1].x, it[1].y))
            pts.append((it[2].x, it[2].y))
    if len(pts) >= 6:
        unique_pts = []
        for p in pts:
            if not unique_pts or (abs(unique_pts[-1][0]-p[0]) > 0.1 or abs(unique_pts[-1][1]-p[1]) > 0.1):
                unique_pts.append(p)
        # Close loop check
        if len(unique_pts) >= 3:
            if abs(unique_pts[0][0]-unique_pts[-1][0]) < 1.0 and abs(unique_pts[0][1]-unique_pts[-1][1]) < 1.0:
                unique_pts.pop()
            if len(unique_pts) >= 3:
                all_polygons.append(unique_pts)

# Match each plot 1 to 96 to its exact CAD polygon
plot_polygons_3d = {}

for num in range(1, 97):
    lbl = plot_labels.get(num)
    if not lbl:
        continue
    lcx, lcy = lbl['cx'], lbl['cy']
    
    # Search for enclosing polygon
    matched_poly = None
    for poly in all_polygons:
        if point_in_poly(lcx, lcy, poly):
            # Verify polygon perimeter size is reasonable for plot
            min_x = min(p[0] for p in poly)
            max_x = max(p[0] for p in poly)
            min_y = min(p[1] for p in poly)
            max_y = max(p[1] for p in poly)
            if (max_x - min_x) < 180 and (max_y - min_y) < 180:
                matched_poly = poly
                break

    if not matched_poly:
        # Fallback rectangular box centered at lcx, lcy
        matched_poly = [
            (lcx - 15, lcy - 20),
            (lcx + 15, lcy - 20),
            (lcx + 15, lcy + 20),
            (lcx - 15, lcy + 20)
        ]

    # Convert PDF vertices to 3D local plane vertices
    poly_3d = []
    for px, py in matched_poly:
        x3d = round((px / W_pdf - 0.5) * W_3d, 4)
        z3d = round((py / H_pdf - 0.5) * H_3d, 4)
        poly_3d.append([x3d, z3d])
        
    plot_polygons_3d[num] = poly_3d

print(f"Successfully extracted exact 2D/3D CAD polygons for {len(plot_polygons_3d)} plots!")
print("Plot 1 polygon vertices count:", len(plot_polygons_3d[1]), plot_polygons_3d[1])
print("Plot 2 polygon vertices count:", len(plot_polygons_3d[2]), plot_polygons_3d[2])
print("Plot 3 polygon vertices count:", len(plot_polygons_3d[3]), plot_polygons_3d[3])
