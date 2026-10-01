// The photo journal (J): a two-page book. Left: every subject by section, as your own photos.
// Right: the chosen subject: best photo, facts, other shots, notes, where it was taken, conditions.
// Part of Coastline: the js/ files load in order from index.html and share one global scope.

const BOOK_SECTIONS = [
  { name: "Marine mammals", icon: "🐾", ids: ["dolphins", "seals", "whale", "orcas"] },
  { name: "Fish & sea life", icon: "🐟", ids: ["flyingfish", "reeffish", "turtles", "manta", "shark"] },
  { name: "Birds & land animals", icon: "🕊️", ids: ["gulls", "cormorants", "pelicans", "goats"] },
  {
    name: "Landmarks",
    icon: "⛰️",
    ids: ["harbor", "cliffs", "lighthouse", "stacks", "palmislet", "sealrock", "goatisland", "town", "townlights", "delta", "swamp", "arch", "hiddencove", "waterfall", "sisters", "grottoes", "bridge", "beachwreck"],
  },
  { name: "Boats & people", icon: "⛵", ids: ["sailboats", "tourboat", "ferry", "tanker", "coastguard", "trawler", "smallplane", "balloon", "swimmers", "surfers", "sunbathers"] },
  { name: "Underwater", icon: "🤿", ids: ["reef", "wreck", "sailboat", "freighter", "deepwreck", "temple", "colossus"] },
  { name: "Weather & sky", icon: "☁️", ids: ["sunset", "rainbow", "rain", "storm", "fog", "stars", "aurora", "airliner"] },
  { name: "Mysteries", icon: "★", ids: ["ruins", "watcher", "glow", "biolum"] },
  { name: "Finds & relics", icon: "🏺", ids: ["bell", "coin", "logbook", "compass", "fragment1", "fragment2", "fragment3", "crate", "bottle", "amphora"] },
];
// Anything not listed above still gets a home
{
  const listed = new Set(BOOK_SECTIONS.flatMap((s) => s.ids));
  const rest = JOURNAL.filter((e) => !listed.has(e.id)).map((e) => e.id);
  if (rest.length) BOOK_SECTIONS.push({ name: "Other", icon: "✦", ids: rest });
}
const BOOK_SECTION_OF = Object.fromEntries(BOOK_SECTIONS.flatMap((s) => s.ids.map((id) => [id, s])));

