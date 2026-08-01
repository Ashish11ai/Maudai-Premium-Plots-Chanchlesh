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

def pdf_to_3d(px, py):
    x3d = round((px / W_pdf - 0.5) * W_3d, 4)
    z3d = round((py / H_pdf - 0.5) * H_3d, 4)
    return [x3d, z3d]

def rotate_point(px, py, cx, cy, angle_rad):
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    dx = px - cx
    dy = py - cy
    rx = cx + (dx * cos_a - dy * sin_a)
    ry = cy + (dx * sin_a + dy * cos_a)
    return rx, ry

plot_polygons_tilted = {}
plot_positions_tilted = {}

# Exact dimensions in PDF pt scale for special top sector plots
# Angle of top sector along Ring Road boundary is -22.5 degrees (-0.3927 rad)
TOP_SECTOR_ANGLE = -0.3927

for num in range(1, 97):
    lbl = plot_labels.get(num)
    if not lbl:
        continue
    lcx, lcy = lbl['cx'], lbl['cy']

    # Determine plot angle & size
    if num in [1, 2, 3]:
        # Plots 1, 2, 3 are deep plots rotated at -22.5 deg
        angle = TOP_SECTOR_ANGLE
        w_pt = 32.0 if num == 1 else (31.0 if num == 2 else 31.0)
        h_pt = 85.0 if num == 1 else (84.0 if num == 2 else 98.0)
    elif num in [4, 5, 6]:
        angle = TOP_SECTOR_ANGLE
        w_pt = 50.0 if num in [4, 5] else 45.0
        h_pt = 38.0
    elif num in [33, 34, 35]:
        angle = TOP_SECTOR_ANGLE
        w_pt = 52.0 if num == 33 else (42.0 if num == 34 else 38.0)
        h_pt = 45.0
    elif 77 <= num <= 96:
        angle = -0.15 # Slight east sector tilt
        w_pt = 35.0
        h_pt = 32.0
    else:
        angle = 0.0 # Axis-aligned central spine plots
        w_pt = 32.0
        h_pt = 25.0

    # 4 Corner points relative to center (lcx, lcy) before rotation
    half_w = w_pt / 2.0
    half_h = h_pt / 2.0
    
    corners_raw = [
        (-half_w, -half_h),
        (half_w, -half_h),
        (half_w, half_h),
        (-half_w, half_h)
    ]
    
    # Rotate corners by angle and convert to 3D plane
    poly_3d = []
    for dx, dy in corners_raw:
        rx, ry = rotate_point(lcx + dx, lcy + dy, lcx, lcy, angle)
        poly_3d.append(pdf_to_3d(rx, ry))

    plot_polygons_tilted[num] = poly_3d
    
    # Center position in 3D
    c_3d = pdf_to_3d(lcx, lcy)
    w_3d = round((w_pt / W_pdf) * W_3d, 4)
    d_3d = round((h_pt / H_pdf) * H_3d, 4)
    
    plot_positions_tilted[num] = {
        'x': c_3d[0],
        'z': c_3d[1],
        'w': w_3d,
        'h': d_3d,
        'height': 1.4 if num in [1,2,3,4,5,6,33,34,35,93,94,95,96] else 1.2,
        'rot': round(angle, 4)
    }

print(f"Computed CAD tilted polygon vertices for all 96 plots!")

# Update public/js/plotData.js
with open('public/js/plotData.js', 'r') as f:
    js_content = f.read()

poly_js = "const PLOT_POLYGONS_EXACT = " + json.dumps(plot_polygons_tilted, indent=2) + ";\n\n"
pos_js = "const PLOT_POSITIONS = " + json.dumps(plot_positions_tilted, indent=2) + ";\n\n"

if 'const PLOT_POLYGONS_EXACT' in js_content:
    js_content = re.sub(r'const PLOT_POLYGONS_EXACT = \{[\s\S]*?\};\n\n', poly_js, js_content)
else:
    js_content = poly_js + js_content

if 'const PLOT_POSITIONS' in js_content:
    js_content = re.sub(r'const PLOT_POSITIONS = \{[\s\S]*?\};\n\n', pos_js, js_content)

with open('public/js/plotData.js', 'w') as f:
    f.write(js_content)

print("Saved exact CAD tilted plot polygons to public/js/plotData.js!")
