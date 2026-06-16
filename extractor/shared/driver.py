import os
import time
import undetected_chromedriver as uc

CHROME_VERSION = 149

# Path to extracted uBlock Origin chromium folder
# Download from https://github.com/gorhill/uBlock/releases
# Get uBlock0_x.x.x.chromium.zip, extract it, paste the path below
UBLOCK_PATH = r"C:\Users\srika\OneDrive\Desktop\Extractor_Test\uBlock0.chromium"


def make_driver(headless=True):
    options = uc.ChromeOptions()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")

    if not headless:
        if os.path.isdir(UBLOCK_PATH):
            options.add_argument(f"--load-extension={UBLOCK_PATH}")
            print(f"  [System] uBlock loaded")
        else:
            print(f"  ⚠ uBlock not found at {UBLOCK_PATH}")

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