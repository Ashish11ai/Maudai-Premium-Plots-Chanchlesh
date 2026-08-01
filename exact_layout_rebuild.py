"""
EXACT LAYOUT REBUILD from plan_page1.png
========================================
Carefully studied every plot shape, position, road, and boundary from the image.
Using PDF text extraction for precise label positions + exact CAD dimensions.

Key observations from the image:
- Plots 1-3: Long narrow plots tilted along top boundary (Maudai Main Road / Ring Road)
- Plots 4-6: Tilted plots below Ring Road intersection  
- Plot 7: Narrow vertical plot on right side of Sector Road 1
- Plot 8: Wider plot next to 7
- Plots 9-11: Small plots in row below 7,8
- Plot 12: Large plot spanning left side of Sector Road 2
- Plots 13-14: Right side of Sector Road 2
- Plots 15-21: Two columns between Sector Roads 2 and 3 (left: 36-41, right: 15-21)
- Plots 22-26: Two columns between Sector Roads 3 and 4
- Plots 27-32: Two columns between Sector Roads 4 and 5
- Plots 33-35: Tilted plots at top-left corner
- Plots 36-43: Left column (west of Central Avenue)
- Plots 44-61: Left column continued (west, smaller plots)
- Plots 62-77: Right column (east of Central Avenue, between Central Ave and 20ft road)
- Plots 78-96: Far east sector beyond 20ft road

The layout is:
- West column: 36,37,38,39,40,41,42,43 then 44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61
- Central Avenue runs N-S between west and east columns
- East column: 68,69 then 67,66,65,64,63,62 and 70,71,72,73,74,75,76,77
- Far east: 78-96 in various arrangements
"""

import fitz
import json
import math

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (W_pdf / H_pdf)  # 70.72
H_3d = 100.0

FT_TO_3D = H_3d / H_pdf  # 0.059382

def pdf_to_3d(px, py):
    x = (px / W_pdf - 0.5) * W_3d
    z = (py / H_pdf - 0.5) * H_3d
    return (round(x, 4), round(z, 4))

# Extract plot labels from PDF
text_page = page.get_text('dict')
plot_labels = {}
for b in text_page['blocks']:
    if 'lines' not in b:
        continue
    for l in b['lines']:
        for s in l['spans']:
            txt = s['text'].strip()
            if txt.isdigit():
                num = int(txt)
                if 1 <= num <= 96:
                    bbox = s['bbox']
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    if cx > 160 and cy > 100:
                        if num not in plot_labels or s['size'] > plot_labels[num].get('size', 0):
                            plot_labels[num] = {'cx': cx, 'cy': cy, 'size': s['size']}

print(f"Found {len(plot_labels)} plot labels")

