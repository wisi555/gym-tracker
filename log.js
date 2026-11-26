// The Log tab: pick a date and routine, see exercises with last session,
// open one and log sets.

import {
  getRoutines, getSetsOn, getLastSession, getSetsByDate, getLatestSet, addSet, deleteSet,
} from './db.js';
import {
  h, icon, todayStr, shortDate, round2, fmtNum as fmtWeight, stepper,
} from './ui.js';
import { startRest } from './timer.js';

const WEIGHT_STEP = 2.5;
const REPS_STEP = 1;

// ---- Small helpers ----


// The user's way of writing sets: reps first, then weight.
// One set: "10 reps – 45 kg".
const fmtOne = (s) => `${s.reps} reps – ${fmtWeight(s.weight)} kg`;

// A session, grouped by weight: "3×10 – 45 kg", "10, 9, 8 reps – 45 kg",
// or several groups: "2×10 – 45 kg · 1×8 – 42.5 kg".
function fmtSession(sets) {
  const groups = [];
  for (const s of sets) {
    const g = groups[groups.length - 1];
    if (g && g.weight === s.weight) g.reps.push(s.reps);
    else groups.push({ weight: s.weight, reps: [s.reps] });
  }
  return groups.map(({ weight, reps }) => {
    const same = reps.every((r) => r === reps[0]);
    const repsText = same ? `${reps.length}×${reps[0]}` : `${reps.join(', ')} reps`;
    return `${repsText} – ${fmtWeight(weight)} kg`;
  }).join(' · ');
}

// Progression hint: last session had at least the minimum number of sets and
// every set reached the top of the rep range → suggest +2.5 kg on the top weight.
function progressionHint(item, last) {
  if (!last || last.sets.length < item.sets.min) return null;
  if (!last.sets.every((s) => s.reps >= item.reps.max)) return null;
  const top = Math.max(...last.sets.map((s) => s.weight));
  return { reps: item.reps.max, weight: round2(top + WEIGHT_STEP) };
}
const range = ({ min, max }) => (min === max ? String(min) : `${min}–${max}`);
const target = (item) => `${range(item.sets)} × ${range(item.reps)}`;

const validWeight = (w) => typeof w === 'number' && Number.isFinite(w) && w >= 0;
const validReps = (r) => Number.isInteger(r) && r >= 1;

// ---- State ----

const state = {
  date: todayStr(),
  today: todayStr(),
  routines: [],
  routineId: null,
  exerciseId: null, // null = list view
  extraSet: false,  // "+ Add set" pressed after the planned sets are done
};

// Numbers being edited for the next set; kept across re-renders.
let draft = { key: null, weight: null, reps: null };

let root;
let renderSeq = 0;

const currentRoutine = () => state.routines.find((r) => r.id === state.routineId);
const isToday = () => state.date === state.today;

export async function initLog(container) {
  root = container;
  state.routines = await getRoutines();
  state.routineId = await suggestRoutine();

  // The phone's back button/gesture returns from an exercise to the list.
  window.addEventListener('popstate', () => {
    if (state.exerciseId && !(history.state && history.state.exercise)) {
      state.exerciseId = null;
      render();
    }
  });

  // If the app stays open past midnight, move "today" along.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = todayStr();
    if (now === state.today) return;
    if (state.date === state.today) state.date = now;
    state.today = now;
    render();
  });

  await render();
}

// Which routine to show first: the one already logged on this date if any;
// otherwise the one after the last routine you did (Upper → Lower → Upper).
async function suggestRoutine() {
  const ids = state.routines.map((r) => r.id);
  const onDate = await getSetsByDate(state.date);
  const loggedHere = onDate.length && onDate[onDate.length - 1].routineId;
  if (ids.includes(loggedHere)) return loggedHere;
  const latest = await getLatestSet();
  const i = latest ? ids.indexOf(latest.routineId) : -1;
  return i === -1 ? ids[0] : ids[(i + 1) % ids.length];
}

async function setDate(date) {
  if (!date || date === state.date) return;
  state.date = date;
  const onDate = await getSetsByDate(date);
  const loggedHere = onDate.length && onDate[onDate.length - 1].routineId;
  if (state.routines.some((r) => r.id === loggedHere)) state.routineId = loggedHere;
  render();
}

