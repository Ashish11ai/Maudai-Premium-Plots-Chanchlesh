import fitz
import json
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

# Extract all drawings and closed polygon loops
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
        if len(unique_pts) >= 3:
            if abs(unique_pts[0][0]-unique_pts[-1][0]) < 1.0 and abs(unique_pts[0][1]-unique_pts[-1][1]) < 1.0:
                unique_pts.pop()
            if len(unique_pts) >= 3:
                all_polygons.append(unique_pts)

plot_polygons_3d = {}

for num in range(1, 97):
    lbl = plot_labels.get(num)
    if not lbl:
        continue
    lcx, lcy = lbl['cx'], lbl['cy']
    
    matched_poly = None
    for poly in all_polygons:
        if point_in_poly(lcx, lcy, poly):
            min_x = min(p[0] for p in poly)
            max_x = max(p[0] for p in poly)
            min_y = min(p[1] for p in poly)
            max_y = max(p[1] for p in poly)
            if (max_x - min_x) < 180 and (max_y - min_y) < 180:
                matched_poly = poly
                break

    if not matched_poly:
        matched_poly = [
            (lcx - 15, lcy - 20),
            (lcx + 15, lcy - 20),
            (lcx + 15, lcy + 20),
            (lcx - 15, lcy + 20)
        ]

    poly_3d = []
    for px, py in matched_poly:
        x3d = round((px / W_pdf - 0.5) * W_3d, 4)
        z3d = round((py / H_pdf - 0.5) * H_3d, 4)
        poly_3d.append([x3d, z3d])
        
    plot_polygons_3d[num] = poly_3d

# Re-align CAD roads matching red dashed layout lines perfectly
roads_aligned = [
    {
        "id": "ring_road",
        "name": "Chhindwara Outer Ring Road (45 M)",
        "width_ft": 147.6,
        "x": -23.5,
        "z": -31.5,
        "w": 32.0,
        "d": 4.5,
        "h": 0.08,
        "rot": -0.52,
        "type": "ring"
    },
    {
        "id": "main_entrance",
        "name": "Maudai Main Road (30 FT)",
        "width_ft": 30,
        "x": -12.5,
        "z": -31.2,
        "w": 10.5,
        "d": 2.2,
        "h": 0.05,
        "rot": 0.0,
        "type": "main"
    },
    {
        "id": "central_avenue",
        "name": "Central Avenue (30 FT)",
        "width_ft": 30,
        "x": -12.5,
        "z": -5.0,
        "w": 2.2,
        "d": 52.0,
        "h": 0.05,
        "rot": 0.0,
        "type": "avenue"
    },
    {
        "id": "sector_road_1",
        "name": "Sector Road 1 (20 FT)",
        "width_ft": 20,
        "x": -12.5,
        "z": -22.5,
        "w": 7.0,
        "d": 1.5,
        "h": 0.04,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "sector_road_2",
        "name": "Sector Road 2 (20 FT)",
        "width_ft": 20,
        "x": -12.5,
        "z": -14.8,
        "w": 7.0,
        "d": 1.5,
        "h": 0.04,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "sector_road_3",
        "name": "Sector Road 3 (20 FT)",
        "width_ft": 20,
        "x": -12.5,
        "z": -2.2,
        "w": 7.0,
        "d": 1.5,
        "h": 0.04,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "sector_road_4",
        "name": "Sector Road 4 (20 FT)",
        "width_ft": 20,
        "x": -12.5,
        "z": 6.8,
        "w": 7.0,
        "d": 1.5,
        "h": 0.04,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "sector_road_5",
        "name": "Sector Road 5 (20 FT)",
        "width_ft": 20,
        "x": -12.5,
        "z": 15.8,
        "w": 7.0,
        "d": 1.5,
        "h": 0.04,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "east_south_road",
        "name": "East Sector 30 FT Road",
        "width_ft": 30,
        "x": 3.2,
        "z": 22.2,
        "w": 22.0,
        "d": 2.2,
        "h": 0.05,
        "rot": 0.0,
        "type": "main"
    },
    {
        "id": "east_divider_road",
        "name": "East Sector 20 FT Road",
        "width_ft": 20,
        "x": -0.2,
        "z": 19.5,
        "w": 1.5,
        "d": 4.0,
        "h": 0.04,
        "rot": 0.0,
        "type": "access"
    }
]

# Update public/js/plotData.js
with open('public/js/plotData.js', 'r') as f:
    js_content = f.read()

poly_js = "const PLOT_POLYGONS_EXACT = " + json.dumps(plot_polygons_3d, indent=2) + ";\n\n"
roads_js = "const SITE_ROADS_EXACT = " + json.dumps(roads_aligned, indent=2) + ";\n"

if 'const PLOT_POLYGONS_EXACT' in js_content:
    js_content = re.sub(r'const PLOT_POLYGONS_EXACT = \{[\s\S]*?\};\n\n', poly_js, js_content)
else:
    js_content = poly_js + js_content

if 'const SITE_ROADS_EXACT' in js_content:
    js_content = re.sub(r'const SITE_ROADS_EXACT = \[[\s\S]*?\];\n', roads_js, js_content)
else:
    js_content = js_content + "\n" + roads_js

with open('public/js/plotData.js', 'w') as f:
    f.write(js_content)

print("Updated public/js/plotData.js with aligned roads and plot polygons!")
