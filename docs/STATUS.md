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
