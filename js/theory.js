// Music theory core: spelling, transposition, chords, scales, progressions,
// plus the pure note-choice logic used by the backing band (walking bass,
// piano voicings, call-and-response licks). No DOM, no audio — testable in Node.
(function (root, factory) {
  const T = factory();
  if (typeof module === 'object' && module.exports) module.exports = T;
  else root.Theory = T;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11];
  const PREFERRED = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  // Roots we never want to show as a chord/key name; respelled enharmonically.
  const AWKWARD_ROOTS = new Set(['D#', 'G#', 'A#', 'E#', 'B#', 'Fb', 'Cb']);

  const mod = (n, m) => ((n % m) + m) % m;

  // ---------- note names ----------

  function parseNote(name) {
    const m = /^([A-Ga-g])(#+|b+)?$/.exec(String(name).trim());
    if (!m) throw new Error('Bad note name: ' + name);
    const acc = m[2] ? (m[2][0] === '#' ? m[2].length : -m[2].length) : 0;
    return { letter: LETTERS.indexOf(m[1].toUpperCase()), acc };
  }

  function formatNote(letter, acc) {
    return LETTERS[letter] + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));
  }

  function pcOf(name) {
    const n = parseNote(name);
    return mod(LETTER_PC[n.letter] + n.acc, 12);
  }

  // Move a note up by `letterSteps` letters and `semis` semitones, keeping
  // correct spelling (e.g. F up a major 6th = D, Eb up a major 2nd = F).
  function transposeNote(name, letterSteps, semis) {
    const n = parseNote(name);
    const letter = mod(n.letter + letterSteps, 7);
    const target = mod(LETTER_PC[n.letter] + n.acc + semis, 12);
    let acc = mod(target - LETTER_PC[letter], 12);
    if (acc > 6) acc -= 12;
    return formatNote(letter, acc);
  }

  // Double accidentals -> simplest enharmonic spelling.
  function simplifyNote(name) {
    return Math.abs(parseNote(name).acc) > 1 ? PREFERRED[pcOf(name)] : name;
  }

  // Chord roots / keys: also avoid D#, G#, E#, Cb etc.
  function simplifyRoot(name) {
    const s = simplifyNote(name);
    return AWKWARD_ROOTS.has(s) ? PREFERRED[pcOf(s)] : s;
  }

  function pretty(name) {
    return name[0] + name.slice(1).replace(/#/g, '♯').replace(/b/g, '♭');
  }

  function spellPc(pc) {
    return PREFERRED[mod(pc, 12)];
  }

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function freqToMidi(f) {
    return 69 + 12 * Math.log2(f / 440);
  }

  // Interval label relative to a major scale: R, b3, #4, b7, 6 ...
  function degreeLabel(degree, semi) {
    const major = MAJOR_SEMIS[(degree - 1) % 7];
    const diff = mod(semi - major + 6, 12) - 6;
    if (degree === 1 && diff === 0) return 'R';
    return (diff < 0 ? 'b'.repeat(-diff) : '#'.repeat(diff)) + degree;
  }

  // ---------- instruments ----------
  // letterSteps/semis: written pitch-class relative to concert.
  // octaveSemis: full written-minus-concert offset in semitones.
  // lowestConcert: lowest sounding MIDI note (with some margin for pitch detection).
  const INSTRUMENTS = {
    alto: { name: 'Alto sax (E♭)', letterSteps: 5, semis: 9, octaveSemis: 9, lowestConcert: 49 },
    tenor: { name: 'Tenor sax (B♭)', letterSteps: 1, semis: 2, octaveSemis: 14, lowestConcert: 44 },
    soprano: { name: 'Soprano sax (B♭)', letterSteps: 1, semis: 2, octaveSemis: 2, lowestConcert: 56 },
    baritone: { name: 'Baritone sax (E♭)', letterSteps: 5, semis: 9, octaveSemis: 21, lowestConcert: 36 },
    concert: { name: 'Concert pitch (C)', letterSteps: 0, semis: 0, octaveSemis: 0, lowestConcert: 36 },
  };

  function toWritten(concertName, instrumentId) {
    const inst = INSTRUMENTS[instrumentId];
    return simplifyRoot(transposeNote(concertName, inst.letterSteps, inst.semis));
  }

  // ---------- scales & chords ----------
  // Each step is [degree, semitones above root]; the degree fixes the letter.
  const SCALES = {
    ionian: { name: 'Major (Ionian)', steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 11]] },
    dorian: { name: 'Dorian', steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 10]] },
    mixolydian: { name: 'Mixolydian', steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 10]] },
    melodicMinor: { name: 'Melodic minor', steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 11]] },
    locrian: { name: 'Locrian', steps: [[1, 0], [2, 1], [3, 3], [4, 5], [5, 6], [6, 8], [7, 10]] },
    phrygianDominant: { name: 'Phrygian dominant', steps: [[1, 0], [2, 1], [3, 4], [4, 5], [5, 7], [6, 8], [7, 10]] },
    blues: { name: 'Blues scale', steps: [[1, 0], [3, 3], [4, 5], [5, 6], [5, 7], [7, 10]] },
    minorPentatonic: { name: 'Minor pentatonic', steps: [[1, 0], [3, 3], [4, 5], [5, 7], [7, 10]] },
    majorPentatonic: { name: 'Major pentatonic', steps: [[1, 0], [2, 2], [3, 4], [5, 7], [6, 9]] },
  };

  // tones: [degree, semis]. Index 1 (3rd) and 3 (7th/6th) are the guide tones.
  // voicings: rootless piano voicings (semitones above root), A and B forms.
  const QUALITIES = {
    maj7: { symbol: 'maj7', tones: [[1, 0], [3, 4], [5, 7], [7, 11]], scale: 'ionian',
      voicings: [[4, 7, 11, 14], [11, 14, 16, 19]] },
    6: { symbol: '6', tones: [[1, 0], [3, 4], [5, 7], [6, 9]], scale: 'ionian',
      voicings: [[4, 7, 9, 14], [9, 14, 16, 19]] },
    7: { symbol: '7', tones: [[1, 0], [3, 4], [5, 7], [7, 10]], scale: 'mixolydian',
      voicings: [[4, 9, 10, 14], [10, 14, 16, 21]] },
    m7: { symbol: 'm7', tones: [[1, 0], [3, 3], [5, 7], [7, 10]], scale: 'dorian',
      voicings: [[3, 7, 10, 14], [10, 14, 15, 19]] },
    m6: { symbol: 'm6', tones: [[1, 0], [3, 3], [5, 7], [6, 9]], scale: 'melodicMinor',
      voicings: [[3, 7, 9, 14], [9, 14, 15, 19]] },
    m7b5: { symbol: 'm7b5', tones: [[1, 0], [3, 3], [5, 6], [7, 10]], scale: 'locrian',
      voicings: [[3, 6, 10, 12], [10, 12, 15, 18]] },
    '7b9': { symbol: '7b9', tones: [[1, 0], [3, 4], [5, 7], [7, 10]], scale: 'phrygianDominant',
      voicings: [[4, 7, 10, 13], [10, 13, 16, 19]] },
  };

  function spellSteps(rootName, steps) {
    return steps.map(([degree, semi]) => {
      const name = simplifyNote(transposeNote(rootName, degree - 1, semi));
      return { name, pc: pcOf(name), degree, semi, label: degreeLabel(degree, semi) };
    });
  }

  function spellScale(rootName, scaleId) {
    return spellSteps(rootName, SCALES[scaleId].steps);
  }

  function chordSymbol(rootName, quality) {
    return pretty(rootName) + pretty(QUALITIES[quality].symbol);
  }

  function buildChord(rootName, quality) {
    const q = QUALITIES[quality];
    const tones = spellSteps(rootName, q.tones).map((t, i) => ({ ...t, guide: i === 1 || i === 3 }));
    return {
      root: rootName,
      quality,
      symbol: chordSymbol(rootName, quality),
      tones,
      scaleId: q.scale,
      scaleName: SCALES[q.scale].name,
      scale: spellScale(rootName, q.scale),
    };
  }

  // ---------- progressions ----------
  // Chords are relative to the key: [letter steps, semitones] above the key root.
  const P = (l, s, q, beats = 4) => ({ l, s, q, beats });

  const PROGRESSIONS = {
    'ii-V-I': { name: 'Major ii–V–I', defaultKey: 'Bb', pent: 'majorPentatonic',
      chords: [P(1, 2, 'm7'), P(4, 7, '7'), P(0, 0, 'maj7', 8)] },
    'minor-ii-V-i': { name: 'Minor ii–V–i', defaultKey: 'C', pent: 'minorPentatonic',
      chords: [P(1, 2, 'm7b5'), P(4, 7, '7b9'), P(0, 0, 'm6', 8)] },
    blues: { name: '12-bar blues', defaultKey: 'Bb', pent: 'minorPentatonic',
      chords: [P(0, 0, '7'), P(3, 5, '7'), P(0, 0, '7', 8), P(3, 5, '7', 8), P(0, 0, '7', 8),
        P(4, 7, '7'), P(3, 5, '7'), P(0, 0, '7'), P(4, 7, '7')] },
    'minor-blues': { name: 'Minor blues', defaultKey: 'C', pent: 'minorPentatonic',
      chords: [P(0, 0, 'm7', 16), P(3, 5, 'm7', 8), P(0, 0, 'm7', 8), P(5, 8, '7'), P(4, 7, '7b9'),
        P(0, 0, 'm7', 8)] },
    turnaround: { name: 'I–vi–ii–V turnaround', defaultKey: 'F', pent: 'majorPentatonic',
      chords: [P(0, 0, 'maj7'), P(5, 9, 'm7'), P(1, 2, 'm7'), P(4, 7, '7')] },
    'autumn-cycle': { name: 'Autumn-style cycle (major + minor ii–V)', defaultKey: 'Bb', pent: 'majorPentatonic',
      chords: [P(1, 2, 'm7'), P(4, 7, '7'), P(0, 0, 'maj7'), P(3, 5, 'maj7'), P(6, 11, 'm7b5'),
        P(2, 4, '7b9'), P(5, 9, 'm6', 8)] },
    'dorian-vamp': { name: 'Dorian vamp (one chord)', defaultKey: 'D', pent: 'minorPentatonic',
      chords: [P(0, 0, 'm7', 32)] },
    'dominant-vamp': { name: 'Dominant vamp (one chord)', defaultKey: 'Bb', pent: 'minorPentatonic',
      chords: [P(0, 0, '7', 16)] },
  };

  const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Expand a progression in a concert key into chords + per-beat info (4/4).
  function buildTimeline(progressionId, concertKey) {
    const prog = PROGRESSIONS[progressionId];
    let start = 0;
    const chords = prog.chords.map((c) => {
      const root = simplifyRoot(transposeNote(concertKey, c.l, c.s));
      const chord = { root, quality: c.q, beats: c.beats, startBeat: start };
      start += c.beats;
      return chord;
    });
    const totalBeats = start;
    const beats = [];
    chords.forEach((c, ci) => {
      for (let b = 0; b < c.beats; b++) {
        const i = c.startBeat + b;
        beats.push({
          chordIdx: ci,
          bar: Math.floor(i / 4),
          beatInBar: i % 4,
          beatOfChord: b,
          beatsLeftInChord: c.beats - b,
        });
      }
    });
    const bars = [];
    for (let bar = 0; bar < totalBeats / 4; bar++) {
      const idxs = [];
      for (let b = bar * 4; b < bar * 4 + 4; b++) {
        if (!idxs.includes(beats[b].chordIdx)) idxs.push(beats[b].chordIdx);
      }
      bars.push(idxs);
    }
    return { progressionId, key: concertKey, name: prog.name, pent: prog.pent,
      chords, beats, bars, totalBeats };
  }

  // Concert-pitch info for a chord of a timeline: pcs used for scoring and audio.
  function chordPcs(chord) {
    const rootPc = pcOf(chord.root);
    const q = QUALITIES[chord.quality];
    return {
      rootPc,
      tones: q.tones.map(([, s]) => mod(rootPc + s, 12)),
      guides: [q.tones[1][1], q.tones[3][1]].map((s) => mod(rootPc + s, 12)),
      third: mod(rootPc + q.tones[1][1], 12),
      scale: SCALES[q.scale].steps.map(([, s]) => mod(rootPc + s, 12)),
    };
  }

  // ---------- band note choice (pure; rng injectable for tests) ----------

  const BASS_LO = 28; // E1
  const BASS_HI = 48; // C3

  function nearestInRange(pc, ref, lo, hi) {
    let best = null;
    for (let m = lo; m <= hi; m++) {
      if (mod(m, 12) === mod(pc, 12) && (best === null || Math.abs(m - ref) < Math.abs(best - ref))) best = m;
    }
    return best;
  }

  // One quarter-note of walking bass (concert MIDI).
  function walkBass({ prev, chord, beatOfChord, beatsLeftInChord, nextChord, rng = Math.random }) {
    const ref = prev == null ? 36 : prev;
    const pcs = chordPcs(chord);
    if (beatOfChord === 0) return nearestInRange(pcs.rootPc, ref, BASS_LO, BASS_HI);
    if (beatsLeftInChord === 1 && nextChord) {
      const target = nearestInRange(pcOf(nextChord.root), ref, BASS_LO + 1, BASS_HI - 1);
      let dir = rng() < 0.5 ? 1 : -1;
      let note = target + dir;
      if (note === prev) note = target - dir;
      return note;
    }
    const pool = rng() < 0.3 ? pcs.scale : pcs.tones;
    const options = [];
    for (let m = BASS_LO; m <= BASS_HI; m++) {
      const d = Math.abs(m - ref);
      if (d >= 1 && d <= 7 && pool.includes(mod(m, 12))) options.push(m);
    }
    if (!options.length) return nearestInRange(pcs.rootPc, ref, BASS_LO, BASS_HI);
    return options[Math.floor(rng() * options.length)];
  }

  // Rootless piano voicing near the previous one (concert MIDI).
  function voiceChord(chord, prevVoicing) {
    const rootPc = pcOf(chord.root);
    const prevCenter = prevVoicing ? prevVoicing.reduce((a, b) => a + b, 0) / prevVoicing.length : 62;
    let best = null;
    let bestScore = Infinity;
    for (const form of QUALITIES[chord.quality].voicings) {
      for (let base = 36; base <= 72; base += 12) {
        const v = form.map((s) => base + rootPc + s);
        if (v[0] < 50 || v[0] > 62) continue;
        const center = v.reduce((a, b) => a + b, 0) / v.length;
        const score = Math.abs(center - prevCenter) + Math.abs(center - 62) * 0.3;
        if (score < bestScore) { bestScore = score; best = v; }
      }
    }
    return best;
  }

  const LICK_RHYTHMS = [
    'xxxxx-..........',
    '..xxxx-.x-......',
    'x.xx-.x-........',
    'xxx.x---........',
    '.xxxxxx-x-......',
    'x-x-xxx-........',
    '..x.x.xx-.......',
    'xxxxxxx-........',
  ];

  // A short (1 bar + tail) phrase for call-and-response. `chordAt(eighth)` returns
  // the concert chord sounding at each of the 16 eighths. Returns concert MIDI notes.
  function generateLick(chordAt, rng = Math.random, lo = 60, hi = 79) {
    const rhythm = LICK_RHYTHMS[Math.floor(rng() * LICK_RHYTHMS.length)];
    const notes = [];
    let prev = lo + Math.floor(rng() * 8) + 2;
    let dir = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < rhythm.length; i++) {
      if (rhythm[i] !== 'x') continue;
      let len = 1;
      while (rhythm[i + len] === '-') len++;
      const pcs = chordPcs(chordAt(i));
      const strong = i % 2 === 0;
      const isLast = !rhythm.slice(i + 1).includes('x');
      const pool = strong || isLast ? pcs.tones : pcs.scale;
      const cands = [];
      for (let m = lo; m <= hi; m++) if (pool.includes(mod(m, 12))) cands.push(m);
      if (rng() < 0.25) dir = -dir;
      let pick = dir > 0 ? cands.find((m) => m > prev) : [...cands].reverse().find((m) => m < prev);
      if (pick === undefined || Math.abs(pick - prev) > 5) {
        dir = -dir;
        pick = cands.reduce((a, b) => (Math.abs(b - prev) < Math.abs(a - prev) && b !== prev ? b : a), cands[0]);
      }
      notes.push({ eighth: i, len, midi: pick });
      prev = pick;
    }
    return notes;
  }

  // Seeded RNG for tests.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    LETTERS, LETTER_PC, PREFERRED, KEYS, INSTRUMENTS, SCALES, QUALITIES, PROGRESSIONS,
    mod, parseNote, formatNote, pcOf, transposeNote, simplifyNote, simplifyRoot, pretty, spellPc,
    midiToFreq, freqToMidi, degreeLabel, toWritten, spellScale, buildChord, chordSymbol,
    buildTimeline, chordPcs, walkBass, voiceChord, generateLick, nearestInRange, mulberry32,
    BASS_LO, BASS_HI,
  };
});