// [picture, description, best time, weather, field note]
const BOOK_INFO = {
  gulls: ["🕊️", "Herring gulls patrol the coast and gather wherever fish are feeding near the surface.", "Daytime", "Anything but storms", "A crowd of gulls wheeling and diving means a feeding spot is right underneath."],
  flyingfish: ["🐟", "Flying fish burst from the water and glide on stiff fins to escape the hunters below.", "Daytime", "Calm to breezy", "They leap most often around the feeding spot under the gulls."],
  reeffish: ["🐠", "Bright orange anthias hang in shimmering schools over the reef.", "Daytime", "Clear water", "Drift slowly over the reef under the cliffs and look down."],
  dolphins: ["🐬", "Common dolphins love to ride alongside boats, leaping in long arcs.", "Daytime", "Calm seas", "Cruise steadily in open water and a pod may come to play. Don't outrun them."],
  turtles: ["🐢", "Green turtles graze the shallows and come up now and then to breathe.", "Daytime", "Clear water", "Shallow, sandy water around the islands."],
  seals: ["🦭", "A colony of grey seals hauls out on the rocks to doze in the sun.", "Any time", "Any", "Seal Rock, west of the harbor."],
  goats: ["🐐", "Feral goats picking their way across the steep slopes of Goat Island.", "Daytime", "Any", "Circle Goat Island and scan the slopes with the zoom."],
  whale: ["🐋", "A humpback travelling the coast. It only comes this close when fog hides the sea.", "Any time", "Fog", "Listen for the blow in the fog, then wait: it surfaces for several breaths before it dives."],
  orcas: ["🐋", "A family of orcas, led by a bull with a towering dorsal fin, hunting along the shelf.", "Any time", "Not stormy", "Only far offshore, more than 350 m from the coast. They cross ahead, breathe a few times, and dive."],
  shark: ["🦈", "A blue shark: slim, cobalt-backed and curious about anything new in its water.", "Daytime", "Calm", "Wait in deep water (more than 14 m) and watch for a fin circling the boat."],
  manta: ["◆", "A manta ray, flying slowly through the water on wings four metres wide.", "Daytime", "Clear water", "Sandy water 3 to 16 m deep. It circles just under the surface. Stay still and look down."],
  cormorants: ["🐦", "Cormorants roost on top of the tallest Sisters, hanging their wings out to dry.", "Daytime", "Any", "The Seven Sisters, far to the west. Zoom in on the tops of the stacks."],
  pelicans: ["🐦", "Pelicans fly in tidy lines, gliding a wingtip above the waves and flapping in turn.", "Daytime", "Not stormy or foggy", "Now and then a line passes along the coast. Watch toward the shore."],
  harbor: ["⚓", "Home port: the pier, the fuel dock and the harbor lamp.", "Any time", "Any", "Where every expedition starts and ends."],
  cliffs: ["🪨", "Pale limestone cliffs, carved by the sea into ledges, notches and caves.", "Daytime", "Any", "Much of the coast, both sides of the harbor."],
  lighthouse: ["🗼", "The old lighthouse still sweeps its beam across the reefs every night.", "Dusk or night", "Clear", "Its light carries farthest after dark."],
  stacks: ["🪨", "Sea stacks: pillars of rock left standing as the cliffs retreat.", "Daytime", "Any", "Just off the lighthouse point."],
  palmislet: ["🏝️", "A sandy islet with a crown of palms, the tour boat's favourite.", "Daytime", "Clear", "East of the harbor."],
  sealrock: ["🪨", "A low, wave-washed rock: home of the seal colony.", "Any time", "Any", "West of the harbor."],
  goatisland: ["⛰️", "The largest island: steep, wild, and topped with old stones.", "Daytime", "Any", "East, beyond the palm islet."],
  town: ["🏘️", "A whitewashed town stacked along the clifftop.", "Daytime", "Any", "West of the harbor, high on the cliffs."],
  townlights: ["🌃", "After dark the town glows above the black water.", "Night", "Clear", "Stand off the town after sunset."],
  delta: ["🏞️", "Where the river spreads out over the sand and meets the sea.", "Daytime", "Any", "East of the harbor."],
  swamp: ["🌾", "Reed beds between the river mouths, loud with frogs and birds.", "Daytime", "Any", "Behind the delta."],
  arch: ["🌉", "A natural arch off West Point, tall enough to sail through.", "Daytime", "Calm", "West Point. Try sailing through it."],
  hiddencove: ["🏖️", "A cove hidden behind the headland. You can only see it from the water.", "Daytime", "Any", "Follow the cliffs west of the harbor closely."],
  waterfall: ["💧", "A stream drops off the cliff straight onto the beach of the cove.", "Daytime", "After rain is best", "Inside the hidden cove."],
  sisters: ["🪨", "Seven chalk stacks standing in a row off the far western cliffs.", "Daytime", "Clear", "Far to the west, past the town."],
  grottoes: ["🕳️", "Sea caves cut into the chalk at the waterline.", "Daytime", "Calm", "Along the eastern cliffs."],
  bridge: ["🌉", "The coast road leaps the creek gorge on a tall bridge.", "Daytime", "Any", "Far east, where the creek meets the sea."],
  beachwreck: ["🚢", "A small coaster that ran aground in a storm years ago, now rusting on the sand.", "Daytime", "Any", "The beach just east of the river delta."],
  sailboats: ["⛵", "Weekend sailors tacking up and down the coast.", "Daytime", "A good breeze", "Several sail loops off the coast."],
  tourboat: ["🛥️", "The island tour boat on its loop around the palm islet.", "Daytime", "Any", "Around the palm islet."],
  ferry: ["⛴️", "The car ferry, crossing the whole bay and back.", "Any time", "Any", "It runs end to end along the coast."],
  tanker: ["🛢️", "A huge tanker on the shipping lane far offshore.", "Any time", "Clear", "Far out to sea. Zoom in."],
  coastguard: ["🚤", "The coast guard on patrol, blue lights flashing.", "Any time", "Any", "Patrols close inshore."],
  trawler: ["🎣", "A fishing trawler working its nets, trailed by gulls hoping for scraps.", "Any time", "Any", "Works a loop offshore of the harbor."],
  smallplane: ["🛩️", "A sightseeing plane circling the bay.", "Daytime", "Clear", "Look up over the bay."],
  balloon: ["🎈", "A hot-air balloon drifting over the cliffs on a still morning.", "Morning (6:30–11:30)", "Dry and calm", "Look inland, over the coast west of the harbor."],
  swimmers: ["🏊", "Swimmers off the beach in the harbor cove.", "Daytime", "Warm, calm", "The harbor cove beach."],
  surfers: ["🏄", "Surfers waiting for a set, then racing the breakers.", "Daytime", "Some swell", "Where the waves break on the sandy beaches."],
  sunbathers: ["🏖️", "Sunbathers and umbrellas along the sand.", "Daytime", "Sunny", "The sandy beaches."],
  reef: ["🪸", "Corals, sponges and rocks crowd the shallows under the cliffs.", "Daytime", "Clear water", "Shallow water under the cliffs."],
  wreck: ["⚓", "An old wooden wreck lying on the sea floor.", "Daytime", "Clear water", "Follow the clues."],
  sailboat: ["⛵", "A sunken sailboat, its mast still standing.", "Daytime", "Clear water", "Follow the clues."],
  freighter: ["🚢", "A rusted freighter, settled on the bottom.", "Daytime", "Any", "Follow the clues."],
  deepwreck: ["📡", "A wreck far too deep to see. Only sonar finds it.", "Any time", "Any", "Sonar only."],
  temple: ["🏛️", "The columns of a temple, drowned long ago.", "Daytime", "Clear water", "Follow the clues."],
  colossus: ["🗿", "A giant stone figure lying on the seabed.", "Daytime", "Clear water", "Follow the clues."],
  ruins: ["🏛️", "Tumbled stones on the summit of Goat Island.", "Daytime", "Any", "The top of Goat Island."],
  watcher: ["🗿", "A statue on Goat Island, one arm pointing out to sea…", "Daytime", "Any", "Where does it point?"],
  glow: ["✨", "A strange light beneath the eastern cliffs, only after dark.", "Night", "Any", "Something is down there."],
  biolum: ["💙", "Plankton that flash blue when disturbed. The bow wave and wake turn to blue fire.", "Dark nights", "Calm", "A calm, dark night in the bay east of the harbor. Keep moving."],
  bell: ["🔔", "A ship's bell, green with age.", "", "", "Recovered on a dive."],
  coin: ["🪙", "A coin from the sunken temple.", "", "", "Recovered on a dive."],
  logbook: ["📖", "A captain's logbook, sealed in oilskin.", "", "", "Recovered on a dive."],
  compass: ["🧭", "A brass compass that still points north.", "", "", "Recovered on a dive."],
  fragment1: ["💠", "A carved fragment of something larger.", "", "", "One of three."],
  fragment2: ["💠", "A carved fragment of something larger.", "", "", "One of three."],
  fragment3: ["💠", "A carved fragment of something larger.", "", "", "One of three."],
  crate: ["📦", "A cargo crate, washed up after a storm.", "After storms", "", "Search the beaches after a storm."],
  bottle: ["🍾", "A message in a bottle.", "After storms", "", "Search the beaches after a storm."],
  amphora: ["🏺", "An ancient amphora, thrown up by the waves.", "After storms", "", "Search the beaches after a storm."],
  sunset: ["🌅", "The sun sinking into the sea, setting the sky on fire.", "Sunset", "Mostly clear", "Face the sun as it touches the horizon."],
  rainbow: ["🌈", "Sun and showers at once: a bow opposite the sun.", "Day, sun not too high", "Passing showers", "Turn your back to the sun when it rains in sunshine."],
  rain: ["🌧️", "Rain hissing on the sea.", "Any time", "Rain", ""],
  storm: ["⛈️", "A storm: black clouds, lightning and a heavy sea.", "Any time", "Storm", "Stay close to the coast."],
  fog: ["🌫️", "A fog bank rolling in, swallowing the coast.", "Any time", "Fog", "Fog brings the whale close."],
  stars: ["✨", "A sky full of stars over the open sea.", "Night", "Clear", "Away from the town lights."],
  aurora: ["🌌", "Green curtains of light over the northern sky.", "Night", "Clear", "Look north, away from the land, on a clear night."],
  airliner: ["✈️", "An airliner far overhead, drawing a white contrail.", "Daytime", "Clear", "Look up. Zoom in."],
};

