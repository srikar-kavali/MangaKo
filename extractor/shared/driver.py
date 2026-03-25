import undetected_chromedriver as uc

CHROME_VERSION = 146  # update to match your Chrome version


def make_driver(headless=True):
    options = uc.ChromeOptions()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    if headless:
        options.add_argument("--headless=new")
    return uc.Chrome(options=options, version_main=CHROME_VERSION)


def is_blocked(driver):
    title = driver.title.lower()
    blocked_signals = [
        "403", "access denied", "forbidden",
        "just a moment", "rate limit", "too many requests"
    ]
    return any(s in title for s in blocked_signals)