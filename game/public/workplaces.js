"use strict";
// WORKPLACES: every job happens in a room built like the real place, with co-workers and customers doing their own jobs around you.
// Each kind of workplace (a restaurant, a bank, a bakery...) is one entry in WK: its size, floor, furniture, the spot where YOU work (by job level),
// the staff and customers (each one walks a loop through the room) and the walls and props in 3D.
// Loaded after the game page, so it can use the page's helpers (box, cyl, sph, personAt, ROOMDEF, ...).
(function () {
  (() => { const st = document.createElement("style"); st.textContent = "#csn.sheet{inset:auto 0 0 0;height:52%;border-radius:20px 20px 0 0;background:linear-gradient(#2a0a12f0,#14070cf8);box-shadow:0 -10px 30px #000a;padding-top:12px}"; document.head.append(st); })();
  const WK = {}; // by building kind (the gbKind of the shop)
  const FACE_V = [[0, 1], [0, -1], [-1, 0], [1, 0]]; // facing 0 looks down the screen (+z), 1 up (-z), 2 left (-x), 3 right (+x)

  // ---------- small 3D building blocks (all coordinates are in the room: x across, z deep, y up)
  const B = (gr, w, h, d, col, x, y, z) => box(w, h, d, col, x, y, z, gr);
  const C = (gr, rt, rb, h, col, x, y, z, seg) => cyl(rt, rb, h, col, x, y, z, gr, seg || 12);
  const S = (gr, r, col, x, y, z) => sph(r, col, x, y, z, gr, 10);
  const glassMat = () => new THREE.MeshLambertMaterial({ color: 0xcfe9f3, transparent: true, opacity: 0.3, depthWrite: false });
  const glass = (gr, w, h, d, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), glassMat(), x, y, z, gr, false);
  const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const glowAt = (gr, c, r, x, y, z) => { const m = mesh(new THREE.SphereGeometry(r, 8, 6), glowMat(c), x, y, z, gr, false); return m; };
  const signAt = (gr, text, x, y, z, hh, bg, fg, ry) => { const m = mesh(geo("plane", () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: textTex(text, bg, fg || "#ffffff", 64) }), x, y, z, gr, false); m.scale.set(hh * m.material.map.userData.aspect, hh, 1); m.rotation.y = ry || 0; return m; };
  const counter = (gr, x, z, len, dep, body, top, h) => { h = h || 0.95; B(gr, len, h, dep, body, x, h / 2, z); B(gr, len + 0.08, 0.06, dep + 0.08, top, x, h + 0.03, z); };
  const tableRound = (gr, x, z, r, top, cloth) => { C(gr, r, r, 0.06, top, x, 0.72, z, 18); C(gr, 0.06, 0.08, 0.7, "#4a3a2a", x, 0.35, z, 8); C(gr, 0.32, 0.32, 0.04, "#4a3a2a", x, 0.02, z, 12); if (cloth) C(gr, r + 0.04, r + 0.12, 0.2, cloth, x, 0.62, z, 18); };
  const chair = (gr, x, z, face, col) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = [0, Math.PI, -Math.PI / 2, Math.PI / 2][face]; box(0.42, 0.06, 0.42, col, 0, 0.45, 0, g); box(0.42, 0.48, 0.06, col, 0, 0.72, -0.2, g); for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) box(0.05, 0.45, 0.05, "#3a3a3e", dx, 0.22, dz, g); gr.add(g); };
  const stool = (gr, x, z, h, col) => { C(gr, 0.19, 0.19, 0.07, col || "#8a2f2f", x, h, z, 12); C(gr, 0.04, 0.05, h, "#5a5a5e", x, h / 2, z, 6); C(gr, 0.18, 0.18, 0.03, "#5a5a5e", x, 0.02, z, 10); };
  const plant = (gr, x, z) => { C(gr, 0.2, 0.15, 0.3, "#8a5a34", x, 0.15, z, 10); S(gr, 0.34, "#2f8f4a", x, 0.62, z); S(gr, 0.24, "#3da05a", x + 0.12, 0.88, z - 0.05); };
  const crockery = (gr, x, y, z, n) => { for (let i = 0; i < n; i++) C(gr, 0.12, 0.12, 0.015, "#f4f1e8", x + (i % 2) * 0.01, y + i * 0.02, z, 12); };
  const steel = "#b8c0c6", steelDk = "#7f8a92";
  const sink = (gr, x, z, len) => { len = len || 2.2; B(gr, len, 0.9, 0.8, steel, x, 0.45, z); B(gr, len - 0.5, 0.05, 0.55, "#4d5a63", x, 0.92, z); B(gr, len + 0.06, 0.05, 0.86, steelDk, x, 0.92 + 0.02, z - 0.0); B(gr, 0.7, 0.04, 0.5, "#cdd5da", x - len / 2 + 0.5, 0.97, z); C(gr, 0.03, 0.03, 0.4, "#c9ced3", x, 1.15, z - 0.28, 8); B(gr, 0.06, 0.06, 0.28, "#c9ced3", x, 1.34, z - 0.14); crockery(gr, x + len / 2 - 0.4, 0.97, z, 7); B(gr, 0.5, 0.05, 0.4, "#e8eef1", x + len / 2 - 0.4, 1.18, z - 0.22); }; // steel dish sink with a tap and a rack of plates
  const stove = (gr, x, z) => { B(gr, 2.0, 0.9, 0.85, steel, x, 0.45, z); B(gr, 2.05, 0.05, 0.9, steelDk, x, 0.92, z); for (const dx of [-0.5, 0.5]) for (const dz of [-0.15, 0.2]) { C(gr, 0.2, 0.2, 0.02, "#1b1d20", x + dx, 0.96, z + dz, 12); } C(gr, 0.2, 0.18, 0.28, "#7f8a92", x - 0.5, 1.1, z - 0.15, 12); C(gr, 0.18, 0.18, 0.2, "#a85a2a", x + 0.5, 1.06, z + 0.2, 12); B(gr, 1.6, 0.5, 0.5, "#9aa4ab", x, 2.35, z - 0.15); B(gr, 0.5, 0.9, 0.4, "#9aa4ab", x, 2.95, z - 0.2); for (const dx of [-0.5, 0.5]) glowAt(gr, 0xff7a2a, 0.08, x + dx, 0.99, z + 0.0); for (const dx of [-0.6, 0, 0.6]) B(gr, 0.1, 0.1, 0.04, "#2a2e33", x + dx, 0.7, z + 0.44); };
  const fridge = (gr, x, z, col) => { B(gr, 1.0, 2.0, 0.8, col || "#e9eef1", x, 1.0, z); B(gr, 0.04, 0.8, 0.04, "#9aa4ab", x - 0.4, 1.4, z + 0.42); B(gr, 0.96, 0.02, 0.02, "#9aa4ab", x, 1.1, z + 0.41); };
  const deskSet = (gr, x, z, face, col, mon, chairCol) => { // a desk with its monitor facing the person who sits there (facing `face`); returns where they sit
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = [Math.PI, 0, Math.PI / 2, -Math.PI / 2][face]; const c0 = col || "#8a5a34"; box(1.5, 0.72, 0.75, c0, 0, 0.36, 0, g); box(1.56, 0.05, 0.8, shade(c0, 1.2), 0, 0.75, 0, g);
    if (mon !== false) { box(0.5, 0.34, 0.04, "#1e2226", 0, 1.08, -0.15, g); box(0.44, 0.28, 0.02, "#8fd0ff", 0, 1.08, -0.13, g); box(0.1, 0.14, 0.08, "#1e2226", 0, 0.86, -0.15, g); box(0.4, 0.02, 0.14, "#2a2e33", 0, 0.78, 0.14, g); } gr.add(g);
    const v = FACE_V[face], sx = x - v[0] * 0.85, sz = z - v[1] * 0.85; chair(gr, sx, sz, face, chairCol || "#2a2e35"); return [sx, sz]; };
  const bench = (gr, x, z, len, col) => { box0(gr, len, 0.1, 0.5, col || "#8a5a34", x, 0.45, z); box0(gr, len, 0.5, 0.08, col || "#8a5a34", x, 0.72, z - 0.22); for (const dx of [-len / 2 + 0.1, len / 2 - 0.1]) box0(gr, 0.08, 0.45, 0.45, "#3a3a40", x + dx, 0.22, z); };
  const box0 = (gr, w, h, d, c, x, y, z) => box(w, h, d, c, x, y, z, gr);
  const clock = (gr, x, y, z) => { C(gr, 0.35, 0.35, 0.05, "#f4f1e8", x, y, z, 20).rotation.x = Math.PI / 2; box(0.03, 0.26, 0.02, "#222", x, y + 0.08, z + 0.04, gr); box(0.2, 0.03, 0.02, "#222", x + 0.08, y, z + 0.04, gr); };
  const rope = (gr, x0, z0, x1, z1, col) => { const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.4) + 1); for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * i / (n - 1), z = z0 + (z1 - z0) * i / (n - 1); C(gr, 0.03, 0.03, 0.9, "#c9a227", x, 0.45, z, 6); S(gr, 0.06, "#c9a227", x, 0.92, z); C(gr, 0.14, 0.14, 0.03, "#8f7414", x, 0.02, z, 8); } const len = Math.hypot(x1 - x0, z1 - z0), m = B(gr, len, 0.03, 0.03, col || "#b3261e", (x0 + x1) / 2, 0.84, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); };
  const shelfUnit = (gr, x, z, len, dep, tiers, ry, cols, body) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; box(len, 0.06, dep, body || "#7c8791", 0, 0.05, 0, g); for (let t = 0; t <= tiers; t++) box(len, 0.04, dep, body || "#7c8791", 0, 0.1 + t * 0.5, 0, g); for (const sx of [-len / 2, len / 2]) box(0.05, 0.1 + tiers * 0.5, dep, body || "#5d6770", sx, (0.1 + tiers * 0.5) / 2, 0, g); box(len, 0.1 + tiers * 0.5, 0.04, "#5d6770", 0, (0.1 + tiers * 0.5) / 2, -dep / 2, g); const cc = cols || ["#e4572e", "#f3a712", "#5dd39e", "#3d9be9", "#f4f1e8", "#b07be0", "#ef6f9c"]; for (let t = 0; t < tiers; t++) for (let i = 0; i < Math.floor(len / 0.3); i++) { const hh = 0.22 + ((i * 7 + t * 3) % 4) * 0.04; box(0.22, hh, dep * 0.7, cc[(i + t * 3) % cc.length], -len / 2 + 0.2 + i * 0.3, 0.12 + t * 0.5 + hh / 2, 0, g); } for (let i = 0; i < Math.floor(len / 0.3); i++) box(0.24, 0.26 + (i % 3) * 0.04, dep * 0.8, cc[(i * 2 + 1) % cc.length], -len / 2 + 0.2 + i * 0.3, 0.1 + tiers * 0.5 + 0.17, 0, g); /* products on top, so you can see them from above */ gr.add(g); };
  const blk = (set, x0, y0, x1, y1) => { for (let y = Math.floor(y0); y <= Math.floor(y1) + 1; y++) for (let x = Math.floor(x0); x <= Math.floor(x1) + 1; x++) if (x + 0.5 >= x0 - 1e-6 && x + 0.5 <= x1 + 1e-6 && y + 0.5 >= y0 - 1e-6 && y + 0.5 <= y1 + 1e-6) set.add(x + "," + y); }; // furniture: a tile is blocked when its centre is inside the rectangle, so people can still stand on a tile that is only half covered
  const tableBlock = (set, x, y) => set.add(Math.floor(x) + "," + Math.floor(y)); // a table blocks the one tile it stands on

  // ---------- the people: every actor walks a loop of stops [x, y, seconds to stay, facing, pose, what they hold, what they say, carry it when leaving (1), seat height]
  const UNI = { chef: ["#f4f1e8", "#2b2f36"], waiter: ["#1d2a36", "#1d2a36"], cleaner: ["#3d9be9", "#22364a"], bank: ["#1f3d6b", "#1d2630"], guard: ["#2b3a52", "#1d2630"], apron: ["#c2457a", "#3a3030"], market: ["#2f7d4a", "#4a3a2a"], conductor: ["#2d6f46", "#2a2e35"], baker: ["#f4f1e8", "#8a6a44"], bar: ["#111418", "#1a1d22"], shop: ["#c0392b", "#22364a"] };
  const staffLook = (i, kind, extra) => { const u = UNI[kind] || UNI.shop; return Object.assign({ g: i % 2 ? "f" : "m", skin: SKINS[(i * 2 + 1) % 5], hair: ["#17100c", "#3a2414", "#101010", "#2a1a10", "#d8d8d8"][(i * 3) % 5], shirt: u[0], pants: u[1], role: "resident", hs: i % 2 ? "bun" : "short" }, extra || {}); };
  const mkActor = (d) => { // work out the timeline of one loop
    const a = Object.assign({ spd: 1.25, off: 0, seed: 0 }, d), n = a.nodes.length, segs = []; let t = 0;
    for (let i = 0; i < n; i++) { const nd = a.nodes[i], pv = a.nodes[(i + n - 1) % n]; const dist = Math.hypot(nd[0] - pv[0], nd[1] - pv[1]); if (dist > 0.05) { const dur = dist / a.spd; segs.push({ t0: t, t1: t + dur, walk: 1, a: pv, b: nd, i }); t += dur; } const w = nd[2] || 0; if (w > 0) { segs.push({ t0: t, t1: t + w, walk: 0, b: nd, i }); t += w; } }
    a.segs = segs; a.T = Math.max(1, t); return a; };
  const actorAt = (a, sec) => { const u = sec + a.off, cyc = Math.floor(u / a.T), t = u - cyc * a.T; let sg = a.segs[a.segs.length - 1]; for (const q of a.segs) if (t < q.t1) { sg = q; break; }
    const look = a.looks ? a.looks[(a.seed + cyc * 5) % a.looks.length] : a.look; let x, y, face, pose = "", h = 0, prop = "", say = ""; const nd = sg.b;
    if (sg.walk) { const f = Math.max(0, Math.min(1, (t - sg.t0) / (sg.t1 - sg.t0))); x = sg.a[0] + (nd[0] - sg.a[0]) * f; y = sg.a[1] + (nd[1] - sg.a[1]) * f; const dx = nd[0] - sg.a[0], dy = nd[1] - sg.a[1]; face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 0 : 1; prop = sg.a[7] ? (sg.a[5] || "") : ""; /* you carry what you picked up at the stop you left, when that stop says so */ }
    else { x = nd[0]; y = nd[1]; face = nd[3] == null ? 0 : nd[3]; pose = nd[4] || ""; prop = nd[5] || ""; say = nd[6] || ""; h = nd[8] || 0; }
    return { x, y, face, moving: !!sg.walk, pose, h, prop, say, look, hide: !sg.walk && nd[4] === "hide" }; };

  // ---------- applying a workplace to every building of its kind
  const workState = () => (busy && busy.a && busy.a.job !== undefined && s.inside && ROOMDEF[s.inside] && ROOMDEF[s.inside].wk ? { room: s.inside, def: ROOMDEF[s.inside], spot: busy.pose && busy.pose.spotI } : null);
  const townOf = (b) => regionOfY(b.y);
  function applyKind(b, kind) {
    const cfg = WK[kind]; if (!cfg) return; const town = townOf(b), block = new Set(); if (cfg.block) cfg.block(block);
    const def = { w: cfg.w, h: cfg.h, floor: cfg.floor, floorAt: cfg.floorAt, accent: cfg.accent, mood: cfg.mood || "warm", st: cfg.st.map((q) => q.slice()), block, wk: kind, build3d: (gr, w, h) => cfg.build(gr, w, h, b) };
    if (R && R.rooms && R.rooms[b.id]) { R.scene.remove(R.rooms[b.id]); delete R.rooms[b.id]; } // a room built before this loaded is rebuilt
    const looks = []; for (let i = 0; i < 8; i++) looks.push(ambLook(i * 3 + (b.x | 0) % 7, town));
    def.actors = (cfg.actors ? cfg.actors(looks, b) : []).map(mkActor); def.spots = cfg.spots; def.actSpots = cfg.actSpots; def.games = cfg.games; ROOMDEF[b.id] = def;
    ROOM[b.id] = def.st.map((q, k) => ({ k, icon: q[0], name: q[1], kind: q[2], x: q[3], y: q[4], use: !!q[5], acts: () => stationActs(b.id, k) }));
    ROOM[b.id].push({ icon: "🚪", name: "Exit", kind: "", x: def.w / 2, y: def.h - 1.5, use: true, exit: true });
  }
  const NOT_WORK = /^(?!.*(?:shift|Part-time|Stack shelves|Help on)).*$/i, IS_WORK = /shift|Part-time|Stack shelves|Help on/i; // which actions belong to the staff area and which to the customer counter

  const X = window.WKX = {
    WK, B, C, S, glass, glowAt, signAt, counter, tableRound, chair, stool, plant, crockery, sink, stove, fridge, deskSet, bench, clock, rope, shelfUnit, blk, tableBlock, staffLook, NOT_WORK, IS_WORK, FACE_V,
    applyAll() { for (const b of GBSHOPS) if (WK[b.gbKind]) applyKind(b, b.gbKind); },
    spot(a) { // where you stand and how you work, for this action in this room
      const def = s.inside && ROOMDEF[s.inside]; if (def && def.actSpots && !a.job) { const i = def.actSpots.findIndex((q) => q.re.test(a.label || "")); if (i >= 0) { const q = def.actSpots[i]; return { k: q.pose, x: q.x, y: q.y, h: q.h || 0, face: q.face == null ? 0 : q.face, prop: q.prop || "", spotI: 100 + i }; } } if (!def || !def.spots) return null; const lv = a.job ? level(a.job) : 0, pt = !a.job && /Part-time|Stack|Help on/i.test(a.label || "");
      let i = def.spots.findIndex((q) => (pt ? q.pt : q.lv && q.lv.includes(lv))); if (i < 0) i = 0; const q = def.spots[i]; return { k: q.pose, x: q.x, y: q.y, h: q.h || 0, face: q.face == null ? 0 : q.face, prop: q.prop || "", spotI: i }; },
    state: workState,
    at: null, // the pose you hold while you play a game at a table or machine
    inCasino() { const d = s.inside && ROOMDEF[s.inside]; return !!(d && d.games); },
    seat(game, then) { // walk to the table or machine for this game, take your place, then open the game
      const d = ROOMDEF[s.inside], g = d && d.games && d.games[game]; if (!g) { then(); return; } closeMenu(); const route = Math.hypot(s.x - g.x, s.y - g.y) > 0.5 ? findPath(s.x, s.y, g.x, g.y) : [];
      const steps = route ? route.length : 0; if (steps) { path = route; pending = null; toast("🚶 Taking your place…"); } const t0 = performance.now(), iv = setInterval(() => { if (!s.inside || performance.now() - t0 > 8000 + steps * 1500) { clearInterval(iv); return; } if (!path.length || Math.hypot(s.x - g.x, s.y - g.y) < 0.6) { clearInterval(iv); path = []; s.x = g.x; s.y = g.y; s.face = g.face; X.at = { k: g.pose, x: g.x, y: g.y, h: g.h || 0, face: g.face, prop: g.prop || "" }; X.game = game; then(); } }, 200); },
    unseat() { X.at = null; X.game = ""; },
    ticks: [],
    draw(now) { // the co-workers and customers of the room you are in
      const def = ROOMDEF[s.inside]; if (!def) return; for (const f of X.ticks) f(now, def); if (!def.actors) return; const ws = workState(), sec = now / 1000;
      for (const a of def.actors) { if (a.yield !== undefined && ws && ws.spot === a.yield) continue; const q = actorAt(a, sec); if (q.hide) continue; personAt("wk_" + s.inside + "_" + a.id, q.look, q.x, q.y, q.face, q.moving, { name: "", bubble: q.say, pose: q.pose ? { k: q.pose, x: q.x, y: q.y, h: q.h, face: q.face, prop: q.prop } : null, prop: q.prop }); } }
  };
  // the game you are playing is dropped when you walk away or leave the room
  setInterval(() => { try { if (X.at && (!s.inside || path.length || Math.hypot(s.x - X.at.x, s.y - X.at.y) > 0.8)) { X.at = null; X.game = ""; const b = document.getElementById("csn"); if (b) b.remove(); } } catch (e) {} }, 400);
})();
