# Eita

Adaptive Mandarin micro-practice companion for Brazilian learners 60+, built on
the HanFlow HSK 1–2 dataset. Tiny conversations anchored to the learner's
routine and Google Calendar agenda — designed to keep existing Mandarin alive,
not to teach from zero.

Next.js 16 (App Router) · TypeScript · Tailwind 4 · localStorage-first with
optional Supabase sync.

## Run it

```bash
npm run dev          # dev server
npm run build        # production build (static pages + 3 serverless API routes)
npm run typecheck    # tsc
npx eslint src tests # lint
node_modules/.bin/vitest run tests/   # unit tests + 7-day engine simulation
npx playwright test  # e2e smoke suite (needs a dev server on :3001)
npm run prepare:curriculum            # regenerate src/data/curriculum.json
```

Copy `.env.example` → `.env.local` and fill what you have — **every env var is
optional**: without Supabase the app is fully local, without Google OAuth it
runs a demo agenda, without OpenAI it uses scripted dialogues.

## How it works

- **Adaptive engine** (`src/lib/engine.ts`) — per-concept familiarity +
  FSRS-lite retrievability, moment/interest affinity, success-probability
  banding, recovery mode after struggles.
- **Agenda practice** (`src/lib/calendar.ts`) — reads today's Google Calendar
  events (read-only) and builds conversations around them; falls back to a
  demo agenda.
- **AI personalization** (`/api/dialogue`) — OpenAI rewrites scripted dialogue
  skeletons around real events; any failure falls back to the script.
- **Speaking** — Web Speech STT/TTS with rehearsal ("repita comigo") shadowing
  and tap-to-answer fallback when the mic isn't available.
- **Progress** (`/progresso`) — weekly narrative, fading-word alerts with a
  "Revisar agora" shortcut, learned-vs-seeded split, conversation history.

See `AGENTS.md` for architecture, deployment runbook, and design rules.
See `NOTICE` for HanFlow content provenance and `supabase/schema.sql` for the
persistence/telemetry schema.
