// App entry point.
import { openDB, requestPersistentStorage } from './db.js';
import { initLog } from './log.js';
import { initBody } from './body.js';
import { initProgress, showProgress } from './progress.js';
import { renderSettings } from './settings.js';
import { refreshInstallBanner } from './install.js';
import { initTimer } from './timer.js';
import { icon } from './ui.js';

let version = '…';

// The app always starts on the Log list. If it was reloaded (e.g. for an
// update) while an exercise or Settings was open, forget that leftover
// "back" step, or the next back gesture would do nothing.
if (history.state) history.replaceState(null, '');

// ---- Tabs and the settings screen ----
const titles = { log: 'Log', body: 'Body', progress: 'Progress', settings: 'Settings' };
let currentTab = 'log';
let lastMainTab = 'log'; // where "back" from settings returns to

function showTab(name) {
  currentTab = name;
  if (name !== 'settings') lastMainTab = name;
  for (const btn of document.querySelectorAll('.tabbar button')) {
    if (btn.dataset.tab === name) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  for (const section of document.querySelectorAll('.tab')) {
    section.hidden = section.id !== 'tab-' + name;
  }
  document.getElementById('title').textContent = titles[name];
  document.querySelector('main').scrollTop = 0;
  if (name === 'progress') showProgress(); // always fresh numbers
}

// Tab bar: icons only (the header shows the section's name).
const tabIcons = { log: 'plus', body: 'scale', progress: 'chart' };
for (const btn of document.querySelectorAll('.tabbar button')) {
  btn.append(icon(tabIcons[btn.dataset.tab], 'icon tab-icon'));
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}

function openSettings() {
  if (currentTab === 'settings') return;
  history.pushState({ screen: 'settings' }, '');
  showTab('settings');
  renderSettings(document.getElementById('tab-settings'), version);
}

document.getElementById('settings-btn').addEventListener('click', openSettings);

// The phone's back gesture closes the settings screen.
window.addEventListener('popstate', () => {
  const onSettings = history.state && history.state.screen === 'settings';
  if (currentTab === 'settings' && !onSettings) showTab(lastMainTab);
});

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
    version = e.data;
    document.getElementById('version').textContent = 'v' + version;
  };
  reg.active.postMessage('GET_VERSION', [channel.port2]);
}

setupServiceWorker();

// ---- Data ----
initTimer();

async function startData() {
  try {
    await openDB();
    await initLog(document.getElementById('log'));
    await initBody(document.getElementById('body'));
    initProgress(document.getElementById('progress'));
    refreshInstallBanner();
    requestPersistentStorage(); // ask Android to protect our data (see Settings)
  } catch (err) {
    console.error(err);
    document.getElementById('log').textContent =
      'Could not open the database: ' + (err && err.message ? err.message : err);
  }
}

startData();
