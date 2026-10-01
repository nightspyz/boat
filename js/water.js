// Ocean surface shader (waves, breakers, foam, caustics), far ocean, underwater look, lights.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Water =====
const WATER_SIZE = 800;
const WATER_STEP = 2; // the grid moves with the camera in steps of this size, so its vertices stay put in the world

// A grid that is finer near the camera (1 m out to 80 m, then 2 m), so breaking waves can have steep faces.
// Both spacings divide WATER_STEP, so the vertices land on the same world points every time it moves.
const waterGeo = (() => {
  const axis = [];
  for (let x = -WATER_SIZE / 2; x <= WATER_SIZE / 2; x += Math.abs(x) < 80 ? 1 : 2) axis.push(x);
  const n = axis.length;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) pos.set([axis[i], 0, axis[j]], (j * n + i) * 3);
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx.set([a, a + n, a + 1, a + n, a + n + 1, a + 1], k); // wound to face up
      k += 6;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
})();

// The water doesn't write depth (so fish and dolphins can be seen through it), which means it can't
// hide its own far side. So draw its triangles from the farthest to the nearest: the grid is always
// centred on the camera, so nearer waves are then always drawn last, on top of the distant ones.
function sortWaterFarToNear(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const triCount = idx.length / 3;
  const order = new Array(triCount);
  const dist = new Float32Array(triCount);
  for (let t = 0; t < triCount; t++) {
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(idx[t * 3 + k]);
      cz += pos.getZ(idx[t * 3 + k]);
    }
    dist[t] = cx * cx + cz * cz;
    order[t] = t;
  }
  order.sort((a, b) => dist[b] - dist[a]);
  const sorted = new idx.constructor(idx.length);
  order.forEach((t, i) => {
    sorted[i * 3] = idx[t * 3];
    sorted[i * 3 + 1] = idx[t * 3 + 1];
    sorted[i * 3 + 2] = idx[t * 3 + 2];
  });
  geo.setIndex(new THREE.BufferAttribute(sorted, 1));
}
sortWaterFarToNear(waterGeo);
const waterUniforms = Object.assign({}, shared, {
  uWaves: { value: WAVES.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.steep)) },
  uWaveScale: { value: 1 },
  uFoam: { value: 0.35 },
  uCamPos: { value: new THREE.Vector3() },
  uDeep: { value: new THREE.Color(0x0b3553) },
  uShallow: { value: new THREE.Color(0x1f7a8c) },
  uLight: { value: 1 },
  uFogNear: { value: FOG_NEAR },
  uFogFar: { value: FOG_FAR },
  // Boat lights: 0 masthead, 1 port, 2 starboard, 3 stern, 4 searchlight (spot)
  uBoatLightPos: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector3()) },
  uBoatLightColor: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector3()) },
  uBoatSpotDir: { value: new THREE.Vector3(0, 0, -1) },
  uSpotRange: { value: 60 }, // how far the searchlight reaches across the water (gear.js)
  uStacks: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) }, // x, z, radius, active
});

