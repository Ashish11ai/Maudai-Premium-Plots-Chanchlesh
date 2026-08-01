"""
Deep CAD Vector Extraction: Trace exact polygon boundaries for ALL 96 plots
from the PDF vector drawing data. This extracts the actual line segments that
form each plot's boundary polygon, not estimated rectangles.
"""
import fitz
import json
import math
from collections import defaultdict

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (W_pdf / H_pdf)  # ~70.72
H_3d = 100.0

# ============================================================
# STEP 1: Extract ALL plot number label positions from PDF text
# ============================================================
text_page = page.get_text('dict')
plot_labels = {}
for b in text_page['blocks']:
    if 'lines' not in b:
        continue
    for l in b['lines']:
        for s in l['spans']:
            txt = s['text'].strip()
            if not txt.isdigit():
                continue
            num = int(txt)
            if 1 <= num <= 96:
                bbox = s['bbox']
                cx = (bbox[0] + bbox[2]) / 2
                cy = (bbox[1] + bbox[3]) / 2
                # Filter labels inside the actual site boundary (not table/legend)
                if cx > 160 and cy > 100:
                    if num not in plot_labels or s['size'] > plot_labels[num].get('size', 0):
                        plot_labels[num] = {'cx': cx, 'cy': cy, 'size': s['size']}

print(f"Found {len(plot_labels)} plot labels in PDF")

# ============================================================
# STEP 2: Extract ALL vector line segments from PDF drawings
# ============================================================
drawings = page.get_drawings()
all_lines = []
for d in drawings:
    color = d.get('color', (0, 0, 0))
    width = d.get('width', 0)
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            length = math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2)
            if length > 8:  # Skip tiny decoration lines
                all_lines.append({
                    'x1': p1.x, 'y1': p1.y,
                    'x2': p2.x, 'y2': p2.y,
                    'length': length,
                    'color': color,
                    'width': width
                })

print(f"Found {len(all_lines)} significant vector line segments")

# ============================================================
# STEP 3: For each plot label, find the 4 nearest boundary lines
# that form an enclosing polygon around the label center
# ============================================================

def pdf_to_3d(px, py):
    x3d = (px / W_pdf - 0.5) * W_3d
    z3d = (py / H_pdf - 0.5) * H_3d
    return (x3d, z3d)

def line_to_label_dist(line, lcx, lcy):
    """Distance from label center to the midpoint of a line segment"""
    mx = (line['x1'] + line['x2']) / 2
    my = (line['y1'] + line['y2']) / 2
    return math.sqrt((mx - lcx)**2 + (my - lcy)**2)

def point_dist(x1, y1, x2, y2):
    return math.sqrt((x2-x1)**2 + (y2-y1)**2)

def line_angle(line):
    """Angle of line segment in degrees"""
    dx = line['x2'] - line['x1']
    dy = line['y2'] - line['y1']
    return math.degrees(math.atan2(dy, dx)) % 180

def find_plot_boundary_lines(lcx, lcy, search_radius=55):
    """Find lines near a plot label that could form its boundary"""
    candidates = []
    for line in all_lines:
        dist = line_to_label_dist(line, lcx, lcy)
        if dist < search_radius:
            candidates.append((dist, line))
    candidates.sort(key=lambda x: x[0])
    return candidates[:40]  # Top 40 nearest lines

def classify_boundary_lines(candidates, lcx, lcy):
    """Classify lines as top/bottom/left/right relative to label"""
    top_lines = []
    bottom_lines = []
    left_lines = []
    right_lines = []
    
    for dist, line in candidates:
        angle = line_angle(line)
        mx = (line['x1'] + line['x2']) / 2
        my = (line['y1'] + line['y2']) / 2
        
        is_horizontal = (angle < 25 or angle > 155)
        is_vertical = (65 < angle < 115)
        
        if is_horizontal:
            if my < lcy:
                top_lines.append((abs(my - lcy), line))
            else:
                bottom_lines.append((abs(my - lcy), line))
        elif is_vertical:
            if mx < lcx:
                left_lines.append((abs(mx - lcx), line))
            else:
                right_lines.append((abs(mx - lcx), line))
    
    top_lines.sort(key=lambda x: x[0])
    bottom_lines.sort(key=lambda x: x[0])
    left_lines.sort(key=lambda x: x[0])
    right_lines.sort(key=lambda x: x[0])
    
    return (
        top_lines[0][1] if top_lines else None,
        bottom_lines[0][1] if bottom_lines else None,
        left_lines[0][1] if left_lines else None,
        right_lines[0][1] if right_lines else None
    )

def intersect_lines(l1, l2):
    """Find intersection point of two line segments (extended infinitely)"""
    x1, y1, x2, y2 = l1['x1'], l1['y1'], l1['x2'], l1['y2']
    x3, y3, x4, y4 = l2['x1'], l2['y1'], l2['x2'], l2['y2']
    
    denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)
    if abs(denom) < 0.001:
        return None
    
    t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom
    
    ix = x1 + t*(x2-x1)
    iy = y1 + t*(y2-y1)
    return (ix, iy)

