# Gym Tracker

Project guide for Claude. This file is the source of truth for decisions.
Keep it up to date whenever we change a decision.

## What this is
A personal gym-tracking app for one user. No accounts, no backend,
no cloud, no analytics. All data stays on the user's Android phone.

## How the user works
- No coding knowledge; the project is fully built by Claude ("vibe coded").
  Claude handles all code, git and deploying. The user tests on the phone.
- Works from their phone only (Claude Code in the Claude app). No computer, so
  they cannot run build tools, npm, or local servers.
- New to web development. Explain non-obvious choices briefly and in plain language.
- Build one small feature at a time. Before any bigger change, describe the plan
  and wait for the user's OK.
- Keep this file up to date when we change a decision.

## Tech constraints (from the brief — do not break)
- Must work offline at the gym.
- Claude can never run anything itself. Any build step has to run automatically
  on GitHub, or not exist at all.
  - Clarified by the user: the app must never depend on anything being run or
    on the internet. Claude *may* use its own cloud workspace to test (e.g.
    headless browser) and to create one-off files such as icons, but the app
    must work from the repo files alone.
- Hosted on GitHub Pages from the root of the `main` branch.
- PWA (manifest + service worker) that works fully offline.
- New versions must reach the installed app: bump the cache version on every
  change so the user never gets stuck on an old version.
- Store data in IndexedDB. Request persistent storage (`navigator.storage.persist()`).
- Mobile-first, one-handed use at the gym: big tap targets, readable at a glance.

## Tech decisions
- **Plain HTML + CSS + vanilla JavaScript (ES modules). No framework, no npm,
  no build step.** The files in the repo are exactly what the phone runs, so
  nothing needs compiling and GitHub Pages serves them as-is.
- **No runtime dependencies or CDNs.** Everything the app needs lives in this
  repo, so it works offline. If a library is ever truly needed, copy the file
  into the repo ("vendoring") and precache it.
- **PWA files at the repo root:** `manifest.webmanifest`, `sw.js`, icons.
  The service worker must sit at the root so it controls the whole app.
- **`.nojekyll` at the root** so GitHub Pages serves files untouched.
- **Relative paths everywhere** (`./app.js`, not `/app.js`): the site lives at
  `https://<user>.github.io/gym-tracker/`, a sub-folder, not the domain root.
- **Single page app** with a bottom tab bar (thumb-reachable) to switch sections.

### Update mechanism (how new versions reach the installed app)
- `sw.js` holds one `VERSION` constant. The cache name includes it. The app
  shows the version (e.g. in a footer) so the user can check what's running.
- Service worker strategy: cache-first for app files (instant and offline).
- On install, files are fetched with `cache: 'reload'` so GitHub Pages' own
  ~10-minute HTTP cache can't sneak stale files into the new cache.
- New service worker activates immediately (`skipWaiting` + `clients.claim`),
  old caches are deleted, and the page reloads itself once. Safe because every
  set is saved to IndexedDB the moment it's tapped.
- The app checks for updates on launch and whenever it comes back to the
  foreground (`registration.update()`).

### Data rules
- **Never lose data.** Any change to how data is stored must keep existing
  data working: bump the IndexedDB version and write a migration in
  `onupgradeneeded`. Never delete or rename a store/field without migrating it.
- Every exercise has a **permanent id**. History points to the id, never the
  name, so renaming or editing an exercise keeps its history. Ids are never reused.
- Routines are **data, not code**: stored in IndexedDB, seeded from a defaults
  file only on first run (empty database). Later changes are made in-app.
- Weights in kg. Decimals allowed (e.g. 22.5). `0` allowed (bodyweight).
- Dates stored as local calendar strings `YYYY-MM-DD` (avoids time-zone bugs
  where a late-evening workout lands on the wrong day).
- Export/import must always include every store and a `schemaVersion`, and
  import must migrate older exports.
- No `localStorage` for real data.

## Checklist for every change
1. Bump `VERSION` in `sw.js`.
2. Add any new file to the service worker's precache list.
3. If the data shape changed: DB version bump + migration + export/import updated.
4. Tap targets ≥ 48px; key numbers large; works one-handed.
5. Update this file if a decision changed.

## Git & deploy
- Live site = `main` branch root. A change goes live when it lands on `main`;
  GitHub Pages then redeploys in about a minute.
