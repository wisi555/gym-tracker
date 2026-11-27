// The Progress tab: Streak | Strength | Body.
//  Streak:   weekly streak (2+ gym days a week), last 8 weeks, growing stats.
//  Strength: each exercise's heaviest weight per session over time.
//  Body:     weekly averages of weight, calories or protein.

import { getAllSets, getRoutines, getMeta, setMeta, getWeights, getMacros } from './db.js';
import {
  h, icon, todayStr, shortDate, addDays, weekStart, daysBetween, fmtNum, fmtSession,
} from './ui.js';
import { lineChart } from './chart.js';

const STREAK_DAYS = 2;     // gym days per week to keep the streak
const BAR_WEEKS = 8;       // weeks shown in the bars
const RECENT_DAYS = 91;    // "3 months" for exercise charts
const RECENT_WEEKS = 12;   // "12 weeks" for body charts

const state = {
  view: 'streak',          // streak | strength | body
  exerciseId: null,        // open exercise in Strength
  strengthSpan: 'recent',  // recent | all
  metric: 'weight',        // weight | kcal | protein
  bodySpan: 'recent',
};

let root;
let renderSeq = 0;

export function initProgress(container) {
  root = container;
  // The phone's back gesture closes an open exercise.
  window.addEventListener('popstate', () => {
    if (state.exerciseId && !(history.state && history.state.progress)) {
      state.exerciseId = null;
      render();
    }
  });
}

// Called whenever the Progress tab is shown, so numbers are always fresh.
export function showProgress() {
  return render();
}

function segmented(options, current, onPick, extraClass = '') {
  return h('div', { class: `segmented ${extraClass}`, role: 'group' },
    options.map(([id, name]) => h('button', {
      type: 'button', 'aria-pressed': String(current === id), onclick: () => onPick(id),
    }, name)));
}

async function render() {
  if (!root) return;
  const seq = ++renderSeq;
  let view;
  try {
    if (state.exerciseId) view = await exerciseView();
    else {
      const content = state.view === 'strength' ? await strengthView()
        : state.view === 'body' ? await bodyView() : await streakView();
      view = h('div', {},
        segmented([['streak', 'Streak'], ['strength', 'Strength'], ['body', 'Body']], state.view,
          (id) => { state.view = id; render(); }),
        content);
    }
  } catch (err) {
    console.error(err);
    view = h('p', { class: 'error' }, 'Something went wrong: ' + (err && err.message ? err.message : err));
  }
  if (seq === renderSeq) root.replaceChildren(view);
}

// ---- Streak ----

// Pure calculation (exported for tests).
// gymDates: sorted unique 'YYYY-MM-DD'; excused: Set of week-start dates.
export function streakStats(gymDates, excused, today) {
  const thisWeek = weekStart(today);
  const perWeek = new Map();
  for (const d of gymDates) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) || 0) + 1);
  const count = (w) => perWeek.get(w) || 0;
  if (!gymDates.length) return { current: 0, best: 0, perWeek, thisWeek, firstWeek: null };
  const firstWeek = weekStart(gymDates[0]);

  // Current: walk back from this week. This week only counts once it has 2+
  // days (it's still in progress, so it never breaks the streak). Excused
  // weeks keep the streak alive without adding to it.
  let current = count(thisWeek) >= STREAK_DAYS ? 1 : 0;
  for (let w = addDays(thisWeek, -7); w >= firstWeek; w = addDays(w, -7)) {
    if (count(w) >= STREAK_DAYS) current++;
    else if (!excused.has(w)) break;
  }

  // Best: walk forward through every week.
  let best = 0;
  let run = 0;
  for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
    if (count(w) >= STREAK_DAYS) { run++; best = Math.max(best, run); } else if (w !== thisWeek && !excused.has(w)) run = 0;
  }
  return { current, best, perWeek, thisWeek, firstWeek };
}

