// Coral reefs and rocks on the sea floor: table corals, brain corals, staghorn and finger corals, soft corals,
// sea fans and boulders, placed where the reef grows (below the cliffs, patches in the bay, around the islands).
// Only the area around the camera is filled in, and refilled as you move.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== A tiny mesh kit: smooth-shaded parts with a colour per vertex, merged into one geometry =====
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

function reefMesh() {
  const pos = [];
  const nor = [];
  const col = [];
  // A grid of vertices; f(i, j) gives { p: [x, y, z], c: [r, g, b] }. wrap joins the last column to the first.
  function grid(rows, cols, f, wrap = false) {
    const V = [];
    const C = [];
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const v = f(i, j);
        V.push(v.p);
        C.push(v.c);
      }
    const at = (i, j) => i * cols + (wrap ? j % cols : j);
    const tris = [];
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < (wrap ? cols : cols - 1); j++) {
        tris.push([at(i, j), at(i + 1, j), at(i, j + 1)], [at(i, j + 1), at(i + 1, j), at(i + 1, j + 1)]);
      }
    // Smooth normals (the materials are two-sided, so which way they face doesn't matter)
    const N = V.map(() => [0, 0, 0]);
    for (const [a, b, c] of tris) {
      const n = v3.cross(v3.sub(V[b], V[a]), v3.sub(V[c], V[a]));
      for (const k of [a, b, c]) for (let q = 0; q < 3; q++) N[k][q] += n[q];
    }
    const Nn = N.map(v3.norm);
    for (const t of tris)
      for (const k of t) {
        pos.push(...V[k]);
        nor.push(...Nn[k]);
        col.push(...C[k]);
      }
  }
  // An ellipsoid (or part of one, from latitude lat0 to lat1, 0 = top), dented by disp(dir) and coloured by color(dir)
  function blob(c, r, lat0, lat1, segLat, segLon, disp = () => 1, color = () => [1, 1, 1]) {
    grid(
      segLat + 1,
      segLon,
      (i, j) => {
        const th = lat0 + ((lat1 - lat0) * i) / segLat;
        const ph = (2 * Math.PI * j) / segLon;
        const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        const k = disp(d);
        return { p: [c[0] + d[0] * r[0] * k, c[1] + d[1] * r[1] * k, c[2] + d[2] * r[2] * k], c: color(d) };
      },
      true
    );
  }
  // A tapered tube from a to b
  function tube(a, b, r0, r1, sides, c0, c1) {
    const axis = v3.norm(v3.sub(b, a));
    const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = v3.norm(v3.cross(axis, helper));
    const w = v3.cross(axis, u);
    grid(
      2,
      sides,
      (i, j) => {
        const ang = (2 * Math.PI * j) / sides;
        const r = i ? r1 : r0;
        const ring = v3.add(v3.mul(u, Math.cos(ang) * r), v3.mul(w, Math.sin(ang) * r));
        return { p: v3.add(i ? b : a, ring), c: i ? c1 : c0 };
      },
      true
    );
  }
  // A flat strip from a to b, width w, lying in the plane with normal n
  function ribbon(a, b, w0, w1, n, c0, c1) {
    const side = v3.norm(v3.cross(v3.sub(b, a), n));
    grid(2, 2, (i, j) => {
      const half = (i ? w1 : w0) / 2;
      return { p: v3.add(i ? b : a, v3.mul(side, j ? half : -half)), c: i ? c1 : c0 };
    });
  }
  return {
    blob,
    tube,
    ribbon,
    data: () => ({ position: new Float32Array(pos), normal: new Float32Array(nor), color: new Float32Array(col) }),
  };
}

// Seeded random numbers, so every tile of reef grows the same way each time it's filled in
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const grey = (v) => [v, v, v];
const bumps = (d, f, seed) => noise2(d[0] * f + seed, d[2] * f + d[1] * f * 1.7 + seed * 0.37);

