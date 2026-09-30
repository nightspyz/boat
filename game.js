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
  if (state.shopOpen && /^Digit[1-8]$/.test(e.code)) buyUpgrade(UPGRADES[Number(e.code.slice(5)) - 1].id);
  if (e.code === "KeyN" && state.phase === "title") startNewGame();
  if (state.phase !== "running" || state.paused) return;
  if (e.code === "KeyF") takePhoto();
  if (e.code === "KeyE") tryEndExpedition();
  if (e.code === "KeyX") tryDive();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

// ===== Game control =====
function togglePause() {
  state.paused = !state.paused;
  statusEl.textContent = state.paused ? "Paused — Space to resume" : "At sea — Space to pause";
  overlayTitleEl.textContent = "Paused";
  overlayBodyEl.innerHTML = "";
  overlayEl.classList.toggle("hidden", !state.paused);
}

// ===== Weather =====
// weather.value: 0 = clear, ~0.35 = cloudy, ~0.6 = rain, ~0.95 = storm
const WEATHER_TARGETS = [0.1, 0.1, 0.35, 0.6, 0.95];
const weather = {
  value: 0.1,
  target: 0.1,
  timer: 50,
  windAngle: 0.29, // radians in the x/z plane, roughly along the main swell
  windSpeed: 5, // m/s
  cloudOffset: new THREE.Vector2(),
  flash: 0,
  secondFlash: -1,
  strikeTimer: 4,
};
// Derived each frame
const wx = { cover: 0, overcast: 0, rain: 0, storm: 0 };
let waveScale = 0.7;

function weatherName(w) {
  if (w < 0.3) return "Clear";
  if (w < 0.5) return "Cloudy";
  if (w < 0.78) return "Rain";
  return "Storm";
}

// ===== Waves (shared by the water shader and the physics) =====
const WAVES = [
  { dir: [1.0, 0.3], steep: 0.16, len: 60 },
  { dir: [0.6, 1.0], steep: 0.14, len: 31 },
  { dir: [-0.5, 1.0], steep: 0.1, len: 17 },
  { dir: [0.3, -1.0], steep: 0.07, len: 9 },
].map((w) => {
  const l = Math.hypot(w.dir[0], w.dir[1]);
  const k = (2 * Math.PI) / w.len;
  return { dx: w.dir[0] / l, dz: w.dir[1] / l, k, c: Math.sqrt(9.8 / k), a: w.steep / k, steep: w.steep };
});

// ===== Shore geometry (shared by terrain, water shader and physics) =====
const SHORE_Z = -1100; // where the beach begins (north of the start)
const LH_X = 160; // lighthouse headland position along x

function headland(x) {
  return 150 * Math.exp(-(((x - LH_X) / 170) ** 2));
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
const COVE_X = -260; // a sandy cove ahead and to the left of the start
// 0 = sandy cove, 1 = cliffs (always cliffs around the lighthouse headland, never in the main cove)
function cliffAmount(x) {
  const c = Math.max(smooth(0.42, 0.58, noise1(x * 0.004 + 7.3)), Math.exp(-(((x - LH_X) / 260) ** 2)));
  return c * (1 - Math.exp(-(((x - COVE_X) / 220) ** 2)));
}
// Sea floor height offshore (d < 0)
function seaBed(x, z) {
  const d = inland(x, z);
  const cm = cliffAmount(x);
  const coast = beachProfile(Math.min(d, 0)) * (1 - cm) + cliffBed(Math.min(d, 0)) * cm;
  return Math.max(coast, islandsBed(x, z));
}

// ===== Little islands offshore =====
const ISLANDS = [
  { id: "palm", x: 380, z: -700, R: 40, h: 7, seed: 1.3 },
  { id: "seal", x: -800, z: -760, R: 22, h: 6, seed: 4.1 },
  { id: "goat", x: 1150, z: -620, R: 75, h: 22, seed: 2.7 },
];
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
  float inlandDist(vec2 p) {
    float q = (p.x - LH_X) / 170.0;
    return SHORE_Z - p.y + 150.0 * exp(-q * q) + (shoreNoise(p.x * 0.008) - 0.5) * 60.0;
  }
  float cliffAmount(float x) {
    float q = (x - LH_X) / 260.0;
    float c = (x - COVE_X) / 220.0;
    return max(smoothstep(0.42, 0.58, shoreNoise(x * 0.004 + 7.3)), exp(-q * q)) * (1.0 - exp(-c * c));
  }
  float bedHeight(vec2 p) {
    float d = inlandDist(p);
    float cm = cliffAmount(p.x);
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
  // Water level of the waves lapping up the beach
  float swashLevel(vec2 p, float t) {
    float d = inlandDist(p);
    return 0.22 + 0.22 * sin(t * 0.7 - d * 0.12 + sin(p.x * 0.02 + t * 0.3) * 1.5);
  }
`;

function waveHeight(x, z, t) {
  // Waves shrink as the water gets shallow
  const depth = -seaBed(x, z);
  const damp = 0.12 + 0.88 * smooth(0.5, 8, depth);
  let h = 0;
  for (const w of WAVES) h += w.a * waveScale * Math.sin(w.k * (w.dx * x + w.dz * z - w.c * t));
  return h * damp;
}

// ===== Sky, clouds and time-of-day uniforms (shared by sky and water) =====
const shared = {
  uTop: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color() },
  uSunset: { value: 0 },
  uSunVis: { value: 1 },
  uStars: { value: 0 },
  uTime: { value: 0 },
  uCloudCover: { value: 0.2 },
  uCloudDark: { value: 0 },
  uCloudOffset: { value: new THREE.Vector2() },
  uLightLevel: { value: 1 },
  uAurora: { value: 0 },
};

const SKY_GLSL = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunset;
  uniform float uSunVis;
  uniform float uStars;
  uniform float uTime;

  vec3 skyColor(vec3 d) {
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.45));
    vec2 dh = normalize(d.xz + vec2(1e-4));
    vec2 sh = normalize(uSunDir.xz + vec2(1e-4));
    float glow = pow(max(dot(dh, sh), 0.0), 6.0) * pow(1.0 - h, 5.0);
    col += uSunColor * glow * uSunset * 0.7;
    return col;
  }
`;

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
`;

// Volumetric cloud layer (world space), shared by the sky and by shadow lookups
const CLOUD_BOTTOM = 500;
const CLOUD_TOP = 900;
const CLOUD_SHADOW_HEIGHT = 650;

const CLOUD_GLSL = /* glsl */ `
  uniform float uCloudCover;
  uniform vec2 uCloudOffset;
  const float CLOUD_BOTTOM = ${CLOUD_BOTTOM.toFixed(1)};
  const float CLOUD_TOP = ${CLOUD_TOP.toFixed(1)};

  float hash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), u.x);
    float b = mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), u.x);
    float c = mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), u.x);
    float d = mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), u.x);
    return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
  }
  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.02 + vec3(17.1, 9.2, 4.7);
      a *= 0.5;
    }
    return v;
  }
  float cloudDensity(vec3 p) {
    float h = (p.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM);
    if (h < 0.0 || h > 1.0) return 0.0;
    vec3 q = vec3(p.x - uCloudOffset.x, p.y, p.z - uCloudOffset.y) * 0.0016;
    float thr = mix(0.62, 0.3, uCloudCover) + h * 0.18; // flat bottoms, billowy tops
    return max((fbm3(q) - thr) * 5.0 * smoothstep(0.0, 0.1, h), 0.0);
  }
  // 1 = full sun, lower = under a cloud
  float cloudShadow(vec3 wp, vec3 sunDir) {
    float s = max(sunDir.y, 0.08);
    vec3 p = wp + sunDir / s * (${CLOUD_SHADOW_HEIGHT.toFixed(1)} - wp.y);
    return exp(-cloudDensity(vec3(p.x, ${CLOUD_SHADOW_HEIGHT.toFixed(1)}, p.z)) * 1.5);
  }
`;

// JavaScript copy of cloudDensity, used to shade the boat and wildlife
const fract = (x) => x - Math.floor(x);
function cloudHash3(x, y, z) {
  x = fract(x * 0.1031);
  y = fract(y * 0.1031);
  z = fract(z * 0.1031);
  const d = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32);
  x += d;
  y += d;
  z += d;
  return fract((x + y) * z);
}
function cloudNoise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const a = lerp(cloudHash3(ix, iy, iz), cloudHash3(ix + 1, iy, iz), ux);
  const b = lerp(cloudHash3(ix, iy + 1, iz), cloudHash3(ix + 1, iy + 1, iz), ux);
  const c = lerp(cloudHash3(ix, iy, iz + 1), cloudHash3(ix + 1, iy, iz + 1), ux);
  const d = lerp(cloudHash3(ix, iy + 1, iz + 1), cloudHash3(ix + 1, iy + 1, iz + 1), ux);
  return lerp(lerp(a, b, uy), lerp(c, d, uy), uz);
}
function cloudDensityJS(x, y, z, cover, offset) {
  const h = (y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM);
  if (h < 0 || h > 1) return 0;
  let qx = (x - offset.x) * 0.0016;
  let qy = y * 0.0016;
  let qz = (z - offset.y) * 0.0016;
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * cloudNoise3(qx, qy, qz);
    qx = qx * 2.02 + 17.1;
    qy = qy * 2.02 + 9.2;
    qz = qz * 2.02 + 4.7;
    a *= 0.5;
  }
  const thr = 0.62 + (0.3 - 0.62) * cover + h * 0.18;
  return Math.max((v - thr) * 5 * smooth(0, 0.1, h), 0);
}
function cloudShadowJS(x, y, z, sunDir, cover, offset) {
  const s = Math.max(sunDir.y, 0.08);
  const px = x + (sunDir.x / s) * (CLOUD_SHADOW_HEIGHT - y);
  const pz = z + (sunDir.z / s) * (CLOUD_SHADOW_HEIGHT - y);
  return Math.exp(-cloudDensityJS(px, CLOUD_SHADOW_HEIGHT, pz, cover, offset) * 1.5);
}

// ===== Sky dome =====
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 48, 24),
  new THREE.ShaderMaterial({
    uniforms: shared,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      ${NOISE_GLSL}
      ${CLOUD_GLSL}
      uniform float uCloudDark;
      uniform float uLightLevel;
      uniform float uAurora;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(vec3(d.x, max(d.y, 0.0), d.z));

        // Twinkling stars
        vec3 cell = floor(d * 400.0);
        float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + n * 60.0);
        col += vec3(step(0.9985, n) * twinkle * uStars * smoothstep(0.0, 0.15, d.y));

        // Aurora curtains in the northern sky (-Z)
        if (uAurora > 0.001 && d.y > 0.0) {
          float az = atan(d.x, -d.z);
          float north = 1.0 - smoothstep(0.4, 1.7, abs(az));
          float edge = 0.06 + 0.05 * sin(az * 3.0 + uTime * 0.07);
          float h = d.y;
          float vert = smoothstep(edge, edge + 0.03, h) * (1.0 - smoothstep(edge + 0.04, edge + 0.4, h));
          float curtain = fbm(vec2(az * 4.0 + sin(az * 7.0 + uTime * 0.15) * 0.4, uTime * 0.05));
          curtain = smoothstep(0.35, 0.75, curtain);
          float rays = 0.55 + 0.45 * vnoise(vec2(az * 90.0, uTime * 0.4));
          vec3 ac = mix(vec3(0.15, 1.0, 0.55), vec3(0.65, 0.25, 0.95), smoothstep(edge + 0.08, edge + 0.35, h));
          col += ac * curtain * rays * vert * north * uAurora * 0.9;
        }

        // Moon, opposite the sun
        float md = dot(d, -uSunDir);
        col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99955, 0.9997, md) * uStars;
        col += vec3(0.5, 0.6, 0.8) * pow(max(md, 0.0), 60.0) * 0.15 * uStars;

        // Sun disc and halo
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 1500.0) * 6.0 + pow(sd, 12.0) * 0.25) * uSunVis;

        // Volumetric clouds: raymarch through the cloud layer, lighting each sample toward the sun
        if (d.y > 0.01) {
          vec3 ro = cameraPosition;
          float t0 = (CLOUD_BOTTOM - ro.y) / d.y;
          float t1 = (CLOUD_TOP - ro.y) / d.y;
          float fade = (1.0 - smoothstep(5000.0, 12000.0, t0)) * smoothstep(0.01, 0.06, d.y);
          if (fade > 0.0) {
            const int STEPS = 24;
            float stepLen = (t1 - t0) / float(STEPS);
            float t = t0 + stepLen * hash(gl_FragCoord.xy);
            float trans = 1.0;
            vec3 acc = vec3(0.0);
            vec3 sunLit = mix(vec3(1.0), uSunColor, 0.6 * uSunset) * uLightLevel * (1.0 - 0.7 * uCloudDark);
            vec3 ambient = (mix(uHorizon, uTop, 0.5) * 0.5 + vec3(0.04) * uLightLevel) * (1.0 - 0.5 * uCloudDark);
            float phase = 1.0 + 1.5 * pow(sd, 8.0) * uSunVis; // bright silver edges toward the sun
            for (int i = 0; i < STEPS; i++) {
              vec3 p = ro + d * t;
              float dens = cloudDensity(p);
              if (dens > 0.001) {
                float ld = cloudDensity(p + uSunDir * 60.0) + cloudDensity(p + uSunDir * 160.0);
                vec3 lit = sunLit * exp(-ld * 0.9) * phase + ambient;
                float a = 1.0 - exp(-dens * stepLen * 0.006);
                acc += trans * a * lit;
                trans *= 1.0 - a;
                if (trans < 0.02) break;
              }
              t += stepLen;
            }
            float alpha = (1.0 - trans) * fade;
            col = mix(col, acc / max(1.0 - trans, 1e-3), alpha);
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
);
sky.renderOrder = -1;
scene.add(sky);

// ===== Water =====
const WATER_SIZE = 800;
const WATER_SEGMENTS = 400;
const WATER_STEP = WATER_SIZE / WATER_SEGMENTS;

const waterGeo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS);
waterGeo.rotateX(-Math.PI / 2);

// The water doesn't write depth (so fish and dolphins can be seen through it), which means it can't
// hide its own far side. So draw its triangles from the farthest to the nearest: the grid is always
// centred on the camera, so nearer waves are then always drawn last, on top of the distant ones.
function sortWaterFarToNear(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const triCount = idx.length / 3;
  const order = new Array(triCount);
  const dist = new Float32Array(triCount);
  for (let t = 0; t < triCount; t++) {
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(idx[t * 3 + k]);
      cz += pos.getZ(idx[t * 3 + k]);
    }
    dist[t] = cx * cx + cz * cz;
    order[t] = t;
  }
  order.sort((a, b) => dist[b] - dist[a]);
  const sorted = new idx.constructor(idx.length);
  order.forEach((t, i) => {
    sorted[i * 3] = idx[t * 3];
    sorted[i * 3 + 1] = idx[t * 3 + 1];
    sorted[i * 3 + 2] = idx[t * 3 + 2];
  });
  geo.setIndex(new THREE.BufferAttribute(sorted, 1));
}
sortWaterFarToNear(waterGeo);
const waterUniforms = Object.assign({}, shared, {
  uWaves: { value: WAVES.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.steep)) },
  uWaveScale: { value: 1 },
  uFoam: { value: 0.35 },
  uCamPos: { value: new THREE.Vector3() },
  uDeep: { value: new THREE.Color(0x0b3553) },
  uShallow: { value: new THREE.Color(0x1f7a8c) },
  uLight: { value: 1 },
  uFogNear: { value: FOG_NEAR },
  uFogFar: { value: FOG_FAR },
  // Boat lights: 0 masthead, 1 port, 2 starboard, 3 stern, 4 searchlight (spot)
  uBoatLightPos: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector3()) },
  uBoatLightColor: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector3()) },
  uBoatSpotDir: { value: new THREE.Vector3(0, 0, -1) },
  uStacks: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector4(0, 0, 0, 0)) }, // x, z, radius, active
});

const water = new THREE.Mesh(
  waterGeo,
  new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: /* glsl */ `
      ${SHORE_GLSL}
      uniform float uTime;
      uniform float uWaveScale;
      uniform vec4 uWaves[4];
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vBed;

      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 tangent = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);
        vec3 disp = vec3(0.0);

        // Waves shrink in shallow water
        float bed = bedHeight(wp.xz);
        float depth = -bed;
        float damp = mix(0.12, 1.0, smoothstep(0.5, 8.0, depth));
        // Calm the waves near the edge of the grid so its border never wobbles into view
        damp *= 1.0 - smoothstep(320.0, 390.0, max(abs(position.x), abs(position.z)));

        // Gerstner waves. The sideways (horizontal) push is capped so crests can never fold over
        // into loops, and each wave fades out with distance before the grid gets too coarse to draw it.
        float steepSum = 0.0;
        for (int i = 0; i < 4; i++) steepSum += uWaves[i].w;
        float sideways = min(1.0, 0.6 / max(steepSum * uWaveScale * damp, 1e-4));
        float camDist = length(wp.xz - cameraPosition.xz);
        for (int i = 0; i < 4; i++) {
          vec4 w = uWaves[i];
          vec2 d = w.xy;
          float k = w.z;
          float len = 6.2832 / k;
          float fade = 1.0 - smoothstep(len * 9.0, len * 22.0, camDist);
          float s = w.w * uWaveScale * damp * fade;
          float c = sqrt(9.8 / k);
          float f = k * (dot(d, wp.xz) - c * uTime);
          float a = s / k;
          float q = s * sideways; // horizontal steepness
          float cf = cos(f);
          float sf = sin(f);
          disp += vec3(d.x * (q / k) * cf, a * sf, d.y * (q / k) * cf);
          tangent += vec3(-d.x * d.x * q * sf, d.x * s * cf, -d.x * d.y * q * sf);
          binormal += vec3(-d.x * d.y * q * sf, d.y * s * cf, -d.y * d.y * q * sf);
        }

        vec3 p = wp.xyz + disp;
        // Waves lapping up and down the beach
        p.y += (1.0 - smoothstep(0.0, 5.0, depth)) * swashLevel(wp.xz, uTime);

        vNormal = normalize(cross(binormal, tangent));
        vWorld = p;
        vHeight = disp.y;
        vBed = bed;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      ${NOISE_GLSL}
      ${CLOUD_GLSL}
      ${SHORE_GLSL}
      uniform vec3 uCamPos;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uLight;
      uniform float uWaveScale;
      uniform float uFoam;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uBoatLightPos[5];
      uniform vec3 uBoatLightColor[5];
      uniform vec3 uBoatSpotDir;
      uniform vec4 uStacks[5];
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vBed;

      // Small wind ripples on top of the big waves
      float ripple(vec2 p, float t) {
        return vnoise(p + t * vec2(0.35, 0.2)) * 0.6 + vnoise(p * 2.3 + t * vec2(-0.25, 0.4)) * 0.4;
      }

      // ---- Caustics: sunlight focused by the moving surface into a bright, wobbling net ----
      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }
      // Distance to the nearest wall between animated cells
      float cellEdge(vec2 p, float t) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float f1 = 8.0;
        float f2 = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = 0.5 + 0.4 * sin(t + 6.2831 * hash22(i + g));
            float d = length(g + o - f);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
          }
        }
        return f2 - f1;
      }
      float causticLayer(vec2 p, float t) {
        // Warp so the cell walls bend and drift like light through moving waves
        p += vec2(vnoise(p * 0.7 + t * 0.3), vnoise(p * 0.7 - t * 0.25 + 4.0)) * 0.9;
        return exp(-cellEdge(p, t) * 9.0);
      }
      float causticNet(vec2 p, float t) {
        float c = (causticLayer(p, t) + causticLayer(p * 0.73 + 5.2, t * 1.3)) * 0.5;
        return pow(c, 1.8) * 2.2;
      }
      // Slight colour split at the edges, like real refracted sunlight
      vec3 caustics(vec2 p, float t) {
        vec2 off = vec2(0.035, 0.02);
        return vec3(causticNet(p + off, t), causticNet(p, t), causticNet(p - off, t));
      }

      // ---- Sea floor: sand, coral reef, rocky slopes under the cliffs and the sea stacks' bases ----
      float coralTex(vec2 p) {
        return vnoise(p * 1.6) * 0.6 + vnoise(p * 7.0) * 0.4;
      }
      vec3 seabed(vec2 p, float dIn, out float bump) {
        vec3 sand = vec3(0.86, 0.79, 0.62) * (0.88 + 0.24 * vnoise(p * 0.6));
        float cliffs = cliffAmount(p.x);

        // Reef: on the steep slopes below the cliffs, and in patches further out in the bay
        float nearReef = cliffs * smoothstep(-160.0, -110.0, dIn) * (1.0 - smoothstep(-6.0, -2.0, dIn));
        float bayReef = smoothstep(-280.0, -200.0, dIn) * (1.0 - smoothstep(-40.0, -20.0, dIn)) * 0.6;
        // A fringing reef around each little island
        float dIsl = islandsShoreDist(p);
        float islandReef = smoothstep(4.0, 12.0, dIsl) * (1.0 - smoothstep(35.0, 70.0, dIsl));
        float reefZone = max(max(nearReef, bayReef), islandReef);
        float patchN = fbm(p * 0.07) + (vnoise(p * 0.5) - 0.5) * 0.15;
        float coral = smoothstep(0.34 + 0.08 * (1.0 - nearReef), 0.5, patchN) * reefZone;

        // Coral heads with bright bumpy tips and dark crevices
        float fine = vnoise(p * 7.0);
        float tex = coralTex(p);
        float kind = vnoise(p * 0.15 + 11.0);
        vec3 cc = kind < 0.25 ? vec3(0.8, 0.7, 0.45)    // tan table and brain corals
                : kind < 0.38 ? vec3(0.55, 0.65, 0.38)  // olive
                : kind < 0.5 ? vec3(0.3, 0.66, 0.6)     // teal
                : kind < 0.62 ? vec3(0.66, 0.5, 0.7)    // purple
                : kind < 0.8 ? vec3(0.98, 0.5, 0.14)    // orange soft corals
                : vec3(0.92, 0.6, 0.55);                // pink
        cc *= 0.5 + 0.8 * tex;
        cc *= 0.55 + 0.45 * smoothstep(0.25, 0.55, fine);

        // Rocky slope and boulders at the foot of the cliffs
        float rockSlope = cliffs * smoothstep(-40.0, -8.0, dIn);
        float rubble = max(rockSlope * smoothstep(0.35, 0.55, vnoise(p * 0.4)),
                           cliffs * smoothstep(-60.0, -20.0, dIn) * smoothstep(0.5, 0.62, vnoise(p * 0.4)));

        // The underwater bases of the sea stacks
        for (int i = 0; i < 5; i++) {
          vec4 s = uStacks[i];
          if (s.w > 0.0) {
            float sd = length(p - s.xy);
            rubble = max(rubble, 1.0 - smoothstep(s.z * 1.2, s.z * 1.8 + 3.0, sd));
          }
        }
        vec3 rockCol = vec3(0.72, 0.66, 0.56) * (0.55 + 0.6 * vnoise(p * 2.5));
        rockCol = mix(rockCol, vec3(0.95, 0.5, 0.16), smoothstep(0.62, 0.75, vnoise(p * 1.3 + 4.0)) * 0.8);

        vec3 col = mix(sand, rockCol, rubble);
        col = mix(col, cc, coral * (0.6 + 0.4 * (1.0 - rubble)));

        // Fake relief lighting: compare the height here with a point a little toward the sun
        vec2 sunStep = normalize(uSunDir.xz + vec2(1e-4)) * 0.18;
        float relief = (tex - coralTex(p + sunStep)) * 2.5 * coral + (vnoise(p * 0.8) - vnoise(p * 0.8 + sunStep * 0.8)) * 2.0 * rubble;
        col *= clamp(1.0 + relief, 0.55, 1.4);

        bump = coral * (0.4 + 1.4 * tex) + rubble * 1.2;
        return col;
      }

      void main() {
        vec3 toCam = uCamPos - vWorld;
        float dist = length(toCam);
        vec3 v = toCam / dist;
        float far = smoothstep(80.0, 300.0, dist);

        // Normal: big waves + fine ripples up close, flattened far away to avoid shimmer
        vec3 n = normalize(vNormal);
        float detail = (1.0 - smoothstep(25.0, 160.0, dist)) * (0.35 + 0.25 * uWaveScale);
        if (detail > 0.0) {
          vec2 rp = vWorld.xz * 0.7;
          float e = 0.08;
          float h0 = ripple(rp, uTime);
          float hx = ripple(rp + vec2(e, 0.0), uTime);
          float hz = ripple(rp + vec2(0.0, e), uTime);
          n = normalize(n + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * 0.12 * detail);
        }
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), far));

        // Reflection of the sky (Fresnel: more reflective at grazing angles)
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        float cShadow = mix(1.0, cloudShadow(vWorld, uSunDir), uSunVis);
        vec3 refl = skyColor(r) * mix(0.8, 1.0, cShadow);

        // Deep water colour
        float diff = max(dot(n, uSunDir), 0.0) * uSunVis * cShadow;
        float crest = clamp(vHeight / (2.6 * max(uWaveScale, 0.3)) * 0.5 + 0.5, 0.0, 1.0);
        vec3 body = mix(uDeep, uShallow, crest * 0.8);
        body *= uLight * (0.6 + 0.4 * diff) * mix(0.75, 1.0, cShadow);

        // Subsurface glow: sunlight shining through thin wave crests
        float sss = pow(clamp(dot(v, -uSunDir) * 0.5 + 0.5, 0.0, 1.0), 3.0) * smoothstep(0.45, 0.9, crest);
        body += vec3(0.05, 0.4, 0.33) * sss * uSunVis * cShadow * uLight;

        // Clear water: the sea floor shows through even when deep, red fading first
        float dIn = inlandDist(vWorld.xz);
        float depthW = max(vWorld.y - vBed, 0.0);
        vec3 water = body;
        if (depthW < 30.0) {
          vec2 sunShift = uSunDir.xz / max(uSunDir.y, 0.25);
          vec2 bedP = vWorld.xz - n.xz * depthW * 0.6 - sunShift * depthW * 0.3; // refraction
          float bump;
          vec3 bedCol = seabed(bedP, dIn, bump);
          float dBed = max(depthW - bump, 0.05);
          float lit = uSunVis * cShadow;
          vec3 caust = caustics(bedP * 0.9, uTime) * (1.0 - smoothstep(40.0, 140.0, dist));
          bedCol = bedCol * uLight * (0.45 + 0.55 * lit) + bedCol * uSunColor * caust * 1.6 * lit * exp(-dBed * 0.1);
          vec3 absorb = exp(-dBed * vec3(0.25, 0.05, 0.035));
          vec3 turquoise = vec3(0.02, 0.4, 0.5) * uLight * mix(0.75, 1.0, cShadow);
          vec3 inscatter = mix(turquoise, body, smoothstep(10.0, 28.0, depthW));
          vec3 shallowCol = bedCol * absorb + inscatter * (1.0 - absorb);
          water = mix(shallowCol, body, smoothstep(20.0, 30.0, depthW));
        }
        vec3 col = mix(water, refl, fres);

        // Sun glitter: a sharp core plus a broad sheen, and the moon's path at night
        float sd = max(dot(r, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 900.0) * 8.0 + pow(sd, 90.0) * 0.35) * uSunVis * cShadow;
        col += vec3(0.7, 0.8, 1.0) * pow(max(dot(r, -uSunDir), 0.0), 300.0) * 1.2 * uStars;

        // Foam on the wave peaks, broken up into patches and streaks
        float foamNoise = fbm(vWorld.xz * 0.35 + vec2(uTime * 0.12, uTime * 0.05));
        float streaks = vnoise(vec2(vWorld.x * 0.9 + vWorld.z * 0.4, vWorld.z * 0.25 - uTime * 0.3));
        float crestFoam = smoothstep(0.78, 0.95, crest + (foamNoise - 0.5) * 0.3) * (0.5 + 0.5 * streaks) * uFoam * 2.0;

        // Surf near the beach: foam lines rolling in with the swash, and a foam edge at the waterline
        float shore = 1.0 - smoothstep(0.0, 2.5, depthW);
        float surf = smoothstep(0.6, 1.0, sin(uTime * 0.7 - dIn * 0.12 + sin(vWorld.x * 0.02 + uTime * 0.3) * 1.5 + 0.8));
        float edgeFoam = 1.0 - smoothstep(0.0, 0.12, depthW);
        float shoreFoam = (surf * shore * 0.8 + edgeFoam) * (0.6 + 0.6 * foamNoise);

        float foam = clamp(max(crestFoam, shoreFoam), 0.0, 1.0) * (1.0 - far * 0.5);
        col = mix(col, vec3(0.95) * uLight * (0.7 + 0.3 * diff), foam);

        // Boat lights shining on the water: a soft pool plus glints on the waves
        for (int i = 0; i < 5; i++) {
          vec3 L = uBoatLightPos[i] - vWorld;
          float ld = length(L);
          L /= ld;
          float range = i == 4 ? 60.0 : 14.0;
          float att = 1.0 - smoothstep(0.0, range, ld);
          att *= att;
          if (i == 4) att *= smoothstep(0.82, 0.95, dot(-L, uBoatSpotDir));
          float diffL = max(dot(n, L), 0.0);
          float specL = pow(max(dot(r, L), 0.0), 40.0);
          col += uBoatLightColor[i] * att * (diffL * 0.5 + specL * 1.5);
        }

        // Fade into the horizon so the edge of the water meets the sky
        vec3 fogCol = skyColor(normalize(vec3(-v.x + 1e-4, 0.0, -v.z)));
        col = mix(col, fogCol, smoothstep(uFogNear, uFogFar, dist));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
);
// The water draws after the other solid objects and doesn't hide what's beneath it in the depth
// buffer, so fish and dolphins can be drawn afterwards, tinted as if seen through the water.
water.renderOrder = 1;
water.material.depthWrite = false;
scene.add(water);