async function streakView() {
  const today = todayStr();
  const [sets, excusedList] = await Promise.all([getAllSets(), getMeta('excusedWeeks')]);
  const excused = new Set(excusedList || []);
  const gymDates = [...new Set(sets.map((x) => x.date))].sort();
  const { current, best, perWeek, thisWeek, firstWeek } = streakStats(gymDates, excused, today);

  const weeks = [];
  for (let i = BAR_WEEKS - 1; i >= 0; i--) weeks.push(addDays(thisWeek, -7 * i));
  const scaleMax = Math.max(4, ...weeks.map((w) => perWeek.get(w) || 0));

  const toggleExcuse = async (w) => {
    const label = shortDate(w);
    const isExcused = excused.has(w);
    const ok = confirm(isExcused
      ? `Remove the excuse for the week of ${label}? It will count as missed.`
      : `Excuse the week of ${label}? (Ill, travelling…) It won't break your streak.`);
    if (!ok) return;
    if (isExcused) excused.delete(w); else excused.add(w);
    await setMeta('excusedWeeks', [...excused].sort());
    render();
  };

  const bars = h('div', { class: 'week-bars' },
    h('div', { class: 'week-goal', style: `bottom: calc(28px + ${(STREAK_DAYS / scaleMax) * 100}px)` }),
    weeks.map((w) => {
      const n = perWeek.get(w) || 0;
      const isNow = w === thisWeek;
      const started = firstWeek && w >= firstWeek;
      const missed = started && !isNow && n < STREAK_DAYS;
      const kind = n >= STREAK_DAYS ? 'met' : excused.has(w) && missed ? 'excused'
        : isNow ? 'now' : missed ? 'missed' : 'before';
      const [y, m, d] = w.split('-').map(Number);
      const label = isNow ? 'Now'
        : new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' });
      const col = [
        h('span', { class: 'wb-count' }, kind === 'excused' ? 'off' : n ? String(n) : ''),
        h('span', { class: `wb-bar ${kind}`, style: `height: ${Math.max(n, kind === 'excused' ? scaleMax : 0) / scaleMax * 100}px` }),
        h('span', { class: 'wb-label' }, label),
      ];
      return missed
        ? h('button', {
          type: 'button', class: 'wb-col',
          'aria-label': `Week of ${shortDate(w)}: ${n} gym days. Tap to ${excused.has(w) ? 'remove the excuse' : 'excuse it'}.`,
          onclick: () => toggleExcuse(w),
        }, col)
        : h('div', { class: 'wb-col', 'aria-label': `Week of ${shortDate(w)}: ${n} gym days` }, col);
    }));

  const totalKg = sets.reduce((sum, x) => sum + x.weight * x.reps, 0);
  const sinceFirst = gymDates.length ? daysBetween(gymDates[0], today) : null;
  const weeksWord = (n) => (n === 1 ? 'week' : 'weeks');
  const tile = (value, label) => h('div', { class: 'stat' },
    h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));

  return h('div', { class: 'progress-view' },
    h('div', { class: 'avg-card' },
      h('span', { class: 'avg-label' }, `Weekly streak · ${STREAK_DAYS}+ gym days`),
      h('span', { class: 'avg-value' }, String(current), h('span', { class: 'avg-unit' }, weeksWord(current))),
    ),
    bars,
    h('p', { class: 'note center' }, 'Tap a missed week to excuse it.'),
    h('div', { class: 'stats' },
      tile(String(gymDates.length), 'gym visits'),
      tile(String(sets.length), 'sets logged'),
      tile(Math.round(totalKg).toLocaleString(), 'kg lifted in total'),
      tile(`${best} ${weeksWord(best)}`, 'best streak'),
      tile(sinceFirst == null ? '–' : String(sinceFirst), 'days since day one'),
      tile(sinceFirst == null ? '–' : String(Math.floor(sinceFirst / 7)), 'weeks since day one'),
    ),
  );
}

// ---- Strength ----

function topWeights(sets) {
  // exerciseId → [{ date, value: heaviest weight that day }] oldest first
  const map = new Map();
  for (const x of sets) {
    const byDate = map.get(x.exerciseId) || new Map();
    byDate.set(x.date, Math.max(byDate.get(x.date) ?? -Infinity, x.weight));
    map.set(x.exerciseId, byDate);
  }
  const out = new Map();
  for (const [id, byDate] of map) {
    out.set(id, [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value })));
  }
  return out;
}

async function strengthView() {
  const [sets, routines] = await Promise.all([getAllSets(), getRoutines()]);
  const tops = topWeights(sets);
  return h('div', { class: 'progress-view' }, routines.map((r) => h('section', {},
    h('h2', { class: 'list-title' }, r.name),
    h('ul', { class: 'exercise-list' }, r.items.map((it) => {
      const series = tops.get(it.exerciseId) || [];
      const latest = series[series.length - 1];
      return h('li', {}, h('button', {
        type: 'button', class: 'exercise',
        onclick: () => {
          state.exerciseId = it.exerciseId;
          history.pushState({ progress: it.exerciseId }, '');
          render().then(() => { document.querySelector('main').scrollTop = 0; });
        },
      }, h('span', { class: 'ex-top' },
        h('span', { class: 'ex-name' }, it.exercise.name),
        h('span', { class: latest ? 'ex-weight' : 'muted' }, latest ? `${fmtNum(latest.value)} kg` : 'No history yet'),
      )));
    })),
  )));
}

