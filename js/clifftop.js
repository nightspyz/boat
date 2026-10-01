// Up on the clifftops (best seen with the drone): a little lake with ducks, trees, flowers and paths,
// dogs, cats and goats; a party with LED lights; a dirt-bike track; grass swaying in the wind;
// cyclists on the coast road; and out at sea, a stray iceberg.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

const topAt = (x, z) => landHeight(x, z);
const inlandZ = (x, d) => shoreZAt(x) - d;
const meadowMat = (color, extra = {}) => applyHaze(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }));
function addTo(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

// ===== The lake =====
const lakeWater = new THREE.Mesh(
  new THREE.CircleGeometry(LAKE.r + 3.2, 48),
  applyHaze(new THREE.MeshStandardMaterial({ color: 0x2c6873, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.9 }))
);
lakeWater.rotation.x = -Math.PI / 2;
lakeWater.position.set(LAKE.x, LAKE.level, LAKE.z);
scene.add(lakeWater);
{
  const padMat = meadowMat(0x4f7a32, { side: THREE.DoubleSide });
  for (let k = 0; k < WORLD.life.lake.lilyPads; k++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(LAKE.r * 0.55, LAKE.r * 0.95);
    const pad = addTo(scene, new THREE.CircleGeometry(rand(0.35, 0.6), 10, 0.3, Math.PI * 1.85), padMat, LAKE.x + Math.cos(a) * r, LAKE.level + 0.03, LAKE.z + Math.sin(a) * r, -Math.PI / 2, 0, rand(0, 6));
    if (k % 4 === 0) addTo(scene, new THREE.SphereGeometry(0.12, 6, 5), meadowMat(0xf2b8d0), pad.position.x, LAKE.level + 0.1, pad.position.z);
  }
}

// ===== Ducks on the lake =====
function buildDuck(drake) {
  const g = new THREE.Group();
  addTo(g, new THREE.SphereGeometry(1, 10, 8).scale(0.16, 0.12, 0.26), meadowMat(drake ? 0x8a8378 : 0x8a6a45));
  addTo(g, new THREE.SphereGeometry(0.09, 8, 6), meadowMat(drake ? 0x1f5a3a : 0x7a5a38), 0, 0.15, -0.2);
  addTo(g, new THREE.BoxGeometry(0.05, 0.03, 0.09), meadowMat(0xe0a020), 0, 0.13, -0.3);
  addTo(g, new THREE.ConeGeometry(0.05, 0.12, 5), meadowMat(0x3a3028), 0, 0.06, 0.26, -1.9);
  scene.add(g);
  return g;
}
const ducks = Array.from({ length: WORLD.life.lake.ducks }, (_, i) => i).map((i) => ({ g: buildDuck(i % 2 === 0), r: rand(3, LAKE.r * 0.8), a: rand(0, 6.3), sp: rand(0.08, 0.16) * (i % 3 ? 1 : -1), ph: rand(0, 9) }));

// ===== Trees, flowers and paths round the lake =====
{
  const bark = meadowMat(0x5a4632);
  const greens = [0x3f6f2e, 0x4f7a32, 0x2f5a2a, 0x5b7f3a];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + rand(-0.2, 0.2);
    const r = LAKE.r + rand(6, 14);
    const x = LAKE.x + Math.cos(a) * r;
    const z = LAKE.z + Math.sin(a) * r;
    if (inland(x, z) < cliffLine(x) + 12) continue; // not on the cliff edge
    const y = topAt(x, z);
    const h = rand(3, 5.5);
    addTo(scene, new THREE.CylinderGeometry(0.16, 0.24, h, 6), bark, x, y + h / 2, z);
    const crown = meadowMat(greens[k % greens.length], { flatShading: true });
    for (let c = 0; c < 3; c++) addTo(scene, new THREE.IcosahedronGeometry(rand(1.3, 2), 0), crown, x + rand(-0.8, 0.8), y + h + rand(-0.3, 0.9), z + rand(-0.8, 0.8));
  }
}
// Dirt paths: a loop round the lake, and spurs to the cliff edge, the party and the bike track
const PARTY = { x: WORLD.clifftop.party.x, z: inlandZ(WORLD.clifftop.party.x, WORLD.clifftop.party.inland) };
const TRACK = (({ x, inland, rx, rz }) => ({ x, z: inlandZ(x, inland), rx, rz }))(WORLD.clifftop.bikeTrack);
const pathMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x9c8566, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
function buildPath(points, width) {
  const pos = [];
  const idx = [];
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const [nx0, nz0] = points[Math.min(i + 1, points.length - 1)];
    const [px0, pz0] = points[Math.max(i - 1, 0)];
    const tx = nx0 - px0;
    const tz = nz0 - pz0;
    const l = Math.hypot(tx, tz) || 1;
    const ox = (-tz / l) * width * 0.5;
    const oz = (tx / l) * width * 0.5;
    pos.push(x + ox, topAt(x + ox, z + oz) + 0.06, z + oz, x - ox, topAt(x - ox, z - oz) + 0.06, z - oz);
    if (i) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, pathMat);
  scene.add(m);
}
const LAKE_LOOP = [];
for (let k = 0; k <= 48; k++) {
  const a = (k / 48) * Math.PI * 2;
  LAKE_LOOP.push([LAKE.x + Math.cos(a) * (LAKE.r + 4.5), LAKE.z + Math.sin(a) * (LAKE.r + 4.5)]);
}
buildPath(LAKE_LOOP, 1.6);
const spur = (x0, z0, x1, z1) => {
  const pts = [];
  for (let k = 0; k <= 20; k++) {
    const u = k / 20;
    pts.push([lerp(x0, x1, u) + Math.sin(u * 7) * 2, lerp(z0, z1, u) + Math.cos(u * 5) * 1.5]);
  }
  buildPath(pts, 1.3);
};
spur(LAKE.x, LAKE.z + LAKE.r + 4.5, LAKE.x + 6, inlandZ(LAKE.x + 6, cliffLine(LAKE.x + 6) + 9)); // to a viewpoint at the edge
spur(LAKE.x + LAKE.r + 4.5, LAKE.z, PARTY.x - 9, PARTY.z);
spur(LAKE.x - LAKE.r - 4.5, LAKE.z, TRACK.x + TRACK.rx + 3, TRACK.z);
// Flowers in drifts
{
  const n = 900;
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  const cols = [0xf2d23a, 0xe8e2f0, 0xd84a5a, 0x9a6ad8, 0xf28c2a, 0x6aa8e8];
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let k = 0;
  for (let drift = 0; drift < 30 && k < n; drift++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(LAKE.r + 3, LAKE.r + 30);
    const cx = LAKE.x + Math.cos(a) * r;
    const cz = LAKE.z + Math.sin(a) * r;
    const col = cols[drift % cols.length];
    for (let f = 0; f < 30 && k < n; f++) {
      const x = cx + rand(-3, 3);
      const z = cz + rand(-3, 3);
      if (inland(x, z) < cliffLine(x) + 8 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 3.5) continue;
      m.makeTranslation(x, topAt(x, z) + rand(0.15, 0.35), z);
      flowers.setMatrixAt(k, m);
      flowers.setColorAt(k, c.setHex(col));
      k++;
    }
  }
  flowers.count = k;
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  scene.add(flowers);
}

