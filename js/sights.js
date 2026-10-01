// More things to photograph: orcas, a manta ray, a blue shark, cormorants, pelicans, a fishing trawler
// with its gulls, a hot-air balloon, a stranded wreck, rainbows and glowing plankton.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

function sightPart(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
const sphereGeo = (sx, sy, sz, w = 14, h = 10) => new THREE.SphereGeometry(1, w, h).scale(sx, sy, sz);

// ===== Orcas: a rare pod far offshore, crossing ahead of the boat =====
const orcaBlack = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.3 }));
const orcaWhite = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.4 }));
function buildOrca(bull) {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  sightPart(g, sphereGeo(0.95, 0.9, 3.4, 18, 12), orcaBlack);
  sightPart(g, sphereGeo(0.72, 0.5, 2.5), orcaWhite, 0, -0.38, -0.6);
  for (const s of [-1, 1]) {
    sightPart(g, sphereGeo(0.22, 0.14, 0.5), orcaWhite, s * 0.62, 0.28, -2.15); // eye patch
    sightPart(g, sphereGeo(0.55, 0.06, 0.32), orcaBlack, s * 0.95, -0.5, -1.2, 0, s * 0.4, -s * 0.5); // flipper
  }
  const finH = bull ? 1.8 : 0.9;
  const fin = new THREE.ConeGeometry(0.36, finH, 4).scale(0.22, 1, 1);
  sightPart(g, fin, orcaBlack, 0, 0.75 + finH / 2, 0.1, bull ? 0.05 : 0.35);
  sightPart(g, new THREE.BoxGeometry(2.3, 0.08, 0.7), orcaBlack, 0, 0, 3.4);
  return g;
}
const orcas = [buildOrca(true), buildOrca(false), buildOrca(false)].map((g) => {
  g.visible = false;
  scene.add(g);
  return { g, x: 0, z: 0, period: 10, phase: 0, rel: -5, up: false };
});
const orcaPod = { active: false, timer: 60, t: 0, dirX: 1, dirZ: 0 };

function updateOrcas(dt, t) {
  const b = state.boat;
  if (!orcaPod.active) {
    orcaPod.timer -= dt;
    if (orcaPod.timer > 0 || state.phase !== "running") return;
    orcaPod.timer = rand(120, 240);
    if (-inland(b.x, b.z) < 350 || Math.random() < 0.35) return; // only well offshore, and not every time
    const fx = -Math.sin(b.yaw);
    const fz = -Math.cos(b.yaw);
    const side = Math.random() < 0.5 ? -1 : 1;
    const ahead = rand(140, 260);
    orcaPod.dirX = -side * Math.cos(b.yaw);
    orcaPod.dirZ = side * Math.sin(b.yaw);
    orcas.forEach((o, i) => {
      o.x = b.x + fx * (ahead + i * 9) - orcaPod.dirX * (320 + i * 6);
      o.z = b.z + fz * (ahead + i * 9) - orcaPod.dirZ * (320 + i * 6);
      o.period = rand(9, 12);
      o.phase = rand(0, 4);
      o.g.visible = true;
    });
    orcaPod.active = true;
    orcaPod.t = 0;
    return;
  }
  orcaPod.t += dt;
  const yaw = Math.atan2(-orcaPod.dirX, -orcaPod.dirZ);
  let near = false;
  for (const o of orcas) {
    o.x += orcaPod.dirX * 3.6 * dt;
    o.z += orcaPod.dirZ * 3.6 * dt;
    o.phase = (o.phase + dt) % o.period;
    const surf = o.phase < 5.5; // rolling at the surface for a few breaths, then down
    const u = o.phase / 5.5;
    o.rel = surf ? -0.45 + 0.25 * Math.sin(u * Math.PI) : lerp(o.rel, -5, 1 - Math.exp(-dt * 1.5));
    if (surf && !o.up) splash(o.x, waveHeight(o.x, o.z, t) + 0.8, o.z, 6, 3.5); // the blow
    o.up = surf;
    const h = waveHeight(o.x, o.z, t);
    o.g.position.set(o.x, h + o.rel, o.z);
    o.g.rotation.set(surf ? 0.08 * Math.cos(u * Math.PI) : -0.15, yaw, 0);
    if (Math.hypot(o.x - b.x, o.z - b.z) < 750) near = true;
  }
  if (!near || orcaPod.t > 240) {
    orcaPod.active = false;
    for (const o of orcas) o.g.visible = false;
  }
}

