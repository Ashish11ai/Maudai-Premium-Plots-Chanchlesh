import fitz
import json

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

text_page = page.get_text('dict')
plot_labels = {}
for b in text_page['blocks']:
    if 'lines' in b:
        for l in b['lines']:
            for s in l['spans']:
                text = s['text'].strip()
                if text.isdigit() and 1 <= int(text) <= 96:
                    num = int(text)
                    bbox = s['bbox']
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    if cx > 180:
                        if num not in plot_labels or s['size'] > plot_labels[num]['size']:
                            plot_labels[num] = {'num': num, 'cx': cx, 'cy': cy, 'bbox': bbox, 'size': s['size']}

print(f"Plot labels found: {len(plot_labels)}")

# Collect all line segments in the drawing area
lines = []
for d in page.get_drawings():
    for item in d['items']:
        if item[0] == 'l':
            p1, p2 = item[1], item[2]
            lines.append((p1.x, p1.y, p2.x, p2.y))

print(f"Total line segments: {len(lines)}")

# For each plot, compute tightest bounding rectangle from line segments containing the label
plot_boxes = {}

for num in range(1, 97):
    if num not in plot_labels:
        continue
    lbl = plot_labels[num]
    cx, cy = lbl['cx'], lbl['cy']
    
    # Filter horizontal & vertical lines that enclose cx, cy
    left_lines = [l[0] for l in lines if min(l[1], l[3]) <= cy <= max(l[1], l[3]) and l[0] <= cx and abs(l[0] - cx) < 60]
    right_lines = [l[0] for l in lines if min(l[1], l[3]) <= cy <= max(l[1], l[3]) and l[0] >= cx and abs(l[0] - cx) < 60]
    top_lines = [l[1] for l in lines if min(l[0], l[2]) <= cx <= max(l[0], l[2]) and l[1] <= cy and abs(l[1] - cy) < 60]
    bottom_lines = [l[1] for l in lines if min(l[0], l[2]) <= cx <= max(l[0], l[2]) and l[1] >= cy and abs(l[1] - cy) < 60]
    
    # Fallback to nearest line segments if exact enclosing lines have gaps
    if not left_lines:
        left_lines = [l[0] for l in lines if abs((l[1]+l[3])/2 - cy) < 25 and l[0] <= cx and abs(l[0] - cx) < 60]
    if not right_lines:
        right_lines = [l[0] for l in lines if abs((l[1]+l[3])/2 - cy) < 25 and l[0] >= cx and abs(l[0] - cx) < 60]
    if not top_lines:
        top_lines = [l[1] for l in lines if abs((l[0]+l[2])/2 - cx) < 25 and l[1] <= cy and abs(l[1] - cy) < 60]
    if not bottom_lines:
        bottom_lines = [l[1] for l in lines if abs((l[0]+l[2])/2 - cx) < 25 and l[1] >= cy and abs(l[1] - cy) < 60]
    
    min_x = max(left_lines) if left_lines else (cx - 15)
    max_x = min(right_lines) if right_lines else (cx + 15)
    min_y = max(top_lines) if top_lines else (cy - 15)
    max_y = min(bottom_lines) if bottom_lines else (cy + 15)
    
    width_pt = max_x - min_x
    height_pt = max_y - min_y
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    
    # Ensure reasonable minimum/maximum bounds to prevent overlapping
    width_pt = max(8.0, min(80.0, width_pt))
    height_pt = max(8.0, min(80.0, height_pt))
    
    plot_boxes[num] = {
        'pdf_cx': round(center_x, 2),
        'pdf_cy': round(center_y, 2),
        'pdf_w': round(width_pt, 2),
        'pdf_h': round(height_pt, 2),
        'min_x': round(min_x, 2),
        'max_x': round(max_x, 2),
        'min_y': round(min_y, 2),
        'max_y': round(max_y, 2)
    }

print(f"Successfully computed vector box geometry for {len(plot_boxes)} / 96 plots")

# Save to data/plot_boxes.json
with open('data/plot_boxes.json', 'w') as f:
    json.dump(plot_boxes, f, indent=2)

print("Saved plot_boxes.json successfully!")
