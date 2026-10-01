// Sky, clouds and time-of-day uniforms, sky dome.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Sky, clouds and time-of-day uniforms (shared by sky and water) =====
const shared = {
  uTop: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color() },
  uSunset: { value: 0 },
  uSunVis: { value: 1 },
  uStars: { value: 0 },
  uTime: { value: 0 },
  uCloudCover: { value: 0.2 },
  uCloudDark: { value: 0 },
  uCloudOffset: { value: new THREE.Vector2() },
  uLightLevel: { value: 1 },
  uAurora: { value: 0 },
};

const SKY_GLSL = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunset;
  uniform float uSunVis;
  uniform float uStars;
  uniform float uTime;

  vec3 skyColor(vec3 d) {
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.45));
    vec2 dh = normalize(d.xz + vec2(1e-4));
    vec2 sh = normalize(uSunDir.xz + vec2(1e-4));
    float glow = pow(max(dot(dh, sh), 0.0), 6.0) * pow(1.0 - h, 5.0);
    col += uSunColor * glow * uSunset * 0.7;
    return col;
  }
`;

const NOISE_GLSL = /* glsl */ `
  // A hash without sin(): sin() of large world coordinates loses precision on GPUs, which turns the
  // "random" values into a regular checkerboard
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
`;

// Volumetric cloud layer (world space), shared by the sky and by shadow lookups
const CLOUD_BOTTOM = 500;
const CLOUD_TOP = 900;
const CLOUD_SHADOW_HEIGHT = 650;

const CLOUD_GLSL = /* glsl */ `
  uniform float uCloudCover;
  uniform vec2 uCloudOffset;
  const float CLOUD_BOTTOM = ${CLOUD_BOTTOM.toFixed(1)};
  const float CLOUD_TOP = ${CLOUD_TOP.toFixed(1)};

  float hash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), u.x);
    float b = mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), u.x);
    float c = mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), u.x);
    float d = mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), u.x);
    return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
  }
  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.02 + vec3(17.1, 9.2, 4.7);
      a *= 0.5;
    }
    return v;
  }
  float cloudDensity(vec3 p) {
    float h = (p.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM);
    if (h < 0.0 || h > 1.0) return 0.0;
    vec3 q = vec3(p.x - uCloudOffset.x, p.y, p.z - uCloudOffset.y) * 0.0016;
    float thr = mix(0.62, 0.3, uCloudCover) + h * 0.18; // flat bottoms, billowy tops
    return max((fbm3(q) - thr) * 5.0 * smoothstep(0.0, 0.1, h), 0.0);
  }
  // 1 = full sun, lower = under a cloud
  float cloudShadow(vec3 wp, vec3 sunDir) {
    float s = max(sunDir.y, 0.08);
    vec3 p = wp + sunDir / s * (${CLOUD_SHADOW_HEIGHT.toFixed(1)} - wp.y);
    return exp(-cloudDensity(vec3(p.x, ${CLOUD_SHADOW_HEIGHT.toFixed(1)}, p.z)) * 1.5);
  }