// ===== Blue shark: a fin circling the boat in deep water =====
const sharkMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x3f5f80, roughness: 0.4 }));
const shark = (() => {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  sightPart(g, sphereGeo(0.32, 0.34, 1.5), sharkMat);
  sightPart(g, sphereGeo(0.16, 0.12, 0.45), sharkMat, 0, -0.04, -1.45);
  sightPart(g, new THREE.ConeGeometry(0.3, 0.75, 4).scale(0.2, 1, 1), sharkMat, 0, 0.62, 0.05, 0.45);
  sightPart(g, new THREE.ConeGeometry(0.2, 0.9, 4).scale(0.2, 1, 1), sharkMat, 0, 0.25, 1.75, 1.2);
  sightPart(g, new THREE.ConeGeometry(0.15, 0.6, 4).scale(0.2, 1, 1), sharkMat, 0, -0.2, 1.7, 2.2);
  for (const s of [-1, 1]) sightPart(g, sphereGeo(0.5, 0.04, 0.2), sharkMat, s * 0.45, -0.18, -0.4, 0, s * 0.5, -s * 0.3);
  g.visible = false;
  scene.add(g);
  return { g, active: false, timer: 90, life: 0, cx: 0, cz: 0, a: 0, r: 30, x: 0, z: 0 };
})();
function updateShark(dt, t, env) {
  const b = state.boat;
  if (!shark.active) {
    shark.timer -= dt;
    if (shark.timer > 0 || state.phase !== "running") return;
    shark.timer = rand(100, 220);
    if (seaBed(b.x, b.z) > -14 || env.lightLevel < 0.4) return;
    const a = rand(0, Math.PI * 2);
    Object.assign(shark, { active: true, life: rand(80, 120), cx: b.x + Math.cos(a) * 40, cz: b.z + Math.sin(a) * 40, a: rand(0, 6.3), r: rand(22, 38) });
    shark.g.visible = true;
  }
  shark.life -= dt;
  // Circle a slowly wandering centre that follows the boat at a distance
  shark.cx += (b.x - shark.cx) * 0.08 * dt;
  shark.cz += (b.z - shark.cz) * 0.08 * dt;
  shark.a += (2.8 / shark.r) * dt;
  shark.x = shark.cx + Math.cos(shark.a) * shark.r;
  shark.z = shark.cz + Math.sin(shark.a) * shark.r;
  const sink = shark.life < 0 ? -shark.life * 0.6 : 0;
  shark.g.position.set(shark.x, waveHeight(shark.x, shark.z, t) - 0.75 - sink, shark.z);
  shark.g.rotation.set(0, Math.atan2(Math.sin(shark.a), -Math.cos(shark.a)), 0.12);
  if (shark.life < -6) {
    shark.active = false;
    shark.g.visible = false;
  }
}

