// Inland and along the western clifftops: a coast road with cars and power lines, branch roads up to
// small hill villages, radio masts on the hilltops, and a pleasure funPier below the clifftop town
// (shops, a Ferris wheel, a carousel and strings of lights).
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

const hzMat = (color, extra = {}) => applyHaze(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));
function put(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
const zAtD = (x, d) => shoreZAt(x) - d;

// ===== Roads =====
// The west coast road keeps about 12 m back from the cliff edge, then drops to the harbor cove
function westRoadD(x) {
  const edge = cliffLine(x) + CLIFF_RISE0 + WORLD.inland.westRoad.edgeGap;
  return lerp(WORLD.inland.westRoad.inland, edge, smooth(0.3, 0.7, cliffAmount(x)));
}
const roadAsphalt = applyHaze(new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
const roadPaint = applyHaze(new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
// Roads: two lanes (7.4 m), level from side to side, resting on the ground as drawn (terrainY) and never
// sinking into it, smoothed along their length; sides drop to the ground, so on a slope it reads as a
// road cut into the hillside. Double yellow centre line, white edge lines.
const ROAD_W = WORLD.inland.roadWidth;
function settleRoad(pts) {
  // Height of each point: the highest ground under its width, then smoothed (but never below that)
  const raw = pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    p.nx = -(b.z - a.z) / l;
    p.nz = (b.x - a.x) / l;
    let hi = -1e9;
    for (const s of [-1, -0.5, 0, 0.5, 1]) hi = Math.max(hi, terrainY(p.x + p.nx * s * (ROAD_W / 2 + 0.3), p.z + p.nz * s * (ROAD_W / 2 + 0.3)));
    return hi;
  });
  let ys = raw.slice();
  for (let pass = 0; pass < 4; pass++) ys = ys.map((y, i) => Math.max(raw[i], (ys[Math.max(i - 2, 0)] + ys[Math.max(i - 1, 0)] + y + ys[Math.min(i + 1, ys.length - 1)] + ys[Math.min(i + 2, ys.length - 1)]) / 5));
  pts.forEach((p, i) => (p.y = ys[i] + 0.12));
}
// A strip along the road: from offset o0 to o1 across it, raised by lift; with skirts to the ground if asked
function roadStrip(pts, o0, o1, lift, mat, skirt) {
  const pos = [];
  const idx = [];
  for (const p of pts) {
    pos.push(p.x + p.nx * o0, p.y + lift, p.z + p.nz * o0, p.x + p.nx * o1, p.y + lift, p.z + p.nz * o1);
    if (skirt) pos.push(p.x + p.nx * o0, p.y - 3, p.z + p.nz * o0, p.x + p.nx * o1, p.y - 3, p.z + p.nz * o1);
  }
  const k = skirt ? 4 : 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * k;
    const b = a + k;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
    if (skirt) idx.push(a, a + 2, b, b, a + 2, b + 2, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
}
const yellowPaint = applyHaze(new THREE.MeshStandardMaterial({ color: 0xe8b830, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
function buildRoadRibbon(pts) {
  settleRoad(pts);
  const h = ROAD_W / 2;
  const deck = roadStrip(pts, h, -h, 0, roadAsphalt, true);
  deck.material.side = THREE.DoubleSide;
  for (const s of [1, -1]) roadStrip(pts, s * (h - 0.35), s * (h - 0.2), 0.05, roadPaint); // white edge lines
  for (const s of [0.07, -0.07]) roadStrip(pts, s - 0.05, s + 0.05, 0.05, yellowPaint); // double yellow
}
const pt = (x, z) => ({ x, z, y: landHeight(x, z) });
const WEST_ROAD = [];
for (let x = WORLD.inland.westRoad.x0; x <= WORLD.inland.westRoad.x1; x += 2) WEST_ROAD.push(pt(x, zAtD(x, westRoadD(x))));
// Branch roads: from the coast road up to the hill villages (gently winding)
const VILLAGES = WORLD.inland.villages.map((v) => ({ name: v.name, x: v.x, d: v.inland, z: zAtD(v.x, v.inland) }));
function branchRoad(x0, z0, x1, z1) {
  const pts = [];
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const wig = Math.sin(u * Math.PI * 3) * WORLD.inland.laneWiggle * Math.sin(Math.PI * u);
    pts.push(pt(lerp(x0, x1, u) + wig, lerp(z0, z1, u)));
  }
  return pts;
}
const roadAtX = (x) => WEST_ROAD.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best));
// Each lane starts on the west coast road (roadX) or at a given spot (x, inland), and ends at its village
const BRANCHES = WORLD.inland.lanes.map((l, i) => {
  const s = l.roadX !== undefined ? roadAtX(l.roadX) : { x: l.x, z: zAtD(l.x, l.inland) };
  return branchRoad(s.x, s.z, VILLAGES[i].x, VILLAGES[i].z + 30);
});
buildRoadRibbon(WEST_ROAD);
for (const b of BRANCHES) buildRoadRibbon(b);
// A white guardrail on posts along the sea side of the coast road
{
  const posts = [];
  const rail = [];
  const off = ROAD_W / 2 + 0.6;
  WEST_ROAD.forEach((p, i) => {
    if (cliffAmount(p.x) < 0.5) return; // only along the cliffs
    if (i % 2 === 0) posts.push([p.x + p.nx * off, p.y, p.z + p.nz * off]);
  });
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.9, 0.14).translate(0, 0.45, 0), hzMat(0x5a4632), posts.length);
  const m = new THREE.Matrix4();
  posts.forEach(([x, y, z], i) => postMesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
  scene.add(postMesh);
  // the rail itself: a narrow white band on the posts, broken wherever the cliffs stop
  const runs = [];
  let run = [];
  for (const p of WEST_ROAD) {
    if (cliffAmount(p.x) >= 0.5) run.push(p);
    else if (run.length) (runs.push(run), (run = []));
  }
  if (run.length) runs.push(run);
  const railMat = hzMat(0xe8e8e2, { metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide });
  for (const r of runs) {
    if (r.length < 2) continue;
    const pos = [];
    const idx = [];
    r.forEach((p, i) => {
      const x = p.x + p.nx * (off + 0.1);
      const z = p.z + p.nz * (off + 0.1);
      pos.push(x, p.y + 0.55, z, x, p.y + 0.85, z);
      if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, railMat));
  }
}

// ===== Street lamps: on the landward side of the coast road and into each village; soft at night =====
const streetLamps = (() => {
  const spots = [];
  const along = (pts, every, from = 0) => {
    for (let i = from; i < pts.length; i += every) {
      const p = pts[i];
      const off = ROAD_W / 2 + 0.9;
      spots.push({ x: p.x - p.nx * off, z: p.z - p.nz * off, y: p.y, nx: p.nx, nz: p.nz });
    }
  };
  const L = WORLD.inland.streetLamps;
  along(WEST_ROAD, L.every, L.first); // every ~36 m, between the power poles
  for (const b of BRANCHES) along(b, L.every, Math.max(0, b.length - L.villageStretch)); // the last ~160 m into each village
  const n = spots.length;
  const steel = hzMat(0x4a4f55, { metalness: 0.4 });
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 6).translate(0, 3, 0), steel, n);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 1.6).translate(0, 0, 0.8), steel, n);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.12, 0.6), headMat, n);
  // A faint warm pool of light on the road under each lamp
  const poolTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    if (!g || !g.createRadialGradient) return null;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,220,160,1)");
    gr.addColorStop(1, "rgba(255,220,160,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), poolMat, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  const glows = [];
  spots.forEach((s, i) => {
    const y0 = Math.min(landHeight(s.x, s.z), s.y);
    posts.setMatrixAt(i, m.makeTranslation(s.x, y0, s.z));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(s.nx, s.nz)); // the arm reaches out over the road
    arms.setMatrixAt(i, m.compose(v.set(s.x, y0 + 5.9, s.z), q, one));
    const hx = s.x + s.nx * 1.5;
    const hz = s.z + s.nz * 1.5;
    heads.setMatrixAt(i, m.compose(v.set(hx, y0 + 5.82, hz), q, one));
    pools.setMatrixAt(i, m.makeTranslation(hx, s.y + 0.05, hz));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(hx, y0 + 5.7, hz);
    glow.scale.setScalar(2.6);
    scene.add(glow);
    glows.push(glow);
  });
  scene.add(posts, arms, heads, pools);
  return { headMat, poolMat, glows };
})();
function updateStreetLamps(env) {
  const on = env.lampsOn;
  streetLamps.headMat.emissiveIntensity = 1.4 * on;
  streetLamps.poolMat.opacity = 0.22 * on; // gentle, not floodlights
  for (const g of streetLamps.glows) g.material.opacity = 0.35 * on;
}

