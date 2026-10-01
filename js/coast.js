// Coastline terrain: haze, cliffs and beach, river valley, sea stacks, shore rocks, lighthouse.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Distant haze for far-away scenery (shoreline, lighthouse) =====
const haze = {
  uHazeNear: { value: 250 },
  uHazeFar: { value: 2600 },
  uHazeMax: { value: 0.8 },
};
// Pale limestone like sea cliffs: ivory and buff layers, orange iron staining,
// dark rain streaks, pitting and grain. rockBump gives the surface relief for lighting.
const ROCK_GLSL = /* glsl */ `
  varying float vRock;
  vec3 limestone(vec3 p) {
    float warp = (shoreNoise(p.x * 0.02) - 0.5) * 3.0 + (shoreNoise(p.z * 0.03 + 5.0) - 0.5) * 2.0;
    float t = p.y * 0.3 + warp;
    float layer = shoreHash(floor(t) * 1.7 + 3.0);
    vec3 col = mix(vec3(0.92, 0.88, 0.8), vec3(0.8, 0.71, 0.58), layer);
    // Each stretch of coast has its own rock: white chalk at East Head, golden layered sandstone in the
    // far west, warm orange-red rock in the east, pale limestone elsewhere
    float qc = (p.x - 1400.0) / 230.0;
    float chalk = exp(-qc * qc);
    float sandstone = 1.0 - smoothstep(-1750.0, -1500.0, p.x);
    float redrock = smoothstep(1750.0, 1950.0, p.x);
    col = mix(col, mix(vec3(0.9, 0.7, 0.44), vec3(0.72, 0.5, 0.32), layer), sandstone);
    col = mix(col, mix(vec3(0.8, 0.48, 0.31), vec3(0.6, 0.35, 0.25), layer), redrock);
    col = mix(col, vec3(0.95, 0.94, 0.9) * (0.93 + 0.07 * layer), chalk * 0.92);
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.1, fract(t));
    float stain = smoothstep(0.45, 0.75, fbm3(p * 0.05 + vec3(0.0, p.y * 0.02, 0.0)));
    col = mix(col, vec3(0.88, 0.56, 0.28), stain * 0.7 * (1.0 - chalk));
    float streak = smoothstep(0.55, 0.8, noise3(p * vec3(0.9, 0.06, 0.9)));
    col *= 1.0 - 0.28 * streak;
    float pit = smoothstep(0.72, 0.85, noise3(p * 2.2));
    col *= 1.0 - 0.35 * pit;
    col *= 0.88 + 0.24 * noise3(p * 6.0);
    return col;
  }
  float rockBump(vec3 p) {
    return noise3(p * 0.35) * 1.2 + noise3(p * vec3(0.2, 1.5, 0.2)) * 0.6
         + noise3(p * 1.3) * 0.4 + noise3(p * 4.0) * 0.12;
  }
`;

// Town buildings: rows of windows on every wall, dark glass by day, many lit warm at night
const cityLights = { value: 0 };
const CITY_WINDOWS_GLSL = /* glsl */ `
  {
    vec3 wn = normalize(vWorldN);
    if (abs(wn.y) < 0.5) {
      vec2 along = normalize(vec2(-wn.z, wn.x));
      float u = dot(vCloudWorld.xz, along) / 2.8;
      float v = vCloudWorld.y / 3.2;
      vec2 f = fract(vec2(u, v));
      float win = step(0.28, f.x) * step(f.x, 0.72) * step(0.32, f.y) * step(f.y, 0.78);
      float lit = step(0.42, hash3(vec3(floor(u), floor(v), floor(dot(vCloudWorld.xz, wn.xz)))));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.1, 0.13, 0.17), win * 0.65 * (1.0 - uCityLights));
      gl_FragColor.rgb += vec3(1.0, 0.76, 0.42) * win * lit * uCityLights * 1.6;
    }
  }
`;

