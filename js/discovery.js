// Toasts, spotting and photographing (visibility rules), journal screen, sonar and diving.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ---- Notifications ----
function toast(text, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = text;
  toastsEl.appendChild(el);
  while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 700);
  }, 3500);
}

// ---- What can be seen from the boat right now ----
const camForward = new THREE.Vector3();
const projected = new THREE.Vector3();

// Screen position of a world point, or null if it's behind the camera
function toScreen(pos) {
  camera.getWorldDirection(camForward);
  if (tmpVec.copy(pos).sub(camera.position).dot(camForward) <= 0) return null;
  return projected.copy(pos).project(camera);
}

// Everything that could be spotted or photographed right now, with how it can be seen:
//   fog:   fades out in the sea haze (so rain and fog shorten how far away you can see it)
//   under: underwater (only visible through the water in daylight)
//   lit:   gives off its own light, so it can be seen at night
//   no pos: all around you (stars, rain, storm)
function currentSightings(env) {
  const b = state.boat;
  const list = [];
  const add = (id, pos, range, flags = {}) => list.push({ id, pos, range, ...flags });
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  const FOG = { fog: true };
  const UNDER = { fog: true, under: true };

  if (birds[0].g.visible) add("gulls", at(flock.x, 25, flock.z), 400, FOG);
  if (whale.active && whale.surfaced) add("whale", at(whale.x, whale.y + 1.2, whale.z), 600, FOG);
  for (const f of fishes) if (f.active) add("flyingfish", f.mesh.position.clone(), 160, FOG);
  for (const d of dolphins) if (d.active && d.mesh.position.y > waveHeight(d.x, d.z, shared.uTime.value) - 2) add("dolphins", d.mesh.position.clone(), 350, FOG);
  if (reefBodies.visible) for (const s of schools) add("reeffish", at(s.x, s.y, s.z), 45, UNDER);

  add("harbor", at(harbor.pierX, 2, (harbor.pierZ0 + harbor.pierZ1) / 2), 600, { fog: true, lit: true });
  // (from the drone, things are judged from where the drone is, not the boat)
  const vx = photo.droneMode ? camera.position.x : b.x;
  if (cliffAmount(vx) > 0.7) add("cliffs", at(vx, 15, shoreZAt(vx) - Math.max(cliffLine(vx) - 4, 1)), 400); // on the rock face
  add("lighthouse", lighthouse.group.position.clone().setY(lighthouse.group.position.y + 20), 900, { lit: true });
  for (const s of seaStacks) if (s.group === "lighthouse") add("stacks", at(s.x, 15, s.z), 500);
  for (const s of seaStacks) if (s.group === "sisters") add("sisters", at(s.x, s.h * 0.5, s.z), 650);
  add("arch", at(ARCH.x, ARCH.H0 + ARCH.R, ARCH.z), 650);
  add("hiddencove", at(HIDDEN_COVE.x, 2, HIDDEN_COVE.z), 550);
  add("waterfall", at(WATERFALL.x, (WATERFALL.foot.y + WATERFALL.top.y) / 2, WATERFALL.z + 3), 800);
  for (const g of GROTTOES) add("grottoes", at(g.x, 2.2, g.z), 550);
  add("bridge", at(BRIDGE.x, BRIDGE.y - 4, BRIDGE.z), 700);

  // The reef has to be in view: look at the sea floor ahead of the boat
  let rx;
  let rz;
  let reefRange = 40;
  if (photo.droneMode) {
    // From the drone: wherever the camera is looking down onto the water
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const t = dir.y < -0.05 ? Math.min(-camera.position.y / dir.y, 150) : 30;
    rx = camera.position.x + dir.x * t;
    rz = camera.position.z + dir.z * t;
    reefRange = 160;
  } else {
    rx = b.x - Math.sin(b.yaw) * 18;
    rz = b.z - Math.cos(b.yaw) * 18;
  }
  if (inland(rx, rz) > -170 && cliffAmount(rx) > 0.5 && seaBed(rx, rz) < -2) add("reef", at(rx, seaBed(rx, rz), rz), reefRange, UNDER);

  add("wreck", at(WRECK.x, WRECK.y + 2, WRECK.z), 70, UNDER);
  add("sailboat", at(SAILBOAT.x, SAILBOAT.y + 1, SAILBOAT.z), 60, UNDER);
  add("freighter", at(FREIGHTER.x, 2, FREIGHTER.z), 800, FOG);
  add("temple", at(TEMPLE.x, TEMPLE.y + 3, TEMPLE.z), 60, UNDER);
  add("colossus", at(COLOSSUS.x, COLOSSUS.y + 1, COLOSSUS.z), 50, UNDER);
  const pI = ISLAND.palm;
  const sI = ISLAND.seal;
  const gI = ISLAND.goat;
  add("palmislet", at(pI.x, 4, pI.z), 900);
  add("sealrock", at(sI.x, 3, sI.z), 900);
  add("goatisland", at(gI.x, 10, gI.z), 1200);
  const gTop = islandSummit(gI);
  add("ruins", at(gTop.x, gTop.y + 3, gTop.z), 550, { minor: true }); // background: the statue in front of it wins
  add("watcher", at(gTop.x, gTop.y + 7, gTop.z), 550); // the statue's chest
  for (const s of seals) add("seals", s.g.position.clone().setY(s.g.position.y + 0.5), 350);
  for (const g of goats) add("goats", g.g.position.clone().setY(g.g.position.y + 0.8), 320);
  for (const tu of turtles) add("turtles", tu.g.position.clone(), 45, UNDER);
  if (env.lampsOn > 0.5) add("glow", at(GLOW.x, GLOW.y, GLOW.z), 350, { lit: true });
  if (flight.active) add("airliner", airplane.group.position.clone(), 2600, { lit: true });

  // Boats, the sightseeing plane, and people at the cove
  const LIT_SHIPS = { ferry: true, tanker: true, coastguard: true, cruise: true, cargo: true };
  const SHIP_RANGE = { sailboat: 1000, tourboat: 900, ferry: 1800, tanker: 2400, coastguard: 1300, cruise: 2600, cargo: 2500 };
  const SHIP_ID = { sailboat: "sailboats", tourboat: "tourboat", ferry: "ferry", tanker: "tanker", coastguard: "coastguard", cruise: "cruise", cargo: "cargoship" };
  for (const v of vessels) {
    add(SHIP_ID[v.type], at(v.x, v.type === "tanker" ? 10 : 3, v.z), SHIP_RANGE[v.type], { lit: !!LIT_SHIPS[v.type] });
  }
  if (smallPlane.group.visible) add("smallplane", smallPlane.group.position.clone(), 2200);
  for (const s of swimmers) if (s.g.visible) add("swimmers", s.g.position.clone().setY(s.g.position.y + 0.25), 260);
  for (const s of surfers) if (s.g.visible) add("surfers", s.g.position.clone().setY(s.g.position.y + 1), 380);
  for (const g of sunbathers) if (g.visible) add("sunbathers", g.position.clone().setY(g.position.y + 1), 400);

  // The town, and its lights after dark; the river mouths and the swamp between them
  const townY = landHeight(TOWN_CENTER.x, TOWN_CENTER.z);
  add("town", at(TOWN_CENTER.x, townY + 10, TOWN_CENTER.z), 1200);
  if (env.lampsOn > 0.5) add("townlights", at(TOWN_CENTER.x, townY + 8, TOWN_CENTER.z), 2500, { lit: true });
  add("delta", at(800, 1.5, shoreZAt(800) - 20), 900);
  add("swamp", at(SWAMP.x, 2, SWAMP.z), 650);

  // Sunset: you have to be looking toward the sun. Aurora: toward the northern sky.
  const cam = camera.position;
  const e = shared.uSunDir.value.y;
  if (e > -0.03 && e < 0.12 && wx.overcast < 0.5) {
    add("sunset", cam.clone().addScaledVector(shared.uSunDir.value, 800), Infinity, { lit: true });
  }
  if (shared.uAurora.value > 0.35) {
    add("aurora", cam.clone().add(new THREE.Vector3(0, 0.12, -1).normalize().multiplyScalar(800)), Infinity, { lit: true });
  }
  if (shared.uStars.value > 0.6) add("stars", null, Infinity);
  if (wx.rain > 0.5) add("rain", null, Infinity);
  if (wx.storm > 0.5) add("storm", null, Infinity);
  if (wx.fog > 0.6) add("fog", null, Infinity);
  addSights(add, env); // orcas, shark, manta, pelicans, balloon, rainbow… (sights.js)
  gear.addSightings(add); // fireworks bursting (gear.js)
  // Things washed up on the beaches after a storm
  for (const w of washedUp) if (w.g.visible) add(w.id, w.g.position.clone().setY(w.g.position.y + 0.5), 110, FOG);
  return list;
}