// ===== The shapes (about 1 m across; each placed copy is scaled and tinted) =====
// Table coral: a broad flat plate on a short stalk, paler at the growing rim; sometimes a second tier
function shapeTable(rng) {
  const m = reefMesh();
  m.tube([0, 0, 0], [0.05, 0.5, 0], 0.16, 0.1, 6, grey(0.45), grey(0.6));
  const plate = (c, r, seed) =>
    m.blob(
      c,
      [r, 0.08, r * 0.92],
      0,
      Math.PI,
      5,
      14,
      (d) => 1 + 0.08 * (bumps(d, 3, seed) - 0.5),
      // Radial ridges of growing branches, a pale growing rim, darker underneath
      (d) => {
        if (d[1] < -0.2) return grey(0.42);
        const radial = Math.abs(Math.sin(Math.atan2(d[2], d[0]) * 23 + bumps(d, 5, seed) * 4));
        return grey(0.62 + 0.18 * radial + 0.4 * Math.pow(1 - Math.abs(d[1]), 3) + 0.12 * (bumps(d, 9, seed) - 0.5));
      }
    );
  plate([0.05, 0.55, 0], 1, rng() * 50);
  if (rng() < 0.45) {
    m.tube([0.05, 0.3, 0], [0.45, 0.32, 0.2], 0.08, 0.06, 5, grey(0.45), grey(0.55));
    plate([0.55, 0.32, 0.25], 0.55, rng() * 50);
  }
  return m.data();
}
// Brain and boulder corals: lumpy domes with a meandering pattern
function shapeBoulder(rng) {
  const m = reefMesh();
  const seed = rng() * 50;
  const lumps = 1 + Math.floor(rng() * 3);
  for (let k = 0; k < lumps; k++) {
    const r = k ? rand(0.4, 0.65) : 1;
    const c = k ? [rand(-0.7, 0.7), -0.05, rand(-0.7, 0.7)] : [0, -0.05, 0];
    m.blob(
      c,
      [r, r * 0.72, r * 0.9],
      0,
      Math.PI / 2,
      5,
      13,
      (d) => 1 + 0.18 * (bumps(d, 2.5, seed + k) - 0.5),
      (d) => grey(0.55 + 0.45 * Math.abs(Math.sin(d[0] * 11 + Math.sin(d[2] * 9 + seed) * 2.2) * Math.sin(d[2] * 10 + d[1] * 5)))
    );
  }
  return m.data();
}
// Branching coral: antler-like branches with pale growing tips (staghorn), or a dome of short fingers
function shapeBranching(rng, fingers) {
  const m = reefMesh();
  if (fingers) {
    m.blob([0, -0.05, 0], [0.75, 0.35, 0.7], 0, Math.PI / 2, 4, 12, () => 1, () => grey(0.6));
    for (let k = 0; k < 22; k++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 0.62;
      const base = [Math.cos(a) * r, 0.3 * Math.sqrt(Math.max(0, 1 - (r / 0.75) ** 2)) - 0.03, Math.sin(a) * r];
      const tip = v3.add(base, [Math.cos(a) * r * 0.25, rand(0.2, 0.42), Math.sin(a) * r * 0.25]);
      m.tube(base, tip, 0.06, 0.04, 4, grey(0.62), grey(1.05));
    }
    return m.data();
  }
  const branch = (a, dir, len, r, depth) => {
    const b = v3.add(a, v3.mul(dir, len));
    m.tube(a, b, r, r * 0.75, 3, grey(0.55 + depth * 0.1), grey(depth === 3 ? 1.1 : 0.65 + depth * 0.1));
    if (depth === 3) return;
    for (let k = 0; k < 2; k++) {
      const nd = v3.norm(v3.add(dir, [rand(-0.7, 0.7), rand(0.1, 0.6), rand(-0.7, 0.7)]));
      branch(b, nd, len * 0.82, r * 0.72, depth + 1);
    }
  };
  const trunks = 3 + Math.floor(rng() * 2);
  for (let k = 0; k < trunks; k++) {
    const a = (k / trunks) * Math.PI * 2 + rng();
    branch([0, 0, 0], v3.norm([Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6]), 0.32, 0.06, 0);
  }
  return m.data();
}
// Soft coral: a bush of fleshy, cauliflower-like lobes on short stems, brightest on top
function shapeSoft(rng) {
  const m = reefMesh();
  const seed = rng() * 50;
  for (let k = 0; k < 7; k++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.42;
    const h = 0.35 + rng() * 0.35 - r * 0.3;
    const top = [Math.cos(a) * r, h, Math.sin(a) * r];
    m.tube([top[0] * 0.3, 0, top[2] * 0.3], top, 0.06, 0.05, 4, grey(0.75), grey(0.85));
    const s = rand(0.16, 0.26);
    m.blob(
      top,
      [s * 1.1, s * 0.9, s * 1.1],
      0,
      Math.PI,
      3,
      6,
      (d) => 1 + 0.25 * (bumps(d, 4, seed + k) - 0.5),
      (d) => grey(0.72 + 0.35 * Math.max(0, d[1]))
    );
  }
  return m.data();
}
// Sea fan (gorgonian): a flat, slightly curved lace of branches
function shapeFan(rng) {
  const m = reefMesh();
  const bend = (p) => [p[0], p[1], 0.18 * p[0] * p[0]];
  const branch = (a, ang, len, w, depth) => {
    const b = [a[0] + Math.sin(ang) * len, a[1] + Math.cos(ang) * len, 0];
    const tone = 0.55 + depth * 0.09;
    m.ribbon(bend(a), bend(b), w, w * 0.8, [0, 0, 1], grey(tone), grey(tone + 0.09));
    if (depth === 5) return;
    const spread = rand(0.25, 0.5);
    branch(b, ang - spread, len * 0.84, w * 0.78, depth + 1);
    branch(b, ang + spread, len * 0.84, w * 0.78, depth + 1);
  };
  branch([0, 0, 0], rand(-0.15, 0.15), 0.3, 0.05, 0);
  return m.data();
}
// Rock: a lumpy boulder, flat underneath, crusted with pink coralline algae and green turf on top
function shapeRock(rng) {
  const m = reefMesh();
  const seed = rng() * 50;
  m.blob(
    [0, 0.25, 0],
    [1, 0.6, 0.85],
    0,
    Math.PI,
    7,
    12,
    (d) => {
      const k = 1 + 0.32 * (bumps(d, 1.4, seed) - 0.5) + 0.14 * (bumps(d, 4, seed + 3) - 0.5);
      return d[1] * k < -0.4 ? -0.4 / d[1] : k; // flat base
    },
    (d) => {
      const base = [0.56, 0.52, 0.47].map((v) => v * (0.85 + 0.3 * bumps(d, 5, seed)));
      if (d[1] < 0.25) return base;
      const crust = bumps(d, 3, seed + 7);
      const on = Math.min(1, (d[1] - 0.25) * 3);
      const top = crust > 0.55 ? [0.78, 0.48, 0.58] : [0.45, 0.55, 0.3];
      return base.map((v, i) => v + (top[i] - v) * on * 0.8);
    }
  );
  return m.data();
}