// Foam on the water: whitecaps, breakers and the swash, as one lacy pattern. Shared by the water (whose
// caustics use the same cells) and by the foam layer, which draws it on top of everything under the water.
const FOAM_GLSL = /* glsl */ `
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  // Distance to the nearest wall between animated cells
  float cellEdge(vec2 p, float t) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = 0.5 + 0.4 * sin(t + 6.2831 * hash22(i + g));
        float d = length(g + o - f);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
      }
    }
    return f2 - f1;
  }
  // A lacy white network around dark holes, like real sea foam.
  // density 0..1: 1 = solid white water; as it falls the holes open up until only thin threads are left
  float foamLace(vec2 p, float density) {
    if (density < 0.01) return 0.0;
    vec2 q = p + vec2(vnoise(p * 0.18), vnoise(p * 0.18 + 5.7)) * 6.0; // bend the cells into organic blobs
    float big = cellEdge(q * 0.45, 0.0);        // holes a couple of metres across
    float small = cellEdge(q * 1.7 + 3.1, 0.0); // smaller holes and fine threads within the bands
    float lace = exp(-big * 3.0) * 0.75 + exp(-small * 5.0) * 0.35 + (vnoise(q * 3.0) - 0.5) * 0.15;
    float th = mix(1.05, -0.1, density);
    return smoothstep(th, th + 0.08, lace);
  }
  // How much foam covers this point of the surface (w: the surface point, height: its wave height,
  // bed: sea floor height below it, dist: distance from the camera, t: time, ws: wave scale, caps: whitecaps)
  float foamAmount(vec3 w, float height, float bed, float dist, float t, float ws, float caps) {
    float far = smoothstep(80.0, 300.0, dist);
    float crest = clamp(height / (2.6 * max(ws, 0.3)) * 0.5 + 0.5, 0.0, 1.0);
    float bedDepth = -bed;
    float depthW = max(w.y - bed, 0.0);
    float stage = breakStage(bedDepth);
    float bu = breakU(w.xz, t);
    float bd = bu < 0.5 ? bu : bu - 1.0; // distance from the breaker's crest in wavelengths (negative = shore side)
    float foamNoise = fbm(w.xz * 0.35 + vec2(t * 0.02, t * 0.12));
    // Whitecaps on the open sea, in patches
    float capDensity = smoothstep(0.74, 0.95, crest + (foamNoise - 0.5) * 0.3) * caps * 2.0;
    // Breakers: solid white where the lip pours over and the white water tumbles in, ageing into lace behind,
    // and a thin veil of old foam over the whole surf zone. It keeps going right up the beach.
    float foamSize = clamp(0.4 + ws * 0.6, 0.0, 1.0) * (1.0 - smoothstep(2.5, 8.0, bedDepth));
    float curl = clamp(stage - 0.6, 0.0, 1.0);
    float lipFoam = exp(-(((bd + 0.01) / 0.02) * ((bd + 0.01) / 0.02))) * smoothstep(0.7, 1.1, stage);
    float trail = bd >= 0.0 ? exp(-bd * mix(9.0, 4.5, clamp(stage - 1.0, 0.0, 1.0))) * curl : 0.0;
    float surfDensity = max(max(lipFoam, trail), 0.45 * smoothstep(1.2, 1.8, stage) * (0.6 + 0.8 * foamNoise)) * foamSize;
    // The swash: a bright foam line along its edge, lace scattered over the thin water behind it
    float edgeLine = smoothstep(0.0, 0.012, depthW) * exp(-depthW / 0.035);
    float swashLace = (1.0 - smoothstep(0.05, 0.6, depthW)) * 0.55 * clamp(0.4 + ws * 0.6, 0.0, 1.0);
    float density = clamp(max(max(capDensity, surfDensity), max(edgeLine, swashLace)), 0.0, 1.0);
    vec2 drift = vec2(0.0, t * 0.15); // the foam drifts slowly toward the shore
    return mix(foamLace(w.xz + drift, density), density * 0.7, far); // smooth it far away
  }
`;