// ===== Cars on the new roads =====
function buildCar(color) {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  put(g, new THREE.BoxGeometry(1.8, 0.7, 4.2), hzMat(color, { roughness: 0.4, metalness: 0.3 }), 0, 0.65, 0);
  put(g, new THREE.BoxGeometry(1.6, 0.6, 2.1), hzMat(0x22303a, { roughness: 0.2 }), 0, 1.25, 0.2);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 0 });
  for (const x of [-0.6, 0.6]) put(g, new THREE.BoxGeometry(0.3, 0.15, 0.05), lamp, x, 0.7, -2.12);
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2010, emissiveIntensity: 0 });
  for (const x of [-0.6, 0.6]) put(g, new THREE.BoxGeometry(0.3, 0.15, 0.05), tail, x, 0.7, 2.12);
  fitCarLights(g);
  scene.add(g);
  return { g, lamp, tail };
}
// Night lights on a car: glows at the headlights and tail lights, and a soft beam onto the road ahead
const carBeamGeo = new THREE.ConeGeometry(3.2, 14, 12, 1, true).translate(0, -7, 0).rotateX(Math.PI / 2 + 0.08); // apex at 0, reaching forward (−z), dipping a little
const carBeamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const carGlowMats = { head: [], tail: [] };
function fitCarLights(g) {
  for (const x of [-0.6, 0.6]) {
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xfff2d0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    head.position.set(x, 0.7, -2.3);
    head.scale.setScalar(1.6);
    const tail = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xff3020, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    tail.position.set(x, 0.7, 2.3);
    tail.scale.setScalar(1.0);
    g.add(head, tail);
    carGlowMats.head.push(head.material);
    carGlowMats.tail.push(tail.material);
  }
  const beam = new THREE.Mesh(carBeamGeo, carBeamMat);
  beam.position.set(0, 0.7, -2.2);
  g.add(beam);
}
for (const c of cars) fitCarLights(c.g); // the cars on the eastern coast road (landmarks.js)
function updateCarLights(env) {
  const on = env.lampsOn;
  for (const m of carGlowMats.head) m.opacity = 0.9 * on;
  for (const m of carGlowMats.tail) m.opacity = 0.7 * on;
  carBeamMat.opacity = 0.07 * on;
}