// Far ocean: a flat ring from the edge of the detailed water out to the horizon, in the same haze
// colour the water fades into. It covers the underwater slopes of the coast and islands that
// would otherwise show through beyond the detailed water.
const farOceanGeo = new THREE.RingGeometry(380, 9000, 96, 1);
farOceanGeo.rotateX(-Math.PI / 2);
const farOcean = new THREE.Mesh(
  farOceanGeo,
  new THREE.ShaderMaterial({
    uniforms: shared,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      varying vec3 vWorld;
      void main() {
        vec3 v = normalize(cameraPosition - vWorld);
        gl_FragColor = vec4(skyColor(normalize(vec3(-v.x + 1e-4, 0.0, -v.z))), 1.0);
      }
    `,
  })
);
// Drawn after the land (so it covers the underwater slopes) but before the detailed water,
// so near wave crests are painted over it instead of being cut off by it at the horizon
farOcean.renderOrder = 0.5;
farOcean.frustumCulled = false;
scene.add(farOcean);

// Makes a material look like it's under the water when below the surface: colours fade with the
// distance travelled through the water (red first), and it blends in less at grazing angles.
// wag > 0 also swishes the tail end of the mesh (for fish).
function applyUnderwater(material, wag = 0) {
  material.transparent = true;
  material.customProgramCacheKey = () => "underwater-" + wag;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uLight = waterUniforms.uLight;
    shader.vertexShader =
      (wag ? "attribute float aPhase;\nuniform float uTime;\n" : "") +
      "varying vec3 vUW;\n" +
      shader.vertexShader
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          ${wag ? `transformed.x += sin(uTime * 14.0 + aPhase) * ${wag.toFixed(3)} * smoothstep(-0.05, 0.3, transformed.z);` : ""}`
        )
        .replace(
          "#include <fog_vertex>",
          `#include <fog_vertex>
          vec4 uwPos = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            uwPos = instanceMatrix * uwPos;
          #endif
          vUW = (modelMatrix * uwPos).xyz;`
        );
    shader.fragmentShader =
      "uniform float uLight;\nvarying vec3 vUW;\n" +
      shader.fragmentShader.replace(
        "#include <fog_fragment>",
        `float below = -vUW.y;
        if (below > 0.0) {
          vec3 rd = normalize(vUW - cameraPosition);
          float pathLen = below / max(-rd.y, 0.08);
          vec3 absorb = exp(-pathLen * vec3(0.25, 0.05, 0.035));
          vec3 inscatter = vec3(0.02, 0.4, 0.5) * uLight;
          gl_FragColor.rgb = gl_FragColor.rgb * absorb + inscatter * (1.0 - absorb);
          float fres = 0.02 + 0.98 * pow(1.0 - abs(rd.y), 5.0);
          gl_FragColor.a *= (1.0 - fres) * (1.0 - smoothstep(12.0, 30.0, pathLen));
        }
        #include <fog_fragment>`
      );
  };
  return material;
}

// ===== Lights =====
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
const moonLight = new THREE.DirectionalLight(0x8899cc, 0);
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x223344, 0.5);
scene.add(sunLight, sunLight.target, moonLight, moonLight.target, hemiLight);

// ===== Distant haze for far-away scenery (shoreline, lighthouse) =====
const haze = {
  uHazeNear: { value: 250 },
  uHazeFar: { value: 2600 },
  uHazeMax: { value: 0.8 },
};
// Pale limestone like sea cliffs: ivory and buff layers, orange iron staining,
// dark rain streaks, pitting and grain. rockBump gives the surface relief for lighting.
const ROCK_GLSL = /* glsl */ `
  varying float vRock;
  vec3 limestone(vec3 p) {
    float warp = (shoreNoise(p.x * 0.02) - 0.5) * 3.0 + (shoreNoise(p.z * 0.03 + 5.0) - 0.5) * 2.0;
    float t = p.y * 0.3 + warp;
    float layer = shoreHash(floor(t) * 1.7 + 3.0);
    vec3 col = mix(vec3(0.92, 0.88, 0.8), vec3(0.8, 0.71, 0.58), layer);
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.1, fract(t));
    float stain = smoothstep(0.45, 0.75, fbm3(p * 0.05 + vec3(0.0, p.y * 0.02, 0.0)));
    col = mix(col, vec3(0.88, 0.56, 0.28), stain * 0.7);
    float streak = smoothstep(0.55, 0.8, noise3(p * vec3(0.9, 0.06, 0.9)));
    col *= 1.0 - 0.28 * streak;
    float pit = smoothstep(0.72, 0.85, noise3(p * 2.2));
    col *= 1.0 - 0.35 * pit;
    col *= 0.88 + 0.24 * noise3(p * 6.0);
    return col;
  }
  float rockBump(vec3 p) {
    return noise3(p * 0.35) * 1.2 + noise3(p * vec3(0.2, 1.5, 0.2)) * 0.6
         + noise3(p * 1.3) * 0.4 + noise3(p * 4.0) * 0.12;
  }
`;

// Town buildings: rows of windows on every wall, dark glass by day, many lit warm at night
const cityLights = { value: 0 };
const CITY_WINDOWS_GLSL = /* glsl */ `
  {
    vec3 wn = normalize(vWorldN);
    if (abs(wn.y) < 0.5) {
      vec2 along = normalize(vec2(-wn.z, wn.x));
      float u = dot(vCloudWorld.xz, along) / 2.8;
      float v = vCloudWorld.y / 3.2;
      vec2 f = fract(vec2(u, v));
      float win = step(0.28, f.x) * step(f.x, 0.72) * step(0.32, f.y) * step(f.y, 0.78);
      float lit = step(0.42, hash3(vec3(floor(u), floor(v), floor(dot(vCloudWorld.xz, wn.xz)))));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.1, 0.13, 0.17), win * 0.65 * (1.0 - uCityLights));
      gl_FragColor.rgb += vec3(1.0, 0.76, 0.42) * win * lit * uCityLights * 1.6;
    }
  }
`;

// opts.terrain: per-vertex rock mask (aRock) on the cliffs; opts.stack: sea stacks (all limestone);
// opts.rock: boulders (their own instance colour with grain); opts.city: town buildings with windows
function applyHaze(material, opts = {}) {
  const mode = opts.terrain ? "terrain" : opts.stack ? "stack" : opts.rock ? "rock" : opts.city ? "city" : "plain";
  material.customProgramCacheKey = () => "haze-" + mode;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHazeNear = haze.uHazeNear;
    shader.uniforms.uHazeFar = haze.uHazeFar;
    shader.uniforms.uHazeMax = haze.uHazeMax;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunVis = shared.uSunVis;
    shader.uniforms.uCloudCover = shared.uCloudCover;
    shader.uniforms.uCloudOffset = shared.uCloudOffset;
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uTime = shared.uTime;

    const rockValue = mode === "terrain" ? "aRock" : mode === "plain" || mode === "city" ? "0.0" : "1.0";
    shader.uniforms.uCityLights = cityLights;
    shader.vertexShader =
      (mode === "terrain" ? "attribute float aRock;\n" : "") +
      "varying vec3 vCloudWorld;\nvarying float vRock;\nvarying vec3 vWorldN;\n" +
      shader.vertexShader.replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        vec4 cloudPos = vec4(transformed, 1.0);
        vec3 worldN = objectNormal;
        #ifdef USE_INSTANCING
          cloudPos = instanceMatrix * cloudPos;
          worldN = mat3(instanceMatrix) * worldN;
        #endif
        vCloudWorld = (modelMatrix * cloudPos).xyz;
        vWorldN = mat3(modelMatrix) * worldN;
        vRock = ${rockValue};`
      );

    // Boulders keep their own colour with some grain; cliffs and stacks are limestone
    const rockAlbedo =
      mode === "rock" ? "diffuseColor.rgb * (0.8 + 0.4 * noise3(rp * 2.5))" : "limestone(rp)";

    shader.fragmentShader =
      "uniform float uHazeNear;\nuniform float uHazeFar;\nuniform float uHazeMax;\n" +
      "uniform vec3 uSunDir;\nuniform float uSunVis;\nuniform vec3 uSunColor;\nuniform float uTime;\n" +
      "varying vec3 vCloudWorld;\nvarying vec3 vWorldN;\nuniform float uCityLights;\n" +
      CLOUD_GLSL +
      SHORE_GLSL +
      ROCK_GLSL +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          if (vRock > 0.0) {
            vec3 rp = vCloudWorld;
            vec3 rockCol = ${rockAlbedo};
            float aboveSwash = rp.y - swashLevel(rp.xz, uTime);
            // Dark, wet, algae-stained rock where the waves splash
            float splashZone = 1.0 - smoothstep(0.0, 1.6, aboveSwash);
            rockCol = mix(rockCol, rockCol * vec3(0.5, 0.5, 0.42), splashZone);
            // Orange and pink encrusting coral just above the water
            float crust = smoothstep(0.5, 0.65, noise3(rp * 0.8)) * (1.0 - smoothstep(0.3, 1.2, aboveSwash));
            vec3 crustCol = mix(vec3(0.97, 0.45, 0.12), vec3(0.85, 0.42, 0.58), noise3(rp * 0.3 + 9.0));
            rockCol = mix(rockCol, crustCol * (0.75 + 0.35 * noise3(rp * 5.0)), crust * 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, vRock);
          }`
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          // Rock relief: bump the normal with the gradient of a world-space height pattern
          if (vRock > 0.0) {
            vec3 bp = vCloudWorld;
            float be = 0.15;
            float bh = rockBump(bp);
            vec3 bg = vec3(rockBump(bp + vec3(be, 0.0, 0.0)) - bh,
                           rockBump(bp + vec3(0.0, be, 0.0)) - bh,
                           rockBump(bp + vec3(0.0, 0.0, be)) - bh) / be;
            vec3 gv = (viewMatrix * vec4(bg, 0.0)).xyz;
            gv -= dot(gv, normal) * normal;
            float bumpFade = 1.0 - smoothstep(60.0, 300.0, length(cameraPosition - bp));
            normal = normalize(normal - gv * 0.5 * vRock * bumpFade);
          }`
        )
        .replace(
          "#include <fog_fragment>",
          `vec3 wp = vCloudWorld;
        float cs = cloudShadow(wp, uSunDir);
        gl_FragColor.rgb *= 1.0 - 0.45 * (1.0 - cs) * uSunVis;
        ${mode === "city" ? CITY_WINDOWS_GLSL : ""}

        // Beach: sand darkened where the waves have just washed over it
        float sandMask = (1.0 - smoothstep(2.5, 4.0, wp.y)) * (1.0 - smoothstep(130.0, 160.0, inlandDist(wp.xz)));
        sandMask *= 1.0 - vRock;
        float sw = swashLevel(wp.xz, uTime);
        float wet = max(1.0 - smoothstep(0.3, 0.7, wp.y), 1.0 - smoothstep(0.0, 0.3, wp.y - sw)) * sandMask;
        gl_FragColor.rgb *= 1.0 - 0.38 * wet;

        // Sand grains glinting in the sun: each tiny cell has a random facet that catches
        // the sun only from certain angles, so the sparkle shimmers as you move
        vec3 V = normalize(cameraPosition - wp);
        float distC = length(cameraPosition - wp);
        vec2 cell = floor(wp.xz * 12.0);
        float wobble = sin(uTime * 3.0 + hash3(vec3(cell, 4.0)) * 6.28) * 0.05;
        vec3 gn = normalize(vec3(hash3(vec3(cell, 2.0)) - 0.5 + wobble, 0.9, hash3(vec3(cell, 3.0)) - 0.5));
        float glint = pow(max(dot(reflect(-V, gn), uSunDir), 0.0), 400.0) * step(0.55, hash3(vec3(cell, 1.0)));
        gl_FragColor.rgb += uSunColor * glint * 5.0 * sandMask * (1.0 - wet) * uSunVis * cs *
          (1.0 - smoothstep(40.0, 180.0, distC));

        #ifdef USE_FOG
          float hazeF = smoothstep(uHazeNear, uHazeFar, fogDepth) * uHazeMax;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hazeF);
        #endif`
        );
  };
  return material;
}

// ===== Shoreline =====
// Turns a smooth slope into ledges and steep steps, like eroded sedimentary layers
function terrace(y, step) {
  const s = y / step;
  const i = Math.floor(s);
  return (i + smooth(0, 0.45, s - i)) * step;
}

// ===== River: comes down a valley east of the lighthouse and forks into two mouths through a swampy delta =====
// Points are [x, d] with d = distance inland from the shoreline at that x
const shoreZAt = (x) => SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60;
const RIVER_PATHS = [
  { w: 14, pts: [[830, 900], [805, 640], [822, 420], [800, 190]] }, // main river
  { w: 10, pts: [[800, 190], [762, 110], [722, 40], [700, -20]] }, // western mouth
  { w: 10, pts: [[800, 190], [848, 115], [888, 45], [912, -20]] }, // eastern mouth
];
const RIVER_SEGS = [];
for (const path of RIVER_PATHS) {
  const p = path.pts.map(([x, d]) => [x, shoreZAt(x) - d]);
  for (let i = 0; i < p.length - 1; i++) RIVER_SEGS.push({ ax: p[i][0], az: p[i][1], bx: p[i + 1][0], bz: p[i + 1][1], w: path.w });
}
const SWAMP = { x: 800, z: shoreZAt(800) - 95, r: 160 };

// Distance from the edge of the nearest river channel (negative = in the water)
function riverDist(x, z) {
  let best = 1e9;
  for (const s of RIVER_SEGS) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz), 0, 1);
    const dist = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)) - s.w / 2;
    if (dist < best) best = dist;
  }
  return best;
}
// 1 inside the swampy delta between the two mouths, fading out at its edges
function swampMask(x, z) {
  const d = inland(x, z);
  return (1 - smooth(SWAMP.r * 0.65, SWAMP.r, Math.hypot(x - SWAMP.x, z - SWAMP.z))) * smooth(4, 18, d);
}
const lerp = (a, b, t) => a + (b - a) * t;

// Cuts the river valley, its channels and the swamp into the land
function carveRiver(x, z, y) {
  const r = riverDist(x, z);
  if (r > 220) return y;
  const plain = 0.9 + Math.max(0, r) * 0.025; // a low floodplain along the river
  y = Math.min(y, lerp(plain, y, smooth(40, 220, r)));
  const sw = swampMask(x, z);
  if (sw > 0) y = lerp(y, 0.32 + (fbm2(x * 0.05, z * 0.05) - 0.5) * 0.9, sw); // hummocks and pools
  return Math.min(y, lerp(-1.3, y, smooth(-1, 5, r))); // the channel itself
}

function landHeight(x, z) {
  const d = inland(x, z);
  if (d < 0) return seaBed(x, z);
  const beachY = beachProfile(d);

  // Sandy cove backed by green hills
  let coveY = beachY + smooth(110, 360, d) * (25 + 110 * fbm2(x * 0.0025, z * 0.0025));
  coveY += (fbm2(x * 0.03, z * 0.03) - 0.5) * 3 * smooth(40, 90, d);

  // Limestone cliff rising from a rocky shelf at the waterline, cut by gullies and buttresses
  const cliffH = 32 + 26 * noise1(x * 0.01 + 3.1);
  // Gullies and buttresses kept broad enough (≥ ~15 m) for the 5 m terrain grid to draw smoothly,
  // otherwise the cliff edge breaks up into jagged sawtooth spikes on the horizon
  const gully = (noise1(x * 0.03 + 11) - 0.5) * 16 + (noise1(x * 0.065 + 3) - 0.5) * 5;
  const rise = smooth(12, 30, d + gully + (noise2(x * 0.04, z * 0.04) - 0.5) * 6);
  const step = 3.5 + 2 * noise1(x * 0.02 + 1.7);
  let cliffY = -0.3 + Math.min(d, 10) * 0.09 + terrace(cliffH * rise, step);
  cliffY += smooth(45, 300, d) * (8 + 50 * fbm2(x * 0.0025, z * 0.0025));
  cliffY += (fbm2(x * 0.08, z * 0.08) - 0.5) * 1.5 * smooth(8, 20, d);

  const y = coveY + (cliffY - coveY) * cliffAmount(x);
  return x > 450 && x < 1150 ? carveRiver(x, z, y) : y;
}

function buildShoreline() {
  const width = 6000;
  const depth = 1120;
  const centerZ = SHORE_Z - 340;
  const geo = new THREE.PlaneGeometry(width, depth, 1200, 320);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + centerZ;
    pos.setY(i, landHeight(x, z));
  }
  geo.computeVertexNormals();

  const sand = new THREE.Color(0xe3d3a8);
  const wetSand = new THREE.Color(0x8f8468);
  const grass = new THREE.Color(0x5b7a37);
  const forest = new THREE.Color(0x3f5a2c);
  const rock = new THREE.Color(0x7a7a72);
  const plateau = new THREE.Color(0xd6c29c);
  const scrub = new THREE.Color(0x7b7a48);
  const lush = new THREE.Color(0x4f7a32);
  const swampCol = new THREE.Color(0x4a5230);
  const mud = new THREE.Color(0x5e5238);
  const colors = new Float32Array(pos.count * 3);
  const rockMask = new Float32Array(pos.count);
  const c = new THREE.Color();
  const normals = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i) + centerZ;
    const ny = normals.getY(i);
    const cm = cliffAmount(x);
    c.copy(wetSand).lerp(sand, smooth(-1, 0.8, y));
    c.lerp(grass, smooth(2, 6, y) * (1 - cm));
    c.lerp(forest, smooth(15, 40, y) * noise2(x * 0.01, z * 0.01) * (1 - cm));
    c.lerp(plateau, smooth(1, 4, y) * cm);
    c.lerp(scrub, smooth(0.55, 0.8, noise2(x * 0.06, z * 0.06)) * smooth(20, 40, y) * cm * 0.6);
    c.lerp(rock, Math.max(smooth(60, 100, y), 1 - smooth(0.6, 0.85, ny)) * smooth(1, 4, y) * (1 - cm));
    if (x > 450 && x < 1150) {
      // Lush floodplain, muddy banks and dark swamp along the river
      const r = riverDist(x, z);
      c.lerp(lush, (1 - smooth(20, 90, r)) * smooth(0.6, 1.2, y) * 0.8);
      c.lerp(swampCol, swampMask(x, z) * 0.85);
      c.lerp(mud, 1 - smooth(0, 7, r));
    }
    c.multiplyScalar(0.88 + 0.24 * noise2(x * 0.05, z * 0.05));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    // Exposed rock: cliff faces and the shelf at their base (shaded as limestone in the shader)
    rockMask[i] = clamp(cm * Math.max(1 - smooth(0.7, 0.93, ny), 1 - smooth(1.0, 2.5, y)), 0, 1);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aRock", new THREE.BufferAttribute(rockMask, 1));

  const land = new THREE.Mesh(
    geo,
    applyHaze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { terrain: true })
  );
  land.position.z = centerZ;
  return land;
}
scene.add(buildShoreline());

// ===== Sea stacks =====
// [offset from the lighthouse along x, distance offshore, radius, height above water]
const STACK_SPOTS = [
  [-95, -48, 5.5, 34],
  [-40, -72, 6.5, 42],
  [25, -58, 5.0, 30],
  [88, -86, 7.0, 38],
  [132, -40, 3.5, 18],
];
const seaStacks = STACK_SPOTS.map(([dx, d, r, h], i) => {
  const x = LH_X + dx;
  const z = SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60 - d;
  return { x, z, r, h, seed: i * 7.31 + 2.0 };
});

function buildSeaStack(r, h, seed) {
  const below = 14;
  const geo = new THREE.CylinderGeometry(1, 1, 1, 40, 70, false);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const pz = p.getZ(i);
    const t = p.getY(i) + 0.5; // 0 at the bottom, 1 at the top
    const rl = Math.hypot(px, pz); // 0 at a cap centre, 1 on the sides
    const a = Math.atan2(pz, px);
    let y = -below + t * (h + below);
    const ca = Math.cos(a);
    const sa = Math.sin(a);

    let rr = r;
    rr *= 1 + 0.35 * smooth(2, -4, y); // flared base under water
    rr *= 1 - 0.1 * Math.sin(Math.PI * clamp(y / h, 0, 1)); // slight waist
    rr *= 1 - 0.2 * Math.exp(-(((y - 0.7) / 1.3) ** 2)); // wave-cut notch at the waterline
    rr *= 1 + 0.06 * Math.sin(y * 1.3 + seed); // layered ledges
    rr *= 0.78 + 0.44 * cloudNoise3(ca * 1.3 + seed, y * 0.12, sa * 1.3);
    rr *= 0.95 + 0.1 * cloudNoise3(ca * 4 + seed, y * 0.6, sa * 4);

    // Rounded, jagged crown
    if (t > 0.999) y += 1.5 * (1 - rl) * r * 0.3;
    y += (cloudNoise3(ca * 2 + seed, 3.3, sa * 2) - 0.5) * 4 * smooth(0.85, 1, t);

    p.setXYZ(i, ca * rr * rl, y, sa * rr * rl);
  }
  geo.computeVertexNormals();
  return geo;
}

const stackMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), { stack: true });
for (const s of seaStacks) {
  const mesh = new THREE.Mesh(buildSeaStack(s.r, s.h, s.seed), stackMat);
  mesh.position.set(s.x, 0, s.z);
  mesh.rotation.y = s.seed;
  scene.add(mesh);
}

// ===== Shore rocks: natural clusters at the cliff foot and around the sea stacks =====
function buildShoreRocks() {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.78 + 0.32 * cloudNoise3(x * 1.2 + 3, y * 1.2, z * 1.2) + 0.08 * cloudNoise3(x * 4, y * 4 + 7, z * 4);
    p.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  geo.computeVertexNormals();

  const mat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), { rock: true });

  // Cluster centres
  const clusters = [];
  for (let x = -2800; x < 2800; x += rand(70, 150)) {
    if (cliffAmount(x) < 0.6) continue;
    const d = rand(-5, 3);
    const z = SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60 - d;
    clusters.push({ x, z, spread: rand(3, 6), count: 3 + Math.floor(rand(0, 5)), big: rand(1.2, 2.2), stack: null });
  }
  for (const s of seaStacks) {
    clusters.push({ x: s.x, z: s.z, spread: 3, count: 6 + Math.floor(rand(0, 4)), big: 1.6, stack: s });
  }

  const total = clusters.reduce((n, c) => n + c.count, 0);
  const rocks = new THREE.InstancedMesh(geo, mat, total);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0;
  for (const c of clusters) {
    for (let k = 0; k < c.count; k++) {
      // One or two larger rocks per cluster, the rest smaller around them
      const size = k === 0 ? c.big : rand(0.3, 0.6) * c.big;
      let x;
      let z;
      let y;
      if (c.stack) {
        const a = rand(0, Math.PI * 2);
        const rr = c.stack.r * 1.05 + rand(0, c.spread);
        x = c.x + Math.cos(a) * rr;
        z = c.z + Math.sin(a) * rr;
        y = rand(-0.9, 0.1);
      } else {
        const a = rand(0, Math.PI * 2);
        const rr = k === 0 ? 0 : rand(0.6, 1) * c.spread;
        x = c.x + Math.cos(a) * rr;
        z = c.z + Math.sin(a) * rr;
        y = Math.max(landHeight(x, z), -1.2) + size * 0.2;
      }
      v.set(x, y, z);
      e.set(rand(-0.3, 0.3), rand(0, Math.PI * 2), rand(-0.3, 0.3));
      q.setFromEuler(e);
      s.set(size * rand(0.9, 1.3), size * rand(0.55, 0.8), size * rand(0.9, 1.3));
      m.compose(v, q, s);
      rocks.setMatrixAt(n, m);
      col.setHSL(rand(0.08, 0.11), rand(0.15, 0.3), rand(0.62, 0.78));
      rocks.setColorAt(n, col);
      n++;
    }
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  return rocks;
}
scene.add(buildShoreRocks());

// Tell the water shader where the stacks stand, so their rocky bases show through the water
seaStacks.forEach((s, i) => waterUniforms.uStacks.value[i].set(s.x, s.z, s.r, 1));