const RARITY = (v) => (v <= 80 ? "Common" : v <= 200 ? "Uncommon" : v <= 350 ? "Rare" : "Legendary");
const book = { tab: "All", sel: null, detail: false };

function bookIcon(id) {
  return (BOOK_INFO[id] || ["📷"])[0];
}
function bookCard(id) {
  const e = JOURNAL_BY_ID[id];
  const j = journal[id];
  const p = photo.bestOf(id);
  const tilt = ((id.charCodeAt(0) * 7 + id.length * 13) % 5) - 2;
  const sel = book.sel === id ? " sel" : "";
  if (!j.seen) {
    return `<button class="jb-card unknown${sel}" data-id="${id}" style="--r:${tilt * 0.4}deg"><div class="jb-pic">?</div><div class="jb-cap">???</div></button>`;
  }
  const pic = p && p.img ? `<img src="${p.img}" alt="">` : `<div class="jb-pic empty">${bookIcon(id)}</div>`;
  return `<button class="jb-card${sel}" data-id="${id}" style="--r:${tilt * 0.4}deg">${pic}<div class="jb-cap">${e.name}</div></button>`;
}

function renderBookLeft() {
  const found = JOURNAL.filter((e) => journal[e.id].seen).length;
  const shots = JOURNAL.reduce((n, e) => n + (journal[e.id].shots || 0), 0);
  const sections = book.tab === "All" ? BOOK_SECTIONS : BOOK_SECTIONS.filter((s) => s.name === book.tab);
  return `
    <div class="jb-head">
      <div class="jb-title">📷 Photo Journal</div>
      <div class="jb-stats">
        <div><span>Discovered</span>${found} / ${JOURNAL.length}</div>
        <div><span>Photos taken</span>${shots}</div>
        <div><span>Funds</span>$${expedition.funds.toLocaleString()}</div>
      </div>
    </div>
    ${sections
      .map((s) => {
        const n = s.ids.filter((id) => journal[id] && journal[id].seen).length;
        return `<div class="jb-section"><h3>${s.icon} ${s.name} <span>${n} / ${s.ids.length}</span></h3>
          <div class="jb-grid">${s.ids.filter((id) => journal[id]).map(bookCard).join("")}</div></div>`;
      })
      .join("")}`;
}

