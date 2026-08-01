import fitz
import json

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (1191.0 / 1684.0) # ~70.724
H_3d = 100.0

def pdf_to_3d(pdf_x, pdf_y):
    x = (pdf_x / W_pdf - 0.5) * W_3d
    z = (pdf_y / H_pdf - 0.5) * H_3d
    return round(x, 3), round(z, 3)

# 1. Extract red boundary lines for covered site wall
wall_segments = []

for d in page.get_drawings():
    color = d.get('color')
    if color and len(color) == 3:
        r, g, b = color
        # Red lines (site boundary wall)
        if r > 0.6 and g < 0.4 and b < 0.4:
            for item in d['items']:
                if item[0] == 'l':
                    p1, p2 = item[1], item[2]
                    # Filter lines in main site area (x > 250)
                    if p1.x > 250 and p2.x > 250:
                        x1, z1 = pdf_to_3d(p1.x, p1.y)
                        x2, z2 = pdf_to_3d(p2.x, p2.y)
                        # Avoid zero-length segments
                        if abs(x1 - x2) > 0.05 or abs(z1 - z2) > 0.05:
                            wall_segments.append([x1, z1, x2, z2])

print(f"Extracted {len(wall_segments)} 3D site boundary wall segments!")

# 2. Extract road centerlines & road polygons
# Find text blocks for roads to position road meshes
text_page = page.get_text('dict')
road_labels = []

for b in text_page['blocks']:
    if 'lines' in b:
        for l in b['lines']:
            for s in l['spans']:
                text = s['text'].strip()
                if 'ROAD' in text or 'RING' in text or 'MAUDAI' in text:
                    bbox = s['bbox']
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    x3d, z3d = pdf_to_3d(cx, cy)
                    road_labels.append({
                        'text': text,
                        'x': x3d,
                        'z': z3d,
                        'pdf_x': round(cx, 1),
                        'pdf_y': round(cy, 1)
                    })

# Save to data/site_infrastructure.json
infra_data = {
    'wall_segments': wall_segments[:300], # Clean primary boundary segments
    'road_labels': road_labels
}

with open('data/site_infrastructure.json', 'w') as f:
    json.dump(infra_data, f, indent=2)

print("Saved data/site_infrastructure.json successfully!")
