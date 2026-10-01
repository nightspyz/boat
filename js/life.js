// Splashes, dolphins, fish, reef fish, birds, airplanes.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

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
splashPoints.renderOrder = 2; // after the foam on the water
scene.add(splashPoints);

function splash(x, y, z, count, power) {
  if (count >= 8) sound.splash(x, z, power);
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
  pod.life = rand(35, 55); // how long they stay curious about the boat
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
    let rel = pod.life > -10 ? -1.6 : -3; // cruising just under the surface, where you can still see them
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

// The feeding spot: a shoal of small fish near the surface somewhere out on the water. Gulls circle and
// dive over it and fish leap out of the water there, so the birds are a clue you can see from far away.
const boil = { x: 0, z: -800, timer: 0 };
function moveBoil() {
  const b = state.boat;
  for (let k = 0; k < 40; k++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(220, 520);
    const x = b.x + Math.cos(a) * r;
    const z = b.z + Math.sin(a) * r;
    if (seaBed(x, z) < -8) {
      boil.x = x;
      boil.z = z;
      break;
    }
  }
  boil.timer = rand(150, 300);
}

function updateFish(dt, t) {
  const b = state.boat;
  boil.timer -= dt;
  if (boil.timer <= 0 || Math.hypot(boil.x - b.x, boil.z - b.z) > 1500) moveBoil();
  const nearBoil = Math.hypot(boil.x - b.x, boil.z - b.z) < 900;
  fishTimer -= dt;
  if (fishTimer <= 0) {
    // Often at the feeding spot, only now and then anywhere else
    const atBoil = nearBoil && Math.random() < 0.85;
    fishTimer = atBoil ? rand(0.3, 1.2) : rand(4, 12);
    const f = fishes.find((fish) => !fish.active);
    if (f) {
      const a = Math.random() * Math.PI * 2;
      const r = atBoil ? rand(0, 22) : rand(10, 60);
      const cx = atBoil ? boil.x : b.x;
      const cz = atBoil ? boil.z : b.z;
      f.active = true;
      f.x = cx + Math.cos(a) * r;
      f.z = cz + Math.sin(a) * r;
      f.yaw = Math.random() * Math.PI * 2;
      f.t = 0;
      f.dur = rand(2.2, 3.4);
      f.height = rand(0.6, 1.1);
      f.speed = rand(7, 10);
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
    // Up out of the water, a long glide just above the waves, then back in
    const lift = Math.min(1, Math.sin(Math.PI * u) * 3);
    const rel = -0.2 + (f.height + 0.2) * lift;
    const vy = u < 0.12 ? 3 : u > 0.88 ? -3 : 0;
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
  vx: 0,
  vz: 0,
  // Every fish swims on its own: it keeps its own position, speed and heading, and follows its place in
  // the school with its own reaction time, so a turn ripples through the school instead of all at once
  fish: Array.from({ length: FISH_PER_SCHOOL }, () => ({
    ox: rand(-1, 1) * 4,
    oy: rand(-1, 1) * 0.8,
    oz: rand(-1, 1) * 6,
    phase: rand(0, Math.PI * 2),
    scale: rand(0.8, 1.2),
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    slotHeading: 0, // the school's heading as this fish has noticed it
    react: rand(0.6, 2.2), // how quickly it notices the school turning (rad/s)
    turn: rand(2.2, 4), // how fast it can turn (rad/s)
    maxSpeed: rand(4.6, 6.2), // always faster than the school (up to 4 m/s), so nobody gets left behind
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
    const fresh = !s.placed;
    if (fresh) {
      s.x = tx;
      s.z = tz;
      s.placed = true;
    }

    const dx = tx - s.x;
    const dz = tz - s.z;
    const dist = Math.hypot(dx, dz);
    const speed = Math.min(dist * 0.5, 4);
    s.vx = dist > 0.01 ? (dx / dist) * speed : 0;
    s.vz = dist > 0.01 ? (dz / dist) * speed : 0;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    // Face the way the school moves; drift around slowly when it's idle
    const desired = speed > 0.3 ? Math.atan2(-dx, -dz) : s.heading + dt * 0.3;
    s.heading += clamp(wrapAngle(desired - s.heading), -dt * 1.2, dt * 1.2);

    const bed = seaBed(s.x, s.z);
    const targetY = clamp(bed + 2.5, -6, -1.2);
    s.y += (targetY - s.y) * (1 - Math.exp(-dt));

    const follow = 1 - Math.exp(-dt * 2.5);
    s.fish.forEach((f, fi) => {
      // The fish's place in the school, turned by the school's heading as this fish has noticed it
      f.slotHeading += clamp(wrapAngle(s.heading - f.slotHeading), -f.react * dt, f.react * dt);
      const ch = Math.cos(f.slotHeading);
      const sh = Math.sin(f.slotHeading);
      const lx = f.ox + Math.sin(t * 0.8 + f.phase) * 0.6;
      const lz = f.oz + Math.cos(t * 0.6 + f.phase) * 0.8;
      const px = s.x + lx * ch + lz * sh;
      const py = s.y + f.oy + Math.sin(t * 1.3 + f.phase) * 0.2;
      const pz = s.z - lx * sh + lz * ch;
      if (fresh) {
        Object.assign(f, { x: px, y: py, z: pz, vx: 0, vy: 0, vz: 0, heading: s.heading, slotHeading: s.heading });
      }
      // Swim toward that place, going with the school's flow, never faster than this fish can
      let wx = (px - f.x) * 1.2 + s.vx;
      let wy = (py - f.y) * 1.2;
      let wz = (pz - f.z) * 1.2 + s.vz;
      // Keep a little space from a neighbour
      const n = s.fish[(fi + 1) % s.fish.length];
      const sx = f.x - n.x;
      const sy = f.y - n.y;
      const sz = f.z - n.z;
      const sd = Math.hypot(sx, sy, sz);
      if (sd < 0.6 && sd > 1e-4) {
        wx += (sx / sd) * (0.6 - sd) * 4;
        wy += (sy / sd) * (0.6 - sd) * 4;
        wz += (sz / sd) * (0.6 - sd) * 4;
      }
      const ws = Math.hypot(wx, wy, wz);
      if (ws > f.maxSpeed) {
        wx *= f.maxSpeed / ws;
        wy *= f.maxSpeed / ws;
        wz *= f.maxSpeed / ws;
      }
      f.vx += (wx - f.vx) * follow;
      f.vy += (wy - f.vy) * follow;
      f.vz += (wz - f.vz) * follow;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      // Turn to face where it's swimming, at its own pace; when idling, drift toward the school's heading
      const hs = Math.hypot(f.vx, f.vz);
      const want = hs > 0.25 ? Math.atan2(-f.vx, -f.vz) : f.slotHeading;
      f.heading += clamp(wrapAngle(want - f.heading), -f.turn * dt, f.turn * dt);
      const pitch = clamp(Math.atan2(f.vy, Math.max(hs, 0.3)), -0.5, 0.5);
      fishPos.set(f.x, f.y, f.z);
      fishEuler.set(pitch + Math.sin(t * 0.9 + f.phase) * 0.05, f.heading, 0);
      fishQuat.setFromEuler(fishEuler);
      fishScale.setScalar(f.scale);
      fishMatrix.compose(fishPos, fishQuat, fishScale);
      reefBodies.setMatrixAt(idx, fishMatrix);
      reefTails.setMatrixAt(idx, fishMatrix);
      idx++;
    });
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
    alt: rand(14, 30),
    phase: rand(0, 10),
    dive: -1, // 0..1 while diving for a fish
  });
}

function updateBirds(dt, t, light) {
  const b = state.boat;
  const visible = light > 0.25 && wx.storm < 0.5;
  // The flock flies to the feeding spot and circles over it
  const toX = boil.x - flock.x;
  const toZ = boil.z - flock.z;
  const away = Math.hypot(toX, toZ);
  const step = Math.min(away, 12 * dt);
  if (away > 0.01) {
    flock.x += (toX / away) * step;
    flock.z += (toZ / away) * step;
  }
  const feeding = away < 40;

  for (const bird of birds) {
    bird.g.visible = visible;
    if (!visible) continue;
    bird.angle += bird.angSpeed * dt;
    const dir = Math.sign(bird.angSpeed);
    const x = flock.x + Math.cos(bird.angle) * bird.radius;
    const z = flock.z + Math.sin(bird.angle) * bird.radius;
    let y = bird.alt + Math.sin(t * 0.5 + bird.phase) * 2;
    // Over the fish, now and then a gull folds its wings and plunges in
    if (bird.dive < 0 && feeding && Math.random() < dt * 0.06) bird.dive = 0;
    if (bird.dive >= 0) {
      const before = bird.dive;
      bird.dive += dt / 2.2;
      if (before < 0.5 && bird.dive >= 0.5) splash(x, waveHeight(x, z, t), z, 8, 1.6);
      if (bird.dive >= 1) bird.dive = -1;
      else y = lerp(y, 0.3, Math.sin(Math.PI * bird.dive));
    }
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

// ===== Humpback whale: only comes in close on foggy days =====
const whaleMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0x2c3339, roughness: 0.6 }));
const whalePaleMat = applyUnderwater(new THREE.MeshStandardMaterial({ color: 0xc8ccc8, roughness: 0.7 }));
function buildWhale() {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), whaleMat);
  body.scale.set(1.5, 1.25, 6.5); // about 13 m long, head toward -z
  g.add(body);
  // Long pale flippers, a small dorsal fin
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.15, 0.9), whalePaleMat);
    fin.position.set(side * 2.6, -0.6, -2.4);
    fin.rotation.set(0, side * 0.5, -side * 0.4);
    g.add(fin);
  }
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 6), whaleMat);
  dorsal.position.set(0, 1.2, 2.6);
  dorsal.rotation.x = 0.6;
  g.add(dorsal);
  // Tail stock and flukes on a pivot, so the tail can rise as it dives
  const tail = new THREE.Group();
  tail.position.set(0, 0, 5.6);
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 2.6, 8), whaleMat);
  stock.rotation.x = Math.PI / 2;
  stock.position.z = 1.2;
  const flukes = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.12, 1.3), whaleMat);
  flukes.position.z = 2.6;
  const underside = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.02, 1.1), whalePaleMat);
  underside.position.set(0, -0.07, 2.6);
  tail.add(stock, flukes, underside);
  g.add(tail);
  return { g, tail };
}
const whale = { ...buildWhale(), active: false, timer: 20, x: 0, z: 0, yaw: 0, t: 0, life: 0, y: -12, blow: 0, surfaced: false };
whale.g.visible = false;
scene.add(whale.g);