// ===== Lighthouse =====
function makeGlowTexture() {
  const size = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,240,200,0.6)");
  grad.addColorStop(1, "rgba(255,220,160,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}
const glowTexture = makeGlowTexture();

function buildLighthouse() {
  const zTip = SHORE_Z + headland(LH_X) + (noise1(LH_X * 0.008) - 0.5) * 60 - 55;
  const group = new THREE.Group();
  group.position.set(LH_X, landHeight(LH_X, zTip) - 1, zTip);

  const white = applyHaze(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.7 }));
  const red = applyHaze(new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.7 }));
  const dark = applyHaze(new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6 }));

  // Striped tapering tower
  for (let i = 0; i < 5; i++) {
    const r0 = 4.5 - 1.5 * (i / 5);
    const r1 = 4.5 - 1.5 * ((i + 1) / 5);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 6, 16), i % 2 === 0 ? white : red);
    seg.position.y = 3 + 6 * i;
    group.add(seg);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 0.8, 16), dark);
  gallery.position.y = 30.4;
  group.add(gallery);

  const lanternMat = applyHaze(
    new THREE.MeshStandardMaterial({ color: 0x33302a, emissive: 0xffe2a0, emissiveIntensity: 0, roughness: 0.2 })
  );
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4, 12), lanternMat);
  lantern.position.y = 32.8;
  group.add(lantern);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.5, 12), red);
  roof.position.y = 36.1;
  group.add(roof);

  const house = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), white);
  house.position.set(8, 2.5, 2);
  group.add(house);
  const houseRoof = new THREE.Mesh(new THREE.ConeGeometry(6, 3, 4), red);
  houseRoof.position.set(8, 6.5, 2);
  houseRoof.rotation.y = Math.PI / 4;
  group.add(houseRoof);

  // Rotating beams (two, opposite each other)
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff1c8,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const beamGeo = new THREE.ConeGeometry(14, 500, 20, 1, true);
  beamGeo.translate(0, -250, 0);
  beamGeo.rotateZ(Math.PI / 2); // apex at the lamp, pointing along +x
  const beams = new THREE.Group();
  beams.position.y = 32.8;
  const beamA = new THREE.Mesh(beamGeo, beamMat);
  const beamB = new THREE.Mesh(beamGeo, beamMat);
  beamB.rotation.y = Math.PI;
  beams.add(beamA, beamB);
  group.add(beams);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffe6b0,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  glow.position.y = 32.8;
  group.add(glow);

  return { group, lanternMat, beams, beamMat, glow };
}
const lighthouse = buildLighthouse();
scene.add(lighthouse.group);

// ===== Boat =====
function buildBoat() {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);

  // Top-down hull outline; after rotation the bow points to -Z
  const outline = new THREE.Shape();
  outline.moveTo(-1.3, -3.8);
  outline.lineTo(1.3, -3.8);
  outline.lineTo(1.5, 0.8);
  outline.quadraticCurveTo(1.3, 3.0, 0, 4.4);
  outline.quadraticCurveTo(-1.3, 3.0, -1.5, 0.8);
  outline.lineTo(-1.3, -3.8);

  const hullGeo = new THREE.ExtrudeGeometry(outline, {
    depth: 1.5,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.15,
    bevelSegments: 2,
    curveSegments: 12,
  });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, -0.7, 0);
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }));
  tilt.add(hull);

  const stripeGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.25, bevelEnabled: false, curveSegments: 12 });
  stripeGeo.rotateX(-Math.PI / 2);
  stripeGeo.scale(1.15, 1, 1.06);
  stripeGeo.translate(0, 0.1, 0);
  tilt.add(new THREE.Mesh(stripeGeo, new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 })));

  const deckGeo = new THREE.ShapeGeometry(outline, 12);
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.scale(0.92, 1, 0.94);
  deckGeo.translate(0, 0.98, 0);
  tilt.add(new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.8 })));

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 1.3, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.6 })
  );
  cabin.position.set(0, 1.63, 0.9);
  tilt.add(cabin);

  const windowMat = new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.2, emissive: 0xffc070, emissiveIntensity: 0 });
  const windows = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.45, 2.24), windowMat);
  windows.position.set(0, 1.85, 0.9);
  tilt.add(windows);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.12, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x1f3a5f, roughness: 0.6 })
  );
  roof.position.set(0, 2.34, 0.9);
  tilt.add(roof);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.5 })
  );
  mast.position.set(0, 3.1, 1.4);
  tilt.add(mast);

  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe0a0, emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), lampMat);
  lamp.position.set(0, 3.85, 1.4);
  tilt.add(lamp);

  const lampLight = new THREE.PointLight(0xffd9a0, 0, 30, 2);
  lampLight.position.copy(lamp.position);
  tilt.add(lampLight);

  // Navigation lights (brightness is set in applyEnvironment)
  const navLights = [];
  function addNavLight(color, x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat);
    bulb.position.set(x, y, z);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.set(1.2, 1.2, 1);
    glow.position.copy(bulb.position);
    tilt.add(bulb, glow);
    navLights.push({ bulb, mat, glow, color: new THREE.Color(color) });
  }
  addNavLight(0xff2a2a, -1.06, 1.7, -0.15); // port (red)
  addNavLight(0x2aff5a, 1.06, 1.7, -0.15); // starboard (green)
  addNavLight(0xffffff, 0, 1.15, 3.9); // stern (white)

  // Forward searchlight on the cabin roof
  const headlampMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff2d8, emissiveIntensity: 0 });
  const headlamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.15), headlampMat);
  headlamp.position.set(0, 2.5, -0.35);
  tilt.add(headlamp);
  const headlight = new THREE.SpotLight(0xfff2d8, 0, 70, 0.4, 0.5, 1);
  headlight.position.set(0, 2.5, -0.45);
  headlight.target.position.set(0, -1.5, -25);
  tilt.add(headlight, headlight.target);

  return { root, tilt, windowMat, lamp, lampMat, lampLight, navLights, headlight, headlampMat };
}

const boat = buildBoat();
scene.add(boat.root);

// ===== Splashes (shared by dolphins and fish) =====
const SPLASH_COUNT = 800;
const splashPos = new Float32Array(SPLASH_COUNT * 3).fill(-1000);
const splashVel = new Float32Array(SPLASH_COUNT * 3);
const splashLife = new Float32Array(SPLASH_COUNT);
let splashNext = 0;
const splashGeo = new THREE.BufferGeometry();
splashGeo.setAttribute("position", new THREE.BufferAttribute(splashPos, 3));
const splashMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.85, depthWrite: false });
const splashPoints = new THREE.Points(splashGeo, splashMat);
splashPoints.frustumCulled = false;
scene.add(splashPoints);

function splash(x, y, z, count, power) {
  for (let n = 0; n < count; n++) {
    const i = splashNext;
    splashNext = (splashNext + 1) % SPLASH_COUNT;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * power * 0.5;
    splashPos[i * 3] = x + Math.cos(a) * 0.3;
    splashPos[i * 3 + 1] = y;
    splashPos[i * 3 + 2] = z + Math.sin(a) * 0.3;
    splashVel[i * 3] = Math.cos(a) * r;
    splashVel[i * 3 + 1] = rand(0.5, 1) * power;
    splashVel[i * 3 + 2] = Math.sin(a) * r;
    splashLife[i] = rand(0.5, 1.1);
  }
}

function updateSplashes(dt) {
  for (let i = 0; i < SPLASH_COUNT; i++) {
    if (splashLife[i] <= 0) continue;
    splashLife[i] -= dt;
    splashVel[i * 3 + 1] -= 9.8 * dt;
    splashPos[i * 3] += splashVel[i * 3] * dt;
    splashPos[i * 3 + 1] += splashVel[i * 3 + 1] * dt;
    splashPos[i * 3 + 2] += splashVel[i * 3 + 2] * dt;
    if (splashLife[i] <= 0) splashPos[i * 3 + 1] = -1000;
  }
  splashGeo.attributes.position.needsUpdate = true;
}

// ===== Dolphins =====
const dolphinMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x6b7c8c, roughness: 0.35 }));

function buildDolphin() {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";

  const bodyGeo = new THREE.SphereGeometry(1, 16, 12);
  bodyGeo.scale(0.45, 0.42, 1.6);
  g.add(new THREE.Mesh(bodyGeo, dolphinMat));

  const snoutGeo = new THREE.SphereGeometry(1, 10, 8);
  snoutGeo.scale(0.12, 0.1, 0.4);
  const snout = new THREE.Mesh(snoutGeo, dolphinMat);
  snout.position.set(0, -0.08, -1.65);
  g.add(snout);

  const finGeo = new THREE.ConeGeometry(0.28, 0.6, 4);
  finGeo.scale(0.3, 1, 1);
  const fin = new THREE.Mesh(finGeo, dolphinMat);
  fin.position.set(0, 0.55, 0.15);
  fin.rotation.x = 0.5;
  g.add(fin);

  const flukes = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.35), dolphinMat);
  flukes.position.set(0, 0, 1.65);
  g.add(flukes);

  for (const side of [-1, 1]) {
    const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.2), dolphinMat);
    flipper.position.set(side * 0.45, -0.2, -0.5);
    flipper.rotation.z = side * -0.4;
    g.add(flipper);
  }
  return g;
}

const dolphins = [];
for (let i = 0; i < 5; i++) {
  const mesh = buildDolphin();
  mesh.visible = false;
  scene.add(mesh);
  dolphins.push({ mesh, active: false, x: 0, z: 0, yaw: 0, speed: 8, right: 0, fwd: 0, period: 3, phase: 0, prevRel: -3 });
}
const pod = { active: false, timer: 8, life: 0 };

function spawnPod() {
  const b = state.boat;
  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  const rx = Math.cos(b.yaw);
  const rz = -Math.sin(b.yaw);
  const side = Math.random() < 0.5 ? -1 : 1;
  const count = 3 + Math.floor(Math.random() * 3);
  pod.active = true;
  pod.life = rand(10, 18); // how long they stay curious about the boat
  pod.awayYaw = null;
  for (let i = 0; i < count; i++) {
    const d = dolphins[i];
    d.active = true;
    d.right = side * (8 + i * 3 + rand(0, 4));
    d.fwd = rand(5, 25);
    const startRight = d.right * 2.5;
    const startFwd = d.fwd - 30;
    d.x = b.x + rx * startRight + fx * startFwd;
    d.z = b.z + rz * startRight + fz * startFwd;
    d.yaw = b.yaw;
    d.speed = 8;
    d.period = rand(2.6, 4.8);
    d.phase = rand(0, d.period);
    d.prevRel = -3;
    d.mesh.visible = true;
  }
}

function updateDolphins(dt, t) {
  if (!pod.active) {
    pod.timer -= dt;
    if (pod.timer <= 0) spawnPod();
    return;
  }
  const b = state.boat;
  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  const rx = Math.cos(b.yaw);
  const rz = -Math.sin(b.yaw);
  pod.life -= dt;
  // They lose interest after a while, or straight away if the boat outruns them
  const podDist = dolphins.some((d) => d.active && Math.hypot(d.x - b.x, d.z - b.z) < 120);
  if (!podDist && pod.life > 0) pod.life = 0;
  const leaving = pod.life < 0;
  if (leaving && pod.awayYaw === null) {
    // Swim off in a direction roughly away from the boat
    const lead = dolphins.find((d) => d.active);
    pod.awayYaw = Math.atan2(-(lead.x - b.x), -(lead.z - b.z)) + Math.PI + rand(-0.8, 0.8);
  }
  const JUMP = 1.3;
  let anyActive = false;

  for (const d of dolphins) {
    if (!d.active) continue;
    anyActive = true;

    let tx;
    let tz;
    if (!leaving) {
      tx = b.x + rx * d.right + fx * d.fwd;
      tz = b.z + rz * d.right + fz * d.fwd;
    } else {
      tx = d.x - Math.sin(pod.awayYaw) * 100;
      tz = d.z - Math.cos(pod.awayYaw) * 100;
    }
    const dx = tx - d.x;
    const dz = tz - d.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(-dx, -dz);
    d.yaw += clamp(wrapAngle(desired - d.yaw), -1.5 * dt, 1.5 * dt);
    // Top speed is capped, so a fast boat leaves them behind
    const targetSpeed = leaving ? 10 : clamp(dist * 0.6, 6, Math.min(Math.abs(b.speed) + 5, 11));
    d.speed += (targetSpeed - d.speed) * (1 - Math.exp(-dt * 1.5));
    d.x -= Math.sin(d.yaw) * d.speed * dt;
    d.z -= Math.cos(d.yaw) * d.speed * dt;

    // Leap cycle: underwater most of the time, arcing out of the water periodically
    d.phase += dt;
    if (d.phase > d.period) {
      d.phase -= d.period;
      d.period = rand(2.6, 4.8);
    }
    let rel = -3;
    let vy = 0;
    if (d.phase < JUMP && pod.life > -10) {
      const u = d.phase / JUMP;
      rel = -1.6 + 3.2 * Math.sin(Math.PI * u);
      vy = ((3.2 * Math.PI) / JUMP) * Math.cos(Math.PI * u);
    }
    const h = waveHeight(d.x, d.z, t);
    if (d.prevRel < 0 !== rel < 0 && rel > -2.5 && d.prevRel > -2.5) splash(d.x, h, d.z, 25, 3);
    d.prevRel = rel;

    d.mesh.position.set(d.x, h + rel, d.z);
    d.mesh.rotation.set(Math.atan2(vy, Math.max(d.speed, 4)), d.yaw, 0);

    if (pod.life < -16) {
      d.active = false;
      d.mesh.visible = false;
    }
  }
  if (!anyActive) {
    pod.active = false;
    pod.timer = rand(20, 45);
  }
}

// ===== Fish =====
const fishMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0xb8c4cc, metalness: 0.6, roughness: 0.3 }));

function buildFish() {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const bodyGeo = new THREE.SphereGeometry(1, 8, 6);
  bodyGeo.scale(0.09, 0.14, 0.35);
  g.add(new THREE.Mesh(bodyGeo, fishMat));
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.12), fishMat);
  tail.position.z = 0.38;
  g.add(tail);
  return g;
}

const fishes = [];
for (let i = 0; i < 8; i++) {
  const mesh = buildFish();
  mesh.visible = false;
  scene.add(mesh);
  fishes.push({ mesh, active: false, x: 0, z: 0, yaw: 0, t: 0, dur: 1, height: 1, speed: 5 });
}
let fishTimer = 1;

function updateFish(dt, t) {
  const b = state.boat;
  fishTimer -= dt;
  if (fishTimer <= 0) {
    fishTimer = rand(0.4, 2.4);
    const f = fishes.find((fish) => !fish.active);
    if (f) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(10, 60);
      f.active = true;
      f.x = b.x + Math.cos(a) * r;
      f.z = b.z + Math.sin(a) * r;
      f.yaw = Math.random() * Math.PI * 2;
      f.t = 0;
      f.dur = rand(0.6, 0.9);
      f.height = rand(0.6, 1.3);
      f.speed = rand(4, 7);
      f.mesh.visible = true;
      splash(f.x, waveHeight(f.x, f.z, t), f.z, 8, 1.5);
    }
  }

  for (const f of fishes) {
    if (!f.active) continue;
    f.t += dt;
    const u = f.t / f.dur;
    if (u >= 1) {
      f.active = false;
      f.mesh.visible = false;
      splash(f.x, waveHeight(f.x, f.z, t), f.z, 8, 1.5);
      continue;
    }
    f.x -= Math.sin(f.yaw) * f.speed * dt;
    f.z -= Math.cos(f.yaw) * f.speed * dt;
    const rel = -0.2 + (f.height + 0.2) * Math.sin(Math.PI * u);
    const vy = (((f.height + 0.2) * Math.PI) / f.dur) * Math.cos(Math.PI * u);
    f.mesh.position.set(f.x, waveHeight(f.x, f.z, t) + rel, f.z);
    f.mesh.rotation.set(Math.atan2(vy, f.speed), f.yaw, Math.sin(f.t * 30) * 0.2);
  }
}

// ===== Reef fish schools (orange anthias swimming around the reef near the shore) =====
const SCHOOL_COUNT = 3;
const FISH_PER_SCHOOL = 90;

function buildReefFishGeometries() {
  // Body: a lathed, laterally flattened teardrop, nose toward -Z
  const profile = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    profile.push(new THREE.Vector2(Math.max(0.001, 0.11 * Math.sin(Math.PI * Math.pow(t, 0.8))), -0.2 + t * 0.4));
  }
  const body = new THREE.LatheGeometry(profile, 10);
  body.rotateX(Math.PI / 2);
  body.scale(0.45, 1, 1);

  // Forked tail fin behind the body
  const tail = new THREE.BufferGeometry();
  tail.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0.17, 0, 0.12, 0.36, 0, 0.02, 0.29, 0, 0, 0.17, 0, -0.02, 0.29, 0, -0.12, 0.36],
      3
    )
  );
  tail.computeVertexNormals();
  return { body, tail };
}

const reefFishGeo = buildReefFishGeometries();
const reefBodyMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }), 0.03);
const reefTailMat = applyUnderwater(
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide }),
  0.09
);

const TOTAL_REEF_FISH = SCHOOL_COUNT * FISH_PER_SCHOOL;
const phases = new Float32Array(TOTAL_REEF_FISH).map(() => rand(0, Math.PI * 2));
reefFishGeo.body.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
reefFishGeo.tail.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
const reefBodies = new THREE.InstancedMesh(reefFishGeo.body, reefBodyMat, TOTAL_REEF_FISH);
const reefTails = new THREE.InstancedMesh(reefFishGeo.tail, reefTailMat, TOTAL_REEF_FISH);
reefBodies.frustumCulled = false;
reefTails.frustumCulled = false;
{
  const col = new THREE.Color();
  for (let i = 0; i < TOTAL_REEF_FISH; i++) {
    const r = Math.random();
    if (r < 0.85) col.setHSL(rand(0.03, 0.08), 0.95, rand(0.5, 0.6)); // orange
    else if (r < 0.93) col.setHSL(rand(0.12, 0.15), 0.95, 0.55); // yellow
    else col.setHSL(rand(0.75, 0.82), 0.6, 0.55); // purple
    reefBodies.setColorAt(i, col);
    reefTails.setColorAt(i, col);
  }
}
scene.add(reefBodies, reefTails);

// Each school hangs around a spot near the boat (while the boat is near the coast),
// kept over water at least a few metres deep, and wanders slowly.
const schools = [
  { offX: -14, offZ: -22 },
  { offX: 16, offZ: -30 },
  { offX: -4, offZ: 18 },
].map((s, i) => ({
  ...s,
  x: 0,
  z: -200,
  y: -3,
  heading: 0,
  placed: false,
  seed: i * 13.7,
  fish: Array.from({ length: FISH_PER_SCHOOL }, () => ({
    ox: rand(-1, 1) * 4,
    oy: rand(-1, 1) * 0.8,
    oz: rand(-1, 1) * 6,
    phase: rand(0, Math.PI * 2),
    scale: rand(0.8, 1.2),
  })),
}));

const fishMatrix = new THREE.Matrix4();
const fishQuat = new THREE.Quaternion();
const fishEuler = new THREE.Euler(0, 0, 0, "YXZ");
const fishPos = new THREE.Vector3();
const fishScale = new THREE.Vector3();

function updateReefFish(dt, t) {
  const b = state.boat;
  const nearShore = inland(b.x, b.z) > -450;
  reefBodies.visible = reefTails.visible = nearShore;
  if (!nearShore) {
    for (const s of schools) s.placed = false;
    return;
  }

  let idx = 0;
  schools.forEach((s, si) => {
    // Target: near the boat, wandering, pushed out to water at least 3 m deep
    let tx = b.x + s.offX + Math.sin(t * 0.1 + s.seed) * 15;
    let tz = b.z + s.offZ + Math.cos(t * 0.13 + s.seed) * 10;
    for (let k = 0; k < 30 && seaBed(tx, tz) > -3; k++) tz += 4;
    if (!s.placed) {
      s.x = tx;
      s.z = tz;
      s.placed = true;
    }

    const dx = tx - s.x;
    const dz = tz - s.z;
    const dist = Math.hypot(dx, dz);
    const speed = Math.min(dist * 0.5, 4);
    if (dist > 0.01) {
      s.x += (dx / dist) * speed * dt;
      s.z += (dz / dist) * speed * dt;
    }
    // Face the way the school moves; drift around slowly when it's idle
    const desired = speed > 0.3 ? Math.atan2(-dx, -dz) : s.heading + dt * 0.3;
    s.heading += clamp(wrapAngle(desired - s.heading), -dt * 1.2, dt * 1.2);

    const bed = seaBed(s.x, s.z);
    const targetY = clamp(bed + 2.5, -6, -1.2);
    s.y += (targetY - s.y) * (1 - Math.exp(-dt));

    const ch = Math.cos(s.heading);
    const sh = Math.sin(s.heading);
    for (const f of s.fish) {
      // Offsets in the school's own frame, gently swirling
      const sway = Math.sin(t * 0.8 + f.phase);
      const lx = f.ox + sway * 0.6;
      const lz = f.oz + Math.cos(t * 0.6 + f.phase) * 0.8;
      fishPos.set(s.x + lx * ch + lz * sh, s.y + f.oy + Math.sin(t * 1.3 + f.phase) * 0.2, s.z - lx * sh + lz * ch);
      fishEuler.set(Math.sin(t * 0.9 + f.phase) * 0.1, s.heading + sway * 0.25, 0);
      fishQuat.setFromEuler(fishEuler);
      fishScale.setScalar(f.scale);
      fishMatrix.compose(fishPos, fishQuat, fishScale);
      reefBodies.setMatrixAt(idx, fishMatrix);
      reefTails.setMatrixAt(idx, fishMatrix);
      idx++;
    }
  });
  reefBodies.instanceMatrix.needsUpdate = true;
  reefTails.instanceMatrix.needsUpdate = true;
}

// ===== Birds =====
const birdMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide });
const birdBodyGeo = new THREE.SphereGeometry(0.12, 8, 6);
birdBodyGeo.scale(1, 0.8, 3);

function wingGeometry(side) {
  const geo = new THREE.BufferGeometry();
  const verts = side < 0 ? [0, 0, -0.18, 0, 0, 0.14, -0.95, 0, 0.06] : [0, 0, 0.14, 0, 0, -0.18, 0.95, 0, 0.06];
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}
const wingGeoL = wingGeometry(-1);
const wingGeoR = wingGeometry(1);

const birds = [];
const flock = { x: 0, z: -850 };
for (let i = 0; i < 12; i++) {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  g.add(new THREE.Mesh(birdBodyGeo, birdMat));
  const L = new THREE.Mesh(wingGeoL, birdMat);
  L.position.x = -0.06;
  const R = new THREE.Mesh(wingGeoR, birdMat);
  R.position.x = 0.06;
  g.add(L, R);
  scene.add(g);
  birds.push({
    g,
    L,
    R,
    radius: rand(18, 48),
    angle: rand(0, Math.PI * 2),
    angSpeed: rand(0.25, 0.5) * (Math.random() < 0.3 ? -1 : 1),
    alt: rand(18, 38),
    phase: rand(0, 10),
  });
}

function updateBirds(dt, t, light) {
  const b = state.boat;
  const visible = light > 0.25 && wx.storm < 0.5;
  const k = 1 - Math.exp(-dt * 0.5);
  flock.x += (b.x - Math.sin(b.yaw) * 25 - flock.x) * k;
  flock.z += (b.z - Math.cos(b.yaw) * 25 - flock.z) * k;

  for (const bird of birds) {
    bird.g.visible = visible;
    if (!visible) continue;
    bird.angle += bird.angSpeed * dt;
    const dir = Math.sign(bird.angSpeed);
    const x = flock.x + Math.cos(bird.angle) * bird.radius;
    const z = flock.z + Math.sin(bird.angle) * bird.radius;
    const y = bird.alt + Math.sin(t * 0.5 + bird.phase) * 2;
    const vx = -Math.sin(bird.angle) * dir;
    const vz = Math.cos(bird.angle) * dir;
    bird.g.position.set(x, y, z);
    bird.g.rotation.set(0, Math.atan2(-vx, -vz), -0.35 * dir);

    // Flap in bursts, glide in between
    const flapping = Math.sin(t * 0.7 + bird.phase) > 0.2 ? 1 : 0.15;
    const wing = Math.sin(t * 9 + bird.phase) * 0.6 * flapping + 0.1;
    bird.L.rotation.z = -wing;
    bird.R.rotation.z = wing;
  }
}

// ===== Airplanes =====
function buildAirplane() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xdfe3e8, fog: false });
  const dark = new THREE.MeshLambertMaterial({ color: 0x8a9099, fog: false });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 38, 10), mat);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2, 5, 10), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -21.5;
  group.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(36, 0.5, 6), mat);
  wing.position.set(0, -0.5, -1);
  group.add(wing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 4), mat);
  fin.position.set(0, 4, 16);
  group.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 3), mat);
  stab.position.set(0, 0.5, 17);
  group.add(stab);
  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 8), dark);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 7, -2, -2);
    group.add(engine);
  }

  // Contrails: cones that widen and fade behind the engines
  const trailMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 0.5 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float a = uOpacity * (1.0 - vUv.y) * smoothstep(0.0, 0.02, vUv.y);
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  const trailGeo = new THREE.CylinderGeometry(4, 0.8, 1, 8, 1, true);
  trailGeo.rotateX(Math.PI / 2);
  trailGeo.translate(0, 0, 0.5);
  const trails = [];
  for (const side of [-1, 1]) {
    const trail = new THREE.Mesh(trailGeo, trailMat);
    trail.position.set(side * 7, -2, 2);
    trail.scale.z = 1;
    group.add(trail);
    trails.push(trail);
  }

  // Navigation lights (red port, green starboard, white tail) and a strobe
  const navGeo = new THREE.BufferGeometry();
  navGeo.setAttribute("position", new THREE.Float32BufferAttribute([-18, -0.5, -1, 18, -0.5, -1, 0, 2, 20], 3));
  navGeo.setAttribute("color", new THREE.Float32BufferAttribute([1, 0.1, 0.1, 0.1, 1, 0.2, 1, 1, 1], 3));
  const navMat = new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, fog: false });
  group.add(new THREE.Points(navGeo, navMat));

  const strobeGeo = new THREE.BufferGeometry();
  strobeGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, -2.2, 0], 3));
  const strobe = new THREE.Points(strobeGeo, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, color: 0xffffff, fog: false }));
  group.add(strobe);

  return { group, trails, trailMat, navMat, strobe };
}

const airplane = buildAirplane();
airplane.group.visible = false;
scene.add(airplane.group);
const flight = { active: false, timer: 15, dir: new THREE.Vector3(), speed: 200, traveled: 0 };

function updateAirplane(dt, t, lightLevel) {
  const b = state.boat;
  if (!flight.active) {
    flight.timer -= dt;
    if (flight.timer <= 0) {
      if (wx.overcast > 0.5) {
        flight.timer = 10; // too cloudy to see, try later
        return;
      }
      const a = Math.random() * Math.PI * 2;
      flight.dir.set(Math.cos(a), 0, Math.sin(a));
      const offset = rand(-700, 700);
      airplane.group.position.set(
        b.x - Math.sin(a) * offset - flight.dir.x * 1700,
        rand(450, 700),
        b.z + Math.cos(a) * offset - flight.dir.z * 1700
      );
      airplane.group.rotation.y = Math.atan2(-flight.dir.x, -flight.dir.z);
      flight.speed = rand(180, 240);
      flight.traveled = 0;
      flight.active = true;
      airplane.group.visible = true;
    }
    return;
  }

  airplane.group.position.addScaledVector(flight.dir, flight.speed * dt);
  flight.traveled += flight.speed * dt;
  const trailLength = Math.max(1, Math.min(flight.traveled, 600));
  for (const trail of airplane.trails) trail.scale.z = trailLength;

  airplane.trailMat.uniforms.uColor.value.setRGB(1, 1, 1).lerp(shared.uSunColor.value, 0.4 * shared.uSunset.value);
  airplane.trailMat.uniforms.uColor.value.multiplyScalar(lightLevel);
  airplane.trailMat.uniforms.uOpacity.value = 0.55 * smooth(0.15, 0.4, lightLevel) * (1 - wx.overcast);
  airplane.navMat.opacity = 0.3 + 0.7 * (1 - smooth(0.2, 0.6, lightLevel));
  airplane.strobe.visible = t % 1.3 < 0.07;

  if (flight.traveled > 3400) {
    flight.active = false;
    flight.timer = rand(25, 75);
    airplane.group.visible = false;
  }
}