// ===== Dogs, cats and goats on the clifftop =====
function buildDog(color) {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const mat = meadowMat(color);
  addTo(g, new THREE.BoxGeometry(0.28, 0.26, 0.7), mat, 0, 0.45, 0);
  addTo(g, new THREE.BoxGeometry(0.22, 0.22, 0.3), mat, 0, 0.62, -0.42);
  addTo(g, new THREE.BoxGeometry(0.1, 0.08, 0.14), mat, 0, 0.56, -0.62);
  addTo(g, new THREE.CylinderGeometry(0.03, 0.04, 0.32, 5), mat, 0, 0.62, 0.4, 0.9);
  for (const s of [-1, 1]) addTo(g, new THREE.BoxGeometry(0.06, 0.12, 0.05), mat, s * 0.08, 0.77, -0.38);
  const legs = [];
  for (const [lx, lz] of [[-0.1, -0.26], [0.1, -0.26], [-0.1, 0.26], [0.1, 0.26]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.34, lz);
    addTo(pivot, new THREE.BoxGeometry(0.07, 0.34, 0.07).translate(0, -0.17, 0), mat);
    g.add(pivot);
    legs.push(pivot);
  }
  scene.add(g);
  return { g, legs };
}
function buildCat(color) {
  const g = new THREE.Group();
  const mat = meadowMat(color);
  addTo(g, new THREE.SphereGeometry(1, 8, 6).scale(0.12, 0.13, 0.26), mat, 0, 0.24, 0);
  addTo(g, new THREE.SphereGeometry(0.1, 8, 6), mat, 0, 0.36, -0.24);
  for (const s of [-1, 1]) addTo(g, new THREE.ConeGeometry(0.035, 0.08, 4), mat, s * 0.055, 0.46, -0.24);
  addTo(g, new THREE.CylinderGeometry(0.02, 0.025, 0.35, 5), mat, 0, 0.42, 0.26, -0.5);
  for (const [lx, lz] of [[-0.06, -0.12], [0.06, -0.12], [-0.06, 0.12], [0.06, 0.12]]) addTo(g, new THREE.CylinderGeometry(0.025, 0.025, 0.18, 5), mat, lx, 0.09, lz);
  scene.add(g);
  return { g };
}
const dogs = WORLD.life.dogs.colors.map((c, i) => ({ ...buildDog(c), u: i * 0.5, sp: i ? 0.055 : -0.07, ph: i * 2 }));
const cats = WORLD.life.cats.map((ct, i) => ({ ...buildCat(ct.color), a: i * 3, wait: 0, home: [LAKE.x + ct.home[0], LAKE.z + ct.home[1]] }));
const meadowGoats = Array.from({ length: WORLD.life.meadowGoats }, (_, i) => i).map((i) => {
  const gt = buildGoat(i === 1 ? goatDarkMat : goatMat);
  scene.add(gt.g);
  const x = TRACK.x + rand(-10, 10);
  const z = TRACK.z - TRACK.rz - rand(8, 16);
  return { ...gt, x, z, tx: x, tz: z, wait: rand(0, 5) };
});

