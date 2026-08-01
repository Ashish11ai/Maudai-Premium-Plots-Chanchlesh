import json
import re

# 100% Exact CAD Table Areas & Exact Layout Feet-Inches Dimensions for ALL 96 Plots
CAD_LAYOUT_DETAILS = {
    1: {"area": 3364.83, "dim": "30'-1\" × 111'-8\" (30.1 ft × 111.8 ft)", "width_ft": 30.1, "depth_ft": 111.8},
    2: {"area": 3330.27, "dim": "30'-0\" × 111'-0\" (30.0 ft × 111.0 ft)", "width_ft": 30.0, "depth_ft": 111.0},
    3: {"area": 3930.91, "dim": "30'-0\" × 131'-0\" (30.0 ft × 131.0 ft)", "width_ft": 30.0, "depth_ft": 131.0},
    4: {"area": 3000.00, "dim": "50'-0\" × 60'-0\" (50.0 ft × 60.0 ft)", "width_ft": 50.0, "depth_ft": 60.0},
    5: {"area": 3000.00, "dim": "50'-0\" × 60'-0\" (50.0 ft × 60.0 ft)", "width_ft": 50.0, "depth_ft": 60.0},
    6: {"area": 2763.76, "dim": "46'-0\" × 60'-0\" (46.0 ft × 60.0 ft)", "width_ft": 46.0, "depth_ft": 60.0},
    7: {"area": 1561.96, "dim": "30'-0\" × 52'-1\" (30.0 ft × 52.1 ft)", "width_ft": 30.0, "depth_ft": 52.1},
    8: {"area": 1703.73, "dim": "30'-0\" × 56'-8\" (30.0 ft × 56.8 ft)", "width_ft": 30.0, "depth_ft": 56.8},
    9: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    10: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    11: {"area": 921.08, "dim": "20'-0\" × 46'-1\" (20.0 ft × 46.1 ft)", "width_ft": 20.0, "depth_ft": 46.1},
    12: {"area": 2202.74, "dim": "30'-0\" × 73'-5\" (30.0 ft × 73.4 ft)", "width_ft": 30.0, "depth_ft": 73.4},
    13: {"area": 1548.62, "dim": "30'-0\" × 51'-7\" (30.0 ft × 51.6 ft)", "width_ft": 30.0, "depth_ft": 51.6},
    14: {"area": 1800.00, "dim": "30'-0\" × 60'-0\" (30.0 ft × 60.0 ft)", "width_ft": 30.0, "depth_ft": 60.0},
    15: {"area": 1255.51, "dim": "25'-0\" × 50'-3\" (25.0 ft × 50.2 ft)", "width_ft": 25.0, "depth_ft": 50.2},
    16: {"area": 1029.04, "dim": "25'-0\" × 41'-2\" (25.0 ft × 41.2 ft)", "width_ft": 25.0, "depth_ft": 41.2},
    17: {"area": 1134.31, "dim": "25'-0\" × 45'-4\" (25.0 ft × 45.4 ft)", "width_ft": 25.0, "depth_ft": 45.4},
    18: {"area": 1239.69, "dim": "25'-0\" × 49'-7\" (25.0 ft × 49.6 ft)", "width_ft": 25.0, "depth_ft": 49.6},
    19: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    20: {"area": 1298.46, "dim": "25'-0\" × 51'-11\" (25.0 ft × 51.9 ft)", "width_ft": 25.0, "depth_ft": 51.9},
    21: {"area": 1895.33, "dim": "30'-0\" × 63'-2\" (30.0 ft × 63.2 ft)", "width_ft": 30.0, "depth_ft": 63.2},
    22: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    23: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    24: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    25: {"area": 1074.68, "dim": "25'-0\" × 43'-0\" (25.0 ft × 43.0 ft)", "width_ft": 25.0, "depth_ft": 43.0},
    26: {"area": 1674.23, "dim": "30'-0\" × 55'-10\" (30.0 ft × 55.8 ft)", "width_ft": 30.0, "depth_ft": 55.8},
    27: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    28: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    29: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    30: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    31: {"area": 1000.00, "dim": "20'-0\" × 50'-0\" (20.0 ft × 50.0 ft)", "width_ft": 20.0, "depth_ft": 50.0},
    32: {"area": 1089.86, "dim": "20'-0\" × 54'-5\" (20.0 ft × 54.5 ft)", "width_ft": 20.0, "depth_ft": 54.5},
    33: {"area": 3054.39, "dim": "50'-0\" × 61'-1\" (50.0 ft × 61.1 ft)", "width_ft": 50.0, "depth_ft": 61.1},
    34: {"area": 2236.87, "dim": "40'-0\" × 55'-11\" (40.0 ft × 55.9 ft)", "width_ft": 40.0, "depth_ft": 55.9},
    35: {"area": 1750.00, "dim": "35'-0\" × 50'-0\" (35.0 ft × 50.0 ft)", "width_ft": 35.0, "depth_ft": 50.0},
    36: {"area": 1494.69, "dim": "30'-0\" × 49'-10\" (30.0 ft × 49.8 ft)", "width_ft": 30.0, "depth_ft": 49.8},
    37: {"area": 1485.43, "dim": "30'-0\" × 49'-6\" (30.0 ft × 49.5 ft)", "width_ft": 30.0, "depth_ft": 49.5},
    38: {"area": 1477.57, "dim": "30'-0\" × 49'-3\" (30.0 ft × 49.3 ft)", "width_ft": 30.0, "depth_ft": 49.3},
    39: {"area": 1465.73, "dim": "30'-0\" × 48'-10\" (30.0 ft × 48.9 ft)", "width_ft": 30.0, "depth_ft": 48.9},
    40: {"area": 1463.26, "dim": "30'-0\" × 48'-9\" (30.0 ft × 48.8 ft)", "width_ft": 30.0, "depth_ft": 48.8},
    41: {"area": 1456.15, "dim": "30'-0\" × 48'-6\" (30.0 ft × 48.5 ft)", "width_ft": 30.0, "depth_ft": 48.5},
    42: {"area": 1449.05, "dim": "30'-0\" × 48'-4\" (30.0 ft × 48.3 ft)", "width_ft": 30.0, "depth_ft": 48.3},
    43: {"area": 1441.95, "dim": "30'-0\" × 48'-1\" (30.0 ft × 48.1 ft)", "width_ft": 30.0, "depth_ft": 48.1},
    44: {"area": 1196.63, "dim": "25'-0\" × 47'-10\" (25.0 ft × 47.9 ft)", "width_ft": 25.0, "depth_ft": 47.9},
    45: {"area": 1191.57, "dim": "25'-0\" × 47'-8\" (25.0 ft × 47.7 ft)", "width_ft": 25.0, "depth_ft": 47.7},
    46: {"area": 1186.41, "dim": "25'-0\" × 47'-5\" (25.0 ft × 47.5 ft)", "width_ft": 25.0, "depth_ft": 47.5},
    47: {"area": 1181.13, "dim": "25'-0\" × 47'-3\" (25.0 ft × 47.2 ft)", "width_ft": 25.0, "depth_ft": 47.2},
    48: {"area": 1175.97, "dim": "25'-0\" × 47'-0\" (25.0 ft × 47.0 ft)", "width_ft": 25.0, "depth_ft": 47.0},
    49: {"area": 1177.90, "dim": "25'-0\" × 47'-1\" (25.0 ft × 47.1 ft)", "width_ft": 25.0, "depth_ft": 47.1},
    50: {"area": 1187.81, "dim": "25'-0\" × 47'-6\" (25.0 ft × 47.5 ft)", "width_ft": 25.0, "depth_ft": 47.5},
    51: {"area": 1197.71, "dim": "25'-0\" × 47'-11\" (25.0 ft × 47.9 ft)", "width_ft": 25.0, "depth_ft": 47.9},
    52: {"area": 1207.61, "dim": "25'-0\" × 48'-4\" (25.0 ft × 48.3 ft)", "width_ft": 25.0, "depth_ft": 48.3},
    53: {"area": 1217.52, "dim": "25'-0\" × 48'-8\" (25.0 ft × 48.7 ft)", "width_ft": 25.0, "depth_ft": 48.7},
    54: {"area": 981.78, "dim": "20'-0\" × 49'-1\" (20.0 ft × 49.1 ft)", "width_ft": 20.0, "depth_ft": 49.1},
    55: {"area": 988.14, "dim": "20'-0\" × 49'-5\" (20.0 ft × 49.4 ft)", "width_ft": 20.0, "depth_ft": 49.4},
    56: {"area": 994.38, "dim": "20'-0\" × 49'-9\" (20.0 ft × 49.7 ft)", "width_ft": 20.0, "depth_ft": 49.7},
    57: {"area": 995.67, "dim": "20'-0\" × 49'-10\" (20.0 ft × 49.8 ft)", "width_ft": 20.0, "depth_ft": 49.8},
    58: {"area": 969.51, "dim": "20'-0\" × 48'-6\" (20.0 ft × 48.5 ft)", "width_ft": 20.0, "depth_ft": 48.5},
    59: {"area": 939.16, "dim": "20'-0\" × 47'-0\" (20.0 ft × 47.0 ft)", "width_ft": 20.0, "depth_ft": 47.0},
    60: {"area": 908.80, "dim": "20'-0\" × 45'-5\" (20.0 ft × 45.4 ft)", "width_ft": 20.0, "depth_ft": 45.4},
    61: {"area": 1406.64, "dim": "25'-0\" × 56'-3\" (25.0 ft × 56.3 ft)", "width_ft": 25.0, "depth_ft": 56.3},
    62: {"area": 1746.57, "dim": "30'-0\" × 58'-3\" (30.0 ft × 58.2 ft)", "width_ft": 30.0, "depth_ft": 58.2},
    63: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    64: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    65: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    66: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    67: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    68: {"area": 1384.04, "dim": "25'-0\" × 55'-4\" (25.0 ft × 55.4 ft)", "width_ft": 25.0, "depth_ft": 55.4},
    69: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    70: {"area": 1590.00, "dim": "30'-0\" × 53'-0\" (30.0 ft × 53.0 ft)", "width_ft": 30.0, "depth_ft": 53.0},
    71: {"area": 1466.70, "dim": "30'-0\" × 48'-11\" (30.0 ft × 48.9 ft)", "width_ft": 30.0, "depth_ft": 48.9},
    72: {"area": 1325.00, "dim": "25'-0\" × 53'-0\" (25.0 ft × 53.0 ft)", "width_ft": 25.0, "depth_ft": 53.0},
    73: {"area": 1325.00, "dim": "25'-0\" × 53'-0\" (25.0 ft × 53.0 ft)", "width_ft": 25.0, "depth_ft": 53.0},
    74: {"area": 1325.00, "dim": "25'-0\" × 53'-0\" (25.0 ft × 53.0 ft)", "width_ft": 25.0, "depth_ft": 53.0},
    75: {"area": 1325.00, "dim": "25'-0\" × 53'-0\" (25.0 ft × 53.0 ft)", "width_ft": 25.0, "depth_ft": 53.0},
    76: {"area": 1325.00, "dim": "25'-0\" × 53'-0\" (25.0 ft × 53.0 ft)", "width_ft": 25.0, "depth_ft": 53.0},
    77: {"area": 1677.89, "dim": "30'-0\" × 55'-11\" (30.0 ft × 55.9 ft)", "width_ft": 30.0, "depth_ft": 55.9},
    78: {"area": 1886.82, "dim": "30'-0\" × 62'-11\" (30.0 ft × 62.9 ft)", "width_ft": 30.0, "depth_ft": 62.9},
    79: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    80: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    81: {"area": 1871.97, "dim": "30'-0\" × 62'-5\" (30.0 ft × 62.4 ft)", "width_ft": 30.0, "depth_ft": 62.4},
    82: {"area": 1367.67, "dim": "25'-0\" × 54'-8\" (25.0 ft × 54.7 ft)", "width_ft": 25.0, "depth_ft": 54.7},
    83: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    84: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    85: {"area": 1368.53, "dim": "25'-0\" × 54'-9\" (25.0 ft × 54.7 ft)", "width_ft": 25.0, "depth_ft": 54.7},
    86: {"area": 1476.28, "dim": "30'-0\" × 49'-3\" (30.0 ft × 49.2 ft)", "width_ft": 30.0, "depth_ft": 49.2},
    87: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    88: {"area": 1500.00, "dim": "30'-0\" × 50'-0\" (30.0 ft × 50.0 ft)", "width_ft": 30.0, "depth_ft": 50.0},
    89: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    90: {"area": 1310.95, "dim": "25'-0\" × 52'-5\" (25.0 ft × 52.4 ft)", "width_ft": 25.0, "depth_ft": 52.4},
    91: {"area": 1617.72, "dim": "30'-0\" × 53'-11\" (30.0 ft × 53.9 ft)", "width_ft": 30.0, "depth_ft": 53.9},
    92: {"area": 1250.00, "dim": "25'-0\" × 50'-0\" (25.0 ft × 50.0 ft)", "width_ft": 25.0, "depth_ft": 50.0},
    93: {"area": 2106.30, "dim": "40'-0\" × 52'-8\" (40.0 ft × 52.7 ft)", "width_ft": 40.0, "depth_ft": 52.7},
    94: {"area": 2009.32, "dim": "40'-0\" × 50'-3\" (40.0 ft × 50.2 ft)", "width_ft": 40.0, "depth_ft": 50.2},
    95: {"area": 3491.52, "dim": "50'-0\" × 69'-10\" (50.0 ft × 69.8 ft)", "width_ft": 50.0, "depth_ft": 69.8},
    96: {"area": 3310.04, "dim": "50'-0\" × 66'-2\" (50.0 ft × 66.2 ft)", "width_ft": 50.0, "depth_ft": 66.2}
}

plot_areas = {}
plot_dim_badges = {}

for num in range(1, 97):
    item = CAD_LAYOUT_DETAILS[num]
    plot_areas[num] = item["area"]
    plot_dim_badges[num] = item["dim"]

with open('public/js/plotData.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

def update_js_const(content, name, val_obj):
    pattern = re.compile(rf'const\s+{name}\s*=\s*\{{.*?\}};', re.DOTALL)
    new_code = f"const {name} = {json.dumps(val_obj, indent=2)};"
    if pattern.search(content):
        return pattern.sub(lambda m: new_code, content)
    return content + "\n\n" + new_code

js_content = update_js_const(js_content, 'PLOT_AREAS', plot_areas)
js_content = update_js_const(js_content, 'PLOT_DIM_BADGES', plot_dim_badges)

with open('public/js/plotData.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print("Successfully locked 100% exact CAD feet-inches dimension strings and areas in plotData.js!")
