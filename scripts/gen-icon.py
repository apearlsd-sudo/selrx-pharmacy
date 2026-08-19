from PIL import Image, ImageDraw
import os

size = 1024
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Green circle background (emerald)
margin = 40
draw.ellipse([margin, margin, size - margin, size - margin], fill=(16, 185, 129, 255))

# Inner white circle
inner = 160
draw.ellipse([inner, inner, size - inner, size - inner], fill=(255, 255, 255, 255))

# Draw a medical cross
cx, cy = size // 2, size // 2
bar_w = 80
bar_h = 340
draw.rounded_rectangle(
    [cx - bar_w, cy - bar_h // 2, cx + bar_w, cy + bar_h // 2],
    radius=30, fill=(16, 185, 129, 255)
)
draw.rounded_rectangle(
    [cx - bar_h // 2, cy - bar_w, cx + bar_h // 2, cy + bar_w],
    radius=30, fill=(16, 185, 129, 255)
)

os.makedirs('/home/z/my-project/src-tauri/icons', exist_ok=True)
img.save('/home/z/my-project/app-icon.png')
print('Icon created successfully')