# ============================================================
# STEP 4: Build exact polygons from boundary line intersections
# ============================================================
plot_polygons = {}
plot_positions = {}
failed_plots = []

for num in range(1, 97):
    if num not in plot_labels:
        failed_plots.append(num)
        continue
    
    lbl = plot_labels[num]
    lcx, lcy = lbl['cx'], lbl['cy']
    
    candidates = find_plot_boundary_lines(lcx, lcy)
    top, bottom, left, right = classify_boundary_lines(candidates, lcx, lcy)
    
    if not all([top, bottom, left, right]):
        # Fallback: use estimated rectangle from label position
        c3d = pdf_to_3d(lcx, lcy)
        w = 2.2
        h = 2.5
        plot_polygons[num] = [
            [round(c3d[0] - w/2, 4), round(c3d[1] - h/2, 4)],
            [round(c3d[0] + w/2, 4), round(c3d[1] - h/2, 4)],
            [round(c3d[0] + w/2, 4), round(c3d[1] + h/2, 4)],
            [round(c3d[0] - w/2, 4), round(c3d[1] + h/2, 4)]
        ]
        c3d = pdf_to_3d(lcx, lcy)
        plot_positions[num] = {
            'x': round(c3d[0], 4), 'z': round(c3d[1], 4),
            'w': w, 'h': h, 'height': 1.2, 'rot': 0
        }
        failed_plots.append(num)
        continue
    
    # Compute 4 corner intersections
    tl = intersect_lines(top, left)
    tr = intersect_lines(top, right)
    bl = intersect_lines(bottom, left)
    br = intersect_lines(bottom, right)
    
    if not all([tl, tr, bl, br]):
        c3d = pdf_to_3d(lcx, lcy)
        w = 2.2
        h = 2.5
        plot_polygons[num] = [
            [round(c3d[0] - w/2, 4), round(c3d[1] - h/2, 4)],
            [round(c3d[0] + w/2, 4), round(c3d[1] - h/2, 4)],
            [round(c3d[0] + w/2, 4), round(c3d[1] + h/2, 4)],
            [round(c3d[0] - w/2, 4), round(c3d[1] + h/2, 4)]
        ]
        c3d = pdf_to_3d(lcx, lcy)
        plot_positions[num] = {
            'x': round(c3d[0], 4), 'z': round(c3d[1], 4),
            'w': w, 'h': h, 'height': 1.2, 'rot': 0
        }
        failed_plots.append(num)
        continue
    
    # Convert all 4 corners from PDF to 3D coordinates
    corners_3d = [pdf_to_3d(*tl), pdf_to_3d(*tr), pdf_to_3d(*br), pdf_to_3d(*bl)]
    polygon = [[round(c[0], 4), round(c[1], 4)] for c in corners_3d]
    
    # Compute centroid
    cx_3d = sum(c[0] for c in corners_3d) / 4
    cz_3d = sum(c[1] for c in corners_3d) / 4
    
    # Compute width and depth from corners
    w_3d = max(
        point_dist(corners_3d[0][0], corners_3d[0][1], corners_3d[1][0], corners_3d[1][1]),
        point_dist(corners_3d[3][0], corners_3d[3][1], corners_3d[2][0], corners_3d[2][1])
    )
    h_3d = max(
        point_dist(corners_3d[0][0], corners_3d[0][1], corners_3d[3][0], corners_3d[3][1]),
        point_dist(corners_3d[1][0], corners_3d[1][1], corners_3d[2][0], corners_3d[2][1])
    )
    
    # Compute rotation from top edge
    dx = corners_3d[1][0] - corners_3d[0][0]
    dy = corners_3d[1][1] - corners_3d[0][1]
    rot = math.atan2(dy, dx)
    if abs(rot) < 0.05:
        rot = 0
    
    plot_polygons[num] = polygon
    plot_positions[num] = {
        'x': round(cx_3d, 4),
        'z': round(cz_3d, 4),
        'w': round(w_3d, 4),
        'h': round(h_3d, 4),
        'height': 1.4 if num in [1,2,3,4,5,6,33,34,35,93,94,95,96] else 1.2,
        'rot': round(rot, 4)
    }

print(f"\nSuccessfully traced {len(plot_polygons) - len(failed_plots)} plots from vector lines")
print(f"Fallback rectangles for {len(failed_plots)} plots: {failed_plots}")

# Print some sample polygons
for num in [1, 7, 33, 70, 94]:
    if num in plot_polygons:
        print(f"\nPlot {num} polygon: {plot_polygons[num]}")
        print(f"Plot {num} position: {plot_positions[num]}")

# Save results to a JSON for analysis
with open('traced_polygons_raw.json', 'w') as f:
    json.dump({
        'polygons': {str(k): v for k, v in plot_polygons.items()},
        'positions': {str(k): v for k, v in plot_positions.items()},
        'failed': failed_plots
    }, f, indent=2)

print(f"\nSaved raw traced polygon data to traced_polygons_raw.json")
