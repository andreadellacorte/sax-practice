// Demo phrases: what a sax would play for each lesson exercise, over a timeline.
// Expects a range of at least 22 semitones (lo..hi) so every phrase fits.
// build() returns concert-pitch notes { beat, dur, midi } where beat is measured
// from the start of the loop (it may be negative for pickups into bar 1).
(function (root, factory) {
  const T = typeof module === 'object' && module.exports ? require('./theory.js') : root.Theory;
  const D = factory(T);
  if (typeof module === 'object' && module.exports) module.exports = D;
  else root.Demo = D;
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  const mod = T.mod;

  const LABELS = {
    'long-tones': 'Each chord tone held for a bar: root, 3rd, 5th, 7th',
    'root-whole': 'The root of each chord, held for the whole bar',
    'root-quarters': 'The root on every beat',
    'root-rhythm': 'The root with a free rhythm',
    'arp-up': 'Arpeggio up: root, 3rd, 5th, 7th',
    'arp-down': 'Arpeggio down: 7th, 5th, 3rd, root',
    'arp-3': 'Arpeggio from the 3rd: 3rd, 5th, 7th, root',
    digital: '1-2-3-5 on each chord',
    guide: 'Guide tones: 3rds and 7ths, always moving to the nearest one',
    approach: 'Chord tones approached from a half step below',
    riff: 'Short riffs with space between them',
    space: 'Phrases of different lengths, with rests in between',
    motif: 'A 3-note motif, moved up the scale each bar',
    funk: 'Short stabs on the 3rd and ♭7, straight eighths',
    displace: 'The same 4-note phrase, starting an eighth later each bar',
    target: 'The 3rd of each chord on beat 1, approached from below',
    enclose: 'Each 3rd enclosed: note above, half step below, then the 3rd',
    lick: 'A solo built from chord-tone phrases',
    echo: 'The sax echoes each phrase the band plays',
  };

  // Rhythms within one bar: [start beat, length in beats].
  const ROOT_RHYTHMS = [
    [[0, 1.5], [2, 0.5], [2.5, 1]],
    [[0.5, 0.5], [1.5, 0.5], [2.5, 1.5]],
    [[0, 0.5], [1, 0.5], [1.5, 2]],
    [[1, 1], [2.5, 0.5], [3.5, 0.5]],
  ];
  // Riffs on a key scale: [start beat, length, index into the scale ladder].
  const RIFFS = [
    [[0, 0.5, 2], [0.5, 0.5, 1], [1, 0.5, 0], [1.5, 1, 1], [2.5, 1.5, 0]],
    [[0, 0.5, 4], [0.5, 0.5, 3], [1, 0.5, 2], [1.5, 0.5, 1], [2, 2, 0]],
  ];

  function build(kind, tl, { lo, hi, keyScale = 'blues', loop = 0 }) {
    const notes = [];
    const center = Math.round((lo + hi) / 2);
    let prev = center;
    const add = (beat, dur, midi) => {
      if (midi == null) return;
      notes.push({ beat, dur, midi });
      prev = midi;
    };
    const bars = tl.totalBeats / 4;
    const chordAtBeat = (b) => tl.chords[tl.beats[mod(Math.floor(b), tl.totalBeats)].chordIdx];
    const rootPc = (c) => T.pcOf(c.root);
    const tonePc = (c, k) => mod(rootPc(c) + T.QUALITIES[c.quality].tones[k][1], 12);
    const scalePcs = (c) => T.SCALES[c.scale || T.QUALITIES[c.quality].scale].steps.map(([, s]) => mod(rootPc(c) + s, 12));
    const near = (pc, ref, a = lo, b = hi) => T.nearestInRange(pc, ref, a, b);
    const above = (pc, ref) => {
      for (let m = ref + 1; m <= ref + 12; m++) if (mod(m, 12) === pc) return m <= hi ? m : m - 12;
      return null;
    };
    const below = (pc, ref) => {
      for (let m = ref - 1; m >= ref - 12; m--) if (mod(m, 12) === pc) return m >= lo ? m : m + 12;
      return null;
    };
    const ladder = (pcs) => {
      const l = [];
      for (let m = lo; m <= hi; m++) if (pcs.includes(mod(m, 12))) l.push(m);
      return l;
    };
    const riff = (bar, which, lad, a) => {
      for (const [s, d, idx] of RIFFS[which]) add(bar * 4 + s, d, lad[a + idx]);
    };

    if (kind === 'riff' || kind === 'space') {
      const lad = ladder(T.spellScale(tl.key, keyScale).map((n) => n.pc));
      const a = lad.indexOf(near(T.pcOf(tl.key), center, lo, lo + 11));
      for (let b = 0; b < bars; b++) {
        const phase = kind === 'riff' ? b % 4 : b % 8;
        if (phase === 0 || phase === 4) riff(b, 0, lad, a);
        else if (phase === 2 || (kind === 'space' && phase === 5)) riff(b, 1, lad, a);
      }
    }

    for (let b = 0; b < bars && kind !== 'riff' && kind !== 'space'; b++) {
      const b4 = b * 4;
      const c = chordAtBeat(b4);
      if (kind === 'long-tones') {
        add(b4, 3.5, near(tonePc(c, b % 4), prev));
      } else if (kind === 'root-whole') {
        add(b4, 3.6, near(rootPc(c), prev));
      } else if (kind === 'root-quarters') {
        for (let q = 0; q < 4; q++) add(b4 + q, 0.8, near(rootPc(chordAtBeat(b4 + q)), prev));
      } else if (kind === 'root-rhythm') {
        for (const [s, d] of ROOT_RHYTHMS[b % ROOT_RHYTHMS.length]) add(b4 + s, d, near(rootPc(chordAtBeat(b4 + s)), prev));
      } else if (kind === 'arp-up' || kind === 'arp-3') {
        const order = kind === 'arp-up' ? [0, 1, 2, 3] : [1, 2, 3, 0];
        let m = near(tonePc(c, order[0]), prev, lo, lo + 11);
        add(b4, 0.9, m);
        for (let k = 1; k < 4; k++) add(b4 + k, 0.9, (m = above(tonePc(c, order[k]), m)));
      } else if (kind === 'arp-down') {
        let m = near(tonePc(c, 3), prev, hi - 11, hi);
        add(b4, 0.9, m);
        for (const k of [2, 1, 0]) add(b4 + 4 - k - 1, 0.9, (m = below(tonePc(c, k), m)));
      } else if (kind === 'digital') {
        const sc = scalePcs(c);
        let m = near(sc[0], prev, lo, lo + 11);
        add(b4, 0.9, m);
        [1, 2, 4].forEach((idx, k) => add(b4 + k + 1, 0.9, (m = above(sc[idx], m))));
      } else if (kind === 'guide') {
        const opts = [tonePc(c, 1), tonePc(c, 3)].map((pc) => near(pc, prev));
        const m = notes.length ? opts.reduce((x, y) => (Math.abs(y - prev) < Math.abs(x - prev) ? y : x)) : opts[0];
        add(b4, 3.6, m);
      } else if (kind === 'approach') {
        const r = near(rootPc(c), prev, lo + 1, lo + 12);
        add(b4, 1, r);
        const third = above(tonePc(c, 1), r);
        add(b4 + 1.5, 0.5, third - 1);
        add(b4 + 2, 1, third);
        const fifth = above(tonePc(c, 2), third);
        add(b4 + 3, 0.5, fifth - 1);
        add(b4 + 3.5, 0.5, fifth);
      } else if (kind === 'motif') {
        const lad = ladder(scalePcs(c));
        const i = lad.indexOf(near(rootPc(c), center, lo, lo + 11)) + (b % 5);
        add(b4, 0.5, lad[i]);
        add(b4 + 0.5, 0.5, lad[i + 1]);
        add(b4 + 1, 1.5, lad[i + 2]);
      } else if (kind === 'funk') {
        const t3 = near(tonePc(c, 1), center, lo, lo + 11);
        const t7 = above(tonePc(c, 3), t3);
        const pat = b % 2 === 0
          ? [[0, 0.4, t3], [0.5, 0.4, t7], [1.5, 0.4, t3], [2.5, 0.4, t7], [3, 0.4, t3]]
          : [[0, 0.4, t7], [1, 0.4, t3], [1.5, 0.4, t3], [2.5, 1, t7]];
        for (const [s, d, m] of pat) add(b4 + s, d, m);
      } else if (kind === 'displace') {
        const lad = ladder(scalePcs(c));
        const i = lad.indexOf(near(rootPc(c), center, lo, lo + 11));
        const off = (b % 8) * 0.5;
        [0, 1, 2, 4].forEach((idx, j) => add(b4 + off + j * 0.5, 0.45, lad[i + idx]));
      } else if (kind === 'lick' && b % 2 === 0 && (b / 2) % 4 !== 3) {
        const rng = T.mulberry32(loop * 7919 + b + 1);
        const lick = T.generateLick((e) => chordAtBeat(b4 + Math.floor(e / 2)), rng, lo, hi);
        for (const n of lick) add(b4 + n.eighth / 2, n.len / 2, n.midi);
      }
    }

    if (kind === 'target' || kind === 'enclose') {
      for (const c of tl.chords) {
        const t3 = near(tonePc(c, 1), prev, lo + 2, hi - 2);
        if (kind === 'enclose') {
          const sc = scalePcs(c);
          let up = t3 + 1;
          while (!sc.includes(mod(up, 12))) up++;
          add(c.startBeat - 1, 0.5, up);
        }
        add(c.startBeat - 0.5, 0.5, t3 - 1);
        add(c.startBeat, 2, t3);
      }
    }

    return notes.filter((n) => n.beat < tl.totalBeats).sort((a, b) => a.beat - b.beat);
  }

  return { build, LABELS, KINDS: Object.keys(LABELS) };
});
