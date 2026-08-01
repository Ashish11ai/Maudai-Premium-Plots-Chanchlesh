import json
import re

# Load plotData.js
with open('public/js/plotData.js', 'r') as f:
    content = f.read()

# Load PLOT_POSITIONS and PLOT_POLYGONS_EXACT
idx1 = content.find('const PLOT_POSITIONS = ')
idx2 = content.find('const PLOT_POLYGONS_EXACT = ')
idx3 = content.find('function plotTo3D')

pos_json_str = content[idx1 + len('const PLOT_POSITIONS = '):idx2].strip().rstrip(';')
poly_json_str = content[idx2 + len('const PLOT_POLYGONS_EXACT = '):idx3].strip().rstrip(';')

positions = json.loads(pos_json_str)
polygons = json.loads(poly_json_str)

# 1. Adjust Plots 61, 62, 77 to sit cleanly above 30 FEET WIDE ROAD
# Plot 61
positions["61"]["z"] = 20.6
half_w61 = positions["61"]["w"] / 2.0
half_h61 = positions["61"]["h"] / 2.0
cx61 = positions["61"]["x"]
cz61 = 20.6
polygons["61"] = [
    [round(cx61 - half_w61, 4), round(cz61 - half_h61, 4)],
    [round(cx61 + half_w61, 4), round(cz61 - half_h61, 4)],
    [round(cx61 + half_w61, 4), round(cz61 + half_h61, 4)],
    [round(cx61 - half_w61, 4), round(cz61 + half_h61, 4)]
]

# Plot 62
positions["62"]["z"] = 20.2
half_w62 = positions["62"]["w"] / 2.0
half_h62 = positions["62"]["h"] / 2.0
cx62 = positions["62"]["x"]
cz62 = 20.2
polygons["62"] = [
    [round(cx62 - half_w62, 4), round(cz62 - half_h62, 4)],
    [round(cx62 + half_w62, 4), round(cz62 - half_h62, 4)],
    [round(cx62 + half_w62, 4), round(cz62 + half_h62, 4)],
    [round(cx62 - half_w62, 4), round(cz62 + half_h62, 4)]
]

# Plot 77
positions["77"]["z"] = 20.1
half_w77 = positions["77"]["w"] / 2.0
half_h77 = positions["77"]["h"] / 2.0
cx77 = positions["77"]["x"]
cz77 = 20.1
polygons["77"] = [
    [round(cx77 - half_w77, 4), round(cz77 - half_h77, 4)],
    [round(cx77 + half_w77, 4), round(cz77 - half_h77, 4)],
    [round(cx77 + half_w77, 4), round(cz77 + half_h77, 4)],
    [round(cx77 - half_w77, 4), round(cz77 + half_h77, 4)]
]

# 2. Adjust roads alignment
roads_aligned = [
    { "id": "ring_road", "name": "Chhindwara Outer Ring Road (45 M)", "width_ft": 147.6, "x": -23.5, "z": -31.5, "w": 32.0, "d": 4.5, "h": 0.08, "rot": -0.52, "type": "ring" },
    { "id": "main_entrance", "name": "Maudai Main Road (30 FT)", "width_ft": 30, "x": -12.5, "z": -31.2, "w": 10.5, "d": 2.2, "h": 0.05, "rot": 0.0, "type": "main" },
    { "id": "central_avenue", "name": "Central Avenue (30 FT)", "width_ft": 30, "x": -12.5, "z": -5.0, "w": 2.2, "d": 52.0, "h": 0.05, "rot": 0.0, "type": "avenue" },
    { "id": "sector_road_1", "name": "Sector Road 1 (20 FT)", "width_ft": 20, "x": -12.5, "z": -22.5, "w": 7.0, "d": 1.4, "h": 0.04, "rot": 0.0, "type": "access" },
    { "id": "sector_road_2", "name": "Sector Road 2 (20 FT)", "width_ft": 20, "x": -12.5, "z": -14.8, "w": 7.0, "d": 1.4, "h": 0.04, "rot": 0.0, "type": "access" },
    { "id": "sector_road_3", "name": "Sector Road 3 (20 FT)", "width_ft": 20, "x": -12.5, "z": -2.2, "w": 7.0, "d": 1.4, "h": 0.04, "rot": 0.0, "type": "access" },
    { "id": "sector_road_4", "name": "Sector Road 4 (20 FT)", "width_ft": 20, "x": -12.5, "z": 6.8, "w": 7.0, "d": 1.4, "h": 0.04, "rot": 0.0, "type": "access" },
    { "id": "sector_road_5", "name": "Sector Road 5 (20 FT)", "width_ft": 20, "x": -12.5, "z": 15.65, "w": 7.0, "d": 1.1, "h": 0.04, "rot": 0.0, "type": "access" },
    { "id": "east_south_road", "name": "East Sector 30 FT Road", "width_ft": 30, "x": 3.2, "z": 22.8, "w": 22.0, "d": 2.2, "h": 0.05, "rot": 0.0, "type": "main" },
    { "id": "east_divider_road", "name": "East Sector 20 FT Road", "width_ft": 20, "x": -0.2, "z": 19.5, "w": 1.4, "d": 4.0, "h": 0.04, "rot": 0.0, "type": "access" }
]

# Update plotData.js
new_pos_js = "const PLOT_POSITIONS = " + json.dumps(positions, indent=2) + ";\n\n"
new_poly_js = "const PLOT_POLYGONS_EXACT = " + json.dumps(polygons, indent=2) + ";\n\n"
new_roads_js = "const SITE_ROADS_EXACT = " + json.dumps(roads_aligned, indent=2) + ";\n"

content = re.sub(r'const PLOT_POSITIONS = \{[\s\S]*?\};\n\n', new_pos_js, content)
content = re.sub(r'const PLOT_POLYGONS_EXACT = \{[\s\S]*?\};\n\n', new_poly_js, content)
content = re.sub(r'const SITE_ROADS_EXACT = \[[\s\S]*?\];\n', new_roads_js, content)

with open('public/js/plotData.js', 'w') as f:
    f.write(content)

print("Successfully fixed Sector 5 road and bottom row plot alignment in public/js/plotData.js!")
