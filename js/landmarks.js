// Landmarks along the coast: the sea arch off West Point, the waterfall in Hidden Cove, the chalk grottoes
// of East Head, and the coast road with its arch bridge over the creek at Bridge Bay (with a few cars).
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== The sea arch: a span of rock between two legs (the legs are sea stacks, see coast.js) =====
function buildArchSpan() {
  const tube = 4.4;
  const geo = new THREE.TorusGeometry(ARCH.R, tube, 14, 36, Math.PI);
  // Rough it up so it reads as eroded rock, and make the top heavier than the underside
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(y, x);
    const cx = Math.cos(a) * ARCH.R;
    const cy = Math.sin(a) * ARCH.R;
    const ox = x - cx;
    const oy = y - cy;
    const k = 0.85 + 0.35 * cloudNoise3(x * 0.25, y * 0.25 + 3, z * 0.25) + (oy > 0 ? 0.25 * (oy / tube) : 0);
    p.setXYZ(i, cx + ox * k, cy + oy * k * (oy > 0 ? 1.15 : 1), z * k * 1.1);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, stackMat);
  mesh.position.set(ARCH.x, ARCH.H0, ARCH.z);
  return mesh;
}
scene.add(buildArchSpan());

// ===== Hidden Cove: a waterfall pouring down the cliff onto the beach =====
const HIDDEN_COVE = { x: -1000 };
HIDDEN_COVE.z = shoreZAt(HIDDEN_COVE.x) - 15; // on the beach
// Find where the cliff behind the beach starts to rise, and where its top is
const WATERFALL = (() => {
  const x = HIDDEN_COVE.x - 6;
  let foot = null;
  let top = null;
  let prev = landHeight(x, shoreZAt(x) - 20);
  for (let d = 22; d < 140; d += 2) {
    const y = landHeight(x, shoreZAt(x) - d);
    if (!foot && y - prev > 0.6) foot = { d: d - 2, y: prev };
    if (foot && y - prev < 0.15 && y > foot.y + 15) {
      top = { d, y };
      break;
    }
    prev = y;
  }
  foot = foot || { d: 40, y: 1 };
  top = top || { d: 70, y: 35 };
  return { x, foot, top, z: shoreZAt(x) - foot.d };
})();

