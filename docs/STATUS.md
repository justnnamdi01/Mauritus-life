# Project status

Keep this file current. Claude reads it at the start of every session and updates it at the end.

## Where we are
- **A new game, not Flic en Flac Life.** The world is now only Grand Baie, drawn from the real OpenStreetMap data (`tools/build-region.mjs` makes `game/public/grandbaie-map.js`): the bay, beach, coast road, the Bazaar, shopping centres, library, police station and place of worship, with 58 house plots inland. New players start there.
- **Open regions:** Grand Baie only. Port Louis and Flic en Flac are "coming soon" until their own maps are built with the same tool (their entries stay in `game/regions.json`).
- **Removed from the world:** the old Flic en Flac, Tamarin, Bambous, Trianon and Ebène buildings, houses, beach lots, Palm Beach, Tamarin villas, weekly parties, the community WhatsApp promo, and the partner businesses (Belle's Kitchen, A* Cutz, DevCon, Clawed by Taps) behind one switch (`PARTNERS_ON`, off). Halloween and the Treasure Hunt are off.
- The walkable world is one grid of 460 x 320 tiles. Rows 236-315 are Grand Baie; `HO` (232) marks where the old rows end. The old rows are unreachable and not drawn.

## Done, session 3 (2 Nov 2026)
- Grand Baie rebuilt from real map data; houses, apartments and the bus station placed from it. Landmarks keep their real public names; shops, hotels and restaurants get generic names so no real business is used.
- Renamed to Mauritius Life everywhere players see it; removed the old support phone number and community promo.
- Phone: Town map, world map and ride list show Grand Baie only. All 36 phone apps open without errors; both open shops work.
- Server: Port Louis and Flic en Flac locked; the last region with a walkable map cannot be closed; the phone reports its region correctly when indoors (bug found by the tests).

## Tested, session 3
- `game/test/regions.test.js`: all checks pass.
- Headless browser: new character starts in a Grand Baie house, walks out, all 36 apps open, both shops open and close, no page errors, daytime screenshots look right.

## Done, session 4 (2 Nov 2026)
- **14 places open in Grand Baie**, from one table (`GBKIND`, `GBNAMES`, `GBACTS` in `game/public/index.html`): Mauritian food and prices (dholl puri, faratha, gato piment, alouda, briyani, fish vindaye, baguette, samoussa), groceries, pads, medicine, haircuts, the library, a temple, the petrol station and Sega Bar. Names for generic shops are made up (Boutik Soleil, Resto Kreol...). Four jobs added: Bazaar, restaurant, bakery, fish market.
- Which building gets which template comes from its name in the map (`GBKIND`). Buildings without a template (electronics shop, phone shop, hardware shop, police station) stay "opening soon".
- Old place names in tasks and hints (Snack Chez Ram, Super U, Kafe Wifi...) now point to the Grand Baie place of the same kind (`OLDKIND`).
- **Guide rewritten**: 187 answers cut to 94 with no Flic en Flac/Tamarin/Bambous/Trianon/partner text, plus new Grand Baie answers. What's new updated.
- Starter goals changed: first shift, an hour at the library, save Rs 10,000. The Bambous mission is gone. HUD title, page descriptions and student role text no longer mention Flic en Flac.

## Tested, session 4
- Headless browser: every open place can be entered and left, food and groceries can be bought, all 36 apps open, the Guide and Goals open, no page errors. The Guide text has no old place names. Lock tests pass.

## Not done / known gaps, session 4
- Student role: classes at "Middlesex University" are gone (no building), so students only get the allowance and part-time shifts. Decide if students should exist or get a Grand Baie school.
- Prices, wages and rent are still the old game's numbers and are not retuned. Do an economy pass on paper before launch.
- Home tiers, the Government/Parliament apps, raids and heists still use the old game's wording and (for government) palace buildings that no longer exist. Check each before launch.
- No mascot yet, no new share image, icons still old.

## Not done / known gaps, session 3
- **Not tested on a real phone.** The 3D look in daylight was only checked in the headless browser.
- **The Guide still has many answers about Flic en Flac, Tamarin and Trianon** (the old game's places). They need rewriting, and so do the missions and tutorial text that mention old places.
- **Only 2 shops are open**, with the old Flic en Flac prices and menus. The other 16 places show "opening soon". Income is limited to those shifts, delivery, and the other apps for now.
- **Old code is still in `index.html`** (the old towns' data, partner modules, events). It is unreachable but makes the file big. Remove it (and split the file) before adding much.
- Port Louis and Flic en Flac need their maps built with `tools/build-region.mjs`.
- Real-world roads are 1-2 tiles wide and some streets are very close together; the town may feel crowded. Tune the map script if it does.

## History: session 2 (superseded by session 3: the hand-made Grand Baie and the intercity bus to Flic en Flac were replaced)
- **Grand Baie, first look** (`gbTile`, `GBSOON` in `game/public/index.html`): the SPEC layout. Lagoon, public beach, promenade, coast road, Sunset Boulevard with bars, a club, a cinema and food, the marina jetty, Marché square with the bus station, estate lanes, the red-roof chapel and the hills. Two shops are open: Dholl Puri Corner (reuses the snack menu and kitchen shifts) and Sega Bar (reuses the bar menu and shifts). The other 12 buildings are "opening soon" (signs, no doors yet), like Tamarin's.
- **Intercity bus:** Rs 75, from the Beach bus stop in Flic en Flac to Marché square and back. It refuses when the destination is locked. Taxis and cars cannot cross between the towns.
- **The server reads the region from the position** (`walkRegion` in `game/regions.js`), so a phone cannot lie about it. The "put back" message now includes x and y (bug fixed), and closing Grand Baie moves everyone inside back to Flic en Flac.
- **Maps:** a Grand Baie pin on the zoomed-out world map (grey and "not open yet" when locked; "guide me" leads to the bus stop), a Grand Baie label on the Town map, and the Island tab's "you" dot follows you.
- What's new entry, three Guide answers.

## Tested, session 2
- `game/test/regions.test.js`: 22 checks pass, including a phone that lies about its region and indoor positions.
- In the game page (headless): the bus goes there and back and charges Rs 75; a cross-town taxi is refused; the admin closes Grand Baie and the player is moved back to Flic en Flac; the bus and the map pin then show it as locked. No page errors.
- Grand Baie's layout drawn top-down from the game's own data: everything is reachable on foot from the bus stop, and there is no way to walk through to Tamarin.

## Not tested, session 2
- **The 3D look of Grand Baie on a real phone.** In the headless browser I saw the beach, promenade, road, buildings and name pills render correctly (screenshots at night). Not checked: daytime, the lagoon, the chapel and hills, or how it looks on a phone. (An earlier note here said the headless browser crashes: that was wrong. The game just waits at character creation.)
- Performance with the bigger world on a mid-range phone.

## History: session 1
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
1. Redeploy on Railway and walk around Grand Baie on a real phone.
2. Economy pass: retune prices, wages, rent and money sinks on paper; decide on students, government and raids.
3. Mascot, icons and share image.
4. Build Port Louis with `tools/build-region.mjs` (add it to `REGIONS`, set its entry point), then Flic en Flac.
4. Remove the dead old-world code and split `index.html` into modules.
5. Phase 2 graphics on one Grand Baie street; Phase 3 driving.