// ===== Rain =====
const RAIN_COUNT = 3000;
const RAIN_BOX = 70;
const RAIN_HEIGHT = 40;
const rainDrops = new Float32Array(RAIN_COUNT * 3);
for (let i = 0; i < RAIN_COUNT; i++) {
  rainDrops[i * 3] = rand(-RAIN_BOX / 2, RAIN_BOX / 2);
  rainDrops[i * 3 + 1] = rand(-5, RAIN_HEIGHT - 5);
  rainDrops[i * 3 + 2] = rand(-RAIN_BOX / 2, RAIN_BOX / 2);
}
const rainPos = new Float32Array(RAIN_COUNT * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.4, fog: false, depthWrite: false });
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
scene.add(rain);

function wrapTo(v, center, size) {
  const half = size / 2;
  if (v < center - half) return v + size;
  if (v > center + half) return v - size;
  return v;
}

function updateRain(dt, lightLevel) {
  const active = Math.floor(RAIN_COUNT * wx.rain);
  rain.visible = active > 0;
  if (!rain.visible) return;

  const vx = Math.cos(weather.windAngle) * weather.windSpeed * 0.5;
  const vz = Math.sin(weather.windAngle) * weather.windSpeed * 0.5;
  const vy = -22;
  const cam = camera.position;

  for (let i = 0; i < active; i++) {
    let x = rainDrops[i * 3] + vx * dt;
    let y = rainDrops[i * 3 + 1] + vy * dt;
    let z = rainDrops[i * 3 + 2] + vz * dt;
    x = wrapTo(x, cam.x, RAIN_BOX);
    z = wrapTo(z, cam.z, RAIN_BOX);
    const rainFloor = Math.max(cam.y - 10, 0.3); // rain stops at the water surface
    if (y < rainFloor) y += RAIN_HEIGHT;
    if (y > rainFloor + RAIN_HEIGHT) y -= RAIN_HEIGHT;
    rainDrops[i * 3] = x;
    rainDrops[i * 3 + 1] = y;
    rainDrops[i * 3 + 2] = z;

    const j = i * 6;
    rainPos[j] = x;
    rainPos[j + 1] = y;
    rainPos[j + 2] = z;
    rainPos[j + 3] = x - vx * 0.04;
    rainPos[j + 4] = y - vy * 0.04;
    rainPos[j + 5] = z - vz * 0.04;
  }
  rainGeo.setDrawRange(0, active * 2);
  rainGeo.attributes.position.needsUpdate = true;
  rainMat.opacity = 0.25 + 0.25 * wx.storm;
  rainMat.color.setRGB(0.67, 0.71, 0.75).multiplyScalar(Math.max(lightLevel, 0.25) + weather.flash);
}

// ===== Lightning =====
const BOLT_POINTS = 24;
const boltGeo = new THREE.BufferGeometry();
boltGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3));
const boltMat = new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, fog: false });
const bolt = new THREE.Line(boltGeo, boltMat);
bolt.frustumCulled = false;
bolt.visible = false;
scene.add(bolt);

function strike() {
  const b = state.boat;
  const a = Math.random() * Math.PI * 2;
  const dist = rand(250, 700);
  let x = b.x + Math.cos(a) * dist;
  let z = b.z + Math.sin(a) * dist;
  const pos = boltGeo.attributes.position;
  for (let i = 0; i < BOLT_POINTS; i++) {
    const y = 300 - (302 * i) / (BOLT_POINTS - 1);
    pos.setXYZ(i, x, y, z);
    x += rand(-12, 12);
    z += rand(-12, 12);
  }
  pos.needsUpdate = true;
  weather.flash = 1;
  weather.secondFlash = Math.random() < 0.6 ? rand(0.1, 0.25) : -1;
}

// ===== Weather update =====
function updateWeather(dt, advance) {
  if (advance) {
    weather.timer -= dt;
    if (weather.timer <= 0) {
      weather.target = WEATHER_TARGETS[Math.floor(Math.random() * WEATHER_TARGETS.length)];
      weather.timer = rand(45, 95);
    }
    const step = 0.015 * dt;
    weather.value += clamp(weather.target - weather.value, -step, step);
    weather.windAngle += rand(-0.5, 0.5) * 0.05 * dt;
  }

  const w = weather.value;
  wx.cover = 0.15 + 0.85 * smooth(0.0, 0.7, w);
  wx.overcast = smooth(0.25, 0.85, w);
  wx.rain = smooth(0.4, 0.65, w);
  wx.storm = smooth(0.75, 0.95, w);

  // Wind drives the waves and the clouds
  weather.windSpeed = 3 + 21 * w;
  waveScale = 0.55 + 1.45 * w;
  weather.cloudOffset.x += Math.cos(weather.windAngle) * weather.windSpeed * 1.5 * dt;
  weather.cloudOffset.y += Math.sin(weather.windAngle) * weather.windSpeed * 1.5 * dt;

  // Lightning in storms
  if (wx.storm > 0.2) {
    weather.strikeTimer -= dt;
    if (weather.strikeTimer <= 0) {
      strike();
      weather.strikeTimer = 3 + Math.random() * 10 * (1.2 - wx.storm);
    }
  }
  weather.flash = Math.max(0, weather.flash - dt * 5);
  if (weather.secondFlash > 0) {
    weather.secondFlash -= dt;
    if (weather.secondFlash <= 0) weather.flash = 0.8;
  }
  bolt.visible = weather.flash > 0.25;
  boltMat.opacity = weather.flash;
}

// ===== Time of day + weather lighting =====
const PALETTE = {
  nightTop: new THREE.Color(0x02050f),
  nightHorizon: new THREE.Color(0x0b1630),
  duskTop: new THREE.Color(0x28366e),
  duskHorizon: new THREE.Color(0xff8a4c),
  dayTop: new THREE.Color(0x2f6fd0),
  dayHorizon: new THREE.Color(0xb8dcf3),
  overcastTop: new THREE.Color(0x4f5761),
  overcastHorizon: new THREE.Color(0x7d858e),
  flash: new THREE.Color(0xc8d4ff),
  sunLow: new THREE.Color(0xff7a2a),
  sunHigh: new THREE.Color(0xfff3dd),
  deepWater: new THREE.Color(0x0b3553),
  shallowWater: new THREE.Color(0x1f7a8c),
  stormDeep: new THREE.Color(0x1a2a2e),
  stormShallow: new THREE.Color(0x3c5a5a),
};
const tmpColor = new THREE.Color();

function sunDirection(hours, out) {
  const a = ((hours - 6) / 24) * Math.PI * 2; // 6:00 sunrise, 12:00 highest, 18:00 sunset
  return out.set(Math.cos(a), Math.sin(a) * 0.9, 0.35).normalize();
}

function applyEnvironment(hours) {
  const sunDir = sunDirection(hours, shared.uSunDir.value);
  const e = sunDir.y; // sun elevation

  const day = smooth(0.0, 0.35, e);
  const night = 1 - smooth(-0.28, -0.02, e);
  const light = smooth(-0.2, 0.3, e);
  const lightLevel = 0.06 + 0.94 * light;
  const flash = weather.flash;

  const top = shared.uTop.value;
  const horizon = shared.uHorizon.value;
  top.copy(PALETTE.duskTop).lerp(PALETTE.nightTop, night).lerp(PALETTE.dayTop, day);
  horizon.copy(PALETTE.duskHorizon).lerp(PALETTE.nightHorizon, night).lerp(PALETTE.dayHorizon, day);

  // Overcast skies turn grey
  top.lerp(tmpColor.copy(PALETTE.overcastTop).multiplyScalar(lightLevel), wx.overcast * 0.85);
  horizon.lerp(tmpColor.copy(PALETTE.overcastHorizon).multiplyScalar(lightLevel), wx.overcast * 0.85);

  // Lightning flash
  if (flash > 0) {
    top.lerp(PALETTE.flash, flash * 0.6);
    horizon.lerp(PALETTE.flash, flash * 0.5);
  }

  shared.uSunColor.value.copy(PALETTE.sunLow).lerp(PALETTE.sunHigh, day);
  shared.uSunset.value = (1 - smooth(0.0, 0.3, Math.abs(e))) * (1 - 0.8 * wx.overcast);
  shared.uSunVis.value = smooth(-0.04, 0.02, e) * (1 - 0.9 * wx.overcast);
  shared.uStars.value = night * (1 - wx.overcast);
  shared.uAurora.value = night * (1 - wx.cover) * (0.75 + 0.25 * Math.sin(shared.uTime.value * 0.03));
  shared.uCloudCover.value = wx.cover;
  shared.uCloudDark.value = smooth(0.35, 0.95, weather.value);
  shared.uCloudOffset.value.copy(weather.cloudOffset);
  shared.uLightLevel.value = Math.max(lightLevel, 0.08) + flash * 0.8;

  waterUniforms.uLight.value = lightLevel * (1 - 0.3 * wx.overcast) + flash * 0.3;
  waterUniforms.uWaveScale.value = waveScale;
  waterUniforms.uFoam.value = 0.35 + 0.4 * wx.storm;
  waterUniforms.uDeep.value.copy(PALETTE.deepWater).lerp(PALETTE.stormDeep, wx.overcast);
  waterUniforms.uShallow.value.copy(PALETTE.shallowWater).lerp(PALETTE.stormShallow, wx.overcast);

  // Rain cuts visibility
  const fogNear = FOG_NEAR * (1 - 0.6 * wx.rain);
  const fogFar = FOG_FAR - 150 * wx.rain;
  scene.fog.near = fogNear;
  scene.fog.far = fogFar;
  waterUniforms.uFogNear.value = fogNear;
  waterUniforms.uFogFar.value = fogFar;
  haze.uHazeMax.value = 0.78 + 0.22 * wx.rain;
  haze.uHazeNear.value = 250 - 150 * wx.rain;

  scene.fog.color.copy(horizon);
  renderer.setClearColor(horizon);

  sunLight.color.copy(shared.uSunColor.value);
  sunLight.intensity = 1.1 * smooth(-0.02, 0.2, e) * (1 - 0.75 * wx.overcast);
  const b = state.boat;
  sunLight.intensity *= cloudShadowJS(b.x, b.y, b.z, sunDir, wx.cover, weather.cloudOffset);
  moonLight.intensity = 0.3 * night * (1 - wx.overcast);
  hemiLight.color.copy(horizon).lerp(top, 0.5);
  hemiLight.groundColor.copy(waterUniforms.uDeep.value).multiplyScalar(lightLevel);
  hemiLight.intensity = (0.25 + 0.45 * light) * (1 - 0.35 * wx.overcast) + flash * 1.5;

  // Lamps come on at dusk and in dark weather
  const lampsOn = Math.max(1 - smooth(-0.05, 0.1, e), wx.overcast * 0.8 * (1 - day * 0.5));
  boat.lampLight.intensity = 1.5 * lampsOn;
  boat.lampMat.emissiveIntensity = 2 * lampsOn;
  boat.windowMat.emissiveIntensity = 0.8 * lampsOn;
  for (const nav of boat.navLights) {
    nav.mat.emissiveIntensity = 2 * lampsOn;
    nav.glow.material.opacity = lampsOn;
  }
  boat.headlight.intensity = 2.5 * lampsOn;
  boat.headlampMat.emissiveIntensity = 2 * lampsOn;

  const boatLightColors = waterUniforms.uBoatLightColor.value;
  boatLightColors[0].set(1.0, 0.85, 0.6).multiplyScalar(0.8 * lampsOn);
  boat.navLights.forEach((nav, i) => {
    boatLightColors[i + 1].set(nav.color.r, nav.color.g, nav.color.b).multiplyScalar(0.9 * lampsOn);
  });
  boatLightColors[4].set(1.0, 0.95, 0.85).multiplyScalar(2.2 * lampsOn);
  lighthouse.lanternMat.emissiveIntensity = 0.3 + 2 * lampsOn;

  return { light, lightLevel, lampsOn };
}

function updateLighthouse(dt, lampsOn) {
  lighthouse.beams.rotation.y += dt * 0.9;
  lighthouse.beams.visible = lampsOn > 0.02;
  lighthouse.beamMat.opacity = 0.1 * lampsOn;

  // The lamp flares when a beam sweeps toward the camera
  const lx = lighthouse.group.position.x;
  const lz = lighthouse.group.position.z;
  const toCamX = camera.position.x - lx;
  const toCamZ = camera.position.z - lz;
  const len = Math.hypot(toCamX, toCamZ) || 1;
  const rot = lighthouse.beams.rotation.y;
  const facing = Math.abs(Math.cos(rot) * (toCamX / len) - Math.sin(rot) * (toCamZ / len));
  const flare = Math.pow(facing, 40);
  lighthouse.glow.visible = lampsOn > 0.02;
  lighthouse.glow.material.opacity = lampsOn;
  const size = 14 + 150 * flare;
  lighthouse.glow.scale.set(size, size, 1);
}

function formatClock(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ===== Boat update =====
const MAX_FORWARD = 20; // m/s
const MAX_REVERSE = -6;
const ACCEL = 9;
const DRAG = 0.35;
const TURN_RATE = 0.9; // rad/s at full steering authority

// How much room the boat has at a point, in metres: negative means blocked
// (water under 1.5 m deep, the coast, a sea stack or the pier)
function clearance(x, z) {
  let c = Math.min(-seaBed(x, z) - 1.5, -inland(x, z) - 3);
  for (const s of seaStacks) c = Math.min(c, Math.hypot(x - s.x, z - s.z) - (s.r * 1.6 + 3));
  const pier = Math.max(Math.abs(x - harbor.pierX) - 4, harbor.pierZ0 - z, z - (harbor.pierZ1 + 3));
  return Math.min(c, pier);
}
// Direction in which the clearance grows (toward open water), and how steeply (mag, per metre)
const clearanceVec = { x: 0, z: 1, mag: 0 };
function clearanceDir(x, z) {
  const e = 1;
  const gx = clearance(x + e, z) - clearance(x - e, z);
  const gz = clearance(x, z + e) - clearance(x, z - e);
  const len = Math.hypot(gx, gz);
  clearanceVec.mag = len / (2 * e);
  if (len < 1e-6) {
    clearanceVec.x = 0;
    clearanceVec.z = 1; // default: out to sea
  } else {
    clearanceVec.x = gx / len;
    clearanceVec.z = gz / len;
  }
  return clearanceVec;
}

function updateBoat(dt, t, controllable) {
  const b = state.boat;
  let throttle = 0;
  let turn = 0;
  if (controllable) {
    throttle = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    turn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    if (touch.active) {
      throttle = touch.throttle;
      turn = touch.turn;
    }
  }
  if (expedition.fuel <= 0) throttle = 0; // engine dead: drift and steer only
  b.throttle = throttle;

  b.speed += throttle * ACCEL * dt;
  b.speed -= b.speed * DRAG * dt;
  // In rough seas an ordinary hull has to slow down; the reinforced hull keeps full speed
  const topSpeed = owned("hull") ? MAX_FORWARD : MAX_FORWARD * (1 - 0.45 * wx.storm);
  b.speed = clamp(b.speed, MAX_REVERSE, topSpeed);

  // Rudder works best while moving, but the boat can always pivot slowly (so it can turn away from a wall)
  const steer = clamp(b.speed / 6, -1, 1);
  const pivot = Math.abs(steer) < 0.35 ? (b.speed < 0 ? -0.35 : 0.35) : steer;
  b.yaw += turn * TURN_RATE * pivot * dt;

  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  const rx = Math.cos(b.yaw);
  const rz = -Math.sin(b.yaw);

  // Where the boat wants to go this frame: its own motion plus wind drift
  let mx = fx * b.speed * dt;
  let mz = fz * b.speed * dt;
  if (controllable) {
    mx += Math.cos(weather.windAngle) * weather.windSpeed * 0.05 * dt;
    mz += Math.sin(weather.windAngle) * weather.windSpeed * 0.05 * dt;
  }

  // Shallows, cliffs, sea stacks and the pier: slide along them instead of getting stuck
  if (clearance(b.x + mx, b.z + mz) >= 0) {
    b.x += mx;
    b.z += mz;
  } else {
    const g = clearanceDir(b.x + mx, b.z + mz);
    const into = mx * g.x + mz * g.z;
    let nx = b.x + (into < 0 ? mx - g.x * into : mx);
    let nz = b.z + (into < 0 ? mz - g.z * into : mz);
    // On a curved edge the slide lands a hair inside it: nudge it back out onto the edge
    const c = clearance(nx, nz);
    if (c < 0) {
      const g2 = clearanceDir(nx, nz);
      const push = (-c + 0.01) / Math.max(g2.mag, 0.02);
      if (push < 1) {
        nx += g2.x * push;
        nz += g2.z * push;
      }
    }
    if (clearance(nx, nz) >= -0.01) {
      b.x = nx;
      b.z = nz;
      b.speed *= 1 - 1.5 * dt; // scraping along slows you a little
    } else {
      b.speed *= 1 - 4 * dt; // head-on: stop, but don't bounce
    }
  }
  // If the boat is ever inside a blocked spot (waves, wind, spawning), ease it back out to open water
  if (clearance(b.x, b.z) < 0) {
    const g = clearanceDir(b.x, b.z);
    b.x += g.x * 4 * dt;
    b.z += g.z * 4 * dt;
  }

  // Float on the waves: sample bow, stern, port and starboard
  const hBow = waveHeight(b.x + fx * 3.5, b.z + fz * 3.5, t);
  const hStern = waveHeight(b.x - fx * 3.5, b.z - fz * 3.5, t);
  const hRight = waveHeight(b.x + rx * 1.4, b.z + rz * 1.4, t);
  const hLeft = waveHeight(b.x - rx * 1.4, b.z - rz * 1.4, t);

  const targetY = (hBow + hStern + hRight + hLeft) / 4;
  const targetPitch = Math.atan2(hBow - hStern, 7) + b.speed * 0.005;
  const targetRoll = Math.atan2(hRight - hLeft, 2.8) * 0.7 + turn * steer * 0.08;

  const k = 1 - Math.exp(-dt * 4);
  b.y += (targetY - b.y) * k;
  b.pitch += (targetPitch - b.pitch) * k;
  b.roll += (targetRoll - b.roll) * k;

  boat.root.position.set(b.x, b.y, b.z);
  boat.root.rotation.y = b.yaw;
  boat.tilt.rotation.set(b.pitch, 0, b.roll);
}

const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// Orbit camera: drag to rotate around the boat, scroll or pinch to zoom, C to swing back behind it
const ORBIT_DEFAULT = { yaw: 0, pitch: 0.28, dist: 14.6 };
const orbit = { ...ORBIT_DEFAULT, active: 0 };

function updateCamera(dt, snap) {
  const b = state.boat;
  const h = b.yaw + orbit.yaw;
  const fx = -Math.sin(h);
  const fz = -Math.cos(h);
  const horiz = orbit.dist * Math.cos(orbit.pitch);
  camDesired.set(b.x - fx * horiz, b.y + 1.5 + orbit.dist * Math.sin(orbit.pitch), b.z - fz * horiz);
  // Never dip under the waves
  camDesired.y = Math.max(camDesired.y, waveHeight(camDesired.x, camDesired.z, shared.uTime.value) + 1.2);
  orbit.active = Math.max(0, orbit.active - dt);
  if (snap) camera.position.copy(camDesired);
  else camera.position.lerp(camDesired, 1 - Math.exp(-dt * (orbit.active > 0 ? 12 : 3)));
  // Look just past the boat; with the camera low, the gaze tilts up so you can see the sky
  camTarget.set(b.x + fx * 4, b.y + 1.5 + Math.max(0, ORBIT_DEFAULT.pitch - orbit.pitch) * 22, b.z + fz * 4);
  camera.lookAt(camTarget);
}

function resetOrbit() {
  Object.assign(orbit, ORBIT_DEFAULT);
  orbit.active = 0.6;
}

// Mouse and touch dragging on the 3D view (the joystick and buttons are separate elements)
const orbitPointers = new Map();
let pinchStart = null;
let dragMoved = 0; // pixels moved during the current press, to tell a tap from a drag
canvas.addEventListener("pointerdown", (e) => {
  orbitPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (orbitPointers.size === 1) dragMoved = 0;
  if (orbitPointers.size === 2) {
    const [a, b] = [...orbitPointers.values()];
    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: orbit.dist };
  }
});
canvas.addEventListener("pointermove", (e) => {
  const prev = orbitPointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  prev.x = e.clientX;
  prev.y = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (orbitPointers.size === 1) {
    orbit.yaw -= dx * 0.006;
    orbit.pitch = clamp(orbit.pitch + dy * 0.005, 0.02, 1.35);
  } else if (orbitPointers.size === 2 && pinchStart) {
    const [a, b] = [...orbitPointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    orbit.dist = clamp((pinchStart.zoom * pinchStart.dist) / Math.max(dist, 1), 6, 60);
  }
  orbit.active = 0.5;
});
const endOrbitPointer = (e) => {
  orbitPointers.delete(e.pointerId);
  if (orbitPointers.size < 2) pinchStart = null;
};
canvas.addEventListener("pointerup", endOrbitPointer);
canvas.addEventListener("pointercancel", endOrbitPointer);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    orbit.dist = clamp(orbit.dist * (1 + e.deltaY * 0.001), 6, 60);
    orbit.active = 0.5;
  },
  { passive: false }
);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyC" && !e.repeat) resetOrbit();
});

// ===== Harbor =====
// A wooden pier in the sandy cove: every expedition starts and ends here.
const harbor = (() => {
  const x = COVE_X;
  const shoreZ = SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60; // the waterline
  const pierZ0 = shoreZ - 6; // starts on the sand
  const pierZ1 = shoreZ + 58; // ends in about 2.5 m of water
  return { pierX: x, shoreZ, pierZ0, pierZ1, dockX: x + 8, dockZ: pierZ1 - 6 };
})();

function buildHarbor() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.7 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2f5d7c, roughness: 0.7 });
  const DECK_Y = 1.4;
  const len = harbor.pierZ1 - harbor.pierZ0;

  const deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, len), wood);
  deck.position.set(harbor.pierX, DECK_Y, (harbor.pierZ0 + harbor.pierZ1) / 2);
  g.add(deck);
  const end = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 6), wood);
  end.position.set(harbor.pierX + 2.5, DECK_Y, harbor.pierZ1 - 3);
  g.add(end);

  // Posts down to the sea floor
  const postGeo = new THREE.CylinderGeometry(0.16, 0.18, 1, 8);
  const addPost = (x, z) => {
    const ground = landHeight(x, z) - 0.5;
    const post = new THREE.Mesh(postGeo, darkWood);
    post.scale.y = DECK_Y + 0.3 - ground;
    post.position.set(x, (DECK_Y + 0.3 + ground) / 2, z);
    g.add(post);
  };
  for (let z = harbor.pierZ0 + 1; z <= harbor.pierZ1; z += 5) {
    addPost(harbor.pierX - 1.4, z);
    addPost(harbor.pierX + 1.4, z);
  }
  addPost(harbor.pierX + 6.3, harbor.pierZ1 - 0.3);
  addPost(harbor.pierX + 6.3, harbor.pierZ1 - 5.7);

  // Lamp at the end of the pier
  const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), darkWood);
  lampPost.position.set(harbor.pierX + 6, DECK_Y + 1.5, harbor.pierZ1 - 0.5);
  g.add(lampPost);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat);
  lamp.position.set(harbor.pierX + 6, DECK_Y + 3.1, harbor.pierZ1 - 0.5);
  g.add(lamp);
  const lampGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffd9a0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  lampGlow.scale.set(4, 4, 1);
  lampGlow.position.copy(lamp.position);
  g.add(lampGlow);

  // Boathouse on the beach
  const hx = harbor.pierX + 11;
  const hz = harbor.shoreZ - 22;
  const hy = landHeight(hx, hz);
  const house = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 5.5), white);
  house.position.set(hx, hy + 1.8, hz);
  g.add(house);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.2, 4), roofMat);
  roof.position.set(hx, hy + 4.7, hz);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.8);
  g.add(roof);

  return { g, lampMat, lampGlow };
}
const harborScene = buildHarbor();
scene.add(harborScene.g);

// ===== Hidden places: an old wreck to the west, a strange light to the east =====
function spotAtDepth(x, depth) {
  for (let d = -5; d > -700; d -= 2) {
    const z = SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60 - d;
    if (seaBed(x, z) <= -depth) return z;
  }
  return SHORE_Z + 500;
}
const WRECK = { x: -1500 };
WRECK.z = spotAtDepth(WRECK.x, 9);
WRECK.y = seaBed(WRECK.x, WRECK.z);
const GLOW = { x: 1550 };
GLOW.z = spotAtDepth(GLOW.x, 7);
GLOW.y = seaBed(GLOW.x, GLOW.z) + 0.8;
// Far out below the western cliffs, too deep to see from the surface: only sonar finds it
const DEEP_WRECK = { x: -2100 };
DEEP_WRECK.z = spotAtDepth(DEEP_WRECK.x, 18);
DEEP_WRECK.y = seaBed(DEEP_WRECK.x, DEEP_WRECK.z);

function buildWreck() {
  const g = new THREE.Group();
  const hullMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 }));
  const rustMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.9 }));
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.6, 13), hullMat);
  g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5, 4), hullMat);
  bow.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
  bow.scale.set(0.72, 1, 0.42);
  bow.position.set(0, 0, -9);
  g.add(bow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 3.5), rustMat);
  cabin.position.set(0.3, 2, 2.5);
  cabin.rotation.z = 0.25;
  g.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 8, 8), rustMat);
  mast.position.set(0, 4.5, -2);
  mast.rotation.z = -0.5;
  g.add(mast);
  // Broken ribs sticking up at the stern
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), hullMat);
    rib.position.set(i % 2 ? 2 : -2, 1.8, 5 + i * 0.8);
    rib.rotation.z = i % 2 ? -0.3 : 0.3;
    g.add(rib);
  }
  g.position.set(WRECK.x, WRECK.y + 1.1, WRECK.z);
  g.rotation.set(0.08, 0.7, 0.35); // lying tilted on the sea floor
  return g;
}
scene.add(buildWreck());

function buildDeepWreck() {
  const g = new THREE.Group();
  const hull = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.95 }));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(6, 4, 26), hull));
  const bow = new THREE.Mesh(new THREE.ConeGeometry(4.2, 7, 4), hull);
  bow.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
  bow.scale.set(0.72, 1, 0.5);
  bow.position.z = -16.5;
  g.add(bow);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 4, 10), hull);
  funnel.position.set(0, 4, 6);
  funnel.rotation.z = 0.5;
  g.add(funnel);
  g.position.set(DEEP_WRECK.x, DEEP_WRECK.y + 1.5, DEEP_WRECK.z);
  g.rotation.set(0.05, -0.6, -0.4);
  return g;
}
scene.add(buildDeepWreck());