function inRange(s, rangeFn = (r) => r) {
  if (!s.pos) return true;
  const b = photo.droneMode ? camera.position : state.boat; // the drone sees from where it flies
  const dist = s.id === "airliner" ? s.pos.distanceTo(camera.position) : Math.hypot(s.pos.x - b.x, s.pos.z - b.z);
  // Optics change the range, but nothing sees through the haze; in fog, only lights carry farther
  const hazed = s.fog || (wx.fog > 0.2 && !s.lit);
  const range = hazed ? Math.min(rangeFn(s.range), scene.fog.far) : rangeFn(s.range);
  return dist < range;
}

// margin: how much of the screen width counts (1 = anywhere, 0.6 = the middle, for photos).
// Vertically anywhere on screen counts, since the camera can't be tilted up or down.
function onScreen(s, margin) {
  if (!s.pos) return true;
  const p = toScreen(s.pos);
  return !!p && Math.abs(p.x) < margin && Math.abs(p.y) < 0.95;
}

// Ground height anywhere: the coast and sea floor, plus the islands
function groundAt(x, z) {
  let g = landHeight(x, z);
  for (const I of ISLANDS) {
    if (Math.hypot(x - I.x, z - I.z) < I.R * 1.3) g = Math.max(g, islandHeight(I, x, z));
  }
  return g;
}

