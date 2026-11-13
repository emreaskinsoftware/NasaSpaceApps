# Builds contact sheets (6 slides each) from rendered slide thumbnails for visual QA.
import sys, glob, os
from PIL import Image
deck = sys.argv[1]
src = sorted(glob.glob(f'deliverables/presentation/thumbnails/{deck}/slide-*.png'))
out = f'deliverables/presentation/thumbnails/{deck}'
W, H, cols = 800, 450, 2
for k in range(0, len(src), 6):
    part = src[k:k+6]
    rows = (len(part) + 1) // 2
    sheet = Image.new('RGB', (W * cols + 10 * (cols + 1), H * rows + 10 * (rows + 1)), (90, 90, 90))
    for i, f in enumerate(part):
        im = Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS)
        sheet.paste(im, (10 + (i % cols) * (W + 10), 10 + (i // cols) * (H + 10)))
    sheet.save(os.path.join(out, f'_sheet-{k // 6 + 1}.png'))
print(len(src), 'slides')
