#!/usr/bin/env python3
"""Verifica la selezione del testo e la creazione delle evidenziazioni (PDF + EPUB)."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8770"
SHOT = "/tmp/opencode"


def open_book(page, fragment):
    for c in page.query_selector_all(".book-card"):
        if fragment.lower() in c.query_selector(".book-card__title").text_content().lower():
            c.click()
            return True
    return False


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium-browser",
                                args=["--no-sandbox", "--disable-gpu"])
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: print("  [pageerror]", e))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)

    # ───────────── PDF: selezione col mouse
    assert open_book(page, "dispensa"), "PDF non trovato"
    page.wait_for_timeout(2500)
    page.click('.tool[data-tool="highlight"]')
    page.wait_for_timeout(200)

    spans = page.query_selector_all("#page-text span")
    print("righe nel layer di testo:", len(spans))
    first = spans[1].bounding_box()
    second = spans[2].bounding_box()
    page.mouse.move(first["x"] + 2, first["y"] + first["height"] / 2)
    page.mouse.down()
    page.mouse.move(second["x"] + 120, second["y"] + second["height"] / 2, steps=12)
    page.mouse.up()
    page.wait_for_timeout(1500)

    info = page.evaluate("""() => {
      const list = Reader.state.annotations.filter(a => a.type === 'highlight');
      const last = list[list.length - 1];
      const overlay = document.querySelectorAll('#page-anno .anno-highlight');
      return {
        count: list.length,
        lastRects: last ? last.rects : null,
        lastText: last ? last.text.slice(0, 60) : null,
        overlayRects: Array.from(overlay).map(n => ({w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height)})),
      };
    }""")
    print("evidenziazione PDF:", info)
    page.screenshot(path=f"{SHOT}/s1-pdf-highlight.png")

    # ───────────── EPUB: selezione
    page.click("#btn-reader-close")
    page.wait_for_timeout(700)
    assert open_book(page, "Manuale"), "EPUB non trovato"
    page.wait_for_timeout(2500)
    page.click('.tool[data-tool="highlight"]')
    page.wait_for_timeout(200)

    frame = page.frame_locator("#reflow")
    para = frame.locator("#book-content p").first
    para.evaluate("""el => {
      const r = document.createRange();
      const node = el.firstChild;
      r.setStart(node, 0);
      r.setEnd(node, 160);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      el.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
    }""")
    page.wait_for_timeout(1600)

    epub = page.evaluate("""() => {
      const d = document.querySelector('#reflow').contentDocument;
      const marks = d.querySelectorAll('#mybooks-overlay .mb-highlight');
      const list = Reader.state.annotations.filter(a => a.type === 'highlight');
      const last = list[list.length - 1];
      return {
        overlayCount: marks.length,
        firstRect: marks[0] ? marks[0].getBoundingClientRect().toJSON() : null,
        anchorOffset: last ? last.anchor.offset : null,
        quote: last ? last.anchor.quote.slice(0, 40) : null,
      };
    }""")
    print("evidenziazione EPUB:", epub)
    page.screenshot(path=f"{SHOT}/s2-epub-highlight.png")
    browser.close()
