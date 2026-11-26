// Macros view (inside the Body tab): paste the day's summary from the user's
// own Claude session, or tap a number to type it.

import { getMacros, saveMacros, deleteMacros } from './db.js';
import { h, icon, todayStr, shortDate, addDays, parseNum } from './ui.js';

export const FIELDS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', words: ['calories', 'calorie', 'kcal', 'energy'] },
  { key: 'protein', label: 'Protein', unit: 'g', words: ['protein', 'proteins'] },
  { key: 'carbs', label: 'Carbs', unit: 'g', words: ['carbs', 'carb', 'carbohydrates', 'carbohydrate'] },
  { key: 'fat', label: 'Fat', unit: 'g', words: ['fat', 'fats'] },
  { key: 'fiber', label: 'Fiber', unit: 'g', words: ['fiber', 'fibre'] },
];

// ---- Reading the pasted text ----

// "1,930" → 1930 (thousands comma); "82,5" → 82.5 (decimal comma).
function toNumber(text) {
  let t = text;
  if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const NUM = '~?\\s*(\\d[\\d.,]*\\d|\\d)';

function matchField(line, field, atLineStart) {
  const body = `(?:${field.words.join('|')})\\b[^0-9\\n]{0,12}?${NUM}`
    + `\\s*(?:k?cal|g)?\\s*(?:(?:of|out of|/)\\s*${NUM})?`;
  const re = new RegExp(atLineStart ? `^[\\s*_\\-•#>\`]*${body}` : `\\b${body}`, 'i');
  const m = line.match(re);
  if (!m) return null;
  return { eaten: toNumber(m[1]), target: m[2] ? toNumber(m[2]) : null };
}

// Finds the day's numbers in pasted text. Two formats work:
//  1. The agreed line:  MACROS kcal 1930/2150 · protein 110/120 · ...
//  2. Claude's usual list: "Calories: ~1,930 of 2,150 (−220)" one per line.
// Returns { eaten, target } (only the numbers found).
export function parseMacros(text) {
  const eaten = {};
  const target = {};
  const lines = String(text).split(/\r?\n/);
  const macrosLine = [...lines].reverse().find((l) => /^[\s*_#>`]*MACROS\b/i.test(l));
  for (const field of FIELDS) {
    let found = null;
    if (macrosLine) {
      found = matchField(macrosLine, field, false);
    } else {
      // Only lines that START with the word, so "low fat yogurt 200 g" in a
      // food list isn't mistaken for the total. The last such line wins.
      for (const line of lines) found = matchField(line, field, true) || found;
    }
    if (found && found.eaten != null) {
      eaten[field.key] = found.eaten;
      if (found.target != null) target[field.key] = found.target;
    }
  }
  return { eaten, target };
}

// ---- Screen ----

const state = { date: todayStr(), today: todayStr(), pasteBox: false, preview: null };
let container;

export function initMacros() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = todayStr();
    if (now === state.today) return;
    if (state.date === state.today) state.date = now;
    state.today = now;
    if (container && container.isConnected) render();
  });
}

export function renderMacros(el) {
  container = el;
  return render();
}

const fmt = (n) => (n == null ? '–' : Math.round(n).toLocaleString());

