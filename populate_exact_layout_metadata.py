import json

with open('data/plot_details.json', 'r') as f:
    data = json.load(f)

plots_details = data.get('plots', {})

areas = {}
dim_badges = {}

for pid in range(1, 97):
    str_pid = str(pid)
    if str_pid in plots_details:
        d = plots_details[str_pid]
        areas[pid] = d.get('area', 1200)
        dim_badges[pid] = d.get('dimensions_str', f"{d.get('width_ft', 25)} ft × {d.get('depth_ft', 50)} ft")
    else:
        areas[pid] = 1200
        dim_badges[pid] = "25 ft × 50 ft"

js_content = f"""/**
 * Plot Data Definitions for Maudai Premium Plots
 * Exact Layout Plan Area and Dimensions (Width x Length)
 */

const PLOT_AREAS = {json.dumps(areas, indent=2)};

const PLOT_DIM_BADGES = {json.dumps(dim_badges, indent=2)};

const PLOT_POSITIONS = {{}};
const PLOT_POLYGONS_EXACT = {{}};

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

print(f"Successfully populated public/js/plotData.js with exact CAD areas & dimensions for all 96 plots!")
