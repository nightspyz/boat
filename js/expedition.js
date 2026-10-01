// Journal entries, daily tasks, money, boatyard upgrades, saving, briefing and summary screens.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

// ===== Discovery journal =====
// Discoveries and photos fill the journal; money only comes from completing expedition tasks.
const JOURNAL = [
  { id: "gulls", cat: "Wildlife", name: "Seagulls" },
  { id: "flyingfish", cat: "Wildlife", name: "Leaping fish" },
  { id: "reeffish", cat: "Wildlife", name: "Anthias school" },
  { id: "dolphins", cat: "Wildlife", name: "Dolphin pod" },
  { id: "turtles", cat: "Wildlife", name: "Green sea turtle" },
  { id: "seals", cat: "Wildlife", name: "Seal colony" },
  { id: "goats", cat: "Wildlife", name: "Wild goats" },
  { id: "whale", cat: "Wildlife", name: "Humpback whale (in fog)" },
  { id: "orcas", cat: "Wildlife", name: "Orca pod" },
  { id: "shark", cat: "Wildlife", name: "Blue shark" },
  { id: "manta", cat: "Wildlife", name: "Manta ray" },
  { id: "cormorants", cat: "Wildlife", name: "Cormorant roost" },
  { id: "pelicans", cat: "Wildlife", name: "Pelican squadron" },
  { id: "jellyfish", cat: "Wildlife", name: "Moon jellyfish swarm" },
  { id: "harbor", cat: "Coast & islands", name: "Harbor Cove" },
  { id: "cliffs", cat: "Coast & islands", name: "Limestone cliffs" },
  { id: "lighthouse", cat: "Coast & islands", name: "Lighthouse" },
  { id: "stacks", cat: "Coast & islands", name: "Sea stacks" },
  { id: "palmislet", cat: "Coast & islands", name: "Palm Islet" },
  { id: "sealrock", cat: "Coast & islands", name: "Seal Rock" },
  { id: "goatisland", cat: "Coast & islands", name: "Goat Island" },
  { id: "town", cat: "Coast & islands", name: "Clifftop town" },
  { id: "townlights", cat: "Coast & islands", name: "Town lights at night" },
  { id: "delta", cat: "Coast & islands", name: "River delta" },
  { id: "swamp", cat: "Coast & islands", name: "Reed swamp" },
  { id: "arch", cat: "Coast & islands", name: "West Point sea arch" },
  { id: "hiddencove", cat: "Coast & islands", name: "Hidden Cove" },
  { id: "waterfall", cat: "Coast & islands", name: "Cove waterfall" },
  { id: "sisters", cat: "Coast & islands", name: "The Seven Sisters" },
  { id: "grottoes", cat: "Coast & islands", name: "Chalk grottoes" },
  { id: "bridge", cat: "Coast & islands", name: "Coast road bridge" },
  { id: "beachwreck", cat: "Coast & islands", name: "Stranded coaster" },
  { id: "sailboats", cat: "People & boats", name: "Sailboats" },
  { id: "tourboat", cat: "People & boats", name: "Island tour boat" },
  { id: "ferry", cat: "People & boats", name: "Car ferry" },
  { id: "tanker", cat: "People & boats", name: "Oil tanker" },
  { id: "coastguard", cat: "People & boats", name: "Coast guard patrol" },
  { id: "smallplane", cat: "People & boats", name: "Sightseeing plane" },
  { id: "trawler", cat: "People & boats", name: "Fishing trawler" },
  { id: "cruise", cat: "People & boats", name: "Cruise liner" },
  { id: "cargoship", cat: "People & boats", name: "Container ship" },
  { id: "tents", cat: "People & boats", name: "Beach camp" },
  { id: "campfire", cat: "People & boats", name: "Campfire on the beach" },
  { id: "horses", cat: "People & boats", name: "Horse riders" },
  { id: "balloon", cat: "People & boats", name: "Hot-air balloon" },
  { id: "buoys", cat: "People & boats", name: "Channel buoys" },
  { id: "databuoy", cat: "People & boats", name: "Weather buoy" },
  { id: "flotsam", cat: "People & boats", name: "Floating debris" },
  { id: "oilrig", cat: "People & boats", name: "Offshore oil rig" },
  { id: "windfarm", cat: "People & boats", name: "Offshore wind farm" },
  { id: "windmills", cat: "Coast & islands", name: "Hilltop wind turbines" },
  { id: "swimmers", cat: "People & boats", name: "Swimmers" },
  { id: "surfers", cat: "People & boats", name: "Surfers" },
  { id: "sunbathers", cat: "People & boats", name: "Sunbathers" },
  { id: "reef", cat: "Underwater", name: "Coral reef" },
  { id: "wreck", cat: "Underwater", name: "Old wreck" },
  { id: "sailboat", cat: "Underwater", name: "Sunken sailboat" },
  { id: "freighter", cat: "Underwater", name: "Rusted freighter" },
  { id: "deepwreck", cat: "Underwater", name: "Deep wreck (sonar)" },
  { id: "temple", cat: "Ruins & relics", name: "Sunken temple" },
  { id: "colossus", cat: "Ruins & relics", name: "Drowned colossus" },
  { id: "ruins", cat: "Ruins & relics", name: "Hilltop ruins" },
  { id: "watcher", cat: "Ruins & relics", name: "The Watcher statue" },
  { id: "glow", cat: "Mysteries", name: "Strange light" },
  { id: "biolum", cat: "Mysteries", name: "Glowing plankton" },
  { id: "bell", cat: "Relics", name: "Ship's bell" },
  { id: "coin", cat: "Relics", name: "Temple coin" },
  { id: "logbook", cat: "Relics", name: "Captain's logbook" },
  { id: "compass", cat: "Relics", name: "Brass compass" },
  { id: "fragment1", cat: "Relics", name: "Artifact fragment I" },
  { id: "fragment2", cat: "Relics", name: "Artifact fragment II" },
  { id: "fragment3", cat: "Relics", name: "Artifact fragment III" },
  { id: "crate", cat: "Washed up", name: "Cargo crate" },
  { id: "bottle", cat: "Washed up", name: "Message in a bottle" },
  { id: "amphora", cat: "Washed up", name: "Ancient amphora" },
  { id: "airliner", cat: "Sky & weather", name: "High-altitude airliner" },
  { id: "sunset", cat: "Sky & weather", name: "Sunset at sea" },
  { id: "stars", cat: "Sky & weather", name: "Starry night" },
  { id: "aurora", cat: "Sky & weather", name: "Aurora" },
  { id: "rain", cat: "Sky & weather", name: "Rain at sea" },
  { id: "storm", cat: "Sky & weather", name: "Storm" },
  { id: "fog", cat: "Sky & weather", name: "Fog bank" },
  { id: "fireworks", cat: "Sky & weather", name: "Fireworks over the bay" },
  { id: "meteor", cat: "Sky & weather", name: "Shooting star" },
  { id: "comet", cat: "Sky & weather", name: "Comet" },
  { id: "mackerel", cat: "Catches", name: "Mackerel" },
  { id: "seabass", cat: "Catches", name: "Sea bass" },
  { id: "mullet", cat: "Catches", name: "Red mullet" },
  { id: "squid", cat: "Catches", name: "Squid" },
  { id: "tuna", cat: "Catches", name: "Bluefin tuna" },
  { id: "rainbow", cat: "Sky & weather", name: "Rainbow" },
];
const JOURNAL_BY_ID = Object.fromEntries(JOURNAL.map((e) => [e.id, e]));

