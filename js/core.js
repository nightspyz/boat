// Setup, helpers, game state, keyboard input, wave and shore geometry shared by shaders and physics, islands.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Setup =====
const canvas = document.getElementById("game");
const scoreEl = document.getElementById("score");
const speedEl = document.getElementById("speed");
const clockEl = document.getElementById("clock");
const statusEl = document.getElementById("status");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayBodyEl = document.getElementById("overlay-body");
const fuelFillEl = document.getElementById("fuel-fill");
const fuelPctEl = document.getElementById("fuel-pct");
const goalEl = document.getElementById("goal");
const goalTitleEl = document.getElementById("goal-title");
const goalHintEl = document.getElementById("goal-hint");
const promptEl = document.getElementById("prompt");
const toastsEl = document.getElementById("toasts");
const flashEl = document.getElementById("flash");
const journalEl = document.getElementById("journal");

if (typeof THREE === "undefined") {
  overlayTitleEl.textContent = "Couldn't load Three.js — check your internet connection.";
  throw new Error("Three.js not loaded");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const FOG_NEAR = 60;
const FOG_FAR = 355; // well inside the 400 m half-width of the detailed water grid
scene.fog = new THREE.Fog(0xb8dcf3, FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ===== Helpers =====
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const rand = (a, b) => a + Math.random() * (b - a);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function hash1(n) {
  // Same hash as shoreHash in SHORE_GLSL, so the water shader and the terrain agree on the coastline
  let p = n * 0.1031;
  p -= Math.floor(p);
  p *= p + 33.33;
  p *= p + p;
  return p - Math.floor(p);
}
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a * (1 - ux) + b * ux) * (1 - uz) + (c * (1 - ux) + d * ux) * uz;
}
function fbm2(x, z) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 5; i++) {
    v += a * noise2(x, z);
    x = x * 2.03 + 17.1;
    z = z * 2.03 + 9.2;
    a *= 0.5;
  }
  return v;
}

// ===== State =====
const GAME_VERSION = "6.0"; // matches the zip name (coastline-vX.Y.zip) and GAME_STATE.md
const DAY_LENGTH = 1440; // real seconds for one full in-game day (one game minute per second)
const TIME_FAST_FORWARD = 30; // multiplier while holding T
const EXPEDITION_START_HOUR = 15;

const state = {
  // title → briefing → running → summary → briefing → …
  phase: "title",
  running: false,
  paused: false,
  score: 0,
  timeOfDay: EXPEDITION_START_HOUR, // hours (0–24)
  boat: { x: 0, y: 0, z: -820, yaw: 0, speed: 0, pitch: 0, roll: 0, throttle: 0 }, // moved to the harbor on start
};

// ===== Input =====
const keys = new Set();
// Joystick input from the touch controls (analog, -1..1)
const touch = { active: false, throttle: 0, turn: 0 };

// Space on the keyboard, a tap on the screen, or the pause button
function pressSpace() {
  if (state.shopOpen) closeShop();
  else if (state.phase === "title" || state.phase === "summary") showBriefing();
  else if (state.phase === "briefing") beginExpedition();
  else togglePause();
}

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Space") {
    e.preventDefault();
    if (e.repeat) return;
    pressSpace();
  }
  if (e.code.startsWith("Arrow")) e.preventDefault();
  if (e.repeat) return;
  if (e.code === "KeyJ") toggleJournal();
  if (e.code === "KeyB" && (state.phase === "briefing" || state.phase === "summary")) {
    if (state.shopOpen) closeShop();
    else openShop();
  }
  if (state.shopOpen && /^Digit[0-9]$/.test(e.code)) {
    const n = Number(e.code.slice(5)) || 10; // 1–9, and 0 for the tenth
    if (UPGRADES[n - 1]) buyUpgrade(UPGRADES[n - 1].id);
  }
  if (e.code === "KeyN" && state.phase === "title") startNewGame();
  if (state.phase !== "running" || state.paused) return;
  if (e.code === "Tab") {
    e.preventDefault();
    photo.toggleGallery();
  }
  if (e.code === "KeyF") photo.active ? photo.shoot() : photo.enter();
  if (e.code === "KeyR" && photo.active) photo.focus();
  if (e.code === "Escape" && photo.active) photo.exit();
  if (e.code === "KeyE" && !photo.droneMode) photo.active ? photo.exit() : tryEndExpedition(); // (E climbs in the drone)
  // Gear (gear.js, photo.js) — also on the inventory bar
  if (e.code === "KeyV") photo.droneMode ? photo.exit() : photo.enterDrone();
  if (e.code === "KeyQ" && !photo.active) gear.castOrReel();
  if (e.code === "KeyL") gear.toggleSpot();
  if (e.code === "KeyK") gear.launchFirework();
  if (/^Digit[1-7]$/.test(e.code) && !photo.active) gear.useSlot(Number(e.code.slice(5)) - 1);
  if (e.code === "KeyX") tryDive();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

