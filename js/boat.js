// The player's boat: model, steering, collision, camera.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Boat =====
// An 8.6 m cabin cruiser: a lofted V hull with flared topsides and a rising sheer, a teak foredeck with
// stainless railings and a bow pulpit, a cabin with a raked windshield, a radar arch, and twin outboards.
// Bow toward -Z. The foredeck is where you stand in camera mode (BOAT_EYE).
const BOAT_LEN = { stern: 4.0, bow: -4.6 };
const boatT = (z) => (z - BOAT_LEN.stern) / (BOAT_LEN.bow - BOAT_LEN.stern); // 0 at the stern, 1 at the bow
const boatHalfBeam = (z) => {
  const t = boatT(z);
  return 1.45 * (t < 0.5 ? 1 - 0.06 * t : Math.pow(Math.max(Math.cos(((t - 0.5) / 0.5) * Math.PI * 0.5), 0), 0.75));
};
const boatSheer = (z) => 1.15 + 0.5 * Math.pow(boatT(z), 2.2); // the deck edge rises toward the bow
const boatDeck = (z) => boatSheer(z) - 0.24; // the deck sits a little below the edge, inside a low bulwark
const BOAT_EYE = { x: 0, z: -2.3 };
BOAT_EYE.y = boatDeck(BOAT_EYE.z) + 1.62;

