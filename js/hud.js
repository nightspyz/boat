// Photo highlights, minimap, touch controls.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== White highlights on subjects you haven't photographed yet =====
const targetsEl = document.getElementById("targets");
const targetPool = [];
let targetList = [];
function targetMarker(i) {
  if (!targetPool[i]) {
    const el = document.createElement("div");
    el.className = "target";
    el.innerHTML = "<span></span>";
    targetsEl.appendChild(el);
    targetPool[i] = el;
  }
  return targetPool[i];
}
function updatePhotoTargets(env, refresh) {
  const show = state.phase === "running" && !state.paused;
  if (refresh && show) {
    // Visible subjects not yet in the journal as a photo, nearest one per kind
    const best = {};
    for (const s of currentSightings(env)) {
      if (!s.pos || journal[s.id].photo) continue;
      if (!isVisible(s, env, 1.0, photoRange())) continue;
      const d = s.pos.distanceTo(camera.position);
      if (!best[s.id] || d < best[s.id].d) best[s.id] = { s, d };
    }
    targetList = Object.values(best).slice(0, 6);
  }
  let n = 0;
  if (show) {
    for (const { s } of targetList) {
      const p = toScreen(s.pos);
      if (!p || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
      const el = targetMarker(n++);
      el.style.display = "block";
      el.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
      el.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
      const ready = Math.abs(p.x) < photoMargin();
      el.classList.toggle("ready", ready);
      el.firstChild.textContent = ready ? `📷 ${JOURNAL_BY_ID[s.id].name}` : JOURNAL_BY_ID[s.id].name;
    }
  }
  for (let i = n; i < targetPool.length; i++) targetPool[i].style.display = "none";
}

// ---- Per-frame expedition update ----
let lastEnv = { lampsOn: 0, light: 1, lightLevel: 1 };
let spotFrame = 0;

function updateExpedition(dt, t, env) {
  lastEnv = env;
  updateIslandLife(dt, t);
  updateTraffic(dt, t, env);
  updateBeachLife(dt, t, env);

  // Harbor lamp and the strange light glow at night
  harborScene.lampMat.emissiveIntensity = 2 * env.lampsOn;
  harborScene.lampGlow.material.opacity = env.lampsOn;
  const pulse = 0.65 + 0.35 * Math.sin(t * 1.7);
  strangeGlow.halo.material.opacity = env.lampsOn * pulse * (1 - 0.6 * wx.fog);
  strangeGlow.core.material.emissiveIntensity = 0.3 + 2 * env.lampsOn * pulse;

  // Gear that shows on screen: sonar readout, dive button, and white rings on new photo subjects
  updateSonar();
  if (diveBtn) diveBtn.classList.toggle("hidden", !owned("diving"));
  updatePhotoTargets(env, spotFrame % 6 === 0);

  updateSheens(t);

  if (state.phase !== "running") return;
  const b = state.boat;
  if (wx.storm > 0.5) expedition.sawStorm = true;
  if (Math.hypot(b.x - harbor.dockX, b.z - harbor.dockZ) > 80) expedition.leftHarbor = true;

  // Sailing through the sea arch: crossing the line between its legs
  const ax = b.x - ARCH.x;
  const az = b.z - ARCH.z;
  const archSide = az < 0 ? -1 : 1;
  if (expedition.archSide && archSide !== expedition.archSide && Math.abs(ax) < ARCH.R - 2 && Math.abs(az) < 10) {
    toast("⛵ You sailed right through the sea arch!", "goal");
    discover("arch");
    checkGoal("event", "arch-through");
  }
  expedition.archSide = archSide;

  // An oily slick over a wreck: say so the first time you come across one in daylight
  for (const s of sheens) {
    if (s.hinted || journal[s.site].seen || env.light < 0.3) continue;
    if (Math.hypot(s.x - b.x, s.z - b.z) < s.r + 25) {
      s.hinted = true;
      toast(
        s.site === "deepwreck"
          ? "🌈 An oily rainbow sheen on the water, but nothing to see below. Too deep? Sonar might find it."
          : "🌈 An oily rainbow sheen on the water… something must be down there. Look down."
      );
    }
  }

  // Fuel: idling sips, full throttle gulps; rough seas cost more unless the hull is reinforced
  const seaPenalty = owned("hull") ? 1 : 1 + 0.5 * wx.storm;
  const burn = (0.012 + Math.abs(b.throttle) * 0.34 * (0.4 + (0.6 * Math.abs(b.speed)) / MAX_FORWARD)) * seaPenalty;
  expedition.fuel = Math.max(0, expedition.fuel - burn * dt);
  const fuelFrac = expedition.fuel / expedition.fuelMax;
  if (fuelFrac < 0.25 && !expedition.warned25) {
    expedition.warned25 = true;
    toast("⛽ Fuel at 25%. Think about heading home.");
  }
  if (fuelFrac < 0.1 && !expedition.warned10) {
    expedition.warned10 = true;
    toast("⛽ Fuel at 10%!");
  }

  expedition.distance += Math.hypot(b.x - expedition.lastX, b.z - expedition.lastZ);
  expedition.lastX = b.x;
  expedition.lastZ = b.z;

  // Spot anything visible (checked a few times a second; the line-of-sight test isn't free)
  if (++spotFrame % 6 === 0) {
    for (const s of currentSightings(env)) {
      if (!journal[s.id].seen && isVisible(s, env, 1.0, spotRange())) discover(s.id);
    }
  }

  // Context prompt
  let prompt = "";
  const site = nearestSite(DIVE_RANGE);
  if (nearHarbor() && expedition.leftHarbor) prompt = "Press E to dock and end today's expedition";
  else if (expedition.fuel <= 0) prompt = "Out of fuel! Press E to radio for a tow (costs 30% of today's task reward)";
  else if (site && journal[site.site].seen && !journal[site.relic].seen) {
    const name = JOURNAL_BY_ID[site.site].name;
    if (!owned("diving")) prompt = `You could dive on the ${name} here — with diving gear from the boatyard`;
    else if (Math.abs(b.speed) > 1.5) prompt = `Stop over the ${name} to dive`;
    else prompt = `Press X to dive on the ${name}`;
  }
  promptEl.textContent = prompt;
  promptEl.classList.toggle("hidden", !prompt);
}

// ===== Minimap: north-up, centred on the boat, with home and the lighthouse =====
const minimapEl = document.getElementById("minimap");
const mm = minimapEl.getContext("2d");
const MAP_RANGE_DEFAULT = 1600; // metres from the boat to the edge of the map (2600 with the chartplotter)
// Places the chartplotter marks once discovered
const CHART_POINTS = [
  { id: "wreck", x: WRECK.x, z: WRECK.z, color: "#9ad1ff" },
  { id: "deepwreck", x: DEEP_WRECK.x, z: DEEP_WRECK.z, color: "#9ad1ff" },
  { id: "sailboat", x: SAILBOAT.x, z: SAILBOAT.z, color: "#9ad1ff" },
  { id: "freighter", x: FREIGHTER.x, z: FREIGHTER.z, color: "#9ad1ff" },
  { id: "temple", x: TEMPLE.x, z: TEMPLE.z, color: "#e8dcc0" },
  { id: "colossus", x: COLOSSUS.x, z: COLOSSUS.z, color: "#e8dcc0" },
  { id: "glow", x: GLOW.x, z: GLOW.z, color: "#55ffe6" },
  { id: "town", x: TOWN_CENTER.x, z: TOWN_CENTER.z, color: "#ffffff" },
  { id: "delta", x: 800, z: shoreZAt(800) - 20, color: "#5fa8d3" },
  { id: "arch", x: ARCH.x, z: ARCH.z, color: "#e8dcc0" },
  { id: "waterfall", x: WATERFALL.x, z: WATERFALL.z, color: "#9ad1ff" },
  { id: "sisters", x: -1830, z: shoreZAt(-1830) + 80, color: "#e8dcc0" },
  { id: "grottoes", x: GROTTOES[1].x, z: GROTTOES[1].z, color: "#ffffff" },
  { id: "bridge", x: BRIDGE.x, z: BRIDGE.z, color: "#cccccc" },
];
const coastLine = [];
for (let x = -3000; x <= 3000; x += 20) coastLine.push([x, SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60]);

// ===== Big map (G): the whole coast, with every place you've discovered =====
const bigMapEl = document.getElementById("bigmap");
const bigCanvas = document.getElementById("bigmap-canvas");
const bm = bigCanvas.getContext("2d");
const BIG = { x0: -2750, x1: 2750, z0: SHORE_Z - 280, z1: SHORE_Z + 160 + MAX_OFFSHORE + 60 };
// Places to label once discovered (on top of the chartplotter's list)
const MAP_PLACES = [
  ...CHART_POINTS,
  { id: "harbor", x: harbor.dockX, z: harbor.dockZ },
  { id: "lighthouse", x: lighthouse.group.position.x, z: lighthouse.group.position.z },
  { id: "stacks", x: seaStacks[1].x, z: seaStacks[1].z },
  { id: "palmislet", x: ISLAND.palm.x, z: ISLAND.palm.z },
  { id: "sealrock", x: ISLAND.seal.x, z: ISLAND.seal.z },
  { id: "goatisland", x: ISLAND.goat.x, z: ISLAND.goat.z },
  { id: "hiddencove", x: HIDDEN_COVE.x, z: HIDDEN_COVE.z },
  { id: "swamp", x: SWAMP.x, z: SWAMP.z },
  { id: "beachwreck", x: BEACH_WRECK.x, z: BEACH_WRECK.z },
].filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);