// ===== The party: a stage, speakers, LED string lights, light beams and dancers =====
const party = (() => {
  const g = new THREE.Group();
  const y = topAt(PARTY.x, PARTY.z);
  g.position.set(PARTY.x, y, PARTY.z);
  g.rotation.y = 0.3;
  const dark = meadowMat(0x22252a);
  addTo(g, new THREE.BoxGeometry(8, 0.8, 5), dark, 0, 0.4, -6); // stage
  addTo(g, new THREE.BoxGeometry(2.4, 1.1, 0.9), meadowMat(0x3a3f46), 0, 1.35, -6.2); // DJ table
  for (const s of [-1, 1]) addTo(g, new THREE.BoxGeometry(1.2, 2.4, 1), dark, s * 3.3, 2, -6.5); // speakers
  addTo(g, new THREE.CylinderGeometry(9.5, 9.5, 0.12, 32), meadowMat(0x6a6050), 0, 0.06, 0); // dance floor
  // Poles in a ring, with strings of LED bulbs looping between them
  const poles = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * 10, 4, Math.sin(a) * 10);
    addTo(g, new THREE.CylinderGeometry(0.07, 0.09, 4, 6), dark, p.x, 2, p.z);
    poles.push(p);
  }
  const bulbs = [];
  for (let k = 0; k < 6; k++) {
    const a = poles[k];
    const b = poles[(k + 1) % 6];
    for (let j = 1; j < 14; j++) {
      const u = j / 14;
      bulbs.push(new THREE.Vector3(lerp(a.x, b.x, u), 4 - Math.sin(Math.PI * u) * 0.9, lerp(a.z, b.z, u)));
    }
    // and one string to the middle of the stage
    for (let j = 1; j < 8; j++) {
      const u = j / 8;
      if (k % 2 === 0) bulbs.push(new THREE.Vector3(lerp(a.x, 0, u), 4 - Math.sin(Math.PI * u) * 0.7 + u * 0.5, lerp(a.z, -6, u)));
    }
  }
  const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs.length);
  const m = new THREE.Matrix4();
  bulbs.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    leds.setMatrixAt(i, m);
    leds.setColorAt(i, new THREE.Color(0xffffff));
  });
  g.add(leds);
  // Coloured beams from the stage, sweeping the sky at night
  const beams = [0xff3a8a, 0x3ad0ff, 0x9aff3a].map((c, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 40, 12, 1, true).translate(0, -20, 0).rotateX(Math.PI), mat);
    beam.position.set(-2.5 + i * 2.5, 1, -6);
    g.add(beam);
    return beam;
  });
  // Dancers
  const shirts = [0xe63946, 0x2a9d8f, 0xf4a261, 0x6a4c93, 0xffd166, 0x118ab2, 0xef476f, 0x06d6a0];
  const dancers = [];
  for (let k = 0; k < 14; k++) {
    const d = new THREE.Group();
    addTo(d, new THREE.CylinderGeometry(0.17, 0.2, 0.75, 7), meadowMat(shirts[k % shirts.length]), 0, 1.0, 0);
    addTo(d, new THREE.CylinderGeometry(0.1, 0.1, 0.65, 6), meadowMat(0x2a2f3a), 0, 0.33, 0);
    addTo(d, new THREE.SphereGeometry(0.12, 8, 6), meadowMat([0xc99272, 0x8a5a3c, 0xe0b090][k % 3]), 0, 1.52, 0);
    const a = rand(0, Math.PI * 2);
    const r = rand(1, 7.5);
    d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    d.rotation.y = rand(0, Math.PI * 2);
    g.add(d);
    dancers.push({ d, ph: rand(0, 6.3), sp: rand(5, 8) });
  }
  scene.add(g);
  return { g, leds, bulbs, beams, dancers, color: new THREE.Color() };
})();
let partyOn = false;
function updateParty(dt, t, env) {
  const h = state.timeOfDay;
  partyOn = h > 19 || h < 3; // evenings and nights
  const b = state.boat;
  if (Math.hypot(PARTY.x - b.x, PARTY.z - b.z) > 1200) return;
  const night = env.lampsOn;
  for (let i = 0; i < party.bulbs.length; i++) {
    // A rainbow chase round the strings; warm white by day
    const hue = (i * 0.04 + t * 0.15) % 1;
    if (partyOn) party.color.setHSL(hue, 1, 0.55 + 0.15 * Math.sin(t * 6 + i));
    else party.color.setRGB(1, 0.85, 0.6).multiplyScalar(0.6);
    party.leds.setColorAt(i, party.color);
  }
  party.leds.instanceColor.needsUpdate = true;
  party.beams.forEach((beam, i) => {
    beam.material.opacity = partyOn ? 0.12 * night : 0;
    beam.rotation.set(Math.sin(t * 0.7 + i * 2) * 0.6, 0, Math.cos(t * 0.5 + i) * 0.5);
  });
  party.dancers.forEach((p, i) => {
    p.d.visible = partyOn || i < 2; // a couple setting up by day
    const beat = partyOn ? Math.abs(Math.sin(t * p.sp * 0.5 + p.ph)) : 0;
    p.d.position.y = beat * 0.25;
    p.d.rotation.z = partyOn ? Math.sin(t * 2 + p.ph) * 0.12 : 0;
  });
}

