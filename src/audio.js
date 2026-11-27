/*
 * Buzul Geçidi — ses modülü (audio module), v2 "premium" revision
 *
 * Everything is synthesized with the Web Audio API at runtime: no samples,
 * no assets, no libraries. Even the reverb impulse response and the noise
 * tables are generated in plain JS when the context is created.
 *
 * Exposes a single global: window.GameAudio
 *
 * Signal flow
 * ───────────
 *   one-shots ─► voice slots (pooled gain+pan) ─► sfxBus ──┐
 *   UI blips  ─► ui slots ─────────────────────► uiBus ───┤
 *   engine / wind / charging / weapon whine ─► loopDuck ─► loopBus ─┤
 *   music layers (pad, bass, arp, drums, lead, riser) ─► musicDuck ─► musicBus ─┤
 *   per-voice sends ─► reverb (synthesized stereo IR) ─► reverbReturn ────────┤
 *   per-voice sends ─► tempo-synced delay (3/16, filtered feedback) ──────────┤
 *                                                                              ▼
 *                masterIn ─► masterLP ("world drops out" on death) ─► soft-knee compressor
 *                        ─► brickwall limiter ─► soft clipper (never above −0.26 dBFS)
 *                        ─► masterGain (mute) ─► destination
 *
 * Music ducks under big events (explosions, nuke, death) with a fast attack
 * and a slow release; the engine ducks a little under a charged blast.
 *
 * Voices: every one-shot borrows a pooled slot (gain → stereo pan → bus, with
 * reverb and delay sends). Each sound has its own simultaneous-voice cap and
 * the pools have a global cap (18 sfx + 6 ui); the oldest voice is stolen with
 * a 5 ms fade when a pool is full. Pitch and amplitude are randomised per hit
 * and a round-robin picks small design variants so rapid fire stays alive.
 *
 * Mobile: a single AudioContext is created inside a user gesture by init();
 * resume()/init() wake a suspended or interrupted context. Nothing is rendered
 * offline at runtime. The only OfflineAudioContext use is the private test hook
 * GameAudio._renderOffline(name, seconds, opts), which builds a second rig on an
 * offline context so the exact signal chain can be measured.
 *
 * Every public method is a safe no-op before init(), without Web Audio, or if
 * the context failed to start. Nothing here ever throws into the game.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ levels
  // Linear gains. Calibrated against offline renders of the complete chain.
  const LVL = {
    master: 0.9,
    sfx: 0.80,
    ui: 0.8,
    loops: 0.55,
    music: 0.06,
    reverb: 0.62,
    delay: 0.45,
    engine: 0.12,
    wind: 0.4,
    charging: 0.06,
    whine: 0.09
  };
  const SIL = 0.0001;              // end value for exponential ramps (−80 dB)
  const POOL_SFX = 18, POOL_UI = 6;  // global voice caps
  const PAN_WIDTH = 0.55;          // "light stereo": full screen width maps to ±0.55

  // --------------------------------------------------------------- scheduler
  const TICK_MS = 40;              // wake-up interval of the music/alarm scheduler
  const AHEAD = 0.25;              // how far ahead events go on the audio clock (s)
  const BPM = 118;
  const STEP = 60 / BPM / 4;       // one 16th note
  const BAR = STEP * 16;
  const DELAY_TIME = STEP * 3;     // dotted eighth: tempo-synced delay
  const ALARM_PERIOD = 1.2;        // low fuel / heat double beep (s)

  // ------------------------------------------------------------------- music
  // Cinematic-electronic piece in D minor, 32 bars = four 8-bar phrases.
  //   phrase 0: progression A, no lead      phrase 1: A + lead motif 1
  //   phrase 2: progression B, arp up       phrase 3: B + lead motif 2
  // Boss mode: everything a minor third down (B minor), half-time drums,
  // darker pad, an 8-bar tension riser, and the progression's darker turn.
  // Notes are MIDI numbers; one chord lasts two bars.
  const CHORDS = {
    Dm: { r: 38, pad: [62, 65, 69], arp: [62, 65, 69, 74] },
    Bb: { r: 34, pad: [62, 65, 70], arp: [58, 62, 65, 70] },
    F:  { r: 41, pad: [60, 65, 69], arp: [57, 60, 65, 69] },
    C:  { r: 36, pad: [60, 64, 67], arp: [55, 60, 64, 67] },
    Gm: { r: 43, pad: [62, 67, 70], arp: [55, 58, 62, 67] },
    A:  { r: 33, pad: [61, 64, 69], arp: [57, 61, 64, 69] }
  };
  const PROG_A = ['Dm', 'Bb', 'F', 'C'];      // i  VI  III VII
  const PROG_B = ['Dm', 'Gm', 'Bb', 'A'];     // i  iv  VI  V
  const PROG_BOSS = ['Dm', 'Bb', 'Gm', 'A'];  // i  VI  iv  V (transposed −3 at play time)

  // Bass: 16 steps per bar, semitone offset from the chord root, −1 = rest.
  const BASS_A = [0, -1, -1, 0, -1, -1, 0, -1, 12, -1, -1, 0, -1, -1, 7, -1];
  const BASS_B = [0, -1, 0, -1, 0, -1, 12, -1, 0, -1, 0, -1, 12, -1, 7, 10];
  const BASS_BOSS = [0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 12, -1];

  // Arp: index into the chord's four arp notes (pulsing 16ths), −1 = rest.
  const ARP_A = [0, 1, 2, 3, 0, 2, 1, 3, 0, 1, 2, 3, 1, 3, 2, 0];
  const ARP_B = [3, 2, 1, 0, 3, 1, 2, 0, 3, 2, 1, 0, 2, 0, 1, 3];
  const ARP_BOSS = [0, -1, 2, -1, 0, -1, 3, -1, 0, -1, 2, -1, 1, -1, 3, -1];

  // Lead motifs: per bar [[step, midi, lengthInSteps], ...]
  const LEAD_1 = [
    [[0, 74, 6], [8, 77, 4], [12, 76, 2], [14, 74, 2]],
    [[0, 72, 8], [10, 69, 2], [12, 74, 4]],
    [[0, 74, 4], [4, 77, 4], [8, 81, 8]],
    [[0, 79, 6], [8, 77, 4], [12, 74, 4]],
    [[0, 76, 4], [4, 77, 4], [8, 81, 4], [12, 84, 4]],
    [[0, 81, 12], [12, 79, 4]],
    [[0, 76, 4], [4, 79, 4], [8, 84, 8]],
    [[0, 83, 6], [6, 81, 2], [8, 79, 4], [12, 76, 4]]
  ];
  const LEAD_2 = [
    [[0, 81, 6], [8, 77, 4], [12, 74, 4]],
    [[0, 76, 4], [4, 77, 4], [8, 74, 8]],
    [[0, 79, 4], [4, 82, 4], [8, 86, 6], [14, 84, 2]],
    [[0, 82, 8], [8, 79, 8]],
    [[0, 77, 4], [4, 81, 4], [8, 86, 8]],
    [[0, 84, 6], [8, 82, 4], [12, 81, 4]],
    [[0, 81, 4], [4, 76, 4], [8, 73, 8]],
    [[0, 76, 8], [8, 73, 4], [12, 74, 4]]
  ];

  // ------------------------------------------------------------------- state
  const hasWindow = typeof window !== 'undefined';
  const AC = hasWindow ? (window.AudioContext || window.webkitAudioContext) : null;

  let live = null;            // the rig on the real AudioContext
  let musicVol = 1, sfxVol = 1;   // kullanıcı ayarları (0..1), LVL ile çarpılır
  let failed = false;         // Web Audio missing or context creation failed
  let paused = false;         // explicit pause() by the game
  let muted = false;          // remembered even before init()
  let startupQueued = 0;      // one-shots queued before the context first runs

  // ----------------------------------------------------------------- helpers
  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function clamp01(v) { v = +v; return v > 1 ? 1 : v > 0 ? v : 0; }
  function smooth(v, a, b) { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function quiet(p) { if (p && typeof p.catch === 'function') p.catch(function () { /* ignore */ }); }

  // ============================================================== THE RIG ==
  // Builds the complete audio graph on a context and returns its controls.
  // `offline` rigs (test hook) skip real-time checks and timers.
  function createRig(ctx, offline) {
    const sr = ctx.sampleRate;

    // ------------------------------------------------------------ node sugar
    function G(v) { const n = ctx.createGain(); n.gain.value = v; return n; }
    function F(type, f, q) {
      const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f;
      if (q != null) n.Q.value = q; return n;
    }
    function O(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
    function hold(param, t) {
      // freeze automation at t without a jump (fallback: snapshot the value)
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
      else { const v = param.value; param.cancelScheduledValues(t); param.setValueAtTime(v, t); }
    }
    function glide(param, t, v0, v1, d, lin) {
      param.setValueAtTime(v0, t);
      if (lin) param.linearRampToValueAtTime(v1, t + d);
      else param.exponentialRampToValueAtTime(Math.max(v1, SIL), t + d);
    }
    // Attack (linear) → decay to sustain → hold until t+dur → release. Returns stop time.
    function env(p, t, peak, a, d, s, dur, r) {
      a = Math.max(a || 0, 0.0015); r = Math.max(r || 0.03, 0.01);
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(peak, t + a);
      if (d > 0 && s < 1) p.setTargetAtTime(peak * s, t + a, d / 3);
      p.setTargetAtTime(0, t + dur, r / 5);
      return t + dur + r * 1.4 + 0.01;
    }

    // ---------------------------------------------------------- noise tables
    function noiseBuffer(seconds, kind) {
      const n = Math.floor(sr * seconds), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, hold = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'pink') {          // Paul Kellet's economy pink filter
          b0 = 0.99765 * b0 + w * 0.0990460;
          b1 = 0.96300 * b1 + w * 0.2965164;
          b2 = 0.57000 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
        } else if (kind === 'crunch') { // sample-and-hold at ~sr/9: gritty, clocked
          if (i % 9 === 0) hold = w;
          d[i] = hold * 0.9;
        } else if (kind === 'crackle') { // sparse impulses with short ringing: ice
          last *= 0.86;
          if (Math.random() < 0.012) last = (Math.random() * 2 - 1) * 1.6;
          d[i] = Math.max(-1, Math.min(1, last + w * 0.03));
        } else d[i] = w;
      }
      return buf;
    }
    const bufWhite = noiseBuffer(2.0, 'white');
    const bufPink = noiseBuffer(2.0, 'pink');
    const bufCrunch = noiseBuffer(1.5, 'crunch');
    const bufCrackle = noiseBuffer(1.5, 'crackle');

    // Reverb impulse response: 20 ms pre-delay, eight early reflections spread
    // across the stereo field, then a decorrelated noise tail (RT60 ≈ 1.7 s)
    // whose highs decay faster than its lows (progressive one-pole lowpass).
    function makeIR() {
      const len = Math.floor(sr * 1.9), buf = ctx.createBuffer(2, len, sr);
      const pre = Math.floor(sr * 0.02);
      const taps = [[0.011, 0.9, 0.3], [0.019, 0.7, 0.8], [0.027, 0.65, 0.55], [0.041, 0.5, 0.2],
        [0.053, 0.45, 0.9], [0.067, 0.4, 0.4], [0.083, 0.3, 0.7], [0.097, 0.25, 0.5]];
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        let lp = 0;
        for (let i = pre; i < len; i++) {
          const x = (i - pre) / sr;
          const envl = Math.exp(-6.9 * x / 1.7) * (x < 0.06 ? x / 0.06 : 1);
          const a = 0.95 - 0.78 * Math.min(1, x / 1.2);  // lowpass closes as the tail decays
          lp += a * ((Math.random() * 2 - 1) - lp);
          d[i] = lp * envl * 0.55;
        }
        for (let k = 0; k < taps.length; k++) {
          const i = pre + Math.floor(taps[k][0] * sr), w = c === 0 ? taps[k][2] : 1 - taps[k][2];
          if (i < len) d[i] += taps[k][1] * (0.4 + 0.6 * w) * (k % 2 ? -1 : 1);
        }
      }
      return buf;
    }

    // ---------------------------------------------------------- master chain
    const masterIn = G(1);
    const masterLP = F('lowpass', 20000, 0.4);           // swept down on playerDie
    const comp = ctx.createDynamicsCompressor();          // glue: soft knee
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 3;
    comp.attack.value = 0.006; comp.release.value = 0.18;
    const limiter = ctx.createDynamicsCompressor();       // brickwall-ish safety
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.06;
    const clip = ctx.createWaveShaper();                  // true ceiling at 0.97
    (function () {
      const n = 2049, c = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
        const y = ax <= 0.7 ? ax : 0.7 + 0.27 * Math.tanh((ax - 0.7) / 0.27);
        c[i] = x < 0 ? -y : y;
      }
      clip.curve = c;
    })();
    const masterGain = G(muted ? 0 : LVL.master);
    masterIn.connect(masterLP); masterLP.connect(comp); comp.connect(limiter);
    limiter.connect(clip); clip.connect(masterGain); masterGain.connect(ctx.destination);

    // --------------------------------------------------------------- buses
    const sfxBus = G(LVL.sfx), uiBus = G(LVL.ui);
    const loopDuck = G(1), loopBus = G(LVL.loops);
    const musicDuck = G(1), musicBus = G(LVL.music);
    sfxBus.connect(masterIn); uiBus.connect(masterIn);
    loopDuck.connect(loopBus); loopBus.connect(masterIn);
    musicDuck.connect(musicBus); musicBus.connect(masterIn);

    // reverb
    const reverbIn = G(1), reverb = ctx.createConvolver(), reverbRet = G(LVL.reverb);
    reverb.buffer = makeIR();
    reverbIn.connect(reverb); reverb.connect(reverbRet); reverbRet.connect(masterIn);

    // tempo-synced delay with filtered feedback
    const delayIn = G(1), delay = ctx.createDelay(1.0), dlyFb = G(0.36), dlyLP = F('lowpass', 2600, 0.5), dlyRet = G(LVL.delay);
    delay.delayTime.value = DELAY_TIME;
    delayIn.connect(delay); delay.connect(dlyLP); dlyLP.connect(dlyFb); dlyFb.connect(delay);
    dlyLP.connect(dlyRet); dlyRet.connect(masterIn);
    dlyRet.connect(reverbIn);   // echoes also bloom a little

    function duck(node, depth, holdFor, release, t) {
      const g = node.gain, floor = 1 - depth;
      hold(g, t);
      const cur = g.value;
      if (cur < floor) { g.setTargetAtTime(1, t + holdFor, release / 3); return; }
      g.linearRampToValueAtTime(floor, t + 0.025);
      g.setValueAtTime(floor, t + 0.025 + holdFor);
      g.setTargetAtTime(1, t + 0.025 + holdFor, release / 3);
    }

    // -------------------------------------------------------------- voices
    function makePool(n, bus) {
      const pool = [];
      for (let i = 0; i < n; i++) {
        const s = { in: G(0), pan: null, rev: G(0), dly: G(0), src: [], name: '', end: 0, t0: 0, pri: 0 };
        let out = s.in;
        if (ctx.createStereoPanner) { s.pan = ctx.createStereoPanner(); s.in.connect(s.pan); out = s.pan; }
        out.connect(bus); s.in.connect(s.rev); s.rev.connect(reverbIn); s.in.connect(s.dly); s.dly.connect(delayIn);
        pool.push(s);
      }
      return pool;
    }
    const sfxPool = makePool(POOL_SFX, sfxBus), uiPool = makePool(POOL_UI, uiBus);

    function steal(s, t) {
      const ts = Math.max(ctx.currentTime, t - 0.008);
      hold(s.in.gain, ts);
      s.in.gain.linearRampToValueAtTime(0, ts + 0.005);
      for (let i = 0; i < s.src.length; i++) { try { s.src[i].stop(ts + 0.006); } catch (e) { /* already stopped */ } }
      s.src.length = 0;
      return s;
    }
    function acquire(pool, name, def, t) {
      let free = null, oldest = null, oldestSame = null, same = 0;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (s.end <= t) { if (!free) free = s; continue; }
        if (s.name === name) { same++; if (!oldestSame || s.t0 < oldestSame.t0) oldestSame = s; }
        if (!oldest || s.t0 < oldest.t0) oldest = s;
      }
      let s;
      if (same >= def.cap && oldestSame) s = steal(oldestSame, t);
      else if (free) { s = free; s.src.length = 0; }
      else if (oldest && oldest.pri <= def.pri) s = steal(oldest, t);
      else return null;
      s.name = name; s.t0 = t; s.end = t + def.dur; s.pri = def.pri;
      return s;
    }

    // ------------------------------------------------------- sound atoms
    // S = slot. All atoms connect into S.in and register their sources in S.src.
    function tone(S, t, o) {
      const osc = O(o.type || 'sine', o.f);
      if (o.det) osc.detune.value = o.det;
      if (o.f2) glide(osc.frequency, t, o.f, o.f2, o.gl || o.dur, o.lin);
      const vg = G(0);
      const end = env(vg.gain, t, o.g, o.a, o.d, o.s == null ? 1 : o.s, o.dur, o.r);
      let head = osc;
      if (o.lp) {
        const f = F('lowpass', o.lp, o.q || 0.8);
        if (o.lp2) glide(f.frequency, t, o.lp, o.lp2, o.lpd || o.dur);
        head.connect(f); head = f;
      }
      if (o.hp) { const f = F('highpass', o.hp, 0.7); head.connect(f); head = f; }
      head.connect(vg); vg.connect(o.dest || S.in);
      osc.start(t); osc.stop(end); S.src.push(osc);
      return osc;
    }
    function fm(S, t, o) {
      const car = O(o.type || 'sine', o.f), mod = O(o.mtype || 'sine', o.f * o.ratio), mg = G(o.f * o.idx);
      if (o.idx2 != null) glide(mg.gain, t, o.f * o.idx, o.f * o.idx2, o.idxd || o.dur);
      mod.connect(mg); mg.connect(car.frequency);
      if (o.f2) {
        glide(car.frequency, t, o.f, o.f2, o.gl || o.dur);
        glide(mod.frequency, t, o.f * o.ratio, o.f2 * o.ratio, o.gl || o.dur);
      }
      const vg = G(0);
      const end = env(vg.gain, t, o.g, o.a, o.d, o.s == null ? 1 : o.s, o.dur, o.r);
      let head = car;
      if (o.lp) {
        const f = F('lowpass', o.lp, o.q || 0.7);
        if (o.lp2) glide(f.frequency, t, o.lp, o.lp2, o.lpd || o.dur);
        head.connect(f); head = f;
      }
      head.connect(vg); vg.connect(o.dest || S.in);
      mod.start(t); mod.stop(end); car.start(t); car.stop(end);
      S.src.push(mod, car);
    }
    function hiss(S, t, o) {
      const s = ctx.createBufferSource(); s.buffer = o.buf || bufWhite; s.loop = true;
      if (o.rate) s.playbackRate.value = o.rate;
      let head = s;
      if (o.type) {
        const f = F(o.type, o.f, o.q || 0.8);
        if (o.f2) glide(f.frequency, t, o.f, o.f2, o.fd || o.dur);
        head.connect(f); head = f;
      }
      if (o.hp) { const f = F('highpass', o.hp, 0.6); head.connect(f); head = f; }
      if (o.lp) { const f = F('lowpass', o.lp, 0.6); if (o.lp2) glide(f.frequency, t, o.lp, o.lp2, o.lpd || o.dur); head.connect(f); head = f; }
      const vg = G(0);
      const end = env(vg.gain, t, o.g, o.a, o.d, o.s == null ? 1 : o.s, o.dur, o.r);
      head.connect(vg); vg.connect(o.dest || S.in);
      s.start(t, Math.random() * (s.buffer.duration - 0.6)); s.stop(end); S.src.push(s);
    }
    // very short filtered noise: the transient "click" at the front of a sound
    function tick(S, t, g, hpF, dur) {
      hiss(S, t, { type: 'highpass', f: hpF || 2500, q: 0.5, g: g, a: 0.0015, dur: dur || 0.004, r: 0.008 });
    }
    // additive bell: partials [ratio, amplitude, decay seconds]
    function bell(S, t, o) {
      for (let i = 0; i < o.parts.length; i++) {
        const p = o.parts[i], osc = O('sine', o.f * p[0]), vg = G(0);
        vg.gain.setValueAtTime(0, t);
        vg.gain.linearRampToValueAtTime(o.g * p[1], t + (o.a || 0.003));
        vg.gain.setTargetAtTime(0, t + (o.a || 0.003), p[2] / 5);
        osc.connect(vg); vg.connect(o.dest || S.in);
        osc.start(t); osc.stop(t + (o.a || 0.003) + p[2] * 1.5); S.src.push(osc);
      }
    }
    const BELL_WARM = [[1, 0.8, 0.8], [2, 0.4, 0.6], [3, 0.2, 0.4], [4.2, 0.1, 0.25]];
    const BELL_CHIME = [[1, 0.7, 0.6], [2, 0.22, 0.4], [2.76, 0.1, 0.25]];
    const BELL_GLASS = [[1, 1, 0.25], [1.37, 0.7, 0.2], [2.1, 0.5, 0.15], [2.9, 0.35, 0.12]];

    // ------------------------------------------------------- one-shot defs
    // ui: uses the ui pool; cap: max simultaneous of this sound; dur: slot busy time;
    // lvl: calibrated gain; rev/dly: send levels; duck: [depth, hold, release]; pri: steal priority.
    // fn(S, t, k): k.r = random pitch factor, k.v = round-robin variant (0..2), k.x = pan (−1..1)
    const SFX = {
      shoot: {
        cap: 6, dur: 0.16, lvl: 0.84, rev: 0.07, pri: 0,
        fn: function (S, t, k) {
          const lpStart = [2600, 3200, 2200][k.v];
          tick(S, t, 0.5, 3000);
          tone(S, t, { type: 'square', f: 900 * k.r, f2: 420 * k.r, gl: 0.07, lp: lpStart, lp2: 900, lpd: 0.08, g: 0.5, a: 0.002, dur: 0.05, r: 0.05 });
          tone(S, t, { type: 'sine', f: 260 * k.r, f2: 120, gl: 0.06, g: 0.4, a: 0.002, dur: 0.04, r: 0.04 });
        }
      },
      shoot2: {
        cap: 6, dur: 0.22, lvl: 0.95, rev: 0.09, pri: 0,
        fn: function (S, t, k) {
          tick(S, t, 0.5, 2500);
          tone(S, t, { type: 'sawtooth', f: 700 * k.r, f2: 330 * k.r, gl: 0.1, det: -9, lp: 3000, lp2: 700, lpd: 0.1, g: 0.3, a: 0.002, dur: 0.07, r: 0.06 });
          tone(S, t, { type: 'sawtooth', f: 700 * k.r, f2: 330 * k.r, gl: 0.1, det: 9, lp: 3000, lp2: 700, lpd: 0.1, g: 0.3, a: 0.002, dur: 0.07, r: 0.06 });
          hiss(S, t, { type: 'bandpass', f: 1800, f2: 400, q: 1.2, g: 0.25, a: 0.002, dur: 0.05, r: 0.05 });
          tone(S, t, { type: 'sine', f: 180 * k.r, f2: 90, gl: 0.07, g: 0.45, a: 0.002, dur: 0.05, r: 0.05 });
        }
      },
      hit: {
        cap: 6, dur: 0.3, lvl: 0.5, rev: 0.2, pri: 0,
        fn: function (S, t, k) {
          const ratio = [2.41, 2.76, 1.93][k.v];
          fm(S, t, { f: 1400 * k.r, ratio: ratio, idx: 1.8, idx2: 0.1, idxd: 0.12, lp: 5000, g: 0.45, a: 0.002, dur: 0.03, r: 0.14 });
          hiss(S, t, { hp: 1200, g: 0.3, a: 0.0015, dur: 0.015, r: 0.03 });
          tone(S, t, { type: 'sine', f: 160 * k.r, f2: 70, gl: 0.08, g: 0.45, a: 0.002, dur: 0.03, r: 0.07 });
        }
      },
      orb: {
        cap: 5, dur: 0.24, lvl: 0.95, rev: 0.15, pri: 0,
        fn: function (S, t, k) {
          tick(S, t, 0.25, 1500);
          tone(S, t, { type: 'triangle', f: 480 * k.r, f2: 160, gl: 0.12, lp: 2000, lp2: 500, lpd: 0.12, g: 0.6, a: 0.003, dur: 0.06, r: 0.1 });
          hiss(S, t, { type: 'bandpass', f: 900, f2: 300, q: 1.5, g: 0.3, a: 0.003, dur: 0.05, r: 0.08 });
        }
      },
      explode: {
        cap: 4, dur: 1.3, lvl: 0.95, rev: 0.45, pri: 2, duck: [0.35, 0.1, 0.6],
        fn: function (S, t, k) {
          hiss(S, t, { buf: bufCrunch, type: 'lowpass', f: 6000, f2: 200, fd: 0.5, q: 0.9, g: 0.9, a: 0.003, d: 0.1, s: 0.5, dur: 0.3, r: 0.5 });
          hiss(S, t, { hp: 2500, g: 0.5, a: 0.0015, dur: 0.03, r: 0.04 });
          tone(S, t, { type: 'sine', f: 95 * k.r, f2: 34, gl: 0.45, g: 0.9, a: 0.005, dur: 0.3, r: 0.3 });
          tone(S, t, { type: 'triangle', f: 140 * k.r, f2: 50, gl: 0.3, lp: 600, lp2: 120, lpd: 0.3, g: 0.5, a: 0.003, dur: 0.15, r: 0.3 });
          hiss(S, t, { buf: bufPink, type: 'lowpass', f: 500, f2: 150, fd: 0.9, g: 0.35, a: 0.05, dur: 0.4, r: 0.6 });
        }
      },
      bigExplode: {
        cap: 3, dur: 2.2, lvl: 1.0, rev: 0.55, pri: 3, duck: [0.5, 0.2, 0.9],
        fn: function (S, t, k) {
          hiss(S, t, { buf: bufCrunch, type: 'lowpass', f: 7000, f2: 150, fd: 0.8, q: 0.9, g: 1.0, a: 0.003, d: 0.15, s: 0.5, dur: 0.5, r: 0.8 });
          hiss(S, t, { hp: 2000, g: 0.6, a: 0.0015, dur: 0.04, r: 0.05 });
          tone(S, t, { type: 'sine', f: 75 * k.r, f2: 28, gl: 0.7, g: 1.0, a: 0.006, dur: 0.5, r: 0.5 });
          tone(S, t, { type: 'triangle', f: 110 * k.r, f2: 40, gl: 0.5, lp: 500, lp2: 90, lpd: 0.5, g: 0.6, a: 0.004, dur: 0.3, r: 0.5 });
          hiss(S, t + 0.12, { buf: bufCrackle, type: 'bandpass', f: 2500, q: 1, g: 0.35, a: 0.01, dur: 0.3, r: 0.5 });
          hiss(S, t, { buf: bufPink, type: 'lowpass', f: 400, f2: 120, fd: 1.4, g: 0.4, a: 0.1, dur: 0.8, r: 1.0 });
        }
      },
      shatter: {
        cap: 4, dur: 0.7, lvl: 0.7, rev: 0.5, pri: 1,
        fn: function (S, t, k) {
          tick(S, t, 0.6, 4000);
          bell(S, t, { f: 3200 * k.r, parts: BELL_GLASS, g: 0.5 });
          hiss(S, t, { buf: bufCrackle, type: 'bandpass', f: 5000, q: 1.2, g: 0.6, a: 0.002, dur: 0.12, r: 0.25 });
          tone(S, t, { type: 'sine', f: 2600 * k.r, f2: 1800, gl: 0.15, g: 0.2, a: 0.002, dur: 0.05, r: 0.15 });
        }
      },
      nuke: {
        cap: 1, dur: 3.8, lvl: 1.0, rev: 0.6, pri: 4, duck: [0.7, 0.8, 1.5],
        fn: function (S, t, k) {
          hiss(S, t, { hp: 800, lp: 9000, lp2: 120, lpd: 2.0, g: 1.0, a: 0.002, d: 0.3, s: 0.4, dur: 1.2, r: 1.0 });
          tone(S, t, { type: 'sine', f: 62, f2: 28, gl: 2.4, g: 1.0, a: 0.01, dur: 1.8, r: 0.8 });
          tone(S, t, { type: 'sawtooth', f: 880 * k.r, f2: 220, gl: 1.8, det: -12, lp: 3500, lp2: 300, lpd: 1.8, g: 0.25, a: 0.05, dur: 1.2, r: 0.6 });
          tone(S, t, { type: 'sawtooth', f: 880 * k.r, f2: 220, gl: 1.8, det: 12, lp: 3500, lp2: 300, lpd: 1.8, g: 0.25, a: 0.05, dur: 1.2, r: 0.6 });
          tone(S, t, { type: 'triangle', f: 120, f2: 35, gl: 1.0, lp: 400, lp2: 80, lpd: 1.0, g: 0.6, a: 0.004, dur: 0.6, r: 0.6 });
          bell(S, t + 0.05, { f: 440, a: 0.02, parts: [[1, 0.6, 2.5], [1.5, 0.4, 2.0], [2, 0.3, 1.8]], g: 0.3 });
        }
      },
      blast: {
        cap: 2, dur: 0.6, lvl: 0.68, rev: 0.3, pri: 2, engineDuck: true,
        fn: function (S, t, k) {
          fm(S, t, { f: 1800 * k.r, f2: 200, gl: 0.3, ratio: 1.5, idx: 2, idx2: 0.2, idxd: 0.3, lp: 6000, lp2: 800, lpd: 0.3, g: 0.55, a: 0.002, dur: 0.15, r: 0.25 });
          hiss(S, t, { type: 'bandpass', f: 3000, f2: 500, fd: 0.3, q: 0.8, g: 0.5, a: 0.005, dur: 0.15, r: 0.25 });
          tone(S, t, { type: 'sine', f: 120, f2: 45, gl: 0.25, g: 0.7, a: 0.003, dur: 0.12, r: 0.2 });
        }
      },
      blastReady: {
        ui: true, cap: 1, dur: 0.5, lvl: 1, rev: 0.35, pri: 0,
        fn: function (S, t) {
          tick(S, t, 0.15, 5000);
          bell(S, t, { f: 1320, parts: [[1, 0.8, 0.3], [1.5, 0.5, 0.25], [2, 0.25, 0.18]], g: 0.35 });
        }
      },
      freeze: {
        cap: 2, dur: 1.3, lvl: 1.15, rev: 0.5, pri: 1,
        fn: function (S, t, k) {
          hiss(S, t, { buf: bufCrackle, type: 'bandpass', f: 3200, q: 1, g: 0.5, a: 0.01, d: 0.3, s: 0.4, dur: 0.5, r: 0.4 });
          for (let i = -1; i <= 1; i++) tone(S, t, { type: 'sawtooth', f: 440 * k.r, f2: 220, gl: 0.8, det: 10 * i, lp: 1400, lp2: 350, lpd: 0.8, g: 0.2, a: 0.03, dur: 0.6, r: 0.4 });
          bell(S, t + 0.05, { f: 2400 * k.r, parts: [[1, 0.5, 0.4], [1.21, 0.3, 0.3]], g: 0.2 });
        }
      },
      powerUp: {
        cap: 2, dur: 0.9, lvl: 1.1, rev: 0.4, pri: 1,
        fn: function (S, t, k) {
          const notes = [523, 659, 784, 1047];
          for (let i = 0; i < 4; i++) bell(S, t + i * 0.07, { f: notes[i] * k.r, parts: [[1, 0.7, 0.3], [2, 0.25, 0.2], [3, 0.1, 0.12]], g: 0.35 });
          hiss(S, t, { hp: 6000, g: 0.15, a: 0.02, dur: 0.25, r: 0.2 });
          tone(S, t, { type: 'triangle', f: 400, f2: 1600, gl: 0.25, lp: 2500, g: 0.12, a: 0.01, dur: 0.22, r: 0.1 });
        }
      },
      extraLife: {
        cap: 1, dur: 1.5, lvl: 1.75, rev: 0.55, dly: 0.25, pri: 2,
        fn: function (S, t) {
          bell(S, t, { f: 659, parts: BELL_CHIME, g: 0.4 });
          bell(S, t + 0.16, { f: 988, parts: BELL_CHIME, g: 0.4 });
          bell(S, t + 0.32, { f: 1319, parts: BELL_CHIME, g: 0.3 });
          hiss(S, t + 0.3, { hp: 7000, g: 0.1, a: 0.05, dur: 0.3, r: 0.3 });
        }
      },
      buy: {
        cap: 2, dur: 0.9, lvl: 1.4, rev: 0.4, pri: 1,
        fn: function (S, t) {
          tick(S, t, 0.3, 3000);
          bell(S, t, { f: 440, parts: BELL_CHIME, g: 0.35 });
          bell(S, t + 0.12, { f: 659, parts: BELL_CHIME, g: 0.35 });
        }
      },
      deny: {
        ui: true, cap: 1, dur: 0.35, lvl: 0.55, rev: 0.05, pri: 0,
        fn: function (S, t) {
          tone(S, t, { type: 'square', f: 220, f2: 200, gl: 0.07, lp: 900, g: 0.3, a: 0.004, dur: 0.07, r: 0.03 });
          tone(S, t, { type: 'sine', f: 110, g: 0.25, a: 0.004, dur: 0.07, r: 0.03 });
          tone(S, t + 0.11, { type: 'square', f: 185, f2: 170, gl: 0.09, lp: 800, g: 0.3, a: 0.004, dur: 0.09, r: 0.05 });
          tone(S, t + 0.11, { type: 'sine', f: 92, g: 0.25, a: 0.004, dur: 0.09, r: 0.05 });
        }
      },
      gate: {
        cap: 1, dur: 1.2, lvl: 1.95, rev: 0.5, dly: 0.2, pri: 1,
        fn: function (S, t, k) {
          bell(S, t, { f: 330 * k.r, parts: BELL_WARM, g: 0.4 });
          hiss(S, t, { buf: bufPink, type: 'bandpass', f: 300, f2: 2200, fd: 0.3, q: 1.2, g: 0.25, a: 0.05, dur: 0.25, r: 0.1 });
          hiss(S, t + 0.3, { buf: bufPink, type: 'bandpass', f: 2200, f2: 300, fd: 0.35, q: 1.2, g: 0.25, a: 0.02, dur: 0.3, r: 0.15 });
        }
      },
      lapDone: {
        cap: 1, dur: 1.7, lvl: 0.75, rev: 0.5, dly: 0.3, pri: 3,
        fn: function (S, t) {
          const stab = function (at, notes, dur, r) {
            for (let i = 0; i < notes.length; i++) {
              tone(S, at, { type: 'sawtooth', f: notes[i], det: -7, lp: 4000, lp2: 900, lpd: 0.3, g: 0.14, a: 0.005, dur: dur, r: r });
              tone(S, at, { type: 'sawtooth', f: notes[i], det: 7, lp: 4000, lp2: 900, lpd: 0.3, g: 0.14, a: 0.005, dur: dur, r: r });
            }
            hiss(S, at, { type: 'bandpass', f: 2000, q: 0.8, g: 0.35, a: 0.002, dur: 0.03, r: 0.12 });
            tone(S, at, { type: 'sine', f: 90, f2: 60, gl: 0.15, g: 0.5, a: 0.003, dur: 0.1, r: 0.15 });
          };
          stab(t, [294, 349, 440, 587], 0.12, 0.25);
          stab(t + 0.25, [392, 466, 587, 784], 0.35, 0.6);
          bell(S, t + 0.25, { f: 1568, parts: [[1, 0.5, 0.5], [2, 0.15, 0.3]], g: 0.25 });
        }
      },
      playerDie: {
        cap: 1, dur: 2.0, lvl: 0.95, rev: 0.5, pri: 4, duck: [0.6, 0.6, 1.2], worldDrop: true,
        fn: function (S, t, k) {
          hiss(S, t, { buf: bufCrunch, type: 'lowpass', f: 5000, f2: 200, fd: 0.4, q: 0.9, g: 0.9, a: 0.003, dur: 0.25, r: 0.4 });
          tone(S, t, { type: 'sine', f: 80, f2: 30, gl: 0.5, g: 0.9, a: 0.005, dur: 0.3, r: 0.4 });
          tone(S, t, { type: 'sawtooth', f: 420 * k.r, f2: 55, gl: 0.7, det: -8, lp: 2500, lp2: 200, lpd: 0.7, g: 0.3, a: 0.01, dur: 0.5, r: 0.3 });
          tone(S, t, { type: 'sawtooth', f: 420 * k.r, f2: 55, gl: 0.7, det: 8, lp: 2500, lp2: 200, lpd: 0.7, g: 0.3, a: 0.01, dur: 0.5, r: 0.3 });
          hiss(S, t, { buf: bufPink, type: 'lowpass', f: 300, g: 0.3, a: 0.05, dur: 0.5, r: 0.8 });
        }
      },
      start: {
        cap: 1, dur: 1.4, lvl: 0.97, rev: 0.35, pri: 2,
        fn: function (S, t) {
          hiss(S, t, { buf: bufPink, type: 'bandpass', f: 180, f2: 3200, fd: 0.7, q: 1.2, g: 0.45, a: 0.1, dur: 0.6, r: 0.3 });
          tone(S, t, { type: 'sawtooth', f: 70, f2: 330, gl: 0.7, lp: 400, lp2: 2400, lpd: 0.7, g: 0.25, a: 0.05, dur: 0.6, r: 0.3 });
          tick(S, t + 0.72, 0.4, 2500);
          tone(S, t + 0.72, { type: 'sine', f: 110, f2: 45, gl: 0.15, g: 0.6, a: 0.003, dur: 0.08, r: 0.25 });
          bell(S, t + 0.72, { f: 1760, parts: [[1, 0.5, 0.3], [1.5, 0.2, 0.2]], g: 0.12 });
        }
      },
      vent: {
        cap: 1, dur: 1.1, lvl: 1.2, rev: 0.3, pri: 1,
        fn: function (S, t) {
          hiss(S, t, { type: 'bandpass', f: 2200, q: 0.6, g: 0.3, a: 0.08, d: 0.2, s: 0.7, dur: 0.5, r: 0.35 });
          tone(S, t, { type: 'sine', f: 220, f2: 660, gl: 0.8, g: 0.12, a: 0.1, dur: 0.6, r: 0.3 });
          tone(S, t, { type: 'sine', f: 330, f2: 990, gl: 0.8, g: 0.05, a: 0.1, dur: 0.6, r: 0.3 });
        }
      },
      coin: {
        cap: 6, dur: 0.25, lvl: 1.1, rev: 0.2, pri: 0,
        fn: function (S, t, k) {
          fm(S, t, { f: 1046 * k.r, ratio: 2, idx: 0.6, idx2: 0.05, idxd: 0.1, g: 0.35, a: 0.002, dur: 0.04, r: 0.08 });
          fm(S, t + 0.06, { f: 1396 * k.r, ratio: 2, idx: 0.6, idx2: 0.05, idxd: 0.1, g: 0.35, a: 0.002, dur: 0.05, r: 0.12 });
        }
      },
      bigCoin: {
        cap: 2, dur: 0.6, lvl: 1, rev: 0.35, dly: 0.2, pri: 1,
        fn: function (S, t, k) {
          const notes = [1046, 1318, 1568];
          for (let i = 0; i < 3; i++) fm(S, t + i * 0.07, { f: notes[i] * k.r, ratio: 2, idx: 0.6, idx2: 0.05, idxd: 0.1, g: 0.35, a: 0.002, dur: 0.05, r: 0.14 });
          bell(S, t + 0.14, { f: 3136, parts: [[1, 0.3, 0.25]], g: 0.2 });
        }
      },
      // internal: weapon charge reached 1.0
      chargeFull: {
        ui: true, cap: 1, dur: 0.5, lvl: 1, rev: 0.35, pri: 0,
        fn: function (S, t) {
          tick(S, t, 0.2, 6000);
          bell(S, t, { f: 1760, parts: [[1, 0.6, 0.25], [2, 0.2, 0.15]], g: 0.25 });
          bell(S, t + 0.05, { f: 2637, parts: [[1, 0.5, 0.25], [2, 0.15, 0.15]], g: 0.25 });
        }
      },
      // internal: low fuel / heat alarm, one double beep
      alarm: {
        ui: true, cap: 1, dur: 0.3, lvl: 0.7, rev: 0.1, pri: 0,
        fn: function (S, t, k) {
          const f = 740 * k.r;
          for (let i = 0; i < 2; i++) {
            tone(S, t + i * 0.1, { type: 'sine', f: f, g: 0.35, a: 0.005, dur: 0.05, r: 0.04 });
            tone(S, t + i * 0.1, { type: 'triangle', f: 2 * f, g: 0.06, a: 0.005, dur: 0.05, r: 0.04 });
          }
        }
      }
    };

    const lastPlayed = {}, roundRobin = {};
    for (const n in SFX) { lastPlayed[n] = -10; roundRobin[n] = 0; }

    // Pitch jitter per sound family (fraction). Tonal UI sounds stay in tune.
    const JITTER = { shoot: 0.05, shoot2: 0.05, hit: 0.08, orb: 0.06, explode: 0.1, bigExplode: 0.08, shatter: 0.06, coin: 0.02, freeze: 0.03, nuke: 0.03, blast: 0.04, playerDie: 0.03, alarm: 0 };

    // internal play: `at` is an absolute context time (offline scripts use it)
    function playAt(name, opts, at) {
      const def = SFX[name];
      if (!def) return;
      const t = at != null ? at : ctx.currentTime + 0.01;
      if (t - lastPlayed[name] < 0.03) return;      // same sound twice in 30 ms adds only loudness
      lastPlayed[name] = t;
      const pool = def.ui ? uiPool : sfxPool;
      const S = acquire(pool, name, def, t);
      if (!S) return;
      const j = JITTER[name] || 0.01;
      const k = { r: 1 + rnd(-j, j), v: roundRobin[name] = (roundRobin[name] + 1) % 3, x: 0 };
      const amp = def.lvl * (1 + rnd(-0.16, 0.16));  // about ±1.5 dB
      S.in.gain.setValueAtTime(amp, t);
      S.rev.gain.setValueAtTime(def.rev || 0, t);
      S.dly.gain.setValueAtTime(def.dly || 0, t);
      if (S.pan) {
        let p = 0;
        if (opts && typeof opts.x === 'number' && isFinite(opts.x)) p = Math.max(-1, Math.min(1, (opts.x / 360) * 2 - 1)) * PAN_WIDTH;
        S.pan.pan.setValueAtTime(p, t);
        k.x = p;
      }
      def.fn(S, t, k);
      if (def.duck) duck(musicDuck, def.duck[0], def.duck[1], def.duck[2], t);
      if (def.engineDuck) duck(loopDuck, 0.3, 0.1, 0.4, t);
      if (def.worldDrop) {
        const f = masterLP.frequency;
        hold(f, t);
        f.exponentialRampToValueAtTime(280, t + 0.5);
        f.setValueAtTime(280, t + 0.9);
        f.exponentialRampToValueAtTime(20000, t + 2.3);
      }
    }

    // ------------------------------------------------------------- engine
    // Three crossfaded layers: idle (sine + triangle hum), cruise (detuned saws),
    // boost (band-passed air + square harmonic). Pitch and filter follow speed.
    let eng = null, engOn = false;
    function buildEngine() {
      const out = G(0), lp = F('lowpass', 400, 0.7);
      const idle = G(0), cruise = G(0), boost = G(0);
      const o1 = O('sine', 55), o2 = O('triangle', 110);
      const s1 = O('sawtooth', 82), s2 = O('sawtooth', 82); s1.detune.value = -7; s2.detune.value = 7;
      const sq = O('square', 165), sqG = G(0.12);
      const air = ctx.createBufferSource(); air.buffer = bufPink; air.loop = true;
      const bp = F('bandpass', 1200, 1.2);
      o1.connect(idle); o2.connect(idle);
      s1.connect(cruise); s2.connect(cruise);
      air.connect(bp); bp.connect(boost); sq.connect(sqG); sqG.connect(boost);
      idle.connect(lp); cruise.connect(lp); boost.connect(lp); lp.connect(out); out.connect(loopDuck);
      const t = ctx.currentTime;
      o1.start(t); o2.start(t); s1.start(t); s2.start(t); sq.start(t); air.start(t);
      eng = { out: out, lp: lp, idle: idle, cruise: cruise, boost: boost, o1: o1, o2: o2, s1: s1, s2: s2, sq: sq, bp: bp };
    }
    function setEngine(v, at) {
      v = clamp01(v);
      if (!eng) buildEngine();
      const t = at != null ? at : ctx.currentTime, tc = 0.09;
      const f = 52 * (1 + 1.3 * v);
      eng.o1.frequency.setTargetAtTime(f, t, tc);
      eng.o2.frequency.setTargetAtTime(f * 2, t, tc);
      eng.s1.frequency.setTargetAtTime(f * 1.5, t, tc);
      eng.s2.frequency.setTargetAtTime(f * 1.5, t, tc);
      eng.sq.frequency.setTargetAtTime(f * 3, t, tc);
      eng.lp.frequency.setTargetAtTime(300 + 2200 * v * v, t, tc);
      eng.bp.frequency.setTargetAtTime(800 + 2500 * v, t, tc);
      const idle = 1 - smooth(v, 0.12, 0.6), cruise = smooth(v, 0.05, 0.5) * (1 - 0.6 * smooth(v, 0.6, 1)), boost = smooth(v, 0.5, 1);
      eng.idle.gain.setTargetAtTime(idle * 0.9, t, tc);
      eng.cruise.gain.setTargetAtTime(cruise * 0.35, t, tc);
      eng.boost.gain.setTargetAtTime(boost * 0.8, t, tc);
      if (!engOn) { engOn = true; eng.out.gain.setTargetAtTime(LVL.engine, t, 0.12); }
    }
    function stopEngine(at) {
      if (!eng || !engOn) return;
      engOn = false;
      eng.out.gain.setTargetAtTime(0, at != null ? at : ctx.currentTime, 0.1);
    }

    // --------------------------------------------------------------- wind
    // Band-passed pink noise; two slow LFOs move the band and the level for gusts.
    let wind = null;
    function buildWind() {
      const src = ctx.createBufferSource(); src.buffer = bufPink; src.loop = true;
      const bp = F('bandpass', 700, 0.7), out = G(0);
      const lfo1 = O('sine', 0.11), lfo1G = G(260), lfo2 = O('sine', 0.07), lfo2G = G(0);
      src.connect(bp); bp.connect(out); out.connect(loopDuck);
      lfo1.connect(lfo1G); lfo1G.connect(bp.frequency);
      lfo2.connect(lfo2G); lfo2G.connect(out.gain);
      const t = ctx.currentTime; src.start(t); lfo1.start(t); lfo2.start(t);
      wind = { out: out, bp: bp, lfo2G: lfo2G };
    }
    function setWind(v, at) {
      v = clamp01(v);
      if (!wind) { if (v <= 0) return; buildWind(); }
      const t = at != null ? at : ctx.currentTime;
      wind.out.gain.setTargetAtTime(v * LVL.wind, t, 0.25);
      wind.lfo2G.gain.setTargetAtTime(v * LVL.wind * 0.35, t, 0.25);
      wind.bp.frequency.setTargetAtTime(500 + 900 * v, t, 0.3);
    }

    // ------------------------------------------------------------ charging
    // Fuel station: rising tonal loop, slow filter sweep, a grain of clocked noise.
    let chg = null, chgOn = false;
    function buildCharging() {
      const out = G(0), lp = F('lowpass', 900, 2);
      const a = O('sawtooth', 110), b = O('sawtooth', 165.5), sub = O('sine', 55);
      const lfo = O('sine', 0.45), lfoG = G(520), wob = O('sine', 0.3), wobG = G(22);
      const grain = ctx.createBufferSource(); grain.buffer = bufCrunch; grain.loop = true;
      const gbp = F('bandpass', 1500, 2), gG = G(0.12);
      a.connect(lp); b.connect(lp); sub.connect(lp); lp.connect(out);
      grain.connect(gbp); gbp.connect(gG); gG.connect(out); out.connect(loopDuck);
      lfo.connect(lfoG); lfoG.connect(lp.frequency);
      wob.connect(wobG); wobG.connect(a.detune); wobG.connect(b.detune);
      const t = ctx.currentTime; a.start(t); b.start(t); sub.start(t); lfo.start(t); wob.start(t); grain.start(t);
      chg = { out: out };
    }
    function setCharging(on, at) {
      on = !!on;
      if (on === chgOn) return;
      if (!chg) { if (!on) return; buildCharging(); }
      chgOn = on;
      chg.out.gain.setTargetAtTime(on ? LVL.charging : 0, at != null ? at : ctx.currentTime, 0.25);
    }

    // ------------------------------------------------------- weapon charge
    // Pitch 150 → 600 Hz and filter open with v; tremolo speeds up; a sparkle at 1.
    let wh = null, whV = 0;
    function buildWhine() {
      const out = G(0), lp = F('lowpass', 400, 1.5);
      const a = O('sawtooth', 150), b = O('sine', 301.5), trem = O('sine', 4), tremG = G(0);
      a.connect(lp); b.connect(lp); lp.connect(out); out.connect(loopDuck);
      trem.connect(tremG); tremG.connect(out.gain);
      const t = ctx.currentTime; a.start(t); b.start(t); trem.start(t);
      wh = { out: out, lp: lp, a: a, b: b, trem: trem, tremG: tremG };
    }
    function setWeaponCharge(v, at) {
      v = clamp01(v);
      const prev = whV; whV = v;
      if (!wh) { if (v <= 0) return; buildWhine(); }
      const t = at != null ? at : ctx.currentTime;
      if (v <= 0) {
        wh.out.gain.setTargetAtTime(0, t, 0.05);
        wh.tremG.gain.setTargetAtTime(0, t, 0.05);
        return;
      }
      const f = 150 * Math.pow(4, v), g = LVL.whine * (0.25 + 0.75 * v);
      wh.a.frequency.setTargetAtTime(f, t, 0.04);
      wh.b.frequency.setTargetAtTime(f * 2.01, t, 0.04);
      wh.lp.frequency.setTargetAtTime(400 + 3000 * v * v, t, 0.05);
      wh.trem.frequency.setTargetAtTime(4 + 10 * v, t, 0.05);
      wh.out.gain.setTargetAtTime(g, t, 0.05);
      wh.tremG.gain.setTargetAtTime(g * 0.3 * v, t, 0.05);
      if (v >= 1 && prev < 1) playAt('chargeFull', null, at != null ? at : undefined);
    }

    // --------------------------------------------------------------- alarm
    let alarmOn = false, nextBeep = 0, beepCount = 0;
    function setLowHeat(on, at) {
      on = !!on;
      if (on === alarmOn) return;
      alarmOn = on;
      if (on) { nextBeep = (at != null ? at : ctx.currentTime) + 0.05; beepCount = 0; }
    }

    // --------------------------------------------------------------- music
    const padG = G(1), bassG = G(0), arpG = G(0), drumsG = G(0), leadG = G(0), riserG = G(0);
    const padLP = F('lowpass', 1100, 0.6), padLfo = O('sine', 0.08), padLfoG = G(350);
    padLfo.connect(padLfoG); padLfoG.connect(padLP.frequency); padLfo.start(ctx.currentTime);
    padLP.connect(padG);
    const layers = [padG, bassG, arpG, drumsG, leadG, riserG];
    for (let i = 0; i < layers.length; i++) layers[i].connect(musicDuck);
    const padRev = G(0.55), leadRev = G(0.4), leadDly = G(0.4), arpDly = G(0.28), snareRev = G(0.3);
    padG.connect(padRev); padRev.connect(reverbIn);
    leadG.connect(leadRev); leadRev.connect(reverbIn); leadG.connect(leadDly); leadDly.connect(delayIn);
    arpG.connect(arpDly); arpDly.connect(delayIn);
    snareRev.connect(reverbIn);
    const bassLP = F('lowpass', 900, 0.7); bassLP.connect(bassG);

    const music = { on: false, bar: 0, step: 0, nextT: 0, intensity: 0.6, boss: false, bossCur: false, lastLead: 0, tgt: { bass: 0, arp: 0, drums: 0, lead: 0 } };
    const mSrc = [];          // running music sources {n, end} so stopMusic can cut them
    function reg(n, end) { mSrc.push({ n: n, end: end }); }

    function applyIntensity(t) {
      const v = music.intensity, tc = 0.5;
      music.tgt.bass = smooth(v, 0.1, 0.3);
      music.tgt.arp = smooth(v, 0.2, 0.42);
      music.tgt.drums = smooth(v, 0.4, 0.62);
      music.tgt.lead = smooth(v, 0.5, 0.75);
      bassG.gain.setTargetAtTime(music.tgt.bass, t, tc);
      arpG.gain.setTargetAtTime(music.tgt.arp, t, tc);
      drumsG.gain.setTargetAtTime(music.tgt.drums, t, tc);
      leadG.gain.setTargetAtTime(music.tgt.lead, t, tc);
    }
    function setIntensity(v, at) {
      v = clamp01(v);
      if (Math.abs(v - music.intensity) < 0.01 && at == null) return;   // called every frame by the game
      music.intensity = v;
      applyIntensity(at != null ? at : ctx.currentTime);
    }
    function setBossMode(on) { music.boss = !!on; }     // takes effect at the next bar

    // -- instruments
    function mKick(t, vel) {
      const o = O('sine', 165), g = G(0);
      glide(o.frequency, t, 165, 46, 0.09);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.setTargetAtTime(0, t + 0.03, 0.07);
      o.connect(g); g.connect(drumsG); o.start(t); o.stop(t + 0.45); reg(o, t + 0.45);
      const n = ctx.createBufferSource(); n.buffer = bufWhite; const hp = F('highpass', 3000, 0.5), ng = G(0);
      ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(vel * 0.25, t + 0.001); ng.gain.setTargetAtTime(0, t + 0.002, 0.004);
      n.connect(hp); hp.connect(ng); ng.connect(drumsG); n.start(t, 0.3); n.stop(t + 0.05); reg(n, t + 0.05);
    }
    function mSnare(t, vel) {
      const n = ctx.createBufferSource(); n.buffer = bufWhite; const bp = F('bandpass', 1800, 0.8), g = G(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.003); g.gain.setTargetAtTime(0, t + 0.01, 0.045);
      n.connect(bp); bp.connect(g); g.connect(drumsG); g.connect(snareRev); n.start(t, Math.random()); n.stop(t + 0.3); reg(n, t + 0.3);
      const o = O('triangle', 200), og = G(0); glide(o.frequency, t, 200, 140, 0.05);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(vel * 0.4, t + 0.003); og.gain.setTargetAtTime(0, t + 0.005, 0.03);
      o.connect(og); og.connect(drumsG); o.start(t); o.stop(t + 0.2); reg(o, t + 0.2);
    }
    function mHat(t, vel, open) {
      const n = ctx.createBufferSource(); n.buffer = bufWhite; const hp = F('highpass', 7500, 0.6), g = G(0);
      const dec = open ? 0.09 : 0.018;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.22, t + 0.002); g.gain.setTargetAtTime(0, t + 0.004, dec);
      n.connect(hp); hp.connect(g); g.connect(drumsG); n.start(t, Math.random()); n.stop(t + dec * 6 + 0.02); reg(n, t + dec * 6 + 0.02);
    }
    function mBass(t, midi, len) {
      const f = hz(midi), o = O('sawtooth', f), s = O('sine', f / 2), g = G(0), flt = F('lowpass', 420, 1.2);
      glide(flt.frequency, t, 900, 180, Math.min(len, 0.25));
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.006); g.gain.setTargetAtTime(0.38, t + 0.006, 0.08);
      g.gain.setTargetAtTime(0, t + len - 0.02, 0.02);
      o.connect(flt); flt.connect(g); s.connect(g); g.connect(bassLP);
      o.start(t); s.start(t); o.stop(t + len + 0.1); s.stop(t + len + 0.1); reg(o, t + len + 0.1); reg(s, t + len + 0.1);
    }
    function mArp(t, midi, vel) {
      const f = hz(midi), o = O('square', f), tri = O('triangle', f), g = G(0), lp = F('lowpass', 2400, 0.9);
      glide(lp.frequency, t, 3200, 900, 0.12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.003); g.gain.setTargetAtTime(0, t + 0.01, 0.045);
      o.connect(lp); tri.connect(lp); lp.connect(g); g.connect(arpG);
      o.start(t); tri.start(t); o.stop(t + 0.3); tri.stop(t + 0.3); reg(o, t + 0.3); reg(tri, t + 0.3);
    }
    function mPad(t, notes, dur, boss) {
      const g = G(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11, t + 0.7); g.gain.setTargetAtTime(0, t + dur - 0.3, 0.3);
      g.connect(padLP);
      const end = t + dur + 1.2;
      for (let i = 0; i < notes.length; i++) {
        const f = hz(notes[i]), det = boss ? 11 : 7;
        const a = O('sawtooth', f), b = O('sawtooth', f); a.detune.value = -det; b.detune.value = det;
        a.connect(g); b.connect(g); a.start(t); b.start(t); a.stop(end); b.stop(end); reg(a, end); reg(b, end);
      }
      const sub = O('triangle', hz(notes[0] - 12)), sg = G(0.6); sub.connect(sg); sg.connect(g); sub.start(t); sub.stop(end); reg(sub, end);
    }
    function mLead(t, midi, len, fromMidi) {
      const f = hz(midi), g = G(0), lp = F('lowpass', 2600, 1);
      glide(lp.frequency, t, 3800, 1500, Math.min(0.25, len));
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.19, t + 0.02); g.gain.setTargetAtTime(0.14, t + 0.02, 0.15);
      g.gain.setTargetAtTime(0, t + len - 0.03, 0.03);
      for (let i = -1; i <= 1; i += 2) {
        const o = O('sawtooth', f); o.detune.value = 6 * i;
        if (fromMidi) glide(o.frequency, t, hz(fromMidi), f, 0.05);
        o.connect(lp); o.start(t); o.stop(t + len + 0.15); reg(o, t + len + 0.15);
      }
      lp.connect(g); g.connect(leadG);
    }
    function mRiser(t, dur) {
      const n = ctx.createBufferSource(); n.buffer = bufWhite; n.loop = true;
      const bp = F('bandpass', 400, 2.5), g = G(0);
      glide(bp.frequency, t, 350, 3800, dur);
      g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur); g.gain.setTargetAtTime(0, t + dur, 0.03);
      n.connect(bp); bp.connect(g); g.connect(riserG); n.start(t, 0.2); n.stop(t + dur + 0.2); reg(n, t + dur + 0.2);
      const o = O('sine', 110), og = G(0); glide(o.frequency, t, 110, 440, dur);
      og.gain.setValueAtTime(0.001, t); og.gain.exponentialRampToValueAtTime(0.12, t + dur); og.gain.setTargetAtTime(0, t + dur, 0.03);
      o.connect(og); og.connect(riserG); o.start(t); o.stop(t + dur + 0.2); reg(o, t + dur + 0.2);
    }

    // -- sequencer: one 16th step
    function scheduleStep(bar, step, t) {
      const b = bar % 32, phrase = Math.floor(b / 8), inPhrase = b % 8;
      if (step === 0 && inPhrase === 0) {                 // phrase start: apply pending boss switch
        if (music.bossCur !== music.boss) {
          music.bossCur = music.boss;
          padLP.frequency.setTargetAtTime(music.bossCur ? 650 : 1100, t, 1.0);
        }
        if (music.bossCur) mRiser(t, 8 * BAR - 0.05);
        riserG.gain.setTargetAtTime(music.bossCur ? 1 : 0, t, 0.3);
      }
      const boss = music.bossCur, tr = boss ? -3 : 0;
      const prog = boss ? PROG_BOSS : phrase < 2 ? PROG_A : PROG_B;
      const ch = CHORDS[prog[Math.floor(inPhrase / 2)]];
      const tgt = music.tgt;

      // pad: one chord per two bars
      if (step === 0 && inPhrase % 2 === 0) mPad(t, ch.pad.map(function (n) { return n + tr; }), 2 * BAR, boss);

      // bass
      if (tgt.bass > 0.02) {
        const pat = boss ? BASS_BOSS : phrase < 2 ? BASS_A : BASS_B, off = pat[step];
        if (off >= 0) {
          let len = STEP * 0.95;
          for (let q = step + 1; q < 16 && pat[q] < 0; q++) len += STEP;
          mBass(t, ch.r + off + tr, boss ? Math.min(len, 1.2) : Math.min(len, 0.5));
        }
      }
      // arp
      if (tgt.arp > 0.02) {
        const pat = boss ? ARP_BOSS : phrase < 2 ? ARP_A : ARP_B, idx = pat[step];
        if (idx >= 0) {
          const up = (!boss && phrase >= 2) ? 12 : 0, acc = step % 4 === 0 ? 1 : step % 2 === 0 ? 0.7 : 0.5;
          mArp(t, ch.arp[idx] + up + tr, acc);
        }
      }
      // drums
      if (tgt.drums > 0.02) {
        const fill = inPhrase === 7 && step >= 12;
        if (boss) {                                             // half-time
          if (step === 0 || (step === 10 && inPhrase % 2 === 1)) mKick(t, 1);
          if (step === 8 || fill) mSnare(t, fill ? 0.5 + 0.12 * (step - 12) : 0.9);
          if (step % 2 === 0 && !fill) mHat(t, step % 8 === 0 ? 0.6 : 0.35, step === 14 && inPhrase % 4 === 3);
        } else {
          if (step % 4 === 0 || (step === 14 && inPhrase % 2 === 1)) mKick(t, step % 4 === 0 ? 1 : 0.7);
          if (step === 4 || step === 12) mSnare(t, 0.9);
          if (fill) mSnare(t, 0.45 + 0.14 * (step - 12));
          else mHat(t, step % 4 === 0 ? 0.7 : step % 2 === 0 ? 0.5 : 0.28, step === 14 && inPhrase % 4 === 3);
        }
      }
      // lead: alternate phrases
      if (tgt.lead > 0.02 && phrase % 2 === 1) {
        const motif = phrase === 1 ? LEAD_1 : LEAD_2, notes = motif[inPhrase];
        for (let i = 0; i < notes.length; i++) {
          if (notes[i][0] !== step) continue;
          const midi = notes[i][1] + tr;
          mLead(t, midi, notes[i][2] * STEP, music.lastLead);
          music.lastLead = midi;
        }
      }
    }

    function scheduleUntil(limit) {
      // music
      if (music.on) {
        let guardN = 0;
        while (music.nextT < limit && guardN++ < 400) {
          scheduleStep(music.bar, music.step, music.nextT);
          music.nextT += STEP;
          if (++music.step === 16) { music.step = 0; music.bar++; }
        }
      }
      // alarm beeps: slowly rising urgency
      if (alarmOn) {
        let guardN = 0;
        while (nextBeep < limit && guardN++ < 50) {
          const n = Math.min(beepCount, 12);
          const def = SFX.alarm, saved = def.lvl;
          def.lvl = saved * (0.7 + 0.3 * n / 12);
          const S = acquire(uiPool, 'alarm', def, nextBeep);
          def.lvl = saved;
          if (S) {
            S.in.gain.setValueAtTime(saved * (0.7 + 0.3 * n / 12), nextBeep);
            S.rev.gain.setValueAtTime(def.rev, nextBeep); S.dly.gain.setValueAtTime(0, nextBeep);
            if (S.pan) S.pan.pan.setValueAtTime(0, nextBeep);
            def.fn(S, nextBeep, { r: 1 + 0.018 * n, v: 0, x: 0 });
          }
          beepCount++;
          nextBeep += ALARM_PERIOD - 0.012 * n;
        }
      }
      // prune finished music sources
      const now = ctx.currentTime;
      if (mSrc.length > 600) { let w = 0; for (let i = 0; i < mSrc.length; i++) if (mSrc[i].end > now) mSrc[w++] = mSrc[i]; mSrc.length = w; }
    }

    function startMusic(at) {
      const t = at != null ? at : ctx.currentTime + 0.05;
      if (music.on) return;
      music.on = true; music.bar = 0; music.step = 0; music.nextT = t; music.lastLead = 0;
      music.bossCur = false;
      padLP.frequency.setTargetAtTime(1100, t, 0.5);
      hold(musicBus.gain, t); musicBus.gain.setValueAtTime(0, t); musicBus.gain.linearRampToValueAtTime(LVL.music * musicVol, t + 0.6);
      applyIntensity(t);
    }
    function stopMusic(at) {
      if (!music.on) return;
      music.on = false;
      const t = at != null ? at : ctx.currentTime;
      hold(musicBus.gain, t); musicBus.gain.linearRampToValueAtTime(0, t + 0.45);
      for (let i = 0; i < mSrc.length; i++) { try { mSrc[i].n.stop(t + 0.5); } catch (e) { /* done */ } }
      mSrc.length = 0;
    }

    // ------------------------------------------------------- real-time tick
    let timer = null;
    function tick() {
      try {
        if (ctx.state !== 'running') return;
        scheduleUntil(ctx.currentTime + AHEAD);
      } catch (e) { /* never let the timer die noisily */ }
      if (!music.on && !alarmOn && timer) { clearInterval(timer); timer = null; }
    }
    function ensureTimer() { if (!offline && !timer) timer = setInterval(tick, TICK_MS); }

    return {
      ctx: ctx,
      masterGain: masterGain,
      play: playAt,
      setEngine: setEngine, stopEngine: stopEngine,
      setWind: setWind, setCharging: setCharging, setWeaponCharge: setWeaponCharge,
      setLowHeat: function (on, at) { setLowHeat(on, at); if (alarmOn) ensureTimer(); },
      startMusic: function (at) { startMusic(at); ensureTimer(); },
      stopMusic: stopMusic,
      setIntensity: setIntensity, setBossMode: setBossMode,
      scheduleUntil: scheduleUntil,
      tick: tick,
      musicBus: musicBus, sfxBus: sfxBus, uiBus: uiBus, loopBus: loopBus, musicOn: function () { return music.on; }
    };
  }

  // ============================================================ PUBLIC API ==
  function init() {
    if (failed) return;
    if (!live) {
      if (!AC) { failed = true; return; }
      let created = null;
      try {
        created = new AC();
        live = createRig(created, false);
      } catch (err) {
        failed = true; live = null;
        try { if (created && created.close) quiet(created.close()); } catch (e2) { /* ignore */ }
        return;
      }
    }
    // Autoplay policy: wake a suspended/interrupted context from the gesture.
    const c = live.ctx;
    if (!paused && c.state !== 'running' && c.state !== 'closed' && c.resume) quiet(c.resume());
  }
  function pause() {
    if (!live) return;
    paused = true;
    const c = live.ctx;
    if (c.state !== 'closed' && c.suspend) quiet(c.suspend());
  }
  function resume() {
    if (!live) return;
    paused = false;
    const c = live.ctx;
    if (c.state !== 'closed' && c.resume) quiet(c.resume());
  }
  function setMusicLevel(v) {
    musicVol = Math.max(0, Math.min(1, +v || 0));
    if (live && live.musicOn()) live.musicBus.gain.setTargetAtTime(LVL.music * musicVol, live.ctx.currentTime, 0.05);
  }
  function setSfxLevel(v) {
    sfxVol = Math.max(0, Math.min(1, +v || 0));
    if (!live) return;
    const t = live.ctx.currentTime;
    live.sfxBus.gain.setTargetAtTime(LVL.sfx * sfxVol, t, 0.05);
    live.uiBus.gain.setTargetAtTime(LVL.ui * sfxVol, t, 0.05);
    live.loopBus.gain.setTargetAtTime(LVL.loops * sfxVol, t, 0.05);
  }
  function setMuted(flag) {
    muted = !!flag;
    if (!live) return;
    live.masterGain.gain.setTargetAtTime(muted ? 0 : LVL.master, live.ctx.currentTime, 0.02);
  }
  function canPlayOneShot() {
    if (!live || paused) return false;
    const c = live.ctx;
    if (c.state === 'running') { startupQueued = 0; return true; }
    if (c.state === 'closed') return false;
    // A context that already ran and is now suspended by the system: skip,
    // otherwise everything queued would fire at once on resume.
    if (c.currentTime > 0) return false;
    // Brand-new context: reports 'suspended' for a moment even inside a gesture.
    return ++startupQueued <= 8;
  }
  function play(name, opts) {
    if (typeof name !== 'string') return;
    if (name === 'chargeFull' || name === 'alarm') return;   // internal
    if (!canPlayOneShot()) return;
    live.play(name, opts);
  }
  function setEngine(v) { if (live) live.setEngine(v); }
  function stopEngine() { if (live) live.stopEngine(); }
  function setWind(v) { if (live) live.setWind(v); }
  function setCharging(f) { if (live) live.setCharging(f); }
  function setWeaponCharge(v) { if (live) live.setWeaponCharge(v); }
  function setLowHeat(f) { if (live) live.setLowHeat(f); }
  function startMusic() { if (live) live.startMusic(); }
  function stopMusic() { if (live) live.stopMusic(); }
  function setIntensity(v) { if (live) live.setIntensity(v); }
  function setBossMode(f) { if (live) live.setBossMode(f); }

  // Private test hook: renders a sound/scene through a complete rig on an
  // OfflineAudioContext and resolves with the AudioBuffer. Never used by the game.
  function renderOffline(name, seconds, opts) {
    opts = opts || {};
    const OAC = hasWindow ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null;
    if (!OAC) return Promise.reject(new Error('no OfflineAudioContext'));
    const sr = opts.sampleRate || 48000, secs = Math.max(0.5, +seconds || 2);
    const octx = new OAC(2, Math.ceil(sr * secs), sr);
    const savedMute = muted; muted = false;
    const r = createRig(octx, true);
    muted = savedMute;
    const T0 = 0.05;
    const scripts = {
      music: function () { r.startMusic(T0); r.setIntensity(opts.intensity != null ? opts.intensity : 0.6, T0); if (opts.boss) r.setBossMode(true); r.scheduleUntil(secs + 0.5); },
      stress: function () {
        r.startMusic(T0); r.setIntensity(0.8, T0); r.scheduleUntil(secs + 0.5);
        r.setEngine(0.8, T0);
        for (let i = 0; i < 50; i++) r.play(i % 3 ? 'shoot' : 'shoot2', { x: 60 + (i * 37) % 240 }, 0.2 + i * 0.1);
        for (let i = 0; i < 12; i++) r.play('hit', { x: (i * 97) % 360 }, 0.35 + i * 0.4);
        r.play('explode', { x: 90 }, 1.0); r.play('bigExplode', { x: 270 }, 2.5); r.play('explode', { x: 180 }, 4.0);
      },
      engine: function () { r.setEngine(0, T0); r.setEngine(0.5, 1.0); r.setEngine(1, 2.0); r.setEngine(0.2, 3.5); },
      wind: function () { r.setWind(1, T0); },
      charging: function () { r.setCharging(true, T0); },
      weaponCharge: function () { for (let i = 0; i <= 20; i++) r.setWeaponCharge(i / 20, T0 + i * 0.06); r.setWeaponCharge(0, T0 + 1.6); },
      lowHeat: function () { r.setLowHeat(true, T0); r.scheduleUntil(secs + 0.5); }
    };
    if (scripts[name]) scripts[name]();
    else r.play(name, opts, T0);
    return octx.startRendering();
  }

  function guard(fn) {
    return function (a, b) {
      try { return fn(a, b); } catch (err) { /* audio must never break the game */ return undefined; }
    };
  }

  const api = {
    init: guard(init),
    pause: guard(pause),
    resume: guard(resume),
    play: guard(play),
    setMuted: guard(setMuted),
    isMuted: function () { return muted; },
    setEngine: guard(setEngine),
    stopEngine: guard(stopEngine),
    setWind: guard(setWind),
    setCharging: guard(setCharging),
    setLowHeat: guard(setLowHeat),
    setWeaponCharge: guard(setWeaponCharge),
    startMusic: guard(startMusic),
    stopMusic: guard(stopMusic),
    setIntensity: guard(setIntensity),
    setBossMode: guard(setBossMode),
    setMusicLevel: guard(setMusicLevel),
    setSfxLevel: guard(setSfxLevel),
    _renderOffline: function (name, seconds, opts) {
      try { return renderOffline(name, seconds, opts); } catch (err) { return Promise.reject(err); }
    }
  };
  if (hasWindow) window.GameAudio = api;
})();