// ===== Game control =====
function togglePause() {
  state.paused = !state.paused;
  statusEl.textContent = state.paused ? "Paused — Space to resume" : "At sea — Space to pause";
  overlayTitleEl.textContent = "Paused";
  overlayBodyEl.innerHTML = `<div class="version-tag">Coastline v${GAME_VERSION}</div>`;
  overlayEl.classList.toggle("hidden", !state.paused);
}

// ===== Weather =====
// weather.value: 0 = clear, ~0.35 = cloudy, ~0.6 = rain, ~0.95 = storm
const WEATHER_TARGETS = [0.1, 0.1, 0.35, 0.6, 0.95];
const weather = {
  value: 0.1,
  target: 0.1,
  timer: 50,
  windAngle: -1.33, // radians in the x/z plane, roughly along the main swell (onshore)
  windSpeed: 5, // m/s
  cloudOffset: new THREE.Vector2(),
  flash: 0,
  secondFlash: -1,
  strikeTimer: 4,
  // Fog is separate from the clear → storm scale: some calm days are fog days
  fogDay: false,
  fog: 0,
  fogTarget: 0,
  fogTimer: 60,
};
// Derived each frame
const wx = { cover: 0, overcast: 0, rain: 0, storm: 0, fog: 0 };
let waveScale = 0.7;

function weatherName(w) {
  if (w < 0.3) return "Clear";
  if (w < 0.5) return "Cloudy";
  if (w < 0.78) return "Rain";
  return "Storm";
}

// ===== Waves (shared by the water shader and the physics) =====
// Every wave travels toward the coast (which lies toward -z), from slightly different angles
const WAVES = [
  { dir: [0.25, -1.0], steep: 0.16, len: 60 },
  { dir: [-0.3, -1.0], steep: 0.14, len: 31 },
  { dir: [0.7, -1.0], steep: 0.1, len: 17 },
  { dir: [-0.8, -0.6], steep: 0.07, len: 9 },
].map((w) => {
  const l = Math.hypot(w.dir[0], w.dir[1]);
  const k = (2 * Math.PI) / w.len;
  return { dx: w.dir[0] / l, dz: w.dir[1] / l, k, c: Math.sqrt(9.8 / k), a: w.steep / k, steep: w.steep };
});

// ===== Shore geometry (shared by terrain, water shader and physics) =====
const SHORE_Z = WORLD.coast.shoreZ; // where the beach begins (data/world.js)
const LH_X = WORLD.coast.lighthouseX; // lighthouse headland position along x

