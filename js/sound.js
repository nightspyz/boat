// All sound, synthesized with the Web Audio API.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Sound =====
// Every sound in the game is synthesized here with the Web Audio API: no audio files, works offline.
// Browsers block sound until the player interacts, so it starts on the first key press or tap.
// M (or the 🔊 button on phones) turns it on and off; the setting is saved.
const SOUND_KEY = "coastline-sound-v1";
const sound = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const LEVELS = { ambience: 0.5, effects: 0.5, music: 0.16 };
  const vol = { master: 1, ambience: 1, effects: 1, music: 1 }; // the player's volume settings (menu.js)
  let ac = null;
  let master, bus, echo, noiseBuf, brownBuf;
  let muted = false;
  try {
    muted = localStorage.getItem(SOUND_KEY) === "off";
  } catch (e) {}
  const L = {}; // looping voices
  const timers = { gull: 3, seal: 5, frog: 2, ferry: 10, fog: 4, sonar: 0, splutter: 0, bar: 0 };
  let rpm = 0;
  let lastFuel = 1;
  let lastHour = -1;
  let planeDist = 0;
  const music = { next: 0, bar: 0, mood: "" };

  // --- Building blocks ---
  const now = () => ac.currentTime;
  const set = (param, v, tc = 0.12) => param.setTargetAtTime(v, now(), tc);
  const gain = (v = 1) => {
    const g = ac.createGain();
    g.gain.value = v;
    return g;
  };
  const filter = (type, f, q = 0.7) => {
    const n = ac.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    return n;
  };
  const panner = () => {
    if (ac.createStereoPanner) return ac.createStereoPanner();
    const g = gain(1); // very old browsers: no panning
    g.pan = { value: 0, setTargetAtTime() {} };
    return g;
  };
  const chain = (...nodes) => {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  };
  const osc = (type, f) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    return o;
  };
  const noise = (buf = noiseBuf) => {
    const s = ac.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0, Math.random() * 2);
    return s;
  };
  // A looping voice: sources → (filters) → gain → pan → bus
  function voice(name, dest, sources, filters = []) {
    const g = gain(0);
    const p = panner();
    const head = filters.length ? filters[0] : g;
    for (const s of sources) s.connect(head);
    if (filters.length) chain(...filters, g);
    chain(g, p, dest);
    L[name] = { g, p, sources, filters };
    return L[name];
  }

  // Loudness and left/right for something at (x, y, z), heard from the camera
  function place(x, z, range, y = camera.position.y) {
    const c = camera.position;
    const dx = x - c.x;
    const dy = y - c.y;
    const dz = z - c.z;
    const d = Math.hypot(dx, dy, dz);
    const near = Math.max(0, 1 - d / range);
    const e = camera.matrixWorld.elements; // camera's right vector is the first column
    const rx = e[0];
    const rz = e[2];
    const flat = Math.hypot(dx, dz) || 1;
    return { d, g: near * near, pan: clamp(((dx * rx + dz * rz) / flat) * 0.8, -0.8, 0.8) };
  }
  function aim(v, level, where, tc = 0.15) {
    set(v.g.gain, level, tc);
    if (where) set(v.p.pan, where.pan, 0.2);
  }

  // One-shot tone with an envelope
  function tone({ type = "sine", f, f2, at = 0, dur = 0.5, vol = 0.2, attack = 0.005, dest = bus.effects, pan = 0, curve }) {
    const t = now() + at;
    const o = osc(type, f);
    if (curve) o.frequency.setValueCurveAtTime(new Float32Array(curve), t, dur);
    else if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = panner();
    p.pan.value = pan;
    chain(o, g, p, dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  // One-shot burst of filtered noise
  function burst({ type = "bandpass", f = 1000, f2, q = 0.7, at = 0, dur = 0.3, vol = 0.2, attack = 0.005, dest = bus.effects, pan = 0 }) {
    const t = now() + at;
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const fl = filter(type, f, q);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = panner();
    p.pan.value = pan;
    chain(s, fl, g, p, dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }
  // A bell: a few inharmonic partials that ring out at different rates
  function bell(f, at, vol, dest, pan = 0, ring = 4) {
    const partials = [
      [0.5, 1, 1],
      [1, 0.8, 0.8],
      [1.19, 0.5, 0.6],
      [1.5, 0.4, 0.5],
      [2, 0.35, 0.4],
      [2.74, 0.2, 0.25],
      [3.76, 0.12, 0.15],
    ];
    for (const [ratio, amp, len] of partials) tone({ f: f * ratio, at, dur: ring * len, vol: vol * amp, attack: 0.003, dest, pan });
  }
  // A horn: two buzzy notes, softened
  function horn(f1, f2, len, vol, where, at = 0) {
    const t = now() + at;
    const lp = filter("lowpass", 520, 1);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.25);
    g.gain.setValueAtTime(vol, t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.9);
    const p = panner();
    p.pan.value = where.pan;
    chain(lp, g, p, bus.effects);
    for (const f of [f1, f2]) {
      const o = osc("sawtooth", f);
      o.frequency.setValueAtTime(f, t + len);
      o.frequency.linearRampToValueAtTime(f * 0.94, t + len + 0.9);
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 1);
    }
  }

  // --- Start: build the mixer and the looping voices (on the first key press or tap) ---
  function start() {
    if (!AC) return;
    if (ac) {
      if (ac.state === "suspended") ac.resume();
      return;
    }
    ac = new AC();
    if (ac.state === "suspended") ac.resume();

    // White noise, the raw material for sea, wind, rain, splashes and thunder
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // Brown noise: deep and soft, like distant water (no hiss)
    brownBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const bd = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = gain(muted ? 0 : 0.8 * vol.master);
    chain(master, comp, ac.destination);
    bus = {};
    for (const k in LEVELS) chain((bus[k] = gain(LEVELS[k] * vol[k])), master);
    // A soft echo for music, bells, horns and sonar
    echo = ac.createDelay(1);
    echo.delayTime.value = 0.36;
    const fb = gain(0.32);
    const wet = gain(0.5);
    chain(echo, filter("lowpass", 2400), fb, echo);
    chain(echo, wet, master);
    bus.music.connect(echo);
    const fxEcho = gain(0.25);
    chain(bus.effects, fxEcho, echo);

    // Open sea: a soft low roar plus a gentle wash that rises and falls with the swell
    voice("sea", bus.ambience, [noise(brownBuf)], [filter("lowpass", 420)]);
    voice("wash", bus.ambience, [noise(brownBuf)], [filter("lowpass", 500, 0.5)]);
    // Waves breaking on the nearest shore: each crash swells up and fades away
    voice("surf", bus.ambience, [noise(brownBuf)], [filter("lowpass", 500, 0.5)]);
    // Wind, and a faint whistle in storms
    voice("wind", bus.ambience, [noise(brownBuf)], [filter("bandpass", 450, 0.8)]);
    voice("whistle", bus.ambience, [noise()], [filter("bandpass", 1000, 9)]);
    // Rain: a soft "shhh" (no high hiss), plus droplets added in update()
    voice("rain", bus.ambience, [noise()], [filter("highpass", 400, 0.5), filter("lowpass", 2600, 0.5)]);
    // The waterfall in Hidden Cove
    voice("falls", bus.ambience, [noise()], [filter("bandpass", 900, 0.6), filter("lowpass", 2500)]);
    // Water rushing past the hull
    voice("hull", bus.effects, [noise(brownBuf)], [filter("bandpass", 500, 0.7)]);

    // Engine: two buzzy oscillators through a lowpass, chugging via a tremolo
    const e1 = osc("sawtooth", 40);
    const e2 = osc("square", 20);
    const e2g = gain(0.5);
    e2.connect(e2g);
    const trem = gain(0.7);
    const lfo = osc("sine", 10);
    const lfoAmt = gain(0.3);
    chain(lfo, lfoAmt, trem.gain);
    const eng = voice("engine", bus.effects, [e1, e2g], [filter("lowpass", 420, 1), trem]);
    eng.oscs = [e1, e2];
    eng.lfo = lfo;
    e1.start();
    e2.start();
    lfo.start();

    // Tanker: a deep drone
    const t1 = osc("sine", 41);
    const t2 = osc("triangle", 61.5);
    voice("tanker", bus.ambience, [t1, t2], [filter("lowpass", 180)]);
    t1.start();
    t2.start();
    // Coast guard siren
    const sir = osc("triangle", 720);
    voice("siren", bus.effects, [sir], [filter("lowpass", 1800)]).osc = sir;
    sir.start();
    // Sightseeing plane: a propeller buzz
    const pl = osc("sawtooth", 82);
    voice("plane", bus.effects, [pl], [filter("lowpass", 650, 1.5)]).osc = pl;
    pl.start();
    // Airliner: distant roar
    voice("jet", bus.ambience, [noise()], [filter("lowpass", 260)]);
    // Swamp insects, buzzing
    const ins = gain(0.6);
    const insLfo = osc("sine", 17);
    const insAmt = gain(0.4);
    chain(insLfo, insAmt, ins.gain);
    insLfo.start();
    voice("insects", bus.ambience, [noise()], [filter("bandpass", 4800, 6), ins]);
    // The strange light: a low, slowly beating hum
    const g1 = osc("sine", 55);
    const g2 = osc("sine", 55.6);
    const g3 = osc("sine", 164.3);
    const g3g = gain(0.3);
    g3.connect(g3g);
    voice("glow", bus.effects, [g1, g2, g3g]);
    g1.start();
    g2.start();
    g3.start();

    music.next = now() + 1;
  }

  // --- One-shot sounds the game triggers ---
  function shutter() {
    if (!ac) return;
    burst({ type: "bandpass", f: 2500, dur: 0.03, vol: 0.18 });
    burst({ type: "lowpass", f: 500, dur: 0.05, vol: 0.18 });
    burst({ type: "bandpass", f: 2000, at: 0.08, dur: 0.035, vol: 0.14 });
  }
  function chime(kind) {
    if (!ac) return;
    const notes = {
      discovery: [[1318.5, 0], [1975.5, 0.12]],
      photo: [[1568, 0], [2093, 0.09]],
      goal: [[523.3, 0], [659.3, 0.11], [784, 0.22], [1046.5, 0.33]],
      relic: [[392, 0], [587.3, 0.14], [784, 0.28], [1174.7, 0.42]],
      mystery: [[220, 0], [261.6, 0.3], [329.6, 0.6], [415.3, 0.9], [493.9, 1.2]],
      buy: [[987.8, 0], [1318.5, 0.08]],
      deny: [[330, 0], [262, 0.12]],
    }[kind] || [[880, 0]];
    for (const [f, at] of notes) {
      tone({ f, at, dur: kind === "mystery" ? 3 : 1.2, vol: 0.07, attack: 0.004 });
      tone({ type: "triangle", f: f * 2, at, dur: 0.5, vol: 0.015 });
    }
  }
  function ping(dist) {
    if (!ac) return;
    const vol = 0.07 * (0.4 + 0.6 * (1 - dist / SONAR_RANGE));
    tone({ f: 1480, dur: 1.4, vol, attack: 0.002 });
    tone({ f: 1480, at: 0.15 + dist / 750, dur: 0.6, vol: vol * 0.3 }); // the return
  }
  function dive() {
    if (!ac) return;
    burst({ type: "lowpass", f: 900, f2: 250, dur: 1.4, vol: 0.18, attack: 0.05 });
    for (let i = 0; i < 26; i++) {
      const f = rand(300, 900);
      tone({ f, f2: f * rand(1.6, 2.4), at: rand(0, 1.3), dur: rand(0.04, 0.09), vol: rand(0.02, 0.045) });
    }
  }
  function thunder(dist) {
    if (!ac) return;
    const at = dist / 343; // sound arrives after the flash
    const close = clamp(1 - (dist - 250) / 450, 0, 1);
    const vol = 0.18 + 0.22 * close;
    if (close > 0.5) burst({ type: "bandpass", f: 1500, at, dur: 0.25, vol: vol * 0.35 });
    burst({ type: "lowpass", f: 400 + 900 * close, f2: 120, at, dur: 5 + 2 * Math.random(), vol, attack: 0.04, dest: bus.ambience });
    for (let i = 0; i < 4; i++) burst({ type: "lowpass", f: 260, at: at + rand(0.3, 3), dur: rand(1, 2.2), vol: vol * rand(0.3, 0.7), attack: 0.2, dest: bus.ambience });
  }
  function splashAt(x, z, power) {
    if (!ac) return;
    const w = place(x, z, 160);
    if (w.g < 0.01) return;
    burst({ type: "lowpass", f: 1100, f2: 400, q: 0.6, dur: 0.25 + power * 0.08, vol: 0.22 * w.g * Math.min(1, power / 3), pan: w.pan });
    // Dolphins whistle now and then
    if (power >= 3 && Math.random() < 0.3)
      tone({ f: 5200, at: 0.3, dur: 0.45, vol: 0.025 * w.g, pan: w.pan, curve: [5200, 7800, 9200, 7000, 8400] });
  }
  // A whale breathing out: a deep whoosh, and now and then a low moan from under the water
  function blow(x, z) {
    if (!ac) return;
    const w = place(x, z, 400);
    if (w.g < 0.005) return;
    burst({ type: "lowpass", f: 900, f2: 200, dur: 1.6, vol: 0.3 * w.g, attack: 0.08, pan: w.pan, dest: bus.ambience });
    if (Math.random() < 0.4)
      tone({ type: "sine", f: 180, at: 1.8, dur: 2.6, vol: 0.06 * w.g, attack: 0.6, pan: w.pan, curve: [180, 240, 210, 140], dest: bus.ambience });
  }
  function engineDies() {
    if (!ac) return;
    for (let i = 0; i < 3; i++) burst({ type: "lowpass", f: 300, at: i * 0.22, dur: 0.18, vol: 0.14 - i * 0.03 });
  }
  function gull(w) {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = i * rand(0.28, 0.4);
      tone({ type: "sawtooth", f: 1300, at, dur: 0.3, vol: 0.015 * w.g, pan: w.pan, curve: [1300, 2100, 1900, 1400] });
      tone({ f: 1300, at, dur: 0.3, vol: 0.035 * w.g, pan: w.pan, curve: [1300, 2100, 1900, 1400] });
    }
  }
  function seal(w) {
    for (let i = 0; i < 3; i++) {
      const t = now() + i * rand(0.3, 0.45);
      const o = osc("sawtooth", 280);
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(190, t + 0.18);
      const lp = filter("lowpass", 900, 3);
      const g = gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07 * w.g, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      const p = panner();
      p.pan.value = w.pan;
      chain(o, lp, g, p, bus.effects);
      o.start(t);
      o.stop(t + 0.25);
    }
  }
  function frog(w) {
    const t = now();
    const f = rand(130, 190);
    const o = osc("sine", f);
    const am = gain(0);
    const lfo = osc("square", rand(22, 32));
    const amt = gain(0.5);
    chain(lfo, amt, am.gain);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * w.g, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    const p = panner();
    p.pan.value = w.pan + rand(-0.2, 0.2);
    chain(o, am, g, p, bus.ambience);
    for (const n of [o, lfo]) {
      n.start(t);
      n.stop(t + 0.35);
    }
  }

  // --- Music: slow chords whose mood follows the time of day and the weather ---
  const MOODS = {
    day: { len: 4, cut: 1600, vol: 1, chords: [[48, 55, 64, 67], [43, 55, 62, 71], [45, 57, 64, 72], [41, 57, 65, 69]], scale: [72, 74, 76, 79, 81, 84] },
    sunset: { len: 5, cut: 1300, vol: 0.9, chords: [[41, 57, 64, 69], [40, 55, 62, 71], [38, 57, 64, 69], [36, 55, 64, 71]], scale: [69, 71, 72, 76, 79, 81] },
    night: { len: 6, cut: 900, vol: 0.7, chords: [[45, 57, 60, 64], [41, 57, 60, 64], [40, 55, 59, 64], [38, 57, 60, 65]], scale: [69, 72, 76, 81] },
    storm: { len: 5, cut: 650, vol: 0.8, chords: [[38, 50, 57, 62], [34, 50, 58, 65], [31, 50, 55, 62], [33, 49, 57, 64]], scale: [62, 65, 69] },
  };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function playBar(mood, t0) {
    const m = MOODS[mood];
    const chord = m.chords[music.bar % m.chords.length];
    music.bar++;
    const len = m.len;
    const lp = filter("lowpass", m.cut, 0.5);
    lp.connect(bus.music);
    for (const n of chord) {
      for (const det of [-4, 4]) {
        const o = osc("triangle", hz(n));
        o.detune.value = det;
        const g = gain(0);
        const v = (n < 50 ? 0.07 : 0.045) * m.vol;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(v, t0 + len * 0.35);
        g.gain.setValueAtTime(v, t0 + len * 0.7);
        g.gain.linearRampToValueAtTime(0, t0 + len + 1.5);
        chain(o, g, lp);
        o.start(t0);
        o.stop(t0 + len + 1.6);
      }
    }
    // A few soft melody notes on top
    const beats = mood === "night" ? 3 : 4;
    for (let i = 0; i < beats; i++) {
      if (Math.random() > (mood === "storm" ? 0.25 : 0.55)) continue;
      const n = m.scale[Math.floor(Math.random() * m.scale.length)];
      const at = t0 + (i * len) / beats - now();
      tone({ f: hz(n), at, dur: 1.6, vol: 0.05 * m.vol, attack: 0.01, dest: bus.music });
    }
  }

  // --- Every frame: follow the game ---
  function update(dt, env) {
    if (!ac) return;
    const running = state.phase === "running";
    set(master.gain, muted ? 0 : state.paused ? 0.25 : 0.8, 0.2);
    if (muted) return;
    const b = state.boat;
    const t = waveTime;
    const sunY = shared.uSunDir.value.y;
    const night = 1 - smooth(-0.12, 0.15, sunY);
    const fast = keys.has("KeyT") && running;

    // Sea, with the swell
    const swell = 0.55 + 0.45 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1);
    aim(L.sea, 0.07 + 0.06 * waveScale, null, 0.5);
    aim(L.wash, (0.03 + 0.05 * waveScale) * swell, null, 0.5);
    set(L.wash.filters[0].frequency, 300 + 400 * swell, 0.5);

    // Waves breaking on the nearest shore (main coast or an island)
    let shoreD = b.z - shoreZAt(b.x);
    let sx = b.x;
    let sz = shoreZAt(b.x);
    for (const I of ISLANDS) {
      const d = Math.hypot(b.x - I.x, b.z - I.z) - I.R;
      if (d < shoreD) {
        shoreD = d;
        sx = I.x;
        sz = I.z;
      }
    }
    // In time with the breakers you can see: a crash as each one topples, then the wash fading out
    const ph = t * 0.7 + 40 * 0.12 + Math.sin(b.x * 0.02 + t * 0.3) * 1.5;
    const u = (((ph - 0.17) / (2 * Math.PI)) % 1 + 1) % 1;
    const crash = smooth(0.9, 1, u) + Math.exp(-u * 4) * (u < 0.9 ? 1 : 0);
    const near = Math.exp(-Math.max(0, shoreD) / 90);
    aim(L.surf, near * (0.04 + 0.05 * waveScale) * (0.25 + 0.75 * crash), place(sx, sz, 1e9), 0.25);
    set(L.surf.filters[0].frequency, 300 + 900 * crash, 0.25);

    // Wind gusts, rain
    const gust = noise1(t * 0.25) * 0.8 + 0.2;
    const ws = weather.windSpeed;
    aim(L.wind, (0.012 + 0.004 * ws) * (0.5 + gust), null, 0.6);
    set(L.wind.filters[0].frequency, 250 + 15 * ws + 200 * gust, 0.6);
    aim(L.whistle, 0.03 * wx.storm * gust, null, 0.6);
    aim(L.rain, 0.07 * wx.rain, null, 0.5);
    // Raindrops pattering on the water and the boat
    const drops = Math.min(3, Math.floor(wx.rain * 30 * dt + Math.random()));
    for (let i = 0; i < drops; i++) {
      const f = rand(1400, 3200);
      if (Math.random() < 0.5) tone({ f, f2: f * 1.5, dur: rand(0.03, 0.06), vol: rand(0.004, 0.012), pan: rand(-0.7, 0.7), dest: bus.ambience });
      else tone({ f: f * 0.3, f2: f * 0.55, dur: 0.05, vol: rand(0.004, 0.01), pan: rand(-0.7, 0.7), dest: bus.ambience });
    }

    // Engine: pitch and loudness follow throttle and speed; it splutters on an almost empty tank
    const fuelFrac = expedition.fuel / expedition.fuelMax;
    const engineOn = running && expedition.fuel > 0;
    const target = engineOn ? Math.abs(b.throttle) * 0.7 + (Math.abs(b.speed) / MAX_FORWARD) * 0.3 : 0;
    rpm += (target - rpm) * Math.min(1, dt * 2.5);
    const f = 34 + 52 * rpm;
    set(L.engine.oscs[0].frequency, f, 0.08);
    set(L.engine.oscs[1].frequency, f / 2, 0.08);
    set(L.engine.lfo.frequency, f / 3.5, 0.08);
    set(L.engine.filters[0].frequency, 380 + 700 * rpm, 0.1);
    let engVol = engineOn ? 0.04 + 0.07 * rpm : 0;
    timers.splutter -= dt;
    if (engineOn && fuelFrac < 0.12 && rpm > 0.15 && timers.splutter <= 0 && Math.random() < dt * 2.5) timers.splutter = rand(0.08, 0.25);
    if (timers.splutter > 0) engVol *= 0.1;
    aim(L.engine, engVol, null, 0.03);
    if (running && lastFuel > 0 && expedition.fuel <= 0) engineDies();
    lastFuel = expedition.fuel;
    aim(L.hull, running ? 0.08 * Math.min(1, Math.abs(b.speed) / MAX_FORWARD) : 0);

    // Traffic
    for (const v of vessels) {
      if (v.type === "tanker") {
        const w = place(v.x, v.z, 1300);
        aim(L.tanker, 0.2 * w.g, w);
      } else if (v.type === "coastguard") {
        const w = place(v.x, v.z, 450);
        aim(L.siren, 0.02 * w.g, w);
        set(L.siren.osc.frequency, Math.floor(t / 0.7) % 2 ? 960 : 720, 0.03);
      } else if (v.type === "ferry") {
        const w = place(v.x, v.z, 1100);
        timers.ferry -= dt;
        if (w.g > 0.02 && timers.ferry <= 0) {
          timers.ferry = rand(35, 70);
          horn(131, 165, 1.6, 0.09 * Math.sqrt(w.g), w);
        }
      }
    }
    // Sightseeing plane, with a Doppler shift as it passes
    const sp = smallPlane.group.position;
    const pw = place(sp.x, sp.z, 900, sp.y);
    const closing = (pw.d - planeDist) / Math.max(dt, 1e-3);
    planeDist = pw.d;
    aim(L.plane, smallPlane.group.visible ? 0.03 * pw.g : 0, pw);
    set(L.plane.osc.frequency, (82 * 343) / (343 + clamp(closing, -60, 60)), 0.1);
    // Airliner, high up
    const ap = airplane.group.position;
    const jw = place(ap.x, ap.z, 2600, ap.y);
    aim(L.jet, flight.active ? 0.12 * jw.g : 0, jw, 0.5);

    // Wildlife
    timers.gull -= dt;
    if (timers.gull <= 0) {
      timers.gull = rand(2, 7);
      const w = place(flock.x, flock.z, 300);
      if (env.light > 0.3 && w.g > 0.02) gull(w);
    }
    timers.seal -= dt;
    if (timers.seal <= 0) {
      timers.seal = rand(4, 10);
      const w = place(ISLAND.seal.x, ISLAND.seal.z, 320);
      if (w.g > 0.02) seal(w);
    }
    // Swamp: insects all day, frogs from dusk
    const sw = place(SWAMP.x, SWAMP.z, 750);
    aim(L.insects, 0.025 * sw.g * (0.4 + 0.6 * night) * (1 - wx.rain), sw);
    timers.frog -= dt;
    if (timers.frog <= 0) {
      timers.frog = rand(0.3, 1.5);
      if (night > 0.3 && sw.g > 0.02) frog(sw);
    }

    // Places: the lighthouse foghorn in bad weather, the town bell on the hour
    timers.fog -= dt;
    if (timers.fog <= 0) {
      timers.fog = 28;
      const lp = lighthouse.group.position;
      const w = place(lp.x, lp.z, 2600);
      if ((wx.rain > 0.45 || wx.fog > 0.4) && w.g > 0.01) horn(98, 147, 2.4, 0.11 * Math.sqrt(w.g), w);
    }
    const hour = Math.floor(state.timeOfDay);
    if (lastHour >= 0 && hour !== lastHour && !fast && hour >= 7 && hour <= 21) {
      const w = place(TOWN_CENTER.x, TOWN_CENTER.z, 2000);
      if (w.g > 0.01) for (let i = 0; i < (hour % 12 || 12); i++) bell(392, i * 1.7, 0.05 * Math.sqrt(w.g), bus.effects, w.pan, 3);
    }
    lastHour = hour;

    // The waterfall roars as you come into the cove
    const fw = place(WATERFALL.x, WATERFALL.z, 380);
    aim(L.falls, 0.14 * fw.g, fw, 0.4);

    // The strange light hums, louder at night
    const gw = place(GLOW.x, GLOW.z, 450);
    aim(L.glow, 0.08 * gw.g * (0.35 + 0.65 * night), gw, 0.5);

    // Sonar pings faster as you close in
    timers.sonar -= dt;
    if (running && !state.paused && sonarContact && timers.sonar <= 0) {
      timers.sonar = 0.7 + sonarContact.dist / 90;
      ping(sonarContact.dist);
    } else if (!sonarContact) timers.sonar = Math.min(timers.sonar, 0.5);

    // Music: schedule the next bar just before it's due
    if (now() > music.next - 0.25) {
      const mood = wx.storm > 0.45 ? "storm" : sunY < -0.05 ? "night" : sunY < 0.22 ? "sunset" : "day";
      if (mood !== music.mood) {
        music.mood = mood;
        music.bar = 0;
      }
      const t0 = Math.max(music.next, now() + 0.05);
      playBar(mood, t0);
      music.next = t0 + MOODS[mood].len;
    }
  }

  function toggleMute() {
    muted = !muted;
    try {
      localStorage.setItem(SOUND_KEY, muted ? "off" : "on");
    } catch (e) {}
    start();
    if (ac) set(master.gain, muted ? 0 : 0.8 * vol.master, 0.05);
    const btn = document.querySelector('#touch-buttons [data-act="mute"]');
    if (btn) btn.textContent = muted ? "🔇" : "🔊";
    toast(muted ? "🔇 Sound off (M)" : "🔊 Sound on (M)");
  }

  // Volume settings from the menu: kind is master, effects, ambience or music; v from 0 to 1
  function setVolume(kind, v) {
    vol[kind] = v;
    if (!ac) return;
    if (kind === "master") set(master.gain, muted ? 0 : 0.8 * v, 0.05);
    else set(bus[kind].gain, LEVELS[kind] * v, 0.05);
  }

  return { start, update, toggleMute, setVolume, shutter, chime, thunder, splash: splashAt, dive, blow, isMuted: () => muted };
})();
window.addEventListener("keydown", sound.start, true);
window.addEventListener("pointerdown", sound.start, true);
window.addEventListener("touchend", sound.start, true);
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyM" && !e.repeat) sound.toggleMute();
});
if (sound.isMuted()) {
  const btn = document.querySelector('#touch-buttons [data-act="mute"]');
  if (btn) btn.textContent = "🔇";
}
