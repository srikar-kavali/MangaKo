import time


def full_scroll(driver, step=800, delay=0.2, settle=1.5):
    """Scroll the full page to trigger lazy-loaded images."""
    scroll_height = driver.execute_script("return document.body.scrollHeight")
    current = 0
    while current < scroll_height:
        driver.execute_script(f"window.scrollTo(0, {current});")
        time.sleep(delay)
        current += step
        scroll_height = driver.execute_script("return document.body.scrollHeight")
    time.sleep(settle)