const CAR_COLORS = [0xc8342b, 0xf2f2ee, 0x2f5d8c, 0x3c3c3c, 0xe0b23a, 0x3f7a4a, 0x8a8f96];
const roadCars = [];
[WEST_ROAD, ...BRANCHES].forEach((road, ri) => {
  const n = ri === 0 ? 6 : 2;
  for (let k = 0; k < n; k++) roadCars.push({ ...buildCar(CAR_COLORS[(ri * 3 + k) % CAR_COLORS.length]), road, s: (k / n) * (road.length - 1), dir: k % 2 ? -1 : 1, speed: rand(8, 14) / 4 });
});
function updateRoadCars(dt, env) {
  const b = state.boat;
  for (const c of roadCars) {
    const road = c.road;
    c.s += c.dir * c.speed * dt;
    if (c.s < 0 || c.s > road.length - 1) {
      c.dir *= -1;
      c.s = clamp(c.s, 0, road.length - 1);
    }
    const i = Math.min(Math.floor(c.s), road.length - 2);
    const u = c.s - i;
    const p = road[i];
    const q = road[i + 1];
    const near = Math.hypot(p.x - b.x, p.z - b.z) < 1800;
    c.g.visible = near;
    if (!near) continue;
    const lane = 1.8 * c.dir;
    const x = lerp(p.x, q.x, u) + p.nx * lane;
    const z = lerp(p.z, q.z, u) + p.nz * lane;
    c.g.position.set(x, lerp(p.y, q.y, u), z);
    c.g.rotation.y = Math.atan2(-(q.x - p.x) * c.dir, -(q.z - p.z) * c.dir);
    c.lamp.emissiveIntensity = 2.5 * env.lampsOn;
    c.tail.emissiveIntensity = 2 * env.lampsOn;
  }
}

