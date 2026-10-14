# Testing the cleanup branch

## Local Expo / web

```bash
git fetch origin
git switch cleanup
git pull --ff-only origin cleanup
npm ci
cp .env.example .env
# Set EXPO_PUBLIC_CHAPTERS_API and EXPO_PUBLIC_MANGAPILL_API to your deployed API URLs
npx expo start --clear
# Or: npm run web
```

The `cleanup` branch stays separate from `main`; these commands do not merge.

## Vercel preview

Connect the repository to Vercel (or open the existing Vercel project).
Make sure Preview deployments are enabled for the `cleanup` branch.
Configure preview environment variables for both public API endpoints and server-only credentials.
Open the **Preview** URL for the `cleanup` deployment and verify that the deployment is successful.
The preview URL is separate from the production URL; do not change the production branch to test.

## Optional Supabase cache

1. Execute `docs/catalog-cache.sql` in the project's Supabase SQL Editor.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` **only on the server** (for example, the Vercel Preview environment).
3. Redeploy Preview. When configured, `/api/mangadex/search` reads/writes a 15-minute metadata cache.
4. Without the server variables, requests bypass the cache and continue using MangaDex.
5. The cache is an optimization, not permanent catalog storage.

## Manual smoke tests

- Sign up, sign in and sign out.
- Search MangaDex and MangaPill; verify covers, title details and chapter lists.
- On Home, check **All Titles / Manhwa / Manga** and **Load More Titles**.
- Check newly added MangaPill results. Its listing is not currently paginated.
- Save a title, read a chapter, then dismiss it from Continue Reading.
- Restart the app: dismissal should persist but Favorites and progress must remain.
- Read another chapter: the title can appear in Continue Reading again.
- Confirm images from each configured host render; verify the secured proxy doesn't block an expected host.
- Confirm missing network/backend responses show errors without crashing.
- Check mobile and web layouts; verify backend logs for errors.
- Review GitHub Actions under the `cleanup` commits.

## Before merging

The source adapters rely on third-party services and should be verified against their current behavior, availability, and usage rules. Test locally and on Preview before creating a PR from `cleanup` into `main`.
