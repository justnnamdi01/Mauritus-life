// Build the scenery around Port Louis: the rest of the real city and the land behind it, in the same tile frame as the Port Louis map.
// Usage: cd tools && node build-surround.mjs [path/to/file.osm.pbf]
// Writes game/public/portlouis-surround.js (window.PL_SURROUND). This land is NOT walkable: the game draws it as far scenery under clouds
// until a region is opened. Coarse on purpose (14 m tiles): built-up ground, roads, farmland, forest, coast and the mountain peaks.
// Map data © OpenStreetMap contributors (ODbL).
import { createOSMStream } from "osm-pbf-parser-node";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, "..");
const PL = fs.readFileSync(path.join(ROOT, "game/public/portlouis-map.js"), "utf8"), lon0 = +PL.match(/"lon0":([-\d.]+)/)[1], lat0 = +PL.match(/"lat0":([-\d.]+)/)[1], M = 14;
const KX = 111320 * Math.cos((-20.1605 * Math.PI) / 180), KY = 110600;
const X0 = 120, Y0 = -70, W = 300, H = 220; // the strip east of the Port Louis map, and a little above and below it
const OSM_DIR = path.join(HERE, "osm"), SRC = process.argv[2] || path.join(OSM_DIR, fs.readdirSync(OSM_DIR).filter((f) => f.endsWith(".osm.pbf")).sort().pop());
const tx = (lo) => ((lo - lon0) * KX) / M - X0, ty = (la) => ((lat0 - la) * KY) / M - Y0;
const nodes = new Map(), ways = [], peaks = [];
for await (const it of createOSMStream(SRC)) {
  if (it.type === "node") { const x = tx(it.lon), y = ty(it.lat); nodes.set(it.id, [x, y]); if (it.tags && it.tags.natural === "peak" && x > -60 && x < W + 60 && y > -60 && y < H + 60) peaks.push({ x, y, name: it.tags.name || "", ele: +it.tags.ele || 0 }); }
  else if (it.type === "way") ways.push({ t: it.tags || {}, r: it.refs });
}
const pts = (r) => r.map((i) => nodes.get(i)).filter(Boolean);
const inBox = (p) => p.some(([x, y]) => x > -4 && x < W + 4 && y > -4 && y < H + 4);
const closed = (w) => w.r.length > 3 && w.r[0] === w.r[w.r.length - 1];
const g = new Uint8Array(W * H), land = new Uint8Array(W * H);
// coast: closed rings are land (OSM puts land on the left); the coastline here is cut by the box, so join the open pieces to the box edge
const coast = ways.filter((w) => w.t.natural === "coastline").map((w) => w.r), byStart = new Map(); for (const r of coast) byStart.set(r[0], r);
const polyFill = (p, fn) => { const y0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...p.map((q) => q[1])))); for (let y = y0; y <= y1; y++) { const cy = y + 0.5, cut = []; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > cy) !== (yj > cy)) cut.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi)); } cut.sort((a, b) => a - b); for (let k = 0; k + 1 < cut.length; k += 2) for (let x = Math.max(0, Math.ceil(cut[k] - 0.5)); x <= Math.min(W - 1, Math.floor(cut[k + 1] - 0.5)); x++) fn(x, y); } };
// the island is one big ring: stitch the coast pieces end to end, then fill
{ const used = new Set(), rings = []; for (const r of coast) { if (used.has(r)) continue; used.add(r); let ring = r.slice(); while (ring[0] !== ring[ring.length - 1]) { const nx = byStart.get(ring[ring.length - 1]); if (!nx || used.has(nx)) break; used.add(nx); ring = ring.concat(nx.slice(1)); } if (ring[0] === ring[ring.length - 1]) rings.push(ring); }
  for (const ring of rings) { const p = pts(ring); if (p.length < 4) continue; polyFill(p, (x, y) => { land[y * W + x] ^= 1; }); } }
