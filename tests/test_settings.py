#!/usr/bin/env python3
"""Test delle impostazioni: tema chiaro/scuro, accento, tipografia, copertine."""
import json
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8770"
SHOT = "/tmp/opencode"


def put_settings(values: dict) -> None:
    request = urllib.request.Request(
        f"{BASE}/api/settings",
        data=json.dumps(values).encode(),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    urllib.request.urlopen(request).read()


def main() -> None:
    put_settings({"theme": "light", "pageTheme": "paper", "fontSize": 100,
                  "fontFamily": "serif", "leading": "normal"})
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium-browser",
                                    args=["--no-sandbox", "--disable-gpu"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: (errors.append(str(e)), print("[pageerror]", e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1200)

        # ── tema: pulsante rapido nella barra
        print("tema iniziale:", page.evaluate("() => document.documentElement.dataset.theme"))
        page.click("#btn-theme")
        page.wait_for_timeout(700)
        print("dopo toggle:", page.evaluate("() => document.documentElement.dataset.theme"))
        page.screenshot(path=f"{SHOT}/s-scuro.png")
        page.click("#btn-theme")
        page.wait_for_timeout(700)
        print("dopo toggle 2:", page.evaluate("() => document.documentElement.dataset.theme"))

        # ── tema: pannello impostazioni (applicazione immediata)
        page.click("#btn-settings")
        page.wait_for_timeout(500)
        page.click(".settings-group .theme-switch button:nth-child(2)")
        page.wait_for_timeout(600)
        print("impostazioni -> tema:", page.evaluate("() => document.documentElement.dataset.theme"))
        page.click(".modal__foot .btn--ghost")
        page.wait_for_timeout(400)
        print("dopo Chiudi:", page.evaluate("() => document.documentElement.dataset.theme"))
        page.click("#btn-theme")
        page.wait_for_timeout(600)

        # ── accento
        page.click("#btn-settings")
        page.wait_for_timeout(500)
        page.click(".settings-group .note-colors .note-color:nth-child(3)")
        page.wait_for_timeout(600)
        print("accanto applicato:", page.evaluate(
            "() => getComputedStyle(document.documentElement).getPropertyValue('--bordeaux').trim()"
        ))
        page.click(".modal__foot .btn--ghost")
        await_sleep = page.wait_for_timeout(400)

        # ── tipografia EPUB
        for c in page.query_selector_all(".book-card"):
            if "Manuale" in c.query_selector(".book-card__title").text_content():
                c.click()
                break
        page.wait_for_timeout(2500)
        read = lambda: page.evaluate(
            """() => { const d = document.querySelector('#reflow').contentDocument;
                 return { fs: getComputedStyle(d.body).fontSize,
                          fam: getComputedStyle(d.body).fontFamily.split(',')[0].replace(/"/g,''),
                          bg: getComputedStyle(d.body).backgroundColor }; }"""
        )
        print("EPUB base:", read())
        page.click("#btn-typography")
        page.wait_for_timeout(300)
        page.click('[data-font="sans"]')
        page.wait_for_timeout(1200)
        page.click('[data-typo="font-larger"]')
        page.wait_for_timeout(1200)
        page.click('[data-page-theme="sepia"]')
        page.wait_for_timeout(1200)
        print("EPUB dopo:", read())
        page.screenshot(path=f"{SHOT}/s-epub-typo.png")
        page.click("#btn-reader-close")
        page.wait_for_timeout(700)

        # ── copertine
        covers = page.evaluate(
            """async () => { const out = [];
               for (const b of Store.state.books) {
                 const r = await fetch(API.coverUrl(b.id));
                 const blob = await r.blob();
                 out.push({ titolo: b.title, byte: blob.size });
               } return out; }"""
        )
        print("copertine:", covers)

        browser.close()
        print("errori JS:", len(errors))


if __name__ == "__main__":
    main()
