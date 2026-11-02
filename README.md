# MangaKo

A cross-platform manga and manhwa discovery and reading application built with **Expo / React Native**, **Expo Router**, serverless APIs, and cloud-backed library sync.

**Live site:** https://manga-ko.vercel.app

## Features

- Browse and search manga/manhwa through MangaDex, MangaPill, and curated Asura / Mgeko sources
- Read chapters in a full-screen, mobile-friendly reader
- Save titles to My List, record reading status, and resume from the last chapter
- Continue Reading carousel with new-chapter indicators
- Sign up / sign in using Amazon Cognito; sync the library between devices using Supabase
- Browse as a guest without an account
- Install as an iPhone Home Screen web app (PWA)

> Availability of external catalog metadata, covers, and chapters depends on the upstream providers. MangaKo does not host the third-party manga artwork.

## Architecture

```text
iPhone PWA / Web / Expo app
           |
    Expo Router UI
      /          \
  Cognito       Source adapters
  sessions       |       |
      |      MangaDex  MangaPill / Asura / Mgeko
      |                  |
 Library sync       Vercel APIs / image proxy
      |
 Supabase (user library)
```

| Layer | Technology |
| --- | --- |
| Client | React Native, Expo, Expo Router |
| Authentication | AWS Cognito via Amplify |
| API | Vercel serverless functions (JavaScript and Python) |
| Cloud library | Supabase |
| Local persistence | AsyncStorage |
| Extractor | Python scripts, separate from the client |

## Run locally

Requires a supported Node.js version, npm, and the Expo toolchain.

```bash
npm ci
cp .env.example .env
npm run web
```

To start the Expo dev server for mobile:

```bash
npx expo start --clear
```

Configure the public API variables according to `.env.example`. Values prefixed `EXPO_PUBLIC_` are included in client bundles and **must never contain secrets**. Keep Supabase service-role keys and other private API credentials in server-side environments only.

The current account-sync client targets the stable production endpoint `https://manga-ko.vercel.app/api/library-sync` on native devices. The production web app uses its own origin.

## Repository structure

- `app/` — Home, My List, details, chapter reader, login, and settings screens
- `manga_api/` — adapters for external manga sources
- `services/` — catalog, account sync, and supporting client logic
- `auth/` — Cognito configuration and authentication helpers
- `api/` — serverless API endpoints, including the image proxy and library sync
- `scrapers/` and `extractor/` — Python extraction and ingestion workflows
- `assets/` and `public/` — app branding and PWA assets

## Quick release smoke test

1. Open the production URL in a private browser session. Confirm Home is visible without logging in; search and open a series.
2. Sign into an existing account. Confirm My List and Continue Reading show the saved library.
3. Open a title, read a chapter, return Home, and confirm the last-read chapter and cover display correctly.
4. Search a known title across available sources. Confirm a failed source shows a retry warning rather than a misleading empty result.
5. Sign into the same account on iPhone and desktop. Sync and compare favorite titles, statuses, and chapter progress.
6. Install the PWA from Safari's **Add to Home Screen** and verify the icon, top/bottom safe areas, and reader scrolling.
7. Test unavailable content, empty results, slow network, and image errors. Check browser console and Vercel function logs.

**A successful Git commit is not a substitute for a successful Vercel deployment or device test.** Confirm the exact commit is marked **Ready** before testing production.

## Demo walkthrough (60–90 seconds)

1. **Discover** — open Home and filter or search for a manga/manhwa title.
2. **Details** — show cover, synopsis, chapter selection, and source.
3. **Read** — open a chapter, scroll the reader, and navigate back.
4. **Continue Reading** — demonstrate the restored chapter position.
5. **My List** — update a title's status and show progress.
6. **Cross-device sync** — sign in on a second device, sync, and show the matching library.
7. **PWA** — launch MangaKo from the iPhone Home Screen.

Use self-created demo content or visuals you have rights to redistribute when publishing screenshots or videos.

## Security and legal notes

- Local `.env` files are ignored and must not be committed.
- Rotate any secrets that were previously present in Git history.
- Keep image-proxy host validation and server-side API authentication enabled.
- Respect content providers' rights, licensing, and terms of service.

## Project status

Active development. Core discovery, reader, guest browsing, account library, and synchronization features are implemented. Production reliability, device-level testing, and upstream-source availability must be verified before describing the project as production-ready.