// What each discovery is worth: paid once when first found; a first photo pays half again on top.
// Rarer, farther or harder things are worth more.
const JOURNAL_VALUES = {
  gulls: 50, flyingfish: 80, reeffish: 150, dolphins: 200, turtles: 250, seals: 200, goats: 150, whale: 400,
  harbor: 0, cliffs: 60, lighthouse: 100, stacks: 150, palmislet: 120, sealrock: 120, goatisland: 150,
  town: 120, townlights: 200, delta: 150, swamp: 150,
  arch: 300, hiddencove: 200, waterfall: 350, sisters: 300, grottoes: 250, bridge: 200,
  reef: 120, wreck: 300, sailboat: 200, freighter: 200, deepwreck: 400,
  temple: 350, colossus: 400, ruins: 250, watcher: 300, glow: 500,
  bell: 300, coin: 250, logbook: 200, compass: 200, fragment1: 600, fragment2: 600, fragment3: 600,
  sailboats: 50, tourboat: 60, ferry: 80, tanker: 120, coastguard: 100, smallplane: 80,
  swimmers: 40, surfers: 80, sunbathers: 30,
  airliner: 60, sunset: 80, stars: 80, aurora: 300, rain: 60, storm: 150, fog: 100,
  crate: 150, bottle: 250, amphora: 400,
  orcas: 450, shark: 250, manta: 300, cormorants: 120, pelicans: 150, beachwreck: 250, trawler: 100, balloon: 200,
  biolum: 400, rainbow: 250, fireworks: 120,
  cruise: 120, cargoship: 100, tents: 40, campfire: 120, horses: 150, meteor: 250, comet: 400,
  mackerel: 40, seabass: 70, mullet: 90, squid: 110, tuna: 350,
  jellyfish: 180, buoys: 50, databuoy: 150, flotsam: 40, oilrig: 250, windfarm: 200, windmills: 120,
};
for (const e of JOURNAL) e.value = JOURNAL_VALUES[e.id] || 0;
// Finding something pays a little; a good photo of it pays well (× the photo's quality, see photo.js)
const discoveryValue = (entry) => Math.round((entry.value * 0.3) / 5) * 5;
const photoValue = (entry) => Math.round(entry.value * 1.2);
const journal = Object.fromEntries(JOURNAL.map((e) => [e.id, { seen: false, photo: false }]));

