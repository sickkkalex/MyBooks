#!/usr/bin/env python3
"""Test della sezione Appunti: creazione dal lettore, riferimento, collegamento profondo."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8770"
SHOT = "/tmp/opencode"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium-browser",
                                    args=["--no-sandbox", "--disable-gpu"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: (errors.append(str(e)), print("[pageerror]", e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1200)

        # ── apri un PDF, seleziona un brano e crea un appunto dal lettore
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
        page.mouse.move(second["x"] + 180, second["y"] + second["height"] / 2, steps=10)
        page.mouse.up()
        page.wait_for_timeout(1200)

        sel = page.evaluate("() => Reader.state.lastSelection")
        print("selezione catturata:", (sel or {}).get("text", "")[:50] if sel else None)

        page.click("#btn-appunto")
        page.wait_for_timeout(1400)
        print("vista aperta:", page.evaluate("() => document.querySelector('#view-appunti').classList.contains('is-active')"))
        print("riferimento:", page.evaluate(
            """() => { const t = document.querySelectorAll('#appunti-editor textarea');
                 return t[1] ? t[1].value.slice(0, 80) : null; }"""
        ))
        page.screenshot(path=f"{SHOT}/a1-appunti.png")

        # compila e salva
        page.fill("#appunti-editor input >> nth=0", "Capitolo 1 — Il corpo giuridico")
        page.fill("#appunti-editor input >> nth=1", "Metodo di studio")
        page.fill("#appunti-editor input >> nth=2", "Leggere con attenzione")
        page.fill("#appunti-editor textarea >> nth=0",
                  "Tre regole: leggere attivamente, annotare le idee centrali, sintetizzare in una nota personale.")
        page.click(".appunti-editor__foot-actions .btn--primary")
        page.wait_for_timeout(1200)
        print("appunti salvati:", page.evaluate("() => Appunti.notes.length"))
        page.screenshot(path=f"{SHOT}/a2-appunti-salvato.png")

        # ── deep link: apre il libro alla pagina indicata
        page.evaluate("() => { window.location.hash = '#libro/1/3'; }")
        page.wait_for_timeout(2500)
        print("lettore da deep link:", page.evaluate(
            "() => ({ aperto: !document.querySelector('#reader').hidden, loc: document.querySelector('#reader-location').textContent })"
        ))
        page.screenshot(path=f"{SHOT}/a3-deeplink.png")

        page.click("#btn-reader-close")
        page.wait_for_timeout(600)

        # ── rilevamento del collegamento nel riferimento
        page.click('.nav-item[data-view="appunti"]')
        page.wait_for_timeout(700)
        print("pill collegamento:", page.evaluate("() => !!document.querySelector('.link-pill')"))
        page.screenshot(path=f"{SHOT}/a4-appunti-lista.png")

        browser.close()
        print("errori JS:", len(errors))


if __name__ == "__main__":
    main()
