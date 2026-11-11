# Mauritius Life: how the game works, from beginning to end

Written 11 Nov 2026 from the code and the project notes (`docs/STATUS.md`, `SPEC.md`, `CORE.md`, `ROADMAP.md`, `LAUNCH.md`, `ECONOMY.md`). Where something is only a plan, it says so. Nothing here has been tested on a real phone yet.

---

## 1. What the game is

A free, multiplayer, 3D life game of Mauritius that runs in a phone browser. You are one person on the island: you live in a flat, work, eat, sleep, spend, upgrade your home, ride boats and the metro, gamble (carefully), meet other real players, and climb the Rich list. It is for players aged 18 and over (the Jump In card says so).

**The promise on the first screen:** "Rise from a flat in Port Louis to the biggest name in Mauritius."

**The hook (from `CORE.md`):** two things grow together.
1. **Your Lakaz** (your flat): you pay for an upgrade, it takes real time, you leave, you come back and see it finished. This is the Clash of Clans part.
2. **Your Zistwar** (your story): missions and characters across the island. This is the GTA part. **Not built yet.**

Between them is a living island with a real clock, jobs, games and other players.

---

## 2. How it is built (the technical shape)

| Part | What it is |
|---|---|
| The game page | `game/public/index.html`, about 14,000 lines, plus extra script files loaded after it (`workplaces.js`, `wk-*.js`, `hustles.js`, `studio.js`, `flat.js`, `levels.js`, `portlouis-surround.js`, `surround.js`, `nightcity.js`, `islets.js`, `life.js`, `harbour.js`, `tpv.js`, `onboard.js`, `metro.js`, `gender.js`). 3D is Three.js r128, drawn in the browser. |
| The server | `game/server.js` (Node + WebSocket, about 2,100 lines) with modules: `capital.js` (Port Louis rules), `casino.js`, `hustle.js`, `upgrades.js` (flat upgrades), `levels.js`, `notify.js` (push), `regions.js` + `regions.json`, `roads.js`. |
| Saves | One JSON file (`data.json`) with atomic saves and backups. Never committed. The spec says to move to a real database before about 5,000 players. |
| Hosting | Railway deploys the `main` branch with root directory `game`. |
| Tests | Five server test files (`levels`, `flat`, `regions`, `capital`, `hustle`). They all pass. The browser is tested with a headless Chromium, which is slow, so tests are short. |

**The golden rule:** the **server decides money, prizes and winners**. The phone only shows results. Example: a flat upgrade is charged and timed by the server, and finishes on the server's clock even if you are offline.

**Time:** 1 game hour = 30 real seconds. A game day is 12 real minutes, a game week (rent day) 84 real minutes. Business income is paid per real hour.

---

## 3. The world

One tile grid, 460 wide, with towns stacked north to south, each 120 x 80 tiles:

| Order | Place | Notes |
|---|---|---|
| 1 | **Grand Baie** | Tourist and nightlife town, bay, beach, houses on plots. Built from real OpenStreetMap data. |
| road | Highway to Port Louis | One tile per 75 m of real road. |
| 2 | **Port Louis** | The capital. **Where every new player starts.** 14 m per tile. |
| road | Highway to Flic en Flac | |
| 3 | **Flic en Flac** | West coast beach town. |
| 4 | **Bambous** | Inland, no sea. Only the map and look exist; the gun/cartel plan is not built. |

Around Port Louis, to the east, there is a strip of the real city and land drawn as scenery under clouds. You cannot enter it.

**Regions are locked by the server.** Leaving Port Louis on foot needs the **Island Pass (Rs 5,000)**, sold only in Port Louis. A modified phone cannot cheat: the server reads your position and moves you back. Bus, taxi and your own car trips between towns are real drives along the highway, sold by the server.

**Day and night, weather:** a real clock; night brings street, building and window lights; rain and cyclone season (Jan to Mar) exist.

**Life outside the buildings:** sugar cane fields, birds (each lives in its own spot in a town and never follows you), ships and boats on planned routes, cars that drive junction to junction, a crowd of walkers that changes by the hour.

---

## 4. Your first minutes (the onboarding)

1. You open the page. A card shows a name (a random `IslandRider_NN`) and **Jump In**, with a Man / Woman choice and the 18+ line. No forms, no film.
2. You appear on the paving by the **Caudan waterfront** in Port Louis, in third person, holding the controls (tap the ground or WASD; the camera button switches views). A mirror and clothes rack beside you open the **Character Studio**.
3. An **Island checklist** pill shows eight things, in any order, each paid once by the server: ride a vehicle (+500), chat (+200), buy a snack (+100), style yourself (+300), walk into a building (+100), open the phone (+100), earn wages (+500), do something fun (+300), plus +400 for finishing all.
4. **No account at first.** A "Don't lose your cash!" prompt appears only at your first Rs 2,500, your first outfit or car, or when you leave the tab.
5. **The first session is quiet:** welcome cards, daily rewards, news and gossip are held back until session 2 (a new session starts after 30 minutes away).

