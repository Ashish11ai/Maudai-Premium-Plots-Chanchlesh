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

# Scale factor 0.94 for clean spacing channels (zero overlap)
SCALE = 0.94
angle_top = math.radians(-22.5)

for num in range(1, 97):
    lbl = plot_labels.get(num)
    if not lbl:
        continue
    lcx, lcy = lbl['cx'], lbl['cy']
    c3d = pdf_to_3d(lcx, lcy)
    cx, cz = c3d[0], c3d[1]

    if num == 94:
        # Plot 94: Top=45 ft, Left=43'1", Right=28'10", Tapered angled bottom edge
        w3d = 3.2 * SCALE
        d_left = 3.1 * SCALE
        d_right = 2.0 * SCALE

        half_w = w3d / 2.0
        p1 = [round(cx - half_w, 4), round(cz - d_left/2.0, 4)]
        p2 = [round(cx + half_w, 4), round(cz - d_right/2.0, 4)]
        p3 = [round(cx + half_w, 4), round(cz + d_right/2.0, 4)]
        p4 = [round(cx - half_w, 4), round(cz + d_left/2.0, 4)]
        poly = [p1, p2, p3, p4]
        rot = 0.0

    elif num == 93:
        # Plot 93: Tapered left boundary plot
        w3d = 3.1 * SCALE
        d_left = 2.4 * SCALE
        d_right = 3.1 * SCALE

        half_w = w3d / 2.0
        p1 = [round(cx - half_w, 4), round(cz - d_left/2.0, 4)]
        p2 = [round(cx + half_w, 4), round(cz - d_right/2.0, 4)]
        p3 = [round(cx + half_w, 4), round(cz + d_right/2.0, 4)]
        p4 = [round(cx - half_w, 4), round(cz + d_left/2.0, 4)]
        poly = [p1, p2, p3, p4]
        rot = 0.0

    elif num in [95, 96]:
        # Plots 95 & 96: Tapered East boundary corner plots
        w3d = 3.6 * SCALE
        d_left = 3.2 * SCALE
        d_right = 2.2 * SCALE

        half_w = w3d / 2.0
        p1 = [round(cx - half_w, 4), round(cz - d_left/2.0, 4)]
        p2 = [round(cx + half_w, 4), round(cz - d_right/2.0, 4)]
        p3 = [round(cx + half_w, 4), round(cz + d_right/2.0, 4)]
        p4 = [round(cx - half_w, 4), round(cz + d_left/2.0, 4)]
        poly = [p1, p2, p3, p4]
        rot = 0.0

    elif num in [1, 2, 3]:
        w3d = 2.1 * SCALE
        d3d = (7.8 if num == 1 else (7.7 if num == 2 else 9.1)) * SCALE
        rot = angle_top

        cos_t = math.cos(rot)
        sin_t = math.sin(rot)
        half_w = w3d / 2.0
        half_d = d3d / 2.0
        p1 = [round(cx - half_w * cos_t + half_d * sin_t, 4), round(cz - half_w * sin_t - half_d * cos_t, 4)]
        p2 = [round(cx + half_w * cos_t + half_d * sin_t, 4), round(cz + half_w * sin_t - half_d * cos_t, 4)]
        p3 = [round(cx + half_w * cos_t - half_d * sin_t, 4), round(cz + half_w * sin_t + half_d * cos_t, 4)]
        p4 = [round(cx - half_w * cos_t - half_d * sin_t, 4), round(cz - half_w * sin_t + half_d * cos_t, 4)]
        poly = [p1, p2, p3, p4]

    elif num in [4, 5, 6]:
        w3d = (3.5 if num in [4, 5] else 3.2) * SCALE
        d3d = 2.6 * SCALE
        rot = angle_top

        cos_t = math.cos(rot)
        sin_t = math.sin(rot)
        half_w = w3d / 2.0
        half_d = d3d / 2.0
        p1 = [round(cx - half_w * cos_t + half_d * sin_t, 4), round(cz - half_w * sin_t - half_d * cos_t, 4)]
        p2 = [round(cx + half_w * cos_t + half_d * sin_t, 4), round(cz + half_w * sin_t - half_d * cos_t, 4)]
        p3 = [round(cx + half_w * cos_t - half_d * sin_t, 4), round(cz + half_w * sin_t + half_d * cos_t, 4)]
        p4 = [round(cx - half_w * cos_t - half_d * sin_t, 4), round(cz - half_w * sin_t + half_d * cos_t, 4)]
        poly = [p1, p2, p3, p4]

    elif num in [33, 34, 35]:
        w3d = (3.6 if num == 33 else (2.8 if num == 34 else 2.5)) * SCALE
        d3d = 3.1 * SCALE
        rot = angle_top

        cos_t = math.cos(rot)
        sin_t = math.sin(rot)
        half_w = w3d / 2.0
        half_d = d3d / 2.0
        p1 = [round(cx - half_w * cos_t + half_d * sin_t, 4), round(cz - half_w * sin_t - half_d * cos_t, 4)]
        p2 = [round(cx + half_w * cos_t + half_d * sin_t, 4), round(cz + half_w * sin_t - half_d * cos_t, 4)]
        p3 = [round(cx + half_w * cos_t - half_d * sin_t, 4), round(cz + half_w * sin_t + half_d * cos_t, 4)]
        p4 = [round(cx - half_w * cos_t - half_d * sin_t, 4), round(cz - half_w * sin_t + half_d * cos_t, 4)]
        poly = [p1, p2, p3, p4]

    else:
        rot = 0.0
        w3d = (2.1 if num in [7, 8, 9, 10, 11] else 2.2) * SCALE
        d3d = (3.5 if num in [7, 8] else (2.8 if num in [9, 10, 11] else 2.5)) * SCALE

        half_w = w3d / 2.0
        half_d = d3d / 2.0
        p1 = [round(cx - half_w, 4), round(cz - half_d, 4)]
        p2 = [round(cx + half_w, 4), round(cz - half_d, 4)]
        p3 = [round(cx + half_w, 4), round(cz + half_d, 4)]
        p4 = [round(cx - half_w, 4), round(cz + half_d, 4)]
        poly = [p1, p2, p3, p4]

    plot_polygons_exact[num] = poly
    plot_positions_exact[num] = {
        'x': cx,
        'z': cz,
        'w': round(w3d, 4),
        'h': round(d3d, 4),
        'height': 1.4 if num in [1,2,3,4,5,6,33,34,35,93,94,95,96] else 1.2,
        'rot': round(rot, 4)
    }

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

print(f"Successfully generated exact CAD tapered polygons for Plot 94 and all plots!")
