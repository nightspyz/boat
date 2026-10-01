// Things out at sea and on the hills: jellyfish, floating debris, buoys, an offshore oil rig and
// wind turbines (a farm offshore and a row on the eastern hills).
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// Solid things the boat can't sail through (checked in clearance(), boat.js)
const SEA_OBSTACLES = [];
// A repeatable random sequence, so things are in the same place every game
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const blinkOn = (t, period, on, phase = 0) => (t + phase) % period < on;

// ===== Moon jellyfish: a drifting swarm just under the surface, faintly glowing at night =====
const jellyMat = applyUnderwater(
  new THREE.MeshStandardMaterial({ color: 0xf3d9ec, emissive: 0x7a4f9a, emissiveIntensity: 0, roughness: 0.3, side: THREE.DoubleSide })
);
const jellyBellGeo = new THREE.SphereGeometry(0.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const jellyArmGeo = new THREE.CylinderGeometry(0.012, 0.03, 0.7, 4).translate(0, -0.35, 0);
const jellies = [];
for (let i = 0; i < 28; i++) {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(jellyBellGeo, jellyMat);
  g.add(bell);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Mesh(jellyArmGeo, jellyMat);
    arm.position.set(Math.cos(k * 1.57) * 0.08, 0, Math.sin(k * 1.57) * 0.08);
    arm.rotation.set(Math.sin(k) * 0.2, 0, Math.cos(k) * 0.2);
    g.add(arm);
  }
  g.visible = false;
  scene.add(g);
  jellies.push({ g, bell, dx: 0, dz: 0, depth: 1, ph: rand(0, 6.3), s: rand(0.7, 1.4) });
}
const jellySwarm = { active: false, timer: 30, life: 0, x: 0, z: 0 };
function updateJellies(dt, t, env) {
  const b = state.boat;
  const sw = jellySwarm;
  if (!sw.active) {
    sw.timer -= dt;
    if (sw.timer > 0 || state.phase !== "running") return;
    sw.timer = rand(60, 140);
    const a = rand(0, Math.PI * 2);
    const x = b.x + Math.cos(a) * rand(20, 45);
    const z = b.z + Math.sin(a) * rand(20, 45);
    if (seaBed(x, z) > -5 || wx.storm > 0.5) return;
    Object.assign(sw, { active: true, life: rand(120, 180), x, z });
    for (const j of jellies) {
      const r = Math.sqrt(Math.random()) * 14;
      const q = rand(0, Math.PI * 2);
      j.dx = Math.cos(q) * r;
      j.dz = Math.sin(q) * r;
      j.depth = rand(0.5, 2.6);
      j.g.scale.setScalar(j.s);
      j.g.visible = true;
    }
  }
  sw.life -= dt;
  // Drift with the wind, very slowly
  sw.x += Math.cos(weather.windAngle) * 0.15 * dt;
  sw.z += Math.sin(weather.windAngle) * 0.15 * dt;
  jellyMat.emissiveIntensity = 0.9 * (1 - clamp(env.lightLevel * 2, 0, 1));
  const sink = sw.life < 0 ? -sw.life * 0.3 : 0;
  for (const j of jellies) {
    const x = sw.x + j.dx + Math.sin(t * 0.1 + j.ph) * 1.5;
    const z = sw.z + j.dz + Math.cos(t * 0.12 + j.ph) * 1.5;
    // Pulse: the bell squeezes and the jelly rises a little each beat
    const beat = Math.sin(t * 2.2 + j.ph);
    j.bell.scale.set(1 - 0.12 * beat, 1 + 0.18 * beat, 1 - 0.12 * beat);
    j.g.position.set(x, waveHeight(x, z, t) * 0.4 - j.depth - sink + 0.1 * beat, z);
    j.g.rotation.set(Math.sin(t * 0.3 + j.ph) * 0.2, 0, Math.cos(t * 0.25 + j.ph) * 0.2);
  }
  if (sw.life < -12) {
    sw.active = false;
    for (const j of jellies) j.g.visible = false;
  }
}

