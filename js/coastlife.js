// Life on the beaches and in the night sky: beach camps with tents (and campfires after dark),
// horse riders on the harbor beach, shooting stars and, some nights, a comet.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

const beachPoint = (x, d) => {
  const z = shoreZAt(x) - d;
  return { x, z, y: Math.max(landHeight(x, z), 0) };
};

// ===== Beach camps: tents, a stone fire ring, and at night a campfire with people round it =====
const CAMP_XS = [-430, 620, -2420];
const tentColors = [0xe0702a, 0x3f7a4a, 0x2f5d9e, 0xd8c23a, 0xb8322a];
const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const flameCore = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const camps = CAMP_XS.map((x, ci) => {
  const g = new THREE.Group();
  const c = beachPoint(x, 34);
  g.position.set(c.x, c.y, c.z);
  // Two or three tents
  for (let k = 0; k < 2 + (ci % 2); k++) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.7, 4), applyHaze(new THREE.MeshStandardMaterial({ color: tentColors[(ci * 2 + k) % tentColors.length], roughness: 0.8 })));
    tent.scale.set(1, 1, 1.5);
    tent.position.set(-4 + k * 3.6, 0.85, -4 - (k % 2) * 1.5);
    tent.rotation.y = Math.PI / 4 + k * 0.3;
    g.add(tent);
  }
  // Fire ring and logs
  const stone = applyHaze(new THREE.MeshStandardMaterial({ color: 0x8a847a, roughness: 1 }));
  for (let k = 0; k < 8; k++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), stone);
    s.position.set(Math.cos(k * 0.785) * 0.6, 0.08, Math.sin(k * 0.785) * 0.6);
    g.add(s);
  }
  const logMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }));
  for (let k = 0; k < 3; k++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6), logMat);
    log.rotation.set(Math.PI / 2 - 0.35, k * 2.1, 0);
    log.position.y = 0.2;
    g.add(log);
  }
  // The fire itself (night only)
  const fire = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 8), flameMat);
  outer.position.y = 0.7;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 8), flameCore);
  inner.position.y = 0.5;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffa050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(7);
  glow.position.y = 0.9;
  const light = new THREE.PointLight(0xffa050, 0, 40, 2);
  light.position.y = 1.2;
  fire.add(outer, inner, glow, light);
  // Embers drifting up
  const EMB = 24;
  const emb = new Float32Array(EMB * 3);
  const embGeo = new THREE.BufferGeometry();
  embGeo.setAttribute("position", new THREE.BufferAttribute(emb, 3));
  const embers = new THREE.Points(embGeo, new THREE.PointsMaterial({ color: 0xffb060, size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fire.add(embers);
  // People sitting round it
  const people = new THREE.Group();
  const skin = [0xc99272, 0x8a5a3c, 0xe0b090];
  const shirt = [0x2f5d9e, 0xb8322a, 0x3f7a4a, 0x6b3e8a];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.4;
    const p = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.6, 8), applyHaze(new THREE.MeshStandardMaterial({ color: shirt[(ci + k) % shirt.length] })));
    body.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), applyHaze(new THREE.MeshStandardMaterial({ color: skin[k % 3] })));
    head.position.y = 0.9;
    p.add(body, head);
    p.position.set(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
    p.rotation.y = -a + Math.PI / 2;
    people.add(p);
  }
  g.add(fire, people);
  scene.add(g);
  return { g, x: c.x, y: c.y, z: c.z, fire, outer, inner, glow, light, emb, embGeo, people, embT: new Float32Array(EMB).map(() => Math.random()) };
});
let campfiresLit = false;
function updateCamps(dt, t, env) {
  campfiresLit = env.lightLevel < 0.3 && wx.rain < 0.5 && wx.storm < 0.3;
  const b = state.boat;
  for (const c of camps) {
    c.fire.visible = campfiresLit;
    c.people.visible = campfiresLit;
    if (!campfiresLit || Math.hypot(c.x - b.x, c.z - b.z) > 1500) continue;
    const f = 0.85 + 0.15 * Math.sin(t * 11 + c.x) * Math.sin(t * 7.3);
    c.outer.scale.set(f, 0.8 + 0.4 * Math.random(), f);
    c.inner.scale.set(f, 0.9 + 0.3 * Math.random(), f);
    c.light.intensity = 2.2 * f;
    c.glow.material.opacity = 0.7 + 0.3 * f;
    for (let i = 0; i < c.embT.length; i++) {
      c.embT[i] = (c.embT[i] + dt * 0.4) % 1;
      const u = c.embT[i];
      c.emb[i * 3] = Math.sin(i * 7.1 + t * 0.7) * 0.4 * u;
      c.emb[i * 3 + 1] = 0.6 + u * 4;
      c.emb[i * 3 + 2] = Math.cos(i * 3.3 + t * 0.6) * 0.4 * u;
    }
    c.embGeo.attributes.position.needsUpdate = true;
  }
}