async function render() {
  const days = await getMacros(); // newest first
  const day = days.find((d) => d.date === state.date);
  // Targets for a day without its own: the latest known ones.
  const latestTarget = (days.find((d) => Object.keys(d.target).length) || { target: {} }).target;
  const eaten = day ? day.eaten : {};
  const target = day && Object.keys(day.target).length ? day.target : latestTarget;
  const recent = days.filter((d) => d.date >= addDays(state.today, -6));

  container.replaceChildren(h('div', { class: 'macros-view' },
    h('div', { class: 'date-row' },
      h('label', { class: 'date-label', for: 'macros-date' }, 'Date'),
      h('input', {
        id: 'macros-date', type: 'date', class: 'date-input', value: state.date, max: state.today,
        onchange: (e) => {
          if (!e.target.value) return;
          state.date = e.target.value;
          state.preview = null;
          state.pasteBox = false;
          render();
        },
      }),
    ),

    state.preview ? previewCard(day) : pasteArea(),

    h('div', { class: 'panel macro-rows' }, FIELDS.map((f) => macroRow(f, eaten, target, day))),

    recent.length > 0 && h('h2', { class: 'list-title' }, 'Last 7 days'),
    recent.length > 0 && h('ul', { class: 'weight-list' }, recent.map((d) => h('li', {},
      h('span', { class: 'w-date' }, shortDate(d.date)),
      h('span', { class: 'w-val' },
        `${fmt(d.eaten.kcal)} kcal · ${fmt(d.eaten.protein)} g protein`),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Delete macros of ${shortDate(d.date)}`,
        onclick: async () => {
          if (!confirm(`Delete the macros of ${shortDate(d.date)}?`)) return;
          await deleteMacros(d.date);
          render();
        },
      }, icon('trash')),
    ))),
  ));
}

// Big "Paste from Claude" button. If the phone won't let the app read the
// clipboard, a box appears to long-press and paste into instead.
function pasteArea() {
  const box = h('textarea', {
    class: 'paste-box', rows: '4', placeholder: 'Long-press here and choose Paste',
    oninput: () => tryText(box.value, false),
  });
  return h('div', { class: 'paste-area' },
    h('button', {
      type: 'button', class: 'primary',
      onclick: async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (tryText(text, true)) return;
        } catch {
          // Reading the clipboard isn't allowed: fall back to the box.
        }
        state.pasteBox = true;
        render().then(() => { const b = container.querySelector('.paste-box'); if (b) b.focus(); });
      },
    }, icon('paste'), 'Paste from Claude'),
    state.pasteBox && box,
  );
}

function tryText(text, fromButton) {
  const parsed = parseMacros(text || '');
  if (!Object.keys(parsed.eaten).length) {
    if (fromButton) {
      alert('No macros found in what you copied. Copy your Claude\'s summary (or its MACROS line) and try again.');
    }
    return false;
  }
  state.preview = parsed;
  state.pasteBox = false;
  render();
  return true;
}

// "Found: ..." with Save / Cancel, before anything is stored.
function previewCard(day) {
  const { eaten, target } = state.preview;
  return h('div', { class: 'hint' },
    h('p', {}, `Found for ${shortDate(state.date)}:`),
    h('ul', { class: 'preview-list' }, FIELDS.filter((f) => eaten[f.key] != null).map((f) => h('li', {},
      h('span', {}, f.label),
      h('span', {}, `${fmt(eaten[f.key])}${target[f.key] != null ? ` / ${fmt(target[f.key])}` : ''} ${f.unit}`),
    ))),
    h('button', {
      type: 'button', class: 'primary',
      onclick: async () => {
        await saveMacros(state.date, eaten, target);
        if (navigator.vibrate) navigator.vibrate(30);
        state.preview = null;
        render();
      },
    }, icon('check'), day ? 'Replace this day' : 'Save'),
    h('button', { type: 'button', class: 'secondary quiet', onclick: () => { state.preview = null; render(); } }, 'Cancel'),
  );
}

// "Protein   110 / 120 g" with a thin bar. Tap to type the number by hand.
function macroRow(field, eaten, target, day) {
  const value = eaten[field.key];
  const goal = target[field.key];
  const pct = value != null && goal ? Math.min(100, (value / goal) * 100) : 0;
  const over = value != null && goal && value > goal;
  return h('button', {
    type: 'button', class: 'macro-row',
    'aria-label': `${field.label}: tap to type`,
    onclick: async () => {
      const typed = prompt(`${field.label} eaten on ${shortDate(state.date)} (${field.unit}):`, value ?? '');
      if (typed == null) return;
      const n = parseNum(typed);
      if (typed.trim() !== '' && !(n >= 0)) { alert('Please type a number.'); return; }
      const newEaten = { ...(day ? day.eaten : {}) };
      if (typed.trim() === '') delete newEaten[field.key];
      else newEaten[field.key] = n;
      await saveMacros(state.date, newEaten, day && Object.keys(day.target).length ? day.target : target);
      render();
    },
  },
    h('span', { class: 'macro-top' },
      h('span', { class: 'macro-label' }, field.label),
      h('span', { class: 'macro-val' },
        h('strong', {}, fmt(value)),
        goal != null && h('span', { class: 'muted' }, ` / ${fmt(goal)}`),
        h('span', { class: 'muted' }, ` ${field.unit}`)),
    ),
    goal != null && h('span', { class: 'macro-track' },
      h('span', { class: 'macro-fill' + (over ? ' over' : ''), style: `width: ${pct}%` })),
  );
}