function stars(n) {
  return `<span class="jb-stars">${"★".repeat(n)}${"☆".repeat(Math.max(0, 4 - n))}</span>`;
}

function renderBookRight() {
  const id = book.sel;
  if (!id) return `<div class="jb-empty">Choose a photo on the left.<br><span>Press F to raise your camera, then click to shoot.</span></div>`;
  const e = JOURNAL_BY_ID[id];
  const j = journal[id];
  const sec = BOOK_SECTION_OF[id];
  const [icon, desc, time, weatherText, note] = BOOK_INFO[id] || ["📷", "", "", "", ""];
  const back = `<button class="jb-back" data-act="back">← Back</button>`;
  const conditions = `
    <div class="jb-box jb-cond"><h4>☀ Preferred conditions</h4>
      ${time ? `<div><span>Time</span>${time}</div>` : ""}
      ${weatherText ? `<div><span>Weather</span>${weatherText}</div>` : ""}
      <div><span>Rarity</span>${RARITY(e.value)}</div>
    </div>`;
  if (!j.seen) {
    return `${back}
      <div class="jb-detail-top"><div class="jb-big unknown">?</div>
        <div class="jb-info"><h2>${sec.icon} Not yet discovered</h2>
        <p>Something in <b>${sec.name.toLowerCase()}</b> is still missing from your journal.</p>
        <p class="jb-hint">${time || weatherText ? "A hint: the conditions on the right page may help." : ""}</p></div></div>
      <div class="jb-row">${conditions}</div>`;
  }
  const all = photo.photos.filter((p) => p.id === id);
  const best = photo.bestOf(id);
  const others = all.filter((p) => p !== best).slice(-4).reverse();
  const clue = CLUES[id];
  const related = sec.ids.filter((r) => r !== id && journal[r]).sort((a, b) => (journal[b].seen ? 1 : 0) - (journal[a].seen ? 1 : 0)).slice(0, 2);
  return `${back}
    <div class="jb-detail-top">
      <div class="jb-big">${best && best.img ? `<img src="${best.img}" alt="">` : `<div class="jb-pic empty">${icon}</div>`}</div>
      <div class="jb-info">
        <h2>${sec.icon} ${e.name}</h2>
        <p>${desc}</p>
        <table>
          <tr><td>First photographed</td><td>${j.first ? `Day ${j.first.day} · ${j.first.time}` : "—"}</td></tr>
          <tr><td>Times photographed</td><td>${j.shots || 0}</td></tr>
          <tr><td>Best photo value</td><td>${j.best ? `$${j.best.toLocaleString()}` : "—"}</td></tr>
          <tr><td>Best shot</td><td>${best ? `${stars(best.stars)} ${best.quality}` : "—"}</td></tr>
          <tr><td>Rarity</td><td><u>${RARITY(e.value)}</u></td></tr>
        </table>
      </div>
    </div>
    <div class="jb-shots">${
      others.length
        ? others
            .map((p) => `<figure>${p.img ? `<img src="${p.img}" alt="">` : `<div class="jb-pic empty">${icon}</div>`}<figcaption>Day ${p.day} ${p.time} ${stars(p.stars)}</figcaption></figure>`)
            .join("")
        : `<div class="jb-noshots">${best ? "Your other shots of this will appear here." : "No photo yet: raise your camera (F) next time you see it."}</div>`
    }</div>
    <div class="jb-row">
      <div class="jb-box jb-notes"><h4>✎ Notes</h4><p>${clue || note || ""}</p>${
        j.first ? `<p>First photographed on day ${j.first.day} at ${j.first.time}.</p>` : ""
      }</div>
      <div class="jb-box jb-loc"><h4>📍 Location</h4><canvas id="jb-map" width="300" height="190"></canvas></div>
    </div>
    <div class="jb-row">
      ${conditions}
      <div class="jb-box jb-related"><h4>🔗 Related discoveries</h4><div>${related
        .map((r) => {
          const rp = photo.bestOf(r);
          const seen = journal[r].seen;
          return `<button class="jb-rel" data-id="${r}">${
            seen && rp && rp.img ? `<img src="${rp.img}" alt="">` : `<div class="jb-pic empty">${seen ? bookIcon(r) : "?"}</div>`
          }<span>${seen ? JOURNAL_BY_ID[r].name : "???"}</span></button>`;
        })
        .join("")}</div></div>
    </div>`;
}

