// Settings screen: backup (export/import), install help, storage, version.

import {
  exportAll, parseBackup, replaceAll, getMeta, setMeta, countSets, getLatestSet,
} from './db.js';
import { h, icon, todayStr, shortDate, isInstalledApp } from './ui.js';

// ---- Install ----
// Chrome fires 'beforeinstallprompt' when the app can be installed. We keep
// it so our own "Install app" button can open Chrome's install dialog.
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

async function install() {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  refreshInstallBanner();
}

let openSettingsFn = () => {};

// Small banner on the Log tab, only when running inside the browser.
export function setupInstallBanner(openSettings) {
  openSettingsFn = openSettings;
  refreshInstallBanner();
}

function refreshInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (!banner) return;
  banner.hidden = isInstalledApp();
  banner.replaceChildren(
    h('span', {}, 'You\'re using the browser version.'),
    h('button', {
      type: 'button', class: 'banner-btn',
      onclick: () => (installPrompt ? install() : openSettingsFn()),
    }, icon('install'), installPrompt ? 'Install app' : 'How to install'),
  );
}

// ---- Backup files ----

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function exportBackup(prefix) {
  downloadJSON(await exportAll(), `${prefix}-${todayStr()}.json`);
  await setMeta('lastBackup', Date.now());
}

function daysAgo(timestamp) {
  const start = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((start(Date.now()) - start(timestamp)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

async function importBackup(file, rerender) {
  let backup;
  try {
    backup = parseBackup(await file.text());
  } catch (err) {
    alert(err.message);
    return;
  }
  const { sets } = backup.data;
  const lastDate = sets.reduce((max, s) => (s.date > max ? s.date : max), '');
  const made = backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString() : 'an unknown date';
  const ok = confirm(
    `Replace ALL data on this phone with this backup?\n\n`
    + `Backup from ${made}: ${sets.length} sets`
    + (lastDate ? `, last workout ${shortDate(lastDate)}` : '') + '.\n\n'
    + 'A safety copy of your current data will be saved to Downloads first.',
  );
  if (!ok) return;
  try {
    if (await countSets() > 0) await exportBackup('gym-tracker-before-import');
    await replaceAll(backup.data);
  } catch (err) {
    console.error(err);
    alert('Import failed, nothing was changed. ' + (err && err.message ? err.message : ''));
    rerender();
    return;
  }
  alert('Backup imported.');
  location.reload(); // start fresh with the imported data
}

// ---- Screen ----

export async function renderSettings(container, version) {
  const rerender = () => renderSettings(container, version);
  const [lastBackup, setCount, latest, persisted] = await Promise.all([
    getMeta('lastBackup'),
    countSets(),
    getLatestSet(),
    navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : false,
  ]);

  const fileInput = h('input', {
    type: 'file', accept: '.json,application/json', hidden: true,
    onchange: () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (file) importBackup(file, rerender);
    },
  });

  const installed = isInstalledApp();

  container.replaceChildren(
    h('div', { class: 'settings' },
      h('h2', {}, 'Backup'),
      h('div', { class: 'panel' },
        h('p', { class: 'big-line' }, lastBackup ? `Last backup: ${daysAgo(lastBackup)}` : 'No backup yet'),
        h('p', { class: 'muted' }, `${setCount} ${setCount === 1 ? 'set' : 'sets'} saved`
          + (latest ? ` · last workout ${shortDate(latest.date)}` : '')),
        h('button', {
          type: 'button', class: 'primary',
          onclick: async () => { await exportBackup('gym-tracker-backup'); rerender(); },
        }, icon('download'), 'Export backup'),
        h('button', { type: 'button', class: 'secondary', onclick: () => fileInput.click() },
          icon('upload'), 'Import backup'),
        fileInput,
        h('p', { class: 'note' },
          'Export saves a file to your Downloads. Keep a copy somewhere safe, like Google Drive. '
          + 'Import replaces everything on this phone with the file\'s data.'),
      ),

      h('h2', {}, 'App'),
      h('div', { class: 'panel' },
        installed
          ? h('p', { class: 'big-line' }, icon('check'), ' Installed')
          : [
            h('p', { class: 'big-line' }, 'Running in the browser'),
            installPrompt
              ? h('button', { type: 'button', class: 'primary', onclick: install }, icon('install'), 'Install app')
              : h('p', { class: 'muted' },
                'In Chrome: tap the menu (⋮) → "Add to home screen" → choose "Install" '
                + '(not "Create shortcut"). If Gym Tracker is already installed, '
                + 'open it from your app drawer instead of the browser.'),
          ],
        h('p', {}, persisted
          ? 'Storage: protected — Android won\'t clear your data.'
          : 'Storage: not protected yet. Chrome decides this itself, often once the app is '
            + 'installed and used for a while. The app asks every time it opens. Keep backups either way.'),
        h('p', { class: 'muted' }, `Version ${version}`),
      ),
    ),
  );
}