// ===== Manta ray: glides just under the surface over sandy shallows =====
const mantaMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.5, side: THREE.DoubleSide }));
const manta = (() => {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  sightPart(g, sphereGeo(0.6, 0.18, 1.0), mantaMat);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.7);
  wingShape.quadraticCurveTo(1.2, -0.5, 2.1, 0.25);
  wingShape.quadraticCurveTo(1.0, 0.35, 0, 0.8);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 8).rotateX(-Math.PI / 2);
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.x = s * 0.4;
    const w = new THREE.Mesh(wingGeo, mantaMat);
    w.scale.x = s;
    pivot.add(w);
    g.add(pivot);
    return pivot;
  });
  for (const s of [-1, 1]) sightPart(g, new THREE.BoxGeometry(0.1, 0.06, 0.45), mantaMat, s * 0.32, 0, -1.05, 0, s * 0.3, 0); // head fins
  sightPart(g, new THREE.CylinderGeometry(0.02, 0.04, 1.6, 5), mantaMat, 0, 0, 1.6, Math.PI / 2);
  g.visible = false;
  scene.add(g);
  return { g, wings, active: false, timer: 40, life: 0, cx: 0, cz: 0, a: 0, x: 0, z: 0 };
})();
function updateManta(dt, t, env) {
  const b = state.boat;
  if (!manta.active) {
    manta.timer -= dt;
    if (manta.timer > 0 || state.phase !== "running") return;
    manta.timer = rand(60, 150);
    if (env.lightLevel < 0.4) return;
    const a = rand(0, Math.PI * 2);
    const cx = b.x + Math.cos(a) * 30;
    const cz = b.z + Math.sin(a) * 30;
    const d = seaBed(cx, cz);
    if (d > -3 || d < -16) return;
    Object.assign(manta, { active: true, life: rand(90, 130), cx, cz, a: rand(0, 6.3) });
    manta.g.visible = true;
  }
  manta.life -= dt;
  manta.a += 0.09 * dt;
  manta.x = manta.cx + Math.cos(manta.a) * 16;
  manta.z = manta.cz + Math.sin(manta.a) * 16;
  const depth = 1.1 + 0.4 * Math.sin(t * 0.3) + (manta.life < 0 ? -manta.life * 0.5 : 0);
  manta.g.position.set(manta.x, waveHeight(manta.x, manta.z, t) - depth, manta.z);
  manta.g.rotation.set(0, Math.atan2(Math.sin(manta.a), -Math.cos(manta.a)), -0.12);
  const flap = Math.sin(t * 1.6) * 0.38;
  manta.wings[0].rotation.z = -flap;
  manta.wings[1].rotation.z = flap;
  if (manta.life < -8) {
    manta.active = false;
    manta.g.visible = false;
  }
}

