// Settings screen: backup (export/import), storage status, version.

import {
  exportAll, parseBackup, replaceAll, getMeta, setMeta, countSets, getLatestSet,
} from './db.js';
import { h, icon, todayStr, shortDate } from './ui.js';
import { getThemePref, setThemePref } from './theme.js';

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

      h('h2', {}, 'Appearance'),
      h('div', { class: 'panel' },
        h('div', { class: 'segmented small', role: 'group', 'aria-label': 'Appearance' },
          [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(([id, name]) => h('button', {
            type: 'button',
            'aria-pressed': String(getThemePref() === id),
            onclick: () => { setThemePref(id); rerender(); },
          }, name))),
        h('p', { class: 'note' }, 'Auto follows your phone\'s light or dark setting.'),
      ),

      h('h2', {}, 'App'),
      h('div', { class: 'panel' },
        h('p', {}, persisted
          ? 'Storage: protected — Android won\'t clear your data.'
          : 'Storage: not protected yet. Chrome decides this itself, often once the app is '
            + 'installed and used for a while. The app asks every time it opens. Keep backups either way.'),
        h('p', { class: 'muted' }, `Version ${version}`),
      ),
    ),
  );
}