// ===== Expeditions (the only way to earn money) =====
const nearLighthouse = () =>
  Math.hypot(state.boat.x - lighthouse.group.position.x, state.boat.z - lighthouse.group.position.z) < 800;
const photoOf = (target) => (kind, id) => kind === "photo" && id === target;
const findOrPhoto = (target) => (kind, id) => id === target;

const GOALS = [
  {
    id: "stacks-sunset",
    title: "Sea Stacks at Sunset",
    reward: 400,
    hint: "Photograph the sea stacks off the lighthouse while the sun is low, around 17:00–18:15. Press F to take a photo.",
    check: (kind, id) => kind === "photo" && id === "stacks" && shared.uSunDir.value.y < 0.3 && shared.uSunDir.value.y > -0.05,
  },
  {
    id: "wreck",
    title: "The Old Wreck",
    reward: 600,
    hint: "A fisherman's chart marks a wreck in clear water along the western cliffs, far past the cove. Look down into the water.",
    check: findOrPhoto("wreck"),
  },
  {
    id: "reef",
    title: "Reef Survey",
    reward: 400,
    hint: "Photograph a school of reef fish over the coral below the cliffs.",
    check: photoOf("reeffish"),
  },
  {
    id: "dolphins",
    title: "The Headland Dolphins",
    reward: 500,
    hint: "A dolphin pod has been seen off the lighthouse headland. Photograph one there, before they lose interest in you.",
    check: (kind, id) => kind === "photo" && id === "dolphins" && nearLighthouse(),
  },
  {
    id: "light",
    title: "A Strange Light",
    reward: 1000,
    hint: "Fishermen talk about a light under the water off the eastern cliffs, but only after dark. Go and see.",
    check: findOrPhoto("glow"),
  },
  {
    id: "seals",
    title: "Seal Count",
    reward: 500,
    hint: "A colony of seals hauls out on a bare rock a few hundred metres off the western shore. Photograph them.",
    check: photoOf("seals"),
  },
  {
    id: "turtles",
    title: "Turtle Watch",
    reward: 600,
    hint: "Green sea turtles circle the lagoon of the little palm island south-east of the lighthouse. Photograph one.",
    check: photoOf("turtles"),
  },
  {
    id: "goats",
    title: "The Island Herd",
    reward: 450,
    hint: "Wild goats roam the big island far to the east. Photograph them grazing.",
    check: photoOf("goats"),
  },
  {
    id: "temple",
    title: "Temple Beneath the Waves",
    reward: 700,
    hint: "Divers' stories tell of columns standing in shallow water west of the harbor cove. Find the sunken temple.",
    check: findOrPhoto("temple"),
  },
  {
    id: "colossus",
    title: "The Drowned Colossus",
    reward: 800,
    hint: "Near the sunken temple lies a great stone face staring up at the surface. Photograph it.",
    check: photoOf("colossus"),
  },
  {
    id: "freighter",
    title: "The Rusted Freighter",
    reward: 500,
    hint: "A cargo ship ran aground somewhere west of Seal Rock. Photograph what's left of it.",
    check: photoOf("freighter"),
  },
  {
    id: "sailboat",
    title: "The Lost Sailboat",
    reward: 450,
    hint: "A small sailboat went down on the reef a short way east of the sea stacks. Find it.",
    check: findOrPhoto("sailboat"),
  },
  {
    id: "watcher",
    title: "The Watcher",
    reward: 700,
    hint: "Among ruins on the hilltop of the eastern island stands a statue pointing out to sea. Photograph it.",
    check: photoOf("watcher"),
  },
  {
    id: "ferry",
    title: "Catch the Ferry",
    reward: 400,
    hint: "The car ferry crosses the bay a few hundred metres offshore, back and forth all day. Photograph it.",
    check: photoOf("ferry"),
  },
  {
    id: "tanker",
    title: "Giant on the Horizon",
    reward: 500,
    hint: "An oil tanker creeps along the horizon far out to sea. Get close enough for a photo.",
    check: photoOf("tanker"),
  },
  {
    id: "coastguard",
    title: "Coast Guard Patrol",
    reward: 450,
    hint: "The coast guard patrols fast along the coast, blue lights flashing. Photograph their boat.",
    check: photoOf("coastguard"),
  },
  {
    id: "surfers",
    title: "Surf's Up",
    reward: 400,
    hint: "Surfers ride the waves into the harbor cove. Photograph one while it's still light.",
    check: photoOf("surfers"),
  },
  {
    id: "townlights",
    title: "Town Lights",
    reward: 600,
    hint: "The clifftop town west of the harbor glows after dark. Photograph its lights from the sea at night.",
    check: photoOf("townlights"),
  },
  {
    id: "delta",
    title: "Where the River Meets the Sea",
    reward: 450,
    hint: "A river reaches the sea through two mouths on the sandy coast east of the lighthouse. Find the delta.",
    check: findOrPhoto("delta"),
  },
  {
    id: "swamp",
    title: "Into the Reeds",
    reward: 500,
    hint: "Between the river's two mouths lies a reed swamp. Photograph it from the water.",
    check: photoOf("swamp"),
  },
  {
    id: "arch-through",
    title: "Thread the Needle",
    reward: 600,
    hint: "A rock arch stands in the sea off West Point, west of the harbor. Sail right through it.",
    check: (kind, id) => kind === "event" && id === "arch-through",
  },
  {
    id: "waterfall",
    title: "The Hidden Falls",
    reward: 650,
    hint: "Past West Point the cliffs curve into a hidden cove where a stream falls onto the beach. Photograph the waterfall.",
    check: photoOf("waterfall"),
  },
  {
    id: "sisters",
    title: "The Seven Sisters",
    reward: 650,
    hint: "Seven tall sandstone stacks stand off the far western headland, beyond the town. Photograph them while the sun is low (17:00–18:15).",
    check: (kind, id) => kind === "photo" && id === "sisters" && shared.uSunDir.value.y < 0.3 && shared.uSunDir.value.y > -0.05,
  },
  {
    id: "grottoes",
    title: "The Chalk Grottoes",
    reward: 550,
    hint: "The white cliffs of East Head, past the river, are hollowed by caves at the waterline. Photograph them.",
    check: photoOf("grottoes"),
  },
  {
    id: "bridge",
    title: "The Coast Road",
    reward: 450,
    hint: "A road winds along the far eastern cliffs and crosses a creek on a tall arch bridge. Photograph the bridge from the sea.",
    check: photoOf("bridge"),
  },
  {
    id: "gulls-fish",
    title: "Follow the Gulls",
    reward: 350,
    hint: "Where gulls circle and dive, small fish are near the surface. Find the feeding birds and photograph a leaping fish.",
    check: photoOf("flyingfish"),
  },
  // Tasks that only come up in certain weather (offered on those days, and can come up again)
  {
    id: "whale",
    title: "Something in the Fog",
    reward: 900,
    when: () => expedition.forecastFog,
    hint: "Fog today. Fishermen say that on days like this something huge comes in close and breathes out on the open water. Listen for it, and photograph it.",
    check: photoOf("whale"),
  },
  {
    id: "storm-finds",
    title: "After the Storm",
    reward: 500,
    when: () => expedition.washedUp,
    hint: "Yesterday's storm washed things up on the sandy beaches: the harbor cove, the coast east of the lighthouse, Palm Islet. Find something worth keeping.",
    check: (kind, id) => (kind === "discover" || kind === "photo") && ["crate", "bottle", "amphora"].includes(id),
  },
  // Tasks that need gear from the boatyard (only offered once you own it)
  {
    id: "deep",
    title: "The Deep Contact",
    reward: 900,
    requires: "sonar",
    hint: "Fishermen snag their nets on something deep off the far western cliffs, past the town. Find it with sonar.",
    check: findOrPhoto("deepwreck"),
  },
  {
    id: "bell",
    title: "Salvage the Bell",
    reward: 700,
    requires: "diving",
    hint: "Dive on the old wreck off the western cliffs and bring up its bell. Stop over the wreck and press X.",
    check: (kind, id) => kind === "relic" && id === "bell",
  },
  {
    id: "logbook",
    title: "The Captain's Log",
    reward: 600,
    requires: "diving",
    hint: "Dive on the rusted freighter west of Seal Rock and recover the captain's logbook.",
    check: (kind, id) => kind === "relic" && id === "logbook",
  },
  {
    id: "fragment",
    title: "What Lies Beneath the Light",
    reward: 1200,
    requires: "diving",
    hint: "Dive where the strange light glows off the eastern cliffs and see what is down there.",
    check: (kind, id) => kind === "relic" && id === "fragment1",
  },
];

