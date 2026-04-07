"""
generate_icons.py — generate PNG app icons from the Quorum brand mark.
Run once from the project root: python generate_icons.py
Requires Pillow: pip install Pillow
"""

from PIL import Image, ImageDraw
import os

OUT = "legal-study-app/public"

def draw_quorum_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background
    d.rectangle([0, 0, size, size], fill="#1A1714")

    # Gold top bar (~7.5% height)
    bar_h = max(4, round(size * 0.074))
    d.rectangle([0, 0, size, bar_h], fill="#C8A96E")

    # Circle (search ring) — centre at ~46%, 55.5% of size
    cx = round(size * 0.461)
    cy = round(size * 0.555)
    r  = round(size * 0.207)
    lw = max(4, round(size * 0.086))
    d.ellipse([cx - r - lw//2, cy - r - lw//2,
               cx + r + lw//2, cy + r + lw//2],
              outline="#E8E4DC", width=lw)

    # Diagonal gold line
    x1 = round(size * 0.609)
    y1 = round(size * 0.699)
    x2 = round(size * 0.785)
    y2 = round(size * 0.875)
    lw2 = max(4, round(size * 0.086))
    d.line([x1, y1, x2, y2], fill="#C8A96E", width=lw2)

    return img

sizes = [192, 512, 180]  # 180 = apple-touch-icon

for s in sizes:
    icon = draw_quorum_icon(s)
    name = f"apple-touch-icon.png" if s == 180 else f"icon-{s}.png"
    path = os.path.join(OUT, name)
    icon.save(path, "PNG")
    print(f"  ✓ {path}")

print("Done.")