// Is the straight line from the camera to the target clear of terrain, islands and sea stacks?
function lineOfSight(target) {
  const from = camera.position;
  const dist = from.distanceTo(target);
  const n = clamp(Math.ceil(dist / 8), 12, 120);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (t > 0.97) break; // don't count the ground the target itself stands on
    const x = from.x + (target.x - from.x) * t;
    const y = from.y + (target.y - from.y) * t;
    const z = from.z + (target.z - from.z) * t;
    if (groundAt(x, z) > y + 0.3) return false;
    for (const s of seaStacks) if (y < s.h && Math.hypot(x - s.x, z - s.z) < s.r) return false;
  }
  return true;
}

// Can you actually see it? In range, in the frame, not hidden behind anything, and lit well enough.
// margin: how much of the screen counts (1 = anywhere on screen, 0.6 = the middle, for photos)
function isVisible(s, env, margin, rangeFn) {
  if (!inRange(s, rangeFn) || !onScreen(s, margin)) return false;
  if (s.under && env.lightLevel < 0.35) return false; // too dark to see underwater
  if (!s.lit && s.pos && env.lightLevel < 0.2) {
    // At night only things close by and above water, lit by the boat's lights, can be seen
    if (s.under || s.pos.distanceTo(camera.position) > 40) return false;
  }
  return !s.pos || lineOfSight(s.pos);
}

function checkGoal(kind, id) {
  if (expedition.goalDone || !expedition.goal) return;
  if (expedition.goal.check(kind, id)) {
    expedition.goalDone = true;
    goalEl.classList.add("done");
    sound.chime("goal");
    toast(`★ Task complete! Head back to the harbor to collect $${expedition.goal.reward}.`, "goal");
  }
}

