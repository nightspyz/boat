// Coastline terrain: haze, cliffs and beach, river valley, sea stacks, shore rocks, lighthouse.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Distant haze for far-away scenery (shoreline, lighthouse) =====
const haze = {
  uHazeNear: { value: 250 },
  uHazeFar: { value: 2600 },
  uHazeMax: { value: 0.8 },
  uWet: { value: 0 }, // rain: the land darkens as it gets wet
  uWind: { value: new THREE.Vector2(0.3, 0) }, // wind over the grass: direction × strength (set in clifftop.js)
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
    col *= 1.0 - 0.14 * pit;
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

// Beaches: pebbles instead of sand on the beaches under the cliffs, and a dark line of washed-up
// seaweed along the high-water mark on the sandy ones
const PEBBLE_GLSL = /* glsl */ `
        {
          float distP = length(cameraPosition - wp);
          float pebbly = sandMask * smoothstep(0.45, 0.75, cliffAmount(wp.x));
          if (pebbly > 0.01) {
            vec2 pp = wp.xz * 2.2;
            vec2 cellP = floor(pp);
            vec2 jit = vec2(hash3(vec3(cellP, 7.0)), hash3(vec3(cellP, 8.0))) - 0.5;
            float dP = length(fract(pp) - 0.5 - jit * 0.35);
            float stone = 1.0 - smoothstep(0.3, 0.46, dP);
            vec3 pc = mix(vec3(0.52, 0.5, 0.47), vec3(0.86, 0.82, 0.74), hash3(vec3(cellP, 9.0)));
            pc = mix(pc, vec3(0.62, 0.47, 0.35), step(0.82, hash3(vec3(cellP, 10.0))));
            vec3 tgt = mix(vec3(0.33, 0.3, 0.26), pc * (0.85 + 0.3 * (1.0 - dP)), stone);
            tgt = mix(tgt, vec3(0.66, 0.62, 0.56), smoothstep(25.0, 110.0, distP));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * tgt / vec3(0.89, 0.83, 0.66), pebbly);
          }
          float wrack = sandMask * (1.0 - pebbly) * smoothstep(0.7, 0.82, wp.y) * (1.0 - smoothstep(0.92, 1.1, wp.y))
                      * smoothstep(0.45, 0.7, noise3(vec3(wp.xz * 0.35, 3.0)));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.42, 0.4, 0.28), wrack * 0.8);
          sandMask *= 1.0 - pebbly; // no sand glints on the pebbles
        }
`;

// ===== Fields: a patchwork of crops with hedgerows (farmland only, see grass.js), and the wind over grass =====
const FIELD_GLSL = /* glsl */ `
  float fhash(vec2 c) { return hash3(vec3(c, 17.0)); }
  // A warped grid of parcels, offset row by row like real field systems. kind: 0 wheat, 1 straw,
  // 2 fresh grass, 3 deep green, 4 ploughed, 5 mown hay. hedge: 1 on the hedgerows between fields.
  vec3 fieldColor(vec2 p, out float kind, out float hedge) {
    vec2 w = p + vec2(noise3(vec3(p * 0.012, 1.0)), noise3(vec3(p * 0.012, 7.0))) * 44.0 - 22.0;
    vec2 q = mat2(0.94, -0.34, 0.34, 0.94) * w;
    vec2 size = vec2(96.0, 68.0);
    float row = floor(q.y / size.y);
    q.x += fhash(vec2(row, 3.0)) * size.x;
    vec2 cell = floor(q / size);
    vec2 f = fract(q / size) * size;
    float edge = min(min(f.x, size.x - f.x), min(f.y, size.y - f.y));
    hedge = 1.0 - smoothstep(1.3, 2.6, edge);
    kind = floor(fhash(cell) * 6.0);
    vec3 c = kind < 1.0 ? vec3(0.80, 0.65, 0.29)
           : kind < 2.0 ? vec3(0.86, 0.77, 0.47)
           : kind < 3.0 ? vec3(0.28, 0.48, 0.11)
           : kind < 4.0 ? vec3(0.16, 0.34, 0.07)
           : kind < 5.0 ? vec3(0.50, 0.37, 0.25)
           : vec3(0.50, 0.60, 0.22);
    // Tractor lines along each field
    float sd = fhash(cell + 9.0) > 0.5 ? f.x : f.y;
    c *= 1.0 + (kind >= 5.0 ? 0.06 : 0.03) * sin(sd * 1.9);
    c *= 0.9 + 0.18 * fhash(cell + 4.0);
    // Hedgerows: dark green, bumpy with trees
    float tree = smoothstep(0.5, 0.8, noise3(vec3(p * 0.16, 3.0)));
    c = mix(c, vec3(0.15, 0.27, 0.1) * (0.75 + 0.45 * tree), hedge);
    return c;
  }
  // Lush meadow green, varying over the land (the grass blades use the same colour at their roots)
  vec3 meadowColor(vec2 p) {
    float n = noise3(vec3(p * 0.02, 11.0));
    float m = noise3(vec3(p * 0.11, 13.0));
    vec3 c = mix(vec3(0.09, 0.25, 0.035), vec3(0.2, 0.38, 0.06), n);
    return c * (0.85 + 0.3 * m);
  }
  // ----- Procedural grass (no geometry) -----
  float ghash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  // The wind field that sways the blades: big waves moving groups together, a quicker ripple, slow
  // wandering noise, and now and then a stronger gust sweeping a larger area
  float grassWind(vec2 p) {
    float ws = length(uWind);
    vec2 wd = uWind / max(ws, 1e-3);
    float along = dot(p, wd);
    float windLarge = sin(along * 0.3 - uTime * (1.0 + ws * 2.0));
    float windMedium = sin(p.x * 1.3 + p.y * 0.7 + uTime * 1.8);
    float windNoise = noise3(vec3(p * 0.01 + uTime * 0.05, 2.0)) * 2.0 - 1.0;
    float gust = smoothstep(0.55, 0.85, noise3(vec3(along * 0.02 - uTime * (0.3 + ws), dot(p, vec2(-wd.y, wd.x)) * 0.02, 4.0)));
    return windLarge * 0.6 + windMedium * 0.25 + windNoise * 0.15 + gust * 1.6;
  }
  // Grass with real height, drawn without geometry: the view ray is marched down through a layer of
  // blades (each cell holds one, at a random spot, with its own height), stopping at the first blade
  // it meets. Blades taper, bend over (more towards the tip) in patches and with the wind; each test
  // covers the stretch the ray and the bend move between one height and the next, so blades come out
  // as continuous strokes. Smaller blade sizes fade out before a pixel gets too big for them.
  float bladeAt(vec2 xz, float h, float H, float cell, float seed, vec2 lean, vec2 s) {
    float tt = h / H;
    vec2 p = (xz - lean * tt * tt) / cell;
    vec2 f = fract(p);
    vec2 c = mod(floor(p), 256.0); // keep the hash inputs small: far from the origin they lose precision and stripe
    vec2 bp = vec2(ghash(c + seed), ghash(c + seed + 17.0)) * 0.6 + 0.2;
    float bh = H * (0.45 + 0.55 * ghash(c + seed + 3.0));
    if (h > bh) return -1.0;
    float t = h / bh;
    float r = 0.2 * (1.0 - 0.85 * t) + 0.02;
    vec2 d = f - bp;
    float k = clamp(dot(d, s) / max(dot(s, s), 1e-5), -0.5, 0.5);
    return length(d - s * k) < r ? t : -1.0;
  }
  // t along the first blade hit (0 = root, 1 = tip), or -1 if the ray reaches the ground
  float marchGrass(vec3 P, vec3 V, float H, float cell, vec2 lean, int steps) {
    float vy = min(V.y, -0.18);
    float dh = H / float(steps);
    for (int i = 0; i < 16; i++) {
      if (i >= steps) break;
      float h = H * (1.0 - (float(i) + 0.5) / float(steps));
      float tt = h / H;
      vec2 xz = P.xz + V.xz * (h / vy);
      vec2 s = (-V.xz * (dh / vy) + lean * (2.0 * tt * dh / H)) / cell;
      float t = bladeAt(xz, h, H, cell, 0.0, lean, s);
      if (t >= 0.0) return t;
      t = bladeAt(xz + cell * vec2(0.5, 0.37), h, H, cell, 11.0, lean, s);
      if (t >= 0.0) return t;
    }
    return -1.0;
  }
  // The grass's colour at this spot, built from the ground colour beneath it
  vec3 grassAlbedo(vec3 P, vec3 base, float H, float dist) {
    vec3 V = normalize(P - cameraPosition);
    float ws = length(uWind);
    vec2 wd = uWind / max(ws, 1e-3);
    float str = clamp(ws * 1.6, 0.0, 1.0);
    float w = grassWind(P.xz);
    // Grass lies over in patches, each its own way; the wind pushes it further and lets it spring back
    float la = noise3(vec3(P.xz * 0.12, 20.0)) * 9.42;
    vec2 restLean = vec2(cos(la), sin(la)) * (0.25 + 0.25 * noise3(vec3(P.xz * 0.3, 40.0)));
    vec2 lean = (restLean + wd * str * (0.35 + 0.35 * w)) * H;
    float pv = noise3(vec3(P.xz * 0.6, 4.0));
    vec3 mid = base * 0.75;
    vec3 tip = base * (mix(1.45, 1.12, smoothstep(0.3, 0.7, base.r)) + 0.25 * pv) + vec3(0.02, 0.04, 0.0); // pale crops don't go white
    vec3 dark = base * 0.07; // deep shade down between the blades
    float sheen = max(w, 0.0) * 0.2 * str + (pv - 0.5) * 0.12;
    // From far off the blades blend into this; it brightens back to the plain ground colour by 300 m
    vec3 col = base * mix(0.72, 1.0, smoothstep(150.0, 300.0, dist)) * (1.0 + sheen);
    // Size of a pixel on the ground, across the view
    #if __VERSION__ >= 300
      float fw = min(length(dFdx(P.xz)), length(dFdy(P.xz))) * 1.5;
    #else
      float fw = dist * 0.0015;
    #endif
    int steps = dist < 10.0 ? 14 : dist < 35.0 ? 10 : 6;
    for (int k = 0; k < 3; k++) {
      float cell = k == 0 ? 0.42 : k == 1 ? 0.14 : 0.045;
      float wt = 1.0 - smoothstep(cell * 0.3, cell * 0.8, fw);
      if (wt <= 0.0) continue;
      float t = marchGrass(P, V, H, cell, lean, steps);
      vec3 c = t >= 0.0 ? mix(mid * 0.35, tip, t * t) * (0.25 + 0.75 * t) : dark;
      col = mix(col, c * (1.0 + sheen) * 1.1, wt);
    }
    return col;
  }
  // Wild flowers grow in drifts, each mostly one kind with a few others mixed in
  vec3 petalColor(float pick) {
    return pick < 0.22 ? vec3(0.95, 0.93, 0.88)    // daisies
         : pick < 0.42 ? vec3(0.98, 0.82, 0.12)    // buttercups
         : pick < 0.58 ? vec3(0.62, 0.38, 0.85)    // clover and thistle purple
         : pick < 0.74 ? vec3(0.88, 0.14, 0.1)     // poppies
         : pick < 0.88 ? vec3(0.35, 0.5, 0.95)     // cornflowers
         : vec3(0.98, 0.55, 0.75);                 // pink campion
  }
  vec3 flowerColor(vec2 p, float dist, vec3 ground) {
    float drift = smoothstep(0.52, 0.7, noise3(vec3(p * 0.04, 21.0)));
    if (drift <= 0.0) return ground;
    vec3 kind = petalColor(ghash(floor(p * 0.05 + 0.5) + 5.0));
    vec3 col = mix(ground, ground * 0.6 + kind * 0.4, drift * 0.3 * smoothstep(15.0, 60.0, dist)); // far off: a tint
    if (dist < 45.0) {
      vec2 c = floor(p * 2.2);
      vec2 f = fract(p * 2.2);
      vec2 at = vec2(ghash(c + 3.0), ghash(c + 8.0)) * 0.7 + 0.15;
      float r = 0.1 + 0.08 * ghash(c + 13.0);
      float here = step(0.6, ghash(c + 21.0)) * drift;
      float bloom = (1.0 - smoothstep(r * 0.6, r, length(f - at))) * here * (1.0 - smoothstep(25.0, 45.0, dist));
      vec3 petal = ghash(c + 34.0) < 0.25 ? petalColor(ghash(c + 55.0)) : kind;
      col = mix(col, petal * (0.85 + 0.3 * ghash(c + 89.0)), bloom);
    }
    return col;
  }
  // Gusts sweeping over grass and crops: moving bands of light and shade, with fine streaks
  float windSheen(vec2 p) {
    float ws = length(uWind);
    vec2 wd = uWind / max(ws, 1e-3);
    float along = dot(p, wd);
    float across = dot(p, vec2(-wd.y, wd.x));
    float gust = noise3(vec3(along * 0.03 - uTime * (0.5 + ws * 1.4), across * 0.02, 5.0));
    float streak = noise3(vec3(along * 0.35 - uTime * (1.5 + ws * 3.0), across * 2.2, 9.0));
    return ((gust - 0.5) * 0.4 + (streak - 0.5) * 0.1) * clamp(0.35 + ws * 1.2, 0.0, 1.0);
  }
`;
const FIELDS_FRAGMENT = /* glsl */ `
  {
    vec2 fp = vCloudWorld.xz;
    float fkind;
    float fhedge;
    float farm = vField.x * (1.0 - vRock);
    float meadow = vField.y * (1.0 - vRock) * (1.0 - farm);
    if (meadow > 0.01) diffuseColor.rgb = mix(diffuseColor.rgb, meadowColor(fp), meadow * 0.9);
    if (farm > 0.01) diffuseColor.rgb = mix(diffuseColor.rgb, fieldColor(fp, fkind, fhedge), farm);
    else { fkind = 2.0; fhedge = 0.0; }
    // Wind over anything grassy (and the standing crops); not over bare earth, sand or rock
    float grassy = clamp((diffuseColor.g - max(diffuseColor.r * 0.88, diffuseColor.b * 1.2)) * 8.0, 0.0, 1.0);
    float crops = farm * (fkind < 2.0 || fkind >= 5.0 ? 1.0 : 0.0);
    float sway = max(grassy, crops) * (1.0 - vRock);
    diffuseColor.rgb *= 1.0 + windSheen(fp) * sway;
    // Dense blades drawn right here, no grass geometry: meadows, grassy fields and standing crops
    float dGrass = length(cameraPosition - vCloudWorld);
    float blades = max(max(meadow, grassy), farm * (fkind >= 4.0 && fkind < 5.0 ? 0.0 : 1.0)) * (1.0 - fhedge * 0.6) * sway;
    if (blades > 0.01 && dGrass < 300.0) {
      // grass height: meadow 0.6 m; wheat 0.9, stubble 0.15, hay 0.3 on the farms
      float gH = farm > 0.5 ? (fkind < 1.0 ? 0.9 : fkind < 2.0 ? 0.15 : fkind >= 5.0 ? 0.3 : 0.5) : 0.6;
      diffuseColor.rgb = mix(diffuseColor.rgb, grassAlbedo(vCloudWorld, diffuseColor.rgb, gH, dGrass), blades);
    }
    // Wild flowers in drifts over the natural green meadows (not the farm fields): single flowers close up, a haze of colour further off
    float wild = meadow * grassy;
    if (wild > 0.01 && dGrass < 400.0) diffuseColor.rgb = mix(diffuseColor.rgb, flowerColor(fp, dGrass, diffuseColor.rgb), wild);
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
    shader.uniforms.uWet = haze.uWet;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunVis = shared.uSunVis;
    shader.uniforms.uCloudCover = shared.uCloudCover;
    shader.uniforms.uCloudOffset = shared.uCloudOffset;
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = haze.uWind;

    const rockValue = mode === "terrain" ? "aRock" : mode === "plain" || mode === "city" ? "0.0" : "1.0";
    shader.uniforms.uCityLights = cityLights;
    shader.vertexShader =
      (mode === "terrain" ? "attribute float aRock;\nattribute vec2 aField;\nvarying vec2 vField;\n" : "") +
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
        vRock = ${rockValue};${mode === "terrain" ? "\n        vField = aField;" : ""}`
      );

    // Boulders keep their own colour with some grain; cliffs and stacks are limestone
    const rockAlbedo =
      mode === "rock" ? "diffuseColor.rgb * (0.8 + 0.4 * noise3(rp * 2.5))" : "limestone(rp)";

    shader.fragmentShader =
      "uniform float uHazeNear;\nuniform float uHazeFar;\nuniform float uHazeMax;\nuniform float uWet;\n" +
      "uniform vec3 uSunDir;\nuniform float uSunVis;\nuniform vec3 uSunColor;\nuniform float uTime;\nuniform vec2 uWind;\n" +
      "varying vec3 vCloudWorld;\nvarying vec3 vWorldN;\nuniform float uCityLights;\n" +
      CLOUD_GLSL +
      SHORE_GLSL +
      ROCK_GLSL +
      (mode === "terrain" ? "varying vec2 vField;\n" + FIELD_GLSL : "") +
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
          }
          ${mode === "terrain" ? FIELDS_FRAGMENT : ""}`
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
        gl_FragColor.rgb *= 1.0 - 0.22 * uWet; // rain-soaked ground and rock look darker
        ${mode === "city" ? CITY_WINDOWS_GLSL : ""}

        // Beach: sand darkened where the waves have just washed over it
        float sandMask = (1.0 - smoothstep(2.5, 4.0, wp.y)) * (1.0 - smoothstep(130.0, 160.0, inlandDist(wp.xz)));
        sandMask *= 1.0 - vRock;
        float sw = swashLevel(wp.xz, uTime);
        float wet = max(1.0 - smoothstep(0.3, 0.7, wp.y), 1.0 - smoothstep(0.0, 0.3, wp.y - sw)) * sandMask;
        gl_FragColor.rgb *= 1.0 - 0.38 * wet;
        ${mode === "terrain" ? PEBBLE_GLSL : ""}

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

// Gullies and buttresses: the cliff line wanders in and out along the coast. Kept broad (≥ ~15 m)
// so the 5 m terrain grid follows it smoothly.
// (Gentle enough that the line never turns sharply: the 5 m terrain grid can't follow a tight bend.)
const cliffGully = (x) => (noise1(x * 0.03 + 11) - 0.5) * 8 + (noise1(x * 0.065 + 3) - 0.5) * 2.5;
// Distance inland from the waterline where the cliff rises (the foot of the face). Never right at the
// waterline, so the boat and the surf never reach into the rock.
const cliffLine = (x) => {
  const raw = cliffSetback(x) + 13 - cliffGully(x);
  return (raw + 3 + Math.sqrt((raw - 3) ** 2 + 16)) / 2; // at least 3, with a rounded corner instead of a kink
};
// The land starts to rise this far behind the cliff line, well behind the rock face in front of it
const CLIFF_RISE0 = 1.5;

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
  const cliffH = 32 + 26 * noise1(x * 0.01 + 3.1);
  // The land steps up within 4 m of the cliff line; the rock face itself is its own mesh (buildCliffWalls)
  const rise = smooth(CLIFF_RISE0, CLIFF_RISE0 + 4, d - cliffLine(x));
  const step = 3.5 + 2 * noise1(x * 0.02 + 1.7);
  const beachBase = beachProfile(Math.min(d, Math.max(sb, 0))) + 0.3; // 0 where there's no beach
  const shelfD = Math.max(d - Math.max(sb, 0), 0);
  let cliffY = beachBase - 0.3 + Math.min(shelfD, 10) * 0.09 + terrace(cliffH * rise, step);
  cliffY += smooth(45, 300, d) * (8 + 50 * fbm2(x * 0.0025, z * 0.0025));
  cliffY += (fbm2(x * 0.08, z * 0.08) - 0.5) * 1.5 * smooth(8, 20, d);

  let y = coveY + (cliffY - coveY) * cliffAmount(x);
  // The little lake on West Point's clifftop: a bowl, its water surface added in clifftop.js
  if (LAKE.level !== null) {
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (ld < LAKE.r + 6) y = Math.min(y, lerp(LAKE.level - 2.2, y, smooth(LAKE.r * 0.7, LAKE.r + 6, ld)));
  }
  if (x > 450 && x < 1150) return carveRiver(x, z, y);
  if (Math.abs(x - CREEK_X) < 90) return carveCreek(x, d, y);
  return y;
}

// A creek comes down to Bridge Bay through a steep little ravine; the coast road crosses it on a bridge
const CREEK_X = 2050;
// The clifftop lake on West Point (see landHeight and clifftop.js)
const LAKE = { x: -640, r: 17, level: null };
LAKE.z = shoreZAt(LAKE.x) - 62;

function carveCreek(x, d, y) {
  const off = Math.abs(x - CREEK_X + (noise1(d * 0.02) - 0.5) * 16);
  const floor = 0.6 + Math.max(0, d - 30) * 0.07;
  return Math.min(y, lerp(floor, y, smooth(5, 70, off)));
}

LAKE.level = landHeight(LAKE.x, LAKE.z) - 0.7; // the water sits a little below the surrounding meadow

// The terrain mesh's grid: 5 m across, 3.5 m deep. Things that sit on the ground (roads) use terrainY to
// rest on the mesh as drawn, which is a little coarser than landHeight itself.
const TERRAIN_GRID = { width: 6000, depth: 1120, nx: 1200, nz: 320, centerZ: SHORE_Z - 340 };
function terrainY(x, z) {
  const G = TERRAIN_GRID;
  const cw = G.width / G.nx;
  const cd = G.depth / G.nz;
  const fx = (x + G.width / 2) / cw;
  const fz = (z - G.centerZ + G.depth / 2) / cd;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const u = fx - ix;
  const v = fz - iz;
  const gx = (i) => -G.width / 2 + i * cw;
  const gz = (j) => G.centerZ - G.depth / 2 + j * cd;
  const H = G.heights;
  const at = (i, j) =>
    H && i >= 0 && j >= 0 && i <= G.nx && j <= G.nz ? H[j * (G.nx + 1) + i] : landHeight(gx(i), gz(j));
  const a = at(ix, iz);
  const bb = at(ix, iz + 1);
  const c = at(ix + 1, iz + 1);
  const d = at(ix + 1, iz);
  // The two triangles of each grid cell, as three.js's PlaneGeometry splits them (a-b-d and b-c-d)
  return u + v <= 1 ? a + (d - a) * u + (bb - a) * v : c + (bb - c) * (1 - u) + (d - c) * (1 - v);
}

function buildShoreline() {
  const { width, depth, centerZ } = TERRAIN_GRID;
  const geo = new THREE.PlaneGeometry(width, depth, TERRAIN_GRID.nx, TERRAIN_GRID.nz);
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
  geo.setAttribute("aField", new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2)); // farmland, meadow: filled in by grass.js
  TERRAIN_GRID.heights = Float32Array.from({ length: pos.count }, (_, i) => pos.getY(i));
  TERRAIN_GRID.colors = colors;
  TERRAIN_GRID.rock = rockMask;
  TERRAIN_GRID.geo = geo;

  const land = new THREE.Mesh(
    geo,
    applyHaze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { terrain: true })
  );
  land.position.z = centerZ;
  return land;
}
scene.add(buildShoreline());

// ===== Cliff walls: real rock faces in front of the terrain's steep step =====
// The terrain is a heightfield, so it can't make vertical faces, overhangs or caves. Along every cliff
// a separate wall rises from the rock shelf (or beach) to the clifftop: leaning back a little, with
// layered ledges that jut out, vertical joints and buttresses, a notch cut by the waves at the
// waterline, an overhanging lip, and its top tucked under the edge of the clifftop grass.
const GROTTO_SPOTS = [1330, 1398, 1468]; // the chalk grottoes at East Head (landmarks.js) need openings
const CLIFF_COLS = []; // every column of wall, for the rocks at its foot and the turf on its lip
function buildCliffWalls() {
  const STEP = 2;
  const ROWS = 34;
  // The wall's base line stands this far in front of the cliff line: farther where a beach or shelf
  // gives room, so the terrain's own steep step stays hidden behind it
  const backAt = (line) => clamp(line - 1, 3.5, 7.5);
  const strips = [];
  let strip = null;
  for (let x = -2900; x <= 2900; x += STEP) {
    const cm = cliffAmount(x);
    const gap =
      cm < 0.4 ||
      (x > 450 && x < 1150) ||
      Math.abs(x - CREEK_X) < 70;
    let col = null;
    if (!gap) {
      const line = cliffLine(x);
      const zAt = (xx, d) => shoreZAt(xx) - d;
      const back = backAt(line);
      const zb = zAt(x, line - back);
      const lineA = cliffLine(x + 1);
      const lineB = cliffLine(x - 1);
      const dzdx = (zAt(x + 1, lineA - backAt(lineA)) - zAt(x - 1, lineB - backAt(lineB))) / 2;
      const nl = Math.hypot(dzdx, 1);
      const nx = -dzdx / nl; // outward, toward the sea
      const nz = 1 / nl;
      const yBot = landHeight(x, zAt(x, line - back - 0.5)) - 1.4;
      const yTop = landHeight(x, zAt(x, line + CLIFF_RISE0 + 4.5));
      const H = yTop - yBot;
      if (H > 5) col = { x, zb, nx, nz, yBot, yTop, H, line, cm, back };
    }
    if (!col) {
      strip = null;
      continue;
    }
    if (!strip) strips.push((strip = []));
    strip.push(col);
    CLIFF_COLS.push(col);
  }
  // Where a stretch of wall ends, it sinks back into the hillside instead of stopping as a loose slab
  for (const st of strips) {
    const x0 = st[0].x;
    const x1 = st[st.length - 1].x;
    for (const c of st) {
      const dEnd = Math.min(x0 > -2898 ? c.x - x0 : 1e9, x1 < 2898 ? x1 - c.x : 1e9);
      const k = 10 * (1 - smooth(0, 26, dEnd));
      c.x -= c.nx * k;
      c.zb -= c.nz * k;
    }
  }

  // How far the face stands out (+) or back (−) from its base line at height y
  const chalkAt = (x) => Math.exp(-(((x - 1400) / 230) ** 2));
  function faceOffset(c, y, v) {
    const x = c.x;
    const chalk = chalkAt(x);
    let o = 0;
    o -= v * 1.0; // leaning back slightly
    // Layers: each bed juts out at its base and weathers back above (overhanging ledges)
    const bed = 2.6 + 2.2 * noise1(x * 0.004 + 9);
    const ty = (y + 3 * noise1(x * 0.012 + 2)) / bed;
    o += (0.55 * (1 - (ty - Math.floor(ty))) - 0.25) * (1 - 0.8 * chalk);
    // Vertical joints: narrow clefts every 6–14 m, deeper toward the foot
    const J = 9 + 5 * noise1(x * 0.01 + 4);
    const jx = x / J + noise1(x * 0.05 + 1) * 0.8;
    const jd = Math.abs(jx - Math.floor(jx) - 0.5) * J; // metres from the joint
    o -= (1.2 - 0.5 * v) * (1 - smooth(0, 1.3, jd)) * (1 - 0.6 * chalk);
    // Buttresses and bays, some big ones standing well out from the face
    o += (noise1(x * 0.045 + 7) - 0.5) * 2.4 * (1 - 0.5 * chalk);
    o += Math.max(0, noise1(x * 0.018 + 21) - 0.55) * 4 * (1 - 0.3 * v) * (1 - 0.7 * chalk);
    // Rough rock
    o += (noise2(x * 0.35, y * 0.35) - 0.5) * 0.7 * (1 - 0.5 * chalk);
    o += (noise2(x * 0.11 + 3, y * 0.09) - 0.5) * 1.2;
    // The notch the waves cut at the waterline, where the sea reaches the foot
    if (c.yBot < 1.2) o -= 1.1 * Math.exp(-(((y - 0.9) / 1.1) ** 2));
    // The overhanging lip under the clifftop turf
    o += 0.7 * smooth(0.82, 0.97, v);
    return clamp(o, -2.7, Math.max(1.2, Math.min(2.2, c.line - c.back - 1)));
  }

  const mat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide }), { stack: true });
  const group = new THREE.Group();
  for (const cols of strips) {
    if (cols.length < 2) continue;
    // Split long strips into chunks of ~300 m so each can be culled
    for (let start = 0; start < cols.length - 1; start += 150) {
      const part = cols.slice(start, Math.min(cols.length, start + 151));
      const pos = [];
      const idx = [];
      const R = ROWS + 1; // the extra top row tucks under the clifftop
      for (const c of part) {
        for (let i = 0; i < R; i++) {
          let y;
          let o;
          if (i === ROWS) {
            y = c.yTop - 0.6;
            o = -(c.back + CLIFF_RISE0 + 4.5);
          } else {
            const v = i / (ROWS - 1);
            y = i === ROWS - 1 ? c.yTop - 0.25 : c.yBot + c.H * v;
            o = faceOffset(c, y, v);
          }
          pos.push(c.x + c.nx * o, y, c.zb + c.nz * o);
          if (i === ROWS - 1) c.lip = { x: c.x + c.nx * o, y, z: c.zb + c.nz * o };
        }
      }
      // Openings for the grottoes
      const inGrotto = (x, y) =>
        GROTTO_SPOTS.some((gx, k) => {
          const r = 4.2 + k * 0.6;
          return ((x - gx) / r) ** 2 + ((y + 0.6) / r) ** 2 < 1.05;
        });
      for (let a = 0; a < part.length - 1; a++) {
        for (let i = 0; i < R - 1; i++) {
          const p0 = a * R + i;
          const p1 = (a + 1) * R + i;
          const cx = (pos[p0 * 3] + pos[p1 * 3]) / 2;
          const cy = (pos[p0 * 3 + 1] + pos[p0 * 3 + 4]) / 2;
          if (inGrotto(cx, cy)) continue;
          idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1); // facing the sea
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, mat));
    }
  }
  return group;
}

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
    rr *= 1 + 0.3 * smooth(2, -4, y); // flared base under water
    rr *= 1 - 0.08 * Math.sin(Math.PI * clamp(y / h, 0, 1)); // slight waist
    rr *= 1 - 0.2 * Math.exp(-(((y - 0.7) / 1.3) ** 2)); // wave-cut notch at the waterline
    // Big lumps and buttresses that run up the column (slow change with height, so no rings)
    rr *= 0.78 + 0.44 * cloudNoise3(ca * 2.0 + seed, y * 0.035, sa * 2.0);
    rr *= 0.94 + 0.12 * cloudNoise3(ca * 5 + seed, y * 0.12, sa * 5);
    // Vertical fissures, and only faint, irregular bedding ledges
    rr *= 1 - 0.14 * Math.pow(Math.max(0, Math.sin(a * 3 + seed + y * 0.02)), 12);
    const bed = 3.2 + 0.9 * Math.sin(seed * 1.7);
    rr *= 1 + 0.035 * (1 - (y / bed - Math.floor(y / bed)));
    rr *= 1 - 0.15 * smooth(0.6, 1, t); // narrowing toward the crown
    rr *= 0.8 + 0.4 * cloudNoise3(seed * 3.1, y * 0.05, 1.7); // the outline swells and pinches up its height

    // Rounded, jagged crown
    if (t > 0.999) y += 1.5 * (1 - rl) * r * 0.3;
    y += (cloudNoise3(ca * 2 + seed, 3.3, sa * 2) - 0.5) * 4 * smooth(0.85, 1, t);

    // A slight lean
    const lean = Math.max(y, 0) * 0.025;
    p.setXYZ(i, ca * rr * rl + lean * Math.cos(seed * 2.3), y, sa * rr * rl + lean * Math.sin(seed * 2.3));
  }
  geo.computeVertexNormals();
  return geo;
}

const stackMat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), { stack: true });
scene.add(buildCliffWalls()); // (above: the walls share the stacks' rock material)
scene.add(buildTalus());
scene.add(buildTurfLip());
for (const s of seaStacks) {
  if (s.group === "arch") continue; // the arch is drawn as one piece in landmarks.js
  const mesh = new THREE.Mesh(buildSeaStack(s.r, s.h, s.seed), stackMat);
  mesh.position.set(s.x, 0, s.z);
  mesh.rotation.y = s.seed;
  scene.add(mesh);
}

// ===== Talus: scree, boulders and big fallen blocks at the foot of the cliff walls =====
function rockColorAt(x, col) {
  // The same rock as the cliff above: white chalk, golden sandstone, red rock or pale limestone
  const chalk = Math.exp(-(((x - 1400) / 230) ** 2));
  if (chalk > 0.5) return col.setHSL(rand(0.1, 0.13), rand(0.04, 0.1), rand(0.78, 0.9));
  if (x < -1600) return col.setHSL(rand(0.08, 0.1), rand(0.35, 0.5), rand(0.5, 0.64));
  if (x > 1850) return col.setHSL(rand(0.04, 0.06), rand(0.35, 0.5), rand(0.42, 0.55));
  return col.setHSL(rand(0.08, 0.11), rand(0.12, 0.25), rand(0.55, 0.72));
}
function buildTalus() {
  // Angular blocks: a coarse, lumpy icosahedron
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.75 + 0.45 * cloudNoise3(x * 0.9 + 1, y * 0.9 + 5, z * 0.9);
    p.setXYZ(i, x * k, y * k * 0.75, z * k);
  }
  geo.computeVertexNormals();
  const mat = applyHaze(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), { rock: true });
  const items = [];
  for (let i = 0; i < CLIFF_COLS.length; i += 6 + Math.floor(rand(0, 9))) {
    const c = CLIFF_COLS[i];
    const tx = c.nz;
    const tz = -c.nx;
    const room = Math.max(1, c.line - c.back); // metres of shelf or beach in front of the wall
    const n = 5 + Math.floor(rand(0, 8));
    for (let k = 0; k < n; k++) {
      // Scree piles up against the foot; the odd big block has rolled farther out
      const big = k === 0 && Math.random() < 0.6;
      const size = big ? rand(1.4, 3.2) : rand(0.25, 1.1) * (k < 3 ? 1.3 : 1);
      const out = big ? rand(1, Math.min(room + 4, 10)) : Math.pow(Math.random(), 2) * Math.min(room, 6) + 0.6;
      const along = rand(-7, 7);
      const x = c.x + c.nx * out + tx * along;
      const z = c.zb + c.nz * out + tz * along;
      const y = Math.max(landHeight(x, z), -3) + size * (big ? 0.15 : 0.3);
      items.push({ x, y, z, size, big });
    }
  }
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const v = new THREE.Vector3();
  const col = new THREE.Color();
  items.forEach((it, i) => {
    e.set(rand(-0.4, 0.4), rand(0, Math.PI * 2), rand(-0.4, 0.4));
    q.setFromEuler(e);
    sc.set(it.size * rand(0.8, 1.3), it.size * rand(0.6, 1.0), it.size * rand(0.8, 1.3));
    m.compose(v.set(it.x, it.y, it.z), q, sc);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, rockColorAt(it.x, col));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

// ===== Turf lip: the clifftop grass running right to the edge and hanging over it =====
function buildTurfLip() {
  const pos = [];
  const colors = [];
  const idx = [];
  const turf = new THREE.Color(0x6f8a3e);
  const dry = new THREE.Color(0x9a9a52);
  const soil = new THREE.Color(0x4a3a28);
  const c3 = new THREE.Color();
  let prev = null;
  for (const c of CLIFF_COLS) {
    if (!c.lip) continue;
    const base = pos.length / 3;
    const zA = shoreZAt(c.x) - (c.line + CLIFF_RISE0 + 7);
    const yA = landHeight(c.x, zA) + 0.07;
    const bx = c.lip.x + c.nx * 0.1;
    const bz = c.lip.z + c.nz * 0.1;
    const yB = c.yTop + 0.05;
    pos.push(c.x, yA, zA, bx, yB, bz, bx - c.nx * 0.15, c.yTop - 0.5 - 0.3 * noise1(c.x * 0.3), bz - c.nz * 0.15);
    const g = noise1(c.x * 0.02 + 5);
    c3.copy(turf).lerp(dry, g * 0.6).multiplyScalar(0.85 + 0.3 * noise1(c.x * 0.2));
    colors.push(c3.r, c3.g, c3.b, c3.r * 1.05, c3.g * 1.05, c3.b * 0.95, soil.r, soil.g, soil.b);
    if (prev && Math.abs(c.x - prev.x) < 2.5) {
      const a = prev.base;
      for (let r = 0; r < 2; r++) idx.push(a + r, a + r + 1, base + r, base + r, a + r + 1, base + r + 1); // facing up
    }
    prev = { x: c.x, base };
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, applyHaze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
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