// ===== Power lines along the coast road: wooden poles and sagging wires =====
const POLES = [];
{
  const poles = [];
  const PP = WORLD.inland.powerPoles;
  for (let i = PP.first; i < WEST_ROAD.length; i += PP.every) {
    const p = WEST_ROAD[i];
    const x = p.x - p.nx * (ROAD_W / 2 + PP.setback); // on the landward side
    const z = p.z - p.nz * (ROAD_W / 2 + PP.setback);
    poles.push({ x, z, y: landHeight(x, z), nx: p.nx, nz: p.nz });
  }
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.17, 9, 6).translate(0, 4.5, 0), hzMat(0x5a4632), poles.length);
  const armMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.14, 0.14), hzMat(0x4a3a28), poles.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const wire = [];
  poles.forEach((p, i) => {
    poleMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.nx, p.nz));
    armMesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y + 8.6, p.z), q, one));
    const n = poles[i + 1];
    if (!n) return;
    // Two wires, each a sagging curve between the cross-arm ends
    for (const s of [-0.9, 0.9]) {
      const ax = p.x + p.nx * s;
      const az = p.z + p.nz * s;
      const bx = n.x + n.nx * s;
      const bz = n.z + n.nz * s;
      for (let k = 0; k < 8; k++) {
        const u0 = k / 8;
        const u1 = (k + 1) / 8;
        const y0 = lerp(p.y, n.y, u0) + 8.7 - Math.sin(Math.PI * u0) * 1.2;
        const y1 = lerp(p.y, n.y, u1) + 8.7 - Math.sin(Math.PI * u1) * 1.2;
        wire.push(lerp(ax, bx, u0), y0, lerp(az, bz, u0), lerp(ax, bx, u1), y1, lerp(az, bz, u1));
      }
    }
  });
  scene.add(poleMesh, armMesh);
  POLES.push(...poles.filter((_, i) => i % 4 === 0)); // a few, for photos
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1c1c1c, transparent: true, opacity: 0.7 })));
}

// ===== Hill villages: little white houses with terracotta roofs, lit windows at night =====
{
  const wallMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), { city: true });
  const roofMat = hzMat(0xffffff, { roughness: 0.9 });
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofGeo = new THREE.CylinderGeometry(0, 0.75, 0.6, 4, 1).rotateY(Math.PI / 4).translate(0, 0.3, 0);
  const lots = [];
  for (const v of VILLAGES) {
    for (let k = 0; k < 40 && lots.filter((l) => l.v === v).length < 22; k++) {
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * 55;
      const x = v.x + Math.cos(a) * r;
      const z = v.z + Math.sin(a) * r;
      const w = rand(6, 10);
      const dp = rand(6, 9);
      const hs = [[-w / 2, -dp / 2], [w / 2, -dp / 2], [-w / 2, dp / 2], [w / 2, dp / 2]].map(([cx, cz]) => landHeight(x + cx, z + cz));
      const lo = Math.min(...hs);
      const hi = Math.max(...hs);
      if (hi - lo > 5) continue;
      lots.push({ v, x, z, w, dp, base: lo - 0.4, h: rand(4.5, 8) + (hi - lo) });
    }
  }
  const walls = new THREE.InstancedMesh(box, wallMat, lots.length);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, lots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const wallCols = [0xf4f1e8, 0xf0e6cf, 0xe8dcc0, 0xf4f1e8].map((h) => new THREE.Color(h));
  const roofCols = [0xb5532e, 0xa4482a, 0xc0653a].map((h) => new THREE.Color(h));
  lots.forEach((L, i) => {
    q.setFromEuler(e.set(0, rand(-0.3, 0.3), 0));
    walls.setMatrixAt(i, m.compose(new THREE.Vector3(L.x, L.base, L.z), q, new THREE.Vector3(L.w, L.h, L.dp)));
    walls.setColorAt(i, wallCols[i % wallCols.length]);
    roofs.setMatrixAt(i, m.compose(new THREE.Vector3(L.x, L.base + L.h, L.z), q, new THREE.Vector3(L.w * 1.45, L.w * 0.7, L.dp * 1.45)));
    roofs.setColorAt(i, roofCols[i % roofCols.length]);
  });
  scene.add(walls, roofs);
  // Each village has a little church tower
  for (const v of VILLAGES) {
    const y = landHeight(v.x, v.z);
    put(scene, new THREE.BoxGeometry(4, 16, 4), hzMat(0xf2efe6), v.x + 6, y + 7.5, v.z);
    put(scene, new THREE.ConeGeometry(3.2, 5, 4), hzMat(0xa4482a), v.x + 6, y + 18, v.z, 0, Math.PI / 4, 0);
  }
}

