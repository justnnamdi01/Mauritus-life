# Mauritius Life

A free multiplayer life game set across Mauritius, played in the phone browser. Built on the same engine as Flic en Flac Life.

- `docs/SPEC.md`: what to keep, cut and rebuild, and the layout of Region 1 (Grand Baie).
- `docs/LAUNCH.md`: the launch plan, scripts, captions and video plan.
- `docs/ROADMAP.md`: the build order for better graphics, the island map with locked regions, and driving.
- `docs/STATUS.md`: where we are right now (updated at the end of every working session).
- `game/`: the game and its server.

> **Status:** `game/` is a working starter copy of the engine. It still plays as Flic en Flac inside (the map, shops and NPCs are unchanged) until Region 1 is built. Only the name, title and package are renamed. Follow `docs/SPEC.md`.

## Run it locally
You need Node 18 or newer.

```
cd game
npm install
node server.js
```
Open http://localhost:8080. Saves go to `game/data.json` (never commit it).

## Deploy (Railway)
1. New service from this repo, **root directory `game`**.
2. Add a volume mounted at `/data`. The Dockerfile already saves there (`DATA_FILE=/data/data.json`).
3. Set `ADMIN_KEY` (12+ characters) to turn on the admin page at `/admin.html`, and `AUTH_SECRET` to keep logins valid across restarts.
4. Point your domain at the service. The server fills the site address into the page meta tags itself (the `__SITE__` placeholder), so no setting is needed.

## Files
```
game/
├─ server.js        backend: realtime room, database, economy, admin
├─ raidsim.js       raid battle simulator
├─ bosssim.js       boss fight engine (event template)
├─ Dockerfile
└─ public/
   ├─ index.html    the game (to be split into modules)
   ├─ net-adapter.js connects the game to the server
   ├─ admin.html    admin page
   └─ models/       3D characters (Quaternius, CC0, see the LICENSE file there)
```
