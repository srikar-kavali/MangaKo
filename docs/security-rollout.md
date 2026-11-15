# MangaKo security rollout

The repository is public. People can read or fork the code and edit copies in their own browsers. They should not have permission to modify the canonical GitHub repository, deploy the production site, or read another account's library.

## Production application and database

1. Deploy the reviewed change to the Vercel project(s) serving the site and API. If the separate `manga-scrapers` app is still deployed, redeploy it too or retire the deployment. Apply preview protection to non-production deployments, including older deployments with the retired endpoints where applicable. If an old deployment cannot be protected, retire it after checking rollback needs and any clients that still reference it.
2. In Supabase, apply `sql/user_library_sync.sql` to the existing project. It is non-destructive. It enables RLS and revokes direct table access from the anonymous and authenticated client roles. Review the grants and policies on other exposed tables too. Do not send the service credential to the browser or put it in `EXPO_PUBLIC_*`. Use an isolated test database for previews.
3. Confirm sync is authenticated, private, and uncached. With two test accounts in separate profiles, save different reading progress in each and confirm neither account can see or update the other's library. Also verify an unsigned request gets `401` and direct application-role database access has no table permission. Production is the only destination for account sync tokens. Any separate approved web environment that should sync with production needs its exact origin in `SYNC_ALLOWED_ORIGINS`; keep the production site origin allowed.
4. Verify guest browsing, sign-in, cloud sync, and a chapter from each supported source after deployment. MangaDex now uses direct HTTPS page URLs returned by MangaDex@Home instead of an app-origin image proxy. If a cached chapter still references the retired endpoint, reload it. The separate Cloudflare Worker is not required to deploy these Vercel changes.
5. Library data and snapshots retained on the device are not encrypted by AsyncStorage. Signing out is not a secure erase of browser/device data. Use separate browser or device profiles for different people, especially on shared devices. Account-scoped local storage with a deliberate migration of existing offline data is separate from cloud account isolation.

## Code and deployment ownership

- In GitHub, protect `main` with an active ruleset that blocks deletion and force pushes, requires pull requests and the security/build checks, and limits bypass access. For a solo repo, require review only if there is another trusted reviewer available.
- Enable MFA/passkeys on GitHub, Vercel, Supabase, AWS, and Cloudflare. Review collaborators, GitHub apps, deploy keys/hooks, API tokens, and DNS access. Remove access that is no longer needed.
- In Vercel, use `main` as the production branch and protect previews. Scope production secrets to production and use separate scoped credentials in development or previews. Review Cognito token lifetimes, authentication protections, and MFA settings separately.
- Review remaining npm audit warnings in an Expo upgrade branch. Test Expo Router and React Native compatibility on web and native before a major SDK upgrade.
