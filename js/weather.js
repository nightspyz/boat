// Rain, lightning, weather changes, time-of-day and weather lighting.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Rain =====
const RAIN_COUNT = 3000;
const RAIN_BOX = 70;
const RAIN_HEIGHT = 40;
const rainDrops = new Float32Array(RAIN_COUNT * 3);
for (let i = 0; i < RAIN_COUNT; i++) {
  rainDrops[i * 3] = rand(-RAIN_BOX / 2, RAIN_BOX / 2);
  rainDrops[i * 3 + 1] = rand(-5, RAIN_HEIGHT - 5);
  rainDrops[i * 3 + 2] = rand(-RAIN_BOX / 2, RAIN_BOX / 2);
}
const rainPos = new Float32Array(RAIN_COUNT * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.4, fog: false, depthWrite: false });
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
rain.renderOrder = 2; // after the foam on the water
scene.add(rain);

function wrapTo(v, center, size) {
  const half = size / 2;
  if (v < center - half) return v + size;
  if (v > center + half) return v - size;
  return v;
}

function updateRain(dt, lightLevel) {
  const active = Math.floor(RAIN_COUNT * wx.rain);
  rain.visible = active > 0;
  if (!rain.visible) return;

  const vx = Math.cos(weather.windAngle) * weather.windSpeed * 0.5;
  const vz = Math.sin(weather.windAngle) * weather.windSpeed * 0.5;
  const vy = -22;
  const cam = camera.position;

  for (let i = 0; i < active; i++) {
    let x = rainDrops[i * 3] + vx * dt;
    let y = rainDrops[i * 3 + 1] + vy * dt;
    let z = rainDrops[i * 3 + 2] + vz * dt;
    x = wrapTo(x, cam.x, RAIN_BOX);
    z = wrapTo(z, cam.z, RAIN_BOX);
    const rainFloor = Math.max(cam.y - 10, 0.3); // rain stops at the water surface
    if (y < rainFloor) y += RAIN_HEIGHT;
    if (y > rainFloor + RAIN_HEIGHT) y -= RAIN_HEIGHT;
    rainDrops[i * 3] = x;
    rainDrops[i * 3 + 1] = y;
    rainDrops[i * 3 + 2] = z;

    const j = i * 6;
    rainPos[j] = x;
    rainPos[j + 1] = y;
    rainPos[j + 2] = z;
    rainPos[j + 3] = x - vx * 0.04;
    rainPos[j + 4] = y - vy * 0.04;
    rainPos[j + 5] = z - vz * 0.04;
  }
  rainGeo.setDrawRange(0, active * 2);
  rainGeo.attributes.position.needsUpdate = true;
  rainMat.opacity = 0.25 + 0.25 * wx.storm;
  rainMat.color.setRGB(0.67, 0.71, 0.75).multiplyScalar(Math.max(lightLevel, 0.25) + weather.flash);
}

// ===== Lightning =====
const BOLT_POINTS = 24;
const boltGeo = new THREE.BufferGeometry();
boltGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3));
const boltMat = new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, fog: false });
const bolt = new THREE.Line(boltGeo, boltMat);
bolt.frustumCulled = false;
bolt.visible = false;
scene.add(bolt);

function strike() {
  const b = state.boat;
  const a = Math.random() * Math.PI * 2;
  const dist = rand(250, 700);
  let x = b.x + Math.cos(a) * dist;
  let z = b.z + Math.sin(a) * dist;
  const pos = boltGeo.attributes.position;
  for (let i = 0; i < BOLT_POINTS; i++) {
    const y = 300 - (302 * i) / (BOLT_POINTS - 1);
    pos.setXYZ(i, x, y, z);
    x += rand(-12, 12);
    z += rand(-12, 12);
  }
  pos.needsUpdate = true;
  weather.flash = 1;
  sound.thunder(dist);
  weather.secondFlash = Math.random() < 0.6 ? rand(0.1, 0.25) : -1;
}