function toggleBigMap(show = bigMapEl.classList.contains("hidden")) {
  bigMapEl.classList.toggle("hidden", !show);
  if (show) drawBigMap();
}
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "KeyG") toggleBigMap();
  if (e.code === "Escape" && !bigMapEl.classList.contains("hidden")) toggleBigMap(false);
});
bigMapEl.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  toggleBigMap(false);
});

function drawBigMap() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const aspect = (BIG.x1 - BIG.x0) / (BIG.z1 - BIG.z0);
  const cssW = Math.min(window.innerWidth * 0.95, window.innerHeight * 0.82 * aspect);
  const cssH = cssW / aspect;
  if (bigCanvas.width !== Math.round(cssW * dpr)) {
    bigCanvas.width = Math.round(cssW * dpr);
    bigCanvas.height = Math.round(cssH * dpr);
    bigCanvas.style.width = cssW + "px";
    bigCanvas.style.height = cssH + "px";
  }
  const W = bigCanvas.width;
  const H = bigCanvas.height;
  const s = W / (BIG.x1 - BIG.x0);
  const toMap = (x, z) => [(x - BIG.x0) * s, (z - BIG.z0) * s];
  const u = dpr; // one CSS pixel

  bm.clearRect(0, 0, W, H);
  bm.fillStyle = "#123f55";
  bm.fillRect(0, 0, W, H);

  // Land
  const coastPath = () => {
    bm.beginPath();
    coastLine.forEach(([x, z], i) => (i ? bm.lineTo(...toMap(x, z)) : bm.moveTo(...toMap(x, z))));
  };
  bm.fillStyle = "#cdb88c";
  coastPath();
  bm.lineTo(W + 10, -10);
  bm.lineTo(-10, -10);
  bm.closePath();
  bm.fill();
  bm.strokeStyle = "rgba(255, 255, 255, 0.35)";
  bm.lineWidth = 1.2 * u;
  coastPath();
  bm.stroke();
  for (const I of ISLANDS) {
    bm.beginPath();
    bm.arc(...toMap(I.x, I.z), Math.max(3 * u, I.R * s), 0, Math.PI * 2);
    bm.fill();
  }
  bm.fillStyle = "#e8dcc0";
  for (const st of seaStacks) {
    const [px, py] = toMap(st.x, st.z);
    bm.fillRect(px - 1.5 * u, py - 1.5 * u, 3 * u, 3 * u);
  }
  // Swamp, river, town
  bm.fillStyle = "rgba(90, 110, 60, 0.9)";
  bm.beginPath();
  bm.arc(...toMap(SWAMP.x, SWAMP.z), SWAMP.r * 0.8 * s, 0, Math.PI * 2);
  bm.fill();
  bm.strokeStyle = "#5fa8d3";
  bm.lineCap = "round";
  for (const seg of RIVER_SEGS) {
    bm.lineWidth = Math.max(2 * u, seg.w * s * 2.5);
    bm.beginPath();
    bm.moveTo(...toMap(seg.ax, seg.az));
    bm.lineTo(...toMap(seg.bx, seg.bz));
    bm.stroke();
  }
  bm.fillStyle = "#8d8a86";
  for (let x = TOWN.x0; x <= TOWN.x1; x += 40) {
    const [px, py] = toMap(x, shoreZAt(x) - 70);
    bm.fillRect(px - 3 * u, py - 5 * u, 6 * u, 5 * u);
  }

  // The edge of the map
  bm.strokeStyle = "rgba(255, 120, 100, 0.6)";
  bm.lineWidth = 1.5 * u;
  bm.setLineDash([4 * u, 6 * u]);
  const inside = coastLine.filter(([x]) => Math.abs(x) <= MAX_ALONG);
  bm.beginPath();
  bm.moveTo(...toMap(inside[0][0], inside[0][1]));
  for (const [x, z] of inside) bm.lineTo(...toMap(x, z + MAX_OFFSHORE));
  bm.lineTo(...toMap(inside[inside.length - 1][0], inside[inside.length - 1][1]));
  bm.stroke();
  bm.setLineDash([]);

  // The Watcher's pointing arm, once found
  if (journal.watcher.seen) {
    const top = islandSummit(ISLAND.goat);
    const dx = GLOW.x - top.x;
    const dz = GLOW.z - top.z;
    const len = Math.hypot(dx, dz);
    bm.strokeStyle = "rgba(232, 220, 192, 0.8)";
    bm.lineWidth = 1.5 * u;
    bm.setLineDash([5 * u, 5 * u]);
    bm.beginPath();
    bm.moveTo(...toMap(top.x, top.z));
    bm.lineTo(...toMap(top.x + (dx / len) * 900, top.z + (dz / len) * 900));
    bm.stroke();
    bm.setLineDash([]);
  }
  // Today's radio search area
  if (expedition.searchArea && state.phase === "running" && !expedition.goalDone) {
    bm.strokeStyle = "rgba(242, 193, 78, 0.95)";
    bm.lineWidth = 2.5 * u;
    bm.setLineDash([8 * u, 6 * u]);
    bm.beginPath();
    bm.arc(...toMap(expedition.searchArea.x, expedition.searchArea.z), expedition.searchArea.r * s, 0, Math.PI * 2);
    bm.stroke();
    bm.setLineDash([]);
  }

  // Everything you've discovered, with its name
  bm.font = `${12 * u}px system-ui, sans-serif`;
  bm.textBaseline = "middle";
  for (const p of MAP_PLACES) {
    if (!journal[p.id] || !journal[p.id].seen) continue;
    const [px, py] = toMap(p.x, p.z);
    bm.fillStyle = p.color || "#ffffff";
    bm.beginPath();
    bm.arc(px, py, 4 * u, 0, Math.PI * 2);
    bm.fill();
    const label = JOURNAL_BY_ID[p.id].name;
    const right = px > W - 140 * u;
    bm.textAlign = right ? "right" : "left";
    const tx = px + (right ? -7 : 7) * u;
    bm.lineWidth = 3 * u;
    bm.strokeStyle = "rgba(5, 20, 30, 0.8)";
    bm.strokeText(label, tx, py);
    bm.fillStyle = "#ffffff";
    bm.fillText(label, tx, py);
  }

  // Your boat
  const b = state.boat;
  const [bx, by] = toMap(b.x, b.z);
  const fx = -Math.sin(b.yaw);
  const fy = -Math.cos(b.yaw);
  bm.fillStyle = "#ff5a4f";
  bm.strokeStyle = "#ffffff";
  bm.lineWidth = 1.5 * u;
  bm.beginPath();
  bm.moveTo(bx + fx * 11 * u, by + fy * 11 * u);
  bm.lineTo(bx - fx * 6 * u - fy * 6 * u, by - fy * 6 * u + fx * 6 * u);
  bm.lineTo(bx - fx * 6 * u + fy * 6 * u, by - fy * 6 * u - fx * 6 * u);
  bm.closePath();
  bm.fill();
  bm.stroke();

  // Title and scale bar
  bm.fillStyle = "rgba(255, 255, 255, 0.9)";
  bm.font = `600 ${15 * u}px system-ui, sans-serif`;
  bm.textAlign = "left";
  bm.textBaseline = "top";
  bm.fillText("The coast", 12 * u, 10 * u);
  bm.fillRect(12 * u, H - 18 * u, 1000 * s, 2 * u);
  bm.font = `${11 * u}px system-ui, sans-serif`;
  bm.textBaseline = "bottom";
  bm.fillText("1 km", 12 * u, H - 22 * u);
}