// ===== Radio masts on the hilltops, with red warning lights =====
const masts = (() => {
  const out = [];
  const [d0, d1] = WORLD.inland.radioMastInland;
  for (const { x0, x1 } of WORLD.inland.radioMasts) {
    let best = null;
    for (let x = x0; x <= x1; x += 40)
      for (let d = d0; d <= d1; d += 40) {
        const z = zAtD(x, d);
        const y = landHeight(x, z);
        if (!best || y > best.y) best = { x, z, y };
      }
    out.push(best);
  }
  const steel = hzMat(0xb8bcc2, { metalness: 0.4 });
  const red = hzMat(0xc0392b);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
  const lamps = [];
  const wires = [];
  out.forEach((p, i) => {
    const H = 70 + i * 12;
    // A lattice-looking mast: three thin legs braced together, banded red and white near the top
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      put(scene, new THREE.CylinderGeometry(0.12, 0.2, H, 5), steel, p.x + Math.cos(a) * 0.9, p.y + H / 2, p.z + Math.sin(a) * 0.9);
    }
    for (let y = 6; y < H; y += 6) put(scene, new THREE.TorusGeometry(0.95, 0.06, 4, 3), y > H - 20 && (y / 6) % 2 ? red : steel, p.x, p.y + y, p.z, Math.PI / 2);
    if (i === 1) for (const s of [-1, 1]) put(scene, new THREE.CylinderGeometry(1.4, 1.4, 0.3, 14), steel, p.x + s * 1.6, p.y + H * 0.7, p.z, 0, 0, Math.PI / 2 - 0.3); // dishes
    for (const y of [H * 0.5, H]) {
      const lamp = put(scene, new THREE.SphereGeometry(0.45, 8, 6), lampMat, p.x, p.y + y + 0.4, p.z);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.copy(lamp.position);
      glow.scale.setScalar(9);
      scene.add(glow);
      lamps.push({ lamp, glow, ph: i * 0.37 + (y === H ? 0 : 0.5) });
    }
    // Guy wires
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const gx = p.x + Math.cos(a) * H * 0.45;
      const gz = p.z + Math.sin(a) * H * 0.45;
      wires.push(p.x, p.y + H * 0.85, p.z, gx, landHeight(gx, gz), gz);
    }
    p.top = p.y + H;
  });
  const wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x55595e, transparent: true, opacity: 0.5 })));
  return { spots: out, lamps };
})();

