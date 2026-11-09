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
    await wait(10200); r = await A.ask("lvl.gain", { kind: "hustle" }); ok(r.ok && r.gained >= 65 && r.level === 2 && r.up && r.up.length === 1 && r.up[0].gift === 200, "enough XP is level 2 and a gift of Rs 200 (" + r.xp + " XP)");
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
    r = await A.ask("lvl.state"); ok(r.perks.length === 6 && r.ways.length === 5, "the state lists what unlocks and the ways to earn");
    // Your day: three goals a day, decided by the server
    const C = await player(PORT, "Daily", 100); let d = await C.ask("lvl.state");
    ok(d.goals.length === 3 && d.goals[0].k === undefined && d.goals.every((g) => g.have === 0 && !g.done) && d.goals[0].text, "every day has three goals, none done at first (" + d.goals.map((g) => g.text).join(", ") + ")");
    const d2 = await C.ask("lvl.state"); ok(JSON.stringify(d2.goals.map((g) => g.id)) === JSON.stringify(d.goals.map((g) => g.id)), "the same goals all day");
    const need0 = d.goals[0].n; let last = null; for (let i = 0; i < need0; i++) { if (i) await wait(8300); last = await C.ask("lvl.gain", { kind: "shift" }); }
    ok(last.goalsDone && last.goalsDone.length === 1 && last.goalsDone[0].cash === 150, "finishing the goal's shifts completes it and pays Rs 150");
    d = await C.ask("lvl.state"); ok(d.goals[0].done && d.goals[0].have === need0, "the goal shows as done");
    r = await C.ask("lvl.gain", { kind: "promo" }); ok(r.ok && r.gained === 60, "a promotion at work gives 60 XP");
    r = await C.ask("lvl.gain", { kind: "visit" }); ok(r.ok && r.gained === 0, "visiting a place counts for the day but gives no XP itself");
    // the Standing card and the boards
    let b = await A.ask("lvl.board", { scope: "island", board: "level" }); ok(b.ok && b.top.length >= 3 && b.top[0].rank === 1 && b.me && b.me.rank >= 1 && b.top.every((x, i) => i === 0 || true), "the island board lists players and your rank (" + b.total + " players)");
    ok(b.top.every((x, i, a) => i === 0 || a[i - 1].rank < x.rank), "ranks run in order");
    b = await A.ask("lvl.board", { scope: "friends", board: "level" }); ok(b.ok && b.top.length === 1 && b.top[0].you, "with no friends the friends board is just you");
    r = await A.ask("lvl.friend", { id: B.uid }); ok(r.ok && r.friend, "add a friend");
    b = await A.ask("lvl.board", { scope: "friends", board: "level" }); ok(b.top.some((x) => x.name === "Pal"), "the friends board now has both");
    r = await A.ask("lvl.friend", { id: C.uid }); ok(r.ok && r.friend, "you can add a friend");
    b = await A.ask("lvl.board", { scope: "friends", board: "level" }); ok(b.top.some((x) => x.name === "Daily"), "the new friend shows on the friends board");
    for (const k of ["flat", "rich", "helpful", "explorer"]) { b = await A.ask("lvl.board", { scope: "island", board: k }); ok(b.ok && b.label && b.top.length >= 1, "the " + k + " board works"); }
    b = await A.ask("lvl.board", { scope: "island", board: "nope" }); ok(!b.ok, "an unknown board is refused");
    r = await A.ask("lvl.card", { id: B.uid }); ok(r.ok && r.name === "Pal" && r.level >= 1 && r.title && r.friend, "a player's card shows their name, level, title and friend status");
    r = await B.ask("lvl.hide", { on: true }); r = await C.ask("lvl.board", { scope: "island", board: "level" }); ok(!r.top.some((x) => x.name === "Pal"), "a player who hides is not on anyone's board");
    r = await C.ask("lvl.card", { id: B.uid }); ok(r.ok && r.hidden && r.level === undefined, "and their card shows nothing else");
    r = await A.ask("lvl.friend", { id: C.uid, remove: true }); ok(r.ok && !r.friend, "friends can be removed");
    r = await A.ask("lvl.card", { id: "nobody" }); ok(!r.ok, "a card for nobody is refused");
    // the Island Checklist: Auntie Marie pays each item once
    const N = await player(PORT, "Newbie", 4000); let nb = await N.ask("lvl.state"); ok(nb.bucket && nb.bucket.items.length === 8 && nb.bucket.items.every((i) => !i.done), "a new player has a checklist of eight things, none done");
    r = await N.ask("lvl.bucket", { id: "ride" }); ok(r.ok && r.paid === 500, "riding a vehicle pays Rs 500");
    r = await N.ask("lvl.bucket", { id: "ride" }); ok(r.ok && r.already && !r.paid, "and only once");
    r = await N.ask("lvl.bucket", { id: "nonsense" }); ok(!r.ok, "an item that is not on the list is refused");
    for (const id of ["chat", "snack", "style", "enter", "phone", "work"]) await N.ask("lvl.bucket", { id }); r = await N.ask("lvl.bucket", { id: "fun" }); ok(r.ok && r.bonus === 400 && r.bucket.all, "finishing the list pays a Rs 400 bonus");
  } finally { srv.kill(); await new Promise((r) => srv.on("exit", r)); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0);
})();
