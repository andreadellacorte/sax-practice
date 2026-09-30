(function () {
  'use strict';
  const T = window.Theory;
  const LESSONS = window.LESSONS;
  const $ = (id) => document.getElementById(id);
  const mod = T.mod;

  // ---------- persistence (per-browser conveniences only) ----------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('saxlab.' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('saxlab.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
    },
  };

  const settings = Object.assign({
    instrument: 'alto', notation: 'written', swing: '0.64', volume: 0.8, countIn: true,
    mutes: { drums: false, bass: false, piano: false }, lessonId: 'roots',
  }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);

  const log = Object.assign({ days: {}, done: [] }, store.get('log', {}));
  const saveLog = () => store.set('log', log);

  const state = {
    progression: 'ii-V-I', key: 'Bb', focus: 'roots', tempo: 100, callResponse: false,
    timeline: null, chordIdx: 0, bar: -1, counting: false, spell: new Map(), heardPc: null,
  };

  const band = new window.Band();
  const mic = new window.Pitch.MicTracker();
  let stats = { target: 0, tone: 0, scale: 0, out: 0, total: 0 };

  // ---------- helpers ----------
  const inst = () => T.INSTRUMENTS[settings.instrument];
  const written = () => settings.notation === 'written' && settings.instrument !== 'concert';
  const dispRoot = (concertRoot) => (written() ? T.toWritten(concertRoot, settings.instrument) : concertRoot);
  const dispPcOffset = () => (written() ? inst().semis : 0);
  const dispMidiOffset = () => (written() ? inst().octaveSemis : 0);
  const chordAt = (i) => state.timeline.chords[i];
  const displayChord = (chord) => T.buildChord(dispRoot(chord.root), chord.quality);

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Focus modes that use one scale for the whole progression (built on the key).
  const keyScaleId = () => ({ blues: 'blues', pentatonic: state.timeline.pent }[state.focus] || null);

  // Concert pitch-class sets for the current chord: what counts as target / chord tone / scale.
  function focusSets(chordIdx) {
    const chord = chordAt(chordIdx);
    const pcs = T.chordPcs(chord);
    const ks = keyScaleId();
    const keyScale = ks ? T.spellScale(state.timeline.key, ks).map((n) => n.pc) : null;
    const scale = keyScale || pcs.scale;
    const target = {
      roots: [pcs.rootPc], chord: pcs.tones, guide: pcs.guides, thirds: [pcs.third],
      blues: keyScale, pentatonic: keyScale, scale: pcs.scale,
    }[state.focus];
    return { target: new Set(target), tone: new Set(pcs.tones), scale: new Set([...scale, ...pcs.tones]) };
  }

  // Map displayed pitch class -> spelled name, taken from the chart's chords so
  // detected notes and licks are spelled like the harmony.
  function buildSpellMap() {
    const m = new Map();
    for (const c of state.timeline.chords) {
      const d = displayChord(c);
      for (const n of [...d.tones, ...d.scale]) if (!m.has(n.pc)) m.set(n.pc, n.name);
    }
    state.spell = m;
  }
  const spell = (dispPc) => state.spell.get(mod(dispPc, 12)) || T.spellPc(dispPc);

  // ---------- setup controls ----------
  function fillSelect(sel, items) {
    sel.innerHTML = '';
    for (const [value, label] of items) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      sel.appendChild(o);
    }
  }

  function fillKeys() {
    fillSelect($('key'), T.KEYS.map((k) => {
      const w = T.toWritten(k, settings.instrument);
      return [k, settings.instrument === 'concert' ? T.pretty(k) : `${T.pretty(k)}  (your ${T.pretty(w)})`];
    }));
    $('key').value = state.key;
  }

  function renderLessonList() {
    const ol = $('lessons');
    ol.innerHTML = '';
    let level = null;
    LESSONS.forEach((l, i) => {
      if (l.level !== level) {
        level = l.level;
        const h = document.createElement('li');
        h.className = 'level';
        h.textContent = level;
        ol.appendChild(h);
      }
      const li = document.createElement('li');
      if (log.done.includes(l.id)) li.className = 'done';
      const b = document.createElement('button');
      b.innerHTML = `<span class="num">${log.done.includes(l.id) ? '✓' : i + 1}</span><span></span>`;
      b.lastChild.textContent = l.title;
      if (settings.lessonId === l.id) b.classList.add('active');
      b.addEventListener('click', () => selectLesson(l.id));
      li.appendChild(b);
      ol.appendChild(li);
    });
    $('free-practice').classList.toggle('active', !settings.lessonId);
  }

  function renderLessonCard() {
    const card = $('lesson-card');
    const lesson = LESSONS.find((l) => l.id === settings.lessonId);
    if (!lesson) {
      card.innerHTML = `
        <span class="label">Free practice</span>
        <h2>Jam with the band</h2>
        <p class="goal">Pick any progression, key and tempo. Use <b>Highlight</b> to choose which notes to aim for,
        and turn on the mic to see how often you hit them.</p>
        <div class="tip">Start slow. When your target % stays high, raise the tempo by 10 bpm.</div>`;
      return;
    }
    const idx = LESSONS.indexOf(lesson);
    const done = log.done.includes(lesson.id);
    card.innerHTML = `
      <span class="label">Lesson ${idx + 1} of ${LESSONS.length} · ${lesson.level}</span>
      <h2></h2>
      <p class="goal"></p>
      <ol>${lesson.steps.map(() => '<li></li>').join('')}</ol>
      <div class="tip">💡 <span></span></div>
      <div class="lesson-actions">
        <button class="demo-btn" id="lesson-demo">${state.demo ? '■ Stop demo' : '🎷 Hear a demo'}</button>
        <button class="ghost" id="lesson-done">${done ? '✓ Completed' : 'Mark complete'}</button>
        ${idx < LESSONS.length - 1 ? '<button class="ghost" id="lesson-next">Next lesson →</button>' : ''}
      </div>`;
    card.querySelector('h2').textContent = lesson.title;
    card.querySelector('.goal').textContent = lesson.goal;
    card.querySelectorAll('ol li').forEach((li, i) => { li.textContent = lesson.steps[i]; });
    card.querySelector('.tip span').textContent = lesson.tip;
    $('lesson-done').addEventListener('click', () => {
      if (done) log.done = log.done.filter((id) => id !== lesson.id);
      else log.done.push(lesson.id);
      saveLog();
      renderLessonList();
      renderLessonCard();
      renderLog();
    });
    const next = $('lesson-next');
    if (next) next.addEventListener('click', () => selectLesson(LESSONS[idx + 1].id));
    $('lesson-demo').addEventListener('click', () => (state.demo ? stopDemo() : startDemo(lesson)));
  }

  function selectLesson(id, fromUser = true) {
    if (state.demo) stopDemo();
    settings.lessonId = id;
    const lesson = LESSONS.find((l) => l.id === id);
    if (lesson && fromUser) {
      settings.swing = lesson.swing || '0.64';
      $('swing').value = settings.swing;
      band.swing = Number(settings.swing);
    }
    saveSettings();
    if (lesson) {
      state.progression = lesson.progression;
      state.key = lesson.key;
      state.tempo = lesson.tempo;
      state.focus = lesson.focus;
      state.callResponse = !!lesson.callResponse;
    }
    syncControls();
    rebuild();
    renderLessonList();
    renderLessonCard();
    resetStats();
  }

  function syncControls() {
    $('progression').value = state.progression;
    $('key').value = state.key;
    $('tempo').value = state.tempo;
    $('tempo-out').textContent = state.tempo;
    $('focus').value = state.focus;
    $('call-response').checked = state.callResponse;
    band.tempo = state.tempo;
    band.callResponse = state.callResponse;
    if (!state.callResponse) hidePhrase();
  }

  // ---------- rendering ----------
  function rebuild() {
    state.timeline = T.buildTimeline(state.progression, state.key);
    band.setTimeline(state.timeline);
    // Queued beat events refer to the old timeline's chords; drop them.
    if (band.playing) band.events = [];
    if (state.chordIdx >= state.timeline.chords.length) state.chordIdx = 0;
    if (!band.playing) state.chordIdx = 0;
    buildSpellMap();
    renderChart();
    renderNow();
    renderScale();
  }

  function renderChart() {
    const tl = state.timeline;
    $('chart-title').textContent = `${tl.name} in ${T.pretty(dispRoot(tl.key))}` +
      (written() ? ` (concert ${T.pretty(tl.key)})` : '');
    const grid = $('chart');
    grid.innerHTML = '';
    tl.bars.forEach((chordIdxs, bar) => {
      const el = document.createElement('div');
      el.className = 'bar';
      el.dataset.bar = bar;
      const continuing = tl.chords[chordIdxs[0]].startBeat < bar * 4;
      chordIdxs.forEach((ci, k) => {
        const s = document.createElement('span');
        s.textContent = displayChord(tl.chords[ci]).symbol;
        if (k === 0 && continuing) s.className = 'repeat';
        el.appendChild(s);
      });
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = bar + 1;
      el.appendChild(n);
      grid.appendChild(el);
    });
    highlightBar(state.bar);
  }

  function highlightBar(bar) {
    document.querySelectorAll('.bar.cur').forEach((b) => b.classList.remove('cur'));
    const el = document.querySelector(`.bar[data-bar="${bar}"]`);
    if (el) el.classList.add('cur');
  }

  function renderNow() {
    const tl = state.timeline;
    const chord = chordAt(state.chordIdx);
    $('chord-now').textContent = displayChord(chord).symbol;
    $('chord-concert').textContent = written() ? `concert ${T.buildChord(chord.root, chord.quality).symbol}` : '';
    const next = tl.chords[(state.chordIdx + 1) % tl.chords.length];
    $('chord-next').textContent = displayChord(next).symbol;
  }

  // Notes to show for the current chord: the scale, plus any chord tones it lacks.
  function scaleView() {
    const chord = chordAt(state.chordIdx);
    const d = displayChord(chord);
    const sets = focusSets(state.chordIdx);
    const off = dispPcOffset();
    let root;
    let notes;
    let name;
    const ks = keyScaleId();
    if (ks) {
      root = dispRoot(state.timeline.key);
      notes = T.spellScale(root, ks);
      name = `${T.pretty(root)} ${T.SCALES[ks].name.toLowerCase()}`;
      for (const t of d.tones) {
        if (!notes.some((n) => n.pc === t.pc)) notes.push({ ...t, label: `${t.label} of ${d.symbol}`, extra: true });
      }
    } else {
      root = d.root;
      notes = d.scale.map((n) => ({ ...n }));
      name = `${T.pretty(root)} ${d.scaleName}`;
      // Show chord-tone labels (e.g. "b7") on the scale notes the chord uses.
      for (const n of notes) {
        const t = d.tones.find((x) => x.pc === n.pc);
        if (t) n.label = t.label;
      }
    }
    const rootP = T.parseNote(root);
    const rootPc = T.pcOf(root);
    for (const n of notes) {
      const concertPc = mod(n.pc - off, 12);
      n.kind = sets.target.has(concertPc) ? 'target' : sets.tone.has(concertPc) ? 'tone' : 'scale';
      n.semiUp = mod(n.pc - rootPc, 12);
      n.letterUp = mod(T.parseNote(n.name).letter - rootP.letter, 7);
    }
    notes.sort((a, b) => a.letterUp - b.letterUp || a.semiUp - b.semiUp);
    return { root, rootP, notes, name };
  }

  function renderScale() {
    const v = scaleView();
    $('scale-name').textContent = v.name + (keyScaleId() ? '' : ` over ${displayChord(chordAt(state.chordIdx)).symbol}`);
    const rootMidi = 60 + T.LETTER_PC[v.rootP.letter] + v.rootP.acc;
    const concertOf = (n) => rootMidi + n.semiUp + (n.letterUp === 0 && n.semiUp > 6 ? -12 : 0) - dispMidiOffset();

    const chips = $('chips');
    chips.innerHTML = '';
    for (const n of v.notes) {
      const b = document.createElement('button');
      b.className = `chip ${n.kind}`;
      b.dataset.pc = n.pc;
      b.innerHTML = '<b></b><small></small>';
      b.firstChild.textContent = T.pretty(n.name);
      b.lastChild.textContent = n.label;
      b.addEventListener('click', () => band.playNotes([concertOf(n)]));
      chips.appendChild(b);
    }
    $('play-scale').onclick = () => {
      const up = v.notes.filter((n) => !n.extra).map(concertOf);
      band.playNotes([...up, up[0] + 12, ...up.slice().reverse()], 60 / Math.max(state.tempo, 60) / 1.5);
    };
    drawStaff(v);
    renderFingerings(v, concertOf);
    markHeard();
    if (state.demoNote) markDemo(mod(state.demoNote.midi + dispMidiOffset(), 12), state.demoNote.midi + inst().octaveSemis);
  }

  function drawStaff(v) {
    const svg = $('staff');
    const rootStep = v.rootP.letter + 28; // C4 = step 28, E4 (bottom line) = 30
    const items = [...v.notes.map((n) => ({ ...n, step: rootStep + n.letterUp })),
      { ...v.notes[0], step: rootStep + 7, label: v.notes[0].label, octave: true }];
    const x0 = 72;
    const dx = 44;
    const W = x0 + items.length * dx + 10;
    const y = (step) => 104 - (step - 30) * 6;
    svg.setAttribute('viewBox', `0 0 ${W} 150`);
    let s = '';
    for (let st = 30; st <= 38; st += 2) s += `<line class="line" x1="4" x2="${W - 4}" y1="${y(st)}" y2="${y(st)}"/>`;
    s += `<text class="clef" x="4" y="${y(30) + 22}" font-size="92">𝄞</text>`;
    items.forEach((n, i) => {
      const x = x0 + i * dx;
      for (let st = 28; st >= n.step; st -= 2) s += `<line class="line" x1="${x - 12}" x2="${x + 12}" y1="${y(st)}" y2="${y(st)}"/>`;
      for (let st = 40; st <= n.step; st += 2) s += `<line class="line" x1="${x - 12}" x2="${x + 12}" y1="${y(st)}" y2="${y(st)}"/>`;
      const acc = T.parseNote(n.name).acc;
      if (acc) s += `<text class="acc" x="${x - 24}" y="${y(n.step) + 6}">${acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc)}</text>`;
      s += `<ellipse class="head ${n.kind}" data-pc="${n.pc}" cx="${x}" cy="${y(n.step)}" rx="7.5" ry="5.5" transform="rotate(-20 ${x} ${y(n.step)})"/>`;
      if (!n.octave) s += `<text class="deg" x="${x}" y="144">${n.label.replace(/b/g, '♭').replace(/#/g, '♯')}</text>`;
    });
    svg.innerHTML = s;
  }

  // Fingering diagrams for the scale notes (fingerings follow WRITTEN pitch).
  function renderFingerings(v, concertOf) {
    const card = $('fingerings-card');
    card.hidden = settings.instrument === 'concert';
    if (card.hidden) return;
    const i = inst();
    const toWrittenName = (n) => (written() ? n.name : T.simplifyNote(T.transposeNote(n.name, i.letterSteps, i.semis)));
    const items = [...v.notes, { ...v.notes[0], octave: true }];
    // Keep the root in the lower written octave (Bb3..B4) so every note has a standard fingering.
    let shift = 0;
    const rootW = concertOf(v.notes[0]) + i.octaveSemis;
    while (rootW + shift > 71) shift -= 12;
    while (rootW + shift < 58) shift += 12;
    const box = $('fingerings');
    box.innerHTML = '';
    for (const n of items) {
      const wMidi = concertOf(n) + i.octaveSemis + shift + (n.octave ? 12 : 0);
      const b = document.createElement('button');
      b.className = `fing ${n.kind}`;
      b.dataset.pc = n.pc;
      b.dataset.wmidi = wMidi;
      b.title = 'Click to hear it';
      b.innerHTML = window.Fingering.svg(wMidi) + '<b></b><small></small>';
      b.querySelector('b').textContent = T.pretty(toWrittenName(n)) + (Math.floor(wMidi / 12) - 1);
      b.querySelector('small').textContent = n.octave ? 'octave' : n.label;
      b.addEventListener('click', () => band.playNotes([wMidi - i.octaveSemis]));
      box.appendChild(b);
    }
    $('fingerings-sub').textContent = written()
      ? 'Written pitch — the same fingerings on every saxophone.'
      : 'Shown for the written note on your sax (fingerings follow written pitch).';
  }

  function markHeard() {
    const pc = state.heardPc;
    document.querySelectorAll('.chip, .staff .head, .fing').forEach((el) => {
      el.classList.toggle('heard', pc !== null && Number(el.dataset.pc) === pc);
    });
  }

  function setBeatDots(i, counting) {
    const dots = $('beats');
    dots.classList.toggle('count', !!counting);
    dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i));
  }

  function hidePhrase() {
    $('phrase').hidden = true;
    $('lick').hidden = true;
  }

  function renderLog() {
    const today = log.days[todayKey()] || 0;
    let streak = 0;
    const d = new Date();
    if (!(log.days[todayKey()] >= 60)) d.setDate(d.getDate() - 1); // today not done yet: streak can continue from yesterday
    for (;;) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if ((log.days[k] || 0) >= 60) { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    $('log').innerHTML = `<span>Today <b>${Math.floor(today / 60)} min</b></span>` +
      `<span>Streak <b>${streak} day${streak === 1 ? '' : 's'}</b></span>` +
      `<span>Lessons <b>${log.done.length}/${LESSONS.length}</b></span>`;
  }

  // ---------- transport events ----------
  function handleEvent(ev) {
    if (ev.type === 'count') {
      state.counting = true;
      $('bar-count').textContent = `Count-in ${ev.n}`;
      setBeatDots(ev.n - 1, true);
      return;
    }
    if (ev.type === 'beat') {
      if (!state.timeline.chords[ev.chordIdx]) return;
      state.counting = false;
      if (ev.chordIdx !== state.chordIdx) {
        state.chordIdx = ev.chordIdx;
        renderNow();
        renderScale();
      }
      if (ev.bar !== state.bar) {
        state.bar = ev.bar;
        highlightBar(ev.bar);
      }
      $('bar-count').textContent = `Bar ${ev.bar + 1} / ${state.timeline.bars.length}`;
      setBeatDots(ev.beatInBar, false);
      return;
    }
    if (ev.type === 'demo' && state.demo) {
      showDemoNote(ev);
      return;
    }
    if (ev.type === 'demoKind' && state.demo) {
      $('demo-kind').textContent = window.Demo.LABELS[ev.kind];
      return;
    }
    if (ev.type === 'phrase' && state.callResponse) {
      const p = $('phrase');
      p.hidden = false;
      p.className = `phrase ${ev.mode}`;
      p.textContent = ev.mode === 'listen' ? 'LISTEN' : 'YOUR TURN';
      if (ev.mode === 'listen') {
        const off = dispMidiOffset();
        $('lick').hidden = false;
        $('lick-notes').hidden = true;
        $('show-lick').hidden = false;
        $('lick-notes').textContent = ev.lick.map((n) => T.pretty(spell(n.midi + off))).join(' · ');
      }
    }
  }

  // ---------- lesson demo ----------
  function startDemo(lesson) {
    state.demo = true;
    band.setDemo({ kinds: lesson.demo, keyScale: keyScaleId() || 'blues' });
    band.callResponse = state.callResponse;
    $('demo-now').hidden = false;
    $('demo-note').textContent = '–';
    $('demo-note').className = 'demo-note rest';
    $('demo-fing').innerHTML = '';
    $('demo-kind').textContent = '';
    renderLessonCard();
    if (!band.playing) togglePlay();
  }

  function stopDemo() {
    if (band.playing) togglePlay(); // stopping playback also ends the demo
    else resetDemo();
  }

  function resetDemo() {
    if (!state.demo) return;
    state.demo = false;
    band.setDemo(null);
    state.demoNote = null;
    $('demo-now').hidden = true;
    markDemo(null);
    renderLessonCard();
  }

  // Light up the demo note. Fingering boxes match the exact written octave when shown.
  function markDemo(pc, wMidi = null) {
    const exact = wMidi !== null && document.querySelector(`.fing[data-wmidi="${wMidi}"]`);
    document.querySelectorAll('.chip, .staff .head, .fing').forEach((el) => {
      const on = el.classList.contains('fing') && exact
        ? Number(el.dataset.wmidi) === wMidi
        : pc !== null && Number(el.dataset.pc) === pc;
      el.classList.toggle('demo', on);
    });
  }

  function showDemoNote(ev) {
    state.demoNote = ev;
    const dispMidi = ev.midi + dispMidiOffset();
    const dispPc = mod(dispMidi, 12);
    const el = $('demo-note');
    el.innerHTML = `${T.pretty(spell(dispPc))}<sup>${Math.floor(dispMidi / 12) - 1}</sup>`;
    el.className = 'demo-note';
    $('demo-fing').innerHTML = settings.instrument === 'concert' ? '' : window.Fingering.svg(ev.midi + inst().octaveSemis);
    markDemo(dispPc, ev.midi + inst().octaveSemis);
  }

  function togglePlay() {
    if (band.playing) {
      band.stop();
      $('play').classList.remove('on');
      $('play').querySelector('.play-icon').textContent = '▶';
      $('play').querySelector('.play-label').textContent = 'Play';
      setBeatDots(-1);
      state.bar = -1;
      highlightBar(-1);
      $('bar-count').textContent = '';
      hidePhrase();
      resetDemo();
    } else {
      band.countIn = settings.countIn;
      band.swing = Number(settings.swing);
      band.start();
      $('play').classList.add('on');
      $('play').querySelector('.play-icon').textContent = '■';
      $('play').querySelector('.play-label').textContent = 'Stop';
    }
  }

  // ---------- mic ----------
  let lastMidi = null;
  let stableCount = 0;
  let silentSince = 0;
  let lastMicRead = 0;
  let lastStatsRender = 0;

  function applyInstrumentToAudio() {
    const i = inst();
    // Call-and-response phrases sound in a comfortable written range: D4..A5.
    band.leadRange = [62 - i.octaveSemis, 81 - i.octaveSemis];
    band.demoRange = [62 - i.octaveSemis, 84 - i.octaveSemis]; // demos: written D4..C6
    mic.minFreq = T.midiToFreq(i.lowestConcert) * 0.85;
  }

  async function toggleMic() {
    if (mic.active) {
      mic.stop();
      $('mic-btn').textContent = '🎤 Enable mic';
      $('detected').textContent = '–';
      $('detected-info').textContent = 'Mic is off.';
      state.heardFingMidi = null;
      $('detected-fing').innerHTML = '';
      state.heardPc = null;
      markHeard();
      return;
    }
    try {
      const ctx = band.ensureContext();
      await mic.start(ctx);
      applyInstrumentToAudio();
      $('mic-btn').textContent = '🎤 Mic on';
      $('detected-info').textContent = 'Play a note…';
    } catch (e) {
      $('detected-info').textContent = `Mic unavailable: ${e.message || e.name}. Allow microphone access in your browser.`;
    }
  }

  function updateMic(now) {
    if (now - lastMicRead < 45) return;
    lastMicRead = now;
    const r = mic.read();
    const needle = $('cents-needle');
    if (!r || !r.freq || r.clarity < 0.75) {
      if (!silentSince) silentSince = now;
      if (now - silentSince > 250) {
        needle.style.opacity = 0;
        $('detected').className = 'detected';
        if (state.heardPc !== null) { state.heardPc = null; markHeard(); }
        if (state.heardFingMidi != null) { state.heardFingMidi = null; $('detected-fing').innerHTML = ''; }
      }
      lastMidi = null;
      stableCount = 0;
      return;
    }
    silentSince = 0;
    const exact = T.freqToMidi(r.freq);
    const midi = Math.round(exact);
    const cents = Math.round((exact - midi) * 100);
    stableCount = midi === lastMidi ? stableCount + 1 : 1;
    lastMidi = midi;
    if (stableCount < 2) return;

    const concertPc = mod(midi, 12);
    const dispMidi = midi + dispMidiOffset();
    const dispPc = mod(dispMidi, 12);
    const name = spell(dispPc);
    const sets = focusSets(state.chordIdx);
    const kind = sets.target.has(concertPc) ? 'target' : sets.tone.has(concertPc) ? 'tone'
      : sets.scale.has(concertPc) ? 'scale' : 'out';

    const det = $('detected');
    det.innerHTML = `${T.pretty(name)}<sup style="font-size:.4em">${Math.floor(dispMidi / 12) - 1}</sup>`;
    det.className = `detected ${kind}`;
    const wMidi = midi + inst().octaveSemis;
    if (settings.instrument !== 'concert' && wMidi !== state.heardFingMidi) {
      state.heardFingMidi = wMidi;
      $('detected-fing').innerHTML = window.Fingering.svg(wMidi);
    }
    const d = displayChord(chordAt(state.chordIdx));
    const tone = d.tones.find((t) => t.pc === dispPc);
    const what = { target: 'Target note', tone: 'Chord tone', scale: 'Scale note', out: 'Outside note' }[kind];
    $('detected-info').textContent = `${what}${tone ? ` — the ${tone.label} of ${d.symbol}` : ''}` +
      (written() ? ` · concert ${T.pretty(T.spellPc(concertPc))}` : '') + ` · ${cents > 0 ? '+' : ''}${cents}¢`;
    needle.style.opacity = 1;
    needle.style.left = `calc(${50 + Math.max(-50, Math.min(50, cents))}% - 3px)`;
    needle.style.background = Math.abs(cents) < 10 ? 'var(--good)' : Math.abs(cents) < 25 ? 'var(--warn)' : 'var(--bad)';

    if (state.heardPc !== dispPc) { state.heardPc = dispPc; markHeard(); }

    if (band.playing && !state.demo && !state.counting && state.bar >= 0) {
      stats.total++;
      if (sets.target.has(concertPc)) stats.target++;
      if (sets.tone.has(concertPc)) stats.tone++;
      if (kind === 'scale' || kind === 'tone' || kind === 'target') stats.scale++;
      if (kind === 'out') stats.out++;
      if (now - lastStatsRender > 250) { lastStatsRender = now; renderStats(); }
    }
  }

  function renderStats() {
    for (const [k, id] of [['target', 'target'], ['tone', 'tone'], ['scale', 'scale'], ['out', 'out']]) {
      const pct = stats.total ? Math.round((stats[k] / stats.total) * 100) : 0;
      $(`st-${id}`).style.width = `${pct}%`;
      $(`sv-${id}`).textContent = stats.total ? `${pct}%` : '–';
    }
  }

  function resetStats() {
    stats = { target: 0, tone: 0, scale: 0, out: 0, total: 0 };
    renderStats();
  }

  // ---------- main loop ----------
  let lastFrame = performance.now();
  let unsavedSeconds = 0;
  function frame(now) {
    requestAnimationFrame(frame); // first, so one bad frame can't stop the loop
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (band.playing) {
      for (const ev of band.popEvents(band.ctx.currentTime)) handleEvent(ev);
      if (state.demoNote && band.ctx.currentTime > state.demoNote.end) {
        state.demoNote = null;
        $('demo-note').classList.add('rest');
        markDemo(null);
      }
      if (dt < 1) {
        const k = todayKey();
        log.days[k] = (log.days[k] || 0) + dt;
        unsavedSeconds += dt;
        if (unsavedSeconds > 5) { unsavedSeconds = 0; saveLog(); renderLog(); }
      }
    }
    if (mic.active) updateMic(now);
  }

  // ---------- wire up ----------
  function init() {
    fillSelect($('instrument'), Object.entries(T.INSTRUMENTS).map(([id, i]) => [id, i.name]));
    fillSelect($('progression'), Object.entries(T.PROGRESSIONS).map(([id, p]) => [id, p.name]));
    $('instrument').value = settings.instrument;
    $('notation').value = settings.notation;
    $('swing').value = settings.swing;
    $('volume').value = settings.volume;
    $('count-in').checked = settings.countIn;
    band.swing = Number(settings.swing);
    band.volume = Number(settings.volume);
    for (const [part, muted] of Object.entries(settings.mutes)) {
      band.mutes[part] = muted;
      document.querySelector(`.mute[data-part="${part}"]`).setAttribute('aria-pressed', String(!muted));
    }
    fillKeys();
    applyInstrumentToAudio();

    $('instrument').addEventListener('change', (e) => {
      settings.instrument = e.target.value;
      saveSettings();
      fillKeys();
      applyInstrumentToAudio();
      rebuild();
    });
    $('notation').addEventListener('change', (e) => {
      settings.notation = e.target.value;
      saveSettings();
      rebuild();
    });
    $('progression').addEventListener('change', (e) => {
      state.progression = e.target.value;
      state.key = T.PROGRESSIONS[state.progression].defaultKey;
      $('key').value = state.key;
      rebuild();
    });
    $('key').addEventListener('change', (e) => { state.key = e.target.value; rebuild(); });
    $('tempo').addEventListener('input', (e) => {
      state.tempo = Number(e.target.value);
      $('tempo-out').textContent = state.tempo;
      band.tempo = state.tempo;
    });
    $('swing').addEventListener('change', (e) => {
      settings.swing = e.target.value;
      band.swing = Number(settings.swing);
      saveSettings();
    });
    $('focus').addEventListener('change', (e) => {
      state.focus = e.target.value;
      if (band.demo) band.setDemo({ ...band.demo, keyScale: keyScaleId() || 'blues' });
      renderScale();
      resetStats();
    });
    $('count-in').addEventListener('change', (e) => { settings.countIn = e.target.checked; saveSettings(); });
    $('call-response').addEventListener('change', (e) => {
      state.callResponse = e.target.checked;
      band.callResponse = state.callResponse;
      if (!state.callResponse) hidePhrase();
    });
    document.querySelectorAll('.mute').forEach((btn) => btn.addEventListener('click', () => {
      const part = btn.dataset.part;
      const muted = !settings.mutes[part];
      settings.mutes[part] = muted;
      btn.setAttribute('aria-pressed', String(!muted));
      band.setMute(part, muted);
      saveSettings();
    }));
    $('volume').addEventListener('input', (e) => {
      settings.volume = Number(e.target.value);
      band.setVolume(settings.volume);
      saveSettings();
    });
    $('play').addEventListener('click', togglePlay);
    $('mic-btn').addEventListener('click', toggleMic);
    $('reset-stats').addEventListener('click', resetStats);
    $('show-lick').addEventListener('click', () => { $('lick-notes').hidden = false; $('show-lick').hidden = true; });
    $('free-practice').addEventListener('click', () => {
      settings.lessonId = null;
      saveSettings();
      renderLessonList();
      renderLessonCard();
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
        e.preventDefault();
        togglePlay();
      }
    });

    if (settings.lessonId && LESSONS.some((l) => l.id === settings.lessonId)) {
      selectLesson(settings.lessonId, false);
    } else {
      settings.lessonId = null;
      syncControls();
      rebuild();
      renderLessonList();
      renderLessonCard();
    }
    renderLog();
    requestAnimationFrame(frame);
  }

  init();
})();
