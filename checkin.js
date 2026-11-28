// Monthly check-in (inside the Body tab): body measurements in cm.
// (Progress photos are added to this screen in a later step.)

import { getCheckins, saveCheckin, deleteCheckin, MEASUREMENTS } from './db.js';
import { h, icon, todayStr, shortDate, round2, stepper, daysBetween } from './ui.js';

const STEP = 0.5; // cm
const DUE_AFTER_DAYS = 30;

export const MEASURE_LABELS = { waist: 'Waist', hips: 'Hips', glutes: 'Glutes', thighs: 'Thighs' };
const valid = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 300;
const cm = (v) => `${v.toFixed(1)} cm`;

const state = { date: todayStr(), today: todayStr() };
// Numbers being edited, kept across re-renders of the same date.
let draft = { key: null, values: {} };
let container;
let onSaved = () => {}; // lets the Body tab refresh its "due" dot

// True when a check-in is due: none yet, or the last one is over 30 days old.
export async function checkinDue() {
  const [latest] = await getCheckins();
  return !latest || daysBetween(latest.date, todayStr()) > DUE_AFTER_DAYS;
}

export function renderCheckin(el, afterChange) {
  container = el;
  if (afterChange) onSaved = afterChange;
  state.today = todayStr();
  if (state.date > state.today) state.date = state.today;
  return render();
}

async function render() {
  const checkins = await getCheckins(); // newest first
  const existing = checkins.find((c) => c.date === state.date);
  // For reference: the check-in before this date.
  const previous = checkins.find((c) => c.date < state.date);

  if (draft.key !== state.date) {
    const start = existing || previous || {};
    draft = { key: state.date, values: Object.fromEntries(MEASUREMENTS.map((k) => [k, start[k] ?? null])) };
  }

  const save = h('button', { type: 'button', class: 'primary' }, existing ? 'Update check-in' : 'Save check-in');
  const refresh = () => {
    const vals = Object.values(draft.values);
    // At least one measurement, and nothing half-typed.
    save.disabled = !vals.some(valid) || vals.some((v) => v != null && !valid(v));
  };
  save.addEventListener('click', async () => {
    if (save.disabled) return;
    save.disabled = true;
    const values = {};
    for (const k of MEASUREMENTS) if (valid(draft.values[k])) values[k] = round2(draft.values[k]);
    await saveCheckin(state.date, values);
    if (navigator.vibrate) navigator.vibrate(30);
    onSaved();
  });

  container.replaceChildren(h('div', { class: 'checkin-view' },
    h('div', { class: 'editor' },
      h('div', { class: 'date-row' },
        h('label', { class: 'date-label', for: 'checkin-date' }, 'Date'),
        h('input', {
          id: 'checkin-date', type: 'date', class: 'date-input', value: state.date, max: state.today,
          onchange: (e) => { if (e.target.value) { state.date = e.target.value; render(); } },
        }),
      ),
      h('p', { class: 'note' }, previous
        ? `Last check-in: ${shortDate(previous.date)}. Measure the same spots each time.`
        : 'Measure the same spots each time, ideally in the morning.'),
      MEASUREMENTS.map((k) => stepper({
        label: MEASURE_LABELS[k],
        note: previous && valid(previous[k]) ? `last ${cm(previous[k])}` : null,
        unit: 'cm', step: STEP, decimal: true, value: draft.values[k],
        onChange: (v) => { draft.values[k] = v; refresh(); },
      })),
      save,
    ),

    checkins.length > 0 && h('h2', { class: 'list-title' }, 'Check-ins'),
    checkins.length > 0 && h('ul', { class: 'weight-list checkin-list' }, checkins.map((c) => h('li', {},
      h('span', { class: 'w-date' },
        h('strong', {}, shortDate(c.date)),
        h('span', { class: 'checkin-values' },
          MEASUREMENTS.filter((k) => valid(c[k])).map((k) => `${MEASURE_LABELS[k]} ${c[k].toFixed(1)}`).join(' · '))),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Delete check-in of ${shortDate(c.date)}`,
        onclick: async () => {
          if (!confirm(`Delete the check-in of ${shortDate(c.date)}?`)) return;
          await deleteCheckin(c.date);
          if (draft.key === c.date) draft.key = null;
          onSaved();
        },
      }, icon('trash')),
    ))),
  ));
  refresh();
}
