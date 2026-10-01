// The world file: WHERE things are and HOW they're set up — positions, sizes and lists.
// The js/ files hold how things are built and how they behave; they read their placements from here.
// Edit numbers freely (by hand now, with the editor later). The game must be reloaded to see changes.
//
// Coordinates: x runs along the coast (west −, east +), z runs out to sea (inland −, out to sea +).
// The waterline sits near z = coast.shoreZ, pushed out by headlands and in by bays.
// Many places are given by x plus a rule instead of a fixed z: "inland" = metres inland from the
// waterline at that x, "depth" = the first spot out from the shore where the sea is that many metres deep.
//
// Kept as a script (not .json) so the game still works when opened straight from disk.

const WORLD = {
  // ===== The coastline =====
  coast: {
    shoreZ: -1100, // where the beach begins
    lighthouseX: 160, // the lighthouse headland
    coveX: -260, // the sandy cove with the harbor, where every expedition starts
    // Headlands jut out to sea (+ metres), bays cut in (−)
    bends: [
      { name: "Lighthouse headland", x: 160, out: 150, width: 170 },
      { name: "West Point", x: -700, out: 110, width: 115 }, // with a sea arch off its tip
      { name: "Hidden Cove", x: -1000, out: -75, width: 95 }, // a crescent bay with a waterfall
      { name: "Seven Sisters", x: -1850, out: 120, width: 150 },
      { name: "West bay", x: -2350, out: -60, width: 160 },
      { name: "East Head", x: 1400, out: 125, width: 125 }, // white chalk cliffs with grottoes
      { name: "Bridge Bay", x: 2050, out: -80, width: 120 }, // a creek comes down under the coast road
      { name: "East headland", x: 2420, out: 95, width: 130 },
    ],
    // Beaches at the foot of the cliffs (+ metres of sand before they rise), or cliffs straight into the sea (−)
    cliffSetbacks: [
      { name: "Hidden Cove beach", x: -1000, metres: 34, width: 85 },
      { name: "Seven Sisters sand", x: -1850, metres: 22, width: 90 },
      { name: "Bridge Bay beach", x: 2050, metres: 28, width: 90 },
      { name: "East Head walls", x: 1400, metres: -11, width: 150 },
    ],
    // Sea stacks: rock pillars standing in the sea ('out' metres from the waterline, radius r, height h)
    seaStacks: {
      lighthouse: [
        { x: 65, out: 48, r: 5.5, h: 34 },
        { x: 120, out: 72, r: 6.5, h: 42 },
        { x: 185, out: 58, r: 5, h: 30 },
        { x: 248, out: 86, r: 7, h: 38 },
        { x: 292, out: 40, r: 3.5, h: 18 },
      ],
      sisters: [
        { x: -1965, out: 70, r: 6, h: 34 },
        { x: -1915, out: 98, r: 7, h: 42 },
        { x: -1872, out: 62, r: 5, h: 28 },
        { x: -1830, out: 112, r: 8, h: 46 },
        { x: -1782, out: 78, r: 5.5, h: 33 },
        { x: -1742, out: 52, r: 4, h: 21 },
        { x: -1700, out: 92, r: 6, h: 37 },
      ],
    },
    // Stretches that are always cliffs
    cliffCoasts: [
      { x: -700, width: 220 },
      { x: -1000, width: 200 },
      { x: -1850, width: 260 },
      { x: 1400, width: 230 },
      { x: 2050, width: 200 },
      { x: 2420, width: 200 },
    ],
  },

  // ===== Little islands offshore =====
  islands: [
    { id: "palm", x: 380, z: -700, R: 40, h: 7, seed: 1.3 },
    { id: "seal", x: -800, z: -760, R: 22, h: 6, seed: 4.1 },
    { id: "goat", x: 1150, z: -620, R: 75, h: 22, seed: 2.7 },
  ],

  // ===== Landmarks on the coast =====
  landmarks: {
    seaArch: { x: -700, out: 48, R: 12, H0: 9, legR: 4.5 }, // out = metres out from the waterline
    hiddenCove: { x: -1000, inland: 15 }, // the waterfall comes down the cliff just behind
    grottoes: [1330, 1398, 1468], // x of each chalk grotto at East Head
    creekX: 2050, // the creek down to Bridge Bay, crossed by the coast road's bridge
    coastRoad: { x0: 1640, x1: 2620, step: 4 }, // the eastern coast road with the bridge
    lake: { x: -640, inland: 62, r: 17 }, // the clifftop lake on West Point
    swamp: { x: 800, inland: 95, r: 160 }, // the delta where the river meets the sea
    lighthouseInland: 55, // the lighthouse stands this far back from the tip of its headland
    // The river: main channel and two mouths, points as [x, metres inland]
    river: [
      { w: 14, pts: [[830, 900], [805, 640], [822, 420], [800, 190]] },
      { w: 10, pts: [[800, 190], [762, 110], [722, 40], [700, -20]] },
      { w: 10, pts: [[800, 190], [848, 115], [888, 45], [912, -20]] },
    ],
  },

  // ===== Hidden and underwater places =====
  places: {
    wreck: { x: -1500, depth: 9 }, // an old wreck to the west
    strangeLight: { x: 1550, depth: 7 }, // the glow under the eastern cliffs
    deepWreck: { x: -2100, depth: 18 }, // too deep to see: only sonar finds it
    sunkenTemple: { x: -640, depth: 6 },
    colossus: { x: -575, depth: 7 },
    sailboatWreck: { x: 490, depth: 5 },
    freighter: { x: -1250, z: -640 }, // rests on the sea floor at this exact spot
  },

  // ===== Up on the land: roads, villages, the pier =====
  inland: {
    roadWidth: 7.4, // two lanes
    // The west coast road runs along the clifftop from x0 to x1: 'inland' metres from the waterline
    // where there are no cliffs, and 'edgeGap' metres back from the cliff edge where there are
    westRoad: { x0: -2560, x1: -300, inland: 95, edgeGap: 11 },
    // Hill villages, each reached by a winding lane
    villages: [
      { name: "Far west village", x: -2150, inland: 560 },
      { name: "Village behind the town", x: -1080, inland: 640 },
      { name: "West Point village", x: -420, inland: 560 },
      { name: "East village", x: 1650, inland: 600 },
    ],
    // The lanes up to the villages, in the same order. Each starts either on the west coast road
    // (roadX = where along it) or at a spot given by x and inland
    lanes: [
      { roadX: -2100 },
      { x: -1250, inland: 300 }, // from the back of the town
      { roadX: -380 },
      { x: 1700, inland: 82 }, // from the eastern coast road
    ],
    laneWiggle: 22, // how far the lanes wind from side to side, metres
    powerPoles: { first: 5, every: 22, setback: 2.5 }, // along the west road: every 'every' road points (~2 m each)
    streetLamps: { first: 9, every: 18, villageStretch: 80 }, // and the last stretch of each lane into its village
    // Radio masts: one on the highest ground found in each stretch, between inland0 and inland1
    radioMasts: [
      { x0: -2500, x1: -1700 },
      { x0: -1000, x1: -200 },
      { x0: 700, x1: 1500 },
    ],
    radioMastInland: [420, 860],
    funPier: { x: -1380, len: 190, w: 12, deckY: 7 }, // the pleasure pier below the clifftop town
    town: { x0: -1580, x1: -1180, center: { x: -1380, inland: 120 } }, // the clifftop town: its stretch of coast, and its church
  },

  // ===== The clifftop on West Point =====
  clifftop: {
    party: { x: -545, inland: 48 }, // the LED party area
    bikeTrack: { x: -800, inland: 64, rx: 24, rz: 13 }, // the dirt-bike oval
  },

  // ===== On the beaches =====
  beach: {
    camps: [
      { x: -430, inland: 34 },
      { x: 620, inland: 34 },
      { x: -2420, inland: 34 },
    ],
    horseRide: { x0: -500, x1: -60, inland: 13 }, // riders go back and forth along this stretch
    sunbathers: 16, // on the harbor cove beach
    swimmers: 10,
    beachWreck: { x: 960, inland: 7 }, // the rusting wreck on the sand east of the river delta
  },

  // ===== Animals, people and things on the move =====
  // Colours here are colour codes (0xRRGGBB). Wild animals that turn up near the boat (whales, orcas,
  // dolphins, sharks, mantas, jellyfish, pelicans) appear around you wherever you are, so only their
  // numbers are here.
  life: {
    islands: { palms: 9, palmBushes: 10, turtles: 2, seals: 6, pines: 14, goatBushes: 16, goats: 5 }, // how many on the islands
    lake: { ducks: 5, lilyPads: 14 },
    dogs: { colors: [0xc8a070, 0x2a2420] }, // one dog per colour, walking round the lake
    cats: [
      { color: 0xe08a3c, home: [-14, 20] }, // home: metres from the middle of the lake
      { color: 0x55504a, home: [18, -16] },
    ],
    meadowGoats: 3, // grazing by the bike track
    cyclists: { colors: [0xe63946, 0x118ab2] }, // one rider per colour, on the west coast road
    dolphins: 5,
    gulls: { x: 0, z: -850, count: 12 }, // the gull flock's home over the bay
    trawler: { route: { kind: "loop", cx: -150, cz: -480, rx: 420, rz: 110 }, speed: 2.2 }, // fishing boat, trailed by gulls
    // Hot-air balloon (mornings): sways along the coast around x, 'inland' from the shore, 'alt' metres up
    balloon: { x: -700, swingX: 520, inland: 120, swingZ: 70, alt: 170 },
    // The stray iceberg drifts east 'speed' m/s, 'out' metres off the coast, starting at x
    iceberg: { x: -1300, out: 1080, r: 17, speed: 0.35 },
  },

  // ===== Boats and planes =====
  // Routes are loops (an ellipse: centre cx, cz and radii rx, rz) or lines (sailed back and forth
  // between a and b). Speed in m/s; bob = how much it rocks on the waves (1 = a small boat)
  traffic: {
    vessels: [
      { type: "sailboat", route: { kind: "loop", cx: -500, cz: -650, rx: 180, rz: 90 }, speed: 1.8 },
      { type: "sailboat", route: { kind: "loop", cx: 700, cz: -450, rx: 250, rz: 120 }, speed: 2 },
      { type: "sailboat", route: { kind: "loop", cx: -1500, cz: -400, rx: 200, rz: 100 }, speed: 1.6 },
      { type: "tourboat", route: { kind: "loop", cx: 380, cz: -700, rx: 170, rz: 140 }, speed: 2.2 },
      { type: "ferry", route: { kind: "line", ax: -3300, az: -250, bx: 3300, bz: -150 }, speed: 4, bob: 0.4 },
      { type: "tanker", route: { kind: "line", ax: 3600, az: 500, bx: -3600, bz: 700 }, speed: 2.5, bob: 0.15 },
      { type: "cruise", route: { kind: "line", ax: -3400, az: 260, bx: 3400, bz: 160 }, speed: 3, bob: 0.12 },
      { type: "cargo", route: { kind: "line", ax: 3500, az: 420, bx: -3500, bz: 340 }, speed: 3.5, bob: 0.1 },
      { type: "coastguard", route: { kind: "line", ax: -1800, az: -850, bx: 1800, bz: -800 }, speed: 5 },
    ],
    sightseeingPlane: { cx: 0, cz: -600, r: 1200, alt: 170 }, // circles the bay
  },

  // ===== Out at sea =====
  // 'out' = metres out to sea from the waterline at that x
  offshore: {
    // The harbor channel: red buoys to port, green to starboard, at these distances past the pier end
    harborChannel: { portX: -30, starboardX: 40, distances: [55, 125] },
    buoys: [
      { name: "Special mark off the arch", kind: "x", x: -700, out: 138, top: 0xf2c230, base: 0xf2c230, light: 0xffd84a, period: 5, on: 0.6 },
      { name: "Keep clear of the Sisters", kind: "cardinal", x: -1830, out: 260, top: 0x1b1b1b, base: 0xf2c230, light: 0xffffff, period: 10, on: 0.4 },
      { name: "Isolated danger by Seal Rock", kind: "danger", x: -730, z: -720, top: 0x1b1b1b, base: 0xb3241e, light: 0xffffff, period: 5, on: 0.3 },
    ],
    weatherBuoy: { x: -300, out: 960 },
    oilRig: { x: 1900, out: 1130 },
    // Offshore wind farm: rows of turbines, each row shifted by 'stagger'
    windFarm: { x0: -2350, out: 1010, cols: 4, rows: 3, colSpacing: 200, rowSpacing: 105, stagger: 100 },
    // Wind turbines on the eastern hills (skipped where the ground is lower than minGround)
    hillTurbines: { xs: [1480, 1640, 1800, 1960, 2200, 2360, 2520], inland: 330, minGround: 8 },
    glowBloom: { x: 520, out: 230, r: 380 }, // where the sea glows blue at night
    // Kelp forests along the rocky coast: tall seaweed from the sea floor to the surface, swaying with
    // the waves. Each bed runs from x0 to x1, in water between depth[0] and depth[1] metres deep
    kelp: {
      color: 0x9a8636,
      // Along the coast. Kelp needs rock to hold on to, so it only grows where the sea floor is rocky
      // (below the cliffs), never on sand
      beds: [
        { name: "West bay cliffs", x0: -2600, x1: -2120, count: 420 },
        { name: "Seven Sisters", x0: -2120, x1: -1620, count: 600 },
        { name: "Town cliffs", x0: -1620, x1: -1120, count: 380 },
        { name: "Hidden Cove headlands", x0: -1120, x1: -930, count: 260 },
        { name: "West Point", x0: -930, x1: -430, count: 560 },
        { name: "Lighthouse headland", x0: -20, x1: 380, count: 460 },
        { name: "East Head", x0: 1180, x1: 1660, count: 460 },
        { name: "Bridge Bay rocks", x0: 1880, x1: 2000, count: 140 },
        { name: "East cliffs", x0: 2100, x1: 2620, count: 460 },
      ],
      // Around the rocky islands: a ring of kelp in the shallows all the way round
      islands: [
        { island: "seal", count: 260 },
        { island: "goat", count: 380 },
      ],
      aroundSeaStacks: 30, // plants clinging round the foot of each sea stack and the arch
      depth: [2.5, 16],
    },
  },

  // ===== Grass, fields and wild flowers (drawn by the terrain shader) =====
  // Colours are [red, green, blue] from 0 to 1
  grass: {
    // Blade height in metres for each kind of ground
    height: { meadow: 0.6, pasture: 0.5, wheat: 0.9, stubble: 0.15, hay: 0.3 },
    bladeSizes: [0.42, 0.14, 0.045], // metres between blades: far, middle, close up (smaller = denser)
    shade: 0.07, // how dark it is down between the blades (0 = black)
    maxDistance: 300, // metres: beyond this the ground is plain colour
    meadowColors: [[0.09, 0.25, 0.035], [0.2, 0.38, 0.06]], // natural grass varies between these
    fields: {
      size: [96, 68], // metres
      hedgeWidth: [1.3, 2.6], // where the hedgerows start and are full
      hedgeColor: [0.15, 0.27, 0.1],
      colors: {
        wheat: [0.8, 0.65, 0.29],
        straw: [0.86, 0.77, 0.47],
        freshGrass: [0.28, 0.48, 0.11],
        deepGreen: [0.16, 0.34, 0.07],
        ploughed: [0.5, 0.37, 0.25],
        hay: [0.5, 0.6, 0.22],
      },
    },
    flowers: {
      drifts: [0.52, 0.7], // lower numbers = more and bigger drifts
      density: 0.6, // 0 = every spot in a drift has a flower, 1 = none
      maxDistance: 400,
      colors: {
        daisy: [0.95, 0.93, 0.88],
        buttercup: [0.98, 0.82, 0.12],
        clover: [0.62, 0.38, 0.85],
        poppy: [0.88, 0.14, 0.1],
        cornflower: [0.35, 0.5, 0.95],
        campion: [0.98, 0.55, 0.75],
      },
    },
  },
};