// ===== The pleasure funPier below the clifftop town =====
const PIER = { ...WORLD.inland.funPier };
PIER.z0 = shoreZAt(PIER.x) - 1;
PIER.z1 = PIER.z0 + PIER.len;
const funPier = (() => {
  const g = new THREE.Group();
  const wood = hzMat(0x8a6a45, { roughness: 0.9 });
  const white = hzMat(0xf4f1ea);
  const iron = hzMat(0x3a3f46, { metalness: 0.3 });
  const { x, z0, z1, w, deckY } = PIER;
  const mid = (z0 + z1) / 2;
  put(g, new THREE.BoxGeometry(w, 0.5, PIER.len), wood, x, deckY, mid);
  // The wide end, for the rides
  const endZ = z1 + 16;
  put(g, new THREE.BoxGeometry(46, 0.5, 34), wood, x, deckY, endZ);
  // Piles down to the sea floor
  for (let z = z0 + 6; z < z1 + 32; z += 12)
    for (const s of z > z1 ? [-20, -7, 7, 20] : [-1, 1]) {
      const px = x + (z > z1 ? s : s * (w / 2 - 0.6));
      const bed = seaBed(px, z);
      const h = deckY - bed;
      put(g, new THREE.CylinderGeometry(0.35, 0.4, h, 8), iron, px, bed + h / 2, z);
    }
  // Railings
  for (const s of [-1, 1]) put(g, new THREE.BoxGeometry(0.12, 1, PIER.len), white, x + s * (w / 2 - 0.1), deckY + 0.75, mid);
  // A lift tower against the cliff, with a footbridge into the town
  const topY = landHeight(x, zAtD(x, cliffLine(x) + CLIFF_RISE0 + 8));
  put(g, new THREE.BoxGeometry(7, topY - deckY + 3, 7), white, x, (deckY + topY + 3) / 2, z0 + 2);
  const lit = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe0a0, emissiveIntensity: 0 });
  put(g, new THREE.BoxGeometry(7.2, topY - deckY - 2, 1.2), lit, x, (deckY + topY) / 2, z0 + 5.1);
  put(g, new THREE.BoxGeometry(3, 1, zAtD(x, -1) - zAtD(x, cliffLine(x) + CLIFF_RISE0 + 9)), white, x, topY + 1, (z0 + zAtD(x, cliffLine(x) + CLIFF_RISE0 + 9)) / 2);
  // Shops along the deck: bright little kiosks with striped awnings
  const shopCols = [0xe63946, 0x2a9d8f, 0xf4a261, 0x118ab2, 0xffd166, 0x6a4c93, 0xef476f, 0x06d6a0];
  const signs = [];
  for (let k = 0; k < 8; k++) {
    const s = k % 2 ? 1 : -1;
    const sz = z0 + 30 + Math.floor(k / 2) * 26;
    const sx = x + s * (w / 2 - 2.6);
    put(g, new THREE.BoxGeometry(4, 3.2, 5), hzMat(shopCols[k]), sx, deckY + 1.85, sz);
    for (let st = 0; st < 5; st++) put(g, new THREE.BoxGeometry(1.0, 0.12, 2), st % 2 ? white : hzMat(shopCols[k]), sx - s * 0.2, deckY + 3.4 - 0, sz - 2 + st * 1.0, 0, 0, s * 0.35);
    const sign = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: shopCols[(k + 3) % 8], emissiveIntensity: 0 });
    put(g, new THREE.BoxGeometry(0.15, 0.7, 3), sign, sx - s * 2.05, deckY + 3.1, sz);
    signs.push(sign);
  }
  // Lamp posts
  const lampGlows = [];
  for (let z = z0 + 10; z < z1; z += 16)
    for (const s of [-1, 1]) {
      put(g, new THREE.CylinderGeometry(0.07, 0.09, 4, 6), iron, x + s * (w / 2 - 0.4), deckY + 2.25, z);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffe2a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(x + s * (w / 2 - 0.4), deckY + 4.4, z);
      glow.scale.setScalar(4);
      g.add(glow);
      lampGlows.push(glow);
    }
  // Strings of bulbs along both sides, and round the end platform
  const bulbPos = [];
  for (let z = z0 + 4; z < z1; z += 2.2) for (const s of [-1, 1]) bulbPos.push([x + s * (w / 2 - 0.1), deckY + 1.6 + 0.25 * Math.sin(z * 0.4), z]);
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    bulbPos.push([x + Math.cos(a) * 22, deckY + 1.4, endZ + Math.sin(a) * 16]);
  }
  // The Ferris wheel
  const wheel = new THREE.Group();
  const R = 15;
  wheel.position.set(x - 10, deckY + R + 3, endZ + 4);
  for (const zz of [-1.2, 1.2]) put(wheel, new THREE.TorusGeometry(R, 0.25, 6, 48), white, 0, 0, zz);
  for (let k = 0; k < 16; k++) put(wheel, new THREE.CylinderGeometry(0.08, 0.08, R * 2, 4), white, 0, 0, 0, 0, 0, (k / 16) * Math.PI);
  const gondolas = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const gd = put(wheel, new THREE.BoxGeometry(1.6, 1.4, 1.6), hzMat(shopCols[k % 8]), Math.cos(a) * R, Math.sin(a) * R - 1, 0);
    gondolas.push(gd);
  }
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    bulbPos.push({ wheel: true, a });
  }
  g.add(wheel);
  for (const s of [-1, 1]) {
    put(g, new THREE.CylinderGeometry(0.4, 0.5, R + 4, 8), white, x - 10 + s * 5, deckY + (R + 3) / 2, endZ + 4 - 2.5, 0, 0, s * 0.3);
    put(g, new THREE.CylinderGeometry(0.4, 0.5, R + 4, 8), white, x - 10 + s * 5, deckY + (R + 3) / 2, endZ + 4 + 2.5, 0, 0, s * 0.3);
  }
  // The carousel
  const carousel = new THREE.Group();
  carousel.position.set(x + 12, deckY + 0.3, endZ + 2);
  put(carousel, new THREE.CylinderGeometry(6, 6, 0.6, 24), white, 0, 0.3, 0);
  put(carousel, new THREE.CylinderGeometry(0.3, 0.3, 5, 8), hzMat(0xe0b23a, { metalness: 0.5 }), 0, 2.8, 0);
  const canopy = new THREE.ConeGeometry(6.6, 2.4, 16, 1);
  const cc = [];
  const cp = canopy.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const c = Math.floor(((Math.atan2(cp.getZ(i), cp.getX(i)) + Math.PI) / (Math.PI * 2)) * 16) % 2 ? [0.9, 0.2, 0.25] : [0.97, 0.95, 0.9];
    cc.push(...c);
  }
  canopy.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3));
  put(carousel, canopy, hzMat(0xffffff, { vertexColors: true }), 0, 6.4, 0);
  const horses = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(carousel, new THREE.CylinderGeometry(0.05, 0.05, 4.4, 5), hzMat(0xe0b23a, { metalness: 0.5 }), Math.cos(a) * 4.5, 2.8, Math.sin(a) * 4.5);
    horses.push(put(carousel, new THREE.BoxGeometry(0.4, 0.8, 1.4), hzMat([0xf2f2ee, 0x6b3f22, 0x2a2420][k % 3]), Math.cos(a) * 4.5, 1.8, Math.sin(a) * 4.5, 0, -a, 0));
  }
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    bulbPos.push({ carousel: true, a });
  }
  g.add(carousel);
  // All the bulbs: one instanced mesh, coloured each frame
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbPos.length);
  bulbs.frustumCulled = false;
  bulbPos.forEach((_, i) => bulbs.setColorAt(i, new THREE.Color(1, 1, 1)));
  g.add(bulbs);
  // People strolling
  const walkers = [];
  for (let k = 0; k < 10; k++) {
    const p = new THREE.Group();
    put(p, new THREE.CylinderGeometry(0.2, 0.22, 1.1, 7), hzMat(shopCols[(k * 3) % 8]), 0, 0.85, 0);
    put(p, new THREE.SphereGeometry(0.13, 8, 6), hzMat([0xc99272, 0x8a5a3c, 0xe0b090][k % 3]), 0, 1.55, 0);
    p.position.set(x + rand(-3, 3), deckY + 0.25, rand(z0 + 10, z1));
    g.add(p);
    walkers.push({ p, sp: rand(0.8, 1.4) * (k % 2 ? 1 : -1) });
  }
  scene.add(g);
  // The boat can't sail through it
  for (let z = z0; z < z1; z += 9) SEA_OBSTACLES.push({ x, z, r: 7 });
  for (const ox of [-15, 0, 15]) SEA_OBSTACLES.push({ x: x + ox, z: endZ, r: 14 });
  return { wheel, gondolas, carousel, bulbs, bulbPos, signs, lampGlows, lit, walkers, endZ, color: new THREE.Color(), m: new THREE.Matrix4() };
})();

