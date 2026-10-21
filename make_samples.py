#!/usr/bin/env python3
"""Genera documenti di prova (PDF + EPUB) per il collaudo di MyBooks."""
from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "samples"
OUT.mkdir(exist_ok=True)

LOREM = (
    "LUniversita e la ricerca richiedono metodo: leggere con attenzione, "
    "annotare le idee centrali, trasformare le evidenze in sintesi personali. "
    "Questo documento di prova contiene testo sufficiente per verificare "
    "l'evidenziazione, la sottolineatura e la selezione delle frasi. "
)


def make_pdf(path: Path) -> None:
    import pymupdf

    doc = pymupdf.open()
    for index in range(6):
        page = doc.new_page(width=595, height=842)
        page.insert_text((60, 90), f"Capitolo {index + 1} — Diritto amministrativo",
                         fontsize=19, fontname="helv")
        y = 140
        for _ in range(18):
            page.insert_text((60, y), LOREM[:96], fontsize=11, fontname="helv")
            y += 18
        page.insert_text((60, 780), f"pagina {index + 1}", fontsize=9, fontname="helv")
    doc.set_toc([[1, "Introduzione", 1], [1, "Principi generali", 3], [2, "Il procedimento", 4]])
    doc.save(str(path))
    doc.close()


def _cover_image(path: Path) -> bytes:
    """Genera una copertina di prova (gradiente bordeaux con il titolo)."""
    from PIL import Image, ImageDraw, ImageFont

    width, height = 600, 900
    image = Image.new("RGB", (width, height), "#6E1E2E")
    draw = ImageDraw.Draw(image)
    for y in range(height):
        ratio = y / height
        draw.line([(0, y), (width, y)], fill=(
            int(0x6E + (0x38 - 0x6E) * ratio),
            int(0x1E + (0x0D - 0x1E) * ratio),
            int(0x2E + (0x18 - 0x2E) * ratio),
        ))
    draw.rectangle([54, 54, width - 54, height - 54], outline="#E8D9C2", width=3)
    font = None
    for candidate in (
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/liberation-serif-fonts/LiberationSerif-Regular.ttf",
    ):
        if Path(candidate).exists():
            font = ImageFont.truetype(candidate, 44)
            break
    if font:
        draw.text((90, 380), "Manuale di", font=font, fill="#FBF3E7")
        draw.text((90, 440), "diritto pubblico", font=font, fill="#FBF3E7")
        small = ImageFont.truetype(font.path, 24)
        draw.text((90, 545), "Alessandro Rossi", font=small, fill="#E0CBB4")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    payload = buffer.getvalue()
    path.write_bytes(payload)
    return payload


def make_epub(path: Path) -> None:
    chapters = [
        ("Il corpo giuridico",
         "<h1>Il corpo giuridico</h1><p>" + LOREM * 22 + "</p><p>" + LOREM * 16 + "</p>"),
        ("Le fonti del diritto",
         "<h1>Le fonti del diritto</h1><p>" + LOREM * 18 + "</p><blockquote>La legge è la voce "
         "del popolo.</blockquote><p>" + LOREM * 14 + "</p>"),
        ("Conclusioni",
         "<h1>Conclusioni</h1><p>" + LOREM * 12 + "</p>"),
    ]
    container = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""
    items = []
    for index, (title, body) in enumerate(chapters, start=1):
        items.append(
            f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>{title}</title></head>
<body>{body}</body></html>"""
        )
    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">mybooks-test-001</dc:identifier>
    <dc:title>Manuale di diritto pubblico</dc:title>
    <dc:creator>Alessandro Rossi</dc:creator>
    <dc:language>it</dc:language>
    <dc:description>Dispensa di prova per il collaudo di MyBooks.</dc:description>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    {"".join(f'<item id="c{i}" href="chapter{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(1, len(chapters) + 1))}
    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover-page" linear="no"/>
    {"".join(f'<itemref idref="c{i}"/>' for i in range(1, len(chapters) + 1))}
  </spine>
</package>"""
    cover_page = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Copertina</title></head>
<body><div><img src="images/cover.jpg" alt="Copertina"/></div></body></html>"""
    nav = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Indice</title></head>
<body><nav epub:type="toc"><ol>
<li><a href="chapter1.xhtml">Il corpo giuridico</a></li>
<li><a href="chapter2.xhtml">Le fonti del diritto</a></li>
<li><a href="chapter3.xhtml">Conclusioni</a></li>
</ol></nav></body></html>"""
    toc = """<?xml version="1.0" encoding="utf-8"?>
<nav xmlns="epub="http://www.idpf.org/2007/ops" epub:type="toc"><ol>
<li><a href="chapter1.xhtml">Il corpo giuridico</a></li>
<li><a href="chapter2.xhtml">Le fonti del diritto</a></li>
<li><a href="chapter3.xhtml">Conclusioni</a></li>
</ol></nav>"""

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("mimetype", "application/epub+zip")
        archive.writestr("META-INF/container.xml", container)
        archive.writestr("OEBPS/content.opf", opf)
        archive.writestr("OEBPS/nav.xhtml", nav)
        archive.writestr("OEBPS/toc.ncx", toc)
        archive.writestr("OEBPS/cover.xhtml", cover_page)
        archive.writestr("OEBPS/images/cover.jpg", _cover_image(OUT / "cover.jpg"))
        for index, content in enumerate(items, start=1):
            archive.writestr(f"OEBPS/chapter{index}.xhtml", content)


if __name__ == "__main__":
    make_pdf(OUT / "dispensa-diritto.pdf")
    make_epub(OUT / "manuale-diritto.epub")
    (OUT / "appunti.txt").write_text(
        "Appunti lezione 1\n\n" + LOREM * 8, encoding="utf-8"
    )
    print(f"Documenti di prova creati in {OUT}")
