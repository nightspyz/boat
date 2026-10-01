// Sea and air traffic.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Sea traffic: sailboats, a tour boat, a ferry, a tanker, the coast guard, and a small plane =====
function hullGeometry(len, beam, height, draft) {
  const s = new THREE.Shape();
  const hl = len / 2;
  const hb = beam / 2;
  s.moveTo(-hb * 0.85, -hl);
  s.lineTo(hb * 0.85, -hl);
  s.lineTo(hb, hl * 0.35);
  s.quadraticCurveTo(hb * 0.9, hl * 0.85, 0, hl);
  s.quadraticCurveTo(-hb * 0.9, hl * 0.85, -hb, hl * 0.35);
  s.lineTo(-hb * 0.85, -hl);
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); // bow toward -Z
  g.translate(0, -draft, 0);
  return g;
}
const hazeMat = (color, extra = {}) => applyHaze(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }));
const glowMat = (color) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0 });
const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

// A white masthead light that shows at night
function mastLight(parent, x, y, z) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([x, y, z], 3));
  const mat = new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, color: 0xfff4dd, transparent: true, opacity: 0, fog: false, depthWrite: false });
  parent.add(new THREE.Points(geo, mat));
  return mat;
}

function buildSailboat() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeometry(9, 2.8, 1.4, 0.6), hazeMat(0xf4f4f0)));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 12, 6), hazeMat(0xcccccc));
  mast.position.set(0, 6.8, -0.8);
  g.add(mast);
  const sailMat = hazeMat(0xfbfaf4, { side: THREE.DoubleSide });
  const tri = (pts) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, sailMat);
  };
  g.add(tri([0, 1.4, -0.7, 0, 12.4, -0.7, 0, 1.6, 3.4])); // mainsail
  g.add(tri([0, 1.4, -1.0, 0, 11.5, -0.9, 0, 1.2, -4.3])); // jib
  return { group: g, light: mastLight(g, 0, 12.9, -0.8) };
}

function buildTourBoat() {
  const g = new THREE.Group();
  const hull = hazeMat(0xf2f2ee);
  for (const side of [-1, 1]) {
    const pontoon = new THREE.Mesh(hullGeometry(15, 1.6, 1.6, 0.8), hull);
    pontoon.position.x = side * 2.6;
    g.add(pontoon);
  }
  g.add(box(6.8, 0.4, 13, hazeMat(0x9c7a55), 0, 1.0, 0.3));
  for (const [x, z] of [[-3, -4], [3, -4], [-3, 5], [3, 5]]) g.add(box(0.12, 2.4, 0.12, hull, x, 2.4, z));
  g.add(box(7, 0.2, 11, hazeMat(0x2fb39a), 0, 3.6, 0.5)); // canopy
  for (let k = 0; k < 8; k++) g.add(box(0.5, 0.7, 0.5, pick(brightMats), rand(-2.5, 2.5), 1.55, rand(-4, 5))); // passengers
  return { group: g, light: mastLight(g, 0, 4.2, -3) };
}

function buildFerry() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeometry(70, 14, 7, 3), hazeMat(0x1f3f6e)));
  g.add(box(13.5, 0.9, 62, hazeMat(0xf4f4f0), 0, 4.4, 2)); // white band above the blue hull
  g.add(box(12, 4, 44, hazeMat(0xf4f4f0), 0, 6.8, 6));
  g.add(box(10, 3.5, 30, hazeMat(0xf4f4f0), 0, 10.5, 8));
  const windows = glowMat(0xffd9a0);
  g.add(box(12.2, 1, 42, windows, 0, 7.2, 6));
  g.add(box(10.2, 1, 28, windows, 0, 10.9, 8));
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 5, 12), hazeMat(0xf4f4f0));
  funnel.position.set(0, 14.5, 18);
  g.add(funnel, box(3.4, 1.4, 3.4, hazeMat(0xc0392b), 0, 16.8, 18));
  return { group: g, light: mastLight(g, 0, 17, -8), windows };
}

function buildTanker() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeometry(180, 30, 10, 7), hazeMat(0x7a2a22)));
  g.add(box(29, 3, 172, hazeMat(0x1c1c1c), 0, 1.6, -2)); // black topsides
  g.add(box(27, 0.4, 160, hazeMat(0x566457), 0, 3.3, -6)); // green deck
  for (let k = 0; k < 8; k++) g.add(box(2, 1.2, 150, hazeMat(0x9aa39a), -8 + (k % 4) * 5, 4, -8)); // pipework
  g.add(box(24, 14, 14, hazeMat(0xf1eee6), 0, 10, 70));
  const windows = glowMat(0xffe0b0);
  g.add(box(24.2, 1.2, 14.2, windows, 0, 14.5, 70));
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 8, 12), hazeMat(0x1c1c1c));
  funnel.position.set(0, 21, 76);
  g.add(funnel);
  return { group: g, light: mastLight(g, 0, 22, 62), windows };
}

