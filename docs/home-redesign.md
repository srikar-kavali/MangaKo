# Home redesign — phase 1

- Added a responsive hero banner with a Search entry point.
- Reworked Explore cards to have computed widths for mobile, tablets, and desktop.
- Increased card contrast, typographic hierarchy, radius, and breathing room.
- Kept source badges, reading progress, discovery loading/pagination, and MangaPill matching behavior intact.
- Removed the experimental Comix files. `main` remains unchanged.

## Testing
Run `npx expo start --clear` on `cleanup`. Check 390px, 768px, and 1440px window widths; search button; dynamic loading; Load More; title navigation; and Continue Reading.