// Each kind of reef object: its shapes, how tall it is (at scale 1), its size range and its colours
const REEF_KINDS = [
  { id: "table", shapes: [shapeTable, shapeTable], height: 0.65, size: [0.5, 1.4], cap: 350, range: 120,
    colors: [[0.98, 0.72, 0.5], [0.95, 0.55, 0.48], [0.62, 0.72, 0.88], [1, 0.92, 0.76], [0.74, 0.74, 0.46]] },
  { id: "boulder", shapes: [shapeBoulder, shapeBoulder], height: 0.75, size: [0.5, 1.5], cap: 450, range: 120,
    colors: [[0.95, 0.78, 0.5], [0.66, 0.74, 0.4], [0.78, 0.52, 0.7], [1, 0.66, 0.4], [0.82, 0.84, 0.66]] },
  { id: "staghorn", shapes: [(r) => shapeBranching(r, false), (r) => shapeBranching(r, false)], height: 1.0, size: [0.7, 1.4], cap: 400, range: 85,
    colors: [[0.86, 0.6, 0.42], [0.78, 0.5, 0.8], [0.55, 0.68, 0.95], [1, 0.9, 0.7], [1, 0.62, 0.68]] },
  { id: "fingers", shapes: [(r) => shapeBranching(r, true)], height: 0.65, size: [0.6, 1.2], cap: 350, range: 85,
    colors: [[0.92, 0.7, 0.5], [0.75, 0.55, 0.88], [1, 0.82, 0.55], [0.66, 0.78, 0.5]] },
  { id: "soft", shapes: [shapeSoft, shapeSoft], height: 0.95, size: [0.45, 1.05], cap: 350, range: 85,
    colors: [[0.95, 0.3, 0.3], [0.97, 0.58, 0.64], [0.98, 0.52, 0.22], [0.5, 0.78, 0.25], [0.92, 0.78, 0.3]] },
  { id: "fan", shapes: [shapeFan, shapeFan], height: 1.6, size: [0.7, 1.6], cap: 250, range: 95,
    colors: [[0.92, 0.42, 0.22], [0.62, 0.32, 0.72], [0.86, 0.86, 0.82], [0.95, 0.78, 0.28]] },
  { id: "rock", shapes: [shapeRock, shapeRock, shapeRock], height: 0.85, size: [0.5, 2.4], cap: 550, range: 120,
    colors: [[1, 1, 1], [0.92, 0.9, 0.86], [0.85, 0.85, 0.82]] },
];
// Which corals grow at which depth (shallow: sturdy branching and table corals; deeper: soft corals and fans)
const REEF_KIND = Object.fromEntries(REEF_KINDS.map((K) => [K.id, K]));
const REEF_MIX_SHALLOW = { table: 0.13, boulder: 0.22, staghorn: 0.27, fingers: 0.18, soft: 0.12, fan: 0.08 };
const REEF_MIX_DEEP = { table: 0.1, boulder: 0.22, staghorn: 0.14, fingers: 0.1, soft: 0.24, fan: 0.2 };