// opts.terrain: per-vertex rock mask (aRock) on the cliffs; opts.stack: sea stacks (all limestone);
// opts.rock: boulders (their own instance colour with grain); opts.city: town buildings with windows
function applyHaze(material, opts = {}) {
  const mode = opts.terrain ? "terrain" : opts.stack ? "stack" : opts.rock ? "rock" : opts.city ? "city" : "plain";
  material.customProgramCacheKey = () => "haze-" + mode;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHazeNear = haze.uHazeNear;
    shader.uniforms.uHazeFar = haze.uHazeFar;
    shader.uniforms.uHazeMax = haze.uHazeMax;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunVis = shared.uSunVis;
    shader.uniforms.uCloudCover = shared.uCloudCover;
    shader.uniforms.uCloudOffset = shared.uCloudOffset;
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uTime = shared.uTime;

    const rockValue = mode === "terrain" ? "aRock" : mode === "plain" || mode === "city" ? "0.0" : "1.0";
    shader.uniforms.uCityLights = cityLights;
    shader.vertexShader =
      (mode === "terrain" ? "attribute float aRock;\n" : "") +
      "varying vec3 vCloudWorld;\nvarying float vRock;\nvarying vec3 vWorldN;\n" +
      shader.vertexShader.replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        vec4 cloudPos = vec4(transformed, 1.0);
        vec3 worldN = objectNormal;
        #ifdef USE_INSTANCING
          cloudPos = instanceMatrix * cloudPos;
          worldN = mat3(instanceMatrix) * worldN;
        #endif
        vCloudWorld = (modelMatrix * cloudPos).xyz;
        vWorldN = mat3(modelMatrix) * worldN;
        vRock = ${rockValue};`
      );

    // Boulders keep their own colour with some grain; cliffs and stacks are limestone
    const rockAlbedo =
      mode === "rock" ? "diffuseColor.rgb * (0.8 + 0.4 * noise3(rp * 2.5))" : "limestone(rp)";

    shader.fragmentShader =
      "uniform float uHazeNear;\nuniform float uHazeFar;\nuniform float uHazeMax;\n" +
      "uniform vec3 uSunDir;\nuniform float uSunVis;\nuniform vec3 uSunColor;\nuniform float uTime;\n" +
      "varying vec3 vCloudWorld;\nvarying vec3 vWorldN;\nuniform float uCityLights;\n" +
      CLOUD_GLSL +
      SHORE_GLSL +
      ROCK_GLSL +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          if (vRock > 0.0) {
            vec3 rp = vCloudWorld;
            vec3 rockCol = ${rockAlbedo};
            float aboveSwash = rp.y - swashLevel(rp.xz, uTime);
            // Dark, wet, algae-stained rock where the waves splash
            float splashZone = 1.0 - smoothstep(0.0, 1.6, aboveSwash);
            rockCol = mix(rockCol, rockCol * vec3(0.5, 0.5, 0.42), splashZone);
            // Orange and pink encrusting coral just above the water
            float crust = smoothstep(0.5, 0.65, noise3(rp * 0.8)) * (1.0 - smoothstep(0.3, 1.2, aboveSwash));
            vec3 crustCol = mix(vec3(0.97, 0.45, 0.12), vec3(0.85, 0.42, 0.58), noise3(rp * 0.3 + 9.0));
            rockCol = mix(rockCol, crustCol * (0.75 + 0.35 * noise3(rp * 5.0)), crust * 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, vRock);
          }`
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          // Rock relief: bump the normal with the gradient of a world-space height pattern
          if (vRock > 0.0) {
            vec3 bp = vCloudWorld;
            float be = 0.15;
            float bh = rockBump(bp);
            vec3 bg = vec3(rockBump(bp + vec3(be, 0.0, 0.0)) - bh,
                           rockBump(bp + vec3(0.0, be, 0.0)) - bh,
                           rockBump(bp + vec3(0.0, 0.0, be)) - bh) / be;
            vec3 gv = (viewMatrix * vec4(bg, 0.0)).xyz;
            gv -= dot(gv, normal) * normal;
            float bumpFade = 1.0 - smoothstep(60.0, 300.0, length(cameraPosition - bp));
            normal = normalize(normal - gv * 0.5 * vRock * bumpFade);
          }`
        )
        .replace(
          "#include <fog_fragment>",
          `vec3 wp = vCloudWorld;
        float cs = cloudShadow(wp, uSunDir);
        gl_FragColor.rgb *= 1.0 - 0.45 * (1.0 - cs) * uSunVis;
        ${mode === "city" ? CITY_WINDOWS_GLSL : ""}

        // Beach: sand darkened where the waves have just washed over it
        float sandMask = (1.0 - smoothstep(2.5, 4.0, wp.y)) * (1.0 - smoothstep(130.0, 160.0, inlandDist(wp.xz)));
        sandMask *= 1.0 - vRock;
        float sw = swashLevel(wp.xz, uTime);
        float wet = max(1.0 - smoothstep(0.3, 0.7, wp.y), 1.0 - smoothstep(0.0, 0.3, wp.y - sw)) * sandMask;
        gl_FragColor.rgb *= 1.0 - 0.38 * wet;

        // Sand grains glinting in the sun: each tiny cell has a random facet that catches
        // the sun only from certain angles, so the sparkle shimmers as you move
        vec3 V = normalize(cameraPosition - wp);
        float distC = length(cameraPosition - wp);
        vec2 cell = floor(wp.xz * 12.0);
        float wobble = sin(uTime * 3.0 + hash3(vec3(cell, 4.0)) * 6.28) * 0.05;
        vec3 gn = normalize(vec3(hash3(vec3(cell, 2.0)) - 0.5 + wobble, 0.9, hash3(vec3(cell, 3.0)) - 0.5));
        float glint = pow(max(dot(reflect(-V, gn), uSunDir), 0.0), 400.0) * step(0.55, hash3(vec3(cell, 1.0)));
        gl_FragColor.rgb += uSunColor * glint * 5.0 * sandMask * (1.0 - wet) * uSunVis * cs *
          (1.0 - smoothstep(40.0, 180.0, distC));

        #ifdef USE_FOG
          float hazeF = smoothstep(uHazeNear, uHazeFar, fogDepth) * uHazeMax;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hazeF);
        #endif`
        );
  };
  return material;
}