function buildGlow() {
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.7, 1),
    applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x224444, emissive: 0x44ffe0, emissiveIntensity: 1.5 }))
  );
  core.position.set(GLOW.x, GLOW.y, GLOW.z);
  scene.add(core);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x55ffe6,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  halo.position.set(GLOW.x, -0.4, GLOW.z);
  halo.scale.set(22, 22, 1);
  scene.add(halo);
  return { core, halo };
}
const strangeGlow = buildGlow();

// ===== Islands: terrain, trees and animals =====
function randomOnIsland(I, tMin, tMax) {
  for (let k = 0; k < 200; k++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(0, I.R * 1.2);
    const x = I.x + Math.cos(a) * r;
    const z = I.z + Math.sin(a) * r;
    const t = islandInland(I, x, z);
    if (t >= tMin && t <= tMax) return { x, z, y: islandHeight(I, x, z) };
  }
  return { x: I.x, z: I.z, y: islandHeight(I, I.x, I.z) };
}

function buildIslandTerrain(I, rocky) {
  const size = 2 * (I.R * 1.25 + 60);
  const geo = new THREE.PlaneGeometry(size, size, 110, 110);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, islandHeight(I, pos.getX(i) + I.x, pos.getZ(i) + I.z));
  }
  geo.computeVertexNormals();
  const sand = new THREE.Color(0xe6d6ab);
  const wet = new THREE.Color(0x9a8c6c);
  const grass = new THREE.Color(rocky ? 0x8f8a78 : I.id === "goat" ? 0x8c8f4c : 0x6b8a3a);
  const rock = new THREE.Color(0xb9b1a0);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + I.x;
    const y = pos.getY(i);
    const z = pos.getZ(i) + I.z;
    c.copy(wet).lerp(sand, smooth(-0.5, 0.8, y));
    c.lerp(grass, smooth(1.2, 2.5, y));
    c.lerp(rock, Math.max(1 - smooth(0.7, 0.9, geo.attributes.normal.getY(i)), rocky ? smooth(0.3, 1.2, y) : 0));
    c.multiplyScalar(0.88 + 0.24 * noise2(x * 0.08, z * 0.08));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, applyHaze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  mesh.position.set(I.x, 0, I.z);
  return mesh;
}

const islandStoneMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xd9d1bf, roughness: 0.9 }));
const palmTrunkMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 0.9 }));
const leafMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x3f7a2e, roughness: 0.8, side: THREE.DoubleSide }));
const pineMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.9, flatShading: true }));

// Palm frond: a strip that arches out and droops, narrowing to the tip
const frondGeo = (() => {
  const g = new THREE.PlaneGeometry(1.0, 4.2, 1, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 2.1) / 4.2;
    p.setXYZ(i, p.getX(i) * (1 - t * 0.75), t * 0.9 - t * t * 2.0, t * 4.2);
  }
  g.computeVertexNormals();
  return g;
})();

const swayingCrowns = [];
function buildPalm(x, y, z, height) {
  const g = new THREE.Group();
  const lean = rand(0.8, 2.2);
  const leanDir = rand(0, Math.PI * 2);
  const lx = Math.cos(leanDir) * lean;
  const lz = Math.sin(leanDir) * lean;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lx * 0.2, height * 0.4, lz * 0.2),
    new THREE.Vector3(lx * 0.6, height * 0.75, lz * 0.6),
    new THREE.Vector3(lx, height, lz),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.2, 6), palmTrunkMat));
  const crown = new THREE.Group();
  crown.position.set(lx, height, lz);
  for (let k = 0; k < 8; k++) {
    const f = new THREE.Mesh(frondGeo, leafMat);
    f.rotation.y = (k / 8) * Math.PI * 2 + rand(-0.2, 0.2);
    f.rotation.x = rand(-0.25, 0.1);
    crown.add(f);
  }
  g.add(crown);
  g.position.set(x, y - 0.2, z);
  swayingCrowns.push({ crown, phase: rand(0, 6) });
  return g;
}

function buildPine(x, y, z, height) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, height, 6), palmTrunkMat);
  trunk.position.y = height / 2;
  g.add(trunk);
  for (let k = 0; k < 3; k++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.8, 2.6), 0), pineMat);
    blob.scale.set(1.3, 0.5, 1.3);
    blob.position.set(rand(-1, 1), height + rand(-0.3, 0.5), rand(-1, 1));
    g.add(blob);
  }
  g.position.set(x, y - 0.2, z);
  return g;
}

function buildBush(x, y, z) {
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.6, 1.2), 0), pineMat);
  b.scale.y = 0.7;
  b.position.set(x, y + 0.3, z);
  return b;
}

// --- Seals on Seal Rock ---
const sealMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x5f5a55, roughness: 0.5 }));
const seals = [];
function buildSeal() {
  const g = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(1, 12, 8);
  bodyGeo.scale(0.45, 0.38, 1.1);
  const body = new THREE.Mesh(bodyGeo, sealMat);
  body.position.y = 0.35;
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.55, -0.95);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), sealMat);
  skull.scale.z = 1.3;
  head.add(skull);
  g.add(head);
  for (const side of [-1, 1]) {
    const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.25), sealMat);
    flipper.position.set(side * 0.45, 0.1, -0.4);
    g.add(flipper);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), sealMat);
  tail.position.set(0, 0.12, 1.15);
  g.add(tail);
  return { g, head };
}

// --- Goats on Goat Island ---
const goatMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.9 }));
const goatDarkMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x6b5438, roughness: 0.9 }));
const goats = [];
function buildGoat(mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 1.0), mat);
  body.position.y = 0.75;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.42), mat);
  head.position.set(0, 1.1, -0.6);
  head.rotation.x = 0.3;
  g.add(head);
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 5), goatDarkMat);
    horn.position.set(side * 0.08, 1.33, -0.52);
    horn.rotation.x = 0.6;
    g.add(horn);
  }
  const legs = [];
  for (const [lx, lz] of [[-0.18, -0.38], [0.18, -0.38], [-0.18, 0.38], [0.18, 0.38]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.55, lz);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), mat);
    leg.position.y = -0.27;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }
  return { g, legs };
}

// --- Sea turtles swimming around Palm Islet ---
const turtleShellMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x5d6b3a, roughness: 0.6 }));
const turtleSkinMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x9a9670, roughness: 0.7 }));
const turtles = [];
function buildTurtle() {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const shellGeo = new THREE.SphereGeometry(0.6, 12, 8);
  shellGeo.scale(1, 0.35, 1.25);
  g.add(new THREE.Mesh(shellGeo, turtleShellMat));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), turtleSkinMat);
  head.position.set(0, 0.02, -0.85);
  g.add(head);
  const flippers = [];
  for (const [side, front] of [[-1, 1], [1, 1], [-1, 0], [1, 0]]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.5, 0, front ? -0.35 : 0.5);
    const f = new THREE.Mesh(new THREE.BoxGeometry(front ? 0.7 : 0.35, 0.04, front ? 0.28 : 0.2), turtleSkinMat);
    f.position.x = side * (front ? 0.35 : 0.17);
    pivot.add(f);
    g.add(pivot);
    flippers.push({ pivot, side, front });
  }
  return { g, flippers };
}

function buildIslands() {
  // Palm Islet: palms, bushes, and turtles in the lagoon around it
  const palm = ISLAND.palm;
  scene.add(buildIslandTerrain(palm, false));
  for (let k = 0; k < 9; k++) {
    const p = randomOnIsland(palm, 5, palm.R * 0.7);
    scene.add(buildPalm(p.x, p.y, p.z, rand(6, 10)));
  }
  for (let k = 0; k < 10; k++) {
    const p = randomOnIsland(palm, 8, palm.R);
    scene.add(buildBush(p.x, p.y, p.z));
  }
  for (let k = 0; k < 2; k++) {
    const t = buildTurtle();
    scene.add(t.g);
    turtles.push({ ...t, angle: k * Math.PI, radius: palm.R + 26 + k * 10, speed: 0.03 + k * 0.01, phase: k * 2 });
  }

  // Seal Rock: bare rock with a colony of seals lounging on it
  const sealRock = ISLAND.seal;
  scene.add(buildIslandTerrain(sealRock, true));
  for (let k = 0; k < 6; k++) {
    const p = randomOnIsland(sealRock, 1.5, 10);
    const s = buildSeal();
    s.g.position.set(p.x, p.y, p.z);
    s.g.rotation.y = rand(0, Math.PI * 2);
    scene.add(s.g);
    seals.push({ ...s, phase: rand(0, 6) });
  }

  // Goat Island: pines, goats, and old ruins on the hilltop with a statue
  const goat = ISLAND.goat;
  scene.add(buildIslandTerrain(goat, false));
  for (let k = 0; k < 14; k++) {
    const p = randomOnIsland(goat, 10, goat.R * 0.75);
    const top = islandSummit(goat);
    if (Math.hypot(p.x - top.x, p.z - top.z) < 16) continue; // keep the hilltop clear for the ruins
    scene.add(buildPine(p.x, p.y, p.z, rand(3.5, 6)));
  }
  for (let k = 0; k < 16; k++) {
    const p = randomOnIsland(goat, 6, goat.R);
    scene.add(buildBush(p.x, p.y, p.z));
  }
  for (let k = 0; k < 5; k++) {
    const gt = buildGoat(k % 3 === 2 ? goatDarkMat : goatMat);
    const p = randomOnIsland(goat, 12, goat.R * 0.8);
    gt.g.position.set(p.x, p.y, p.z);
    scene.add(gt.g);
    goats.push({ ...gt, x: p.x, z: p.z, tx: p.x, tz: p.z, wait: rand(0, 4), walk: 0 });
  }
  scene.add(buildHilltopRuins(goat));
}

// ===== Ruins and statues =====
function buildColumn(mat, height, radius = 0.5, broken = false) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.6, 0.35, radius * 2.6), mat);
  base.position.y = 0.17;
  g.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.88, radius, height, 12), mat);
  shaft.position.y = 0.35 + height / 2;
  g.add(shaft);
  if (!broken) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.6, 0.4, radius * 2.6), mat);
    cap.position.y = 0.35 + height + 0.2;
    g.add(cap);
  } else {
    // Jagged broken top
    const chunk = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.88, radius * 1.2, 7), mat);
    chunk.position.y = 0.35 + height + radius * 0.3;
    chunk.rotation.z = 0.4;
    g.add(chunk);
  }
  return g;
}

// A robed figure on a plinth, one arm stretched out toward the east — toward the strange light
function buildWatcher(mat) {
  const g = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.4), mat);
  plinth.position.y = 0.8;
  g.add(plinth);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, 3.4, 10), mat);
  robe.position.y = 1.6 + 1.7;
  g.add(robe);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.55, 1.2, 10), mat);
  chest.position.y = 1.6 + 3.4 + 0.6;
  g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), mat);
  head.position.y = 1.6 + 3.4 + 1.2 + 0.5;
  g.add(head);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 2.2, 8), mat);
  arm.position.set(1.1, 1.6 + 3.4 + 1.0, 0);
  arm.rotation.z = -1.2; // raised, pointing out to sea
  g.add(arm);
  const otherArm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 1.8, 8), mat);
  otherArm.position.set(-0.7, 1.6 + 3.4 + 0.2, 0);
  otherArm.rotation.z = 0.25;
  g.add(otherArm);
  return g;
}

function buildHilltopRuins(I) {
  const g = new THREE.Group();
  const top = islandSummit(I); // built on the true summit, so the statue shows from every side
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = top.x + Math.cos(a) * 8;
    const z = top.z + Math.sin(a) * 8;
    const broken = k % 3 !== 0;
    const col = buildColumn(islandStoneMat, broken ? rand(1.5, 3.5) : 5, 0.45, broken);
    col.position.set(x, islandHeight(I, x, z) - 0.2, z);
    g.add(col);
  }
  // Fallen drums and blocks
  for (let k = 0; k < 6; k++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(4, 13);
    const x = top.x + Math.cos(a) * r;
    const z = top.z + Math.sin(a) * r;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, rand(0.8, 2), 10), islandStoneMat);
    drum.rotation.set(Math.PI / 2, rand(0, Math.PI), 0);
    drum.position.set(x, islandHeight(I, x, z) + 0.35, z);
    g.add(drum);
  }
  const watcher = buildWatcher(islandStoneMat);
  watcher.scale.setScalar(1.3);
  watcher.position.set(top.x, top.y - 0.3, top.z);
  g.add(watcher);
  return g;
}

// ===== Underwater: a sunken temple and a drowned colossus, a sailboat wreck, a rusted freighter =====
function spotAt(x, depth) {
  const z = spotAtDepth(x, depth);
  return { x, z, y: seaBed(x, z) };
}
const TEMPLE = spotAt(-640, 6);
const COLOSSUS = spotAt(-575, 7);
const SAILBOAT = spotAt(LH_X + 330, 5);
const FREIGHTER = { x: -1250, z: -640, y: seaBed(-1250, -640) };

const sunkenStoneMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.9 }));
const mossStoneMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x9aa68a, roughness: 0.95 }));

function buildSunkenTemple() {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 12), mossStoneMat);
  floor.position.y = 0.5;
  g.add(floor);
  const heights = [5.5, 3, 5.5, 2, 4, 5.5, 1.5, 5.5, 3.5, 2.5];
  for (let k = 0; k < 10; k++) {
    const row = k < 5 ? -1 : 1;
    const i = k % 5;
    const h = heights[k];
    const col = buildColumn(sunkenStoneMat, h, 0.5, h < 5);
    col.position.set(-7 + i * 3.5, 1, row * 4.5);
    g.add(col);
  }
  // A lintel still resting across two columns, and two toppled columns
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 1.4), sunkenStoneMat);
  lintel.position.set(-5.25, 1 + 0.35 + 5.5 + 0.4 + 0.4, -4.5);
  g.add(lintel);
  for (const [x, z, r] of [[2, 0.5, 0.3], [-3, 1.5, 1.2]]) {
    const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 5, 12), sunkenStoneMat);
    fallen.rotation.set(Math.PI / 2, r, 0);
    fallen.position.set(x, 1.5, z);
    g.add(fallen);
  }
  g.position.set(TEMPLE.x, TEMPLE.y - 0.3, TEMPLE.z);
  g.rotation.y = 0.4;
  return g;
}

function buildColossus() {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 16), sunkenStoneMat);
  face.scale.set(0.85, 1.15, 0.9);
  g.add(face);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 0.8), sunkenStoneMat);
  nose.position.set(0, 0.1, -1.95);
  nose.rotation.x = -0.15;
  g.add(nose);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.6), sunkenStoneMat);
  brow.position.set(0, 0.85, -1.7);
  g.add(brow);
  const lips = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4), sunkenStoneMat);
  lips.position.set(0, -1.0, -1.85);
  g.add(lips);
  const eyeMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 1 }));
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), eyeMat);
    eye.position.set(side * 0.62, 0.45, -1.8);
    eye.scale.z = 0.4;
    g.add(eye);
  }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 1.0, 12), mossStoneMat);
  crown.position.y = 2.6;
  g.add(crown);
  g.position.set(COLOSSUS.x, COLOSSUS.y + 1.2, COLOSSUS.z);
  g.rotation.set(-0.5, 2.4, 0.35); // lying tilted, face turned up toward the surface
  return g;
}

function buildSailboatWreck() {
  const g = new THREE.Group();
  const wood = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.95 }));
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, -3.5);
  shape.lineTo(1.1, -3.5);
  shape.lineTo(1.3, 0.8);
  shape.quadraticCurveTo(1.1, 2.8, 0, 4);
  shape.quadraticCurveTo(-1.1, 2.8, -1.3, 0.8);
  shape.lineTo(-1.1, -3.5);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false, curveSegments: 10 });
  hullGeo.rotateX(-Math.PI / 2);
  g.add(new THREE.Mesh(hullGeo, wood));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), wood);
  mast.rotation.set(Math.PI / 2 - 0.2, 0, 0.3);
  mast.position.set(1.8, 0.4, 1);
  g.add(mast);
  g.position.set(SAILBOAT.x, SAILBOAT.y + 0.3, SAILBOAT.z);
  g.rotation.set(0.05, 1.1, 0.5);
  return g;
}

// A freighter run aground: bow up out of the water, stern and bridge sunk just below the surface
function buildFreighter() {
  const g = new THREE.Group();
  const steel = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x353a40, roughness: 0.7, metalness: 0.3 }));
  const rust = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x7a3b1c, roughness: 0.9 }));
  const deckMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 }));
  const shape = new THREE.Shape();
  shape.moveTo(-4.5, -20);
  shape.lineTo(4.5, -20);
  shape.lineTo(4.6, 12);
  shape.quadraticCurveTo(4.2, 20, 0, 25);
  shape.quadraticCurveTo(-4.2, 20, -4.6, 12);
  shape.lineTo(-4.5, -20);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: false, curveSegments: 12 });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, -4, 0);
  g.add(new THREE.Mesh(hullGeo, steel));
  const band = new THREE.Mesh(hullGeo, rust);
  band.scale.set(1.01, 0.3, 1.005);
  band.position.y = -1.2;
  g.add(band);
  const deckGeo = new THREE.ShapeGeometry(shape, 12);
  deckGeo.rotateX(-Math.PI / 2);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 4.02;
  deck.scale.set(0.97, 1, 0.98);
  g.add(deck);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 6), rust);
  bridge.position.set(0, 7, 15);
  g.add(bridge);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 4, 10), steel);
  funnel.position.set(0, 11, 17);
  g.add(funnel);
  for (let k = 0; k < 3; k++) {
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 5), rust);
    hatch.position.set(0, 4.4, -12 + k * 8);
    g.add(hatch);
  }
  g.position.set(FREIGHTER.x, -6, FREIGHTER.z);
  g.rotation.order = "YXZ";
  g.rotation.set(0.28, 0.9, 0.12); // bow raised, listing
  return g;
}

buildIslands();
scene.add(buildSunkenTemple(), buildColossus(), buildSailboatWreck(), buildFreighter());

// Island life: palms sway, seals nod, goats wander, turtles glide
function updateIslandLife(dt, t) {
  for (const p of swayingCrowns) {
    const s = 0.04 + 0.03 * wx.storm;
    p.crown.rotation.z = Math.sin(t * 1.3 + p.phase) * s;
    p.crown.rotation.x = Math.cos(t * 1.1 + p.phase) * s;
  }
  for (const s of seals) s.head.rotation.x = -0.35 + Math.sin(t * 0.8 + s.phase) * 0.35;

  const goatI = ISLAND.goat;
  for (const gt of goats) {
    const dx = gt.tx - gt.x;
    const dz = gt.tz - gt.z;
    const dist = Math.hypot(dx, dz);
    if (gt.wait > 0) {
      gt.wait -= dt;
      gt.walk = 0;
    } else if (dist < 0.3) {
      gt.wait = rand(2, 7);
      const p = randomOnIsland(goatI, 12, goatI.R * 0.85);
      gt.tx = p.x;
      gt.tz = p.z;
    } else {
      gt.x += (dx / dist) * 0.6 * dt;
      gt.z += (dz / dist) * 0.6 * dt;
      gt.g.rotation.y = Math.atan2(-dx, -dz);
      gt.walk += dt * 8;
    }
    gt.g.position.set(gt.x, islandHeight(goatI, gt.x, gt.z), gt.z);
    gt.legs.forEach((leg, i) => (leg.rotation.x = gt.wait > 0 ? 0 : Math.sin(gt.walk + (i % 2) * Math.PI) * 0.5));
  }

  const palm = ISLAND.palm;
  for (const tu of turtles) {
    tu.angle += tu.speed * dt;
    const x = palm.x + Math.cos(tu.angle) * tu.radius;
    const z = palm.z + Math.sin(tu.angle) * tu.radius;
    tu.g.position.set(x, -1.5 + Math.sin(t * 0.3 + tu.phase) * 0.5, z);
    tu.g.rotation.y = Math.atan2(Math.sin(tu.angle), -Math.cos(tu.angle));
    for (const f of tu.flippers) {
      f.pivot.rotation.z = f.side * Math.sin(t * 2 + (f.front ? 0 : 1)) * (f.front ? 0.6 : 0.3);
    }
  }
}

// ===== River water, reeds and riverside trees =====
const RIVER_GLSL = /* glsl */ `
  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    return length(p - (a + ab * t));
  }
  float riverDistG(vec2 p) {
    float best = 1e9;
    ${RIVER_SEGS.map(
      (s) =>
        `best = min(best, segDist(p, vec2(${s.ax.toFixed(1)}, ${s.az.toFixed(1)}), vec2(${s.bx.toFixed(1)}, ${s.bz.toFixed(1)})) - ${(s.w / 2).toFixed(1)});`
    ).join("\n    ")}
    return best;
  }
  float swampMaskG(vec2 p) {
    float r = ${SWAMP.r.toFixed(1)};
    return (1.0 - smoothstep(r * 0.65, r, length(p - vec2(${SWAMP.x.toFixed(1)}, ${SWAMP.z.toFixed(1)})))) *
           smoothstep(4.0, 18.0, inlandDist(p));
  }
`;

function buildRiverWater() {
  const x0 = 560;
  const x1 = 1060;
  const z0 = shoreZAt(800) - 960;
  const z1 = shoreZAt(800) + 40;
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: Object.assign({}, shared, haze, { uLightW: waterUniforms.uLight }),
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        ${SKY_GLSL}
        ${NOISE_GLSL}
        ${SHORE_GLSL}
        ${RIVER_GLSL}
        uniform float uLightW;
        uniform float uHazeNear;
        uniform float uHazeFar;
        uniform float uHazeMax;
        varying vec3 vWorld;
        void main() {
          vec2 p = vWorld.xz;
          float sw = swampMaskG(p);
          // Only the river channels and the swamp pools: the sea takes over near the shore
          if (inlandDist(p) < 6.0 || (riverDistG(p) > 8.0 && sw < 0.25)) discard;
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 v = toCam / dist;
          // Ripples drifting downstream (toward the sea, +z)
          vec2 q = p * 0.4 + vec2(0.0, uTime * 0.35 * (1.0 - sw));
          float e = 0.1;
          float h0 = vnoise(q);
          vec3 n = normalize(vec3(-(vnoise(q + vec2(e, 0.0)) - h0) / e * 0.08, 1.0, -(vnoise(q + vec2(0.0, e)) - h0) / e * 0.08));
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          vec3 r = reflect(-v, n);
          r.y = abs(r.y);
          vec3 body = mix(vec3(0.1, 0.17, 0.12), vec3(0.15, 0.18, 0.09), sw) * uLightW;
          vec3 col = mix(body, skyColor(r), fres * 0.8);
          col += uSunColor * pow(max(dot(r, uSunDir), 0.0), 200.0) * 1.5 * uSunVis;
          float hz = smoothstep(uHazeNear, uHazeFar, dist) * uHazeMax;
          col = mix(col, skyColor(normalize(vec3(-v.x + 1e-4, 0.0, -v.z))), hz);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  mesh.position.set((x0 + x1) / 2, 0.28, (z0 + z1) / 2);
  return mesh;
}

// A clump of reed blades (thin upright triangles leaning a little outward)
function reedClumpGeometry() {
  const verts = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rand(-0.3, 0.3);
    const bx = Math.cos(a) * 0.25;
    const bz = Math.sin(a) * 0.25;
    const h = rand(1.4, 2.4);
    const lean = rand(0.15, 0.45);
    const px = -Math.sin(a) * 0.05;
    const pz = Math.cos(a) * 0.05;
    verts.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx * (1 + lean * 3), h, bz * (1 + lean * 3));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

function buildRiverside() {
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();

  // Reeds in the swamp and along the banks
  const reedMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x8a9150, roughness: 0.9, side: THREE.DoubleSide }));
  const reeds = new THREE.InstancedMesh(reedClumpGeometry(), reedMat, 900);
  let n = 0;
  for (let k = 0; k < 20000 && n < 900; k++) {
    const x = rand(560, 1060);
    const z = shoreZAt(800) - rand(-10, 900);
    const y = landHeight(x, z);
    const r = riverDist(x, z);
    const inSwamp = swampMask(x, z) > 0.35;
    if (y < 0.12 || y > 1.4 || (!inSwamp && (r < 0.5 || r > 9))) continue;
    p.set(x, y - 0.1, z);
    q.setFromEuler(e.set(0, rand(0, Math.PI * 2), 0));
    s.setScalar(rand(0.7, 1.3));
    reeds.setMatrixAt(n++, m.compose(p, q, s));
  }
  reeds.count = n;
  group.add(reeds);

  // Trees: dark swamp trees in the delta, leafy trees on the floodplain
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
  const crownMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }));
  const COUNT = 260;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, COUNT * 2);
  let t = 0;
  let c = 0;
  for (let k = 0; k < 30000 && t < COUNT; k++) {
    const x = rand(540, 1080);
    const z = shoreZAt(800) - rand(10, 900);
    const y = landHeight(x, z);
    const r = riverDist(x, z);
    const swamp = swampMask(x, z) > 0.4;
    if (y < 0.35 || y > 30 || r < 5 || r > 150) continue;
    if (!swamp && Math.random() > 0.55) continue;
    const h = swamp ? rand(4, 7) : rand(5, 10);
    p.set(x, y - 0.3, z);
    q.setFromEuler(e.set(rand(-0.08, 0.08), rand(0, 6.3), rand(-0.08, 0.08)));
    s.set(swamp ? 0.7 : 1, h, swamp ? 0.7 : 1);
    trunks.setMatrixAt(t++, m.compose(p, q, s));
    // One or two canopy blobs per tree
    const blobs = swamp ? 2 : 1 + Math.floor(Math.random() * 2);
    for (let b = 0; b < blobs && c < COUNT * 2; b++) {
      const cr = swamp ? rand(2.2, 3.2) : rand(2.5, 4);
      p.set(x + rand(-1.2, 1.2), y + h + rand(-0.5, 0.8), z + rand(-1.2, 1.2));
      s.set(cr, cr * (swamp ? 0.55 : 0.8), cr);
      crowns.setMatrixAt(c, m.compose(p, q, s));
      col.setHSL(swamp ? rand(0.2, 0.25) : rand(0.24, 0.3), swamp ? 0.35 : 0.5, swamp ? rand(0.2, 0.26) : rand(0.26, 0.34));
      crowns.setColorAt(c++, col);
    }
  }
  trunks.count = t;
  crowns.count = c;
  group.add(trunks, crowns);
  return group;
}
scene.add(buildRiverWater(), buildRiverside());

// ===== Clifftop town =====
const TOWN = { x0: -1580, x1: -1180 };
const TOWN_CENTER = { x: -1380, z: shoreZAt(-1380) - 120 };

