import unittest

import httpx

from scrapers.mangapill_scraper import InvalidPageURL, MangapillScraper, manga_page_url


class MangaPillOriginTests(unittest.TestCase):
    def test_supports_provider_urls(self):
        self.assertEqual(manga_page_url('/manga/2/one-piece'), 'https://mangapill.com/manga/2/one-piece')
        self.assertEqual(manga_page_url('https://www.mangapill.com/chapters/2-10003000/one-piece-chapter-3'),
                         'https://www.mangapill.com/chapters/2-10003000/one-piece-chapter-3')

    def test_rejects_unapproved_hosts_and_non_https(self):
        for url in ('https://other.example.com', 'http://mangapill.com', '//other.example.com'):
            with self.subTest(url=url), self.assertRaises(InvalidPageURL):
                manga_page_url(url)

    def test_redirects_are_revalidated_before_fetch(self):
        def respond(request):
            self.assertEqual(request.url.host, 'mangapill.com')
            if request.url.path == '/new':
                return httpx.Response(200, text='<h1>Chapter</h1>')
            target = '/new' if request.url.path == '/approved' else 'https://other.example.com/other'
            return httpx.Response(302, headers={'location': target})

        scraper = MangapillScraper()
        scraper.client.close()
        with httpx.Client(transport=httpx.MockTransport(respond)) as scraper.client:
            self.assertEqual(scraper._soup('/approved').h1.text, 'Chapter')
            with self.assertRaises(InvalidPageURL):
                scraper._soup('/unapproved')