New players begin with about Rs 4,000 (resident). Rent is Rs 2,500 a week.

---

## 5. How you play: the loops

### 5.1 Daily needs
Food, energy, hygiene, bladder, fun, social, fitness. They fall over time. You act them out: eat at a table, sleep in a bed, shower, sit on a bench. Rule of the project: **every action is seen in the world** (walk there, go in, take the pose, people around you).

### 5.2 Jobs
- **One main career at a time** (asked after your first shift). Full pay and promotions. Other workplaces are odd jobs at 55% pay, 3 a day.
- Eight real workplaces with staff and customers, where you walk to your post and a shift plays for 18 seconds: **restaurant, bank, bakery, bar, street-food shop, supermarket, Central Market, Victoria Urban Terminal.** Your post depends on your rank (dishwasher then cook; teller then loans officer then manager).
- Shift pay is about Rs 500 to 1,150 per 4 game hours (2 real minutes). Phone careers pay more.
- **Job challenges** (server-checked): teller sums, bus conductor change, courier dash (a parcel to the Chinatown gate, Central Market, Government House or the Blue Penny Museum). Bonus Rs 45 to 450, paid by mail.

### 5.3 Side hustles (Hustles app)
Gato piment round, fishing off the quay, busking on the stage. The server charges the stake, times the round, picks what bites, enforces hours, cooldowns and a **Rs 4,500 daily cap**, and pays by mail.

### 5.4 Your flat (the Clash loop)
You live at **Victoria Heights Flats**. Ten timed upgrades, paid and timed by the server:

| Level | Name | Price (Rs) | Real time |
|---|---|---|---|
| 1 | Fresh paint | 300 | 2 min |
| 2 | Warm lights | 800 | 10 min |
| 3 | Window flowers | 2,000 | 1 h |
| 4 | Gallery wall | 5,000 | 4 h |
| 5 | Cove lighting and trim | 12,000 | 10 h |
| 6 | Indoor garden | 25,000 | 24 h |
| 7 | Chandelier | 50,000 | 48 h |
| 8 | Mirror and panels | 90,000 | 72 h |
| 9 | Smart home | 150,000 | 120 h |
| 10 | Penthouse | 250,000 | 168 h |

Finished shifts shave 2 minutes off (six times per upgrade). Visiting friends can help (5% each, five at most). A push notification fires when it is ready. Housekeeping lasts a week (Rs 40 + 40 per level) and gives a comfort bonus. These prices and times are placeholders waiting for the pacing script.

### 5.5 Levels, "Island Standing" (the reward system)
Level 1 to 50, all reachable alone. XP comes from shifts, hustles, flat upgrades, the daily routine and first-time bonuses, with a daily soft cap. Each level gives a gift and a title; milestones unlock slots and clothes; a level-up is fireworks over the flat. **Your Day** shows three small goals. **Leaderboards that never reset** (Highest level, Best flat, Richest, Helpful, Album), a Standing card other players can open, friends, and a hide switch. Levels never go down.

### 5.6 Money sinks (so it does not become too easy)
Rent, property tax (8% of rent on bigger homes), 15% VAT on shop prices, a cyclone policy, disaster bands over Rs 100,000, wealth tax over Rs 500,000, housekeeping, the Island Pass, the casino's house edge. The paper economy check says the start is healthy and the middle game (Rs 50,000 to 500,000) is still thin on things to spend on. **The economy has not been play-tested.**

### 5.7 Social
Chat, DMs, friends, visiting homes, the Rich list, and a **richest-player statue** (see section 8).

---

## 6. The phone (about 36 apps)
Messages, Rides, Rich list, Wealth, Home, Hustles, Standing, Leaderboards, City Pulse (every town with live player counts and a trail to follow), Maps (town and island), Guide (about 100 questions and answers), Goals, Alerts (push settings), Settings, and more. Every new app is added to the "new" badge list and every player-facing change to the "What's new" list.

---

## 7. PORT LOUIS IN DETAIL

### 7.1 What it is
The capital, rebuilt at 14 m a tile (120 x 80 tiles) from real OpenStreetMap positions. 43 buildings, 78 props, 342 barrier tiles, a metro line, five named districts. Everyone starts here, and the town is where most of the server-side systems live (the Island Pass, the casino, the market, the courier dash, the job challenges, the flats).

