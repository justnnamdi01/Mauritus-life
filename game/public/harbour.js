"use strict";
// THE HARBOURS: every ship and boat has a job and a timetable, and you can ride some of them.
//  · Each vessel runs a PROGRAM (a list of legs: dock, sail, hold, away) that is worked out from the shared clock, so it is the same for every player, never drifts,
//    never jerks, and two vessels are never in the same place (the timetable is checked when the game loads).
//  · Routes are planned on the real map with a water-only search that keeps every hull clear of the shore, and are smoothed into curves.
//  · Ferries shuttle between two piers. Day cruises and pirogue trips leave a pier, make a loop and come back. Big ships call at a quay, load and unload, and leave.
//    Fishing boats go out to their grounds and come home. A tug works the harbour.
//  · Ferries, yachts and pirogues can be ridden: board at the pier, sit on deck, look around, get off where it docks.
// Replaces the old random ship movement. Loaded after the game page.
(function () {
  const SC = 0.62; // the hulls are drawn smaller than their size on the map so they fit the narrow harbours
  const HB = window.HB = { v: [], berths: [], ready: 0, ride: null, k: 0, look: 0, ph: 0 };
  const KIND = { // len/clearance of each kind, sailing speed (tiles a second at its fastest), how long it sits at a berth, and whether you can ride it
    cargo: { need: 1.5, sp: 0.9, dock: 110 }, tanker: { need: 1.5, sp: 0.8, dock: 130 }, cruise: { need: 1.5, sp: 0.8, dock: 150 },
    ferry: { need: 1.2, sp: 1.5, dock: 40, ride: { fare: 120, fx: { fun: 14, social: 6 }, seat: [1.9, 0, 0.75], mins: 6, msg: "A cool breeze, a view of the whole bay, and the engine humming under your feet." } },
    yacht: { need: 1.05, sp: 0.9, dock: 40, ride: { fare: 250, fx: { fun: 26, social: 8 }, seat: [-0.9, 0, 0.62], mins: 12, msg: "Sails full, spray on your face, and the coast sliding past. A proper day on the water." } },
    pirogue: { need: 0.95, sp: 0.7, dock: 30, ride: { fare: 80, fx: { fun: 18, social: 4 }, seat: [0, 0, 0.42], mins: 8, msg: "Gliding over the lagoon in a painted pirogue, with fish flashing under you." } },
    fishing: { need: 1.1, sp: 0.8, dock: 60 }, tug: { need: 1.15, sp: 1.0, dock: 40 }
  };
  const WANT = { grandbaie: ["ferry", "ferry", "yacht", "yacht", "fishing", "pirogue"], portlouis: ["ferry", "cargo", "tanker", "cruise", "tug", "fishing", "yacht"], west: ["pirogue", "pirogue", "fishing", "fishing", "yacht"] };
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const smooth = (u) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u)))) / 2;
  // ------------------------------------------------------------------ the sea of one town: where water is, and how far from shore
  function grid(r) {
    const w = r.M.w, h = r.M.h, y0 = r.y0, water = new Uint8Array(w * h), ld = new Float32Array(w * h).fill(9);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y0 + y) * W + x; water[y * w + x] = terr[i] <= 1 && solid[i] !== 1 ? 1 : 0; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!water[y * w + x]) { ld[y * w + x] = 0; continue; } let best = 6; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; if (!water[yy * w + xx]) { const d = Math.hypot(dx, dy); if (d < best) best = d; } } ld[y * w + x] = best; }
    return { r, w, h, y0, water, ld, at: (x, y) => { const tx = Math.floor(x), ty = Math.floor(y - y0); return tx < 0 || ty < 0 || tx >= w || ty >= h ? (tx < 0 || tx >= w ? 6 : 0) : ld[ty * w + tx]; } };
  }
  function clearLine(G, a, b, need) { const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / 0.5)); for (let k = 0; k <= n; k++) if (G.at(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n) < need) return false; return true; }
  function astar(G, a, b, need) { // water-only route keeping `need` tiles from the shore, preferring open water
    const { w, h, y0 } = G, sx = Math.floor(a.x), sy = Math.floor(a.y - y0), gx = Math.floor(b.x), gy = Math.floor(b.y - y0), idx = (x, y) => y * w + x; if (sx < 0 || sy < 0 || sx >= w || sy >= h || gx < 0 || gy < 0 || gx >= w || gy >= h) return null;
    const g = new Float32Array(w * h).fill(1e9), from = new Int32Array(w * h).fill(-1), open = [[0, idx(sx, sy)]], closed = new Uint8Array(w * h); g[idx(sx, sy)] = 0;
    const ok = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (G.ld[idx(x, y)] >= need || (x === sx && y === sy) || (G.ld[idx(x, y)] >= 0.9 && (Math.hypot(x - sx, y - sy) < 14 || Math.hypot(x - gx, y - gy) < 14))); const hp = (x, y) => Math.hypot(x - gx, y - gy);
    const push = (it) => { open.push(it); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } }, pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r2 = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r2 < open.length && open[r2][0] < open[m][0]) m = r2; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
    open.length = 0; push([hp(sx, sy), idx(sx, sy)]);
    while (open.length) { const [, c] = pop(); if (closed[c]) continue; closed[c] = 1; const cx = c % w, cy = (c / w) | 0; if (cx === gx && cy === gy) { const out = []; let k = c; while (k >= 0) { out.push({ x: (k % w) + 0.5, y: y0 + ((k / w) | 0) + 0.5 }); k = from[k]; } return out.reverse(); }
      for (const [dx, dy, cost] of DIRS) { const nx = cx + dx, ny = cy + dy; if (!ok(nx, ny) && !(nx === gx && ny === gy)) continue; if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue; const n = idx(nx, ny), pen = 1 + Math.max(0, 5 - G.ld[n]) * 0.35, ng = g[c] + cost * pen; if (ng < g[n]) { g[n] = ng; from[n] = c; push([ng + hp(nx, ny), n]); } } }
    return null; }
  function pull(G, p, need) { if (p.length < 3) return p; const out = [p[0]]; let i = 0; while (i < p.length - 1) { let j = p.length - 1; while (j > i + 1 && !clearLine(G, p[i], p[j], need)) j--; out.push(p[j]); i = j; } return out; }
  function chaikin(p, n) { for (let k = 0; k < n; k++) { const o = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; o.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }); } o.push(p[p.length - 1]); p = o; } return p; }
  function route(G, pts, need) { // join several stops into one smooth, water-only path (null if any piece cannot be sailed)
    let all = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], nd = a.b || b.b ? Math.min(need, 0.9) : need; let seg; if (clearLine(G, a, b, nd)) seg = [a, b]; else { const raw = astar(G, a, b, nd); if (!raw) { (HB.rfail = HB.rfail || []).push([i, Math.round(a.x), Math.round(a.y), +G.at(a.x, a.y).toFixed(1), Math.round(b.x), Math.round(b.y), +G.at(b.x, b.y).toFixed(1), nd]); return null; } seg = pull(G, raw, nd); seg[0] = a; seg[seg.length - 1] = b; } all = all.concat(seg.slice(1)); }
    const sm = chaikin(all, 2); for (let i = 4; i < sm.length - 4; i += 2) if (G.at(sm[i].x, sm[i].y) < Math.min(need, 1.2) * 0.55) return mk(all); return mk(sm); }
  function mk(p) { const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y)); return { pts: p, cum, L: cum[cum.length - 1] }; }
  function at(P, d) { d = Math.max(0, Math.min(P.L, d)); const c = P.cum; let i = 1; while (i < c.length - 1 && d > c[i]) i++; const a = P.pts[i - 1], b = P.pts[i], sl = c[i] - c[i - 1] || 1, f = Math.max(0, Math.min(1, (d - c[i - 1]) / sl)); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, hx: (b.x - a.x) / sl, hy: (b.y - a.y) / sl }; }
  // ------------------------------------------------------------------ berths: a spot in the water alongside the shore, with a clear way in and a clear way out
  function berths(G, len, need) {
    const r = G.r, { w, h, y0 } = G, out = [], stop = r.stop || { x: w / 2, y: y0 + h / 2 };
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { const gi = (y0 + y) * W + x; if (!(terr[gi] >= 2 && solid[gi] !== 1)) continue; let nx = 0, ny = 0, n = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const xx = x + dx, yy = y + dy; if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue; if (G.water[yy * w + xx]) { nx += dx; ny += dy; n++; } } if (n < 6) continue; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const big = len / SC > 8, mid = len / SC > 4, want0 = (big ? 3.4 : mid ? 2.8 : 2.2) * 0.85, T = { x: x + 0.5, y: y0 + y + 0.5 }, Wd = (big ? 2.4 : mid ? 1.5 : 0.9) * SC; let pos = null, sg0 = 1; // the whole hull must sit in water at the berth: move off the shore until it does
      for (let extra = 0; extra <= 3 && !pos; extra += 0.5) { const c = { x: T.x + nx * (want0 + extra), y: T.y + ny * (want0 + extra) }; for (const sg of [1, -1]) { const tn = { x: -ny * sg, y: nx * sg }; let all = true; for (const a2 of [-0.5, -0.25, 0, 0.25, 0.5]) for (const b2 of [-0.5, 0, 0.5]) { const px = c.x + tn.x * len * a2 + nx * Wd * b2, py = c.y + tn.y * len * a2 + ny * Wd * b2; if (G.at(px, py) < 0.6) all = false; } if (all) { pos = c; sg0 = sg; break; } } }
      if (!pos || G.at(pos.x, pos.y) < 1.0) continue;
      for (const sgn of [sg0]) { const t = { x: -ny * sgn, y: nx * sgn }, half = Math.max(2.2, len * 0.55), Lf = Math.max(6, len * 0.75 + 2); let good = true; for (const k of [-half, -half / 2, 0, half / 2, half]) if (G.at(pos.x + t.x * k, pos.y + t.y * k) < 0.9) good = false; if (!good) continue; const A2 = { x: pos.x - t.x * 4 + nx * 0.4, y: pos.y - t.y * 4 + ny * 0.4 }, F2 = { x: pos.x + t.x * 4 + nx * 0.4, y: pos.y + t.y * 4 + ny * 0.4 }; if (G.at(A2.x, A2.y) < 0.8 || G.at(F2.x, F2.y) < 0.8) continue; pos.b = A2.b = F2.b = 1; const A = null, F = null;
        out.push({ T, pos, t, A, F, A2, F2, need, n: { x: nx, y: ny }, score: Math.hypot(T.x - stop.x, T.y - stop.y) + (hash(x, y, 3) * 6) }); break; } }
    out.sort((a, b) => a.score - b.score); return out;
  }
  const namesNear = (T) => { let best = null, bd = 18; for (const b of BUILD) { const d = Math.hypot(b.x + b.w / 2 - T.x, b.y + b.h / 2 - T.y); if (d < bd && b.name) { bd = d; best = b.name; } } return best; };
  // ------------------------------------------------------------------ programs
  function sailDur(P, sp) { return Math.max(4, P.L / (0.62 * sp)); }
  function flood(G, p, need) { // every water tile a hull with this clearance can reach from p, with a rough distance
    const { w, h, y0 } = G, dist = new Float32Array(w * h).fill(-1), sx = Math.floor(p.x), sy = Math.floor(p.y - y0); if (sx < 0 || sy < 0 || sx >= w || sy >= h) return dist; const q = [sy * w + sx]; dist[q[0]] = 0;
    for (let k = 0; k < q.length; k++) { const c = q[k], cx = c % w, cy = (c / w) | 0; for (const [dx, dy, cs] of DIRS) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const i = ny * w + nx; if (dist[i] >= 0 || G.ld[i] < need) continue; if (dx && dy && (G.ld[cy * w + nx] < need || G.ld[ny * w + cx] < need)) continue; dist[i] = dist[c] + cs; q.push(i); } }
    return dist; }
  function build(G, id) {
    const want = WANT[id] || [], taken = [], out = [], { w, h, y0 } = G, LEN = LEN2;
    const tile = (i) => ({ x: (i % w) + 0.5, y: y0 + ((i / w) | 0) + 0.5 }), reachable = (dist, p) => { const x = Math.floor(p.x), y = Math.floor(p.y - y0); return x >= 0 && y >= 0 && x < w && y < h && dist[y * w + x] >= 0; };
    const openMask = {}; const openOf = (need) => { const key = need.toFixed(1); if (openMask[key]) return openMask[key]; let si = 0, sl = -1; for (let i = 0; i < G.ld.length; i++) if (G.ld[i] > sl) { sl = G.ld[i]; si = i; } const d = flood(G, tile(si), need); return (openMask[key] = d); };
    const finish = (B) => { if (B.done) return !!B.A; B.done = 1; const open = openOf(B.need), d = flood(G, B.pos, 0.9); let best = -1, bd = 1e9; for (let i = 0; i < d.length; i++) if (d[i] >= 0 && open[i] >= 0 && d[i] < bd) { bd = d[i]; best = i; } if (best < 0 || bd > 40) return false; const O = tile(best); B.A = O; B.F = O; B.A.b = B.F.b = 1; return true; };
    const cache = {}; const cands = (kind) => cache[kind] || (cache[kind] = berths(G, LEN[kind] * SC, KIND[kind].need));
    const pickBerth = (kind, o) => { o = o || {}; const L = LEN[kind] * SC; for (const b of cands(kind)) { if (o.skip && o.skip.has(b)) continue; if (taken.some((q) => Math.hypot(q.T.x - b.T.x, q.T.y - b.T.y) < (o.sep || (L + q.len) * 0.5 + 3))) continue; if (o.far && Math.hypot(b.T.x - o.far.T.x, b.T.y - o.far.T.y) < o.minFar) continue; if (!finish(b)) continue; if (o.dist && !(reachable(o.dist, b.A) && reachable(o.dist, b.F))) continue; taken.push({ T: b.T, len: L }); return b; } return null; };
    const farPick = (dist, lo, hi, minLD, seed, notNear) => { const arr = []; for (let i = 0; i < dist.length; i++) { if (dist[i] >= lo && dist[i] <= hi && G.ld[i] >= minLD) { const p = tile(i); if (!notNear || notNear.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 12)) arr.push(i); } } if (!arr.length) return null; arr.sort((a2, b2) => G.ld[b2] - G.ld[a2] || a2 - b2); const top = arr.slice(0, Math.max(1, Math.ceil(arr.length * 0.35))); return tile(top[Math.floor(hash(seed, 3, 5) * top.length)]); };
    const gateOf = (dist, need) => { let best = -1, bs = -1e9; for (let i = 0; i < dist.length; i++) { if (dist[i] < 0 || G.ld[i] < need) continue; const x = i % w, y = (i / w) | 0, e = Math.min(x, w - 1 - x, y, h - 1 - y); if (e > 6) continue; const sc = G.ld[i] * 3 - dist[i] * 0.05 - e * 4; if (sc > bs) { bs = sc; best = i; } } if (best < 0) return null; const p = tile(best), x = best % w, y = (best / w) | 0, e = [x, w - 1 - x, y, h - 1 - y], side = e.indexOf(Math.min(...e)); return { x: p.x, y: p.y, side }; };
    const out10 = (g) => { const d = g.side === 0 ? [-1, 0] : g.side === 1 ? [1, 0] : g.side === 2 ? [0, -1] : [0, 1], e = { x: g.x + d[0] * 10, y: g.y + d[1] * 10 }; return e; };
    let idx = 0; const why = (kind, m) => { (HB.why = HB.why || []).push(id + ":" + kind + ":" + m); };
    const hullOK = (P, kind, sS, sE) => { const L = LEN[kind] * SC, Wd = (LEN[kind] > 8 ? 2.4 : LEN[kind] > 4 ? 1.5 : 0.9) * SC, n = Math.ceil(P.L); for (let k = 0; k <= n; k++) { const d = Math.min(P.L, k), q = at(P, d); if ((sS && d < 3) || (sE && d > P.L - 3)) continue; let bad = 0; for (const a2 of [-0.45, 0, 0.45]) for (const b2 of [-1, 0, 1]) { const x = q.x + q.hx * L * a2 - q.hy * Wd * 0.5 * b2, y = q.y + q.hy * L * a2 + q.hx * Wd * 0.5 * b2, gx = Math.floor(x), gy = Math.floor(y); if (gx < 0 || gx >= W || gy < 0 || gy >= H || terr[gy * W + gx] >= 2 || solid[gy * W + gx] === 1) bad++; } if (bad > ((sS && d < 10) || (sE && d > P.L - 10) ? 1 : 0)) { (HB.fail = HB.fail || []).push([kind, Math.round(q.x), Math.round(q.y), Math.round(d), Math.round(P.L), bad, +G.at(q.x, q.y).toFixed(1)]); return false; } } return true; };
    const inn = (B) => [B.A, B.A2], outw = (B) => [B.F2, B.F];
    const safe = (kind, pts, sS, sE) => { for (const extra of [0, 0.5, 1.0, 1.6]) { const P = route(G, pts, KIND[kind].need + extra); if (P && hullOK(P, kind, sS, sE)) return P; } return null; }; // the big ships fill the whole harbour: the best route is the one down the middle
    const attempt = (kind, B1) => { const K = KIND[kind], v = { kind, town: id, id: id + ":" + kind + idx, legs: [], x: 0, y: 0, ang: 0, ph: "away", seed: hash(idx, id.length, 11) * 99, mv: false, T: null, sp: K.sp, m: null, gm: null, paxT: 0, paxLeft: 0, boardLeft: 0, hx: 1, hy: 0, name: "", rideOk: !!K.ride };
      const dist = flood(G, B1.F, Math.min(K.need * 0.8, 0.9)), legs = []; const S = (P, sp, tag) => ({ type: "sail", P, dur: sailDur(P, sp || K.sp), tag }), DK = (B, dur) => ({ type: "dock", B, dur, x: B.pos.x, y: B.pos.y, hx: B.t.x, hy: B.t.y });
      if (kind === "ferry") { const B2 = pickBerth("ferry", { dist, far: B1, minFar: 10, sep: 10 }); if (!B2) return "no second berth"; const ab = safe(kind, [B1.pos, ...outw(B1), ...inn(B2), B2.pos], 1, 1), ba = safe(kind, [B2.pos, ...outw(B2), ...inn(B1), B1.pos], 1, 1); if (!ab || !ba) { taken.pop(); return "no ferry route"; } v.name = "Ferry"; v.stops = [B1, B2]; legs.push(DK(B1, K.dock), S(ab, 1.2, 1), DK(B2, K.dock), S(ba, 1.2, 0)); }
      else if (kind === "yacht" || kind === "pirogue") { const nd = Math.min(K.need + 0.5, 2.0), wp1 = farPick(dist, 14, 70, nd, idx, [B1.pos]), wp2 = wp1 && farPick(dist, 14, 80, nd, idx + 7, [B1.pos, wp1]); if (!wp1 || !wp2) return "no waypoints"; const loop = safe(kind, [B1.pos, ...outw(B1), wp1, wp2, ...inn(B1), B1.pos], 1, 1); if (!loop) return "no loop route"; v.name = kind === "yacht" ? "Sailing tour" : "Pirogue trip"; v.stops = [B1]; legs.push(DK(B1, K.dock * (kind === "yacht" ? 2.5 : 3)), S(loop, kind === "yacht" ? 0.7 : 0.55, 1)); }
      else if (kind === "fishing" || kind === "tug") { const ground = farPick(dist, 10, 70, Math.min(K.need + 1.0, 2.0), idx + 3, [B1.pos]); if (!ground) return "no ground"; const outp = safe(kind, [B1.pos, ...outw(B1), ground], 1, 0), back = safe(kind, [ground, ...inn(B1), B1.pos], 0, 1); if (!outp || !back) return "no out/back route"; v.stops = [B1]; legs.push(DK(B1, kind === "tug" ? K.dock : K.dock * 2), S(outp, kind === "tug" ? 1.0 : 0.8, 1), { type: "hold", x: ground.x, y: ground.y, hx: back.pts[1].x - ground.x, hy: back.pts[1].y - ground.y, dur: kind === "tug" ? 45 : 70 + hash(idx, 3, 3) * 40 }, S(back, kind === "tug" ? 1.0 : 0.8, 0)); }
      else { const g = gateOf(dist, K.need); if (!g) return "no gate"; const rin = safe(kind, [g, ...inn(B1), B1.pos], 0, 1), outp = safe(kind, [B1.pos, ...outw(B1), g], 1, 0); if (!rin || !outp) return "no in/out route"; v.stops = [B1]; legs.push({ type: "away", dur: 60 + hash(idx, 4, 4) * 80 }, S(rin, K.sp, 1), DK(B1, K.dock), S(outp, K.sp, 0), { type: "away", dur: kind === "cruise" ? 140 : 120 + hash(idx, 7, 7) * 60 }); }
      { const c0 = legs.reduce((s2, l) => s2 + l.dur, 0), pad = Math.ceil(c0 / 120) * 120 - c0, aw = legs.find((l) => l.type === "away"), docks = legs.filter((l) => l.type === "dock"); const sails = legs.filter((l) => l.type === "sail"); if (aw) aw.dur += pad; else { for (const d of docks) d.dur += pad * 0.3 / docks.length; for (const sl of sails) sl.dur += pad * 0.7 / sails.length; } }
      v.legs = legs; v.cyc = legs.reduce((s2, l) => s2 + l.dur, 0); v.off = 0; return v; };
    const anchored = [];
    const anchor = (kind) => { // when a big ship cannot sail the narrow harbour it lies at anchor in the deepest water instead (never on land)
      const K = KIND[kind], L = LEN[kind] * SC, Wd = 2.4 * SC; const cand = []; for (let i = 0; i < G.ld.length; i++) if (G.ld[i] >= 2.2) cand.push(i); cand.sort((a2, b2) => G.ld[b2] - G.ld[a2] || a2 - b2);
      for (const i of cand) { const p = tile(i); if (anchored.concat(taken.map((q) => q.T)).some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 13)) continue; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 8, hx = Math.cos(a), hy = Math.sin(a); let ok = true; for (const a2 of [-0.5, -0.25, 0, 0.25, 0.5]) for (const b2 of [-0.5, 0, 0.5]) { if (G.at(p.x + hx * L * a2 - hy * Wd * b2, p.y + hy * L * a2 + hx * Wd * b2) < 0.7) ok = false; } if (ok) { anchored.push(p); return { x: p.x, y: p.y, hx, hy }; } } }
      return null; };
    for (const kind of want) { idx++; let done = null, last = "no berth"; const tried = new Set(); for (let a2 = 0; a2 < 14 && !done; a2++) { const B1 = pickBerth(kind, { skip: tried }); if (!B1) break; tried.add(B1); const r2 = attempt(kind, B1); if (typeof r2 === "string") { last = r2; if (kind !== "ferry") taken.pop(); else if (r2 === "no second berth") taken.pop(); continue; } done = r2; } if (done) out.push(done); else if (LEN[kind] > 8) { const a = anchor(kind); if (a) { out.push({ kind, town: id, id: id + ":" + kind + idx + "a", legs: [{ type: "hold", x: a.x, y: a.y, hx: a.hx, hy: a.hy, dur: 3600 }], cyc: 3600, off: 0, x: 0, y: 0, ang: 0, ph: "away", seed: hash(idx, 5, 5) * 99, mv: false, T: null, sp: 0, m: null, gm: null, paxT: 0, paxLeft: 0, boardLeft: 0, hx: 1, hy: 0, name: "", rideOk: false, anchored: true }); } else why(kind, last); } else why(kind, last); }
    return out;
  }
  // ------------------------------------------------------------------ the timetable is checked: no two vessels may ever be in the same place
  function pose(v, tt) { let t = ((tt + v.off) % v.cyc + v.cyc) % v.cyc, last = v.legs[0]; for (const l of v.legs) { if (t < l.dur) return legPose(v, l, t); t -= l.dur; last = l; } return legPose(v, last, last.dur); }
  function legPose(v, l, t) {
    if (l.type === "away") return { vis: false, x: 0, y: 0, hx: 1, hy: 0, leg: l, t };
    if (l.type === "sail") { const u = smooth(t / l.dur), d = l.P.L * u, p = at(l.P, d), p2 = at(l.P, Math.min(l.P.L, d + 0.6)), p1 = at(l.P, Math.max(0, d - 0.6)); let hx = p2.x - p1.x, hy = p2.y - p1.y; const hl = Math.hypot(hx, hy) || 1; return { vis: true, x: p.x, y: p.y, hx: hx / hl, hy: hy / hl, leg: l, t, moving: u > 0.003 && u < 0.997 }; }
    return { vis: true, x: l.x, y: l.y, hx: l.hx, hy: l.hy, leg: l, t, moving: false };
  }
  function schedule(vs) { // choose start offsets that keep the vessels apart (the whole timetable repeats within two hours, so it is checked over that whole time)
    const placed = []; for (const v of vs) { let best = -1, bc = 1e9; const step = 6; for (let k = 0; k < Math.floor(v.cyc / step); k++) { v.off = k * step; let c = 0; for (const o of placed) { const rad = (LEN2[v.kind] + LEN2[o.kind]) * SC * 0.5 + 0.8; for (let t = 0; t < 7200; t += 5) { const a = pose(v, t), b = pose(o, t); if (a.vis && b.vis && Math.hypot(a.x - b.x, a.y - b.y) < rad) c++; } if (c > bc) break; } if (c < bc) { bc = c; best = k; if (c === 0) break; } }
      if (best >= 0 && bc <= 90) { v.off = best * step; placed.push(v); } else { v.drop = 1; (HB.dropped = HB.dropped || []).push(v.id + ":" + bc); } } return vs.filter((v) => !v.drop); }
  const LEN2 = { cargo: 13, tanker: 12, cruise: 11, ferry: 5, fishing: 2.6, pirogue: 2.4, yacht: 3.2, tug: 2.8 };
  // ------------------------------------------------------------------ init and the per-frame step
  HB.init = function () {
    if (HB.ready) return; HB.ready = 1; try { shipsReady = true; } catch (e) {}
    for (const id of ["grandbaie", "portlouis", "west"]) { try { const r = regionDef(id); if (!r) continue; const G = grid(r); const vs = schedule(build(G, id)); for (const v of vs) { SHIPS.push(v); HB.v.push(v); } } catch (e) { (HB.err = HB.err || []).push(id + ": " + (e && e.stack || e)); console.warn("harbour", id, e); } }
    HB.stations();
  };
  const clockT = () => Date.now() / 1000;
  HB.step = function (dt) {
    if (!R.world) return; if (!HB.ready) HB.init(); const tt = clockT(), px = s.inside ? s.ox : s.x, py = s.inside ? s.oy : s.y;
    for (const v of HB.v) { const p = pose(v, tt); const was = v.ph; v.leg = p.leg; v.legT = p.t; if (!p.vis) { v.ph = "away"; v.mv = false; v.T = null; continue; }
      v.x = p.x; v.y = p.y; v.hx = p.hx; v.hy = p.hy; const want = Math.atan2(p.hy, p.hx); if (!v.set) { v.ang = want; v.set = 1; } else { let e = want - v.ang; e = Math.atan2(Math.sin(e), Math.cos(e)); v.ang += e * Math.min(1, dt * 6); } v.mv = !!p.moving;
      if (p.leg.type === "dock") { v.ph = "dock"; v.T = p.leg.B.T; v.berth = p.leg.B; v.dockLeft = p.leg.dur - p.t; if (was !== "dock") { v.dockStart = tt - p.t; const pk = ({ cargo: 0, tanker: 0, cruise: 4, ferry: 4, fishing: 0, pirogue: 0, yacht: 0, tug: 0 })[v.kind] || 0; v.paxLeft = pk; v.boardLeft = pk; v.paxT = 0; } }
      else { v.ph = p.leg.tag ? (p.leg.tag === 1 ? "in" : "out") : "in"; if (p.leg.type === "hold") v.ph = "in"; v.T = null; }
      if (v.ph === "dock") { const near = Math.hypot(v.x - px, v.y - py) < 75, el = p.t; v.paxT -= dt; if (near && v.T && v.paxT <= 0) { if (v.paxLeft > 0 && el > 3) { paxAdd(v, "leave"); v.paxLeft--; v.paxT = 1.3; } else if (v.boardLeft > 0 && v.paxLeft <= 0 && p.leg.dur - el < 4 + v.boardLeft * 1.6 + 12) { paxAdd(v, "board"); v.boardLeft--; v.paxT = 1.4; } } } }
    for (let k = PAX.length - 1; k >= 0; k--) { const q = PAX[k]; if (q.mode === "board" && q.sh.ph !== "dock") { PAX.splice(k, 1); continue; } let tx, ty; if (q.mode === "leave") { if (q.stage === 0) { tx = q.T.x; ty = q.T.y; } else { tx = q.I.x; ty = q.I.y; } } else { if (q.stage === 0) { tx = q.T.x; ty = q.T.y; } else { const e = shipEdge(q.sh) || q.E; tx = e.x; ty = e.y; } }
      const dx = tx - q.x, dy = ty - q.y, d = Math.hypot(dx, dy), step = q.sp * dt; if (d <= step + 0.05) { q.x = tx; q.y = ty; if (q.stage === 0) q.stage = 1; else { if (q.mode === "board") q.sh.boarders++; PAX.splice(k, 1); } continue; } q.x += dx / d * step; q.y += dy / d * step; q.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 0 : 1; }
    if (HB.ride) rideTick();
  };
  HB._grid = grid; HB._flood = flood; HB._berths = berths; HB.pose = pose; window.shipsInit = HB.init; window.shipsStep = HB.step;
  // ------------------------------------------------------------------ riding
  const fmtT = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };
  function nextDock(v, B) { // seconds until this vessel is next docked at berth B (0 if it is there now with time to board)
    const tt = clockT(); let t0 = ((tt + v.off) % v.cyc + v.cyc) % v.cyc, acc = 0, dockNow = null; for (const l of v.legs) { if (l.type === "dock" && l.B === B) { if (t0 >= acc && t0 < acc + l.dur) dockNow = acc + l.dur - t0; } acc += l.dur; }
    if (dockNow !== null) return { now: true, left: dockNow };
    let best = 1e9; acc = 0; for (const l of v.legs) { if (l.type === "dock" && l.B === B) { const d = ((acc - t0) % v.cyc + v.cyc) % v.cyc; best = Math.min(best, d); } acc += l.dur; } return { now: false, wait: best };
  }
  HB.stations = function () {
    const done = new Set(); for (const v of HB.v) { if (!v.rideOk || !v.stops) continue; v.stops.forEach((B, bi) => { const key = v.id + ":" + bi; if (done.has(key)) return; done.add(key); B.name = B.name || ("the pier by " + (namesNear(B.T) || regionDef(v.town).name)); const spot = { x: B.T.x - B.n.x * 0.9, y: B.T.y - B.n.y * 0.9 };
      const icon = v.kind === "ferry" ? "⛴️" : v.kind === "yacht" ? "⛵" : "🛶", K = KIND[v.kind], name = (v.kind === "ferry" ? "Ferry" : v.kind === "yacht" ? "Sailing tour" : "Pirogue trip") + " · Rs " + K.ride.fare;
      (HB.sigs = HB.sigs || []).push({ v, B, bi, x: spot.x, y: spot.y, icon, K: K.ride });
      OBJ.push({ x: spot.x, y: spot.y, icon, name, show: () => !s.inside && !HB.ride, acts: () => { const nd = nextDock(v, B), other = v.stops.length > 1 ? v.stops[1 - bi] : null, dest = v.kind === "ferry" ? "Ferry to " + ((other && (other.name || ("the pier by " + (namesNear(other.T) || "the other side")))) || "the other pier") : v.name + " from " + B.name; const can = nd.now && nd.left > 12 && v.ph === "dock" && v.berth === B;
        return [{ label: "🎟️ Board: " + dest, info: "Rs " + K.ride.fare + " · " + (nd.now ? (can ? "boarding now, leaves in " + fmtT(nd.left) : "just leaving") : "next boat in " + fmtT(nd.wait)), why: s.money < K.ride.fare ? "You need " + rs(K.ride.fare) : can ? "" : nd.now ? "It is just leaving. Wait for the next one." : "The boat is out: next one in " + fmtT(nd.wait), go: () => { closeMenu(); HB.board(v, B, bi); } }]; } }); }); }
  };

  // ------------------------------------------------------------------ making it clear what you can ride: a sign at each pier and a label on each boat that takes passengers
  const labelTex = (txt, ok) => textTex(txt, ok ? "rgba(18,110,66,0.94)" : "rgba(17,24,40,0.9)", "#ffffff", 34);
  HB.draw = function (now) {
    if (!HB.ready || typeof R === "undefined" || !R.world || s.inside) return; const t = now / 1000, px = s.x, py = s.y;
    for (const v of HB.v) { if (!v.m) continue; if (!v.scaled) { v.m.scale.setScalar(SC); v.scaled = 1; } if (!v.rideOk) continue; const mine = !!(HB.ride && HB.ride.v === v), near = !mine && v.m.visible && Math.hypot(v.x - px, v.y - py) < 45; if (v.lbl) v.lbl.visible = near; if (!near) continue;
      const B = v.berth, K = KIND[v.kind].ride, boarding = v.ph === "dock" && v.dockLeft > 12; let txt;
      if (v.ph === "dock") { txt = boarding ? "🎟️ " + (v.kind === "ferry" ? "FERRY" : v.kind === "yacht" ? "SAILING TOUR" : "PIROGUE TRIP") + " · Rs " + K.fare + " · BOARDING" : "Leaving the pier…"; } else if (v.legs) { const nd = v.stops ? nextDock(v, v.stops[0]) : null; txt = (v.kind === "ferry" ? "⛴️ Ferry" : v.kind === "yacht" ? "⛵ Sailing tour" : "🛶 Pirogue trip") + " · Rs " + K.fare + " · at the pier in " + fmtT(nd ? nd.wait : 0); }
      if (!v.lbl) { v.lbl = sprite(labelTex(txt, boarding), 0.8 / SC); v.lbl.position.set(0, 3.0 / SC, 0); v.m.add(v.lbl); v.lblTxt = txt; } else if (v.lblTxt !== txt) { v.lblTxt = txt; v.lbl.material.map = labelTex(txt, boarding); v.lbl.material.needsUpdate = true; }
      if (boarding) v.lbl.position.y = 3.0 / SC + Math.sin(t * 4) * 0.12 / SC; }
    for (const g of HB.sigs || []) { if (!g.mesh) { const grp = new THREE.Group(); grp.position.set(g.x, 0, g.y); box(0.12, 2.3, 0.12, "#5a4630", 0, 1.15, 0, grp); box(1.5, 0.7, 0.08, g.v.kind === "ferry" ? "#1f6fa8" : g.v.kind === "yacht" ? "#f2b544" : "#e4572e", 0, 2.1, 0, grp); const nm = (g.v.kind === "ferry" ? "FERRY" : g.v.kind === "yacht" ? "SAILING TOUR" : "PIROGUE TRIP"), sp = sprite(textTex(g.icon + " " + nm + " · Rs " + g.K.fare, "rgba(17,24,40,0.9)", "#ffd166", 34), 0.8); sp.position.set(0, 3.1, 0); grp.add(sp); R.world.add(grp); g.mesh = grp; } g.mesh.visible = Math.hypot(g.x - px, g.y - py) < 60; }
  };
  HB.camOn = () => !!HB.ride || HB.k > 0.01;
  HB.board = function (v, B, bi) {
    if (HB.ride || busy || ride || (window.HUX && HUX.run) || s.inside) { toast("Finish what you are doing first."); return; } const K = KIND[v.kind].ride; if (s.money < K.fare) { toast("You need " + rs(K.fare) + "."); return; } if (!(v.ph === "dock" && v.berth === B)) { toast("The boat has left."); return; }
    const act = A("Ride the " + (v.kind === "ferry" ? "ferry" : v.kind === "yacht" ? "sailing boat" : "pirogue"), "", K.mins, K.fare, K.fx, { msg: K.msg }), dest = v.kind === "ferry" ? v.stops[1 - bi] : B;
    path = []; busy = { a: act, left: K.mins, total: K.mins, rate: 0, pose: { k: "sit", x: s.x, y: s.y, h: 0.5, face: 1, lift: 0 }, from: [dest.T.x, dest.T.y] };
    HB.ride = { v, B, dest, bi, act, t0: performance.now(), arrived: false, yaw: 0, pitch: 0.5, boarded: false }; HB.yawOff = 0; HB.pitch = 0.7; panel();
    try { if (window.LVX) LVX.gain("place", "boat-" + v.kind); } catch (e) {}
  };
  const CAM = { P: null, el: null, drag: null };
  function panel() { panelOff(); const d = document.createElement("div"); d.id = "storyCap"; d.innerHTML = "<div><small>AT SEA</small><span id=\"hbTxt\">Drag to look around.</span></div>"; const b = document.createElement("button"); b.id = "hbOff"; b.textContent = "Get off"; b.disabled = true; b.onclick = () => { if (HB.ride && HB.ride.v.ph === "dock") HB.ride.arrived = true; }; d.append(b); document.body.append(d); CAM.el = d; }
  function panelOff() { if (CAM.el) { CAM.el.remove(); CAM.el = null; } }
  { const down = (e) => { if (HB.ride) CAM.drag = { x: e.clientX, y: e.clientY }; }, move = (e) => { const d = CAM.drag; if (!d || !HB.ride) return; HB.yawOff -= (e.clientX - d.x) * 0.0085; HB.pitch = Math.max(0.05, Math.min(1.2, HB.pitch + (e.clientY - d.y) * 0.006)); d.x = e.clientX; d.y = e.clientY; path = []; }, up = () => { CAM.drag = null; };
    const c = document.getElementById("world"); if (c) { c.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up); } }
  const faceOf = (hx, hy) => (Math.abs(hx) > Math.abs(hy) ? (hx > 0 ? 3 : 2) : hy > 0 ? 0 : 1);
  function seatPos(v) { const K = KIND[v.kind].ride, hx = Math.cos(v.ang), hy = Math.sin(v.ang), nx = -hy, ny = hx; return { x: v.x + (hx * K.seat[0] + nx * K.seat[1]) * SC, y: v.y + (hy * K.seat[0] + ny * K.seat[1]) * SC, h: K.seat[2] * SC };  }
  function rideTick() {
    const r = HB.ride, v = r.v; if (!busy || busy.a !== r.act) { endRide(false); return; }
    const sp = seatPos(v); if (!r.boarded) { r.boarded = true; } s.x = sp.x; s.y = sp.y; s.face = faceOf(Math.cos(v.ang), Math.sin(v.ang)); busy.pose = { k: "sit", x: sp.x, y: sp.y, h: sp.h, face: s.face, lift: 0 };
    const txt = document.getElementById("hbTxt"), off = document.getElementById("hbOff"), docked = v.ph === "dock" && v.berth === (v.kind === "ferry" ? r.dest : r.B) && v.legT > 4 && (performance.now() - r.t0 > 6000), left = v.legs.reduce((s2, l) => s2, 0);
    if (txt) txt.textContent = docked ? "We have arrived. Mind the gap." : v.ph === "dock" ? "Casting off…" : (v.kind === "ferry" ? "Crossing to the other pier. Drag to look around." : "Out on the water. Drag to look around.");
    if (off) off.disabled = !docked;
    if (docked && (r.arrived || v.legT > 6)) { endRide(true); }
    if (performance.now() - r.t0 > 600000) endRide(true);
  }
  function endRide(ok) { const r = HB.ride; if (!r) return; const was = busy && busy.a === r.act; HB.ride = null; panelOff(); if (was) { if (ok) { busy.from = [r.dest.T.x - r.dest.n.x * 0.9, r.dest.T.y - r.dest.n.y * 0.9]; const a = r.act; finish(a); } else busy = null; } }
  HB.camTick = function (now) {
    const want = HB.ride ? 1 : 0; HB.k += (want - HB.k) * 0.07; if (!want && HB.k < 0.01) { HB.k = 0; return; } const e = HB.k * HB.k * (3 - 2 * HB.k), V = THREE.Vector3, v = HB.ride ? HB.ride.v : null;
    if (v) { const sp = seatPos(v); CAM.P = new V(sp.x, sp.h + 0.2, sp.y); CAM.ang = v.ang; } const P = CAM.P || new V(s.x, 1, s.y), ang = CAM.ang || 0, yaw = Math.atan2(-Math.cos(ang), -Math.sin(ang)) + 1.9 + HB.yawOff + Math.sin(now / 3200) * 0.05, pit = HB.pitch, rad = (v && v.kind === "ferry") ? 11 : 8.5;
    const des = new V(P.x + Math.sin(yaw) * Math.cos(pit) * rad, P.y + Math.sin(pit) * rad, P.z + Math.cos(yaw) * Math.cos(pit) * rad); R.camera.position.lerp(des, e); const la = R.tgt.clone().lerp(new V(P.x, P.y - 0.1, P.z), e); R.camera.lookAt(la);
  };
})();
