// Backing band: drums, walking bass and piano comping synthesised with Web Audio,
// scheduled with a lookahead clock so timing stays tight.
(function () {
  'use strict';
  const T = window.Theory;

  const LEVELS = { drums: 0.8, bass: 1.0, piano: 0.85, lead: 0.9, ref: 0.9, demo: 1.0 };
  // Comping rhythms: eighth-note positions within a bar (0 = beat 1, 3 = "2 and", 7 = "4 and").
  const COMP_PATTERNS = [[0, 3], [1, 4], [3, 6], [0, 5], [2, 7], [1, 6], [3], [0, 4, 7], [3, 7], [2, 5]];

  class Band {
    constructor() {
      this.ctx = null;
      this.timeline = null;
      this.playing = false;
      this.tempo = 120;
      this.swing = 0.62; // position of the off-beat within the beat (0.5 = straight)
      this.countIn = true;
      this.callResponse = false;
      this.leadRange = [53, 72];
      this.demoRange = [53, 75];
      this.demo = null; // { kinds: [...], keyScale } while a lesson demo is playing
      this.demoCache = null;
      this.mutes = { drums: false, bass: false, piano: false };
      this.volume = 0.8;
      this.events = [];
      this.lookahead = 0.12;
    }

    ensureContext() {
      if (!this.ctx) {
        const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }));
        this.comp = ctx.createDynamicsCompressor();
        this.comp.threshold.value = -14;
        this.comp.knee.value = 10;
        this.comp.ratio.value = 4;
        this.comp.attack.value = 0.005;
        this.comp.release.value = 0.15;
        this.master = ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.comp).connect(ctx.destination);
        this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.makeBuses();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    makeBuses() {
      this.buses = {};
      for (const k of Object.keys(LEVELS)) {
        const g = this.ctx.createGain();
        g.gain.value = this.mutes[k] ? 0 : LEVELS[k];
        g.connect(this.master);
        this.buses[k] = g;
      }
    }

    setMute(part, muted) {
      this.mutes[part] = muted;
      if (this.buses) this.buses[part].gain.setTargetAtTime(muted ? 0 : LEVELS[part], this.ctx.currentTime, 0.02);
    }

    setVolume(v) {
      this.volume = v;
      if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }

    setTimeline(tl) {
      this.timeline = tl;
      this.demoCache = null;
    }

    setDemo(demo) {
      this.demo = demo;
      this.demoCache = null;
    }

    start() {
      this.ensureContext();
      if (this.playing) return;
      this.playing = true;
      this.pos = this.countIn ? -4 : 0;
      this.nextTime = this.ctx.currentTime + 0.08;
      this.prevBass = null;
      this.prevVoicing = null;
      this.anticipated = false;
      this.events = [];
      this.demoCache = null;
      this.lick = null;
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
    }

    stop() {
      if (!this.playing) return;
      clearInterval(this.timer);
      this.playing = false;
      this.events = [];
      // Fade out anything already scheduled, then start fresh buses.
      const old = this.buses;
      const now = this.ctx.currentTime;
      for (const g of Object.values(old)) {
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(0, now, 0.02);
      }
      setTimeout(() => Object.values(old).forEach((g) => g.disconnect()), 400);
      this.makeBuses();
    }

    tick() {
      const now = this.ctx.currentTime;
      // If the tab was throttled we fell behind: skip ahead instead of bursting notes.
      if (this.nextTime < now - 0.05) this.nextTime = now + 0.05;
      while (this.nextTime < now + this.lookahead) {
        const bd = 60 / this.tempo;
        this.scheduleBeat(this.pos, this.nextTime, bd);
        this.nextTime += bd;
        this.pos++;
      }
    }

    // Events are not pushed in time order (demo notes and echoes are scheduled ahead).
    popEvents(now) {
      const due = [];
      const rest = [];
      for (const e of this.events) (e.time <= now ? due : rest).push(e);
      this.events = rest;
      // At equal times, phrase changes go first so their notes land in the new phrase.
      const rank = (e) => (e.type === 'phrase' ? 0 : 1);
      return due.sort((a, b) => a.time - b.time || rank(a) - rank(b));
    }

    beatAt(pos) {
      const tl = this.timeline;
      return tl.beats[((pos % tl.totalBeats) + tl.totalBeats) % tl.totalBeats];
    }

    chordAt(pos) {
      return this.timeline.chords[this.beatAt(pos).chordIdx];
    }

    scheduleBeat(pos, t, bd) {
      if (pos < 0) {
        this.click(t, pos === -4);
        this.events.push({ time: t, type: 'count', n: pos + 5 });
        return;
      }
      const tl = this.timeline;
      const i = pos % tl.totalBeats;
      const b = tl.beats[i];
      const chord = tl.chords[b.chordIdx];
      const globalBar = Math.floor(pos / 4);
      const off = t + bd * this.swing;
      this.events.push({ time: t, type: 'beat', pos, beatIdx: i, globalBar, ...b });

      // Drums: ride "ding, ding-a ding", hi-hat on 2 & 4, feathered kick.
      this.ride(t, b.beatInBar % 2 === 0 ? 0.6 : 0.5);
      if (b.beatInBar % 2 === 1) {
        this.ride(off, 0.35);
        this.hat(t);
      }
      this.kick(t, 0.22);

      // Walking bass.
      const next = this.chordAt(pos + b.beatsLeftInChord);
      const nextChord = tl.chords.length === 1 ? null : next;
      const m = T.walkBass({ prev: this.prevBass, chord, beatOfChord: b.beatOfChord,
        beatsLeftInChord: b.beatsLeftInChord, nextChord });
      this.prevBass = m;
      this.bassNote(m, t, bd * 0.92);

      if (b.beatInBar === 0) this.compBar(pos, t, bd);
      if (this.demo) this.scheduleDemo(pos, i, t, bd);

      // Call & response: a trumpet plays a 2-bar call, then 2 bars for the answer.
      // A lesson demo that isn't an echo demo takes over, so the two never overlap.
      const echo = !!this.demo && this.demo.kinds.includes('echo');
      if (this.callResponse && (!this.demo || echo) && b.beatInBar === 0) {
        const phase = globalBar % 4;
        if (phase === 0) {
          const lick = T.generateLick((e) => this.chordAt(pos + Math.floor(e / 2)), Math.random,
            this.leadRange[0], this.leadRange[1]);
          this.lick = lick;
          this.events.push({ time: t, type: 'phrase', mode: 'listen', lick, echo });
          lick.forEach((n, idx) => {
            const nt = t + Math.floor(n.eighth / 2) * bd + (n.eighth % 2 ? bd * this.swing : 0);
            const dur = (n.len * bd) / 2 * 0.9;
            this.leadNote(n.midi, nt, dur, 'lead', 'trumpet');
            this.events.push({ time: nt, type: 'call', midi: n.midi, end: nt + dur, idx });
            // Demo: the sax answers with the same phrase two bars later.
            if (echo) this.demoNote(n.midi, nt + 8 * bd, dur, idx);
          });
        } else if (phase === 2 && this.lick) {
          this.events.push({ time: t, type: 'phrase', mode: 'play', lick: this.lick, echo });
        }
      }
    }

    // Offset within a beat (0..1) -> seconds, applying swing to off-beats.
    swingOffset(f, bd) {
      const s = this.swing;
      return (f <= 0.5 ? f * 2 * s : s + (f - 0.5) * 2 * (1 - s)) * bd;
    }

    scheduleDemo(pos, i, t, bd) {
      const tl = this.timeline;
      const loop = Math.floor(pos / tl.totalBeats);
      if (!this.demoCache || this.demoCache.loop !== loop) {
        const kind = this.demo.kinds[loop % this.demo.kinds.length];
        const notes = window.Demo.build(kind, tl, {
          lo: this.demoRange[0], hi: this.demoRange[1], keyScale: this.demo.keyScale, loop,
        });
        const byBeat = new Map();
        for (const n of notes) {
          const nb = T.mod(n.beat, tl.totalBeats);
          const k = Math.floor(nb);
          if (!byBeat.has(k)) byBeat.set(k, []);
          byBeat.get(k).push({ ...n, frac: nb - k });
        }
        this.demoCache = { loop, byBeat };
        this.events.push({ time: t, type: 'demoKind', kind });
      }
      for (const n of this.demoCache.byBeat.get(i) || []) {
        this.demoNote(n.midi, t + this.swingOffset(n.frac, bd), n.dur * bd * 0.92);
      }
    }

    demoNote(midi, t, dur, idx = null) {
      this.leadNote(midi, t, dur, 'demo');
      this.events.push({ time: t, type: 'demo', midi, end: t + dur, idx });
    }

    compBar(pos, t, bd) {
      let pattern = COMP_PATTERNS[Math.floor(Math.random() * COMP_PATTERNS.length)];
      if (this.anticipated) pattern = pattern.filter((e) => e !== 0);
      this.anticipated = pattern.includes(7);
      pattern.forEach((e, k) => {
        const beat = Math.floor(e / 2);
        const et = t + beat * bd + (e % 2 ? bd * this.swing : 0);
        // A hit on "4 and" anticipates the next bar's chord.
        const chord = e === 7 ? this.chordAt(pos + 4) : this.chordAt(pos + beat);
        const nextE = k + 1 < pattern.length ? pattern[k + 1] : 8;
        const long = Math.random() < 0.4;
        const dur = long ? Math.max(0.3, ((nextE - e) * bd) / 2 * 0.9) : bd * 0.35;
        const v = T.voiceChord(chord, this.prevVoicing);
        this.prevVoicing = v;
        this.pianoChord(v, et, dur);
      });
    }

    // ---------- voices ----------

    bassNote(m, t, dur) {
      const ctx = this.ctx;
      const f = T.midiToFreq(m);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = f;
      const g2 = ctx.createGain();
      g2.gain.value = 0.3;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2;
      lp.frequency.setValueAtTime(1100, t);
      lp.frequency.exponentialRampToValueAtTime(380, t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
      o.connect(lp);
      o2.connect(g2).connect(lp);
      lp.connect(g).connect(this.buses.bass);
      for (const osc of [o, o2]) { osc.start(t); osc.stop(t + dur + 0.1); }
    }

    pianoChord(midis, t, dur) {
      const ctx = this.ctx;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      const g = ctx.createGain();
      const peak = 0.13;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(peak * 0.35, t + Math.min(dur, 0.35));
      g.gain.setValueAtTime(peak * 0.35, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.18);
      lp.connect(g).connect(this.buses.piano);
      for (const m of midis) {
        const f = T.midiToFreq(m);
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = f * 2;
        const h = ctx.createGain();
        h.gain.value = 0.25;
        o.connect(lp);
        o2.connect(h).connect(lp);
        for (const osc of [o, o2]) { osc.start(t); osc.stop(t + dur + 0.25); }
      }
    }

    // Lead voices: a reedy 'sax' (demo, reference notes) and a brassy, muted
    // 'trumpet' for the call in call & response, so the two are easy to tell apart.
    leadNote(m, t, dur, bus, voice = 'sax') {
      const ctx = this.ctx;
      const f = T.midiToFreq(m);
      const trumpet = voice === 'trumpet';
      const o = ctx.createOscillator();
      o.type = trumpet ? 'square' : 'sawtooth';
      if (trumpet) {
        o.frequency.setValueAtTime(f * 0.985, t); // slight scoop into the note
        o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      } else {
        o.frequency.value = f;
      }
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.linearRampToValueAtTime(trumpet ? 0 : f * 0.004, t + Math.min(0.3, dur));
      lfo.connect(lfoGain).connect(o.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = trumpet ? 'bandpass' : 'lowpass';
      lp.Q.value = trumpet ? 0.9 : 1.5;
      lp.frequency.setValueAtTime(trumpet ? 1400 : 900, t);
      lp.frequency.linearRampToValueAtTime(trumpet ? 2200 : 2400, t + 0.05);
      lp.frequency.linearRampToValueAtTime(trumpet ? 1700 : 1600, t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(trumpet ? 0.22 : 0.2, t + (trumpet ? 0.015 : 0.03));
      g.gain.setValueAtTime(0.16, t + Math.max(0.04, dur - 0.04));
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
      o.connect(lp).connect(g).connect(this.buses[bus]);
      for (const osc of [o, lfo]) { osc.start(t); osc.stop(t + dur + 0.1); }
    }

    noiseHit(t, { type, freq, q = 0.7, gain, decay, rate = 1 }, bus = 'drums') {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = rate;
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.value = freq;
      flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      src.connect(flt).connect(g).connect(this.buses[bus]);
      src.start(t, Math.random() * 0.5);
      src.stop(t + decay + 0.02);
    }

    ride(t, vel) {
      this.noiseHit(t, { type: 'bandpass', freq: 8500, q: 0.6, gain: 0.35 * vel, decay: 0.45, rate: 0.9 + Math.random() * 0.2 });
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.025 * vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      hp.connect(g).connect(this.buses.drums);
      for (const f of [3150, 4730, 5910]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(hp);
        o.start(t);
        o.stop(t + 0.36);
      }
    }

    hat(t) {
      this.noiseHit(t, { type: 'highpass', freq: 7000, gain: 0.22, decay: 0.05 });
      this.noiseHit(t, { type: 'bandpass', freq: 1800, q: 1.5, gain: 0.08, decay: 0.03 });
    }

    kick(t, vel) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(this.buses.drums);
      o.start(t);
      o.stop(t + 0.18);
    }

    click(t, accent) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.frequency.value = accent ? 1600 : 1100;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g).connect(this.buses.ref);
      o.start(t);
      o.stop(t + 0.07);
    }

    // Press-and-hold reference note (concert MIDI): sounds until the returned
    // release function is called (a quick tap still gives a short note).
    holdNote(m) {
      this.ensureContext();
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.01;
      const f = T.midiToFreq(m);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.setValueAtTime(0, t + 0.3);
      lfoGain.gain.linearRampToValueAtTime(f * 0.004, t + 0.7); // vibrato blooms on long notes
      lfo.connect(lfoGain).connect(o.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1.5;
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.linearRampToValueAtTime(2400, t + 0.05);
      lp.frequency.linearRampToValueAtTime(1600, t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.03);
      g.gain.linearRampToValueAtTime(0.16, t + 0.3);
      const bus = this.buses.ref;
      o.connect(lp).connect(g).connect(bus);
      o.start(t);
      lfo.start(t);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const end = Math.max(ctx.currentTime, t + 0.25);
        if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(end);
        else { g.gain.cancelScheduledValues(end); g.gain.setValueAtTime(0.16, end); }
        g.gain.linearRampToValueAtTime(0.0001, end + 0.08);
        o.stop(end + 0.1);
        lfo.stop(end + 0.1);
      };
    }

    // Play reference notes (concert MIDI) on the lead voice, e.g. a clicked scale note.
    playNotes(midis, spacing = 0.32) {
      this.ensureContext();
      const t0 = this.ctx.currentTime + 0.05;
      midis.forEach((m, i) => this.leadNote(m, t0 + i * spacing, spacing * (i === midis.length - 1 ? 2 : 0.9), 'ref'));
    }
  }

  window.Band = Band;
})();
