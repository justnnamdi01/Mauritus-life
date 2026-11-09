# Project status

Keep this file current. Claude reads it at the start of every session and updates it at the end.

## Where we are
- **A new game, not Flic en Flac Life.** The world is now only Grand Baie, drawn from the real OpenStreetMap data (`tools/build-region.mjs` makes `game/public/grandbaie-map.js`): the bay, beach, coast road, the Bazaar, shopping centres, library, police station and place of worship, with 58 house plots inland. New players start there.
- **Open regions:** Grand Baie, Port Louis and Flic en Flac (3 Nov). The other five are "coming soon" until their maps are built with `tools/build-region.mjs`.
- **Removed from the world:** the old Flic en Flac, Tamarin, Bambous, Trianon and Ebène buildings, houses, beach lots, Palm Beach, Tamarin villas, weekly parties, the community WhatsApp promo, and the partner businesses (Belle's Kitchen, A* Cutz, DevCon, Clawed by Taps) behind one switch (`PARTNERS_ON`, off). Halloween and the Treasure Hunt are off.
- The walkable world is one grid of 460 x 492 tiles: Grand Baie (rows 236-315), Port Louis (324-403) and Flic en Flac (412-491), with deep sea between. The engine reads one table, `WREG` in `game/public/index.html` (and `regions.js` on the server), so a new region is one more row plus a map from `tools/build-region.mjs`. The first game's old rows (0-231) are unreachable, not drawn, and the server treats them as no region.

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

## Rule added (6 Nov 2026): every action must be visible
Owner's rule, now in `CLAUDE.md`: actions are acted out by the character in the world, with people around, never just a menu line and a toast.

## Done, session 41 (9 Nov 2026): the Metro Express, with real tracks
- **`metro.js`:** the real railway line of Port Louis (OpenStreetMap) is now built in 3D: gravel bed, sleepers, two rails, overhead wire with poles, and a raised viaduct (concrete pillars, grey deck) climbing to each station platform, with a tunnel mouth where trains enter the map. Stations have a canopy, yellow platform edge line, glass back, a red sign, stairs, and people waiting on the platform.
- **Trains:** red-and-black three-car articulated light rail with bellows, a pantograph and a glowing amber destination sign (PORT LOUIS / CUREPIPE EXPRESS), replacing the old white trams. The timetable comes from the shared clock (same for everyone): a train arrives at Victoria, runs to Place d'Armes, reverses, calls at Victoria again and leaves through the tunnel; two trains, one every 60 seconds.
- **Ride:** Board at a platform while the doors are open (Rs 35, "tap-in" toast), sit in the carriage (seen in the world), look out of the window (drag to turn your head) at the city and its night lights, and get off at the other station. Skip ride arrives at once. The line and trains are drawn on the third-person mini-map.
- **Station list vs the map:** Rose Hill Central, Ébène Cybercity, Quatre Bornes / Trianon, Vacoas and Curepipe Central are named on the Metro map card as opening later. They are not built because those towns are not in the world yet.
- Tested in the browser: tracks and trains seen, the ride boards, charges Rs 35, rides and arrives at Place d'Armes; no page errors. The boat and metro ride cameras now blend independently of the frame rate.
- **Not done / not tested:** a real phone; more stations; chatting in the carriage uses the normal town chat; the old Rs 20 tram ticket was replaced by Rs 35.
- **Next step:** build Rose Hill Central (as a region, or a scenery strip the metro can run towards).

## Done, session 40 (9 Nov 2026): wider harbours, more boats
- **`tools/widen-water.mjs`:** run after `build-region.mjs` (`node widen-water.mjs grandbaie portlouis west --by=3`). Beach and grass tiles within 3 tiles of the water become shallow lagoon, but never within 2-3 tiles of roads, paving, buildings, houses, props, lots, bus stops or exits. Already applied: Grand Baie 67 tiles, Port Louis 443, Flic en Flac 126. If a region map is rebuilt, run the tool again.
- **Berth approach redesigned:** boats leave and arrive on short diagonal legs towards open water, instead of hugging the beach. A hull may touch the shore with a single corner sample (the real hulls are pointed). Sailing tours try up to eight waypoint pairs.
- **Fleet now (11 vessels):** Grand Baie: 2 ferries and a sailing tour (all rideable); Port Louis: a ferry (rideable), a container ship, a tanker and a cruise ship at anchor, a fishing boat; Flic en Flac: 2 pirogue trips (rideable) and a fishing boat. Six rideable boats in all. Still missing: a Grand Baie pirogue trip and fishing boat, the Port Louis tug and yacht (no valid route).
- Audit: 0 to 2 one-frame corner clips per vessel per cycle; the Port Louis ferry shows 9 of 240 frames (a corner brushing the shore on one leg). Ferry ride re-tested on the widened map (charged Rs 120, crossed, no errors).
- **Not done:** real phone; sailing hulls are small relative to the buildings (62%); the widened beach is a little narrower in Port Louis.
- **Next step:** a cross-town boat ride, and fill the last missing vessels by shaping the water by hand where a route is blocked.

## Done, session 39 (9 Nov 2026): boats that stay on the water, and rides you can spot
- **Land overlap fixed:** all hulls are drawn at 62% of their old size (`SC` in `harbour.js`) so they fit the thin harbours. Berths now require the whole hull to sit in water, and every route is checked against the full hull along its length (only a one-tile corner is tolerated in the last ten tiles by the pier). A vessel whose route fails is not built rather than sailing over land. Audit over a full cycle: 0 to 2 one-frame corner clips per vessel, none at dock.
- **Fleet now:** Grand Baie ferry (shuttle, rideable) and sailing tour (rideable); Port Louis ferry (shuttle, rideable) plus a container ship, tanker and cruise ship **at anchor** in the deepest water (the harbour is too narrow for them to sail); Flic en Flac two fishing boats. Not built because no valid route existed on the map: a second Grand Baie ferry, pirogues, tug and more fishing boats. The map's water would need widening for those.
- **Which one can I ride:** a label above each rideable boat ("🎟️ FERRY · Rs 120 · BOARDING" in green when you can get on, or when it is next at the pier), a sign on a post at each pier, and gold dots for rideable boats (grey for others) on the third-person mini-map.
- Tested: audit of every vessel through a full cycle, and a browser look at the label and sign. Not tested on a real phone, and the ride itself was last tested before this change (seat positions are scaled to the smaller hull).
- **Next step:** widen the harbour water in the map data so more vessels fit, and add a cross-town ride.

## Done, session 38 (9 Nov 2026): the first five minutes (instant drop, mirror, bucket list, late account, quiet session)
- **Instant drop (`onboard.js`):** new players skip the intro film and the forms. One screen: a name box (default `IslandRider_NN`) and **Jump In**. They get a random look (gender, skin, hair, outfit) and stand on the paving by the Caudan waterfront with the controls in their hands (the street is visible behind the card), and third-person view switches on. A small "Already have a character? Log in" link stays for returning players.
- **Style it in the world:** a mirror and clothes rack with a floating "Style Your Avatar" marker stand beside the spawn; it opens the Character Studio (wardrobe).
- **Island checklist instead of the First Day tutorial:** a small pinned pill with eight things in any order (ride a vehicle +500, chat +200, snack +100, style +300, walk into a building +100, open the phone +100, earn wages +500, something fun +300, bonus +400 for all). Server-paid, once each (`lvl.bucket`, tested). The old pink goal card is hidden (its goals stay in Phone → Goals). The old Auntie Marie First Day no longer starts.
- **Late account:** nothing at the start. The save prompt ("Don't lose your cash!") appears at the first Rs 2,500 earned, the first outfit or car bought, or when the tab is hidden or the mouse leaves the top of the window while they have something to lose.
- **Quiet first session:** `ONB.quiet()` (the first visit; a new session starts after 30 minutes away). In it the welcome card, daily reward, what's new, Port Louis story, gossip and news cards, the push-permission ask, the flat offer and level-up cards are held back (level-ups show a toast and fireworks). Day 2 (session 2) brings them back. Only a small floating WhatsApp icon shows, and only if the community post is switched on in admin.
- Tested: browser run of a brand-new player (Jump In, spawn, checklist payouts via phone and chat, no pop-ups, no page errors); `levels.test.js` has the checklist server checks.
- **Not done / not tested:** a real phone; a first visit that lasts past 30 minutes of inactivity counts as session 2; some older pop-ups I did not list may still show (anything not gated by the welcome flag or the card filter). The tab-close prompt can only run when the tab is hidden or the mouse leaves the page, because a browser does not let a page show its own box at that moment. Returning players keep the old creator via "Log in". Old characters keep their old tour if it was mid-way.
- **Follow-up (owner: "you forgot the female gender"):** Jump In now has a Man / Woman choice (random one is pre-selected, one tap to change), and the mirror/Character Studio can switch between man and woman at any time (it was locked after creation). Tested in the browser (woman at start, switch in the studio).
- **Next step:** guns, cartel and opps in Bambous (still to build), after you answer the two design questions.

## Done, session 37 (9 Nov 2026): third-person view, mini-map and the Bambous map
- **Third-person view (`tpv.js`):** a 🎥 button (and the V key) blends the camera smoothly (about a second, with a wider lens) from the overview to behind your shoulder, outdoors and in every room (the camera is kept inside the room). Move with W A S D or an on-screen stick, relative to the camera; drag anywhere to look around (a short tap still taps doors and things); Q and E turn. Your character turns smoothly to face where you walk. Buildings between you and the camera fade as before. The camera falls back to the overview by itself on rides, sitting, flying and boats.
- **Mini-map:** a round map at the top left (hidden indoors) drawn from the real tiles, turning with the camera, with roads, buildings, water, other players and an arrow for you. Tap to zoom. It also shows the town name.
- **Bambous:** a new walkable region built from OpenStreetMap (`bambous-map.js`, 26 places) after Flic en Flac, wired into the server layout, region list, island map, travel list, traffic and people tables. Open to everyone who can travel. Region test updated.
- **Not done (asked for, not built yet):** carrying guns in Bambous, joining a cartel, rival gangs ("opps") that shoot at you there with good-looking character models, and aim assist like GTA. Plan: server-owned membership, guns and damage; client enemies with proper outfits; lock-on aim. Needs your steer on the details (see the chat).
- Tested in the headless browser: switching on, moving, drag-look, going inside the terminal (works, no errors), mini-map. Not tested on a real phone: the stick position next to the chat pill, and drag-look on touch.
- **Next step:** guns, cartel and opps in Bambous (new session of work).

## Done, session 36 (9 Nov 2026): sugar cane, birds, and a new harbour system with boat rides
- **Sugar cane:** swaying cane stalks (drawn only near the player, new `life.js`) on every cane tile, and real cane fields painted on the highway regions and the inland edge of Flic en Flac. They were missing because the old cane code only covered the first game's rows.
- **Birds:** gulls, tropicbirds, parakeet flocks, fodies, bulbuls, kingfishers, pigeons and a hovering kestrel (28 birds, 3 draw calls each), day only, not in rain or indoors. The old birds were part of the Season 2 effects, which are still off.
- **Harbours (`harbour.js`, replaces the old random ship movement):** every vessel runs a program (dock, sail, hold, away) worked out from the shared clock, so all players see the same boats and nothing jerks. Routes come from a water-only search on the real map, smoothed into curves, with the berth chosen next to the town and a way out to open water. A timetable check keeps hulls apart. Fleet now: Grand Baie 2 ferries, a sailing tour, a pirogue trip; Port Louis a ferry, a container ship, a tanker, a cruise ship; Flic en Flac 2 pirogues and a fishing boat. Moored scenery boats that sat on land are skipped.
- **Rides:** ⛴️/⛵/🛶 signs at piers (Rs 120 / 250 / 80). You sit on deck (seen in the world), drag to look around, and get off when it docks. Tested end to end in the browser: charged Rs 120, crossed to the other pier, no page errors.
- **Not done / known limits:** the Port Louis and Grand Baie water is a thin band, so some vessels were dropped (a sailing tour and fishing boat in Grand Baie, a tug, fishing boat and yacht in Port Louis, a fishing boat and yacht in the west) and a few hulls still brush the beach edge near piers; two moving vessels can briefly cross paths (under 5% of the time). Passengers' gangway animation is reused from before and was not re-checked. No real-phone test. Fleet only runs when someone is in a town; there is no server clock offset (uses each phone's clock, so a wrong phone clock shows boats in a different place).
- **Next step:** widen the harbour water where boats were dropped, add a ride that crosses between towns, check a real phone.