### 7.2 The five districts
| District | What you find |
|---|---|
| **Caudan waterfront** (north-west, the spawn) | Dark basalt-grey buildings, **Blue Penny Museum**, **Odysseo Oceanarium** (shark sculpture), the **Casino** (night-only neon), Cinema, Theatre, Games Room, the Ferris wheel, the Waterfront stage, the quay for fishing, the ferry pier, the Caudan underpass under the M1 with murals and kiosks. |
| **Centre / Place d'Armes** | A boulevard of royal palms with chain posts and cannons, the statue of Mahe de La Bourdonnais, **Government House** at its head (a free tour), Law Courts, **Commercial Bank Tower**, **Bank of Mauritius** (a bank-clerk job), St Louis Cathedral, Post Office, Photo Museum, Musee d'Histoire. |
| **Gare (Victoria station area)** | **Metro Express: Victoria** station, skybridge across the M1, Victoria Heights Flats where you live. |
| **Chinatown** (east) | Friendship Gate, red lanterns, **Kwan Tee Pagoda**, red-and-wood buildings, street food until 23:00 (Mme Chen's boulettes give a stamina boost). |
| **Terminal / Immigration Square** (south) | **Victoria Urban Terminal** (concrete and glass, food court, supermarket, bus bays, a conductor job, buses to Grand Baie and Flic en Flac), Immigration Square (a lot packed with buses and hawker stalls, the ticket point for buses north), Central Market. Religious sites: Markazi Mosque, Madurai Mariamen Temple, Shrimadhu Kannanur Mariammen Kovil, Saint Jean de Britto. |

Other things: Police Stations, Hotels, Mini Markets (6), Restaurants, Hardware Shop, Petrol Station, Cafe, Bank, Supermarket.

### 7.3 Getting around
- **On foot** with tap-to-walk path-finding. The M1 has a concrete barrier on both sides and can only be crossed at the Caudan underpass or the Victoria skybridge, so paths go round through the gaps.
- **Metro Express (Rs 35, tap in):** the real light-rail line built in 3D with gravel bed, sleepers, rails, overhead wire, poles and a raised viaduct to each platform. Two stations, **Victoria** and **Place d'Armes**. Red-and-black three-car trains with a glowing destination sign run on the shared clock (a train every 60 to 120 seconds). You board with the doors open, sit in the carriage, look out of the window (drag to turn your head), and get off at the other station, or skip. The line carries on out of town over about 55 tiles of grass to a tunnel portal "To Rose Hill and Curepipe, opening soon". Other stations on the map card (Rose Hill, Ebene, Quatre Bornes, Vacoas, Curepipe) are named but not built.
- **Ferry (Rs 120):** a rideable catamaran from the Caudan pier. Boats run planned programs (dock, sail, hold, away) from the shared clock. Labels, pier signs and gold minimap dots tell you which boats you can ride. A cruise ship, a tanker and a container ship sit at anchor.
- **Buses, taxis, your own car** to other towns (needs the Island Pass). Cars and the crowd (about 20 walkers by day) fill the streets.
- **Third-person view and a GTA-style minimap** at the top, with the metro line and boats shown.

### 7.4 Things to do
- **Work** at the terminal, bank, supermarket, market, restaurants and shops (section 5.2).
- **Hustles:** gato piment round from the terminal, fishing on the quay (Oncle Jean fishes beside you), busking on the stage (a band dances from 17:00).
- **Casino (11:00 to 04:00, Port Louis only):** roulette (European, 97.3% return), blackjack (about 94%), slots (93.3%). Bets Rs 20 to 2,000. The server rolls (`crypto.randomInt`). Safety: a break rule after Rs 30,000 net loss in an hour, a reality check every 30 minutes, and **self-exclusion for 24 hours, 7 or 30 days** that cannot be lifted early. A daily limit set by the player and a real helpline link are **not built yet**.
- **Street market:** lay a blanket and sell five goods. A licensed pitch (Rs 150 for two hours, inside the terminal or Immigration Square) is safe; any other pavement is free but risks a Police Municipale raid (12% every 20 s) that takes your stock. Prices must be 70% to 200% of fair; the seller gets the price minus 6% by mail.
- **Fun hub:** Ferris wheel (Rs 120, or 200 with a friend, one slow turn of 60 seconds in an open gondola, drag to look around); Games Room (racing, claw machine, dance mat, juice; these are only timed menu actions with no skill yet, and the prize counter gives nothing); benches ("Sit and watch the world" gives a drifting camera).
- **Visit places:** a new-in-town checklist pays Rs 100 each for Caudan, Place d'Armes and Chinatown, plus Rs 200 for all three. Guide Anita and Guide Dev at the terminal and Immigration Square give directories and "show me" trails.
- **A story-lite start:** when you first leave your flat, a 12-second camera tour of the town ends at a red suitcase left by the stage; deliver it to Guide Anita.
- **Street characters:** Joel the hawker ("Ti prix, ti prix!", haggle for alouda), Ashvin the bus conductor, Agent Lagesse (Police Municipale). Rare "pushy stranger" events happen to anyone and can be walked away from or reported.

### 7.5 What changed most recently in Port Louis
- **Waterfront widened:** about 380 tiles of paving over the shallows by the Caudan hub.
- **Statue island:** the golden statue of the richest player stands on a small island off the waterfront, joined to the shore by a paved causeway (section 8).
- **City lights at night**, spacing out of buildings, the metro and railway extension.
- **Known limits:** the harbour water is thin, so a tug, a fishing boat and a yacht have no valid route (now two more small boats dropped because of the causeways). The Odysseo and the market have simple interiors. The real road layout is simplified onto a grid. The Metro station halls are a few tiles off the real ones.

---

## 8. Statues (the newest feature)
- **Richest-player statue:** a golden figure with a crown, a bag of money and a spinning coin, on a marble plaza with benches, flower beds and lamps that light at night. The plate, name tag and hair (long for a woman) follow whoever is richest right now. Tap it for their net worth and when they became richest; a Rich list button and a "where do they live" guide are there.
- **Where:** a plaza in every town. Grand Baie, Port Louis and Flic en Flac put it on a small island with a causeway; Bambous has no sea so it stands on land. The old copy near the first Grand Casino is kept.
- **Dodo statue:** a bronze dodo (the national symbol) on a stone plinth in a flower-ringed pond, near each town hub. Tap for a photo.

---

## 9. Other towns (short)
- **Grand Baie:** 14 open places (food, groceries, pharmacy, haircuts, library, temple, petrol station, bar), houses on plots (at least 3 empty tiles between homes, never on the public beach), a ferry, a sailing tour and the bay.
- **Flic en Flac:** beach town, pirogue trips, fishing boats, a cane-field inland side, 8 women residents added for parity.
- **Bambous:** neglected inland town look (rubbish, tin shacks, burning barrels, graffiti). The gun, cartel and rival-gang idea is **not built**; it needs two decisions from you.

---

## 10. People and fairness
- Both men and women are supported from the first screen (a Man / Woman choice, switchable in the Character Studio). Words follow your character (madame / monsieur, frere / soeur), relationship words can be "partner", period tracking is opt-in, men share childcare, 16 women and 16 men residents, free dyes and 8 Everyday looks. **Still missing:** swimwear, formal, traditional and modest wear and natural hair textures (new 3D models are needed; see `docs/ASSETS.md`).
- Adults only (18+). No text says who will lose money. Notifications are limited: at most 2 a day, none 23:00 to 07:00, none while you play.

---

## 11. What is not built yet (honest list)
1. **Zistwar** (the missions and cast) and **crews** (the social engine).
2. **Materials** and a pacing script (M2), **business ownership** (M4).
3. **Bambous guns, cartel and rivals** (needs your decisions).
4. **More regions:** Rose Hill Central, Pamplemousses, Belle Mare and the rest are shown on the island map in grey, locked.
5. **Missing character models** (clothes and hair for more people), more boats (a Grand Baie pirogue and fishing boat, a Port Louis tug, fishing boat and yacht).
6. **Economy retune** and any real play test.
7. **Real-phone testing of everything**, and the `PUSH_CONTACT` setting on the live site.
8. A **daily deposit limit and a real helpline link** for the casino.
9. Games Room games with real skill; the Odysseo and market interiors.

---

## 12. Launch plan (from `LAUNCH.md`)
Goal: 1,000 sign-ups in week 1, 30% still playing on day 7. Audience: Mauritians 15 to 30 on phones (WhatsApp, TikTok, Facebook, Instagram) and the diaspora. Steps: a closed test with 20 friends on real phones, a 15-second teaser and waitlist, Founders' codes for the first 200, a launch-day **Founders' Race** (first 100 to a set net worth win a badge), then one post a day and a Season 1 event with the next region about 30 days after launch. Do not deploy during an event. Every ad, poster or promo goes in `game/ADS.md` (currently the business ads and the fashion show are removed).

---

## 13. Where each thing lives (for the next person)
- Game page and most client logic: `game/public/index.html` (UPDATES list, in-game Guide `HOWTO`, `WREG` towns, `OBJ` tap targets).
- Port Louis map: `game/public/portlouis-map.js` (built by `tools/build-region.mjs`, then `widen-water.mjs`, `space-out.mjs`), scenery `portlouis-surround.js`, metro `metro.js`, boats `harbour.js`, statue island `islets.js`, night lights `nightcity.js`.
- Server money rules: `game/capital.js` (pass, casino, market, challenges), `casino.js`, `hustle.js`, `upgrades.js`, `levels.js`, `regions.js`.
- Notes: `docs/STATUS.md` (the diary, updated every session), `docs/CORE.md` (the design).
