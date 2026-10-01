// The world editor (index.html?edit, or open editor.html). Runs the real game world without the game:
// fly around, see every placeable thing in data/world.js as a pin, click to select, drag to move,
// change any number or colour in the side panel, then save the world file.
// Changes are kept as a draft in the browser until you save; after each change the page rebuilds the
// world (a quick reload) so you see exactly what the game will build.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

if (EDIT_MODE)
  (() => {
    // ================= Styles and panels =================
    const css = document.createElement("style");
    css.textContent = `
      html.editing #app > *:not(#game) { display: none !important; }
      #ed { position: fixed; inset: 0; pointer-events: none; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e8edf2; z-index: 20; }
      #ed .panel { pointer-events: auto; position: absolute; top: 52px; bottom: 34px; background: rgba(20, 26, 32, 0.9); backdrop-filter: blur(6px); overflow-y: auto; }
      #ed-tree { left: 0; width: 250px; border-right: 1px solid #2c3640; padding: 6px 0; }
      #ed-insp { right: 0; width: 330px; border-left: 1px solid #2c3640; padding: 10px 12px; }
      #ed-top { pointer-events: auto; position: absolute; top: 0; left: 0; right: 0; height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 12px;
        background: rgba(14, 19, 24, 0.95); border-bottom: 1px solid #2c3640; white-space: nowrap; overflow-x: auto; }
      #ed-top .title { font-weight: 700; letter-spacing: .3px; margin-right: 6px; }
      #ed-top .sep { width: 1px; height: 26px; background: #2c3640; }
      #ed-top label { display: flex; align-items: center; gap: 5px; color: #b9c4cf; }
      #ed button { font: inherit; color: #e8edf2; background: #2b3540; border: 1px solid #3a4652; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
      #ed button:hover { background: #34414e; }
      #ed button.primary { background: #2f6fa8; border-color: #3d82c2; }
      #ed button.primary:hover { background: #3a7fbd; }
      #ed button:disabled { opacity: .45; cursor: default; }
      #ed-status { pointer-events: auto; position: absolute; left: 0; right: 0; bottom: 0; height: 34px; display: flex; align-items: center; gap: 14px; padding: 0 12px;
        background: rgba(14, 19, 24, 0.95); border-top: 1px solid #2c3640; color: #9fb0bf; }
      #ed-status .dirty { color: #ffcf5a; } #ed-status .clean { color: #7fd69a; }
      #ed-tree .sec { padding: 7px 12px 5px; font-weight: 700; display: flex; align-items: center; gap: 7px; cursor: pointer; user-select: none; }
      #ed-tree .sec:hover { background: #222c36; }
      #ed-tree .sec .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
      #ed-tree .sec .eye { margin-left: auto; opacity: .55; font-weight: 400; }
      #ed-tree .sec .eye:hover { opacity: 1; }
      #ed-tree .item { padding: 3px 12px 3px 28px; cursor: pointer; color: #c6d0da; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #ed-tree .item:hover { background: #222c36; }
      #ed-tree .item.sel, #ed-tree .sec.sel { background: #2f5d85; color: #fff; }
      #ed-tree .closed + .items { display: none; }
      #ed-insp h3 { margin: 2px 0 2px; font-size: 15px; }
      #ed-insp .path { color: #7f909f; font-size: 11px; margin-bottom: 10px; word-break: break-all; }
      #ed-insp .hint { color: #98a8b6; font-size: 12px; margin: 0 0 10px; }
      #ed-insp .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
      #ed-insp .row > span { flex: 0 0 112px; color: #aebbc7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #ed-insp input[type=number], #ed-insp input[type=text] { flex: 1; min-width: 0; font: inherit; color: #fff; background: #10161c; border: 1px solid #36424e; border-radius: 5px; padding: 4px 6px; }
      #ed-insp input[type=color] { width: 44px; height: 26px; border: 1px solid #36424e; border-radius: 5px; background: #10161c; padding: 1px; }
      #ed-insp .nums { flex: 1; display: flex; gap: 4px; min-width: 0; }
      #ed-insp .nums input { width: 0; flex: 1; }
      #ed-insp fieldset { border: 1px solid #2f3a45; border-radius: 7px; margin: 8px 0; padding: 4px 8px 6px; }
      #ed-insp legend { color: #d6dee6; padding: 0 4px; font-weight: 600; }
      #ed-labels { position: absolute; inset: 0; overflow: hidden; }
      #ed-labels div { position: absolute; transform: translate(-50%, -150%); background: rgba(10, 14, 18, 0.72); color: #fff; padding: 1px 6px; border-radius: 4px;
        font-size: 11px; white-space: nowrap; pointer-events: none; }
      #ed-labels div.sel { background: #2f6fa8; font-weight: 700; z-index: 2; }
      #ed-busy { pointer-events: auto; position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(8, 12, 16, 0.55);
        font-size: 18px; font-weight: 600; }
      #ed-help { position: absolute; left: 262px; bottom: 44px; color: #d8e1ea; background: rgba(14, 19, 24, 0.75); padding: 6px 10px; border-radius: 7px; font-size: 12px; }
      #ed-msg { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); background: #2f6fa8; color: #fff; padding: 7px 14px; border-radius: 8px;
        opacity: 0; transition: opacity .3s; pointer-events: none; max-width: 60vw; text-align: center; }
    `;
    document.head.appendChild(css);

    const ui = document.createElement("div");
    ui.id = "ed";
    ui.innerHTML = `
      <div id="ed-labels"></div>
      <div id="ed-top">
        <span class="title">🛠️ Coastline world editor</span>
        <button class="primary" data-a="save" title="Write data/world.js (Ctrl+S)">💾 Save world.js</button>
        <button data-a="undo" title="Ctrl+Z">↶ Undo</button>
        <button data-a="redo" title="Ctrl+Y">↷ Redo</button>
        <button data-a="rebuild" title="Rebuild the world with the changes so far (B)">⟳ Rebuild</button>
        <label title="Rebuild straight after each change"><input type="checkbox" data-o="auto"> Auto rebuild</label>
        <span class="sep"></span>
        <label>Time <input type="range" min="0" max="24" step="0.25" data-o="time" style="width:110px"> <b data-v="time"></b></label>
        <label><input type="checkbox" data-o="fog"> Haze</label>
        <label><input type="checkbox" data-o="labels"> Labels</label>
        <label><input type="checkbox" data-o="animate"> Animate</label>
        <span class="sep"></span>
        <button data-a="discard" title="Throw away unsaved changes and go back to the saved world.js">Discard changes</button>
        <button data-a="play" title="Open the game (it uses the saved world.js)">▶ Play</button>
      </div>
      <div id="ed-tree" class="panel"></div>
      <div id="ed-insp" class="panel"></div>
      <div id="ed-help">Drag to look · WASD fly · Q/E down/up · Shift faster · wheel forward/back · click a pin to select · drag the arrows to move (X along the coast, Z out to sea), the square or ball to move freely · F focus · Esc deselect</div>
      <div id="ed-status"><span data-v="dirty"></span><span data-v="info"></span><span data-v="cam" style="margin-left:auto"></span></div>
      <div id="ed-busy">Rebuilding the world…</div>
      <div id="ed-msg"></div>`;
    document.body.appendChild(ui);
    // The editor is just the world and its own panels: take every game screen (title, pause menu,
    // journal, map, HUD…) out of the page. The game code can keep its references; they're never shown.
    for (const el of [...document.getElementById("app").children]) if (el !== renderer.domElement) el.remove();
    state.paused = false;
    const $ = (s) => ui.querySelector(s);
    const treeEl = $("#ed-tree");
    const inspEl = $("#ed-insp");
    const labelsEl = $("#ed-labels");
    // Typing in the panels must not reach the game's own key handlers
    for (const t of ["keydown", "keyup"]) ui.addEventListener(t, (e) => e.stopPropagation());
    let msgTimer = 0;
    function say(text, secs = 3) {
      const m = $("#ed-msg");
      m.textContent = text;
      m.style.opacity = 1;
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => (m.style.opacity = 0), secs * 1000);
    }

    // ================= Editor state (kept across rebuilds) =================
    const SESSION = "coastline-editor-view";
    const view = Object.assign(
      { x: COVE_X, y: 140, z: SHORE_Z + 260, yaw: 0, pitch: -0.35, time: 11, fog: false, labels: true, animate: true, auto: true, sel: null, closed: [], hidden: [], scroll: 0 },
      JSON.parse(sessionStorage.getItem(SESSION) || "{}")
    );
    const saveView = () => {
      view.scroll = treeEl.scrollTop;
      sessionStorage.setItem(SESSION, JSON.stringify(view));
    };

    // ================= Reading and writing the world =================
    const getAt = (path) => path.reduce((o, k) => (o == null ? o : o[k]), WORLD);
    const setAt = (path, v) => {
      const o = getAt(path.slice(0, -1));
      o[path[path.length - 1]] = v;
    };
    const R = (v) => Math.round(v); // positions in whole metres
    const lsGet = (k, d) => {
      try {
        return JSON.parse(localStorage.getItem(k)) ?? d;
      } catch {
        return d;
      }
    };
    const worldJSON = () => JSON.stringify(WORLD);
    let before = worldJSON(); // the world as this page was built
    // Record a change: the previous world goes on the undo stack, the new one becomes the draft
    function commit(note) {
      const now = worldJSON();
      if (now === before) return;
      const undo = lsGet(EDIT_KEYS.undo, []);
      undo.push(before);
      while (undo.length > 60) undo.shift();
      localStorage.setItem(EDIT_KEYS.undo, JSON.stringify(undo));
      localStorage.setItem(EDIT_KEYS.redo, "[]");
      localStorage.setItem(EDIT_KEYS.draft, now);
      before = now;
      pending = true;
      updateStatus();
      if (note) say(note, 2);
      if (view.auto) rebuildSoon();
    }
    let pending = false; // changes not yet rebuilt into the 3D world
    let rebuildTimer = 0;
    function rebuildSoon() {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(rebuild, 350);
    }
    function rebuild() {
      saveView();
      $("#ed-busy").style.display = "flex";
      setTimeout(() => location.reload(), 30);
    }
    function undoRedo(from, to) {
      const a = lsGet(from, []);
      const prev = a.pop();
      if (!prev) return say(from === EDIT_KEYS.undo ? "Nothing to undo" : "Nothing to redo");
      const b = lsGet(to, []);
      b.push(worldJSON());
      localStorage.setItem(from, JSON.stringify(a));
      localStorage.setItem(to, JSON.stringify(b));
      if (prev === WORLD_FILE_JSON) localStorage.removeItem(EDIT_KEYS.draft);
      else localStorage.setItem(EDIT_KEYS.draft, prev);
      rebuild();
    }
    function updateStatus() {
      const now = worldJSON();
      const saved = localStorage.getItem("coastline-world-saved");
      const d = $('[data-v="dirty"]');
      if (now === WORLD_FILE_JSON || now === saved) {
        d.className = "clean";
        d.textContent = now === WORLD_FILE_JSON ? "✓ Same as world.js" : "✓ Saved";
      } else {
        d.className = "dirty";
        d.textContent = "● Unsaved changes";
      }
      $('[data-v="info"]').textContent = pending && !view.auto ? "Changes not rebuilt yet — press Rebuild (B)" : "";
      $('[data-a="undo"]').disabled = !lsGet(EDIT_KEYS.undo, []).length;
      $('[data-a="redo"]').disabled = !lsGet(EDIT_KEYS.redo, []).length;
    }

    // ================= Everything you can place =================
    // Each handle is one pin in the world: where it is, and how moving it changes the world file
    const SECTIONS = {
      coast: { label: "Coastline", color: "#ffcc33" },
      islands: { label: "Islands", color: "#5fdc8a" },
      landmarks: { label: "Landmarks", color: "#ff8a4a" },
      places: { label: "Hidden & underwater places", color: "#c77dff" },
      inland: { label: "Roads, villages & pier", color: "#ff5d73" },
      clifftop: { label: "Clifftop", color: "#36d6c8" },
      beach: { label: "Beach", color: "#ffb380" },
      traffic: { label: "Boats & planes", color: "#5aa9ff" },
      offshore: { label: "Out at sea", color: "#f2f2f2" },
      life: { label: "Animals & things on the move", color: "#ffd84a" },
      grass: { label: "Grass, fields & flowers", color: "#8fd14f" },
    };
    const shoreZ = (x) => shoreZAt(x);
    const handles = [];
    // kinds of position rule:
    //   xz      — exact x, z
    //   inland  — x, and metres inland from the waterline
    //   out     — x, and metres out to sea from the waterline
    //   depth   — x only; the spot is found where the sea gets 'depth' deep (drag moves it along the coast)
    //   along   — x only, on a line that follows the coast (zAt gives the line)
    const add = (section, label, obj, kind, opt = {}) => handles.push({ section, label, obj, kind, xKey: "x", ...opt });
    function buildHandles() {
      handles.length = 0;
      const W = WORLD;
      const c = ["coast"];
      add("coast", "Lighthouse", c, "along", { xKey: "lighthouseX", zAt: (x) => shoreZ(x) - 45, insp: c, note: "Moves the lighthouse. Its headland is the first entry in 'bends' — move that too." });
      add("coast", "Harbor cove", c, "along", { xKey: "coveX", zAt: shoreZ, insp: c, note: "The sandy cove with the harbor and pier, where every trip starts." });
      W.coast.bends.forEach((b, i) => add("coast", `Bend: ${b.name || i + 1}`, [...c, "bends", i], "along", { zAt: shoreZ }));
      W.coast.cliffSetbacks.forEach((b, i) => add("coast", `Beach under cliffs: ${b.name || i + 1}`, [...c, "cliffSetbacks", i], "along", { zAt: (x) => shoreZ(x) + 15 }));
      W.coast.cliffCoasts.forEach((b, i) => add("coast", `Always cliffs ${i + 1}`, [...c, "cliffCoasts", i], "along", { zAt: (x) => shoreZ(x) - 15 }));
      W.coast.seaStacks.lighthouse.forEach((k, i) => add("coast", `Sea stack (lighthouse) ${i + 1}`, [...c, "seaStacks", "lighthouse", i], "out"));
      W.coast.seaStacks.sisters.forEach((k, i) => add("coast", `Seven Sisters stack ${i + 1}`, [...c, "seaStacks", "sisters", i], "out"));
      W.islands.forEach((I, i) => add("islands", `Island: ${I.id}`, ["islands", i], "xz"));
      const L = ["landmarks"];
      add("landmarks", "Sea arch", [...L, "seaArch"], "out");
      add("landmarks", "Hidden Cove", [...L, "hiddenCove"], "inland");
      W.landmarks.grottoes.forEach((x, i) => add("landmarks", `Grotto ${i + 1}`, [...L, "grottoes"], "along", { xKey: i, zAt: shoreZ, insp: [...L, "grottoes"] }));
      add("landmarks", "Creek & bridge", L, "along", { xKey: "creekX", zAt: (x) => shoreZ(x) - 60, insp: L });
      add("landmarks", "Coast road: west end", [...L, "coastRoad"], "along", { xKey: "x0", zAt: (x) => shoreZ(x) - 80 });
      add("landmarks", "Coast road: east end", [...L, "coastRoad"], "along", { xKey: "x1", zAt: (x) => shoreZ(x) - 80 });
      add("landmarks", "Clifftop lake", [...L, "lake"], "inland");
      add("landmarks", "Swamp", [...L, "swamp"], "inland");
      W.landmarks.river.forEach((p, i) =>
        p.pts.forEach((_, j) => add("landmarks", `River ${i === 0 ? "channel" : "mouth " + i} · point ${j + 1}`, [...L, "river", i, "pts", j], "pair", { insp: [...L, "river", i] }))
      );
      for (const [k, name] of [["wreck", "Old wreck"], ["strangeLight", "Strange light"], ["deepWreck", "Deep wreck"], ["sunkenTemple", "Sunken temple"], ["colossus", "Colossus"], ["sailboatWreck", "Sailboat wreck"]])
        add("places", name, ["places", k], "depth");
      add("places", "Freighter", ["places", "freighter"], "xz");
      const N = ["inland"];
      add("inland", "West road: west end", [...N, "westRoad"], "along", { xKey: "x0", zAt: (x) => shoreZ(x) - westRoadD(x) });
      add("inland", "West road: east end", [...N, "westRoad"], "along", { xKey: "x1", zAt: (x) => shoreZ(x) - westRoadD(x) });
      W.inland.villages.forEach((v, i) => add("inland", `Village: ${v.name || i + 1}`, [...N, "villages", i], "inland"));
      W.inland.lanes.forEach((l, i) => {
        const to = (W.inland.villages[i] && W.inland.villages[i].name) || `village ${i + 1}`;
        if (l.roadX !== undefined) add("inland", `Lane start → ${to}`, [...N, "lanes", i], "along", { xKey: "roadX", zAt: (x) => shoreZ(x) - westRoadD(x) });
        else add("inland", `Lane start → ${to}`, [...N, "lanes", i], "inland");
      });
      W.inland.radioMasts.forEach((m, i) => {
        add("inland", `Radio mast ${i + 1}: search from`, [...N, "radioMasts", i], "along", { xKey: "x0", zAt: (x) => shoreZ(x) - 600 });
        add("inland", `Radio mast ${i + 1}: search to`, [...N, "radioMasts", i], "along", { xKey: "x1", zAt: (x) => shoreZ(x) - 600 });
      });
      add("inland", "Funfair pier", [...N, "funPier"], "along", { zAt: (x) => shoreZ(x) + W.inland.funPier.len / 2 });
      add("inland", "Town: church (centre)", [...N, "town", "center"], "inland");
      add("inland", "Town: west edge", [...N, "town"], "along", { xKey: "x0", zAt: (x) => shoreZ(x) - 120 });
      add("inland", "Town: east edge", [...N, "town"], "along", { xKey: "x1", zAt: (x) => shoreZ(x) - 120 });
      add("clifftop", "Party area", ["clifftop", "party"], "inland");
      add("clifftop", "Bike track", ["clifftop", "bikeTrack"], "inland");
      W.beach.camps.forEach((cp, i) => add("beach", `Camp ${i + 1}`, ["beach", "camps", i], "inland"));
      add("beach", "Horse ride: from", ["beach", "horseRide"], "along", { xKey: "x0", zAt: (x) => shoreZ(x) - W.beach.horseRide.inland });
      add("beach", "Horse ride: to", ["beach", "horseRide"], "along", { xKey: "x1", zAt: (x) => shoreZ(x) - W.beach.horseRide.inland });
      add("beach", "Beach wreck", ["beach", "beachWreck"], "inland");
      const F = ["life"];
      add("life", "Gull flock home", [...F, "gulls"], "xz");
      add("life", "Fishing trawler (loop centre)", [...F, "trawler", "route"], "xz", { xKey: "cx", zKey: "cz", insp: [...F, "trawler"], trawler: true });
      add("life", "Hot-air balloon", [...F, "balloon"], "inland");
      add("life", "Iceberg (starting point)", [...F, "iceberg"], "out");
      W.life.cats.forEach((ct, i) => add("life", `Cat ${i + 1}: home`, [...F, "cats", i], "lake"));
      W.traffic.vessels.forEach((v, i) => {
        const p = ["traffic", "vessels", i, "route"];
        const name = `${v.type[0].toUpperCase()}${v.type.slice(1)} ${W.traffic.vessels.slice(0, i).filter((u) => u.type === v.type).length + 1}`;
        const o = { insp: ["traffic", "vessels", i], route: i };
        if (v.route.kind === "loop") add("traffic", `${name} (loop centre)`, p, "xz", { ...o, xKey: "cx", zKey: "cz" });
        else {
          add("traffic", `${name} (start)`, p, "xz", { ...o, xKey: "ax", zKey: "az" });
          add("traffic", `${name} (end)`, p, "xz", { ...o, xKey: "bx", zKey: "bz" });
        }
      });
      add("traffic", "Sightseeing plane (circle centre)", ["traffic", "sightseeingPlane"], "xz", { xKey: "cx", zKey: "cz", yKey: "alt", plane: true });
      const O = ["offshore"];
      W.offshore.buoys.forEach((b, i) => add("offshore", `Buoy: ${b.name || i + 1}`, [...O, "buoys", i], b.z !== undefined ? "xz" : "out"));
      add("offshore", "Weather buoy", [...O, "weatherBuoy"], "out");
      add("offshore", "Oil rig", [...O, "oilRig"], "out");
      add("offshore", "Wind farm (first turbine)", [...O, "windFarm"], "out", { xKey: "x0" });
      W.offshore.hillTurbines.xs.forEach((x, i) =>
        add("offshore", `Hill turbine ${i + 1}`, [...O, "hillTurbines", "xs"], "along", { xKey: i, zAt: (x) => shoreZ(x) - W.offshore.hillTurbines.inland, insp: [...O, "hillTurbines"] })
      );
      add("offshore", "Sea glow area", [...O, "glowBloom"], "out");
      W.offshore.kelp.beds.forEach((b, i) => {
        add("offshore", `Kelp: ${b.name || i + 1} (from)`, [...O, "kelp", "beds", i], "along", { xKey: "x0", zAt: (x) => shoreZ(x) + 40 });
        add("offshore", `Kelp: ${b.name || i + 1} (to)`, [...O, "kelp", "beds", i], "along", { xKey: "x1", zAt: (x) => shoreZ(x) + 40 });
      });
      handles.forEach((h, i) => (h.id = i));
    }
    // Where a handle is, from the world file
    function posOf(h) {
      const o = getAt(h.obj);
      const x = h.kind === "pair" ? o[0] : o[h.xKey];
      switch (h.kind) {
        case "xz":
          return { x, z: o[h.zKey || "z"] };
        case "inland":
          return { x, z: shoreZ(x) - o.inland };
        case "out":
          return { x, z: shoreZ(x) + o.out };
        case "depth":
          return { x, z: spotAtDepth(x, o.depth) };
        case "along":
          return { x, z: h.zAt(x) };
        case "pair":
          return { x, z: shoreZ(x) - o[1] };
        case "lake":
          return { x: LAKE.x + o.home[0], z: LAKE.z + o.home[1] };
      }
    }
    // Move a handle to x, z, writing the result back in the handle's own terms
    function moveTo(h, x, z) {
      const o = getAt(h.obj);
      switch (h.kind) {
        case "xz":
          o[h.xKey] = R(x);
          o[h.zKey || "z"] = R(z);
          break;
        case "inland":
          o.x = R(x);
          o.inland = R(shoreZ(o.x) - z);
          break;
        case "out":
          o[h.xKey] = R(x);
          o.out = R(z - shoreZ(o[h.xKey]));
          break;
        case "pair":
          o[0] = R(x);
          o[1] = R(shoreZ(o[0]) - z);
          break;
        case "lake":
          o.home = [R(x - LAKE.x), R(z - LAKE.z)];
          break;
        default: // depth, along: only x moves
          o[h.xKey] = R(x);
      }
    }
    const describeKind = {
      xz: "Placed at an exact x, z.",
      inland: "Placed by x and how far inland from the waterline it is — dragging updates both.",
      out: "Placed by x and how far out to sea from the waterline it is — dragging updates both.",
      depth: "Placed by x and a water depth: it sits at the first spot out from the shore that is this deep. Dragging moves it along the coast; change 'depth' to move it further out.",
      along: "Only its x (along the coast) is stored, so dragging slides it along the coast.",
      pair: "A river point: [x, metres inland].",
      lake: "Placed by its distance from the middle of the clifftop lake.",
    };

    // ================= Pins in the 3D view =================
    const pinGroup = new THREE.Group();
    scene.add(pinGroup);
    const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
    const pins = [];
    function makePins() {
      for (const p of pins) {
        pinGroup.remove(p.g);
        p.label.remove();
      }
      pins.length = 0;
      for (const h of handles) {
        const col = new THREE.Color(SECTIONS[h.section].color);
        const head = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95, fog: false }));
        head.renderOrder = 10;
        const lineGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.8, fog: false }));
        line.renderOrder = 9;
        const g = new THREE.Group();
        g.add(line, head);
        pinGroup.add(g);
        const label = document.createElement("div");
        label.textContent = h.label;
        labelsEl.appendChild(label);
        pins.push({ h, g, head, line, label, pos: new THREE.Vector3(), ground: 0, sx: 0, sy: 0, on: false });
      }
      placePins();
    }
    function placePin(p) {
      const { x, z } = posOf(p.h);
      const g = landHeight(x, z);
      const top = p.h.yKey ? getAt(p.h.obj)[p.h.yKey] : Math.max(g, 0) + 10;
      p.ground = g;
      p.pos.set(x, top, z);
      p.g.position.set(x, 0, z);
      p.line.geometry.attributes.position.setY(0, g);
      p.line.geometry.attributes.position.setY(1, top);
      p.line.geometry.attributes.position.needsUpdate = true;
      p.line.geometry.computeBoundingSphere();
      p.head.position.y = top;
    }
    function placePins() {
      pins.forEach(placePin);
      drawRoutes();
    }
    // Boat routes drawn as lines on the sea, the plane's circle in the air
    const routeGroup = new THREE.Group();
    scene.add(routeGroup);
    function drawRoutes() {
      while (routeGroup.children.length) {
        const c = routeGroup.children.pop();
        c.geometry.dispose();
      }
      const add = (pts, color, y = 1.5) => {
        const geo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, y, z)));
        const l = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 14, gapSize: 9, depthTest: false, transparent: true, opacity: 0.85, fog: false }));
        l.computeLineDistances();
        l.renderOrder = 8;
        routeGroup.add(l);
      };
      const ellipse = (cx, cz, rx, rz) => Array.from({ length: 97 }, (_, k) => [cx + Math.cos((k / 96) * 6.2832) * rx, cz + Math.sin((k / 96) * 6.2832) * rz]);
      WORLD.traffic.vessels.forEach((v, i) => {
        const r = v.route;
        const color = sel && sel.route === i ? 0xffffff : 0x5aa9ff;
        if (r.kind === "loop") add(ellipse(r.cx, r.cz, r.rx, r.rz), color);
        else add([[r.ax, r.az], [r.bx, r.bz]], color);
      });
      const tw = WORLD.life.trawler.route;
      if (!view.hidden.includes("life")) add(ellipse(tw.cx, tw.cz, tw.rx, tw.rz), sel && sel.trawler ? 0xffffff : 0xffd84a);
      const pl = WORLD.traffic.sightseeingPlane;
      add(ellipse(pl.cx, pl.cz, pl.r, pl.r), sel && sel.plane ? 0xffffff : 0x9fc9ff, pl.alt);
      routeGroup.visible = true;
      if (view.hidden.includes("traffic")) for (const l of routeGroup.children) l.visible = l.material.color.getHex() === 0xffd84a;
    }

    // ================= Side panel: the list =================
    let sel = null; // selected handle
    let selSection = null; // or a whole section
    function buildTree() {
      const bySec = {};
      for (const h of handles) (bySec[h.section] = bySec[h.section] || []).push(h);
      treeEl.innerHTML = "";
      for (const [key, s] of Object.entries(SECTIONS)) {
        if (!WORLD[key]) continue;
        const head = document.createElement("div");
        head.className = "sec" + (view.closed.includes(key) ? " closed" : "");
        head.dataset.sec = key;
        const hidden = view.hidden.includes(key);
        head.innerHTML = `<span class="dot" style="background:${s.color}"></span><span>${s.label}</span><span class="eye" data-eye="${key}" title="Show or hide these pins">${hidden ? "🙈" : "👁"}</span>`;
        const items = document.createElement("div");
        items.className = "items";
        const all = document.createElement("div");
        all.className = "item";
        all.dataset.secall = key;
        all.innerHTML = "<i>All settings…</i>";
        items.appendChild(all);
        for (const h of bySec[key] || []) {
          const it = document.createElement("div");
          it.className = "item";
          it.dataset.h = h.id;
          it.textContent = h.label;
          items.appendChild(it);
        }
        treeEl.append(head, items);
      }
      markTree();
    }
    function markTree() {
      for (const el of treeEl.querySelectorAll(".sel")) el.classList.remove("sel");
      if (sel) {
        const it = treeEl.querySelector(`[data-h="${sel.id}"]`);
        if (it) it.classList.add("sel");
      } else if (selSection) {
        const it = treeEl.querySelector(`[data-secall="${selSection}"]`);
        if (it) it.classList.add("sel");
      }
    }
    treeEl.addEventListener("click", (e) => {
      const eye = e.target.closest("[data-eye]");
      if (eye) {
        const k = eye.dataset.eye;
        view.hidden = view.hidden.includes(k) ? view.hidden.filter((x) => x !== k) : [...view.hidden, k];
        saveView();
        buildTree();
        return;
      }
      const sec = e.target.closest(".sec");
      if (sec) {
        const k = sec.dataset.sec;
        view.closed = view.closed.includes(k) ? view.closed.filter((x) => x !== k) : [...view.closed, k];
        sec.classList.toggle("closed");
        saveView();
        return;
      }
      const all = e.target.closest("[data-secall]");
      if (all) return selectSection(all.dataset.secall);
      const it = e.target.closest("[data-h]");
      if (it) {
        select(handles[+it.dataset.h]);
        focusOn(sel);
      }
    });

    // ================= Side panel: the settings of what's selected =================
    const HEX_KEYS = new Set(["top", "base", "light"]);
    // Colour codes (0xRRGGBB): buoy colours, and any 'color' / 'colors' entry that's a whole number
    const isHexColor = (v, key, path) =>
      HEX_KEYS.has(key) || (Number.isInteger(v) && v > 255 && /^colou?rs?$/i.test(typeof key === "number" ? String(path[path.length - 1]) : String(key)));
    const isUnitColor = (v, key, path) =>
      Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && n >= 0 && n <= 1) && /colou?r/i.test(path.join(".") + "." + key);
    const toHex = (n) => "#" + Math.round(n).toString(16).padStart(6, "0");
    const unitToHex = (c) => "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
    const hexToUnit = (h) => [1, 3, 5].map((i) => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3));
    const nice = (k) => String(k).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
    function field(parent, obj, key, path) {
      const v = obj[key];
      const p = [...path, key];
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.textContent = typeof key === "number" ? `#${key + 1}` : nice(key);
      name.title = p.join(".");
      if (typeof v === "number" && isHexColor(v, key, path)) {
        const inp = document.createElement("input");
        inp.type = "color";
        inp.value = toHex(v);
        inp.addEventListener("change", () => {
          obj[key] = parseInt(inp.value.slice(1), 16);
          commit(`${nice(key)} colour changed`);
        });
        row.append(name, inp);
      } else if (typeof v === "number") {
        const inp = document.createElement("input");
        inp.type = "number";
        inp.step = "any";
        inp.value = v;
        inp.addEventListener("change", () => {
          const n = parseFloat(inp.value);
          if (!Number.isFinite(n)) return (inp.value = obj[key]);
          obj[key] = n;
          placePins();
          commit();
        });
        row.append(name, inp);
      } else if (typeof v === "string") {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.value = v;
        inp.addEventListener("change", () => {
          obj[key] = inp.value;
          commit();
          if (key === "name" || key === "id" || key === "type") {
            buildHandles();
            makePins();
            buildTree();
          }
        });
        row.append(name, inp);
      } else if (typeof v === "boolean") {
        const inp = document.createElement("input");
        inp.type = "checkbox";
        inp.checked = v;
        inp.addEventListener("change", () => {
          obj[key] = inp.checked;
          commit();
        });
        row.append(name, inp);
      } else if (isUnitColor(v, key, path)) {
        const inp = document.createElement("input");
        inp.type = "color";
        inp.value = unitToHex(v);
        inp.addEventListener("change", () => {
          obj[key] = hexToUnit(inp.value);
          commit(`${nice(key)} colour changed`);
        });
        row.append(name, inp);
      } else if (Array.isArray(v) && v.every((n) => typeof n === "number") && v.length <= 4) {
        const box = document.createElement("div");
        box.className = "nums";
        v.forEach((n, i) => {
          const inp = document.createElement("input");
          inp.type = "number";
          inp.step = "any";
          inp.value = n;
          inp.addEventListener("change", () => {
            const m = parseFloat(inp.value);
            if (!Number.isFinite(m)) return (inp.value = v[i]);
            v[i] = m;
            placePins();
            commit();
          });
          box.appendChild(inp);
        });
        row.append(name, box);
      } else if (v && typeof v === "object") {
        const fs = document.createElement("fieldset");
        const lg = document.createElement("legend");
        lg.textContent = typeof key === "number" ? (v.name || v.id || v.type || `#${key + 1}`) : nice(key);
        fs.appendChild(lg);
        for (const k of Array.isArray(v) ? v.keys() : Object.keys(v)) field(fs, v, k, p);
        parent.appendChild(fs);
        return;
      } else return;
      parent.appendChild(row);
    }
    function showInspector() {
      inspEl.innerHTML = "";
      if (!sel && !selSection) {
        inspEl.innerHTML = `<h3>Nothing selected</h3><p class="hint">Click a pin in the world, or pick something from the list on the left.
          Move it with the arrows that appear: red X along the coast, blue Z out to sea, the yellow square or white ball to slide it freely. Every number and colour of the selected thing appears here.</p>
          <p class="hint">Changes are kept in this browser until you press <b>Save world.js</b>. The game itself only uses the saved file.</p>`;
        return;
      }
      const path = sel ? sel.insp || sel.obj : [selSection];
      const obj = getAt(path);
      const h3 = document.createElement("h3");
      h3.textContent = sel ? sel.label : SECTIONS[selSection].label;
      const pth = document.createElement("div");
      pth.className = "path";
      pth.textContent = "world." + path.join(".");
      inspEl.append(h3, pth);
      if (sel) {
        const hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent = (sel.note ? sel.note + " " : "") + describeKind[sel.kind];
        inspEl.appendChild(hint);
      }
      if (Array.isArray(obj) && obj.every((n) => typeof n === "number")) {
        obj.forEach((_, i) => field(inspEl, obj, i, path));
        return;
      }
      for (const k of Array.isArray(obj) ? obj.keys() : Object.keys(obj)) field(inspEl, obj, k, path);
    }
    function select(h) {
      sel = h;
      selSection = null;
      view.sel = h ? { label: h.label } : null;
      saveView();
      markTree();
      showInspector();
      drawRoutes();
      if (h) {
        const it = treeEl.querySelector(`[data-h="${h.id}"]`);
        if (it) {
          const sec = it.parentElement.previousElementSibling;
          if (sec.classList.contains("closed")) {
            sec.classList.remove("closed");
            view.closed = view.closed.filter((x) => x !== sec.dataset.sec);
          }
          it.scrollIntoView({ block: "nearest" });
        }
      }
    }
    function selectSection(key) {
      sel = null;
      selSection = key;
      view.sel = { section: key };
      saveView();
      markTree();
      showInspector();
      drawRoutes();
    }

    // ================= Camera =================
    camera.rotation.order = "YXZ";
    camera.far = 9000;
    camera.updateProjectionMatrix();
    const keysDown = new Set();
    function applyCamera() {
      camera.position.set(view.x, view.y, view.z);
      camera.rotation.set(view.pitch, view.yaw, 0);
    }
    function focusOn(h) {
      if (!h) return;
      const p = pins.find((q) => q.h === h);
      if (!p) return;
      const back = 160;
      view.x = p.pos.x + Math.sin(view.yaw) * back;
      view.z = p.pos.z + Math.cos(view.yaw) * back;
      view.y = Math.max(p.pos.y, landHeight(view.x, view.z) + 5) + 70;
      const dx = p.pos.x - view.x;
      const dz = p.pos.z - view.z;
      view.pitch = Math.atan2(p.pos.y - view.y, Math.hypot(dx, dz));
      applyCamera();
      saveView();
    }
    function flyCamera(dt) {
      let fx = 0;
      let fz = 0;
      let up = 0;
      if (keysDown.has("KeyW") || keysDown.has("ArrowUp")) fz += 1;
      if (keysDown.has("KeyS") || keysDown.has("ArrowDown")) fz -= 1;
      if (keysDown.has("KeyA") || keysDown.has("ArrowLeft")) fx -= 1;
      if (keysDown.has("KeyD") || keysDown.has("ArrowRight")) fx += 1;
      if (keysDown.has("KeyE")) up += 1;
      if (keysDown.has("KeyQ")) up -= 1;
      if (!fx && !fz && !up) return;
      const ground = Math.max(landHeight(view.x, view.z), 0);
      const speed = Math.max(20, (view.y - ground) * 1.2) * (keysDown.has("ShiftLeft") || keysDown.has("ShiftRight") ? 4 : 1);
      const s = Math.sin(view.yaw);
      const c = Math.cos(view.yaw);
      view.x += (-s * fz + c * fx) * speed * dt;
      view.z += (-c * fz - s * fx) * speed * dt;
      view.y = Math.max(ground + 1.5, view.y + up * speed * dt);
      applyCamera();
      viewDirty = true;
    }
    let viewDirty = false;
    setInterval(() => viewDirty && (saveView(), (viewDirty = false)), 1000);

    // ================= Mouse and keys =================
    // The editor takes all input on the 3D view, so the game's own controls never fire
    const canvasEl = renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let drag = null; // { kind: "look" | "gizmo", ... }
    function pinAt(cx, cy) {
      let best = null;
      let bd = 16;
      for (const p of pins) {
        if (!p.on) continue;
        const d = Math.hypot(p.sx - cx, p.sy - cy);
        if (d < bd) (bd = d), (best = p);
      }
      return best;
    }
    function setRay(cx, cy) {
      const r = canvasEl.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray;
    }
    // Where the pointer's ray meets a plane through 'origin' with normal 'n'
    function rayOnPlane(cx, cy, origin, n) {
      const r = setRay(cx, cy);
      const dn = r.direction.dot(n);
      if (Math.abs(dn) < 1e-5) return null;
      const t = origin.clone().sub(r.origin).dot(n) / dn;
      if (t < 0) return null;
      return r.origin.clone().addScaledVector(r.direction, t);
    }
    const onCanvas = (e) => e.target === canvasEl;
    const swallow = (e) => {
      e.stopImmediatePropagation();
    };

    // ----- The move gizmo: red X (along the coast), blue Z (out to sea), green Y (height, where a thing
    // has one), a square to slide freely over the ground, and a white ball in the middle that does too.
    // Things stored by x alone (they follow the coast) only get the X arrow.
    const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
    const AXIS_COLOR = { x: 0xf0454f, y: 0x7bd334, z: 0x3c8cff, xz: 0xf5c542, free: 0xffffff };
    const gizmo = new THREE.Group();
    gizmo.visible = false;
    scene.add(gizmo);
    const gizmoParts = []; // { axis, mesh (what you see), hit (what you click), base colour }
    const gmat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity, fog: false, side: THREE.DoubleSide });
    function gizmoArrow(axis) {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.82, 8).translate(0, 0.41, 0), gmat(AXIS_COLOR[axis]));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 14).translate(0, 0.92, 0), gmat(AXIS_COLOR[axis]));
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.05, 6).translate(0, 0.52, 0), gmat(0xffffff, 0));
      g.add(shaft, tip, hit);
      if (axis === "x") g.rotation.z = -Math.PI / 2;
      if (axis === "z") g.rotation.x = Math.PI / 2;
      for (const m of [shaft, tip, hit]) m.renderOrder = 20;
      gizmo.add(g);
      gizmoParts.push({ axis, group: g, meshes: [shaft, tip], hit });
    }
    for (const a of ["x", "y", "z"]) gizmoArrow(a);
    {
      const sq = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2).rotateX(-Math.PI / 2).translate(0.3, 0, 0.3), gmat(AXIS_COLOR.xz, 0.75));
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26).rotateX(-Math.PI / 2).translate(0.3, 0, 0.3), gmat(0xffffff, 0));
      sq.renderOrder = hit.renderOrder = 20;
      gizmo.add(sq, hit);
      gizmoParts.push({ axis: "xz", group: sq, meshes: [sq], hit });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), gmat(AXIS_COLOR.free, 0.9));
      const bhit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), gmat(0xffffff, 0));
      ball.renderOrder = bhit.renderOrder = 21;
      gizmo.add(ball, bhit);
      gizmoParts.push({ axis: "free", group: ball, meshes: [ball], hit: bhit });
    }
    const axesFor = (h) => (h.kind === "depth" || h.kind === "along" ? ["x"] : ["x", "z", "xz", "free", ...(h.yKey ? ["y"] : [])]);
    const gizmoPos = new THREE.Vector3();
    function placeGizmo() {
      const p = sel && pins.find((q) => q.h === sel);
      gizmo.visible = !!p && !view.hidden.includes(sel.section);
      if (!gizmo.visible) return;
      const allowed = axesFor(sel);
      gizmoPos.set(p.pos.x, sel.yKey ? p.pos.y : Math.max(p.ground, 0) + 0.5, p.pos.z);
      gizmo.position.copy(gizmoPos);
      gizmo.scale.setScalar(camera.position.distanceTo(gizmoPos) * 0.22); // the same size on screen
      for (const part of gizmoParts) {
        const on = allowed.includes(part.axis);
        part.group.visible = on;
        part.hit.visible = on;
        const hot = (drag && drag.kind === "gizmo" ? drag.axis : hover) === part.axis;
        for (const m of part.meshes) m.material.color.set(hot ? 0xffffff : AXIS_COLOR[part.axis]);
        if (part.axis === "free") part.meshes[0].material.color.set(hot ? 0xf5c542 : 0xffffff);
      }
    }
    let hover = null;
    function gizmoAt(cx, cy) {
      if (!gizmo.visible) return null;
      setRay(cx, cy);
      gizmo.updateMatrixWorld(true);
      const hits = ray.intersectObjects(gizmoParts.filter((p) => p.hit.visible).map((p) => p.hit), false);
      if (!hits.length) return null;
      // the ball wins when it's under the pointer, then the arrows, then the square
      const order = ["free", "x", "y", "z", "xz"];
      return gizmoParts.filter((p) => hits.some((h) => h.object === p.hit)).sort((a, b) => order.indexOf(a.axis) - order.indexOf(b.axis))[0].axis;
    }
    function startGizmo(axis, cx, cy) {
      const o = gizmoPos.clone();
      const start = posOf(sel);
      const startY = sel.yKey ? getAt(sel.obj)[sel.yKey] : 0;
      let n;
      if (axis === "xz" || axis === "free") n = new THREE.Vector3(0, 1, 0);
      else {
        // a plane through the axis, turned to face the camera as much as it can
        const a = AXES[axis];
        const v = camera.position.clone().sub(o);
        n = v.sub(a.clone().multiplyScalar(v.dot(a))).normalize();
      }
      const p0 = rayOnPlane(cx, cy, o, n);
      if (!p0) return;
      drag = { kind: "gizmo", axis, n, o, p0, start, startY, h: sel, moved: false, x0: cx, y0: cy };
    }
    function moveGizmo(cx, cy) {
      const d = drag;
      const p = rayOnPlane(cx, cy, d.o, d.n);
      if (!p) return;
      const delta = p.sub(d.p0);
      let x = d.start.x;
      let z = d.start.z;
      if (d.axis === "x") x += delta.x;
      else if (d.axis === "z") z += delta.z;
      else if (d.axis === "y") {
        getAt(d.h.obj)[d.h.yKey] = Math.max(5, R(d.startY + delta.y));
      } else {
        x += delta.x;
        z += delta.z;
      }
      if (d.axis !== "y") moveTo(d.h, x, z);
      // pins sharing the same object (both ends of a road, a loop's centre…) move together
      for (const q of pins) if (q.h.obj.join() === d.h.obj.join()) placePin(q);
      if (d.h.section === "traffic" || d.h.trawler) drawRoutes();
      const now = posOf(d.h);
      $('[data-v="info"]').textContent = `x ${R(now.x)}, z ${R(now.z)}` + (d.h.yKey ? `, height ${getAt(d.h.obj)[d.h.yKey]}` : "");
    }

    EDIT_HANDLERS.pointerdown = (
      (e) => {
        if (!onCanvas(e)) return;
        swallow(e);
        e.preventDefault();
        const axis = e.button === 0 ? gizmoAt(e.clientX, e.clientY) : null;
        const p = e.button === 0 && !axis ? pinAt(e.clientX, e.clientY) : null;
        if (axis) startGizmo(axis, e.clientX, e.clientY);
        else if (p) {
          if (sel !== p.h) select(p.h);
          drag = { kind: "pick", x0: e.clientX, y0: e.clientY, moved: false };
        } else drag = { kind: "look", x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false };
        canvasEl.setPointerCapture && canvasEl.setPointerCapture(e.pointerId);
      }
    );
    window.addEventListener(
      "pointermove",
      (e) => {
        if (!drag) {
          if (onCanvas(e)) {
            swallow(e);
            hover = gizmoAt(e.clientX, e.clientY);
            canvasEl.style.cursor = hover ? "move" : pinAt(e.clientX, e.clientY) ? "pointer" : "grab";
          }
          return;
        }
        swallow(e);
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 3) drag.moved = true;
        if (drag.kind === "look") {
          view.yaw -= (e.clientX - drag.x) * 0.0042;
          view.pitch = clamp(view.pitch - (e.clientY - drag.y) * 0.0042, -1.55, 1.2);
          drag.x = e.clientX;
          drag.y = e.clientY;
          applyCamera();
          viewDirty = true;
        } else if (drag.kind === "gizmo" && drag.moved) {
          canvasEl.style.cursor = "grabbing";
          moveGizmo(e.clientX, e.clientY);
        }
      },
      true
    );
    const endDrag = (e) => {
      if (!drag) return;
      swallow(e);
      const d = drag;
      drag = null;
      if (d.kind === "gizmo" && d.moved) {
        showInspector();
        commit(`Moved ${d.h.label}`);
      } else if (d.kind === "look" && !d.moved && e.button === 0) select(null);
    };
    window.addEventListener("pointerup", endDrag, true);
    window.addEventListener("pointercancel", endDrag, true);
    for (const t of ["mousedown", "mouseup", "click", "dblclick", "touchstart", "touchend"])
      window.addEventListener(t, (e) => onCanvas(e) && swallow(e), true);
    window.addEventListener("contextmenu", (e) => onCanvas(e) && (swallow(e), e.preventDefault()), true);
    window.addEventListener(
      "wheel",
      (e) => {
        if (!onCanvas(e)) return;
        swallow(e);
        e.preventDefault();
        const ground = Math.max(landHeight(view.x, view.z), 0);
        const step = Math.max(8, (view.y - ground) * 0.25) * Math.sign(-e.deltaY);
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
        view.x += dir.x * step;
        view.y = Math.max(ground + 1.5, view.y + dir.y * step);
        view.z += dir.z * step;
        applyCamera();
        viewDirty = true;
      },
      { capture: true, passive: false }
    );
    EDIT_HANDLERS.keydown = (
      (e) => {
        swallow(e);
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.code === "KeyS") {
          e.preventDefault();
          return saveWorld();
        }
        if (ctrl && e.code === "KeyZ") {
          e.preventDefault();
          return e.shiftKey ? undoRedo(EDIT_KEYS.redo, EDIT_KEYS.undo) : undoRedo(EDIT_KEYS.undo, EDIT_KEYS.redo);
        }
        if (ctrl && e.code === "KeyY") {
          e.preventDefault();
          return undoRedo(EDIT_KEYS.redo, EDIT_KEYS.undo);
        }
        if (ctrl) return; // leave browser shortcuts (reload, zoom…) alone
        if (e.code === "KeyF") focusOn(sel);
        if (e.code === "KeyB") rebuild();
        if (e.code === "Escape") select(null);
        if (/^(Key[WASDQE]|Arrow|Shift)/.test(e.code)) {
          keysDown.add(e.code);
          e.preventDefault();
        }
      }
    );
    EDIT_HANDLERS.keyup = (e) => keysDown.delete(e.code);
    window.addEventListener("blur", () => keysDown.clear());

    // ================= Toolbar =================
    const opt = (k) => $(`[data-o="${k}"]`);
    opt("auto").checked = view.auto;
    opt("fog").checked = view.fog;
    opt("labels").checked = view.labels;
    opt("animate").checked = view.animate;
    opt("time").value = view.time;
    const showTime = () => ($('[data-v="time"]').textContent = formatClock(view.time));
    showTime();
    $("#ed-top").addEventListener("input", (e) => {
      const k = e.target.dataset.o;
      if (!k) return;
      view[k] = k === "time" ? +e.target.value : e.target.checked;
      if (k === "time") showTime();
      if (k === "auto") {
        updateStatus();
        if (view.auto && pending) rebuildSoon();
      }
      saveView();
    });
    $("#ed-top").addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]");
      if (!a) return;
      ({
        save: saveWorld,
        undo: () => undoRedo(EDIT_KEYS.undo, EDIT_KEYS.redo),
        redo: () => undoRedo(EDIT_KEYS.redo, EDIT_KEYS.undo),
        rebuild,
        discard: () => {
          if (worldJSON() === WORLD_FILE_JSON) return say("Nothing to discard: this is the saved world.js");
          if (!confirm("Throw away all unsaved changes and go back to the saved world.js?")) return;
          const undo = lsGet(EDIT_KEYS.undo, []);
          undo.push(worldJSON());
          localStorage.setItem(EDIT_KEYS.undo, JSON.stringify(undo));
          localStorage.removeItem(EDIT_KEYS.draft);
          rebuild();
        },
        play: () => window.open("index.html", "_blank"),
      })[a.dataset.a]();
    });

    // ================= Saving data/world.js =================
    // Written as a readable script with the same notes as the hand-written file
    const NOTES = {
      "": `// The world file: WHERE things are and HOW they're set up — positions, sizes and lists.
// The js/ files hold how things are built and how they behave; they read their placements from here.
// Edit numbers freely (by hand, or with the editor: open editor.html). The game must be reloaded to see changes.
//
// Coordinates: x runs along the coast (west −, east +), z runs out to sea (inland −, out to sea +).
// The waterline sits near z = coast.shoreZ, pushed out by headlands and in by bays.
// Many places are given by x plus a rule instead of a fixed z: "inland" = metres inland from the
// waterline at that x, "out" = metres out to sea from it, "depth" = the first spot out from the shore
// where the sea is that many metres deep.
//
// Kept as a script (not .json) so the game still works when opened straight from disk.`,
      coast: "===== The coastline =====",
      "coast.shoreZ": "where the beach begins",
      "coast.lighthouseX": "the lighthouse headland (its bend is the first entry in 'bends')",
      "coast.coveX": "the sandy cove with the harbor, where every expedition starts",
      "coast.bends": "Headlands jut out to sea (+ metres), bays cut in (−)",
      "coast.cliffSetbacks": "Beaches at the foot of the cliffs (+ metres of sand before they rise), or cliffs straight into the sea (−)",
      "coast.cliffCoasts": "Stretches that are always cliffs",
      islands: "===== Little islands offshore =====",
      landmarks: "===== Landmarks on the coast =====",
      "landmarks.seaArch": "out = metres out from the waterline",
      "landmarks.grottoes": "x of each chalk grotto at East Head",
      "landmarks.creekX": "the creek down to Bridge Bay, crossed by the coast road's bridge",
      "landmarks.coastRoad": "the eastern coast road with the bridge",
      "landmarks.lighthouseInland": "the lighthouse stands this far back from the tip of its headland",
      "landmarks.river": "The river: main channel and two mouths, points as [x, metres inland]",
      places: "===== Hidden and underwater places =====",
      "places.freighter": "rests on the sea floor at this exact spot",
      inland: "===== Up on the land: roads, villages, the pier =====",
      "inland.westRoad": "The west coast road runs along the clifftop from x0 to x1: 'inland' metres from the waterline\n// where there are no cliffs, and 'edgeGap' metres back from the cliff edge where there are",
      "inland.villages": "Hill villages, each reached by a winding lane",
      "inland.lanes": "The lanes up to the villages, in the same order. Each starts either on the west coast road\n// (roadX = where along it) or at a spot given by x and inland",
      "inland.laneWiggle": "how far the lanes wind from side to side, metres",
      "inland.powerPoles": "along the west road: every 'every' road points (~2 m each)",
      "inland.streetLamps": "and the last stretch of each lane into its village",
      "inland.radioMasts": "Radio masts: one on the highest ground found in each stretch, between radioMastInland metres inland",
      "inland.funPier": "the pleasure pier below the clifftop town",
      clifftop: "===== The clifftop on West Point =====",
      beach: "===== On the beaches =====",
      "beach.horseRide": "riders go back and forth along this stretch",
      traffic:
        "===== Boats and planes =====\n// Routes are loops (an ellipse: centre cx, cz and radii rx, rz) or lines (sailed back and forth\n// between a and b). Speed in m/s; bob = how much it rocks on the waves (1 = a small boat)",
      "traffic.sightseeingPlane": "circles the bay",
      offshore: "===== Out at sea =====\n// 'out' = metres out to sea from the waterline at that x",
      "offshore.harborChannel": "The harbor channel: red buoys to port, green to starboard, at these distances past the pier end",
      "offshore.windFarm": "Offshore wind farm: rows of turbines, each row shifted by 'stagger'",
      "offshore.hillTurbines": "Wind turbines on the eastern hills (skipped where the ground is lower than minGround)",
      "offshore.glowBloom": "where the sea glows blue at night",
      "offshore.kelp.beds": "Along the coast. Kelp needs rock to hold on to, so it only grows where the sea floor is rocky\n// (below the cliffs), never on sand",
      "offshore.kelp.islands": "Around the rocky islands: a ring of kelp in the shallows all the way round",
      "offshore.kelp.aroundSeaStacks": "plants clinging round the foot of each sea stack and the arch",
      "offshore.kelp": "Kelp forests along the rocky coast: tall seaweed from the sea floor to the surface, swaying with\n// the waves. Each bed runs from x0 to x1, in water between depth[0] and depth[1] metres deep",
      grass: "===== Grass, fields and wild flowers (drawn by the terrain shader) =====\n// Colours are [red, green, blue] from 0 to 1",
      "grass.height": "Blade height in metres for each kind of ground",
      "grass.bladeSizes": "metres between blades: far, middle, close up (smaller = denser)",
      "grass.shade": "how dark it is down between the blades (0 = black)",
      "grass.maxDistance": "metres: beyond this the ground is plain colour",
      "grass.meadowColors": "natural grass varies between these",
      "grass.flowers.drifts": "lower numbers = more and bigger drifts",
      "grass.flowers.density": "0 = every spot in a drift has a flower, 1 = none",
      "coast.seaStacks": "Sea stacks: rock pillars standing in the sea ('out' metres from the waterline, radius r, height h)",
      "inland.town": "the clifftop town: its stretch of coast, and its church",
      "beach.sunbathers": "on the harbor cove beach",
      "beach.beachWreck": "the rusting wreck on the sand east of the river delta",
      life:
        "===== Animals, people and things on the move =====\n// Colours here are colour codes (0xRRGGBB). Wild animals that turn up near the boat (whales, orcas,\n// dolphins, sharks, mantas, jellyfish, pelicans) appear around you wherever you are, so only their\n// numbers are here.",
      "life.islands": "how many on the islands",
      "life.dogs": "one dog per colour, walking round the lake",
      "life.meadowGoats": "grazing by the bike track",
      "life.cyclists": "one rider per colour, on the west coast road",
      "life.gulls": "the gull flock's home over the bay",
      "life.trawler": "fishing boat, trailed by gulls",
      "life.balloon": "Hot-air balloon (mornings): sways along the coast around x, 'inland' from the shore, 'alt' metres up",
      "life.iceberg": "The stray iceberg drifts east 'speed' m/s, 'out' metres off the coast, starting at x",
    };
    const ident = /^[A-Za-z_$][\w$]*$/;
    const num = (v, key) =>
      HEX_KEYS.has(key) || (Number.isInteger(v) && v > 255 && /^colou?rs?$/i.test(String(key))) ? "0x" + Math.round(v).toString(16).padStart(6, "0") : String(+v.toFixed(5));
    function inline(v, key) {
      if (typeof v === "number") return num(v, key);
      if (typeof v === "string") return JSON.stringify(v);
      if (typeof v === "boolean" || v === null) return String(v);
      if (Array.isArray(v)) return "[" + v.map((x) => inline(x, key)).join(", ") + "]"; // (elements keep the list's name: 'colors')
      return "{ " + Object.entries(v).map(([k, x]) => `${ident.test(k) ? k : JSON.stringify(k)}: ${inline(x, k)}`).join(", ") + " }";
    }
    const depthOf = (v) => (v && typeof v === "object" ? 1 + Math.max(0, ...Object.values(v).map(depthOf)) : 0);
    function block(v, ind, path, key) {
      const one = inline(v, key);
      if (typeof v !== "object" || v === null || (one.length + ind.length < 112 && depthOf(v) <= 3 && path.length > 1)) return one;
      const pad = ind + "  ";
      const lines = [];
      if (Array.isArray(v)) {
        v.forEach((x) => lines.push(pad + block(x, pad, [...path, "[]"], key) + ","));
        return "[\n" + lines.join("\n") + "\n" + ind + "]";
      }
      for (const [k, x] of Object.entries(v)) {
        const p = [...path, k].filter((s) => s !== "[]").join(".");
        const note = NOTES[p];
        const line = `${pad}${ident.test(k) ? k : JSON.stringify(k)}: ${block(x, pad, [...path, k], k)},`;
        if (note && (note.includes("\n") || note.startsWith("=") || line.length + note.length > 130)) {
          if (path.length === 0 && lines.length) lines.push("");
          lines.push(`${pad}// ${note}`, line);
        } else lines.push(note ? `${line} // ${note}` : line);
      }
      return "{\n" + lines.join("\n") + "\n" + ind + "}";
    }
    function serializeWorld() {
      return NOTES[""] + "\n\nconst WORLD = " + block(WORLD, "", [], "") + ";\n";
    }
    // Remember the chosen file between rebuilds (the browser keeps the permission per visit)
    const idb = (mode, fn) =>
      new Promise((res, rej) => {
        const req = indexedDB.open("coastline-editor", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction("kv", mode);
          const r = fn(tx.objectStore("kv"));
          tx.oncomplete = () => res(r && r.result);
          tx.onerror = () => rej(tx.error);
        };
      });
    async function saveWorld() {
      const text = serializeWorld();
      try {
        new Function(text + "\nreturn WORLD;")(); // make sure what we write loads
      } catch (err) {
        return say("Couldn't save: the world file wouldn't load (" + err.message + ")", 6);
      }
      if (window.showSaveFilePicker) {
        try {
          let h = await idb("readonly", (s) => s.get("worldFile")).catch(() => null);
          if (h && (await h.requestPermission({ mode: "readwrite" })) !== "granted") h = null;
          if (!h) {
            say("Pick the game's data/world.js to save over it", 5);
            h = await showSaveFilePicker({ suggestedName: "world.js", types: [{ description: "Coastline world file", accept: { "text/javascript": [".js"] } }] });
            await idb("readwrite", (s) => s.put(h, "worldFile")).catch(() => {});
          }
          const w = await h.createWritable();
          await w.write(text);
          await w.close();
          localStorage.setItem("coastline-world-saved", worldJSON());
          updateStatus();
          say(`Saved to ${h.name}`);
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return say("Not saved");
          console.warn(err);
        }
      }
      // No direct file access in this browser: download it instead
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
      a.download = "world.js";
      a.click();
      localStorage.setItem("coastline-world-saved", worldJSON());
      updateStatus();
      say("Downloaded world.js — put it in the game's data folder, replacing the old one", 7);
    }

    // ================= Drawing =================
    const v3 = new THREE.Vector3();
    let lastT = performance.now();
    let t = 0;
    let animOK = true;
    function frame(now) {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      flyCamera(dt);
      t += dt;
      shared.uTime.value = t;
      state.timeOfDay = view.time;
      const env = applyEnvironment(view.time);
      if (!view.fog) {
        scene.fog.near = 6000;
        scene.fog.far = 12000;
        haze.uHazeNear.value = 6000;
        haze.uHazeFar.value = 12000;
      }
      if (view.animate && animOK) {
        try {
          updateLandmarks(dt, t, env);
          updateSights(dt, t, env);
          updateDolphins(dt, t);
          updateWhale(dt, t);
          updateBirds(dt, t, env.light);
          updateAirplane(dt, t, env.lightLevel);
          updateLighthouse(dt, env.lampsOn);
        } catch (err) {
          animOK = false;
          console.warn("Editor: animation stopped", err);
        }
      }
      // what the game's render() does for the water, sky and lights, centred on the camera
      const cx = Math.round(camera.position.x / WATER_STEP) * WATER_STEP;
      const cz = Math.round(camera.position.z / WATER_STEP) * WATER_STEP;
      water.position.set(cx, 0, cz);
      farOcean.position.set(cx, 0, cz);
      sky.position.copy(camera.position);
      waterUniforms.uCamPos.value.copy(camera.position);
      v3.set(camera.position.x, 0, camera.position.z);
      sunLight.position.copy(v3).addScaledVector(shared.uSunDir.value, 100);
      sunLight.target.position.copy(v3);
      moonLight.position.copy(v3).addScaledVector(shared.uSunDir.value, -100);
      moonLight.target.position.copy(v3);

      // pins: the same size on screen at any distance; labels follow them
      const w = window.innerWidth;
      const hgt = window.innerHeight;
      for (const p of pins) {
        const shown = !view.hidden.includes(p.h.section);
        p.g.visible = shown;
        const d = camera.position.distanceTo(p.pos);
        const isSel = p.h === sel;
        p.head.scale.setScalar(d * (isSel ? 0.011 : 0.007));
        p.head.material.color.set(isSel ? "#ffffff" : SECTIONS[p.h.section].color);
        v3.copy(p.pos).project(camera);
        p.on = shown && v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
        p.sx = (v3.x * 0.5 + 0.5) * w;
        p.sy = (-v3.y * 0.5 + 0.5) * hgt;
        const lab = p.on && (isSel || (view.labels && d < 1800));
        p.label.style.display = lab ? "block" : "none";
        if (lab) {
          p.label.style.left = p.sx + "px";
          p.label.style.top = p.sy + "px";
          p.label.className = isSel ? "sel" : "";
        }
      }
      placeGizmo();
      $('[data-v="cam"]').textContent = `camera x ${R(view.x)}  y ${R(view.y)}  z ${R(view.z)}`;
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }

    // ================= Start =================
    buildHandles();
    makePins();
    buildTree();
    if (view.sel && view.sel.label) select(handles.find((h) => h.label === view.sel.label) || null);
    else if (view.sel && view.sel.section) selectSection(view.sel.section);
    else showInspector();
    treeEl.scrollTop = view.scroll || 0;
    applyCamera();
    updateStatus();
    window.editorSerialize = serializeWorld; // (handy for checking what Save would write)
    window.editorGizmo = gizmo;
    window.editorReady = true;
    requestAnimationFrame(frame);
  })();