`;

// JavaScript copy of cloudDensity, used to shade the boat and wildlife
const fract = (x) => x - Math.floor(x);
function cloudHash3(x, y, z) {
  x = fract(x * 0.1031);
  y = fract(y * 0.1031);
  z = fract(z * 0.1031);
  const d = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32);
  x += d;
  y += d;
  z += d;
  return fract((x + y) * z);
}
function cloudNoise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const a = lerp(cloudHash3(ix, iy, iz), cloudHash3(ix + 1, iy, iz), ux);
  const b = lerp(cloudHash3(ix, iy + 1, iz), cloudHash3(ix + 1, iy + 1, iz), ux);
  const c = lerp(cloudHash3(ix, iy, iz + 1), cloudHash3(ix + 1, iy, iz + 1), ux);
  const d = lerp(cloudHash3(ix, iy + 1, iz + 1), cloudHash3(ix + 1, iy + 1, iz + 1), ux);
  return lerp(lerp(a, b, uy), lerp(c, d, uy), uz);
}
function cloudDensityJS(x, y, z, cover, offset) {
  const h = (y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM);
  if (h < 0 || h > 1) return 0;
  let qx = (x - offset.x) * 0.0016;
  let qy = y * 0.0016;
  let qz = (z - offset.y) * 0.0016;
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * cloudNoise3(qx, qy, qz);
    qx = qx * 2.02 + 17.1;
    qy = qy * 2.02 + 9.2;
    qz = qz * 2.02 + 4.7;
    a *= 0.5;
  }
  const thr = 0.62 + (0.3 - 0.62) * cover + h * 0.18;
  return Math.max((v - thr) * 5 * smooth(0, 0.1, h), 0);
}
function cloudShadowJS(x, y, z, sunDir, cover, offset) {
  const s = Math.max(sunDir.y, 0.08);
  const px = x + (sunDir.x / s) * (CLOUD_SHADOW_HEIGHT - y);
  const pz = z + (sunDir.z / s) * (CLOUD_SHADOW_HEIGHT - y);
  return Math.exp(-cloudDensityJS(px, CLOUD_SHADOW_HEIGHT, pz, cover, offset) * 1.5);
}

// ===== Sky dome =====
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 48, 24),
  new THREE.ShaderMaterial({
    uniforms: shared,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      ${NOISE_GLSL}
      ${CLOUD_GLSL}
      uniform float uCloudDark;
      uniform float uLightLevel;
      uniform float uAurora;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(vec3(d.x, max(d.y, 0.0), d.z));

        // Twinkling stars
        vec3 cell = floor(d * 400.0);
        float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + n * 60.0);
        col += vec3(step(0.9985, n) * twinkle * uStars * smoothstep(0.0, 0.15, d.y));

        // Aurora curtains in the northern sky (-Z)
        if (uAurora > 0.001 && d.y > 0.0) {
          float az = atan(d.x, -d.z);
          float north = 1.0 - smoothstep(0.4, 1.7, abs(az));
          float edge = 0.06 + 0.05 * sin(az * 3.0 + uTime * 0.07);
          float h = d.y;
          float vert = smoothstep(edge, edge + 0.03, h) * (1.0 - smoothstep(edge + 0.04, edge + 0.4, h));
          float curtain = fbm(vec2(az * 4.0 + sin(az * 7.0 + uTime * 0.15) * 0.4, uTime * 0.05));
          curtain = smoothstep(0.35, 0.75, curtain);
          float rays = 0.55 + 0.45 * vnoise(vec2(az * 90.0, uTime * 0.4));
          vec3 ac = mix(vec3(0.15, 1.0, 0.55), vec3(0.65, 0.25, 0.95), smoothstep(edge + 0.08, edge + 0.35, h));
          col += ac * curtain * rays * vert * north * uAurora * 0.9;
        }

        // Moon, opposite the sun
        float md = dot(d, -uSunDir);
        col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99955, 0.9997, md) * uStars;
        col += vec3(0.5, 0.6, 0.8) * pow(max(md, 0.0), 60.0) * 0.15 * uStars;

        // Sun disc and halo
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 1500.0) * 6.0 + pow(sd, 12.0) * 0.25) * uSunVis;

        // Volumetric clouds: raymarch through the cloud layer, lighting each sample toward the sun
        if (d.y > 0.01) {
          vec3 ro = cameraPosition;
          float t0 = (CLOUD_BOTTOM - ro.y) / d.y;
          float t1 = (CLOUD_TOP - ro.y) / d.y;
          float fade = (1.0 - smoothstep(5000.0, 12000.0, t0)) * smoothstep(0.01, 0.06, d.y);
          if (fade > 0.0) {
            const int STEPS = 24;
            float stepLen = (t1 - t0) / float(STEPS);
            float t = t0 + stepLen * hash(gl_FragCoord.xy);
            float trans = 1.0;
            vec3 acc = vec3(0.0);
            vec3 sunLit = mix(vec3(1.0), uSunColor, 0.6 * uSunset) * uLightLevel * (1.0 - 0.7 * uCloudDark);
            vec3 ambient = (mix(uHorizon, uTop, 0.5) * 0.5 + vec3(0.04) * uLightLevel) * (1.0 - 0.5 * uCloudDark);
            float phase = 1.0 + 1.5 * pow(sd, 8.0) * uSunVis; // bright silver edges toward the sun
            for (int i = 0; i < STEPS; i++) {
              vec3 p = ro + d * t;
              float dens = cloudDensity(p);
              if (dens > 0.001) {
                float ld = cloudDensity(p + uSunDir * 60.0) + cloudDensity(p + uSunDir * 160.0);
                vec3 lit = sunLit * exp(-ld * 0.9) * phase + ambient;
                float a = 1.0 - exp(-dens * stepLen * 0.006);
                acc += trans * a * lit;
                trans *= 1.0 - a;
                if (trans < 0.02) break;
              }
              t += stepLen;
            }
            float alpha = (1.0 - trans) * fade;
            col = mix(col, acc / max(1.0 - trans, 1e-3), alpha);
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
);
sky.renderOrder = -1;
scene.add(sky);
