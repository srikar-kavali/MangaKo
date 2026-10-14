# Catalog discovery

MangaKo separates title discovery from chapter extraction.

- **MangaDex**: paginated dynamic API catalog, controlled through `/api/mangadex/search`.
- **MangaPill**: first-page newly added titles from `/mangas/new`, via `/api/mangapill/browse`. This endpoint returns metadata only. It does **not** yet support pagination.
- **Curated**: `manga_api/hardcodedManhwas.js` serves as a fallback.
- **Client**: `services/catalog.js` merges source-qualified IDs, and tolerates an unavailable source.

Both external discovery providers must be checked for permission, availability, schema changes, caching, and rate limits before a public launch. MangaPill no longer carries manhwa, so it is only used as a manga source.

Next steps: tests with saved listing HTML fixtures, source-specific cursor pagination, server-side metadata caching in Supabase and dedicated Manga/Manhwa filters. Never put Supabase service-role credentials into Expo public environment variables.
