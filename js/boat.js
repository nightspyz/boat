// The player's boat: model, steering, collision, camera.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Boat =====
function buildBoat() {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);

  // Top-down hull outline; after rotation the bow points to -Z
  const outline = new THREE.Shape();
  outline.moveTo(-1.3, -3.8);
  outline.lineTo(1.3, -3.8);
  outline.lineTo(1.5, 0.8);
  outline.quadraticCurveTo(1.3, 3.0, 0, 4.4);
  outline.quadraticCurveTo(-1.3, 3.0, -1.5, 0.8);
  outline.lineTo(-1.3, -3.8);

  const hullGeo = new THREE.ExtrudeGeometry(outline, {
    depth: 1.5,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.15,
    bevelSegments: 2,
    curveSegments: 12,
  });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, -0.7, 0);
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }));
  tilt.add(hull);

  const stripeGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.25, bevelEnabled: false, curveSegments: 12 });
  stripeGeo.rotateX(-Math.PI / 2);
  stripeGeo.scale(1.15, 1, 1.06);
  stripeGeo.translate(0, 0.1, 0);
  tilt.add(new THREE.Mesh(stripeGeo, new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 })));

  const deckGeo = new THREE.ShapeGeometry(outline, 12);
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.scale(0.92, 1, 0.94);
  deckGeo.translate(0, 0.98, 0);
  tilt.add(new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.8 })));

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 1.3, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.6 })
  );
  cabin.position.set(0, 1.63, 0.9);
  tilt.add(cabin);

  const windowMat = new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.2, emissive: 0xffc070, emissiveIntensity: 0 });
  const windows = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.45, 2.24), windowMat);
  windows.position.set(0, 1.85, 0.9);
  tilt.add(windows);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.12, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x1f3a5f, roughness: 0.6 })
  );
  roof.position.set(0, 2.34, 0.9);
  tilt.add(roof);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.5 })
  );
  mast.position.set(0, 3.1, 1.4);
  tilt.add(mast);

  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe0a0, emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), lampMat);
  lamp.position.set(0, 3.85, 1.4);
  tilt.add(lamp);

  const lampLight = new THREE.PointLight(0xffd9a0, 0, 30, 2);
  lampLight.position.copy(lamp.position);
  tilt.add(lampLight);

  // Navigation lights (brightness is set in applyEnvironment)
  const navLights = [];
  function addNavLight(color, x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat);
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
    glow.scale.set(1.2, 1.2, 1);
    glow.position.copy(bulb.position);
    tilt.add(bulb, glow);
    navLights.push({ bulb, mat, glow, color: new THREE.Color(color) });
  }
  addNavLight(0xff2a2a, -1.06, 1.7, -0.15); // port (red)
  addNavLight(0x2aff5a, 1.06, 1.7, -0.15); // starboard (green)
  addNavLight(0xffffff, 0, 1.15, 3.9); // stern (white)

  // Forward searchlight on the cabin roof
  const headlampMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff2d8, emissiveIntensity: 0 });
  const headlamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.15), headlampMat);
  headlamp.position.set(0, 2.5, -0.35);
  tilt.add(headlamp);
  const headlight = new THREE.SpotLight(0xfff2d8, 0, 70, 0.4, 0.5, 1);
  headlight.position.set(0, 2.5, -0.45);
  headlight.target.position.set(0, -1.5, -25);
  tilt.add(headlight, headlight.target);

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

  b.speed += throttle * ACCEL * dt;
  b.speed -= b.speed * DRAG * dt;
  // In rough seas an ordinary hull has to slow down; the reinforced hull keeps full speed
  const topSpeed = owned("hull") ? MAX_FORWARD : MAX_FORWARD * (1 - 0.45 * wx.storm);
  b.speed = clamp(b.speed, MAX_REVERSE, topSpeed);

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
    orbit.dist = clamp(orbit.dist * (1 + e.deltaY * 0.001), 6, 60);
    orbit.active = 0.5;
  },
  { passive: false }
);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyC" && !e.repeat) resetOrbit();
});
