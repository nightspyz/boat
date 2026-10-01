// Grass and fields. Works out, for every point of the terrain grid, where meadow grass grows (not on
// roads, towns, beaches, rock or cliff edges) and which land is farmland. There is no grass geometry:
// the terrain shader draws the blades, the wind and the flowers from these masks (FIELD_GLSL in coast.js).
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

(() => {
  const G = TERRAIN_GRID;
  const W = G.nx + 1;
  const H = G.nz + 1;
  const cw = G.width / G.nx;
  const cd = G.depth / G.nz;
  const gx = (i) => -G.width / 2 + i * cw;
  const gz = (j) => G.centerZ - G.depth / 2 + j * cd;

  // Places where nothing grows: roads, towns, villages, the lake, the party, the bike track, camps…
  const blocked = new Uint8Array(W * H);
  const block = (x, z, r) => {
    const i0 = Math.max(0, Math.floor((x - r - gx(0)) / cw));
    const i1 = Math.min(W - 1, Math.ceil((x + r - gx(0)) / cw));
    const j0 = Math.max(0, Math.floor((z - r - gz(0)) / cd));
    const j1 = Math.min(H - 1, Math.ceil((z + r - gz(0)) / cd));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(gx(i) - x, gz(j) - z) < r) blocked[j * W + i] = 1;
  };
  for (const road of [WEST_ROAD, ...BRANCHES]) for (const p of road) block(p.x, p.z, ROAD_W / 2 + 1.5);
  for (const p of roadPts) block(p.x, p.z, 6);
  for (const v of VILLAGES) block(v.x, v.z, 70);
  block(LAKE.x, LAKE.z, LAKE.r + 4);
  block(PARTY.x, PARTY.z, 12);
  for (const c of camps) block(c.x, c.z, 8);
  block(lighthouse.group.position.x, lighthouse.group.position.z, 16);
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    block(TRACK.x + Math.cos(a) * TRACK.rx, TRACK.z + Math.sin(a) * TRACK.rz, 3);
  }

  const grass = new Float32Array(W * H);
  const farm = G.geo.attributes.aField.array;
  const normals = G.geo.attributes.normal;
  for (let i = 0; i < W; i++) {
    const x = gx(i);
    const shoreZ = shoreZAt(x);
    const cm = cliffAmount(x);
    const edge = cliffLine(x) + CLIFF_RISE0 + 6; // keep back from the cliff edge
    const inTown = x > -1600 && x < -1160;
    const nearHarbor = Math.abs(x - COVE_X) < 70;
    const riverZone = x > 450 && x < 1150;
    for (let j = 0; j < H; j++) {
      const k = j * W + i;
      const z = gz(j);
      const d = shoreZ - z;
      const y = G.heights[k];
      if (d < 0 || blocked[k] || (inTown && d < 310) || (nearHarbor && d < 70)) continue;
      const r = G.colors[k * 3];
      const gg = G.colors[k * 3 + 1];
      const b = G.colors[k * 3 + 2];
      const greenish = gg > r * 0.95 && gg > b * 1.15;
      const flatEnough = normals.getY(k) > 0.8;
      const pastEdge = cm > 0.5 ? d > edge : y > 2;
      const river = riverZone && riverDist(x, z) < 25;
      if (greenish && flatEnough && pastEdge && !river && G.rock[k] < 0.15 && y > 1.2) grass[k] = farm[k * 2 + 1] = 1;
      // Farmland: rolling land well back from the edge, not too steep
      const farmBack = cm > 0.5 ? d > edge + 28 : d > 170;
      if (farmBack && normals.getY(k) > 0.9 && y > 6 && !river) farm[k * 2] = 1;
    }
  }
  // Soften the masks so fields and meadows fade in over a few metres instead of in grid-shaped steps
  const tmp = new Float32Array(W * H);
  for (let ch = 0; ch < 2; ch++) {
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          let sum = 0;
          let n = 0;
          for (let o = -2; o <= 2; o++) {
            const ii = pass ? i : i + o;
            const jj = pass ? j + o : j;
            if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
            sum += farm[(jj * W + ii) * 2 + ch];
            n++;
          }
          tmp[j * W + i] = sum / n;
        }
      for (let k = 0; k < W * H; k++) farm[k * 2 + ch] = tmp[k];
    }
  }
  G.geo.attributes.aField.needsUpdate = true;

})();