function updatePier(dt, t, env) {
  const b = state.boat;
  if (Math.hypot(PIER.x - b.x, PIER.z1 - b.z) > 2200) return;
  const night = env.lampsOn;
  funPier.wheel.rotation.z -= dt * 0.08;
  for (const gd of funPier.gondolas) gd.rotation.z = -funPier.wheel.rotation.z; // gondolas hang level
  funPier.carousel.rotation.y += dt * 0.5;
  funPier.lit.emissiveIntensity = 1.2 * night;
  for (const s of funPier.signs) s.emissiveIntensity = 0.4 + 2 * night;
  for (const gl of funPier.lampGlows) gl.material.opacity = night;
  const wp = funPier.wheel.position;
  const cp = funPier.carousel.position;
  funPier.bulbPos.forEach((bp, i) => {
    let x;
    let y;
    let z;
    if (bp.wheel) {
      const a = bp.a + funPier.wheel.rotation.z;
      x = wp.x + Math.cos(a) * 15;
      y = wp.y + Math.sin(a) * 15;
      z = wp.z + 1.4;
    } else if (bp.carousel) {
      const a = bp.a + funPier.carousel.rotation.y;
      x = cp.x + Math.cos(a) * 6.4;
      y = cp.y + 5.2;
      z = cp.z - Math.sin(a) * 6.4;
    } else [x, y, z] = bp;
    funPier.bulbs.setMatrixAt(i, funPier.m.makeTranslation(x, y, z));
    // Theme-park chase of colours at night; soft warm white by day
    if (night > 0.2) funPier.color.setHSL((i * 0.03 - t * 0.2) % 1 < 0 ? ((i * 0.03 - t * 0.2) % 1) + 1 : (i * 0.03 - t * 0.2) % 1, 1, 0.5 + 0.2 * Math.sin(t * 5 + i * 0.6));
    else funPier.color.setRGB(1, 0.9, 0.7).multiplyScalar(0.55);
    funPier.bulbs.setColorAt(i, funPier.color);
  });
  funPier.bulbs.instanceMatrix.needsUpdate = true;
  funPier.bulbs.instanceColor.needsUpdate = true;
  for (const w of funPier.walkers) {
    w.p.position.z += w.sp * dt;
    if (w.p.position.z > PIER.z1 + 10 || w.p.position.z < PIER.z0 + 8) w.sp *= -1;
    w.p.position.y = PIER.deckY + 0.25 + Math.abs(Math.sin(t * 6 + w.sp * 9)) * 0.04;
  }
}