function drawMinimap() {
  if (!bigMapEl.classList.contains("hidden")) drawBigMap();
  const MAP_RANGE = owned("chart") ? 2600 : MAP_RANGE_DEFAULT; // the chartplotter zooms out
  const W = minimapEl.width;
  const c = W / 2;
  const R = c - 6;
  const s = R / MAP_RANGE;
  const b = state.boat;
  const toMap = (x, z) => [c + (x - b.x) * s, c + (z - b.z) * s];

  mm.clearRect(0, 0, W, W);
  mm.save();
  mm.beginPath();
  mm.arc(c, c, R, 0, Math.PI * 2);
  mm.clip();
  mm.fillStyle = "rgba(12, 60, 84, 0.78)";
  mm.fillRect(0, 0, W, W);

  // Coast (land lies north of the coastline, i.e. up)
  mm.fillStyle = "#cdb88c";
  mm.beginPath();
  coastLine.forEach(([x, z], i) => {
    const [px, py] = toMap(x, z);
    if (i === 0) mm.moveTo(px, py);
    else mm.lineTo(px, py);
  });
  mm.lineTo(toMap(3000, 0)[0], -20);
  mm.lineTo(toMap(-3000, 0)[0], -20);
  mm.closePath();
  mm.fill();

  // Islands and sea stacks
  for (const I of ISLANDS) {
    const [px, py] = toMap(I.x, I.z);
    mm.beginPath();
    mm.arc(px, py, Math.max(3, I.R * s), 0, Math.PI * 2);
    mm.fill();
  }
  mm.fillStyle = "#e8dcc0";
  for (const st of seaStacks) {
    const [px, py] = toMap(st.x, st.z);
    mm.fillRect(px - 1.5, py - 1.5, 3, 3);
  }

  // Swamp, river and town
  mm.fillStyle = "rgba(90, 110, 60, 0.9)";
  const [swx, swy] = toMap(SWAMP.x, SWAMP.z);
  mm.beginPath();
  mm.arc(swx, swy, SWAMP.r * 0.8 * s, 0, Math.PI * 2);
  mm.fill();
  mm.strokeStyle = "#5fa8d3";
  mm.lineCap = "round";
  for (const seg of RIVER_SEGS) {
    mm.lineWidth = Math.max(2, seg.w * s * 2.5);
    mm.beginPath();
    mm.moveTo(...toMap(seg.ax, seg.az));
    mm.lineTo(...toMap(seg.bx, seg.bz));
    mm.stroke();
  }
  mm.fillStyle = "#8d8a86";
  for (let x = TOWN.x0; x <= TOWN.x1; x += 40) {
    const [px, py] = toMap(x, shoreZAt(x) - 70);
    mm.fillRect(px - 3, py - 12 * s * 20, 6, 12 * s * 20);
  }

  // Home and lighthouse markers, pinned to the rim when off the map
  const marker = (x, z, label, color) => {
    let [px, py] = toMap(x, z);
    const dx = px - c;
    const dy = py - c;
    const d = Math.hypot(dx, dy);
    const edge = R - 14;
    if (d > edge) {
      px = c + (dx / d) * edge;
      py = c + (dy / d) * edge;
    }
    mm.fillStyle = color;
    mm.beginPath();
    mm.arc(px, py, 12, 0, Math.PI * 2);
    mm.fill();
    mm.fillStyle = "#08202c";
    mm.font = "bold 15px system-ui, sans-serif";
    mm.textAlign = "center";
    mm.textBaseline = "middle";
    mm.fillText(label, px, py + 1);
  };
  marker(harbor.dockX, harbor.dockZ, "H", "#7fd1b9");
  marker(lighthouse.group.position.x, lighthouse.group.position.z, "L", "#f2c14e");

  // Chartplotter: every place you've discovered is marked
  if (owned("chart")) {
    for (const p of CHART_POINTS) {
      if (!journal[p.id].seen) continue;
      const [px, py] = toMap(p.x, p.z);
      mm.fillStyle = p.color;
      mm.beginPath();
      mm.arc(px, py, 5, 0, Math.PI * 2);
      mm.fill();
    }
  }
  // The edge of the map: how far out (and along) the coast the boat may go
  mm.strokeStyle = "rgba(255, 120, 100, 0.55)";
  mm.lineWidth = 1.5;
  mm.setLineDash([3, 5]);
  mm.beginPath();
  let started = false;
  for (const [x, z] of coastLine) {
    if (Math.abs(x) > MAX_ALONG) continue;
    const [px, py] = toMap(x, z + MAX_OFFSHORE);
    if (!started) mm.moveTo(...toMap(x, z));
    mm.lineTo(px, py);
    started = true;
  }
  const last = coastLine.filter(([x]) => Math.abs(x) <= MAX_ALONG).pop();
  if (last) mm.lineTo(...toMap(last[0], last[1]));
  mm.stroke();
  mm.setLineDash([]);

  // Once you've found the Watcher, the line its arm points along is drawn on your map
  if (journal.watcher.seen) {
    const top = islandSummit(ISLAND.goat);
    const dx = GLOW.x - top.x;
    const dz = GLOW.z - top.z;
    const len = Math.hypot(dx, dz);
    const [ax, ay] = toMap(top.x, top.z);
    const [bx, by] = toMap(top.x + (dx / len) * 900, top.z + (dz / len) * 900);
    mm.strokeStyle = "rgba(232, 220, 192, 0.7)";
    mm.lineWidth = 1.5;
    mm.setLineDash([5, 5]);
    mm.beginPath();
    mm.moveTo(ax, ay);
    mm.lineTo(bx, by);
    mm.stroke();
    mm.setLineDash([]);
  }
  // Radio: today's search area
  if (expedition.searchArea && state.phase === "running" && !expedition.goalDone) {
    const [px, py] = toMap(expedition.searchArea.x, expedition.searchArea.z);
    mm.strokeStyle = "rgba(242, 193, 78, 0.95)";
    mm.lineWidth = 3;
    mm.setLineDash([8, 6]);
    mm.beginPath();
    mm.arc(px, py, expedition.searchArea.r * s, 0, Math.PI * 2);
    mm.stroke();
    mm.setLineDash([]);
  }
  // Sonar: a pulsing ring on the nearest contact
  if (sonarContact) {
    const [px, py] = toMap(sonarContact.x, sonarContact.z);
    const ping = (performance.now() / 1200) % 1;
    mm.strokeStyle = `rgba(120, 255, 200, ${1 - ping})`;
    mm.lineWidth = 3;
    mm.beginPath();
    mm.arc(px, py, 4 + ping * 22, 0, Math.PI * 2);
    mm.stroke();
  }

  // The boat: an arrow pointing where it's heading
  const fx = -Math.sin(b.yaw);
  const fz = -Math.cos(b.yaw);
  mm.save();
  mm.translate(c, c);
  mm.rotate(Math.atan2(fz, fx) + Math.PI / 2);
  mm.fillStyle = "#ffffff";
  mm.beginPath();
  mm.moveTo(0, -13);
  mm.lineTo(8, 10);
  mm.lineTo(0, 5);
  mm.lineTo(-8, 10);
  mm.closePath();
  mm.fill();
  mm.restore();

  // Distances home and to the lighthouse
  const km = (x, z) => (Math.hypot(x - b.x, z - b.z) / 1000).toFixed(1);
  mm.fillStyle = "rgba(255,255,255,0.9)";
  mm.font = "600 18px system-ui, sans-serif";
  mm.textAlign = "center";
  mm.fillText(
    `H ${km(harbor.dockX, harbor.dockZ)} km · L ${km(lighthouse.group.position.x, lighthouse.group.position.z)} km`,
    c,
    W - 34
  );
  mm.restore();

  mm.strokeStyle = "rgba(255,255,255,0.5)";
  mm.lineWidth = 3;
  mm.beginPath();
  mm.arc(c, c, R, 0, Math.PI * 2);
  mm.stroke();
  mm.fillStyle = "#fff";
  mm.font = "bold 16px system-ui, sans-serif";
  mm.fillText("N", c, 16);
}

