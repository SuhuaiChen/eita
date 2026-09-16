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

-- anonymous demo mode: device rows are self-service (they carry no identity)
create policy "anon device rows"
  on public.eita_state
  for all
  to anon
  using (id like 'dev:%')
  with check (id like 'dev:%');

-- signed-in learners can only ever see/write their own row
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

create policy "anon may append events"
  on public.eita_events
  for insert
  to anon
  with check (true);
