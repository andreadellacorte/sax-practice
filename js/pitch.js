// Monophonic pitch detection from the microphone (YIN algorithm).
(function (root, factory) {
  const P = factory();
  if (typeof module === 'object' && module.exports) module.exports = P;
  else root.Pitch = P;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function rms(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  // Returns { freq, clarity } or null. clarity is 1 - YIN's normalised difference.
  function yin(buf, sampleRate, minFreq = 50, maxFreq = 1600, threshold = 0.12) {
    const tauMax = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
    const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
    const W = Math.min(2048, buf.length - tauMax);
    const d = new Float32Array(tauMax + 1);
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < W; j++) {
        const diff = buf[j] - buf[j + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    // Cumulative mean normalised difference.
    const cmnd = new Float32Array(tauMax + 1);
    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
    }
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cmnd[t] < threshold) {
        while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) return null;
    // Parabolic interpolation for sub-sample accuracy.
    const x0 = cmnd[tau - 1];
    const x1 = cmnd[tau];
    const x2 = tau + 1 <= tauMax ? cmnd[tau + 1] : x1;
    const denom = x0 - 2 * x1 + x2;
    const shift = denom !== 0 ? (0.5 * (x0 - x2)) / denom : 0;
    const better = tau + (Math.abs(shift) < 1 ? shift : 0);
    return { freq: sampleRate / better, clarity: 1 - x1 };
  }

  class MicTracker {
    constructor() {
      this.analyser = null;
      this.stream = null;
      this.buf = null;
      this.minFreq = 50;
      this.gate = 0.01;
    }

    async start(ctx) {
      // Disable browser voice processing: it mangles sustained instrument tones.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const src = ctx.createMediaStreamSource(this.stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 4096;
      // Route through a silent gain so the graph keeps pulling audio through the analyser.
      this.sink = ctx.createGain();
      this.sink.gain.value = 0;
      src.connect(this.analyser).connect(this.sink).connect(ctx.destination);
      this.sampleRate = ctx.sampleRate;
      this.buf = new Float32Array(this.analyser.fftSize);
    }

    stop() {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      if (this.sink) this.sink.disconnect();
      this.stream = null;
      this.analyser = null;
    }

    get active() {
      return !!this.analyser;
    }

    // { freq, clarity, level } or { level } when nothing clear is sounding.
    read() {
      if (!this.analyser) return null;
      this.analyser.getFloatTimeDomainData(this.buf);
      const level = rms(this.buf);
      if (level < this.gate) return { level };
      const r = yin(this.buf, this.sampleRate, this.minFreq, 1600);
      return r ? { ...r, level } : { level };
    }
  }

  return { yin, rms, MicTracker };
});