// The water surface's vertex shader: waves, breakers and swash (shared by the water and its foam layer)
const WATER_VERTEX = /* glsl */ `
      ${SHORE_GLSL}
      uniform float uTime;
      uniform float uWaveScale;
      uniform vec4 uWaves[4];
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vBed;

      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 tangent = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);
        vec3 disp = vec3(0.0);

        // Waves shrink in shallow water
        float bed = bedHeight(wp.xz);
        float depth = -bed;
        float damp = mix(0.12, 1.0, smoothstep(0.5, 8.0, depth));
        // Calm the waves near the edge of the grid so its border never wobbles into view
        float edge = 1.0 - smoothstep(320.0, 390.0, max(abs(position.x), abs(position.z)));
        damp *= edge;

        // Gerstner waves. The sideways (horizontal) push is capped so crests can never fold over
        // into loops, and each wave fades out with distance before the grid gets too coarse to draw it.
        float steepSum = 0.0;
        for (int i = 0; i < 4; i++) steepSum += uWaves[i].w;
        float sideways = min(1.0, 0.6 / max(steepSum * uWaveScale * damp, 1e-4));
        float camDist = length(wp.xz - cameraPosition.xz);
        for (int i = 0; i < 4; i++) {
          vec4 w = uWaves[i];
          vec2 d = w.xy;
          float k = w.z;
          float len = 6.2832 / k;
          float fade = 1.0 - smoothstep(len * 9.0, len * 22.0, camDist);
          float s = w.w * uWaveScale * damp * fade;
          float c = sqrt(9.8 / k);
          float f = k * (dot(d, wp.xz) - c * uTime);
          float a = s / k;
          float q = s * sideways; // horizontal steepness
          float cf = cos(f);
          float sf = sin(f);
          disp += vec3(d.x * (q / k) * cf, a * sf, d.y * (q / k) * cf);
          tangent += vec3(-d.x * d.x * q * sf, d.x * s * cf, -d.x * d.y * q * sf);
          binormal += vec3(-d.x * d.y * q * sf, d.y * s * cf, -d.y * d.y * q * sf);
        }

        vHeight = disp.y;

        // Breaking waves in the shallows: their height, and a lean toward the shore as the lip curls over.
        // Their slope is added to the surface normal. The lean is capped so the surface never folds over itself.
        float bA = depth < 8.0 ? (0.3 + 0.4 * uWaveScale) * breakAmp(depth) * edge : 0.0;
        if (bA > 0.0) {
          float stage = breakStage(depth);
          float lean = min(bA, 1.0);
          float e = 0.5;
          vec2 px = wp.xz + vec2(e, 0.0);
          vec2 pz = wp.xz + vec2(0.0, e);
          float s0 = shoreCoord(wp.xz);
          float sx = shoreCoord(px);
          float sz = shoreCoord(pz);
          vec2 toShore = normalize(vec2(sx - s0, sz - s0) + vec2(1e-6));
          vec2 b0 = breakShape(breakUAt(s0, wp.xz, uTime), stage);
          vec2 bx = breakShape(breakUAt(sx, px, uTime), stage);
          vec2 bz = breakShape(breakUAt(sz, pz, uTime), stage);
          disp += vec3(toShore.x * b0.y * lean, b0.x * bA, toShore.y * b0.y * lean);
          tangent += vec3(toShore.x * (bx.y - b0.y) * lean, (bx.x - b0.x) * bA, toShore.y * (bx.y - b0.y) * lean) / e;
          binormal += vec3(toShore.x * (bz.y - b0.y) * lean, (bz.x - b0.x) * bA, toShore.y * (bz.y - b0.y) * lean) / e;
        }

        vec3 p = wp.xyz + disp;
        // The swash: each spent wave running up the beach and sliding back (only right at the waterline)
        p.y += (1.0 - smoothstep(0.0, 1.2, depth)) * swashLevel(wp.xz, uTime);

        vNormal = normalize(cross(binormal, tangent));
        vWorld = p;
        vBed = bed;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
`;

