# UNIFY Academy — Complete Edition: what came from where

This repository is a one-time merge of the three UNIFY Academy repositories.
It is a standalone project, not a branch or fork of any of them.

## Base: `pixunisim` (newest and richest tree)
- Full K-12 3D virtual campus: 3D hallway, classroom, auditorium, newsroom,
  dorm, VR field trips, phone, mail, family accounts (Supabase).
- Grade banding ("only your grade" lessons), bundled curriculum packs and
  high-school electives, papercut/Pixar "movie look", morning dorm routine.
- News pipeline: `supabase/migrations/20261017000000_news_pipeline.sql`,
  `src/news/*`, `newsdesk.html`, CI (`ci.yml`) and Netlify deploy
  (`netlify-deploy.yml`) workflows.

## From `unify-campus-quest`
- `src/class3d/sequence.ts` — curriculum sequence for the curriculum home
  page (pixunisim imported this file but never shipped it; this fixes that
  latent build break).
- `tools/build_netlify.py` — resilient payload restore: looks in `tests/`
  too and only fills in files that are actually missing, never overwriting
  newer repo copies.
- `tests/smoke.mjs` — longer first-frame wait for the hallway scene under
  software GL on CI runners.

## From `unify-academy-3d` (commits `4954c7c` and `aa4300d`)
- **Class pet** (`src/class3d/pet.ts`): pick, name and feed a classroom pet.
- **Moment of the day** (`src/hall3d/daily.ts`): kind daily announcement at
  morning arrival in the hallway.
- **Lesson stamps** (`src/game/stamps.ts`): "Stamp n of N" with star bar and
  milestones after each lesson.
- **Study buddy "Sparky"** (`src/game/buddy.ts`): hints, never answers.
- **Dorm rewards** (`src/dorm/rewards.ts`): earnable furniture (pet cage,
  spirit pennant, champion cup).
- **Parent weekly summary** (`src/game/weekly.ts`, `demo/weekly.ts`):
  positive per-child week note on `parent.html`.
- **Club Corner** (`clubs3d.html`, `src/clubs3d/ClubRoom3D.ts`,
  `demo/clubs3d.ts`): 3D club room with join/leave and weekly schedule.
- **Stamp card** in the Today panel (`src/hall3d/hubui.ts`).
- Seven new test suites (`tests/class-pet`, `daily-moment`, `stamps`,
  `buddy`, `dorm-rewards`, `weekly`, `club-room`).

## Merge notes
- Where the two engagement commits did not apply verbatim to the newer
  pixunisim code (classroom grade banding, refactored hall arrivals, newer
  build scripts), the changes were re-applied by hand onto the newer code.
- `README.md` documents the new features; `package.json` builds the two new
  bundles (`weekly.js`, `clubs3d.js`); `tests/smoke.mjs` and
  `tools/build_netlify.py` ship the new Club Corner page.
- Deploy: push to `main` runs the Netlify workflow once `NETLIFY_AUTH_TOKEN`
  and `NETLIFY_SITE_ID` secrets are set, or link the repo in the Netlify UI
  (build: `npm run typecheck && npm run build && python3 tools/build_netlify.py dist`, publish `dist`).
