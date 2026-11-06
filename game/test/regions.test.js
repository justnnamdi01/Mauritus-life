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
  const srv = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: Object.assign({}, process.env, { TRIP_TIME_SCALE: "20", PORT, ADMIN_KEY: KEY, DATA_FILE: path.join(dir, "data.json") }), stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/regions`); break; } catch (e) { await wait(200); } }
    const pub = await fetch(`http://127.0.0.1:${PORT}/api/regions`).then((r) => r.json());
    const open = pub.regions.filter((r) => r.open).map((r) => r.id).sort().join(",");
    ok(open === "grandbaie,portlouis,west", "open at start: Grand Baie, Port Louis and Flic en Flac, the regions with a walkable map (got " + open + ")");

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
    // The walkable maps and the roads between them. You only change town by travelling; the server times the trip and refuses jumps.
    const ask = (t, extra) => new Promise((res) => { const rid = "r" + Math.random().toString(36).slice(2, 8), h = (d) => { try { const m = JSON.parse(d); if (m.rid === rid) { ws.off("message", h); res(m); } } catch (e) {} }; ws.on("message", h); ws.send(JSON.stringify(Object.assign({ t, rid }, extra))); });
    { const uidOf = got.find((m) => m.t === "welcome").uid; ws.send(JSON.stringify({ t: "doc.set", path: "players/" + uidOf, data: { name: "Tester", money: 5000, savedAt: Date.now() }, rid: "d1" })); await wait(400); } // a saved player, so the server knows what they can pay
    let ar0;
    const mapOf = (id) => { const t = fs.readFileSync(path.join(__dirname, "..", "public", id + "-map.js"), "utf8"); return JSON.parse(t.slice(t.indexOf("= {") + 2, t.lastIndexOf(";"))); }, stopOf = (id, row) => { const m = mapOf(id); return { x: m.stop.x, y: row + 4 + m.stop.y }; }; // the bus stations come from the real maps
    const REGM = require("../regions"), LAY = (id) => REGM.LAYOUT.find((r) => r.id === id), stop = REGM.STOPS.grandbaie, plStop = REGM.STOPS.portlouis, flStop = REGM.STOPS.west;
    const uidOf2 = got.find((m) => m.t === "welcome").uid, setMoney = async (n) => { ws.send(JSON.stringify({ t: "doc.set", path: "players/" + uidOf2, data: { name: "Tester", money: n, savedAt: Date.now() }, rid: "m" + n })); await wait(300); };
    pres({ x: plStop.x, y: plStop.y, rg: "portlouis" }); l = await locked(); ok(!l, "a new player starts in Port Louis");
    pres({ x: stop.x, y: stop.y, rg: "grandbaie" }); l = await locked(); ok(l && l.why === "pass" && l.back.y >= LAY("portlouis").y0, "without the Island Pass a player cannot leave Port Louis, not even by jumping");
    let ps = await ask("pass.state"); ok(ps.ok && ps.has === false && ps.price === 5000, "a new player does not hold the Island Pass (Rs " + ps.price + ")");
    let st0 = await ask("road.start", { to: "grandbaie", mode: "taxi" }); ok(!st0.ok && /Island Pass/.test(st0.error || ""), "a trip needs the Island Pass");
    { const w2 = new WebSocket(`ws://127.0.0.1:${PORT}`), got2 = []; w2.on("message", (d) => { try { got2.push(JSON.parse(d)); } catch (e) {} }); await new Promise((r) => w2.on("open", r)); w2.send(JSON.stringify({ t: "hello", uid: "u_" + Math.random().toString(36).slice(2, 12) })); await wait(400);
      const u2 = got2.find((m) => m.t === "welcome").uid; w2.send(JSON.stringify({ t: "doc.set", path: "players/" + u2, data: { name: "Poor", money: 2000, savedAt: Date.now() }, rid: "p1" })); await wait(400);
      w2.send(JSON.stringify({ t: "presence", patch: { x: plStop.x, y: plStop.y, rg: "portlouis" } })); await wait(300);
      const r2 = await new Promise((res) => { w2.on("message", (d) => { try { const m = JSON.parse(d); if (m.rid === "b1") res(m); } catch (e) {} }); w2.send(JSON.stringify({ t: "pass.buy", rid: "b1" })); });
      ok(!r2.ok && /5,000/.test(r2.error || ""), "the pass cannot be bought without Rs 5,000"); w2.close(); }
    ps = await ask("pass.buy"); ok(ps.ok && ps.has && ps.paid === 5000, "the pass costs Rs 5,000");
    ps = await ask("pass.buy"); ok(ps.ok && ps.paid === 0, "buying it twice charges nothing (safe to repeat)");
    ps = await ask("pass.state"); ok(ps.ok && ps.has === true, "the server remembers the pass");
    st0 = await ask("road.start", { to: "grandbaie", mode: "taxi" }); ok(st0.ok, "with the pass a taxi to Grand Baie starts");
    await wait(2300); ar0 = await ask("road.arrive"); pres({ x: ar0.x, y: ar0.y, rg: "grandbaie" }); l = await locked(); ok(ar0.ok && !l, "and the player arrives in Grand Baie");
    pres({ x: plStop.x, y: plStop.y, rg: "portlouis" }); l = await locked(); ok(l && l.why === "travel" && l.back.y < LAY("portlouis").y0, "jumping to Port Louis without a trip is refused and put back");
    pres({ x: flStop.x, y: flStop.y, rg: "west" }); l = await locked(); ok(l && l.why === "travel", "jumping to Flic en Flac without a trip is refused");
    let pl = await ask("road.plan", { to: "portlouis" }); ok(pl.ok && pl.km > 15 && pl.km < 30 && pl.modes.length === 3 && pl.via.includes("Pamplemousses and the north"), "the plan for Grand Baie to Port Louis follows the real road (" + pl.km + " km via " + (pl.via || []).join(", ") + ")");
    ok(pl.modes.find((x) => x.id === "bus").fare < pl.modes.find((x) => x.id === "taxi").fare && pl.modes.find((x) => x.id === "bus").minutes > pl.modes.find((x) => x.id === "taxi").minutes, "the bus is cheaper and slower than a taxi");
    let np = await ask("road.plan", { to: "north" }); ok(!np.ok, "you cannot plan a trip to a region that is not open");
    let st = await ask("road.start", { to: "portlouis", mode: "car" }); ok(!st.ok, "the car needs a car");
    st = await ask("road.start", { to: "portlouis", mode: "taxi" }); ok(st.ok && st.fare > 300 && st.secs >= 8, "a taxi to Port Louis starts (Rs " + st.fare + ", " + st.minutes + " min)");
    const again = await ask("road.start", { to: "west", mode: "bus" }); ok(again.ok && again.again && again.to === "portlouis", "asking again during a trip gives the same trip (safe to repeat)");
    let ar = await ask("road.arrive"); ok(!ar.ok, "you cannot arrive before the journey is over");
    pres({ x: plStop.x, y: plStop.y, rg: "portlouis" }); l = await locked(); ok(l && l.why === "travel", "and a phone that skips the journey is put back");
    await wait(2300); ar = await ask("road.arrive"); ok(ar.ok && ar.to === "portlouis" && ar.y >= LAY("portlouis").y0, "you arrive once the time is up");
    pres({ x: ar.x, y: ar.y, rg: "portlouis" }); l = await locked(); ok(!l, "and then you may stand in Port Louis");
    pres({ x: stop.x, y: stop.y, rg: "grandbaie" }); l = await locked(); ok(l && l.why === "travel", "going back to Grand Baie also needs a trip");
    pl = await ask("road.plan", { to: "west" }); ok(pl.ok && pl.km > 15 && pl.km < 35, "Port Louis to Flic en Flac is " + pl.km + " km by road");
    st = await ask("road.start", { to: "west", mode: "bus" }); ok(st.ok && st.wait >= 5, "a bus to Flic en Flac starts and has a wait (" + st.wait + " min)");
    await wait(2300); ar = await ask("road.arrive"); pres({ x: ar.x, y: ar.y, rg: "west" }); l = await locked(); ok(ar.ok && !l, "you arrive in Flic en Flac");
    // The highway between Port Louis and Flic en Flac is one continuous map with the town: walk north out of Flic en Flac and you are on it, no skipping
    const fl = LAY("west"), flX = mapOf("west").exits.find((e) => e.to === "portlouis").x, rb = LAY("road_portlouis_west");
    pres({ x: flX, y: fl.y0 + 1.5, rg: "west" }); l = await locked(); ok(!l, "walking to the Flic en Flac highway exit is fine");
    pres({ x: flX, y: fl.y0 - 3, rg: "road" }); l = await locked(); ok(!l, "from the exit you simply walk on to the highway");
    pres({ x: flX, y: fl.y0 - 60 }); l = await locked(); ok(l && l.why === "speed", "skipping 57 tiles of the highway in one step is refused");
    pres({ x: flX, y: fl.y0 - 14 }); l = await locked(); ok(!l, "but walking along it is fine");
    pres({ x: 60.5, y: LAY("portlouis").y0 + 20, rg: "portlouis" }); l = await locked(); ok(l && l.why === "travel", "you cannot jump from the middle of the highway into Port Louis");
    pres({ x: flX, y: fl.y0 - 3 }); l = await locked(); pres({ x: flX, y: fl.y0 + 2, rg: "west" }); l = await locked(); ok(!l, "walking back along the road puts you in Flic en Flac again");
    pres({ x: 60, y: rb.y0 + 5, rg: "road" }); l = await locked(); ok(l, "and the highway's far end cannot be reached from Flic en Flac");
    pres({ x: 20, y: 30, rg: "grandbaie" }); l = await locked(); ok(l && l.back.y > 232, "a phone that stands in the first game's old rows is put back");
    a = await admin("POST", { id: "west", open: false }); l = await locked(); ok(a.ok && l && l.id === "west", "closing Flic en Flac sends the player standing there back to Port Louis");
    pres({ x: plStop.x, y: plStop.y, rg: "portlouis" }); l = await locked(); ok(!l, "and the server then agrees they are in Port Louis");
    a = await admin("POST", { id: "portlouis", open: false }); a = await admin("POST", { id: "grandbaie", open: false }); ok(!a.ok, "the last region with a walkable map cannot be closed");
    a = await admin("POST", { id: "portlouis", open: true }); a = await admin("POST", { id: "west", open: true }); ok(a.ok, "the regions open again");
    while (await locked()) {} /* the lock notices from closing Port Louis, where the server sent the player to the next open town */ pres({ x: 3, y: 4, in: "home", rg: "grandbaie" }); l = await locked(); ok(!l, "indoors, room positions are not mistaken for regions");
    pres({ in: "" });
    ws.close();
  } finally { srv.kill(); await new Promise((r) => srv.on("exit", r)); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  console.log(fails ? fails + " failed" : "all passed"); process.exit(fails ? 1 : 0);
})();