// What some finds tell you: each one points somewhere
const CLUES = {
  watcher: "🗿 The statue's outstretched arm points across the water, north-east toward the cliffs past the river…",
  crate: "📦 Stencilled on the side: 'MV ORLA — CARGO'. The Orla is the freighter that ran aground west of Seal Rock.",
  bottle: "✉️ The note inside, in faded ink: 'Where the stone face stares up at the sky, the third piece sleeps.'",
  amphora: "🏺 Painted around its neck: a row of columns standing in the sea, just west of a sandy cove.",
  whale: "🐋 It blows again, close by in the fog, then shows its tail and slides under.",
};

function discover(id) {
  const entry = JOURNAL_BY_ID[id];
  if (journal[id].seen) return;
  journal[id].seen = true;
  expedition.newFinds.push(id);
  expedition.discoveryEarnings += discoveryValue(entry);
  sound.chime("discovery");
  toast(`📓 New in your journal: ${entry.name}${discoveryValue(entry) ? ` +$${discoveryValue(entry)}` : ""}`, "discovery");
  if (id === "glow") toast("Something is down there, glinting… out of reach for now.");
  if (CLUES[id]) toast(CLUES[id], "goal");
  checkGoal("discover", id);
  if (!journalEl.classList.contains("hidden")) renderJournal();
}

// Distances: you can *spot* things from their full range (farther with binoculars), but to *photograph*
// them you have to get much closer — about a third of that, though never under 100 m, so things on land
// stay reachable from the water. Close-range subjects (underwater sites, fish) keep their own range.
// The telephoto camera stretches photos to about half the spotting range, at least 150 m, and off-centre.
const spotRange = () => (owned("binoculars") ? (r) => r * 1.5 : (r) => r);
const photoRange = () =>
  owned("camera") ? (r) => Math.min(r, Math.max(150, r * 0.55)) : (r) => Math.min(r, Math.max(100, r * 0.35));
const photoMargin = () => (owned("camera") ? 0.9 : 0.6);

function takePhoto() {
  sound.shutter();
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), 40);
  const inFrame = [];
  for (const s of currentSightings(lastEnv)) {
    if (isVisible(s, lastEnv, photoMargin(), photoRange()) && !inFrame.includes(s.id)) inFrame.push(s.id);
  }
  if (!inFrame.length) {
    toast("📷 Nothing notable in the frame");
    return;
  }
  for (const id of inFrame) {
    const entry = JOURNAL_BY_ID[id];
    discover(id);
    if (!journal[id].photo) {
      journal[id].photo = true;
      expedition.photos++;
      const bonus = photoValue(entry);
      expedition.photoEarnings += bonus;
      sound.chime("photo");
      toast(`📷 Photo added to your journal: ${entry.name}${bonus ? ` +$${bonus}` : ""}`, "discovery");
      if (!journalEl.classList.contains("hidden")) renderJournal();
    } else {
      toast(`📷 You already have a photo of ${entry.name} (no pay for repeats)`);
    }
    // A task can still need this photo (e.g. at sunset, or in a certain place)
    checkGoal("photo", id);
  }
}

// The journal (renderJournal, toggleJournal) lives in journal.js

// ===== Sonar and diving =====
// Every underwater site, and the relic a diver can recover there
const DIVE_SITES = [
  { site: "wreck", relic: "bell", x: WRECK.x, z: WRECK.z },
  { site: "sailboat", relic: "compass", x: SAILBOAT.x, z: SAILBOAT.z },
  { site: "freighter", relic: "logbook", x: FREIGHTER.x, z: FREIGHTER.z },
  { site: "temple", relic: "coin", x: TEMPLE.x, z: TEMPLE.z },
  { site: "colossus", relic: "fragment3", x: COLOSSUS.x, z: COLOSSUS.z },
  { site: "glow", relic: "fragment1", x: GLOW.x, z: GLOW.z },
  { site: "deepwreck", relic: "fragment2", x: DEEP_WRECK.x, z: DEEP_WRECK.z },
];
const SONAR_RANGE = 320;
const DIVE_RANGE = 28;
const sonarEl = document.getElementById("sonar");
const diveBtn = document.querySelector('#touch-buttons [data-act="dive"]');
let sonarContact = null;

