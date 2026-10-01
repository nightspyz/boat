// Harbor, hidden places, islands, ruins and statues, underwater sites.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

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
  // The arm (the statue's +x) points straight at the strange light under the eastern cliffs: a real clue
  watcher.rotation.y = Math.atan2(-(GLOW.z - top.z), GLOW.x - top.x);
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

// ===== Clues on the water: an oily rainbow sheen over wrecks =====
// Fuel and oil still seep from the wrecks, so a shimmering slick on the surface gives them away,
// even the deep one you can't see from the boat.
const sheenMat = new THREE.ShaderMaterial({
  uniforms: { uTime: shared.uTime, uLightLevel: shared.uLightLevel, uFar: { value: 300 } },
  transparent: true,
  depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec3 vW;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    ${NOISE_GLSL}
    uniform float uTime;
    uniform float uLightLevel;
    uniform float uFar;
    uniform vec3 uCenter;
    uniform float uRadius;
    varying vec3 vW;
    void main() {
      float r = length(vW.xz - uCenter.xz) / uRadius;
      float n = fbm(vW.xz * 0.12 + uTime * 0.02);
      float mask = 1.0 - smoothstep(0.45, 1.0, r + (n - 0.5) * 0.7);
      // Thin-film colours: rainbow bands that swirl with the slick
      float h = n * 3.0 + r * 1.5 + uTime * 0.03;
      vec3 film = 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)));
      float fade = 1.0 - smoothstep(uFar * 0.5, uFar, length(cameraPosition - vW));
      gl_FragColor = vec4(mix(vec3(0.3, 0.35, 0.4), film, 0.6) * uLightLevel, mask * 0.25 * fade);
    }
  `,
});
const sheens = [
  { site: "wreck", x: WRECK.x, z: WRECK.z, r: 18 },
  { site: "sailboat", x: SAILBOAT.x, z: SAILBOAT.z, r: 12 },
  { site: "deepwreck", x: DEEP_WRECK.x + 15, z: DEEP_WRECK.z + 10, r: 24 }, // drifted a little from the deep wreck
].map((s) => {
  const geo = new THREE.PlaneGeometry(s.r * 2, s.r * 2, 10, 10);
  geo.rotateX(-Math.PI / 2);
  const mat = sheenMat.clone();
  mat.uniforms.uTime = shared.uTime;
  mat.uniforms.uLightLevel = shared.uLightLevel;
  mat.uniforms.uCenter = { value: new THREE.Vector3(s.x, 0, s.z) };
  mat.uniforms.uRadius = { value: s.r };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(s.x, 0, s.z);
  mesh.renderOrder = 2;
  scene.add(mesh);
  return { ...s, mesh, hinted: false };
});

// The slicks ride the waves; only the ones nearby are updated
function updateSheens(t) {
  const b = state.boat;
  for (const s of sheens) {
    const near = Math.hypot(s.x - b.x, s.z - b.z) < 700;
    s.mesh.visible = near;
    if (!near) continue;
    s.mesh.material.uniforms.uFar.value = scene.fog.far;
    const pos = s.mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, waveHeight(s.x + pos.getX(i), s.z + pos.getZ(i), t) + 0.06);
    pos.needsUpdate = true;
  }
}

// ===== Washed up after a storm =====
// The day after a storm, a few things lie on the beaches for anyone who goes looking.
const driftMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x9b8f80, roughness: 0.95 }));
function buildCrate() {
  const g = new THREE.Group();
  const wood = applyHaze(new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }));
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 0.9), wood);
  box.position.y = 0.3;
  box.rotation.set(0.15, 0.6, 0.1);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.5), wood);
  lid.position.set(0.9, 0.05, 0.6);
  lid.rotation.set(0, 1.1, 0.05);
  g.add(box, lid);
  return g;
}
function buildBottle() {
  const g = new THREE.Group();
  const glass = applyHaze(new THREE.MeshStandardMaterial({ color: 0x2f7a4a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }));
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 10), glass);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.08, 0.14, 10), glass);
  neck.position.y = 0.23;
  const bottle = new THREE.Group();
  bottle.add(body, neck);
  bottle.rotation.z = Math.PI / 2 - 0.1;
  bottle.position.y = 0.1;
  // Tangled in a bit of driftwood and weed, so it shows from the water
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.6, 7), driftMat);
  log.rotation.set(0, 0.4, Math.PI / 2);
  log.position.set(0.3, 0.12, -0.5);
  const weed = new THREE.Mesh(new THREE.SphereGeometry(0.45, 7, 5), applyHaze(new THREE.MeshStandardMaterial({ color: 0x3d4a22, roughness: 1 })));
  weed.scale.set(1.4, 0.25, 0.9);
  weed.position.set(-0.4, 0.05, -0.3);
  g.add(bottle, log, weed);
  return g;
}
function buildAmphora() {
  const pts = [[0.02, 0], [0.12, 0.08], [0.26, 0.35], [0.3, 0.6], [0.24, 0.85], [0.1, 1.0], [0.09, 1.15], [0.13, 1.2]].map(
    ([r, y]) => new THREE.Vector2(r, y)
  );
  const clay = applyHaze(new THREE.MeshStandardMaterial({ color: 0xb2643c, roughness: 0.85 }));
  const jar = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), clay);
  jar.rotation.z = Math.PI / 2 + 0.25;
  jar.position.set(0.55, 0.28, 0);
  const g = new THREE.Group();
  g.add(jar);
  // Barnacles from a long time on the sea floor
  const crust = applyHaze(new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 1 }));
  for (let k = 0; k < 8; k++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), crust);
    b.position.set(rand(0.1, 1.0), rand(0.35, 0.55), rand(-0.2, 0.2));
    g.add(b);
  }
  return g;
}
const washedUp = [
  { id: "crate", g: buildCrate() },
  { id: "bottle", g: buildBottle() },
  { id: "amphora", g: buildAmphora() },
];
for (const w of washedUp) {
  w.g.visible = false;
  scene.add(w.g);
}

// A random spot on a sandy beach just above the waterline: the cove, the sandy coast east of the
// lighthouse, or the beach of Palm Islet
function beachSpot() {
  for (let k = 0; k < 60; k++) {
    const where = Math.random();
    if (where < 0.25) {
      const I = ISLAND.palm;
      const a = rand(0, Math.PI * 2);
      const r = I.R * rand(0.6, 0.95);
      const x = I.x + Math.cos(a) * r;
      const z = I.z + Math.sin(a) * r;
      const y = islandHeight(I, x, z);
      if (y > 0.3 && y < 1.6) return { x, y, z };
    } else {
      const x = where < 0.6 ? COVE_X + rand(-200, 200) : rand(450, 1100);
      if (Math.abs(x - COVE_X - 8) < 20 || cliffAmount(x) > 0.3) continue; // clear of the pier, only on sand
      const z = shoreZAt(x) - rand(4, 9);
      const y = landHeight(x, z);
      if (y > 0.2 && y < 1.5) return { x, y, z };
    }
  }
  return null;
}
// Lay out two or three finds (ones not in the journal yet first) for today
function washUp() {
  const order = [...washedUp].sort((a, b) => (journal[a.id].seen ? 1 : 0) - (journal[b.id].seen ? 1 : 0) || Math.random() - 0.5);
  const count = 2 + (Math.random() < 0.5 ? 1 : 0);
  washedUp.forEach((w, i) => (w.g.visible = false));
  for (const w of order.slice(0, count)) {
    const p = beachSpot();
    if (!p) continue;
    w.g.position.set(p.x, p.y, p.z);
    w.g.rotation.y = rand(0, Math.PI * 2);
    w.g.visible = true;
  }
}
function clearWashUp() {
  for (const w of washedUp) w.g.visible = false;
}