# Exact dimensions from CAD area table (width_ft, depth_ft, area_sqft)
DIMS = {
    1: (30.1, 111.8, 3364.83), 2: (30.0, 111.0, 3330.27), 3: (30.0, 131.0, 3930.91),
    4: (50.0, 60.0, 3000.00), 5: (50.0, 60.0, 3000.00), 6: (46.0, 60.0, 2763.76),
    7: (23.0, 68.0, 1561.96), 8: (42.0, 40.5, 1703.73),
    9: (25.0, 50.0, 1250.00), 10: (25.0, 50.0, 1250.00), 11: (20.0, 46.0, 921.08),
    12: (35.0, 63.0, 2202.74), 13: (26.0, 60.0, 1548.62), 14: (30.0, 60.0, 1800.00),
    15: (25.0, 50.0, 1255.51), 16: (25.0, 41.0, 1029.04), 17: (25.0, 45.0, 1134.31),
    18: (25.0, 50.0, 1239.69), 19: (30.0, 50.0, 1500.00), 20: (25.0, 52.0, 1298.46),
    21: (36.0, 52.0, 1895.33),
    22: (30.0, 50.0, 1500.00), 23: (30.0, 50.0, 1500.00), 24: (25.0, 50.0, 1250.00),
    25: (25.0, 43.0, 1074.68), 26: (33.0, 51.0, 1674.23),
    27: (25.0, 50.0, 1250.00), 28: (30.0, 50.0, 1500.00), 29: (30.0, 50.0, 1500.00),
    30: (25.0, 50.0, 1250.00), 31: (25.0, 40.0, 1000.00), 32: (25.0, 44.0, 1089.85),
    33: (50.0, 61.0, 3054.39), 34: (40.0, 56.0, 2236.87), 35: (35.0, 50.0, 1750.00),
    36: (30.0, 50.0, 1494.69), 37: (30.0, 50.0, 1485.43), 38: (30.0, 49.0, 1477.57),
    39: (30.0, 49.0, 1465.73), 40: (30.0, 49.0, 1463.25), 41: (30.0, 48.5, 1456.15),
    42: (25.0, 58.0, 1449.05), 43: (25.0, 58.0, 1441.95),
    44: (25.0, 48.0, 1196.63), 45: (25.0, 48.0, 1191.57), 46: (25.0, 47.5, 1186.41),
    47: (25.0, 47.0, 1181.13), 48: (25.0, 47.0, 1175.97),
    49: (25.0, 47.0, 1177.90), 50: (25.0, 47.5, 1187.81), 51: (25.0, 48.0, 1197.71),
    52: (25.0, 48.5, 1207.61), 53: (25.0, 49.0, 1217.52),
    54: (25.0, 39.0, 981.78), 55: (25.0, 39.5, 988.14), 56: (25.0, 40.0, 994.38),
    57: (25.0, 40.0, 995.67), 58: (25.0, 39.0, 969.51),
    59: (20.0, 47.0, 939.16), 60: (20.0, 45.5, 908.80), 61: (36.0, 39.0, 1406.64),
    62: (48.0, 36.0, 1746.57), 63: (25.0, 50.0, 1250.00), 64: (25.0, 50.0, 1250.00),
    65: (25.0, 50.0, 1250.00), 66: (25.0, 50.0, 1250.00), 67: (25.0, 50.0, 1250.00),
    68: (25.0, 55.0, 1384.04), 69: (30.0, 50.0, 1500.00),
    70: (53.0, 30.0, 1590.00), 71: (30.0, 49.0, 1466.70),
    72: (25.0, 53.0, 1325.00), 73: (25.0, 53.0, 1325.00), 74: (25.0, 53.0, 1325.00),
    75: (25.0, 53.0, 1325.00), 76: (25.0, 53.0, 1325.00), 77: (50.0, 34.0, 1677.89),
    78: (52.0, 36.0, 1886.82), 79: (30.0, 50.0, 1500.00), 80: (30.0, 50.0, 1500.00),
    81: (51.0, 37.0, 1871.97), 82: (25.0, 54.0, 1357.67),
    83: (30.0, 50.0, 1500.00), 84: (30.0, 50.0, 1500.00), 85: (25.0, 55.0, 1368.53),
    86: (30.0, 49.0, 1476.28), 87: (30.0, 50.0, 1500.00), 88: (30.0, 50.0, 1500.00),
    89: (25.0, 50.0, 1250.00), 90: (25.0, 52.5, 1310.95),
    91: (56.0, 29.0, 1617.72), 92: (25.0, 50.0, 1250.00),
    93: (43.0, 49.0, 2106.30), 94: (45.0, 43.0, 2009.32),
    95: (40.0, 87.0, 3491.52), 96: (45.0, 74.0, 3310.04),
}

# Build polygons
angle_top = math.radians(-22.5)

plot_polygons = {}
plot_positions = {}
plot_areas = {}
plot_badges = {}

