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

  const WHINE_F0 = 220;       // weapon charge whine: pitch at v = 0 (two octaves up at v = 1)
  const WHINE_RATIO = 2.008;  // second oscillator: an octave up, slightly sharp

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

  // music channel inputs
  let bassIn, leadIn, arpIn, padIn, hatIn;

  // persistent loops
  let engine = null;          // { out, lp, o1, o2, sub, hiss, hissGain }
  let engineOn = false;
  let engineV = -1;
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
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, sweepEnd);
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

    const o1 = runningOsc('sawtooth', 116);
    const g1 = gainNode(0.4);
    o1.connect(g1);
    g1.connect(lp);

    const o2 = runningOsc('sawtooth', 116 * 1.009);
    const g2 = gainNode(0.4);
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

    engine = { out: out, lp: lp, o1: o1, o2: o2, sub: sub, hiss: hiss, hissGain: hissGain };
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

  // Weapon charge whine: thin and "electric" (saw + octave square through a
  // highpass), nothing like the warm thermal-vent loop. A slow LFO adds the
  // pulse; its depth is opened by setWeaponCharge() as the charge fills.
  // Always running, silent until setWeaponCharge(v > 0).
  function buildWhine() {
    const out = gainNode(0);
    out.connect(loopBus);         // dry only: it must fall silent the moment 'blast' plays

    const vca = gainNode(1);
    vca.connect(out);
    const lfo = runningOsc('sine', 5.5);
    const pulse = gainNode(0);
    lfo.connect(pulse);
    pulse.connect(vca.gain);

    const lp = filterNode('lowpass', 1200, 2.5);
    lp.connect(vca);

    const hp = filterNode('highpass', 700, 0.7);
    hp.connect(lp);

    const o1 = runningOsc('sawtooth', WHINE_F0);
    const g1 = gainNode(0.5);
    o1.connect(g1);
    g1.connect(hp);

    const o2 = runningOsc('square', WHINE_F0 * WHINE_RATIO);
    const g2 = gainNode(0.14);
    o2.connect(g2);
    g2.connect(hp);

    whine = { out: out, o1: o1, o2: o2, lp: lp, pulse: pulse };
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
    // laser "pew": fast exponential down-sweep through a resonant lowpass.
    // Slight random detune keeps rapid fire from sounding like a machine.
    shoot: function (t) {
      const d = (Math.random() * 2 - 1) * 45;
      voice(sfxBus, t, {
        type: 'sawtooth', f: 2100, f2: 240, glide: 0.1, dur: 0.13, vol: 0.2, attack: 0.002, hold: 0.03, detune: d,
        filter: { type: 'lowpass', f: 6000, f2: 900, q: 3.5 }
      });
      voice(sfxBus, t, { type: 'square', f: 3200, f2: 500, glide: 0.06, dur: 0.07, vol: 0.05, attack: 0.002, detune: d });
    },

    // short metallic FM ping
    hit: function (t) {
      voice(sfxBus, t, { type: 'sine', f: 1568, dur: 0.09, vol: 0.22, attack: 0.002, hold: 0.012, fm: { ratio: 3.53, index: 4, index2: 0.2 } });
      voice(sfxBus, t, { type: 'sine', f: 2637, dur: 0.05, vol: 0.08, attack: 0.002, fm: { ratio: 1.41, index: 2 } });
      noise(sfxBus, t, { dur: 0.02, vol: 0.08, ftype: 'highpass', f: 5000 });
    },

    // Gritty explosion: sharp crack, a broad un-resonant noise body, a rough low rumble and
    // scattered debris crackle. No clean pitched sweep and no resonant filter: those are
    // what made the previous version read as a balloon pop.
    explode: function (t) {
      const k = 0.85 + Math.random() * 0.3;
      // crack: very short bright transient
      noise(sfxBus, t, { dur: 0.035, vol: 0.22, ftype: 'highpass', f: 2400 });
      // body: wide noise closing down slowly, flat filter (q 0.7)
      noise(sfxBus, t, { dur: 1.3, vol: 0.3, attack: 0.006, ftype: 'lowpass', f: 2600 * k, f2: 160, q: 0.7 });
      // rumble: low noise, longer than the body, a little of it into the space bus
      noise(sfxBus, t + 0.01, { dur: 1.7, vol: 0.34, attack: 0.02, ftype: 'lowpass', f: 260, f2: 70, q: 0.7 });
      noise(sfxFx, t + 0.02, { dur: 1.0, vol: 0.12, attack: 0.02, ftype: 'bandpass', f: 700 * k, f2: 220, q: 0.8 });
      // rough sub: FM-roughened, nearly flat in pitch, soft attack (no "boing")
      voice(sfxBus, t, {
        type: 'sine', f: 62 * k, f2: 44, dur: 1.0, vol: 0.2, attack: 0.012, hold: 0.16,
        fm: { ratio: 1.37, index: 2.2, index2: 0.3 }
      });
      // energy tearing apart: short noisy metallic zap
      voice(sfxBus, t, {
        type: 'sawtooth', f: 760 * k, f2: 90, dur: 0.2, vol: 0.07, attack: 0.003,
        fm: { ratio: 2.71, index: 6, index2: 1 },
        filter: { type: 'lowpass', f: 3200, f2: 500, q: 0.9 }
      });
      // debris: a few tiny crackles scattered over the tail
      for (let i = 0; i < 5; i++) {
        noise(sfxBus, t + 0.06 + Math.random() * 0.5, {
          dur: 0.03 + Math.random() * 0.04, vol: 0.07 + Math.random() * 0.07,
          ftype: 'bandpass', f: 1600 + Math.random() * 2600, q: 1.2
        });
      }
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

    // long descending explosion: falling wobbling tone, sub boom, noise tail (1.2 s)
    playerDie: function (t) {
      noise(sfxFx, t, { dur: 1.2, vol: 0.34, ftype: 'lowpass', f: 6500, f2: 110, q: 3 });
      noise(sfxBus, t + 0.16, { dur: 0.5, vol: 0.2, ftype: 'bandpass', f: 1500, f2: 260, q: 2 });
      voice(sfxFx, t, {
        type: 'sawtooth', f: 920, f2: 42, dur: 1.05, vol: 0.16, attack: 0.008, hold: 0.25,
        lfo: { rate: 11, rate2: 4, depth: 140 },
        filter: { type: 'lowpass', f: 4000, f2: 300, q: 3 }
      });
      voice(sfxBus, t, { type: 'sine', f: 130, f2: 28, dur: 0.85, vol: 0.42 });
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
  function setEngine(v) {
    if (!ctx) return;
    v = clamp01(v);
    if (engineOn && Math.abs(v - engineV) < 0.004) return;   // nothing audible changed
    const t = ctx.currentTime;
    const f = 104 + 96 * v;                                   // saws; the sub sits an octave below
    engineOn = true;
    engineV = v;
    engine.o1.frequency.setTargetAtTime(f, t, 0.09);
    engine.o2.frequency.setTargetAtTime(f * 1.009, t, 0.09);
    engine.sub.frequency.setTargetAtTime(f * 0.5, t, 0.09);
    engine.lp.frequency.setTargetAtTime(300 + 1500 * v, t, 0.09);
    engine.hiss.frequency.setTargetAtTime(600 + 1500 * v, t, 0.12);
    engine.hissGain.gain.setTargetAtTime(0.03 + 0.09 * v, t, 0.12);
    engine.out.gain.setTargetAtTime(0.03 + 0.022 * v, t, 0.1);
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
    const f = WHINE_F0 * Math.pow(2, 2 * v);            // 220 Hz .. 880 Hz
    const bright = 1200 + 3600 * v;
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
    whine.pulse.gain.setTargetAtTime(0.12 * v * v * v, t, 0.05);   // pulse mostly near full charge
    whine.out.gain.setTargetAtTime(0.03 + 0.045 * v, t, 0.03);
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
