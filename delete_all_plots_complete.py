import json

# Clear data/plots.json
with open('data/plots.json', 'w') as f:
    json.dump({}, f, indent=2)

# Clear data/plot_details.json
with open('data/plot_details.json', 'w') as f:
    json.dump({'plots': {}, 'roads': []}, f, indent=2)

# Clear traced_polygons_raw.json
with open('traced_polygons_raw.json', 'w') as f:
    json.dump({'polygons': {}}, f, indent=2)

# Write empty public/js/plotData.js
js_content = """/**
 * Plot Data Definitions for Maudai Premium Plots
 * Completely Cleared - 0 Plots Rendered
 */

const PLOT_AREAS = {};

const PLOT_DIM_BADGES = {};

const PLOT_POSITIONS = {};

const PLOT_POLYGONS_EXACT = {};

function plotTo3D(plotNum) {
  return null;
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
const SITE_ROADS_EXACT = [];
"""

with open('public/js/plotData.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print("Successfully deleted all plots! Clean layout canvas ready!")