// A big white cruise liner: tiers of decks with rows of lit windows, lifeboats, a broad funnel
function buildCruise() {
  const g = new THREE.Group();
  const white = hazeMat(0xf6f5f0);
  g.add(new THREE.Mesh(hullGeometry(150, 26, 10, 6), hazeMat(0x1d2f52)));
  g.add(box(25.5, 3, 140, white, 0, 5.5, 2)); // white upper hull
  const windows = glowMat(0xffe3b0);
  const tiers = [
    [24, 4, 118, 9],
    [22, 4, 108, 13],
    [20, 4, 96, 17],
    [17, 3.5, 70, 20.75],
  ];
  for (const [w, h, d, y] of tiers) {
    g.add(box(w, h, d, white, 0, y, 6));
    g.add(box(w + 0.2, 1, d - 2, windows, 0, y + 0.3, 6));
  }
  g.add(box(25.7, 0.8, 136, windows, 0, 5.5, 2)); // portholes along the hull
  g.add(box(14, 3, 12, hazeMat(0x2b4a7a), 0, 24.5, -36)); // the bridge, up front
  g.add(box(14.2, 1, 12.2, windows, 0, 24.8, -36));
  g.add(box(9, 0.4, 16, hazeMat(0x3fb7d9), 0, 22.7, 22)); // pool on the top deck
  const funnel = box(7, 9, 12, hazeMat(0xc0392b), 0, 28, 40);
  g.add(funnel, box(7.2, 2, 12.2, hazeMat(0x1d2f52), 0, 33.4, 40));
  const orange = hazeMat(0xf08a24);
  for (const side of [-1, 1]) for (let k = 0; k < 10; k++) g.add(box(2.4, 2.2, 7, orange, side * 12.6, 11.5, -40 + k * 9));
  return { group: g, light: mastLight(g, 0, 31, -36), windows };
}

// A container ship stacked with colourful boxes (one instanced mesh for all the containers)
function buildCargo() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeometry(170, 28, 11, 8), hazeMat(0x8a2a24)));
  g.add(box(27.5, 3, 160, hazeMat(0x1d2a3a), 0, 2.2, 0)); // dark blue topsides
  const colors = [0xb83a2e, 0x2f6aa8, 0x3f8f4a, 0xe08a2c, 0x8e9499, 0xe6c64a, 0x6b3e8a, 0xf2f2ee];
  const slots = [];
  for (let bay = 0; bay < 11; bay++)
    for (let col = 0; col < 9; col++) {
      const tiers = 2 + Math.floor(Math.random() * 4);
      for (let t = 0; t < tiers; t++) slots.push([-10 + col * 2.5, 5.1 + t * 2.6, -68 + bay * 12.8]);
    }
  const cont = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 2.5, 12.2), hazeMat(0xffffff), slots.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  slots.forEach(([x, y, z], i) => {
    m.makeTranslation(x, y, z);
    cont.setMatrixAt(i, m);
    cont.setColorAt(i, c.setHex(colors[Math.floor(Math.random() * colors.length)]).multiplyScalar(0.85 + Math.random() * 0.25));
  });
  cont.instanceMatrix.needsUpdate = true;
  if (cont.instanceColor) cont.instanceColor.needsUpdate = true;
  g.add(cont);
  g.add(box(26, 16, 12, hazeMat(0xf1eee6), 0, 11, 75)); // accommodation block at the stern
  const windows = glowMat(0xffe0b0);
  g.add(box(26.2, 1.2, 12.2, windows, 0, 16.5, 75));
  g.add(box(30, 1, 6, hazeMat(0xf1eee6), 0, 19.5, 72)); // bridge wings
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 9, 12), hazeMat(0x1d2a3a));
  funnel.position.set(0, 23, 80);
  g.add(funnel);
  return { group: g, light: mastLight(g, 0, 24, 68), windows };
}

function buildCoastGuard() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeometry(16, 4.4, 2.4, 0.9), hazeMat(0xf4f4f0)));
  const stripe = box(4.5, 0.6, 2.2, hazeMat(0xd9342b), 0, 0.8, -3);
  stripe.rotation.y = 0.5;
  g.add(stripe, box(3.4, 2.2, 5, hazeMat(0x9aa3ab), 0, 2.6, 1.5));
  const blue = glowMat(0x3b8bff);
  const red = glowMat(0xff3b3b);
  g.add(box(0.8, 0.3, 0.4, blue, -0.5, 3.9, 1), box(0.8, 0.3, 0.4, red, 0.5, 3.9, 1));
  return { group: g, light: mastLight(g, 0, 5, 1.5), blue, red };
}