- The user leaves git to Claude. Claude works on its session branch, and
  after the user OKs the plan for a change, Claude merges it into `main`
  itself (no pull requests needed).
- One-time setup by the user: repo Settings → Pages → "Deploy from a branch"
  → `main` / `(root)`.

## Sections

### 1. Log
- Pick a routine (Upper or Lower); exercises can be picked = done in any
  order, and any can be skipped.
- Logging screen: one row per set, prefilled from last time (or the routine's
  minimum set count if there's no history). Big − / + buttons: **2.5 kg** for
  weight, **1** for reps; tapping the number lets you type it. "+ Add set".
- A saved set can be deleted (with confirmation) so typos don't stay forever.
- Beside each exercise, show last session's weight and reps per set.
- New sets are prefilled with last time's numbers; adjust and tap to save.
- Progression hint: if the top of the rep range was hit on all sets last time,
  suggest adding weight.
- Rest timer after each set: 2 min.
- The workout date can be changed, so past sessions can be entered.

### 2. Body
- Morning weight; show the 7-day average as the main number.
- Macros tracking: the user enters the day's food in their own Claude session,
  which estimates the day's macros. The app needs a place to input and track
  those macros.

### Progress
- In the build order but not yet defined. Define before building.

## Routines (all machines)
Store routines as data, not hard-coded, so they can change later.
Weights in kg; allow 0 for possible bodyweight exercises.
The list is not final: the user will ask to add or modify exercises and
routines over time.
- Because defaults are only seeded into an empty database, a change requested
  later is shipped as a **data migration** (add new exercises, rename by id,
  change targets) so it reaches the installed app without touching history.
- Later, an in-app editor may let the user do this themselves (build step 4).
Renaming or editing an exercise must keep its history.

Upper:
- Chest press 3x8-12
- Lat pulldown 3x8-12
- Seated row 3x8-12
- Shoulder press 3x8-12
- Biceps curl 2-3x10-12
- Triceps press-down 2-3x10-12
- Seated ab crunch 2-3x10-15

Lower (glute focus):
- Hip thrust / glute bridge machine 4x8-12
- Leg press (feet high, slightly wide) 3-4x8-12
- 45° back extension 3x10-12
- Leg curl 3x10-15
- Leg extension 2-3x10-15
- Calf raise 3x10-15
- Hip abductor (optional) 2-3x12-15

## Backup
Export all data to a JSON file, and import it back.

## Out of scope
Accounts, sync, backend, social features, exercise videos or libraries,
complex dashboards, etc. Keeping it simple for now.

## Data model (v1)
- `exercises`: `{ id, name }`. Seeded ids are readable (`chest-press`); the id
  never changes even if the name does.
- `routines`: `{ id, name, items: [{ exerciseId, sets: {min,max},
  reps: {min,max}, optional }] }`. E.g. "2-3x10-12" → sets 2–3, reps 10–12.
- `sets`: `{ id, date, exerciseId, routineId, setNo, weight, reps, savedAt }`,
  indexed by `[exerciseId, date]` and by `date`.
- No separate "workout" record: a session = all sets of one exercise on one
  date. "Last session" = the most recent date *before* the selected date that
  has sets for that exercise.

## Build order
Original order from the brief: 1. Log screen + installable PWA; 2. Rest timer,
progression hint, export/import; 3. Progress; 4. Body. Detailed plan (agreed,
subject to change; mark items done as they ship):
- [ ] 1a. App shell: installable, offline, shows version, tab bar. Prove that
      install, airplane mode and updates all work before any data exists.
- [ ] 1b. Data layer: IndexedDB + migrations, routines seeded, persistent storage.
- [ ] 1c. Log screen: date, Upper/Lower, exercise list with last session,
      set rows prefilled, save, add/delete set.
- [ ] 2a. Export/import (moved first: safety net before data piles up).
- [ ] 2b. Rest timer (2 min).
- [ ] 2c. Progression hint.
- [ ] 3. Body: morning weight + 7-day average, then macros entry.
      (Moved before Progress: the average needs data to build up.)
- [ ] 4. Routine/exercise editor (add, rename keeping history).
- [ ] 5. Progress section (define first).

## Open questions
- Progress section: what it should show.
