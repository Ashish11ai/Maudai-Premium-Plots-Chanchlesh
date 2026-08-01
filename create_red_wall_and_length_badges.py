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

# Perimeter Wall Key Measure Vertices in PDF pt & Meters
# Exact CAD boundary survey vertices from drawing text annotations:
# 170.52 M, 123.46 M, 91.24 M, 68.00 M, 53.10 M, 47.69 M, 40.57 M, 28.26 M, 10.12 M
wall_corners = [
    # Top Left near Plot 6 / Ring Rd
    {'pdf_x': 275.0, 'pdf_y': 480.0, 'label': '15.92 M (52 ft)'},
    {'pdf_x': 390.0, 'pdf_y': 310.0, 'label': '28.26 M (93 ft)'},
    {'pdf_x': 490.0, 'pdf_y': 315.0, 'label': '10.12 M (33 ft)'},
    # Right Side down along Plot 1..32..77
    {'pdf_x': 510.0, 'pdf_y': 990.0, 'label': '170.52 M (560 ft)'},
    {'pdf_x': 700.0, 'pdf_y': 995.0, 'label': '47.69 M (156 ft)'},
    {'pdf_x': 710.0, 'pdf_y': 1130.0, 'label': '40.57 M (133 ft)'},
    {'pdf_x': 1050.0, 'pdf_y': 1140.0, 'label': '123.46 M (405 ft)'},
    {'pdf_x': 1045.0, 'pdf_y': 1040.0, 'label': '68.00 M (223 ft)'},
    {'pdf_x': 950.0, 'pdf_y': 930.0, 'label': '91.24 M (299 ft)'},
    {'pdf_x': 800.0, 'pdf_y': 710.0, 'label': '53.10 M (174 ft)'},
    {'pdf_x': 320.0, 'pdf_y': 500.0, 'label': '39.40 M (129 ft)'}
]

# Convert corner vertices to 3D segments and wall length badges
wall_3d_segments = []
wall_length_badges = []

for i in range(len(wall_corners)):
    c1 = wall_corners[i]
    c2 = wall_corners[(i + 1) % len(wall_corners)]
    
    x1, z1 = pdf_to_3d(c1['pdf_x'], c1['pdf_y'])
    x2, z2 = pdf_to_3d(c2['pdf_x'], c2['pdf_y'])
    
    wall_3d_segments.append([x1, z1, x2, z2])
    
    # Midpoint for floating wall length badge
    mx = round((x1 + x2) / 2, 3)
    mz = round((z1 + z2) / 2, 3)
    
    wall_length_badges.append({
        'text': c1['label'],
        'x': mx,
        'z': mz
    })

# Save to data/site_infrastructure.json
with open('data/site_infrastructure.json') as f:
    infra = json.load(f)

infra['wall_segments_3d'] = wall_3d_segments
infra['wall_length_badges'] = wall_length_badges

with open('data/site_infrastructure.json', 'w') as f:
    json.dump(infra, f, indent=2)

print(f"Generated {len(wall_3d_segments)} 3D perimeter wall segments and {len(wall_length_badges)} wall length badges!")