## Done, session 35 (7 Nov 2026): the city lights up at night
- New `game/public/nightcity.js`, built once from the buildings and roads already in the world: street lamps (instanced poles and bulbs) along the roads of every walkable region with a warm pool of light on the ground and a halo at each bulb; about 2,700 lit windows on the buildings and houses, coming on from 17:30, thinning after midnight and mostly dark by 05:00 (each window has its own bedtime); glowing shop doors; coloured glow under the casino, games room, bars, market, bank and hotels, museum and oceanarium. At night the ambient light is lowered a little so the lights stand out. The far city beyond the clouds glows faintly too (`surround.js`).
- It follows the player's graphics setting (Low: plain windows and lamp halos only; Medium and High: pools and neon), and is independent of the old Season 2 effects switch (those effects, the old glow system, are still switched off until Season 2).
- Tested in the headless browser at 22:00 (clock moved by a test script): lamps, pools, lit windows, no page errors. What's new 2027.04.03.
- Not done / not tested: real phone performance (about 1,800 lamps and 16,000 window instances at most, two draw calls for windows and poles, but untested on weak phones); window glow is flat colour (no light spilling onto the street from windows); no shop-sign neon text; the moon and stars are the old ones.
- **Next step:** try on a real phone at night and tune brightness and counts, then the north strip of scenery or M2 materials.