for num in range(1, 97):
    if num not in plot_labels:
        print(f"WARNING: No label for plot {num}")
        continue
    
    lbl = plot_labels[num]
    cx, cz = pdf_to_3d(lbl['cx'], lbl['cy'])
    
    w_ft, d_ft, area = DIMS[num]
    w = w_ft * FT_TO_3D
    d = d_ft * FT_TO_3D
    
    # Determine rotation based on which sector
    if num in [1, 2, 3, 4, 5, 6, 33, 34, 35]:
        rot = angle_top
    else:
        rot = 0.0
    
    hw = w / 2.0
    hd = d / 2.0
    
    if abs(rot) > 0.01:
        cr = math.cos(rot)
        sr = math.sin(rot)
        # Rotated rectangle corners
        p1 = [round(cx - hw*cr + hd*sr, 4), round(cz - hw*sr - hd*cr, 4)]
        p2 = [round(cx + hw*cr + hd*sr, 4), round(cz + hw*sr - hd*cr, 4)]
        p3 = [round(cx + hw*cr - hd*sr, 4), round(cz + hw*sr + hd*cr, 4)]
        p4 = [round(cx - hw*cr - hd*sr, 4), round(cz - hw*sr + hd*cr, 4)]
    else:
        # Handle special non-rectangular plots
        if num == 94:
            # Plot 94: tapered - Top 45', Left ~43'1", Right ~28'10"
            dl = 43.08 * FT_TO_3D / 2.0
            dr = 28.83 * FT_TO_3D / 2.0
            p1 = [round(cx - hw, 4), round(cz - dl, 4)]
            p2 = [round(cx + hw, 4), round(cz - dr, 4)]
            p3 = [round(cx + hw, 4), round(cz + dr, 4)]
            p4 = [round(cx - hw, 4), round(cz + dl, 4)]
        elif num == 93:
            # Plot 93: tapered
            dl = 35 * FT_TO_3D / 2.0
            dr = 49 * FT_TO_3D / 2.0
            p1 = [round(cx - hw, 4), round(cz - dl, 4)]
            p2 = [round(cx + hw, 4), round(cz - dr, 4)]
            p3 = [round(cx + hw, 4), round(cz + dr, 4)]
            p4 = [round(cx - hw, 4), round(cz + dl, 4)]
        elif num == 95:
            # Plot 95: large irregular corner plot
            dl = 95 * FT_TO_3D / 2.0
            dr = 70 * FT_TO_3D / 2.0
            p1 = [round(cx - hw, 4), round(cz - dl, 4)]
            p2 = [round(cx + hw, 4), round(cz - dr, 4)]
            p3 = [round(cx + hw, 4), round(cz + dr, 4)]
            p4 = [round(cx - hw, 4), round(cz + dl, 4)]
        elif num == 96:
            # Plot 96: large irregular corner plot  
            dl = 80 * FT_TO_3D / 2.0
            dr = 60 * FT_TO_3D / 2.0
            p1 = [round(cx - hw, 4), round(cz - dl, 4)]
            p2 = [round(cx + hw, 4), round(cz - dr, 4)]
            p3 = [round(cx + hw, 4), round(cz + dr, 4)]
            p4 = [round(cx - hw, 4), round(cz + dl, 4)]
        else:
            # Standard axis-aligned rectangle
            p1 = [round(cx - hw, 4), round(cz - hd, 4)]
            p2 = [round(cx + hw, 4), round(cz - hd, 4)]
            p3 = [round(cx + hw, 4), round(cz + hd, 4)]
            p4 = [round(cx - hw, 4), round(cz + hd, 4)]
    
    plot_polygons[str(num)] = [p1, p2, p3, p4]
    plot_areas[str(num)] = area
    plot_badges[str(num)] = f"{int(w_ft)}x{int(d_ft)}"
    plot_positions[str(num)] = {
        'x': cx, 'z': cz,
        'w': round(w, 4), 'h': round(d, 4),
        'height': 1.4 if num in [1,2,3,4,5,6,33,34,35,93,94,95,96] else 1.2,
        'rot': round(rot, 4)
    }