// ===== Shoreline =====
// Turns a smooth slope into ledges and steep steps, like eroded sedimentary layers
function terrace(y, step) {
  const s = y / step;
  const i = Math.floor(s);
  return (i + smooth(0, 0.45, s - i)) * step;
}

// ===== River: comes down a valley east of the lighthouse and forks into two mouths through a swampy delta =====
// Points are [x, d] with d = distance inland from the shoreline at that x
const shoreZAt = (x) => SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60;
const RIVER_PATHS = [
  { w: 14, pts: [[830, 900], [805, 640], [822, 420], [800, 190]] }, // main river
  { w: 10, pts: [[800, 190], [762, 110], [722, 40], [700, -20]] }, // western mouth
  { w: 10, pts: [[800, 190], [848, 115], [888, 45], [912, -20]] }, // eastern mouth
];
const RIVER_SEGS = [];
for (const path of RIVER_PATHS) {
  const p = path.pts.map(([x, d]) => [x, shoreZAt(x) - d]);
  for (let i = 0; i < p.length - 1; i++) RIVER_SEGS.push({ ax: p[i][0], az: p[i][1], bx: p[i + 1][0], bz: p[i + 1][1], w: path.w });
}
const SWAMP = { x: 800, z: shoreZAt(800) - 95, r: 160 };

// Distance from the edge of the nearest river channel (negative = in the water)
function riverDist(x, z) {
  let best = 1e9;
  for (const s of RIVER_SEGS) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz), 0, 1);
    const dist = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)) - s.w / 2;
    if (dist < best) best = dist;
  }
  return best;
}
// 1 inside the swampy delta between the two mouths, fading out at its edges
function swampMask(x, z) {
  const d = inland(x, z);
  return (1 - smooth(SWAMP.r * 0.65, SWAMP.r, Math.hypot(x - SWAMP.x, z - SWAMP.z))) * smooth(4, 18, d);
}
const lerp = (a, b, t) => a + (b - a) * t;