function buildTown() {
  const group = new THREE.Group();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const mat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), { city: true });
  const palette = [0xf2efe6, 0xf2efe6, 0xe8dcc0, 0xd9c29a, 0xcfdde6, 0xc47a52].map((h) => new THREE.Color(h));
  const lots = [];
  for (let x = TOWN.x0; x <= TOWN.x1; x += rand(13, 18)) {
    if (cliffAmount(x) < 0.8) continue;
    for (let d = 68; d <= 290; d += rand(14, 20)) {
      if (Math.random() < 0.25) continue;
      const bx = x + rand(-2, 2);
      const bz = shoreZAt(bx) - d;
      const w = rand(7, 12);
      const dp = rand(7, 12);
      const corners = [[-w / 2, -dp / 2], [w / 2, -dp / 2], [-w / 2, dp / 2], [w / 2, dp / 2]].map(([cx, cz]) =>
        landHeight(bx + cx, bz + cz)
      );
      const lo = Math.min(...corners);
      const hi = Math.max(...corners);
      if (hi - lo > 8) continue; // too steep to build on
      const h = rand(6, 11) + smooth(60, 280, d) * rand(0, 14) + (Math.random() < 0.06 ? rand(10, 18) : 0);
      lots.push({ x: bx, z: bz, w, dp, base: lo - 0.5, h: h + (hi - lo) + 0.5, top: hi + h });
    }
  }
  const houses = new THREE.InstancedMesh(boxGeo, mat, lots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  lots.forEach((L, i) => {
    houses.setMatrixAt(i, m.compose(new THREE.Vector3(L.x, L.base, L.z), q, new THREE.Vector3(L.w, L.h, L.dp)));
    houses.setColorAt(i, palette[Math.floor(Math.random() * palette.length)]);
  });
  group.add(houses);

  // A church with a bell tower and dome as a landmark
  const white = applyHaze(new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.8 }));
  const blue = applyHaze(new THREE.MeshStandardMaterial({ color: 0x3b6ea5, roughness: 0.6 }));
  const cy = landHeight(TOWN_CENTER.x, TOWN_CENTER.z);
  const nave = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 18), white);
  nave.position.set(TOWN_CENTER.x, cy + 4.5, TOWN_CENTER.z);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), blue);
  dome.position.set(TOWN_CENTER.x, cy + 9, TOWN_CENTER.z);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 22, 4), white);
  tower.position.set(TOWN_CENTER.x + 8, cy + 11, TOWN_CENTER.z + 6);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 4), blue);
  spire.position.set(TOWN_CENTER.x + 8, cy + 24.5, TOWN_CENTER.z + 6);
  spire.rotation.y = Math.PI / 4;
  group.add(nave, dome, tower, spire);

  // Night lights: glowing points on the seaward walls and streetlights along the cliff edge,
  // so the town twinkles on the horizon even from far away
  const pts = [];
  const cols = [];
  for (const L of lots) {
    for (let k = 0; k < 5; k++) {
      pts.push(L.x + rand(-L.w / 2, L.w / 2), L.base + 1 + rand(1.5, L.h - 1), L.z + L.dp / 2 + 0.3);
      const warm = rand(0, 1);
      cols.push(1, 0.72 + warm * 0.15, 0.4 + warm * 0.2);
    }
  }
  for (let x = TOWN.x0; x <= TOWN.x1; x += 12) {
    const z = shoreZAt(x) - 52;
    pts.push(x, landHeight(x, z) + 5, z);
    cols.push(1, 0.85, 0.6);
  }
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  lightGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const lightMat = new THREE.PointsMaterial({
    size: 3,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const lights = new THREE.Points(lightGeo, lightMat);
  lights.frustumCulled = false;
  group.add(lights);
  return { group, lightMat };
}
const town = buildTown();
scene.add(town.group);

// ===== Beach life at the harbor cove =====
const skinMats = [0xe0b08a, 0xc68e62, 0x8d5a3b, 0xf1c9a5].map((h) =>
  applyHaze(new THREE.MeshStandardMaterial({ color: h, roughness: 0.7 }))
);
const swimSkinMats = [0xe0b08a, 0xc68e62, 0x8d5a3b].map((h) =>
  applyUnderwater(new THREE.MeshStandardMaterial({ color: h, roughness: 0.7 }))
);
const brightMats = [0xe8453c, 0xf2c14e, 0x3b82c4, 0x2fb39a, 0xf28fb1, 0xffffff].map((h) =>
  applyHaze(new THREE.MeshStandardMaterial({ color: h, roughness: 0.8, side: THREE.DoubleSide }))
);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// A spot on the cove, clear of the pier and the boathouse
function coveSpot(dMin, dMax) {
  for (let k = 0; k < 100; k++) {
    const x = COVE_X + rand(-210, 210);
    if (x > COVE_X - 8 && x < COVE_X + 24) continue;
    const d = rand(dMin, dMax);
    const z = shoreZAt(x) - d;
    return { x, z, y: landHeight(x, z) };
  }
  return { x: COVE_X - 100, z: shoreZAt(COVE_X - 100) - dMin, y: 0 };
}

function buildPerson(skin, lying) {
  const g = new THREE.Group();
  const shirt = pick(brightMats);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.6, 8), lying ? skin : shirt);
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.25, 8), pick(brightMats));
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.85, 8), skin);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
  legs.position.y = 0.43;
  hips.position.y = 0.95;
  torso.position.y = 1.35;
  head.position.y = 1.78;
  g.add(legs, hips, torso, head);
  if (lying) g.rotation.x = -Math.PI / 2;
  return g;
}

const sunbathers = [];
const swimmers = [];
const surfers = [];
function buildBeachLife() {
  const group = new THREE.Group();
  // Sunbathers on towels and loungers, most under umbrellas
  for (let k = 0; k < 16; k++) {
    const s = coveSpot(14, 42);
    const g = new THREE.Group();
    const onLounger = Math.random() < 0.4;
    const base = onLounger ? 0.35 : 0.03;
    if (onLounger) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 1.9), brightMats[5]);
      frame.position.y = 0.15;
      g.add(frame);
    } else {
      const towel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 1.9), pick(brightMats));
      towel.position.y = 0.01;
      g.add(towel);
    }
    const person = buildPerson(pick(skinMats), true);
    person.position.set(0, base + 0.18, 0.9);
    g.add(person);
    if (Math.random() < 0.7) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), brightMats[5]);
      pole.position.set(0.8, 1.15, -0.3);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.5, 10, 1, true), pick(brightMats));
      canopy.position.set(0.8, 2.35, -0.3);
      g.add(pole, canopy);
    }
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = rand(-0.4, 0.4); // heads toward land, feet toward the sea
    group.add(g);
    sunbathers.push(g);
  }
  // Swimmers: heads and shoulders above the water, drifting about
  for (let k = 0; k < 10; k++) {
    const s = coveSpot(-38, -6);
    const g = new THREE.Group();
    const skin = pick(swimSkinMats);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
    shoulders.scale.set(1.3, 0.8, 0.7);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
    head.position.y = 0.26;
    g.add(shoulders, head);
    group.add(g);
    swimmers.push({ g, cx: s.x, cz: s.z, a: rand(0, 6.3), r: rand(2, 6), speed: rand(0.03, 0.08), phase: rand(0, 6) });
  }
  // Surfers: paddle out lying on the board, then ride a wave back in standing up
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 2.2), pick(brightMats));
    const rider = buildPerson(pick(skinMats), false);
    g.add(board, rider);
    group.add(g);
    surfers.push({ g, board, rider, x: COVE_X + rand(-180, -40) + k * 70, t: rand(0, 40) });
  }
  return group;
}
scene.add(buildBeachLife());

function updateBeachLife(dt, t, env) {
  const daytime = env.light > 0.35 && wx.storm < 0.5;
  for (const g of sunbathers) g.visible = daytime && wx.rain < 0.5;
  for (const s of swimmers) {
    s.g.visible = daytime;
    s.a += s.speed * dt;
    const x = s.cx + Math.cos(s.a) * s.r;
    const z = s.cz + Math.sin(s.a) * s.r;
    s.g.position.set(x, waveHeight(x, z, t) - 0.12 + Math.sin(t * 2 + s.phase) * 0.04, z);
    s.g.rotation.y = -s.a;
  }
  const CYCLE = 40; // seconds: 25 paddling out, 15 riding in
  for (const s of surfers) {
    s.g.visible = daytime;
    s.t = (s.t + dt) % CYCLE;
    const riding = s.t > 25;
    const u = riding ? (s.t - 25) / 15 : s.t / 25;
    const d = riding ? lerp(-95, -14, u) : lerp(-14, -95, u);
    const x = s.x + Math.sin(t * 0.05 + s.x) * 20;
    const z = shoreZAt(x) - d;
    s.g.position.set(x, waveHeight(x, z, t) + 0.05, z);
    s.g.rotation.set(0, riding ? 0 : Math.PI, riding ? Math.sin(t * 1.5 + s.x) * 0.12 : 0); // ride toward the beach, paddle out to sea
    s.rider.rotation.x = riding ? 0 : -Math.PI / 2;
    s.rider.position.set(0, riding ? 0.05 : 0.2, riding ? 0 : 0.2);
    s.rider.scale.setScalar(riding ? 1 : 0.95);
  }
}

// ===== Sea traffic: sailboats, a tour boat, a ferry, a tanker, the coast guard, and a small plane =====
function hullGeometry(len, beam, height, draft) {
  const s = new THREE.Shape();
  const hl = len / 2;
  const hb = beam / 2;
  s.moveTo(-hb * 0.85, -hl);
  s.lineTo(hb * 0.85, -hl);
  s.lineTo(hb, hl * 0.35);
  s.quadraticCurveTo(hb * 0.9, hl * 0.85, 0, hl);
  s.quadraticCurveTo(-hb * 0.9, hl * 0.85, -hb, hl * 0.35);
  s.lineTo(-hb * 0.85, -hl);
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); // bow toward -Z
  g.translate(0, -draft, 0);
  return g;
}
const hazeMat = (color, extra = {}) => applyHaze(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }));
const glowMat = (color) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0 });
const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

// A white masthead light that shows at night
function mastLight(parent, x, y, z) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([x, y, z], 3));
  const mat = new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, color: 0xfff4dd, transparent: true, opacity: 0, fog: false, depthWrite: false });
  parent.add(new THREE.Points(geo, mat));
  return mat;
}

function buildSailboat() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeometry(9, 2.8, 1.4, 0.6), hazeMat(0xf4f4f0)));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 12, 6), hazeMat(0xcccccc));
  mast.position.set(0, 6.8, -0.8);
  g.add(mast);
  const sailMat = hazeMat(0xfbfaf4, { side: THREE.DoubleSide });
  const tri = (pts) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, sailMat);
  };
  g.add(tri([0, 1.4, -0.7, 0, 12.4, -0.7, 0, 1.6, 3.4])); // mainsail
  g.add(tri([0, 1.4, -1.0, 0, 11.5, -0.9, 0, 1.2, -4.3])); // jib
  return { group: g, light: mastLight(g, 0, 12.9, -0.8) };
}

function buildTourBoat() {
  const g = new THREE.Group();
  const hull = hazeMat(0xf2f2ee);
  for (const side of [-1, 1]) {
    const pontoon = new THREE.Mesh(hullGeometry(15, 1.6, 1.6, 0.8), hull);
    pontoon.position.x = side * 2.6;
    g.add(pontoon);
  }
  g.add(box(6.8, 0.4, 13, hazeMat(0x9c7a55), 0, 1.0, 0.3));
  for (const [x, z] of [[-3, -4], [3, -4], [-3, 5], [3, 5]]) g.add(box(0.12, 2.4, 0.12, hull, x, 2.4, z));
  g.add(box(7, 0.2, 11, hazeMat(0x2fb39a), 0, 3.6, 0.5)); // canopy
  for (let k = 0; k < 8; k++) g.add(box(0.5, 0.7, 0.5, pick(brightMats), rand(-2.5, 2.5), 1.55, rand(-4, 5))); // passengers
  return { group: g, light: mastLight(g, 0, 4.2, -3) };
}

function buildFerry() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeometry(70, 14, 7, 3), hazeMat(0x1f3f6e)));
  g.add(box(13.5, 0.9, 62, hazeMat(0xf4f4f0), 0, 4.4, 2)); // white band above the blue hull
  g.add(box(12, 4, 44, hazeMat(0xf4f4f0), 0, 6.8, 6));
  g.add(box(10, 3.5, 30, hazeMat(0xf4f4f0), 0, 10.5, 8));
  const windows = glowMat(0xffd9a0);
  g.add(box(12.2, 1, 42, windows, 0, 7.2, 6));
  g.add(box(10.2, 1, 28, windows, 0, 10.9, 8));
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 5, 12), hazeMat(0xf4f4f0));
  funnel.position.set(0, 14.5, 18);
  g.add(funnel, box(3.4, 1.4, 3.4, hazeMat(0xc0392b), 0, 16.8, 18));
  return { group: g, light: mastLight(g, 0, 17, -8), windows };
}

function buildTanker() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeometry(180, 30, 10, 7), hazeMat(0x7a2a22)));
  g.add(box(29, 3, 172, hazeMat(0x1c1c1c), 0, 1.6, -2)); // black topsides
  g.add(box(27, 0.4, 160, hazeMat(0x566457), 0, 3.3, -6)); // green deck
  for (let k = 0; k < 8; k++) g.add(box(2, 1.2, 150, hazeMat(0x9aa39a), -8 + (k % 4) * 5, 4, -8)); // pipework
  g.add(box(24, 14, 14, hazeMat(0xf1eee6), 0, 10, 70));
  const windows = glowMat(0xffe0b0);
  g.add(box(24.2, 1.2, 14.2, windows, 0, 14.5, 70));
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 8, 12), hazeMat(0x1c1c1c));
  funnel.position.set(0, 21, 76);
  g.add(funnel);
  return { group: g, light: mastLight(g, 0, 22, 62), windows };
}

function buildCoastGuard() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeometry(16, 4.4, 2.4, 0.9), hazeMat(0xf4f4f0)));
  const stripe = box(4.5, 0.6, 2.2, hazeMat(0xd9342b), 0, 0.8, -3);
  stripe.rotation.y = 0.5;
  g.add(stripe, box(3.4, 2.2, 5, hazeMat(0x9aa3ab), 0, 2.6, 1.5));
  const blue = glowMat(0x3b8bff);
  const red = glowMat(0xff3b3b);
  g.add(box(0.8, 0.3, 0.4, blue, -0.5, 3.9, 1), box(0.8, 0.3, 0.4, red, 0.5, 3.9, 1));
  return { group: g, light: mastLight(g, 0, 5, 1.5), blue, red };
}

function buildSmallPlane() {
  const g = new THREE.Group();
  const white = hazeMat(0xf4f4f0);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.35, 8, 10), white);
  body.rotation.x = Math.PI / 2;
  g.add(body, box(11, 0.2, 1.6, hazeMat(0xd9342b), 0, 0.5, -0.8), box(3.6, 0.15, 1, white, 0, 0.2, 3.6), box(0.15, 1.4, 1, white, 0, 0.8, 3.7));
  const prop = box(0.1, 2, 0.12, hazeMat(0x333333), 0, 0, -4.1);
  g.add(prop);
  return { group: g, prop };
}

// Routes are loops (ellipses) or straight lines sailed back and forth; all stay in open, deep water
const vessels = [];
function addVessel(type, model, route, speed, bob = 1) {
  model.group.rotation.order = "YXZ";
  scene.add(model.group);
  vessels.push({ type, ...model, route, speed, bob, s: Math.random() * 1000, x: 0, z: 0, yaw: 0 });
}
addVessel("sailboat", buildSailboat(), { kind: "loop", cx: -500, cz: -650, rx: 180, rz: 90 }, 3.5);
addVessel("sailboat", buildSailboat(), { kind: "loop", cx: 700, cz: -450, rx: 250, rz: 120 }, 4);
addVessel("sailboat", buildSailboat(), { kind: "loop", cx: -1500, cz: -400, rx: 200, rz: 100 }, 3);
addVessel("tourboat", buildTourBoat(), { kind: "loop", cx: 380, cz: -700, rx: 170, rz: 140 }, 4.5);
addVessel("ferry", buildFerry(), { kind: "line", ax: -3300, az: -250, bx: 3300, bz: -150 }, 9, 0.4);
addVessel("tanker", buildTanker(), { kind: "line", ax: 3600, az: 500, bx: -3600, bz: 700 }, 5, 0.15);
addVessel("coastguard", buildCoastGuard(), { kind: "line", ax: -1800, az: -850, bx: 1800, bz: -800 }, 13);
const smallPlane = buildSmallPlane();
smallPlane.group.rotation.order = "YXZ";
scene.add(smallPlane.group);
const planeRoute = { cx: 0, cz: -600, r: 1200, alt: 170, a: 0 };

// Position and heading along a route at distance s travelled
function routePoint(route, s) {
  if (route.kind === "loop") {
    const a = s / ((route.rx + route.rz) / 2);
    return { x: route.cx + Math.cos(a) * route.rx, z: route.cz + Math.sin(a) * route.rz, vx: -Math.sin(a) * route.rx, vz: Math.cos(a) * route.rz };
  }
  const len = Math.hypot(route.bx - route.ax, route.bz - route.az);
  const u = s % (2 * len);
  const back = u > len;
  const f = back ? 2 - u / len : u / len;
  const dir = back ? -1 : 1;
  return { x: lerp(route.ax, route.bx, f), z: lerp(route.az, route.bz, f), vx: (route.bx - route.ax) * dir, vz: (route.bz - route.az) * dir };
}

function updateTraffic(dt, t, env) {
  for (const v of vessels) {
    v.s += v.speed * dt;
    const p = routePoint(v.route, v.s);
    v.x = p.x;
    v.z = p.z;
    v.yaw = Math.atan2(-p.vx, -p.vz);
    const h = waveHeight(p.x, p.z, t);
    v.group.position.set(p.x, h * v.bob, p.z);
    v.group.rotation.set(Math.sin(t * 0.7 + v.s) * 0.04 * v.bob, v.yaw, (v.type === "sailboat" ? 0.18 : 0) + Math.sin(t * 0.9 + v.s) * 0.05 * v.bob);
    if (v.light) v.light.opacity = env.lampsOn;
    if (v.windows) v.windows.emissiveIntensity = 1.4 * env.lampsOn;
    if (v.blue) {
      const flash = Math.floor(t * 3) % 2;
      v.blue.emissiveIntensity = flash ? 3 : 0.2;
      v.red.emissiveIntensity = flash ? 0.2 : 3;
    }
  }
  // Small plane circling the bay
  planeRoute.a += (45 / planeRoute.r) * dt;
  const a = planeRoute.a;
  smallPlane.group.position.set(planeRoute.cx + Math.cos(a) * planeRoute.r, planeRoute.alt, planeRoute.cz + Math.sin(a) * planeRoute.r);
  smallPlane.group.rotation.set(0, Math.atan2(Math.sin(a), -Math.cos(a)), -0.25);
  smallPlane.prop.rotation.z += dt * 40;
  smallPlane.group.visible = env.light > 0.3 && wx.storm < 0.5;

  // Town lights at night
  cityLights.value = env.lampsOn;
  town.lightMat.opacity = env.lampsOn;
}

// ===== Discovery journal =====
// Discoveries and photos fill the journal; money only comes from completing expedition tasks.
const JOURNAL = [
  { id: "gulls", cat: "Wildlife", name: "Seagulls" },
  { id: "flyingfish", cat: "Wildlife", name: "Leaping fish" },
  { id: "reeffish", cat: "Wildlife", name: "Anthias school" },
  { id: "dolphins", cat: "Wildlife", name: "Dolphin pod" },
  { id: "turtles", cat: "Wildlife", name: "Green sea turtle" },
  { id: "seals", cat: "Wildlife", name: "Seal colony" },
  { id: "goats", cat: "Wildlife", name: "Wild goats" },
  { id: "harbor", cat: "Coast & islands", name: "Harbor Cove" },
  { id: "cliffs", cat: "Coast & islands", name: "Limestone cliffs" },
  { id: "lighthouse", cat: "Coast & islands", name: "Lighthouse" },
  { id: "stacks", cat: "Coast & islands", name: "Sea stacks" },
  { id: "palmislet", cat: "Coast & islands", name: "Palm Islet" },
  { id: "sealrock", cat: "Coast & islands", name: "Seal Rock" },
  { id: "goatisland", cat: "Coast & islands", name: "Goat Island" },
  { id: "town", cat: "Coast & islands", name: "Clifftop town" },
  { id: "townlights", cat: "Coast & islands", name: "Town lights at night" },
  { id: "delta", cat: "Coast & islands", name: "River delta" },
  { id: "swamp", cat: "Coast & islands", name: "Reed swamp" },
  { id: "sailboats", cat: "People & boats", name: "Sailboats" },
  { id: "tourboat", cat: "People & boats", name: "Island tour boat" },
  { id: "ferry", cat: "People & boats", name: "Car ferry" },
  { id: "tanker", cat: "People & boats", name: "Oil tanker" },
  { id: "coastguard", cat: "People & boats", name: "Coast guard patrol" },
  { id: "smallplane", cat: "People & boats", name: "Sightseeing plane" },
  { id: "swimmers", cat: "People & boats", name: "Swimmers" },
  { id: "surfers", cat: "People & boats", name: "Surfers" },
  { id: "sunbathers", cat: "People & boats", name: "Sunbathers" },
  { id: "reef", cat: "Underwater", name: "Coral reef" },
  { id: "wreck", cat: "Underwater", name: "Old wreck" },
  { id: "sailboat", cat: "Underwater", name: "Sunken sailboat" },
  { id: "freighter", cat: "Underwater", name: "Rusted freighter" },
  { id: "deepwreck", cat: "Underwater", name: "Deep wreck (sonar)" },
  { id: "temple", cat: "Ruins & relics", name: "Sunken temple" },
  { id: "colossus", cat: "Ruins & relics", name: "Drowned colossus" },
  { id: "ruins", cat: "Ruins & relics", name: "Hilltop ruins" },
  { id: "watcher", cat: "Ruins & relics", name: "The Watcher statue" },
  { id: "glow", cat: "Mysteries", name: "Strange light" },
  { id: "bell", cat: "Relics", name: "Ship's bell" },
  { id: "coin", cat: "Relics", name: "Temple coin" },
  { id: "logbook", cat: "Relics", name: "Captain's logbook" },
  { id: "compass", cat: "Relics", name: "Brass compass" },
  { id: "fragment1", cat: "Relics", name: "Artifact fragment I" },
  { id: "fragment2", cat: "Relics", name: "Artifact fragment II" },
  { id: "fragment3", cat: "Relics", name: "Artifact fragment III" },
  { id: "airliner", cat: "Sky & weather", name: "High-altitude airliner" },
  { id: "sunset", cat: "Sky & weather", name: "Sunset at sea" },
  { id: "stars", cat: "Sky & weather", name: "Starry night" },
  { id: "aurora", cat: "Sky & weather", name: "Aurora" },
  { id: "rain", cat: "Sky & weather", name: "Rain at sea" },
  { id: "storm", cat: "Sky & weather", name: "Storm" },
];
const JOURNAL_BY_ID = Object.fromEntries(JOURNAL.map((e) => [e.id, e]));

// What each discovery is worth: paid once when first found; a first photo pays half again on top.
// Rarer, farther or harder things are worth more.
const JOURNAL_VALUES = {
  gulls: 50, flyingfish: 80, reeffish: 150, dolphins: 200, turtles: 250, seals: 200, goats: 150,
  harbor: 0, cliffs: 60, lighthouse: 100, stacks: 150, palmislet: 120, sealrock: 120, goatisland: 150,
  town: 120, townlights: 200, delta: 150, swamp: 150,
  reef: 120, wreck: 300, sailboat: 200, freighter: 200, deepwreck: 400,
  temple: 350, colossus: 400, ruins: 250, watcher: 300, glow: 500,
  bell: 300, coin: 250, logbook: 200, compass: 200, fragment1: 600, fragment2: 600, fragment3: 600,
  sailboats: 50, tourboat: 60, ferry: 80, tanker: 120, coastguard: 100, smallplane: 80,
  swimmers: 40, surfers: 80, sunbathers: 30,
  airliner: 60, sunset: 80, stars: 80, aurora: 300, rain: 60, storm: 150,
};
for (const e of JOURNAL) e.value = JOURNAL_VALUES[e.id] || 0;
const photoValue = (entry) => Math.round(entry.value * 0.5);
const journal = Object.fromEntries(JOURNAL.map((e) => [e.id, { seen: false, photo: false }]));

// ===== Expeditions (the only way to earn money) =====
const nearLighthouse = () =>
  Math.hypot(state.boat.x - lighthouse.group.position.x, state.boat.z - lighthouse.group.position.z) < 800;
const photoOf = (target) => (kind, id) => kind === "photo" && id === target;
const findOrPhoto = (target) => (kind, id) => id === target;

const GOALS = [
  {
    id: "stacks-sunset",
    title: "Sea Stacks at Sunset",
    reward: 400,
    hint: "Photograph the sea stacks off the lighthouse while the sun is low, around 17:00–18:15. Press F to take a photo.",
    check: (kind, id) => kind === "photo" && id === "stacks" && shared.uSunDir.value.y < 0.3 && shared.uSunDir.value.y > -0.05,
  },
  {
    id: "wreck",
    title: "The Old Wreck",
    reward: 600,
    hint: "A fisherman's chart marks a wreck in clear water along the western cliffs, far past the cove. Look down into the water.",
    check: findOrPhoto("wreck"),
  },
  {
    id: "reef",
    title: "Reef Survey",
    reward: 400,
    hint: "Photograph a school of reef fish over the coral below the cliffs.",
    check: photoOf("reeffish"),
  },
  {
    id: "dolphins",
    title: "The Headland Dolphins",
    reward: 500,
    hint: "A dolphin pod has been seen off the lighthouse headland. Photograph one there, before they lose interest in you.",
    check: (kind, id) => kind === "photo" && id === "dolphins" && nearLighthouse(),
  },
  {
    id: "light",
    title: "A Strange Light",
    reward: 1000,
    hint: "Fishermen talk about a light under the water off the eastern cliffs, but only after dark. Go and see.",
    check: findOrPhoto("glow"),
  },
  {
    id: "seals",
    title: "Seal Count",
    reward: 500,
    hint: "A colony of seals hauls out on a bare rock a few hundred metres off the western shore. Photograph them.",
    check: photoOf("seals"),
  },
  {
    id: "turtles",
    title: "Turtle Watch",
    reward: 600,
    hint: "Green sea turtles circle the lagoon of the little palm island south-east of the lighthouse. Photograph one.",
    check: photoOf("turtles"),
  },
  {
    id: "goats",
    title: "The Island Herd",
    reward: 450,
    hint: "Wild goats roam the big island far to the east. Photograph them grazing.",
    check: photoOf("goats"),
  },
  {
    id: "temple",
    title: "Temple Beneath the Waves",
    reward: 700,
    hint: "Divers' stories tell of columns standing in shallow water west of the harbor cove. Find the sunken temple.",
    check: findOrPhoto("temple"),
  },
  {
    id: "colossus",
    title: "The Drowned Colossus",
    reward: 800,
    hint: "Near the sunken temple lies a great stone face staring up at the surface. Photograph it.",
    check: photoOf("colossus"),
  },
  {
    id: "freighter",
    title: "The Rusted Freighter",
    reward: 500,
    hint: "A cargo ship ran aground somewhere west of Seal Rock. Photograph what's left of it.",
    check: photoOf("freighter"),
  },
  {
    id: "sailboat",
    title: "The Lost Sailboat",
    reward: 450,
    hint: "A small sailboat went down on the reef a short way east of the sea stacks. Find it.",
    check: findOrPhoto("sailboat"),
  },
  {
    id: "watcher",
    title: "The Watcher",
    reward: 700,
    hint: "Among ruins on the hilltop of the eastern island stands a statue pointing out to sea. Photograph it.",
    check: photoOf("watcher"),
  },
  {
    id: "ferry",
    title: "Catch the Ferry",
    reward: 400,
    hint: "The car ferry crosses the bay a few hundred metres offshore, back and forth all day. Photograph it.",
    check: photoOf("ferry"),
  },
  {
    id: "tanker",
    title: "Giant on the Horizon",
    reward: 500,
    hint: "An oil tanker creeps along the horizon far out to sea. Get close enough for a photo.",
    check: photoOf("tanker"),
  },
  {
    id: "coastguard",
    title: "Coast Guard Patrol",
    reward: 450,
    hint: "The coast guard patrols fast along the coast, blue lights flashing. Photograph their boat.",
    check: photoOf("coastguard"),
  },
  {
    id: "surfers",
    title: "Surf's Up",
    reward: 400,
    hint: "Surfers ride the waves into the harbor cove. Photograph one while it's still light.",
    check: photoOf("surfers"),
  },
  {
    id: "townlights",
    title: "Town Lights",
    reward: 600,
    hint: "The clifftop town west of the harbor glows after dark. Photograph its lights from the sea at night.",
    check: photoOf("townlights"),
  },
  {
    id: "delta",
    title: "Where the River Meets the Sea",
    reward: 450,
    hint: "A river reaches the sea through two mouths on the sandy coast east of the lighthouse. Find the delta.",
    check: findOrPhoto("delta"),
  },
  {
    id: "swamp",
    title: "Into the Reeds",
    reward: 500,
    hint: "Between the river's two mouths lies a reed swamp. Photograph it from the water.",
    check: photoOf("swamp"),
  },
  // Tasks that need gear from the boatyard (only offered once you own it)
  {
    id: "deep",
    title: "The Deep Contact",
    reward: 900,
    requires: "sonar",
    hint: "Fishermen snag their nets on something deep off the far western cliffs, past the town. Find it with sonar.",
    check: findOrPhoto("deepwreck"),
  },
  {
    id: "bell",
    title: "Salvage the Bell",
    reward: 700,
    requires: "diving",
    hint: "Dive on the old wreck off the western cliffs and bring up its bell. Stop over the wreck and press X.",
    check: (kind, id) => kind === "relic" && id === "bell",
  },
  {
    id: "logbook",
    title: "The Captain's Log",
    reward: 600,
    requires: "diving",
    hint: "Dive on the rusted freighter west of Seal Rock and recover the captain's logbook.",
    check: (kind, id) => kind === "relic" && id === "logbook",
  },
  {
    id: "fragment",
    title: "What Lies Beneath the Light",
    reward: 1200,
    requires: "diving",
    hint: "Dive where the strange light glows off the eastern cliffs and see what is down there.",
    check: (kind, id) => kind === "relic" && id === "fragment1",
  },
];

