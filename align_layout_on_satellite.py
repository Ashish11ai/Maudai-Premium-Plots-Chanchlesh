import json

# Update data/settings.json with default overlay offset & scale matching satellite map
settings = {
  "overlay": {
    "x": -13.5,
    "z": -8.5,
    "y": -8.5,
    "scale": 1.15,
    "rotation": 6.5,
    "opacity": 0.75
  }
}

with open('data/settings.json', 'w') as f:
    json.dump(settings, f, indent=2)

print("Saved default satellite alignment transform to data/settings.json!")