// Cuts the river valley, its channels and the swamp into the land
function carveRiver(x, z, y) {
  const r = riverDist(x, z);
  if (r > 220) return y;
  const plain = 0.9 + Math.max(0, r) * 0.025; // a low floodplain along the river
  y = Math.min(y, lerp(plain, y, smooth(40, 220, r)));
  const sw = swampMask(x, z);
  if (sw > 0) y = lerp(y, 0.32 + (fbm2(x * 0.05, z * 0.05) - 0.5) * 0.9, sw); // hummocks and pools
  return Math.min(y, lerp(-1.3, y, smooth(-1, 5, r))); // the channel itself
}

function landHeight(x, z) {
  const d = inland(x, z);
  if (d < 0) return seaBed(x, z);
  const beachY = beachProfile(d);

  // Sandy cove backed by green hills
  let coveY = beachY + smooth(110, 360, d) * (25 + 110 * fbm2(x * 0.0025, z * 0.0025));
  coveY += (fbm2(x * 0.03, z * 0.03) - 0.5) * 3 * smooth(40, 90, d);

  // Limestone cliff rising from a rocky shelf at the waterline (or from the back of a beach, or straight out
  // of the sea), cut by gullies and buttresses
  const sb = cliffSetback(x);
  const dc = d - sb; // distance inland from the foot of the cliff
  const cliffH = 32 + 26 * noise1(x * 0.01 + 3.1);
  // Gullies and buttresses kept broad enough (≥ ~15 m) for the 5 m terrain grid to draw smoothly,
  // otherwise the cliff edge breaks up into jagged sawtooth spikes on the horizon
  const gully = (noise1(x * 0.03 + 11) - 0.5) * 16 + (noise1(x * 0.065 + 3) - 0.5) * 5;
  const rise = smooth(12, 30, dc + gully + (noise2(x * 0.04, z * 0.04) - 0.5) * 6);
  const step = 3.5 + 2 * noise1(x * 0.02 + 1.7);
  const beachBase = beachProfile(Math.min(d, Math.max(sb, 0))) + 0.3; // 0 where there's no beach
  const shelfD = Math.max(d - Math.max(sb, 0), 0);
  let cliffY = beachBase - 0.3 + Math.min(shelfD, 10) * 0.09 + terrace(cliffH * rise, step);
  cliffY += smooth(45, 300, d) * (8 + 50 * fbm2(x * 0.0025, z * 0.0025));
  cliffY += (fbm2(x * 0.08, z * 0.08) - 0.5) * 1.5 * smooth(8, 20, d);

  const y = coveY + (cliffY - coveY) * cliffAmount(x);
  if (x > 450 && x < 1150) return carveRiver(x, z, y);
  if (Math.abs(x - CREEK_X) < 90) return carveCreek(x, d, y);
  return y;
}

// A creek comes down to Bridge Bay through a steep little ravine; the coast road crosses it on a bridge
const CREEK_X = 2050;
function carveCreek(x, d, y) {
  const off = Math.abs(x - CREEK_X + (noise1(d * 0.02) - 0.5) * 16);
  const floor = 0.6 + Math.max(0, d - 30) * 0.07;
  return Math.min(y, lerp(floor, y, smooth(5, 70, off)));
}

