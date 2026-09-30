# Game State

_Last updated: 2026-09-30_

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
  town that lights up at night, three islands (Palm Islet, Seal Rock, Goat Island), coral reefs.
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
- **Saving:** progress is saved in the browser after each day and each purchase; Continue / New game.
- **Controls:** keyboard + mouse (drag to orbit, scroll to zoom), and touch (joystick, buttons, pinch).
- **Minimap:** coast, islands, river, town, home and lighthouse, gear overlays.

## File overview
| File | Purpose |
|------|---------|
| `index.html` | Page layout: canvas, HUD, overlays, journal, minimap, touch controls |
| `style.css` | HUD, overlays, boatyard, journal, touch controls, photo rings |
| `game.js` | Everything else: world, rendering, simulation, expeditions, journal, upgrades, saving |
| `assets/` | Unused so far (everything is procedural) |
| `GAME_STATE.md` | This file: the plan and where the project stands |
| `TODO.md` | What's next, following the game plan |

## Known issues / limits
- Not yet play-tested in a real browser or on a phone by the developer (logic is tested headlessly).
- Heavy on the GPU (volumetric clouds, water shader, big terrain); may be slow on weaker devices.
- Needs an internet connection the first time (Three.js r128 from a CDN).

## How to run
Open `index.html` in a browser. Progress saves in that browser (localStorage).