// Where each task's target is (for the radio's search area)
function goalTarget(goal) {
  const at = (x, z) => ({ x, z });
  const shipOf = (type) => vessels.find((v) => v.type === type);
  switch (goal.id) {
    case "stacks-sunset":
    case "dolphins":
      return at(seaStacks[1].x, seaStacks[1].z);
    case "wreck":
    case "bell":
      return at(WRECK.x, WRECK.z);
    case "reef":
      return at(LH_X - 120, shoreZAt(LH_X - 120) + 60);
    case "light":
    case "fragment":
      return at(GLOW.x, GLOW.z);
    case "seals":
      return at(ISLAND.seal.x, ISLAND.seal.z);
    case "turtles":
      return at(ISLAND.palm.x, ISLAND.palm.z);
    case "goats":
    case "watcher":
      return at(ISLAND.goat.x, ISLAND.goat.z);
    case "temple":
      return at(TEMPLE.x, TEMPLE.z);
    case "colossus":
      return at(COLOSSUS.x, COLOSSUS.z);
    case "freighter":
    case "logbook":
      return at(FREIGHTER.x, FREIGHTER.z);
    case "sailboat":
      return at(SAILBOAT.x, SAILBOAT.z);
    case "surfers":
      return at(COVE_X - 100, shoreZAt(COVE_X - 100) + 60);
    case "townlights":
      return at(TOWN_CENTER.x, shoreZAt(TOWN_CENTER.x) + 200);
    case "delta":
    case "swamp":
      return at(SWAMP.x, SWAMP.z);
    case "deep":
      return at(DEEP_WRECK.x, DEEP_WRECK.z);
    case "gulls-fish":
      return at(boil.x, boil.z);
    case "arch-through":
      return at(ARCH.x, ARCH.z);
    case "waterfall":
      return at(WATERFALL.x, WATERFALL.z);
    case "sisters":
      return at(-1830, shoreZAt(-1830) + 90);
    case "grottoes":
      return at(GROTTOES[1].x, GROTTOES[1].z);
    case "bridge":
      return at(BRIDGE.x, BRIDGE.z);
    default: {
      const ship = shipOf(goal.id);
      return ship ? at(ship.x, ship.z) : null;
    }
  }
}