function buildShoreline() {
  const width = 6000;
  const depth = 1120;
  const centerZ = SHORE_Z - 340;
  const geo = new THREE.PlaneGeometry(width, depth, 1200, 320);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + centerZ;
    pos.setY(i, landHeight(x, z));
  }
  geo.computeVertexNormals();

  const sand = new THREE.Color(0xe3d3a8);
  const wetSand = new THREE.Color(0x8f8468);
  const grass = new THREE.Color(0x5b7a37);
  const forest = new THREE.Color(0x3f5a2c);
  const rock = new THREE.Color(0x7a7a72);
  const plateau = new THREE.Color(0xc4ab66); // golden grass
  const turf = new THREE.Color(0x6f8a3e); // green turf
  const scrub = new THREE.Color(0x4f6231); // dark coastal scrub
  const lush = new THREE.Color(0x4f7a32);
  const swampCol = new THREE.Color(0x4a5230);
  const mud = new THREE.Color(0x5e5238);
  const colors = new Float32Array(pos.count * 3);
  const rockMask = new Float32Array(pos.count);
  const c = new THREE.Color();
  const normals = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i) + centerZ;
    const ny = normals.getY(i);
    const cm = cliffAmount(x);
    c.copy(wetSand).lerp(sand, smooth(-1, 0.8, y));
    c.lerp(grass, smooth(2, 6, y) * (1 - cm));
    c.lerp(forest, smooth(15, 40, y) * noise2(x * 0.01, z * 0.01) * (1 - cm));
    c.lerp(plateau, smooth(1, 4, y) * cm);
    c.lerp(turf, smooth(0.36, 0.62, noise2(x * 0.012 + 5, z * 0.012)) * smooth(6, 20, y) * cm * 0.85);
    c.lerp(scrub, smooth(0.58, 0.78, noise2(x * 0.06, z * 0.06)) * smooth(10, 30, y) * cm * 0.75);
    c.lerp(rock, Math.max(smooth(60, 100, y), 1 - smooth(0.6, 0.85, ny)) * smooth(1, 4, y) * (1 - cm));
    if (x > 450 && x < 1150) {
      // Lush floodplain, muddy banks and dark swamp along the river
      const r = riverDist(x, z);
      c.lerp(lush, (1 - smooth(20, 90, r)) * smooth(0.6, 1.2, y) * 0.8);
      c.lerp(swampCol, swampMask(x, z) * 0.85);
      c.lerp(mud, 1 - smooth(0, 7, r));
    }
    c.multiplyScalar(0.88 + 0.24 * noise2(x * 0.05, z * 0.05));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    // Exposed rock: cliff faces and the shelf at their base (shaded as limestone in the shader)
    // (but not the sand of a beach below the cliffs)
    const shelf = (1 - smooth(1.0, 2.5, y)) * (1 - smooth(4, 16, cliffSetback(x)));
    rockMask[i] = clamp(cm * Math.max(1 - smooth(0.7, 0.93, ny), shelf), 0, 1);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aRock", new THREE.BufferAttribute(rockMask, 1));

  const land = new THREE.Mesh(
    geo,
    applyHaze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { terrain: true })
  );
  land.position.z = centerZ;
  return land;
}
scene.add(buildShoreline());

// ===== Sea stacks =====
// [offset from the lighthouse along x, distance offshore, radius, height above water]
const STACK_SPOTS = [
  [-95, -48, 5.5, 34],
  [-40, -72, 6.5, 42],
  [25, -58, 5.0, 30],
  [88, -86, 7.0, 38],
  [132, -40, 3.5, 18],
];
// The Seven Sisters: tall sandstone stacks off the far western headland [x, distance offshore, radius, height]
const SISTERS_SPOTS = [
  [-1965, -70, 6, 34],
  [-1915, -98, 7, 42],
  [-1872, -62, 5, 28],
  [-1830, -112, 8, 46],
  [-1782, -78, 5.5, 33],
  [-1742, -52, 4, 21],
  [-1700, -92, 6, 37],
];
// The sea arch off West Point: two legs and a span high enough to sail under (see landmarks.js)
const ARCH = { x: -700, R: 12, H0: 9, legR: 4.5 };
ARCH.z = SHORE_Z + headland(ARCH.x) + (noise1(ARCH.x * 0.008) - 0.5) * 60 + 48;
const seaStacks = [
  ...STACK_SPOTS.map(([dx, d, r, h], i) => {
    const x = LH_X + dx;
    const z = SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60 - d;
    return { x, z, r, h, seed: i * 7.31 + 2.0, group: "lighthouse" };
  }),
  ...SISTERS_SPOTS.map(([x, d, r, h], i) => {
    const z = SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60 - d;
    return { x, z, r, h, seed: i * 5.17 + 40, group: "sisters" };
  }),
  // The arch's legs: the boat may pass close by them, to sail through
  ...[-1, 1].map((side) => ({
    x: ARCH.x + side * ARCH.R,
    z: ARCH.z,
    r: ARCH.legR,
    h: ARCH.H0 + 2,
    seed: side * 3.3 + 80,
    group: "arch",
    clear: ARCH.legR * 1.2 + 1,
  })),
];