for (let i = 0; i < W * H; i++) g[i] = land[i] ? 3 : 0;
// shallow water within 4 tiles of land, sand on the shore
const dist = (isLand) => { const d = new Int16Array(W * H).fill(99), q = []; for (let i = 0; i < W * H; i++) if (!!land[i] === isLand) { d[i] = 0; q.push(i); } for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (d[n] > d[i] + 1) { d[n] = d[i] + 1; q.push(n); } } } return d; };
{ const dl = dist(true), ds = dist(false); for (let i = 0; i < W * H; i++) { if (!land[i] && dl[i] <= 4) g[i] = 1; else if (land[i] && ds[i] <= 1) g[i] = 2; } }
const paint = (p, code, only) => polyFill(p, (x, y) => { const i = y * W + x; if (land[i] && (!only || only.includes(g[i]))) g[i] = code; });
for (const w of ways) { const t = w.t; if (!closed(w)) continue; const p = pts(w.r); if (p.length < 4 || !inBox(p)) continue;
  if (t.landuse === "forest" || t.natural === "wood") paint(p, 14, [3]); else if (t.landuse === "farmland" || t.landuse === "farm" || t.landuse === "orchard" || t.landuse === "plantation" || t.landuse === "meadow") paint(p, 11, [3]);
  else if (t.leisure === "park" || t.leisure === "garden" || t.landuse === "grass" || t.landuse === "recreation_ground" || t.leisure === "golf_course") paint(p, 9, [3, 11]);
  else if (t.landuse === "industrial") paint(p, 16, [3, 11, 14]); else if (t.landuse === "residential" || t.landuse === "commercial" || t.landuse === "retail" || t.landuse === "construction") paint(p, 15, [3, 11, 14]);
  else if (t.natural === "water" || t.landuse === "reservoir") { polyFill(p, (x, y) => { const i = y * W + x; if (land[i]) g[i] = 1; }); } }
for (const w of ways) { if (!w.t.building || !closed(w)) continue; const p = pts(w.r); if (p.length < 4 || !inBox(p)) continue; paint(p, 15, [3, 11, 14, 9]); }
// roads: one tile wide (two for the big ones), drawn as straight steps between the real points
const MAIN = new Set(["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"]), MIN = new Set(["tertiary", "residential", "unclassified", "tertiary_link"]);
const dot = (x, y, wd) => { for (let yy = y; yy < y + wd; yy++) for (let xx = x; xx < x + wd; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && land[yy * W + xx] && g[yy * W + xx] !== 1) g[yy * W + xx] = 4; };
for (const w of ways) { const h = w.t.highway; if (!h || !(MAIN.has(h) || MIN.has(h))) continue; const p = pts(w.r); if (p.length < 2 || !inBox(p)) continue; const wd = MAIN.has(h) ? 2 : 1;
  for (let i = 1; i < p.length; i++) { const [ax, ay] = p[i - 1], [bx, by] = p[i], n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2) + 1; for (let k = 0; k <= n; k++) dot(Math.round(ax + ((bx - ax) * k) / n), Math.round(ay + ((by - ay) * k) / n), wd); } }
// the rest of the land: grass with a little forest on the high ground is done by the game from the peaks
const rle = []; { let v = g[0], n = 0; for (let i = 0; i < W * H; i++) { if (g[i] === v && n < 65000) n++; else { rle.push(v, n); v = g[i]; n = 1; } } rle.push(v, n); }
const pk = peaks.filter((q) => q.x > -30 && q.x < W + 30 && q.y > -30 && q.y < H + 30 && q.ele >= 150).map((q) => [Math.round(q.x), Math.round(q.y), q.name, q.ele]);
const counts = {}; for (let i = 0; i < W * H; i++) counts[g[i]] = (counts[g[i]] || 0) + 1;
const out = { id: "portlouis-surround", x0: X0, y0: Y0, w: W, h: H, tileM: M, credit: "Map data © OpenStreetMap contributors", terr: rle, peaks: pk };
fs.writeFileSync(path.join(ROOT, "game/public/portlouis-surround.js"), "// Built by tools/build-surround.mjs from OpenStreetMap. Do not edit by hand. Scenery only: not walkable.\nwindow.PL_SURROUND = " + JSON.stringify(out) + ";\n");
console.log("tiles", counts, "peaks", pk.length, pk.slice(0, 8).map((q) => q.join(":")).join(" "), "bytes", fs.statSync(path.join(ROOT, "game/public/portlouis-surround.js")).size);
