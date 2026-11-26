// App entry point.
import { openDB, getRoutines, requestPersistentStorage } from './db.js';

// ---- Tabs ----
const titles = { log: 'Log', body: 'Body', progress: 'Progress' };

function showTab(name) {
  for (const btn of document.querySelectorAll('.tabbar button')) {
    if (btn.dataset.tab === name) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  for (const section of document.querySelectorAll('.tab')) {
    section.hidden = section.id !== 'tab-' + name;
  }
  document.getElementById('title').textContent = titles[name];
}

for (const btn of document.querySelectorAll('.tabbar button')) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}

// ---- Offline support and updates ----
// The service worker (sw.js) keeps a copy of the app on the phone.
async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // When a new version takes over, reload once so the new files are used.
  // Skipped on the very first install (nothing old to replace), but later
  // updates in that same session still reload.
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  // updateViaCache: 'none' = always check GitHub for a newer sw.js.
  const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });

  // Check for a new version whenever the app comes back to the screen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });

  showVersion();
}

// Ask the service worker which version is running and show it in the corner.
async function showVersion() {
  const reg = await navigator.serviceWorker.ready;
  const channel = new MessageChannel();
  channel.port1.onmessage = (e) => {
    document.getElementById('version').textContent = 'v' + e.data;
  };
  reg.active.postMessage('GET_VERSION', [channel.port2]);
}

setupServiceWorker();

// ---- Data ----
// "3–3" reads better as "3".
function range({ min, max }) {
  return min === max ? String(min) : `${min}–${max}`;
}

async function showRoutines() {
  const box = document.getElementById('routines');
  box.replaceChildren();
  for (const r of await getRoutines()) {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h2');
    h.textContent = r.name;
    if (r.subtitle) {
      const sub = document.createElement('span');
      sub.className = 'muted';
      sub.textContent = ' · ' + r.subtitle;
      h.append(sub);
    }
    const list = document.createElement('ul');
    for (const it of r.items) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = it.exercise.name + (it.optional ? ' (optional)' : '');
      const target = document.createElement('span');
      target.className = 'muted';
      target.textContent = `${range(it.sets)} × ${range(it.reps)}`;
      li.append(name, target);
      list.append(li);
    }
    card.append(h, list);
    box.append(card);
  }
}

async function showStorageStatus() {
  const el = document.getElementById('storage-status');
  const ok = await requestPersistentStorage();
  el.textContent = ok
    ? 'Storage: protected ✓ (Android won\'t clear your data)'
    : 'Storage: not protected yet. Install the app to the home screen and open it from there.';
}

async function startData() {
  try {
    await openDB();
    await showRoutines();
    await showStorageStatus();
  } catch (err) {
    console.error(err);
    document.getElementById('routines').textContent =
      'Could not open the database: ' + (err && err.message ? err.message : err);
  }
}

startData();