// ===== Floating debris: crates, barrels, bottles, a pallet, a lost net, foam, a tyre =====
const trashMats = {
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.95 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2f5d9e, roughness: 0.6 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xe0702a, roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.8 }),
  green: new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.3, transparent: true, opacity: 0.85 }),
  net: new THREE.MeshStandardMaterial({ color: 0x35503c, roughness: 1, side: THREE.DoubleSide }),
  black: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.8 }),
};
function buildTrash(kind, rnd) {
  const g = new THREE.Group();
  if (kind === 0) sightPart(g, new THREE.BoxGeometry(0.9, 0.7, 0.9), trashMats.wood, 0, 0.1, 0, 0.1, rnd(), 0.15);
  if (kind === 1) sightPart(g, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), rnd() < 0.5 ? trashMats.blue : trashMats.orange, 0, 0, 0, 0, 0, Math.PI / 2);
  if (kind === 2)
    for (let k = 0; k < 4; k++)
      sightPart(g, new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), [trashMats.white, trashMats.green, trashMats.blue][k % 3], rnd() * 1.2 - 0.6, 0.02, rnd() * 1.2 - 0.6, 0, rnd() * 3, Math.PI / 2);
  if (kind === 3) sightPart(g, new THREE.BoxGeometry(1.2, 0.15, 1.0), trashMats.wood, 0, 0, 0, 0.05, rnd(), 0);
  if (kind === 4) {
    sightPart(g, new THREE.CircleGeometry(1.6, 9), trashMats.net, 0, 0.02, 0, -Math.PI / 2, 0, 0);
    for (let k = 0; k < 5; k++) sightPart(g, new THREE.SphereGeometry(0.12, 8, 6), trashMats.orange, Math.cos(k * 1.3) * 1.4, 0.05, Math.sin(k * 1.3) * 1.4);
  }
  if (kind === 5) sightPart(g, new THREE.BoxGeometry(0.7, 0.25, 0.45), trashMats.white, 0, 0.05, 0, 0, rnd(), 0);
  if (kind === 6) sightPart(g, new THREE.TorusGeometry(0.35, 0.13, 8, 16), trashMats.black, 0, 0, 0, Math.PI / 2 + 0.2, 0, 0);
  return g;
}
const flotsam = [];
{
  const rnd = seeded(77);
  for (let i = 0; i < 40; i++) {
    let x = 0;
    let z = 0;
    for (let k = 0; k < 20; k++) {
      x = -2400 + rnd() * 4800;
      z = shoreZAt(x) + 120 + rnd() * 1050;
      if (seaBed(x, z) < -5) break;
    }
    const g = buildTrash(i % 7, rnd);
    g.position.set(x, 0, z);
    scene.add(g);
    flotsam.push({ g, x, z, ph: rnd() * 6.3, spin: (rnd() - 0.5) * 0.1 });
  }
}
function updateFlotsam(dt, t) {
  const b = state.boat;
  for (const f of flotsam) {
    const d = Math.hypot(f.x - b.x, f.z - b.z);
    f.g.visible = d < 700;
    if (!f.g.visible) continue;
    f.x += Math.cos(weather.windAngle) * 0.06 * dt;
    f.z += Math.sin(weather.windAngle) * 0.06 * dt;
    // Washed into the shallows: it turns up again somewhere offshore
    if (seaBed(f.x, f.z) > -3) {
      f.x = clamp(f.x + rand(-600, 600), -2400, 2400);
      f.z = shoreZAt(f.x) + rand(300, 1100);
    }
    f.g.position.set(f.x, waveHeight(f.x, f.z, t) - 0.12, f.z);
    f.g.rotation.set(Math.sin(t * 0.9 + f.ph) * 0.15, f.g.rotation.y + f.spin * dt, Math.cos(t * 0.8 + f.ph) * 0.15);
  }
}

