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
- **Look: minimalist, pastel pink is the protagonist.** Pink `#f6b8cf` for the
  header, active tab and main buttons; barely-pink white background; deep plum
  `#3d1f2e` text for readability. Colors are variables at the top of
  `styles.css`. Light theme only (for now). Icons match: plum dumbbell on pink.
- **No emoji or symbol characters as icons.** Use the minimal line icons in
  `ui.js` (`icon('check')`, `trash`, `back`, `plus`, `minus`, `download`,
  `upload`, `install`): 24×24 SVG strokes in the text color. Add new ones there.
- **Header:** title, version, and a settings button (sliders icon) that opens
  the Settings screen (backup, install, storage, version). The phone's back
  gesture closes it.

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

## Files
- `index.html` – the single page (header with version, sections, tab bar).
- `styles.css` – all styling; colors are variables at the top.
- `app.js` – app logic; registers the service worker, shows the version,
  renders the screens.
- `db.js` – the database: opening it, the `MIGRATIONS` list, read/write
  helpers for sets, persistent-storage request.
- `log.js` – the Log tab (date, routine switch, exercise list, set editor).
- `settings.js` – Settings screen: export/import, install button/help,
  storage status, version; also the "browser version" install banner.
- `ui.js` – shared helpers: `h()` element builder, `icon()`, dates,
  `isInstalledApp()`.
- `defaults.js` – starting exercises/routines, used only by migration v1.
  Never edit after release; changes go in a new migration in `db.js`.
- `sw.js` – service worker: `VERSION`, precache list, offline + updates.
- `manifest.webmanifest` – makes the app installable (name, icons, colors).
- `icons/` – app icons (made once in Claude's workspace; plain PNGs).
- `.nojekyll` – tells GitHub Pages not to process the files.

## Testing
Before shipping, Claude tests in its workspace with headless Chromium, serving
the files under a `/gym-tracker/` sub-folder like GitHub Pages: no console
errors, installable, works offline, and a `VERSION` bump replaces the old one.
Data changes are also tested as an upgrade from the previous released version,
checking that saved data survives. (Test quirk: Python's test server answers
"not modified" if two copies share a timestamp, so the test stamps each copy.)

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
- No machine setup tips (user asked to skip them).
- List: date (default today, max today), Upper/Lower switch, one card per
  exercise with target, last session ("Fri, Nov 20: 40×12 · 40×11") and
  "✓ N sets today". Default routine: the one already logged on that date,
  else the one after the last routine done (Upper → Lower → Upper).
- Exercise screen: saved sets listed (pink number, ✓, 🗑 delete with
  confirmation), then one editor for the **next** set: "Set 2 of 3",
  big − / + buttons (**2.5 kg** weight, **1** rep), tap the number to type it
  (a comma "22,5" is accepted), big "Save set". Planned sets = max(last
  session's count, routine minimum); after that "+ Add set".
- Prefill for set N: last session's set N. If you changed the weight on your
  previous set today, that weight carries forward. No history: weight empty,
  reps = range minimum.
- The phone's back gesture returns from an exercise to the list.
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
- File: `gym-tracker-backup-YYYY-MM-DD.json` =
  `{ app: 'gym-tracker', schemaVersion, exportedAt, data: { exercises,
  routines, sets, meta } }`. Saved to Downloads.
- Import: file is checked (clear messages if not a backup, damaged, or from a
  newer app version), older backups are upgraded with `BACKUP_MIGRATIONS`
  in `db.js`, the user confirms a summary, a safety copy
  (`gym-tracker-before-import-…`) is downloaded, then everything is replaced
  in one all-or-nothing database transaction.
- **Rule:** every new database migration needs a matching
  `BACKUP_MIGRATIONS` step doing the same change to plain data.
- `meta.lastBackup` (phone-only, not exported) drives "Last backup: N days ago".

## Out of scope
Accounts, sync, backend, social features, exercise videos or libraries,
complex dashboards, etc. Keeping it simple for now.

## Data model (database version 2)
- Database `gym-tracker`. Its version = number of entries in `MIGRATIONS`
  (`db.js`). Each migration upgrades existing data one step; released
  migrations are never edited or removed.
- `exercises`: `{ id, name }`. Seeded ids are readable (`chest-press`);
  the id never changes even if the name does.
- Migration history: v1 created the stores and seeded routines (with a leg
  press setup `note`); v2 removed `note` fields.
- `routines`: `{ id, name, subtitle?, order, items: [{ exerciseId,
  sets: {min,max}, reps: {min,max}, optional }] }`. E.g. "2-3x10-12" →
  sets 2–3, reps 10–12. Ids: `upper`, `lower`.
- `sets`: `{ id, date, exerciseId, routineId, setNo, weight, reps, savedAt }`,
  indexed by `[exerciseId, date]` (`exercise_date`) and by `date`.
- `meta`: `{ key, value }` for settings and bookkeeping (empty for now).
- No separate "workout" record: a session = all sets of one exercise on one
  date. "Last session" = the most recent date *before* the selected date that
  has sets for that exercise.

## Build order
Original order from the brief: 1. Log screen + installable PWA; 2. Rest timer,
progression hint, export/import; 3. Progress; 4. Body. Detailed plan (agreed,
subject to change; mark items done as they ship):
- [x] 1a. App shell: installable, offline, shows version, tab bar. Prove that
      install, airplane mode and updates all work before any data exists.
- [x] 1b. Data layer: IndexedDB + migrations, routines seeded, persistent storage.
- [x] 1c. Log screen: date, Upper/Lower, exercise list with last session,
      set rows prefilled, save, add/delete set.
- [x] 2a. Export/import (moved first: safety net before data piles up).
- [ ] 2b. Rest timer (2 min).
- [ ] 2c. Progression hint.
- [ ] 3. Body: morning weight + 7-day average, then macros entry.
      (Moved before Progress: the average needs data to build up.)
- [ ] 4. Routine/exercise editor (add, rename keeping history).
- [ ] 5. Progress section (define first).

## Open questions
- Progress section: what it should show.
- Persistent storage: Chrome said "not protected" at v3. Turned out the app
  was opening in the browser, not as an installed app. Re-check once it's
  properly installed. The app re-asks on every launch; backups are the
  safety net either way.

## Installing (for the user)
Open the site in **Chrome** itself (not inside another app's built-in browser).
Use the app's "Install app" button, or Chrome menu ⋮ → "Add to home screen" →
**Install** (not "Create shortcut"). Installed correctly = appears in the app
drawer, opens with no address bar, Settings says "Installed".
