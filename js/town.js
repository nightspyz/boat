// River water, reeds and trees, clifftop town, beach life.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

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
    g.userData.leaveAt = rand(0.12, 0.3); // sun height at which they pack up and go home
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
    swimmers.push({ g, cx: s.x, cz: s.z, a: rand(0, 6.3), r: rand(2, 6), speed: rand(0.03, 0.08), phase: rand(0, 6), leaveAt: rand(0.1, 0.28) });
  }
  // Surfers: paddle out lying on the board, then ride a wave back in standing up
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 2.2), pick(brightMats));
    const rider = buildPerson(pick(skinMats), false);
    g.add(board, rider);
    group.add(g);
    surfers.push({ g, board, rider, x: COVE_X + rand(-180, -40) + k * 70, t: rand(0, 40), leaveAt: rand(0.06, 0.16) });
  }
  return group;
}
scene.add(buildBeachLife());

// People come to the beach in the morning and drift home through the late afternoon, one by one,
// so the beach is empty well before dark. Rain sends the sunbathers home; storms and fog empty it.
function updateBeachLife(dt, t, env) {
  const sun = shared.uSunDir.value.y;
  const weatherOk = wx.storm < 0.5 && wx.fog < 0.5;
  for (const g of sunbathers) g.visible = weatherOk && wx.rain < 0.5 && sun > g.userData.leaveAt;
  for (const s of swimmers) {
    s.g.visible = weatherOk && sun > s.leaveAt;
    s.a += s.speed * dt;
    const x = s.cx + Math.cos(s.a) * s.r;
    const z = s.cz + Math.sin(s.a) * s.r;
    s.g.position.set(x, waveHeight(x, z, t) - 0.12 + Math.sin(t * 2 + s.phase) * 0.04, z);
    s.g.rotation.y = -s.a;
  }
  const CYCLE = 40; // seconds: 25 paddling out, 15 riding in
  for (const s of surfers) {
    s.g.visible = weatherOk && sun > s.leaveAt;
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