// The coastline's shape, from the world file, as [x, metres, width] lists
const COAST_BENDS = WORLD.coast.bends.map((b) => [b.x, b.out, b.width]); // headlands +, bays −
const CLIFF_SETBACKS = WORLD.coast.cliffSetbacks.map((b) => [b.x, b.metres, b.width]); // beach below cliffs +, sheer −
const CLIFF_COASTS = WORLD.coast.cliffCoasts.map((b) => [b.x, b.width]); // always cliffs
const bump = (list, x) => list.reduce((s, [c, a, w]) => s + a * Math.exp(-(((x - c) / w) ** 2)), 0);
// How far the coast juts out at x: the big bends plus a small, rocky irregularity
function headland(x) {
  return bump(COAST_BENDS, x) + (noise1(x * 0.035 + 4.2) - 0.5) * 14;
}
function cliffSetback(x) {
  return bump(CLIFF_SETBACKS, x);
}
// Distance inland from the waterline (negative = out at sea)
function inland(x, z) {
  return SHORE_Z - z + headland(x) + (noise1(x * 0.008) - 0.5) * 60;
}
// Gently sloping sea floor rising into a wide, flat sandy beach
function beachProfile(d) {
  return d < 0 ? Math.max(-0.3 + d * 0.04, -14) : -0.3 + Math.min(d, 120) * 0.025;
}
// Along the cliffs the sea floor drops away steeply into deep, clear water
function cliffBed(d) {
  return d > -33.4 ? -0.3 + d * 0.35 : Math.max(-12 + (d + 33.4) * 0.04, -20);
}
const COVE_X = WORLD.coast.coveX; // a sandy cove ahead and to the left of the start
// 0 = sandy cove, 1 = cliffs (always cliffs around the lighthouse headland, never in the main cove)
function cliffAmount(x) {
  let c = Math.max(smooth(0.42, 0.58, noise1(x * 0.004 + 7.3)), Math.exp(-(((x - LH_X) / 260) ** 2)));
  for (const [cx, w] of CLIFF_COASTS) c = Math.max(c, Math.exp(-(((x - cx) / w) ** 2)));
  return c * (1 - Math.exp(-(((x - COVE_X) / 220) ** 2)));
}
// How cliff-like the sea floor is: a beach at the foot of the cliffs has a gently sloping sandy bed
const bedCliff = (x) => cliffAmount(x) * (1 - smooth(4, 16, cliffSetback(x)));
// Sea floor height offshore (d < 0)
function seaBed(x, z) {
  const d = inland(x, z);
  const cm = bedCliff(x);
  const coast = beachProfile(Math.min(d, 0)) * (1 - cm) + cliffBed(Math.min(d, 0)) * cm;
  return Math.max(coast, islandsBed(x, z));
}

// ===== Little islands offshore =====
const ISLANDS = WORLD.islands.map((I) => ({ ...I })); // little islands offshore (data/world.js)
const ISLAND = Object.fromEntries(ISLANDS.map((I) => [I.id, I]));
// Distance inland from the island's shoreline (negative = out at sea); the shoreline wobbles with angle
function islandInland(I, x, z) {
  const dx = x - I.x;
  const dz = z - I.z;
  const a = Math.atan2(dz, dx);
  const rr = I.R * (1 + 0.1 * Math.sin(3 * a + I.seed) + 0.06 * Math.sin(5 * a + 2 * I.seed));
  return rr - Math.hypot(dx, dz);
}
function islandsBed(x, z) {
  // No floor here: far from an island this is very deep, so the coast's own sea floor wins
  let b = -99;
  for (const I of ISLANDS) b = Math.max(b, islandInland(I, x, z) * 0.12);
  return b;
}
function islandHeight(I, x, z) {
  const t = islandInland(I, x, z);
  if (t < 0) return Math.max(t * 0.12, -14);
  let y = Math.min(t * 0.06, 1.2); // beach
  y += smooth(8, I.R * 0.7, t) * I.h * (0.7 + 0.6 * fbm2(x * 0.03 + I.seed, z * 0.03));
  return y;
}
// The island's highest point (found once, then remembered)
function islandSummit(I) {
  if (!I.summit) {
    let best = { x: I.x, z: I.z, y: -99 };
    for (let dx = -I.R * 0.6; dx <= I.R * 0.6; dx += 2) {
      for (let dz = -I.R * 0.6; dz <= I.R * 0.6; dz += 2) {
        const y = islandHeight(I, I.x + dx, I.z + dz);
        if (y > best.y) best = { x: I.x + dx, z: I.z + dz, y };
      }
    }
    I.summit = best;
  }
  return I.summit;
}

const ISLANDS_GLSL = /* glsl */ `
  float islandInland(vec2 p, vec2 c, float R, float seed) {
    vec2 d = p - c;
    float a = atan(d.y, d.x);
    float rr = R * (1.0 + 0.1 * sin(3.0 * a + seed) + 0.06 * sin(5.0 * a + 2.0 * seed));
    return rr - length(d);
  }
  float islandsBed(vec2 p) {
    float b = -99.0;
    ${ISLANDS.map(
      (I) =>
        `b = max(b, islandInland(p, vec2(${I.x.toFixed(1)}, ${I.z.toFixed(1)}), ${I.R.toFixed(1)}, ${I.seed.toFixed(2)}) * 0.12);`
    ).join("\n    ")}
    return b;
  }
  // Distance out from the nearest island shore
  float islandsShoreDist(vec2 p) {
    float d = 1e5;
    ${ISLANDS.map(
      (I) =>
        `d = min(d, -islandInland(p, vec2(${I.x.toFixed(1)}, ${I.z.toFixed(1)}), ${I.R.toFixed(1)}, ${I.seed.toFixed(2)}));`
    ).join("\n    ")}
    return d;
  }
`;