const expedition = {
  day: 1,
  funds: 0,
  fuel: 100,
  fuelMax: 100,
  goal: null,
  goalDone: false,
  completedGoals: new Set(),
  forecast: 0.1,
  hours: 0,
  distance: 0,
  photos: 0,
  earnings: 0,
  discoveryEarnings: 0,
  photoEarnings: 0,
  relicEarnings: 0,
  newFinds: [],
  lastX: 0,
  lastZ: 0,
  warned25: false,
  warned10: false,
  searchArea: null, // from the radio: { x, z, r }
  radioReport: "",
  mysterySolved: false,
  forecastFog: false, // tomorrow (or today, once the day starts) is a fog day
  washedUp: false, // a storm yesterday: things lie on the beaches today
  sawStorm: false, // a storm blew during today's trip
  warnedSwell: -999, // when the storm-swell warning last showed
  warnedEdge: -999, // when the edge-of-the-map warning last showed
  archSide: 0, // which side of the sea arch the boat is on (to notice sailing through it)
};
const forecastName = () => (expedition.forecastFog ? "Fog" : weatherName(expedition.forecast));

// ===== Boatyard upgrades: gear that changes what you can discover =====
const UPGRADES = [
  { id: "binoculars", icon: "🔭", name: "Binoculars", price: 600, desc: "Spot wildlife and places from 50% farther away." },
  { id: "tank", icon: "⛽", name: "Long-range fuel tank", price: 800, desc: "50% more fuel: reach farther and stay out longer." },
  { id: "camera", icon: "📷", name: "Telephoto camera", price: 700, desc: "Camera zooms to 10× (instead of 4×): photograph things 60% farther away, and fill the frame for better-rated shots." },
  { id: "radio", icon: "📻", name: "Marine radio", price: 500, desc: "A morning report narrows each task to a search area on your map." },
  { id: "chart", icon: "🧭", name: "Chartplotter", price: 900, desc: "Your map zooms out and shows everything you have discovered." },
  { id: "hull", icon: "🛡️", name: "Reinforced hull", price: 1000, desc: "Full speed and normal fuel use in rough seas and storms." },
  { id: "sonar", icon: "📡", name: "Sonar", price: 1200, desc: "Pings underwater contacts nearby, even ones too deep to see." },
  { id: "diving", icon: "🤿", name: "Diving gear", price: 1500, desc: "Dive on underwater sites (press X when stopped) to recover relics." },
  { id: "rod", icon: "🎣", name: "Fishing rod", price: 300, desc: "Stop and cast (Q); strike when the float dips. Every catch sells at the harbor." },
  { id: "searchlight", icon: "🔦", name: "Searchlight", price: 450, desc: "A powerful beam (L) that points wherever you look. Light up the night." },
  { id: "fireworks", icon: "🎆", name: "Fireworks", price: 400, desc: "Launch fireworks from the boat at night (K): five kinds of shells." },
  { id: "drone", icon: "🚁", name: "Camera drone", price: 1800, desc: "Fly a camera drone from the boat (V): photograph from above, up to 100 m from the boat." },
];
const upgrades = new Set();
const owned = (id) => upgrades.has(id);

