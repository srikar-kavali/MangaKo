# Comix proof of concept (experimental)

The optional adapter in `services/comix.js` provides **search**, **title details**, and **chapter-list retrieval** against the [unofficial Comix API](https://github.com/yurtzy/comix-api).

This is deliberately **not wired to Home, My List, or the reader**. No new Vercel serverless endpoints are introduced; MangaDex remains the primary catalog source.

## Run contract tests

```sh
node tests/comix-contract.mjs
```

These use mock responses and only validate the local adapter's assumptions. They do **not** prove the hosted Comix API is available or compatible.

## Opt-in local testing

Add these to your local `.env`, then restart Expo:

```env
EXPO_PUBLIC_ENABLE_COMIX=true
EXPO_PUBLIC_COMIX_API=https://comix-api.vercel.app
```

Call `searchComix('Solo Leveling')`, `getComixDetails(id)`, and `getComixChapters(id)` from a temporary developer test screen or console in your local app. The default behavior remains unchanged without the flag.

The documented API wraps and proxies Comix.to content; its author says it is **unofficial and for educational/personal use**, and requests appropriate permissions for public-facing projects. Do not enable it in production without checking permissions, API stability, content-filtering guarantees, and platform terms. Do not persist or redistribute chapter images on this experimental path.

## Acceptance criteria before broader integration

- Verify at least 5 known manga/manhwa searches against the live API.
- Inspect real details and chapter response schemas.
- Verify safe-only filters, failures, timeouts, and rate limits.
- Decide on licensing/permission and long-term operational ownership.
- Only then build a UI experiment behind the feature flag.
