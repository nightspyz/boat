# Game State

_Version 3.3 · last updated 2026-10-01_

Each download is named with its version (`coastline-v1.0.zip`, `coastline-v1.1.zip`, …).

## Concept
A relaxing ocean exploration game that slowly turns into a mystery. You take a small boat out from
a harbor cove each day, with a task and a hint (never a quest marker), and fill your **Ocean Journal**
by spotting and photographing wildlife, places, boats, people, weather and relics. Every new discovery,
first photo and relic pays; the day's task pays a bigger reward. You spend it at the boatyard on gear
that changes *what* you can discover. The ocean itself is the challenge: fuel, daylight, fog and storms decide how far you dare to go.
Under it all, three fragments of an unknown artifact hint that this coast is not what it seems.

### The three loops (from the game plan)
- **30 seconds:** drive → spot something → approach → photograph / dive.
- **5–15 minutes:** one expedition: explore, make discoveries, decide how far to push, get home.
- **Hours:** earn money → upgrade the boat → reach and find new things → uncover the mystery.

### Design rules
- Give the player a reason to go somewhere; clues and hints, not markers.
- Money: you start with $0. New discoveries pay their value, a first photo pays half again, relics pay,
  and the day's task pays its reward. Repeat photos pay nothing. Everything is paid out when you dock.
- Upgrades change what you can discover, not just numbers ("I saw something I couldn't reach → upgrade → come back").
- No enemies: the sea, weather, fuel and nightfall provide the tension.
- Peaceful first, mysterious later.

## Current status
The core loop and the upgrade loop are playable and saved between sessions. The first mystery arc
(three artifact fragments) can be completed; it ends with a hook pointing east, "beyond the edge of the map".

## What works
- **World:** 3D ocean with Gerstner waves, foam, caustics and see-through shallows; limestone cliffs with
  sea stacks, a lighthouse, a sandy harbor cove, a river with two mouths and a reed swamp, a clifftop
  town that lights up at night, three islands (Palm Islet, Seal Rock, Goat Island), coral reefs with 3D corals,
  sea fans and boulders below the cliffs, in patches in the bay and around the islands.
- **Sky:** day/night cycle, volumetric clouds with shadows, weather (clear → cloudy → rain → storm)
  driving wind and waves, lightning, aurora, stars, moon.
- **Life:** dolphins (curious, then lose interest), reef fish schools, leaping fish, sea turtles, seals,
  goats, gulls; sailboats, tour boat, ferry, tanker, coast guard, airliners, a sightseeing plane;
  swimmers, surfers and sunbathers at the cove.
- **Expeditions:** daily task with hint and reward, fuel, clock (1 game minute = 1 s), dock at the pier
  to finish, towing if the tank runs dry, end-of-day summary and tomorrow's forecast.
- **Journal:** 51 entries across wildlife, coast & islands, underwater, ruins, mysteries, relics,
  people & boats, sky & weather. Spotting needs line of sight, range, light and clear weather.
- **Photos:** F photographs what is visible and framed; repeats are refused; white rings mark subjects
  you haven't photographed yet (pulsing when framed).
- **Boatyard (B):** binoculars, long-range tank, telephoto camera, marine radio (search area on the map),
  chartplotter (bigger map with discovered places), reinforced hull (storms), sonar, diving gear.
- **Diving (X):** recover relics at underwater sites; sonar finds a deep wreck you can't see.
- **Sound:** every sound is synthesized in code (Web Audio API, no audio files): sea and surf, wind, rain,
  thunder after lightning, an engine that follows the throttle and splutters on low fuel, gulls, seals, dolphins,
  swamp frogs, ferry horn, foghorn, town bell, siren, planes, a hum at the strange light, camera, chimes, sonar, diving,
  and soft music that changes with time of day and weather. Starts on the first key/tap; M or 🔊 mutes (saved).
- **Weather days:** clear, cloudy, rain, storm, and fog days (about 100 m visibility; follow the foghorn and
  the lighthouse beam home; a humpback whale only comes in close in fog). In storms, the swell more than ~450 m
  offshore drives an ordinary hull back (Goat Island and the shipping lanes are out of reach without the
  reinforced hull). The day after a storm, a crate, a message in a bottle or an amphora lie on the beaches.