async function exerciseView() {
  const [sets, routines] = await Promise.all([getAllSets(), getRoutines()]);
  const exercise = routines.flatMap((r) => r.items).find((it) => it.exerciseId === state.exerciseId).exercise;
  const mine = sets.filter((x) => x.exerciseId === state.exerciseId);
  let points = topWeights(mine).get(state.exerciseId) || [];
  if (state.strengthSpan === 'recent') {
    const from = addDays(todayStr(), -RECENT_DAYS);
    points = points.filter((p) => p.date >= from);
  }
  const sessions = new Map();
  for (const x of mine.sort((a, b) => a.setNo - b.setNo || a.savedAt - b.savedAt)) {
    sessions.set(x.date, [...(sessions.get(x.date) || []), x]);
  }
  const dates = [...sessions.keys()].sort().reverse();

  return h('div', { class: 'progress-view' },
    h('button', {
      type: 'button', class: 'back-btn',
      onclick: () => { if (history.state && history.state.progress) history.back(); else { state.exerciseId = null; render(); } },
    }, icon('back'), 'Strength'),
    h('h2', { class: 'ex-title' }, exercise.name),
    segmented([['recent', '3 months'], ['all', 'All']], state.strengthSpan,
      (id) => { state.strengthSpan = id; render(); }, 'small'),
    h('div', { class: 'panel' },
      h('p', { class: 'chart-title' }, 'Heaviest weight per session'),
      lineChart({
        points,
        format: (v) => `${fmtNum(v)} kg`,
        describe: (p) => shortDate(p.date),
        emptyText: state.strengthSpan === 'recent' && dates.length ? 'Nothing in the last 3 months' : 'No sessions yet',
      })),
    dates.length > 0 && h('h2', { class: 'list-title' }, 'Sessions'),
    dates.length > 0 && h('ul', { class: 'weight-list' }, dates.map((d) => h('li', {},
      h('span', { class: 'w-date' }, shortDate(d)),
      h('span', { class: 'w-val' }, fmtSession(sessions.get(d))),
    ))),
  );
}

// ---- Body ----

const METRICS = {
  weight: { name: 'Weight', title: 'Weekly average weight', format: (v) => `${v.toFixed(1)} kg` },
  kcal: { name: 'Calories', title: 'Weekly average calories', format: (v) => `${Math.round(v).toLocaleString()} kcal` },
  protein: { name: 'Protein', title: 'Weekly average protein', format: (v) => `${Math.round(v)} g` },
};

// [{ date, value }] daily → [{ date: week start, value: average }] oldest first
function weeklyAverages(daily) {
  const weeks = new Map();
  for (const { date, value } of daily) {
    const w = weekStart(date);
    const acc = weeks.get(w) || { sum: 0, n: 0 };
    acc.sum += value;
    acc.n += 1;
    weeks.set(w, acc);
  }
  return [...weeks].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, { sum, n }]) => ({ date, value: sum / n }));
}

async function bodyView() {
  const metric = METRICS[state.metric];
  let daily;
  let target = null;
  if (state.metric === 'weight') {
    daily = (await getWeights()).map((w) => ({ date: w.date, value: w.weight }));
  } else {
    const days = await getMacros(); // newest first
    daily = days.filter((d) => d.eaten[state.metric] != null).map((d) => ({ date: d.date, value: d.eaten[state.metric] }));
    const withTarget = days.find((d) => d.target[state.metric] != null);
    if (withTarget) target = withTarget.target[state.metric];
  }
  let points = weeklyAverages(daily);
  if (state.bodySpan === 'recent') {
    const from = addDays(weekStart(todayStr()), -7 * (RECENT_WEEKS - 1));
    points = points.filter((p) => p.date >= from);
  }

  return h('div', { class: 'progress-view' },
    segmented(Object.entries(METRICS).map(([id, m]) => [id, m.name]), state.metric,
      (id) => { state.metric = id; render(); }, 'small'),
    segmented([['recent', '12 weeks'], ['all', 'All']], state.bodySpan,
      (id) => { state.bodySpan = id; render(); }, 'small'),
    h('div', { class: 'panel' },
      h('p', { class: 'chart-title' }, metric.title),
      lineChart({
        points,
        format: metric.format,
        describe: (p) => `week of ${shortDate(p.date)}`,
        target,
        emptyText: state.metric === 'weight' ? 'No weigh-ins yet' : 'No macros yet',
      })),
  );
}
