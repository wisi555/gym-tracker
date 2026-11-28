# Gym Tracker

Project guide for Claude. This file is the source of truth for decisions.
Keep it up to date whenever we change a decision.

## Privacy: this repo is PUBLIC
GitHub Pages serves every file on `main` (this one included) to anyone.
**Never write the user's personal details here or anywhere in the repo**
(body stats, health info, real workout/food numbers, name, email). Their
data lives only on their phone. Examples in code/docs must be made up.

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
  The tabs are **icons only**: Log = `plus`, Body = `scale`, Progress =
  `chart` (each keeps an `aria-label`); the header shows the section name.
- **Look: minimalist, pastel pink is the protagonist.** Pink `#f6b8cf` for the
  header, active tab and main buttons; barely-pink white background; deep plum
  `#3d1f2e` text for readability. Colors are variables at the top of
  `styles.css`. Light theme only (for now). Icons match: plum dumbbell on pink.
- **No emoji or symbol characters as icons.** Use the minimal line icons in
  `ui.js` (`icon('check')`, `trash`, `back`, `plus`, `minus`, `download`,
  `upload`, `install`, `up`, `paste`, `scale`, `chart`): 24×24 SVG strokes in the text color. Add new ones there.
- **Header:** title, version, and a settings button (sliders icon) that opens
  the Settings screen (backup, storage status, version). The phone's back
  gesture closes it. **No install status in Settings** (user found it
  pointless). Install help lives only in the Log tab's "browser version"
  banner (`install.js`): Install button, or the steps in a pop-up.

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
- `body.js` – the Body tab: Weight | Macros switch; weight view (7-day
  average, weigh-in editor, last 14 days).
- `macros.js` – macros view and the paste reader `parseMacros()`.
- `progress.js` – the Progress tab (streak + stats, strength, body charts);
  `streakStats()` is a pure function (tested on its own).
