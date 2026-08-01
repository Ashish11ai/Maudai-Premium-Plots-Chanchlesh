import json

with open('data/site_infrastructure.json') as f:
    infra = json.load(f)

plot_3d = infra.get('plot_3d', {})

plot_positions_str = "const PLOT_POSITIONS = {\n"
for k in sorted(plot_3d.keys(), key=int):
    v = plot_3d[k]
    plot_positions_str += f"  {k}: {{ x: {v['x']}, z: {v['z']}, w: {v['width']}, h: {v['depth']}, rot: {v['rotation']} }},\n"
plot_positions_str += "};\n"

with open('public/js/plotData.js', 'r') as f:
    content = f.read()

start_idx = content.find("const PLOT_POSITIONS = {")
end_idx = content.find("};", start_idx) + 2

content = content[:start_idx] + plot_positions_str + content[end_idx:]

plot_to_3d_func = """// Convert plot vector bounds to 3D local coordinates on the plan overlay plane
// The plan overlay plane has dimensions W = 70.72447 (width) and H = 100.0 (height)
// centered at (0,0) in local layout space.
function plotTo3D(plotNum) {
  const pos = PLOT_POSITIONS[plotNum];
  if (!pos) return null;
  
  return {
    x: pos.x,
    z: pos.z,
    width: pos.w,
    depth: pos.h,
    rotation: pos.rot || 0
  };
}"""

func_start = content.find("// Convert plot vector bounds to 3D local coordinates")
if func_start == -1:
  func_start = content.find("function plotTo3D(plotNum)")

func_end = content.find("}", func_start) + 1

content = content[:func_start] + plot_to_3d_func + content[func_end:]

with open('public/js/plotData.js', 'w') as f:
    f.write(content)

print("Successfully updated public/js/plotData.js with rotated 3D plot geometries!")
