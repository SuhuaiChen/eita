-- Eita persistence.
-- The app works fully on localStorage; when NEXT_PUBLIC_SUPABASE_URL and
-- NEXT_PUBLIC_SUPABASE_ANON_KEY are configured, the learner state snapshot is
-- also upserted here. Rows are keyed `u:<auth uid>` for signed-in learners and
-- `dev:<device uuid>` for anonymous local mode.

create table if not exists public.eita_state (
  id text primary key,            -- 'u:<uuid>' or 'dev:<uuid>'
  json jsonb not null,            -- LearnerState snapshot
  updated_at timestamptz not null default now()
);

alter table public.eita_state enable row level security;

-- anonymous demo mode: device rows are write-only backups (the app NEVER
-- selects dev: rows — remote restore only happens for signed-in learners).
-- No select policy → anon can't dump other devices' profiles/routines.
drop policy if exists "anon device rows" on public.eita_state;
create policy "anon device rows write"
  on public.eita_state
  for insert
  to anon
  with check (id like 'dev:%');
create policy "anon device rows update"
  on public.eita_state
  for update
  to anon
  using (id like 'dev:%')
  with check (id like 'dev:%');
create policy "anon device rows delete"
  on public.eita_state
  for delete
  to anon
  using (id like 'dev:%');

-- signed-in learners can only ever see/write their own row
drop policy if exists "users own their row" on public.eita_state;
create policy "users own their row"
  on public.eita_state
  for all
  to authenticated
  using (id = 'u:' || auth.uid()::text)
  with check (id = 'u:' || auth.uid()::text);

-- telemetry events (written by /api/telemetry via the service role or anon
-- with this policy — events contain no content, just names + timestamps)
create table if not exists public.eita_events (
  id bigint generated always as identity primary key,
  ev text not null,               -- event name, e.g. 'dialogue.fallback'
  meta jsonb,                     -- small metadata (never transcripts)
  at timestamptz not null default now()
);

alter table public.eita_events enable row level security;

-- closed allowlist: the anon key is public, so bound what can be appended —
-- arbitrary event names can't be stuffed through the REST API directly
drop policy if exists "anon may append events" on public.eita_events;
create policy "anon may append known events"
  on public.eita_events
  for insert
  to anon
  with check (
    ev = any ('{
      "onboarding.complete",
      "practice.finish",
      "stt.error",
      "dialogue.fallback",
      "gcal.connected",
      "gcal.disconnect",
      "gcal.connect.start",
      "client.error",
      "client.rejection"
    }'::text[])
  );