const water = new THREE.Mesh(
  waterGeo,
  new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: WATER_VERTEX,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      ${NOISE_GLSL}
      ${CLOUD_GLSL}
      ${SHORE_GLSL}
      uniform float uAurora;
      uniform vec3 uCamPos;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uLight;
      uniform float uWaveScale;
      uniform float uFoam;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uBoatLightPos[5];
      uniform vec3 uBoatLightColor[5];
      uniform vec3 uBoatSpotDir;
      uniform float uSpotRange;
      uniform vec4 uStacks[16];
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vBed;

      // Small wind ripples on top of the big waves: a handful of short waves running in different
      // directions, plus a little noise on a rotated grid (plain value noise shows a checkerboard in the glints)
      float ripple(vec2 p, float t) {
        float h = sin(dot(p, vec2(0.96, 0.28)) * 3.1 + t * 2.3) * 0.18
                + sin(dot(p, vec2(-0.42, 0.91)) * 3.7 + t * 2.6) * 0.15
                + sin(dot(p, vec2(0.71, -0.70)) * 4.6 + t * 2.9) * 0.11
                + sin(dot(p, vec2(-0.88, -0.47)) * 5.3 + t * 3.2) * 0.1
                + sin(dot(p, vec2(0.17, 0.98)) * 6.9 + t * 3.6) * 0.07
                + sin(dot(p, vec2(0.55, 0.83)) * 8.1 + t * 4.0) * 0.06;
        vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
        return 0.5 + h * 0.5 + (vnoise(q * 1.3 + t * vec2(0.1, 0.3)) - 0.5) * 0.25;
      }

      // ---- Caustics: sunlight focused by the moving surface into a bright, wobbling net ----
      ${FOAM_GLSL}
      float causticLayer(vec2 p, float t) {
        // Warp so the cell walls bend and drift like light through moving waves
        p += vec2(vnoise(p * 0.7 + t * 0.3), vnoise(p * 0.7 - t * 0.25 + 4.0)) * 0.9;
        return exp(-cellEdge(p, t) * 9.0);
      }
      float causticNet(vec2 p, float t) {
        float c = (causticLayer(p, t) + causticLayer(p * 0.73 + 5.2, t * 1.3)) * 0.5;
        return pow(c, 1.8) * 2.2;
      }
      // Slight colour split at the edges, like real refracted sunlight
      vec3 caustics(vec2 p, float t) {
        vec2 off = vec2(0.035, 0.02);
        return vec3(causticNet(p + off, t), causticNet(p, t), causticNet(p - off, t));
      }

      // ---- Sea floor: sand, coral reef, rocky slopes under the cliffs and the sea stacks' bases ----
      // Smooth texture for the reef floor, on a rotated grid so the noise never lines up into squares
      float coralTex(vec2 p) {
        vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
        return vnoise(q * 1.1) * 0.6 + vnoise(q * 2.7 + 7.0) * 0.4;
      }
      vec3 seabed(vec2 p, float dIn, out float bump) {
        vec3 sand = vec3(0.88, 0.84, 0.74) * (0.88 + 0.24 * vnoise(p * 0.6)); // pale, as sand looks under water
        float cliffs = cliffAmount(p.x);

        // Reef: on the steep slopes below the cliffs, and in patches further out in the bay
        float nearReef = cliffs * smoothstep(-160.0, -110.0, dIn) * (1.0 - smoothstep(-6.0, -2.0, dIn));
        float bayReef = smoothstep(-280.0, -200.0, dIn) * (1.0 - smoothstep(-40.0, -20.0, dIn)) * 0.6;
        // A fringing reef around each little island
        float dIsl = islandsShoreDist(p);
        float islandReef = smoothstep(4.0, 12.0, dIsl) * (1.0 - smoothstep(35.0, 70.0, dIsl));
        float reefZone = max(max(nearReef, bayReef), islandReef);
        float patchN = fbm(p * 0.07) + (vnoise(p * 0.5) - 0.5) * 0.15;
        float coral = smoothstep(0.34 + 0.08 * (1.0 - nearReef), 0.5, patchN) * reefZone;

        // The reef floor between the coral heads (the corals themselves are 3D objects, see reef.js):
        // coral rubble, pink coralline crusts and patches of algae turf, all soft-edged
        float tex = coralTex(p);
        float kind = fbm(p * 0.05 + 11.0);
        vec3 cc = mix(vec3(0.74, 0.68, 0.58), vec3(0.74, 0.62, 0.62), smoothstep(0.4, 0.62, kind));
        cc = mix(cc, vec3(0.6, 0.64, 0.5), smoothstep(0.5, 0.72, vnoise(p * 0.21 + 3.0)) * 0.5);
        cc *= 0.8 + 0.3 * tex;

        // Rocky slope and boulders at the foot of the cliffs
        float rockSlope = cliffs * smoothstep(-40.0, -8.0, dIn);
        float rubble = max(rockSlope * smoothstep(0.35, 0.55, vnoise(p * 0.4)),
                           cliffs * smoothstep(-60.0, -20.0, dIn) * smoothstep(0.5, 0.62, vnoise(p * 0.4)));

        // The underwater bases of the sea stacks
        for (int i = 0; i < 16; i++) {
          vec4 s = uStacks[i];
          if (s.w > 0.0) {
            float sd = length(p - s.xy);
            rubble = max(rubble, 1.0 - smoothstep(s.z * 1.2, s.z * 1.8 + 3.0, sd));
          }
        }
        vec3 rockCol = vec3(0.72, 0.66, 0.56) * (0.55 + 0.6 * vnoise(p * 2.5));
        rockCol = mix(rockCol, vec3(0.95, 0.5, 0.16), smoothstep(0.62, 0.75, vnoise(p * 1.3 + 4.0)) * 0.8);

        vec3 col = mix(sand, rockCol, rubble);
        col = mix(col, cc, coral * 0.7);

        // Fake relief lighting: compare the height here with a point a little toward the sun
        vec2 sunStep = normalize(uSunDir.xz + vec2(1e-4)) * 0.18;
        float relief = (tex - coralTex(p + sunStep)) * 0.8 * coral + (vnoise(p * 0.8) - vnoise(p * 0.8 + sunStep * 0.8)) * 2.0 * rubble;
        col *= clamp(1.0 + relief, 0.55, 1.4);

        bump = coral * (0.2 + 0.4 * tex) + rubble * 1.2;
        return col;
      }

      void main() {
        vec3 toCam = uCamPos - vWorld;
        float dist = length(toCam);
        vec3 v = toCam / dist;
        float far = smoothstep(80.0, 300.0, dist);

        // Normal: big waves + fine ripples up close, flattened far away to avoid shimmer
        vec3 n = normalize(vNormal);
        float detail = (1.0 - smoothstep(25.0, 160.0, dist)) * (0.35 + 0.25 * uWaveScale);
        if (detail > 0.0) {
          vec2 rp = vWorld.xz * 0.7;
          float e = 0.08;
          float h0 = ripple(rp, uTime);
          float hx = ripple(rp + vec2(e, 0.0), uTime);
          float hz = ripple(rp + vec2(0.0, e), uTime);
          n = normalize(n + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * 0.12 * detail);
        }
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), far));

        // Reflection of the sky (Fresnel: more reflective at grazing angles)
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        float cShadow = mix(1.0, cloudShadow(vWorld, uSunDir), uSunVis);
        vec3 refl = skyColor(r) * mix(0.8, 1.0, cShadow);

        // Deep water colour
        float diff = max(dot(n, uSunDir), 0.0) * uSunVis * cShadow;
        float crest = clamp(vHeight / (2.6 * max(uWaveScale, 0.3)) * 0.5 + 0.5, 0.0, 1.0);
        vec3 body = mix(uDeep, uShallow, crest * 0.8);
        body *= uLight * (0.6 + 0.4 * diff) * mix(0.75, 1.0, cShadow);

        // Subsurface glow: sunlight shining through thin wave crests
        float sss = pow(clamp(dot(v, -uSunDir) * 0.5 + 0.5, 0.0, 1.0), 3.0) * smoothstep(0.45, 0.9, crest);
        body += vec3(0.05, 0.4, 0.33) * sss * uSunVis * cShadow * uLight;

        // Where we are in the life of a breaker (see breakShape)
        float bedDepth = -vBed;
        float stage = breakStage(bedDepth);
        float bu = breakU(vWorld.xz, uTime);
        float bd = bu < 0.5 ? bu : bu - 1.0; // distance from the crest in wavelengths (negative = shore side)
        float surfSize = clamp(0.4 + uWaveScale * 0.6, 0.0, 1.0) * smoothstep(0.1, 0.9, bedDepth) * (1.0 - smoothstep(2.5, 8.0, bedDepth));

        // Clear water: the sea floor shows through even when deep, red fading first
        float dIn = inlandDist(vWorld.xz);
        float depthW = max(vWorld.y - vBed, 0.0);
        vec3 water = body;
        if (depthW < 30.0) {
          vec2 sunShift = uSunDir.xz / max(uSunDir.y, 0.25);
          vec2 bedP = vWorld.xz - n.xz * depthW * 0.6 - sunShift * depthW * 0.3; // refraction
          float bump;
          vec3 bedCol = seabed(bedP, dIn, bump);
          float dBed = max(depthW - bump, 0.05);
          float lit = uSunVis * cShadow;
          vec3 caust = caustics(bedP * 0.9, uTime) * (1.0 - smoothstep(40.0, 140.0, dist));
          bedCol = bedCol * uLight * (0.45 + 0.55 * lit) + bedCol * uSunColor * caust * 0.65 * lit * exp(-dBed * 0.12);
          vec3 absorb = exp(-dBed * vec3(0.45, 0.12, 0.08));
          vec3 turquoise = vec3(0.2, 0.85, 0.9) * uLight * mix(0.75, 1.0, cShadow); // bright aqua over sand
          vec3 inscatter = mix(turquoise, body, smoothstep(10.0, 28.0, depthW));
          vec3 shallowCol = bedCol * absorb + inscatter * (1.0 - absorb);
          water = mix(shallowCol, body, smoothstep(20.0, 30.0, depthW));
        }
        // Light shining through the thin face of a curling wave: glassy turquoise, brightest against the sun
        float face = (bd < 0.0 ? smoothstep(-0.07, -0.005, bd) : 1.0 - smoothstep(0.0, 0.03, bd)) * clamp(1.0 - abs(stage - 1.0), 0.0, 1.0) * surfSize;
        float backlit = pow(clamp(dot(v, -uSunDir) * 0.5 + 0.5, 0.0, 1.0), 2.0) * uSunVis * cShadow;
        water = mix(water, vec3(0.08, 0.72, 0.62) * uLight * (0.5 + 0.7 * backlit), face * 0.75);
        vec3 col = mix(water, refl, fres);

        // Sun glitter: a sharp core plus a broad sheen, and the moon's path at night
        float sd = max(dot(r, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 900.0) * 8.0 + pow(sd, 90.0) * 0.35) * uSunVis * cShadow;
        col += vec3(0.7, 0.8, 1.0) * pow(max(dot(r, -uSunDir), 0.0), 300.0) * 1.2 * uStars;

        // The night sky mirrored in the sea: stars glitter on the moving waves, the aurora lays
        // long wavering streaks of green toward you. Stronger than strict physics, for the look.
        if ((uStars > 0.01 || uAurora > 0.01) && dist < 900.0) {
          vec3 rr = normalize(vec3(r.x, max(r.y, 0.015), r.z));
          float mirror = (0.35 + 0.65 * fres) * (1.0 - smoothstep(500.0, 900.0, dist));
          vec3 cell = floor(rr * 260.0);
          float sn = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float tw = 0.55 + 0.45 * sin(uTime * 3.0 + fract(sn * 977.0) * 6.2832); // never negative
          col += vec3(0.85, 0.9, 1.0) * step(0.997, sn) * tw * uStars * 1.0 * (0.1 + 0.9 * fres) * smoothstep(0.0, 0.05, rr.y); // a few faint glints, mostly farther out
          // and the faint glow of the starry sky itself
          col += vec3(0.05, 0.07, 0.12) * uStars * mirror;
          if (uAurora > 0.001) {
            float az = atan(rr.x, -rr.z);
            float north = 1.0 - smoothstep(0.4, 1.7, abs(az));
            float edge = 0.06 + 0.05 * sin(az * 3.0 + uTime * 0.07);
            float h = rr.y;
            float vert = smoothstep(edge * 0.5, edge + 0.03, h) * (1.0 - smoothstep(edge + 0.04, edge + 0.45, h));
            float curtain = smoothstep(0.35, 0.75, fbm(vec2(az * 4.0 + sin(az * 7.0 + uTime * 0.15) * 0.4, uTime * 0.05)));
            vec3 ac = mix(vec3(0.15, 1.0, 0.55), vec3(0.65, 0.25, 0.95), smoothstep(edge + 0.08, edge + 0.35, h));
            col += ac * curtain * vert * north * uAurora * 0.45 * mirror;
          }
        }

        // (Foam is drawn by its own layer, on top of the fish and corals: see foamLayer below)

        // Boat lights shining on the water: a soft pool plus glints on the waves
        for (int i = 0; i < 5; i++) {
          vec3 L = uBoatLightPos[i] - vWorld;
          float ld = length(L);
          L /= ld;
          float range = i == 4 ? uSpotRange : 14.0;
          float att = 1.0 - smoothstep(0.0, range, ld);
          att *= att;
          if (i == 4) att *= smoothstep(0.82, 0.95, dot(-L, uBoatSpotDir));
          float diffL = max(dot(n, L), 0.0);
          float specL = pow(max(dot(r, L), 0.0), 40.0);
          col += uBoatLightColor[i] * att * (diffL * 0.5 + specL * 1.5);
        }

        // Fade into the horizon so the edge of the water meets the sky
        vec3 fogCol = skyColor(normalize(vec3(-v.x + 1e-4, 0.0, -v.z)));
        col = mix(col, fogCol, smoothstep(uFogNear, uFogFar, dist));

        float alpha = smoothstep(0.0, 0.07, depthW);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    // Blended (for the see-through waterline) but kept in the solid pass, so it still draws before the fish
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  })
);
// The water draws after the other solid objects and doesn't hide what's beneath it in the depth
// buffer, so fish and dolphins can be drawn afterwards, tinted as if seen through the water.
water.renderOrder = 1;
water.material.depthWrite = false;
scene.add(water);

