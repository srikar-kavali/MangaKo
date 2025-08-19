from scrapers.weebcentral_scraper import WeebCentralScraper, DEBUG
DEBUG = True

s = WeebCentralScraper()
print(s.search("https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece"))
print(s.search("01J76XY7E9FNDZ1DBBM6PBJPFK"))
print(s.search("One Piece")[:5])