// ===== Saved progress (in this browser) =====
const SAVE_KEY = "coastline-save-v1";
function saveGame() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        day: expedition.day,
        funds: expedition.funds,
        forecast: expedition.forecast,
        completedGoals: [...expedition.completedGoals],
        upgrades: [...upgrades],
        journal,
        mysterySolved: expedition.mysterySolved,
        forecastFog: expedition.forecastFog,
        washedUp: expedition.washedUp,
      })
    );
  } catch (e) {
    // Storage can be unavailable (private windows, some file:// setups): the game still works, just unsaved
  }
}
function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!data) return false;
    expedition.day = data.day;
    expedition.funds = data.funds;
    expedition.forecast = data.forecast;
    expedition.completedGoals = new Set(data.completedGoals);
    expedition.mysterySolved = !!data.mysterySolved;
    expedition.forecastFog = !!data.forecastFog;
    expedition.washedUp = !!data.washedUp;
    for (const id of data.upgrades) upgrades.add(id);
    for (const id in data.journal) if (journal[id]) journal[id] = data.journal[id];
    return true;
  } catch (e) {
    return false;
  }
}
function eraseSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // nothing saved to erase
  }
}

// Start at the harbor, facing out along the coast toward the lighthouse
function placeBoatAtHarbor() {
  const b = state.boat;
  b.x = harbor.dockX;
  b.z = harbor.dockZ;
  b.yaw = -Math.PI / 2;
  b.speed = 0;
  b.throttle = 0;
}
placeBoatAtHarbor();
flock.x = harbor.dockX + 25;
flock.z = harbor.dockZ;

function chooseGoal() {
  if (expedition.day === 1) return GOALS[0];
  // Today's weather can bring its own task (fog, things washed up after a storm)
  const special = GOALS.filter((g) => g.when && g.when());
  if (special.length && Math.random() < 0.7) return pick(special);
  const available = GOALS.filter((g) => !g.when && (!g.requires || owned(g.requires)));
  const open = available.filter((g) => !expedition.completedGoals.has(g.id));
  // Tasks that just became possible with new gear come first
  const gear = open.filter((g) => g.requires);
  const pool = gear.length && Math.random() < 0.6 ? gear : open.length ? open : available;
  return pool[Math.floor(Math.random() * pool.length)];
}

const RADIO_LINES = [
  "Harbor radio: a skipper reports it somewhere in here.",
  "Coast radio: fishermen say you'll want to look around here.",
  "Radio chatter: 'I'd try around there, if I were you.'",
];

function showBriefing() {
  if (state.phase === "summary") expedition.day++;
  expedition.goal = chooseGoal();
  // The radio narrows the task down to a search area (roughly centred, so you still have to look)
  expedition.searchArea = null;
  expedition.radioReport = "";
  if (owned("radio")) {
    const target = goalTarget(expedition.goal);
    if (target) {
      const a = rand(0, Math.PI * 2);
      const off = rand(0, 120);
      expedition.searchArea = { x: target.x + Math.cos(a) * off, z: target.z + Math.sin(a) * off, r: 250 };
      expedition.radioReport = pick(RADIO_LINES) + " (circled on your map)";
    }
  }
  state.phase = "briefing";
  renderBriefing();
}

// What today's weather means for the trip
function weatherWarnings() {
  const list = [];
  if (expedition.forecastFog)
    list.push("🌫️ Fog: you'll only see about a hundred metres. Listen for the lighthouse foghorn and watch for its beam to find your way home.");
  if (expedition.forecast >= 0.78)
    list.push(
      owned("hull")
        ? "⛈️ Storm warning: rough seas, but your reinforced hull can take them."
        : "⛈️ Storm warning: the swell more than about 450 m offshore is too heavy for your hull (a reinforced hull would handle it)."
    );
  if (expedition.washedUp) list.push("🌊 Yesterday's storm washed things up on the beaches. Worth a look.");
  return list;
}

function renderBriefing() {
  state.shopOpen = false;
  overlayTitleEl.textContent = `Day ${expedition.day} — Today's expedition`;
  const gearList = UPGRADES.filter((u) => owned(u.id)).map((u) => u.icon).join(" ") || "none yet";
  overlayBodyEl.innerHTML = `
    <div class="card">
      <div class="label">Goal</div>
      <div style="font-size:20px;font-weight:600;margin:2px 0 6px">${expedition.goal.title}</div>
      <div>${expedition.goal.hint}</div>
      <div style="margin-top:8px">Reward: <b>$${expedition.goal.reward}</b></div>
      ${expedition.radioReport ? `<div style="margin-top:8px">📻 ${expedition.radioReport}</div>` : ""}
      <div style="margin-top:12px" class="label">Conditions</div>
      <div>Forecast: ${forecastName()} · ${owned("tank") ? "Long-range tank" : "Full tank"} · Sunset around 18:00</div>
      ${weatherWarnings().map((w) => `<div style="margin-top:4px">${w}</div>`).join("")}
      <div style="margin-top:12px" class="label">Your boat</div>
      <div>Gear: ${gearList} · Funds: $${expedition.funds.toLocaleString()}</div>
    </div>
    <div class="next">
      <button data-ui="shop">🛠️ Boatyard (B)</button>
      <button data-ui="go">Cast off (Space)</button>
    </div>`;
  overlayEl.classList.remove("hidden");
  statusEl.textContent = "Briefing";
}

