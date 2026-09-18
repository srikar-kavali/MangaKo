import os
import time
import undetected_chromedriver as uc

CHROME_VERSION = 153

def make_driver(headless=True):
    options = uc.ChromeOptions()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")

    if headless:
        options.add_argument("--headless=new")

    driver = uc.Chrome(
        options=options,
        version_main=CHROME_VERSION,
        use_subprocess=True,
    )

    return driver


def is_blocked(driver):
    title = driver.title.lower()
    source = driver.page_source.lower()

    blocked_signals = [
        "access denied",
        "forbidden",
        "just a moment",
        "rate limit",
        "too many requests",
        "verify you are human",
    ]

    found_in_title = any(s in title for s in blocked_signals)
    # Check for HTTP 403 specifically — not just the number 403 in a title
    is_403 = title.strip() in ["403", "403 forbidden", "403 error"]
    found_in_source = (
            "cf-browser-verification" in source or
            "ddos-protection" in source
    )

    return found_in_title or is_403 or found_in_source