# TODO

Following the game plan: Explore → Discover → Decide → Return → Upgrade → Explore farther.

## Now (next up)
- [ ] **Make the coastline look realistic** (v1.1's isn't there yet): real cliff shapes with overhangs and
      vertical faces, eroded rock detail, grassy cliff edges, scree and boulders at the foot, varied beaches
      (sand, pebbles), matching the reference photos (Twelve Apostles, Durdle Door, Big Sur, Rosh Hanikra)
- [ ] Play-test in a browser and on a phone; tune fuel, rewards, prices, fog and storm frequency
- [ ] More clues: rumours at the harbor, radio sightings during a trip
- [ ] Use the clues from washed-up finds in tasks (e.g. the Orla's cargo)

## Next
- [ ] **Beyond the edge of the map:** a new area to the east (the artifact's clue), reached with the
      long-range tank; stranger things the farther you go
- [ ] More rare wildlife: whales, orca, manta ray, sharks (some only with binoculars, some in fog)
- [ ] Hidden sea cave and an abandoned island structure
- [ ] Radio sightings that appear during a trip ("unusual signal near…")
- [ ] Expedition score breakdown and a nicer end-of-trip screen (photo gallery of the day)
- [ ] Artifact fragments hint at the next mystery chapter

## Later
- [ ] Photo mode (hide HUD, free camera) and saving photos
- [ ] Performance settings (cloud quality, water detail, reef density) for phones
- [ ] Settings menu (controls, volume, reset progress)

## Done
- [x] Project scaffold (HTML, CSS, JS game loop, input)
- [x] 3D water level with a controllable boat, sky and time of day
- [x] Wildlife, air and sea traffic, clouds, weather, wind, waves, aurora
- [x] Coast: cliffs, sea stacks, lighthouse, cove beach, river and swamp, clifftop town, islands, reefs
- [x] Realistic water: caustics, reflections, foam, see-through shallows, lapping waves
- [x] Swell rolls in toward the coast; breakers build up in the shallows and topple into foam on beaches and island shores
- [x] Core loop: daily expeditions with hints, fuel and time, docking, summary, forecast
- [x] Ocean Journal with visibility rules for spotting and photographing
- [x] Money from discoveries, first photos, relics and tasks; repeat photos pay nothing; white rings on new photo subjects
- [x] Boatyard with 8 upgrades that change what you can discover
- [x] Sonar, diving, relics and the first artifact mystery
- [x] Saved progress, Continue / New game
- [x] Minimap, free orbit camera, touch controls
- [x] Sound, all synthesized in code: sea, surf, wind, rain, thunder, engine, wildlife, horns, bell, swamp, traffic, UI, sonar, diving; music that follows time of day and weather; M to mute
- [x] Split game.js into 15 topic files under js/
- [x] 3D coral reefs and underwater rocks (js/reef.js); fixed the checkerboard (ripple pattern, blocky seabed noise, sin() hash)
- [x] Fog days: ~100 m visibility, foghorn and lighthouse beams to steer by, a humpback whale that only comes in fog
- [x] Storms as danger: the open sea (>450 m offshore) pushes an ordinary hull back; finds wash up on beaches the next day
- [x] Clues: gulls circle and dive over feeding fish, oily rainbow sheens over wrecks, the Watcher points at the strange light
- [x] Beach life goes home in the late afternoon (empty before dark) and stays away in storms and fog
- [x] v1.1: headlands and bays, regional rock colours, sea arch, Hidden Cove waterfall, Seven Sisters, chalk grottoes, coast road bridge, sailing limit
- [x] v1.2: fog covers everything (terrain and cliff haze, sky and clouds, lights, planes, waterfall)
- [x] v1.3: rain and storms close in on the land too (same distance haze as the water), and wet the ground
- [x] v1.4: reef fish swim individually: each follows the school at its own pace, turns ripple through it
- [x] v1.5: the journal scrolls; big map (G or 🗺️) with every discovered place labelled
- [x] v1.6: camera mode (F): first person on the foredeck with a handheld camera: mouse look, zoom, autofocus (R), shot quality, photo card and gallery (Tab); a far more detailed cabin-cruiser boat model
- [x] v1.7: camera mode: the mouse aims all the time (no dragging) and a click shoots instantly, so you can pan and shoot at once
- [x] v1.8: no water inside the boat (an invisible depth-only lid at gunwale height hides the sea inside the hull)
- [x] v1.9: closed the open top of the transom; dolphins stay 35–55 s and cruise just under the surface, flying fish glide 2–3 s, the whale stays up for five breaths and lingers longer
- [x] v2.0: boats sail about half as fast, the small plane circles slower, the airliner takes ~45 s to cross the sky (and comes a bit more often)
- [x] v2.1: see farther: boats, planes and animals fade out at ~3 km in clear air (was ~355 m); sighting ranges of animals, people, boats and island places raised 2–3× so zooming in can reach them
- [x] v2.2: 10 new photo subjects (orcas, blue shark, manta ray, cormorants, pelicans, trawler + gulls, hot-air balloon, stranded coaster, rainbow, glowing plankton); the journal is now a two-page photo book built from your own photos
- [x] v2.3: raising the camera (F) keeps facing the way you were already looking
- [x] v2.4: right click also puts the camera down
- [x] v2.5: jellyfish, floating debris, buoys, weather buoy, offshore oil rig, offshore wind farm and hilltop turbines (all photographable, buoys/rig/turbines solid); stars glitter and the aurora shimmers on the sea at night; new journal section "Man-made at sea"
- [x] v2.6: star reflections on the sea toned way down (fewer, fainter, mostly toward the horizon)
- [x] v2.7: telephoto upgrade now means zoom to 10× and 60% more photo range; photo quality counts how big the subject looks (zoom helps); description updated
- [x] v2.8 (coastline, first pass): near-vertical cliff walls with ledges, joints, buttresses, wave notch and overhanging lip; turf along the cliff tops; scree and fallen blocks at the foot; sea stacks without rings; pebble beaches under cliffs and a seaweed line on sandy ones
- [x] v2.9: cliff walls join up cleanly: no big buttresses sticking out, the wall is solid from every side, the turf ends at the rock lip and only shows from above
- [x] v3.0: the sea arch is one seamless piece of rock; the Hidden Cove waterfall pours over the cliff lip all the way down to the beach
- [x] v3.1: Esc settings menu (pauses the game): master/effects/ambience/music volume, boat speed, time-of-day speed, weather (forecast or fixed clear/cloudy/rain/storm/fog); saved in the browser
- [x] Fixes: stuck boat, water edges, zigzag waves (water drawn far-to-near; far ocean drawn before it), smoother cliff outline