function nearestSite(maxDist) {
  const b = state.boat;
  let best = null;
  for (const s of DIVE_SITES) {
    const dist = Math.hypot(s.x - b.x, s.z - b.z);
    if (dist < maxDist && (!best || dist < best.dist)) best = { ...s, dist };
  }
  return best;
}

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
function updateSonar() {
  const active = owned("sonar") && state.phase === "running";
  sonarEl.classList.toggle("hidden", !active);
  sonarContact = null;
  if (!active) return;
  const b = state.boat;
  const c = nearestSite(SONAR_RANGE);
  if (!c) {
    sonarEl.textContent = "📡 Sonar: no contacts";
    return;
  }
  sonarContact = c;
  // Bearing relative to the boat's heading, as an arrow
  const rel = wrapAngle(Math.atan2(-(c.x - b.x), -(c.z - b.z)) - b.yaw);
  const arrow = ARROWS[(Math.round(-rel / (Math.PI / 4)) + 8) % 8];
  const name = journal[c.site].seen ? JOURNAL_BY_ID[c.site].name : "unknown contact";
  sonarEl.textContent = `📡 ${name} · ${Math.round(c.dist)} m ${arrow}`;
  // The deep wreck is too deep to see: sonar is the only way to find it
  if (c.site === "deepwreck" && c.dist < 45 && !journal.deepwreck.seen) {
    toast("📡 Sonar: something big on the bottom, 20 m down — a wreck!", "discovery");
    discover("deepwreck");
  }
}

function tryDive() {
  const b = state.boat;
  const near = nearestSite(DIVE_RANGE);
  if (!near) {
    toast("🤿 Nothing to dive on right here.");
    return;
  }
  if (!owned("diving")) {
    toast("🤿 You need diving gear from the boatyard to dive here.");
    return;
  }
  if (!journal[near.site].seen) {
    toast("🤿 You haven't found anything here yet. Look for it first.");
    return;
  }
  if (Math.abs(b.speed) > 2.5) {
    toast("🤿 Slow down and stop over the site first.");
    return;
  }
  const relic = JOURNAL_BY_ID[near.relic];
  if (journal[near.relic].seen) {
    toast(`🤿 You've already recovered the ${relic.name} here.`);
    return;
  }
  // The dive: a blue fade, some time passes, and the relic comes up
  flashEl.classList.add("dive");
  sound.dive();
  sound.chime("relic");
  setTimeout(() => flashEl.classList.remove("dive"), 1400);
  state.timeOfDay = (state.timeOfDay + 0.33) % 24;
  expedition.hours += 0.33;
  journal[near.relic].seen = true;
  journal[near.relic].photo = true;
  expedition.newFinds.push(near.relic);
  expedition.relicEarnings += relic.value;
  toast(`🤿 You dive to the ${JOURNAL_BY_ID[near.site].name} and bring up: ${relic.name}! +$${relic.value}`, "discovery");
  if (near.relic === "logbook") toast("📖 The last entry mentions 'a light beneath the eastern cliffs' and 'the one who points'.");
  const fragments = ["fragment1", "fragment2", "fragment3"].filter((id) => journal[id].seen).length;
  if (near.relic.startsWith("fragment")) {
    if (fragments < 3) toast(`✦ Artifact fragments: ${fragments} of 3`, "goal");
    else if (!expedition.mysterySolved) {
      expedition.mysterySolved = true;
      sound.chime("mystery");
      toast("✦ The three fragments fit together… something about this coast is not what it seems.", "goal");
    }
  }
  checkGoal("relic", near.relic);
  if (!journalEl.classList.contains("hidden")) renderJournal();
}