- `chart.js` – `lineChart()`: the small SVG line chart.
- `settings.js` – Settings screen: export/import, storage status, version.
- `install.js` – "browser version" banner with Install button / steps.
- `timer.js` – rest timer bar.
- `ui.js` – shared helpers (anything used by another file must be
  `export`ed): `h()` element builder, `icon()`, dates
  (`todayStr`, `shortDate`, `addDays`, `weekStart`, `daysBetween`),
  `fmtSession()` (user's set format), numbers (`round2`, `fmtNum`,
  `parseNum`), the − / + `stepper()`, `isInstalledApp()`.
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
Syntax-check every file as a module: `node --input-type=module --check < f.js`
(plain `node --check` misses errors in these files). A missing export only
shows up when the app loads, so always load the app in the test.

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
- **How sets are written (user's style: reps first, then weight):** one set
  "10 reps – 45 kg"; a session grouped by weight: "3×10 – 45 kg",
  "10, 9 reps – 40 kg · 1×8 – 37.5 kg". Never "weight × reps" (confusing).
  Targets stay "sets × reps" ("3 × 8–10").
- List: date (default today, max today), Upper/Lower switch, one card per
  exercise with target, last session ("Fri, Nov 20: 3×10 – 45 kg"),
  check icon + "N sets today", and "Add weight" (up-arrow icon) when the
  progression hint applies and nothing is logged yet that day. Default routine: the one already logged on that date,
  else the one after the last routine done (Upper → Lower → Upper).
- Exercise screen: saved sets listed (pink number, check icon, trash icon to
  delete with confirmation), then one editor for the **next** set: "Set 2 of 3",
  big − / + buttons (**2.5 kg** weight, **1** rep), tap the number to type it
  (a comma "22,5" is accepted), big "Save set". Planned sets = max(last
  session's count, routine minimum); after that "+ Add set".
- Prefill for set N: last session's set N. If you changed the weight on your
  previous set today, that weight carries forward. No history: weight empty,
  reps = range minimum.
- The phone's back gesture returns from an exercise to the list. On start
  the app clears any leftover history entry (`history.replaceState`) so the
  back gesture works right after an update reload.
- Beside each exercise, show last session's weight and reps per set.
- New sets are prefilled with last time's numbers; adjust and tap to save.
- Progression hint: if the top of the rep range was hit on all sets last time,
  suggest adding weight. Exact rule: last session had ≥ the routine's minimum
  sets and every set reps ≥ range max → suggest (top weight last time +
  2.5 kg). It's only a hint: a card "10 reps on every set last time: try
  47.5 kg" with a "Use 47.5 kg" button (sets the weight; later sets carry it
  forward). Hidden once a set today uses that weight or more.
- Rest timer after each set: 2 min (`timer.js`). Pink bar above the tabs:
  countdown, "+30s", "Skip"; restarts on each saved set. Counts toward a fixed
  end time; screen kept awake while it runs (Wake Lock); at zero a short
  double vibration and "Rest over · next set" for 5 s. **No sound** (user may
  decide later). Survives the update reload via `sessionStorage`. If the app
  was away over a minute past zero, it just hides (no late buzz).
- The workout date can be changed, so past sessions can be entered.

### 2. Body
- Morning weight; show the 7-day average as the main number.
- Built (`body.js`): big pink card "7-day average 62.4 kg" (mean of
  weigh-ins dated today and the 6 days before; "–" if none). Editor: date
  (default today, max today), "Morning weight" stepper with **0.1 kg** steps,
  starting from that day's weigh-in or the nearest earlier one; "Save weight"
  / "Update weight". One weight per day (saving again replaces it). "Last 14
  days" list (one decimal, e.g. "62.0 kg") with trash icon + confirm.
  **No extra text lines** like "−0.4 kg vs last week" (clutter).
- Future idea (user would love it, later): a **chart of historical weekly
  average weight**.
- Macros tracking: the user enters the day's food in their own Claude session,
  which estimates the day's macros. The app needs a place to input and track
  those macros.
- Body tab has a **Weight | Macros** switch (same style as Upper/Lower).
- Built (`macros.js`): date; big "Paste from Claude" button (reads the
  clipboard; if blocked, a box to long-press-paste into); a "Found for …"
  preview with Save / "Replace this day" + Cancel; five rows Calories (kcal),
  Protein, Carbs, Fat, Fiber (g) as **eaten / target** with a thin pink bar
  (plum when over target); tap a row to type a number by hand; "Last 7 days"
  list (kcal + protein) with delete. One entry per day.
- Targets come from the pasted text (no targets editor). A day without its
  own targets shows the latest known ones.
- **Paste formats understood** (`parseMacros`):
  1. Agreed line (user adds this to their Claude's instructions), e.g.
     `MACROS kcal 1930/2150 · protein 110/120 · carbs 175/265 · fat 82/65 · fiber 36/30`
     (eaten/target; found anywhere in the text, backticks OK).
  2. Their Claude's usual list, one per line: `Calories: ~1,930 of 2,150
     (−220)`, `Protein: ~110 g of 120 g`, … Only lines *starting* with the
     word count (so "low fat yogurt 200 g" in a food list is ignored).
  "1,930" = thousands; "82,5" = decimal.

### Progress (`progress.js`, charts in `chart.js`)
Top switch **Streak | Strength | Body** (Streak is the default). Data is
re-read every time the tab is shown.
- **Streak:** big pink card "Weekly streak · 2+ gym days — N weeks".
  A gym day = a date with ≥1 set. Weeks run **Monday–Sunday**. This week
  counts once it has 2+ days and never breaks the streak while in progress.
  A past week with <2 days breaks it **unless excused**: tap that week's bar
  → confirm → excused (hatched bar, "off"). Excused weeks keep the streak
  alive but don't add to it; tap again to un-excuse. Stored in
  `meta.excusedWeeks` (Monday dates; exported in backups).
  Bars: last 8 weeks, gym days per week, dashed line at 2, "Now" = this
  week. Stat tiles (grow over time): gym visits, sets logged, kg lifted in
  total (Σ weight×reps), best streak, days since day one, weeks since day one.
- **Strength:** exercises grouped by routine with their latest heaviest
  weight. Tap → chart "Heaviest weight per session" (3 months | All) +
  "Sessions" list in the user's format. Back gesture returns.
- **Body:** one chart, cycle **Weight | Calories | Protein**, weekly averages
  (12 weeks | All); calories/protein show the latest target as a dashed line.
- Charts: hand-drawn SVG, one series, one axis, 2px line, 8px dots, faint
  grid, only the latest value written on the chart; tap/drag (or arrow keys)
  to read any point in the line above the chart. Chart marks use
  `--chart: #d6618f` (the pastel `--pink` fails contrast as a thin line;
  validated ≥3:1 on background and cards). Text stays plum.

## Routines (all machines)
Store routines as data, not hard-coded, so they can change later.
Weights in kg; allow 0 for possible bodyweight exercises.
The list is not final: the user will ask to add or modify exercises and
routines over time.
- Because defaults are only seeded into an empty database, a change requested
  later is shipped as a **data migration** (add new exercises, rename by id,
  change targets) so it reaches the installed app without touching history.
- **How routines change:** the user asks Claude, Claude ships a migration
  (+ matching `BACKUP_MIGRATIONS` step). No in-app editor (step 4 skipped).
Renaming or editing an exercise must keep its history.

**Rule: every exercise is 3 sets × 8–10 reps** (user's request, v7; earlier
v3/v4 capped reps at 10). Use this for any exercise added later unless the
user says otherwise. No "optional" marks, no routine subtitles. Current:

Upper:
- Chest press 3x8-10
- Lat pulldown 3x8-10
- Seated row 3x8-10
- Shoulder press 3x8-10
- Biceps curl 3x8-10
- Triceps press-down 3x8-10
- Seated ab crunch 3x8-10

Lower:
- Hip thrust 3x8-10 (renamed in v7 from "Hip thrust / glute bridge")
- Leg press 3x8-10
- 45° back extension 3x8-10
- Leg curl 3x8-10
- Leg extension 3x8-10
- Calf raise 3x8-10
- Hip abductor 3x8-10

## Backup
Export all data to a JSON file, and import it back.
- File: `gym-tracker-backup-YYYY-MM-DD.json` =
  `{ app: 'gym-tracker', schemaVersion, exportedAt, data: { exercises,
  routines, sets, meta, weights, macros } }`. Saved to Downloads.
- Import checks the stores every backup has (`FIRST_STORES`), runs
  `BACKUP_MIGRATIONS`, then checks all `STORES`. New stores go in `STORES`
  and get a backup migration that adds them empty.
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

## Data model (database version 7)
- Database `gym-tracker`. Its version = number of entries in `MIGRATIONS`
  (`db.js`). Each migration upgrades existing data one step; released
  migrations are never edited or removed.
- `exercises`: `{ id, name }`. Seeded ids are readable (`chest-press`);
  the id never changes even if the name does.
- Migration history: v1 created the stores and seeded routines (with a leg
  press setup `note`); v2 removed `note` fields; v3 capped rep ranges at 10
  (`capRepsAt10`, also used by `BACKUP_MIGRATIONS[2]`); v4 capped every
  range at 10 (`capAllRepsAt10`, `BACKUP_MIGRATIONS[3]`); v5 added the
  `weights` store (`BACKUP_MIGRATIONS[4]` adds an empty list); v6 added
  `macros` (`BACKUP_MIGRATIONS[5]`); v7 set every item to 3 × 8–10,
  `optional: false`, removed routine `subtitle`, renamed `hip-thrust` to
  "Hip thrust" (`simplifyRoutine`/`renameHipThrust`, `BACKUP_MIGRATIONS[6]`).
- `routines`: `{ id, name, order, items: [{ exerciseId,
  sets: {min,max}, reps: {min,max}, optional }] }`. E.g. "3x8-10" →
  sets 3–3, reps 8–10. Ids: `upper`, `lower`. (`subtitle` existed until v7;
  `optional` is kept but false.)
- `sets`: `{ id, date, exerciseId, routineId, setNo, weight, reps, savedAt }`,
  indexed by `[exerciseId, date]` (`exercise_date`) and by `date`.
- `meta`: `{ key, value }` for settings and bookkeeping: `lastBackup`
  (phone-only), `excusedWeeks` (array of Monday dates, exported).
- `weights`: `{ date, weight, savedAt }`, key = `date` (one per day).
- `macros`: `{ date, eaten: {kcal, protein, carbs, fat, fiber},
  target: {…same}, savedAt }`, key = `date`. Missing numbers are left out.
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
- [x] 2b. Rest timer (2 min).
- [x] 2c. Progression hint.
- [x] 3a. Body: morning weight + 7-day average.
      (Moved before Progress: the average needs data to build up.)
- [x] 3b. Body: macros entry with paste from the user's Claude.
- [~] 4. Routine/exercise editor — **skipped for now** (user's decision).
      Risks discussed: clashes between in-app edits and Claude's migrations,
      orphaned history on delete, rename vs replace mixing histories, more
      clutter/bugs. If ever revisited: no real deletes (hide instead),
      separate "rename" from "replace", tucked away in Settings.
- [x] 5. Progress section (Streak | Strength | Body).

## Status notes
- As of v6 the user has entered **no real workout data** (building in one
  session, not yet at the gym). Anything on the phone is test data.

## Style changes
The user will keep asking for purely visual tweaks (text, colors, icons,
spacing) after features are done. Treat these as small changes: no plan/OK
round needed unless it touches behavior or data; still bump `VERSION`.

## Open questions
- Progress was built with made-up test data; the user will come back with
  feedback after real use.
- Persistent storage: Chrome said "not protected" at v3. Turned out the app
  was opening in the browser, not as an installed app. Re-check once it's
  properly installed. The app re-asks on every launch; backups are the
  safety net either way.

## Installing (for the user)
Open the site in **Chrome** itself (not inside another app's built-in browser).
Use the app's "Install app" button, or Chrome menu ⋮ → "Add to home screen" →
**Install** (not "Create shortcut"). Installed correctly = appears in the app
drawer, opens with no address bar, and the Log tab's "browser version"
banner is gone.
