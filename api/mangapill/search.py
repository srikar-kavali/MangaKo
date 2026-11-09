# api/mangapill/search.py
# Vercel Python serverless function — uses http.server BaseHTTPRequestHandler format
from __future__ import annotations
import sys
import os
import json
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))
from scrapers.mangapill_scraper import MangapillScraper
from scrapers.mgeko_search import search_mgeko

scraper = MangapillScraper()

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        q = params.get('q', [''])[0]
        provider = params.get('provider', ['mangapill'])[0].lower()
        try:
            limit = max(1, min(50, int(params.get('limit', [20])[0])))
            page = max(1, min(50, int(params.get('page', [1])[0])))
        except (ValueError, TypeError):
            limit, page = 20, 1

        try:
            results = search_mgeko(q, limit, page) if provider == 'mgeko' else scraper.search(q, limit)
            body = json.dumps(results).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            body = json.dumps({'error': str(e)}).encode()
            self.send_response(502 if provider == 'mgeko' else 500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()