- **Clues in the world:** gulls circle and dive over a shoal of feeding fish (leaping fish there); oily rainbow
  sheens give away the wrecks, even the deep one; the Watcher statue's arm points at the strange light (drawn on
  the map once found); washed-up finds and the logbook carry written hints.
- **Saving:** progress is saved in the browser after each day and each purchase; Continue / New game.
- **Controls:** keyboard + mouse (drag to orbit, scroll to zoom), and touch (joystick, buttons, pinch).
- **Minimap:** coast, islands, river, town, home and lighthouse, gear overlays.

## File overview
| File | Purpose |
|------|---------|
| `index.html` | Page layout: canvas, HUD, overlays, journal, minimap, touch controls |
| `style.css` | HUD, overlays, boatyard, journal, touch controls, photo rings |
| `js/` | The game, as plain scripts loaded in order by `index.html` (one shared global scope; no build step) |
| `js/core.js` | Setup, helpers, game state, keyboard input, wave + shore geometry shared by shaders and physics, islands |
| `js/sky.js` | Sky, clouds and time-of-day uniforms, sky dome |
| `js/water.js` | Ocean shader (waves, breakers, foam, caustics), far ocean, underwater look, lights |
| `js/coast.js` | Cliffs and beach terrain, river valley, sea stacks, shore rocks, lighthouse |
| `js/life.js` | Splashes, dolphins, fish, reef fish, birds, airplanes |
| `js/weather.js` | Rain, lightning, weather changes, day/night and weather lighting |
| `js/boat.js` | The player's boat: model, steering, collision, camera |
| `js/places.js` | Harbor, hidden places, islands, ruins and statues, underwater sites |
| `js/reef.js` | 3D corals and rocks on the sea floor (table, brain, staghorn, finger and soft corals, sea fans, boulders), grown around the camera |
| `js/landmarks.js` | Sea arch, Hidden Cove waterfall, chalk grottoes, coast road with bridge and cars |
| `js/town.js` | River water, reeds and trees, clifftop town, beach life |
| `js/traffic.js` | Sea and air traffic |
| `js/sights.js` | Extra photo subjects: orcas, blue shark, manta ray, cormorants, pelicans, fishing trawler with gulls, hot-air balloon, stranded coaster, rainbow, glowing plankton |
| `js/offshore.js` | Jellyfish swarms, floating debris, navigation buoys and a weather buoy, the offshore oil rig, wind turbines (offshore farm + eastern hills); SEA_OBSTACLES for boat collisions |
| `js/expedition.js` | Journal entries, daily tasks, money, boatyard, saving, briefing and summary screens |
| `js/discovery.js` | Toasts, spotting and photographing (visibility rules), journal screen, sonar and diving |
| `js/hud.js` | Photo highlights, minimap, touch controls |
| `js/photo.js` | Camera mode: first-person view from the foredeck, zoom, focus, shot quality, gallery |
| `js/menu.js` | Esc settings menu: volumes, boat speed, time speed, weather override (settings, WEATHER_PRESETS) |
| `js/journal.js` | The photo journal (J): a two-page book with section tabs, your best photo of each subject, facts, other shots, notes, location chart, conditions |
| `js/sound.js` | All sound, synthesized with the Web Audio API |
| `js/main.js` | Rendering, title screen, main loop (must load last) |
| `assets/` | Unused so far (everything is procedural) |
| `GAME_STATE.md` | This file: the plan and where the project stands |
| `TODO.md` | What's next, following the game plan |

## Known issues / limits
- Not yet play-tested in a real browser or on a phone by the developer (logic is tested headlessly).
- Heavy on the GPU (volumetric clouds, water shader, big terrain, up to ~650k reef triangles in the densest reef); may be slow on weaker devices.
- Needs an internet connection the first time (Three.js r128 from a CDN).

## How to run
Open `index.html` in a browser. Progress saves in that browser (localStorage).
The js/ files are plain scripts (not modules), so double-clicking `index.html` works without a local server.
When adding code, a file may only use things from files listed *before* it while it loads; inside functions
that run later (updates, events), anything goes.