async function render() {
  const seq = ++renderSeq;
  try {
    const view = state.exerciseId ? await exerciseView() : await listView();
    if (seq !== renderSeq) return; // a newer render started meanwhile
    root.replaceChildren(view);
  } catch (err) {
    console.error(err);
    root.replaceChildren(h('p', { class: 'error' }, 'Something went wrong: ' + (err && err.message ? err.message : err)));
  }
}

function scrollToTop() {
  document.querySelector('main').scrollTop = 0;
}

function openExercise(exerciseId) {
  state.exerciseId = exerciseId;
  state.extraSet = false;
  history.pushState({ exercise: exerciseId }, '');
  render().then(scrollToTop);
}

function backToList() {
  if (history.state && history.state.exercise) {
    history.back(); // popstate handler re-renders
  } else {
    state.exerciseId = null;
    render();
  }
}

// ---- List view ----

async function listView() {
  const routine = currentRoutine();
  const rows = await Promise.all(routine.items.map(async (item) => ({
    item,
    done: await getSetsOn(item.exerciseId, state.date),
    last: await getLastSession(item.exerciseId, state.date),
  })));
  const dayWord = isToday() ? 'today' : 'this day';

  return h('div', { class: 'log-list' },
    h('div', { class: 'date-row' },
      h('label', { class: 'date-label', for: 'log-date' }, 'Date'),
      h('input', {
        id: 'log-date', type: 'date', class: 'date-input', value: state.date, max: state.today,
        onchange: (e) => setDate(e.target.value),
      }),
    ),
    !isToday() && h('button', { type: 'button', class: 'past-banner', onclick: () => setDate(state.today) },
      `Logging a past day: ${shortDate(state.date)} · back to today`),

    h('div', { class: 'segmented', role: 'group', 'aria-label': 'Routine' },
      state.routines.map((r) => h('button', {
        type: 'button',
        'aria-pressed': String(r.id === state.routineId),
        onclick: () => { state.routineId = r.id; render(); },
      }, r.name)),
    ),
    routine.subtitle && h('p', { class: 'note' }, routine.subtitle),

    h('ul', { class: 'exercise-list' }, rows.map(({ item, done, last }) => h('li', {},
      h('button', {
        type: 'button',
        class: 'exercise' + (done.length ? ' done' : ''),
        onclick: () => openExercise(item.exerciseId),
      },
        h('span', { class: 'ex-top' },
          h('span', { class: 'ex-name' }, item.exercise.name,
            item.optional && h('span', { class: 'muted' }, ' · optional')),
          h('span', { class: 'muted' }, target(item)),
        ),
        h('span', { class: 'ex-last' },
          last ? `${shortDate(last.date)}: ${fmtSession(last.sets)}` : 'No history yet'),
        progressionHint(item, last) && done.length === 0 && h('span', { class: 'ex-hint' },
          icon('up'), ' Add weight'),
        done.length > 0 && h('span', { class: 'ex-done' }, icon('check'),
          ` ${done.length} ${done.length === 1 ? 'set' : 'sets'} ${dayWord}`),
      ),
    ))),
  );
}

// ---- Exercise view ----

// Starting numbers for the next set (index i): last session's set i.
// If you changed the weight on your previous set today, carry that forward.
function prefill(i, done, lastSets, item) {
  const prevToday = done[i - 1];
  const lastI = lastSets[i];
  let weight = lastI ? lastI.weight : prevToday ? prevToday.weight
    : lastSets.length ? lastSets[lastSets.length - 1].weight : null;
  const lastPrev = lastSets[i - 1];
  if (prevToday && lastPrev && prevToday.weight !== lastPrev.weight) weight = prevToday.weight;
  const reps = lastI ? lastI.reps : prevToday ? prevToday.reps
    : lastSets.length ? lastSets[lastSets.length - 1].reps : item.reps.min;
  return { weight, reps };
}