// ===== Where the reef grows =====
const NO_REEF = { coral: 0, rock: 0 };
// Two layers of noise: enough to break the reef into patches and clumps, and quick to compute
const reefNoise = (x, z) => noise2(x, z) * 0.6 + noise2(x * 2.1 + 5.3, z * 2.1 + 1.7) * 0.4;
function reefWeights(x, z) {
  const d = inland(x, z);
  const cm = cliffAmount(x);
  // Below the cliffs, in patches out in the bay, and in a ring around each island (as the sea floor is painted)
  const nearCliffs = cm * smooth(-160, -110, d) * (1 - smooth(-6, -2, d));
  const bayZone = smooth(-280, -200, d) * (1 - smooth(-40, -20, d));
  let islands = 0;
  for (const I of ISLANDS) {
    const t = -islandInland(I, x, z);
    islands = Math.max(islands, smooth(4, 12, t) * (1 - smooth(35, 70, t)));
  }
  const rockZone = cm * smooth(-70, -6, d);
  let stacks = 0;
  for (const s of seaStacks) stacks = Math.max(stacks, 1 - smooth(s.r * 1.3, s.r * 3 + 8, Math.hypot(x - s.x, z - s.z)));
  // Most of the sea floor is plain sand: skip the noise there
  if (nearCliffs + bayZone + islands + rockZone + stacks < 0.01) return NO_REEF;
  const bay = bayZone > 0 ? bayZone * smooth(0.46, 0.6, reefNoise(x * 0.012, z * 0.012)) : 0;
  const zone = Math.max(nearCliffs, bay, islands);
  // Coral grows in heads and clumps with sand between them
  const coral = zone > 0 ? zone * smooth(0.34, 0.54, reefNoise(x * 0.07 + 3.1, z * 0.07 + 7.7)) : 0;
  // Boulders at the foot of the cliffs and around the sea stacks
  const rock = Math.max(rockZone > 0 ? rockZone * smooth(0.4, 0.6, reefNoise(x * 0.05 + 11, z * 0.05 + 5)) : 0, stacks);
  return { coral, rock };
}

