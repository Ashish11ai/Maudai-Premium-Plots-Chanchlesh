import json

with open('traced_polygons_raw.json', 'r') as f:
    raw_data = json.load(f)

traced_polygons = raw_data.get('polygons', {})

# 100% Exact CAD Table Areas from User's Image
EXACT_TABLE_AREAS = {
    1: 3364.83, 2: 3330.27, 3: 3930.91, 4: 3000.00, 5: 3000.00,
    6: 2763.76, 7: 1561.96, 8: 1703.73, 9: 1250.00, 10: 1250.00,
    11: 921.08, 12: 2202.74, 13: 1548.62, 14: 1800.00, 15: 1255.51,
    16: 1029.04, 17: 1134.31, 18: 1239.69, 19: 1500.00, 20: 1298.46,
    21: 1895.33, 22: 1500.00, 23: 1500.00, 24: 1250.00, 25: 1074.68,
    26: 1674.23, 27: 1250.00, 28: 1500.00, 29: 1500.00, 30: 1250.00,
    31: 1000.00, 32: 1089.86, 33: 3054.39, 34: 2236.87, 35: 1750.00,
    36: 1494.69, 37: 1485.43, 38: 1477.57, 39: 1465.73, 40: 1463.26,
    41: 1456.15, 42: 1449.05, 43: 1441.95, 44: 1196.63, 45: 1191.57,
    46: 1186.41, 47: 1181.13, 48: 1175.97, 49: 1177.90, 50: 1187.81,
    51: 1197.71, 52: 1207.61, 53: 1217.52, 54: 981.78, 55: 988.14,
    56: 994.38, 57: 995.67, 58: 969.51, 59: 939.16, 60: 908.80,
    61: 1406.64, 62: 1746.57, 63: 1250.00, 64: 1250.00, 65: 1250.00,
    66: 1250.00, 67: 1250.00, 68: 1384.04, 69: 1500.00, 70: 1590.00,
    71: 1466.70, 72: 1325.00, 73: 1325.00, 74: 1325.00, 75: 1325.00,
    76: 1325.00, 77: 1677.89, 78: 1886.82, 79: 1500.00, 80: 1500.00,
    81: 1871.97, 82: 1367.67, 83: 1500.00, 84: 1500.00, 85: 1368.53,
    86: 1476.28, 87: 1500.00, 88: 1500.00, 89: 1250.00, 90: 1310.95,
    91: 1617.72, 92: 1250.00, 93: 2106.30, 94: 2009.32, 95: 3491.52,
    96: 3310.04
}

plot_areas = {}
plot_dim_badges = {}
plots_json_data = {}

FT_SCALE = 16.8407

for num in range(1, 97):
    str_pid = str(num)
    area = EXACT_TABLE_AREAS[num]
    plot_areas[num] = area
    
    pts = traced_polygons.get(str_pid)
    if pts and len(pts) >= 3:
        xs = [p[0] for p in pts]
        zs = [p[1] for p in pts]
        w3d = max(xs) - min(xs)
        d3d = max(zs) - min(zs)
        w_ft = round(w3d * FT_SCALE * 10) / 10
        d_ft = round(d3d * FT_SCALE * 10) / 10
        if w_ft < 10: w_ft = 25.0
        if d_ft < 10: d_ft = round(area / w_ft, 1)
        dim_str = f"{w_ft} ft × {d_ft} ft"
    else:
        dim_str = "25.0 ft × 50.0 ft"

    plot_dim_badges[num] = dim_str
    facing = "30 Feet Road" if num in [1,2,3,4,5,6,33,34,35,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96] else "20 Feet Road"

    plots_json_data[str_pid] = {
        'number': num,
        'area': area,
        'status': 'available',
        'price': 0,
        'notes': '',
        'dimensions_str': dim_str,
        'facing_road': facing
    }

# Save data/plots.json
with open('data/plots.json', 'w') as f:
    json.dump(plots_json_data, f, indent=2)

# Write public/js/plotData.js
js_content = f"""/**
 * Plot Data Definitions for Maudai Premium Plots
 * Exact Traced CAD Polygons & Exact Table Areas
 */

const PLOT_AREAS = {json.dumps(plot_areas, indent=2)};

const PLOT_DIM_BADGES = {json.dumps(plot_dim_badges, indent=2)};

const PLOT_POSITIONS = {{}};

const PLOT_POLYGONS_EXACT = {json.dumps(traced_polygons, indent=2)};

function plotTo3D(plotNum) {{
  return null;
}}

const STATUS_COLORS = {{
  available: {{ color: 0x10b981, opacity: 0.75, emissive: 0x059669 }},
  sold: {{ color: 0xef4444, opacity: 0.75, emissive: 0xdc2626 }},
  reserved: {{ color: 0xf59e0b, opacity: 0.75, emissive: 0xd97706 }}
}};

const WHATSAPP_NUMBER = '919340153055';
const CONTACT_NAME = 'Mr. Chanchlesh Ji Sahu';
const CONTACT_PHONE = '9340153055';

const SITE_WALL_SEGMENTS = [];
const SITE_ROADS_EXACT = [];
"""

with open('public/js/plotData.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f"Successfully embedded exact CAD polygons for {len(traced_polygons)} plots!")