// ===== Cormorants: roosting on the tallest of the Seven Sisters, some drying their wings =====
const cormorantMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x1d2022, roughness: 0.8 }));
function buildCormorant(spread) {
  const g = new THREE.Group();
  sightPart(g, sphereGeo(0.16, 0.3, 0.16, 8, 6), cormorantMat, 0, 0.32, 0, 0.2);
  sightPart(g, new THREE.CylinderGeometry(0.04, 0.06, 0.32, 5), cormorantMat, 0, 0.7, -0.04, -0.2);
  sightPart(g, sphereGeo(0.07, 0.06, 0.12, 6, 5), cormorantMat, 0, 0.88, -0.1);
  if (spread) for (const s of [-1, 1]) sightPart(g, new THREE.BoxGeometry(0.5, 0.26, 0.03), cormorantMat, s * 0.36, 0.48, 0, 0, 0, s * -0.35);
  return g;
}
const sisterTops = seaStacks.filter((s) => s.group === "sisters").sort((a, b) => b.h - a.h).slice(0, 4);
const cormorants = [];
// Find the real (uneven) top of each stack, so the birds stand on the rock
const stackMeshes = scene.children.filter((o) => o.isMesh && o.material === stackMat);
const perchRay = new THREE.Raycaster();
function stackTop(x, z, fallback) {
  try {
    for (const m of stackMeshes) m.updateMatrixWorld();
    perchRay.set(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
    const hit = perchRay.intersectObjects(stackMeshes, false)[0];
    if (hit && typeof hit.point.y === "number") return hit.point.y;
  } catch (e) {
    // fall back to the nominal height
  }
  return fallback;
}
sisterTops.forEach((s, i) => {
  for (let k = 0; k < 3; k++) {
    const g = buildCormorant((i + k) % 3 === 0);
    const a = rand(0, Math.PI * 2);
    const r = rand(0, s.r * 0.35);
    const px = s.x + Math.cos(a) * r;
    const pz = s.z + Math.sin(a) * r;
    g.position.set(px, stackTop(px, pz, s.h) - 0.05, pz);
    g.rotation.y = rand(0, Math.PI * 2);
    g.scale.setScalar(1.3);
    scene.add(g);
    cormorants.push(g);
  }
});

// ===== Pelicans: a line of them skimming low over the water, parallel to the shore =====
const pelicanMat = new THREE.MeshLambertMaterial({ color: 0xb9b2a6 });
const pelicanDark = new THREE.MeshLambertMaterial({ color: 0x4a4540 });
const pelicanBill = new THREE.MeshLambertMaterial({ color: 0xd9a54a });
function buildPelican() {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  sightPart(g, sphereGeo(0.28, 0.26, 0.7, 10, 8), pelicanMat);
  sightPart(g, sphereGeo(0.12, 0.12, 0.2, 8, 6), pelicanMat, 0, 0.12, -0.72);
  sightPart(g, new THREE.BoxGeometry(0.08, 0.1, 0.8), pelicanBill, 0, 0.06, -1.15);
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.2, 0.08, -0.05);
    sightPart(pivot, new THREE.BoxGeometry(1.25, 0.04, 0.42), pelicanMat, s * 0.62, 0, 0);
    sightPart(pivot, new THREE.BoxGeometry(0.6, 0.03, 0.3), pelicanDark, s * 1.45, 0, 0.04);
    g.add(pivot);
    return pivot;
  });
  return { g, wings };
}
const pelicans = [];
for (let i = 0; i < 6; i++) {
  const p = buildPelican();
  p.g.visible = false;
  scene.add(p.g);
  pelicans.push(p);
}
const pelicanFlight = { active: false, timer: 30, x: 0, z: 0, dir: 1, traveled: 0 };
function updatePelicans(dt, t, env) {
  const b = state.boat;
  const f = pelicanFlight;
  if (!f.active) {
    f.timer -= dt;
    if (f.timer > 0 || state.phase !== "running") return;
    f.timer = rand(70, 140);
    if (env.lightLevel < 0.35 || wx.storm > 0.4 || wx.fog > 0.4) return;
    f.dir = Math.random() < 0.5 ? -1 : 1;
    f.x = b.x - f.dir * 420;
    f.z = Math.max(b.z - rand(60, 180), shoreZAt(f.x) + 50);
    f.traveled = 0;
    f.active = true;
    for (const p of pelicans) p.g.visible = true;
  }
  f.traveled += 9 * dt;
  f.x += f.dir * 9 * dt;
  f.z += (Math.max(shoreZAt(f.x) + 50, f.z) - f.z) * dt; // keep off the beach
  pelicans.forEach((p, i) => {
    const x = f.x - f.dir * i * 3.2;
    const z = f.z + i * 1.8; // a slanting line
    const y = waveHeight(x, z, t) + 2.2 + Math.sin(t * 0.6 + i * 0.7) * 0.5;
    p.g.position.set(x, y, z);
    p.g.rotation.set(0, f.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    // Glide, with a few slow wingbeats now and then, passed down the line
    const beat = Math.sin(t * 0.5 - i * 0.6) > 0.6 ? Math.sin(t * 5 - i * 0.6) * 0.45 : 0.05;
    p.wings[0].rotation.z = -beat;
    p.wings[1].rotation.z = beat;
  });
  if (f.traveled > 900) {
    f.active = false;
    for (const p of pelicans) p.g.visible = false;
  }
}

// ===== Fishing trawler, trailed by gulls =====
const trawler = (() => {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const red = new THREE.MeshStandardMaterial({ color: 0x9e2b25, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf08a24, roughness: 0.5 });
  sightPart(g, new THREE.BoxGeometry(3.6, 1.6, 10), red, 0, 0.4, 0.6);
  sightPart(g, new THREE.CylinderGeometry(0.05, 1.8, 3.6, 4, 1).scale(1, 1, 0.9), red, 0, 0.4, -5.6, -Math.PI / 2, Math.PI / 4, 0);
  sightPart(g, new THREE.BoxGeometry(3.7, 0.2, 13.2), white, 0, 1.25, -0.4);
  sightPart(g, new THREE.BoxGeometry(2.6, 2.0, 3.0), white, 0, 2.3, -2.4);
  sightPart(g, new THREE.BoxGeometry(2.7, 0.5, 3.1), dark, 0, 3.0, -2.4);
  sightPart(g, new THREE.CylinderGeometry(0.08, 0.08, 6, 6), dark, 0, 5.5, -2.0);
  for (const s of [-1, 1]) sightPart(g, new THREE.CylinderGeometry(0.1, 0.1, 4.2, 6), dark, s * 1.5, 3.2, 5.6, -0.3, 0, 0);
  sightPart(g, new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6), dark, 0, 5.1, 6.2, 0, 0, Math.PI / 2);
  sightPart(g, new THREE.CylinderGeometry(0.7, 0.7, 2.4, 10), orange, 0, 1.9, 3.6, 0, 0, Math.PI / 2); // net drum
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
  const lamp = sightPart(g, new THREE.SphereGeometry(0.18, 8, 6), lampMat, 0, 8.6, -2.0);
  const gulls = [];
  for (let i = 0; i < 7; i++) {
    const bg = new THREE.Group();
    bg.add(new THREE.Mesh(birdBodyGeo, birdMat));
    const L = new THREE.Mesh(wingGeoL, birdMat);
    L.position.x = -0.06;
    const R = new THREE.Mesh(wingGeoR, birdMat);
    R.position.x = 0.06;
    bg.add(L, R);
    bg.rotation.order = "YXZ";
    bg.scale.setScalar(1.6);
    scene.add(bg);
    gulls.push({ g: bg, L, R, a: rand(0, 6.3), r: rand(5, 11), alt: rand(5, 10), sp: rand(0.5, 0.9) * (i % 2 ? 1 : -1), ph: rand(0, 9) });
  }
  scene.add(g);
  return { g, lamp, gulls, route: { kind: "loop", cx: -150, cz: -480, rx: 420, rz: 110 }, s: rand(0, 2000), x: 0, z: 0, yaw: 0 };
})();
function updateTrawler(dt, t, env) {
  const tr = trawler;
  tr.s += 2.2 * dt;
  const p = routePoint(tr.route, tr.s);
  tr.x = p.x;
  tr.z = p.z;
  tr.yaw = Math.atan2(-p.vx, -p.vz);
  tr.g.position.set(p.x, waveHeight(p.x, p.z, t) * 0.7 - 0.2, p.z);
  tr.g.rotation.set(Math.sin(t * 0.6) * 0.04, tr.yaw, Math.sin(t * 0.8 + 1) * 0.05);
  tr.lamp.visible = env.lampsOn > 0.3;
  // Gulls wheel over the stern, hoping for scraps
  const sx = p.x + Math.sin(tr.yaw) * 7;
  const sz = p.z + Math.cos(tr.yaw) * 7;
  const show = env.light > 0.25 && wx.storm < 0.5;
  for (const gl of tr.gulls) {
    gl.g.visible = show;
    if (!show) continue;
    gl.a += gl.sp * dt;
    const dir = Math.sign(gl.sp);
    gl.g.position.set(sx + Math.cos(gl.a) * gl.r, gl.alt + Math.sin(t * 0.7 + gl.ph) * 1.5, sz + Math.sin(gl.a) * gl.r);
    gl.g.rotation.set(0, Math.atan2(Math.sin(gl.a) * dir, -Math.cos(gl.a) * dir), -0.35 * dir);
    const wing = Math.sin(t * 9 + gl.ph) * 0.5 * (Math.sin(t * 0.8 + gl.ph) > 0 ? 1 : 0.2) + 0.1;
    gl.L.rotation.z = -wing;
    gl.R.rotation.z = wing;
  }
}