const SHORE_GLSL = /* glsl */ `
  const float SHORE_Z = ${SHORE_Z.toFixed(1)};
  const float LH_X = ${LH_X.toFixed(1)};
  const float COVE_X = ${COVE_X.toFixed(1)};
  ${ISLANDS_GLSL}
  float shoreHash(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
  float shoreNoise(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(shoreHash(i), shoreHash(i + 1.0), u);
  }
  float gaussBump(float x, float c, float a, float w) {
    float q = (x - c) / w;
    return a * exp(-q * q);
  }
  float headland(float x) {
    return ${COAST_BENDS.map(([c, a, w]) => `gaussBump(x, ${c.toFixed(1)}, ${a.toFixed(1)}, ${w.toFixed(1)})`).join(" + ")}
      + (shoreNoise(x * 0.035 + 4.2) - 0.5) * 14.0;
  }
  float cliffSetback(float x) {
    return ${CLIFF_SETBACKS.map(([c, a, w]) => `gaussBump(x, ${c.toFixed(1)}, ${a.toFixed(1)}, ${w.toFixed(1)})`).join(" + ")};
  }
  float inlandDist(vec2 p) {
    return SHORE_Z - p.y + headland(p.x) + (shoreNoise(p.x * 0.008) - 0.5) * 60.0;
  }
  float cliffAmount(float x) {
    float q = (x - LH_X) / 260.0;
    float c = (x - COVE_X) / 220.0;
    float cl = max(smoothstep(0.42, 0.58, shoreNoise(x * 0.004 + 7.3)), exp(-q * q));
    ${CLIFF_COASTS.map(([c, w]) => `cl = max(cl, gaussBump(x, ${c.toFixed(1)}, 1.0, ${w.toFixed(1)}));`).join(" ")}
    return cl * (1.0 - exp(-c * c));
  }
  float bedHeight(vec2 p) {
    float d = inlandDist(p);
    float cm = cliffAmount(p.x) * (1.0 - smoothstep(4.0, 16.0, cliffSetback(p.x)));
    float coast;
    if (d < 0.0) {
      float beach = max(-0.3 + d * 0.04, -14.0);
      float cliff = d > -33.4 ? -0.3 + d * 0.35 : max(-12.0 + (d + 33.4) * 0.04, -20.0);
      coast = mix(beach, cliff, cm);
    } else {
      // Beach slope, or the rocky shelf at the foot of the cliffs
      coast = mix(-0.3 + min(d, 120.0) * 0.025, -0.3 + min(d, 10.0) * 0.09, cm);
    }
    return max(coast, islandsBed(p));
  }
  // ---- Breaking waves ----
  // Swells line up with the nearest shore (coast or island). In deep water they are rounded swells; as the
  // water gets shallow they peak up, the face steepens and curls over (around 2.5 m deep), and in the last
  // metre or so each one is a low rolling wall of white water that runs on up the beach as the swash.
  float shoreCoord(vec2 p) {
    return max(inlandDist(p), -islandsShoreDist(p));
  }
  // 0..1 through each breaker at shore coordinate s: 0 is the crest, just below 1 is the face toward the shore
  float breakUAt(float s, vec2 p, float t) {
    float ph = t * 0.7 - s * 0.12 + sin(p.x * 0.02 + t * 0.3) * 1.5 + sin(p.x * 0.11 + p.y * 0.07 + t * 0.23) * 0.5;
    return fract((ph - 0.17) / 6.2832);
  }
  float breakU(vec2 p, float t) {
    return breakUAt(shoreCoord(p), p, t);
  }
  // Life stage at this depth: 0 = swell (7 m and deeper), 1 = curling over (about 2.5 m), 2 = white water (under 1 m)
  float breakStage(float depth) {
    return (1.0 - smoothstep(2.6, 7.0, depth)) + (1.0 - smoothstep(0.7, 2.0, depth));
  }
  // Shape of a breaker: x = height, y = how far it leans forward toward the shore (both per metre of size).
  // Each shape has its average taken off so the sea level stays put.
  vec2 breakShape(float u, float stage) {
    float d = u < 0.5 ? u : u - 1.0; // distance from the crest in wavelengths (negative = on the shore side)
    float c = cos(6.2832 * d) * 0.5 + 0.5;
    float swell = c * c - 0.375;
    // Curling over: a long back, a steep concave face, and the water drawn down in front of it
    float plunge = (d >= 0.0 ? (exp(-d * 7.0) - 0.0302) / 0.9698
                             : pow(clamp(1.0 + d / 0.06, 0.0, 1.0), 3.0) - 0.18 * exp(-(((d + 0.09) / 0.04) * ((d + 0.09) / 0.04)))) - 0.1295;
    // White water: a low step rolling in, slowly sinking behind it
    float bore = 0.55 * (d >= 0.0 ? (exp(-d * 3.5) - 0.1738) / 0.8262 : smoothstep(-0.03, 0.0, d)) - 0.1076;
    float lip = 0.8 * exp(-(((d + 0.008) / 0.018) * ((d + 0.008) / 0.018))); // the lip thrown forward over the face
    float roll = 0.3 * exp(-(((d + 0.01) / 0.025) * ((d + 0.01) / 0.025))); // the tumbling front of the white water
    float w0 = clamp(1.0 - stage, 0.0, 1.0);
    float w2 = clamp(stage - 1.0, 0.0, 1.0);
    float w1 = 1.0 - w0 - w2;
    return vec2(swell * w0 + plunge * w1 + bore * w2, lip * w1 + roll * w2);
  }
  // Breaker size per unit of wave scale: grows from 8 m deep, gone at the waterline (the swash takes over)
  float breakAmp(float depth) {
    return (1.0 - smoothstep(2.5, 8.0, depth)) * smoothstep(0.1, 0.9, depth);
  }
  // Water level of the swash on the beach: each spent breaker rushes up the sand, then slides slowly back
  float swashLevel(vec2 p, float t) {
    float u = breakUAt(shoreCoord(p), p, t);
    float run = u < 0.3 ? smoothstep(0.0, 0.3, u) : 1.0 - smoothstep(0.3, 1.0, u);
    return 0.02 + 0.42 * run * (0.8 + 0.2 * sin(p.x * 0.05 + t * 0.1));
  }
`;