const waterfallMat = new THREE.ShaderMaterial({
  uniforms: { uTime: shared.uTime, uLight: shared.uLightLevel },
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
    ${NOISE_GLSL}
    uniform float uTime;
    uniform float uLight;
    varying vec2 vUv;
    void main() {
      // Streaks of falling water, faster lower down, frothing at the bottom
      float fall = vUv.y * 3.0 + uTime * (2.5 + (1.0 - vUv.y) * 2.0);
      float streak = vnoise(vec2(vUv.x * 16.0, fall)) * 0.6 + vnoise(vec2(vUv.x * 37.0 + 3.0, fall * 1.9)) * 0.4;
      float edge = smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
      float froth = 1.0 - smoothstep(0.0, 0.15, vUv.y);
      float a = edge * (0.35 + 0.65 * smoothstep(0.35, 0.75, streak)) + froth * 0.5 * edge;
      vec3 col = mix(vec3(0.7, 0.82, 0.88), vec3(1.0), max(streak, froth)) * uLight;
      gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
    }
  `,
});
function buildWaterfall() {
  const W = WATERFALL;
  const x = W.x;
  const zTop = shoreZAt(x) - W.top.d + 2.5;
  const zFoot = shoreZAt(x) - W.foot.d + 1.5;
  const half = 2.2;
  // A sheet hugging the cliff face, a little out from it; a few rows so it can bow outward
  const rows = 8;
  const pos = [];
  const uv = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows; // 0 at the bottom
    const y = lerp(W.foot.y + 0.2, W.top.y + 0.5, t);
    const z = lerp(zFoot, zTop, t) + Math.sin(Math.PI * t) * 2.5; // bowing out from the face
    const w = half * (0.8 + 0.4 * (1 - t)); // spreading as it falls
    pos.push(x - w, y, z, x + w, y, z);
    uv.push(0, t, 1, t);
  }
  const idx = [];
  for (let i = 0; i < rows; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, waterfallMat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}
scene.add(buildWaterfall());
WATERFALL.splashTimer = 0;

// ===== East Head: grottoes at the foot of the chalk cliffs =====
const GROTTO_XS = [1330, 1398, 1468];
const grottoDark = new THREE.MeshBasicMaterial({ color: 0x07110f, side: THREE.BackSide });
const grottoBack = new THREE.MeshBasicMaterial({ color: 0x050b0a });
const GROTTOES = GROTTO_XS.map((x, k) => {
  const z0 = shoreZAt(x);
  const slope = (shoreZAt(x + 2) - shoreZAt(x - 2)) / 4;
  const len = Math.hypot(slope, 1);
  const n = { x: -slope / len, z: 1 / len }; // toward the sea
  const r = 4.2 + k * 0.6;
  const g = new THREE.Group();
  // A half-tunnel mouth: rock outside, darkness inside, a dark back wall a few metres in
  const shellGeo = new THREE.CylinderGeometry(r, r, 13, 18, 1, true, -Math.PI / 2, Math.PI);
  shellGeo.rotateX(-Math.PI / 2);
  shellGeo.translate(0, -0.6, -5.5); // mouth just out over the water, the rest running into the cliff
  g.add(new THREE.Mesh(shellGeo, stackMat), new THREE.Mesh(shellGeo, grottoDark));
  const back = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 18, 0, Math.PI), grottoBack);
  back.position.set(0, -0.6, -3.5);
  g.add(back);
  const gx = x + n.x * 1.0;
  const gz = z0 + n.z * 1.0;
  g.position.set(gx, 0, gz);
  g.rotation.y = Math.atan2(n.x, n.z);
  scene.add(g);
  return { x: gx, z: gz, r };
});

// ===== The coast road along the eastern cliffs, and its arch bridge over the creek =====
const ROAD = { x0: 1640, x1: 2620, step: 4 };
const roadD = (x) => 80 + 26 * Math.exp(-(((x - CREEK_X) / 150) ** 2)); // keeps back from the cliff edge
const BRIDGE = { x0: CREEK_X - 62, x1: CREEK_X + 62 };
// The road's centre line: points along it, smoothed, level across the bridge
const roadPts = (() => {
  const pts = [];
  for (let x = ROAD.x0; x <= ROAD.x1; x += ROAD.step) {
    const z = shoreZAt(x) - roadD(x);
    pts.push({ x, z, y: landHeight(x, z) });
  }
  // Smooth the grades
  for (let pass = 0; pass < 3; pass++) {
    const ys = pts.map((p) => p.y);
    for (let i = 2; i < pts.length - 2; i++) pts[i].y = (ys[i - 2] + ys[i - 1] + ys[i] + ys[i + 1] + ys[i + 2]) / 5;
  }
  // The bridge deck runs straight between the two rims of the ravine
  const at = (x) => pts.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best));
  const a = at(BRIDGE.x0);
  const b = at(BRIDGE.x1);
  BRIDGE.y0 = a.y;
  BRIDGE.y1 = b.y;
  for (const p of pts) if (p.x > a.x && p.x < b.x) p.y = lerp(a.y, b.y, (p.x - a.x) / (b.x - a.x));
  return pts;
})();

function buildRoad() {
  const g = new THREE.Group();
  const asphalt = applyHaze(new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.92 }));
  const paint = applyHaze(new THREE.MeshStandardMaterial({ color: 0xe0b83c, roughness: 0.7 }));
  const concrete = applyHaze(new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.85 }));
  // A strip along the road, centred `off` metres to the side of the centre line: half-width w, raised by
  // lift, with skirts down its sides (so the road never floats over a dip, and railings get some height)
  const strip = (w, lift, skirt, mat, from = 0, to = roadPts.length - 1, off = 0) => {
    const pos = [];
    const idx = [];
    for (let i = from; i <= to; i++) {
      const p = roadPts[i];
      const q = roadPts[Math.min(i + 1, roadPts.length - 1)];
      const o = roadPts[Math.max(i - 1, 0)];
      let tx = q.x - o.x;
      let tz = q.z - o.z;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const nx = -tz;
      const nz = tx;
      const y = p.y + lift;
      const cx = p.x + nx * off;
      const cz = p.z + nz * off;
      pos.push(cx + nx * w, y, cz + nz * w, cx - nx * w, y, cz - nz * w);
      pos.push(cx + nx * w, y - skirt, cz + nz * w, cx - nx * w, y - skirt, cz - nz * w);
    }
    for (let i = 0; i < to - from; i++) {
      const a = i * 4;
      const b = a + 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1); // deck
      if (skirt > 0) idx.push(a, a + 2, b, b, a + 2, b + 2, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); // sides
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.material.side = THREE.DoubleSide;
    return mesh;
  };
  g.add(strip(3.6, 0.35, 3, asphalt));
  g.add(strip(0.14, 0.38, 0, paint));

  // The bridge: railings along the deck, an arch below it, and columns from the arch to the deck
  const iA = roadPts.findIndex((p) => p.x >= BRIDGE.x0);
  const iB = roadPts.findIndex((p) => p.x >= BRIDGE.x1);
  for (const side of [-1, 1]) g.add(strip(0.18, 1.3, 1.0, concrete, iA, iB, side * 3.75));
  const mid = roadPts[Math.round((iA + iB) / 2)];
  const deckY = (BRIDGE.y0 + BRIDGE.y1) / 2;
  const floorY = landHeight(CREEK_X, mid.z);
  const springY = floorY + (deckY - floorY) * 0.25;
  for (const off of [-2.6, 2.6]) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = lerp(BRIDGE.x0 + 6, BRIDGE.x1 - 6, t);
      const y = springY + (deckY - 2 - springY) * Math.sin(Math.PI * t);
      const p = roadPts.reduce((best, q) => (Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best));
      pts.push(new THREE.Vector3(x, y, p.z + off));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.9, 6, false), concrete));
    // Columns from the arch up to the deck
    for (let i = 2; i <= 22; i += 2) {
      const a = pts[i];
      const top = lerp(BRIDGE.y0, BRIDGE.y1, (a.x - BRIDGE.x0) / (BRIDGE.x1 - BRIDGE.x0)) + 0.2;
      const h = top - a.y;
      if (h < 0.5) continue;
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), concrete);
      col.position.set(a.x, a.y + h / 2, a.z);
      g.add(col);
    }
  }
  return g;
}
scene.add(buildRoad());
BRIDGE.x = CREEK_X;
BRIDGE.z = roadPts.reduce((best, q) => (Math.abs(q.x - CREEK_X) < Math.abs(best.x - CREEK_X) ? q : best)).z;
BRIDGE.y = (BRIDGE.y0 + BRIDGE.y1) / 2;

// A few cars driving the coast road, headlights on after dark
const carColors = [0xc8342b, 0xf2f2ee, 0x2f5d8c, 0x3c3c3c];
const cars = carColors.map((color, i) => {
  const g = new THREE.Group();
  const paintMat = applyHaze(new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 }));
  const glass = applyHaze(new THREE.MeshStandardMaterial({ color: 0x22303a, roughness: 0.2 }));
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.3), paintMat);
  body.position.y = 0.65;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), glass);
  cabin.position.set(0, 1.25, 0.2);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 0 });
  const lamps = [-0.6, 0.6].map((x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), lamp);
    m.position.set(x, 0.7, -2.16);
    return m;
  });
  g.add(body, cabin, ...lamps);
  scene.add(g);
  return { g, lamp, s: (i / carColors.length) * roadPts.length * ROAD.step, dir: i % 2 ? -1 : 1, speed: rand(11, 16) };
});

// ===== Every frame =====
function updateLandmarks(dt, t, env) {
  const len = (roadPts.length - 1) * ROAD.step;
  for (const c of cars) {
    c.s += c.dir * c.speed * dt;
    if (c.s < 0 || c.s > len) {
      c.dir *= -1; // turn around at the end of the road (just out of sight)
      c.s = clamp(c.s, 0, len);
    }
    const f = c.s / ROAD.step;
    const i = Math.min(Math.floor(f), roadPts.length - 2);
    const u = f - i;
    const a = roadPts[i];
    const b = roadPts[i + 1];
    const lane = 1.8 * c.dir; // keep to the right
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    c.g.position.set(lerp(a.x, b.x, u) - (tz / l) * lane, lerp(a.y, b.y, u) + 0.35, lerp(a.z, b.z, u) + (tx / l) * lane);
    c.g.rotation.y = Math.atan2(-tx * c.dir, -tz * c.dir);
    c.lamp.emissiveIntensity = 2.5 * env.lampsOn;
  }
  // Mist where the waterfall lands
  WATERFALL.splashTimer -= dt;
  const b = state.boat;
  if (WATERFALL.splashTimer <= 0 && Math.hypot(b.x - WATERFALL.x, b.z - WATERFALL.z) < 300) {
    WATERFALL.splashTimer = 0.12;
    splash(WATERFALL.x + rand(-1.5, 1.5), WATERFALL.foot.y + 0.3, WATERFALL.z + rand(0, 2), 4, 2.2);
  }
}
