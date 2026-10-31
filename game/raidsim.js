"use strict";
// Raid battles. Pure and deterministic: the same base and the same crew always give the same result, so the server decides and
// the browser only replays the frames it is sent. The base is a walled compound seen from above (24 x 16 tiles).

const W = 24, H = 16, X0 = 5, X1 = 19, Y0 = 2, Y1 = 12; // the compound's walls run round x 5..19, y 2..12 (the gate is in the south wall)
const VAULT = { x: 12, y: 5.5 };
const DEF_KEYS = ["fence", "wall", "dog", "guard", "cam", "laser", "panic", "vault"];
const DEF_COST = { // what it costs to reach each level (1 to 5)
  fence: [8000, 20000, 40000, 70000, 120000], /* the light, cheap defense */ wall: [100000, 250000, 600000, 1200000, 2000000], dog: [150000, 350000, 800000, 1800000, 3000000], guard: [250000, 600000, 1300000, 2800000, 5000000],
  cam: [200000, 450000, 900000, 1600000, 2500000], laser: [500000, 1200000, 2500000, 4000000, 6000000], panic: [400000, 900000, 1800000, 3000000, 4000000], vault: [300000, 800000, 1800000, 3500000, 6000000]
};
const CREW = { rookie: { cost: 5000, hp: 60, speed: 2.2, pw: 0.45 }, bruiser: { cost: 20000, hp: 140, speed: 2.3, pw: 1 }, hacker: { cost: 50000, hp: 80, speed: 2.7 }, handler: { cost: 30000, hp: 90, speed: 2.9 }, driver: { cost: 40000, hp: 70, speed: 3 } };
const TROOP_MAX = 6, CREW_MAX = 8, STAR_PCT = [0, 3, 6, 10], VAULT_CUT = 0.08; // crew size, share of net worth per star, share of the loot each vault level protects

const tl = (TL, k) => Math.max(1, Math.min(TROOP_MAX, Math.floor(Number(TL && TL[k]) || 1))); // a troop type's level, 1 to 6
const lv = (L, k) => Math.max(0, Math.min(5, Math.floor(Number(L && L[k]) || 0)));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

