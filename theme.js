// Light / Dark / Auto appearance.
//
// The choice is a phone setting, not workout data, so it lives in
// localStorage (readable instantly, before the page draws — a small script
// in index.html applies it early so the app never flashes the wrong colors).

const KEY = 'gym-tracker-theme';
const systemDark = matchMedia('(prefers-color-scheme: dark)');

export function getThemePref() {
  try { return localStorage.getItem(KEY) || 'light'; } catch { return 'light'; }
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* not available: this session only */ }
  applyTheme(pref);
}

export function applyTheme(pref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'auto' && systemDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // Color the phone's status bar to match the header.
  const header = getComputedStyle(document.documentElement).getPropertyValue('--header').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && header) meta.setAttribute('content', header);
}

export function initTheme() {
  applyTheme();
  // In Auto, follow the phone when it switches between light and dark.
  systemDark.addEventListener('change', () => { if (getThemePref() === 'auto') applyTheme(); });
}