// ===== Touch controls (phones and tablets) =====
const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
if (isTouchDevice) {
  document.getElementById("touch").classList.remove("hidden");
  document.querySelector("#overlay .hint").textContent =
    "Left stick: throttle and steer · drag the view to look around, pinch to zoom · 📷 photo · 📓 journal · ⚓ dock · 🎥 camera behind boat · ⏩ hold to speed up time · ⏸ pause · 🔊 sound · tap to continue";

  // Joystick: up/down = throttle, left/right = steer
  const stick = document.getElementById("stick");
  const knob = document.getElementById("stick-knob");
  let stickId = null;
  const moveStick = (e) => {
    const r = stick.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max);
    let dy = e.clientY - (r.top + max);
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    touch.throttle = dead(-dy / max);
    touch.turn = dead(-dx / max);
  };
  const releaseStick = () => {
    stickId = null;
    touch.active = false;
    touch.throttle = touch.turn = 0;
    knob.style.transform = "";
  };
  stick.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    touch.active = true;
    moveStick(e);
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickId) moveStick(e);
  });
  stick.addEventListener("pointerup", releaseStick);
  stick.addEventListener("pointercancel", releaseStick);

  // Buttons
  for (const btn of document.querySelectorAll("#touch-buttons button")) {
    const act = btn.dataset.act;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (act === "time") keys.add("KeyT");
      else if (act === "journal") toggleJournal();
      else if (act === "map") toggleBigMap();
      else if (act === "pause") pressSpace();
      else if (act === "camera") resetOrbit();
      else if (act === "mute") sound.toggleMute();
      else if (state.phase === "running" && !state.paused) {
        if (act === "photo") photo.enter();
        if (act === "dock") tryEndExpedition();
        if (act === "dive") tryDive();
      }
    });
    const up = (e) => {
      e.stopPropagation();
      if (act === "time") keys.delete("KeyT");
    };
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
  }

  // Tap anywhere else (without dragging the view) to continue from the title, briefing, summary or pause screens
  canvas.addEventListener("pointerup", () => {
    if (dragMoved < 10 && (state.phase !== "running" || state.paused)) pressSpace();
  });
}
