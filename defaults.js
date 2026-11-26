// Starting routines, loaded into the database ONCE, on first launch.
//
// DO NOT EDIT after release: an installed app never re-reads this file.
// To change exercises or routines later, add a new migration in db.js.
//
// Exercise ids are permanent: history is linked to the id, never the name.

export const DEFAULT_EXERCISES = [
  // Upper
  { id: 'chest-press', name: 'Chest press' },
  { id: 'lat-pulldown', name: 'Lat pulldown' },
  { id: 'seated-row', name: 'Seated row' },
  { id: 'shoulder-press', name: 'Shoulder press' },
  { id: 'biceps-curl', name: 'Biceps curl' },
  { id: 'triceps-pressdown', name: 'Triceps press-down' },
  { id: 'ab-crunch', name: 'Seated ab crunch' },
  // Lower
  { id: 'hip-thrust', name: 'Hip thrust / glute bridge' },
  { id: 'leg-press', name: 'Leg press', note: 'Feet high, slightly wide' },
  { id: 'back-extension', name: '45° back extension' },
  { id: 'leg-curl', name: 'Leg curl' },
  { id: 'leg-extension', name: 'Leg extension' },
  { id: 'calf-raise', name: 'Calf raise' },
  { id: 'hip-abductor', name: 'Hip abductor' },
];

// Shorthand: item('chest-press', 3, 3, 8, 12) = 3 sets of 8–12 reps.
function item(exerciseId, setsMin, setsMax, repsMin, repsMax, optional = false) {
  return {
    exerciseId,
    sets: { min: setsMin, max: setsMax },
    reps: { min: repsMin, max: repsMax },
    optional,
  };
}

export const DEFAULT_ROUTINES = [
  {
    id: 'upper',
    name: 'Upper',
    order: 1,
    items: [
      item('chest-press', 3, 3, 8, 12),
      item('lat-pulldown', 3, 3, 8, 12),
      item('seated-row', 3, 3, 8, 12),
      item('shoulder-press', 3, 3, 8, 12),
      item('biceps-curl', 2, 3, 10, 12),
      item('triceps-pressdown', 2, 3, 10, 12),
      item('ab-crunch', 2, 3, 10, 15),
    ],
  },
  {
    id: 'lower',
    name: 'Lower',
    subtitle: 'Glute focus',
    order: 2,
    items: [
      item('hip-thrust', 4, 4, 8, 12),
      item('leg-press', 3, 4, 8, 12),
      item('back-extension', 3, 3, 10, 12),
      item('leg-curl', 3, 3, 10, 15),
      item('leg-extension', 2, 3, 10, 15),
      item('calf-raise', 3, 3, 10, 15),
      item('hip-abductor', 2, 3, 12, 15, true),
    ],
  },
];
