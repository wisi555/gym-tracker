// Monthly check-in (inside the Body tab): body measurements in cm and
// progress photos (front, side, back). Photos stay in the app's database on
// the phone: never uploaded, not added to the phone's gallery.

import {
  getCheckins, saveCheckin, deleteCheckin, MEASUREMENTS, getPhotos, savePhoto, deletePhoto, POSES,
  getMeta, setMeta,
} from './db.js';
import { h, icon, todayStr, shortDate, round2, stepper, daysBetween } from './ui.js';

const STEP = 0.5; // cm
const DUE_AFTER_DAYS = 30;
const MAX_SIDE = 1280;  // photos are shrunk to this many pixels on the long side
const JPEG_QUALITY = 0.82;

export const MEASURE_LABELS = {
  waist: 'Waist', neck: 'Neck', glutes: 'Glutes', thighs: 'Thighs', arm: 'Upper arm',
};

// US Navy body fat estimate (the waist–neck–height version), all in cm.
// Returns a percentage, or null if it can't be worked out.
export function navyBodyFat(waist, neck, height) {
  if (!(waist > 0 && neck > 0 && height > 0) || waist - neck <= 0) return null;
  const bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  return bf > 0 && bf < 75 ? bf : null;
}
const POSE_LABELS = { front: 'Front', side: 'Side', back: 'Back' };
const valid = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 300;
const cm = (v) => `${v.toFixed(1)} cm`;

const state = {
  date: todayStr(),
  today: todayStr(),
  view: 'form',        // form | compare
  compare: null,       // { a: date, b: date }
};
// Numbers being edited, kept across re-renders of the same date.
let draft = { key: null, values: {} };
let container;
let onSaved = () => {}; // lets the Body tab refresh its "due" dot
let objectUrls = [];    // image links made for this screen; freed on re-render

// True when a check-in is due: none yet, or the last one is over 30 days old.
export async function checkinDue() {
  const [latest] = await getCheckins();
  return !latest || daysBetween(latest.date, todayStr()) > DUE_AFTER_DAYS;
}

export function renderCheckin(el, afterChange) {
  container = el;
  if (afterChange) onSaved = afterChange;
  state.today = todayStr();
  if (state.date > state.today) state.date = state.today;
  return render();
}

// The phone's back gesture closes the photo viewer and the compare view.
window.addEventListener('popstate', () => {
  const s = history.state || {};
  if (viewerEl && !s.photoViewer) closeViewer();
  if (state.view === 'compare' && !s.compare) {
    state.view = 'form';
    if (container && container.isConnected) render();
  }
});

function imageUrl(blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}

function render() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
  return state.view === 'compare' ? renderCompare() : renderForm();
}

// ---- Measurements + photos ----

