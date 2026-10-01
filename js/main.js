// Rendering, title screen and the main loop (loads last).
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Render =====
function render() {
  const b = state.boat;

  // Keep the water grid under the boat, snapped to the grid so it doesn't swim
  // Keep the water grid centred on the camera (snapped so it doesn't swim), with the far ocean around it
  const cx = Math.round(camera.position.x / WATER_STEP) * WATER_STEP;
  const cz = Math.round(camera.position.z / WATER_STEP) * WATER_STEP;
  water.position.set(cx, 0, cz);
  farOcean.position.set(cx, 0, cz);

  sky.position.copy(camera.position);
  waterUniforms.uCamPos.value.copy(camera.position);

  sunLight.position.copy(boat.root.position).addScaledVector(shared.uSunDir.value, 100);
  sunLight.target.position.copy(boat.root.position);
  moonLight.position.copy(boat.root.position).addScaledVector(shared.uSunDir.value, -100);
  moonLight.target.position.copy(boat.root.position);

  // Boat light positions for the water shader
  boat.root.updateMatrixWorld(true);
  const lightPos = waterUniforms.uBoatLightPos.value;
  boat.lamp.getWorldPosition(lightPos[0]);
  boat.navLights.forEach((nav, i) => nav.bulb.getWorldPosition(lightPos[i + 1]));
  boat.headlight.getWorldPosition(lightPos[4]);
  boat.headlight.target.getWorldPosition(tmpVec);
  waterUniforms.uBoatSpotDir.value.copy(tmpVec).sub(lightPos[4]).normalize();

  // Funds, plus what today's trip has earned so far (paid out when you dock)
  const today =
    expedition.discoveryEarnings + expedition.photoEarnings + expedition.relicEarnings +
    (expedition.goalDone && expedition.goal ? expedition.goal.reward : 0);
  scoreEl.textContent =
    state.phase === "running" && today
      ? `$${expedition.funds.toLocaleString()} (+$${today.toLocaleString()} today)`
      : `$${expedition.funds.toLocaleString()}`;
  const fuel = Math.round((expedition.fuel / expedition.fuelMax) * 100);
  fuelFillEl.style.width = `${fuel}%`;
  fuelFillEl.classList.toggle("low", fuel <= 25 && fuel > 0);
  fuelFillEl.classList.toggle("empty", fuel <= 0);
  fuelPctEl.textContent = `${fuel}%`;
  speedEl.textContent = `${Math.round(Math.abs(b.speed) * 1.944)} kn`;
  clockEl.textContent = `${formatClock(state.timeOfDay)} · ${wx.fog > 0.4 ? "Fog" : weatherName(weather.value)} · Wind ${Math.round(
    weather.windSpeed * 1.944
  )} kn`;

  if (photo.active) photo.render();
  else renderer.render(scene, camera);
  drawMinimap();
}

// ===== Loop =====
let last = performance.now();
let waveTime = 0;

updateWeather(0, false);
applyEnvironment(state.timeOfDay);
updateBoat(0, 0, false);
updateCamera(0, true);

// Title screen: continue a saved game, or start fresh
const hasSave = loadGame();
let confirmNew = false;
function renderTitle() {
  overlayTitleEl.textContent = hasSave ? "Welcome back" : "Press Space to start";
  const found = JOURNAL.filter((e) => journal[e.id].seen).length;
  overlayBodyEl.innerHTML = hasSave
    ? `<div class="next">Day ${expedition.day} · $${expedition.funds.toLocaleString()} · ${found}/${JOURNAL.length} in your journal · ${upgrades.size}/${UPGRADES.length} upgrades<br>
         <button data-ui="go">Continue (Space)</button>
         <button data-ui="new">${confirmNew ? "Really erase your progress? (N)" : "New game (N)"}</button></div>`
    : `<div class="next">A small boat, a long coastline, and a journal to fill.</div>`;
}
function startNewGame() {
  if (!hasSave) return;
  if (!confirmNew) {
    confirmNew = true;
    renderTitle();
    return;
  }
  eraseSave();
  location.reload();
}
renderTitle();

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // cap to avoid big jumps
  last = now;

  if (!state.paused) {
    waveTime += dt;
    shared.uTime.value = waveTime;

    const active = state.running;
    if (active) {
      const mult = keys.has("KeyT") ? TIME_FAST_FORWARD : 1;
      const hoursPassed = (dt * mult * settings.timeSpeed * 24) / DAY_LENGTH; // (time speed: menu.js)
      state.timeOfDay = (state.timeOfDay + hoursPassed) % 24;
      expedition.hours += hoursPassed;
    }

    updateWeather(dt, active);
    updateBoat(dt, waveTime, active && !photo.droneMode); // (the boat drifts while you fly the drone)
    const env = applyEnvironment(state.timeOfDay);
    updateDolphins(dt, waveTime);
    updateWhale(dt, waveTime);
    updateFish(dt, waveTime);
    updateReefFish(dt, waveTime);
    updateReef();
    updateLandmarks(dt, waveTime, env);
    updateSights(dt, waveTime, env);
    gear.update(dt, waveTime, env);
    photo.chargeDrone(dt);
    updateSplashes(dt);
    splashMat.color.setScalar(0.3 + 0.7 * env.lightLevel);
    updateBirds(dt, waveTime, env.light);
    updateAirplane(dt, waveTime, env.lightLevel);
    updateCamera(dt, false);
    updateRain(dt, env.lightLevel);
    updateLighthouse(dt, env.lampsOn);
    updateExpedition(dt, waveTime, env);
  }

  sound.update(dt, lastEnv);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
