from PIL import Image
import numpy as np

# Path to transparent plan overlay
plan_path = 'public/assets/plan_transparent.png'
img = Image.open(plan_path).convert('RGBA')

arr = np.array(img)
# Shape: (7017, 4963, 4)

# The engineer title block is in the bottom right corner:
# X from ~2000 to ~4750, Y from ~3600 to ~6850
# Erase this box (set RGBA to 0, 0, 0, 0)
arr[3500:6850, 2000:4750] = [0, 0, 0, 0]

result_img = Image.fromarray(arr, 'RGBA')
result_img.save(plan_path)
print("Successfully erased engineer title block from plan_transparent.png!")
