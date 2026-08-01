import json
import re

# Load plot_details.json
with open('data/plot_details.json', 'r') as f:
    details = json.load(f)

plot_badges_exact = {}

for pid_str, pinfo in details['plots'].items():
    pid = int(pid_str)
    w_ft = pinfo.get('width_ft', 25.0)
    d_ft = pinfo.get('depth_ft', 40.0)
    
    # Specific CAD dimension strings
    w_int = int(round(w_ft))
    d_int = int(round(d_ft))
    
    plot_badges_exact[pid_str] = f"{w_int}x{d_int}"

print(f"Generated exact CAD badges for {len(plot_badges_exact)} plots!")
print("Sample badges:")
print("Plot 46:", plot_badges_exact.get("46"))
print("Plot 69:", plot_badges_exact.get("69"))
print("Plot 70:", plot_badges_exact.get("70"))
print("Plot 78:", plot_badges_exact.get("78"))
print("Plot 81:", plot_badges_exact.get("81"))

# Update public/js/plotData.js
with open('public/js/plotData.js', 'r') as f:
    js_content = f.read()

badge_js = "const PLOT_DIM_BADGES = " + json.dumps(plot_badges_exact, indent=2) + ";\n\n"

if 'const PLOT_DIM_BADGES' in js_content:
    js_content = re.sub(r'const PLOT_DIM_BADGES = \{[\s\S]*?\};\n\n', badge_js, js_content)
else:
    js_content = badge_js + js_content

with open('public/js/plotData.js', 'w') as f:
    f.write(js_content)

print("Saved exact CAD plot badges to public/js/plotData.js!")
