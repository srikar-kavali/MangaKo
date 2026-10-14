"""Tests for the image URL security boundary (no network calls)."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "image_proxy", Path(__file__).resolve().parents[1] / "api" / "image_proxy.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImageProxyValidationTests(unittest.TestCase):
    def test_valid_image_hosts(self):
        for host in ("imgsrv4.com", "www.mangapill.com", "uploads.mangadex.org"):
            self.assertTrue(module.validate_image_url(f"https://{host}/chapter/1.webp"))

    def test_reject_unsafe_targets(self):
        invalid = [
            "http://imgsrv4.com/a.jpg", "https://127.0.0.1/a.jpg",
            "https://localhost/a.jpg", "https://example.com/a.jpg",
            "https://imgsrv4.com.evil.test/a.jpg", "file:///etc/passwd",
            "https://user:pass@imgsrv4.com/a.jpg", "https://imgsrv4.com:8080/a.jpg",
        ]
        for url in invalid:
            with self.subTest(url=url):
                self.assertFalse(module.validate_image_url(url))

    def test_fallback_is_bounded(self):
        urls = module.fallback_urls("https://imgsrv4.com/pages/3.webp")
        self.assertEqual(len(urls), 2)
        self.assertTrue(all(module.validate_image_url(url) for url in urls))


if __name__ == "__main__":
    unittest.main()