// ===== Hot-air balloon: drifts above the coast on calm mornings =====
const balloon = (() => {
  const g = new THREE.Group();
  const env = new THREE.SphereGeometry(9, 24, 16);
  env.scale(1, 1.2, 1);
  const col = [];
  const stripe = [new THREE.Color(0xd8382d), new THREE.Color(0xf2c230), new THREE.Color(0x2c6fb5), new THREE.Color(0xf2efe6)];
  const pos = env.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const c = stripe[Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 4];
    col.push(c.r, c.g, c.b);
  }
  env.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  sightPart(g, env, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 0, 0, 0);
  sightPart(g, new THREE.CylinderGeometry(3.6, 2.2, 3, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8382d, side: THREE.DoubleSide }), 0, -11.6, 0);
  sightPart(g, new THREE.BoxGeometry(1.6, 1.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.9 }), 0, -16.5, 0);
  const ropeMat = new THREE.LineBasicMaterial({ color: 0x333333 });
  for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, -15.9, z), new THREE.Vector3(x * 2.9, -13, z * 2.9)]);
    g.add(new THREE.Line(geo, ropeMat));
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0 });
  const flame = sightPart(g, new THREE.ConeGeometry(0.35, 1.4, 8), flameMat, 0, -14.4, 0);
  g.visible = false;
  scene.add(g);
  return { g, flame, flameMat, burn: 0 };
})();
function updateBalloon(dt, t, env) {
  const h = state.timeOfDay;
  const show = h > 6.3 && h < 11.5 && env.lightLevel > 0.3 && wx.rain < 0.2 && wx.fog < 0.3 && wx.storm < 0.1;
  balloon.g.visible = show;
  if (!show) return;
  const x = -700 + 520 * Math.sin(t * 0.004);
  const z = shoreZAt(x) - 120 + 70 * Math.cos(t * 0.006);
  const y = Math.max(landHeight(x, z), 0) + 170 + 25 * Math.sin(t * 0.02);
  balloon.g.position.set(x, y, z);
  balloon.g.rotation.y = t * 0.01;
  // A burst from the burner now and then
  if (balloon.burn <= 0 && Math.random() < dt * 0.08) balloon.burn = rand(1.5, 3);
  balloon.burn -= dt;
  balloon.flameMat.opacity = balloon.burn > 0 ? 0.6 + 0.4 * Math.random() : 0;
}