// The foam, as its own layer on the same surface. It's drawn after everything under the water (fish,
// corals, wrecks), which are drawn after the water itself so they can be seen through it, so the foam
// always lies on top of them.
const foamLayer = new THREE.Mesh(
  waterGeo,
  new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: WATER_VERTEX,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      ${SHORE_GLSL}
      ${FOAM_GLSL}
      uniform float uTime;
      uniform float uWaveScale;
      uniform float uFoam;
      uniform float uLight;
      uniform vec3 uSunDir;
      uniform float uSunVis;
      uniform vec3 uCamPos;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vBed;
      void main() {
        float dist = length(uCamPos - vWorld);
        float foam = foamAmount(vWorld, vHeight, vBed, dist, uTime, uWaveScale, uFoam);
        if (foam < 0.004) discard;
        float diff = max(dot(normalize(vNormal), uSunDir), 0.0) * uSunVis;
        vec3 col = vec3(0.97, 0.98, 1.0) * uLight * (0.82 + 0.18 * diff);
        gl_FragColor = vec4(col, foam * (1.0 - smoothstep(uFogNear, uFogFar, dist)));
      }
    `,
    transparent: true,
    depthWrite: false,
  })
);
foamLayer.renderOrder = 1.8; // after the underwater things (0 and the reef's 1.5)
foamLayer.frustumCulled = false;
water.add(foamLayer); // moves with the water grid

// Far ocean: a flat ring from the edge of the detailed water out to the horizon, in the same haze
// colour the water fades into. It covers the underwater slopes of the coast and islands that
// would otherwise show through beyond the detailed water.
const farOceanGeo = new THREE.RingGeometry(380, 9000, 96, 1);
farOceanGeo.rotateX(-Math.PI / 2);
const farOcean = new THREE.Mesh(
  farOceanGeo,
  new THREE.ShaderMaterial({
    uniforms: shared,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      varying vec3 vWorld;
      void main() {
        vec3 v = normalize(cameraPosition - vWorld);
        gl_FragColor = vec4(skyColor(normalize(vec3(-v.x + 1e-4, 0.0, -v.z))), 1.0);
      }
    `,
  })
);
// Drawn after the land (so it covers the underwater slopes) but before the detailed water,
// so near wave crests are painted over it instead of being cut off by it at the horizon
farOcean.renderOrder = 0.5;
farOcean.frustumCulled = false;
scene.add(farOcean);