// Where each task's target is (for the radio's search area)
function goalTarget(goal) {
  const at = (x, z) => ({ x, z });
  const shipOf = (type) => vessels.find((v) => v.type === type);
  switch (goal.id) {
    case "stacks-sunset":
    case "dolphins":
      return at(seaStacks[1].x, seaStacks[1].z);
    case "wreck":
    case "bell":
      return at(WRECK.x, WRECK.z);
    case "reef":
      return at(LH_X - 120, shoreZAt(LH_X - 120) + 60);
    case "light":
    case "fragment":
      return at(GLOW.x, GLOW.z);
    case "seals":
      return at(ISLAND.seal.x, ISLAND.seal.z);
    case "turtles":
      return at(ISLAND.palm.x, ISLAND.palm.z);
    case "goats":
    case "watcher":
      return at(ISLAND.goat.x, ISLAND.goat.z);
    case "temple":
      return at(TEMPLE.x, TEMPLE.z);
    case "colossus":
      return at(COLOSSUS.x, COLOSSUS.z);
    case "freighter":
    case "logbook":
      return at(FREIGHTER.x, FREIGHTER.z);
    case "sailboat":
      return at(SAILBOAT.x, SAILBOAT.z);
    case "surfers":
      return at(COVE_X - 100, shoreZAt(COVE_X - 100) + 60);
    case "townlights":
      return at(TOWN_CENTER.x, shoreZAt(TOWN_CENTER.x) + 200);
    case "delta":
    case "swamp":
      return at(SWAMP.x, SWAMP.z);
    case "deep":
      return at(DEEP_WRECK.x, DEEP_WRECK.z);
    default: {
      const ship = shipOf(goal.id);
      return ship ? at(ship.x, ship.z) : null;
    }
  }
}

const expedition = {
  day: 1,
  funds: 0,
  fuel: 100,
  fuelMax: 100,
  goal: null,
  goalDone: false,
  completedGoals: new Set(),
  forecast: 0.1,
  hours: 0,
  distance: 0,
  photos: 0,
  earnings: 0,
  discoveryEarnings: 0,
  photoEarnings: 0,
  relicEarnings: 0,
  newFinds: [],
  lastX: 0,
  lastZ: 0,
  warned25: false,
  warned10: false,
  searchArea: null, // from the radio: { x, z, r }
  radioReport: "",
  mysterySolved: false,
};

// ===== Boatyard upgrades: gear that changes what you can discover =====
const UPGRADES = [
  { id: "binoculars", icon: "🔭", name: "Binoculars", price: 600, desc: "Spot wildlife and places from 50% farther away." },
  { id: "tank", icon: "⛽", name: "Long-range fuel tank", price: 800, desc: "50% more fuel: reach farther and stay out longer." },
  { id: "camera", icon: "📷", name: "Telephoto camera", price: 700, desc: "Photograph from 50% farther away, and anywhere in the frame." },
  { id: "radio", icon: "📻", name: "Marine radio", price: 500, desc: "A morning report narrows each task to a search area on your map." },
  { id: "chart", icon: "🧭", name: "Chartplotter", price: 900, desc: "Your map zooms out and shows everything you have discovered." },
  { id: "hull", icon: "🛡️", name: "Reinforced hull", price: 1000, desc: "Full speed and normal fuel use in rough seas and storms." },
  { id: "sonar", icon: "📡", name: "Sonar", price: 1200, desc: "Pings underwater contacts nearby, even ones too deep to see." },
  { id: "diving", icon: "🤿", name: "Diving gear", price: 1500, desc: "Dive on underwater sites (press X when stopped) to recover relics." },
];
const upgrades = new Set();
const owned = (id) => upgrades.has(id);

// ===== Saved progress (in this browser) =====
const SAVE_KEY = "coastline-save-v1";
function saveGame() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        day: expedition.day,
        funds: expedition.funds,
        forecast: expedition.forecast,
        completedGoals: [...expedition.completedGoals],
        upgrades: [...upgrades],
        journal,
        mysterySolved: expedition.mysterySolved,
      })
    );
  } catch (e) {
    // Storage can be unavailable (private windows, some file:// setups): the game still works, just unsaved
  }
}
function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!data) return false;
    expedition.day = data.day;
    expedition.funds = data.funds;
    expedition.forecast = data.forecast;
    expedition.completedGoals = new Set(data.completedGoals);
    expedition.mysterySolved = !!data.mysterySolved;
    for (const id of data.upgrades) upgrades.add(id);
    for (const id in data.journal) if (journal[id]) journal[id] = data.journal[id];
    return true;
  } catch (e) {
    return false;
  }
}
function eraseSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // nothing saved to erase
  }
}

// Start at the harbor, facing out along the coast toward the lighthouse
function placeBoatAtHarbor() {
  const b = state.boat;
  b.x = harbor.dockX;
  b.z = harbor.dockZ;
  b.yaw = -Math.PI / 2;
  b.speed = 0;
  b.throttle = 0;
}
placeBoatAtHarbor();
flock.x = harbor.dockX + 25;
flock.z = harbor.dockZ;

function chooseGoal() {
  if (expedition.day === 1) return GOALS[0];
  const available = GOALS.filter((g) => !g.requires || owned(g.requires));
  const open = available.filter((g) => !expedition.completedGoals.has(g.id));
  // Tasks that just became possible with new gear come first
  const gear = open.filter((g) => g.requires);
  const pool = gear.length && Math.random() < 0.6 ? gear : open.length ? open : available;
  return pool[Math.floor(Math.random() * pool.length)];
}

const RADIO_LINES = [
  "Harbor radio: a skipper reports it somewhere in here.",
  "Coast radio: fishermen say you'll want to look around here.",
  "Radio chatter: 'I'd try around there, if I were you.'",
];

function showBriefing() {
  if (state.phase === "summary") expedition.day++;
  expedition.goal = chooseGoal();
  // The radio narrows the task down to a search area (roughly centred, so you still have to look)
  expedition.searchArea = null;
  expedition.radioReport = "";
  if (owned("radio")) {
    const target = goalTarget(expedition.goal);
    if (target) {
      const a = rand(0, Math.PI * 2);
      const off = rand(0, 120);
      expedition.searchArea = { x: target.x + Math.cos(a) * off, z: target.z + Math.sin(a) * off, r: 250 };
      expedition.radioReport = pick(RADIO_LINES) + " (circled on your map)";
    }
  }
  state.phase = "briefing";
  renderBriefing();
}

function renderBriefing() {
  state.shopOpen = false;
  overlayTitleEl.textContent = `Day ${expedition.day} — Today's expedition`;
  const gearList = UPGRADES.filter((u) => owned(u.id)).map((u) => u.icon).join(" ") || "none yet";
  overlayBodyEl.innerHTML = `
    <div class="card">
      <div class="label">Goal</div>
      <div style="font-size:20px;font-weight:600;margin:2px 0 6px">${expedition.goal.title}</div>
      <div>${expedition.goal.hint}</div>
      <div style="margin-top:8px">Reward: <b>$${expedition.goal.reward}</b></div>
      ${expedition.radioReport ? `<div style="margin-top:8px">📻 ${expedition.radioReport}</div>` : ""}
      <div style="margin-top:12px" class="label">Conditions</div>
      <div>Forecast: ${weatherName(expedition.forecast)} · ${owned("tank") ? "Long-range tank" : "Full tank"} · Sunset around 18:00</div>
      <div style="margin-top:12px" class="label">Your boat</div>
      <div>Gear: ${gearList} · Funds: $${expedition.funds.toLocaleString()}</div>
    </div>
    <div class="next">
      <button data-ui="shop">🛠️ Boatyard (B)</button>
      <button data-ui="go">Cast off (Space)</button>
    </div>`;
  overlayEl.classList.remove("hidden");
  statusEl.textContent = "Briefing";
}

// ----- Boatyard -----
function openShop() {
  if (state.phase !== "briefing" && state.phase !== "summary") return;
  state.shopOpen = true;
  renderShop();
}
function closeShop() {
  state.shopOpen = false;
  if (state.phase === "briefing") renderBriefing();
  else {
    overlayTitleEl.textContent = expedition.summaryTitle;
    overlayBodyEl.innerHTML = expedition.summaryHTML;
  }
}
function renderShop() {
  overlayTitleEl.textContent = "🛠️ Boatyard";
  overlayBodyEl.innerHTML = `
    <div class="card shop">
      <div class="row"><span class="label">Funds</span><b>$${expedition.funds.toLocaleString()}</b></div>
      ${UPGRADES.map((u, i) => {
        const have = owned(u.id);
        const afford = expedition.funds >= u.price;
        return `<div class="shop-item${have ? " owned" : ""}">
          <div><b>${i + 1}. ${u.icon} ${u.name}</b><div class="desc">${u.desc}</div></div>
          ${
            have
              ? `<span class="owned-tag">Owned</span>`
              : `<button data-buy="${u.id}"${afford ? "" : " disabled"}>$${u.price.toLocaleString()}</button>`
          }
        </div>`;
      }).join("")}
    </div>
    <div class="next"><button data-ui="close">Back (B)</button></div>`;
}
function buyUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || owned(id)) return;
  if (expedition.funds < u.price) {
    toast(`Not enough money for the ${u.name} yet.`);
    return;
  }
  expedition.funds -= u.price;
  upgrades.add(id);
  saveGame();
  toast(`${u.icon} ${u.name} fitted to your boat!`, "goal");
  renderShop();
}

// Clicks and taps on overlay buttons
overlayBodyEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  e.stopPropagation();
  if (btn.dataset.buy) buyUpgrade(btn.dataset.buy);
  else if (btn.dataset.ui === "shop") openShop();
  else if (btn.dataset.ui === "close") closeShop();
  else if (btn.dataset.ui === "go") pressSpace();
  else if (btn.dataset.ui === "new") startNewGame();
});
overlayBodyEl.addEventListener("pointerup", (e) => {
  if (e.target.closest("button")) e.stopPropagation();
});

function beginExpedition() {
  placeBoatAtHarbor();
  state.timeOfDay = EXPEDITION_START_HOUR;
  weather.value = weather.target = expedition.forecast;
  weather.timer = rand(60, 120);
  const fuelMax = owned("tank") ? 150 : 100;
  Object.assign(expedition, {
    fuel: fuelMax,
    fuelMax,
    goalDone: false,
    hours: 0,
    distance: 0,
    photos: 0,
    earnings: 0,
    discoveryEarnings: 0,
    photoEarnings: 0,
    relicEarnings: 0,
    newFinds: [],
    lastX: state.boat.x,
    lastZ: state.boat.z,
    warned25: false,
    warned10: false,
  });
  for (const s of schools) s.placed = false;
  state.phase = "running";
  state.running = true;
  state.paused = false;
  state.shopOpen = false;
  overlayEl.classList.add("hidden");
  goalTitleEl.textContent = expedition.goal.title;
  goalHintEl.textContent = expedition.goal.hint;
  goalEl.classList.remove("hidden", "done");
  statusEl.textContent = "At sea — Space to pause";
  updateCamera(0, true);
}

function nearHarbor() {
  return Math.hypot(state.boat.x - harbor.dockX, state.boat.z - harbor.dockZ) < 35;
}

function tryEndExpedition() {
  if (nearHarbor()) endExpedition(false);
  else if (expedition.fuel <= 0) endExpedition(true);
}

function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

const MYSTERY_TEXT =
  "The three fragments fit together into a disc of dark metal, faintly warm to the touch. " +
  "Its markings don't match any chart you own — but they all point east, past Goat Island, beyond the edge of the map…";

function endExpedition(towed) {
  state.running = false;
  state.phase = "summary";
  state.boat.speed = 0;
  goalEl.classList.add("hidden");
  promptEl.classList.add("hidden");

  const finds = expedition.newFinds.map((id) => JOURNAL_BY_ID[id]);
  const count = (cats) => finds.filter((f) => cats.includes(f.cat)).length;
  // Today's pay: every new discovery, every first photo, every relic, plus the task reward
  const reward = expedition.goalDone ? expedition.goal.reward : 0;
  const lines = [
    ["📓 New discoveries", expedition.discoveryEarnings],
    ["📷 New photos", expedition.photoEarnings],
  ];
  if (expedition.relicEarnings) lines.push(["🏺 Relics", expedition.relicEarnings]);
  lines.push([expedition.goalDone ? `★ Task: ${expedition.goal.title}` : "★ Task not completed", reward]);
  const earned = lines.reduce((sum, [, v]) => sum + v, 0);
  if (towed && earned) lines.push(["Tow fee (30%)", -Math.round(earned * 0.3)]);
  const total = lines.reduce((sum, [, v]) => sum + v, 0);
  expedition.funds += total;
  if (expedition.goalDone) expedition.completedGoals.add(expedition.goal.id);
  expedition.forecast = WEATHER_TARGETS[Math.floor(Math.random() * WEATHER_TARGETS.length)];

  const row = (label, value) => `<div class="row"><span>${label}</span><span>${value}</span></div>`;
  const money = (v) => `${v < 0 ? "−" : "+"}$${Math.abs(v).toLocaleString()}`;
  let mystery = "";
  if (expedition.newFinds.some((id) => id.startsWith("fragment")) && expedition.mysterySolved) {
    mystery = `<div style="margin-top:10px;opacity:0.9">✦ ${MYSTERY_TEXT}</div>`;
  } else if (expedition.newFinds.includes("glow") && !owned("diving")) {
    mystery = `<div style="margin-top:10px;opacity:0.85">Something glinted beneath the strange light… You'd need diving gear to reach it.</div>`;
  }
  const affordable = UPGRADES.filter((u) => !owned(u.id) && expedition.funds >= u.price).length;

  expedition.summaryTitle = towed ? "Towed back to harbor" : "Expedition complete";
  expedition.summaryHTML = `
    <div class="card">
      ${row("Time at sea", formatDuration(expedition.hours))}
      ${row("🐬 New wildlife", count(["Wildlife"]))}
      ${row("🏝️ New places", count(["Coast & islands", "Underwater", "Ruins & relics", "Mysteries"]))}
      ${row("⛵ Boats & people", count(["People & boats"]))}
      ${row("🏺 Relics recovered", count(["Relics"]))}
      ${row("🌅 Sky & weather", count(["Sky & weather"]))}
      ${row("📷 New photos", expedition.photos)}
      ${row("🗺️ Distance", `${(expedition.distance / 1000).toFixed(1)} km`)}
      ${row("⛽ Fuel left", `${Math.round((expedition.fuel / expedition.fuelMax) * 100)}%`)}
      <div style="margin-top:8px"></div>
      ${row("Funds before the trip", `$${(expedition.funds - total).toLocaleString()}`)}
      ${lines.map(([label, v]) => row(label, money(v))).join("")}
      <div class="row total"><span>Earned today</span><span>${money(total)}</span></div>
      ${row("<b>Funds now</b>", `<b>$${expedition.funds.toLocaleString()}</b>`)}
      ${mystery}
    </div>
    <div class="next">Tomorrow's weather: ${weatherName(expedition.forecast)}${
      affordable ? `<br>🛠️ You can afford ${affordable} upgrade${affordable > 1 ? "s" : ""} at the boatyard` : ""
    }<br>
      <button data-ui="shop">🛠️ Boatyard (B)</button>
      <button data-ui="go">Next day (Space)</button>
    </div>`;
  overlayTitleEl.textContent = expedition.summaryTitle;
  overlayBodyEl.innerHTML = expedition.summaryHTML;
  overlayEl.classList.remove("hidden");
  statusEl.textContent = "Back at harbor";

  // Save, ready for the next day
  expedition.day++;
  saveGame();
  expedition.day--;
}

// ---- Notifications ----
function toast(text, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = text;
  toastsEl.appendChild(el);
  while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 700);
  }, 3500);
}

// ---- What can be seen from the boat right now ----
const camForward = new THREE.Vector3();
const projected = new THREE.Vector3();

// Screen position of a world point, or null if it's behind the camera
function toScreen(pos) {
  camera.getWorldDirection(camForward);
  if (tmpVec.copy(pos).sub(camera.position).dot(camForward) <= 0) return null;
  return projected.copy(pos).project(camera);
}

// Everything that could be spotted or photographed right now, with how it can be seen:
//   fog:   fades out in the sea haze (so rain and fog shorten how far away you can see it)
//   under: underwater (only visible through the water in daylight)
//   lit:   gives off its own light, so it can be seen at night
//   no pos: all around you (stars, rain, storm)
function currentSightings(env) {
  const b = state.boat;
  const list = [];
  const add = (id, pos, range, flags = {}) => list.push({ id, pos, range, ...flags });
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  const FOG = { fog: true };
  const UNDER = { fog: true, under: true };

  if (birds[0].g.visible) add("gulls", at(flock.x, 30, flock.z), 140, FOG);
  for (const f of fishes) if (f.active) add("flyingfish", f.mesh.position.clone(), 60, FOG);
  for (const d of dolphins) if (d.active && d.mesh.position.y > -2) add("dolphins", d.mesh.position.clone(), 160, FOG);
  if (reefBodies.visible) for (const s of schools) add("reeffish", at(s.x, s.y, s.z), 45, UNDER);

  add("harbor", at(harbor.pierX, 2, (harbor.pierZ0 + harbor.pierZ1) / 2), 200, { fog: true, lit: true });
  if (cliffAmount(b.x) > 0.7) {
    const shoreZ = SHORE_Z + headland(b.x) + (noise1(b.x * 0.008) - 0.5) * 60;
    add("cliffs", at(b.x, 20, shoreZ - 25), 400);
  }
  add("lighthouse", lighthouse.group.position.clone().setY(lighthouse.group.position.y + 20), 900, { lit: true });
  for (const s of seaStacks) add("stacks", at(s.x, 15, s.z), 500);

  // The reef has to be in view: look at the sea floor ahead of the boat
  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  const rx = b.x + fx * 18;
  const rz = b.z + fz * 18;
  if (inland(rx, rz) > -170 && cliffAmount(rx) > 0.5 && seaBed(rx, rz) < -2) add("reef", at(rx, seaBed(rx, rz), rz), 40, UNDER);

  add("wreck", at(WRECK.x, WRECK.y + 2, WRECK.z), 70, UNDER);
  add("sailboat", at(SAILBOAT.x, SAILBOAT.y + 1, SAILBOAT.z), 60, UNDER);
  add("freighter", at(FREIGHTER.x, 2, FREIGHTER.z), 450, FOG);
  add("temple", at(TEMPLE.x, TEMPLE.y + 3, TEMPLE.z), 60, UNDER);
  add("colossus", at(COLOSSUS.x, COLOSSUS.y + 1, COLOSSUS.z), 50, UNDER);
  const pI = ISLAND.palm;
  const sI = ISLAND.seal;
  const gI = ISLAND.goat;
  add("palmislet", at(pI.x, 4, pI.z), 380);
  add("sealrock", at(sI.x, 3, sI.z), 380);
  add("goatisland", at(gI.x, 10, gI.z), 500);
  const gTop = islandSummit(gI);
  add("ruins", at(gTop.x, gTop.y + 3, gTop.z), 220);
  add("watcher", at(gTop.x, gTop.y + 7, gTop.z), 200); // the statue's chest
  for (const s of seals) add("seals", s.g.position.clone().setY(s.g.position.y + 0.5), 120);
  for (const g of goats) add("goats", g.g.position.clone().setY(g.g.position.y + 0.8), 110);
  for (const tu of turtles) add("turtles", tu.g.position.clone(), 45, UNDER);
  if (env.lampsOn > 0.5) add("glow", at(GLOW.x, GLOW.y, GLOW.z), 350, { lit: true });
  if (flight.active) add("airliner", airplane.group.position.clone(), 2600, { lit: true });

  // Boats, the sightseeing plane, and people at the cove
  const LIT_SHIPS = { ferry: true, tanker: true, coastguard: true };
  const SHIP_RANGE = { sailboat: 450, tourboat: 400, ferry: 1200, tanker: 1800, coastguard: 600 };
  const SHIP_ID = { sailboat: "sailboats", tourboat: "tourboat", ferry: "ferry", tanker: "tanker", coastguard: "coastguard" };
  for (const v of vessels) {
    add(SHIP_ID[v.type], at(v.x, v.type === "tanker" ? 10 : 3, v.z), SHIP_RANGE[v.type], { lit: !!LIT_SHIPS[v.type] });
  }
  if (smallPlane.group.visible) add("smallplane", smallPlane.group.position.clone(), 1500);
  for (const s of swimmers) if (s.g.visible) add("swimmers", s.g.position.clone().setY(s.g.position.y + 0.25), 90);
  for (const s of surfers) if (s.g.visible) add("surfers", s.g.position.clone().setY(s.g.position.y + 1), 150);
  for (const g of sunbathers) if (g.visible) add("sunbathers", g.position.clone().setY(g.position.y + 1), 160);

  // The town, and its lights after dark; the river mouths and the swamp between them
  const townY = landHeight(TOWN_CENTER.x, TOWN_CENTER.z);
  add("town", at(TOWN_CENTER.x, townY + 10, TOWN_CENTER.z), 1200);
  if (env.lampsOn > 0.5) add("townlights", at(TOWN_CENTER.x, townY + 8, TOWN_CENTER.z), 2500, { lit: true });
  add("delta", at(800, 1.5, shoreZAt(800) - 20), 450);
  add("swamp", at(SWAMP.x, 2, SWAMP.z), 280);

  // Sunset: you have to be looking toward the sun. Aurora: toward the northern sky.
  const cam = camera.position;
  const e = shared.uSunDir.value.y;
  if (e > -0.03 && e < 0.12 && wx.overcast < 0.5) {
    add("sunset", cam.clone().addScaledVector(shared.uSunDir.value, 800), Infinity, { lit: true });
  }
  if (shared.uAurora.value > 0.35) {
    add("aurora", cam.clone().add(new THREE.Vector3(0, 0.12, -1).normalize().multiplyScalar(800)), Infinity, { lit: true });
  }
  if (shared.uStars.value > 0.6) add("stars", null, Infinity);
  if (wx.rain > 0.5) add("rain", null, Infinity);
  if (wx.storm > 0.5) add("storm", null, Infinity);
  return list;
}

function inRange(s, rangeFn = (r) => r) {
  if (!s.pos) return true;
  const b = state.boat;
  const dist = s.id === "airliner" ? s.pos.distanceTo(camera.position) : Math.hypot(s.pos.x - b.x, s.pos.z - b.z);
  // Optics change the range, but nothing sees through the fog
  const range = s.fog ? Math.min(rangeFn(s.range), scene.fog.far) : rangeFn(s.range);
  return dist < range;
}

// margin: how much of the screen width counts (1 = anywhere, 0.6 = the middle, for photos).
// Vertically anywhere on screen counts, since the camera can't be tilted up or down.
function onScreen(s, margin) {
  if (!s.pos) return true;
  const p = toScreen(s.pos);
  return !!p && Math.abs(p.x) < margin && Math.abs(p.y) < 0.95;
}

// Ground height anywhere: the coast and sea floor, plus the islands
function groundAt(x, z) {
  let g = landHeight(x, z);
  for (const I of ISLANDS) {
    if (Math.hypot(x - I.x, z - I.z) < I.R * 1.3) g = Math.max(g, islandHeight(I, x, z));
  }
  return g;
}

// Is the straight line from the camera to the target clear of terrain, islands and sea stacks?
function lineOfSight(target) {
  const from = camera.position;
  const dist = from.distanceTo(target);
  const n = clamp(Math.ceil(dist / 8), 12, 120);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (t > 0.97) break; // don't count the ground the target itself stands on
    const x = from.x + (target.x - from.x) * t;
    const y = from.y + (target.y - from.y) * t;
    const z = from.z + (target.z - from.z) * t;
    if (groundAt(x, z) > y + 0.3) return false;
    for (const s of seaStacks) if (y < s.h && Math.hypot(x - s.x, z - s.z) < s.r) return false;
  }
  return true;
}

// Can you actually see it? In range, in the frame, not hidden behind anything, and lit well enough.
// margin: how much of the screen counts (1 = anywhere on screen, 0.6 = the middle, for photos)
function isVisible(s, env, margin, rangeFn) {
  if (!inRange(s, rangeFn) || !onScreen(s, margin)) return false;
  if (s.under && env.lightLevel < 0.35) return false; // too dark to see underwater
  if (!s.lit && s.pos && env.lightLevel < 0.2) {
    // At night only things close by and above water, lit by the boat's lights, can be seen
    if (s.under || s.pos.distanceTo(camera.position) > 40) return false;
  }
  return !s.pos || lineOfSight(s.pos);
}

