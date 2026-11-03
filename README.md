<div align="center">

# MangaKo

**One place to discover manga and manhwa, pick up where you left off, and keep your reading list organized.**

[**🌐 Open MangaKo**](https://manga-ko.vercel.app) · [**View source**](https://github.com/srikar-kavali/MangaKo)

Built with React Native, Expo Router, Vercel, Amazon Cognito, and Supabase.

</div>

---

## About

MangaKo is a personal, cross-platform manga and manhwa reader designed around a simple problem: keeping up with ongoing series across multiple sources shouldn't require juggling bookmarks and remembering chapter numbers.

Discover series, open chapters in a streamlined reader, and quickly return to what you're reading. Guest browsing works without signing in; accounts add a personal library with cross-device synchronization.

**Try the live app:** **https://manga-ko.vercel.app**

## Features

| Discover | Read | Keep track |
| --- | --- | --- |
| Search titles across supported sources | Mobile-friendly chapter reader | Continue Reading shelf |
| Browse by genre, with paginated MangaDex discovery | Chapter navigation and full-screen reading | Last-read chapter and new-chapter indicators |
| MangaDex, MangaPill, curated Asura and Mgeko titles | Live Mgeko chapter loading, with archived fallback | My List and reading statuses |
| Browse without an account | Image proxy for supported image sources | Cognito sign-in and Supabase library sync |

Additional highlights:

- **Live chapter discovery:** Mgeko series can fetch newly released chapters on demand rather than requiring a manual upload.
- **Responsive experience:** use MangaKo on desktop, mobile web, or from an iPhone Home Screen.
- **Resilient source handling:** search can indicate when a provider is unavailable; supported chapters have retry/fallback paths.

> Catalog and chapter availability depend on third-party providers. Genre-wide server-side discovery currently uses MangaDex; other sources have different coverage and integrations.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React Native, Expo, Expo Router |
| Web deployment | Vercel |
| Authentication | AWS Cognito / Amplify |
| Library sync | Supabase |
| APIs | Vercel serverless functions (JavaScript and Python) |
| Data on device | AsyncStorage |
| Data ingestion | Python extraction utilities |

## How it works

```text
                  Web / Mobile / iPhone Home Screen
                                |
                     React Native + Expo Router
                      /                     \
              Discovery & Reader       Account & My List
                   |                         |
           Source-specific adapters    Amazon Cognito
                   |                         |
           Vercel serverless APIs       Library sync API
                   |                         |
       MangaDex / MangaPill / Mgeko        Supabase
                / curated sources
```

For supported image origins, the reader uses an allowlisted image proxy. Mgeko live chapter discovery and page resolution run through serverless endpoints, with stored chapter data retained for fallback.

## Get started locally

**Requirements:** Node.js and npm.

```bash
git clone https://github.com/srikar-kavali/MangaKo.git
cd MangaKo
npm ci
cp .env.example .env
npm run web
```

For an Expo development session:

```bash
npx expo start
```

Configure the required public API settings in `.env` using `.env.example` as a starting point. Some features require separately configured cloud services and server-side credentials, so a local installation without those services may have limited functionality.

**Security:** Never place secrets in `EXPO_PUBLIC_*` variables—they are exposed to the client. Keep private Supabase/service credentials in server-side environment variables, and don't commit `.env` files.

## Project layout

```text
app/          Screens, navigation, reader, and local reading state
manga_api/    Source-specific catalog and chapter adapters
services/     Shared catalog and library sync logic
auth/         Authentication helpers
api/          Serverless APIs and image proxy
extractor/    Python chapter-data ingestion utilities
assets/       App branding and assets
public/       Web/PWA assets
```

## What I'm working on

- Automatic latest-chapter checks across supported sources
- More comprehensive discovery filters and source coverage
- Reader and image-loading performance improvements
- Broader device testing and automated reliability checks

This is an actively developed personal project. Provider availability and some cross-device behaviors can vary.

## Live demo

**[Launch MangaKo →](https://manga-ko.vercel.app)**

You can browse and read as a guest. Create an account if you want to save a personal library and use its sync features.

## Content and attribution

MangaKo is an independent reader and discovery project, not affiliated with MangaDex, MangaPill, Asura Scans, or Mgeko. Manga and manhwa artwork and content belong to their respective rights holders. Respect the terms of each content provider.

---

<div align="center">

**[Try MangaKo](https://manga-ko.vercel.app)** · **[GitHub repository](https://github.com/srikar-kavali/MangaKo)**

</div>