// ===== Buoys: channel markers at the harbor, hazard marks, and a big weather buoy offshore =====
function buildBuoy(top, base, light, kind) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.6 });
  const topMat = new THREE.MeshStandardMaterial({ color: top, roughness: 0.6 });
  sightPart(g, new THREE.CylinderGeometry(0.75, 0.9, 1.2, 14), hullMat, 0, 0.2, 0);
  for (const a of [0, 2.1, 4.2]) sightPart(g, new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), topMat, Math.cos(a) * 0.4, 1.8, Math.sin(a) * 0.4, Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15);
  if (kind === "can") sightPart(g, new THREE.CylinderGeometry(0.3, 0.3, 0.6, 10), topMat, 0, 3.1, 0);
  if (kind === "cone") sightPart(g, new THREE.ConeGeometry(0.35, 0.7, 10), topMat, 0, 3.15, 0);
  if (kind === "x") {
    sightPart(g, new THREE.BoxGeometry(0.8, 0.12, 0.12), topMat, 0, 3.15, 0, 0, 0, 0.8);
    sightPart(g, new THREE.BoxGeometry(0.8, 0.12, 0.12), topMat, 0, 3.15, 0, 0, 0, -0.8);
  }
  if (kind === "cardinal") {
    sightPart(g, new THREE.ConeGeometry(0.3, 0.5, 10), topMat, 0, 3.0, 0);
    sightPart(g, new THREE.ConeGeometry(0.3, 0.5, 10), topMat, 0, 3.55, 0);
  }
  if (kind === "danger")
    for (const y of [3.0, 3.7]) sightPart(g, new THREE.SphereGeometry(0.25, 10, 8), topMat, 0, y, 0);
  const lampMat = new THREE.MeshBasicMaterial({ color: light });
  const lamp = sightPart(g, new THREE.SphereGeometry(0.16, 8, 6), lampMat, 0, kind === "danger" ? 4.15 : 3.75, 0);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: light, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(5);
  glow.position.copy(lamp.position);
  g.add(glow);
  scene.add(g);
  return { g, lamp, glow };
}
const BUOYS = [];
function addBuoy(x, z, top, base, light, kind, period, on, journalId) {
  const b = buildBuoy(top, base, light, kind);
  BUOYS.push({ ...b, x, z, period, on, ph: rand(0, period), journalId });
  SEA_OBSTACLES.push({ x, z, r: 1.3 });
}
// The channel out of the harbor: red to port and green to starboard as you come in
const HC = WORLD.offshore.harborChannel;
HC.distances.forEach((dz, i) => {
  addBuoy(harbor.pierX + HC.portX, harbor.pierZ1 + dz, 0xc8302a, 0xc8302a, 0xff3a2a, "can", 4, 0.5 + i * 0.2, "buoys");
  addBuoy(harbor.pierX + HC.starboardX, harbor.pierZ1 + dz, 0x2f9a4a, 0x2f9a4a, 0x40ff70, "cone", 4, 0.5 + i * 0.2, "buoys");
});
// Other marks (data/world.js): at x and 'out' from the waterline, or at an exact x, z
for (const b of WORLD.offshore.buoys) addBuoy(b.x, b.z ?? shoreZAt(b.x) + b.out, b.top, b.base, b.light, b.kind, b.period, b.on, "buoys");
// The weather buoy: a wide yellow disc with a mast of instruments and solar panels
const DATA_BUOY = (() => {
  const x = WORLD.offshore.weatherBuoy.x;
  const z = shoreZAt(x) + WORLD.offshore.weatherBuoy.out;
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xbfc4c8, roughness: 0.4, metalness: 0.5 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1d2a4a, roughness: 0.2, metalness: 0.4 });
  sightPart(g, new THREE.CylinderGeometry(2.8, 2.6, 1.1, 24), yellow, 0, 0.2, 0);
  sightPart(g, new THREE.CylinderGeometry(1.2, 1.6, 1.4, 12), yellow, 0, 1.3, 0);
  for (const a of [0, 1.57, 3.14, 4.71]) {
    sightPart(g, new THREE.CylinderGeometry(0.07, 0.07, 3.6, 6), grey, Math.cos(a) * 0.8, 3.6, Math.sin(a) * 0.8, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    sightPart(g, new THREE.BoxGeometry(0.9, 0.05, 0.7), panel, Math.cos(a) * 1.05, 2.6, Math.sin(a) * 1.05, Math.sin(a) * 0.6, -a, -Math.cos(a) * 0.6);
  }
  sightPart(g, new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), grey, 0, 6.0, 0);
  sightPart(g, new THREE.BoxGeometry(0.9, 0.06, 0.06), grey, 0, 6.6, 0); // anemometer arm
  for (const s of [-1, 1]) sightPart(g, new THREE.ConeGeometry(0.12, 0.2, 8), grey, s * 0.45, 6.75, 0, Math.PI, 0, 0);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd84a });
  const lamp = sightPart(g, new THREE.SphereGeometry(0.18, 8, 6), lampMat, 0, 6.95, 0);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffd84a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(6);
  glow.position.copy(lamp.position);
  g.add(glow);
  scene.add(g);
  BUOYS.push({ g, lamp, glow, x, z, period: 20, on: 1, ph: 0, journalId: "databuoy", big: true });
  SEA_OBSTACLES.push({ x, z, r: 3.5 });
  return { x, z };
})();
function updateBuoys(dt, t, env) {
  const b = state.boat;
  for (const u of BUOYS) {
    const near = Math.hypot(u.x - b.x, u.z - b.z) < 1500;
    u.g.visible = near;
    if (!near) continue;
    const h = waveHeight(u.x, u.z, t);
    const hx = waveHeight(u.x + 1.5, u.z, t) - h;
    const hz = waveHeight(u.x, u.z + 1.5, t) - h;
    u.g.position.set(u.x, h - (u.big ? 0.3 : 0.45), u.z);
    u.g.rotation.set(Math.atan(hz / 1.5) * 0.8, 0, -Math.atan(hx / 1.5) * 0.8);
    const lit = env.lampsOn > 0.3 && blinkOn(t, u.period, u.on, u.ph);
    u.lamp.visible = env.lampsOn < 0.3 || lit;
    u.glow.visible = lit;
  }
}

