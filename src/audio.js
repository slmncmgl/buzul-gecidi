/*
 * Buzul Geçidi — ses modülü (audio module)
 *
 * Everything is synthesized with the Web Audio API: no samples, no assets.
 * Exposes a single global: window.GameAudio
 *
 * Signal flow:
 *   sfx one-shots ─► sfxBus ─┐
 *   music voices  ─► musicBus ┼─► master (mute) ─► compressor ─► destination
 *   engine/charge/beep ─► loopBus ┘
 *
 * Every public method is a safe no-op before init(), without Web Audio,
 * or if the context failed to start. Nothing here ever throws.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- levels
  const MASTER_LEVEL = 0.8;
  const SFX_LEVEL = 0.9;
  const MUSIC_LEVEL = 0.42;   // music sits clearly below the effects
  const LOOP_LEVEL = 0.6;
  const SILENCE = 0.0001;     // end value for exponential ramps (-80 dB)

  // ------------------------------------------------------------- scheduler
  const TICK_MS = 25;         // scheduler wake-up interval
  const AHEAD = 0.12;         // how far ahead notes are put on the audio clock (s)

  const BPM = 116;
  const STEP = 60 / BPM / 4;  // one 16th note in seconds
  const STEPS_PER_BAR = 16;

  const BEEP_PERIOD = 0.6;    // low-heat warning interval (s)

  // ------------------------------------------------------------ music data
  // Original piece in D minor, 24 bars: A (8) + B (8) + C (8, breakdown on
  // the A chords). One chord per bar. Notes are MIDI numbers.
  const CHORDS = {
    Dm:   { bass: 38, arp: [62, 65, 69, 74] },
    Bb:   { bass: 34, arp: [58, 62, 65, 70] },
    C:    { bass: 36, arp: [60, 64, 67, 72] },
    Am:   { bass: 33, arp: [57, 60, 64, 69] },
    Gm:   { bass: 43, arp: [55, 58, 62, 67] },
    F:    { bass: 41, arp: [57, 60, 65, 69] },
    Asus: { bass: 33, arp: [57, 62, 64, 69] },
    A:    { bass: 33, arp: [57, 61, 64, 69] }
  };

  // Bass: 8th-note pulse, semitone offsets from the chord root.
  const BASS_A = [0, 0, 0, 12, 0, 0, 12, 0];
  const BASS_B = [0, 0, 12, 0, 0, 12, 0, 7];

  // Arpeggio: indexes into the chord's arp notes.
  const ARP_A = [0, 2, 1, 3, 0, 2, 1, 3];                           // 8ths
  const ARP_B = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 2, 1];   // 16ths
  const ARP_C = [3, 2, 1, 0, 3, 2, 1, 2];                           // 8ths, octave up

  // Lead notes per bar: [step (0..15), midi, length in steps].
  const SONG = [
    // ---- A: main theme
    { chord: 'Dm',   sec: 'A',  lead: [[0, 69, 4], [6, 74, 2], [8, 76, 2], [10, 77, 6]] },
    { chord: 'Dm',   sec: 'A',  lead: [[2, 76, 2], [4, 74, 4], [10, 69, 4]] },
    { chord: 'Bb',   sec: 'A',  lead: [[0, 70, 4], [6, 74, 2], [8, 77, 6]] },
    { chord: 'C',    sec: 'A',  lead: [[0, 76, 4], [4, 72, 4], [10, 76, 2], [12, 74, 4]] },
    { chord: 'Dm',   sec: 'A',  lead: [[0, 69, 4], [6, 74, 2], [8, 76, 2], [10, 77, 2], [12, 81, 4]] },
    { chord: 'Dm',   sec: 'A',  lead: [[2, 79, 2], [4, 77, 2], [6, 76, 2], [8, 74, 6]] },
    { chord: 'Bb',   sec: 'A',  lead: [[0, 77, 6], [8, 74, 3], [12, 70, 4]] },
    { chord: 'Am',   sec: 'A',  lead: [[0, 72, 4], [4, 76, 8]] },
    // ---- B: lifts to the subdominant, busier arpeggio and hats
    { chord: 'Gm',   sec: 'B',  lead: [[0, 79, 6], [8, 74, 2], [10, 79, 2], [12, 82, 4]] },
    { chord: 'Bb',   sec: 'B',  lead: [[0, 81, 2], [2, 77, 6], [10, 74, 4]] },
    { chord: 'F',    sec: 'B',  lead: [[0, 72, 4], [4, 77, 2], [6, 81, 6]] },
    { chord: 'C',    sec: 'B',  lead: [[0, 79, 4], [4, 76, 4], [8, 72, 2], [10, 76, 2], [12, 79, 4]] },
    { chord: 'Gm',   sec: 'B',  lead: [[0, 82, 6], [6, 81, 2], [8, 79, 4], [12, 74, 4]] },
    { chord: 'Bb',   sec: 'B',  lead: [[0, 77, 4], [6, 74, 2], [8, 77, 2], [10, 82, 6]] },
    { chord: 'Asus', sec: 'B',  lead: [[0, 81, 6], [8, 76, 6]] },
    { chord: 'A',    sec: 'B',  lead: [[0, 73, 6], [6, 76, 2], [8, 69, 6]] },
    // ---- C: breakdown (long bass, sparse lead), builds back in bars 5-8
    { chord: 'Dm',   sec: 'C1', lead: [[4, 69, 4], [12, 74, 4]] },
    { chord: 'Dm',   sec: 'C1', lead: [[8, 77, 8]] },
    { chord: 'Bb',   sec: 'C1', lead: [[4, 74, 4], [12, 77, 4]] },
    { chord: 'C',    sec: 'C1', lead: [[8, 76, 8]] },
    { chord: 'Dm',   sec: 'C2', lead: [[4, 69, 2], [6, 74, 2], [8, 81, 8]] },
    { chord: 'Dm',   sec: 'C2', lead: [[4, 79, 4], [12, 77, 4]] },
    { chord: 'Bb',   sec: 'C2', lead: [[0, 74, 8], [12, 70, 4]] },
    { chord: 'Am',   sec: 'C2', lead: [[0, 72, 4], [4, 76, 4], [12, 69, 2], [14, 72, 2]] }
  ];

  // ----------------------------------------------------------------- state
  const AC = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let failed = false;         // Web Audio missing or context creation failed
  let paused = false;         // explicit pause() by the game
  let muted = false;
  let startupQueued = 0;      // one-shots queued before the context first runs

  let master, sfxBus, musicBus, loopBus;
  let noiseBuf = null;

  // music channel inputs
  let bassIn, leadIn, arpIn, hatIn;

  // persistent loops
  let engine = null;          // { out, lp, o1, o2, lfo, wind, windGain }
  let engineOn = false;
  let engineV = -1;
  let charge = null;          // { out }
  let chargeOn = false;

  // scheduler
  let timer = null;
  let musicOn = false;
  let barIdx = 0;
  let stepIdx = 0;
  let nextStepTime = 0;
  let lowHeatOn = false;
  let nextBeepTime = 0;
  let lastBeepTime = -10;

  const lastPlayed = {};      // per-effect retrigger guard

  // --------------------------------------------------------------- helpers
  function noop() {}

  function hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function clamp01(v) {
    v = +v;
    if (!(v > 0)) return 0;   // also catches NaN
    return v > 1 ? 1 : v;
  }

  function quiet(promise) {
    if (promise && typeof promise.catch === 'function') promise.catch(noop);
  }

  // One-shot oscillator voice: linear attack, optional hold, exponential decay.
  // o: { type, f, f2, glide, detune, dur, vol, attack, hold }
  function tone(dest, t, o) {
    const dur = o.dur;
    const attack = Math.min(o.attack || 0.004, dur * 0.5);
    const hold = Math.max(0, Math.min(o.hold || 0, dur - attack - 0.012));
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || dur));
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);

    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol, t + attack);
    if (hold > 0) g.gain.setValueAtTime(o.vol, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(SILENCE, t + dur);

    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    osc.onended = function () {
      try { osc.disconnect(); g.disconnect(); } catch (err) { /* already gone */ }
    };
  }

  // One-shot noise burst from the shared buffer, optional swept filter.
  // o: { dur, vol, attack, ftype, f, f2, q }
  function noise(dest, t, o) {
    const dur = o.dur;
    const attack = Math.min(o.attack || 0.003, dur * 0.5);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    let filter = null;

    src.buffer = noiseBuf;
    src.loop = true;

    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol, t + attack);
    g.gain.exponentialRampToValueAtTime(SILENCE, t + dur);

    if (o.f) {
      filter = ctx.createBiquadFilter();
      filter.type = o.ftype || 'lowpass';
      filter.Q.value = o.q || 0.7;
      filter.frequency.setValueAtTime(o.f, t);
      if (o.f2) filter.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
      src.connect(filter);
      filter.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(dest);

    // random start offset so repeated bursts do not sound identical
    src.start(t, Math.random() * (noiseBuf.duration - 0.05));
    src.stop(t + dur + 0.03);
    src.onended = function () {
      try {
        src.disconnect();
        if (filter) filter.disconnect();
        g.disconnect();
      } catch (err) { /* already gone */ }
    };
  }

  // Free-running oscillator for loops and LFOs.
  function runningOsc(type, freq, startAt) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.start(startAt || 0);
    return osc;
  }

  function gainNode(value) {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  // ----------------------------------------------------------------- build
  function build() {
    // master chain
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);

    master = gainNode(muted ? 0 : MASTER_LEVEL);
    master.connect(comp);

    sfxBus = gainNode(SFX_LEVEL);
    musicBus = gainNode(0);            // faded in by startMusic()
    loopBus = gainNode(LOOP_LEVEL);
    sfxBus.connect(master);
    musicBus.connect(master);
    loopBus.connect(master);

    // shared white-noise buffer (2 s), created once
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    buildMusicChannels();
    buildEngine();
    buildCharge();
  }

  function buildMusicChannels() {
    // echo shared by lead and arpeggio: 3/16 delay with light feedback
    const send = gainNode(0.28);
    const delay = ctx.createDelay(1);
    const feedback = gainNode(0.32);
    const wet = gainNode(0.6);
    delay.delayTime.value = STEP * 3;
    send.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(musicBus);

    bassIn = ctx.createBiquadFilter();
    bassIn.type = 'lowpass';
    bassIn.frequency.value = 480;
    bassIn.Q.value = 1.2;
    bassIn.connect(musicBus);

    leadIn = ctx.createBiquadFilter();
    leadIn.type = 'lowpass';
    leadIn.frequency.value = 2600;
    leadIn.Q.value = 0.7;
    leadIn.connect(musicBus);
    leadIn.connect(send);

    arpIn = gainNode(1);
    arpIn.connect(musicBus);
    arpIn.connect(send);

    hatIn = ctx.createBiquadFilter();
    hatIn.type = 'highpass';
    hatIn.frequency.value = 7000;
    hatIn.Q.value = 0.7;
    hatIn.connect(musicBus);
  }

  // Hover engine: saw + fifth + filtered wind, slow throb. Always running,
  // silent until setEngine() opens the output gain.
  function buildEngine() {
    const out = gainNode(0);
    out.connect(loopBus);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.9;
    lp.connect(out);

    const trem = gainNode(1);
    trem.connect(lp);

    const o1 = runningOsc('sawtooth', 52);
    const g1 = gainNode(0.5);
    o1.connect(g1);
    g1.connect(trem);

    const o2 = runningOsc('triangle', 52 * 1.498);
    const g2 = gainNode(0.35);
    o2.connect(g2);
    g2.connect(trem);

    const lfo = runningOsc('sine', 6);
    const lfoDepth = gainNode(0.12);
    lfo.connect(lfoDepth);
    lfoDepth.connect(trem.gain);

    // wind layer bypasses the lowpass so it can add air at speed
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    const wind = ctx.createBiquadFilter();
    wind.type = 'bandpass';
    wind.frequency.value = 500;
    wind.Q.value = 1.4;
    const windGain = gainNode(0.03);
    windSrc.connect(wind);
    wind.connect(windGain);
    windGain.connect(out);
    windSrc.start(0);

    engine = { out: out, lp: lp, o1: o1, o2: o2, lfo: lfo, wind: wind, windGain: windGain };
  }

  // Thermal-vent charging loop. A triangle LFO opens the voice twice per
  // cycle while a sawtooth LFO (same rate, same start) sweeps the pitch up;
  // the sawtooth reset falls exactly on a silent point, so it never clicks.
  function buildCharge() {
    const rate = 1 / 0.9;
    const t0 = ctx.currentTime + 0.02;

    const out = gainNode(0);
    out.connect(loopBus);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 0.5;
    lp.connect(out);

    const pulse = gainNode(0);
    pulse.connect(lp);
    const pulseLfo = runningOsc('triangle', rate, t0);
    pulseLfo.connect(pulse.gain);

    const sweepLfo = runningOsc('sawtooth', rate, t0);
    const sweep = gainNode(350);          // cents
    sweepLfo.connect(sweep);

    const a = runningOsc('triangle', 392.0, t0);
    const ga = gainNode(0.22);
    const b = runningOsc('sine', 587.33, t0);
    const gb = gainNode(0.12);
    sweep.connect(a.detune);
    sweep.connect(b.detune);
    a.connect(ga);
    ga.connect(pulse);
    b.connect(gb);
    gb.connect(pulse);

    // two high partials with slow, unrelated tremolos: the shimmer
    shimmer(lp, 1174.66, 7.3, 0.045, t0);
    shimmer(lp, 1567.98, 5.1, 0.03, t0);

    charge = { out: out };
  }

  function shimmer(dest, freq, lfoRate, level, t0) {
    const osc = runningOsc('sine', freq, t0);
    const vca = gainNode(0.5);
    const lfo = runningOsc('sine', lfoRate, t0);
    const depth = gainNode(0.5);
    const lvl = gainNode(level);
    lfo.connect(depth);
    depth.connect(vca.gain);
    osc.connect(vca);
    vca.connect(lvl);
    lvl.connect(dest);
  }

  // ------------------------------------------------------------- lifecycle
  function init() {
    if (failed) return;
    if (!ctx) {
      if (!AC) { failed = true; return; }
      let created = null;
      try {
        created = new AC();
        ctx = created;
        build();
      } catch (err) {
        /* @swallow */
        failed = true;
        ctx = null;
        try { if (created && created.close) quiet(created.close()); } catch (e2) { /* ignore */ }
        return;
      }
    }
    // Autoplay policy: wake a suspended context from the user gesture.
    // An explicit pause() by the game is respected until resume().
    if (!paused && ctx.state !== 'running' && ctx.state !== 'closed' && ctx.resume) {
      quiet(ctx.resume());
    }
  }

  function pause() {
    if (!ctx) return;
    paused = true;
    if (ctx.state !== 'closed' && ctx.suspend) quiet(ctx.suspend());
  }

  function resume() {
    if (!ctx) return;
    paused = false;
    if (ctx.state !== 'closed' && ctx.resume) quiet(ctx.resume());
  }

  function setMuted(flag) {
    muted = !!flag;           // remembered even before init()
    if (!ctx) return;
    master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime, 0.02);
  }

  function isMuted() {
    return muted;
  }

  // ------------------------------------------------------------- one-shots
  const SFX = {
    // short bright flare pulse; slight random detune keeps rapid fire fresh
    shoot: function (t) {
      const d = (Math.random() * 2 - 1) * 45;
      tone(sfxBus, t, { type: 'triangle', f: 2300, f2: 760, dur: 0.085, vol: 0.085, detune: d });
      tone(sfxBus, t, { type: 'square', f: 1500, f2: 520, dur: 0.06, vol: 0.035, detune: d });
      noise(sfxBus, t, { dur: 0.03, vol: 0.035, ftype: 'highpass', f: 5200 });
    },

    // small metallic tick: two inharmonic partials + a click
    hit: function (t) {
      tone(sfxBus, t, { type: 'square', f: 2093, dur: 0.055, vol: 0.05, attack: 0.002 });
      tone(sfxBus, t, { type: 'square', f: 3190, dur: 0.04, vol: 0.032, attack: 0.002 });
      noise(sfxBus, t, { dur: 0.025, vol: 0.05, ftype: 'bandpass', f: 4200, q: 3 });
    },

    // noise burst + low thump
    explode: function (t) {
      const k = 0.9 + Math.random() * 0.25;
      noise(sfxBus, t, { dur: 0.38, vol: 0.28, ftype: 'lowpass', f: 3800 * k, f2: 260, q: 0.8 });
      tone(sfxBus, t, { type: 'sine', f: 150 * k, f2: 42, dur: 0.32, vol: 0.4 });
      tone(sfxBus, t, { type: 'square', f: 220 * k, f2: 60, dur: 0.14, vol: 0.05 });
    },

    // enemy energy orb: low "bwoop"
    orb: function (t) {
      tone(sfxBus, t, { type: 'triangle', f: 95, f2: 250, glide: 0.16, dur: 0.3, vol: 0.22, attack: 0.015, hold: 0.1 });
      tone(sfxBus, t, { type: 'sine', f: 190, f2: 500, glide: 0.16, dur: 0.24, vol: 0.06, attack: 0.015 });
    },

    // bigger crash, about one second
    playerDie: function (t) {
      noise(sfxBus, t, { dur: 1.0, vol: 0.32, ftype: 'lowpass', f: 5000, f2: 140, q: 0.8 });
      noise(sfxBus, t + 0.12, { dur: 0.45, vol: 0.16, ftype: 'bandpass', f: 1300, f2: 300, q: 1.2 });
      tone(sfxBus, t, { type: 'sine', f: 170, f2: 32, dur: 0.7, vol: 0.42 });
      tone(sfxBus, t, { type: 'triangle', f: 392, f2: 49, dur: 0.9, vol: 0.13, attack: 0.01, hold: 0.2 });
    },

    // froze solid: glassy descending shimmer, about one second
    freeze: function (t) {
      const notes = [93, 89, 86, 84, 81, 77, 74, 69];
      for (let i = 0; i < notes.length; i++) {
        const f = hz(notes[i]);
        const at = t + i * 0.085;
        tone(sfxBus, at, { type: 'sine', f: f, dur: 0.4, vol: 0.085, attack: 0.003 });
        tone(sfxBus, at, { type: 'sine', f: f * 2.76, dur: 0.16, vol: 0.022, attack: 0.002 });
      }
      tone(sfxBus, t, { type: 'triangle', f: 1300, f2: 280, dur: 0.95, vol: 0.035, attack: 0.03, hold: 0.3 });
      noise(sfxBus, t, { dur: 0.9, vol: 0.04, attack: 0.02, ftype: 'highpass', f: 7000 });
    },

    // checkpoint: warm rising chime (F major, the relative major of the music)
    gate: function (t) {
      const notes = [65, 69, 72, 77];
      for (let i = 0; i < notes.length; i++) {
        const last = i === notes.length - 1;
        const at = t + i * 0.1;
        tone(sfxBus, at, { type: 'triangle', f: hz(notes[i]), dur: last ? 0.7 : 0.42, vol: 0.14, attack: 0.008 });
        tone(sfxBus, at, { type: 'sine', f: hz(notes[i] + 12), dur: last ? 0.5 : 0.3, vol: 0.045, attack: 0.008 });
      }
    },

    // short bright fanfare (open fifths, fits over the minor-key music)
    extraLife: function (t) {
      const seq = [[74, 0, 0.09], [81, 0.07, 0.09], [86, 0.14, 0.09], [81, 0.21, 0.09], [86, 0.28, 0.34]];
      for (let i = 0; i < seq.length; i++) {
        const n = seq[i];
        tone(sfxBus, t + n[1], { type: 'square', f: hz(n[0]), dur: n[2], vol: 0.06, hold: n[2] * 0.5 });
        tone(sfxBus, t + n[1], { type: 'triangle', f: hz(n[0] - 12), dur: n[2], vol: 0.09, hold: n[2] * 0.5 });
      }
    },

    // game start jingle, about 0.75 s
    start: function (t) {
      const notes = [62, 69, 74, 77, 81];
      for (let i = 0; i < notes.length; i++) {
        const last = i === notes.length - 1;
        const dur = last ? 0.38 : 0.11;
        tone(sfxBus, t + i * 0.09, { type: 'square', f: hz(notes[i]), dur: dur, vol: 0.06, hold: dur * 0.5 });
        tone(sfxBus, t + i * 0.09, { type: 'triangle', f: hz(notes[i]), dur: dur, vol: 0.07, hold: dur * 0.5 });
      }
      tone(sfxBus, t, { type: 'triangle', f: hz(50), dur: 0.7, vol: 0.13, attack: 0.01, hold: 0.3 });
    },

    // all stages done: rising D major arpeggio into a held chord, about 1.5 s
    lapDone: function (t) {
      const run = [62, 66, 69, 74, 78, 81, 86];
      for (let i = 0; i < run.length; i++) {
        const at = t + i * 0.1;
        tone(sfxBus, at, { type: 'square', f: hz(run[i]), dur: 0.16, vol: 0.05, hold: 0.07 });
        tone(sfxBus, at, { type: 'triangle', f: hz(run[i]), dur: 0.22, vol: 0.08, hold: 0.07 });
      }
      const chord = [74, 78, 81, 86];
      const ct = t + 0.74;
      for (let i = 0; i < chord.length; i++) {
        tone(sfxBus, ct, { type: 'square', f: hz(chord[i]), dur: 0.78, vol: 0.032, attack: 0.01, hold: 0.3 });
        tone(sfxBus, ct, { type: 'triangle', f: hz(chord[i]), dur: 0.78, vol: 0.06, attack: 0.01, hold: 0.3 });
      }
      tone(sfxBus, t, { type: 'triangle', f: hz(50), dur: 0.7, vol: 0.13, attack: 0.01, hold: 0.4 });
      tone(sfxBus, ct, { type: 'triangle', f: hz(38), dur: 0.78, vol: 0.16, attack: 0.01, hold: 0.35 });
    }
  };

  function canPlayOneShot() {
    if (!ctx || paused) return false;
    if (ctx.state === 'running') { startupQueued = 0; return true; }
    if (ctx.state === 'closed') return false;
    // A context that already ran and is now suspended (by the system):
    // skip, otherwise everything queued would fire at once on resume.
    if (ctx.currentTime > 0) return false;
    // Brand-new context: it reports 'suspended' for a moment even when it
    // was created inside a user gesture. Let a few sounds queue up.
    return ++startupQueued <= 8;
  }

  function play(name) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SFX, name)) return;
    if (!canPlayOneShot()) return;
    const now = ctx.currentTime;
    // same effect twice within 30 ms adds only loudness, not information
    if (now - lastPlayed[name] < 0.03) return;
    lastPlayed[name] = now;
    SFX[name](now + 0.004);
  }

  // ----------------------------------------------------------------- loops
  function setEngine(v) {
    if (!ctx) return;
    v = clamp01(v);
    if (engineOn && Math.abs(v - engineV) < 0.004) return;   // nothing audible changed
    const t = ctx.currentTime;
    const f = 52 + 58 * v;
    engineOn = true;
    engineV = v;
    engine.o1.frequency.setTargetAtTime(f, t, 0.09);
    engine.o2.frequency.setTargetAtTime(f * 1.498, t, 0.09);
    engine.lfo.frequency.setTargetAtTime(6 + 6 * v, t, 0.15);
    engine.lp.frequency.setTargetAtTime(260 + 1150 * v, t, 0.09);
    engine.wind.frequency.setTargetAtTime(500 + 1300 * v, t, 0.12);
    engine.windGain.gain.setTargetAtTime(0.03 + 0.08 * v, t, 0.12);
    engine.out.gain.setTargetAtTime(0.14 + 0.1 * v, t, 0.1);
  }

  function stopEngine() {
    if (!ctx || !engineOn) return;
    engineOn = false;
    engineV = -1;
    engine.out.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
  }

  function setCharging(flag) {
    if (!ctx) return;
    flag = !!flag;
    if (flag === chargeOn) return;
    chargeOn = flag;
    charge.out.gain.setTargetAtTime(flag ? 0.5 : 0, ctx.currentTime, flag ? 0.08 : 0.12);
  }

  function setLowHeat(flag) {
    if (!ctx) return;
    flag = !!flag;
    if (flag === lowHeatOn) return;
    lowHeatOn = flag;
    if (flag) {
      // never closer than one period to the previous beep, even if toggled fast
      nextBeepTime = Math.max(ctx.currentTime + 0.01, lastBeepTime + BEEP_PERIOD);
      ensureTimer();
      tick();
    }
  }

  function beep(t) {
    tone(loopBus, t, { type: 'square', f: 988, dur: 0.085, vol: 0.085, hold: 0.05 });
    tone(loopBus, t + 0.11, { type: 'square', f: 740, dur: 0.085, vol: 0.085, hold: 0.05 });
  }

  // ----------------------------------------------------------------- music
  function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true;
    barIdx = 0;
    stepIdx = 0;
    nextStepTime = ctx.currentTime + 0.06;
    musicBus.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 0.03);
    ensureTimer();
    tick();
  }

  function stopMusic() {
    if (!ctx || !musicOn) return;
    musicOn = false;
    // fade the bus: also silences the echo tail and the few notes already queued
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }

  function musicNote(dest, t, type, midi, dur, vol, attack, hold) {
    tone(dest, t, { type: type, f: hz(midi), dur: dur, vol: vol, attack: attack, hold: hold });
  }

  function scheduleStep(bar, step, t) {
    const b = SONG[bar];
    const ch = CHORDS[b.chord];
    const sec = b.sec;
    const even = (step & 1) === 0;
    const i8 = step >> 1;
    const beat = step % 4;

    // bass: steady 8th pulse (long notes in the breakdown)
    if (sec === 'C1') {
      if (step === 0 || step === 8) musicNote(bassIn, t, 'square', ch.bass, STEP * 7.5, 0.15, 0.012, STEP * 4);
    } else if (even) {
      const pat = sec === 'B' ? BASS_B : BASS_A;
      musicNote(bassIn, t, 'square', ch.bass + pat[i8], STEP * 1.8, 0.16, 0.006, STEP * 0.9);
    }

    // soft arpeggio
    if (sec === 'B') {
      musicNote(arpIn, t, 'triangle', ch.arp[ARP_B[step]], 0.16, even ? 0.04 : 0.028, 0.004, 0);
    } else if (even) {
      if (sec === 'A') musicNote(arpIn, t, 'triangle', ch.arp[ARP_A[i8]], 0.2, 0.05, 0.004, 0);
      else musicNote(arpIn, t, 'triangle', ch.arp[ARP_C[i8]] + 12, 0.24, 0.042, 0.004, 0);
    }

    // light noise hi-hat, accent on the off-beat
    let hat = 0;
    if (sec === 'B') hat = beat === 2 ? 0.055 : (beat === 0 ? 0.03 : 0.016);
    else if (sec === 'C1') hat = beat === 2 ? 0.03 : 0;
    else if (even) hat = beat === 2 ? 0.05 : 0.024;
    if (hat > 0) noise(hatIn, t, { dur: beat === 2 ? 0.06 : 0.035, vol: hat, attack: 0.002 });

    // soft kick for drive
    if (beat === 0 && (sec !== 'C1' || step === 0)) {
      tone(musicBus, t, { type: 'sine', f: 118, f2: 44, dur: 0.15, vol: 0.2, attack: 0.003 });
    }

    // lead
    const lead = b.lead;
    for (let i = 0; i < lead.length; i++) {
      if (lead[i][0] === step) {
        const dur = lead[i][2] * STEP * 0.94;
        musicNote(leadIn, t, 'square', lead[i][1], dur, 0.07, 0.012, dur * 0.55);
      }
    }
  }

  // Look-ahead scheduler: wakes every TICK_MS and places everything that
  // falls inside the next AHEAD seconds on the AudioContext clock.
  function tick() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const horizon = now + AHEAD;

    if (musicOn) {
      if (nextStepTime < now) nextStepTime = now + 0.01;     // fell behind (throttled tab)
      let guard = 0;
      while (nextStepTime < horizon && guard++ < 8) {
        scheduleStep(barIdx, stepIdx, nextStepTime);
        nextStepTime += STEP;
        if (++stepIdx >= STEPS_PER_BAR) {
          stepIdx = 0;
          if (++barIdx >= SONG.length) barIdx = 0;
        }
      }
    }

    if (lowHeatOn) {
      if (nextBeepTime < now) nextBeepTime = now + 0.01;
      if (nextBeepTime < horizon) {
        beep(nextBeepTime);
        lastBeepTime = nextBeepTime;
        nextBeepTime += BEEP_PERIOD;
      }
    }

    if (!musicOn && !lowHeatOn) stopTimer();
  }

  function ensureTimer() {
    if (timer === null) timer = setInterval(safeTick, TICK_MS);
  }

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  // ------------------------------------------------------------ public API
  // Every entry point is wrapped: audio must never break the game.
  function guard(fn) {
    return function (arg) {
      try {
        return fn(arg);
      } catch (err) {
        /* @swallow */
        return undefined;
      }
    };
  }

  const safeTick = guard(tick);

  window.GameAudio = {
    init: guard(init),
    setMuted: guard(setMuted),
    isMuted: isMuted,
    play: guard(play),
    setEngine: guard(setEngine),
    stopEngine: guard(stopEngine),
    setCharging: guard(setCharging),
    setLowHeat: guard(setLowHeat),
    startMusic: guard(startMusic),
    stopMusic: guard(stopMusic),
    pause: guard(pause),
    resume: guard(resume)
  };
})();