function buildSeaStack(r, h, seed) {
  const below = 14;
  const geo = new THREE.CylinderGeometry(1, 1, 1, 40, 70, false);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const pz = p.getZ(i);
    const t = p.getY(i) + 0.5; // 0 at the bottom, 1 at the top
    const rl = Math.hypot(px, pz); // 0 at a cap centre, 1 on the sides
    const a = Math.atan2(pz, px);
    let y = -below + t * (h + below);
    const ca = Math.cos(a);
    const sa = Math.sin(a);

    let rr = r;
    rr *= 1 + 0.35 * smooth(2, -4, y); // flared base under water
    rr *= 1 - 0.1 * Math.sin(Math.PI * clamp(y / h, 0, 1)); // slight waist
    rr *= 1 - 0.2 * Math.exp(-(((y - 0.7) / 1.3) ** 2)); // wave-cut notch at the waterline
    rr *= 1 + 0.06 * Math.sin(y * 1.3 + seed); // layered ledges
    rr *= 0.78 + 0.44 * cloudNoise3(ca * 1.3 + seed, y * 0.12, sa * 1.3);
    rr *= 0.95 + 0.1 * cloudNoise3(ca * 4 + seed, y * 0.6, sa * 4);

    // Rounded, jagged crown
    if (t > 0.999) y += 1.5 * (1 - rl) * r * 0.3;
    y += (cloudNoise3(ca * 2 + seed, 3.3, sa * 2) - 0.5) * 4 * smooth(0.85, 1, t);

    p.setXYZ(i, ca * rr * rl, y, sa * rr * rl);
  }
  geo.computeVertexNormals();
  return geo;
}

const stackMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), { stack: true });
for (const s of seaStacks) {
  const mesh = new THREE.Mesh(buildSeaStack(s.r, s.h, s.seed), stackMat);
  mesh.position.set(s.x, 0, s.z);
  mesh.rotation.y = s.seed;
  scene.add(mesh);
}

// ===== Shore rocks: natural clusters at the cliff foot and around the sea stacks =====
function buildShoreRocks() {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.78 + 0.32 * cloudNoise3(x * 1.2 + 3, y * 1.2, z * 1.2) + 0.08 * cloudNoise3(x * 4, y * 4 + 7, z * 4);
    p.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  geo.computeVertexNormals();

  const mat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), { rock: true });

  // Cluster centres
  const clusters = [];
  for (let x = -2800; x < 2800; x += rand(70, 150)) {
    if (cliffAmount(x) < 0.6) continue;
    const d = rand(-5, 3);
    const z = SHORE_Z + headland(x) + (noise1(x * 0.008) - 0.5) * 60 - d;
    clusters.push({ x, z, spread: rand(3, 6), count: 3 + Math.floor(rand(0, 5)), big: rand(1.2, 2.2), stack: null });
  }
  for (const s of seaStacks) {
    if (s.group === "arch") continue; // keep the way through the arch clear
    clusters.push({ x: s.x, z: s.z, spread: 3, count: 6 + Math.floor(rand(0, 4)), big: 1.6, stack: s });
  }

  const total = clusters.reduce((n, c) => n + c.count, 0);
  const rocks = new THREE.InstancedMesh(geo, mat, total);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0;
  for (const c of clusters) {
    for (let k = 0; k < c.count; k++) {
      // One or two larger rocks per cluster, the rest smaller around them
      const size = k === 0 ? c.big : rand(0.3, 0.6) * c.big;
      let x;
      let z;
      let y;
      if (c.stack) {
        const a = rand(0, Math.PI * 2);
        const rr = c.stack.r * 1.05 + rand(0, c.spread);
        x = c.x + Math.cos(a) * rr;
        z = c.z + Math.sin(a) * rr;
        y = rand(-0.9, 0.1);
      } else {
        const a = rand(0, Math.PI * 2);
        const rr = k === 0 ? 0 : rand(0.6, 1) * c.spread;
        x = c.x + Math.cos(a) * rr;
        z = c.z + Math.sin(a) * rr;
        y = Math.max(landHeight(x, z), -1.2) + size * 0.2;
      }
      v.set(x, y, z);
      e.set(rand(-0.3, 0.3), rand(0, Math.PI * 2), rand(-0.3, 0.3));
      q.setFromEuler(e);
      s.set(size * rand(0.9, 1.3), size * rand(0.55, 0.8), size * rand(0.9, 1.3));
      m.compose(v, q, s);
      rocks.setMatrixAt(n, m);
      col.setHSL(rand(0.08, 0.11), rand(0.15, 0.3), rand(0.62, 0.78));
      rocks.setColorAt(n, col);
      n++;
    }
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  return rocks;
}
scene.add(buildShoreRocks());