// ----- Boatyard -----
function openShop() {
  if (state.phase !== "briefing" && state.phase !== "summary") return;
  state.shopOpen = true;
  renderShop();
}
function closeShop() {
  state.shopOpen = false;
  if (state.phase === "briefing") renderBriefing();
  else {
    overlayTitleEl.textContent = expedition.summaryTitle;
    overlayBodyEl.innerHTML = expedition.summaryHTML;
  }
}
function renderShop() {
  overlayTitleEl.textContent = "🛠️ Boatyard";
  overlayBodyEl.innerHTML = `
    <div class="card shop">
      <div class="row"><span class="label">Funds</span><b>$${expedition.funds.toLocaleString()}</b></div>
      ${UPGRADES.map((u, i) => {
        const have = owned(u.id);
        const afford = expedition.funds >= u.price;
        return `<div class="shop-item${have ? " owned" : ""}">
          <div><b>${i + 1}. ${u.icon} ${u.name}</b><div class="desc">${u.desc}</div></div>
          ${
            have
              ? `<span class="owned-tag">Owned</span>`
              : `<button data-buy="${u.id}"${afford ? "" : " disabled"}>$${u.price.toLocaleString()}</button>`
          }
        </div>`;
      }).join("")}
    </div>
    <div class="next"><button data-ui="close">Back (B)</button></div>`;
}
function buyUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || owned(id)) return;
  if (expedition.funds < u.price) {
    toast(`Not enough money for the ${u.name} yet.`);
    sound.chime("deny");
    return;
  }
  expedition.funds -= u.price;
  upgrades.add(id);
  saveGame();
  sound.chime("buy");
  toast(`${u.icon} ${u.name} fitted to your boat!`, "goal");
  gear.refresh();
  renderShop();
}

// Clicks and taps on overlay buttons
overlayBodyEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  e.stopPropagation();
  if (btn.dataset.buy) buyUpgrade(btn.dataset.buy);
  else if (btn.dataset.ui === "shop") openShop();
  else if (btn.dataset.ui === "close") closeShop();
  else if (btn.dataset.ui === "go") pressSpace();
  else if (btn.dataset.ui === "new") startNewGame();
});
overlayBodyEl.addEventListener("pointerup", (e) => {
  if (e.target.closest("button")) e.stopPropagation();
});

function beginExpedition() {
  placeBoatAtHarbor();
  state.timeOfDay = EXPEDITION_START_HOUR;
  weather.value = weather.target = expedition.forecast;
  weather.timer = rand(60, 120);
  weather.fogDay = expedition.forecastFog;
  weather.fog = weather.fogTarget = expedition.forecastFog ? 0.9 : 0;
  weather.fogTimer = rand(60, 120);
  if (expedition.washedUp) washUp();
  else clearWashUp();
  for (const s of sheens) s.hinted = false;
  const fuelMax = owned("tank") ? 150 : 100;
  Object.assign(expedition, {
    fuel: fuelMax,
    fuelMax,
    goalDone: false,
    hours: 0,
    distance: 0,
    photos: 0,
    earnings: 0,
    discoveryEarnings: 0,
    photoEarnings: 0,
    relicEarnings: 0,
    fishEarnings: 0,
    newFinds: [],
    lastX: state.boat.x,
    lastZ: state.boat.z,
    warned25: false,
    warned10: false,
    sawStorm: expedition.forecast >= 0.78,
    warnedSwell: -999,
    warnedEdge: -999,
    archSide: 0,
    leftHarbor: false,
  });
  for (const s of schools) s.placed = false;
  state.phase = "running";
  state.running = true;
  state.paused = false;
  state.shopOpen = false;
  overlayEl.classList.add("hidden");
  goalTitleEl.textContent = expedition.goal.title;
  goalHintEl.textContent = expedition.goal.hint;
  goalEl.classList.remove("hidden", "done");
  statusEl.textContent = "At sea — Space to pause";
  updateCamera(0, true);
}

function nearHarbor() {
  return Math.hypot(state.boat.x - harbor.dockX, state.boat.z - harbor.dockZ) < 35;
}

// Docking ends the day, but only once you've actually been out: E sits right next to W, and every
// trip starts at the dock, so a stray press at the start mustn't end the day
function tryEndExpedition() {
  if (nearHarbor()) {
    if (!expedition.leftHarbor) {
      toast("⚓ You've only just cast off. Head out and explore, then come back here to end the day.");
      return;
    }
    endExpedition(false);
  } else if (expedition.fuel <= 0) endExpedition(true);
}

function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

const MYSTERY_TEXT =
  "The three fragments fit together into a disc of dark metal, faintly warm to the touch. " +
  "Its markings don't match any chart you own — but they all point east, past Goat Island, beyond the edge of the map…";

