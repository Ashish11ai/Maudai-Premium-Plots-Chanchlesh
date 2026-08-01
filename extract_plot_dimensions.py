import fitz
import json
import math

doc = fitz.open('FINAL PLAN MAUDAI 2026.pdf')
page = doc[0]

with open('data/plot_boxes.json') as f:
    plot_boxes = json.load(f)

with open('data/plots.json') as f:
    plots = json.load(f)

# Calculate dimensions in feet based on CAD scale (1 PDF point ~ 1.25 feet)
# PDF scale: Page 1191x1684 pt maps to site ~1488 x 2105 feet
# Let's compute exact W x D in feet for each plot: area / typical ratio or CAD vector feet
plot_details = {}

for id_str, box in plot_boxes.items():
    num = int(id_str)
    area_sqft = plots.get(id_str, {}).get('area', 1250)
    
    # Calculate dimensions in feet (pdf_w and pdf_h in PDF points)
    # 1 pt ~ 1.25 ft
    w_ft = round(box['pdf_w'] * 0.72, 1)
    d_ft = round(box['pdf_h'] * 0.72, 1)
    
    # Refine width and depth so w_ft * d_ft is consistent with actual plot area
    if w_ft > 0 and d_ft > 0:
        scale_factor = math.sqrt(area_sqft / (w_ft * d_ft))
        dim_w = round(w_ft * scale_factor, 1)
        dim_d = round(d_ft * scale_factor, 1)
    else:
        dim_w = 25.0
        dim_d = round(area_sqft / 25.0, 1)
    
    plot_details[id_str] = {
        'number': num,
        'area': area_sqft,
        'width_ft': dim_w,
        'depth_ft': dim_d,
        'dimensions_str': f"{dim_w} ft × {dim_d} ft",
        'facing_road': "30 Feet Road" if num in [1,2,3,4,5,6,33,34,35,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96] else "20 Feet Road"
    }

# Road specifications list
road_specs = [
    { 'name': "Chhindwara Outer Ring Road", 'width': "45.00 Meters (147.6 Feet)", 'type': "Main Regional Highway", 'length': "Frontage" },
    { 'name': "Maudai Main Access Road", 'width': "30 Feet (9.14 Meters)", 'type': "Primary Site Entrance Road", 'length': "560+ Feet (170.5 Meters)" },
    { 'name': "Central Avenue Road", 'width': "30 Feet (9.14 Meters)", 'type': "Main Internal Spine Road", 'length': "405+ Feet (123.5 Meters)" },
    { 'name': "Internal Sector Access Roads", 'width': "20 Feet (6.10 Meters)", 'type': "Secondary Residential Access Roads", 'length': "300+ Feet (91.2 Meters)" }
]

output_data = {
    'plots': plot_details,
    'roads': road_specs
}

with open('data/plot_details.json', 'w') as f:
    json.dump(output_data, f, indent=2)

print("Extracted plot dimensions and road specifications to data/plot_details.json!")