// ===== Dirt-bike rider lapping a track =====
const dirtTrack = [];
for (let k = 0; k <= 60; k++) {
  const a = (k / 60) * Math.PI * 2;
  dirtTrack.push([TRACK.x + Math.cos(a) * TRACK.rx, TRACK.z + Math.sin(a) * TRACK.rz]);
}
buildPath(dirtTrack, 3);
const bike = (() => {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const black = meadowMat(0x1a1a1a);
  const red = meadowMat(0xd8342a);
  const wheels = [-0.55, 0.55].map((z) => addTo(g, new THREE.TorusGeometry(0.32, 0.09, 6, 14), black, 0, 0.4, z, 0, Math.PI / 2, 0));
  addTo(g, new THREE.BoxGeometry(0.12, 0.25, 0.9), red, 0, 0.72, 0, 0.1);
  addTo(g, new THREE.BoxGeometry(0.28, 0.2, 0.4), red, 0, 0.88, -0.15); // tank
  addTo(g, new THREE.BoxGeometry(0.22, 0.08, 0.5), black, 0, 0.92, 0.25); // seat
  addTo(g, new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), black, 0, 1.08, -0.42, 0, 0, Math.PI / 2); // handlebar
  addTo(g, new THREE.BoxGeometry(0.36, 0.55, 0.26), meadowMat(0x2a5aa8), 0, 1.3, 0.05, -0.3); // rider
  addTo(g, new THREE.SphereGeometry(0.15, 10, 8), meadowMat(0xf2f2f2), 0, 1.68, -0.08); // helmet
  for (const s of [-1, 1]) addTo(g, new THREE.BoxGeometry(0.09, 0.45, 0.1), meadowMat(0x22252a), s * 0.15, 0.95, 0.05, 0.6);
  scene.add(g);
  return { g, wheels, u: 0, wheelie: 0 };
})();
let bikeOut = false;
function updateBike(dt, t, env) {
  bikeOut = env.lightLevel > 0.3 && wx.rain < 0.5;
  bike.g.visible = bikeOut;
  if (!bikeOut) return;
  bike.u = (bike.u + dt * 0.11) % 1;
  const a = bike.u * Math.PI * 2;
  const x = TRACK.x + Math.cos(a) * TRACK.rx;
  const z = TRACK.z + Math.sin(a) * TRACK.rz;
  const vx = -Math.sin(a) * TRACK.rx;
  const vz = Math.cos(a) * TRACK.rz;
  if (bike.wheelie <= 0 && Math.random() < dt * 0.15) bike.wheelie = 1.8;
  bike.wheelie -= dt;
  const lift = bike.wheelie > 0 ? Math.sin((bike.wheelie / 1.8) * Math.PI) * 0.5 : 0;
  bike.g.position.set(x, topAt(x, z) + 0.05 + Math.abs(Math.sin(t * 9)) * 0.04, z);
  bike.g.rotation.set(lift, Math.atan2(-vx, -vz), -0.35); // leaning into the turn
  for (const w of bike.wheels) w.rotation.x += dt * 25;
}

