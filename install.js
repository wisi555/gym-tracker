// "You're using the browser version" banner on the Log tab, with an
// Install button. Hidden when running as the installed app.

import { h, icon, isInstalledApp } from './ui.js';

// Chrome fires 'beforeinstallprompt' when the app can be installed. We keep
// it so our own button can open Chrome's install dialog.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  refreshInstallBanner();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  refreshInstallBanner();
});

const HOW_TO = 'To install: open this page in the Chrome app, tap the menu (⋮) → '
  + '"Add to home screen" → choose "Install" (not "Create shortcut").\n\n'
  + 'If Gym Tracker is already installed, open it from your app drawer instead.';

async function install() {
  if (!installPrompt) {
    alert(HOW_TO);
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  refreshInstallBanner();
}

export function refreshInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (!banner) return;
  banner.hidden = isInstalledApp();
  banner.replaceChildren(
    h('span', {}, 'You\'re using the browser version.'),
    h('button', { type: 'button', class: 'banner-btn', onclick: install },
      icon('install'), installPrompt ? 'Install app' : 'How to install'),
  );
}