function updateWhale(dt, t) {
  const b = state.boat;
  const wanted = wx.fog > 0.5 && state.phase === "running";
  if (!whale.active) {
    whale.timer -= dt;
    if (!wanted || whale.timer > 0) return;
    // Somewhere in deep water nearby, just inside the fog
    for (let k = 0; k < 30; k++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(120, 220);
      const x = b.x + Math.cos(a) * r;
      const z = b.z + Math.sin(a) * r;
      if (seaBed(x, z) < -8) {
        Object.assign(whale, { active: true, x, z, yaw: rand(0, Math.PI * 2), t: 0, life: rand(240, 360), y: -12 });
        whale.g.visible = true;
        return;
      }
    }
    whale.timer = 10;
    return;
  }
  // It leaves when the fog lifts or it loses interest, but only while it's down deep
  whale.life -= dt;
  if ((!wanted || whale.life < 0) && !whale.surfaced) {
    whale.active = false;
    whale.g.visible = false;
    whale.timer = rand(60, 120);
    return;
  }
  // Swim slowly, turning away from shallow water
  whale.t += dt;
  const fx = -Math.sin(whale.yaw);
  const fz = -Math.cos(whale.yaw);
  if (seaBed(whale.x + fx * 40, whale.z + fz * 40) > -7) whale.yaw += 0.4 * dt;
  else whale.yaw += Math.sin(whale.t * 0.05) * 0.03 * dt;
  whale.x += fx * 2.2 * dt;
  whale.z += fz * 2.2 * dt;

  // A 44-second rhythm: five breaths at the surface, a dive with the tail raised, a while down deep
  const u = whale.t % 44;
  let depth;
  let pitch = 0;
  let tailLift = 0;
  if (u < 25) {
    depth = -0.75 + 0.35 * Math.sin((u / 5) * Math.PI * 2 - Math.PI / 2); // rolling at the surface
    pitch = 0.05 * Math.cos((u / 5) * Math.PI * 2);
  } else if (u < 31) {
    const d = (u - 25) / 6;
    depth = -0.75 - 9 * d * d;
    pitch = -0.5 * Math.sin(Math.PI * Math.min(d * 1.4, 1));
    tailLift = -1.1 * Math.sin(Math.PI * d); // flukes up
  } else {
    depth = -10;
  }
  whale.surfaced = u < 29;
  // Blow at the start of each breath: a tall column of spray
  for (const at of [0.6, 5.6, 10.6, 15.6, 20.6]) if (u - dt < at && u >= at) {
    whale.blow = 0.7;
    sound.blow(whale.x + fx * 4, whale.z + fz * 4);
  }
  if (whale.blow > 0) {
    whale.blow -= dt;
    splash(whale.x + fx * 4, waveHeight(whale.x, whale.z, t) + 1, whale.z + fz * 4, 3, 7);
  }
  whale.y = waveHeight(whale.x, whale.z, t) + depth;
  whale.g.position.set(whale.x, whale.y, whale.z);
  whale.g.rotation.set(pitch, whale.yaw, 0);
  whale.tail.rotation.x = tailLift;
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
      if (wx.overcast > 0.5 || wx.fog > 0.2) {
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
      flight.speed = rand(65, 85); // slower than real, so it crosses the sky in about 45 s
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
    flight.timer = rand(20, 50);
    airplane.group.visible = false;
  }
}
