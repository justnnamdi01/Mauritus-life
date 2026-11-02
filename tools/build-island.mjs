// Build the island tile map from the OpenStreetMap extract.
// Usage: cd tools && npm install && node build-island.mjs [path/to/file.osm.pbf]
// Writes game/public/island.json: land, roads and buildings at about 150 m per tile, and which region each tile belongs to.
// Map data © OpenStreetMap contributors (ODbL). The game shows this credit on the island map.
import { createOSMStream } from "osm-pbf-parser-node";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const OSM_DIR = path.join(HERE, "osm");
const SRC = process.argv[2] || path.join(OSM_DIR, fs.readdirSync(OSM_DIR).filter((f) => f.endsWith(".osm.pbf")).sort().pop());
const OUT = path.join(ROOT, "game", "public", "island.json");
const REGIONS = JSON.parse(fs.readFileSync(path.join(ROOT, "game", "regions.json"), "utf8")).regions;

// The main island plus its northern islets (Coin de Mire, Île Plate). Rodrigues and Agaléga are left out.
const LON0 = 57.29, LON1 = 57.82, LAT0 = -19.86, LAT1 = -20.54, TILE_M = 150;
const KX = 111320 * Math.cos((20.2 * Math.PI) / 180), KY = 110600; // metres per degree here
const W = Math.ceil(((LON1 - LON0) * KX) / TILE_M), H = Math.ceil(((LAT0 - LAT1) * KY) / TILE_M);
const tx = (lon) => ((lon - LON0) * KX) / TILE_M, ty = (lat) => ((LAT0 - lat) * KY) / TILE_M;
const inBox = (lon, lat) => lon >= LON0 - 0.02 && lon <= LON1 + 0.02 && lat <= LAT0 + 0.02 && lat >= LAT1 - 0.02;

// Tile codes
const SEA = 0, LAND = 1, BUILDING = 2, ROAD = 3, MAJOR = 4;
const MAJOR_ROADS = new Set(["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"]);
const MINOR_ROADS = new Set(["tertiary", "tertiary_link", "unclassified", "residential", "living_street"]);

const nodes = new Map(); // id -> [lon, lat]
const coast = []; // node id lists
const roads = []; // [major?, node ids]
const buildings = []; // node id lists
let nWays = 0;
for await (const it of createOSMStream(SRC)) {
  if (it.type === "node") { if (inBox(it.lon, it.lat)) nodes.set(it.id, [it.lon, it.lat]); }
  else if (it.type === "way") {
    nWays++; const t = it.tags || {};
    if (t.natural === "coastline") coast.push(it.refs);
    else if (t.highway && (MAJOR_ROADS.has(t.highway) || MINOR_ROADS.has(t.highway))) roads.push([MAJOR_ROADS.has(t.highway), it.refs]);
    else if (t.building) buildings.push(it.refs);
  }
}
console.log(`read ${nodes.size} nodes in the box, ${nWays} ways: ${coast.length} coastline, ${roads.length} roads, ${buildings.length} buildings`);

// Join coastline ways end to end into closed rings.
const byStart = new Map(); for (const r of coast) byStart.set(r[0], r);
const used = new Set(), rings = []; let open = 0;
for (const r of coast) {
  if (used.has(r)) continue; used.add(r); let ring = r.slice();
  while (ring[0] !== ring[ring.length - 1]) { const nx = byStart.get(ring[ring.length - 1]); if (!nx || used.has(nx)) break; used.add(nx); ring = ring.concat(nx.slice(1)); }
  if (ring[0] === ring[ring.length - 1]) rings.push(ring); else open++;
}
const pts = (ids) => ids.map((id) => nodes.get(id)).filter(Boolean).map(([lo, la]) => [tx(lo), ty(la)]);
const grid = new Uint8Array(W * H);

// Fill each ring (scanline, even-odd per ring, then OR into the land).
let filledRings = 0;
for (const ring of rings) {
  const p = pts(ring); if (p.length < 4) continue;
  const ys = p.map((q) => q[1]); if (Math.max(...ys) < 0 || Math.min(...ys) > H) continue;
  const xs = p.map((q) => q[0]); if (Math.max(...xs) < 0 || Math.min(...xs) > W) continue;
  filledRings++;
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5, cut = [];
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > cy) !== (yj > cy)) cut.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi)); }
    cut.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cut.length; k += 2) for (let x = Math.max(0, Math.ceil(cut[k] - 0.5)); x <= Math.min(W - 1, Math.floor(cut[k + 1] - 0.5)); x++) grid[y * W + x] = LAND;
  }
}
console.log(`coastline: ${rings.length} closed rings (${filledRings} inside the box), ${open} pieces left open`);

// Buildings: mark the tile under each building's centre (only on land).
for (const b of buildings) { const p = pts(b); if (!p.length) continue; let sx = 0, sy = 0; for (const [x, y] of p) { sx += x; sy += y; } const x = Math.floor(sx / p.length), y = Math.floor(sy / p.length); if (x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === LAND) grid[y * W + x] = BUILDING; }

// Roads: draw each segment, minor first so major roads win.
roads.sort((a, b) => a[0] - b[0]);
for (const [major, ids] of roads) {
  const p = pts(ids);
  for (let i = 1; i < p.length; i++) {
    const [ax, ay] = p[i - 1], [bx, by] = p[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3) + 1;
    for (let k = 0; k <= n; k++) { const x = Math.floor(ax + ((bx - ax) * k) / n), y = Math.floor(ay + ((by - ay) * k) / n); if (x < 0 || y < 0 || x >= W || y >= H) continue; const i2 = y * W + x; if (grid[i2] === SEA) continue; if (major) grid[i2] = MAJOR; else if (grid[i2] !== MAJOR) grid[i2] = ROAD; }
  }
}

// Regions: every tile belongs to the region with the nearest seed point. Index into ids (0-based).
const seeds = []; REGIONS.forEach((r, i) => r.seeds.forEach(([lo, la]) => seeds.push([tx(lo), ty(la), i])));
const region = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let best = 0, bd = Infinity; for (const [sx, sy, i] of seeds) { const d = (sx - x - 0.5) ** 2 + (sy - y - 0.5) ** 2; if (d < bd) { bd = d; best = i; } } region[y * W + x] = best; }

const rle = (a) => { const out = []; let v = a[0], n = 0; for (const c of a) { if (c === v) n++; else { out.push(v, n); v = c; n = 1; } } out.push(v, n); return out; };
const count = (code) => grid.reduce((s, c) => s + (c === code), 0);
const out = {
  about: "Island tile map built by tools/build-island.mjs from " + path.basename(SRC) + ". Map data © OpenStreetMap contributors, ODbL. Codes: 0 sea, 1 land, 2 buildings, 3 road, 4 main road. 'region' indexes 'regions'.",
  credit: "Map data © OpenStreetMap contributors",
  w: W, h: H, tileM: TILE_M, lon0: LON0, lat0: LAT0, kx: KX, ky: KY,
  regions: REGIONS.map((r) => r.id),
  tiles: rle(grid), region: rle(region)
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${W} x ${H} tiles, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB. land ${count(LAND)}, buildings ${count(BUILDING)}, roads ${count(ROAD)}, main roads ${count(MAJOR)}`);