// ===== Grass swaying in the wind on the clifftops =====
const grassWind = { value: new THREE.Vector2(0.3, 0) };
const grassMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
grassMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = shared.uTime;
  shader.uniforms.uWind = grassWind;
  shader.vertexShader = "uniform float uTime;\nuniform vec2 uWind;\n" + shader.vertexShader.replace(
    "#include <project_vertex>",
    `vec4 wp = instanceMatrix * vec4(transformed, 1.0);
    float hgt = clamp(position.y / 0.7, 0.0, 1.0);
    float gust = 0.6 + 0.4 * sin(uTime * 1.3 + wp.x * 0.05 + wp.z * 0.04);
    float flutter = sin(uTime * 3.1 + wp.x * 0.7 + wp.z * 0.5) * 0.3;
    wp.xz += uWind * (gust + flutter) * hgt * hgt;
    wp.y -= length(uWind) * hgt * hgt * 0.2;
    vec4 mvPosition = modelViewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;`
  );
};
grassMat.customProgramCacheKey = () => "swaying-grass";
function plantGrass(x0, x1, d0, d1, count, avoid) {
  const blade = new THREE.PlaneGeometry(0.09, 0.7, 1, 3).translate(0, 0.35, 0);
  const p = blade.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - p.getY(i) / 0.8)); // tapering to a point
  const mesh = new THREE.InstancedMesh(blade, grassMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < count * 3 && n < count; tries++) {
    const x = rand(x0, x1);
    const d = rand(d0, d1);
    if (d < cliffLine(x) + CLIFF_RISE0 + 6) continue; // not over the edge
    const z = inlandZ(x, d);
    if (avoid(x, z)) continue;
    e.set(rand(-0.15, 0.15), rand(0, Math.PI * 2), rand(-0.15, 0.15));
    q.setFromEuler(e);
    sc.setScalar(rand(0.7, 1.4));
    m.compose(v.set(x, topAt(x, z), z), q, sc);
    mesh.setMatrixAt(n, m);
    mesh.setColorAt(n, c.setHSL(rand(0.17, 0.26), rand(0.35, 0.55), rand(0.28, 0.45)));
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
}
// (the grass itself is now drawn by grass.js)

