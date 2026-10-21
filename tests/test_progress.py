#!/usr/bin/env python3
"""Verifica il salvataggio della progressione di lettura."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8770"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium-browser",
                                args=["--no-sandbox", "--disable-gpu"])
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: print("[pageerror]", e))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)

    for c in page.query_selector_all(".book-card"):
        if "dispensa" in c.query_selector(".book-card__title").text_content():
            c.click()
            break
    page.wait_for_timeout(2200)

    for _ in range(2):
        page.click("#btn-next")
        page.wait_for_timeout(900)
    print("posizione:", page.evaluate("() => document.querySelector('#reader-location').textContent"))
    page.click("#btn-reader-close")
    page.wait_for_timeout(1200)

    progress = page.evaluate("() => Store.bookById(1).progress")
    print("progresso salvato:", progress)
    badge = page.evaluate("() => document.querySelector('#badge-reading').textContent")
    print("badge 'in lettura':", badge)
    browser.close()
