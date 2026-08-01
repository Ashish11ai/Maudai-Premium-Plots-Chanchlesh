import json
import re

# Update data/plot_details.json
with open('data/plot_details.json', 'r') as f:
    details = json.load(f)

# Set exact CAD dimensions for Plots 1, 2, 3
details['plots']['1'] = {
    'number': 1,
    'area': 3364.83,
    'width_ft': 30.1,
    'depth_ft': 111.8,
    'dimensions_str': "30.1 ft × 111.8 ft",
    'facing_road': "Maudai Main Road (30 FT)"
}

details['plots']['2'] = {
    'number': 2,
    'area': 3330.27,
    'width_ft': 30.0,
    'depth_ft': 111.0,
    'dimensions_str': "30.0 ft × 111.0 ft",
    'facing_road': "Maudai Main Road (30 FT)"
}

details['plots']['3'] = {
    'number': 3,
    'area': 3930.91,
    'width_ft': 30.0,
    'depth_ft': 131.0,
    'dimensions_str': "30.0 ft × 131.0 ft",
    'facing_road': "Maudai Main Road (30 FT)"
}

with open('data/plot_details.json', 'w') as f:
    json.dump(details, f, indent=2)

print("Updated data/plot_details.json for Plots 1, 2, 3 with exact 30 FT CAD width!")

# Update public/js/plotData.js
with open('public/js/plotData.js', 'r') as f:
    content = f.read()

# Update PLOT_POSITIONS for 1, 2, 3 so width is 2.1 units (30 ft) and depth matches 110-130 ft
# In local 3D scale: 1 unit ~ 14.3 ft. 30 ft = ~2.1 units. 111 ft = ~7.75 units.
content = re.sub(
    r'1:\s*\{[^}]+\}',
    '1: { x: -12.1, z: -30.5226, w: 2.1, h: 7.8, height: 1.4, rot: 0.0 }',
    content
)

content = re.sub(
    r'2:\s*\{[^}]+\}',
    '2: { x: -12.5689, z: -29.0689, w: 2.1, h: 7.7, height: 1.4, rot: 0.0 }',
    content
)

content = re.sub(
    r'3:\s*\{[^}]+\}',
    '3: { x: -12.9608, z: -27.8539, w: 2.1, h: 9.1, height: 1.4, rot: 0.0 }',
    content
)

with open('public/js/plotData.js', 'w') as f:
    f.write(content)

print("Updated public/js/plotData.js for Plots 1, 2, 3 with exact 30 FT width!")
