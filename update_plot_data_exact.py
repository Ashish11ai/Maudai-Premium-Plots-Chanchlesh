import json

with open('data/plot_boxes.json') as f:
    boxes = json.load(f)

# Build PLOT_POSITIONS dictionary with exact center and size
plot_positions_str = "const PLOT_POSITIONS = {\n"
for k in sorted(boxes.keys(), key=int):
    b = boxes[k]
    plot_positions_str += f"  {k}: {{ cx: {b['pdf_cx']}, cy: {b['pdf_cy']}, w: {b['pdf_w']}, h: {b['pdf_h']} }},\n"
plot_positions_str += "};\n"

with open('public/js/plotData.js', 'r') as f:
    content = f.read()

# Replace PLOT_POSITIONS
start_idx = content.find("const PLOT_POSITIONS = {")
end_idx = content.find("};", start_idx) + 2

content = content[:start_idx] + plot_positions_str + content[end_idx:]

# Update plotTo3D to use exact w and h
plot_to_3d_func = """// Convert plot vector bounds to 3D local coordinates on the plan overlay plane
// The plan overlay plane has dimensions W = 70.72447 (width) and H = 100.0 (height)
// centered at (0,0) in local layout space.
function plotTo3D(plotNum) {
  const pos = PLOT_POSITIONS[plotNum];
  if (!pos) return null;
  
  // PDF dimensions: 1191 x 1684 pt
  const W = 100.0 * (1191.0 / 1684.0); // ~70.724
  const H = 100.0;
  
  const x = (pos.cx / 1191.0 - 0.5) * W;
  const z = (pos.cy / 1684.0 - 0.5) * H;
  const width = (pos.w / 1191.0) * W;
  const depth = (pos.h / 1684.0) * H;
  
  return {
    x: x,
    z: z,
    width: Math.max(0.4, width),
    depth: Math.max(0.4, depth)
  };
}"""

func_start = content.find("// Convert plot positions to 3D local coordinates")
if func_start == -1:
  func_start = content.find("// Convert plot vector bounds to 3D local coordinates")
if func_start == -1:
  func_start = content.find("function plotTo3D(plotNum)")

func_end = content.find("}", func_start) + 1

content = content[:func_start] + plot_to_3d_func + content[func_end:]

with open('public/js/plotData.js', 'w') as f:
    f.write(content)

print("Updated public/js/plotData.js with exact CAD plot boundaries!")
