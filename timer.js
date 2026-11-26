// Rest timer: starts when a set is saved. Shown as a pink bar above the tabs.
//
// It counts down from a fixed end time (not by counting ticks), so it stays
// correct even if the phone pauses the app for a moment. While it runs, the
// screen is kept awake: Android pauses web apps when the screen locks, and
// then the buzz couldn't happen on time.

import { h, icon } from './ui.js';

const REST_SECONDS = 120;
const EXTRA_SECONDS = 30;
const SHOW_DONE_MS = 5000;  // how long "Rest over" stays visible
const STALE_MS = 60000;     // finished over a minute ago (app was closed): no buzz
// sessionStorage = scratch memory for this app session only, so the timer
// survives the automatic reload when a new app version arrives.
const STORE_KEY = 'gym-tracker-rest';

let endsAt = null;
let totalMs = REST_SECONDS * 1000;
let tickId = null;
let hideId = null;
let wakeLock = null;
let wakeLockPending = false;

let bar, fill, label, time, addBtn, skipBtn;

export function initTimer() {
  bar = document.getElementById('rest-bar');
  fill = h('div', { class: 'rest-fill' });
  label = h('span', { class: 'rest-label' }, 'Rest');
  time = h('span', { class: 'rest-time' });
  addBtn = h('button', { type: 'button', class: 'rest-btn', 'aria-label': 'Add 30 seconds', onclick: addTime },
    icon('plus'), `${EXTRA_SECONDS}s`);
  skipBtn = h('button', { type: 'button', class: 'rest-btn', onclick: stop }, 'Skip');
  bar.replaceChildren(
    h('div', { class: 'rest-track' }, fill),
    h('div', { class: 'rest-row' }, label, time, addBtn, skipBtn),
  );
  bar.addEventListener('click', (e) => { if (bar.classList.contains('done') && !e.target.closest('button')) hide(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && endsAt) {
      tick();
      keepAwake();
    }
  });

  const saved = load();
  if (saved && saved.endsAt > Date.now()) run(saved.endsAt, saved.totalMs);
}

// Called after each saved set: (re)starts at 2:00.
export function startRest() {
  run(Date.now() + REST_SECONDS * 1000, REST_SECONDS * 1000);
}

function run(end, total) {
  endsAt = end;
  totalMs = total;
  save();
  clearTimeout(hideId);
  bar.classList.remove('done');
  label.textContent = 'Rest';
  time.hidden = addBtn.hidden = skipBtn.hidden = false;
  bar.hidden = false;
  keepAwake();
  if (!tickId) tickId = setInterval(tick, 250);
  tick();
}

function addTime() {
  if (!endsAt) return;
  endsAt += EXTRA_SECONDS * 1000;
  totalMs += EXTRA_SECONDS * 1000;
  save();
  tick();
}

function tick() {
  if (!endsAt) return;
  const left = endsAt - Date.now();
  if (left <= 0) {
    finish(-left);
    return;
  }
  const secs = Math.ceil(left / 1000);
  time.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  fill.style.width = `${(left / totalMs) * 100}%`;
}

function finish(overdueMs) {
  clearRunning();
  if (overdueMs > STALE_MS) {
    hide();
    return;
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]); // short double buzz
  bar.classList.add('done');
  label.textContent = 'Rest over · next set';
  time.hidden = addBtn.hidden = skipBtn.hidden = true;
  fill.style.width = '0%';
  hideId = setTimeout(hide, SHOW_DONE_MS);
}

function stop() {
  clearRunning();
  hide();
}

function clearRunning() {
  endsAt = null;
  save();
  clearInterval(tickId);
  tickId = null;
  releaseWakeLock();
}

function hide() {
  clearTimeout(hideId);
  bar.hidden = true;
  bar.classList.remove('done');
}

// ---- Keep the screen on while resting ----
async function keepAwake() {
  if (!('wakeLock' in navigator) || wakeLock || wakeLockPending) return;
  if (document.visibilityState !== 'visible') return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!endsAt) { lock.release(); return; } // timer ended meanwhile
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch {
    // Not allowed right now (e.g. battery saver); the timer still works.
  } finally {
    wakeLockPending = false;
  }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

// ---- Remember a running timer across the update reload ----
function save() {
  try {
    if (endsAt) sessionStorage.setItem(STORE_KEY, JSON.stringify({ endsAt, totalMs }));
    else sessionStorage.removeItem(STORE_KEY);
  } catch { /* not available: fine */ }
}

function load() {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch { return null; }
}