// ===== A small coaster stranded on a sandy beach, rusting =====
const BEACH_WRECK = (() => {
  const x = 960; // the sandy beach east of the river delta
  const z = shoreZAt(x) - 7;
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const rust = applyHaze(new THREE.MeshStandardMaterial({ color: 0x7a3f22, roughness: 0.95 }));
  const rust2 = applyHaze(new THREE.MeshStandardMaterial({ color: 0x5b4334, roughness: 0.95 }));
  const paint = applyHaze(new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.9 }));
  sightPart(g, new THREE.BoxGeometry(6, 4, 18), rust, 0, 1.4, 0);
  sightPart(g, new THREE.CylinderGeometry(0.1, 3.1, 6, 4, 1).scale(1, 1, 0.75), rust, 0, 1.4, -11.4, -Math.PI / 2, Math.PI / 4, 0);
  sightPart(g, new THREE.BoxGeometry(6.1, 0.3, 24), rust2, 0, 3.5, -2.4);
  sightPart(g, new THREE.BoxGeometry(4.6, 3.4, 4.2), paint, 0, 5.3, 6.2);
  sightPart(g, new THREE.BoxGeometry(4.7, 0.5, 4.4), rust2, 0, 7.1, 6.2);
  sightPart(g, new THREE.CylinderGeometry(0.7, 0.8, 3.4, 10), rust2, 0, 8.6, 7.6);
  sightPart(g, new THREE.CylinderGeometry(0.12, 0.12, 8, 6), rust2, 0, 7, -5.5, 0.3, 0, 0);
  g.position.set(x, Math.max(landHeight(x, z), 0) - 1.6, z);
  g.rotation.set(0.04, 0.45, 0.22);
  scene.add(g);
  return { x, z, y: g.position.y + 4 };
})();

