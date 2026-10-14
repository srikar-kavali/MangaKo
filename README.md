# MangaKo

Cross-platform manga reader built with Expo, React Native, and Expo Router, supported by serverless APIs and Python scrapers.

## Getting started

1. Install Node.js, then run `npm ci`.
2. Copy `.env.example` to `.env` and configure both `EXPO_PUBLIC_` API URLs. These values are bundled into the client, so **never put secrets in them**.
3. Run `npm start` for Expo or `npm run web` for the browser.

Manga data and chapter images depend on external sources and separately deployed APIs. Setup and deployment instructions for the scraper services are being standardized.

## Repository guide

- `app/`: Expo Router screens and UI, plus local storage helpers (pending refactor).
- `auth/`, `context/`: authentication and shared state.
- `manga_api/`: client-side adapters for manga sources.
- `api/`: serverless endpoints, including an image proxy.
- `extractor/`: chapter data extraction and database upload tools.
- `manga-scrapers/`, `scrapers/`: other scrapers; active deployment dependencies require verification before consolidation.
- `worker/`: edge worker integration.

## Cleanup status

Work is isolated to the `cleanup` branch. Before merging, validate login, favorites, recently read chapters, image loading, source searches, and scraper/API deployments. Automated test coverage and CI are forthcoming.

## Security and licensing

Never commit secret environment variables or server-only API keys. Existing tracked chapter-data snapshots are preserved for now, pending a storage/deployment audit. Use third-party content only with appropriate rights and permissions.