async function renderForm() {
  const [checkins, photos, height] = await Promise.all([getCheckins(), getPhotos(), getMeta('height')]); // checkins newest first
  const existing = checkins.find((c) => c.date === state.date);
  // For reference: the check-in before this date.
  const previous = checkins.find((c) => c.date < state.date);
  const photoDates = [...new Set(photos.map((p) => p.date))];
  const photosOf = (date) => photos.filter((p) => p.date === date);

  if (draft.key !== state.date) {
    const start = existing || previous || {};
    draft = { key: state.date, values: Object.fromEntries(MEASUREMENTS.map((k) => [k, start[k] ?? null])) };
  }

  const save = h('button', { type: 'button', class: 'primary' }, existing ? 'Update check-in' : 'Save check-in');
  // Body fat updates live as waist and neck change.
  const bodyFatValue = h('strong', { class: 'bf-value' });
  const refresh = () => {
    const bf = navyBodyFat(draft.values.waist, draft.values.neck, height);
    bodyFatValue.textContent = bf == null ? '–' : `${bf.toFixed(1)}%`;
    const vals = Object.values(draft.values);
    // At least one measurement, and nothing half-typed.
    save.disabled = !vals.some(valid) || vals.some((v) => v != null && !valid(v));
  };
  save.addEventListener('click', async () => {
    if (save.disabled) return;
    save.disabled = true;
    const values = {};
    for (const k of MEASUREMENTS) if (valid(draft.values[k])) values[k] = round2(draft.values[k]);
    await saveCheckin(state.date, values);
    if (navigator.vibrate) navigator.vibrate(30);
    onSaved();
  });

  // Every date with a check-in or photos, newest first.
  const listDates = [...new Set([...checkins.map((c) => c.date), ...photoDates])].sort().reverse();

  container.replaceChildren(h('div', { class: 'checkin-view' },
    h('div', { class: 'editor' },
      h('div', { class: 'date-row' },
        h('label', { class: 'date-label', for: 'checkin-date' }, 'Date'),
        h('input', {
          id: 'checkin-date', type: 'date', class: 'date-input', value: state.date, max: state.today,
          onchange: (e) => { if (e.target.value) { state.date = e.target.value; render(); } },
        }),
      ),
      previous && h('p', { class: 'note' }, `Last check-in: ${shortDate(previous.date)}`),
      MEASUREMENTS.map((k) => stepper({
        label: MEASURE_LABELS[k],
        note: previous && valid(previous[k]) ? `last ${cm(previous[k])}` : null,
        unit: 'cm', step: STEP, decimal: true, value: draft.values[k],
        onChange: (v) => { draft.values[k] = v; refresh(); },
      })),
      // Body fat (US Navy estimate) from waist, neck and height.
      h('div', { class: 'bf-row' },
        h('span', { class: 'bf-label' }, 'Body fat'),
        bodyFatValue,
        h('button', {
          type: 'button', class: 'bf-height',
          'aria-label': height ? `Height ${height} cm, tap to change` : 'Set height',
          onclick: async () => {
            const typed = prompt('Your height in cm (used only for the body fat estimate):', height ?? '');
            if (typed == null) return;
            const n = Number(String(typed).replace(',', '.'));
            if (!(n >= 100 && n <= 250)) { alert('Please type your height in cm, e.g. 170.'); return; }
            await setMeta('height', Math.round(n * 10) / 10);
            render();
          },
        }, height ? `${height} cm` : 'Set height'),
      ),
      save,
    ),

    photoPanel(photosOf(state.date), photoDates),

    listDates.length > 0 && h('h2', { class: 'list-title' }, 'Check-ins'),
    listDates.length > 0 && h('ul', { class: 'weight-list checkin-list' }, listDates.map((date) => {
      const c = checkins.find((x) => x.date === date) || {};
      const n = photosOf(date).length;
      const parts = MEASUREMENTS.filter((k) => valid(c[k])).map((k) => `${MEASURE_LABELS[k]} ${c[k].toFixed(1)}`);
      if (n) parts.push(`${n} ${n === 1 ? 'photo' : 'photos'}`);
      return h('li', {},
        h('span', { class: 'w-date' },
          h('strong', {}, shortDate(date)),
          h('span', { class: 'checkin-values' }, parts.join(' · '))),
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `Delete check-in of ${shortDate(date)}`,
          onclick: async () => {
            if (!confirm(`Delete the check-in of ${shortDate(date)}${n ? ' and its photos' : ''}?`)) return;
            await deleteCheckin(date);
            if (draft.key === date) draft.key = null;
            onSaved();
          },
        }, icon('trash')));
    })),
  ));
  refresh();
}

// Three slots for this date's photos. Tap an empty slot to take/pick a photo;
// tap a filled one to view, replace or delete it.
function photoPanel(dayPhotos, photoDates) {
  return h('div', { class: 'panel photo-panel' },
    h('p', { class: 'chart-title' }, 'Photos'),
    h('div', { class: 'photo-slots' }, POSES.map((pose) => {
      const photo = dayPhotos.find((p) => p.pose === pose);
      return h('button', {
        type: 'button', class: 'photo-slot' + (photo ? ' filled' : ''),
        'aria-label': photo ? `${POSE_LABELS[pose]} photo: view` : `Add ${POSE_LABELS[pose].toLowerCase()} photo`,
        onclick: () => (photo ? openViewer(photo) : pickPhoto(pose)),
      },
        photo ? h('img', { src: imageUrl(photo.blob), alt: '' }) : icon('camera', 'icon photo-icon'),
        h('span', { class: 'photo-label' }, POSE_LABELS[pose]));
    })),
    photoDates.length >= 2 && h('button', {
      type: 'button', class: 'secondary',
      onclick: () => {
        state.compare = { a: photoDates[0], b: photoDates[photoDates.length - 1] };
        state.view = 'compare';
        history.pushState({ compare: true }, '');
        render().then(() => { document.querySelector('main').scrollTop = 0; });
      },
    }, 'Compare photos'),
  );
}

