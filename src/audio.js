/*
 * Buzul Geçidi — ses modülü (audio module)
 *
 * Everything is synthesized with the Web Audio API: no samples, no assets.
 * Exposes a single global: window.GameAudio
 *
 * Palette: "cosmic" synth. Laser sweeps, FM metal, detuned saws, sub booms,
 * and a shared space bus (ping-pong echo + one synthetic reverb).
 *
 * Signal flow:
 *   sfx one-shots ─► sfxBus ──────────┐
 *   music voices  ─► musicBus ────────┼─► master (mute) ─► compressor ─► out
 *   engine/charge/wind/whine/alarm ─► loopBus ┤
 *   sends (sfx light, sfxFx heavy, music lead/arp/pad) ─► space bus ┘
 *
 * Every public method is a safe no-op before init(), without Web Audio,
 * or if the context failed to start. Nothing here ever throws.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- levels
  const MASTER_LEVEL = 0.8;
  const SFX_LEVEL = 0.9;
  const MUSIC_LEVEL = 0.15;   // music bed sits clearly below shoot/explode (balanced against offline renders)
  const LOOP_LEVEL = 0.6;
  const ECHO_LEVEL = 0.5;     // space bus: ping-pong echo return
  const REVERB_LEVEL = 0.55;  // space bus: reverb return
  const SILENCE = 0.0001;     // end value for exponential ramps (-80 dB)

  // ------------------------------------------------------------- scheduler
  const TICK_MS = 25;         // scheduler wake-up interval
  const AHEAD = 0.12;         // how far ahead notes are put on the audio clock (s)

  const BPM = 126;
  const STEP = 60 / BPM / 4;  // one 16th note in seconds
  const STEPS_PER_BAR = 16;
  const BAR = STEP * STEPS_PER_BAR;

  const BEEP_PERIOD = 0.6;    // low-heat alarm interval (s)

  const WHINE_F0 = 150;       // weapon charge whine: pitch at v = 0 (two octaves up at v = 1)
  const WHINE_RATIO = 1.502;  // second oscillator: an octave up, slightly sharp

  // ------------------------------------------------------------ music data
  // Original piece in E minor, 32 bars, one chord per bar:
  //   A (8) theme, B (8) lift, C (8) breakdown and build, A2 (8) reprise.
  // Notes are MIDI numbers.
  const CHORDS = {
    Em:   { bass: 40, pad: [52, 55, 59], arp: [64, 67, 71, 76] },
    C:    { bass: 36, pad: [52, 55, 60], arp: [60, 64, 67, 72] },
    D:    { bass: 38, pad: [50, 54, 57], arp: [62, 66, 69, 74] },
    G:    { bass: 43, pad: [50, 55, 59], arp: [62, 67, 71, 74] },
    Am:   { bass: 45, pad: [52, 57, 60], arp: [60, 64, 69, 72] },
    B:    { bass: 35, pad: [51, 54, 59], arp: [59, 63, 66, 71] },
    Bsus: { bass: 35, pad: [52, 54, 59], arp: [59, 64, 66, 71] }
  };

  // Bass sequence: 16th notes, semitone offsets from the chord root, -1 = rest.
  const BASS_A = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 12, 0, 12];
  const BASS_B = [0, 12, 0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 7, 12];
  const BASS_C = [0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 12, -1];

  // Arpeggio: indexes into the chord's arp notes.
  const ARP_8 = [0, 2, 1, 3, 2, 1, 3, 2];                              // 8ths
  const ARP_16 = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];     // 16ths
  const ARP_C = [3, 1, 2, 0, 3, 2, 1, 2];                              // 8ths, octave up

  const CH_A = ['Em', 'Em', 'C', 'D', 'Em', 'G', 'Am', 'B'];
  const CH_B = ['C', 'D', 'G', 'Em', 'Am', 'C', 'Bsus', 'B'];
  const CH_C = ['Em', 'Em', 'C', 'C', 'Am', 'Am', 'B', 'B'];

  // Lead notes per bar: [step (0..15), midi, length in steps].
  const LEAD_A = [
    [[0, 71, 4], [4, 76, 6], [12, 74, 2], [14, 71, 2]],
    [[0, 67, 8], [12, 69, 2], [14, 71, 2]],
    [[0, 72, 4], [4, 76, 6], [12, 74, 2], [14, 72, 2]],
    [[0, 69, 6], [8, 66, 4], [12, 69, 4]],
    [[0, 71, 4], [4, 76, 6], [12, 74, 2], [14, 76, 2]],
    [[0, 79, 8], [10, 78, 2], [12, 74, 4]],
    [[0, 76, 6], [6, 72, 2], [8, 69, 6]],
    [[0, 71, 6], [8, 75, 4], [12, 78, 4]]
  ];
  const LEAD_B = [
    [[0, 79, 8], [8, 76, 4], [12, 72, 4]],
    [[0, 78, 8], [8, 74, 4], [12, 69, 4]],
    [[0, 74, 4], [4, 79, 4], [8, 83, 8]],
    [[0, 81, 2], [2, 79, 6], [10, 76, 6]],
    [[0, 72, 4], [4, 76, 4], [8, 81, 8]],
    [[0, 79, 6], [6, 76, 2], [8, 72, 4], [12, 76, 4]],
    [[0, 78, 8], [8, 76, 8]],
    [[0, 75, 12], [12, 71, 4]]
  ];
  const LEAD_C = [
    [[4, 71, 4], [12, 76, 4]],
    [[4, 79, 8]],
    [[4, 72, 4], [12, 76, 4]],
    [[4, 79, 4], [10, 76, 6]],
    [[0, 81, 8], [12, 76, 4]],
    [[0, 72, 12]],
    [[0, 71, 4], [4, 75, 4], [8, 78, 8]],
    [[0, 83, 8], [8, 78, 4], [12, 75, 4]]
  ];
  // the reprise shares the theme's first six bars and gets its own ending
  const LEAD_A2 = LEAD_A.slice(0, 6).concat([
    [[0, 76, 4], [4, 81, 4], [8, 79, 4], [12, 76, 4]],
    [[0, 78, 6], [6, 75, 2], [8, 71, 8]]
  ]);

  function section(sec, chords, leads) {
    return chords.map(function (chord, i) {
      return { chord: chord, sec: sec, lead: leads[i], fill: false };
    });
  }

  const SONG = [].concat(
    section('A', CH_A, LEAD_A),
    section('B', CH_B, LEAD_B),
    section('C1', CH_C.slice(0, 4), LEAD_C.slice(0, 4)),
    section('C2', CH_C.slice(4), LEAD_C.slice(4)),
    section('A2', CH_A, LEAD_A2)
  );
  SONG[15].fill = true;       // snare roll into the breakdown
  SONG[23].fill = true;       // ... out of it
  SONG[31].fill = true;       // ... and around the loop point

  // ----------------------------------------------------------------- state
  const AC = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let failed = false;         // Web Audio missing or context creation failed
  let paused = false;         // explicit pause() by the game
  let muted = false;
  let startupQueued = 0;      // one-shots queued before the context first runs

  let master, sfxBus, musicBus, loopBus;
  let spaceIn;                // shared echo + reverb send bus
  let sfxFx;                  // sfx input with a generous space send
  let musicSend;              // music's fader into the space bus
  let dullIn;                 // lowpass in front of sfxBus, for soft buzzes
  let noiseBuf = null;
  let crunchBuf = null;       // clocked (sample-and-hold) noise for crunchy explosions

  // music channel inputs
  let bassIn, leadIn, arpIn, padIn, hatIn;

  // persistent loops
  let engine = null;          // { out, lp, o1, o2, sub, hiss, hissGain }
  let engineOn = false;
  let engineV = -1;
  let engineT = 0;
  let engineRate = 0;
  let charge = null;          // { out }
  let chargeOn = false;
  let wind = null;            // { out, filter }
  let windV = 0;
  let whine = null;           // weapon charge: { out, o1, o2, lp, pulse }
  let whineV = 0;

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

  // One-shot synth voice: linear attack, optional hold, exponential decay.
  // o: { type, f, f2, glide, detune, dur, vol, attack, hold,
  //      filter: { type, f, f2, q, glide },      resonant filter, optional sweep
  //      fm:     { ratio, index, index2, time }, FM (metallic / bell tones)
  //      lfo:    { rate, rate2, depth } }        pitch wobble, depth in cents
  // Everything it creates is stopped and disconnected when the voice ends.
  function voice(dest, t, o) {
    const dur = o.dur;
    const end = t + dur;
    const stopAt = end + 0.03;
    const sweepEnd = t + (o.glide || dur);
    const attack = Math.min(o.attack || 0.004, dur * 0.5);
    const hold = Math.max(0, Math.min(o.hold || 0, dur - attack - 0.012));
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const nodes = [osc, g];

    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) { if (o.lin) osc.frequency.linearRampToValueAtTime(o.f2, sweepEnd); else osc.frequency.exponentialRampToValueAtTime(o.f2, sweepEnd); }
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);

    if (o.fm) {
      const mod = ctx.createOscillator();
      const depth = ctx.createGain();
      const mf = o.f * o.fm.ratio;
      mod.frequency.setValueAtTime(mf, t);
      if (o.f2) mod.frequency.exponentialRampToValueAtTime(o.f2 * o.fm.ratio, sweepEnd);
      depth.gain.setValueAtTime(mf * o.fm.index, t);
      depth.gain.exponentialRampToValueAtTime(Math.max(mf * (o.fm.index2 || 0), 0.01), t + (o.fm.time || dur));
      mod.connect(depth);
      depth.connect(osc.frequency);
      mod.start(t);
      mod.stop(stopAt);
      nodes.push(mod, depth);
    }

    if (o.lfo) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.setValueAtTime(o.lfo.rate, t);
      if (o.lfo.rate2) lfo.frequency.exponentialRampToValueAtTime(o.lfo.rate2, end);
      depth.gain.value = o.lfo.depth;
      lfo.connect(depth);
      depth.connect(osc.detune);
      lfo.start(t);
      lfo.stop(stopAt);
      nodes.push(lfo, depth);
    }

    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol, t + attack);
    if (hold > 0) g.gain.setValueAtTime(o.vol, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(SILENCE, end);

    if (o.filter) {
      const flt = ctx.createBiquadFilter();
      flt.type = o.filter.type || 'lowpass';
      flt.Q.value = o.filter.q || 0.7;
      flt.frequency.setValueAtTime(o.filter.f, t);
      if (o.filter.f2) flt.frequency.exponentialRampToValueAtTime(o.filter.f2, t + (o.filter.glide || dur));
      osc.connect(flt);
      flt.connect(g);
      nodes.push(flt);
    } else {
      osc.connect(g);
    }
    g.connect(dest);

    osc.start(t);
    osc.stop(stopAt);
    osc.onended = function () {
      try {
        for (let i = 0; i < nodes.length; i++) nodes[i].disconnect();
      } catch (err) { /* already gone */ }
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

  // Clocked noise whose clock rate falls: the crunchy roar of an arcade explosion, with a
  // sense of pitch dropping away. A plain white-noise burst reads as a pop; this does not.
  // o: { dur, vol, rate, rate2, glide, attack, hold, lp }
  function crunch(dest, t, o) {
    const dur = o.dur;
    const attack = Math.min(o.attack || 0.008, dur * 0.4);
    const hold = Math.max(0, Math.min(o.hold || 0, dur - attack - 0.02));
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();

    src.buffer = crunchBuf;
    src.loop = true;
    src.playbackRate.setValueAtTime(o.rate, t);
    src.playbackRate.exponentialRampToValueAtTime(o.rate2, t + (o.glide || dur));      // glide: pitch reaches the bottom early, then rumbles

    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.value = o.lp || 7000;

    // body stays up (hold, then a slow linear fall); only the very end is exponential
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol, t + attack);
    if (hold > 0) g.gain.setValueAtTime(o.vol, t + attack + hold);
    g.gain.linearRampToValueAtTime(o.vol * 0.12, t + attack + hold + (dur - attack - hold) * 0.75);
    g.gain.exponentialRampToValueAtTime(SILENCE, t + dur);

    src.connect(lp);
    lp.connect(g);
    g.connect(dest);

    src.start(t, Math.random() * (crunchBuf.duration - 0.1));
    src.stop(t + dur + 0.03);
    src.onended = function () {
      try {
        src.disconnect();
        lp.disconnect();
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

  function filterNode(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
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

    // clocked noise: each random value is held for several samples (about a 4.8 kHz clock)
    crunchBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const cd = crunchBuf.getChannelData(0);
    const step = Math.max(4, Math.round(ctx.sampleRate / 4800));
    for (let i = 0, v = 0; i < len; i++) { if (i % step === 0) v = Math.random() * 2 - 1; cd[i] = v; }

    buildSpace();

    // sfx routing: every effect gets a touch of space; effects sent to
    // sfxFx (chimes, fanfares, big hits) get a generous amount
    const sfxLight = gainNode(0.1);
    sfxBus.connect(sfxLight);
    sfxLight.connect(spaceIn);
    sfxFx = gainNode(1);
    sfxFx.connect(sfxBus);
    const sfxHeavy = gainNode(0.4);
    sfxFx.connect(sfxHeavy);
    sfxHeavy.connect(spaceIn);

    dullIn = filterNode('lowpass', 620, 0.7);
    dullIn.connect(sfxBus);

    buildMusicChannels();
    buildEngine();
    buildCharge();
    buildWind();
    buildWhine();
  }

  // The "cosmic" part: one send bus with a damped ping-pong echo (dotted
  // 8th of the music tempo) and one convolver fed with a synthetic impulse
  // (decaying stereo noise). Returns go straight to the master.
  function buildSpace() {
    spaceIn = gainNode(1);
    const out = gainNode(1);
    out.connect(master);

    const dl = ctx.createDelay(1);
    const dr = ctx.createDelay(1);
    dl.delayTime.value = STEP * 3;
    dr.delayTime.value = STEP * 3;
    const cross = gainNode(0.6);
    const back = gainNode(0.55);
    const damp = filterNode('lowpass', 3200, 0.5);
    spaceIn.connect(dl);
    dl.connect(cross);
    cross.connect(dr);
    dr.connect(back);
    back.connect(damp);
    damp.connect(dl);

    const echoOut = gainNode(ECHO_LEVEL);
    echoOut.connect(out);
    if (ctx.createChannelMerger) {
      // left tap mostly left, right tap mostly right, a little of each across
      const merger = ctx.createChannelMerger(2);
      const lToR = gainNode(0.35);
      const rToL = gainNode(0.35);
      dl.connect(merger, 0, 0);
      dr.connect(merger, 0, 1);
      dl.connect(lToR);
      lToR.connect(merger, 0, 1);
      dr.connect(rToL);
      rToL.connect(merger, 0, 0);
      merger.connect(echoOut);
    } else {
      dl.connect(echoOut);
      dr.connect(echoOut);
    }

    // Reverb is a nicety: if the browser cannot do it, the echo carries on alone.
    try {
      if (ctx.createConvolver) {
        const sr = ctx.sampleRate;
        const len = Math.floor(sr * 1.7);
        const skip = Math.floor(sr * 0.008);
        const ir = ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          let lp = 0;
          for (let i = skip; i < len; i++) {
            const x = i / len;
            // one-pole lowpass that closes over time: the tail gets darker
            lp += (0.6 - 0.45 * x) * ((Math.random() * 2 - 1) - lp);
            d[i] = lp * (1 - x) * (1 - x) * Math.exp(-3 * x);
          }
        }
        const conv = ctx.createConvolver();
        conv.buffer = ir;
        const revOut = gainNode(REVERB_LEVEL);
        spaceIn.connect(conv);
        conv.connect(revOut);
        revOut.connect(out);
      }
    } catch (err) { /* no reverb */ }
  }

  function buildMusicChannels() {
    musicSend = gainNode(0);           // follows the music fader
    musicSend.connect(spaceIn);

    bassIn = gainNode(1);
    bassIn.connect(musicBus);

    leadIn = filterNode('lowpass', 3000, 1);
    leadIn.connect(musicBus);
    const leadSend = gainNode(0.5);
    leadIn.connect(leadSend);
    leadSend.connect(musicSend);

    arpIn = filterNode('lowpass', 3600, 0.7);
    arpIn.connect(musicBus);
    const arpSend = gainNode(0.7);
    arpIn.connect(arpSend);
    arpSend.connect(musicSend);

    padIn = filterNode('lowpass', 1500, 0.7);
    padIn.connect(musicBus);
    const padSend = gainNode(0.3);
    padIn.connect(padSend);
    padSend.connect(musicSend);

    hatIn = filterNode('highpass', 7000, 0.7);
    hatIn.connect(musicBus);
  }

  // Thruster hum: two detuned saws through a resonant lowpass that breathes
  // slowly, a sub sine an octave below, and a little exhaust hiss. Always
  // running, silent until setEngine() opens the output gain.
  function buildEngine() {
    const out = gainNode(0);
    out.connect(loopBus);

    const lp = filterNode('lowpass', 300, 2.2);
    lp.connect(out);
    const lfo = runningOsc('sine', 0.7);
    const lfoDepth = gainNode(45);     // Hz
    lfo.connect(lfoDepth);
    lfoDepth.connect(lp.frequency);

    const o1 = runningOsc('triangle', 116);
    const g1 = gainNode(0.5);
    o1.connect(g1);
    g1.connect(lp);

    const o2 = runningOsc('sine', 116 * 3.01);      // turbine whistle
    const g2 = gainNode(0.1);
    o2.connect(g2);
    g2.connect(lp);

    const sub = runningOsc('sine', 58);
    const gs = gainNode(0.55);
    sub.connect(gs);
    gs.connect(out);

    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = noiseBuf;
    hissSrc.loop = true;
    const hiss = filterNode('bandpass', 600, 1.2);
    const hissGain = gainNode(0.03);
    hissSrc.connect(hiss);
    hiss.connect(hissGain);
    hissGain.connect(out);
    hissSrc.start(0);

    // air brake: dark noise that only opens while slowing down
    const brakeSrc = ctx.createBufferSource();
    brakeSrc.buffer = noiseBuf;
    brakeSrc.loop = true;
    const brake = filterNode('lowpass', 700, 0.7);
    const brakeGain = gainNode(0);
    brakeSrc.connect(brake);
    brake.connect(brakeGain);
    brakeGain.connect(out);
    brakeSrc.start(0, 0.41);

    engine = { out: out, lp: lp, o1: o1, o2: o2, sub: sub, hiss: hiss, hissGain: hissGain, brake: brake, brakeGain: brakeGain };
  }

  // Thermal-vent charging loop: warm energy being absorbed. A triangle LFO
  // opens the voice twice per cycle while a sawtooth LFO (same rate, same
  // start) sweeps the pitch up; the sawtooth reset falls exactly on a silent
  // point, so it never clicks. High partials shimmer on top, with echo.
  function buildCharge() {
    const rate = 1 / 0.9;
    const t0 = ctx.currentTime + 0.02;

    const out = gainNode(0);
    out.connect(loopBus);
    const send = gainNode(0.2);
    out.connect(send);
    send.connect(spaceIn);

    const lp = filterNode('lowpass', 2400, 0.5);
    lp.connect(out);

    const pulse = gainNode(0);
    pulse.connect(lp);
    const pulseLfo = runningOsc('triangle', rate, t0);
    pulseLfo.connect(pulse.gain);

    const sweepLfo = runningOsc('sawtooth', rate, t0);
    const sweep = gainNode(350);          // cents
    sweepLfo.connect(sweep);

    const a = runningOsc('triangle', 329.63, t0);
    const ga = gainNode(0.22);
    const b = runningOsc('sine', 493.88, t0);
    const gb = gainNode(0.12);
    sweep.connect(a.detune);
    sweep.connect(b.detune);
    a.connect(ga);
    ga.connect(pulse);
    b.connect(gb);
    gb.connect(pulse);

    // two high partials with slow, unrelated tremolos: the shimmer
    shimmer(lp, 1318.51, 7.3, 0.045, t0);
    shimmer(lp, 1975.53, 5.1, 0.03, t0);

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

  // Wind gust: looped noise through a bandpass, with a slow flutter so it
  // never sounds static. Always running, silent until setWind(v > 0).
  function buildWind() {
    const out = gainNode(0);
    out.connect(loopBus);

    const flutter = gainNode(1);
    flutter.connect(out);
    const lfo = runningOsc('sine', 0.37);
    const depth = gainNode(0.22);
    lfo.connect(depth);
    depth.connect(flutter.gain);

    const filter = filterNode('bandpass', 320, 0.8);
    filter.connect(flutter);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.connect(filter);
    src.start(0, 0.97);       // offset: not in phase with the engine's noise layer

    wind = { out: out, filter: filter };
  }

  // Weapon charge: energy gathering. A soft triangle tone with a fifth above it, chopped by a
  // pulse that starts slow and races as the charge fills ("wub .. wub . wub wubwubwub").
  // Always running, silent until setWeaponCharge(v > 0).
  function buildWhine() {
    const out = gainNode(0);
    out.connect(loopBus);         // dry only: it must fall silent the moment 'blast' plays

    const vca = gainNode(0.5);
    vca.connect(out);
    const lfo = runningOsc('sine', 6);
    const pulse = gainNode(0.5);
    lfo.connect(pulse);
    pulse.connect(vca.gain);

    const lp = filterNode('lowpass', 700, 1.5);
    lp.connect(vca);

    const o1 = runningOsc('triangle', WHINE_F0);
    const g1 = gainNode(0.6);
    o1.connect(g1);
    g1.connect(lp);

    const o2 = runningOsc('sine', WHINE_F0 * WHINE_RATIO);
    const g2 = gainNode(0.25);
    o2.connect(g2);
    g2.connect(lp);

    whine = { out: out, o1: o1, o2: o2, lp: lp, pulse: pulse, lfo: lfo };
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
    // Single shot: a short, soft low "thup". A quick low thump (about 280 -> 170 Hz) that is over
    // in a tenth of a second, with a faint breath of mid noise right behind it.
    shoot: function (t) {
      const k = 0.96 + Math.random() * 0.08;
      voice(sfxBus, t, { type: 'triangle', f: 285 * k, f2: 165 * k, dur: 0.1, vol: 0.34, attack: 0.002, hold: 0.012 });
      voice(sfxBus, t, { type: 'sine', f: 215 * k, f2: 150 * k, dur: 0.13, vol: 0.2, attack: 0.002, hold: 0.02 });
      noise(sfxBus, t + 0.02, { dur: 0.08, vol: 0.05, attack: 0.01, ftype: 'bandpass', f: 2200, q: 0.8 });
    },

    // Double / triple shot: the same thump a little higher, tighter and fuller
    shoot2: function (t) {
      const k = 0.96 + Math.random() * 0.08;
      voice(sfxBus, t, { type: 'triangle', f: 330 * k, f2: 200 * k, dur: 0.085, vol: 0.36, attack: 0.002, hold: 0.012 });
      voice(sfxBus, t, { type: 'sine', f: 245 * k, f2: 170 * k, dur: 0.11, vol: 0.22, attack: 0.002, hold: 0.02 });
      noise(sfxBus, t + 0.015, { dur: 0.07, vol: 0.06, attack: 0.01, ftype: 'bandpass', f: 2400, q: 0.8 });
    },

    // short metallic FM ping
    hit: function (t) {
      voice(sfxBus, t, { type: 'sine', f: 1568, dur: 0.09, vol: 0.22, attack: 0.002, hold: 0.012, fm: { ratio: 3.53, index: 4, index2: 0.2 } });
      voice(sfxBus, t, { type: 'sine', f: 2637, dur: 0.05, vol: 0.08, attack: 0.002, fm: { ratio: 1.41, index: 2 } });
      noise(sfxBus, t, { dur: 0.02, vol: 0.08, ftype: 'highpass', f: 5000 });
    },

    // Nuke: bright flash crack, a long falling roar, deep sub and a wide reverb wash (~2.5 s)
    nuke: function (t) {
      noise(sfxBus, t, { dur: 0.06, vol: 0.35, ftype: 'highpass', f: 1800 });
      noise(sfxFx, t, { dur: 2.4, vol: 0.4, attack: 0.01, ftype: 'lowpass', f: 5200, f2: 90, q: 0.7 });
      noise(sfxBus, t + 0.02, { dur: 2.6, vol: 0.45, attack: 0.04, ftype: 'lowpass', f: 320, f2: 50, q: 0.7 });
      voice(sfxBus, t, { type: 'sine', f: 70, f2: 30, dur: 2.2, vol: 0.4, attack: 0.02, hold: 0.4, fm: { ratio: 1.41, index: 2.5, index2: 0.3 } });
      voice(sfxFx, t, {
        type: 'sawtooth', f: 1400, f2: 60, dur: 1.4, vol: 0.1, attack: 0.005, hold: 0.1,
        lfo: { rate: 14, rate2: 3, depth: 200 },
        filter: { type: 'lowpass', f: 6000, f2: 300, q: 1 }
      });
      for (let i = 0; i < 8; i++) {
        noise(sfxBus, t + 0.15 + Math.random() * 1.2, { dur: 0.05 + Math.random() * 0.08, vol: 0.06 + Math.random() * 0.08, ftype: 'bandpass', f: 900 + Math.random() * 2600, q: 1.1 });
      }
    },

    // Enemy destroyed: a hard crack around 2 kHz for the first tenth of a second, then a deep
    // rumble (40-150 Hz) that stays loud and rolls away. Shortened from the reference length
    // because kills come in quick succession.
    explode: function (t) {
      const k = 0.9 + Math.random() * 0.2;
      noise(sfxBus, t, { dur: 0.11, vol: 0.3, attack: 0.002, ftype: 'bandpass', f: 2000 * k, q: 1.4 });
      crunch(sfxBus, t + 0.03, { dur: 1.3, vol: 0.34, rate: 0.22 * k, rate2: 0.05, glide: 0.5, attack: 0.04, hold: 0.45, lp: 420 });
      voice(sfxBus, t + 0.03, { type: 'triangle', f: 120 * k, f2: 44, glide: 0.6, dur: 1.2, vol: 0.3, attack: 0.03, hold: 0.4 });
      voice(sfxBus, t + 0.03, { type: 'sine', f: 64 * k, f2: 43, dur: 1.35, vol: 0.26, attack: 0.04, hold: 0.5 });
    },

    // Big explosion (turret, guardian): swells in over a third of a second, a long heavy rumble
    // (60-170 Hz) for two seconds, then a tail that thins out into the low mids. About 3 s.
    bigExplode: function (t) {
      crunch(sfxBus, t, { dur: 2.9, vol: 0.4, rate: 0.28, rate2: 0.07, glide: 1.6, attack: 0.33, hold: 1.0, lp: 520 });
      crunch(sfxFx, t + 0.1, { dur: 3.1, vol: 0.14, rate: 0.5, rate2: 0.16, attack: 0.4, hold: 1.2, lp: 900 });
      voice(sfxBus, t, { type: 'triangle', f: 150, f2: 64, glide: 1.4, dur: 2.6, vol: 0.34, attack: 0.3, hold: 0.9 });
      voice(sfxBus, t, { type: 'sine', f: 86, f2: 60, dur: 2.8, vol: 0.3, attack: 0.3, hold: 1.1 });
      // tail: what is left hums a little higher as it dies
      voice(sfxFx, t + 2.2, { type: 'triangle', f: 250, f2: 320, dur: 1.0, vol: 0.07, attack: 0.3, hold: 0.2 });
    },

    // Weapon power-up collected: a fast, very high two-note trill (about 2.9 and 3.7 kHz, a note
    // every 60 ms) that creeps upward over half a second.
    powerUp: function (t) {
      for (let i = 0; i < 10; i++) {
        const f = (i % 2 ? 3680 : 2890) * (1 + 0.004 * i);
        voice(sfxBus, t + i * 0.058, { type: 'sine', f: f, dur: 0.062, vol: i === 0 || i === 9 ? 0.07 : 0.1, attack: 0.004, hold: 0.045, fm: { ratio: 1.26, index: 0.35, index2: 0.3 } });
      }
    },

    // Touching a heat source: a quick two-tone blip (about 480 and 560 Hz), under a fifth of a second
    vent: function (t) {
      const seq = [480, 560, 480, 560];
      for (let i = 0; i < 4; i++) voice(sfxBus, t + i * 0.042, { type: 'triangle', f: seq[i], dur: 0.05, vol: 0.2, attack: 0.004, hold: 0.032 });
    },

    // Ice block breaking: a quick scatter of glassy FM pings, no noise burst
    shatter: function (t) {
      const base = 2200 + Math.random() * 600;
      for (let i = 0; i < 5; i++) {
        const f = base * (0.7 + Math.random() * 1.3);
        voice(i < 2 ? sfxBus : sfxFx, t + i * 0.022 + Math.random() * 0.02, {
          type: 'sine', f: f, f2: f * 0.94, dur: 0.07 + Math.random() * 0.09, vol: 0.09, attack: 0.002,
          fm: { ratio: 2.76, index: 3, index2: 0.2 }
        });
      }
      voice(sfxBus, t, { type: 'triangle', f: 190, f2: 120, dur: 0.07, vol: 0.1, attack: 0.004 });
    },

    // enemy energy orb: alien "wub" (low tone with a slowing pitch wobble)
    orb: function (t) {
      voice(sfxBus, t, {
        type: 'sawtooth', f: 150, f2: 110, dur: 0.34, vol: 0.11, attack: 0.02, hold: 0.14,
        lfo: { rate: 16, rate2: 7, depth: 420 },
        filter: { type: 'lowpass', f: 500, f2: 1400, q: 4 }
      });
      voice(sfxBus, t, { type: 'sine', f: 75, f2: 55, dur: 0.3, vol: 0.14, attack: 0.02, hold: 0.1 });
    },

    // Sled destroyed: heavy crunch, a slow deep bass drop, the engine powering down smoothly
    // (no wobble), and shards ringing out into the echo (about 1.7 s).
    playerDie: function (t) {
      crunch(sfxBus, t, { dur: 1.2, vol: 0.32, rate: 0.9, rate2: 0.06, glide: 0.4, attack: 0.012, hold: 0.18, lp: 4800 });
      crunch(sfxFx, t + 0.05, { dur: 1.7, vol: 0.15, rate: 0.3, rate2: 0.04, glide: 0.6, attack: 0.05, hold: 0.35, lp: 1400 });
      // bass drop
      voice(sfxBus, t, { type: 'sine', f: 105, f2: 27, dur: 1.5, vol: 0.38, attack: 0.012, hold: 0.25 });
      // power-down: two detuned saws gliding down, darkening as they fall
      voice(sfxFx, t + 0.04, {
        type: 'sawtooth', f: 196, f2: 46, dur: 1.3, vol: 0.07, attack: 0.03, hold: 0.2, detune: -9,
        filter: { type: 'lowpass', f: 2200, f2: 180, q: 1.2 }
      });
      voice(sfxFx, t + 0.04, {
        type: 'sawtooth', f: 196, f2: 46, dur: 1.3, vol: 0.07, attack: 0.03, hold: 0.2, detune: 11,
        filter: { type: 'lowpass', f: 2200, f2: 180, q: 1.2 }
      });
      // shards
      for (let i = 0; i < 7; i++) {
        const f = 1300 + Math.random() * 2600;
        voice(sfxFx, t + 0.08 + Math.random() * 0.7, {
          type: 'sine', f: f, f2: f * 0.9, dur: 0.1 + Math.random() * 0.16, vol: 0.05, attack: 0.002,
          fm: { ratio: 3.17, index: 3, index2: 0.2 }
        });
      }
    },

    // froze solid: crystalline FM bells falling down the scale, with echo
    freeze: function (t) {
      const notes = [95, 91, 88, 86, 83, 79, 76, 71];
      for (let i = 0; i < notes.length; i++) {
        voice(sfxFx, t + i * 0.085, {
          type: 'sine', f: hz(notes[i]), dur: 0.42, vol: 0.09, attack: 0.003,
          fm: { ratio: 3.01, index: 2.2, index2: 0.05, time: 0.18 }
        });
      }
      voice(sfxBus, t, { type: 'triangle', f: 1500, f2: 240, dur: 1.0, vol: 0.04, attack: 0.03, hold: 0.3 });
      noise(sfxFx, t, { dur: 0.95, vol: 0.05, attack: 0.03, ftype: 'highpass', f: 7500 });
    },

    // checkpoint: bright rising arpeggio that opens up, over a warp sweep
    gate: function (t) {
      const notes = [64, 71, 76, 79, 83, 88];
      for (let i = 0; i < notes.length; i++) {
        const last = i === notes.length - 1;
        const at = t + i * 0.075;
        voice(sfxFx, at, {
          type: 'sawtooth', f: hz(notes[i]), dur: last ? 0.6 : 0.3, vol: 0.15, attack: 0.005, detune: 8,
          filter: { type: 'lowpass', f: 900, f2: 5200, q: 3, glide: 0.2 }
        });
        voice(sfxFx, at, { type: 'square', f: hz(notes[i] + 12), dur: 0.2, vol: 0.04, attack: 0.005, detune: -8 });
      }
      noise(sfxFx, t, { dur: 0.7, vol: 0.08, attack: 0.3, ftype: 'bandpass', f: 500, f2: 7000, q: 2.5 });
    },

    // short bright fanfare (open fifths, fits over the minor-key music)
    extraLife: function (t) {
      const seq = [[76, 0, 0.09], [83, 0.07, 0.09], [88, 0.14, 0.09], [83, 0.21, 0.09], [88, 0.28, 0.34]];
      for (let i = 0; i < seq.length; i++) {
        const n = seq[i];
        const o = { type: 'sawtooth', f: hz(n[0]), dur: n[2], vol: 0.08, hold: n[2] * 0.5, detune: 9 };
        voice(sfxFx, t + n[1], o);
        o.detune = -9;
        voice(sfxFx, t + n[1], o);
        voice(sfxFx, t + n[1], { type: 'sine', f: hz(n[0] + 12), dur: n[2], vol: 0.05, fm: { ratio: 2, index: 1.5, index2: 0.1 } });
      }
    },

    // game start: power-up sweep into a rising arpeggio, about 0.8 s
    start: function (t) {
      voice(sfxFx, t, {
        type: 'sawtooth', f: 82, f2: 330, glide: 0.3, dur: 0.42, vol: 0.09, attack: 0.02, hold: 0.25,
        filter: { type: 'lowpass', f: 300, f2: 3200, q: 4, glide: 0.3 }
      });
      const notes = [64, 71, 76, 79, 83];
      for (let i = 0; i < notes.length; i++) {
        const last = i === notes.length - 1;
        const dur = last ? 0.36 : 0.11;
        const at = t + 0.12 + i * 0.08;
        voice(sfxFx, at, { type: 'sawtooth', f: hz(notes[i]), dur: dur, vol: 0.055, hold: dur * 0.5, detune: 8 });
        voice(sfxFx, at, { type: 'square', f: hz(notes[i]), dur: dur, vol: 0.028, hold: dur * 0.5, detune: -8 });
      }
    },

    // all stages done: rising E major run into a wide held chord, about 1.5 s
    lapDone: function (t) {
      const run = [64, 68, 71, 76, 80, 83, 88];
      for (let i = 0; i < run.length; i++) {
        const at = t + i * 0.1;
        voice(sfxFx, at, { type: 'sawtooth', f: hz(run[i]), dur: 0.2, vol: 0.05, hold: 0.07, detune: 8 });
        voice(sfxFx, at, { type: 'sine', f: hz(run[i] + 12), dur: 0.16, vol: 0.025, fm: { ratio: 2, index: 1.5, index2: 0.1 } });
      }
      const chord = [76, 80, 83, 88];
      const ct = t + 0.74;
      for (let i = 0; i < chord.length; i++) {
        voice(sfxFx, ct, { type: 'sawtooth', f: hz(chord[i]), dur: 0.78, vol: 0.028, attack: 0.01, hold: 0.3, detune: 10 });
        voice(sfxFx, ct, { type: 'sawtooth', f: hz(chord[i]), dur: 0.78, vol: 0.028, attack: 0.01, hold: 0.3, detune: -10 });
      }
      voice(sfxBus, t, { type: 'triangle', f: hz(52), dur: 0.7, vol: 0.09, attack: 0.01, hold: 0.4 });
      voice(sfxBus, ct, { type: 'sine', f: hz(40), dur: 0.78, vol: 0.18, attack: 0.01, hold: 0.35 });
      noise(sfxFx, t, { dur: 0.74, vol: 0.05, attack: 0.5, ftype: 'bandpass', f: 600, f2: 8000, q: 2 });
    },

    // small coin: sparkly two-note FM blip (a rising fourth), about 115 ms
    coin: function (t) {
      voice(sfxBus, t, { type: 'sine', f: hz(83), dur: 0.05, vol: 0.1, attack: 0.002, hold: 0.015, fm: { ratio: 2, index: 1.4, index2: 0.1 } });
      voice(sfxBus, t + 0.045, { type: 'sine', f: hz(88), dur: 0.07, vol: 0.11, attack: 0.002, hold: 0.012, fm: { ratio: 2, index: 1.8, index2: 0.1 } });
    },

    // big coin: three quick rising FM notes with sparkle and echo, about 300 ms
    bigCoin: function (t) {
      const notes = [83, 88, 95];
      for (let i = 0; i < notes.length; i++) {
        const last = i === notes.length - 1;
        voice(sfxFx, t + i * 0.06, {
          type: 'sine', f: hz(notes[i]), dur: last ? 0.18 : 0.075, vol: 0.12, attack: 0.002, hold: 0.02,
          fm: { ratio: 3, index: 1.6, index2: 0.1 }
        });
      }
      voice(sfxFx, t + 0.185, { type: 'sine', f: hz(107), dur: 0.115, vol: 0.02, attack: 0.002 });
      noise(sfxFx, t + 0.12, { dur: 0.09, vol: 0.02, ftype: 'highpass', f: 8000 });
    },

    // coins spent to continue: sub thump, then a low filtered-saw fifth that
    // opens up. Percussive and low so it does not fight 'start' after it.
    buy: function (t) {
      voice(sfxBus, t, { type: 'sine', f: 160, f2: 60, dur: 0.14, vol: 0.35 });
      voice(sfxBus, t, {
        type: 'sawtooth', f: hz(40), dur: 0.16, vol: 0.16, attack: 0.004, hold: 0.06,
        filter: { type: 'lowpass', f: 2400, f2: 300, q: 5 }
      });
      voice(sfxBus, t + 0.11, {
        type: 'sawtooth', f: hz(47), dur: 0.35, vol: 0.16, attack: 0.006, hold: 0.1,
        filter: { type: 'lowpass', f: 400, f2: 2600, q: 5, glide: 0.18 }
      });
      voice(sfxFx, t + 0.11, { type: 'sine', f: hz(71), dur: 0.3, vol: 0.05, attack: 0.004, fm: { ratio: 2, index: 1.5, index2: 0.05 } });
    },

    // not enough coins: dull double low buzz (rough FM saw through the
    // shared lowpass so it stays soft), about 200 ms
    deny: function (t) {
      voice(dullIn, t, { type: 'sawtooth', f: 98, dur: 0.09, vol: 0.12, attack: 0.008, hold: 0.05, fm: { ratio: 0.5, index: 1.5, index2: 1.5 } });
      voice(dullIn, t + 0.11, { type: 'sawtooth', f: 92.5, dur: 0.09, vol: 0.12, attack: 0.008, hold: 0.05, fm: { ratio: 0.5, index: 1.5, index2: 1.5 } });
    },

    // charged spread released: big wide energy discharge. Two detuned saws
    // dive through a resonant sweep, with a noise fwoosh, an FM zap and a
    // sub boom; the space bus spreads it. About 420 ms.
    blast: function (t) {
      voice(sfxFx, t, {
        type: 'sawtooth', f: 3200, f2: 110, glide: 0.28, dur: 0.36, vol: 0.2, attack: 0.003, hold: 0.04,
        filter: { type: 'lowpass', f: 7000, f2: 500, q: 4 }
      });
      voice(sfxFx, t, {
        type: 'sawtooth', f: 3200, f2: 110, glide: 0.32, dur: 0.4, vol: 0.13, attack: 0.003, hold: 0.04, detune: 35,
        filter: { type: 'lowpass', f: 7000, f2: 500, q: 4 }
      });
      voice(sfxBus, t, { type: 'square', f: 2200, f2: 160, glide: 0.2, dur: 0.22, vol: 0.06, attack: 0.003, fm: { ratio: 1.5, index: 2 } });
      noise(sfxFx, t, { dur: 0.42, vol: 0.24, attack: 0.004, ftype: 'bandpass', f: 6000, f2: 700, q: 1.2 });
      noise(sfxBus, t, { dur: 0.05, vol: 0.1, ftype: 'highpass', f: 6000 });
      voice(sfxBus, t, { type: 'sine', f: 110, f2: 36, dur: 0.3, vol: 0.4 });
    },

    // spread weapon available again: soft "systems online" ping, a rising
    // fifth well below 'coin', with echo
    blastReady: function (t) {
      voice(sfxFx, t, { type: 'sine', f: hz(64), dur: 0.075, vol: 0.06, attack: 0.006, hold: 0.03, fm: { ratio: 2, index: 0.8, index2: 0.05 } });
      voice(sfxFx, t + 0.07, { type: 'sine', f: hz(71), dur: 0.11, vol: 0.065, attack: 0.006, hold: 0.025, fm: { ratio: 2, index: 0.8, index2: 0.05 } });
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
  // Turbine: a soft hum with a whistle above it and a rush of air. Speeding up opens a bright
  // surge on top; slowing down brings in a dark air-brake hush instead.
  function setEngine(v) {
    if (!ctx) return;
    v = clamp01(v);
    const t = ctx.currentTime;
    const rate = engineOn && t > engineT ? (v - engineV) / Math.max(0.008, t - engineT) : 0;   // throttle change per second
    if (engineOn && Math.abs(v - engineV) < 0.0005 && engineRate === 0) return;                // steady: nothing to do
    const up = clamp01(rate * 0.8), down = clamp01(-rate * 0.8);
    const f = 70 + 125 * v;
    engineOn = true;
    engineV = v;
    engineT = t;
    engineRate = Math.abs(rate) < 0.01 ? 0 : rate;
    engine.o1.frequency.setTargetAtTime(f, t, 0.09);
    engine.o2.frequency.setTargetAtTime(f * 3.01, t, 0.09);
    engine.sub.frequency.setTargetAtTime(f * 0.5, t, 0.09);
    engine.lp.frequency.setTargetAtTime(260 + 900 * v + 900 * up, t, 0.09);
    engine.hiss.frequency.setTargetAtTime(500 + 2300 * v + 1200 * up, t, 0.1);
    engine.hissGain.gain.setTargetAtTime(0.05 + 0.13 * v + 0.32 * up, t, 0.1);
    engine.brake.frequency.setTargetAtTime(750 - 350 * down, t, 0.1);
    engine.brakeGain.gain.setTargetAtTime(0.5 * down, t, down > 0 ? 0.06 : 0.18);
    engine.out.gain.setTargetAtTime(0.035 + 0.03 * v, t, 0.1);
  }

  function stopEngine() {
    if (!ctx || !engineOn) return;
    engineOn = false;
    engineV = -1;
    engineRate = 0;
    engine.out.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
  }

  function setCharging(flag) {
    if (!ctx) return;
    flag = !!flag;
    if (flag === chargeOn) return;
    chargeOn = flag;
    charge.out.gain.setTargetAtTime(flag ? 0.28 : 0, ctx.currentTime, flag ? 0.08 : 0.12);
  }

  // Atmosphere under the engine: loudness and brightness follow v (0..1).
  function setWind(v) {
    if (!ctx) return;
    v = clamp01(v);
    if (Math.abs(v - windV) < 0.004 && !(v === 0 && windV !== 0)) return;
    const t = ctx.currentTime;
    windV = v;
    wind.out.gain.setTargetAtTime(0.07 * v, t, 0.15);
    wind.filter.frequency.setTargetAtTime(320 + 900 * v, t, 0.15);
  }

  // Spread-weapon charge whine: pitch, brightness and pulse climb with v
  // (0..1). v = 0 fades out fast, so it can be cut the moment 'blast' plays.
  function setWeaponCharge(v) {
    if (!ctx) return;
    v = clamp01(v);
    const t = ctx.currentTime;
    if (v === 0) {
      if (whineV === 0) return;
      whineV = 0;
      // gain only: the pitch stays put, so the tail does not chirp downward
      whine.out.gain.setTargetAtTime(0, t, 0.01);       // about 40 ms to silence
      return;
    }
    if (Math.abs(v - whineV) < 0.004) return;           // nothing audible changed
    const f = WHINE_F0 * Math.pow(2, 1.6 * v);          // 150 Hz .. 455 Hz
    const bright = 700 + 2600 * v;
    if (whineV === 0) {
      // starting a new charge: snap pitch and tone while the output is still silent
      whine.o1.frequency.setValueAtTime(f, t);
      whine.o2.frequency.setValueAtTime(f * WHINE_RATIO, t);
      whine.lp.frequency.setValueAtTime(bright, t);
    } else {
      whine.o1.frequency.setTargetAtTime(f, t, 0.03);
      whine.o2.frequency.setTargetAtTime(f * WHINE_RATIO, t, 0.03);
      whine.lp.frequency.setTargetAtTime(bright, t, 0.03);
    }
    whineV = v;
    whine.lfo.frequency.setTargetAtTime(6 + 26 * v * v, t, 0.04);  // pulse races as the charge fills
    whine.out.gain.setTargetAtTime(0.07 + 0.07 * v, t, 0.03);
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

  // two-tone alarm: resonant saw blips, a falling fourth
  function beep(t) {
    voice(loopBus, t, {
      type: 'sawtooth', f: 880, dur: 0.09, vol: 0.28, hold: 0.05,
      filter: { type: 'bandpass', f: 1760, q: 2.5 }
    });
    voice(loopBus, t + 0.11, {
      type: 'sawtooth', f: 659.26, dur: 0.09, vol: 0.28, hold: 0.05,
      filter: { type: 'bandpass', f: 1320, q: 2.5 }
    });
  }

  // ----------------------------------------------------------------- music
  function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true;
    barIdx = 0;
    stepIdx = 0;
    nextStepTime = ctx.currentTime + 0.06;
    musicBus.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 0.03);
    musicSend.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 0.03);
    ensureTimer();
    tick();
  }

  function stopMusic() {
    if (!ctx || !musicOn) return;
    musicOn = false;
    // fade the dry bus and the send; what is already in the echo rings out
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    musicSend.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }

  function scheduleStep(bar, step, t) {
    const b = SONG[bar];
    const ch = CHORDS[b.chord];
    const sec = b.sec;
    const even = (step & 1) === 0;
    const i8 = step >> 1;
    const beat = step % 4;
    const full = sec === 'B' || sec === 'A2';

    // pad: detuned saw pair per chord note, one bar long, soft edges
    if (step === 0) {
      const pv = sec === 'C1' ? 0.042 : 0.032;
      for (let i = 0; i < ch.pad.length; i++) {
        const f = hz(ch.pad[i]);
        voice(padIn, t, { type: 'sawtooth', f: f, detune: -9, dur: BAR * 1.06, vol: pv, attack: 0.18, hold: BAR * 0.8 });
        voice(padIn, t, { type: 'sawtooth', f: f, detune: 9, dur: BAR * 1.06, vol: pv, attack: 0.18, hold: BAR * 0.8 });
      }
    }

    // bass: driving 16th sequence, each note a resonant filter pluck
    if (sec === 'C1') {
      if (step === 0) {
        voice(bassIn, t, {
          type: 'sawtooth', f: hz(ch.bass), dur: BAR * 0.98, vol: 0.16, attack: 0.03, hold: BAR * 0.6,
          filter: { type: 'lowpass', f: 520, f2: 220, q: 2 }
        });
      }
    } else {
      const pat = sec === 'C2' ? BASS_C : (sec === 'B' ? BASS_B : BASS_A);
      const off = pat[step];
      if (off >= 0) {
        voice(bassIn, t, {
          type: 'sawtooth', f: hz(ch.bass + off), dur: STEP * 0.96, vol: beat === 0 ? 0.1 : 0.085, attack: 0.004, hold: STEP * 0.45,
          filter: { type: 'lowpass', f: 1700, f2: 240, q: 2.5 }
        });
      }
    }

    // arpeggio: plucks into the echo
    if (full) {
      voice(arpIn, t, { type: 'square', f: hz(ch.arp[ARP_16[step]]), dur: 0.14, vol: even ? 0.06 : 0.042 });
    } else if (even) {
      if (sec === 'A') voice(arpIn, t, { type: 'square', f: hz(ch.arp[ARP_8[i8]]), dur: 0.16, vol: 0.06 });
      else voice(arpIn, t, { type: 'triangle', f: hz(ch.arp[ARP_C[i8]] + 12), dur: 0.24, vol: 0.07 });
    }

    // hats: open on the off-beat, closed in between
    let hat = 0;
    if (full || b.fill) hat = beat === 2 ? 0.055 : (beat === 0 ? 0.028 : 0.016);
    else if (sec === 'C1') hat = beat === 2 ? 0.025 : 0;
    else if (even) hat = beat === 2 ? 0.05 : 0.022;
    if (hat > 0) noise(hatIn, t, { dur: beat === 2 ? 0.07 : 0.03, vol: hat, attack: 0.002 });

    // kick: four on the floor (a single heartbeat per bar in the breakdown)
    if (beat === 0 && (sec !== 'C1' || step === 0)) {
      voice(musicBus, t, { type: 'sine', f: 150, f2: 42, glide: 0.09, dur: 0.2, vol: 0.14, attack: 0.002 });
      noise(musicBus, t, { dur: 0.012, vol: 0.05, ftype: 'lowpass', f: 3000 });
    }

    // snare: back-beat in the full sections, a roll at the end of fill bars
    let snare = 0;
    if (full && (step === 4 || step === 12)) snare = 0.07;
    if (b.fill && step >= 12) snare = 0.04 + 0.018 * (step - 12);
    if (snare > 0) {
      noise(musicBus, t, { dur: 0.13, vol: snare, ftype: 'bandpass', f: 1900, q: 0.8 });
      voice(musicBus, t, { type: 'triangle', f: 210, f2: 150, dur: 0.07, vol: snare * 0.9 });
    }

    // lead: detuned saw + square, vibrato on the long notes
    const lead = b.lead;
    for (let i = 0; i < lead.length; i++) {
      if (lead[i][0] === step) {
        const dur = lead[i][2] * STEP * 0.94;
        const f = hz(lead[i][1]);
        const o = { type: 'sawtooth', f: f, dur: dur, vol: 0.06, attack: 0.012, hold: dur * 0.55, detune: -7 };
        if (lead[i][2] >= 6) o.lfo = { rate: 5.5, depth: 10 };
        voice(leadIn, t, o);
        voice(leadIn, t, { type: 'square', f: f, dur: dur, vol: 0.03, attack: 0.012, hold: dur * 0.55, detune: 7 });
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
    setWind: guard(setWind),
    setWeaponCharge: guard(setWeaponCharge),
    setLowHeat: guard(setLowHeat),
    startMusic: guard(startMusic),
    stopMusic: guard(stopMusic),
    pause: guard(pause),
    resume: guard(resume)
  };
})();