# Roads - positioned based on the layout image
roads = [
    {"id": "ring_road", "name": "Chhindwara Outer Ring Road", "width_ft": 147.6,
     "x": -23.5, "z": -31.5, "w": 32.0, "d": 4.5, "h": 0.08, "rot": -0.52, "type": "ring"},
    {"id": "main_road", "name": "Maudai Main Road (30 FT)", "width_ft": 30,
     "x": -12.5, "z": -31.2, "w": 10.5, "d": round(30*FT_TO_3D, 4), "h": 0.05, "rot": 0.0, "type": "main"},
    {"id": "central_avenue", "name": "Central Avenue (30 FT)", "width_ft": 30,
     "x": -12.5, "z": -5.0, "w": round(30*FT_TO_3D, 4), "d": 52.0, "h": 0.05, "rot": 0.0, "type": "avenue"},
    {"id": "sector_road_1", "name": "Sector Road 1 (20 FT)", "width_ft": 20,
     "x": -10.5, "z": -22.5, "w": 7.0, "d": round(20*FT_TO_3D, 4), "h": 0.04, "rot": 0.0, "type": "access"},
    {"id": "sector_road_2", "name": "Sector Road 2 (20 FT)", "width_ft": 20,
     "x": -10.5, "z": -14.8, "w": 7.0, "d": round(20*FT_TO_3D, 4), "h": 0.04, "rot": 0.0, "type": "access"},
    {"id": "sector_road_3", "name": "Sector Road 3 (20 FT)", "width_ft": 20,
     "x": -10.5, "z": -2.2, "w": 7.0, "d": round(20*FT_TO_3D, 4), "h": 0.04, "rot": 0.0, "type": "access"},
    {"id": "sector_road_4", "name": "Sector Road 4 (20 FT)", "width_ft": 20,
     "x": -10.5, "z": 6.8, "w": 7.0, "d": round(20*FT_TO_3D, 4), "h": 0.04, "rot": 0.0, "type": "access"},
    {"id": "sector_road_5", "name": "Sector Road 5 (20 FT)", "width_ft": 20,
     "x": -10.5, "z": 15.65, "w": 7.0, "d": round(20*FT_TO_3D, 4), "h": 0.04, "rot": 0.0, "type": "access"},
    {"id": "east_30ft_road", "name": "East Sector 30 FT Road", "width_ft": 30,
     "x": 3.2, "z": 22.8, "w": 22.0, "d": round(30*FT_TO_3D, 4), "h": 0.05, "rot": 0.0, "type": "main"},
    {"id": "east_20ft_road", "name": "East Sector 20 FT Road", "width_ft": 20,
     "x": -0.2, "z": 17.0, "w": round(20*FT_TO_3D, 4), "d": 8.0, "h": 0.04, "rot": 0.0, "type": "access"}
]

# Write plotData.js
js = f"""/**
 * Plot Data - Maudai Premium Plots
 * Generated from CAD layout (FINAL PLAN MAUDAI 2026.pdf)
 * FT_TO_3D = {FT_TO_3D:.6f}
 */

"""
js += "const PLOT_DIM_BADGES = " + json.dumps(plot_badges, indent=2) + ";\n\n"
js += "const PLOT_AREAS = " + json.dumps(plot_areas, indent=2) + ";\n\n"
js += "const PLOT_POSITIONS = " + json.dumps(plot_positions, indent=2) + ";\n\n"
js += "const PLOT_POLYGONS_EXACT = " + json.dumps(plot_polygons, indent=2) + ";\n\n"
js += """function plotTo3D(plotNum) {
  const pos = PLOT_POSITIONS[plotNum];
  if (!pos) return null;
  return {
    x: pos.x, z: pos.z,
    width: pos.w, depth: pos.h,
    height: pos.height || 1.4,
    rotation: pos.rot || 0
  };
}

const STATUS_COLORS = {
  available: { color: 0x10b981, opacity: 0.75, emissive: 0x059669 },
  sold: { color: 0xef4444, opacity: 0.75, emissive: 0xdc2626 },
  reserved: { color: 0xf59e0b, opacity: 0.75, emissive: 0xd97706 }
};

const WHATSAPP_NUMBER = '919340153055';
const CONTACT_NAME = 'Mr. Chanchlesh Ji Sahu';
const CONTACT_PHONE = '9340153055';

const SITE_WALL_SEGMENTS = [];
"""
js += "const SITE_ROADS_EXACT = " + json.dumps(roads, indent=2) + ";\n"

with open('public/js/plotData.js', 'w') as f:
    f.write(js)

# Write data/plots.json  
plots = {}
for pid in range(1, 97):
    plots[str(pid)] = {
        "status": "available", "price": 0, "notes": "",
        "area": DIMS[pid][2]
    }
with open('data/plots.json', 'w') as f:
    json.dump(plots, f, indent=2)

print(f"\n=== EXACT LAYOUT REBUILD COMPLETE ===")
print(f"Generated {len(plot_polygons)} plots + {len(roads)} roads")
print(f"FT_TO_3D = {FT_TO_3D:.6f}")
print(f"All plots placed at exact PDF label centroids")
print(f"Tilted plots (1-6, 33-35) at -22.5°")
print(f"Tapered plots (93, 94, 95, 96) with custom polygons")
