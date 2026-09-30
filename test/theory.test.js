const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/theory.js');
const { yin } = require('../js/pitch.js');

const names = (notes) => notes.map((n) => n.name);

test('transposition direction: concert -> written', () => {
  assert.equal(T.toWritten('Eb', 'alto'), 'C'); // concert Eb = alto C
  assert.equal(T.toWritten('C', 'tenor'), 'D'); // concert C = tenor D
  assert.equal(T.toWritten('Bb', 'tenor'), 'C');
  assert.equal(T.toWritten('Bb', 'alto'), 'G');
  assert.equal(T.toWritten('F', 'alto'), 'D');
  assert.equal(T.toWritten('Eb', 'baritone'), 'C');
  assert.equal(T.toWritten('Bb', 'soprano'), 'C');
  assert.equal(T.toWritten('G', 'concert'), 'G');
});

test('written octave offsets make sense for the real instruments', () => {
  // Alto written middle C sounds Eb3 (51); tenor written C4 sounds Bb2 (46).
  assert.equal(60 - T.INSTRUMENTS.alto.octaveSemis, 51);
  assert.equal(60 - T.INSTRUMENTS.tenor.octaveSemis, 46);
  assert.equal(60 - T.INSTRUMENTS.baritone.octaveSemis, 39);
  assert.equal(60 - T.INSTRUMENTS.soprano.octaveSemis, 58);
});

