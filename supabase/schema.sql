-- Eita demo persistence.
-- The app works fully on localStorage; when NEXT_PUBLIC_SUPABASE_URL and
-- NEXT_PUBLIC_SUPABASE_ANON_KEY are configured, the learner state snapshot is
-- also upserted here (one row per device).

create table if not exists public.eita_state (
  id text primary key,            -- device id (crypto.randomUUID, stored client-side)
  json jsonb not null,            -- LearnerState snapshot
  updated_at timestamptz not null default now()
);

alter table public.eita_state enable row level security;

-- demo-friendly anonymous access; replace with auth-backed policies in prod
create policy "anon upsert own device state"
  on public.eita_state
  for all
  to anon
  using (true)
  with check (true);