const REEF_TILE = 20;
const REEF_RADIUS = 120; // underwater things fade out before this
const reefTiles = new Map();

// Everything growing on one tile of sea floor: [{ kind, shape, x, y, z, yaw, tiltX, tiltZ, scale, color }]
function reefTile(tx, tz) {
  const key = tx + "," + tz;
  let items = reefTiles.get(key);
  if (items) return items;
  items = [];
  const rng = seededRandom(Math.imul(tx, 73856093) ^ Math.imul(tz, 19349663) ^ 0x5bd1e995);
  const add = (kind, x, z, bed, depth, scaleMul) => {
    if (depth < 1.8) return false; // not in the shallows (or on land)
    const K = REEF_KIND[kind];
    // Never let it reach the surface: leave the boat over a metre of water above it
    let scale = (K.size[0] + (K.size[1] - K.size[0]) * rng() ** 1.5) * scaleMul;
    scale = Math.min(scale, (depth - 1.2) / K.height);
    if (scale < 0.3) return false;
    items.push({
      kind,
      shape: Math.floor(rng() * K.shapes.length),
      x,
      y: bed - 0.06 * scale,
      z,
      yaw: rng() * Math.PI * 2,
      tiltX: (rng() - 0.5) * 0.2,
      tiltZ: (rng() - 0.5) * 0.2,
      scale,
      color: K.colors[Math.floor(rng() * K.colors.length)].map((c) => c * (0.85 + 0.25 * rng())),
    });
    return true;
  };
  const pickCoral = (depth, roll) => {
    const mix = depth < 6 ? REEF_MIX_SHALLOW : REEF_MIX_DEEP;
    let acc = 0;
    for (const id in mix) {
      acc += mix[id];
      if (roll < acc) return id;
    }
    return "boulder";
  };
  for (let k = 0; k < 40; k++) {
    const x = (tx + rng()) * REEF_TILE;
    const z = (tz + rng()) * REEF_TILE;
    const roll = rng();
    const pickRoll = rng();
    const bed = seaBed(x, z);
    const depth = -bed;
    if (depth < 1.8 || depth > 26) continue;
    const w = reefWeights(x, z);
    if (roll < w.rock * 0.25 || roll > 0.997) {
      add("rock", x, z, bed, depth, w.rock > 0.8 ? 1.6 : 1);
    } else if (roll < w.rock * 0.25 + w.coral * 0.9 * (1 - 0.6 * smooth(7, 18, depth))) {
      if (!add(pickCoral(depth, pickRoll), x, z, bed, depth, 1)) continue;
      // Corals grow in crowded heads: a few smaller neighbours around this one
      const friends = Math.floor(rng() * 7 * w.coral);
      for (let f = 0; f < friends; f++) {
        const a = rng() * Math.PI * 2;
        const r = 0.7 + rng() * 1.6;
        const fx = x + Math.cos(a) * r;
        const fz = z + Math.sin(a) * r;
        const fb = seaBed(fx, fz);
        add(pickCoral(-fb, rng()), fx, fz, fb, -fb, 0.6 + 0.3 * rng());
      }
    }
  }
  reefTiles.set(key, items);
  return items;
}

// The tiles around (x, z), nearest first
function reefTilesAround(x, z) {
  const ctx = Math.floor(x / REEF_TILE);
  const ctz = Math.floor(z / REEF_TILE);
  const n = Math.ceil(REEF_RADIUS / REEF_TILE) + 1;
  const tiles = [];
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const d = Math.hypot((ctx + i + 0.5) * REEF_TILE - x, (ctz + j + 0.5) * REEF_TILE - z);
      if (d < REEF_RADIUS + REEF_TILE) tiles.push({ tx: ctx + i, tz: ctz + j, d });
    }
  return tiles.sort((a, b) => a.d - b.d);
}