// ===== Offshore oil rig: legs in the sea, decks, a derrick, a crane, a helipad and a gas flare =====
const RIG = (() => {
  const x = WORLD.offshore.oilRig.x;
  const z = shoreZAt(x) + WORLD.offshore.oilRig.out;
  const g = new THREE.Group();
  const hazeMat = (color, extra = {}) => applyHaze(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }));
  const legMat = hazeMat(0xd9b23a);
  const steel = hazeMat(0x8d949b, { metalness: 0.4 });
  const white = hazeMat(0xe8e6df);
  const red = hazeMat(0xb5382c);
  const blue = hazeMat(0x2e5c8a);
  const dark = hazeMat(0x2b3034);
  for (const [lx, lz] of [[-18, -14], [18, -14], [-18, 14], [18, 14]]) {
    sightPart(g, new THREE.CylinderGeometry(2.4, 2.8, 48, 14), legMat, lx, -8, lz);
    sightPart(g, new THREE.CylinderGeometry(3.4, 3.4, 2.5, 14), dark, lx, 0.5, lz); // tide band
  }
  for (const y of [4, 11]) {
    sightPart(g, new THREE.CylinderGeometry(0.6, 0.6, 36, 8), steel, 0, y, -14, 0, 0, Math.PI / 2);
    sightPart(g, new THREE.CylinderGeometry(0.6, 0.6, 36, 8), steel, 0, y, 14, 0, 0, Math.PI / 2);
    sightPart(g, new THREE.CylinderGeometry(0.6, 0.6, 28, 8), steel, -18, y, 0, Math.PI / 2, 0, 0);
    sightPart(g, new THREE.CylinderGeometry(0.6, 0.6, 28, 8), steel, 18, y, 0, Math.PI / 2, 0, 0);
  }
  sightPart(g, new THREE.BoxGeometry(46, 3, 38), steel, 0, 17, 0);
  sightPart(g, new THREE.BoxGeometry(42, 3, 32), dark, 0, 23, 0);
  sightPart(g, new THREE.BoxGeometry(14, 8, 10), white, -12, 28.5, -8);
  sightPart(g, new THREE.BoxGeometry(10, 6, 12), blue, 6, 27.5, -9);
  sightPart(g, new THREE.BoxGeometry(12, 5, 8), red, 10, 27, 9);
  sightPart(g, new THREE.BoxGeometry(8, 10, 8), white, -14, 29.5, 10); // living quarters
  // Derrick: a tapering lattice tower
  const dx = 4;
  const dz = 4;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.CylinderGeometry(0.25, 0.25, 46, 6);
    sightPart(g, leg, legMat, dx + sx * 3.2, 47, dz + sz * 3.2, -sz * 0.1, 0, sx * 0.1);
  }
  for (let k = 0; k < 7; k++) {
    const y = 28 + k * 6;
    const w = 7.6 - k * 0.85;
    sightPart(g, new THREE.BoxGeometry(w, 0.25, 0.25), legMat, dx, y, dz - w / 2);
    sightPart(g, new THREE.BoxGeometry(w, 0.25, 0.25), legMat, dx, y, dz + w / 2);
    sightPart(g, new THREE.BoxGeometry(0.25, 0.25, w), legMat, dx - w / 2, y, dz);
    sightPart(g, new THREE.BoxGeometry(0.25, 0.25, w), legMat, dx + w / 2, y, dz);
  }
  // Crane
  sightPart(g, new THREE.CylinderGeometry(1, 1.2, 6, 10), legMat, 16, 28, -4);
  sightPart(g, new THREE.CylinderGeometry(0.35, 0.5, 30, 6), legMat, 26, 36, -4, 0, 0, -1.1);
  // Helipad hanging over one side
  sightPart(g, new THREE.CylinderGeometry(10, 10, 0.6, 24), hazeMat(0x2d5a3a), -26, 33, 0);
  sightPart(g, new THREE.TorusGeometry(8.4, 0.25, 4, 32), hazeMat(0xf2c230), -26, 33.35, 0, Math.PI / 2, 0, 0);
  sightPart(g, new THREE.BoxGeometry(1, 0.2, 5), white, -27.6, 33.4, 0);
  sightPart(g, new THREE.BoxGeometry(1, 0.2, 5), white, -24.4, 33.4, 0);
  sightPart(g, new THREE.BoxGeometry(3.2, 0.2, 1), white, -26, 33.4, 0);
  // Flare boom reaching out over the sea, with its flame
  sightPart(g, new THREE.CylinderGeometry(0.5, 0.7, 34, 6), steel, 24, 34, 22, 0.75, 0, -0.75);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = sightPart(g, new THREE.ConeGeometry(1.6, 6, 10), flameMat, 36, 46.2, 31);
  const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xff9a40, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flameGlow.position.set(36, 46.2, 31);
  flameGlow.scale.setScalar(30);
  g.add(flameGlow);
  // Work lights all over the decks at night
  const lp = [];
  const rnd = seeded(11);
  for (let i = 0; i < 60; i++) lp.push(-22 + rnd() * 44, 18 + rnd() * 16, -17 + rnd() * 34);
  for (let k = 0; k < 8; k++) lp.push(dx, 30 + k * 6, dz);
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
  const lightMat = new THREE.PointsMaterial({ color: 0xffe2a0, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  g.add(new THREE.Points(lightGeo, lightMat));
  const topLampMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
  const topLamp = sightPart(g, new THREE.SphereGeometry(0.5, 8, 6), topLampMat, dx, 70.5, dz);
  g.position.set(x, 0, z);
  g.rotation.y = 0.3;
  scene.add(g);
  SEA_OBSTACLES.push({ x, z, r: 32 });
  return { x, z, g, flame, flameMat, flameGlow, lightMat, topLamp };
})();
function updateRig(dt, t, env) {
  const f = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3);
  RIG.flame.scale.set(f, 0.8 + 0.4 * f * Math.random(), f);
  RIG.flameGlow.material.opacity = 0.35 + 0.65 * env.lampsOn;
  RIG.flameGlow.scale.setScalar(18 + 22 * env.lampsOn);
  RIG.lightMat.opacity = env.lampsOn * (1 - 0.7 * wx.fog);
  RIG.topLamp.visible = env.lampsOn < 0.3 || blinkOn(t, 1.5, 0.75);
}

