# Project status

Keep this file current. Claude reads it at the start of every session and updates it at the end.

## Where we are
- **Phase:** Phase 1 of `docs/ROADMAP.md` (the island map and region locks) is mostly done. See "Next step".
- **Open regions:** Grand Baie, Port Louis, and Flic en Flac with the west. The other five are locked and grey.
- **Two layers:** the whole island at 150 m per tile (for the island map and the locks), plus a detailed walkable map per region. Only the west has its detailed map so far (the Flic en Flac map from the starter engine).

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
- Grey regions on the in-game minimap and zoomed-out world map, and road barriers at region edges.
- The phone does not yet send its island tile (`ix`, `iy`) or region (`rg`): nothing in the game moves between regions yet. The server check is ready for when it does.
- Detailed walkable maps for Grand Baie and Port Louis (they are open on the island map but have nothing to walk around in yet).
- The game is still Flic en Flac inside (names, shops, partner code). The UPDATES versions in the starter were dated 2027, so the new entry uses 2027.03.01 to sort first.
- No hosting, domain or Railway service yet.

## Decisions made
- Launch regions: Grand Baie, Port Louis, and Flic en Flac (the west).
- Locked regions are grey and enforced by the server.
- Regions are drawn from seed points (each tile belongs to the nearest one). Move a seed in `regions.json` and rerun the map script to reshape a region.
- Graphics aim: stylized, polished, built one street at a time.

## Next step
1. Try the Island tab and the admin card on a real phone once deployed.
2. Grey regions and barriers on the minimap and world map; make the phone send `rg` when it changes map.
3. Build the Grand Baie detailed map (SPEC layout), then Phase 2 graphics on one street there.
4. Confirm hosting (Railway service, volume, domain).