// Opens the phone's chooser (camera or gallery), shrinks the photo, saves it.
function pickPhoto(pose) {
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    try {
      await savePhoto(state.date, pose, await shrinkPhoto(file));
    } catch (err) {
      console.error(err);
      alert('That photo couldn\'t be read. Try another one (JPEG or PNG).');
      return;
    }
    if (navigator.vibrate) navigator.vibrate(30);
    onSaved();
  });
  document.body.append(input);
  input.click();
}

// Makes a phone photo (often 3–5 MB) into a ~1280 px JPEG (~200–300 KB).
export async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file); // keeps the photo's rotation
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // JPEG has no transparency: use white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not shrink the photo'))), 'image/jpeg', JPEG_QUALITY);
  });
}

// ---- Full-screen photo viewer ----

let viewerEl = null;
let viewerUrl = null;

function openViewer(photo) {
  viewerUrl = URL.createObjectURL(photo.blob);
  const close = () => { if (history.state && history.state.photoViewer) history.back(); else closeViewer(); };
  viewerEl = h('div', { class: 'photo-viewer', role: 'dialog', 'aria-label': `${POSE_LABELS[photo.pose]} photo` },
    h('img', { src: viewerUrl, alt: `${POSE_LABELS[photo.pose]} photo, ${shortDate(photo.date)}` }),
    h('p', { class: 'viewer-caption' }, `${POSE_LABELS[photo.pose]} · ${shortDate(photo.date)}`),
    h('div', { class: 'viewer-actions' },
      h('button', {
        type: 'button', class: 'secondary',
        onclick: () => { close(); pickPhoto(photo.pose); },
      }, icon('camera'), 'Replace'),
      h('button', {
        type: 'button', class: 'secondary',
        onclick: async () => {
          if (!confirm(`Delete the ${photo.pose} photo of ${shortDate(photo.date)}?`)) return;
          await deletePhoto(photo.date, photo.pose);
          close();
          onSaved();
        },
      }, icon('trash'), 'Delete'),
      h('button', { type: 'button', class: 'primary', onclick: close }, icon('close'), 'Close'),
    ));
  document.body.append(viewerEl);
  history.pushState({ photoViewer: true }, '');
}

function closeViewer() {
  if (viewerEl) viewerEl.remove();
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerEl = null;
  viewerUrl = null;
}

// ---- Compare two check-ins side by side ----

async function renderCompare() {
  const photos = await getPhotos();
  const dates = [...new Set(photos.map((p) => p.date))];
  const { a, b } = state.compare;
  const pick = (side) => h('select', {
    class: 'date-input compare-select', 'aria-label': side === 'a' ? 'Earlier date' : 'Later date',
    onchange: (e) => { state.compare[side] = e.target.value; render(); },
  }, dates.map((d) => {
    const opt = h('option', { value: d }, shortDate(d));
    if (d === state.compare[side]) opt.selected = true;
    return opt;
  }));
  const cell = (date, pose) => {
    const p = photos.find((x) => x.date === date && x.pose === pose);
    return p ? h('img', { src: imageUrl(p.blob), alt: `${POSE_LABELS[pose]}, ${shortDate(date)}` })
      : h('span', { class: 'compare-empty' }, 'No photo');
  };

  container.replaceChildren(h('div', { class: 'checkin-view' },
    h('button', {
      type: 'button', class: 'back-btn',
      onclick: () => { if (history.state && history.state.compare) history.back(); else { state.view = 'form'; render(); } },
    }, icon('back'), 'Check-in'),
    h('div', { class: 'compare-pickers' }, pick('a'), pick('b')),
    POSES.map((pose) => h('section', { class: 'compare-row' },
      h('p', { class: 'chart-title' }, POSE_LABELS[pose]),
      h('div', { class: 'compare-pair' }, cell(a, pose), cell(b, pose)),
    )),
  ));
}