// ===== Weather update =====
function updateWeather(dt, advance) {
  if (advance) {
    weather.timer -= dt;
    if (weather.timer <= 0) {
      // Fog days stay calm (fog and wind don't go together)
      const targets = weather.fogDay ? [0.1, 0.1, 0.35] : WEATHER_TARGETS;
      weather.target = targets[Math.floor(Math.random() * targets.length)];
      weather.timer = rand(45, 95);
    }
    // On a fog day the fog bank thickens and thins; now and then it lifts enough to see a little farther
    weather.fogTimer -= dt;
    if (weather.fogTimer <= 0) {
      weather.fogTarget = weather.fogDay ? (Math.random() < 0.7 ? 1 : 0.45) : 0;
      weather.fogTimer = rand(60, 120);
    }
    weather.fog += clamp(weather.fogTarget - weather.fog, -0.01 * dt, 0.01 * dt);
    const step = 0.015 * dt;
    weather.value += clamp(weather.target - weather.value, -step, step);
    weather.windAngle += rand(-0.5, 0.5) * 0.05 * dt;
  }

  const w = weather.value;
  wx.cover = 0.15 + 0.85 * smooth(0.0, 0.7, w);
  wx.overcast = smooth(0.25, 0.85, w);
  wx.rain = smooth(0.4, 0.65, w);
  wx.storm = smooth(0.75, 0.95, w);
  wx.fog = weather.fog;

  // Wind drives the waves and the clouds
  weather.windSpeed = 3 + 21 * w;
  waveScale = 0.55 + 1.45 * w;
  weather.cloudOffset.x += Math.cos(weather.windAngle) * weather.windSpeed * 1.5 * dt;
  weather.cloudOffset.y += Math.sin(weather.windAngle) * weather.windSpeed * 1.5 * dt;

  // Lightning in storms
  if (wx.storm > 0.2) {
    weather.strikeTimer -= dt;
    if (weather.strikeTimer <= 0) {
      strike();
      weather.strikeTimer = 3 + Math.random() * 10 * (1.2 - wx.storm);
    }
  }
  weather.flash = Math.max(0, weather.flash - dt * 5);
  if (weather.secondFlash > 0) {
    weather.secondFlash -= dt;
    if (weather.secondFlash <= 0) weather.flash = 0.8;
  }
  bolt.visible = weather.flash > 0.25;
  boltMat.opacity = weather.flash;
}

// ===== Time of day + weather lighting =====
const PALETTE = {
  nightTop: new THREE.Color(0x02050f),
  nightHorizon: new THREE.Color(0x0b1630),
  duskTop: new THREE.Color(0x28366e),
  duskHorizon: new THREE.Color(0xff8a4c),
  dayTop: new THREE.Color(0x2f6fd0),
  dayHorizon: new THREE.Color(0xb8dcf3),
  overcastTop: new THREE.Color(0x4f5761),
  overcastHorizon: new THREE.Color(0x7d858e),
  flash: new THREE.Color(0xc8d4ff),
  fog: new THREE.Color(0xc3cacf),
  sunLow: new THREE.Color(0xff7a2a),
  sunHigh: new THREE.Color(0xfff3dd),
  deepWater: new THREE.Color(0x0b3553),
  shallowWater: new THREE.Color(0x1f7a8c),
  stormDeep: new THREE.Color(0x1a2a2e),
  stormShallow: new THREE.Color(0x3c5a5a),
};
const tmpColor = new THREE.Color();

function sunDirection(hours, out) {
  const a = ((hours - 6) / 24) * Math.PI * 2; // 6:00 sunrise, 12:00 highest, 18:00 sunset
  return out.set(Math.cos(a), Math.sin(a) * 0.9, 0.35).normalize();
}