// ===== Cyclists on the coast road =====
function buildCyclist(color) {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const black = meadowMat(0x1a1a1a);
  for (const z of [-0.5, 0.5]) addTo(g, new THREE.TorusGeometry(0.33, 0.03, 5, 16), black, 0, 0.36, z, 0, Math.PI / 2, 0);
  addTo(g, new THREE.BoxGeometry(0.04, 0.04, 0.9), meadowMat(color), 0, 0.62, 0, 0.15);
  addTo(g, new THREE.BoxGeometry(0.32, 0.55, 0.24), meadowMat(color), 0, 1.15, 0.08, -0.5); // rider, leaning forward
  addTo(g, new THREE.SphereGeometry(0.13, 8, 6), meadowMat(0xf2f2f2), 0, 1.46, -0.18);
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.1, 0.92, 0.18);
    addTo(pivot, new THREE.BoxGeometry(0.08, 0.5, 0.08).translate(0, -0.25, 0), meadowMat(0x22252a));
    g.add(pivot);
    return pivot;
  });
  scene.add(g);
  return { g, legs };
}
const cyclists = WORLD.life.cyclists.colors.map((c, i) => ({ ...buildCyclist(c), s: i * 400, dir: i ? -1 : 1 }));
let cyclistsOut = false;
function updateCyclists(dt, t, env) {
  cyclistsOut = env.lightLevel > 0.35 && wx.rain < 0.4;
  const len = (roadPts.length - 1) * ROAD.step;
  for (const c of cyclists) {
    c.g.visible = cyclistsOut;
    if (!cyclistsOut) continue;
    c.s += c.dir * 5 * dt;
    if (c.s < 0 || c.s > len) {
      c.dir *= -1;
      c.s = clamp(c.s, 0, len);
    }
    const f = c.s / ROAD.step;
    const i = Math.min(Math.floor(f), roadPts.length - 2);
    const u = f - i;
    const a = roadPts[i];
    const b = roadPts[i + 1];
    const lane = 3.4 * c.dir; // on the edge of the road
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    c.g.position.set(lerp(a.x, b.x, u) - (tz / l) * lane, lerp(a.y, b.y, u) + 0.05, lerp(a.z, b.z, u) + (tx / l) * lane);
    c.g.rotation.y = Math.atan2(-tx * c.dir, -tz * c.dir);
    c.legs[0].rotation.x = Math.sin(t * 6) * 0.6;
    c.legs[1].rotation.x = -Math.sin(t * 6) * 0.6;
  }
}

// ===== A stray iceberg, drifting slowly along the coast far out =====
const iceberg = (() => {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.75 + 0.5 * cloudNoise3(x * 1.3 + 4, y * 1.3, z * 1.3);
    p.setXYZ(i, x * k, y * k * (y > 0 ? 1 : 1.6), z * k);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, applyHaze(new THREE.MeshStandardMaterial({ color: 0xeaf6ff, emissive: 0x2a5a78, emissiveIntensity: 0.25, roughness: 0.35, flatShading: true })));
  mesh.scale.set(16, 10, 12);
  scene.add(mesh);
  const IB = WORLD.life.iceberg;
  const obstacle = { x: IB.x, z: 0, r: IB.r };
  obstacle.z = shoreZAt(obstacle.x) + IB.out;
  SEA_OBSTACLES.push(obstacle);
  return { mesh, o: obstacle };
})();
function updateIceberg(dt, t) {
  const o = iceberg.o;
  o.x += WORLD.life.iceberg.speed * dt;
  if (o.x > 2400) o.x = -2400;
  o.z = shoreZAt(o.x) + WORLD.life.iceberg.out + Math.sin(o.x * 0.002) * 60;
  iceberg.mesh.position.set(o.x, waveHeight(o.x, o.z, t) * 0.2 - 1 + Math.sin(t * 0.3) * 0.3, o.z);
  iceberg.mesh.rotation.y = t * 0.004;
}

