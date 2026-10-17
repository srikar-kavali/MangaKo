import os
import time
import signal
import undetected_chromedriver as uc

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

CHROME_VERSION = 155


def make_driver(headless=True):
    options = uc.ChromeOptions()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")

    # --- Anti-Crash & Cloudflare Stability Flags ---
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-features=IsolateOrigins,site-per-process")
    options.add_argument("--disable-renderer-backgrounding")
    options.add_argument("--disable-backgrounding-occluded-windows")
    options.add_argument("--disable-background-timer-throttling")
    options.add_argument("--disable-ipc-flooding-protection")
    options.add_argument("--disable-client-side-phishing-detection")

    if headless:
        options.add_argument("--headless=new")

    driver = uc.Chrome(
        options=options,
        version_main=CHROME_VERSION,
        use_subprocess=True,
    )

    return driver


def _kill_process_tree(pid):
    if not pid:
        return
    if HAS_PSUTIL:
        try:
            parent = psutil.Process(pid)
            for child in parent.children(recursive=True):
                try:
                    child.kill()
                except psutil.NoSuchProcess:
                    pass
            parent.kill()
        except psutil.NoSuchProcess:
            pass
        except Exception:
            pass
    else:
        try:
            os.kill(pid, getattr(signal, "SIGKILL", signal.SIGTERM))
        except Exception:
            pass


def safe_quit(driver):
    if driver is None:
        return

    browser_pid = getattr(driver, "browser_pid", None)
    service_process = getattr(getattr(driver, "service", None), "process", None)
    service_pid = getattr(service_process, "pid", None)

    try:
        driver.quit()
    except Exception:
        pass

    time.sleep(0.5)
    _kill_process_tree(browser_pid)
    _kill_process_tree(service_pid)


def is_blocked(driver):
    try:
        title = driver.title.lower()
        source = driver.page_source.lower()
    except Exception:
        return True

    blocked_signals = [
        "access denied",
        "forbidden",
        "just a moment",
        "rate limit",
        "too many requests",
        "verify you are human",
    ]

    found_in_title = any(s in title for s in blocked_signals)
    is_403 = title.strip() in ["403", "403 forbidden", "403 error"]
    found_in_source = (
            "cf-browser-verification" in source or
            "ddos-protection" in source
    )

    return found_in_title or is_403 or found_in_source