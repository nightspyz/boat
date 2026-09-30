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
const FOG_FAR = 380;
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

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Space") {
    e.preventDefault();
    if (e.repeat) return;
    if (state.phase === "title" || state.phase === "summary") showBriefing();
    else if (state.phase === "briefing") beginExpedition();
    else togglePause();
  }
  if (e.code.startsWith("Arrow")) e.preventDefault();
  if (e.repeat) return;
  if (e.code === "KeyJ") toggleJournal();
  if (state.phase !== "running" || state.paused) return;
  if (e.code === "KeyF") takePhoto();
  if (e.code === "KeyE") tryEndExpedition();
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
  return beachProfile(Math.min(d, 0)) * (1 - cm) + cliffBed(Math.min(d, 0)) * cm;
}

const SHORE_GLSL = /* glsl */ `
  const float SHORE_Z = ${SHORE_Z.toFixed(1)};
  const float LH_X = ${LH_X.toFixed(1)};
  const float COVE_X = ${COVE_X.toFixed(1)};
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
    if (d < 0.0) {
      float beach = max(-0.3 + d * 0.04, -14.0);
      float cliff = d > -33.4 ? -0.3 + d * 0.35 : max(-12.0 + (d + 33.4) * 0.04, -20.0);
      return mix(beach, cliff, cm);
    }
    // Beach slope, or the rocky shelf at the foot of the cliffs
    return mix(-0.3 + min(d, 120.0) * 0.025, -0.3 + min(d, 10.0) * 0.09, cm);
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

        // Gerstner waves
        for (int i = 0; i < 4; i++) {
          vec4 w = uWaves[i];
          vec2 d = w.xy;
          float k = w.z;
          float s = w.w * uWaveScale * damp;
          float c = sqrt(9.8 / k);
          float f = k * (dot(d, wp.xz) - c * uTime);
          float a = s / k;
          float cf = cos(f);
          float sf = sin(f);
          disp += vec3(d.x * a * cf, a * sf, d.y * a * cf);
          tangent += vec3(-d.x * d.x * s * sf, d.x * s * cf, -d.x * d.y * s * sf);
          binormal += vec3(-d.x * d.y * s * sf, d.y * s * cf, -d.y * d.y * s * sf);
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
        float reefZone = max(nearReef, bayReef);
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

// opts.terrain: per-vertex rock mask (aRock) on the cliffs; opts.stack: sea stacks (all limestone);
// opts.rock: boulders (their own instance colour with grain)
function applyHaze(material, opts = {}) {
  const mode = opts.terrain ? "terrain" : opts.stack ? "stack" : opts.rock ? "rock" : "plain";
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

    const rockValue = mode === "terrain" ? "aRock" : mode === "plain" ? "0.0" : "1.0";
    shader.vertexShader =
      (mode === "terrain" ? "attribute float aRock;\n" : "") +
      "varying vec3 vCloudWorld;\nvarying float vRock;\n" +
      shader.vertexShader.replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        vec4 cloudPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cloudPos = instanceMatrix * cloudPos;
        #endif
        vCloudWorld = (modelMatrix * cloudPos).xyz;
        vRock = ${rockValue};`
      );

    // Boulders keep their own colour with some grain; cliffs and stacks are limestone
    const rockAlbedo =
      mode === "rock" ? "diffuseColor.rgb * (0.8 + 0.4 * noise3(rp * 2.5))" : "limestone(rp)";

    shader.fragmentShader =
      "uniform float uHazeNear;\nuniform float uHazeFar;\nuniform float uHazeMax;\n" +
      "uniform vec3 uSunDir;\nuniform float uSunVis;\nuniform vec3 uSunColor;\nuniform float uTime;\n" +
      "varying vec3 vCloudWorld;\n" +
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

