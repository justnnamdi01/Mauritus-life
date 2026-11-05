// Build the highway between two towns from the real map.
// Usage: cd tools && node build-road.mjs grandbaie portlouis [path/to/file.osm.pbf]
// The towns are one chain, north to south, and the highway is the strip of map between two of them: its first row touches the last row of the
// town above and its last row touches the first row of the town below, so you walk straight off one map and onto the next. It is as wide as
// the towns (120 tiles), one tile for every 75 m of road, and the road leaves the town's exit and arrives at the next town's exit,
// bending the way the real road bends (game/roads.js follows the real road network of the island map).
// Beside the road is the real country: what the island map says is sea, land, field or village at each point, the real villages and
// towns along it (from OpenStreetMap place names) as road signs and clusters of houses, and a kilometre post every 2 km.
// Map data © OpenStreetMap contributors (ODbL).
import { createOSMStream } from "osm-pbf-parser-node";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, ".."), require = createRequire(import.meta.url);
const ROADS = require("../game/roads.js");
const [A, B] = [process.argv[2], process.argv[3]]; if (!A || !B) { console.error("Usage: node build-road.mjs <from> <to>"); process.exit(1); }
const OSM_DIR = path.join(HERE, "osm"), SRC = process.argv[4] || path.join(OSM_DIR, fs.readdirSync(OSM_DIR).filter((f) => f.endsWith(".osm.pbf")).sort().pop());
const ISL = JSON.parse(fs.readFileSync(path.join(ROOT, "game", "public", "island.json"), "utf8")), IW = ISL.w, IH = ISL.h;
const un = (a) => { const o = new Uint8Array(IW * IH); let i = 0; for (let k = 0; k < a.length; k += 2) { o.fill(a[k], i, i + a[k + 1]); i += a[k + 1]; } return o; };
const IT = un(ISL.tiles), IR = un(ISL.region), TILE = 75, W = 120, STEP = TILE / ISL.tileM; // one highway tile = 75 m = half an island tile
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
const sm = (v) => { const k = Math.max(0, Math.min(1, v)); return k * k * (3 - 2 * k); };
const loadTown = (id) => { const t = fs.readFileSync(path.join(ROOT, "game", "public", id + "-map.js"), "utf8"), m = JSON.parse(t.slice(t.indexOf("= {") + 2, t.lastIndexOf(";"))), g = []; for (let i = 0; i < m.terr.length; i += 2) for (let k = 0; k < m.terr[i + 1]; k++) g.push(m.terr[i]); return { m, g }; };
const TA = loadTown(A), TB = loadTown(B), exA = TA.m.exits.find((e) => e.to === B), exB = TB.m.exits.find((e) => e.to === A);
if (!exA || !exB) { console.error("the towns have no exits towards each other: run build-region.mjs for both first"); process.exit(1); }