function endExpedition(towed) {
  state.running = false;
  state.phase = "summary";
  state.boat.speed = 0;
  goalEl.classList.add("hidden");
  promptEl.classList.add("hidden");

  const finds = expedition.newFinds.map((id) => JOURNAL_BY_ID[id]);
  const count = (cats) => finds.filter((f) => cats.includes(f.cat)).length;
  // Today's pay: every new discovery, every first photo, every relic, plus the task reward
  const reward = expedition.goalDone ? expedition.goal.reward : 0;
  const lines = [
    ["📓 New discoveries", expedition.discoveryEarnings],
    ["📷 New photos", expedition.photoEarnings],
  ];
  if (expedition.relicEarnings) lines.push(["🏺 Relics", expedition.relicEarnings]);
  if (expedition.fishEarnings) lines.push(["🎣 Fish sold", expedition.fishEarnings]);
  lines.push([expedition.goalDone ? `★ Task: ${expedition.goal.title}` : "★ Task not completed", reward]);
  const earned = lines.reduce((sum, [, v]) => sum + v, 0);
  if (towed && earned) lines.push(["Tow fee (30%)", -Math.round(earned * 0.3)]);
  const total = lines.reduce((sum, [, v]) => sum + v, 0);
  expedition.funds += total;
  if (expedition.goalDone) expedition.completedGoals.add(expedition.goal.id);
  expedition.forecast = WEATHER_TARGETS[Math.floor(Math.random() * WEATHER_TARGETS.length)];
  // Some calm days are fog days; a storm today leaves things on the beaches tomorrow
  expedition.forecastFog = expedition.forecast < 0.5 && Math.random() < 0.3;
  expedition.washedUp = expedition.sawStorm;

  const row = (label, value) => `<div class="row"><span>${label}</span><span>${value}</span></div>`;
  const money = (v) => `${v < 0 ? "−" : "+"}$${Math.abs(v).toLocaleString()}`;
  let mystery = "";
  if (expedition.newFinds.some((id) => id.startsWith("fragment")) && expedition.mysterySolved) {
    mystery = `<div style="margin-top:10px;opacity:0.9">✦ ${MYSTERY_TEXT}</div>`;
  } else if (expedition.newFinds.includes("glow") && !owned("diving")) {
    mystery = `<div style="margin-top:10px;opacity:0.85">Something glinted beneath the strange light… You'd need diving gear to reach it.</div>`;
  }
  const affordable = UPGRADES.filter((u) => !owned(u.id) && expedition.funds >= u.price).length;

  expedition.summaryTitle = towed ? "Towed back to harbor" : "Expedition complete";
  expedition.summaryHTML = `
    <div class="card">
      ${row("Time at sea", formatDuration(expedition.hours))}
      ${row("🐬 New wildlife", count(["Wildlife"]))}
      ${row("🏝️ New places", count(["Coast & islands", "Underwater", "Ruins & relics", "Mysteries"]))}
      ${row("⛵ Boats & people", count(["People & boats"]))}
      ${row("🏺 Relics recovered", count(["Relics"]))}
      ${row("🌅 Sky & weather", count(["Sky & weather"]))}
      ${row("📷 New photos", expedition.photos)}
      ${row("🗺️ Distance", `${(expedition.distance / 1000).toFixed(1)} km`)}
      ${row("⛽ Fuel left", `${Math.round((expedition.fuel / expedition.fuelMax) * 100)}%`)}
      <div style="margin-top:8px"></div>
      ${row("Funds before the trip", `$${(expedition.funds - total).toLocaleString()}`)}
      ${lines.map(([label, v]) => row(label, money(v))).join("")}
      <div class="row total"><span>Earned today</span><span>${money(total)}</span></div>
      ${row("<b>Funds now</b>", `<b>$${expedition.funds.toLocaleString()}</b>`)}
      ${mystery}
    </div>
    <div class="next">Tomorrow's weather: ${forecastName()}${
      expedition.washedUp ? "<br>🌊 After today's storm, things may have washed up on the beaches" : ""
    }${
      affordable ? `<br>🛠️ You can afford ${affordable} upgrade${affordable > 1 ? "s" : ""} at the boatyard` : ""
    }<br>
      <button data-ui="shop">🛠️ Boatyard (B)</button>
      <button data-ui="go">Next day (Space)</button>
    </div>`;
  overlayTitleEl.textContent = expedition.summaryTitle;
  overlayBodyEl.innerHTML = expedition.summaryHTML;
  overlayEl.classList.remove("hidden");
  statusEl.textContent = "Back at harbor";

  // Save, ready for the next day
  expedition.day++;
  saveGame();
  expedition.day--;
}

// ===== Cheat: type "doronii" anywhere for a pile of money =====
{
  let typed = "";
  window.addEventListener("keydown", (e) => {
    if (!e.key || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-7);
    if (typed !== "doronii") return;
    typed = "";
    expedition.funds += 100000;
    saveGame();
    sound.chime("buy");
    toast("💰 Cheat: +$100,000", "goal");
    if (state.shopOpen) renderShop();
  });
}
