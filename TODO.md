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
- [x] Fixes: stuck boat, water edges, zigzag waves (water drawn far-to-near; far ocean drawn before it), smoother cliff outline
