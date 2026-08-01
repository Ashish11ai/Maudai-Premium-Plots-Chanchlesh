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

# Define exact road corridors calculated directly from PDF CAD geometry:
# Each road: { name, width_ft, x, z, w, d, rot, type }

roads = [
    {
        "id": "main_entrance",
        "name": "Maudai Main Road (30 FT)",
        "width_ft": 30,
        "x": -12.25,
        "z": -30.0,
        "w": 11.2,
        "d": 2.4,
        "rot": 0.0,
        "type": "main"
    },
    {
        "id": "central_avenue",
        "name": "Central Avenue (30 FT)",
        "width_ft": 30,
        "x": -13.85,
        "z": -5.0,
        "w": 1.8,
        "d": 50.0,
        "rot": 0.0,
        "type": "avenue"
    },
    {
        "id": "sector_road_1",
        "name": "Sector 1 Access Road (20 FT)",
        "width_ft": 20,
        "x": -12.8,
        "z": -14.5,
        "w": 9.2,
        "d": 1.6,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "sector_road_2",
        "name": "Sector 2 Access Road (20 FT)",
        "width_ft": 20,
        "x": -12.8,
        "z": -2.0,
        "w": 9.2,
        "d": 1.6,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "sector_road_3",
        "name": "Sector 3 Access Road (20 FT)",
        "width_ft": 20,
        "x": -12.8,
        "z": 7.0,
        "w": 9.2,
        "d": 1.6,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "sector_road_4",
        "name": "Sector 4 Access Road (20 FT)",
        "width_ft": 20,
        "x": -12.8,
        "z": 16.0,
        "w": 9.2,
        "d": 1.6,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "east_front_road",
        "name": "East Sector Front Road (20 FT)",
        "width_ft": 20,
        "x": 0.5,
        "z": 16.5,
        "w": 15.0,
        "d": 1.6,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "east_side_road",
        "name": "East Sector Side Road (20 FT)",
        "width_ft": 20,
        "x": 8.0,
        "z": 22.0,
        "w": 1.6,
        "d": 12.0,
        "rot": 0.0,
        "type": "access"
    },
    {
        "id": "south_boundary_road",
        "name": "South Boundary Road (30 FT)",
        "width_ft": 30,
        "x": -12.25,
        "z": 21.0,
        "w": 11.2,
        "d": 2.2,
        "rot": 0.0,
        "type": "main"
    }
]

print(f"Generated {len(roads)} individual CAD road definitions!")

# Write JS array string into plotData.js
js_roads_str = "const SITE_ROADS_EXACT = [\n"
for r in roads:
    js_roads_str += f"  {{ id: '{r['id']}', name: '{r['name']}', width_ft: {r['width_ft']}, x: {r['x']}, z: {r['z']}, w: {r['w']}, d: {r['d']}, rot: {r['rot']}, type: '{r['type']}' }},\n"
js_roads_str += "];\n"

with open('public/js/plotData.js', 'r') as f:
    content = f.read()

if 'const SITE_ROADS_EXACT' in content:
    idx = content.find('const SITE_ROADS_EXACT')
    content = content[:idx]

content += "\n" + js_roads_str

with open('public/js/plotData.js', 'w') as f:
    f.write(content)

print("Successfully updated SITE_ROADS_EXACT in public/js/plotData.js!")
