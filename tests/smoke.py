#!/usr/bin/env python3
"""Smoke test end-to-end di MyBooks con Playwright (usa il Chromium di sistema)."""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8770"
SHOTS = Path("/tmp/opencode")
CHROME = "/usr/bin/chromium-browser"

errors: list[str] = []


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROME,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: (errors.append(f"console.{m.type}: {m.text}"), print("  [console]", m.type, m.text)) if m.type == "error" else None)
        page.on("pageerror", lambda e: (errors.append(f"pageerror: {e}"), print("  [pageerror]", e)))

        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(900)
        page.screenshot(path=str(SHOTS / "t1-libreria.png"))

        # apri il primo libro PDF
        cards = page.query_selector_all(".book-card")
        print(f"libri in libreria: {len(cards)}")
        if not cards:
            print("ERRORE: nessun libro in libreria")
            return 1

        def find_card(fragment: str):
            for card in page.query_selector_all(".book-card"):
                title = card.query_selector(".book-card__title")
                if title and fragment.lower() in title.text_content().lower():
                    return card
            return None

        pdf_card = find_card("dispensa")
        (pdf_card or cards[0]).click()
        page.wait_for_timeout(2500)
        page.screenshot(path=str(SHOTS / "t2-reader-pdf.png"))

        info = page.evaluate("() => ({title: document.querySelector('#reader-book-title').textContent, loc: document.querySelector('#reader-location').textContent, spans: document.querySelectorAll('#page-text span').length, w: document.querySelector('#page').style.width})")
        print("lettore:", info)

        # seleziona del testo e evidenzia
        page.click('.tool[data-tool="highlight"]')
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOTS / "t3-tool-highlight.png"))

        # disegna con la penna
        page.click('.tool[data-tool="pen"]')
        page.wait_for_timeout(200)
        box = page.query_selector("#page").bounding_box()
        page.mouse.move(box["x"] + 120, box["y"] + 200)
        page.mouse.down()
        for i in range(14):
            page.mouse.move(box["x"] + 120 + i * 12, box["y"] + 200 + (i % 5) * 7)
        page.mouse.up()
        page.wait_for_timeout(900)
        page.screenshot(path=str(SHOTS / "t4-penna.png"))

        # post-it
        page.click('.tool[data-tool="postit"]')
        page.wait_for_timeout(200)
        page.mouse.click(box["x"] + 400, box["y"] + 300)
        page.wait_for_timeout(500)
        if page.query_selector("#modal-root:not([hidden])"):
            page.fill(".modal textarea", "Attenzione: questo punto è decisivo per l\'esame")
            page.click(".modal__foot .btn--primary")
            page.wait_for_timeout(900)
        page.screenshot(path=str(SHOTS / "t5-postit.png"))

        # pannello note
        page.click("#btn-notes-panel")
        page.wait_for_timeout(600)
        page.screenshot(path=str(SHOTS / "t6-pannello.png"))

        # apri l'EPUB
        page.click("#btn-reader-close")
        page.wait_for_timeout(700)
        epub_card = find_card("Manuale")
        if epub_card:
            epub_card.click()
            page.wait_for_timeout(3000)
            page.screenshot(path=str(SHOTS / "t7-epub.png"))
            epub_info = page.evaluate("() => { const d = document.querySelector('#reflow').contentDocument; return {hidden: document.querySelector('#reflow').hidden, text: d ? d.body.innerText.slice(0, 90) : null, cols: d ? getComputedStyle(d.getElementById('book-content')).columnWidth : null}; }")
            print("epub:", epub_info)

        # vista note + statistiche
        page.click("#btn-reader-close")
        page.wait_for_timeout(600)
        page.click('.nav-item[data-view="notes"]')
        page.wait_for_timeout(600)
        page.screenshot(path=str(SHOTS / "t8-note.png"))
        page.click('.nav-item[data-view="stats"]')
        page.wait_for_timeout(900)
        page.screenshot(path=str(SHOTS / "t9-stats.png"))

        browser.close()

    if errors:
        print("\nERRORI JS:")
        for err in dict.fromkeys(errors):
            print(" -", err)
        return 2
    print("\nNessun errore JS.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