async function exerciseView() {
  const routine = currentRoutine();
  const item = routine.items.find((it) => it.exerciseId === state.exerciseId);
  const [done, last] = await Promise.all([
    getSetsOn(item.exerciseId, state.date),
    getLastSession(item.exerciseId, state.date),
  ]);
  const lastSets = last ? last.sets : [];
  const planned = Math.max(lastSets.length, item.sets.min);
  const next = done.length; // index of the next set
  const showEditor = next < planned || state.extraSet;

  const key = `${item.exerciseId}|${state.date}|${next}`;
  if (draft.key !== key) draft = { key, ...prefill(next, done, lastSets, item) };

  return h('div', { class: 'exercise-view' },
    h('button', { type: 'button', class: 'back-btn', onclick: backToList }, icon('back'), 'Exercises'),
    h('h2', { class: 'ex-title' }, item.exercise.name),
    h('p', { class: 'muted ex-sub' }, `Target ${target(item)}`),
    h('p', { class: 'ex-last' },
      last ? `Last (${shortDate(last.date)}): ${fmtSession(lastSets)}` : 'No history yet'),
    !isToday() && h('p', { class: 'past-note' }, `Logging for ${shortDate(state.date)}`),

    done.length > 0 && h('ol', { class: 'saved-sets' }, done.map((set, i) => h('li', {},
      h('span', { class: 'set-no' }, String(i + 1)),
      h('span', { class: 'set-val' }, fmtOne(set)),
      h('span', { class: 'set-check', title: 'Saved' }, icon('check')),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Delete set ${i + 1}`,
        onclick: async () => {
          if (!confirm(`Delete set ${i + 1} (${fmtOne(set)})?`)) return;
          await deleteSet(set.id);
          render();
        },
      }, icon('trash')),
    ))),

    showEditor && hintCard(progressionHint(item, last), done),

    showEditor
      ? editor({ item, done, next, planned, lastSets })
      : h('div', { class: 'all-done' },
        h('p', { class: 'all-done-text' }, `All ${planned} sets done `, icon('check')),
        h('button', { type: 'button', class: 'secondary', onclick: () => { state.extraSet = true; render(); } }, icon('plus'), 'Add set'),
        h('button', { type: 'button', class: 'primary', onclick: backToList }, 'Back to exercises'),
      ),
  );
}

// "10 reps on every set last time: try 47.5 kg  [Use 47.5 kg]".
// Hidden once a set today already uses that weight or more.
function hintCard(hint, done) {
  if (!hint || done.some((s) => s.weight >= hint.weight)) return null;
  const using = draft.weight === hint.weight;
  return h('div', { class: 'hint' },
    h('p', {}, icon('up'), ` ${hint.reps} reps on every set last time: try ${fmtWeight(hint.weight)} kg`),
    using
      ? h('p', { class: 'hint-using' }, icon('check'), ` Using ${fmtWeight(hint.weight)} kg`)
      : h('button', {
        type: 'button', class: 'secondary',
        onclick: () => { draft.weight = hint.weight; render(); },
      }, `Use ${fmtWeight(hint.weight)} kg`),
  );
}

function editor({ item, done, next, planned, lastSets }) {
  const save = h('button', { type: 'button', class: 'primary' }, 'Save set');
  const refresh = () => { save.disabled = !(validWeight(draft.weight) && validReps(draft.reps)); };

  save.addEventListener('click', async () => {
    if (save.disabled) return;
    save.disabled = true;
    const lastNo = done.length ? done[done.length - 1].setNo : 0;
    await addSet({
      date: state.date,
      exerciseId: item.exerciseId,
      routineId: state.routineId,
      setNo: lastNo + 1,
      weight: round2(draft.weight),
      reps: draft.reps,
      savedAt: Date.now(),
    });
    if (navigator.vibrate) navigator.vibrate(30); // tiny buzz = saved
    startRest();
    state.extraSet = false;
    // Keep the next set's Save button in view above the timer bar.
    await render();
    const next = root.querySelector('.editor, .all-done');
    if (next) next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const lastHere = lastSets[next];
  const view = h('div', { class: 'editor' },
    h('div', { class: 'editor-head' },
      h('strong', {}, next < planned ? `Set ${next + 1} of ${planned}` : `Set ${next + 1} (extra)`),
      lastHere && h('span', { class: 'muted' }, `last time: ${fmtOne(lastHere)}`),
    ),
    stepper({
      label: 'Weight', unit: 'kg', step: WEIGHT_STEP, decimal: true, value: draft.weight,
      onChange: (v) => { draft.weight = v; refresh(); },
    }),
    stepper({
      label: 'Reps', unit: 'reps', step: REPS_STEP, decimal: false, value: draft.reps,
      onChange: (v) => { draft.reps = v; refresh(); },
    }),
    save,
  );
  refresh();
  return view;
}