const route = ROADS.route(A, B); if (!route) { console.error("no route"); process.exit(1); }
// smooth the blocky route, then resample it every 75 m
let P = route.full.map(([x, y]) => [x, y]); for (let pass = 0; pass < 3; pass++) P = P.map((p, i) => { let sx = 0, sy = 0, n = 0; for (let k = -3; k <= 3; k++) { const q = P[Math.min(P.length - 1, Math.max(0, i + k))]; sx += q[0]; sy += q[1]; n++; } return i === 0 || i === P.length - 1 ? p : [sx / n, sy / n]; });
const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
const total = cum[cum.length - 1], N = Math.max(60, Math.round(total / STEP)), S = []; for (let i = 0; i < N; i++) { const d = (i / (N - 1)) * total; let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const f = (d - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]); S.push([P[k - 1][0] + (P[k][0] - P[k - 1][0]) * f, P[k - 1][1] + (P[k][1] - P[k - 1][1]) * f]); }
const km = Math.round(N * TILE / 100) / 10, H = N; // the real length (the route is longer than the straight line)
const T = S.map((p, i) => { const a = S[Math.max(0, i - 4)], b = S[Math.min(N - 1, i + 4)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; });

// the road's centre column on every row: from the exit of the town above to the exit of the town below, bending the way the real road bends
const xa = Math.floor(exA.x), xb = Math.floor(exB.x), RAMP = 26, ux = S[N - 1][0] - S[0][0], uy = S[N - 1][1] - S[0][1], ul = Math.hypot(ux, uy) || 1;
const dev = S.map((p) => ((p[0] - S[0][0]) * -uy + (p[1] - S[0][1]) * ux) / ul / STEP); // how far the real road is from the straight line between the towns, in tiles
const kdev = Math.min(1, 30 / Math.max(1, ...dev.map(Math.abs)));
let cx = S.map((_, i) => xa + (xb - xa) * sm((i - RAMP) / Math.max(1, N - 2 * RAMP)) + dev[i] * kdev * sm(i / RAMP) * sm((N - 1 - i) / RAMP));
for (let pass = 0; pass < 2; pass++) { for (let i = 1; i < N; i++) cx[i] = Math.max(cx[i - 1] - 0.9, Math.min(cx[i - 1] + 0.9, cx[i])); for (let i = N - 2; i >= 0; i--) cx[i] = Math.max(cx[i + 1] - 0.9, Math.min(cx[i + 1] + 0.9, cx[i])); } // a gentle bend: never more than a tile sideways for a tile along
cx = cx.map((v) => Math.max(10, Math.min(W - 11, v))); cx[0] = xa; cx[N - 1] = xb; for (let i = 1; i < 6; i++) { cx[i] = xa; cx[N - 1 - i] = xb; } // straight where the road meets the towns
const CX = cx.map((v) => Math.round(v));

const grid = new Uint8Array(W * H), info = new Uint8Array(W * H), sampleAt = (px, py) => { const x = Math.round(px), y = Math.round(py); if (x < 0 || y < 0 || x >= IW || y >= IH) return [0, 0]; return [IT[y * IW + x], IR[y * IW + x]]; };
const landNear = (px, py) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (sampleAt(px + dx, py + dy)[0] !== 0) return true; return false; };
const cell = (i, j) => { const [tx, ty] = T[i], nx = -ty, ny = tx; return [S[i][0] + nx * j * STEP, S[i][1] + ny * j * STEP]; }; // the point j tiles to the side of the road at step i
const NAT = new Set([0, 1, 2, 3, 9, 15]), KB = 10; // near each town the ground carries on from the town's own edge, then fades into the real country
for (let i = 0; i < N; i++) for (let c = 0; c < W; c++) { const j = c - CX[i], [px, py] = cell(i, j), [code, rg] = sampleAt(px, py); let t;
  if (c < 2 || c >= W - 2) t = code === 0 ? 0 : 15; // the edge of the world: hills where there is land, sea where there is sea
  else if (code === 0) t = landNear(px, py) ? 1 : 0;
  else { t = 3; const rid = ISL.regions[rg]; if ((rid === "north" || rid === "east") && (hash(c >> 3, i >> 3) % 3 === 0)) t = 11; }
  const fromTown = i < KB ? TA.g[(TA.m.h - 1) * TA.m.w + c] : N - 1 - i < KB ? TB.g[c] : -1, near = Math.min(i, N - 1 - i);
  if (fromTown >= 0 && NAT.has(fromTown) && (hash(c, i) % 100) < 100 * (1 - near / KB)) t = fromTown;
  grid[i * W + c] = t; info[i * W + c] = code; }
for (let i = 0; i < N; i++) for (let c = CX[i] - 1; c <= CX[i] + 1; c++) grid[i * W + c] = 4; // the road: 3 tiles wide
for (let i = 0; i < N - 1; i++) { const a = CX[i], b = CX[i + 1]; for (let c = Math.min(a, b) - 1; c <= Math.max(a, b) + 1; c++) { grid[i * W + c] = 4; grid[(i + 1) * W + c] = 4; } } // and joined where it bends
for (let i = 0; i < N; i++) for (const d of [-2, 2]) { const c = CX[i] + d; if (grid[i * W + c] !== 4) grid[i * W + c] = 22; } // a paved shoulder each side

