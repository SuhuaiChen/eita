# Eita — hackathon demo

Adaptive micro-practice companion for Brazilian 60+ learning Mandarin (HSK 1–2),
built on the HanFlow HSK dataset. Next.js 16 (App Router) + TypeScript + Tailwind 4.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (fully static)
- `npm run typecheck` / `npx eslint src tests`
- `node_modules/.bin/vitest run tests/` — engine unit tests + 7-day simulation
- `npm run prepare:curriculum` — regenerate `src/data/curriculum.json` from `data/hanflow/`

## Environment notes

- The npm registry is unreachable from this machine — `node_modules` was copied
  from `~/Desktop/lessonPage` (same next 16.3.4 / react 19.2.8 / tailwind 4).
  Do NOT run `npm install` expecting network; add deps by copying or `npm i --offline`.
- No `next/font/google` — it fetches fonts at build time and fails offline.

## Architecture

- `data/hanflow/` — source dumps copied from `~/Desktop/HanFlow Home`
  (vocabNew/vocabOld/grammarNew/exercises/exerciseOverrides).
- `scripts/prepare-curriculum.mjs` — normalizes vocab (lv 1–2 + old-HSK
  supplements), merges grammar metadata, segments every sentence into words
  (longest-match over the vocab lexicon + overrides), tags concepts with
  moments/interests, emits `src/data/curriculum.json`.
- `src/lib/engine.ts` — adaptive engine: per-concept familiarity + stability
  (FSRS-lite retrievability), moment/interest affinity, "1 weak + familiar
  scaffold" sentence selection, success-probability band (~0.7–0.9) for
  exercise-type choice, recovery-win mode after failures, new-concept
  introduction when nothing is due.
- `src/lib/store.tsx` — learner state: localStorage + optional Supabase sync
  (`eita_state` table, see `supabase/schema.sql`; enabled by
  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
- `src/lib/tts.ts` — zh-CN speech via the browser's Web Speech API
  (`speechSynthesis`), picking the best available zh voice; 🐢 = slower rate.
  There is no `/api/tts` route — the earlier DashScope plan was dropped.
- `src/lib/calendar.ts` — agenda model: real Google Calendar events when a
  token is stored. Two OAuth modes: auth-code flow when
  `GOOGLE_CLIENT_SECRET` + `NEXT_PUBLIC_GOOGLE_CODE_FLOW=1` are set (exchange
  at `/api/gcal/token`, refresh token lives in an httpOnly cookie → stays
  connected past 1h), otherwise the implicit token flow. No connection → a
  deterministic demo agenda with one event always ~45min ahead so a
  "Conversar" button is always live.
- `src/lib/auth.ts` + store — optional Supabase magic-link auth; when signed
  in, `eita_state` rows key on `u:<uid>` (auth-backed RLS in schema.sql),
  remote-newer snapshots restore over local. Without envs the app is 100%
  local — auth UI hides itself.
- `src/lib/ai.ts` + `src/app/api/dialogue` — event-personalized dialogues via
  OpenAI (`OPENAI_MODEL`, default gpt-5-mini, reasoning_effort minimal).
  Prefetched on the hoje agenda render; client falls back to scripted
  dialogues on any failure.
- Pages: `/onboarding` (5 steps), `/hoje` (action card + agenda), 
  `/pratica?m=<moment>` or `?e=<agendaItemId>`, `/progresso` (vocab + grammar
  banks with dominance dots), `/perfil` (Google connect). `/` redirects.
- Keys live in `.env.local` (gitignored): `OPENAI_API_KEY`, `OPENAI_MODEL`,
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (dedicated OAuth client in the `eita-app`
  GCP project; redirect URIs `http://localhost:{3000,3001}/perfil`),
  `GOOGLE_CLIENT_SECRET` (code flow), Supabase envs.

## Production deployment

- Deploy on Vercel: `vercel link` → `vercel` — the build is static except
  `/api/dialogue`, `/api/gcal/token`, `/api/telemetry` (serverless fns).
- Set env vars in the Vercel project (everything in `.env.example`), then
  register `https://<domain>/perfil` as an authorized redirect URI + JS origin
  on the Google OAuth client.
- Google consent screen is in Testing mode (≤100 users, no verification).
  Going public requires Google OAuth verification for the sensitive
  `calendar.events.readonly` scope — needs the privacy policy URL (/privacidade)
  and a short demo video; budget ~1-2 weeks.
- Supabase: run `supabase/schema.sql`, enable Email auth (magic link), add the
  site URL to Auth → URL Configuration. Without envs everything stays local.
- Content note: HanFlow curriculum is used for the demo — confirm licensing
  before commercial distribution.

## Design rules worth keeping

- Never punishing copy — no ❌, no percentages, no streaks; hint ladder is
  gloss → pattern → starter → reveal.
- One exercise per practice open ("Praticar mais uma" is the only way to chain).
- Large text, ≥56px tap targets, `.zh` class for hanzi (`lang="zh-CN"`).
- Positioning: learners who ALREADY know some Mandarin — the app keeps it
  alive through tiny conversations anchored to their routine and agenda.