// ===== Horse riders on the harbor beach =====
const HORSE_COLORS = [0x6b3f22, 0xe8e2d6, 0x2a2420];
function buildHorse(color, rider) {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  const mat = applyHaze(new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  const dark = applyHaze(new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 0.8 }));
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
  body.scale.set(0.42, 0.5, 1.05);
  body.position.y = 1.45;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.28, 0.95, 8), mat);
  neck.position.set(0, 1.95, -0.95);
  neck.rotation.x = -0.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.62), mat);
  head.position.set(0, 2.3, -1.38);
  head.rotation.x = 0.45;
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.9), dark);
  mane.position.set(0, 2.15, -0.9);
  mane.rotation.x = -0.6;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 6), dark);
  tail.position.set(0, 1.4, 1.15);
  tail.rotation.x = -2.6;
  g.add(body, neck, head, mane, tail);
  const legs = [];
  for (const [lx, lz] of [[-0.22, -0.7], [0.22, -0.7], [-0.22, 0.7], [0.22, 0.7]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 1.25, lz);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 1.25, 6).translate(0, -0.62, 0), mat);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 6), dark);
    hoof.position.y = -1.22;
    pivot.add(leg, hoof);
    g.add(pivot);
    legs.push(pivot);
  }
  if (rider) {
    const coat = applyHaze(new THREE.MeshStandardMaterial({ color: [0x2f5d9e, 0xb8322a, 0xe0b23a][Math.floor(Math.random() * 3)] }));
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 0.26), coat);
    torso.position.set(0, 2.25, -0.1);
    const head2 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), applyHaze(new THREE.MeshStandardMaterial({ color: 0xc99272 })));
    head2.position.set(0, 2.72, -0.12);
    g.add(torso, head2);
  }
  scene.add(g);
  return { g, legs };
}
const HORSE_PATH = { x0: -500, x1: -60, d: 13 };
const horses = HORSE_COLORS.map((c, i) => ({ ...buildHorse(c, i !== 1), off: i * 3.2, side: i * 1.6 - 1.6, ph: i * 1.3 }));
const ride = { s: 0, dir: 1, speed: 2, canter: 0, yaw: -Math.PI / 2 };
let horsesOut = false;
function updateHorses(dt, t, env) {
  horsesOut = env.lightLevel > 0.4 && wx.storm < 0.4 && wx.rain < 0.6;
  for (const h of horses) h.g.visible = horsesOut;
  if (!horsesOut) return;
  // Walk, now and then break into a canter; turn round at each end of the beach
  if (Math.random() < dt * 0.05) ride.canter = ride.canter ? 0 : 1;
  const target = ride.canter ? 6 : 1.8;
  ride.speed += (target - ride.speed) * Math.min(1, dt * 0.8);
  const len = HORSE_PATH.x1 - HORSE_PATH.x0;
  ride.s += ride.dir * ride.speed * dt;
  if (ride.s > len) ride.dir = -1;
  if (ride.s < 0) ride.dir = 1;
  const wantYaw = ride.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  ride.yaw += wrapAngle(wantYaw - ride.yaw) * Math.min(1, dt * 1.5);
  const gait = ride.canter ? 9 : 5;
  for (const h of horses) {
    const x = clamp(HORSE_PATH.x0 + ride.s - ride.dir * h.off, HORSE_PATH.x0 - 5, HORSE_PATH.x1 + 5);
    const p = beachPoint(x, HORSE_PATH.d + h.side);
    const bob = Math.abs(Math.sin(t * gait + h.ph)) * (ride.canter ? 0.18 : 0.05);
    h.g.position.set(p.x, p.y + bob, p.z);
    h.g.rotation.y = ride.yaw;
    const sw = (ride.canter ? 0.65 : 0.35) * Math.sin(t * gait + h.ph);
    h.legs[0].rotation.x = sw;
    h.legs[3].rotation.x = sw;
    h.legs[1].rotation.x = -sw;
    h.legs[2].rotation.x = -sw;
  }
}

