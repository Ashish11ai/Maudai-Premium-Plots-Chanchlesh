"""
Extract plot positions from PDF and create transparent plan overlay.
"""
import fitz
import json
import os
from PIL import Image

# Ensure output directories exist
os.makedirs("public/assets", exist_ok=True)
os.makedirs("public/css", exist_ok=True)
os.makedirs("public/js", exist_ok=True)
os.makedirs("data", exist_ok=True)

# Open PDF
doc = fitz.open("FINAL PLAN MAUDAI 2026.pdf")
page = doc[0]
page_w = page.rect.width   # 1191
page_h = page.rect.height  # 1684

print(f"PDF page size: {page_w} x {page_h} points")

# --- Step 1: Extract all number text positions ---
text_dict = page.get_text("dict")
all_numbers = []

for block in text_dict["blocks"]:
    if "lines" not in block:
        continue
    for line in block["lines"]:
        for span in line["spans"]:
            text = span["text"].strip()
            try:
                num = int(text)
                if 1 <= num <= 96:
                    bbox = span["bbox"]
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    size = span["size"]
                    all_numbers.append({
                        "num": num,
                        "x": round(cx, 1),
                        "y": round(cy, 1),
                        "size": round(size, 2),
                        "font": span.get("font", ""),
                        "bbox": [round(v, 1) for v in bbox]
                    })
            except ValueError:
                pass

# Group by number
from collections import defaultdict
grouped = defaultdict(list)
for item in all_numbers:
    grouped[item["num"]].append(item)

# For each plot number, select the position that is in the drawing area (x > 180)
# and has a reasonable font size (plot labels vs dimension numbers)
plot_positions = {}
for num in range(1, 97):
    candidates = grouped.get(num, [])
    # Filter candidates in the drawing area
    drawing_candidates = [c for c in candidates if c["x"] > 180]
    if not drawing_candidates:
        drawing_candidates = candidates
    
    if drawing_candidates:
        # Pick the one with the largest font size (likely the plot label)
        best = max(drawing_candidates, key=lambda c: c["size"])
        plot_positions[num] = best

print(f"\nFound positions for {len(plot_positions)} out of 96 plots")
print("\n=== Plot Positions (PDF coordinates) ===")
for i in range(1, 97):
    if i in plot_positions:
        p = plot_positions[i]
        print(f"  Plot {i:2d}: x={p['x']:7.1f}, y={p['y']:7.1f}  size={p['size']:.1f}  font={p['font']}")
    else:
        print(f"  Plot {i:2d}: NOT FOUND")

# --- Step 2: Normalize positions to 0-100 coordinate system ---
# Find the bounding box of all plot positions
xs = [p["x"] for p in plot_positions.values()]
ys = [p["y"] for p in plot_positions.values()]
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

# Add padding
pad = 20
min_x -= pad
max_x += pad
min_y -= pad
max_y += pad

print(f"\nBounding box: ({min_x:.1f}, {min_y:.1f}) to ({max_x:.1f}, {max_y:.1f})")
print(f"Range: {max_x - min_x:.1f} x {max_y - min_y:.1f}")

# Normalize to percentage coordinates
normalized = {}
for num, p in plot_positions.items():
    nx = (p["x"] - min_x) / (max_x - min_x) * 100
    ny = (p["y"] - min_y) / (max_y - min_y) * 100
    normalized[str(num)] = {
        "x": round(nx, 2),
        "y": round(ny, 2),
        "pdf_x": p["x"],
        "pdf_y": p["y"]
    }

# Save normalized positions
with open("data/plot_positions.json", "w") as f:
    json.dump({
        "positions": normalized,
        "pdf_bbox": {
            "min_x": round(min_x, 1),
            "min_y": round(min_y, 1),
            "max_x": round(max_x, 1),
            "max_y": round(max_y, 1)
        }
    }, f, indent=2)
print(f"\nSaved plot positions to data/plot_positions.json")

# --- Step 3: Create transparent plan image ---
# Render the plan at 150 DPI for good quality without being too large
dpi = 150
pix = page.get_pixmap(dpi=dpi)
img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
img = img.convert("RGBA")

# Make white/near-white pixels transparent
data = list(img.getdata())
new_data = []
for item in data:
    r, g, b, a = item
    if r > 235 and g > 235 and b > 235:
        new_data.append((255, 255, 255, 0))
    else:
        # Make non-white pixels slightly more opaque blue for visibility
        new_data.append((r, g, b, 220))
new_data_tuples = new_data
img.putdata(new_data_tuples)
img.save("public/assets/plan_transparent.png")
print(f"Saved transparent plan image: {pix.width}x{pix.height}")

# Also save as full opaque for admin reference
pix2 = page.get_pixmap(dpi=100)
img2 = Image.frombytes("RGB", [pix2.width, pix2.height], pix2.samples)
img2.save("public/assets/plan_full.png")
print(f"Saved full plan image: {pix2.width}x{pix2.height}")

# Copy gmap.jpg to public/assets if not already there
import shutil
if os.path.exists("gmap.jpg") and not os.path.exists("public/assets/gmap.jpg"):
    shutil.copy("gmap.jpg", "public/assets/gmap.jpg")
    print("Copied gmap.jpg to public/assets/")

doc.close()
print("\n✅ Setup complete!")