function updateMasts(t, env) {
  for (const l of masts.lamps) {
    const on = (t * 0.7 + l.ph) % 1 < 0.5;
    l.lamp.visible = on || env.lampsOn < 0.3;
    l.glow.visible = on && env.lampsOn > 0.3;
  }
}

function updateHinterland(dt, t, env) {
  updateRoadCars(dt, env);
  updateStreetLamps(env);
  updateCarLights(env);
  updatePier(dt, t, env);
  updateMasts(t, env);
}

function addHinterlandSights(add, env) {
  const b = state.boat;
  add("pier", new THREE.Vector3(PIER.x, PIER.deckY + 10, (PIER.z0 + PIER.z1) / 2), 1500, { lit: env.lampsOn > 0.3 });
  for (const v of VILLAGES) add("villages", new THREE.Vector3(v.x, landHeight(v.x, v.z) + 6, v.z), 2500, { lit: env.lampsOn > 0.3 });
  for (const m of masts.spots) add("antennas", new THREE.Vector3(m.x, m.top, m.z), 3000, { lit: true });
  // Every car on every road (including the cars on the eastern coast road, landmarks.js)
  for (const c of roadCars) if (c.g.visible) add("coastroad", c.g.position.clone().setY(c.g.position.y + 1), 700);
  for (const c of cars) add("coastroad", c.g.position.clone().setY(c.g.position.y + 1), 700);
  // The pier's rides and shops, and the power lines
  add("ferriswheel", funPier.wheel.position.clone(), 1500, { lit: env.lampsOn > 0.3 });
  add("carousel", funPier.carousel.position.clone().setY(funPier.carousel.position.y + 3), 700, { lit: env.lampsOn > 0.3 });
  add("piershops", new THREE.Vector3(PIER.x, PIER.deckY + 2.5, PIER.z0 + 60), 500, { lit: env.lampsOn > 0.3 });
  for (const p of POLES) add("powerlines", new THREE.Vector3(p.x, p.y + 7, p.z), 500);
}
