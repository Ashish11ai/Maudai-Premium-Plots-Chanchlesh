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
    return round(x, 4), round(z, 4)

# 1. Extract exact red boundary line segments for Covered Site Small Wall
red_wall_segments = []
road_line_segments = []

for d in page.get_drawings():
    color = d.get('color')
    if not color or len(color) != 3:
        continue
    r, g, b = color
    
    # Red lines (site boundary wall)
    if r > 0.6 and g < 0.4 and b < 0.4:
        for item in d['items']:
            if item[0] == 'l':
                p1, p2 = item[1], item[2]
                if p1.x > 250 and p2.x > 250:
                    x1, z1 = pdf_to_3d(p1.x, p1.y)
                    x2, z2 = pdf_to_3d(p2.x, p2.y)
                    dx, dz = x2 - x1, z2 - z1
                    length = math.sqrt(dx*dx + dz*dz)
                    if 0.05 <= length <= 35.0:
                        red_wall_segments.append([x1, z1, x2, z2])
                        
    # Blue / Dark lines (road boundaries & centerlines)
    elif (b > 0.5 or (r < 0.4 and g < 0.4 and b < 0.4)):
        for item in d['items']:
            if item[0] == 'l':
                p1, p2 = item[1], item[2]
                if p1.x > 250 and p2.x > 250:
                    x1, z1 = pdf_to_3d(p1.x, p1.y)
                    x2, z2 = pdf_to_3d(p2.x, p2.y)
                    dx, dz = x2 - x1, z2 - z1
                    length = math.sqrt(dx*dx + dz*dz)
                    if 0.1 <= length <= 45.0:
                        road_line_segments.append([x1, z1, x2, z2])

print(f"Extracted {len(red_wall_segments)} exact red site wall segments!")
print(f"Extracted {len(road_line_segments)} exact CAD road line segments!")

# Save to data/site_infrastructure.json
infra_data = {
    'wall_segments_exact': red_wall_segments,
    'road_segments_exact': road_line_segments
}

with open('data/site_infrastructure.json', 'w') as f:
    json.dump(infra_data, f, indent=2)

# Generate JS code to embed synchronously into public/js/plotData.js
js_wall_str = "const SITE_WALL_SEGMENTS = [\n"
for seg in red_wall_segments:
    js_wall_str += f"  [{seg[0]}, {seg[1]}, {seg[2]}, {seg[3]}],\n"
js_wall_str += "];\n\n"

js_road_str = "const SITE_ROAD_SEGMENTS = [\n"
for seg in road_line_segments[:800]: # Top primary road line segments
    js_road_str += f"  [{seg[0]}, {seg[1]}, {seg[2]}, {seg[3]}],\n"
js_road_str += "];\n"

with open('public/js/plotData.js', 'r') as f:
    content = f.read()

# Remove any previous SITE_WALL_SEGMENTS or SITE_ROAD_SEGMENTS
for tag in ['const SITE_WALL_SEGMENTS', 'const SITE_ROAD_SEGMENTS']:
    if tag in content:
        idx = content.find(tag)
        content = content[:idx]

content += "\n" + js_wall_str + js_road_str

with open('public/js/plotData.js', 'w') as f:
    f.write(content)

print("Successfully embedded SITE_WALL_SEGMENTS and SITE_ROAD_SEGMENTS into public/js/plotData.js!")
