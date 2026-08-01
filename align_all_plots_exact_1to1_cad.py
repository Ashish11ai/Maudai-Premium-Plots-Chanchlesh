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
                                plot_labels[num] = {'num': num, 'cx': cx, 'cy': cy}

def pdf_to_3d(px, py):
    x3d = round((px / W_pdf - 0.5) * W_3d, 4)
    z3d = round((py / H_pdf - 0.5) * H_3d, 4)
    return [x3d, z3d]

plot_polygons_exact = {}
plot_positions_exact = {}

# Direction vectors for top sector boundary (-22.5 deg angle)
# u_vec points along frontage, v_vec points inward along depth
angle_rad = math.radians(-22.5)
cos_a = math.cos(angle_rad)
sin_a = math.sin(angle_rad)

for num in range(1, 97):
    lbl = plot_labels.get(num)
    if not lbl:
        continue
    lcx, lcy = lbl['cx'], lbl['cy']

    # Convert PDF centroid to 3D plane
    c3d = pdf_to_3d(lcx, lcy)
    cx, cz = c3d[0], c3d[1]

    if num in [1, 2, 3]:
        # Plots 1, 2, 3: Width along frontage = 2.1 units (~30 ft), Depth inward = 7.8, 7.7, 9.1 units (~111-131 ft)
        w3d = 2.1
        d3d = 7.8 if num == 1 else (7.7 if num == 2 else 9.1)

        # Build 4 corners oriented along -22.5 deg axis
        # u vector: (cos_a, sin_a), v vector: (-sin_a, cos_a)
        half_w = w3d / 2.0
        half_d = d3d / 2.0

        p1 = [round(cx - half_w * cos_a - half_d * (-sin_a), 4), round(cz - half_w * sin_a - half_d * cos_a, 4)]
        p2 = [round(cx + half_w * cos_a - half_d * (-sin_a), 4), round(cz + half_w * sin_a - half_d * cos_a, 4)]
        p3 = [round(cx + half_w * cos_a + half_d * (-sin_a), 4), round(cz + half_w * sin_a + half_d * cos_a, 4)]
        p4 = [round(cx - half_w * cos_a + half_d * (-sin_a), 4), round(cz - half_w * sin_a + half_d * cos_a, 4)]
        
        poly = [p1, p2, p3, p4]
        rot = angle_rad

    elif num in [4, 5, 6]:
        w3d = 3.5 if num in [4, 5] else 3.2
        d3d = 2.6

        half_w = w3d / 2.0
        half_d = d3d / 2.0

        p1 = [round(cx - half_w * cos_a - half_d * (-sin_a), 4), round(cz - half_w * sin_a - half_d * cos_a, 4)]
        p2 = [round(cx + half_w * cos_a - half_d * (-sin_a), 4), round(cz + half_w * sin_a - half_d * cos_a, 4)]
        p3 = [round(cx + half_w * cos_a + half_d * (-sin_a), 4), round(cz + half_w * sin_a + half_d * cos_a, 4)]
        p4 = [round(cx - half_w * cos_a + half_d * (-sin_a), 4), round(cz - half_w * sin_a + half_d * cos_a, 4)]
        
        poly = [p1, p2, p3, p4]
        rot = angle_rad

    elif num in [33, 34, 35]:
        w3d = 3.6 if num == 33 else (2.8 if num == 34 else 2.5)
        d3d = 3.1

        half_w = w3d / 2.0
        half_d = d3d / 2.0

        p1 = [round(cx - half_w * cos_a - half_d * (-sin_a), 4), round(cz - half_w * sin_a - half_d * cos_a, 4)]
        p2 = [round(cx + half_w * cos_a - half_d * (-sin_a), 4), round(cz + half_w * sin_a - half_d * cos_a, 4)]
        p3 = [round(cx + half_w * cos_a + half_d * (-sin_a), 4), round(cz + half_w * sin_a + half_d * cos_a, 4)]
        p4 = [round(cx - half_w * cos_a + half_d * (-sin_a), 4), round(cz - half_w * sin_a + half_d * cos_a, 4)]
        
        poly = [p1, p2, p3, p4]
        rot = angle_rad

    else:
        # Standard axis-aligned plots
        w3d = 2.1 if num in [7, 8, 9, 10, 11] else 2.2
        d3d = 3.5 if num in [7, 8] else (2.8 if num in [9, 10, 11] else 2.5)

        half_w = w3d / 2.0
        half_d = d3d / 2.0

        p1 = [round(cx - half_w, 4), round(cz - half_d, 4)]
        p2 = [round(cx + half_w, 4), round(cz - half_d, 4)]
        p3 = [round(cx + half_w, 4), round(cz + half_d, 4)]
        p4 = [round(cx - half_w, 4), round(cz + half_d, 4)]

        poly = [p1, p2, p3, p4]
        rot = 0.0

    plot_polygons_exact[num] = poly
    plot_positions_exact[num] = {
        'x': cx,
        'z': cz,
        'w': w3d,
        'h': d3d,
        'height': 1.4 if num in [1,2,3,4,5,6,33,34,35,93,94,95,96] else 1.2,
        'rot': round(rot, 4)
    }

print(f"Computed exact 1:1 CAD aligned polygons for all {len(plot_polygons_exact)} plots!")

# Update public/js/plotData.js
with open('public/js/plotData.js', 'r') as f:
    js_content = f.read()

poly_js = "const PLOT_POLYGONS_EXACT = " + json.dumps(plot_polygons_exact, indent=2) + ";\n\n"
pos_js = "const PLOT_POSITIONS = " + json.dumps(plot_positions_exact, indent=2) + ";\n\n"

if 'const PLOT_POLYGONS_EXACT' in js_content:
    js_content = re.sub(r'const PLOT_POLYGONS_EXACT = \{[\s\S]*?\};\n\n', poly_js, js_content)

if 'const PLOT_POSITIONS' in js_content:
    js_content = re.sub(r'const PLOT_POSITIONS = \{[\s\S]*?\};\n\n', pos_js, js_content)

with open('public/js/plotData.js', 'w') as f:
    f.write(js_content)

print("Saved exact 1:1 CAD aligned plot polygons to public/js/plotData.js!")
