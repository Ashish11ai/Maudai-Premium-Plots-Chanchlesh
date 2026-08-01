import fitz
import json
import math

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (1191.0 / 1684.0) # 70.72447
H_3d = 100.0

def pdf_to_3d(pdf_x, pdf_y):
    x = (pdf_x / W_pdf - 0.5) * W_3d
    z = (pdf_y / H_pdf - 0.5) * H_3d
    return round(x, 3), round(z, 3)

# Extract ALL red line drawings from PDF page
red_lines = []
for d in page.get_drawings():
    color = d.get('color')
    if color and len(color) == 3:
        r, g, b = color
        if r > 0.6 and g < 0.4 and b < 0.4:
            for item in d['items']:
                if item[0] == 'l':
                    p1, p2 = item[1], item[2]
                    # Filter lines in main site layout area (x > 250)
                    if p1.x > 250 and p2.x > 250:
                        x1, z1 = pdf_to_3d(p1.x, p1.y)
                        x2, z2 = pdf_to_3d(p2.x, p2.y)
                        dx = x2 - x1
                        dz = z2 - z1
                        length = math.sqrt(dx*dx + dz*dz)
                        # Filter valid perimeter wall line segments
                        if 0.1 <= length <= 35.0:
                            red_lines.append([x1, z1, x2, z2])

print(f"Extracted {len(red_lines)} 3D red site boundary wall line segments!")

# Also generate connected continuous wall segments along outer perimeter
perimeter_3d_corners = [
    [-6.5, -21.5],   # Top Entrance near Plot 6
    [-2.5, -31.5],   # Top North-West Corner
    [3.5, -31.0],    # Top North-East Corner near Plot 1
    [5.0, 8.5],      # Right Frontage Boundary (170.52 M)
    [16.2, 8.8],     # Corner (47.69 M)
    [16.7, 17.5],    # Corner (40.57 M)
    [37.2, 18.0],    # Bottom Right Corner (123.46 M)
    [36.8, 11.2],    # Bottom Wall near Plot 61 (68.00 M)
    [30.6, 5.0],     # South-West Corner (91.24 M)
    [21.8, -8.0],    # West Side Wall (53.10 M)
    [-6.4, -20.2]    # West Access Wall (39.40 M)
]

solid_segments = []
for i in range(len(perimeter_3d_corners) - 1):
    c1 = perimeter_3d_corners[i]
    c2 = perimeter_3d_corners[i+1]
    solid_segments.append([c1[0], c1[1], c2[0], c2[1]])

# Format JS array string
js_wall_str = "const SITE_WALL_SEGMENTS = [\n"
for seg in solid_segments + red_lines[:400]:
    js_wall_str += f"  [{seg[0]}, {seg[1]}, {seg[2]}, {seg[3]}],\n"
js_wall_str += "];\n"

# Append SITE_WALL_SEGMENTS to public/js/plotData.js
with open('public/js/plotData.js', 'r') as f:
    content = f.read()

if 'const SITE_WALL_SEGMENTS' in content:
    idx = content.find('const SITE_WALL_SEGMENTS')
    content = content[:idx]

content += "\n" + js_wall_str

with open('public/js/plotData.js', 'w') as f:
    f.write(content)

print("Successfully embedded SITE_WALL_SEGMENTS synchronously into public/js/plotData.js!")
