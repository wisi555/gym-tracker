// The Log tab: pick a date and routine, see exercises with last session,
// open one and log sets.

import {
  getRoutines, getSetsOn, getLastSession, getSetsByDate, getLatestSet, addSet, deleteSet,
} from './db.js';
import { h, icon, todayStr, shortDate } from './ui.js';

const WEIGHT_STEP = 2.5;
const REPS_STEP = 1;

// ---- Small helpers ----

const round2 = (n) => Math.round(n * 100) / 100;
const fmtWeight = (w) => String(round2(w)); // 40, 22.5
const fmtSet = (s) => `${fmtWeight(s.weight)}×${s.reps}`;
const range = ({ min, max }) => (min === max ? String(min) : `${min}–${max}`);
const target = (item) => `${range(item.sets)} × ${range(item.reps)}`;

// Reads a typed number. Accepts "22,5" too (many Android keyboards type a
// comma as the decimal mark). Returns null if empty, NaN if not a number.
function parseNum(text) {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : NaN;
}

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
          last ? `${shortDate(last.date)}: ${last.sets.map(fmtSet).join(' · ')}` : 'No history yet'),
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
      last ? `Last (${shortDate(last.date)}): ${lastSets.map(fmtSet).join(' · ')}` : 'No history yet'),
    !isToday() && h('p', { class: 'past-note' }, `Logging for ${shortDate(state.date)}`),

    done.length > 0 && h('ol', { class: 'saved-sets' }, done.map((set, i) => h('li', {},
      h('span', { class: 'set-no' }, String(i + 1)),
      h('span', { class: 'set-val' }, `${fmtWeight(set.weight)} kg × ${set.reps}`),
      h('span', { class: 'set-check', title: 'Saved' }, icon('check')),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Delete set ${i + 1}`,
        onclick: async () => {
          if (!confirm(`Delete set ${i + 1} (${fmtWeight(set.weight)} kg × ${set.reps})?`)) return;
          await deleteSet(set.id);
          render();
        },
      }, icon('trash')),
    ))),

    showEditor
      ? editor({ item, done, next, planned, lastSets })
      : h('div', { class: 'all-done' },
        h('p', { class: 'all-done-text' }, `All ${planned} sets done `, icon('check')),
        h('button', { type: 'button', class: 'secondary', onclick: () => { state.extraSet = true; render(); } }, icon('plus'), 'Add set'),
        h('button', { type: 'button', class: 'primary', onclick: backToList }, 'Back to exercises'),
      ),
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
    state.extraSet = false;
    render();
  });

  const lastHere = lastSets[next];
  const view = h('div', { class: 'editor' },
    h('div', { class: 'editor-head' },
      h('strong', {}, next < planned ? `Set ${next + 1} of ${planned}` : `Set ${next + 1} (extra)`),
      lastHere && h('span', { class: 'muted' }, `last time ${fmtSet(lastHere)}`),
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

// [ − ]  40 kg  [ + ]   (tap the number to type it)
function stepper({ label, unit, step, decimal, value, onChange }) {
  const show = (v) => (v == null || Number.isNaN(v) ? '' : fmtWeight(v));
  const input = h('input', {
    type: 'text', class: 'num', value: show(value), placeholder: '–',
    inputmode: decimal ? 'decimal' : 'numeric', enterkeyhint: 'done', 'aria-label': label,
    autocomplete: 'off',
  });
  const set = (v) => { value = v; input.value = show(v); onChange(v); };
  const base = () => (validWeight(value) ? value : 0);

  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => { value = parseNum(input.value); onChange(value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

  return h('div', { class: 'stepper' },
    h('span', { class: 'stepper-label' }, label),
    h('div', { class: 'stepper-row' },
      h('button', {
        type: 'button', class: 'step', 'aria-label': `${label} minus ${step}`,
        onclick: () => set(Math.max(0, round2(base() - step))),
      }, icon('minus', 'icon icon-lg')),
      h('label', { class: 'num-wrap' }, input, h('span', { class: 'unit' }, unit)),
      h('button', {
        type: 'button', class: 'step', 'aria-label': `${label} plus ${step}`,
        onclick: () => set(round2(base() + step)),
      }, icon('plus', 'icon icon-lg')),
    ),
  );
}
