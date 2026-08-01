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

# Continuous ordered outer boundary polygon vertices around the site perimeter (in PDF pt)
# Tracing the site perimeter continuously clockwise:
perimeter_vertices_pdf = [
    (318.0, 480.0),   # Top Left near Plot 6 / Entrance
    (386.0, 320.0),   # Top North-West Corner
    (487.0, 328.0),   # Top North-East Corner near Plot 1
    (512.0, 988.0),   # Right Frontage Boundary (170.52 M)
    (700.0, 992.0),   # Corner (47.69 M)
    (708.0, 1138.0),  # Corner (40.57 M)
    (1055.0, 1145.0), # Bottom Right Corner (123.46 M)
    (1048.0, 1030.0), # Bottom Wall (68.00 M)
    (945.0, 925.0),   # South-West Corner (91.24 M)
    (795.0, 705.0),   # West Side Wall (53.10 M)
    (320.0, 500.0)    # West Access Wall (39.40 M)
]

# Convert polygon vertices to 3D local coordinates
perimeter_vertices_3d = [pdf_to_3d(vx, vy) for vx, vy in perimeter_vertices_pdf]

# Generate continuous gapless wall segments connecting vertex i to vertex i+1
solid_wall_segments = []
wall_length_badges = []

# Exact survey annotations from layout drawing
length_annotations = [
    "28.26 M (93 ft)",
    "10.12 M (33 ft)",
    "170.52 M (560 ft)",
    "47.69 M (156 ft)",
    "40.57 M (133 ft)",
    "123.46 M (405 ft)",
    "68.00 M (223 ft)",
    "91.24 M (299 ft)",
    "53.10 M (174 ft)",
    "39.40 M (129 ft)",
    "15.92 M (52 ft)"
]

n = len(perimeter_vertices_3d)
for i in range(n):
    p1 = perimeter_vertices_3d[i]
    p2 = perimeter_vertices_3d[(i + 1) % n]
    
    # Solid continuous segment
    solid_wall_segments.append([p1[0], p1[1], p2[0], p2[1]])
    
    # Midpoint for floating 3D badge
    mx = round((p1[0] + p2[0]) / 2, 3)
    mz = round((p1[1] + p2[1]) / 2, 3)
    badge_text = length_annotations[i] if i < len(length_annotations) else "PERIMETER WALL"
    
    wall_length_badges.append({
        'text': badge_text,
        'x': mx,
        'z': mz
    })

# Save to data/site_infrastructure.json
with open('data/site_infrastructure.json') as f:
    infra = json.load(f)

infra['solid_wall_segments'] = solid_wall_segments
infra['wall_length_badges'] = wall_length_badges

with open('data/site_infrastructure.json', 'w') as f:
    json.dump(infra, f, indent=2)

print(f"Generated {len(solid_wall_segments)} continuous solid wall segments and {len(wall_length_badges)} badges!")