// ===== Shooting stars =====
const METEOR_R = 2400;
const meteors = [0, 1, 2].map(() => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1, 0, 0, 0], 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  line.frustumCulled = false;
  line.visible = false;
  line.renderOrder = -0.5;
  scene.add(line);
  return { line, geo, life: 0, max: 1, dir: new THREE.Vector3(), vel: new THREE.Vector3(), seen: 0 };
});
let meteorTimer = 5;
const mTmp = new THREE.Vector3();
function updateMeteors(dt) {
  const dark = shared.uStars.value;
  const shower = expedition.day % 3 === 0; // every third night there's a meteor shower
  meteorTimer -= dt;
  if (dark > 0.5 && meteorTimer <= 0) {
    meteorTimer = shower ? rand(0.8, 3.5) : rand(6, 18);
    const m = meteors.find((q) => q.life <= 0);
    if (m) {
      const az = rand(0, Math.PI * 2);
      const el = rand(0.35, 1.1);
      m.dir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      m.vel.set(rand(-1, 1), rand(-0.9, -0.3), rand(-1, 1)).normalize().multiplyScalar(rand(0.25, 0.45));
      m.life = m.max = rand(0.6, 1.3);
      m.seen = 2.5; // stays in the journal's sights a moment longer than it shows
      m.line.visible = true;
    }
  }
  for (const m of meteors) {
    m.seen -= dt;
    if (m.life <= 0) {
      m.line.visible = false;
      continue;
    }
    m.life -= dt;
    m.dir.addScaledVector(m.vel, dt).normalize();
    const u = 1 - m.life / m.max; // 0 → 1 over its life
    const len = 0.04 + 0.08 * Math.sin(Math.PI * u);
    const p = m.geo.attributes.position;
    const head = mTmp.copy(m.dir).multiplyScalar(METEOR_R).add(camera.position);
    p.setXYZ(0, head.x, head.y, head.z);
    const tail = mTmp.copy(m.dir).addScaledVector(m.vel, -len / 0.35).normalize().multiplyScalar(METEOR_R).add(camera.position);
    p.setXYZ(1, tail.x, tail.y, tail.z);
    p.needsUpdate = true;
    const bright = Math.sin(Math.PI * u) * dark;
    const c = m.geo.attributes.color;
    c.setXYZ(0, bright, bright, bright * 0.95);
    c.needsUpdate = true;
  }
}

// ===== A comet, some nights, hanging over the sea with its tail streaming away =====
const cometTex = (() => {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const g = cv.getContext("2d");
  if (!g || !g.createLinearGradient) return null;
  const tail = g.createLinearGradient(40, 0, 512, 0);
  tail.addColorStop(0, "rgba(220,235,255,0.75)");
  tail.addColorStop(0.4, "rgba(170,200,255,0.25)");
  tail.addColorStop(1, "rgba(150,180,255,0)");
  g.fillStyle = tail;
  g.beginPath();
  g.moveTo(40, 64);
  g.quadraticCurveTo(300, 20, 512, 10);
  g.lineTo(512, 118);
  g.quadraticCurveTo(300, 108, 40, 64);
  g.fill();
  const head = g.createRadialGradient(44, 64, 0, 44, 64, 28);
  head.addColorStop(0, "rgba(255,255,255,1)");
  head.addColorStop(0.3, "rgba(220,240,255,0.7)");
  head.addColorStop(1, "rgba(200,220,255,0)");
  g.fillStyle = head;
  g.fillRect(0, 30, 90, 70);
  return new THREE.CanvasTexture(cv);
})();
const comet = new THREE.Sprite(new THREE.SpriteMaterial({ map: cometTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
comet.scale.set(900, 225, 1);
comet.material.rotation = 0.5;
comet.visible = false;
comet.renderOrder = -0.5;
scene.add(comet);
const COMET_DIR = new THREE.Vector3(0.45, 0.32, 0.83).normalize(); // high over the sea to the south-east
const cometNight = () => expedition.day % 4 === 2;
function updateComet() {
  const show = cometNight() && shared.uStars.value > 0.3;
  comet.visible = show;
  if (!show) return;
  comet.position.copy(COMET_DIR).multiplyScalar(3000).add(camera.position);
  comet.material.opacity = shared.uStars.value;
}

function updateCoastLife(dt, t, env) {
  updateCamps(dt, t, env);
  updateHorses(dt, t, env);
  updateMeteors(dt);
  updateComet();
}

function addCoastLifeSights(add, env) {
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const c of camps) {
    add("tents", at(c.x, c.y + 1, c.z), 500);
    if (campfiresLit) add("campfire", at(c.x, c.y + 0.8, c.z), 900, { lit: true });
  }
  if (horsesOut) add("horses", horses[0].g.position.clone().setY(horses[0].g.position.y + 1.5), 450);
  for (const m of meteors) if (m.seen > 0) add("meteor", m.dir.clone().multiplyScalar(METEOR_R).add(camera.position), Infinity, { lit: true });
  if (comet.visible) add("comet", comet.position.clone(), Infinity, { lit: true });
}