// A small chart of where this was photographed from (or where it is)
function drawBookMap(id) {
  const c = document.getElementById("jb-map");
  if (!c || !c.getContext) return;
  const g = c.getContext("2d");
  if (!g) return;
  const j = journal[id];
  const place = MAP_PLACES.find((p) => p.id === id);
  const spot = j.where || (place && { x: place.x, z: place.z });
  const W = c.width;
  const H = c.height;
  const span = 1800; // metres across
  const cx = spot ? spot.x : state.boat.x;
  const cz = spot ? spot.z : state.boat.z;
  const s = W / span;
  const toMap = (x, z) => [(x - cx) * s + W / 2, (z - cz) * s + H / 2];
  g.fillStyle = "#7fb1b8";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#d9c38f";
  g.beginPath();
  coastLine.forEach(([x, z], i) => (i ? g.lineTo(...toMap(x, z)) : g.moveTo(...toMap(x, z))));
  g.lineTo(W + 400, -400);
  g.lineTo(-400, -400);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(80, 60, 30, 0.55)";
  g.lineWidth = 1.2;
  g.beginPath();
  coastLine.forEach(([x, z], i) => (i ? g.lineTo(...toMap(x, z)) : g.moveTo(...toMap(x, z))));
  g.stroke();
  for (const I of ISLANDS) {
    g.beginPath();
    g.arc(...toMap(I.x, I.z), Math.max(2, I.R * s), 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // Paper grain and a faint grid, like a chart
  g.strokeStyle = "rgba(60, 50, 30, 0.12)";
  for (let x = 0; x < W; x += 30) g.strokeRect(x, -1, 30, H + 2);
  for (let y = 0; y < H; y += 30) g.strokeRect(-1, y, W + 2, 30);
  if (spot) {
    const [px, py] = toMap(spot.x, spot.z);
    g.fillStyle = "#e0402e";
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(px, py, 6, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.fillStyle = "rgba(50, 35, 20, 0.85)";
  g.font = "15px Kalam, cursive";
  g.fillText(j.where ? "Photographed from here" : place ? "Here" : "Anywhere along the coast", 8, H - 10);
}

function renderJournal() {
  if (!book.sel) {
    const newest = photo.photos.slice().reverse().find((p) => p.id && journal[p.id]);
    book.sel = newest ? newest.id : (JOURNAL.find((e) => journal[e.id].seen) || JOURNAL[0]).id;
  }
  const tabs = ["All", ...BOOK_SECTIONS.map((s) => s.name)];
  const iconOf = (t) => (t === "All" ? "▦" : BOOK_SECTIONS.find((s) => s.name === t).icon);
  journalEl.innerHTML = `
    <div class="jb-book${book.detail ? " detail" : ""}">
      <nav class="jb-tabs">${tabs
        .map((t) => `<button class="jb-tab${book.tab === t ? " on" : ""}" data-tab="${t}"><b>${iconOf(t)}</b><span>${t}</span></button>`)
        .join("")}</nav>
      <section class="jb-page jb-left">${renderBookLeft()}</section>
      <section class="jb-page jb-right">${renderBookRight()}</section>
      <button class="jb-close" data-act="close" aria-label="Close journal">✕</button>
    </div>
    <div class="jb-foot">J or Esc to close · Tab: all photos</div>`;
  drawBookMap(book.sel);
}

function toggleJournal(show = journalEl.classList.contains("hidden")) {
  if (show && photo.active) photo.exit();
  if (show) {
    book.detail = false;
    renderJournal();
  }
  journalEl.classList.toggle("hidden", !show);
}

journalEl.addEventListener("click", (e) => {
  const t = e.target.closest("[data-id],[data-tab],[data-act]");
  if (!t) return;
  if (t.dataset.tab) {
    book.tab = t.dataset.tab;
    journalEl.querySelector(".jb-left").innerHTML = renderBookLeft();
    journalEl.querySelectorAll(".jb-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === book.tab));
    journalEl.querySelector(".jb-left").scrollTop = 0;
    return;
  }
  if (t.dataset.act === "close") return toggleJournal(false);
  if (t.dataset.act === "back") {
    book.detail = false;
    journalEl.querySelector(".jb-book").classList.remove("detail");
    return;
  }
  if (t.dataset.id) {
    book.sel = t.dataset.id;
    book.detail = true;
    journalEl.querySelector(".jb-book").classList.add("detail");
    journalEl.querySelectorAll(".jb-card").forEach((b) => b.classList.toggle("sel", b.dataset.id === book.sel));
    const right = journalEl.querySelector(".jb-right");
    right.innerHTML = renderBookRight();
    right.scrollTop = 0;
    drawBookMap(book.sel);
  }
});
journalEl.addEventListener("pointerdown", (e) => e.stopPropagation());
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && !journalEl.classList.contains("hidden")) toggleJournal(false);
});