// ===== Rainbow: opposite the sun, when a shower passes in sunshine =====
const rainbow = (() => {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 } },
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vLocal;
      varying float vY;
      void main() {
        vLocal = position.xy;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vY = wp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uStrength;
      varying vec2 vLocal;
      varying float vY;
      vec3 spectrum(float t) {
        // violet (inside) to red (outside)
        vec3 c = vec3(0.55, 0.25, 0.9);
        c = mix(c, vec3(0.2, 0.35, 1.0), smoothstep(0.0, 0.2, t));
        c = mix(c, vec3(0.2, 0.85, 0.35), smoothstep(0.2, 0.45, t));
        c = mix(c, vec3(1.0, 0.95, 0.2), smoothstep(0.45, 0.65, t));
        c = mix(c, vec3(1.0, 0.55, 0.1), smoothstep(0.65, 0.8, t));
        return mix(c, vec3(0.95, 0.15, 0.1), smoothstep(0.8, 1.0, t));
      }
      void main() {
        if (vY < 0.5) discard;
        float t = clamp((length(vLocal) / 1000.0 - 0.93) / 0.07, 0.0, 1.0);
        float a = sin(t * 3.14159) * uStrength * smoothstep(0.5, 60.0, vY);
        gl_FragColor = vec4(spectrum(t), a * 0.42);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(930, 1000, 128, 1), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1.9;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, mat, strength: 0, top: new THREE.Vector3() };
})();
const rainbowDir = new THREE.Vector3();
function updateRainbow() {
  const e = shared.uSunDir.value.y;
  const target =
    smooth(0.03, 0.1, e) * (1 - smooth(0.5, 0.7, e)) * smooth(0.04, 0.2, wx.rain) * (1 - smooth(0.5, 0.7, wx.overcast)) * (1 - wx.fog);
  rainbow.strength += (target - rainbow.strength) * 0.02;
  rainbow.mesh.visible = rainbow.strength > 0.01;
  if (!rainbow.mesh.visible) return;
  // A ring 42° around the point opposite the sun, ~1.1 km away (the ring is 1000 units in radius)
  const D = 1000 / Math.tan((42 * Math.PI) / 180);
  rainbowDir.copy(shared.uSunDir.value).negate().normalize();
  rainbow.mesh.position.copy(camera.position).addScaledVector(rainbowDir, D);
  rainbow.mesh.lookAt(camera.position);
  rainbow.mat.uniforms.uStrength.value = rainbow.strength;
  // The top of the bow, for photos
  rainbow.top.set(0, 1, 0).applyQuaternion(rainbow.mesh.quaternion).multiplyScalar(965).add(rainbow.mesh.position);
}

