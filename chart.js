// A small hand-drawn line chart (SVG). No library: works offline, stays tiny.
//
// One series, one axis. Thin 2px line, 8px dots, faint grid, only the latest
// value labelled on the chart. Tap or drag across it to read any point
// (shown in the line above the chart).

import { h } from './ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const W = 340;
const H = 190;
const PAD = { left: 42, right: 18, top: 22, bottom: 26 };

function s(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

const dayNumber = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// A "nice" step for about 3–4 gridlines: 1, 2, 2.5 or 5 × a power of ten.
function niceStep(range) {
  const raw = range / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * pow;
}

const tickDate = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * points: [{ date: 'YYYY-MM-DD', value }] oldest first.
 * format(value) → "45 kg"; describe(point) → "Fri, Nov 20" (readout prefix).
 * target: optional number drawn as a dashed line.
 */
export function lineChart({ points, format, describe, target = null, emptyText = 'No data yet' }) {
  if (!points.length) return h('div', { class: 'chart' }, h('p', { class: 'chart-empty' }, emptyText));

  const readout = h('p', { class: 'chart-readout' });
  const showReadout = (p) => {
    readout.replaceChildren(h('strong', {}, format(p.value)), ` · ${describe(p)}`);
  };

  // Scales
  const xs = points.map((p) => dayNumber(p.date));
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  if (xMin === xMax) { xMin -= 3; xMax += 3; }
  const values = points.map((p) => p.value).concat(target != null ? [target] : []);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) { lo -= Math.max(1, Math.abs(lo) * 0.05); hi += Math.max(1, Math.abs(hi) * 0.05); }
  const step = niceStep(hi - lo);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step;
  const x = (d) => PAD.left + ((d - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', tabindex: '0' });

  // Grid + y labels (recessive)
  for (let v = yMin; v <= yMax + step / 2; v += step) {
    svg.append(s('line', { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: 'c-grid' }));
    svg.append(s('text', { x: PAD.left - 6, y: y(v) + 4, class: 'c-axis', 'text-anchor': 'end' },
      String(Math.round(v * 10) / 10)));
  }
  // x labels: first and last date (and the middle one when there's room)
  const xLabels = [points[0]];
  if (points.length > 2) xLabels.push(points[Math.floor((points.length - 1) / 2)]);
  if (points.length > 1) xLabels.push(points[points.length - 1]);
  xLabels.forEach((p, i) => {
    const anchor = i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle';
    svg.append(s('text', { x: x(dayNumber(p.date)), y: H - 6, class: 'c-axis', 'text-anchor': anchor }, tickDate(p.date)));
  });

  // Target (dashed)
  if (target != null) {
    svg.append(s('line', { x1: PAD.left, x2: W - PAD.right, y1: y(target), y2: y(target), class: 'c-target' }));
    svg.append(s('text', { x: W - PAD.right, y: y(target) - 5, class: 'c-axis', 'text-anchor': 'end' }, 'target'));
  }

  // Line + dots
  const coords = points.map((p) => [x(dayNumber(p.date)), y(p.value)]);
  svg.append(s('polyline', { points: coords.map((c) => c.join(',')).join(' '), class: 'c-line' }));
  coords.forEach(([cx, cy]) => svg.append(s('circle', { cx, cy, r: 4, class: 'c-dot' })));

  // Only the latest value is written on the chart.
  const [lx, ly] = coords[coords.length - 1];
  const last = points[points.length - 1];
  svg.append(s('text', {
    x: Math.min(lx, W - PAD.right), y: Math.max(ly - 10, 12), class: 'c-label', 'text-anchor': lx > W - 60 ? 'end' : 'middle',
  }, format(last.value)));

  // Tap / drag to read a point: a ring marks it, the readout line shows it.
  const ring = s('circle', { r: 7, class: 'c-focus', visibility: 'hidden' });
  svg.append(ring);
  let current = points.length - 1;
  const select = (i) => {
    current = Math.max(0, Math.min(points.length - 1, i));
    const [cx, cy] = coords[current];
    ring.setAttribute('cx', cx);
    ring.setAttribute('cy', cy);
    ring.setAttribute('visibility', 'visible');
    showReadout(points[current]);
  };
  const nearest = (event) => {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    let best = 0;
    coords.forEach(([cx], i) => { if (Math.abs(cx - px) < Math.abs(coords[best][0] - px)) best = i; });
    return best;
  };
  svg.addEventListener('pointerdown', (e) => select(nearest(e)));
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') select(nearest(e)); });
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { select(current - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { select(current + 1); e.preventDefault(); }
  });

  showReadout(last);
  svg.setAttribute('aria-label', `Chart, ${points.length} points, latest ${format(last.value)}`);
  return h('div', { class: 'chart' }, readout, svg);
}