function landHeight(x, z) {
  const d = inland(x, z);
  if (d < 0) return seaBed(x, z);
  const beachY = beachProfile(d);

  // Sandy cove backed by green hills
  let coveY = beachY + smooth(110, 360, d) * (25 + 110 * fbm2(x * 0.0025, z * 0.0025));
  coveY += (fbm2(x * 0.03, z * 0.03) - 0.5) * 3 * smooth(40, 90, d);

  // Limestone cliff rising from a rocky shelf at the waterline, cut by gullies and buttresses
  const cliffH = 32 + 26 * noise1(x * 0.01 + 3.1);
  const gully = (noise1(x * 0.07 + 11) - 0.5) * 16 + (noise1(x * 0.23 + 3) - 0.5) * 5;
  const rise = smooth(12, 30, d + gully + (fbm2(x * 0.05, z * 0.05) - 0.5) * 6);
  const step = 3.5 + 2 * noise1(x * 0.02 + 1.7);
  let cliffY = -0.3 + Math.min(d, 10) * 0.09 + terrace(cliffH * rise, step);
  cliffY += smooth(45, 300, d) * (8 + 50 * fbm2(x * 0.0025, z * 0.0025));
  cliffY += (fbm2(x * 0.08, z * 0.08) - 0.5) * 1.5 * smooth(8, 20, d);

  return coveY + (cliffY - coveY) * cliffAmount(x);
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
  pod.life = rand(25, 40);
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
  const leaving = pod.life < 0;
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
      tx = d.x - Math.sin(d.yaw) * 100;
      tz = d.z - Math.cos(d.yaw) * 100;
    }
    const dx = tx - d.x;
    const dz = tz - d.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(-dx, -dz);
    d.yaw += clamp(wrapAngle(desired - d.yaw), -1.5 * dt, 1.5 * dt);
    const targetSpeed = leaving ? 12 : clamp(dist * 0.6, 6, Math.abs(b.speed) + 7);
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
    if (d.phase < JUMP && pod.life > -4) {
      const u = d.phase / JUMP;
      rel = -1.6 + 3.2 * Math.sin(Math.PI * u);
      vy = ((3.2 * Math.PI) / JUMP) * Math.cos(Math.PI * u);
    }
    const h = waveHeight(d.x, d.z, t);
    if (d.prevRel < 0 !== rel < 0 && rel > -2.5 && d.prevRel > -2.5) splash(d.x, h, d.z, 25, 3);
    d.prevRel = rel;

    d.mesh.position.set(d.x, h + rel, d.z);
    d.mesh.rotation.set(Math.atan2(vy, Math.max(d.speed, 4)), d.yaw, 0);

    if (pod.life < -8) {
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

function updateBoat(dt, t, controllable) {
  const b = state.boat;
  let throttle = 0;
  let turn = 0;
  if (controllable) {
    throttle = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    turn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
  }
  if (expedition.fuel <= 0) throttle = 0; // engine dead: drift and steer only
  b.throttle = throttle;

  b.speed += throttle * ACCEL * dt;
  b.speed -= b.speed * DRAG * dt;
  b.speed = clamp(b.speed, MAX_REVERSE, MAX_FORWARD);

  // Rudder only works while moving
  const steer = clamp(b.speed / 6, -1, 1);
  b.yaw += turn * TURN_RATE * steer * dt;

  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  const rx = Math.cos(b.yaw);
  const rz = -Math.sin(b.yaw);
  const prevX = b.x;
  const prevZ = b.z;
  b.x += fx * b.speed * dt;
  b.z += fz * b.speed * dt;

  // Wind pushes the boat
  if (controllable) {
    b.x += Math.cos(weather.windAngle) * weather.windSpeed * 0.05 * dt;
    b.z += Math.sin(weather.windAngle) * weather.windSpeed * 0.05 * dt;
  }

  // Don't run aground in shallow water or hit the cliffs and sea stacks: bump back gently
  const tooShallow = seaBed(b.x, b.z) > -1.5 || inland(b.x, b.z) > -3;
  const hitStack = seaStacks.some((s) => Math.hypot(b.x - s.x, b.z - s.z) < s.r * 1.6 + 3);
  const hitPier = Math.abs(b.x - harbor.pierX) < 4 && b.z > harbor.pierZ0 && b.z < harbor.pierZ1 + 3;
  if (tooShallow || hitStack || hitPier) {
    b.x = prevX;
    b.z = prevZ;
    b.speed *= -0.3;
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

function updateCamera(dt, snap) {
  const b = state.boat;
  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  camDesired.set(b.x - fx * 14, b.y + 5.5, b.z - fz * 14);
  if (snap) camera.position.copy(camDesired);
  else camera.position.lerp(camDesired, 1 - Math.exp(-dt * 3));
  camTarget.set(b.x + fx * 4, b.y + 1.5, b.z + fz * 4);
  camera.lookAt(camTarget);
}

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

// ===== Discovery journal =====
const JOURNAL = [
  { id: "gulls", cat: "Wildlife", name: "Seagulls", value: 100 },
  { id: "flyingfish", cat: "Wildlife", name: "Leaping fish", value: 150 },
  { id: "reeffish", cat: "Wildlife", name: "Anthias school", value: 300 },
  { id: "dolphins", cat: "Wildlife", name: "Dolphin pod", value: 400 },
  { id: "harbor", cat: "Locations", name: "Harbor Cove", value: 0 },
  { id: "cliffs", cat: "Locations", name: "Limestone cliffs", value: 150 },
  { id: "lighthouse", cat: "Locations", name: "Lighthouse", value: 200 },
  { id: "stacks", cat: "Locations", name: "Sea stacks", value: 300 },
  { id: "reef", cat: "Ocean", name: "Coral reef", value: 250 },
  { id: "wreck", cat: "Ocean", name: "Old wreck", value: 800 },
  { id: "glow", cat: "Mysteries", name: "Strange light", value: 1000 },
  { id: "airliner", cat: "Sky & weather", name: "High-altitude airliner", value: 100 },
  { id: "sunset", cat: "Sky & weather", name: "Sunset at sea", value: 150 },
  { id: "stars", cat: "Sky & weather", name: "Starry night", value: 150 },
  { id: "aurora", cat: "Sky & weather", name: "Aurora", value: 600 },
  { id: "rain", cat: "Sky & weather", name: "Rain at sea", value: 150 },
  { id: "storm", cat: "Sky & weather", name: "Storm", value: 400 },
];
const JOURNAL_BY_ID = Object.fromEntries(JOURNAL.map((e) => [e.id, e]));
const journal = Object.fromEntries(JOURNAL.map((e) => [e.id, { seen: false, photo: false }]));

// ===== Expeditions =====
const GOALS = [
  {
    id: "stacks-sunset",
    title: "Sea Stacks at Sunset",
    hint: "Photograph the sea stacks off the lighthouse while the sun is low, around 17:00–18:15. Press F to take a photo.",
    check: (kind, id) => kind === "photo" && id === "stacks" && shared.uSunDir.value.y < 0.3 && shared.uSunDir.value.y > -0.05,
  },
  {
    id: "wreck",
    title: "The Old Wreck",
    hint: "A fisherman's chart marks a wreck in clear water along the western coast, well past the cove. Look down into the water.",
    check: (kind, id) => id === "wreck",
  },
  {
    id: "reef",
    title: "Reef Survey",
    hint: "Photograph a school of reef fish over the coral below the cliffs.",
    check: (kind, id) => kind === "photo" && id === "reeffish",
  },
  {
    id: "dolphins",
    title: "The Headland Dolphins",
    hint: "A dolphin pod has been seen playing off the lighthouse headland. Photograph one of them there.",
    check: (kind, id) =>
      kind === "photo" &&
      id === "dolphins" &&
      Math.hypot(state.boat.x - lighthouse.group.position.x, state.boat.z - lighthouse.group.position.z) < 800,
  },
  {
    id: "light",
    title: "A Strange Light",
    hint: "Fishermen talk about a light under the water off the eastern cliffs, but only after dark. Go and see.",
    check: (kind, id) => id === "glow",
  },
];

const expedition = {
  day: 1,
  funds: 0,
  fuel: 100,
  goal: null,
  goalDone: false,
  completedGoals: new Set(),
  forecast: 0.1,
  hours: 0,
  distance: 0,
  photos: 0,
  earnings: 0,
  newFinds: [],
  lastX: 0,
  lastZ: 0,
  warned25: false,
  warned10: false,
};

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
  const open = GOALS.filter((g) => !expedition.completedGoals.has(g.id));
  const pool = open.length ? open : GOALS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function showBriefing() {
  if (state.phase === "summary") expedition.day++;
  expedition.goal = chooseGoal();
  state.phase = "briefing";
  overlayTitleEl.textContent = `Day ${expedition.day} — Today's expedition`;
  overlayBodyEl.innerHTML = `
    <div class="card">
      <div class="label">Goal</div>
      <div style="font-size:20px;font-weight:600;margin:2px 0 6px">${expedition.goal.title}</div>
      <div>${expedition.goal.hint}</div>
      <div style="margin-top:12px" class="label">Conditions</div>
      <div>Forecast: ${weatherName(expedition.forecast)} · Full tank · Sunset around 18:00</div>
    </div>
    <div class="next">Press Space to cast off</div>`;
  overlayEl.classList.remove("hidden");
  statusEl.textContent = "Briefing";
}

function beginExpedition() {
  placeBoatAtHarbor();
  state.timeOfDay = EXPEDITION_START_HOUR;
  weather.value = weather.target = expedition.forecast;
  weather.timer = rand(60, 120);
  Object.assign(expedition, {
    fuel: 100,
    goalDone: false,
    hours: 0,
    distance: 0,
    photos: 0,
    earnings: 0,
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

function endExpedition(towed) {
  state.running = false;
  state.phase = "summary";
  state.boat.speed = 0;
  goalEl.classList.add("hidden");
  promptEl.classList.add("hidden");

  const finds = expedition.newFinds.map((id) => JOURNAL_BY_ID[id]);
  const count = (cats) => finds.filter((f) => cats.includes(f.cat)).length;
  const lines = [["Discoveries & photos", expedition.earnings]];
  if (expedition.goalDone) lines.push(["Expedition goal", 500]);
  if (!towed) lines.push(["Returned safely", 100]);
  if (!towed && shared.uSunDir.value.y > -0.02) lines.push(["Home before dark", 150]);
  if (towed) lines.push(["Tow fee (30%)", -Math.round(expedition.earnings * 0.3)]);
  const total = lines.reduce((sum, [, v]) => sum + v, 0);
  expedition.funds += total;
  if (expedition.goalDone) expedition.completedGoals.add(expedition.goal.id);
  expedition.forecast = WEATHER_TARGETS[Math.floor(Math.random() * WEATHER_TARGETS.length)];

  const row = (label, value) => `<div class="row"><span>${label}</span><span>${value}</span></div>`;
  const money = (v) => `${v < 0 ? "−" : "+"}$${Math.abs(v).toLocaleString()}`;
  const mystery = expedition.newFinds.includes("glow")
    ? `<div style="margin-top:10px;opacity:0.85">Something glinted beneath the strange light… You'd need diving gear to reach it.</div>`
    : "";

  overlayTitleEl.textContent = towed ? "Towed back to harbor" : "Expedition complete";
  overlayBodyEl.innerHTML = `
    <div class="card">
      ${row("Time at sea", formatDuration(expedition.hours))}
      ${row("🐬 New wildlife", count(["Wildlife"]))}
      ${row("🏝️ New places", count(["Locations", "Ocean", "Mysteries"]))}
      ${row("🌅 Sky & weather", count(["Sky & weather"]))}
      ${row("📷 Photographs", expedition.photos)}
      ${row("🗺️ Distance", `${(expedition.distance / 1000).toFixed(1)} km`)}
      ${row("⛽ Fuel left", `${Math.round(expedition.fuel)}%`)}
      <div style="margin-top:8px"></div>
      ${lines.map(([label, v]) => row(label, money(v))).join("")}
      <div class="row total"><span>Earned today</span><span>${money(total)}</span></div>
      ${row("Funds", `$${expedition.funds.toLocaleString()}`)}
      ${mystery}
    </div>
    <div class="next">Tomorrow's weather: ${weatherName(expedition.forecast)}<br>Press Space to plan tomorrow's trip</div>`;
  overlayEl.classList.remove("hidden");
  statusEl.textContent = "Back at harbor";
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

function currentSightings(env) {
  const b = state.boat;
  const list = [];
  const add = (id, pos, range) => list.push({ id, pos, range });
  const at = (x, y, z) => new THREE.Vector3(x, y, z);

  if (birds[0].g.visible) add("gulls", at(flock.x, 30, flock.z), 140);
  for (const f of fishes) if (f.active) add("flyingfish", f.mesh.position.clone(), 60);
  for (const d of dolphins) if (d.active && d.mesh.position.y > -2) add("dolphins", d.mesh.position.clone(), 160);
  if (reefBodies.visible) for (const s of schools) add("reeffish", at(s.x, s.y, s.z), 45);

  add("harbor", at(harbor.pierX, 2, (harbor.pierZ0 + harbor.pierZ1) / 2), 200);
  if (cliffAmount(b.x) > 0.7) {
    const shoreZ = SHORE_Z + headland(b.x) + (noise1(b.x * 0.008) - 0.5) * 60;
    add("cliffs", at(b.x, 20, shoreZ - 25), 400);
  }
  add("lighthouse", lighthouse.group.position.clone().setY(lighthouse.group.position.y + 35), 900);
  for (const s of seaStacks) add("stacks", at(s.x, 15, s.z), 500);
  if (inland(b.x, b.z) > -170 && cliffAmount(b.x) > 0.5 && seaBed(b.x, b.z) < -2) add("reef", null, Infinity);
  add("wreck", at(WRECK.x, WRECK.y + 2, WRECK.z), 70);
  if (env.lampsOn > 0.5) add("glow", at(GLOW.x, GLOW.y, GLOW.z), 350);
  if (flight.active) add("airliner", airplane.group.position.clone(), 2600);

  const e = shared.uSunDir.value.y;
  if (e > -0.03 && e < 0.12 && wx.overcast < 0.5) add("sunset", null, Infinity);
  if (shared.uStars.value > 0.6) add("stars", null, Infinity);
  if (shared.uAurora.value > 0.35) add("aurora", null, Infinity);
  if (wx.rain > 0.5) add("rain", null, Infinity);
  if (wx.storm > 0.5) add("storm", null, Infinity);
  return list;
}

function inRange(s) {
  if (!s.pos) return true;
  const b = state.boat;
  const dist = s.id === "airliner" ? s.pos.distanceTo(camera.position) : Math.hypot(s.pos.x - b.x, s.pos.z - b.z);
  return dist < s.range;
}

function onScreen(s, margin) {
  if (!s.pos) return true;
  const p = toScreen(s.pos);
  return !!p && Math.abs(p.x) < margin && Math.abs(p.y) < margin;
}

function checkGoal(kind, id) {
  if (expedition.goalDone || !expedition.goal) return;
  if (expedition.goal.check(kind, id)) {
    expedition.goalDone = true;
    goalEl.classList.add("done");
    toast("★ Expedition goal complete! Head back to the harbor to collect $500.", "goal");
  }
}

function discover(id) {
  const entry = JOURNAL_BY_ID[id];
  if (journal[id].seen) return;
  journal[id].seen = true;
  expedition.newFinds.push(id);
  expedition.earnings += entry.value;
  toast(`📓 New in your journal: ${entry.name}${entry.value ? ` +$${entry.value}` : ""}`, "discovery");
  if (id === "glow") toast("Something is down there, glinting… out of reach for now.");
  checkGoal("discover", id);
  if (!journalEl.classList.contains("hidden")) renderJournal();
}

function takePhoto() {
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), 40);
  const inFrame = [];
  for (const s of currentSightings(lastEnv)) {
    if (inRange(s) && onScreen(s, 0.6) && !inFrame.includes(s.id)) inFrame.push(s.id);
  }
  if (!inFrame.length) {
    toast("📷 Nothing notable in the frame");
    return;
  }
  for (const id of inFrame) {
    const entry = JOURNAL_BY_ID[id];
    discover(id);
    expedition.photos++;
    if (!journal[id].photo) {
      journal[id].photo = true;
      const bonus = Math.round(entry.value * 0.5);
      expedition.earnings += bonus;
      toast(`📷 First photo: ${entry.name}${bonus ? ` +$${bonus}` : ""}`, "discovery");
    } else {
      expedition.earnings += 20;
      toast(`📷 ${entry.name} +$20`);
    }
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
                ? `<div class="entry"><span>${e.name}</span><span>✓${j.photo ? " 📷" : ""}</span></div>`
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

// ---- Per-frame expedition update ----
let lastEnv = { lampsOn: 0 };

function updateExpedition(dt, t, env) {
  lastEnv = env;

  // Harbor lamp and the strange light glow at night
  harborScene.lampMat.emissiveIntensity = 2 * env.lampsOn;
  harborScene.lampGlow.material.opacity = env.lampsOn;
  const pulse = 0.65 + 0.35 * Math.sin(t * 1.7);
  strangeGlow.halo.material.opacity = env.lampsOn * pulse;
  strangeGlow.core.material.emissiveIntensity = 0.3 + 2 * env.lampsOn * pulse;

  if (state.phase !== "running") return;
  const b = state.boat;

  // Fuel: idling sips, full throttle gulps, rough seas cost more
  const burn = (0.012 + Math.abs(b.throttle) * 0.34 * (0.4 + (0.6 * Math.abs(b.speed)) / MAX_FORWARD)) * (1 + 0.5 * wx.storm);
  expedition.fuel = Math.max(0, expedition.fuel - burn * dt);
  if (expedition.fuel < 25 && !expedition.warned25) {
    expedition.warned25 = true;
    toast("⛽ Fuel at 25%. Think about heading home.");
  }
  if (expedition.fuel < 10 && !expedition.warned10) {
    expedition.warned10 = true;
    toast("⛽ Fuel at 10%!");
  }

  expedition.distance += Math.hypot(b.x - expedition.lastX, b.z - expedition.lastZ);
  expedition.lastX = b.x;
  expedition.lastZ = b.z;

  // Spot anything in view and in range
  for (const s of currentSightings(env)) {
    if (!journal[s.id].seen && inRange(s) && onScreen(s, 1.0)) discover(s.id);
  }

  // Context prompt
  let prompt = "";
  if (nearHarbor() && expedition.hours > 0.05) prompt = "Press E to dock and end today's expedition";
  else if (expedition.fuel <= 0) prompt = "Out of fuel! Press E to radio for a tow (costs 30% of today's finds)";
  promptEl.textContent = prompt;
  promptEl.classList.toggle("hidden", !prompt);
}

// ===== Render =====
function render() {
  const b = state.boat;

  // Keep the water grid under the boat, snapped to the grid so it doesn't swim
  water.position.set(Math.round(b.x / WATER_STEP) * WATER_STEP, 0, Math.round(b.z / WATER_STEP) * WATER_STEP);

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

  scoreEl.textContent = `$${(expedition.funds + (state.running ? expedition.earnings : 0)).toLocaleString()}`;
  const fuel = Math.round(expedition.fuel);
  fuelFillEl.style.width = `${expedition.fuel}%`;
  fuelFillEl.classList.toggle("low", fuel <= 25 && fuel > 0);
  fuelFillEl.classList.toggle("empty", fuel <= 0);
  fuelPctEl.textContent = `${fuel}%`;
  speedEl.textContent = `${Math.round(Math.abs(b.speed) * 1.944)} kn`;
  clockEl.textContent = `${formatClock(state.timeOfDay)} · ${weatherName(weather.value)} · Wind ${Math.round(
    weather.windSpeed * 1.944
  )} kn`;

  renderer.render(scene, camera);
}

// ===== Loop =====
let last = performance.now();
let waveTime = 0;

updateWeather(0, false);
applyEnvironment(state.timeOfDay);
updateBoat(0, 0, false);
updateCamera(0, true);
overlayTitleEl.textContent = "Press Space to start";
overlayBodyEl.innerHTML = `<div class="next">A small boat, a long coastline, and a journal to fill.</div>`;

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
