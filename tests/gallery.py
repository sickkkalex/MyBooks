#!/usr/bin/env python3
"""Cattura tutte le viste di MyBooks per una revisione visiva."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8770"
SHOT = "/tmp/opencode/gallery"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium-browser",
                                    args=["--no-sandbox", "--disable-gpu"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{SHOT}/01-libreria.png")

        # vista a elenco
        page.click('#view-toggle .icon-btn[data-layout="list"]')
        page.wait_for_timeout(600)
        page.screenshot(path=f"{SHOT}/02-libreria-lista.png")
        page.click('#view-toggle .icon-btn[data-layout="grid"]')
        page.wait_for_timeout(400)

        # dettaglio libro
        page.click(".book-card")
        page.wait_for_timeout(2200)
        page.screenshot(path=f"{SHOT}/03-lettore.png")
        page.click("#btn-reader-close")
        page.wait_for_timeout(700)

        # note
        page.click('.nav-item[data-view="notes"]')
        page.wait_for_timeout(700)
        page.screenshot(path=f"{SHOT}/04-note.png")

        # schede
        page.click('.nav-item[data-view="flashcards"]')
        page.wait_for_timeout(700)
        page.screenshot(path=f"{SHOT}/05-schede.png")

        # statistiche
        page.click('.nav-item[data-view="stats"]')
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SHOT}/06-statistiche.png")

        # ricerca
        page.click('.nav-item[data-view="search"]')
        page.wait_for_timeout(500)
        page.fill("#global-search", "ricerca")
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{SHOT}/07-ricerca.png")

        # tema scuro
        page.evaluate("() => Store.saveSettings({ theme: 'dark' })")
        page.wait_for_timeout(600)
        page.click('.nav-item[data-view="library"]')
        page.wait_for_timeout(700)
        page.screenshot(path=f"{SHOT}/08-scuro.png")
        page.evaluate("() => Store.saveSettings({ theme: 'light' })")

        browser.close()
        if errors:
            print("ERRORI:")
            for e in dict.fromkeys(errors):
                print(" -", e)
        else:
            print("nessun errore JS")


if __name__ == "__main__":
    main()