test('spelling follows the key, not a fixed sharp/flat table', () => {
  // Concert F major on alto is written D major: F#, not Gb.
  assert.deepEqual(names(T.spellScale(T.toWritten('F', 'alto'), 'ionian')), ['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
  assert.deepEqual(names(T.spellScale('F', 'ionian')), ['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
  assert.deepEqual(names(T.spellScale('G', 'blues')), ['G', 'Bb', 'C', 'Db', 'D', 'F']);
  assert.deepEqual(names(T.spellScale('D', 'dorian')), ['D', 'E', 'F', 'G', 'A', 'B', 'C']);
  assert.deepEqual(names(T.spellScale('B', 'locrian')), ['B', 'C', 'D', 'E', 'F', 'G', 'A']);
  assert.deepEqual(names(T.spellScale('F#', 'ionian')), ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
});

test('no double accidentals or awkward roots', () => {
  for (const key of T.KEYS) {
    for (const inst of Object.keys(T.INSTRUMENTS)) {
      for (const pid of Object.keys(T.PROGRESSIONS)) {
        const tl = T.buildTimeline(pid, key);
        for (const c of tl.chords) {
          const w = T.toWritten(c.root, inst);
          assert.ok(!/##|bb/.test(w), `${w}`);
          assert.ok(!['D#', 'G#', 'A#', 'E#', 'B#', 'Fb', 'Cb'].includes(w), `${pid} ${key} ${inst}: ${w}`);
          const chord = T.buildChord(w, c.quality);
          for (const n of [...chord.tones, ...chord.scale]) assert.ok(!/##|bb/.test(n.name), n.name);
          // written pcs are the concert pcs shifted by the instrument offset
          assert.equal(T.pcOf(w), T.mod(T.pcOf(c.root) + T.INSTRUMENTS[inst].semis, 12));
        }
      }
    }
  }
});

test('chords and degree labels', () => {
  const c = T.buildChord('D', 'm7');
  assert.deepEqual(names(c.tones), ['D', 'F', 'A', 'C']);
  assert.deepEqual(c.tones.map((t) => t.label), ['R', 'b3', '5', 'b7']);
  assert.deepEqual(c.tones.filter((t) => t.guide).map((t) => t.name), ['F', 'C']);
  assert.equal(c.symbol, 'Dm7');
  assert.equal(T.buildChord('Bb', 'm7b5').symbol, 'B♭m7♭5');
  assert.deepEqual(T.spellScale('C', 'blues').map((n) => n.label), ['R', 'b3', '4', 'b5', '5', 'b7']);
});

test('progressions build into whole 4/4 bars', () => {
  const blues = T.buildTimeline('blues', 'Bb');
  assert.equal(blues.totalBeats, 48);
  assert.equal(blues.bars.length, 12);
  assert.deepEqual(blues.chords.map((c) => c.root), ['Bb', 'Eb', 'Bb', 'Eb', 'Bb', 'F', 'Eb', 'Bb', 'F']);
  const two = T.buildTimeline('ii-V-I', 'C');
  assert.deepEqual(two.chords.map((c) => c.root + c.quality), ['Dm7', 'G7', 'Cmaj7']);
  const minor = T.buildTimeline('minor-ii-V-i', 'C');
  assert.deepEqual(minor.chords.map((c) => c.root), ['D', 'G', 'C']);
  const autumn = T.buildTimeline('autumn-cycle', 'Bb');
  assert.deepEqual(autumn.chords.map((c) => c.root), ['C', 'F', 'Bb', 'Eb', 'A', 'D', 'G']);
  for (const pid of Object.keys(T.PROGRESSIONS)) {
    assert.equal(T.buildTimeline(pid, 'C').totalBeats % 4, 0, pid);
  }
});

test('walking bass stays in range, lands roots, approaches by half step', () => {
  const rng = T.mulberry32(7);
  for (const pid of Object.keys(T.PROGRESSIONS)) {
    const tl = T.buildTimeline(pid, 'Eb');
    let prev = null;
    for (let loop = 0; loop < 3; loop++) {
      tl.beats.forEach((b, i) => {
        const chord = tl.chords[b.chordIdx];
        const next = tl.chords[tl.beats[(i + b.beatsLeftInChord) % tl.totalBeats].chordIdx];
        const nextChord = next === chord && tl.chords.length === 1 ? null : next;
        const m = T.walkBass({ prev, chord, beatOfChord: b.beatOfChord, beatsLeftInChord: b.beatsLeftInChord,
          nextChord, rng });
        assert.ok(m >= T.BASS_LO && m <= T.BASS_HI, `${pid} bass ${m}`);
        if (b.beatOfChord === 0) assert.equal(T.mod(m, 12), T.pcOf(chord.root));
        if (b.beatsLeftInChord === 1 && nextChord) {
          const d = T.mod(m - T.pcOf(nextChord.root), 12);
          assert.ok(d === 1 || d === 11, `approach ${d}`);
        }
        prev = m;
      });
    }
  }
});

test('piano voicings are rootless, in a mid register, and contain the guide tones', () => {
  for (const q of Object.keys(T.QUALITIES)) {
    for (const root of T.KEYS) {
      const chord = { root, quality: q };
      const v = T.voiceChord(chord, null);
      assert.ok(v && v[0] >= 50 && v[0] <= 62, `${root}${q} ${v}`);
      const pcs = T.chordPcs(chord);
      for (const g of pcs.guides) assert.ok(v.some((m) => T.mod(m, 12) === g), `${root}${q} guide`);
    }
  }
});

test('licks use chord tones on strong eighths and stay in range', () => {
  const rng = T.mulberry32(3);
  const chord = { root: 'F', quality: '7' };
  const pcs = T.chordPcs(chord);
  for (let i = 0; i < 200; i++) {
    const lick = T.generateLick(() => chord, rng);
    assert.ok(lick.length >= 3);
    for (const n of lick) {
      assert.ok(n.midi >= 60 && n.midi <= 79);
      assert.ok(pcs.scale.includes(T.mod(n.midi, 12)));
      if (n.eighth % 2 === 0) assert.ok(pcs.tones.includes(T.mod(n.midi, 12)), `strong ${n.midi}`);
    }
  }
});

function synth(freq, sr, n, shape) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ph = (i * freq) / sr;
    // Sawtooth-ish with decaying harmonics approximates a reedy tone.
    buf[i] = shape === 'saw'
      ? [1, 2, 3, 4, 5, 6].reduce((a, h) => a + Math.sin(2 * Math.PI * ph * h) / h, 0) * 0.3
      : Math.sin(2 * Math.PI * ph) * 0.5;
  }
  return buf;
}

test('YIN detects pitches across the saxophone family', () => {
  const sr = 48000;
  for (const midi of [36, 44, 49, 58, 67, 76, 88]) {
    const f = T.midiToFreq(midi);
    for (const shape of ['sine', 'saw']) {
      const r = yin(synth(f, sr, 4096, shape), sr, 50, 1600);
      assert.ok(r, `no pitch for ${midi} ${shape}`);
      const cents = 1200 * Math.log2(r.freq / f);
      assert.ok(Math.abs(cents) < 5, `${midi} ${shape}: ${r.freq.toFixed(2)} vs ${f.toFixed(2)}`);
    }
  }
  assert.equal(yin(new Float32Array(4096).map(() => Math.random() - 0.5), sr), null);
});

const F = require('../js/fingering.js');

test('fingerings cover the full written range with valid keys', () => {
  const ids = new Set(F.SHAPES.map((s) => s.id));
  for (let m = F.LOW; m <= F.HIGH; m++) {
    const keys = F.keysFor(m);
    assert.ok(Array.isArray(keys), `missing fingering for ${m}`);
    for (const k of keys) assert.ok(ids.has(k), `unknown key ${k}`);
    assert.equal(keys.includes('oct'), m >= 74, `octave key for ${m}`);
  }
  assert.equal(F.keysFor(57), null);
  assert.equal(F.keysFor(91), null);
  assert.deepEqual(F.keysFor(67), ['L1', 'L2', 'L3']); // G4
  assert.deepEqual(F.keysFor(79), ['oct', 'L1', 'L2', 'L3']); // G5
  assert.deepEqual(F.keysFor(73), []); // C#5: open
  assert.ok(F.svg(67).includes('class="key on"'));
});

test('every progression names a key pentatonic', () => {
  for (const [id, p] of Object.entries(T.PROGRESSIONS)) {
    assert.ok(['majorPentatonic', 'minorPentatonic'].includes(p.pent), id);
  }
  assert.deepEqual(names(T.spellScale('F', 'majorPentatonic')), ['F', 'G', 'A', 'C', 'D']);
});

const Demo = require('../js/demo.js');

test('demos: every kind, every progression — in range, well-formed', () => {
  const lo = 53, hi = 75; // alto, written D4..C6
  for (const pid of Object.keys(T.PROGRESSIONS)) {
    const tl = T.buildTimeline(pid, 'Bb');
    for (const kind of Demo.KINDS) {
      for (const keyScale of ['blues', 'minorPentatonic', 'majorPentatonic']) {
        const notes = Demo.build(kind, tl, { lo, hi, keyScale, loop: 2 });
        if (kind === 'echo') { assert.equal(notes.length, 0); continue; }
        assert.ok(notes.length > 0, `${pid} ${kind} is empty`);
        for (const n of notes) {
          assert.ok(Number.isInteger(n.midi) && n.midi >= lo && n.midi <= hi, `${pid} ${kind} midi ${n.midi}`);
          assert.ok(n.dur > 0 && n.beat >= -1 && n.beat < tl.totalBeats, `${pid} ${kind} beat ${n.beat}`);
        }
      }
    }
  }
});

test('demos play what the lesson asks for', () => {
  const tl = T.buildTimeline('ii-V-I', 'Bb');
  const chordAt = (b) => tl.chords[tl.beats[T.mod(Math.floor(b), tl.totalBeats)].chordIdx];
  const opts = { lo: 53, hi: 75 };
  for (const n of Demo.build('root-whole', tl, opts)) assert.equal(T.mod(n.midi, 12), T.pcOf(chordAt(n.beat).root));
  for (const n of Demo.build('target', tl, opts).filter((x) => Number.isInteger(x.beat))) {
    assert.equal(T.mod(n.midi, 12), T.chordPcs(chordAt(n.beat)).third);
  }
  for (const n of Demo.build('arp-up', tl, opts)) assert.ok(T.chordPcs(chordAt(n.beat)).tones.includes(T.mod(n.midi, 12)));
  for (const n of Demo.build('guide', tl, opts)) assert.ok(T.chordPcs(chordAt(n.beat)).guides.includes(T.mod(n.midi, 12)));
  const blues = T.buildTimeline('blues', 'Bb');
  const bluesPcs = T.spellScale('Bb', 'blues').map((x) => x.pc);
  for (const n of Demo.build('riff', blues, { ...opts, keyScale: 'blues' })) assert.ok(bluesPcs.includes(T.mod(n.midi, 12)));
});

test('chord scales respect the key where the key is clear', () => {
  const majorOf = (k) => new Set(T.spellScale(k, 'ionian').map((n) => n.pc));
  for (const key of T.KEYS) {
    const keyPcs = majorOf(key);
    const inKey = (c) => T.chordPcs(c).scale.every((pc) => keyPcs.has(pc));
    // ii-V-I and the turnaround are entirely in one major key.
    for (const pid of ['ii-V-I', 'turnaround']) {
      for (const c of T.buildTimeline(pid, key).chords) assert.ok(inKey(c), `${pid} ${key} ${c.root}${c.quality}`);
    }
    // Autumn cycle: ii V I IV viiø are all in the major key (IV takes Lydian).
    const autumn = T.buildTimeline('autumn-cycle', key).chords.slice(0, 5);
    for (const c of autumn) assert.ok(inKey(c), `autumn ${key} ${c.root}${c.quality} ${c.scale}`);
    assert.equal(autumn[3].scale, 'lydian');
    // Minor blues bVI7: Lydian dominant keeps the key's natural 2nd (D in C minor).
    const bVI = T.buildTimeline('minor-blues', key).chords[3];
    const minorKey = new Set(T.spellScale(key, 'dorian').map((n) => n.pc)); // key's 2nd is in dorian
    assert.equal(bVI.scale, 'lydianDominant');
    assert.ok(minorKey.has(T.mod(T.pcOf(bVI.root) + 6, 12)), 'bVI #11 is the key 2nd');
  }
  assert.deepEqual(names(T.buildChord('C', 'maj7', 'lydian').scale), ['C', 'D', 'E', 'F#', 'G', 'A', 'B']);
  assert.equal(T.buildChord('C', 'maj7', 'lydian').scale.find((n) => n.pc === 6).label, '#4');
});

test('new-scale intros: every scale met in a lesson (except major) is explained', () => {
  global.window = global.window || {};
  require('../js/lessons.js');
  const seen = new Set(['ionian']);
  for (const l of window.LESSONS) {
    for (const { scaleId } of T.scalesUsed(l.progression, l.key, l.focus)) {
      if (!seen.has(scaleId)) assert.ok(T.SCALE_INTROS[scaleId], `${l.id}: no intro for ${scaleId}`);
      seen.add(scaleId);
    }
  }
  assert.deepEqual(T.scalesUsed('ii-V-I', 'C', 'chord').map((x) => x.scaleId), ['dorian', 'mixolydian', 'ionian']);
  assert.deepEqual(T.scalesUsed('blues', 'Bb', 'blues'), [{ scaleId: 'blues', root: 'Bb' }]);
  assert.deepEqual(T.scalesUsed('blues', 'Bb', 'pentatonic'), [{ scaleId: 'minorPentatonic', root: 'Bb' }]);
});

test('modes name the scale they come from', () => {
  const p = (root, id) => { const x = T.parentScale(root, id); return x && `${x.root} ${x.kind}`; };
  assert.equal(p('A', 'dorian'), 'G major');
  assert.equal(p('D', 'mixolydian'), 'G major');
  assert.equal(p('C', 'lydian'), 'G major');
  assert.equal(p('E', 'aeolian'), 'G major');
  assert.equal(p('F#', 'locrian'), 'G major');
  assert.equal(p('B', 'phrygianDominant'), 'E harmonic minor');
  assert.equal(p('F', 'lydianDominant'), 'C melodic minor');
  assert.equal(p('C', 'blues'), null);
  // the parent really contains the same notes
  for (const [root, id] of [['A', 'dorian'], ['Bb', 'mixolydian'], ['Eb', 'lydian'], ['C#', 'aeolian'], ['B', 'locrian']]) {
    const par = T.parentScale(root, id);
    const a = new Set(T.spellScale(root, id).map((n) => n.pc));
    const b = new Set(T.spellScale(par.root, 'ionian').map((n) => n.pc));
    assert.deepEqual([...a].sort(), [...b].sort(), `${root} ${id}`);
  }
});