// Teak planking for the deck, drawn once onto a small canvas
function teakTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (!g || !g.fillRect) return null;
  for (let i = 0; i < 16; i++) {
    const tone = 150 + Math.floor(Math.random() * 30);
    g.fillStyle = `rgb(${tone}, ${Math.floor(tone * 0.68)}, ${Math.floor(tone * 0.42)})`;
    g.fillRect(i * 16, 0, 16, 256);
    g.fillStyle = "rgba(40, 28, 18, 0.9)"; // caulked seam
    g.fillRect(i * 16, 0, 2, 256);
    const joint = Math.floor(Math.random() * 256);
    g.fillRect(i * 16, joint, 16, 2); // butt joint
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(90, 60, 35, ${0.1 + Math.random() * 0.15})`; // grain
      g.fillRect(i * 16 + 3 + Math.random() * 11, 0, 1, 256);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildBoat() {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const STATIONS = 26;
  const zAt = (i) => BOAT_LEN.stern + ((BOAT_LEN.bow - BOAT_LEN.stern) * i) / (STATIONS - 1);

  // --- Hull: cross-sections from the stern to the bow, lofted into one surface ---
  const section = (z) => {
    const t = boatT(z);
    const w = Math.max(boatHalfBeam(z), 0.02);
    const s = boatSheer(z);
    const keel = lerp(-0.78, -0.05, smooth(0.62, 1, t)); // the forefoot sweeps up into the stem
    const chine = lerp(-0.05, 0.35, smooth(0.5, 1, t));
    // keel → chine → flared topsides → sheer (one side)
    return [
      [0, keel],
      [0.5 * w, lerp(keel, chine, 0.6)],
      [0.92 * w, chine],
      [1.0 * w, chine + 0.28],
      [1.04 * w, (chine + 0.28 + s) / 2],
      [1.07 * w, s],
    ];
  };
  const hullPos = [];
  const hullCol = [];
  const white = [0.95, 0.95, 0.93];
  const navy = [0.1, 0.17, 0.3];
  const bottom = [0.55, 0.16, 0.14];
  const colorAt = (y) => (y < -0.06 ? bottom : y < 0.22 ? navy : white);
  const ring = []; // per station: points from the port sheer, round the keel, to the starboard sheer
  for (let i = 0; i < STATIONS; i++) {
    const z = zAt(i);
    const half = section(z);
    const pts = [...half.slice().reverse().map(([x, y]) => [-x, y]), ...half.slice(1)];
    ring.push(pts.map(([x, y]) => [x, y, z]));
  }
  const P = ring[0].length;
  const idx = [];
  ring.forEach((pts) => pts.forEach(([x, y, z]) => (hullPos.push(x, y, z), hullCol.push(...colorAt(y)))));
  for (let i = 0; i < STATIONS - 1; i++)
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j;
      idx.push(a, a + P, a + 1, a + 1, a + P, a + P + 1);
    }
  // Transom: close off the stern
  const tc = hullPos.length / 3;
  hullPos.push(0, (ring[0][0][1] + ring[0][P >> 1][1]) / 2, BOAT_LEN.stern);
  hullCol.push(...white);
  for (let j = 0; j < P - 1; j++) idx.push(tc, j + 1, j);
  idx.push(tc, 0, P - 1); // the top of the transom, between the two gunwales
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute("position", new THREE.Float32BufferAttribute(hullPos, 3));
  hullGeo.setAttribute("color", new THREE.Float32BufferAttribute(hullCol, 3));
  hullGeo.setIndex(idx);
  hullGeo.computeVertexNormals();
  const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
  tilt.add(new THREE.Mesh(hullGeo, hullMat));

  // --- Deck: teak, gently crowned, inside the bulwark ---
  const deckPos = [];
  const deckUv = [];
  const deckIdx = [];
  for (let i = 0; i < STATIONS; i++) {
    const z = zAt(i);
    const w = Math.max(boatHalfBeam(z) * 1.02 - 0.05, 0.01);
    const y = boatDeck(z);
    for (const [x, dy] of [[-w, 0], [0, 0.05], [w, 0]]) {
      deckPos.push(x, y + dy, z);
      deckUv.push(x / 2.2, z / 2.2);
    }
  }
  for (let i = 0; i < STATIONS - 1; i++)
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      deckIdx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
    }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute("position", new THREE.Float32BufferAttribute(deckPos, 3));
  deckGeo.setAttribute("uv", new THREE.Float32BufferAttribute(deckUv, 2));
  deckGeo.setIndex(deckIdx);
  deckGeo.computeVertexNormals();
  const teak = teakTexture();
  const deckMat = new THREE.MeshStandardMaterial({ color: teak ? 0xffffff : 0xa47449, map: teak, roughness: 0.75, side: THREE.DoubleSide });
  tilt.add(new THREE.Mesh(deckGeo, deckMat));

  // --- Gunwale rub rails along the sheer ---
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.18, metalness: 0.9 });
  const rubMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5 });
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i < STATIONS; i++) {
      const z = zAt(i);
      pts.push(new THREE.Vector3(side * Math.max(boatHalfBeam(z), 0.02) * 1.07, boatSheer(z), z));
    }
    tilt.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.06, 6, false), rubMat));
  }

  // --- Bow railings: top and middle rails, stanchions, and the pulpit at the bow ---
  const railFrom = -0.4;
  const railTo = BOAT_LEN.bow + 0.35;
  const railPoint = (side, z, h) => {
    const w = Math.max(boatHalfBeam(z) * 1.0 - 0.1, 0.05);
    return new THREE.Vector3(side * w, boatSheer(z) + h, z);
  };
  for (const h of [0.68, 0.36]) {
    const pts = [];
    for (let k = 0; k <= 20; k++) pts.push(railPoint(-1, lerp(railFrom, railTo, k / 20), h));
    for (let k = 20; k >= 0; k--) pts.push(railPoint(1, lerp(railFrom, railTo, k / 20), h));
    tilt.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.025, 6, false), steel));
  }
  for (let z = railFrom; z > railTo; z -= 0.9) {
    for (const side of [-1, 1]) {
      const top = railPoint(side, z, 0.68);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.68 + 0.22, 6), steel);
      post.position.set(top.x, top.y - (0.68 + 0.22) / 2, top.z);
      tilt.add(post);
    }
  }

  // --- Foredeck fittings: anchor locker hatch, anchor on the bow roller, cleats ---
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0.4 });
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 0.6), new THREE.MeshStandardMaterial({ color: 0xe9e8e2, roughness: 0.4 }));
  hatch.position.set(0, boatDeck(-3.3) + 0.07, -3.3);
  tilt.add(hatch);
  const roller = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.7), steel);
  roller.position.set(0, boatSheer(-4.3) + 0.04, -4.35);
  tilt.add(roller);
  const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.32), darkMat);
  anchor.position.set(0, boatSheer(-4.55) - 0.05, -4.62);
  tilt.add(anchor);
  for (const [x, z] of [[-0.75, -1.2], [0.75, -1.2], [-0.35, -3.95], [0.35, -3.95], [-1.25, 3.3], [1.25, 3.3]]) {
    const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.26), steel);
    cleat.position.set(x * Math.min(1, boatHalfBeam(z) / 1.45 + 0.1), boatDeck(z) + 0.06, z);
    tilt.add(cleat);
  }

  // --- Cabin: raked windshield, side windows, a roof that overhangs a little ---
  const cabinW = 2.1;
  const deckY = boatDeck(0.4);
  const prof = new THREE.Shape();
  prof.moveTo(-0.55, 0);
  prof.lineTo(-0.55, 0.55);
  prof.lineTo(0.05, 1.42);
  prof.lineTo(1.75, 1.42);
  prof.lineTo(1.75, 0);
  prof.closePath();
  const cabinGeo = new THREE.ExtrudeGeometry(prof, { depth: cabinW, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  cabinGeo.rotateY(-Math.PI / 2);
  cabinGeo.translate(cabinW / 2, deckY, 0);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xf0efe9, roughness: 0.35 });
  tilt.add(new THREE.Mesh(cabinGeo, cabinMat));
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.08, metalness: 0.3, emissive: 0xffc070, emissiveIntensity: 0 });
  // Windshield: along the raked front face
  const wsLen = Math.hypot(0.6, 0.87);
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(cabinW - 0.3, wsLen * 0.72), windowMat);
  windshield.position.set(0, deckY + 0.98, -0.25 - 0.06);
  windshield.rotation.x = -Math.atan2(0.6, 0.87);
  windshield.rotation.y = Math.PI;
  tilt.add(windshield);
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.42), windowMat);
    win.position.set(side * (cabinW / 2 + 0.056), deckY + 1.0, 0.85);
    win.rotation.y = side * Math.PI * 0.5;
    tilt.add(win);
  }
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe4e2db, roughness: 0.4 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.25, 0.08, 2.0), roofMat);
  roof.position.set(0, deckY + 1.5, 0.82);
  tilt.add(roof);
  // Grab rails on the roof
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.6), steel);
    rail.position.set(side * 0.85, deckY + 1.6, 0.9);
    tilt.add(rail);
  }

  // --- Radar arch over the cockpit, with a radome, antennas and the masthead light ---
  const archZ = 1.9;
  const archPts = [];
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * Math.PI;
    archPts.push(new THREE.Vector3(Math.cos(a) * 1.12, boatSheer(archZ) + Math.sin(a) * 1.9 * (0.85 + 0.15 * Math.sin(a)), archZ));
  }
  tilt.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPts), 40, 0.07, 8, false), cabinMat));
  const archTop = boatSheer(archZ) + 1.9;
  const radome = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 18), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.3 }));
  radome.position.set(0, archTop + 0.12, archZ);
  tilt.add(radome);
  for (const x of [-0.6, 0.6]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
    ant.position.set(x, archTop + 0.6, archZ);
    tilt.add(ant);
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe0a0, emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), lampMat);
  lamp.position.set(0, archTop + 0.45, archZ);
  tilt.add(lamp);
  const lampLight = new THREE.PointLight(0xffd9a0, 0, 30, 2);
  lampLight.position.copy(lamp.position);
  tilt.add(lampLight);

  // --- Cockpit: bench seat, helm seat backs, swim platform and twin outboards ---
  const cushion = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.8 });
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.55), cushion);
  bench.position.set(0, boatDeck(3.4) + 0.21, 3.45);
  tilt.add(bench);
  for (const x of [-0.5, 0.5]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.5), cushion);
    seat.position.set(x, boatDeck(2.1) + 0.42, 2.2);
    tilt.add(seat);
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.55), deckMat);
  platform.position.set(0, 0.32, BOAT_LEN.stern + 0.3);
  tilt.add(platform);
  const cowlMat = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.3, metalness: 0.2 });
  for (const x of [-0.55, 0.55]) {
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.6), cowlMat);
    cowl.position.set(x, 0.95, BOAT_LEN.stern + 0.42);
    tilt.add(cowl);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.22), cowlMat);
    shaft.position.set(x, 0.1, BOAT_LEN.stern + 0.45);
    tilt.add(shaft);
  }

  // --- Life ring on the cabin side, fenders along the cockpit ---
  const ring0 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 20), new THREE.MeshStandardMaterial({ color: 0xff6a1f, roughness: 0.6 }));
  ring0.position.set(cabinW / 2 + 0.09, deckY + 0.55, 1.3);
  ring0.rotation.y = Math.PI / 2;
  tilt.add(ring0);
  for (const side of [-1, 1]) {
    const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }));
    fender.position.set(side * (boatHalfBeam(2.8) * 1.07 + 0.1), boatSheer(2.8) - 0.4, 2.8);
    tilt.add(fender);
  }

  // Navigation lights (brightness is set in applyEnvironment)
  const navLights = [];
  function addNavLight(color, x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat);
    bulb.position.set(x, y, z);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.set(1.0, 1.0, 1);
    glow.position.copy(bulb.position);
    tilt.add(bulb, glow);
    navLights.push({ bulb, mat, glow, color: new THREE.Color(color) });
  }
  addNavLight(0xff2a2a, -(cabinW / 2 + 0.07), deckY + 0.35, -0.3); // port (red)
  addNavLight(0x2aff5a, cabinW / 2 + 0.07, deckY + 0.35, -0.3); // starboard (green)
  addNavLight(0xffffff, 0, archTop + 0.05, archZ + 0.15); // stern (white)

  // Searchlight on the cabin roof
  const headlampMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff2d8, emissiveIntensity: 0 });
  const headlamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.18, 12), headlampMat);
  headlamp.rotation.x = Math.PI / 2;
  headlamp.position.set(0, deckY + 1.65, 0.0);
  tilt.add(headlamp);
  const headlight = new THREE.SpotLight(0xfff2d8, 0, 70, 0.4, 0.5, 1);
  headlight.position.set(0, deckY + 1.65, -0.15);
  headlight.target.position.set(0, -1.5, -25);
  tilt.add(headlight, headlight.target);

  // --- Water mask: an invisible lid at gunwale height. It only writes depth, after the deck is drawn and
  // before the sea, so waves that reach above the deck never show up inside the boat ---
  const maskPos = [];
  const maskIdx = [];
  for (let i = 0; i < STATIONS; i++) {
    const z = zAt(i);
    const w = Math.max(boatHalfBeam(z) - 0.04, 0);
    const y = boatSheer(z) - 0.03;
    maskPos.push(-w, y, z, w, y, z);
    if (i) maskIdx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  }
  const maskGeo = new THREE.BufferGeometry();
  maskGeo.setAttribute("position", new THREE.Float32BufferAttribute(maskPos, 3));
  maskGeo.setIndex(maskIdx);
  const waterMask = new THREE.Mesh(maskGeo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  waterMask.renderOrder = 0.4; // after the boat and the land (0), before the far ocean (0.5) and the water (1)
  tilt.add(waterMask);

  return { root, tilt, windowMat, lamp, lampMat, lampLight, navLights, headlight, headlampMat };
}

const boat = buildBoat();
scene.add(boat.root);

// ===== Boat update =====
const MAX_FORWARD = 20; // m/s
const MAX_REVERSE = -6;
const ACCEL = 9;
const DRAG = 0.35;
const TURN_RATE = 0.9; // rad/s at full steering authority

// How much room the boat has at a point, in metres: negative means blocked
// (water under 1.5 m deep, the coast, a sea stack or the pier)
function clearance(x, z) {
  let c = Math.min(-seaBed(x, z) - 1.5, -inland(x, z) - 3);
  for (const s of seaStacks) c = Math.min(c, Math.hypot(x - s.x, z - s.z) - (s.clear ?? s.r * 1.6 + 3));
  for (const o of SEA_OBSTACLES) c = Math.min(c, Math.hypot(x - o.x, z - o.z) - o.r - 2.5); // buoys, the rig, turbines (offshore.js)
  const pier = Math.max(Math.abs(x - harbor.pierX) - 4, harbor.pierZ0 - z, z - (harbor.pierZ1 + 3));
  return Math.min(c, pier);
}
// Direction in which the clearance grows (toward open water), and how steeply (mag, per metre)
const clearanceVec = { x: 0, z: 1, mag: 0 };
function clearanceDir(x, z) {
  const e = 1;
  const gx = clearance(x + e, z) - clearance(x - e, z);
  const gz = clearance(x, z + e) - clearance(x, z - e);
  const len = Math.hypot(gx, gz);
  clearanceVec.mag = len / (2 * e);
  if (len < 1e-6) {
    clearanceVec.x = 0;
    clearanceVec.z = 1; // default: out to sea
  } else {
    clearanceVec.x = gx / len;
    clearanceVec.z = gz / len;
  }
  return clearanceVec;
}

// In a storm, the open sea beyond this distance from the coast is too rough for an ordinary hull
const SWELL_LIMIT = 450;
// The edge of the map: how far from the coast, and how far along it, the boat may go
const MAX_OFFSHORE = 1300;
const MAX_ALONG = 2600;

function updateBoat(dt, t, controllable) {
  const b = state.boat;
  let throttle = 0;
  let turn = 0;
  if (controllable) {
    throttle = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    turn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    if (touch.active) {
      throttle = touch.throttle;
      turn = touch.turn;
    }
  }
  if (expedition.fuel <= 0) throttle = 0; // engine dead: drift and steer only
  b.throttle = throttle;

  b.speed += throttle * ACCEL * settings.boatSpeed * dt; // (boat speed: menu.js)
  // Water drag; with the throttle off the hull settles quickly, and the last bit of way comes off fast
  b.speed -= b.speed * (throttle === 0 ? 1.4 : DRAG) * dt;
  if (throttle === 0 && Math.abs(b.speed) < 1.5) b.speed *= Math.exp(-3 * dt);
  // In rough seas an ordinary hull has to slow down; the reinforced hull keeps full speed
  const topSpeed = (owned("hull") ? MAX_FORWARD : MAX_FORWARD * (1 - 0.45 * wx.storm)) * settings.boatSpeed;
  b.speed = clamp(b.speed, MAX_REVERSE * settings.boatSpeed, topSpeed);

  // Rudder works best while moving, but the boat can always pivot slowly (so it can turn away from a wall)
  const steer = clamp(b.speed / 6, -1, 1);
  const pivot = Math.abs(steer) < 0.35 ? (b.speed < 0 ? -0.35 : 0.35) : steer;
  b.yaw += turn * TURN_RATE * pivot * dt;

  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  const rx = Math.cos(b.yaw);
  const rz = -Math.sin(b.yaw);

  // Where the boat wants to go this frame: its own motion plus wind drift
  let mx = fx * b.speed * dt;
  let mz = fz * b.speed * dt;
  if (controllable) {
    mx += Math.cos(weather.windAngle) * weather.windSpeed * 0.05 * dt;
    mz += Math.sin(weather.windAngle) * weather.windSpeed * 0.05 * dt;
    // Storm swell: far offshore it drives an ordinary hull back toward the coast (which lies toward -z)
    const over = -inland(b.x, b.z) - SWELL_LIMIT;
    if (!owned("hull") && wx.storm > 0.3 && over > 0) {
      const strength = Math.min(1, over / 80) * wx.storm;
      mz -= strength * 7 * dt;
      b.speed *= 1 - 0.8 * strength * dt;
      if (waveTime - expedition.warnedSwell > 25) {
        expedition.warnedSwell = waveTime;
        toast("⚠️ The storm swell is too heavy out here for your hull. Head back toward the coast (a reinforced hull would handle it).");
      }
    }
    // Past the edge of the map, the sea turns the boat back toward the coast
    const out = -inland(b.x, b.z) - MAX_OFFSHORE;
    const along = Math.abs(b.x) - MAX_ALONG;
    if (out > 0 || along > 0) {
      if (out > 0) mz -= Math.min(1, out / 40) * 14 * dt;
      if (along > 0) mx -= Math.sign(b.x) * Math.min(1, along / 40) * 14 * dt;
      b.speed *= 1 - 1.2 * dt;
      if (waveTime - expedition.warnedEdge > 20) {
        expedition.warnedEdge = waveTime;
        toast("🧭 That's as far as your little boat should go. Turn back toward the coast.");
      }
    }
  }

  // Shallows, cliffs, sea stacks and the pier: slide along them instead of getting stuck
  if (clearance(b.x + mx, b.z + mz) >= 0) {
    b.x += mx;
    b.z += mz;
  } else {
    const g = clearanceDir(b.x + mx, b.z + mz);
    const into = mx * g.x + mz * g.z;
    let nx = b.x + (into < 0 ? mx - g.x * into : mx);
    let nz = b.z + (into < 0 ? mz - g.z * into : mz);
    // On a curved edge the slide lands a hair inside it: nudge it back out onto the edge
    const c = clearance(nx, nz);
    if (c < 0) {
      const g2 = clearanceDir(nx, nz);
      const push = (-c + 0.01) / Math.max(g2.mag, 0.02);
      if (push < 1) {
        nx += g2.x * push;
        nz += g2.z * push;
      }
    }
    if (clearance(nx, nz) >= -0.01) {
      b.x = nx;
      b.z = nz;
      b.speed *= 1 - 1.5 * dt; // scraping along slows you a little
    } else {
      b.speed *= 1 - 4 * dt; // head-on: stop, but don't bounce
    }
  }
  // If the boat is ever inside a blocked spot (waves, wind, spawning), ease it back out to open water
  if (clearance(b.x, b.z) < 0) {
    const g = clearanceDir(b.x, b.z);
    b.x += g.x * 4 * dt;
    b.z += g.z * 4 * dt;
  }

  // Never more than a little past the edge of the map
  const beyond = -inland(b.x, b.z) - MAX_OFFSHORE - 60;
  if (beyond > 0) b.z -= beyond;
  if (Math.abs(b.x) > MAX_ALONG + 60) b.x = Math.sign(b.x) * (MAX_ALONG + 60);

  // Float on the waves: sample bow, stern, port and starboard
  const hBow = waveHeight(b.x + fx * 3.5, b.z + fz * 3.5, t);
  const hStern = waveHeight(b.x - fx * 3.5, b.z - fz * 3.5, t);
  const hRight = waveHeight(b.x + rx * 1.4, b.z + rz * 1.4, t);
  const hLeft = waveHeight(b.x - rx * 1.4, b.z - rz * 1.4, t);

  const targetY = (hBow + hStern + hRight + hLeft) / 4;
  const targetPitch = Math.atan2(hBow - hStern, 7) + b.speed * 0.005;
  const targetRoll = Math.atan2(hRight - hLeft, 2.8) * 0.7 + turn * steer * 0.08;

  const k = 1 - Math.exp(-dt * 4);
  b.y += (targetY - b.y) * k;
  b.pitch += (targetPitch - b.pitch) * k;
  b.roll += (targetRoll - b.roll) * k;

  boat.root.position.set(b.x, b.y, b.z);
  boat.root.rotation.y = b.yaw;
  boat.tilt.rotation.set(b.pitch, 0, b.roll);
}

const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// Orbit camera: drag to rotate around the boat, scroll or pinch to zoom, C to swing back behind it
const ORBIT_DEFAULT = { yaw: 0, pitch: 0.28, dist: 14.6 };
const orbit = { ...ORBIT_DEFAULT, active: 0 };

function updateCamera(dt, snap) {
  if (photo.active) {
    photo.updateView(dt); // camera mode: on the foredeck (photo.js)
    return;
  }
  const b = state.boat;
  const h = b.yaw + orbit.yaw;
  const fx = -Math.sin(h);
  const fz = -Math.cos(h);
  const horiz = orbit.dist * Math.cos(orbit.pitch);
  camDesired.set(b.x - fx * horiz, b.y + 1.5 + orbit.dist * Math.sin(orbit.pitch), b.z - fz * horiz);
  // Never dip under the waves
  camDesired.y = Math.max(camDesired.y, waveHeight(camDesired.x, camDesired.z, shared.uTime.value) + 1.2);
  orbit.active = Math.max(0, orbit.active - dt);
  if (snap) camera.position.copy(camDesired);
  else camera.position.lerp(camDesired, 1 - Math.exp(-dt * (orbit.active > 0 ? 12 : 3)));
  // Look just past the boat; with the camera low, the gaze tilts up so you can see the sky
  camTarget.set(b.x + fx * 4, b.y + 1.5 + Math.max(0, ORBIT_DEFAULT.pitch - orbit.pitch) * 22, b.z + fz * 4);
  camera.lookAt(camTarget);
}

function resetOrbit() {
  Object.assign(orbit, ORBIT_DEFAULT);
  orbit.active = 0.6;
}

// Mouse and touch dragging on the 3D view (the joystick and buttons are separate elements)
const orbitPointers = new Map();
let pinchStart = null;
let dragMoved = 0; // pixels moved during the current press, to tell a tap from a drag
canvas.addEventListener("pointerdown", (e) => {
  orbitPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (orbitPointers.size === 1) dragMoved = 0;
  if (orbitPointers.size === 2) {
    const [a, b] = [...orbitPointers.values()];
    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: orbit.dist };
  }
});
canvas.addEventListener("pointermove", (e) => {
  const prev = orbitPointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  prev.x = e.clientX;
  prev.y = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (photo.active) {
    if (orbitPointers.size === 1) {
      if (e.pointerType !== "mouse") photo.addLook(-dx, -dy); // the mouse aims by itself (photo.js)
    }
    else if (orbitPointers.size === 2 && pinchStart) {
      const [a, b] = [...orbitPointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      photo.zoomBy(Math.pow(dist / Math.max(pinchStart.dist, 1), 0.5));
      pinchStart.dist = dist;
    }
    return;
  }
  if (orbitPointers.size === 1) {
    orbit.yaw -= dx * 0.006;
    orbit.pitch = clamp(orbit.pitch + dy * 0.005, 0.02, 1.35);
  } else if (orbitPointers.size === 2 && pinchStart) {
    const [a, b] = [...orbitPointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    orbit.dist = clamp((pinchStart.zoom * pinchStart.dist) / Math.max(dist, 1), 6, 60);
  }
  orbit.active = 0.5;
});
const endOrbitPointer = (e) => {
  orbitPointers.delete(e.pointerId);
  if (orbitPointers.size < 2) pinchStart = null;
};
canvas.addEventListener("pointerup", endOrbitPointer);
canvas.addEventListener("pointercancel", endOrbitPointer);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (photo.active) return photo.zoomBy(Math.pow(1.0015, -e.deltaY));
    orbit.dist = clamp(orbit.dist * (1 + e.deltaY * 0.001), 6, 60);
    orbit.active = 0.5;
  },
  { passive: false }
);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyC" && !e.repeat) resetOrbit();
});
