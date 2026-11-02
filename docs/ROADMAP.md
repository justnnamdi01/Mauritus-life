# Technical roadmap: graphics, the island map, and driving

This is the build order for the three big upgrades. Work one phase at a time. When a phase is done, tick it here and add a line to `docs/STATUS.md`.

## The three goals
1. **Much better graphics**, aiming at a polished stylized look like a top mobile strategy game. It is a long road: start with one street, then copy that level everywhere.
2. **The real island of Mauritius**, with regions that are not open yet shown in **grey** and **inaccessible**.
3. **Driving**: get into a car, see the road from the driver's eyes, and switch back to the normal view.

## Phase 1: the map pipeline and region locks (foundation)
**Build**
- A script that turns OpenStreetMap data (coastline, roads, buildings) into the game's tile map. Credit OpenStreetMap in the game and README (its licence requires it). About 150 m per tile gives roughly 430 x 300 tiles for the island.
- A **region table** (data, not code): `id`, name, shape (polygon of tiles), `open` (true/false), `opensAt` (date or empty), `color`.
- Locked regions are drawn **grey and desaturated**, with a "Coming soon" label, road barriers on the roads that enter them, and grey on the minimap.
- **The server enforces the lock.** If a player's position is inside a locked region, the server rejects it and moves the player back. Never rely on the phone alone (the Flic en Flac lesson).
- An admin card to open or close regions and set opening dates.

**Done when**
- [x] The whole island appears on the map (Maps → Island). Not yet on the in-game minimap.
- [x] Grey regions cannot be entered, and a test with a modified client cannot get in (`game/test/regions.test.js`). Every way of moving reports its place through the same presence message, which the server checks. The server reads the region from the player's place, so the phone cannot lie. Between regions there is no road, only the intercity bus, which refuses locked regions.
- [x] Opening a region in the admin page makes it colourful and allowed without a deploy. ("Walkable" needs that region's detailed map, which comes region by region.)

## Phase 2: the graphics upgrade, on Region 1 only
**Build**
- Pick the art direction (one palette, one level of detail). Write it in `docs/ART.md` with 3 reference images.
- Replace boxes with modelled assets (glTF, compressed): buildings, trees, cars, props. Sources: free CC0 packs, paid packs, a 3D artist, AI-generated models (the host for downloads must be allowed in the session network settings).
- Render pipeline: soft toon shading with outlines, baked lighting and shadows, colour grading, bloom on lights, nicer water and sky.
- Animation and polish: character animations, buildings that react to taps, coin and upgrade effects, sound.
- Keep quality tiers (the Graphics setting) and a phone budget: stay smooth at 30 fps or better on a mid-range phone.

**Done when**
- [ ] One full street in Region 1 meets the art direction (the "vertical slice").
- [ ] It runs smoothly on a mid-range phone.
- [ ] The look can be repeated for the rest of Region 1 with the same assets.

## Phase 3: driving with a driver's-eye view
**Build**
- A drivable car: speed, steering, grip, braking, collisions with walls and buildings, slower on sand, faster on roads. Phone controls: a steering wheel and pedals, with an auto-accelerate mode.
- Multiplayer: send position, direction and speed about 8 times a second and smooth other players' cars. The server limits speed and rejects impossible jumps.
- **A view button** with two views: the normal view, and the driver's view (a camera at eye height inside the car, a wide field of view, speed lines, engine sound). The choice is remembered. Switching is instant and never loses the player's place.
- Ride and garage integration: getting in and out, who owns the car, fuel or fees if the economy needs them.
- Roads must look good at eye level: road markings, kerbs, lamps, trees, buildings with faces, not plain boxes. This depends on Phase 2.

**Done when**
- [ ] A player can get in a car, drive down a street in the driver's view, and switch back.
- [ ] Two players see each other's cars move smoothly.
- [ ] Speed hacks are rejected by the server.

## Phase 4: roll it out, region by region
- Repeat Phase 2 art for each region before opening it.
- Open regions on a schedule: Region 1 at launch, then one new region per season.

## Rules that apply to every phase
- Read `CLAUDE.md` first. The server decides money, positions and prizes.
- Check a region is open before putting any event or content in it.
- One small change per commit, and test before saying it works. Say honestly what was and was not tested.
- Update `UPDATES`, the Guide, `NEWAPPS` and `game/ADS.md` for anything players see.

## What to tell Claude in a new chat
Copy and paste one of these, replacing the phase number.

**Start of any session**
> I am building Mauritius Life in the repo justnnamdi01/Mauritus-life. Read CLAUDE.md, docs/SPEC.md, docs/ROADMAP.md and docs/STATUS.md first. Tell me which phase we are on, what is done, and what you suggest next. Do not start building until I confirm.

**Phase 1: the map and region locks**
> Work on Phase 1 of docs/ROADMAP.md: the OpenStreetMap map pipeline and the server-enforced region locks, with an admin card to open regions. Start with a plan and the region list, show me, then build it step by step. The server must enforce the locks. Test it and tell me what you could not test.

**Phase 2: graphics**
> Work on Phase 2 of docs/ROADMAP.md on Region 1 only. First write docs/ART.md with the art direction and ask me to approve it. Then build one street as the vertical slice. Keep it smooth on a mid-range phone. Show me screenshots.

**Phase 3: driving**
> Work on Phase 3 of docs/ROADMAP.md: a drivable car with a driver's-eye view and a button to switch back. Start with a single-player prototype on one road, then add multiplayer and the server checks. Tell me what you could not test on a real phone.

**To finish a session**
> Update docs/STATUS.md with what we did, what is tested, what is not, and the next step. Then commit and push to main.