// Tell the water shader where the stacks stand, so their rocky bases show through the water
seaStacks.forEach((s, i) => waterUniforms.uStacks.value[i].set(s.x, s.z, s.r, 1));

// ===== Lighthouse =====
function makeGlowTexture() {
  const size = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,240,200,0.6)");
  grad.addColorStop(1, "rgba(255,220,160,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}
const glowTexture = makeGlowTexture();

function buildLighthouse() {
  const zTip = SHORE_Z + headland(LH_X) + (noise1(LH_X * 0.008) - 0.5) * 60 - 55;
  const group = new THREE.Group();
  group.position.set(LH_X, landHeight(LH_X, zTip) - 1, zTip);

  const white = applyHaze(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.7 }));
  const red = applyHaze(new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.7 }));
  const dark = applyHaze(new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6 }));

  // Striped tapering tower
  for (let i = 0; i < 5; i++) {
    const r0 = 4.5 - 1.5 * (i / 5);
    const r1 = 4.5 - 1.5 * ((i + 1) / 5);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 6, 16), i % 2 === 0 ? white : red);
    seg.position.y = 3 + 6 * i;
    group.add(seg);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 0.8, 16), dark);
  gallery.position.y = 30.4;
  group.add(gallery);

  const lanternMat = applyHaze(
    new THREE.MeshStandardMaterial({ color: 0x33302a, emissive: 0xffe2a0, emissiveIntensity: 0, roughness: 0.2 })
  );
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4, 12), lanternMat);
  lantern.position.y = 32.8;
  group.add(lantern);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.5, 12), red);
  roof.position.y = 36.1;
  group.add(roof);

  const house = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), white);
  house.position.set(8, 2.5, 2);
  group.add(house);
  const houseRoof = new THREE.Mesh(new THREE.ConeGeometry(6, 3, 4), red);
  houseRoof.position.set(8, 6.5, 2);
  houseRoof.rotation.y = Math.PI / 4;
  group.add(houseRoof);

  // Rotating beams (two, opposite each other)
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff1c8,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const beamGeo = new THREE.ConeGeometry(14, 500, 20, 1, true);
  beamGeo.translate(0, -250, 0);
  beamGeo.rotateZ(Math.PI / 2); // apex at the lamp, pointing along +x
  const beams = new THREE.Group();
  beams.position.y = 32.8;
  const beamA = new THREE.Mesh(beamGeo, beamMat);
  const beamB = new THREE.Mesh(beamGeo, beamMat);
  beamB.rotation.y = Math.PI;
  beams.add(beamA, beamB);
  group.add(beams);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffe6b0,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  glow.position.y = 32.8;
  group.add(glow);

  return { group, lanternMat, beams, beamMat, glow };
}
const lighthouse = buildLighthouse();
scene.add(lighthouse.group);
