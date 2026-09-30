// Standard saxophone fingerings by WRITTEN pitch (identical on soprano, alto,
// tenor and baritone), plus an SVG key diagram.
(function (root, factory) {
  const F = factory();
  if (typeof module === 'object' && module.exports) module.exports = F;
  else root.Fingering = F;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LOW = 58; // written Bb3
  const HIGH = 90; // written F#6

  // Low-register fingerings (no octave key), written MIDI 58..73.
  const BASE = {
    58: ['L1', 'L2', 'L3', 'lowBb', 'R1', 'R2', 'R3'], // Bb3
    59: ['L1', 'L2', 'L3', 'lowB', 'R1', 'R2', 'R3'], // B3
    60: ['L1', 'L2', 'L3', 'R1', 'R2', 'R3', 'lowC'], // C4
    61: ['L1', 'L2', 'L3', 'lowCs', 'R1', 'R2', 'R3'], // C#4
    62: ['L1', 'L2', 'L3', 'R1', 'R2', 'R3'], // D4
    63: ['L1', 'L2', 'L3', 'R1', 'R2', 'R3', 'lowEb'], // Eb4
    64: ['L1', 'L2', 'L3', 'R1', 'R2'], // E4
    65: ['L1', 'L2', 'L3', 'R1'], // F4
    66: ['L1', 'L2', 'L3', 'R2'], // F#4
    67: ['L1', 'L2', 'L3'], // G4
    68: ['L1', 'L2', 'L3', 'Gs'], // G#4
    69: ['L1', 'L2'], // A4
    70: ['L1', 'bis'], // Bb4 (bis key)
    71: ['L1'], // B4
    72: ['L2'], // C5
    73: [], // C#5
  };

  const PALM = {
    86: ['oct', 'palmD'], // D6
    87: ['oct', 'palmD', 'palmEb'], // Eb6
    88: ['oct', 'palmD', 'palmEb', 'sideE'], // E6
    89: ['oct', 'palmD', 'palmEb', 'sideE', 'palmF'], // F6
    90: ['oct', 'palmD', 'palmEb', 'sideE', 'palmF', 'highFs'], // F#6
  };

  // Keys pressed for a written MIDI note, or null when outside the standard range.
  function keysFor(writtenMidi) {
    if (writtenMidi < LOW || writtenMidi > HIGH) return null;
    if (PALM[writtenMidi]) return PALM[writtenMidi];
    if (writtenMidi <= 73) return BASE[writtenMidi];
    return ['oct', ...BASE[writtenMidi - 12]]; // D5..C#6: low fingering + octave key
  }

  // Key shapes laid out like a printed fingering chart (viewBox 0 0 76 172).
  const SHAPES = [
    { id: 'oct', el: 'ellipse', a: { cx: 13, cy: 34, rx: 4, ry: 6 }, t: 'Octave key (left thumb)' },
    { id: 'palmD', el: 'ellipse', a: { cx: 22, cy: 12, rx: 5, ry: 3.2 }, t: 'Palm D' },
    { id: 'palmEb', el: 'ellipse', a: { cx: 16, cy: 20, rx: 5, ry: 3.2 }, t: 'Palm E♭' },
    { id: 'palmF', el: 'ellipse', a: { cx: 28, cy: 21, rx: 5, ry: 3.2 }, t: 'Palm F' },
    { id: 'L1', el: 'circle', a: { cx: 42, cy: 40, r: 7 }, t: 'Left index (B)' },
    { id: 'bis', el: 'circle', a: { cx: 42, cy: 51.5, r: 2.6 }, t: 'Bis B♭' },
    { id: 'L2', el: 'circle', a: { cx: 42, cy: 63, r: 7 }, t: 'Left middle (A)' },
    { id: 'L3', el: 'circle', a: { cx: 42, cy: 81, r: 7 }, t: 'Left ring (G)' },
    { id: 'Gs', el: 'rect', a: { x: 53, y: 70, width: 11, height: 5.5, rx: 2 }, t: 'G♯ (left pinky)' },
    { id: 'lowCs', el: 'rect', a: { x: 53, y: 77.5, width: 11, height: 5.5, rx: 2 }, t: 'Low C♯ (left pinky)' },
    { id: 'lowB', el: 'rect', a: { x: 53, y: 85, width: 11, height: 5.5, rx: 2 }, t: 'Low B (left pinky)' },
    { id: 'lowBb', el: 'rect', a: { x: 66, y: 77.5, width: 5.5, height: 13, rx: 2 }, t: 'Low B♭ (left pinky)' },
    { id: 'highFs', el: 'rect', a: { x: 64, y: 99, width: 5, height: 9, rx: 2 }, t: 'High F♯' },
    { id: 'sideE', el: 'rect', a: { x: 56, y: 104, width: 5, height: 9, rx: 2 }, t: 'Side E (right palm)' },
    { id: 'sideC', el: 'rect', a: { x: 56, y: 115, width: 5, height: 9, rx: 2 }, t: 'Side C' },
    { id: 'sideBb', el: 'rect', a: { x: 56, y: 126, width: 5, height: 9, rx: 2 }, t: 'Side B♭' },
    { id: 'R1', el: 'circle', a: { cx: 42, cy: 108, r: 7 }, t: 'Right index (F)' },
    { id: 'R2', el: 'circle', a: { cx: 42, cy: 126, r: 7 }, t: 'Right middle (E)' },
    { id: 'R3', el: 'circle', a: { cx: 42, cy: 144, r: 7 }, t: 'Right ring (D)' },
    { id: 'lowEb', el: 'rect', a: { x: 49, y: 155, width: 12, height: 5.5, rx: 2 }, t: 'Low E♭ (right pinky)' },
    { id: 'lowC', el: 'rect', a: { x: 49, y: 162.5, width: 12, height: 5.5, rx: 2 }, t: 'Low C (right pinky)' },
  ];

  function svg(writtenMidi, cls = '') {
    const keys = keysFor(writtenMidi);
    if (!keys) return `<svg class="fing-svg ${cls}" viewBox="0 0 76 172"><text x="38" y="90" text-anchor="middle" class="fing-na">out of range</text></svg>`;
    const on = new Set(keys);
    let s = `<svg class="fing-svg ${cls}" viewBox="0 0 76 172" role="img" aria-label="${keys.length ? 'Press: ' + keys.join(', ') : 'No keys pressed'}">`;
    s += '<line class="fing-sep" x1="30" x2="54" y1="94.5" y2="94.5"/>';
    for (const k of SHAPES) {
      const attrs = Object.entries(k.a).map(([n, v]) => `${n}="${v}"`).join(' ');
      s += `<${k.el} class="key${on.has(k.id) ? ' on' : ''}" ${attrs}><title>${k.t}</title></${k.el}>`;
    }
    return s + '</svg>';
  }

  return { keysFor, svg, SHAPES, LOW, HIGH };
});