// Makes a material look like it's under the water when below the surface: colours fade with the
// distance travelled through the water (red first), and it blends in less at grazing angles.
// wag > 0 also swishes the tail end of the mesh (for fish).
function applyUnderwater(material, wag = 0) {
  material.transparent = true;
  material.customProgramCacheKey = () => "underwater-" + wag;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uLight = waterUniforms.uLight;
    shader.vertexShader =
      (wag ? "attribute float aPhase;\nuniform float uTime;\n" : "") +
      "varying vec3 vUW;\n" +
      shader.vertexShader
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          ${wag ? `transformed.x += sin(uTime * 14.0 + aPhase) * ${wag.toFixed(3)} * smoothstep(-0.05, 0.3, transformed.z);` : ""}`
        )
        .replace(
          "#include <fog_vertex>",
          `#include <fog_vertex>
          vec4 uwPos = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            uwPos = instanceMatrix * uwPos;
          #endif
          vUW = (modelMatrix * uwPos).xyz;`
        );
    shader.fragmentShader =
      "uniform float uLight;\nuniform float uTime;\nvarying vec3 vUW;\n" +
      shader.fragmentShader.replace(
        "#include <fog_fragment>",
        `float below = -vUW.y;
        if (below > 0.0) {
          vec3 rd = normalize(vUW - cameraPosition);
          float pathLen = below / max(-rd.y, 0.08);
          // Caustics: sunlight focused by the waves, dancing over surfaces that face up
          vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float facing = max(dot(normal, upView), 0.0);
          float cw = sin(vUW.x * 1.7 + sin(vUW.z * 1.3 + uTime * 0.9) * 1.5 + uTime)
                   * sin(vUW.z * 1.9 + sin(vUW.x * 1.1 - uTime * 0.7) * 1.5 - uTime * 0.8);
          gl_FragColor.rgb *= 1.0 + 0.7 * pow(max(cw, 0.0), 3.0) * facing * exp(-below * 0.12) * uLight;
          // The same water as the sea surface shader paints over the sea floor: colour fades with depth,
          // red first, into bright turquoise, so things match the floor they sit on
          vec3 absorb = exp(-below * vec3(0.32, 0.1, 0.07));
          vec3 inscatter = vec3(0.2, 0.85, 0.9) * uLight;
          gl_FragColor.rgb = gl_FragColor.rgb * absorb + inscatter * (1.0 - absorb);
          // Solid up close; only the surface reflection at a low angle, and distance, fade them out
          float fres = 0.02 + 0.98 * pow(1.0 - abs(rd.y), 5.0);
          gl_FragColor.a *= (1.0 - fres) * (1.0 - smoothstep(25.0, 45.0, pathLen));
        }
        #include <fog_fragment>`
      );
  };
  return material;
}

// ===== Lights =====
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
const moonLight = new THREE.DirectionalLight(0x8899cc, 0);
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x223344, 0.5);
scene.add(sunLight, sunLight.target, moonLight, moonLight.target, hemiLight);