function applyEnvironment(hours) {
  const sunDir = sunDirection(hours, shared.uSunDir.value);
  const e = sunDir.y; // sun elevation

  const day = smooth(0.0, 0.35, e);
  const night = 1 - smooth(-0.28, -0.02, e);
  const light = smooth(-0.2, 0.3, e);
  const lightLevel = 0.06 + 0.94 * light;
  const flash = weather.flash;

  const top = shared.uTop.value;
  const horizon = shared.uHorizon.value;
  top.copy(PALETTE.duskTop).lerp(PALETTE.nightTop, night).lerp(PALETTE.dayTop, day);
  horizon.copy(PALETTE.duskHorizon).lerp(PALETTE.nightHorizon, night).lerp(PALETTE.dayHorizon, day);

  // Overcast skies turn grey
  top.lerp(tmpColor.copy(PALETTE.overcastTop).multiplyScalar(lightLevel), wx.overcast * 0.85);
  horizon.lerp(tmpColor.copy(PALETTE.overcastHorizon).multiplyScalar(lightLevel), wx.overcast * 0.85);

  // Fog: everything fades into a soft grey-white
  if (wx.fog > 0) {
    tmpColor.copy(PALETTE.fog).multiplyScalar(lightLevel);
    top.lerp(tmpColor, wx.fog * 0.85);
    horizon.lerp(tmpColor, wx.fog * 0.95);
  }

  // Lightning flash
  if (flash > 0) {
    top.lerp(PALETTE.flash, flash * 0.6);
    horizon.lerp(PALETTE.flash, flash * 0.5);
  }

  shared.uSunColor.value.copy(PALETTE.sunLow).lerp(PALETTE.sunHigh, day);
  shared.uSunset.value = (1 - smooth(0.0, 0.3, Math.abs(e))) * (1 - 0.8 * wx.overcast);
  shared.uSunVis.value = smooth(-0.04, 0.02, e) * (1 - 0.9 * wx.overcast) * (1 - 0.75 * wx.fog);
  shared.uStars.value = night * (1 - wx.overcast) * (1 - wx.fog);
  shared.uAurora.value = night * (1 - wx.cover) * (1 - wx.fog) * (0.75 + 0.25 * Math.sin(shared.uTime.value * 0.03));
  shared.uCloudCover.value = wx.cover;
  shared.uCloudDark.value = smooth(0.35, 0.95, weather.value);
  shared.uCloudOffset.value.copy(weather.cloudOffset);
  shared.uLightLevel.value = Math.max(lightLevel, 0.08) + flash * 0.8;

  waterUniforms.uLight.value = lightLevel * (1 - 0.3 * wx.overcast) + flash * 0.3;
  waterUniforms.uWaveScale.value = waveScale;
  waterUniforms.uFoam.value = 0.35 + 0.4 * wx.storm;
  waterUniforms.uDeep.value.copy(PALETTE.deepWater).lerp(PALETTE.stormDeep, wx.overcast);
  waterUniforms.uShallow.value.copy(PALETTE.shallowWater).lerp(PALETTE.stormShallow, wx.overcast);

  // Rain cuts visibility; fog cuts it to a hundred metres or so
  const fogNear = lerp(FOG_NEAR * (1 - 0.6 * wx.rain), 6, wx.fog);
  const fogFar = lerp(FOG_FAR - 150 * wx.rain, 130, wx.fog);
  scene.fog.near = fogNear;
  scene.fog.far = fogFar;
  waterUniforms.uFogNear.value = fogNear;
  waterUniforms.uFogFar.value = fogFar;
  // The coast, cliffs, rocks and town fade with distance the same way: far off in clear air, closing in
  // through rain and storms, and within a hundred metres or so in fog
  haze.uHazeMax.value = Math.min(1, 0.78 + 0.22 * wx.rain + 0.22 * wx.fog);
  haze.uHazeNear.value = lerp(lerp(250, 40, wx.rain), 6, wx.fog);
  haze.uHazeFar.value = lerp(lerp(2600, 450, wx.rain), 150, wx.fog);
  haze.uWet.value = wx.rain;
  shared.uFog.value = wx.fog;

  scene.fog.color.copy(horizon);
  renderer.setClearColor(horizon);

  sunLight.color.copy(shared.uSunColor.value);
  sunLight.intensity = 1.1 * smooth(-0.02, 0.2, e) * (1 - 0.75 * wx.overcast);
  const b = state.boat;
  sunLight.intensity *= cloudShadowJS(b.x, b.y, b.z, sunDir, wx.cover, weather.cloudOffset);
  moonLight.intensity = 0.3 * night * (1 - wx.overcast);
  hemiLight.color.copy(horizon).lerp(top, 0.5);
  hemiLight.groundColor.copy(waterUniforms.uDeep.value).multiplyScalar(lightLevel);
  hemiLight.intensity = (0.25 + 0.45 * light) * (1 - 0.35 * wx.overcast) + flash * 1.5;

  // Lamps come on at dusk and in dark weather
  const lampsOn = Math.max(1 - smooth(-0.05, 0.1, e), wx.overcast * 0.8 * (1 - day * 0.5), wx.fog * 0.9);
  boat.lampLight.intensity = 1.5 * lampsOn;
  boat.lampMat.emissiveIntensity = 2 * lampsOn;
  boat.windowMat.emissiveIntensity = 0.8 * lampsOn;
  for (const nav of boat.navLights) {
    nav.mat.emissiveIntensity = 2 * lampsOn;
    nav.glow.material.opacity = lampsOn;
  }
  boat.headlight.intensity = 2.5 * lampsOn;
  boat.headlampMat.emissiveIntensity = 2 * lampsOn;

  const boatLightColors = waterUniforms.uBoatLightColor.value;
  boatLightColors[0].set(1.0, 0.85, 0.6).multiplyScalar(0.8 * lampsOn);
  boat.navLights.forEach((nav, i) => {
    boatLightColors[i + 1].set(nav.color.r, nav.color.g, nav.color.b).multiplyScalar(0.9 * lampsOn);
  });
  boatLightColors[4].set(1.0, 0.95, 0.85).multiplyScalar(2.2 * lampsOn);
  lighthouse.lanternMat.emissiveIntensity = 0.3 + 2 * lampsOn;

  return { light, lightLevel, lampsOn };
}

function updateLighthouse(dt, lampsOn) {
  lighthouse.beams.rotation.y += dt * 0.9;
  lighthouse.beams.visible = lampsOn > 0.02;
  lighthouse.beamMat.opacity = 0.1 * lampsOn * (1 + 2.5 * wx.fog); // the beams show up in the fog

  // The lamp flares when a beam sweeps toward the camera
  const lx = lighthouse.group.position.x;
  const lz = lighthouse.group.position.z;
  const toCamX = camera.position.x - lx;
  const toCamZ = camera.position.z - lz;
  const len = Math.hypot(toCamX, toCamZ) || 1;
  const rot = lighthouse.beams.rotation.y;
  const facing = Math.abs(Math.cos(rot) * (toCamX / len) - Math.sin(rot) * (toCamZ / len));
  const flare = Math.pow(facing, 40);
  lighthouse.glow.visible = lampsOn > 0.02;
  lighthouse.glow.material.opacity = lampsOn;
  const size = 14 + 150 * flare;
  lighthouse.glow.scale.set(size, size, 1);
}

function formatClock(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
