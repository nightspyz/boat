// Boat gear from the boatyard: fishing rod (Q), searchlight (L) and fireworks (K).
// (The camera drone is a mode of the camera, in photo.js.)
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

const gear = (() => {
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  // ===== Fishing rod =====
  const CATCH = {
    mackerel: { kg: [0.3, 1.2], perKg: 14 },
    seabass: { kg: [0.8, 4], perKg: 18 },
    mullet: { kg: [0.2, 0.8], perKg: 30 },
    squid: { kg: [0.3, 1.6], perKg: 22 },
    tuna: { kg: [8, 40], perKg: 12 },
  };
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.4 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, 2.6, 6).translate(0, 1.3, 0), rodMat);
  rod.position.set(1.05, boatDeck(3.2) + 0.4, 3.2);
  rod.rotation.set(0.5, 0, -0.55); // leaning out over the starboard quarter
  rod.visible = false;
  boat.tilt.add(rod);
  const tipLocal = new THREE.Vector3(0, 2.6, 0);
  const bobber = new THREE.Group();
  bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8352a })));
  bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f4f0 })));
  bobber.visible = false;
  scene.add(bobber);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 }));
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  const fish = { phase: "idle", t: 0, x: 0, z: 0 };

  function castOrReel() {
    if (!owned("rod") || state.phase !== "running" || state.paused || photo.active) return;
    const b = state.boat;
    if (fish.phase === "idle") {
      if (Math.abs(b.speed) > 2.5) {
        toast("🎣 Slow down before casting.");
        return;
      }
      // Cast out over the starboard quarter
      const rx = Math.cos(b.yaw);
      const rz = -Math.sin(b.yaw);
      const bx = Math.sin(b.yaw);
      const bz = Math.cos(b.yaw);
      fish.x = b.x + rx * 9 + bx * 7;
      fish.z = b.z + rz * 9 + bz * 7;
      if (seaBed(fish.x, fish.z) > -1) {
        toast("🎣 Too shallow here to fish.");
        return;
      }
      const nearBoil = Math.hypot(fish.x - boil.x, fish.z - boil.z) < 70;
      fish.phase = "wait";
      fish.t = rand(6, 16) * (nearBoil ? 0.4 : 1);
      sound.fishCast();
      toast("🎣 Line cast. Wait for a bite, then press Q to strike.");
    } else if (fish.phase === "bite") {
      landCatch();
    } else {
      // Reeling in too early: nothing on the hook
      sound.fishReel();
      endFishing();
      toast("🎣 Reeled in: nothing on the hook. Wait for the float to dip.");
    }
  }
  function endFishing() {
    fish.phase = "idle";
    bobber.visible = false;
    line.visible = false;
  }
  function pickCatch() {
    const b = state.boat;
    const r = Math.random();
    if (r < 0.07) return null; // an old boot
    if (lastEnv.lightLevel < 0.3 && Math.random() < 0.55) return "squid";
    if (-inland(b.x, b.z) > 600 && Math.random() < 0.35) return "tuna";
    if (seaBed(fish.x, fish.z) > -12 && cliffAmount(b.x) > 0.5 && Math.random() < 0.5) return "mullet";
    return Math.random() < 0.55 ? "mackerel" : "seabass";
  }
  function landCatch() {
    sound.fishReel();
    splash(fish.x, waveHeight(fish.x, fish.z, shared.uTime.value), fish.z, 10, 2);
    const id = pickCatch();
    endFishing();
    if (!id) {
      toast(Math.random() < 0.5 ? "🥾 An old boot. Back in the sea it goes." : "🥫 A rusty tin can. You keep it for the bin.");
      return;
    }
    const c = CATCH[id];
    const kg = rand(c.kg[0], c.kg[1]);
    const price = Math.round(kg * c.perKg);
    expedition.fishEarnings = (expedition.fishEarnings || 0) + price;
    const firstTime = !journal[id].seen;
    discover(id);
    journal[id].shots = (journal[id].shots || 0) + 1; // times caught
    if (!journal[id].first) journal[id].first = { day: expedition.day, time: formatClock(state.timeOfDay) };
    journal[id].best = Math.max(journal[id].best || 0, price);
    if (!firstTime) toast(`🎣 ${JOURNAL_BY_ID[id].name}, ${kg.toFixed(1)} kg: sells for $${price} at the harbor`, "discovery");
    else toast(`🎣 ${kg.toFixed(1)} kg, sells for $${price}`, "discovery");
  }
  function updateFishing(dt, t) {
    rod.visible = owned("rod");
    if (fish.phase === "idle") return;
    const b = state.boat;
    // Moving off reels the line in
    if (Math.abs(b.speed) > 2.5 || state.phase !== "running") {
      endFishing();
      return;
    }
    bobber.visible = true;
    line.visible = true;
    fish.t -= dt;
    let dip = 0;
    if (fish.phase === "wait" && fish.t <= 0) {
      fish.phase = "bite";
      fish.t = 1.7; // time to strike
      sound.fishBite();
      splash(fish.x, waveHeight(fish.x, fish.z, t), fish.z, 5, 1);
      toast("🎣 A bite! Press Q!", "goal");
    } else if (fish.phase === "bite") {
      dip = 0.12 + 0.1 * Math.sin(t * 25);
      if (fish.t <= 0) {
        fish.phase = "wait";
        fish.t = rand(5, 12);
        toast("🎣 It got away. Keep waiting…");
      }
    } else if (fish.phase === "wait" && fish.t < 1.2) {
      dip = 0.03 * Math.sin(t * 18); // a nibble just before the bite
    }
    bobber.position.set(fish.x, waveHeight(fish.x, fish.z, t) - dip, fish.z);
    boat.tilt.localToWorld(tmp.copy(tipLocal).applyEuler(rod.rotation).add(rod.position));
    const p = lineGeo.attributes.position;
    p.setXYZ(0, tmp.x, tmp.y, tmp.z);
    p.setXYZ(1, bobber.position.x, bobber.position.y + 0.05, bobber.position.z);
    p.needsUpdate = true;
  }

  // ===== Searchlight: a strong beam that points where you look =====
  const spot = { on: false };
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamGeo = new THREE.ConeGeometry(16, 150, 24, 1, true).translate(0, -75, 0).rotateX(-Math.PI / 2); // apex at 0, pointing +z
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.visible = false;
  beam.renderOrder = 2;
  scene.add(beam);
  function toggleSpot() {
    if (!owned("searchlight")) return;
    spot.on = !spot.on;
    toast(spot.on ? "🔦 Searchlight on (L)" : "🔦 Searchlight off (L)");
  }
  function updateSpot(env) {
    const on = owned("searchlight") && spot.on;
    beam.visible = on && env.lampsOn > 0.05;
    if (!on) {
      boat.headlight.target.position.set(0, -1.5, -25); // back to the normal headlamp, straight ahead
      waterUniforms.uSpotRange.value = 60;
      boat.headlight.distance = 70;
      boat.headlight.angle = 0.4;
      return;
    }
    const night = Math.max(env.lampsOn, 0.15);
    boat.headlight.intensity = 9 * night;
    boat.headlight.distance = 260;
    boat.headlight.angle = 0.3;
    boat.headlampMat.emissiveIntensity = 4 * night;
    waterUniforms.uBoatLightColor.value[4].set(1.0, 0.95, 0.85).multiplyScalar(4.5 * night);
    waterUniforms.uSpotRange.value = 200;
    // Aim along the view, down onto the water about 70 m out
    camera.getWorldDirection(tmp2);
    tmp2.y = 0;
    if (tmp2.lengthSq() < 1e-4) tmp2.set(-Math.sin(state.boat.yaw), 0, -Math.cos(state.boat.yaw));
    tmp2.normalize();
    boat.headlight.getWorldPosition(tmp);
    const target = tmp2.multiplyScalar(70).add(tmp).setY(waveHeight(tmp.x, tmp.z, shared.uTime.value));
    boat.headlight.target.position.copy(boat.tilt.worldToLocal(target.clone()));
    beam.position.copy(tmp);
    beam.lookAt(target);
    beamMat.opacity = 0.05 * env.lampsOn * (1 + 2 * wx.fog + wx.rain);
  }

  // ===== Fireworks =====
  const N = 3000;
  const fwPos = new Float32Array(N * 3).fill(-9999);
  const fwCol = new Float32Array(N * 3);
  const fwVel = new Float32Array(N * 3);
  const fwBase = new Float32Array(N * 3);
  const fwLife = new Float32Array(N);
  const fwMax = new Float32Array(N);
  const fwDrag = new Float32Array(N);
  const fwGrav = new Float32Array(N);
  const fwStrobe = new Uint8Array(N);
  let fwNext = 0;
  const fwGeo = new THREE.BufferGeometry();
  fwGeo.setAttribute("position", new THREE.BufferAttribute(fwPos, 3));
  fwGeo.setAttribute("color", new THREE.BufferAttribute(fwCol, 3));
  const fwPoints = new THREE.Points(
    fwGeo,
    new THREE.PointsMaterial({ size: 1.3, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  fwPoints.frustumCulled = false;
  fwPoints.renderOrder = 3;
  scene.add(fwPoints);
  const flash = new THREE.PointLight(0xffffff, 0, 600, 1.5);
  scene.add(flash);
  const PALETTES = [
    [[1, 0.25, 0.2], [1, 0.8, 0.4]],
    [[0.3, 0.6, 1], [0.9, 0.95, 1]],
    [[0.4, 1, 0.45], [1, 1, 0.6]],
    [[1, 0.45, 0.9], [0.6, 0.4, 1]],
    [[1, 0.75, 0.3], [1, 0.95, 0.75]],
  ];
  const rockets = [];
  const bursts = []; // recent bursts, for photos
  let cooldown = 0;
  function spark(x, y, z, vx, vy, vz, c, life, drag, grav, strobe = 0) {
    const i = fwNext;
    fwNext = (fwNext + 1) % N;
    fwPos[i * 3] = x;
    fwPos[i * 3 + 1] = y;
    fwPos[i * 3 + 2] = z;
    fwVel[i * 3] = vx;
    fwVel[i * 3 + 1] = vy;
    fwVel[i * 3 + 2] = vz;
    fwBase[i * 3] = c[0];
    fwBase[i * 3 + 1] = c[1];
    fwBase[i * 3 + 2] = c[2];
    fwLife[i] = fwMax[i] = life;
    fwDrag[i] = drag;
    fwGrav[i] = grav;
    fwStrobe[i] = strobe;
  }
  function launchFirework() {
    if (!owned("fireworks") || state.phase !== "running" || state.paused || cooldown > 0) return;
    if (lastEnv.lightLevel > 0.35) {
      toast("🎆 Fireworks need a dark sky. Wait for night.");
      return;
    }
    cooldown = 0.45;
    const b = state.boat;
    boat.tilt.localToWorld(tmp.set(0, boatDeck(3.5) + 0.5, 3.5));
    const kinds = ["peony", "peony", "willow", "ring", "crackle", "double"];
    // Fired forward, the way you're looking, so it bursts in front of you about 100 m out
    camera.getWorldDirection(tmp2);
    tmp2.y = 0;
    if (tmp2.lengthSq() < 1e-4) tmp2.set(-Math.sin(b.yaw), 0, -Math.cos(b.yaw));
    tmp2.normalize();
    const out = rand(48, 58);
    rockets.push({
      x: tmp.x,
      y: tmp.y,
      z: tmp.z,
      vx: tmp2.x * out + rand(-3, 3),
      vy: rand(28, 33),
      vz: tmp2.z * out + rand(-3, 3),
      t: rand(1.7, 2.3),
      kind: kinds[Math.floor(Math.random() * kinds.length)],
      pal: PALETTES[Math.floor(Math.random() * PALETTES.length)],
    });
    sound.fwLaunch(tmp.x, tmp.z);
  }
  function explode(r) {
    const [c1, c2] = r.pal;
    const sphere = (n, speed, col, life, drag, grav, strobe) => {
      for (let k = 0; k < n; k++) {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const v = speed * rand(0.85, 1.1);
        spark(r.x, r.y, r.z, Math.cos(a) * s * v + r.vx * 0.3, u * v + r.vy * 0.2, Math.sin(a) * s * v + r.vz * 0.3, Math.random() < 0.8 ? col : c2, life * rand(0.8, 1.15), drag, grav, strobe);
      }
    };
    if (r.kind === "peony") sphere(160, 24, c1, 2.2, 1.3, 4);
    if (r.kind === "willow") sphere(140, 15, [1, 0.72, 0.32], 3.8, 1.6, 7);
    if (r.kind === "crackle") sphere(120, 20, [1, 0.95, 0.85], 1.7, 1.2, 4, 1);
    if (r.kind === "double") {
      sphere(130, 25, c1, 2.1, 1.3, 4);
      sphere(70, 12, c2, 1.8, 1.3, 4);
    }
    if (r.kind === "ring") {
      // A flat ring at a random tilt
      const ax = rand(-0.8, 0.8);
      for (let k = 0; k < 110; k++) {
        const a = (k / 110) * Math.PI * 2;
        const v = 23;
        const x = Math.cos(a) * v;
        const z = Math.sin(a) * v;
        spark(r.x, r.y, r.z, x, z * Math.sin(ax), z * Math.cos(ax), k % 2 ? c1 : c2, 2.2, 1.2, 3);
      }
      sphere(40, 6, c2, 1.5, 1.4, 4);
    }
    flash.position.set(r.x, r.y, r.z);
    flash.color.setRGB(c1[0], c1[1], c1[2]);
    flash.intensity = 5;
    bursts.push({ x: r.x, y: r.y, z: r.z, t: 3 });
    sound.fwBoom(r.x, r.y, r.z, r.kind === "crackle" || r.kind === "willow");
  }
  function updateFireworks(dt, t) {
    cooldown -= dt;
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.vy -= 9.8 * 0.35 * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      r.t -= dt;
      // A short golden trail of sparks behind the rising shell
      for (let k = 0; k < 3; k++) spark(r.x, r.y, r.z, rand(-1, 1), rand(-3, -1), rand(-1, 1), [1, 0.7, 0.35], rand(0.3, 0.6), 2, 2);
      if (r.t <= 0) {
        explode(r);
        rockets.splice(i, 1);
      }
    }
    for (let i = bursts.length - 1; i >= 0; i--) if ((bursts[i].t -= dt) <= 0) bursts.splice(i, 1);
    flash.intensity = Math.max(0, flash.intensity - dt * 9);
    let any = false;
    for (let i = 0; i < N; i++) {
      if (fwLife[i] <= 0) continue;
      any = true;
      fwLife[i] -= dt;
      if (fwLife[i] <= 0) {
        fwPos[i * 3 + 1] = -9999;
        continue;
      }
      const k = Math.exp(-fwDrag[i] * dt);
      fwVel[i * 3] *= k;
      fwVel[i * 3 + 1] = fwVel[i * 3 + 1] * k - fwGrav[i] * dt;
      fwVel[i * 3 + 2] *= k;
      fwPos[i * 3] += fwVel[i * 3] * dt;
      fwPos[i * 3 + 1] += fwVel[i * 3 + 1] * dt;
      fwPos[i * 3 + 2] += fwVel[i * 3 + 2] * dt;
      let b = Math.pow(fwLife[i] / fwMax[i], 0.6);
      if (fwStrobe[i]) b *= Math.random() < 0.5 ? 1.6 : 0.1;
      fwCol[i * 3] = fwBase[i * 3] * b;
      fwCol[i * 3 + 1] = fwBase[i * 3 + 1] * b;
      fwCol[i * 3 + 2] = fwBase[i * 3 + 2] * b;
    }
    if (any || rockets.length) {
      fwGeo.attributes.position.needsUpdate = true;
      fwGeo.attributes.color.needsUpdate = true;
    }
  }

  // ===== Inventory bar: every piece of gear, numbered 1–6; click, tap or press its number or key =====
  const SLOTS = [
    { id: null, icon: "📷", name: "Camera", key: "F", use: () => photo.enter() },
    { id: "drone", icon: "🚁", name: "Drone", key: "V", use: () => photo.enterDrone() },
    { id: "rod", icon: "🎣", name: "Rod", key: "Q", use: () => castOrReel() },
    { id: "searchlight", icon: "🔦", name: "Light", key: "L", use: () => toggleSpot() },
    { id: "fireworks", icon: "🎆", name: "Fireworks", key: "K", use: () => launchFirework() },
    { id: "diving", icon: "🤿", name: "Dive", key: "X", use: () => tryDive() },
  ];
  const bar = document.getElementById("hotbar");
  let barSig = "";
  function refresh() {
    bar.innerHTML = SLOTS.map((sl, i) => {
      const have = !sl.id || owned(sl.id);
      const u = sl.id && UPGRADES.find((x) => x.id === sl.id);
      const tip = have ? `${sl.name} (${i + 1} or ${sl.key})` : `${u.name}: $${u.price.toLocaleString()} at the boatyard`;
      return `<button class="slot${have ? "" : " locked"}" data-slot="${i}" title="${tip}">
        <span class="slot-num">${i + 1}</span><span class="slot-icon">${sl.icon}</span>
        <span class="slot-name">${have ? sl.name : "🔒 $" + u.price}</span><span class="slot-key">${sl.key}</span></button>`;
    }).join("");
    barSig = "";
  }
  function useSlot(i) {
    const sl = SLOTS[i];
    if (!sl || state.phase !== "running" || state.paused) return;
    if (sl.id && !owned(sl.id)) {
      const u = UPGRADES.find((x) => x.id === sl.id);
      toast(`${u.icon} ${u.name}: buy it at the boatyard for $${u.price.toLocaleString()} (B, in port).`);
      return;
    }
    sl.use();
  }
  bar.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    const btn = e.target && e.target.closest("[data-slot]");
    if (btn) useSlot(Number(btn.dataset.slot));
  });
  // Keep the bar in step with the game: shown while sailing, slots lit when in use
  function updateBar() {
    const show = state.phase === "running" && !photo.active;
    bar.classList.toggle("hidden", !show);
    if (!show) return;
    const ownedSig = SLOTS.map((sl) => (!sl.id || owned(sl.id) ? 1 : 0)).join("");
    const sig = ownedSig + fish.phase + spot.on + (lastEnv.lightLevel > 0.35);
    if (sig === barSig) return;
    if (!bar.children.length || bar.dataset.owned !== ownedSig) {
      refresh();
      bar.dataset.owned = ownedSig;
    }
    barSig = sig;
    const el = (i) => bar.children[i];
    el(2).classList.toggle("on", fish.phase !== "idle");
    el(2).classList.toggle("alert", fish.phase === "bite");
    el(3).classList.toggle("on", spot.on && owned("searchlight"));
    el(4).classList.toggle("dim", lastEnv.lightLevel > 0.35); // fireworks only at night
  }

  function update(dt, t, env) {
    updateFishing(dt, t);
    updateSpot(env);
    updateFireworks(dt, t);
    updateBar();
  }
  // Recent bursts, for photos (discovery.js)
  function addSightings(add) {
    for (const bu of bursts) add("fireworks", new THREE.Vector3(bu.x, bu.y, bu.z), 3000, { lit: true });
  }
  return { castOrReel, toggleSpot, launchFirework, update, refresh, useSlot, addSightings, get fishing() {
    return fish.phase !== "idle";
  } };
})();
