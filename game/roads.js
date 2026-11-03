// The real roads between the towns. The island map (public/island.json, built from OpenStreetMap) holds every road at 150 m a tile;
// a trip between two towns follows the real road network from one town's gate to the other's, so distances, times and fares
// come from the real island. The server decides the route, the price and how long the journey takes: the phone only plays it.
"use strict";
const fs = require("fs");
const path = require("path");

const ISL = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "island.json"), "utf8")), W = ISL.w, H = ISL.h;
const TILES = (() => { const o = new Uint8Array(W * H); let i = 0; for (let k = 0; k < ISL.tiles.length; k += 2) { o.fill(ISL.tiles[k], i, i + ISL.tiles[k + 1]); i += ISL.tiles[k + 1]; } return o; })();
const REGION_AT = (() => { const o = new Uint8Array(W * H); let i = 0; for (let k = 0; k < ISL.region.length; k += 2) { o.fill(ISL.region[k], i, i + ISL.region[k + 1]); i += ISL.region[k + 1]; } return o; })();
const DEF = JSON.parse(fs.readFileSync(path.join(__dirname, "regions.json"), "utf8")).regions;
const tileOf = (lon, lat) => [Math.round((lon - ISL.lon0) * ISL.kx / ISL.tileM), Math.round((ISL.lat0 - lat) * ISL.ky / ISL.tileM)];
const isRoad = (i) => TILES[i] === 3 || TILES[i] === 4; // 3 street, 4 main road

// How you can travel. Fares and speeds are game numbers (a bus is slow and cheap, a taxi quick and dear, your own car costs fuel).
const MODES = {
  bus: { id: "bus", name: "Bus", icon: "🚌", base: 25, perKm: 5, kmh: 30, wait: true, where: "bus station or road sign" },
  taxi: { id: "taxi", name: "Taxi", icon: "🚕", base: 150, perKm: 20, kmh: 55, wait: false, where: "anywhere: it comes to you" },
  car: { id: "car", name: "Your car", icon: "🚗", base: 0, perKm: 3, kmh: 60, wait: false, needsCar: true, where: "anywhere" }
};

function snap(x, y) { // the nearest main-road tile to a point
  for (let r = 0; r < 16; r++) { let best = null, bd = 1e9; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || TILES[yy * W + xx] !== 4) continue; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [xx, yy]; } } if (best) return best; }
  return null;
}
const GATES = {}; for (const r of DEF) if (r.gate) GATES[r.id] = snap(...tileOf(r.gate[0], r.gate[1]));

class Heap { constructor() { this.a = []; } get size() { return this.a.length; } push(p, v) { const a = this.a; a.push([p, v]); let i = a.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (a[q][0] <= a[i][0]) break; [a[q], a[i]] = [a[i], a[q]]; i = q; } } pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[1]; } }

const CACHE = {};
function route(from, to) { // the road route between two towns: tiles, length in km, and the towns it passes through
  const key = from + ">" + to; if (CACHE[key]) return CACHE[key]; const a = GATES[from], b = GATES[to]; if (!a || !b) return null;
  const kk = (x, y) => y * W + x, g = new Map([[kk(a[0], a[1]), 0]]), prev = new Map(), open = new Heap(); open.push(0, [a[0], a[1]]);
  while (open.size) { const [x, y] = open.pop(); if (x === b[0] && y === b[1]) break; const gc = g.get(kk(x, y));
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || !isRoad(kk(nx, ny))) continue; const jump = Math.abs(dx) > 1 || Math.abs(dy) > 1, step = Math.hypot(dx, dy) * (jump ? 1.6 : 1) * (TILES[kk(nx, ny)] === 4 ? 0.7 : 1), ng = gc + step; if (ng < (g.get(kk(nx, ny)) ?? 1e9)) { g.set(kk(nx, ny), ng); prev.set(kk(nx, ny), kk(x, y)); open.push(ng + Math.hypot(nx - b[0], ny - b[1]) * 0.7, [nx, ny]); } } }
  if (!prev.has(kk(b[0], b[1]))) return (CACHE[key] = null);
  const pts = [[b[0], b[1]]]; let k = kk(b[0], b[1]); while (prev.has(k)) { k = prev.get(k); pts.push([k % W, (k / W) | 0]); } pts.reverse();
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); const km = Math.max(1, Math.round(len * ISL.tileM / 100) / 10);
  const via = []; for (const [x, y] of pts) { const id = ISL.regions[REGION_AT[y * W + x]]; if (id && via[via.length - 1] !== id) via.push(id); }
  const step = Math.max(1, Math.floor(pts.length / 70)), thin = pts.filter((_, i) => i % step === 0 || i === pts.length - 1); // a short line for the phone to draw
  return (CACHE[key] = { from, to, km, via, path: thin });
}
// The offers for a trip: every way to go, with its price and how long it takes (in game minutes)
function plan(from, to) {
  const r = route(from, to); if (!r) return null;
  return { from, to, km: r.km, via: r.via, path: r.path, modes: Object.values(MODES).map((m) => ({ id: m.id, name: m.name, icon: m.icon, needsCar: !!m.needsCar, where: m.where, fare: Math.round(m.base + m.perKm * r.km), minutes: Math.round(r.km / m.kmh * 60), wait: !!m.wait })) };
}
// real seconds a journey takes on screen: a game minute is half a real second, but a trip is squeezed so it never drags
const journeySecs = (minutes) => Math.max(8, Math.min(45, minutes / 4));
module.exports = { MODES, GATES, route, plan, journeySecs };
