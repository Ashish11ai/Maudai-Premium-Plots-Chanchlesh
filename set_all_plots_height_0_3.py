import json
import re

# 1. Update plotData.js
with open('public/js/plotData.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace any height: 1.4 or height: 1.48 in PLOT_POSITIONS with height: 0.3
content = re.sub(r'"?height"?:\s*[0-9\.]+', '"height": 0.3', content)

with open('public/js/plotData.js', 'w', encoding='utf-8') as f:
    f.write(content)

# 2. Update data/plots.json
try:
    with open('data/plots.json', 'r', encoding='utf-8') as f:
        plots_json = json.load(f)
    
    for pid, pdata in plots_json.items():
        pdata['height'] = 0.3

    with open('data/plots.json', 'w', encoding='utf-8') as f:
        json.dump(plots_json, f, indent=2)
except Exception as e:
    print("plots.json update:", e)

# 3. Update data/plot_details.json
try:
    with open('data/plot_details.json', 'r', encoding='utf-8') as f:
        details_json = json.load(f)
    
    if 'plots' in details_json:
        for pid, pdata in details_json['plots'].items():
            pdata['height'] = 0.3

    with open('data/plot_details.json', 'w', encoding='utf-8') as f:
        json.dump(details_json, f, indent=2)
except Exception as e:
    print("plot_details.json update:", e)

print("Successfully set all plots height to 0.3 to match Plot 1's exact height!")
