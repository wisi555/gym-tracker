// App entry point.

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
  // Skipped on the very first install (nothing old to replace).
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
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