const BOUNDS = { x0: X0 + 1.2, x1: X1 - 1.2, y0: Y0 + 1.0, y1: Y1 - 1.0 }; // where the owner may put things inside the walls
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
function counts(L) { const cl = lv(L, "cam"); return { g: lv(L, "guard"), d: Math.min(4, lv(L, "dog")), c: [0, 1, 2, 2, 3, 4][cl], l: Math.min(4, lv(L, "laser")), p: lv(L, "panic") > 0 ? 1 : 0 }; }
function defaultPos(L) { // where everything stands unless the owner moves it
  const n = counts(L); return { g: [[12, 9.2], [8.8, 7.6], [15.2, 7.6], [8.4, 4.6], [15.6, 4.6]].slice(0, n.g), d: [[10.5, 8.2], [13.5, 8.2], [10.3, 5.2], [13.7, 5.2]].slice(0, n.d), c: [[6.2, 3.2], [17.8, 3.2], [6.2, 10.8], [17.8, 10.8]].slice(0, n.c), l: [10.3, 8.8, 7.3, 6].slice(0, n.l), p: n.p ? [17.6, 6.4] : null, v: [12, 5.5] };
}
function cleanPos(L, P) { // the owner's layout, made safe: anything missing, outside the walls or on top of something else goes back to its default spot
  const D = defaultPos(L), n = counts(L), out = { g: [], d: [], c: [], l: [], p: null, v: D.v.slice() }, taken = []; P = P && typeof P === "object" ? P : {};
  const ok = (x, y, r) => Number.isFinite(x) && Number.isFinite(y) && x >= BOUNDS.x0 && x <= BOUNDS.x1 && y >= BOUNDS.y0 && y <= BOUNDS.y1 && !taken.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < r);
  const take = (arr, key, r) => { for (let i = 0; i < n[key]; i++) { const q = Array.isArray(P[key]) && Array.isArray(P[key][i]) ? [Math.round(num(P[key][i][0]) * 2) / 2, Math.round(num(P[key][i][1]) * 2) / 2] : [NaN, NaN]; const use = ok(q[0], q[1], r) ? q : D[key][i]; arr.push(use); taken.push(use); } };
  if (Array.isArray(P.v)) { const x = Math.round(num(P.v[0]) * 2) / 2, y = Math.round(num(P.v[1]) * 2) / 2; if (Number.isFinite(x) && Number.isFinite(y) && x >= BOUNDS.x0 + 0.8 && x <= BOUNDS.x1 - 0.8 && y >= BOUNDS.y0 + 0.5 && y <= BOUNDS.y1 - 1.8) out.v = [x, y]; } taken.push(out.v);
  take(out.g, "g", 1.2); take(out.d, "d", 1.2); take(out.c, "c", 1.0);
  if (n.p) { const q = Array.isArray(P.p) ? [Math.round(num(P.p[0]) * 2) / 2, Math.round(num(P.p[1]) * 2) / 2] : [NaN, NaN]; out.p = ok(q[0], q[1], 1.2) ? q : D.p; }
  for (let i = 0; i < n.l; i++) { const y = Array.isArray(P.l) ? Math.round(num(P.l[i]) * 2) / 2 : NaN; out.l.push(Number.isFinite(y) && y >= BOUNDS.y0 + 0.5 && y <= BOUNDS.y1 && !out.l.some((q) => Math.abs(q - y) < 1.0) ? y : D.l[i]); }
  return out;
}
function layout(L, Pin) { // where everything stands for a base with these defense levels (and the owner's own arrangement)
  const w = lv(L, "wall"), walls = [], P = cleanPos(L, Pin);
  const wallHp = 30 + w * 60 + lv(L, "fence") * 15; // a light fence toughens the walls a little
  for (let i = 0; i < 14; i++) walls.push({ x: X0 + i + 0.5, y: Y1, s: "b", i, max: i === 6 || i === 7 ? Math.round(wallHp * 0.6) : wallHp }); // south, with the gate in the middle
  for (let i = 0; i < 14; i++) walls.push({ x: X0 + i + 0.5, y: Y0, s: "t", i, max: wallHp });
  for (let i = 0; i < 10; i++) walls.push({ x: X0, y: Y0 + i + 0.5, s: "l", i, max: wallHp });
  for (let i = 0; i < 10; i++) walls.push({ x: X1, y: Y0 + i + 0.5, s: "r", i, max: wallHp });
  const gl = lv(L, "guard"), dl = lv(L, "dog"), cl = lv(L, "cam"), ll = lv(L, "laser"), pl = lv(L, "panic"), vl = lv(L, "vault");
  const guards = P.g.map(([x, y]) => ({ x, y, max: 70 + 12 * gl })), dogs = P.d.map(([x, y]) => ({ x, y, max: 45 + 8 * dl })), cams = P.c.map(([x, y]) => ({ x, y })), lasers = P.l.map((y) => ({ y, x0: 6, x1: 18 })), panic = P.p ? { x: P.p[0], y: P.p[1] } : null;
  return { W, H, X0, X1, Y0, Y1, walls, vault: { x: P.v[0], y: P.v[1], max: 40 + vl * 50 }, guards, dogs, cams, lasers, panic, lv: { fence: lv(L, "fence"), wall: w, dog: dl, guard: gl, cam: cl, laser: ll, panic: pl, vault: vl }, pos: P };
}

function crewCost(crew) { return crew.reduce((a, c) => a + CREW[c.k].cost, 0); }
function cleanCrew(raw) { // the crew an attacker asked for, made safe
  const out = []; for (const c of Array.isArray(raw) ? raw.slice(0, CREW_MAX) : []) { if (!c || !CREW[c.k]) continue; const x = Math.max(1, Math.min(W - 1, Number(c.x))); out.push({ k: c.k, x: Number.isFinite(x) ? Math.round(x * 2) / 2 : 12 }); }
  return out;
}