// Breaking waves near the shore: the height part of breakShape() in the water shader
function breakerHeight(x, z, t, depth) {
  if (depth >= 8) return 0;
  let s = inland(x, z);
  for (const I of ISLANDS) s = Math.max(s, islandInland(I, x, z));
  const ph = t * 0.7 - s * 0.12 + Math.sin(x * 0.02 + t * 0.3) * 1.5 + Math.sin(x * 0.11 + z * 0.07 + t * 0.23) * 0.5;
  const u = (((ph - 0.17) / (2 * Math.PI)) % 1 + 1) % 1;
  const d = u < 0.5 ? u : u - 1;
  const stage = 1 - smooth(2.6, 7, depth) + (1 - smooth(0.7, 2, depth));
  const c = Math.cos(2 * Math.PI * d) * 0.5 + 0.5;
  const swell = c * c - 0.375;
  const plunge =
    (d >= 0 ? (Math.exp(-d * 7) - 0.0302) / 0.9698 : clamp(1 + d / 0.06, 0, 1) ** 3 - 0.18 * Math.exp(-(((d + 0.09) / 0.04) ** 2))) - 0.1295;
  const bore = 0.55 * (d >= 0 ? (Math.exp(-d * 3.5) - 0.1738) / 0.8262 : smooth(-0.03, 0, d)) - 0.1076;
  const w0 = clamp(1 - stage, 0, 1);
  const w2 = clamp(stage - 1, 0, 1);
  const amp = (1 - smooth(2.5, 8, depth)) * smooth(0.1, 0.9, depth);
  return (0.3 + 0.4 * waveScale) * amp * (swell * w0 + plunge * (1 - w0 - w2) + bore * w2);
}

function waveHeight(x, z, t) {
  // Waves shrink as the water gets shallow, where breakers take over
  const depth = -seaBed(x, z);
  const damp = 0.12 + 0.88 * smooth(0.5, 8, depth);
  let h = 0;
  for (const w of WAVES) h += w.a * waveScale * Math.sin(w.k * (w.dx * x + w.dz * z - w.c * t));
  return h * damp + breakerHeight(x, z, t, depth);
}