function checkGoal(kind, id) {
  if (expedition.goalDone || !expedition.goal) return;
  if (expedition.goal.check(kind, id)) {
    expedition.goalDone = true;
    goalEl.classList.add("done");
    toast(`★ Task complete! Head back to the harbor to collect $${expedition.goal.reward}.`, "goal");
  }
}

function discover(id) {
  const entry = JOURNAL_BY_ID[id];
  if (journal[id].seen) return;
  journal[id].seen = true;
  expedition.newFinds.push(id);
  expedition.discoveryEarnings += entry.value;
  toast(`📓 New in your journal: ${entry.name}${entry.value ? ` +$${entry.value}` : ""}`, "discovery");
  if (id === "glow") toast("Something is down there, glinting… out of reach for now.");
  checkGoal("discover", id);
  if (!journalEl.classList.contains("hidden")) renderJournal();
}

// Distances: you can *spot* things from their full range (farther with binoculars), but to *photograph*
// them you have to get much closer — about a third of that, though never under 100 m, so things on land
// stay reachable from the water. Close-range subjects (underwater sites, fish) keep their own range.
// The telephoto camera stretches photos to about half the spotting range, at least 150 m, and off-centre.
const spotRange = () => (owned("binoculars") ? (r) => r * 1.5 : (r) => r);
const photoRange = () =>
  owned("camera") ? (r) => Math.min(r, Math.max(150, r * 0.55)) : (r) => Math.min(r, Math.max(100, r * 0.35));
const photoMargin = () => (owned("camera") ? 0.9 : 0.6);

function takePhoto() {
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), 40);
  const inFrame = [];
  for (const s of currentSightings(lastEnv)) {
    if (isVisible(s, lastEnv, photoMargin(), photoRange()) && !inFrame.includes(s.id)) inFrame.push(s.id);
  }
  if (!inFrame.length) {
    toast("📷 Nothing notable in the frame");
    return;
  }
  for (const id of inFrame) {
    const entry = JOURNAL_BY_ID[id];
    discover(id);
    if (!journal[id].photo) {
      journal[id].photo = true;
      expedition.photos++;
      const bonus = photoValue(entry);
      expedition.photoEarnings += bonus;
      toast(`📷 Photo added to your journal: ${entry.name}${bonus ? ` +$${bonus}` : ""}`, "discovery");
      if (!journalEl.classList.contains("hidden")) renderJournal();
    } else {
      toast(`📷 You already have a photo of ${entry.name} (no pay for repeats)`);
    }
    // A task can still need this photo (e.g. at sunset, or in a certain place)
    checkGoal("photo", id);
  }
}

function renderJournal() {
  const found = JOURNAL.filter((e) => journal[e.id].seen).length;
  const cats = [...new Set(JOURNAL.map((e) => e.cat))];
  journalEl.innerHTML =
    `<h2>🌊 Ocean Journal</h2>
     <div style="opacity:0.75">Day ${expedition.day} · $${expedition.funds.toLocaleString()} · ${found}/${JOURNAL.length} discovered · J to close</div>` +
    cats
      .map(
        (cat) =>
          `<h3>${cat}</h3>` +
          JOURNAL.filter((e) => e.cat === cat)
            .map((e) => {
              const j = journal[e.id];
              return j.seen
                ? `<div class="entry"><span>${e.name}</span><span>✓${j.photo ? " 📷" : ""} <span style="opacity:0.6">$${
                    e.value + (j.photo && e.cat !== "Relics" ? photoValue(e) : 0)
                  }</span></span></div>`
                : `<div class="entry unknown"><span>???</span><span></span></div>`;
            })
            .join("")
      )
      .join("");
}

function toggleJournal() {
  const show = journalEl.classList.contains("hidden");
  if (show) renderJournal();
  journalEl.classList.toggle("hidden", !show);
}

// ===== Sonar and diving =====
// Every underwater site, and the relic a diver can recover there
const DIVE_SITES = [
  { site: "wreck", relic: "bell", x: WRECK.x, z: WRECK.z },
  { site: "sailboat", relic: "compass", x: SAILBOAT.x, z: SAILBOAT.z },
  { site: "freighter", relic: "logbook", x: FREIGHTER.x, z: FREIGHTER.z },
  { site: "temple", relic: "coin", x: TEMPLE.x, z: TEMPLE.z },
  { site: "colossus", relic: "fragment3", x: COLOSSUS.x, z: COLOSSUS.z },
  { site: "glow", relic: "fragment1", x: GLOW.x, z: GLOW.z },
  { site: "deepwreck", relic: "fragment2", x: DEEP_WRECK.x, z: DEEP_WRECK.z },
];
const SONAR_RANGE = 320;
const DIVE_RANGE = 28;
const sonarEl = document.getElementById("sonar");
const diveBtn = document.querySelector('#touch-buttons [data-act="dive"]');
let sonarContact = null;

function nearestSite(maxDist) {
  const b = state.boat;
  let best = null;
  for (const s of DIVE_SITES) {
    const dist = Math.hypot(s.x - b.x, s.z - b.z);
    if (dist < maxDist && (!best || dist < best.dist)) best = { ...s, dist };
  }
  return best;
}

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
function updateSonar() {
  const active = owned("sonar") && state.phase === "running";
  sonarEl.classList.toggle("hidden", !active);
  sonarContact = null;
  if (!active) return;
  const b = state.boat;
  const c = nearestSite(SONAR_RANGE);
  if (!c) {
    sonarEl.textContent = "📡 Sonar: no contacts";
    return;
  }
  sonarContact = c;
  // Bearing relative to the boat's heading, as an arrow
  const rel = wrapAngle(Math.atan2(-(c.x - b.x), -(c.z - b.z)) - b.yaw);
  const arrow = ARROWS[(Math.round(-rel / (Math.PI / 4)) + 8) % 8];
  const name = journal[c.site].seen ? JOURNAL_BY_ID[c.site].name : "unknown contact";
  sonarEl.textContent = `📡 ${name} · ${Math.round(c.dist)} m ${arrow}`;
  // The deep wreck is too deep to see: sonar is the only way to find it
  if (c.site === "deepwreck" && c.dist < 45 && !journal.deepwreck.seen) {
    toast("📡 Sonar: something big on the bottom, 20 m down — a wreck!", "discovery");
    discover("deepwreck");
  }
}

function tryDive() {
  const b = state.boat;
  const near = nearestSite(DIVE_RANGE);
  if (!near) {
    toast("🤿 Nothing to dive on right here.");
    return;
  }
  if (!owned("diving")) {
    toast("🤿 You need diving gear from the boatyard to dive here.");
    return;
  }
  if (!journal[near.site].seen) {
    toast("🤿 You haven't found anything here yet. Look for it first.");
    return;
  }
  if (Math.abs(b.speed) > 1.5) {
    toast("🤿 Slow down and stop over the site first.");
    return;
  }
  const relic = JOURNAL_BY_ID[near.relic];
  if (journal[near.relic].seen) {
    toast(`🤿 You've already recovered the ${relic.name} here.`);
    return;
  }
  // The dive: a blue fade, some time passes, and the relic comes up
  flashEl.classList.add("dive");
  setTimeout(() => flashEl.classList.remove("dive"), 1400);
  state.timeOfDay = (state.timeOfDay + 0.33) % 24;
  expedition.hours += 0.33;
  journal[near.relic].seen = true;
  journal[near.relic].photo = true;
  expedition.newFinds.push(near.relic);
  expedition.relicEarnings += relic.value;
  toast(`🤿 You dive to the ${JOURNAL_BY_ID[near.site].name} and bring up: ${relic.name}! +$${relic.value}`, "discovery");
  if (near.relic === "logbook") toast("📖 The last entry mentions 'a light beneath the eastern cliffs' and 'the one who points'.");
  const fragments = ["fragment1", "fragment2", "fragment3"].filter((id) => journal[id].seen).length;
  if (near.relic.startsWith("fragment")) {
    if (fragments < 3) toast(`✦ Artifact fragments: ${fragments} of 3`, "goal");
    else if (!expedition.mysterySolved) {
      expedition.mysterySolved = true;
      toast("✦ The three fragments fit together… something about this coast is not what it seems.", "goal");
    }
  }
  checkGoal("relic", near.relic);
  if (!journalEl.classList.contains("hidden")) renderJournal();
}

// ===== White highlights on subjects you haven't photographed yet =====
const targetsEl = document.getElementById("targets");
const targetPool = [];
let targetList = [];
function targetMarker(i) {
  if (!targetPool[i]) {
    const el = document.createElement("div");
    el.className = "target";
    el.innerHTML = "<span></span>";
    targetsEl.appendChild(el);
    targetPool[i] = el;
  }
  return targetPool[i];
}
function updatePhotoTargets(env, refresh) {
  const show = state.phase === "running" && !state.paused;
  if (refresh && show) {
    // Visible subjects not yet in the journal as a photo, nearest one per kind
    const best = {};
    for (const s of currentSightings(env)) {
      if (!s.pos || journal[s.id].photo) continue;
      if (!isVisible(s, env, 1.0, photoRange())) continue;
      const d = s.pos.distanceTo(camera.position);
      if (!best[s.id] || d < best[s.id].d) best[s.id] = { s, d };
    }
    targetList = Object.values(best).slice(0, 6);
  }
  let n = 0;
  if (show) {
    for (const { s } of targetList) {
      const p = toScreen(s.pos);
      if (!p || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
      const el = targetMarker(n++);
      el.style.display = "block";
      el.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
      el.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
      const ready = Math.abs(p.x) < photoMargin();
      el.classList.toggle("ready", ready);
      el.firstChild.textContent = ready ? `📷 ${JOURNAL_BY_ID[s.id].name}` : JOURNAL_BY_ID[s.id].name;
    }
  }
  for (let i = n; i < targetPool.length; i++) targetPool[i].style.display = "none";
}

// ---- Per-frame expedition update ----
let lastEnv = { lampsOn: 0, light: 1, lightLevel: 1 };
let spotFrame = 0;

function updateExpedition(dt, t, env) {
  lastEnv = env;
  updateIslandLife(dt, t);
  updateTraffic(dt, t, env);
  updateBeachLife(dt, t, env);

  // Harbor lamp and the strange light glow at night
  harborScene.lampMat.emissiveIntensity = 2 * env.lampsOn;
  harborScene.lampGlow.material.opacity = env.lampsOn;
  const pulse = 0.65 + 0.35 * Math.sin(t * 1.7);
  strangeGlow.halo.material.opacity = env.lampsOn * pulse;
  strangeGlow.core.material.emissiveIntensity = 0.3 + 2 * env.lampsOn * pulse;

  // Gear that shows on screen: sonar readout, dive button, and white rings on new photo subjects
  updateSonar();
  if (diveBtn) diveBtn.classList.toggle("hidden", !owned("diving"));
  updatePhotoTargets(env, spotFrame % 6 === 0);

  if (state.phase !== "running") return;
  const b = state.boat;

  // Fuel: idling sips, full throttle gulps; rough seas cost more unless the hull is reinforced
  const seaPenalty = owned("hull") ? 1 : 1 + 0.5 * wx.storm;
  const burn = (0.012 + Math.abs(b.throttle) * 0.34 * (0.4 + (0.6 * Math.abs(b.speed)) / MAX_FORWARD)) * seaPenalty;
  expedition.fuel = Math.max(0, expedition.fuel - burn * dt);
  const fuelFrac = expedition.fuel / expedition.fuelMax;
  if (fuelFrac < 0.25 && !expedition.warned25) {
    expedition.warned25 = true;
    toast("⛽ Fuel at 25%. Think about heading home.");
  }
  if (fuelFrac < 0.1 && !expedition.warned10) {
    expedition.warned10 = true;
    toast("⛽ Fuel at 10%!");
  }

  expedition.distance += Math.hypot(b.x - expedition.lastX, b.z - expedition.lastZ);
  expedition.lastX = b.x;
  expedition.lastZ = b.z;

  // Spot anything visible (checked a few times a second; the line-of-sight test isn't free)
  if (++spotFrame % 6 === 0) {
    for (const s of currentSightings(env)) {
      if (!journal[s.id].seen && isVisible(s, env, 1.0, spotRange())) discover(s.id);
    }
  }

  // Context prompt
  let prompt = "";
  const site = nearestSite(DIVE_RANGE);
  if (nearHarbor() && expedition.hours > 0.05) prompt = "Press E to dock and end today's expedition";
  else if (expedition.fuel <= 0) prompt = "Out of fuel! Press E to radio for a tow (costs 30% of today's task reward)";
  else if (site && journal[site.site].seen && !journal[site.relic].seen) {
    const name = JOURNAL_BY_ID[site.site].name;
    if (!owned("diving")) prompt = `You could dive on the ${name} here — with diving gear from the boatyard`;
    else if (Math.abs(b.speed) > 1.5) prompt = `Stop over the ${name} to dive`;
    else prompt = `Press X to dive on the ${name}`;
  }
  promptEl.textContent = prompt;
  promptEl.classList.toggle("hidden", !prompt);
}

// ===== Minimap: north-up, centred on the boat, with home and the lighthouse =====
const minimapEl = document.getElementById("minimap");
const mm = minimapEl.getContext("2d");
const MAP_RANGE_DEFAULT = 1600; // metres from the boat to the edge of the map (2600 with the chartplotter)
// Places the chartplotter marks once discovered
const CHART_POINTS = [
  { id: "wreck", x: WRECK.x, z: WRECK.z, color: "#9ad1ff" },
  { id: "deepwreck", x: DEEP_WRECK.x, z: DEEP_WRECK.z, color: "#9ad1ff" },
  { id: "sailboat", x: SAILBOAT.x, z: SAILBOAT.z, color: "#9ad1ff" },
  { id: "freighter", x: FREIGHTER.x, z: FREIGHTER.z, color: "#9ad1ff" },
  { id: "temple", x: TEMPLE.x, z: TEMPLE.z, color: "#e8dcc0" },
  { id: "colossus", x: COLOSSUS.x, z: COLOSSUS.z, color: "#e8dcc0" },
  { id: "glow", x: GLOW.x, z: GLOW.z, color: "#55ffe6" },
  { id: "town", x: TOWN_CENTER.x, z: TOWN_CENTER.z, color: "#ffffff" },
  { id: "delta", x: 800, z: shoreZAt(800) - 20, color: "#5fa8d3" },
];
const coastLine = [];
for (let x = -3000; x <= 3000; x += 20) coastLine.push([x, SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60]);

function drawMinimap() {
  const MAP_RANGE = owned("chart") ? 2600 : MAP_RANGE_DEFAULT; // the chartplotter zooms out
  const W = minimapEl.width;
  const c = W / 2;
  const R = c - 6;
  const s = R / MAP_RANGE;
  const b = state.boat;
  const toMap = (x, z) => [c + (x - b.x) * s, c + (z - b.z) * s];

  mm.clearRect(0, 0, W, W);
  mm.save();
  mm.beginPath();
  mm.arc(c, c, R, 0, Math.PI * 2);
  mm.clip();
  mm.fillStyle = "rgba(12, 60, 84, 0.78)";
  mm.fillRect(0, 0, W, W);

  // Coast (land lies north of the coastline, i.e. up)
  mm.fillStyle = "#cdb88c";
  mm.beginPath();
  coastLine.forEach(([x, z], i) => {
    const [px, py] = toMap(x, z);
    if (i === 0) mm.moveTo(px, py);
    else mm.lineTo(px, py);
  });
  mm.lineTo(toMap(3000, 0)[0], -20);
  mm.lineTo(toMap(-3000, 0)[0], -20);
  mm.closePath();
  mm.fill();

  // Islands and sea stacks
  for (const I of ISLANDS) {
    const [px, py] = toMap(I.x, I.z);
    mm.beginPath();
    mm.arc(px, py, Math.max(3, I.R * s), 0, Math.PI * 2);
    mm.fill();
  }
  mm.fillStyle = "#e8dcc0";
  for (const st of seaStacks) {
    const [px, py] = toMap(st.x, st.z);
    mm.fillRect(px - 1.5, py - 1.5, 3, 3);
  }

  // Swamp, river and town
  mm.fillStyle = "rgba(90, 110, 60, 0.9)";
  const [swx, swy] = toMap(SWAMP.x, SWAMP.z);
  mm.beginPath();
  mm.arc(swx, swy, SWAMP.r * 0.8 * s, 0, Math.PI * 2);
  mm.fill();
  mm.strokeStyle = "#5fa8d3";
  mm.lineCap = "round";
  for (const seg of RIVER_SEGS) {
    mm.lineWidth = Math.max(2, seg.w * s * 2.5);
    mm.beginPath();
    mm.moveTo(...toMap(seg.ax, seg.az));
    mm.lineTo(...toMap(seg.bx, seg.bz));
    mm.stroke();
  }
  mm.fillStyle = "#8d8a86";
  for (let x = TOWN.x0; x <= TOWN.x1; x += 40) {
    const [px, py] = toMap(x, shoreZAt(x) - 70);
    mm.fillRect(px - 3, py - 12 * s * 20, 6, 12 * s * 20);
  }

  // Home and lighthouse markers, pinned to the rim when off the map
  const marker = (x, z, label, color) => {
    let [px, py] = toMap(x, z);
    const dx = px - c;
    const dy = py - c;
    const d = Math.hypot(dx, dy);
    const edge = R - 14;
    if (d > edge) {
      px = c + (dx / d) * edge;
      py = c + (dy / d) * edge;
    }
    mm.fillStyle = color;
    mm.beginPath();
    mm.arc(px, py, 12, 0, Math.PI * 2);
    mm.fill();
    mm.fillStyle = "#08202c";
    mm.font = "bold 15px system-ui, sans-serif";
    mm.textAlign = "center";
    mm.textBaseline = "middle";
    mm.fillText(label, px, py + 1);
  };
  marker(harbor.dockX, harbor.dockZ, "H", "#7fd1b9");
  marker(lighthouse.group.position.x, lighthouse.group.position.z, "L", "#f2c14e");

  // Chartplotter: every place you've discovered is marked
  if (owned("chart")) {
    for (const p of CHART_POINTS) {
      if (!journal[p.id].seen) continue;
      const [px, py] = toMap(p.x, p.z);
      mm.fillStyle = p.color;
      mm.beginPath();
      mm.arc(px, py, 5, 0, Math.PI * 2);
      mm.fill();
    }
  }
  // Radio: today's search area
  if (expedition.searchArea && state.phase === "running" && !expedition.goalDone) {
    const [px, py] = toMap(expedition.searchArea.x, expedition.searchArea.z);
    mm.strokeStyle = "rgba(242, 193, 78, 0.95)";
    mm.lineWidth = 3;
    mm.setLineDash([8, 6]);
    mm.beginPath();
    mm.arc(px, py, expedition.searchArea.r * s, 0, Math.PI * 2);
    mm.stroke();
    mm.setLineDash([]);
  }
  // Sonar: a pulsing ring on the nearest contact
  if (sonarContact) {
    const [px, py] = toMap(sonarContact.x, sonarContact.z);
    const ping = (performance.now() / 1200) % 1;
    mm.strokeStyle = `rgba(120, 255, 200, ${1 - ping})`;
    mm.lineWidth = 3;
    mm.beginPath();
    mm.arc(px, py, 4 + ping * 22, 0, Math.PI * 2);
    mm.stroke();
  }

  // The boat: an arrow pointing where it's heading
  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  mm.save();
  mm.translate(c, c);
  mm.rotate(Math.atan2(fz, fx) + Math.PI / 2);
  mm.fillStyle = "#ffffff";
  mm.beginPath();
  mm.moveTo(0, -13);
  mm.lineTo(8, 10);
  mm.lineTo(0, 5);
  mm.lineTo(-8, 10);
  mm.closePath();
  mm.fill();
  mm.restore();

  // Distances home and to the lighthouse
  const km = (x, z) => (Math.hypot(x - b.x, z - b.z) / 1000).toFixed(1);
  mm.fillStyle = "rgba(255,255,255,0.9)";
  mm.font = "600 18px system-ui, sans-serif";
  mm.textAlign = "center";
  mm.fillText(
    `H ${km(harbor.dockX, harbor.dockZ)} km · L ${km(lighthouse.group.position.x, lighthouse.group.position.z)} km`,
    c,
    W - 34
  );
  mm.restore();

  mm.strokeStyle = "rgba(255,255,255,0.5)";
  mm.lineWidth = 3;
  mm.beginPath();
  mm.arc(c, c, R, 0, Math.PI * 2);
  mm.stroke();
  mm.fillStyle = "#fff";
  mm.font = "bold 16px system-ui, sans-serif";
  mm.fillText("N", c, 16);
}

// ===== Touch controls (phones and tablets) =====
const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
if (isTouchDevice) {
  document.getElementById("touch").classList.remove("hidden");
  document.querySelector("#overlay .hint").textContent =
    "Left stick: throttle and steer · drag the view to look around, pinch to zoom · 📷 photo · 📓 journal · ⚓ dock · 🎥 camera behind boat · ⏩ hold to speed up time · ⏸ pause · tap to continue";

  // Joystick: up/down = throttle, left/right = steer
  const stick = document.getElementById("stick");
  const knob = document.getElementById("stick-knob");
  let stickId = null;
  const moveStick = (e) => {
    const r = stick.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max);
    let dy = e.clientY - (r.top + max);
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    touch.throttle = dead(-dy / max);
    touch.turn = dead(-dx / max);
  };
  const releaseStick = () => {
    stickId = null;
    touch.active = false;
    touch.throttle = touch.turn = 0;
    knob.style.transform = "";
  };
  stick.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    touch.active = true;
    moveStick(e);
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickId) moveStick(e);
  });
  stick.addEventListener("pointerup", releaseStick);
  stick.addEventListener("pointercancel", releaseStick);

  // Buttons
  for (const btn of document.querySelectorAll("#touch-buttons button")) {
    const act = btn.dataset.act;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (act === "time") keys.add("KeyT");
      else if (act === "journal") toggleJournal();
      else if (act === "pause") pressSpace();
      else if (act === "camera") resetOrbit();
      else if (state.phase === "running" && !state.paused) {
        if (act === "photo") takePhoto();
        if (act === "dock") tryEndExpedition();
        if (act === "dive") tryDive();
      }
    });
    const up = (e) => {
      e.stopPropagation();
      if (act === "time") keys.delete("KeyT");
    };
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
  }

  // Tap anywhere else (without dragging the view) to continue from the title, briefing, summary or pause screens
  canvas.addEventListener("pointerup", () => {
    if (dragMoved < 10 && (state.phase !== "running" || state.paused)) pressSpace();
  });
}

// ===== Render =====
function render() {
  const b = state.boat;

  // Keep the water grid under the boat, snapped to the grid so it doesn't swim
  // Keep the water grid centred on the camera (snapped so it doesn't swim), with the far ocean around it
  const cx = Math.round(camera.position.x / WATER_STEP) * WATER_STEP;
  const cz = Math.round(camera.position.z / WATER_STEP) * WATER_STEP;
  water.position.set(cx, 0, cz);
  farOcean.position.set(cx, 0, cz);

  sky.position.copy(camera.position);
  waterUniforms.uCamPos.value.copy(camera.position);

  sunLight.position.copy(boat.root.position).addScaledVector(shared.uSunDir.value, 100);
  sunLight.target.position.copy(boat.root.position);
  moonLight.position.copy(boat.root.position).addScaledVector(shared.uSunDir.value, -100);
  moonLight.target.position.copy(boat.root.position);

  // Boat light positions for the water shader
  boat.root.updateMatrixWorld(true);
  const lightPos = waterUniforms.uBoatLightPos.value;
  boat.lamp.getWorldPosition(lightPos[0]);
  boat.navLights.forEach((nav, i) => nav.bulb.getWorldPosition(lightPos[i + 1]));
  boat.headlight.getWorldPosition(lightPos[4]);
  boat.headlight.target.getWorldPosition(tmpVec);
  waterUniforms.uBoatSpotDir.value.copy(tmpVec).sub(lightPos[4]).normalize();

  // Funds, plus what today's trip has earned so far (paid out when you dock)
  const today =
    expedition.discoveryEarnings + expedition.photoEarnings + expedition.relicEarnings +
    (expedition.goalDone && expedition.goal ? expedition.goal.reward : 0);
  scoreEl.textContent =
    state.phase === "running" && today
      ? `$${expedition.funds.toLocaleString()} (+$${today.toLocaleString()} today)`
      : `$${expedition.funds.toLocaleString()}`;
  const fuel = Math.round((expedition.fuel / expedition.fuelMax) * 100);
  fuelFillEl.style.width = `${fuel}%`;
  fuelFillEl.classList.toggle("low", fuel <= 25 && fuel > 0);
  fuelFillEl.classList.toggle("empty", fuel <= 0);
  fuelPctEl.textContent = `${fuel}%`;
  speedEl.textContent = `${Math.round(Math.abs(b.speed) * 1.944)} kn`;
  clockEl.textContent = `${formatClock(state.timeOfDay)} · ${weatherName(weather.value)} · Wind ${Math.round(
    weather.windSpeed * 1.944
  )} kn`;

  renderer.render(scene, camera);
  drawMinimap();
}

// ===== Loop =====
let last = performance.now();
let waveTime = 0;

updateWeather(0, false);
applyEnvironment(state.timeOfDay);
updateBoat(0, 0, false);
updateCamera(0, true);

// Title screen: continue a saved game, or start fresh
const hasSave = loadGame();
let confirmNew = false;
function renderTitle() {
  overlayTitleEl.textContent = hasSave ? "Welcome back" : "Press Space to start";
  const found = JOURNAL.filter((e) => journal[e.id].seen).length;
  overlayBodyEl.innerHTML = hasSave
    ? `<div class="next">Day ${expedition.day} · $${expedition.funds.toLocaleString()} · ${found}/${JOURNAL.length} in your journal · ${upgrades.size}/${UPGRADES.length} upgrades<br>
         <button data-ui="go">Continue (Space)</button>
         <button data-ui="new">${confirmNew ? "Really erase your progress? (N)" : "New game (N)"}</button></div>`
    : `<div class="next">A small boat, a long coastline, and a journal to fill.</div>`;
}
function startNewGame() {
  if (!hasSave) return;
  if (!confirmNew) {
    confirmNew = true;
    renderTitle();
    return;
  }
  eraseSave();
  location.reload();
}
renderTitle();

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // cap to avoid big jumps
  last = now;

  if (!state.paused) {
    waveTime += dt;
    shared.uTime.value = waveTime;

    const active = state.running;
    if (active) {
      const mult = keys.has("KeyT") ? TIME_FAST_FORWARD : 1;
      const hoursPassed = (dt * mult * 24) / DAY_LENGTH;
      state.timeOfDay = (state.timeOfDay + hoursPassed) % 24;
      expedition.hours += hoursPassed;
    }

    updateWeather(dt, active);
    updateBoat(dt, waveTime, active);
    const env = applyEnvironment(state.timeOfDay);
    updateDolphins(dt, waveTime);
    updateFish(dt, waveTime);
    updateReefFish(dt, waveTime);
    updateSplashes(dt);
    splashMat.color.setScalar(0.3 + 0.7 * env.lightLevel);
    updateBirds(dt, waveTime, env.light);
    updateAirplane(dt, waveTime, env.lightLevel);
    updateCamera(dt, false);
    updateRain(dt, env.lightLevel);
    updateLighthouse(dt, env.lampsOn);
    updateExpedition(dt, waveTime, env);
  }

  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