function buildSmallPlane() {
  const g = new THREE.Group();
  const white = hazeMat(0xf4f4f0);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.35, 8, 10), white);
  body.rotation.x = Math.PI / 2;
  g.add(body, box(11, 0.2, 1.6, hazeMat(0xd9342b), 0, 0.5, -0.8), box(3.6, 0.15, 1, white, 0, 0.2, 3.6), box(0.15, 1.4, 1, white, 0, 0.8, 3.7));
  const prop = box(0.1, 2, 0.12, hazeMat(0x333333), 0, 0, -4.1);
  g.add(prop);
  return { group: g, prop };
}

// Routes are loops (ellipses) or straight lines sailed back and forth; all stay in open, deep water
const vessels = [];
function addVessel(type, model, route, speed, bob = 1) {
  model.group.rotation.order = "YXZ";
  scene.add(model.group);
  vessels.push({ type, ...model, route, speed, bob, s: Math.random() * 1000, x: 0, z: 0, yaw: 0 });
}
addVessel("sailboat", buildSailboat(), { kind: "loop", cx: -500, cz: -650, rx: 180, rz: 90 }, 1.8);
addVessel("sailboat", buildSailboat(), { kind: "loop", cx: 700, cz: -450, rx: 250, rz: 120 }, 2);
addVessel("sailboat", buildSailboat(), { kind: "loop", cx: -1500, cz: -400, rx: 200, rz: 100 }, 1.6);
addVessel("tourboat", buildTourBoat(), { kind: "loop", cx: 380, cz: -700, rx: 170, rz: 140 }, 2.2);
addVessel("ferry", buildFerry(), { kind: "line", ax: -3300, az: -250, bx: 3300, bz: -150 }, 4, 0.4);
addVessel("tanker", buildTanker(), { kind: "line", ax: 3600, az: 500, bx: -3600, bz: 700 }, 2.5, 0.15);
addVessel("cruise", buildCruise(), { kind: "line", ax: -3400, az: 260, bx: 3400, bz: 160 }, 3, 0.12);
addVessel("cargo", buildCargo(), { kind: "line", ax: 3500, az: 420, bx: -3500, bz: 340 }, 3.5, 0.1);
addVessel("coastguard", buildCoastGuard(), { kind: "line", ax: -1800, az: -850, bx: 1800, bz: -800 }, 5);
const smallPlane = buildSmallPlane();
smallPlane.group.rotation.order = "YXZ";
scene.add(smallPlane.group);
const planeRoute = { cx: 0, cz: -600, r: 1200, alt: 170, a: 0 };

// Position and heading along a route at distance s travelled
function routePoint(route, s) {
  if (route.kind === "loop") {
    const a = s / ((route.rx + route.rz) / 2);
    return { x: route.cx + Math.cos(a) * route.rx, z: route.cz + Math.sin(a) * route.rz, vx: -Math.sin(a) * route.rx, vz: Math.cos(a) * route.rz };
  }
  const len = Math.hypot(route.bx - route.ax, route.bz - route.az);
  const u = s % (2 * len);
  const back = u > len;
  const f = back ? 2 - u / len : u / len;
  const dir = back ? -1 : 1;
  return { x: lerp(route.ax, route.bx, f), z: lerp(route.az, route.bz, f), vx: (route.bx - route.ax) * dir, vz: (route.bz - route.az) * dir };
}

function updateTraffic(dt, t, env) {
  for (const v of vessels) {
    v.s += v.speed * dt;
    const p = routePoint(v.route, v.s);
    v.x = p.x;
    v.z = p.z;
    v.yaw = Math.atan2(-p.vx, -p.vz);
    const h = waveHeight(p.x, p.z, t);
    v.group.position.set(p.x, h * v.bob, p.z);
    v.group.rotation.set(Math.sin(t * 0.7 + v.s) * 0.04 * v.bob, v.yaw, (v.type === "sailboat" ? 0.18 : 0) + Math.sin(t * 0.9 + v.s) * 0.05 * v.bob);
    if (v.light) v.light.opacity = env.lampsOn * (1 - 0.85 * wx.fog);
    if (v.windows) v.windows.emissiveIntensity = 1.4 * env.lampsOn;
    if (v.blue) {
      const flash = Math.floor(t * 3) % 2;
      v.blue.emissiveIntensity = flash ? 3 : 0.2;
      v.red.emissiveIntensity = flash ? 0.2 : 3;
    }
  }
  // Small plane circling the bay
  planeRoute.a += (28 / planeRoute.r) * dt; // slow, so it stays in view a while
  const a = planeRoute.a;
  smallPlane.group.position.set(planeRoute.cx + Math.cos(a) * planeRoute.r, planeRoute.alt, planeRoute.cz + Math.sin(a) * planeRoute.r);
  smallPlane.group.rotation.set(0, Math.atan2(Math.sin(a), -Math.cos(a)), -0.25);
  smallPlane.prop.rotation.z += dt * 40;
  smallPlane.group.visible = env.light > 0.3 && wx.storm < 0.5 && wx.fog < 0.3;

  // Town lights at night
  cityLights.value = env.lampsOn;
  town.lightMat.opacity = env.lampsOn * (1 - 0.85 * wx.fog);
}
