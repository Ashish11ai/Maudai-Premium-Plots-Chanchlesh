import fitz
import json
import math

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (1191.0 / 1684.0) # ~70.72447
H_3d = 100.0

def pdf_to_3d(pdf_x, pdf_y):
    x = (pdf_x / W_pdf - 0.5) * W_3d
    z = (pdf_y / H_pdf - 0.5) * H_3d
    return round(x, 3), round(z, 3)

# 1. Extract red boundary line segments
red_lines = []
for d in page.get_drawings():
    color = d.get('color')
    if color and len(color) == 3:
        r, g, b = color
        if r > 0.6 and g < 0.4 and b < 0.4:
            for item in d['items']:
                if item[0] == 'l':
                    p1, p2 = item[1], item[2]
                    if p1.x > 250 and p2.x > 250:
                        red_lines.append((p1.x, p1.y, p2.x, p2.y))

# Chain line segments into connected perimeter wall paths
# Find connected vertices
connected_wall_segments = []

for l in red_lines:
    x1, z1 = pdf_to_3d(l[0], l[1])
    x2, z2 = pdf_to_3d(l[2], l[3])
    
    # Check segment length
    len_3d = math.sqrt((x2-x1)**2 + (z2-z1)**2)
    if len_3d < 0.1 or len_3d > 25.0:
        continue
    
    # Entrance Opening Rule:
    # Open entrance along Plots 1 to 6 at the top (pdf_y < 470 and pdf_x < 450)
    is_top_entrance = (l[1] < 470 and l[3] < 470 and l[0] < 450 and l[2] < 450)
    
    # Open entrance along Plots 95-96 at the bottom right (pdf_y > 1110 and pdf_x > 950)
    is_bottom_entrance = (l[1] > 1110 and l[3] > 1110 and l[0] > 950 and l[2] > 950)
    
    if not is_top_entrance and not is_bottom_entrance:
        connected_wall_segments.append([x1, z1, x2, z2])

print(f"Total connected perimeter wall segments: {len(connected_wall_segments)}")

# 2. Refine Plot 3D Geometries & Rotations
with open('data/plots.json') as f:
    plots = json.load(f)

with open('data/plot_boxes.json') as f:
    plot_boxes = json.load(f)

text_page = page.get_text('dict')
plot_labels = {}
for b in text_page['blocks']:
    if 'lines' in b:
        for l in b['lines']:
            for s in l['spans']:
                text = s['text'].strip()
                if text.isdigit() and 1 <= int(text) <= 96:
                    num = int(text)
                    bbox = s['bbox']
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    if cx > 180:
                        if num not in plot_labels or s['size'] > plot_labels[num]['size']:
                            plot_labels[num] = {'num': num, 'cx': cx, 'cy': cy}

lines = []
for d in page.get_drawings():
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            lines.append((p1.x, p1.y, p2.x, p2.y))

plot_3d_data = {}

for id_str, box in plot_boxes.items():
    num = int(id_str)
    lbl = plot_labels.get(num, {'cx': box['pdf_cx'], 'cy': box['pdf_cy']})
    cx, cy = lbl['cx'], lbl['cy']
    
    # Calculate local rotation angle from nearby CAD lines
    nearby = [l for l in lines if abs((l[0]+l[2])/2 - cx) < 40 and abs((l[1]+l[3])/2 - cy) < 40]
    angles = []
    lengths = []
    for l in nearby:
        dx, dy = l[2] - l[0], l[3] - l[1]
        length = math.sqrt(dx*dx + dy*dy)
        if length > 8:
            ang = math.atan2(dy, dx)
            angles.append(ang)
            lengths.append(length)
    
    rot_angle = 0.0
    if angles:
        sin_sum = sum(math.sin(2*a) * w for a, w in zip(angles, lengths))
        cos_sum = sum(math.cos(2*a) * w for a, w in zip(angles, lengths))
        rot_angle = 0.5 * math.atan2(sin_sum, cos_sum)
    
    # 3D position
    x3d, z3d = pdf_to_3d(cx, cy)
    
    # 3D size (width & depth in 3D world units)
    w3d = round((box['pdf_w'] / W_pdf) * W_3d, 3)
    d3d = round((box['pdf_h'] / H_pdf) * H_3d, 3)
    
    # For top row plots 1-6, adjust width & depth to align along slanted top boundary
    if 1 <= num <= 6:
        # Plot length is depth (~3.5), width is frontage (~1.2 - 1.5)
        if w3d > d3d:
            w3d, d3d = d3d, w3d
        rot_angle = 0.46 # Slanted at ~26 degrees matching top boundary line
    
    plot_3d_data[id_str] = {
        'x': x3d,
        'z': z3d,
        'width': max(1.1, w3d),
        'depth': max(1.1, d3d),
        'rotation': round(rot_angle, 4)
    }

# Save updated infrastructure & plot 3D data
infra_data = {
    'wall_segments': connected_wall_segments,
    'plot_3d': plot_3d_data
}

with open('data/site_infrastructure.json', 'w') as f:
    json.dump(infra_data, f, indent=2)

print("Saved updated data/site_infrastructure.json successfully!")
