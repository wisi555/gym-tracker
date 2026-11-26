// The Body tab: morning weight with the 7-day average as the main number.
// (Macros come in a later step.)

import { getWeights, saveWeight, deleteWeight } from './db.js';
import { h, icon, todayStr, shortDate, addDays, round2, stepper } from './ui.js';

const WEIGHT_STEP = 0.1;
const validBodyWeight = (w) => typeof w === 'number' && Number.isFinite(w) && w > 0 && w < 500;

const state = { date: todayStr(), today: todayStr() };
// The number being edited, kept across re-renders of the same date.
let draft = { key: null, weight: null };
let root;

export async function initBody(container) {
  root = container;
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

// Average of the weigh-ins from the last 7 days (today included).
function sevenDayAverage(weights) {
  const from = addDays(state.today, -6);
  const week = weights.filter((w) => w.date >= from && w.date <= state.today);
  if (!week.length) return null;
  return week.reduce((sum, w) => sum + w.weight, 0) / week.length;
}

async function render() {
  const weights = await getWeights(); // newest first
  const avg = sevenDayAverage(weights);
  const existing = weights.find((w) => w.date === state.date);

  // Start from this day's weigh-in, else the closest earlier one.
  if (draft.key !== state.date) {
    const start = weights.find((w) => w.date <= state.date) || weights[weights.length - 1];
    draft = { key: state.date, weight: start ? start.weight : null };
  }

  const save = h('button', { type: 'button', class: 'primary' }, existing ? 'Update weight' : 'Save weight');
  const refresh = () => { save.disabled = !validBodyWeight(draft.weight); };
  save.addEventListener('click', async () => {
    if (save.disabled) return;
    save.disabled = true;
    await saveWeight(state.date, round2(draft.weight));
    if (navigator.vibrate) navigator.vibrate(30); // tiny buzz = saved
    render();
  });

  const recent = weights.filter((w) => w.date >= addDays(state.today, -13));

  root.replaceChildren(h('div', { class: 'body-view' },
    h('div', { class: 'avg-card' },
      h('span', { class: 'avg-label' }, '7-day average'),
      h('span', { class: 'avg-value' }, avg == null ? '–' : avg.toFixed(1),
        avg != null && h('span', { class: 'avg-unit' }, 'kg')),
    ),

    h('div', { class: 'editor' },
      h('div', { class: 'date-row' },
        h('label', { class: 'date-label', for: 'body-date' }, 'Date'),
        h('input', {
          id: 'body-date', type: 'date', class: 'date-input', value: state.date, max: state.today,
          onchange: (e) => { if (e.target.value) { state.date = e.target.value; render(); } },
        }),
      ),
      stepper({
        label: 'Morning weight', unit: 'kg', step: WEIGHT_STEP, decimal: true, value: draft.weight,
        onChange: (v) => { draft.weight = v; refresh(); },
      }),
      save,
    ),

    recent.length > 0 && h('h2', { class: 'list-title' }, 'Last 14 days'),
    recent.length > 0 && h('ul', { class: 'weight-list' }, recent.map((w) => h('li', {},
      h('span', { class: 'w-date' }, shortDate(w.date)),
      h('span', { class: 'w-val' }, `${w.weight.toFixed(1)} kg`),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Delete weigh-in of ${shortDate(w.date)}`,
        onclick: async () => {
          if (!confirm(`Delete ${w.weight.toFixed(1)} kg on ${shortDate(w.date)}?`)) return;
          await deleteWeight(w.date);
          if (draft.key === w.date) draft.key = null;
          render();
        },
      }, icon('trash')),
    ))),
  ));
  refresh();
}
