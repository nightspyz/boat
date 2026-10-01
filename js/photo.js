// Camera mode: stand on the foredeck with a camera, look around, zoom, focus and shoot.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

const photo = (() => {
  const ui = document.getElementById("photo-ui");
  const lcd = document.getElementById("cam-lcd");
  const bracket = document.getElementById("cam-focus");
  const zoomEl = document.getElementById("cam-zoom");
  const afEl = document.getElementById("cam-af");
  const readEl = document.getElementById("cam-read");
  const cardEl = document.getElementById("cam-card");
  const galleryEl = document.getElementById("gallery");
  const STORE = "coastline-photos-v1";
  const MAX_PHOTOS = 40;
  const BASE_FOV = 50; // the LCD's view at 1× zoom (vertical, degrees)

  const look = { yaw: 0, pitch: -0.04, speed: 0 };
  const wideCam = new THREE.PerspectiveCamera(68, 1, 0.1, 4000);
  const eye = new THREE.Vector3();
  const qBoat = new THREE.Quaternion();
  const qLook = new THREE.Quaternion();
  const qLevel = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const focus = { id: null, until: 0 };
  let zoom = 1;
  const mouse = { x: 0.5, y: 0.5 }; // free cursor position (0..1), when the mouse isn't locked
  let pendingShot = null;
  let cardTimer = 0;
  let shotsToday = 0;
  let photos = [];
  try {
    photos = JSON.parse(localStorage.getItem(STORE) || "[]");
  } catch (e) {
    photos = [];
  }
  const savePhotos = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(photos));
    } catch (e) {
      // Storage full or blocked: keep them for this session only
    }
  };

  const maxZoom = () => (owned("camera") ? 10 : 4);
  // How far a subject can be and still make a photo: farther as you zoom in
  const rangeAt = (z) => (r) => Math.min(r, Math.max(100, r * 0.35) * Math.pow(z, 0.85));
  const canUse = () => state.phase === "running" && !state.paused;

  function enter() {
    if (api.active || !canUse()) return;
    api.active = true;
    look.yaw = 0;
    look.pitch = -0.04;
    zoom = 1;
    mouse.x = mouse.y = 0.5;
    focus.id = null;
    document.body.classList.add("photo-mode");
    ui.classList.remove("hidden");
    toggleGallery(false);
    if (canvas.requestPointerLock && !touch.active) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        // No pointer lock here: drag to look instead
      }
    }
  }

  function exit() {
    if (!api.active) return;
    api.active = false;
    document.body.classList.remove("photo-mode");
    ui.classList.add("hidden");
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    camera.fov = 60;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.rotation.order = "XYZ";
    camera.updateProjectionMatrix();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    updateCamera(0, true);
  }

  function addLook(dx, dy) {
    const k = 0.0022 / Math.sqrt(zoom); // finer control when zoomed in
    look.yaw -= dx * k;
    look.pitch = clamp(look.pitch - dy * k, -1.2, 1.2);
    look.speed += Math.hypot(dx, dy) * k;
  }

  function setZoom(z) {
    zoom = clamp(z, 1, maxZoom());
  }

  // Called from updateCamera: stand on the foredeck, rocking with the boat
  function updateView(dt) {
    const b = state.boat;
    boat.root.updateMatrixWorld(true);
    eye.set(BOAT_EYE.x, BOAT_EYE.y, BOAT_EYE.z);
    boat.tilt.localToWorld(eye);
    camera.position.copy(eye);
    // Handheld: a slight breathing sway, stronger when zoomed in
    const t = shared.uTime.value;
    const sway = (0.004 + 0.0012 * zoom) * (1 + wx.storm);
    // Half way between a level horizon and the boat's own roll and pitch, so the sea moves but doesn't sicken
    euler.set(look.pitch + Math.sin(t * 1.3) * sway, look.yaw + Math.sin(t * 0.9 + 1) * sway, 0, "YXZ");
    qLook.setFromEuler(euler);
    boat.tilt.getWorldQuaternion(qBoat).multiply(qLook);
    euler.set(look.pitch, b.yaw + look.yaw, 0, "YXZ");
    qLevel.setFromEuler(euler);
    camera.quaternion.copy(qLevel).slerp(qBoat, 0.55);
    // Without pointer lock, holding the cursor near a screen edge keeps turning that way
    if (document.pointerLockElement !== canvas && !touch.active) {
      const ex = mouse.x < 0.06 ? -1 : mouse.x > 0.94 ? 1 : 0;
      const ey = mouse.y < 0.06 ? -1 : mouse.y > 0.94 ? 1 : 0;
      if (ex || ey) addLook(ex * 500 * dt, ey * 300 * dt);
    }
    look.speed *= Math.exp(-dt * 6);
    if (focus.id && t > focus.until) focus.id = null;
  }

  // Subjects that would be in this shot, best first (nearest the centre of the frame)
  function inFrame() {
    const list = [];
    const seen = new Set();
    for (const s of currentSightings(lastEnv)) {
      if (seen.has(s.id) || !isVisible(s, lastEnv, 0.92, rangeAt(zoom))) continue;
      seen.add(s.id);
      const p = s.pos ? toScreen(s.pos) : null;
      list.push({ s, p, off: p ? Math.hypot(p.x, p.y) : 0.8 });
    }
    return list.sort((a, b) => a.off - b.off);
  }

  function autofocus() {
    if (!api.active) return;
    const best = inFrame().find((f) => f.s.pos);
    if (best) {
      focus.id = best.s.id;
      focus.until = shared.uTime.value + 4;
    } else {
      focus.id = null;
      toast("📷 Nothing to focus on");
    }
  }

  function quality(f) {
    const b = state.boat;
    const dark = 1 - clamp(lastEnv.lightLevel, 0, 1); // slower shutter in low light: shake shows more
    const centred = f.p ? clamp(1 - f.off / 1.1, 0, 1) : 1;
    const dist = f.s.pos ? Math.hypot(f.s.pos.x - b.x, f.s.pos.z - b.z) : 0;
    const fill = f.s.pos ? clamp(1.35 - dist / rangeAt(zoom)(f.s.range), 0, 1) : 1;
    const steady = clamp(1 - (Math.abs(b.speed) / 16 + look.speed * 1.5) * (1 + 1.5 * dark), 0, 1);
    const focused = !f.s.pos || focus.id === f.s.id ? 1 : 0.5;
    const q = 0.3 * centred + 0.3 * fill + 0.2 * steady + 0.2 * focused;
    if (q >= 0.82) return { name: "Excellent", mult: 1.3 };
    if (q >= 0.65) return { name: "Good", mult: 1 };
    if (q >= 0.45) return { name: "Okay", mult: 0.8 };
    return { name: "Poor", mult: 0.5 };
  }

  function shoot() {
    if (!api.active || !canUse()) return;
    sound.shutter();
    lcd.classList.add("snap");
    setTimeout(() => lcd.classList.remove("snap"), 90);
    shotsToday++;
    const frame = inFrame();
    let earned = 0;
    let main = null;
    for (const f of frame) {
      const id = f.s.id;
      const entry = JOURNAL_BY_ID[id];
      const q = quality(f);
      if (!main) main = { id, q };
      discover(id);
      if (!journal[id].photo) {
        journal[id].photo = true;
        expedition.photos++;
        const bonus = Math.round(photoValue(entry) * q.mult);
        expedition.photoEarnings += bonus;
        earned += bonus;
        sound.chime("photo");
        toast(`📷 ${q.name} photo of ${entry.name}${bonus ? ` +$${bonus}` : ""}`, "discovery");
        if (!journalEl.classList.contains("hidden")) renderJournal();
      }
      checkGoal("photo", id);
    }
    // The picture itself is grabbed straight after the LCD is drawn (see render)
    pendingShot = {
      subject: main ? JOURNAL_BY_ID[main.id].name : "Nothing notable",
      quality: main ? main.q.name : "—",
      earned,
      day: expedition.day,
      time: formatClock(state.timeOfDay),
    };
  }

  function showCard(p) {
    cardEl.innerHTML = `<div class="cc-title">Photo taken</div>
      ${p.img ? `<img src="${p.img}" alt="">` : ""}
      <div>Subject: <b>${p.subject}</b></div>
      <div>Quality: <b class="q-${p.quality}">${p.quality}</b>${p.earned ? ` · +$${p.earned}` : ""}</div>`;
    cardEl.classList.remove("hidden");
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => cardEl.classList.add("hidden"), 3500);
  }

  function toggleGallery(show = galleryEl.classList.contains("hidden")) {
    if (show && api.active) exit();
    galleryEl.classList.toggle("hidden", !show);
    if (!show) return;
    galleryEl.innerHTML =
      `<h2>📷 Photo gallery <span>${photos.length}/${MAX_PHOTOS} · Tab or tap to close</span></h2>` +
      (photos.length
        ? `<div class="g-grid">${photos
            .slice()
            .reverse()
            .map(
              (p) =>
                `<figure>${p.img ? `<img src="${p.img}" alt="">` : "<div class='g-none'></div>"}<figcaption>${p.subject}<br><span>${p.quality} · Day ${p.day} ${p.time}</span></figcaption></figure>`
            )
            .join("")}</div>`
        : `<p>No photos yet. Press F to raise your camera.</p>`);
  }
  galleryEl.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    toggleGallery(false);
  });

  // Draw the deck view, then the zoomed view inside the camera's screen
  function render() {
    if (!canUse()) {
      exit();
      renderer.render(scene, camera);
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    wideCam.aspect = W / H;
    wideCam.updateProjectionMatrix();
    wideCam.position.copy(camera.position);
    wideCam.quaternion.copy(camera.quaternion);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.render(scene, wideCam);

    const r = lcd.getBoundingClientRect();
    if (r.width > 4 && r.height > 4) {
      renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      if (pendingShot) {
        try {
          const pr = renderer.getPixelRatio();
          const c = document.createElement("canvas");
          c.width = 320;
          c.height = Math.round((320 * r.height) / r.width);
          c.getContext("2d").drawImage(renderer.domElement, r.left * pr, r.top * pr, r.width * pr, r.height * pr, 0, 0, c.width, c.height);
          pendingShot.img = c.toDataURL("image/jpeg", 0.8);
        } catch (e) {
          pendingShot.img = null;
        }
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
    }
    if (pendingShot) {
      photos.push(pendingShot);
      while (photos.length > MAX_PHOTOS) photos.shift();
      savePhotos();
      showCard(pendingShot);
      pendingShot = null;
    }
    updateLcd(r);
  }

  // Keep the zoomed camera matched to the LCD, and refresh the readouts
  function updateLcd(r) {
    camera.fov = BASE_FOV / zoom;
    camera.aspect = r.width > 4 ? r.width / r.height : 1.5;
    camera.updateProjectionMatrix();
    zoomEl.textContent = `${zoom.toFixed(1)}×`;
    const target = focus.id && inFrame().find((f) => f.s.id === focus.id && f.p);
    if (focus.id && !target) focus.id = null;
    bracket.classList.toggle("locked", !!target);
    if (target) {
      bracket.style.left = `${((target.p.x + 1) / 2) * 100}%`;
      bracket.style.top = `${((1 - target.p.y) / 2) * 100}%`;
    } else {
      bracket.style.left = "50%";
      bracket.style.top = "50%";
    }
    afEl.textContent = target ? `AF ● ${JOURNAL_BY_ID[focus.id].name}` : "AF-S · R to focus";
    const light = clamp(lastEnv.lightLevel, 0, 1);
    const speeds = [15, 30, 60, 125, 250, 500, 1000];
    const shutterSpeed = speeds[Math.round(light * (speeds.length - 1))];
    const iso = [3200, 1600, 800, 400, 200][Math.round(light * 4)];
    readEl.innerHTML = `<span>1/${shutterSpeed}</span><span>F${light > 0.5 ? "8" : "5.6"}</span><span>ISO ${iso}</span><span>[${shotsToday}]</span><span>▮▮▮▯</span>`;
  }

  // ---- Input ----
  // The mouse always aims (button held or not), and a click always shoots, so you can pan and shoot at once
  canvas.addEventListener("mousedown", (e) => {
    if (!api.active || e.button !== 0) return;
    shoot();
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock && !touch.active) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (err) {
        // No pointer lock: keep aiming with the free cursor
      }
    }
  });
  document.addEventListener("mousemove", (e) => {
    if (!api.active) return;
    addLook(e.movementX || 0, e.movementY || 0);
    mouse.x = e.clientX / window.innerWidth;
    mouse.y = e.clientY / window.innerHeight;
  });
  document.addEventListener("pointerlockchange", () => {
    // Escape releases the mouse: put the camera down too
    if (api.active && document.pointerLockElement !== canvas) api.wasLocked && exit();
    api.wasLocked = document.pointerLockElement === canvas;
  });
  window.addEventListener("keydown", (e) => {
    if (!api.active || e.repeat) return;
    if (e.code === "Equal" || e.code === "NumpadAdd") setZoom(zoom * 1.25);
    if (e.code === "Minus" || e.code === "NumpadSubtract") setZoom(zoom / 1.25);
  });
  for (const btn of ui.querySelectorAll("[data-cam]")) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const a = btn.dataset.cam;
      if (a === "shoot") shoot();
      else if (a === "in") setZoom(zoom * 1.4);
      else if (a === "out") setZoom(zoom / 1.4);
      else if (a === "focus") autofocus();
      else if (a === "gallery") toggleGallery(true);
      else if (a === "exit") exit();
    });
  }

  const api = {
    active: false,
    wasLocked: false,
    enter,
    exit,
    shoot,
    focus: autofocus,
    toggleGallery,
    updateView,
    render,
    addLook,
    zoomBy: (f) => setZoom(zoom * f),
    newDay: () => (shotsToday = 0),
  };
  return api;
})();