// ===== Animals' little lives =====
function updateAnimals(dt, t, env) {
  // Ducks paddle in slow circles
  for (const d of ducks) {
    d.a += d.sp * dt;
    const x = LAKE.x + Math.cos(d.a) * d.r;
    const z = LAKE.z + Math.sin(d.a) * d.r;
    d.g.position.set(x, LAKE.level + 0.05 + Math.sin(t * 2 + d.ph) * 0.02, z);
    d.g.rotation.y = Math.atan2(Math.sin(d.a) * Math.sign(d.sp), -Math.cos(d.a) * Math.sign(d.sp)) + Math.PI;
  }
  // Dogs trot round the lake path; at night they're home
  const day = env.lightLevel > 0.3;
  for (const dog of dogs) {
    dog.g.visible = day;
    if (!day) continue;
    dog.u = (dog.u + dog.sp * dt + 1) % 1;
    const a = dog.u * Math.PI * 2;
    const r = LAKE.r + 4.5 + Math.sin(t * 0.7 + dog.ph) * 0.5;
    const x = LAKE.x + Math.cos(a) * r;
    const z = LAKE.z + Math.sin(a) * r;
    dog.g.position.set(x, topAt(x, z) + Math.abs(Math.sin(t * 10 + dog.ph)) * 0.05, z);
    const s = Math.sign(dog.sp);
    dog.g.rotation.y = Math.atan2(Math.sin(a) * s, -Math.cos(a) * s) + Math.PI;
    const sw = Math.sin(t * 12 + dog.ph) * 0.6;
    dog.legs[0].rotation.x = sw;
    dog.legs[3].rotation.x = sw;
    dog.legs[1].rotation.x = -sw;
    dog.legs[2].rotation.x = -sw;
  }
  // Cats wander a little, then sit
  for (const c of cats) {
    c.wait -= dt;
    if (c.wait <= 0) {
      c.wait = rand(4, 10);
      c.a += rand(-1.5, 1.5);
    }
    const walking = c.wait > 6;
    if (walking) {
      c.home[0] += -Math.sin(c.a) * 0.4 * dt;
      c.home[1] += -Math.cos(c.a) * 0.4 * dt;
    }
    const [x, z] = c.home;
    c.g.position.set(x, topAt(x, z), z);
    c.g.rotation.y = c.a;
  }
  // Goats graze near the bike track
  for (const gt of meadowGoats) {
    gt.wait -= dt;
    if (gt.wait <= 0) {
      gt.tx = TRACK.x + rand(-14, 14);
      gt.tz = TRACK.z - TRACK.rz - rand(6, 18);
      gt.wait = rand(6, 14);
    }
    const dx = gt.tx - gt.x;
    const dz = gt.tz - gt.z;
    const dd = Math.hypot(dx, dz);
    if (dd > 0.3) {
      gt.x += (dx / dd) * 0.5 * dt;
      gt.z += (dz / dd) * 0.5 * dt;
      gt.g.rotation.y = Math.atan2(-dx, -dz);
    }
    gt.g.position.set(gt.x, topAt(gt.x, gt.z), gt.z);
  }
}

function updateClifftop(dt, t, env) {
  grassWind.value.set(Math.cos(weather.windAngle), Math.sin(weather.windAngle)).multiplyScalar(0.12 + weather.windSpeed * 0.028);
  haze.uWind.value.copy(grassWind.value); // wind for the grass blades and field sheen (grass.js, coast.js)
  updateAnimals(dt, t, env);
  updateParty(dt, t, env);
  updateBike(dt, t, env);
  updateCyclists(dt, t, env);
  updateIceberg(dt, t);
}

function addClifftopSights(add, env) {
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  add("lake", at(LAKE.x, LAKE.level + 1, LAKE.z), 500);
  add("ducks", ducks[0].g.position.clone(), 120);
  if (dogs[0].g.visible) add("dogs", dogs[0].g.position.clone().setY(dogs[0].g.position.y + 0.5), 150);
  add("cats", cats[0].g.position.clone().setY(cats[0].g.position.y + 0.3), 100);
  add("goats", meadowGoats[0].g.position.clone().setY(meadowGoats[0].g.position.y + 0.8), 200);
  add("party", party.g.position.clone().setY(party.g.position.y + 2), 900, { lit: partyOn });
  if (bikeOut) add("dirtbike", bike.g.position.clone().setY(bike.g.position.y + 1), 400);
  if (cyclistsOut) for (const c of cyclists) add("cyclists", c.g.position.clone().setY(c.g.position.y + 1), 350);
  add("iceberg", iceberg.mesh.position.clone().setY(8), 2500, { fog: true });
}
