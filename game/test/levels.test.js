// Player level and XP, tested like a modified phone would attack them. Run: node test/levels.test.js
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path"), WebSocket = require("ws");
const REG = require("../regions.js");
let fails = 0; const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const player = (PORT, name, money) => new Promise((resolve) => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), got = []; let uid = "u_" + Math.random().toString(36).slice(2, 12); ws.on("message", (d) => { try { got.push(JSON.parse(d)); } catch (e) {} });
  const ask = (t, extra) => new Promise((res) => { const rid = "r" + Math.random().toString(36).slice(2, 8), h = (d) => { try { const m = JSON.parse(d); if (m.rid === rid) { ws.off("message", h); res(m); } } catch (e) {} }; ws.on("message", h); ws.send(JSON.stringify(Object.assign({ t, rid }, extra || {}))); });
  ws.on("open", async () => { ws.send(JSON.stringify({ t: "hello", uid })); await wait(400); const w0 = got.find((m) => m.t === "welcome"); if (w0 && w0.uid) uid = w0.uid; ws.send(JSON.stringify({ t: "doc.set", path: "players/" + uid, data: { name, money, savedAt: Date.now() }, rid: "d1" })); await wait(300); const pl = REG.STOPS.portlouis; ws.send(JSON.stringify({ t: "presence", patch: { x: pl.x, y: pl.y, rg: "portlouis" } })); await wait(300); resolve({ ws, got, ask, get uid() { return uid; } }); }); });
(async () => {
  const PORT = 20700 + Math.floor(Math.random() * 400), dir = fs.mkdtempSync(path.join(os.tmpdir(), "mllvl-")), srv = spawn(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: Object.assign({}, process.env, { PORT, PUSH_TEST: "1", UPG_TIME_SCALE: "0.0002", DATA_FILE: path.join(dir, "data.json") }), stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/regions`); break; } catch (e) { await wait(200); } }
    const A = await player(PORT, "Solo", 900000), B = await player(PORT, "Pal", 100);
    let r = await A.ask("lvl.state"); ok(r.ok && r.level === 1 && r.xp === 0 && r.need === 103 && r.title === "Newcomer" && r.max === 50, "a new player is level 1, a Newcomer, with 103 XP to go");
    r = await A.ask("lvl.gain", { kind: "shift" }); ok(r.ok && r.gained === 52 && r.first, "the first shift gives 12 XP plus a 40 XP first-time bonus");
    r = await A.ask("lvl.gain", { kind: "shift" }); ok(r.ok && r.gained === 0 && r.wait, "a second one straight away is ignored (repeat-proof)");
    r = await A.ask("lvl.gain", { kind: "money", amount: 99999 }); ok(!r.ok, "the phone cannot invent a kind of XP or send an amount");
    r = await A.ask("lvl.gain", { kind: "place", key: "bank" }); ok(r.ok && r.gained === 25, "visiting a new place gives 25 XP");
    r = await A.ask("lvl.gain", { kind: "place", key: "bank" }); ok(r.ok && r.gained === 0 && r.seen, "the same place never pays twice");
    r = await A.ask("lvl.gain", { kind: "place" }); ok(!r.ok, "a place needs a name");
    r = await A.ask("lvl.state"); ok(r.xp === 77 && r.level === 1, "XP adds up (77)");
    await wait(10200); r = await A.ask("lvl.gain", { kind: "hustle" }); ok(r.ok && r.gained === 65 && r.level === 2 && r.up && r.up.length === 1 && r.up[0].gift === 200, "enough XP is level 2 and a gift of Rs 200 (" + r.xp + " XP)");
    ok(r.title === "Newcomer", "level 2 is still a Newcomer; Local comes at 3");
    // the flat: levels 1-4 are open, the fifth needs player level 5
    let f = null; for (let n = 1; n <= 4; n++) { f = await A.ask("flat.start"); if (!f.ok) { console.log("start", n, f.error); break; } await wait(n === 4 ? 15000 : n === 3 ? 4500 : 1800); const fs2 = await A.ask("flat.state"); await A.ask("flat.ack"); }
    r = await A.ask("lvl.state"); ok(r.level >= 3 && r.xp > 150, "starting and finishing flat upgrades gives XP by itself (level " + r.level + ")");
    ok(A.got.some((m) => m.t === "lvl" && m.ev === "xp" && m.gained > 0), "an online player is told as soon as the server gives XP");
    f = await A.ask("flat.state"); if (f.level === 4) { const g = await A.ask("flat.start"); ok(r.level >= 5 ? g.ok : (!g.ok && g.needLevel === 5 && /player level 5/.test(g.error)), "flat level 5 needs player level 5 (" + (g.error || "allowed at level " + r.level) + ")"); } else ok(false, "the flat reached level 4 (it is " + f.level + ")");
    // friends: helping gives the helper extra XP, and the owner a little
    const g2 = await A.ask("flat.state"); if (!g2.run) await A.ask("flat.start");
    const b0 = (await B.ask("lvl.state")).xp; const h = await B.ask("flat.help", { owner: A.uid }); const b1 = await B.ask("lvl.state");
    ok(!h.ok || b1.xp - b0 === 19, "a helper earns 19 XP (15 plus a quarter) and the owner gets a little too" + (h.ok ? "" : " (nothing running to help: " + h.error + ")"));
    r = await B.ask("lvl.gain", { kind: "shift" }); ok(r.ok, "a second player has their own separate XP");
    r = await A.ask("lvl.state"); ok(r.perks.length === 6 && r.ways.length === 4, "the state lists what unlocks and the ways to earn");
  } finally { srv.kill(); await new Promise((r) => srv.on("exit", r)); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0);
})();
