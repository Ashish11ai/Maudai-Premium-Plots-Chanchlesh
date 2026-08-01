"""
Deep CAD extraction v2: Use closed drawing PATHS (rect items) from the PDF
to find plot boundary rectangles, then match them to plot labels.
"""
import fitz
import json
import math

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

W_pdf = 1191.0
H_pdf = 1684.0
W_3d = 100.0 * (W_pdf / H_pdf)
H_3d = 100.0

# Get all drawing paths
drawings = page.get_drawings()

# Collect all closed rectangles from the drawing
rects = []
for d in drawings:
    items = d['items']
    rect = d.get('rect')
    if rect:
        w = rect.width
        h = rect.height
        # Plot rectangles are between 15-200 PDF points on each side
        if 15 < w < 200 and 15 < h < 200:
            area = w * h
            if area > 300:  # Min plot area in PDF points squared
                rects.append({
                    'x0': rect.x0, 'y0': rect.y0,
                    'x1': rect.x1, 'y1': rect.y1,
                    'cx': (rect.x0 + rect.x1) / 2,
                    'cy': (rect.y0 + rect.y1) / 2,
                    'w': w, 'h': h, 'area': area
                })

print(f"Found {len(rects)} candidate plot rectangles")

# Also look for 're' (rectangle) items in drawings
for d in drawings:
    for item in d['items']:
        if item[0] == 're':  # rectangle item
            r = item[1]  # fitz.Rect
            w = r.width
            h = r.height
            if 15 < w < 200 and 15 < h < 200 and w * h > 300:
                rects.append({
                    'x0': r.x0, 'y0': r.y0,
                    'x1': r.x1, 'y1': r.y1,
                    'cx': (r.x0 + r.x1) / 2,
                    'cy': (r.y0 + r.y1) / 2,
                    'w': w, 'h': h, 'area': w * h
                })

print(f"Total candidate rectangles (with 're' items): {len(rects)}")

# Extract plot labels
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
                if cx > 160 and cy > 100:
                    if num not in plot_labels or s['size'] > plot_labels[num].get('size', 0):
                        plot_labels[num] = {'cx': cx, 'cy': cy, 'size': s['size']}

print(f"Found {len(plot_labels)} plot labels")

# Now let's also try extracting paths with multiple line segments forming closed polygons
closed_polys = []
for d in drawings:
    items = d['items']
    if len(items) < 3:
        continue
    
    points = []
    for item in items:
        if item[0] == 'l':  # line
            points.append((item[1].x, item[1].y))
            points.append((item[2].x, item[2].y))
        elif item[0] == 'm':  # moveTo
            points.append((item[1].x, item[1].y))
    
    if len(points) < 4:
        continue
    
    # Remove duplicate consecutive points
    unique_pts = [points[0]]
    for p in points[1:]:
        if abs(p[0] - unique_pts[-1][0]) > 0.5 or abs(p[1] - unique_pts[-1][1]) > 0.5:
            unique_pts.append(p)
    
    # Check if path is closed (first point near last point)
    if len(unique_pts) >= 4:
        d_close = math.sqrt((unique_pts[0][0]-unique_pts[-1][0])**2 + (unique_pts[0][1]-unique_pts[-1][1])**2)
        if d_close < 5:  # Closed path
            # Compute bounding box
            xs = [p[0] for p in unique_pts]
            ys = [p[1] for p in unique_pts]
            w = max(xs) - min(xs)
            h = max(ys) - min(ys)
            if 15 < w < 200 and 15 < h < 200 and w * h > 300:
                cx = sum(xs) / len(xs)
                cy = sum(ys) / len(ys)
                closed_polys.append({
                    'points': unique_pts,
                    'cx': cx, 'cy': cy,
                    'w': w, 'h': h,
                    'npts': len(unique_pts)
                })

print(f"Found {len(closed_polys)} closed polygon paths")

# Print some samples
for p in closed_polys[:10]:
    print(f"  Closed poly: center=({p['cx']:.1f}, {p['cy']:.1f}) size=({p['w']:.1f}x{p['h']:.1f}) npts={p['npts']}")

# Print some rect samples
for r in rects[:10]:
    print(f"  Rect: center=({r['cx']:.1f}, {r['cy']:.1f}) size=({r['w']:.1f}x{r['h']:.1f})")

# Try to match labels to rectangles
matched = {}
for num, lbl in plot_labels.items():
    best_dist = 999
    best_rect = None
    for r in rects:
        dist = math.sqrt((r['cx'] - lbl['cx'])**2 + (r['cy'] - lbl['cy'])**2)
        if dist < best_dist:
            best_dist = dist
            best_rect = r
    if best_rect and best_dist < 30:
        matched[num] = {'rect': best_rect, 'dist': best_dist}

print(f"\nMatched {len(matched)} plots to rectangles")
for num in sorted(matched.keys())[:10]:
    r = matched[num]['rect']
    d = matched[num]['dist']
    print(f"  Plot {num}: rect center=({r['cx']:.1f}, {r['cy']:.1f}) size=({r['w']:.1f}x{r['h']:.1f}) dist={d:.1f}")

# Also match labels to closed polygons
matched_poly = {}
for num, lbl in plot_labels.items():
    best_dist = 999
    best_poly = None
    for p in closed_polys:
        dist = math.sqrt((p['cx'] - lbl['cx'])**2 + (p['cy'] - lbl['cy'])**2)
        if dist < best_dist:
            best_dist = dist
            best_poly = p
    if best_poly and best_dist < 30:
        matched_poly[num] = {'poly': best_poly, 'dist': best_dist}

print(f"\nMatched {len(matched_poly)} plots to closed polygons")
for num in sorted(matched_poly.keys())[:10]:
    p = matched_poly[num]['poly']
    d = matched_poly[num]['dist']
    print(f"  Plot {num}: poly center=({p['cx']:.1f}, {p['cy']:.1f}) size=({p['w']:.1f}x{p['h']:.1f}) npts={p['npts']} dist={d:.1f}")

# Save all analysis
with open('cad_deep_analysis.json', 'w') as f:
    json.dump({
        'n_rects': len(rects),
        'n_closed_polys': len(closed_polys),
        'n_matched_rects': len(matched),
        'n_matched_polys': len(matched_poly),
    }, f, indent=2)

print("\nAnalysis complete!")
