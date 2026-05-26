import qrcode
from qrcode.constants import ERROR_CORRECT_H
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask

# PLACEHOLDER URL — replace with the real Vercel URL once deployed,
# then re-run this script to regenerate the QR codes.
BASE = "https://gallant-renters.vercel.app/"

def make(url, out_path):
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,   # 30% damage tolerance; survives bad print
        box_size=20,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        color_mask=SolidFillColorMask(
            back_color=(255, 255, 255),
            front_color=(17, 17, 17),  # near-black for max contrast
        ),
    )
    img.save(out_path)
    print(f"Wrote {out_path}  →  {url}")

make(f"{BASE}?utm_source=flyer&utm_medium=print&utm_campaign=renters_en", "/sessions/serene-fervent-cori/mnt/outputs/sf-renters-funnel/flyers/qr-en.png")
make(f"{BASE}?utm_source=flyer&utm_medium=print&utm_campaign=renters_es", "/sessions/serene-fervent-cori/mnt/outputs/sf-renters-funnel/flyers/qr-es.png")
