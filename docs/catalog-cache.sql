-- Apply in Supabase SQL Editor; metadata only, no chapter images.
create table if not exists public.catalog_cache (
    cache_key text primary key,
    payload jsonb not null,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);
create index if not exists catalog_cache_expires_at_idx
    on public.catalog_cache (expires_at);
alter table public.catalog_cache enable row level security;
-- No client-side access policies. Access is via server-only service role.
-- Periodically prune: delete from public.catalog_cache where expires_at < now() - interval '7 days';