// real places along the way (villages, towns) from OpenStreetMap
const places = []; for await (const it of createOSMStream(SRC)) { if (it.type !== "node" || !it.tags || !it.tags.place || !it.tags.name) continue; if (!/^(city|town|village|suburb|hamlet)$/.test(it.tags.place)) continue; const ix = (it.lon - ISL.lon0) * ISL.kx / ISL.tileM, iy = (ISL.lat0 - it.lat) * ISL.ky / ISL.tileM; if (ix < -2 || iy < -2 || ix > IW + 2 || iy > IH + 2) continue; places.push({ name: it.tags.name, kind: it.tags.place, ix, iy }); }
const signs = [], used = [], houses = []; const free3 = (x, y, w, h) => { for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) { if (xx < 4 || xx >= W - 4 || yy < 14 || yy >= H - 14) return false; const t = grid[yy * W + xx]; if (t !== 3 && t !== 11) return false; if (houses.some(([hx, hy, hw, hh]) => xx >= hx - 1 && xx < hx + hw + 1 && yy >= hy - 1 && yy < hy + hh + 1)) return false; } return true; };
const near = []; for (const pl of places) { let bi = -1, bd = 1e9; for (let i = 0; i < N; i++) { const d = Math.hypot(S[i][0] - pl.ix, S[i][1] - pl.iy); if (d < bd) { bd = d; bi = i; } } if (bd * ISL.tileM <= 1600 && bi > 16 && bi < N - 16) near.push({ pl, bi, d: bd }); }
near.sort((a, b) => a.bi - b.bi); for (const { pl, bi } of near) { if (used.some((u) => Math.abs(u - bi) < 14)) continue; used.push(bi); const side = ((S[bi][1] - pl.iy) * T[bi][0] - (S[bi][0] - pl.ix) * T[bi][1]) > 0 ? -1 : 1; signs.push({ x: CX[bi] + side * 4 + 0.5, y: bi + 0.5, t: pl.name, k: "town" });
  // a village: houses on both sides of the road, in rows, for about 40 tiles (3 km)
  const nh = pl.kind === "city" || pl.kind === "town" ? 26 : 14; let placed = 0; for (let dr = -18; dr <= 18 && placed < nh; dr += 5) for (const side2 of [-1, 1]) for (const jj of [5, 11]) { const row = bi + dr, x = CX[Math.max(0, Math.min(N - 1, row))] + side2 * jj - 1 + (hash(dr, jj) % 3), y = row + (hash(jj, dr) % 3); if (free3(x, y, 3, 3) && (hash(x, y) % 10) < 8) { houses.push([x, y, 3, 3]); placed++; } } }
// single houses wherever the island map shows buildings beside the road
for (let i = 14; i < N - 14 && houses.length < 160; i++) for (let j = -18; j <= 18; j++) { const c = CX[i] + j; if (Math.abs(j) < 5 || c < 0 || c >= W || info[i * W + c] !== 2) continue; if (free3(c, i - 1, 3, 3) && hash(c, i) % 3 === 0) houses.push([c, i - 1, 3, 3]); }
// kilometre posts every 2 km, counting down to the town ahead
const nameOf = (id) => (JSON.parse(fs.readFileSync(path.join(ROOT, "game", "regions.json"), "utf8")).regions.find((r) => r.id === id) || {}).name || id, short = (id) => nameOf(id).replace(/ and the.*/, "");
for (let k = 2; k < km; k += 2) { const r = Math.round(k * 1000 / TILE); if (r > 10 && r < H - 10) signs.push({ x: CX[r] + 3.5, y: r + 0.5, t: short(B) + " " + Math.round(km - k) + " km", k: "km" }); }
signs.push({ x: CX[8] - 3.5, y: 8.5, t: "Leaving " + short(A), k: "town" }, { x: CX[H - 9] + 3.5, y: H - 8.5, t: "Welcome to " + short(B), k: "town" });
const rle = []; { let v = grid[0], n = 0; for (const c of grid) { if (c === v) n++; else { rle.push(v, n); v = c; n = 1; } } rle.push(v, n); }
const key = "road_" + A + "_" + B, mid = S[Math.floor(N / 2)], lon = ISL.lon0 + mid[0] * ISL.tileM / ISL.kx, lat = ISL.lat0 - mid[1] * ISL.tileM / ISL.ky;
const out = { id: key, kind: "road", a: A, b: B, name: "The road from " + short(A) + " to " + short(B), w: W, h: H, tileM: TILE, km, credit: "Map data © OpenStreetMap contributors", terr: rle, houses, signs, buildings: [], props: [], boats: [], plots: [], exits: [], stop: { x: CX[12] + 0.5, y: 12.5 }, mid: [lon, lat], via: route.via, cx: CX };
const file = path.join(ROOT, "game", "public", key.replace(/_/g, "-") + "-map.js");
fs.writeFileSync(file, "// Built by tools/build-road.mjs from OpenStreetMap. Do not edit by hand.\n(window.REGION_MAPS = window.REGION_MAPS || {})[" + JSON.stringify(key) + "] = " + JSON.stringify(out) + ";\n");
const cnt = (c) => grid.reduce((s2, v) => s2 + (v === c), 0);
console.log(`${key}: ${W}x${H} tiles, ${km} km (${N} steps of ${TILE} m), road from column ${xa} to column ${xb}, bend up to ${Math.round(Math.max(...dev.map(Math.abs)) * kdev)} tiles. sea ${cnt(0)}, lagoon ${cnt(1)}, grass ${cnt(3)}, cane ${cnt(11)}, hills ${cnt(15)}, road ${cnt(4)}. ${houses.length} houses, ${signs.length} signs (${signs.filter((q) => q.k === "town").map((q) => q.t).join(", ")}). ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
fs.writeFileSync(path.join(HERE, key + "-preview.json"), JSON.stringify({ W, H, grid: Array.from(grid), houses, signs }));