## Done, session 34 (7 Nov 2026): business ads and the Fashion Show switched off
- **Business ads:** the partner switch `PARTNERS_ON` was already off (Belle's Kitchen, A* Cutz, DevCon and Clawed by Taps buildings, posters, rewards and chats). One leak was left: the server still posted the DevCon 2026 announcement (Rs 150,000) into town chat the first time it ran. It is now gated by `PARTNERS_ON` too. Row added to `game/ADS.md`.
- **Fashion Show removed for now:** new switch `FASHION_ON = false` in `server.js` (no weekly announcements, entries, votes or prizes; requests are refused politely) and in `index.html` (no Events card, countdown chip, offer, runway or lineup). The "Saturday Fashion Show" What's new line, the landing-page sentence and the About page bullet were removed. The clothes shops, wardrobe and Character Studio are untouched. To bring it back, set both switches to true.
- Tested: server tests and a browser smoke test (Events app opens, no page errors).
- Not done: the admin page still has the old business panels (private, harmless); if the live data file has the WhatsApp community promo turned on in the admin Promo card, that is separate and still on.

## Done, session 33 (7 Nov 2026): the rest of Port Louis, built but under clouds
- **What:** `tools/build-surround.mjs` reads the local OpenStreetMap file and writes `game/public/portlouis-surround.js`: the real city and land east of the Port Louis map (a strip 300 x 220 tiles, 14 m each, same tile frame as Port Louis): built-up ground, real roads, farmland, forest, parks. `game/public/surround.js` draws it as far scenery: a hilly ground (forest rises towards the Moka range), about 7,000 small houses in one batch, three drifting cloud layers that are clear at the walkable edge and full cover beyond it, and "Plaine Verte / Cité Martial / The Moka range - Opens soon" signs above the clouds.
- **Not accessible:** nothing changed in the walkable map. Tiles past x=119 are still solid on the phone, and a hacked position is pulled back. Take the clouds away by setting `SRX.on = false` (or later by building a real region from this data).
- Tested in the headless browser (cloud bank at the east edge, no page errors, scenery tiles solid). What's new 2027.04.02.
- **Not done / not tested:** only the strip east of Port Louis is built. The north (Pamplemousses), south (Pailles, Beau Bassin) and the rest of the island still need their own scenery strips, or real maps via `build-region.mjs`. No peaks or heights come from the OSM file (it has none here), so the hills are shaped from forest cover. Not tested on a real phone: the cloud planes and the house batch may need a lower detail setting on weak phones (not wired to the graphics setting). Real fix later: one rule to remove the clouds when a region opens.
- **Next step:** decide how much more land to build under clouds (north strip first?), then wire the cloud removal to the region opening switch.

## Done, session 32 (7 Nov 2026): housekeeping and level-up fireworks (level system step 4)
- **Housekeeping (a money sink with a comfort bonus):** server `flat.upkeep` (Rs 40 + Rs 40 a flat level, one week, safe to repeat, charged by the server's `paid`). While paid, comfort is x1.5 and a housekeeper in a teal uniform wipes around your flat (seen in the room). When it runs out nothing is lost.
- **Fireworks:** reaching a level bursts coloured sparks over your character, in the room or outdoors, together with paper and the Level-up card.
- Tested: `flat.test.js` (housekeeping cost, comfort x1.5, no double charge), levels and hustle tests; browser: housekeeper and sparks visible, no page errors. What's new 2027.04.01, a Guide answer.
- **Decided not to build the second builder slot yet:** the flat has one ladder of levels, so a second builder would have nothing different to build at the same time. It makes sense once there are separate rooms or materials (M2). Not done: neighbours cheering at a level-up, a reminder when housekeeping runs out (kept silent on purpose), a real phone test.
- **Next step:** M2 materials and the pacing script (retunes every price, time and XP number), or a real-phone playtest of everything so far.

## Done, session 31 (7 Nov 2026): Standing card and leaderboards (level system step 3)
- Server `game/levels.js`: boards Level, Flat, Richest, Helpful, Explorer in three scopes (Friends, Island, My region), never reset, top 10 plus "around you" and your rank; a player card (level, title, flat, builds helped, places, streak); a simple friends list (add/remove, up to 60; helping a friend build makes you both friends); hide-from-boards switch (hidden players are not listed and their card shows nothing).
- On the phone: new Leaderboards app (tabs, rows, tap a name for the card, add/remove friend), "My card" and "Leaderboards" buttons in the Standing app. What's new 2027.03.31, two Guide answers.
- Tested: `levels.test.js` (boards, order, friends scope, hide, card), browser: board and card render, no page errors.
- Not done: "My region" uses the region a player was last in; showcase picks (three proudest things) and weekly-free badges (Top 100, #1) are not built; the card has no Visit button yet; only one player in the browser test, so a many-player board was only tested on the server; no real phone.
- **Next step:** step 4: flat upkeep (a small money sink with a comfort bonus), more milestone unlocks (second builder slot), and the level-up fireworks scene; or M2 materials and the pacing script.

## Done, session 30 (7 Nov 2026): "Your day" goals and promotion XP (level system step 2)
- Server `game/levels.js`: three goals a day (one shift goal, one hustle or Ferris goal, one visits goal), chosen from the player id and the date, counted only from events the server accepted. Each goal pays 30 XP and Rs 150 by mail; all three pay 60 XP and Rs 400 and add to a days-in-a-row count (one missed day is forgiven). A promotion at the main job gives 60 XP. Walking into a place counts as a visit (no XP by itself; the first time ever still pays 25 XP).
- On screen: a 🎯 count on the level chip, "Goal done" float and card, confetti when all three are done, a "Your day" section at the top of the Standing app. What's new 2027.03.30, a Guide answer.
- Tested: `levels.test.js` (goals, same all day, completion pays Rs 150, promotion, visit), flat and hustle tests; browser: a real shift raised the goal and XP once, no page errors.
- Not done: a real phone test; the list does not yet have eat/sleep/wash goals; the job-rank ladder is still the old three titles (4 good shifts each); Standing card and leaderboards (step 3); upkeep and more unlocks (step 4).
- **Next step:** step 3: the Standing card and never-reset leaderboards (Friends, Island, My region).

## Done, session 29 (7 Nov 2026): player level "Island Standing" (docs/CORE.md section 3.8, step 1)
- **Phase:** CORE milestone, level system step 1. Server `game/levels.js` owns XP and levels (Level 1-50, placeholders for the curve). Phone only reports "a shift ended"; the server decides if it counts (kinds are a fixed list, per-day caps, gaps between, first-time bonus, one-off places, soft cap of 500 XP a day then half). Server also grants XP itself for starting/finishing flat upgrades and for helping friends (a quarter extra).
- Level-up pays a cash gift by mail (Rs 100 x level, Rs 500 x level every 5th) and sets a title (Newcomer to Legend). Flat upgrades 5 to 10 now need player level 5, 8, 10, 13, 16, 20 (the first four are open to everyone).
- **Seen in the world / on screen:** a level chip with a bar under the cash, a "+XP" float for each gain, paper falls and a Level-up card, the Standing phone app (level, ways to earn today, what opens, titles). Guide answers, What's new 2027.03.29, NEWAPPS entry.

## Tested, session 29
- `game/test/levels.test.js` all pass (XP rules, repeat-proof, caps, places once, flat gate, helper XP); flat and hustle tests still pass.
- Headless browser: chip, float, level-up card and the Standing app render with no page errors.

## Not tested / not done, session 29
- Not on a real phone. The level-up is paper and a card, not yet fireworks over the flat (**not yet visual**: add a world fireworks burst and neighbours cheering).
- Casino turns give no XP yet. "Your day" list, job rank and promotions (step 2), Standing card and never-reset leaderboards, friends and island (step 3), upkeep and milestone unlocks beyond flat levels (step 4) are not built.
- XP numbers and the curve are placeholders for the pacing script.
- **Next step:** step 2: "Your day" list and job rank.

## Done, session 28 (7 Nov 2026): M1, timed flat upgrades (docs/CORE.md milestone 1)
- **Phase:** CORE milestone M1. Server `game/upgrades.js` owns every timer and price (ten levels, Fresh paint Rs300/2 min up to Penthouse Rs250,000/7 days; placeholders until the pacing script). Start is idempotent and charged by the server (`paid`); finishing is settled lazily so it is true even when the player was offline; a "your flat is ready" push is scheduled for the finish time.
- **Speed-ups:** a finished shift or hustle shaves 2 min (max 6 per upgrade, one per 45 s); visiting friends can Help (5% off each, max 5; helper gets Rs 40, 5 a day; owner is notified).
- **Seen in the world:** builders in hard hats work in your flat while an upgrade runs (dust sheet, paint cans, ladder, WORK IN PROGRESS sign); a progress sprite over your door; the flat visibly changes at each level (wood panelling, lamps, window flowers, gallery, cove lighting, hanging plants and shelves, chandelier, mirror and slats, smart-home glow, gold penthouse with your name). A "Flat upgrades" station in your home and a "Help build" station in friends' homes. Ready moment: card and "Show me" camera sweep. Hustles app has a flat card. Comfort bonus +3% per level to rest at home.
- Guide answers and What's new entry 2027.03.28 added.

## Tested, session 28
- `game/test/flat.test.js` all pass; regions, capital and hustle tests still pass.
- Headless browser: station appears, start charges Rs 300, builders and levels 1, 3, 6, 10 render, ready card appears, no page errors.

## Not tested / not done, session 28
- Not tested on a real phone; real push delivery not tested (needs PUSH_CONTACT on the live site).
- Not browser-tested: friend Help station in a visited home, speed-up after a shift, the door sprite from outside, camera sweep.
- Prices and times are placeholders. M2 materials, M3 missions, M4 business, M5 crew not built.
- **Next step:** M2 (materials and the pacing script), or real-phone test of M1 first.

## Done, session 27 (7 Nov 2026): the Character Studio (the owner's reference screen)
- A new full-screen **Character Studio** (`game/public/studio.js`) in the style of the reference image: a big 3D preview of your character in a room (blinds, wall, floor) that you **turn with your finger** and that zooms to the part you are choosing (head, top, legs, shoes); a dark panel below with **tabs** (Hair, Tops, Bottoms, Shoes, Colours, You), a **rarity** filter, a sort menu and a man/woman switch, a **grid of cards** each with a little 3D picture of the piece on your character, a price tag, a rarity gem and a green tick when selected; a banner with the name and price of what you just tried; **Cancel** and a yellow **Start living / Buy for Rs X** button. A **Surprise me** button picks a random look.
- **At the start** it replaces the old "Who are you in Mauritius?" screen (the old one stays as a fallback when 3D is not available). Pieces up to Rs 700 are free starter picks; dearer ones show a lock and a price (unlock in the Wardrobe). Name, status and course are in the "You" tab; "Already playing? Log in" is there too. Finishing runs exactly the old start-up steps (money, rent, owned starting clothes, traits, account, tour).
- **In the game**: Phone → Wardrobe → "Open the Character Studio" opens the same screen in buy mode: try on anything, see the total, buy it all in one tap (money, ownership and style are updated); Cancel puts your look back. Hair colour is bought here too; skin tone and gender are chosen only when you start.
- Tested in the headless browser: new player flow (open, thumbnails render, pick, empty name refused, name saved, character made, starting clothes owned), every tab, a woman's set, the Wardrobe mode (try on a Rs 3,500 jacket, Cancel restores the look and the money, buy takes the money and keeps the jacket). No page errors.
- Not done: shades, caps, bags, jewellery, nails and saved outfits are still in the old Wardrobe tabs (the studio covers hair, tops, bottoms, shoes and hair colour); skin and sex surgery as a paid "Clinic" tab (the reference has one); rarity is by price for now; the 3D thumbnails are made one at a time (about a second each on a slow machine); not tested on a real phone.

## Done, session 26 (7 Nov 2026): the Ferris wheel is a seat, not a menu
- The ride now works like sitting on a bench: your character sits on a bench inside an **open gondola with a canopy**, the camera settles beside you (the same easing as sitting) and the wheel takes you **once round, slowly (60 seconds)**; you **drag the screen to look around** (turn left and right, up and down), with a gentle sway. "Get off" stops early with no charge. Code: `HUX.ferris`, `HUX.rideCam`, the drag listeners in `hustles.js`; the new open gondola in `index.html`.
- Tested in the headless browser: the rider walks to the wheel, sits, is carried up (gondola height 1.8 to about 6 in the part of the turn the slow test machine reached), a drag turns the view (screenshots before and after show the cabin, the rider, the bay and the town), and the ride ends and pays. Not tested: a full minute and a full turn on a fast machine, touch dragging on a real phone, and the view at the top (the test machine is too slow to reach it).

## Done, session 25 (7 Nov 2026): one main job, side hustles, notifications, the tour places made useful
- **One main job** (`game/public/hustles.js`): the first shift asks "Make this your career?". A career gets full pay and promotions; every other workplace is an odd job at 55% pay, 3 a day, no promotion; change career after 3 days. Shown in the new **Hustles** phone app. (The old phone "Jobs" careers from Flic en Flac Life still exist beside it; unify later.)
- **Side hustles** (server `game/hustle.js`, tested in `game/test/hustle.test.js`): gato piment round, fishing off the quay, busking at the stage. The server charges the stake, times the round, enforces hours, cooldown, a per-hustle daily cap and a Rs 4,500 daily cap, decides what bites, and pays by mail. Acted out in the street: a basket on a round of Port Louis with buyers, a rod and bobber with Oncle Jean fishing beside you, a stage with a dancing crowd. Places: a basket at the terminal, a fishing spot on the quay, the stage menu.
- **Ferris wheel for real**: you climb into a gondola and the camera rises with it.
- **Notifications** (server `game/notify.js`, `game/public/sw.js`, settings in the Alerts app): web push with VAPID keys kept in the data file; at most 2 a day, none 23:00-07:00, none while playing; kinds: daily reward (08:30), tonight's sega (16:45), friend joined (at once; wired to the invite bonus), and `schedule()` for upgrades later; the player can switch each kind off and send a test; a one-time ask after the first good moment. Adds the `web-push` dependency.
- **Today in Port Louis** in the Hustles app: flat, terminal, wheel, stage, quay with live status and arrows. The stage roof is now an open frame so you can see the singer.
- Core design updated: `docs/CORE.md` sections 3.6, 3.7 and 5.3b.

## Tested, session 25
- `game/test/hustle.test.js` (all pass): prices, hours, cooldown, caps, repeat-safe start and finish, no early finish, region rule, busking hours (a second server at 19:00), the server decides the catch; notifications: public key, bad subscription refused, register, test, no spam, two a day, nothing while playing, switch a kind off, switch all off, remove devices, quiet hours.
- Headless browser: career card on the first shift; gato, fishing and busking each walk, act and are paid by the server with no page errors; the Hustles app lists everything.
- Not tested: a real push to a real phone (the tests record instead of sending, and no browser here can receive push); the Ferris wheel gondola ride was run once but its screenshots were not reviewed; real-phone speed.

## Not done / next, session 25
- Needs on the live site: an environment variable `PUSH_CONTACT` (`mailto:you@yourdomain`). Push to iPhones works only after "Add to Home Screen".
- Build next: the timed upgrades (M1) will use `NOTIFY.schedule()`. More hustles (watch the cars, phone repair, tutoring). Odd-job and hustle money is still client-trusted for shifts (the hustles are server-paid).
- Still not visual: the courier dash, market selling, barber chair and shop buying.

## Written, session 24 (7 Nov 2026): the core design
- `docs/CORE.md`: who we make it for (Mauritians 15 to 30 on phones), the four feelings it must give, the five loops (act, session, day, week, season), the Clash side (the flat, the business and skills growing on real timers with builder slots, materials from different jobs, friendly raids), the GTA side (the Zistwar campaign in three Acts, the mission shape, ten sample missions for Act 1, the cast and loyalty, the free-roam island), the stickiness patterns with their guardrails, the first 15 minutes minute by minute, the return schedule, Crew, the build order M1 to M7 with a done-test each, the data the server needs, what we already have, and five questions for the owner.
- No code. **Next step:** the owner reads `docs/CORE.md` and answers its five questions; then M1 (timed flat upgrades on the server, the Home bar, the Today panel).

## Done, session 23 (7 Nov 2026): the casino and the Games Room played in the room
- **Casino** (`wk-casino.js`): a red-carpet room with chandeliers, a roulette table with a real wheel and ball (spins while the server decides, settles on the number it drew), a blackjack table that shows the real cards, eight slot machines whose reels roll and stop on the symbols the server drew, a cashier's cage, a bar, dealers, gamblers and a waitress. Tapping a table walks your character there (stand and push chips, sit at the table, sit at the machine) and opens the game as a bottom sheet so the room stays visible above. Walking away or closing the sheet ends the game. The server still decides every result; the room only reads what the panel already received.
- **Games Room** (`wk-arcade.js`): cabinets, racing seats, a claw machine with a moving claw, a dance mat with flashing tiles, a prize and juice counter, teens playing. **Bug found and fixed:** the Games Room's actions had never been attached to the building (the table of shop actions was built before they were defined), so it offered nothing. It does now.
- Engine: `actSpots` (a post for ordinary actions, not only jobs), `games` (seats for the casino), `ticks` (per-frame animations); the camera zooms in while you play or work.

## Tested, session 23
- Headless browser: roulette, slots and blackjack each walk to their place and open the sheet; the wheel spins while a spin is pending, the ball settles on the number, the cards appear on the table, the reels show the drawn symbols (these three states were forced on the page, because the test server does not let a teleported test player bet); racing, claw, dance mat and juice each walk to their place and play with the right pose; no page errors.
- A script checks that every post, seat and station can be reached (the 0.28-tile body does not touch furniture); one tile was moved.
- `game/test/regions.test.js` passes.

## Not tested / not done, session 23
- A real bet through the room (the casino server tests still pass, but the full walk, bet, win and walk-away flow was not played end to end by a real player).
- Not on a real phone. The Games Room games are timed menu actions (Rs 40 to 80); there is no skill in them yet.
- The prize counter gives nothing yet.

## Done, session 22 (6 Nov 2026): every job in its own real workplace
- **Phase:** launch build, Port Louis polish; this is the owner's visual rule applied to jobs. Eight workplaces, one for each kind of building where your three open towns have a job: restaurant (kitchen, pass with heat lamps, dining room, host stand), bank (vault, teller windows, queue lane, loans desks, manager's glass office, ATMs), bakery (brick oven, kneading table, display counter), bar (back bar, taps, stools, sega stage), street-food shop (tawa, rolling table, high tables), supermarket (fridges, three aisles, two checkouts, clothes corner), Central Market (striped stalls, lorry and crates, bunting) and Victoria Urban Terminal (ticket booths, departures board, two real buses, food court, benches).
- How it works: `game/public/workplaces.js` is the engine (3D building blocks, a timeline for every co-worker and customer, a spot for you by job level); one file per workplace (`wk-resto.js`, `wk-bank.js`, `wk-bakery.js`, `wk-bar.js`, `wk-dholl.js`, `wk-mall.js`, `wk-bazar.js`, `wk-terminal.js`); `wk-init.js` applies them to every matching building (`ROOMDEF`, `ROOM`). Hooks in `index.html`: `poseFor` (your post), `startAction` (you walk to your post first; a shift now plays for 18 s so it can be watched, and you walk back out after), the room draw (`WKX.draw`), the indoor camera (fits big rooms on a phone; closer while you work), `isSolid` (furniture blocks tiles) and new poses (wash, chop, knead, pour, stack, call, carry, serve, scan, wipe, stand) with things people hold (tray, plate, crate, box, bread, basket, suitcase, ticket, bottle, papers) in `applyPose` / `propSet`.
- The student part-time jobs (Stack shelves, Help on a stall) use the same posts. Which post you get depends on your promotion level (dishwasher at the sink, then cook at the stove; teller, then loans officer, then manager).

## Tested, session 22
- Headless browser: every workplace opens, draws its staff and customers and starts its shift with no page errors; screenshots of all eight.
- A script walks every co-worker and customer loop for each workplace and checks none passes through furniture or walls, and that every post and station stands on free floor (all clear after fixes).
- Full cycle on the bank and the restaurant: character walks to the post, works 18 s, is paid, and walks back toward the door.

## Not tested / not done, session 22
- Not on a real phone; the rooms are drawn small on a portrait screen (pinch to zoom). Rooms are heavier to draw than before (up to 17 people).
- Jobs that exist only in the closed old world (fast-food crews, fish market, fashion store, beach club, pub, golf, court clerk, dive and surf school, resort, freelance coder) have no workplace yet: build them when those towns open.
- Still not visual: the casino, arcade, courier dash, street-market selling, barber, shopping, the Ferris wheel and the stage (see the list below). Customers never talk to you at your post and the tills do not react to your work yet.
- The shift is a stationary pose; no one is handed anything and the dishes, bread or cash do not change while you work.

**Still not visual (next, in this order):**
1. Courier dash, market selling, barber chair, shop buying: menu or card only, no character at a machine, table or counter. (The casino and the Games Room are done.)
2. Sitting is only on benches; chairs, café tables and seats in buses and trains are not seats yet.
3. Ferris wheel and stage: the action is a menu line; the player should sit in a gondola or stand in the crowd.
4. Eating and drinking have poses, but food is not shown on the table.

## Done, session 21d (6 Nov 2026): ships that dock, load and sail off
- Ships now live a cycle: sail in from the open ocean, dock at a berth of their own in the lagoon beside the shore, stop (cruise 46 s, ferry 34 s, cargo and tanker 40 s, small boats 26 s), sail out and vanish over the horizon, stay away 35 to 145 s, return. Every lane has one ship. Docked ships put out a gangway; cruise ships, ferries, fishing boats, pirogues and yachts unload and load passengers (`PAX`, using the same looks as the street crowd). Ships wait for any ship in front of them, pass head-on traffic starboard to starboard (small sideways offset), and wait for ships that are docked or stopped; a real deadlock is broken after 20 s. Code: the ships block in `game/public/index.html` (`shipPath`, `shipsStep`, `shipBlocked`, `paxAdd`).
- Graphics: hulls have a sheer and a raised rim; windows on every deck, funnels with bands, lifeboats, pool, container cranes, tanker pipes and crane, tug fenders, curved yacht sails, a flag on the fishing boat, red/green/white navigation lights that come on at night (`R.night`).
- Bug found and fixed on the way: my helper `nearestLand` overwrote an existing function of the same name (the stuck-on-land rescue); mine is now `shoreNear`.
- Tested in the headless browser by running the ship simulation for 3,000 game seconds near Port Louis: all 14 ships dock, passengers unload and board (24 each way), no page errors. Screenshots show a cruise ship at its berth with the gangway and a walker on it.
- Not good enough yet: in the busy Port Louis harbour the cargo ship, tanker and cruise ship still overlap briefly about 4% of simulated steps when their approaches cross at the berths (a hull-overlap test counted 251 of 6,000 steps). Port Louis has only three lanes, so no tug or fishing boat sails there. Not checked on a real phone; ships far from the player move three times faster, and the open-sea edge fade relies on fog.

## Done, session 21c (6 Nov 2026): sit down and chill
- Benches are now seats: Port Louis' own benches, four new ones by the stage and the Ferris wheel, and one at every town's bus station. Tap a bench, choose "Sit and watch the world": the character sits (existing `sit` pose) and the camera drifts to a low third-person view behind them, slowly swinging side to side (`SIT`, `sitStart`, `sitCam` in `index.html`). Energy and mood creep up every 3 seconds. "Stand up", tapping the ground, walking or starting anything else ends it, and the camera eases back.
- Tested in the headless browser: sitting on a Port Louis bench gives the sit pose, the camera blends in (k 0.2 to 0.8) and back out, needs rise, no page errors; the screenshot shows the third-person view behind the seated character.
- Not tested: Grand Baie and Flic en Flac bus-station benches (placed at a fixed offset from the stop, so one may sit on a bad tile), seating on real phones, and a longer sit with other players watching.

## Done, session 21b (6 Nov 2026): Chapter 1, the first step outside
- When a new player first leaves their Port Louis flat, a skippable camera tour (about 12 s, with captions) shows the town: the flat, Victoria Terminal, the waterfront, then a red suitcase left by the stage. A card offers "Go and find it" (glowing arrows). Pick it up (walk onto the gold ring), take it to Guide Anita at the terminal: lunch box (+1 meal), a little fun, and a tip about the courier job and the Island Pass. No money is paid by the phone. Code: `STORY`, `storyMaybe`, `storyCam`, `storyTick` in `game/public/index.html`; progress is `s.story` (0 not started, 1 suitcase out, 2 carrying it, 3 done), so a reload resumes. It waits while another card is open and only starts for players at goal 0 living in a Victoria Heights flat.
- Tested in the headless browser: tour starts on the first exit, ends or skips into the card, picking up and returning the suitcase moves `s.story` 1, 2, 3 and gives the meal; no page errors.
- Not tested: the headless screenshots did not capture the caption or the moving camera (the frame rate is about 1 fps and the picture lagged), so how the tour looks is unchecked. Not on a real phone.

## Done, session 21 (6 Nov 2026): everyone starts in Port Louis, the Island Pass, a fun hub
- **Phase:** launch build, Port Louis polish. New players start in Port Louis (`DEFAULT_RG` and `spawn()` in `regions.js`, the first-presence rule in `server.js`), living in a flat at **Victoria Heights Flats** (a building in the Port Louis map; flats are addresses after the Grand Baie plots, `FLAT_BASE`). The Players' Estate in Grand Baie is a place to move to.
- **Island Pass** (`capital.js`, `pass.state` / `pass.buy`, Rs 5,000, sold only in Port Louis, safe to repeat). The server refuses leaving Port Louis on foot (`region.locked` with `why: "pass"`) and refuses `road.start` without it. Everybody who already had a character when this shipped is given the pass once (`db.capital.cutover`), so nobody loses the island. Client: `passOffer` from the terminal menu, the Rides button, and the travel menu; a starter goal "Buy the Island Pass" sits before "Save up Rs 10,000".
- **Fun hub:** a Ferris wheel (turns, lit at night, Rs 120 or Rs 200 with a friend), a Waterfront stage with a band that dances from 17:00 (watch, dance, tip), a Games Room (racing, claw machine, dance mat, juice), and warm string lights on Port Louis lamps after dark. Map rebuilt with `tools/build-region.mjs` (flats, Games Room, wheel and stage placed on free paved ground) and both highways rebuilt.
- UPDATES `2027.03.22`, Guide answers (where to start, what to do in Port Louis).

## Tested, session 21
- `game/test/regions.test.js` (all pass): new player starts in Port Louis; leaving without the pass is refused on foot and by trip; a player with Rs 2,000 cannot buy it; it costs Rs 5,000 and buying twice charges nothing; with it a taxi to Grand Baie works; the old road, speed and closing rules still hold.
- `game/test/capital.test.js` (all pass), now starting in Port Louis.
- Existing players are given the pass: checked against a data file with one old player.
- Headless browser: a new player appears at the flat door in Port Louis with no page errors; Ferris wheel and stage drawn; the server refuses a trip without the pass and sells it for Rs 5,000.

## Not tested / not done, session 21
- Not on a real phone. The pass offer menu was opened in the browser but the screenshot caught it mid-fade, so its look is unchecked.
- The wheel and stage are drawn and offer actions, but the band is three simple dancers (no singing sound), and the wheel ride is a menu action (you do not sit in a gondola).
- Money for the pass, rides and games is applied on the phone like other purchases (the server only checks the saved balance for the pass).
- No test that a returning mid-game player's quest list shifts correctly (one new goal was inserted at position 6).

## Next step (session 22)
Real-phone check of the new start (flat door, Ferris wheel, stage at 17:00), then retune the first hour: Rs 2,500 start, shift pay and the Rs 5,000 pass price (see docs/ECONOMY.md).

## Done, session 20 (6 Nov 2026): simpler discovery, rides you can watch, a better sea with ships
- **Simplified (you asked for less):** removed the arrival card, the new-in-town checklist (and its server payments, `zone.state`) and the extra name tags I had added. Kept: the coloured rings and icons on the ground, the 🧭 City Pulse, the arrow trail and the town guides. The original name labels are untouched.
- **Rides you can watch (`startWorldTrip`, `tripRoute`):** a bus, taxi or your own car trip to another town now drives the vehicle through the town, along the real highway and into the next town (the server still sells the ticket and times the arrival; trips last 32 to 55 s, `journeySecs` in `roads.js`). The camera follows; you can reload mid-ride. Tested from Grand Baie to Port Louis with the server watching: no refusals, arrives at the stop.
- **Drive your own car (`driveOn`, `parkCar`):** with a car owned or rented, the Ride button offers *Drive your car*: you steer it yourself at about 11 tiles a second on any road, across the highways, to any open town; the same button parks it. The server's highway speed limit still applies (tested: drove onto the highway with no refusal).
- **Ocean:** found why it looked flat: the ground picture painted the deep sea over the animated water, and the water plane did not even reach the south of the map. Deep-sea tiles are now cut out so the real water (waves, sky reflection, sun glint) shows through, the plane covers the whole world, the shimmer is calmer, and lagoon tiles shade from pale turquoise at the shore to deeper blue with a soft foam edge (`lagoonTile`).
- **Ships (`SHIP_KINDS`, `shipsStep`):** 15 ships in the three towns on straight lanes found in open water: container ship, tanker, cruise ship (Port Louis); catamaran ferries, yachts, a fishing boat (Grand Baie); fishing boats, pirogues, a yacht (Flic en Flac). Real hull outlines (pointed bow, squared stern, two-colour waterline), containers, bridges, funnels, sails, a wake behind each, bobbing and rolling, a slow turn at the end of the lane. Built only when within 90 tiles of you.
- Tested: server tests (trip waits updated for the longer trips), the rides and the drive in the browser, the new sea and a ship in each town. **Not tested:** a real phone (frame rate with the sea, ships and traffic); the ships' wakes up close; boarding a ship (they are scenery).

## Done, session 19 (6 Nov 2026): never lost in a new town
- **Zone arrival card:** the welcome card now shows the town's three main things to do (`CITY.*.loops`) for about 5 seconds, the first time you enter each town and whenever you cross into one.
- **World beacons (`bcnTick`):** a glowing coloured ring on the ground and a turning icon over every interactive place in the three towns (89 spots): green (and "Rs") = work, gold = shops, pink = food and fun, blue = travel (bus stations, the Metro, Gare du Nord). Rings pulse and show within 42 tiles. **Name tags** (DOM pills projected from the 3D position, scaled and faded by distance) on the 7 nearest places. The colour rule is in `BCN_KIND` (building kind to colour, icon, what it is and what you get).
- **City Pulse (🧭 button and a phone app, in `NEWAPPS`):** every town, sorted with yours first, with the live player count (and in Port Louis how many are at Caudan, Place d'Armes, Immigration Square, Chinatown and the terminal), and the list of things to do with what you get. Tap one in your town to lay a trail of glowing chevrons (`chevTick`) from your feet to its door; tap one in another town to open the travel menu. Counts come from the server (`zone.pulse`, from tracked positions).
- **New in town checklist (server-paid):** three places per town (`landmarksOf` in `capital.js`: Port Louis = Caudan, Place d'Armes, Chinatown; Grand Baie and Flic en Flac = three places from the town map). The server watches your tracked position (within 7 tiles) and pays **Rs 100 each plus Rs 200 for all three, once per player per town, by mail**; the corner pill ticks them off, collapses after 12 seconds and each row guides you there.
- **Town guides:** Guide Marco (Grand Baie), Guide Anita and Guide Dev (Port Louis: the terminal and Immigration Square) and Guide Salma (Flic en Flac) stand at the arrival points with a bubble that changes every 8 seconds; talk to them for the directory and a "show me" for each landmark.
- Tested: 7 new server checks (the checklist, the pulse, the pay, no second payment) and the whole thing in the browser (card, rings, tags, pulse app, trail, checklist, guides). **Not tested:** a real phone (the tags and rings with many players); the other zones of the old game (Trianon, Tribeca, Bambous) do not exist in Mauritius Life, so this covers the three open towns and their highways only.

## Done, session 18 (6 Nov 2026): casino rules and self-exclusion
- **Rules page** (`casinoRules`): how each game works, the real odds pulled from the server (`casino.state` returns `rtp` and the slot payouts), the limits, the hourly loss break, and safe-play advice. Linked from the casino menu and the foot of every game.
- **Self-exclusion** (`casino.exclude`, `db.casino.excl`): 24 hours, 7 or 30 days, two taps to confirm. The server refuses every bet (roulette, slots, new blackjack hands) until it ends. It can be made longer, never shorter, and there is **no admin button to lift it** (to lift one by hand, delete the player's entry in `db.casino.excl` in the save, only if the player asks and you are sure). The menu shows why the games are blocked.
- **Reality check:** after every 30 minutes at the tables a reminder appears.
- Tested: 7 new server checks in `test/capital.test.js` (real odds on the page, only 1/7/30 days, bets refused while excluded, never shorter, can be longer) and the screens in the browser. Not done: a daily deposit-style limit the player sets themselves; a link to a real helpline (the page only names the Gambling Regulatory Authority: check the contact details before launch).

## Done, session 17 (6 Nov 2026): the casino, the market, the job challenges, street food and the harbour sounds
- **Server side (`game/capital.js`, `game/casino.js`, wired in `server.js`; the phone only shows results):**
  - **Casino:** roulette (European, 37 pockets), blackjack (one deck, dealer stands on 17, blackjack 3:2, double on the first move) and slots (three reels). `crypto.randomInt` on the server. Bets Rs 20 to 2,000, only in Port Louis, the server checks your last saved money, one blackjack hand at a time. **Take-a-break rule:** after Rs 30,000 of net losses in a rolling hour the server refuses bets. House edge: slots pay back 93.3%, roulette 97.3%, blackjack about 94% with simple play. The client applies the server's `paid`/`payout` to your cash (`csnApply`). Opening hours 11:00 to 04:00 (client).
  - **Job challenges:** teller (5 sums) and conductor (6 fares of change) with questions and answers kept on the server, answers checked, time checked (too fast = no bonus, too slow = none), bonus Rs 45 to 450 paid **by mail**; courier dash: take a parcel at the terminal, the server picks the address (Chinatown gate, Central Market, Government House or the Blue Penny Museum) and checks **your tracked position** and the time before paying Rs 250 to 400 by mail. 8-minute cooldown per challenge, Rs 4,000 a day cap per player.
  - **Street market:** blankets in Port Louis (one per player). `market.open/stock/price/close/buy/list`: a licensed pitch (inside the terminal or Immigration Square zones, from the player's tracked position) costs Rs 150 for two hours and is safe; any other pavement is free but every 20 s an unlicensed blanket open for 90 s has a 12% chance of a **Police Municipale raid** (blanket and stock gone, `market.raid` is broadcast and Agent Lagesse walks there). Five goods (tea, phone cover, sunglasses, T-shirt, ravanne drum) bought from the wholesaler at cost; prices must be 70% to 200% of the fair price; a buyer must stand within 6 tiles; the seller gets the price minus 6% by mail. A blanket closes when you walk away.
- **Client:** casino overlay with roulette board, slot reels and blackjack table (`csnDraw`); job challenge screens (`jobGameOpen`) and the courier dash with a timer and route guide (`courierStart`); the market (`MKT`: blanket markers, blankets drawn on the pavement, buy and own-stall menus); **street food buffs** (Dholl puri: walk 25% faster for 3 minutes, Mme Chen's boulettes in Chinatown: stamina); **sounds of the harbour** by the quay and terminal (gulls, lapping water, a conductor's whistle, all synthesised, off when muted).
- **Tests:** `node test/capital.test.js` (44 checks: the odds by exact calculation, every bad bet refused, a blackjack hand, the cooldown, bonuses and the courier paid by mail, a two-player market sale with the seller's 94, a raid, a licensed blanket never raided) passes, and so does `test/regions.test.js`. In the browser I played roulette, slots and blackjack through the real buttons, finished a teller challenge (Rs 380 bonus) and laid out a licensed blanket.
- **Not done:** **emote unlocks** from street food (there is no unlock system for emotes yet; the food gives a speed boost and stamina instead); **partner billboards and pop-ups** (partners are off until they agree, every ad goes in `game/ADS.md`); a real market for the unsold stock (it is lost on a raid or when you pack up); the casino rules page and a self-exclusion option; bets are checked against your last saved money, so a modified phone could still ignore a loss (the server does cap the hourly loss and limits payouts to what the server decided); the casino hours and money display are client side.

## Done, session 16 (5 Nov 2026): Port Louis, the real capital
- **Island map (zoom out):** other players' dots and your route pin are back (`islOfWorld`).
- **Port Louis rebuilt at 14 m a tile** (so Caudan, Victoria, Place d'Armes, Immigration Square and Chinatown all fit), with a new `civic` pass in `tools/build-region.mjs` that places things at their real OpenStreetMap positions:
  - **The M1** (OSM `ref=M1`): five lanes of road, a concrete crash barrier on both sides (`barriers`, solid and drawn), crossable only at the **Caudan underpass** (arches with murals and kiosks) and the **Victoria skybridge**. Pathfinding goes round through the gaps.
  - **The Metro Express:** the real light-rail line, twin tracks on a ballast bed (terrain code 23, rails drawn in the ground), tactile yellow paving at the stations, two red-and-white trams (`TRAF`, `tram`) running up and down with a ding-ding at the stations (`tramBell`, WebAudio). Platforms at Port Louis Victoria and Place d'Armes (`metroPlat`): step on one and ride for Rs 20.
  - **Victoria Urban Terminal** (concrete and glass, food court, supermarket, bus conductor job, buses to Grand Baie and Flic en Flac) with a bus bay of idling buses; it is now the town's bus station and the highway from Flic en Flac arrives beside it. **Immigration Square** is a paved lot packed with buses and hawker stalls, with a ticket point for buses to the north.
  - **Place d'Armes:** a boulevard of royal palms, chain posts and cannons, the statue of Mahé de La Bourdonnais, and Government House at its head (a free tour). **Chinatown:** the Friendship Gate and red lanterns, red and wood buildings. **Caudan:** dark basalt-grey buildings, the Blue Penny Museum, the casino with night-only neon, the Odysseo Oceanarium with a shark sculpture. **Central Market** (colonial cream and green), a commercial bank tower and the Bank of Mauritius (glass towers, a Bank clerk job).
  - Each part of the town has its own building colours (`ZONE_PAL`).
- **Day and night (`crowdTarget`, `plZones`):** from 8 to 17:30 the crowd is large and spread over the centre, the terminal, Immigration Square and Chinatown; after 17:30 it shrinks and moves to Caudan (and Chinatown's street food until 23:00); at night only a few stay at Caudan.
- **New people:** Joël (a hawker: "Ti prix, ti prix!", sells alouda, you can haggle), Ashvin (a bus conductor who shouts "Quatre Bornes! Rose Hill! Vacoas!", sells tickets, gives you a shift) and Agent Lagesse (Police Municipale).
- **Jobs:** Bank clerk and Bus conductor shifts (`JOBS`), paid the same way as the other shifts.
- Tested: crowd by hour (day 26 people, evening 15 in the right zones, night 5 at Caudan), every new menu, the Metro ride, the hawker's menu, a path from Caudan to the terminal goes through the skybridge gap, the highways rebuilt to match, the server tests, no page errors; screenshots of every area.
- **Not built (still to decide or do):** casino games (roulette, blackjack: they need a decision on gambling and server-side prizes); the hawker blanket / stall market between players (needs server-side trade rules) and the Police Municipale patrol event; the typing mini-game for bankers, the fare-collecting mini-game and the courier dash; street-food speed boosts and emotes; the partner billboards and pop-ups (partners are off until they agree, and every ad goes in `game/ADS.md`); the real soundscape of seagulls and waves; the Odysseo and the market have only simple interiors. The Metro Express stations are at the real stations but the station halls (buildings) are a few tiles off; the real Port Louis road layout is simplified onto a grid.

## Done, session 15 (5 Nov 2026): the zoom-out map is the real island
- **What you asked for:** zoomed out, the map should be Mauritius, with the places that are not open yet in grey and marked coming soon; and cities for the closed regions so the whole game is laid out.
- **Zoom out (pinch or the minus button) now shows the real island** from OpenStreetMap (`wmFill`, same picture as the Maps app's Island tab). Open regions are coloured with a pin (Grand Baie, Port Louis, Flic en Flac); the five closed regions are grey with a locked grey pin for their main town (Pamplemousses, Belle Mare, Mahébourg, Le Morne, Curepipe) and "Coming soon" or the opening date on the map. Tap a region or a pin: a card says what it is, what is planned (`ISL_CITIES`), and for open towns offers "Travel to". The red dot is you (on a highway it sits between the two towns). The old picture of the first game's world is gone from that screen. The HUD hides while the map is open.
- **The closed cities:** they are represented on the map and in `docs/ROADMAP.md` (the build order and what each needs), not yet as walkable maps: that is the slow work for after lunch, one region at a time, starting with Curepipe and the plateau.
- Tested: zoomed out in the headless browser, tapped a closed region and an open one, zoomed back in; no page errors. Not tested on a phone (pinch gestures).

## Done, session 14 (5 Nov 2026): busier, smoother streets
- **What you reported:** more NPCs wanted; cars kept going one way, then disappeared; movement did not feel natural.
- **Cars (`roadGraph`, `TRAF`):** each town's 3-wide roads are turned into a map of junctions. Cars drive junction to junction, mostly straight, sometimes turning, turning round at dead ends, slowing at corners, wait behind the car in front and stop for you. Positions and headings are smoothed so turns and lane changes are not jumps. Cars are spawned out of your sight (22 to 46 tiles away) and removed when far (85), so there are always cars around you (14 in Grand Baie, 22 in Port Louis, 12 in Flic en Flac) and none vanish in front of you; they scale in. The highways have cars driving the real road past you. The taxi drivers' cars stay on their town's roads for good and park where they stop at night (they no longer vanish at 22:00). Car models are reused.
- **Crowd (`CROWD`, `ambTick`):** 26 walkers who spawn out of sight, walk to places near you (70% of the time) or across town, linger and look about, then walk on, and are removed only when far away. 13 in Grand Baie, 20 in Port Louis, 11 in Flic en Flac, dressed in each town's colours, with the odd greeting bubble.
- **More named locals:** 10 passers-by with names per town (was 6), and residents that cannot find a path now try again and recover instead of standing still.
- Tested: I simulated two minutes of each town: no walker teleports, cars never jump more than a lane change, 11 to 19 walkers within 30 tiles all the time; viewed all three town centres. No page errors. **Not tested:** a real phone (frame rate with the crowd, cars and residents); cars only use 3-wide roads; walkers can still step through cars.

## Done, session 13 (5 Nov 2026): the locals, and each town's own character
- **What you asked for:** a cool way to know which city you are in, 4 or 5 kinds of NPC with personalities living in houses you can enter, towns that feel different, drivers and cars, some NPCs short of money and drinking.
- **Which town am I in:** a coloured welcome card slides in as you cross into a town ("Welcome to Port Louis · The busy capital") or onto a highway; the clock card shows the town's icon and its colour. Each town now has its own ground colours (bright sandy Grand Baie, grey Port Louis, golden Flic en Flac, the highways fade from one to the next), its own house colour palettes and its own traffic (white taxis, a convertible and scooters in Grand Baie; buses, sedans and taxis in Port Louis; pickups and scooters in Flic en Flac). `CITY` in `index.html`.
- **Residents (`RDEF`, `RES`, `LN`):** 5 kinds (taxi driver, street vendor, retired local, visitor, local character who is short of cash), 15 named people (5 per town) plus 6 passers-by per town, each with traits, a catchphrase, and lines that depend on the town and the kind of person (hello, joke, local tip, short speech bubbles). Different looks per town. Their day follows the real Mauritius clock: drivers drive from 6 to 22, vendors work 7 to 19 at their pitch, uncles sit about, visitors wander between the sights, the regulars stagger between the bars until about 1 in the morning, everybody else goes home at night. The drinkers sway as they walk.
- **Talking to them:** say hello, hear a joke, ask for a local tip (a secret once you are friends), plus one thing for their kind: book a ride (the drivers open the real bus/taxi/car trip menu), buy a snack (15% VAT), listen to a story, give directions or take a selfie, buy a round or lend Rs 20. They use the existing friendship and romance system (`relOf("npc:Name")`). **Nothing here pays the player**: friendship, fun and information only.
- **Homes:** each town has 4 or 5 lived-in houses (`LAKAZ`; scenery houses turned into doors, or new houses on empty ground in Grand Baie). Walk in: the resident is there at night (tea, TV, a tip); in the day the house is empty.
- **Traffic (`TRAF`):** cars drive left-hand along the long straight roads of each town (4 to 7 a town) and along the highways (5 each), stop for you when you stand in front of them, and the three taxi drivers' cars are the ones you can chat to.
- Tested: I simulated a full day and night (everyone goes out in the morning and home at night; the regulars stay out late), opened the talk menu for a vendor and a drinker, walked into a home at night, and checked the three towns visually. No page errors. Server tests unchanged.
- **Not tested / limits:** a real phone (frame rate with about 34 residents and 28 vehicles); people do not collide with each other or with cars; the cars drive up and down one road each, not a full network; NPCs are on your phone only (two players see the same names but not the same positions); the old first-game neighbours no longer wander.

## Done, session 12 (5 Nov 2026): one continuous island
- **What you reported (with phone screenshots):** the towns and highways were separate blocks floating in dark sea, joined only by a teleport at the exit. You wanted it connected, like the island map.
- **Now one chain of maps, north to south:** Grand Baie, the highway, Port Louis, the highway, Flic en Flac, each map starting on the row where the one above ends (`WREG`/`RAO`.. in `index.html`, `LAYOUT` in `regions.js`). No portals: you walk straight off a town's last street onto the highway and into the next town. A toast says where you are when you cross.
- **Towns:** each exit now runs to the map edge facing its neighbour (north or south, `CH` in `tools/build-region.mjs`).
- **Highways rebuilt (`tools/build-road.mjs`):** 120 tiles wide like the towns, running down the page; the road leaves the exit of the town above and arrives at the exit of the town below, bending the way the real road bends (up to 30 tiles sideways). The ground beside the road is the real coast, fields and villages, and it carries on from each town's edge so there is no seam. 19.3 km and 20.7 km.
- **Server:** moving between two maps is allowed only between neighbours and close to the line where they join; the highway speed limit stays; trips still work. Tests updated and pass.
- **Tested:** server tests; in the headless browser I walked from Grand Baie's exit down the whole highway into Port Louis (region switched, no errors, heap flat) and opened the Maps app. **Not tested:** a real phone (frame rate), Port Louis to Flic en Flac on foot in the browser, the world and island map pictures (they may still draw the old straight highways).
- **Limits:** the world is now about 1,000 rows tall, so the first load is a little heavier; only a column 120 tiles wide is land, with sea beyond; towns are drawn at 12 m a tile and highways at 75 m, so houses jump in size at the join.

## Done, session 11 (5 Nov 2026): real highways between the towns
- **What you reported:** roads hard to see, towns too close together, roads that end in water before the next town, and no real way to cross.
- **Highways** (`tools/build-road.mjs`, maps `road-grandbaie-portlouis`, `road-portlouis-west`): the real route between the towns, 19.3 km and 20.7 km, drawn one tile per 75 m, straight, with the real country on both sides sampled from the island map: sea, fields, hills, houses. The villages along the way come from OpenStreetMap place names (Triolet, Balaclava, Arsenal, Sinatambou, Le Hochet, Sainte-Croix, Plaine Verte; Coromandel, Petite Rivière, Bambous, Médine...) as green signs and rows of houses on both sides, with a blue kilometre post every 2 km and "Leaving X" / "Welcome to Y" signs.
- **Joined to the towns:** each town's highway exit now leads onto its highway (and back): `PORTALS` in `index.html` and `regions.js`. Walk (or ride) onto the exit tile and you carry on along the road. Town exits are now labelled with the nearest neighbour.
- **Server rules:** a move between a town and its highway is allowed only across the join (prev position near one end, next near the other, with a few tiles of slack for fast vehicles). On a highway you may only move at a believable speed (about 14 tiles plus 16 a second): no skipping the road. A highway is open when both its towns are. The trips (bus, taxi, car) from the Maps app still work as a fast option.
- **Roads you can see:** lighter asphalt on the towns' and highways' roads, kerbs, and white dashed centre lines on the wide roads; green town signs and blue km posts.
- **Performance fixes found on the way:** the game was drawing about 4.5 million triangles a frame, mostly the first game's old rows (still scattering trees, flowers and tufts over land nobody can reach) and every flower in the world at once. Old rows are now skipped and flowers are built only for the region you are in: about 1.2 million triangles now. **Still heavy: needs a real-phone check.** Highway trees are thinned.
- Tested: server tests (new ones for the join, the speed limit, jumping into a town from mid-road); in the browser I walked Grand Baie to Port Louis along the highway and arrived, memory flat, no errors.
- **Honest limits:** the highways are straight (the real road curves are lost; the scenery beside it is real); towns and highways are laid out schematically in the game's grid, joined at the exits, not at their real map positions; the highway scenery is generic (no hills or real shapes of the land); bus, taxi and car trips still use the trip screen rather than riding the highway; no vehicles drive on the highways; the world map and the island map do not yet show the highways; Port Louis to Flic en Flac was built but only the Grand Baie one was walked end to end.

## Done, session 10 (5 Nov 2026): the Caudan Waterfront
- **Research:** the web was not reachable from the session (Wikipedia is outside the allowed network), so I used what your OpenStreetMap file holds around the Caudan Waterfront, within about 200 m of the quay: Umbrella Square, the Rotunda plaza, fountains, the statue of Nicolas Baudin, the La Marina marina and Dias Pier, a taxi stand, the Blue Penny Museum, the Centre d'Arts, a casino, a cinema, a waterfront hotel, restaurants, cafés, a pub, shops, a department store and the Metro Express "Port Louis Victoria" station.
- **Built** (`waterfront` in `tools/build-region.mjs`, drawn by `buildProps()` in the game): a paved promenade along the harbour edge, four wooden jetties with ten sailing and motor boats, Umbrella Square (fountain, six coloured umbrellas, benches, the Nicolas Baudin statue), lamps and benches along the quay, the district name "Caudan Waterfront" with a spot to stroll the quay for free. The Blue Penny Museum and the Arts Centre are open (museum visit); the casino shows "opening soon"; a cinema and shops stand on the quay; the bus station sits beside the square. The quay is joined to the road network.
- **Builder fix:** landmarks (museums, casino, cinema, hotels, mosques, ...) now get building slots before ordinary shops, so they are no longer dropped when a town is busy (the Blue Penny Museum had been).
- Real business names are not used for shops, hotel, restaurants and the casino; museums, the arts centre, the square and the statue keep their real public names.
- **Not done:** the Metro Express (a real tram line from Port Louis Victoria to Rose Hill: a good link to the plateau towns when they open), the Craft Market, a hotel on the quay, boats that move, a casino to enter (gambling needs a decision), the real Caudan Waterfront's old stone warehouses and glass atrium.
- Tested: server tests pass; in the browser, the square, jetties and museum render with no errors.

## Done, session 9 (5 Nov 2026): towns rebuilt so they look better and connect
- **Problem (measured):** the real roads had been copied one tile at a time, which left Grand Baie's roads in 79 broken pieces (6 of 18 shop doors cut off), 773 zigzag corners against 128 straight tiles, buildings on only 4% of the land. Port Louis: 49 pieces, 11 of 37 doors cut off.
- **Roads rebuilt** (`tools/build-region.mjs`): simplified, snapped to a 4-tile grid and drawn as straight runs (main roads 3 tiles, streets 2), through streets and small streets thinned so blocks stay open. Result: each town's road network is now one connected piece (0 loose fragments), zigzags cut by about two thirds, every shop door gets a paved path to the main road (a place nobody can walk to is dropped).
- **Highways:** the builder draws a 3-wide main road from the network to the map edge towards each neighbour town (one per direction) and records it as `exits`; the game puts a "Road to ..." sign there (`M.exits` in `index.html`), and the sign's menu offers every other town.
- **Scenery houses:** where the real map has buildings, the blocks are filled with simple houses facing the streets (`M.houses`, `decoHouse()`): cheap to draw, solid, no door or label. Only 3 to 37 per town so far.
- Bus stations now sit at the middle of each town (anchored on the Bazaar, a market, or the shopping centre).
- Tested: server tests pass (stations read from the maps), full browser tour of the three towns by real trips, no errors.
- **Honest limits:** diagonal roads are still staircases (a tile grid can't draw a slanted road); Grand Baie's estate area is still mostly empty grass with house plots; only 45 scenery houses in total, so towns are still sparse compared with real ones; the look is still blocky boxes (art pass is Phase 2); there is no driving along the road between towns, only the trip screen.

## Done, session 8 (3 Nov 2026): the towns are connected by real roads
- **Problem:** the three towns were pockets joined by a Rs 75 bus that jumped you across. Real distances cannot be walked tile by tile (Grand Baie to Port Louis is about 21 km).
- **Roads:** `game/roads.js` finds the route between two towns along the real road network on the island map (A* over the OpenStreetMap roads, from each town's gate in `regions.json`). Grand Baie to Port Louis 20.7 km through the north, Port Louis to Flic en Flac 22.9 km, Grand Baie to Flic en Flac 43.5 km.
- **Transport:** bus (Rs 25 + 5 a km, 30 km/h, a 5 to 20 min wait, only from a bus station or road sign), taxi (Rs 150 + 20 a km, 55 km/h, comes to you), your own car (Rs 3 a km fuel, 60 km/h, needs a rented or owned car). Rent or buy a car at any bus station.
- **Server decides:** it plans the trip, checks the fare against your money, times the journey and only lets you arrive when it is over. A phone that jumps to another town without a trip is put back (new accounts may only start in Grand Baie). Trips are saved, so a reconnect or a deploy does not lose one, and asking twice is safe.
- **Phone:** a travel menu (price and time per mode), a journey screen with a dot moving along the real route while game time passes, road signs where each road leaves a town, the bus stations' Travel lines, Maps → Island rows, and cross-town taxi requests now open the travel menu. A trip survives a reload.
- Trips pass through locked regions on the road (for example Pamplemousses between Grand Baie and Port Louis) but you cannot stop there.
- Tested: server tests (all pass, including the no-teleport rules and an early arrival), and in the browser a full taxi trip (fare charged, arrived at the right station, a cheat jump put back, 36 apps open, no errors).
- Not tested: a bus trip and a car trip in the browser, resuming a trip after a reload, a real phone.

## Done, session 7 (3 Nov 2026): Flic en Flac rebuilt
- Flic en Flac rebuilt from the real map (`tools/build-region.mjs west`): beach, lagoon, coast road, 32 places. 23 open (restaurants, cafés, a bar, a supermarket, a pharmacy, hotels, snack stalls, boutiques); clubs, clinics, post office, police and tourist office show "opening soon".
- The engine now reads a region table (`WREG`), so Grand Baie, Port Louis and Flic en Flac share the same code; every region has a bus station and a bus to each of the others; the world map, Town map, ground, rides and island dot follow it.
- Server: three regions, the first game's old rows are now "no region" (always refused), tests updated (all pass).
- Longer neutral name lists so shops are not repeated.
- Not done: Middlesex University (it is in the real Flic en Flac, just outside this crop) so Student classes still have no building; homes only in Grand Baie; not tested on a real phone.

## Done, session 6 (3 Nov 2026): Port Louis
- `tools/build-region.mjs portlouis` builds Port Louis (120 x 80 tiles, 12 m) from the OpenStreetMap file: the harbour inlet, Caudan area, museums, cathedrals, temples, banks, courts, 37 places. Real public landmarks keep their names; shops and restaurants get made-up Mauritian names. Point landmarks (shown in OSM as a single point) are now picked up too, and the builder keeps every map point so coastlines are exact (it had cut the island outline wrongly before).
- The engine now holds two walkable regions (`GBM`/`PLM`, `regionOfY`, `PLO`, `PLY`). Each has a bus station; the intercity bus (Rs 75) joins them. Rides stay inside a region, the Town map and world map follow the region you are in, ground textures are painted per region.
- 30 Port Louis places open (cafés, restaurants, cinema and theatre, hotels with a buffet, supermarkets, pharmacies, museums, places of worship); banks, police station, electronics and hardware shops show "opening soon". New templates: café, cinema, museum, hotel.
- Server: Port Louis rows locked/unlocked by the region table; its bus station is the safe spot; tests updated (all pass).
- No houses in Port Louis: you live in Grand Baie.
- Tested in the browser: bus there and back, every place enters and leaves, rides list only local places, all 36 apps open, no errors.
- Not tested: a real phone; the speed of the larger world; a ride (taxi) trip inside Port Louis end to end.

## Done, session 5 (2 Nov 2026)
- `docs/ECONOMY.md`: a paper model of the early game and the problems it showed (costs do not grow with income; weak mid-game sinks).
- Money sinks you chose: property tax (8% of rent on better homes), 15% VAT on Grand Baie shop prices, weekly cyclone policy (60% off disasters); disaster bills now start at Rs 100,000. Student role kept (shifts and allowance only).
- Housing ladder renamed for Grand Baie. What's new and Guide updated.
- Tested: price with VAT is what is charged (Rs 138 for a Rs 120 dholl puri), property tax values, policy bought once and refused twice in a row, lock tests pass. Not tested: a real disaster hitting a player with a policy (needs a live event), the rent-day charge on a real Monday.

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
2. Closed test: measure money over time and retune (see docs/ECONOMY.md); decide on government and raids.
3. Mascot, icons and share image.
4. Build the next region (Pamplemousses or Flacq) with `tools/build-region.mjs`; banks, police and clinics; a university for Students.
4. Remove the dead old-world code and split `index.html` into modules.
5. Phase 2 graphics on one Grand Baie street; Phase 3 driving.
