-- Run in the existing Supabase project before enabling account sync.
-- Only backend service-role code accesses this table. Never expose service keys to clients.
create table if not exists public.user_library_sync (
  user_id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.user_library_sync enable row level security;
-- Block direct application-role access even if a policy is added by mistake.
revoke all on table public.user_library_sync from public, anon, authenticated;
grant select, insert, update on table public.user_library_sync to service_role;
-- No anon/authenticated policies: access is exclusively through verified backend calls.
