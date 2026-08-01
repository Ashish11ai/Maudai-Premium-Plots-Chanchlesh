import fitz
import json
import re

roads = [
    {
        "id": "main_entrance",
        "name": "Maudai Main Road (30 FT)",
        "width_ft": 30,
        "x": -12.25,
        "z": -30.0,
        "w": 10.5,
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
        "id": "east_south_road",
        "name": "East Sector 30 FT Road",
        "width_ft": 30,
        "x": 0.5,
        "z": 22.2,
        "w": 15.0,
        "d": 2.0,
        "rot": 0.0,
        "type": "main"
    },
    {
        "id": "east_sector_divider_road",
        "name": "East Sector 20 FT Road",
        "width_ft": 20,
        "x": -0.35,
        "z": 19.25,
        "w": 1.6,
        "d": 4.5,
        "rot": 0.0,
        "type": "access"
    }
]

print(f"Generated {len(roads)} exact site-bounded road definitions!")

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
