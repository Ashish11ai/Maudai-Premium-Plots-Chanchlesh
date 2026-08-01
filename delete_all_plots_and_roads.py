import json

# Clear plotData.js definitions
js_content = """/**
 * Plot Data Definitions for Maudai Premium Plots
 * Reset State: All plots and roads cleared as requested.
 */

const PLOT_DIM_BADGES = {};
const PLOT_AREAS = {};
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

with open('public/js/plotData.js', 'w') as f:
    f.write(js_content)

# Clear data/plots.json and data/plot_details.json
with open('data/plots.json', 'w') as f:
    json.dump({}, f, indent=2)

with open('data/plot_details.json', 'w') as f:
    json.dump({"plots": {}, "roads": []}, f, indent=2)

print("Successfully deleted all plot meshes, polygon definitions, and road meshes!")
