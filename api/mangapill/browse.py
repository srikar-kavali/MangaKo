"""Recently added MangaPill catalog metadata, not chapter content."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))
from scrapers.mangapill_scraper import MangapillScraper


class handler(BaseHTTPRequestHandler):
    def _reply(self, status, result):
        body = json.dumps(result).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        try:
            limit = max(1, min(48, int(params.get("limit", ["24"])[0])))
        except (TypeError, ValueError):
            return self._reply(400, {"error": "Invalid limit"})
        try:
            scraper = MangapillScraper()
            try:
                titles = scraper.browse_new(limit)
            finally:
                scraper.client.close()
            self._reply(200, titles)
        except Exception:
            self._reply(502, {"error": "MangaPill catalog temporarily unavailable"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()