function simulate(L, crewIn, Pin, TL) { // fight the raid; returns { stars, frames, events, seen, ... }. Every half second there is a frame: where everyone is and what they are doing (state: 0 walking, 1 hitting a wall, 2 fighting a guard, 3 hacking, 4 calming a dog, 5 cracking the vault, 6 waiting)
  const lay = layout(L, Pin), crew = cleanCrew(crewIn), DT = 0.25, ev = [], frames = [], VX = lay.vault.x, VY = lay.vault.y;
  const wall = lay.walls.map((w) => ({ hp: w.max })), vault = { hp: lay.vault.max }, lastW = lay.walls.map((w) => w.max);
  const units = crew.map((c, i) => ({ k: c.k, x: c.x, y: H - 0.6 + (i % 2) * 0.3, hp: Math.round(CREW[c.k].hp * (1 + 0.2 * (tl(TL, c.k) - 1))), max: Math.round(CREW[c.k].hp * (1 + 0.2 * (tl(TL, c.k) - 1))), pw: (CREW[c.k].pw || 1) * (1 + 0.18 * (tl(TL, c.k) - 1)), speed: CREW[c.k].speed, work: 0, st: c.k === "driver" ? 6 : 0, tg: -1 }));
  const gl = lv(L, "guard"), dl = lv(L, "dog"), pl = lv(L, "panic"), cl = lv(L, "cam");
  const guards = lay.guards.map((g) => ({ x: g.x, y: g.y, hp: g.max, max: g.max, tg: -1 })), dogs = lay.dogs.map((d) => ({ x: d.x, y: d.y, hp: d.max, max: d.max, calm: 0, home: [d.x, d.y], tg: -1 }));
  const cams = lay.cams.map(() => ({ off: 0, work: 0 })), lasers = lay.lasers.map(() => ({ off: 0, work: 0 })), panic = lay.panic ? { off: 0, work: 0 } : null;
  const hackTime = 2.5 + 0.8 * Math.max(1, cl), laserHack = 2.5 + 0.8 * lv(L, "laser"), panicHack = 2.5 + 0.8 * pl;
  const hasDriver = units.some((u) => u.k === "driver"), limit = 60 + (hasDriver ? 20 : 0);
  let stars = 0, t = 0, alarmAt = -1, policeAt = -1, seen = false, end = "time", cracked = false, camSeen = false, fx = new Set();
  const note = (txt, k) => ev.push({ t: Math.round(t * 10) / 10, k: k || "info", txt });
  const alive = () => units.filter((u) => u.hp > 0 && u.k !== "driver"), inside = (u) => u.x > X0 && u.x < X1 && u.y > Y0 && u.y < Y1, r1 = (v) => Math.round(v * 10) / 10;
  const wallAt = (x, y, nx, ny) => { // the wall section a step from (x, y) to (nx, ny) runs into (or -1)
    if (y >= Y1 && ny < Y1 && x >= X0 && x < X1) return wall[Math.floor(x - X0)].hp > 0 ? Math.floor(x - X0) : -1; // south wall
    if (x <= X0 && nx > X0 && y >= Y0 && y < Y1) { const i = 28 + Math.floor(y - Y0); return wall[i].hp > 0 ? i : -1; } // west wall
    if (x >= X1 && nx < X1 && y >= Y0 && y < Y1) { const i = 38 + Math.floor(y - Y0); return wall[i].hp > 0 ? i : -1; } // east wall
    return -1;
  };
  const snap = () => { const wd = []; wall.forEach((q, i) => { const h = Math.max(0, Math.round(q.hp)); if (h !== lastW[i]) { lastW[i] = h; wd.push([i, h]); } });
    frames.push({ t: Math.round(t * 2) / 2, u: units.map((u) => [r1(u.x), r1(u.y), Math.max(0, Math.round(u.hp)), u.hp > 0 ? u.st : 7, u.tg]), g: guards.map((g) => Math.max(0, Math.round(g.hp))), gt: guards.map((g) => g.tg), d: dogs.map((d) => [r1(d.x), r1(d.y), Math.max(0, Math.round(d.hp)), d.calm ? 1 : 0, d.tg]), wd, v: Math.max(0, Math.round(vault.hp)), off: [cams.map((c) => c.off), lasers.map((c) => c.off), panic ? panic.off : 0], al: alarmAt >= 0 && !(panic && panic.off) ? Math.max(0, Math.round(policeAt - t)) : -1, s: stars, fx: [...fx] }); fx = new Set(); };
  snap();
  for (let step = 0; step * DT < limit + 0.01; step++) {
    t = step * DT;
    const act = alive(); if (!act.length) { end = "caught"; break; }
    for (const g of guards) g.tg = -1; for (const d of dogs) d.tg = -1; // who they aim at this moment
    // --- the crew ---
    for (const u of units) { if (u.hp <= 0 || u.k === "driver") continue; const ui = units.indexOf(u); u.tg = -1;
      let tx = VX, ty = VY, task = "vault", reach = 1.5;
      if (u.k === "bruiser" || u.k === "rookie") { const g = guards.filter((q) => q.hp > 0).sort((a, b) => dist(u.x, u.y, a.x, a.y) - dist(u.x, u.y, b.x, b.y))[0]; if (g && dist(u.x, u.y, g.x, g.y) < 4.5 && inside(u)) { tx = g.x; ty = g.y; task = "guard"; reach = 1.2; u.gi = guards.indexOf(g); } }
      if (u.k === "hacker") { const list = []; if (panic && !panic.off) list.push([lay.panic.x, lay.panic.y, "panic", 0, 0]); lasers.forEach((l, i) => { if (!l.off) list.push([lay.lasers[i].x0 - 0.3, lay.lasers[i].y, "laser", i, 1]); }); cams.forEach((c, i) => { if (!c.off) list.push([lay.cams[i].x, lay.cams[i].y, "cam", i, 2]); }); if (list.length) { const q = list[0]; tx = q[0]; ty = q[1]; task = q[2]; u.dev = q; reach = q[2] === "panic" ? 6.2 : q[2] === "laser" ? 4.5 : 5; } }
      if (u.k === "handler") { const d = dogs.filter((q) => !q.calm && q.hp > 0).sort((a, b) => dist(u.x, u.y, a.x, a.y) - dist(u.x, u.y, b.x, b.y))[0]; if (d) { tx = d.x; ty = d.y; task = "dog"; u.dog = d; reach = 1.3; } }
      const dx = tx - u.x, dy = ty - u.y, dd = Math.hypot(dx, dy); u.fx = dx; u.fy = dy; // which way they face
      if (dd <= reach) { // at the job
        if (task === "vault") { u.st = 5; vault.hp -= (u.k === "bruiser" || u.k === "rookie" ? 9 * u.pw : u.k === "hacker" ? 5 : 3) * DT; fx.add("vk:" + ui); if (!cracked && vault.hp <= 0) { cracked = true; stars = 3; note("The vault is open!", "star"); } }
        else if (task === "guard") { u.st = 2; u.tg = u.gi; const g = guards[u.gi]; if (g) { g.hp -= 9 * u.pw * DT; fx.add("hg:" + ui + ":" + u.gi); if (g.hp <= 0) note("A guard is down", "hit"); } }
        else if (task === "dog") { u.st = 4; u.tg = dogs.indexOf(u.dog); fx.add("cm:" + ui + ":" + u.tg); u.dog.work = (u.dog.work || 0) + DT; if (u.dog.work >= 2.5 + 0.4 * dl) { u.dog.calm = 1; note("A guard dog calmed down", "tech"); } }
        else if (u.dev) { u.st = 3; const q = u.dev, o = q[2] === "panic" ? panic : q[2] === "laser" ? lasers[q[3]] : cams[q[3]], need = q[2] === "panic" ? panicHack : q[2] === "laser" ? laserHack : hackTime; u.tg = q[4] * 10 + q[3]; fx.add("hk:" + ui + ":" + u.tg); o.work += DT; if (o.work >= need && !o.off) { o.off = 1; note(q[2] === "panic" ? "The panic button is dead" : q[2] === "laser" ? "A laser is off" : "A camera is blinded", "tech"); u.dev = null; } }
        continue;
      }
      const sp = u.speed * DT, nx = u.x + dx / dd * sp, ny = u.y + dy / dd * sp, wi = wallAt(u.x, u.y, nx, ny);
      if (wi >= 0) { u.st = 1; u.tg = wi; const q = wall[wi]; q.hp -= (u.k === "bruiser" || u.k === "rookie" ? 14 * u.pw : 2) * DT; fx.add("wl:" + ui + ":" + wi); if (q.hp <= 0) { note(wi === 6 || wi === 7 ? "The gate is smashed" : "A wall is down", "hit"); fx.add("wb:" + wi); } continue; }
      u.st = 0; u.x = nx; u.y = ny;
    }
    // --- stars ---
    if (stars < 1 && units.some((u) => u.hp > 0 && u.k !== "driver" && inside(u))) { stars = 1; note("They are inside!", "star"); if (cams.some((c) => !c.off) && cl > 0) camSeen = true; if (pl > 0 && panic && !panic.off) { alarmAt = t; policeAt = t + 36 - 5 * pl; note("Silent alarm! Police are on their way", "alarm"); } }
    if (stars < 2 && units.some((u) => u.hp > 0 && u.k !== "driver" && dist(u.x, u.y, VX, VY) <= 1.6)) { stars = 2; note("They reached the vault", "star"); }
    if (alarmAt >= 0 && panic && panic.off) { alarmAt = -1; policeAt = -1; note("The alarm was cut in time", "tech"); }
    // --- the defenders ---
    const camBoost = cams.some((c) => !c.off) ? 1.35 : 1;
    guards.forEach((g, gi) => { if (g.hp <= 0) return; const tg = units.filter((u) => u.hp > 0 && u.k !== "driver" && dist(g.x, g.y, u.x, u.y) <= 4.6).sort((a, b) => dist(g.x, g.y, a.x, a.y) - dist(g.x, g.y, b.x, b.y))[0]; if (tg) { const ti = units.indexOf(tg); g.tg = ti; fx.add("sh:" + gi + ":" + ti); tg.hp -= (3 + 1.1 * gl) * camBoost * DT; if (tg.hp <= 0) note("A " + tg.k + " was taken down", "hit"); } });
    dogs.forEach((d, di) => { if (d.hp <= 0 || d.calm) return; const tg = units.filter((u) => u.hp > 0 && u.k !== "driver" && inside(u) && dist(d.x, d.y, u.x, u.y) < 6).sort((a, b) => dist(d.x, d.y, a.x, a.y) - dist(d.x, d.y, b.x, b.y))[0];
      if (tg) { const ti = units.indexOf(tg), dd = dist(d.x, d.y, tg.x, tg.y); d.tg = ti; if (dd > 1) { d.x += (tg.x - d.x) / dd * 3.4 * DT; d.y += (tg.y - d.y) / dd * 3.4 * DT; } else { tg.hp -= (8 + 2 * dl) * DT; fx.add("bt:" + di + ":" + ti); if (tg.hp <= 0) note("A " + tg.k + " was mauled", "hit"); } if ((tg.k === "bruiser" || tg.k === "rookie") && dd <= 1.4) d.hp -= 12 * DT; }
      else { const hx = d.home[0] - d.x, hy = d.home[1] - d.y, hd = Math.hypot(hx, hy); if (hd > 0.2) { d.x += hx / hd * 2 * DT; d.y += hy / hd * 2 * DT; } } });
    lasers.forEach((l, i) => { if (l.off) return; const y = lay.lasers[i].y; units.forEach((u, ui) => { if (u.hp > 0 && u.k !== "driver" && Math.abs(u.y - y) < 0.35 && u.x > 6 && u.x < 18) { u.hp -= (14 + 3 * lv(L, "laser")) * DT; fx.add("lz:" + i + ":" + ui); if (u.hp <= 0) note("A " + u.k + " fried on a laser", "hit"); } }); });
    if (policeAt >= 0 && t >= policeAt) { end = "police"; note("The police arrived", "alarm"); snap(); break; }
    if (cracked) { end = "cracked"; note("Everything grabbed. Out!", "star"); snap(); break; }
    if (Math.abs(t * 2 - Math.round(t * 2)) < 1e-6) snap();
    if (step * DT >= limit - 1e-6) { end = "time"; note("Time is up", "info"); snap(); break; }
  }
  if (frames[frames.length - 1].t !== Math.round(t * 2) / 2) snap();
  const vcut = Math.min(0.5, VAULT_CUT * lv(L, "vault")), pct = STAR_PCT[stars] / 100 * (1 - vcut);
  return { layout: lay, crew: crew.map((c, i) => Object.assign({}, c, { max: units[i].max })), crewCost: crewCost(crew), stars, pct, end, seen: camSeen, events: ev.slice(0, 40), frames, limit, took: Math.round(t) };
}

module.exports = { simulate, layout, defaultPos, cleanPos, counts, crewCost, cleanCrew, CREW, CREW_MAX, TROOP_MAX, DEF_COST, DEF_KEYS, STAR_PCT, VAULT_CUT, lv, W, H };