// ===== Glowing plankton: on dark, calm nights in the bay east of the harbor, the wake lights up blue =====
const BLOOM = { x: 520, z: shoreZAt(520) + 230, r: 380 };
const GLOW_N = 900;
const glowPos = new Float32Array(GLOW_N * 3).fill(-1000);
const glowCol = new Float32Array(GLOW_N * 3);
const glowLife = new Float32Array(GLOW_N);
let glowNext = 0;
let glowActive = 0;
const glowGeo = new THREE.BufferGeometry();
glowGeo.setAttribute("position", new THREE.BufferAttribute(glowPos, 3));
glowGeo.setAttribute("color", new THREE.BufferAttribute(glowCol, 3));
const glowPoints = new THREE.Points(
  glowGeo,
  new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
);
glowPoints.frustumCulled = false;
glowPoints.renderOrder = 2;
scene.add(glowPoints);
function spawnGlow(x, z, t) {
  const i = glowNext;
  glowNext = (glowNext + 1) % GLOW_N;
  glowPos[i * 3] = x;
  glowPos[i * 3 + 1] = waveHeight(x, z, t) + 0.04;
  glowPos[i * 3 + 2] = z;
  glowLife[i] = rand(1.6, 3.2);
}
function updateGlowPlankton(dt, t, env) {
  const b = state.boat;
  const on = env.lightLevel < 0.2 && wx.storm < 0.4 && Math.hypot(b.x - BLOOM.x, b.z - BLOOM.z) < BLOOM.r;
  if (on) {
    const fx = -Math.sin(b.yaw);
    const fz = -Math.cos(b.yaw);
    const rx = Math.cos(b.yaw);
    const rz = -Math.sin(b.yaw);
    const speed = Math.abs(b.speed);
    // Sparkles all around, a glowing bow wave and a glowing wake when moving
    const n = Math.floor((60 + speed * 50) * dt + Math.random());
    for (let k = 0; k < n; k++) {
      const r = Math.random();
      if (r < 0.35) {
        const a = rand(0, Math.PI * 2);
        const d = rand(3, 28);
        spawnGlow(b.x + Math.cos(a) * d, b.z + Math.sin(a) * d, t);
      } else if (r < 0.65 && speed > 1) {
        const s = Math.random() < 0.5 ? -1 : 1;
        const back = rand(-4.5, 3);
        spawnGlow(b.x + fx * -back + rx * s * (1.5 + Math.max(0, back + 4.5) * 0.25), b.z + fz * -back + rz * s * (1.5 + Math.max(0, back + 4.5) * 0.25), t);
      } else if (speed > 1) {
        const back = rand(4, 16);
        spawnGlow(b.x - fx * back + rx * rand(-1.5, 1.5) * (1 + back * 0.08), b.z - fz * back + rz * rand(-1.5, 1.5) * (1 + back * 0.08), t);
      }
    }
  }
  glowActive = 0;
  for (let i = 0; i < GLOW_N; i++) {
    if (glowLife[i] <= 0) continue;
    glowLife[i] -= dt;
    const k = Math.max(glowLife[i], 0) / 3;
    glowCol[i * 3] = 0.1 * k;
    glowCol[i * 3 + 1] = 0.75 * k;
    glowCol[i * 3 + 2] = 1.0 * k;
    if (glowLife[i] <= 0) glowPos[i * 3 + 1] = -1000;
    else glowActive++;
  }
  glowGeo.attributes.position.needsUpdate = true;
  glowGeo.attributes.color.needsUpdate = true;
}

function updateSights(dt, t, env) {
  updateOrcas(dt, t);
  updateShark(dt, t, env);
  updateManta(dt, t, env);
  updatePelicans(dt, t, env);
  updateTrawler(dt, t, env);
  updateBalloon(dt, t, env);
  updateRainbow();
  updateGlowPlankton(dt, t, env);
  updateOffshore(dt, t, env); // offshore.js
  updateCoastLife(dt, t, env); // coastlife.js
}

// What of all this can be seen right now (called from currentSightings in discovery.js)
function addSights(add, env) {
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  const FOG = { fog: true };
  for (const o of orcas) if (o.g.visible && o.rel > -1.2) add("orcas", o.g.position.clone().setY(o.g.position.y + 1), 500, FOG);
  if (shark.active) add("shark", shark.g.position.clone().setY(shark.g.position.y + 0.8), 150, FOG);
  if (manta.active) add("manta", manta.g.position.clone(), 70, { fog: true, under: true });
  if (sisterTops.length) add("cormorants", at(sisterTops[0].x, sisterTops[0].h, sisterTops[0].z), 450);
  if (pelicanFlight.active) add("pelicans", pelicans[2].g.position.clone(), 380, FOG);
  add("trawler", at(trawler.x, 3, trawler.z), 1100, { lit: trawler.lamp.visible });
  if (balloon.g.visible) add("balloon", balloon.g.position.clone(), 2500);
  add("beachwreck", at(BEACH_WRECK.x, BEACH_WRECK.y, BEACH_WRECK.z), 900);
  if (rainbow.strength > 0.35) add("rainbow", rainbow.top.clone(), Infinity, { lit: true });
  if (glowActive > 80) add("biolum", null, Infinity);
  addOffshoreSights(add, env); // offshore.js
  addCoastLifeSights(add, env); // coastlife.js
}
