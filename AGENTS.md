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
- `src/lib/tts.ts` — zh-CN speech: Ali DashScope `qwen3-tts-flash` via
  `/api/tts` first, Web Speech API fallback (always used for 🐢 slow).
- `src/lib/calendar.ts` — agenda model: real Google Calendar events when a
  token is stored (implicit OAuth via `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
  redirect lands back on `/perfil`), otherwise a deterministic demo agenda
  with one event always ~45min ahead so a "Conversar" button is always live.
- `src/lib/ai.ts` + `src/app/api/dialogue` — event-personalized dialogues via
  OpenAI (`OPENAI_MODEL`, default gpt-5-mini, reasoning_effort minimal).
  Prefetched on the hoje agenda render; client falls back to scripted
  dialogues on any failure.
- Pages: `/onboarding` (5 steps), `/hoje` (action card + agenda), 
  `/pratica?m=<moment>` or `?e=<agendaItemId>`, `/progresso` (vocab + grammar
  banks with dominance dots), `/perfil` (Google connect). `/` redirects.
- Keys live in `.env.local` (gitignored): `OPENAI_API_KEY`, `OPENAI_MODEL`,
  `DASHSCOPE_API_KEY` (intl endpoint: dashscope-intl.aliyuncs.com — the
  mainland host rejects this key).

## Design rules worth keeping

- Never punishing copy — no ❌, no percentages, no streaks; hint ladder is
  gloss → pattern → starter → reveal.
- One exercise per practice open ("Praticar mais uma" is the only way to chain).
- Large text, ≥56px tap targets, `.zh` class for hanzi (`lang="zh-CN"`).
- Positioning: learners who ALREADY know some Mandarin — the app keeps it
  alive through tiny conversations anchored to their routine and agenda.
