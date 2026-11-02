# Mauritius Life: one-page spec

**One line:** a free multiplayer life game set across Mauritius. Build a life, get rich, buy a home, fight rivals, play events with friends. Same loop as Flic en Flac Life, but the whole island, rolled out one region at a time.

## How it differs from Flic en Flac Life
- **The whole island, in regions.** Launch with 2 or 3 regions, add one per season. Never put event content in a region that is not open yet (the Flic en Flac treasure hunt mistake).
- **Money sinks from day one.** Taxes, a patron shop, property upkeep, and disasters with paid cover. No forced, obvious "take from the rich" bills: give players something to buy.
- **Server decides money.** The phone never decides rewards, prices or winners.
- **Mauritian flavour:** Kreol phrases, food (dholl puri, gato piment, mine frite), sega and seggae, buses and taxis, cyclone season (Jan to Mar), festivals (Divali, Eid, Chinese Spring Festival, Cavadee, Maha Shivaratri, Independence Day 12 March).

## What to keep, cut and rebuild

| Area | Decision | Notes |
|---|---|---|
| Server (Node + websocket, JSON saves, atomic saves, backups, restore) | **Keep** | Already battle tested. Move to a real database before 5,000 players. |
| Accounts, login, anti-spoof player ids | **Keep** | |
| Phone shell and apps: Messages, Rides, Rich list, Wealth, Home, Raids, Heists, Journey, Ranks | **Keep** | Reskin colours and names. |
| Chat, DMs, business chats, announcements | **Keep** | |
| Seasons, admin cards, disasters with storm cover, relief fund, patron shop | **Keep** | Retune every price and rate for the new economy. |
| Mascot (Dodo: talks, missions, alerts) | **Rebuild** | New Mauritian mascot, same system. |
| Guide, What's new, New-apps card, ad tracker (`ADS.md`) | **Keep** | The rules live in `CLAUDE.md`. |
| Flic en Flac map, shops, NPCs, Tamarin, Trianon, Ebène, Bambous | **Cut** | Rebuild region by region. Keep the code as templates. |
| Partner content (Belle's Kitchen, Cutz, DevCon, Clawed by Taps) | **Cut** | Belongs to other businesses. Ask first before reusing. |
| Halloween event, treasure hunt, boss fight, JB Loan | **Cut now, reuse later** | Great event templates for Season 1 or 2. |
| Art, icons, share image, domain, SEO | **Rebuild** | The icons and share image are still Flic en Flac. |
| Single 14,000-line `index.html` | **Rebuild** | Split into files: map, phone apps, 3D scenes, UI. Do it before adding much. |

**State of the repo today:** `game/` is a working copy of the engine. It still plays as Flic en Flac inside (the map and shops are unchanged) until the first region is built. Only the name, title and package are renamed.

## Region 1: Grand Baie (the starter hub)
Why: the tourist and nightlife centre of the north. Beach, boats, bars, shopping: every system in the engine has a natural home. Size about 120 x 80 tiles, using the same layout as Flic en Flac so the map code works unchanged.

```
x 0-3    deep sea (blocked)
x 4-7    lagoon (swim)
x 8-12   public beach (no houses)
x 13-14  promenade
x 15-16  coast road
x 17-60  town: shops, nightlife, marina street
x 60-100 housing estates
x 100-120 hills
```
- **y 0 to 20, "La Cuvette":** public beach with stalls, kayak and dive centre.
- **y 20 to 50, "Sunset Boulevard":** supermarket, cinema, bars and a club, restaurants. A marina jetty at about y 34 for boat trips and the dolphin tour.
- **y 50 to 62, "Marché square":** market, bus stop, taxi rank, post office. The player **spawns** at the bus stop.
- **y 64 to 111, "Pereybere Estate":** private beach homes. Rule from day one: 4x4 houses, **at least 3 empty tiles** between them, gate signs at both ends, never on the public beach.
- **x 60 to 100:** housing estates on a 5-tile grid (2 empty tiles between houses).
- **Far north-east:** a red-roofed chapel viewpoint (the Cap Malheureux idea) as a landmark and photo spot.
- **Exit:** the M2 road to **Region 2: Port Louis** (capital, business district, harbour, government).

## Graphics, the island map and driving
The full plan, with the build order, the finish checks for each phase and the prompts to use, is in **`docs/ROADMAP.md`**: a much better stylized look (one street first), the real island with unopened regions grey and locked (enforced by the server), and drivable cars with a driver's-eye view you can switch back from.

## Launch scope
1. **Must have:** Region 1 playable end to end, the economy with its sinks, accounts, chat, the Rich list, homes, one mascot, the Guide.
2. **Nice to have:** Region 2, raids, heists, disasters.
3. **Later:** events (reuse the Halloween, treasure hunt and boss templates), more regions.

## First ten tasks
1. Buy or point the domain, create the Railway service (root directory `game`, volume `/data`).
2. Split `index.html` into modules.
3. Replace the map data with Grand Baie.
4. Rebuild the shops, jobs and NPC lists with Mauritian content.
5. New mascot, icons and share image.
6. Retune prices, wages, rent and sink rates; run the economy on paper.
7. Remove the Flic en Flac ads and partner code.
8. Closed test with 20 people on real phones.
9. Fix everything found, then launch (see `LAUNCH.md`).
10. Season 1 plan: one event and one new region.
