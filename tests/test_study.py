#!/usr/bin/env python3
"""Test delle funzioni di studio: ricerca, creazione scheda da evidenziazione, revisione."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8770"
SHOT = "/tmp/opencode"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium-browser",
                                    args=["--no-sandbox", "--disable-gpu"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1200)

        # ── ricerca full-text nel contenuto del PDF
        page.click('.nav-item[data-view="search"]')
        page.wait_for_timeout(400)
        page.fill("#global-search", "metodo")
        page.wait_for_timeout(1500)
        passages = page.evaluate("() => document.querySelectorAll('#search-results .result').length")
        print("risultati ricerca:", passages)
        page.screenshot(path=f"{SHOT}/st1-ricerca.png")

        # ── crea una scheda da un evidenziazione
        page.click('.nav-item[data-view="library"]')
        page.wait_for_timeout(500)
        for c in page.query_selector_all(".book-card"):
            if "dispensa" in c.query_selector(".book-card__title").text_content():
                c.click()
                break
        page.wait_for_timeout(2200)
        page.click('.tool[data-tool="highlight"]')
        page.wait_for_timeout(200)
        spans = page.query_selector_all("#page-text span")
        first, second = spans[1].bounding_box(), spans[2].bounding_box()
        page.mouse.move(first["x"] + 2, first["y"] + first["height"] / 2)
        page.mouse.down()
        page.mouse.move(second["x"] + 150, second["y"] + second["height"] / 2, steps=10)
        page.mouse.up()
        page.wait_for_timeout(1200)

        page.click("#btn-notes-panel")
        page.wait_for_timeout(400)
        page.click('.panel__tab[data-panel="marks"]')
        page.wait_for_timeout(600)
        page.screenshot(path=f"{SHOT}/st2-evidenziazioni.png")

        # clic su "→ scheda"
        page.click('.panel__tab[data-panel="marks"]')
        page.wait_for_timeout(400)
        card_button = page.query_selector('.panel-card__meta button:has-text("scheda")')
        if card_button:
            card_button.click()
        else:
            print("  (nessun pulsante 'scheda' trovato)")
        page.wait_for_timeout(700)
        if page.query_selector("#modal-root:not([hidden])"):
            page.fill(".modal input.input", "Che cosa significa studiare con metodo?")
            page.click(".modal__foot .btn--primary")
            page.wait_for_timeout(500)
            page.fill(".modal textarea.textarea", "Leggere, annotare e sintetizzare.")
            page.click(".modal__foot .btn--primary")
            page.wait_for_timeout(900)
        cards = page.evaluate("() => Reader.state.cards.length")
        print("schede nel libro:", cards)

        # ── sessione di revisione
        page.click("#btn-reader-close")
        page.wait_for_timeout(600)
        page.click('.nav-item[data-view="flashcards"]')
        page.wait_for_timeout(700)
        page.click("#btn-review")
        page.wait_for_timeout(700)
        print("carte caricate:", page.evaluate("() => Flashcards.cards.length"),
              "| overlay:", page.evaluate("() => !!document.querySelector('.review')"))
        page.screenshot(path=f"{SHOT}/st3-revisione.png")
        page.click(".review__actions .btn--primary")
        page.wait_for_timeout(400)
        quality = page.query_selector_all(".quality-btn")
        print("pulsanti qualità:", len(quality))
        if quality:
            quality[2].click()
            page.wait_for_timeout(1000)
        page.screenshot(path=f"{SHOT}/st4-revisione-risposta.png")
        page.keyboard.press("Escape")
        page.evaluate("() => document.querySelector('.review')?.remove()")

        browser.close()
        if errors:
            print("ERRORI:")
            for e in dict.fromkeys(errors):
                print(" -", e)
        else:
            print("nessun errore JS")


if __name__ == "__main__":
    main()
