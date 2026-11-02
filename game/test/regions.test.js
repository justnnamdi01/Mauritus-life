// Region locks, tested like a modified phone would attack them. Run: node test/regions.test.js
// Starts its own server on a spare port with a throwaway save, so it never touches real data.
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path"), WebSocket = require("ws");
const PORT = 18000 + Math.floor(Math.random() * 1000), KEY = "test-admin-key-123", dir = fs.mkdtempSync(path.join(os.tmpdir(), "mlreg-"));
const isl = require("../public/island.json"), tile = (lo, la) => ({ ix: (lo - isl.lon0) * isl.kx / isl.tileM, iy: (isl.lat0 - la) * isl.ky / isl.tileM });
let fails = 0; const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = (method, body) => fetch(`http://127.0.0.1:${PORT}/api/admin/regions`, { method, headers: { authorization: "Bearer " + KEY, "content-type": "application/json" }, body: body && JSON.stringify(body) }).then((r) => r.json());

(async () => {
  const srv = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: Object.assign({}, process.env, { PORT, ADMIN_KEY: KEY, DATA_FILE: path.join(dir, "data.json") }), stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/regions`); break; } catch (e) { await wait(200); } }
    const pub = await fetch(`http://127.0.0.1:${PORT}/api/regions`).then((r) => r.json());
    const open = pub.regions.filter((r) => r.open).map((r) => r.id).sort().join(",");
    ok(open === "grandbaie", "open at start: only Grand Baie, the one region with a walkable map (got " + open + ")");

    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), got = [];
    ws.on("message", (d) => { try { got.push(JSON.parse(d)); } catch (e) {} });
    await new Promise((r) => ws.on("open", r));
    ws.send(JSON.stringify({ t: "hello", uid: "u_" + Math.random().toString(36).slice(2, 12) }));
    await wait(400); ok(got.some((m) => m.t === "welcome"), "a phone connects");
    const pres = (patch) => ws.send(JSON.stringify({ t: "presence", patch }));
    const locked = async () => { await wait(250); const i = got.findIndex((m) => m.t === "region.locked"); if (i < 0) return null; return got.splice(i, 1)[0]; };

    pres({ rg: "north" }); let l = await locked();
    ok(l && l.id === "north" && l.back.rg === undefined, "a phone with no place yet that claims the locked north is refused");
    pres({ rg: "nowhere" }); l = await locked(); ok(!!l, "an unknown region is refused");
    pres(tile(57.70, -20.40)); l = await locked(); ok(l && l.id === "southeast", "standing on a Mahébourg island tile is refused");
    pres(tile(57.585, -20.012)); l = await locked(); ok(!l, "Grand Baie island tile is allowed");
    pres(tile(57.70, -20.40)); l = await locked(); ok(l && Math.abs(l.back.ix - tile(57.585, -20.012).ix) < 0.01, "a jump into a locked region is put back to the last good tile");
    pres({ ix: -5, iy: 3 }); l = await locked(); ok(!!l, "a tile off the map is refused");
    pres({ ix: "NaN", iy: null }); l = await locked(); ok(!!l, "rubbish coordinates are refused");

    // Admin: no key, then open the north, then close it with a player inside
    const nokey = await fetch(`http://127.0.0.1:${PORT}/api/admin/regions`).then((r) => r.status); ok(nokey === 401, "the admin card needs the key");
    let a = await admin("POST", { id: "north", open: true }); ok(a.ok && a.regions.find((r) => r.id === "north").open, "admin opens the north");
    await wait(200); ok(got.some((m) => m.t === "regions"), "every phone hears that a region opened");
    pres(tile(57.56, -20.10)); l = await locked(); ok(!l, "the north island tile is allowed once open");
    a = await admin("POST", { id: "north", open: false }); l = await locked(); ok(l && l.id === "north" && l.back.ix !== undefined, "closing the north walks the player inside to a safe place");
    a = await admin("POST", { id: "east", opensAt: Date.now() - 1000 }); ok(!a.ok, "an opening date in the past is refused");
    a = await admin("POST", { id: "east", opensAt: Date.now() + 86400000 }); ok(a.ok && !a.regions.find((r) => r.id === "east").open, "an opening date tomorrow keeps it closed today");
    // The walkable map: rows from 232 down are Grand Baie (the old Flic en Flac rows are closed). The server reads the place, not the phone's claim.
    const stop = { x: 56.5, y: 259.5 };
    pres({ x: stop.x, y: stop.y, rg: "grandbaie" }); l = await locked(); ok(!l, "standing at the Grand Baie bus station is allowed");
    pres({ x: 20, y: 30, rg: "grandbaie" }); l = await locked(); ok(l && l.id === "west" && l.back.y > 232, "a phone that claims Grand Baie but stands in the old Flic en Flac map is put back in Grand Baie");
    pres({ x: stop.x, y: stop.y, rg: "west" }); l = await locked(); ok(!l, "a phone that lies about its region is judged by where it stands");
    a = await admin("POST", { id: "grandbaie", open: false }); ok(!a.ok, "the last region with a walkable map cannot be closed");
    pres({ x: 3, y: 4, in: "home", rg: "grandbaie" }); l = await locked(); ok(!l, "indoors, room positions are not mistaken for regions");
    pres({ in: "" });
    ws.close();
  } finally { srv.kill(); await new Promise((r) => srv.on("exit", r)); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  console.log(fails ? fails + " failed" : "all passed"); process.exit(fails ? 1 : 0);
})();