// ===== Wind turbines: a farm far offshore to the west, and a row along the eastern hills =====
const turbineWhite = applyHaze(new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.45 }));
const turbineYellow = applyHaze(new THREE.MeshStandardMaterial({ color: 0xe8c02a, roughness: 0.6 }));
const towerGeo = new THREE.CylinderGeometry(1.3, 2.3, 80, 12).translate(0, 40, 0);
const nacelleGeo = new THREE.BoxGeometry(3, 3.2, 9);
const hubGeo = new THREE.SphereGeometry(1.5, 10, 8).scale(1, 1, 1.4);
const bladeGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 1);
  s.lineTo(1.3, 3);
  s.lineTo(0.3, 38);
  s.lineTo(-0.1, 38);
  s.lineTo(-0.6, 3);
  return new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false });
})();
const aviationMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
const turbines = [];
function addTurbine(x, z, ground, offshore) {
  const g = new THREE.Group();
  let base = ground;
  if (offshore) {
    sightPart(g, new THREE.CylinderGeometry(2.6, 2.6, 16, 14), turbineYellow, 0, -2, 0);
    sightPart(g, new THREE.CylinderGeometry(4, 4, 0.6, 14), turbineYellow, 0, 6, 0); // landing platform
    base = 6;
  }
  sightPart(g, towerGeo, turbineWhite, 0, base, 0);
  const head = new THREE.Group();
  head.position.y = base + 81.5;
  sightPart(head, nacelleGeo, turbineWhite, 0, 0, -1);
  sightPart(head, hubGeo, turbineWhite, 0, 0, 4.4);
  const rotor = new THREE.Group();
  rotor.position.z = 4.6;
  for (let k = 0; k < 3; k++) sightPart(rotor, bladeGeo, turbineWhite, 0, 0, 0, 0, 0, (k * Math.PI * 2) / 3);
  rotor.rotation.z = Math.random() * 6;
  head.add(rotor);
  const lamp = sightPart(head, new THREE.SphereGeometry(0.35, 8, 6), aviationMat, 0, 1.9, -3.5);
  g.add(head);
  g.position.set(x, 0, z);
  scene.add(g);
  turbines.push({ g, head, rotor, lamp, x, z, offshore, ph: Math.random() });
  if (offshore) SEA_OBSTACLES.push({ x, z, r: 4 });
}
const WIND_FARM = { x: -2050, z: 0 };
{
  const F = WORLD.offshore.windFarm;
  let sz = 0;
  for (let row = 0; row < F.rows; row++)
    for (let col = 0; col < F.cols; col++) {
      const x = F.x0 + col * F.colSpacing + (row % 2) * F.stagger;
      const z = shoreZAt(x) + F.out + row * F.rowSpacing;
      addTurbine(x, z, 0, true);
      sz += z;
    }
  WIND_FARM.x = F.x0 + ((F.cols - 1) * F.colSpacing + F.stagger) / 2;
  WIND_FARM.z = sz / (F.rows * F.cols);
}
const HILL_TURBINES = [];
for (const x of WORLD.offshore.hillTurbines.xs) {
  const z = shoreZAt(x) - WORLD.offshore.hillTurbines.inland;
  const ground = landHeight(x, z);
  if (ground < WORLD.offshore.hillTurbines.minGround) continue;
  addTurbine(x, z, ground, false);
  HILL_TURBINES.push({ x, z, y: ground });
}
function updateTurbines(dt, t, env) {
  const wa = weather.windAngle;
  const yaw = Math.atan2(-Math.cos(wa), -Math.sin(wa)); // the rotor faces into the wind
  const spin = (0.35 + weather.windSpeed * 0.07) * (1 - 0.8 * (wx.storm > 0.9 ? 1 : 0)); // feathered in the worst storms
  for (const tb of turbines) {
    tb.head.rotation.y += wrapAngle(yaw - tb.head.rotation.y) * Math.min(1, dt * 0.2);
    tb.rotor.rotation.z -= spin * dt;
    tb.lamp.visible = env.lampsOn < 0.3 || blinkOn(t, 2, 1, tb.ph);
  }
}

