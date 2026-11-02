# Project status

Keep this file current. Claude reads it at the start of every session and updates it at the end.

## Where we are
- **Phase:** Phase 1 of `docs/ROADMAP.md` is done apart from tests on a real phone. Region 1 (Grand Baie) has a first walkable version.
- **Open regions:** Grand Baie, Port Louis, and Flic en Flac with the west. The other five are locked and grey.
- **The walkable world:** one grid of 460 x 320 tiles. Rows 0-231 are the starter world (Flic en Flac, Tamarin, Bambous, Trianon). Rows 236-315 are Grand Baie (x 0-123), with deep sea all round. `HO` (232) marks the boundary; the server reads the region from the player's row.

## Done, session 2 (2 Nov 2026)
- **Grand Baie, first look** (`gbTile`, `GBSOON` in `game/public/index.html`): the SPEC layout. Lagoon, public beach, promenade, coast road, Sunset Boulevard with bars, a club, a cinema and food, the marina jetty, Marché square with the bus station, estate lanes, the red-roof chapel and the hills. Its 14 buildings are "opening soon" (signs, no doors yet), like Tamarin's.
- **Intercity bus:** Rs 75, from the Beach bus stop in Flic en Flac to Marché square and back. It refuses when the destination is locked. Taxis and cars cannot cross between the towns.
- **The server reads the region from the position** (`walkRegion` in `game/regions.js`), so a phone cannot lie about it. The "put back" message now includes x and y (bug fixed), and closing Grand Baie moves everyone inside back to Flic en Flac.
- **Maps:** a Grand Baie pin on the zoomed-out world map (grey and "not open yet" when locked; "guide me" leads to the bus stop), a Grand Baie label on the Town map, and the Island tab's "you" dot follows you.
- What's new entry, three Guide answers.

## Tested, session 2
- `game/test/regions.test.js`: 22 checks pass, including a phone that lies about its region and indoor positions.
- In the game page (headless): the bus goes there and back and charges Rs 75; a cross-town taxi is refused; the admin closes Grand Baie and the player is moved back to Flic en Flac; the bus and the map pin then show it as locked. No page errors.
- Grand Baie's layout drawn top-down from the game's own data: everything is reachable on foot from the bus stop, and there is no way to walk through to Tamarin.

## Not tested, session 2
- **The 3D look of Grand Baie.** The headless browser crashes when the game starts (it did before these changes too), so nobody has seen it in 3D yet. Please check it on a real phone: the ground, the buildings, the trees, the lagoon and the camera.
- Performance with the bigger world on a mid-range phone.

## Done (2 Nov 2026)
- OpenStreetMap extract of Mauritius in `tools/osm/` (dated 1 Nov 2026, uploaded by hand because the download sites drop the connection from the cloud sessions).
- `tools/build-island.mjs` turns it into `game/public/island.json`: 370 x 502 tiles, 81 KB. Its land area matches the real island (about 1,865 km²).
- `game/regions.json` (8 regions, seed points, colours) and `game/regions.js` (the server lock).
- The server refuses any position in a locked region, puts back the last good place and tells the phone. Closing a region moves everyone inside to a safe open place. A region with an opening date opens by itself.
- `/api/regions` for phones, `/api/admin/regions` and an "Island regions" card in the admin page (Game tab).
- Maps app now has an Island tab with open regions in colour, locked ones grey with "Coming soon", and the OpenStreetMap credit.
- What's new entry, two Guide answers, README credit.
- Fixed a starter bug: a line hidden inside a comment crashed the server when the admin page opened on a fresh save.

## Tested
- `game/test/regions.test.js`: 16 checks, all pass (locked map, locked island tile, jumps, off-map and rubbish coordinates, unknown region, admin key, open, close with a player inside, opening dates).
- Headless browser: the admin card opens a region; the game page draws the Island tab and receives the server's refusal with no page errors.

## Not done / not tested
- **Not tested on a real phone.**
- The Island tab inside the real phone screen (the browser test drew it in a test panel, because the phone needs a character first).
- Port Louis has no walkable map yet (it is open on the island map only).
- The game is still Flic en Flac inside (names, shops, partner code). The UPDATES versions in the starter were dated 2027, so the new entry uses 2027.03.01 to sort first.
- No hosting, domain or Railway service yet.

## Decisions made
- Launch regions: Grand Baie, Port Louis, and Flic en Flac (the west).
- Locked regions are grey and enforced by the server.
- Regions are drawn from seed points (each tile belongs to the nearest one). Move a seed in `regions.json` and rerun the map script to reshape a region.
- Graphics aim: stylized, polished, built one street at a time.

## Next step
1. Deploy to a test server and walk around Grand Baie on a real phone. Fix whatever looks wrong in 3D.
2. Open Grand Baie's first shops (jobs, food, the bar) so it has things to do. Pereybere Estate homes with 3-tile gaps (SPEC).
3. Phase 2 graphics on one Grand Baie street (Sunset Boulevard).
4. Port Louis is open on the island map but has no streets yet: build it, or lock it until it does.
5. Confirm hosting (Railway service, volume, domain).
