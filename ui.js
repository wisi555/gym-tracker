// Small shared helpers for building the screens.

// Tiny element builder: h('button', { class: 'x', onclick: fn }, 'Text', child)
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (val == null || val === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), val);
    else if (key === 'class') el.className = val;
    else if (key === 'value') el.value = val;
    else el.setAttribute(key, val === true ? '' : val);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// Minimal line icons (24×24, drawn with the text color).
const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/>'
    + '<path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/>'
    + '<path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  back: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>',
  up: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  install: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7"/><path d="M9 11l3 3 3-3"/>',
};

export function icon(name, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  svg.innerHTML = ICONS[name];
  return svg;
}

// Today's date as 'YYYY-MM-DD' in the phone's own time zone.
export function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// 'YYYY-MM-DD' → "Fri, Nov 20" (in the phone's language).
export function shortDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// 'YYYY-MM-DD' moved by n days (n can be negative).
export function addDays(str, n) {
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// True when running as the installed app (no browser address bar).
export function isInstalledApp() {
  return matchMedia('(display-mode: standalone)').matches;
}

// ---- Numbers ----

export const round2 = (n) => Math.round(n * 100) / 100;
export const fmtNum = (n) => String(round2(n)); // 40, 22.5, 62.4

// Reads a typed number. Accepts "22,5" too (many Android keyboards type a
// comma as the decimal mark). Returns null if empty, NaN if not a number.
function parseNum(text) {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : NaN;
}


const validNumber = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

// [ − ]  40 kg  [ + ]   (tap the number to type it)
export function stepper({ label, unit, step, decimal, value, onChange }) {
  const show = (v) => (v == null || Number.isNaN(v) ? '' : fmtNum(v));
  const input = h('input', {
    type: 'text', class: 'num', value: show(value), placeholder: '–',
    inputmode: decimal ? 'decimal' : 'numeric', enterkeyhint: 'done', 'aria-label': label,
    autocomplete: 'off',
  });
  const set = (v) => { value = v; input.value = show(v); onChange(v); };
  const base = () => (validNumber(value) ? value : 0);

  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => { value = parseNum(input.value); onChange(value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

  return h('div', { class: 'stepper' },
    h('span', { class: 'stepper-label' }, label),
    h('div', { class: 'stepper-row' },
      h('button', {
        type: 'button', class: 'step', 'aria-label': `${label} minus ${step}`,
        onclick: () => set(Math.max(0, round2(base() - step))),
      }, icon('minus', 'icon icon-lg')),
      h('label', { class: 'num-wrap' }, input, h('span', { class: 'unit' }, unit)),
      h('button', {
        type: 'button', class: 'step', 'aria-label': `${label} plus ${step}`,
        onclick: () => set(round2(base() + step)),
      }, icon('plus', 'icon icon-lg')),
    ),
  );
}