function updateOffshore(dt, t, env) {
  updateJellies(dt, t, env);
  updateFlotsam(dt, t);
  updateBuoys(dt, t, env);
  updateRig(dt, t, env);
  updateTurbines(dt, t, env);
}

function addOffshoreSights(add, env) {
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  const night = env.lightLevel < 0.35;
  if (jellySwarm.active) {
    const j = jellies[0].g.position;
    add("jellyfish", j.clone(), 60, night ? { fog: true, lit: true } : { fog: true, under: true });
  }
  const b = state.boat;
  const near = flotsam.filter((f) => f.g.visible).sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z));
  for (const f of near.slice(0, 3)) add("flotsam", f.g.position.clone(), 150, { fog: true });
  for (const u of BUOYS) if (u.g.visible) add(u.journalId, at(u.x, u.big ? 3 : 2, u.z), u.big ? 500 : 300, { fog: true, lit: env.lampsOn > 0.3 });
  add("oilrig", at(RIG.x, 30, RIG.z), 3000, { lit: true });
  add("windfarm", at(WIND_FARM.x, 60, WIND_FARM.z), 3000, { lit: env.lampsOn > 0.3 });
  if (HILL_TURBINES.length) {
    const h = HILL_TURBINES[Math.floor(HILL_TURBINES.length / 2)];
    add("windmills", at(h.x, h.y + 60, h.z), 2500, { lit: env.lampsOn > 0.3 });
  }
}