// Everything within reach of (x, z), nearest tiles first
function reefItemsAround(x, z) {
  const out = [];
  for (const t of reefTilesAround(x, z))
    for (const it of reefTile(t.tx, t.tz)) if (Math.hypot(it.x - x, it.z - z) < REEF_KIND[it.kind].range) out.push(it);
  return out;
}

// ===== Drawing: one instanced mesh per shape =====
const reefMat = applyUnderwater(
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide })
);
const reefMeshes = {}; // kind → [InstancedMesh per shape]
for (const K of REEF_KINDS) {
  reefMeshes[K.id] = K.shapes.map((build, i) => {
    const data = build(seededRandom(1000 + i * 77 + K.id.length * 13));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(data.color, 3));
    const cap = Math.ceil(K.cap / K.shapes.length);
    const mesh = new THREE.InstancedMesh(geo, reefMat, cap);
    // Every mesh gets its colours from the start. They all share one material, and three.js builds its shader
    // once: if some meshes had per-coral colours and others didn't, the others would draw black or untinted.
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.count = 0;
    mesh.frustumCulled = false; // the copies are spread far beyond the shape's own bounds
    mesh.renderOrder = 1.5; // after the water, like the other underwater things
    scene.add(mesh);
    return mesh;
  });
}

const reefState = { tile: null, dirty: false };
const _rm = new THREE.Matrix4();
const _rq = new THREE.Quaternion();
const _re = new THREE.Euler();
const _rp = new THREE.Vector3();
const _rs = new THREE.Vector3();
const _rc = new THREE.Color();

// Refill the reef around the camera when it moves onto another tile. New tiles are grown a couple per
// frame, nearest first, so there's never a pause; the far ones (barely visible) fill in a moment later.
function updateReef() {
  const cx = camera.position.x;
  const cz = camera.position.z;
  const tile = Math.floor(cx / REEF_TILE) + "," + Math.floor(cz / REEF_TILE);
  if (tile !== reefState.tile) {
    reefState.tile = tile;
    reefState.dirty = true;
  }
  if (!reefState.dirty) return;
  const start = performance.now();
  let missing = false;
  for (const t of reefTilesAround(cx, cz)) {
    if (reefTiles.has(t.tx + "," + t.tz)) continue;
    if (performance.now() - start > 4) {
      missing = true; // the rest next frame
      break;
    }
    reefTile(t.tx, t.tz);
  }
  reefState.dirty = missing;
  for (const id in reefMeshes) for (const mesh of reefMeshes[id]) mesh.count = 0;
  const items = [];
  for (const t of reefTilesAround(cx, cz)) {
    const tileItems = reefTiles.get(t.tx + "," + t.tz);
    if (tileItems) for (const it of tileItems) if (Math.hypot(it.x - cx, it.z - cz) < REEF_KIND[it.kind].range) items.push(it);
  }
  for (const it of items) {
    const mesh = reefMeshes[it.kind][it.shape];
    if (mesh.count >= mesh.instanceMatrix.count) continue;
    _re.set(it.tiltX, it.yaw, it.tiltZ);
    _rm.compose(_rp.set(it.x, it.y, it.z), _rq.setFromEuler(_re), _rs.set(it.scale, it.scale, it.scale));
    mesh.setMatrixAt(mesh.count, _rm);
    mesh.setColorAt(mesh.count, _rc.setRGB(it.color[0], it.color[1], it.color[2]));
    mesh.count++;
  }
  for (const id in reefMeshes)
    for (const mesh of reefMeshes[id]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  // Forget tiles far behind, so the cache doesn't grow forever
  if (reefTiles.size > 2500) {
    for (const key of reefTiles.keys()) {
      const [tx, tz] = key.split(",").map(Number);
      if (Math.hypot((tx + 0.5) * REEF_TILE - cx, (tz + 0.5) * REEF_TILE - cz) > 600) reefTiles.delete(key);
    }
  }
}
