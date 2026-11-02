// Build one region's walkable map from the OpenStreetMap extract, at 12 m per tile.
// Usage: cd tools && node build-region.mjs grandbaie [path/to/file.osm.pbf]
// Writes game/public/<id>-map.js (a script that sets window.REGION_MAPS[<id>]), loaded by the game before it starts.
// Real roads, coastline, beaches, parks and fields become tiles. Real landmarks (church, school, police, bazaar...) keep their names.
// Shops and hotels get generic names on purpose: they belong to real businesses. Map data © OpenStreetMap contributors (ODbL).
import { createOSMStream } from "osm-pbf-parser-node";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, "..");
const REGIONS = {
  grandbaie: { name: "Grand Baie", lon: 57.5868, lat: -20.0120, w: 120, h: 80, tileM: 12 } // the bay front: La Cuvette, the bazaar, Sunset Boulevard (the coast road)
};
const id = process.argv[2], R = REGIONS[id]; if (!R) { console.error("Unknown region. Known: " + Object.keys(REGIONS).join(", ")); process.exit(1); }
const OSM_DIR = path.join(HERE, "osm"), SRC = process.argv[3] || path.join(OSM_DIR, fs.readdirSync(OSM_DIR).filter((f) => f.endsWith(".osm.pbf")).sort().pop());
const KX = 111320 * Math.cos((R.lat * Math.PI) / 180), KY = 110600, M = R.tileM, W = R.w, H = R.h;
const lon0 = R.lon - (W * M) / KX / 2, lat0 = R.lat + (H * M) / KY / 2; // top-left corner
const tx = (lo) => ((lo - lon0) * KX) / M, ty = (la) => ((lat0 - la) * KY) / M;
const near = (lo, la, pad = 0.03) => lo > lon0 - pad && lo < lon0 + (W * M) / KX + pad && la < lat0 + pad && la > lat0 - (H * M) / KY - pad;

// codes (the engine's terrain types): 0 deep sea, 1 lagoon, 2 sand, 3 grass, 4 road, 9 park, 11 cane field, 12 pitch, 22 paved
const nodes = new Map(), ways = [];
for await (const it of createOSMStream(SRC)) {
  if (it.type === "node") { if (near(it.lon, it.lat, 0.06)) nodes.set(it.id, [it.lon, it.lat]); }
  else if (it.type === "way") ways.push({ t: it.tags || {}, r: it.refs });
}
const pts = (r) => r.map((i) => nodes.get(i)).filter(Boolean).map(([lo, la]) => [tx(lo), ty(la)]);
const inBox = (p) => p.some(([x, y]) => x > -4 && x < W + 4 && y > -4 && y < H + 4);

// 1. sea: join every coastline into closed rings (land on the left in OSM, so each closed ring is land), fill them
const coast = ways.filter((w) => w.t.natural === "coastline").map((w) => w.r), byStart = new Map(); for (const r of coast) byStart.set(r[0], r);
const used = new Set(), rings = []; for (const r of coast) { if (used.has(r)) continue; used.add(r); let ring = r.slice(); while (ring[0] !== ring[ring.length - 1]) { const nx = byStart.get(ring[ring.length - 1]); if (!nx || used.has(nx)) break; used.add(nx); ring = ring.concat(nx.slice(1)); } if (ring[0] === ring[ring.length - 1]) rings.push(ring); }
const land = new Uint8Array(W * H);
for (const ring of rings) { const p = pts(ring); if (p.length < 4 || !inBox(p) && !p.some(([x, y]) => Math.abs(x - W / 2) < 4000 && Math.abs(y - H / 2) < 4000)) continue;
  for (let y = 0; y < H; y++) { const cy = y + 0.5, cut = []; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > cy) !== (yj > cy)) cut.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi)); } cut.sort((a, b) => a - b); for (let k = 0; k + 1 < cut.length; k += 2) for (let x = Math.max(0, Math.ceil(cut[k] - 0.5)); x <= Math.min(W - 1, Math.floor(cut[k + 1] - 0.5)); x++) land[y * W + x] = 1; } }
const grid = new Uint8Array(W * H); // start: land = grass, sea = deep
for (let i = 0; i < W * H; i++) grid[i] = land[i] ? 3 : 0;
// shallow water (lagoon, swimmable) within 5 tiles of land; sand on the land tiles next to the sea
const dist = new Int16Array(W * H).fill(99); { const q = []; for (let i = 0; i < W * H; i++) if (land[i]) { dist[i] = 0; q.push(i); } for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (dist[n] > dist[i] + 1) { dist[n] = dist[i] + 1; q.push(n); } } } }
for (let i = 0; i < W * H; i++) if (!land[i] && dist[i] <= 5) grid[i] = 1;
const seaD = new Int16Array(W * H).fill(99); { const q = []; for (let i = 0; i < W * H; i++) if (!land[i]) { seaD[i] = 0; q.push(i); } for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (seaD[n] > seaD[i] + 1) { seaD[n] = seaD[i] + 1; q.push(n); } } } }
for (let i = 0; i < W * H; i++) if (land[i] && seaD[i] <= 2) grid[i] = 2; // the beach strip
const fill = (p, code, only) => { for (let y = Math.max(0, Math.floor(Math.min(...p.map((q) => q[1])))); y <= Math.min(H - 1, Math.ceil(Math.max(...p.map((q) => q[1])))); y++) { const cy = y + 0.5, cut = []; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > cy) !== (yj > cy)) cut.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi)); } cut.sort((a, b) => a - b); for (let k = 0; k + 1 < cut.length; k += 2) for (let x = Math.max(0, Math.ceil(cut[k] - 0.5)); x <= Math.min(W - 1, Math.floor(cut[k + 1] - 0.5)); x++) { const i = y * W + x; if (land[i] && (!only || only.includes(grid[i]))) grid[i] = code; } } };
const closed = (w) => w.r.length > 3 && w.r[0] === w.r[w.r.length - 1];
for (const w of ways) { const t = w.t; if (!closed(w)) continue; const p = pts(w.r); if (!inBox(p)) continue;
  if (t.natural === "beach") fill(p, 2); else if (t.leisure === "park" || t.leisure === "garden" || t.landuse === "grass" || t.landuse === "recreation_ground") fill(p, 9, [3]); else if (t.leisure === "pitch") fill(p, 12, [3, 9]); else if (t.landuse === "farmland" || t.landuse === "farm" || t.landuse === "orchard" || t.landuse === "plantation") fill(p, 11, [3]); else if (t.amenity === "parking" || t.landuse === "retail" || t.landuse === "commercial") fill(p, 22, [3, 9]); }
// 2. roads: main roads 2 tiles wide, streets 1 tile, drawn with a thick line
const MAIN = new Set(["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"]), MINOR = new Set(["tertiary", "tertiary_link", "unclassified", "residential", "living_street"]);
const dot = (x, y, wide) => { for (let dy = 0; dy <= (wide ? 1 : 0); dy++) for (let dx = 0; dx <= (wide ? 1 : 0); dx++) { const px = Math.floor(x) + dx, py = Math.floor(y) + dy; if (px >= 0 && py >= 0 && px < W && py < H && land[py * W + px]) grid[py * W + px] = 4; } };
const roadWays = ways.filter((w) => w.t.highway && (MAIN.has(w.t.highway) || MINOR.has(w.t.highway))).sort((a, b) => MAIN.has(a.t.highway) - MAIN.has(b.t.highway));
for (const w of roadWays) { const p = pts(w.r); if (!inBox(p)) continue; const wide = MAIN.has(w.t.highway); for (let i = 1; i < p.length; i++) { const [ax, ay] = p[i - 1], [bx, by] = p[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3) + 1; for (let k = 0; k <= n; k++) dot(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, wide); } }
// 3. places: real landmarks keep their names, shops and hotels get generic ones
const PUBLIC = { place_of_worship: ["⛪", null], school: ["🏫", null], police: ["🚓", "Police Station"], library: ["📚", "Library"], marketplace: ["🥭", null], hospital: ["🏥", null], townhall: ["🏛️", "Town Hall"], post_office: ["📮", "Post Office"], bank: ["🏦", "Bank"], pharmacy: ["💊", "Pharmacy"], fuel: ["⛽", "Petrol Station"], cafe: ["☕", "Café"], restaurant: ["🍽️", "Restaurant"], fast_food: ["🍔", "Snack Bar"], bar: ["🍹", "Bar"], pub: ["🍺", "Bar"], nightclub: ["🪩", "Night Club"], cinema: ["🎬", "Cinema"] };
const GENERIC = { hotel: ["🏨", "Beach Hotel"], resort: ["🏨", "Beach Resort"], supermarket: ["🛒", "Supermarket"], mall: ["🛍️", "Shopping Centre"], clothes: ["👕", "Clothes Shop"], electronics: ["📱", "Electronics Shop"], hardware: ["🔧", "Hardware Shop"], bakery: ["🥖", "Bakery"], convenience: ["🏪", "Mini Market"] };
const places = []; const centroid = (p) => { let sx = 0, sy = 0; for (const [x, y] of p) { sx += x; sy += y; } return [sx / p.length, sy / p.length]; };
for (const w of ways) { const t = w.t, kind = t.amenity || t.shop || t.tourism || t.building; const info = PUBLIC[t.amenity] || PUBLIC[t.shop] || GENERIC[t.shop] || GENERIC[t.tourism] || GENERIC[t.building]; if (!info) continue; const p = pts(w.r); if (p.length < 3) continue; const [cx, cy] = centroid(p); if (cx < 3 || cy < 3 || cx > W - 3 || cy > H - 3 || !land[Math.floor(cy) * W + Math.floor(cx)]) continue;
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys); let name = info[1] || (t.name || "").trim(); if (!name) continue; if (!info[1] && t.amenity === "place_of_worship") name = name.replace(/\s+/g, " ");
  places.push({ icon: info[0], name: name.slice(0, 34), cx, cy, bw, bh, kind: t.amenity || t.shop || t.tourism || kind }); }
// 4. turn places into game buildings: a box of 3 to 9 tiles, placed on free grass or paving beside a road, never on a road, never overlapping
const taken = new Uint8Array(W * H); const okTile = (x, y) => x >= 0 && y >= 0 && x < W && y < H && land[y * W + x] && [3, 9, 22, 11].includes(grid[y * W + x]) && !taken[y * W + x];
const roadNear = (x, y, w, h) => { for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && grid[yy * W + xx] === 4) return true; return false; };
const buildings = []; places.sort((a, b) => b.bw * b.bh - a.bw * a.bh);
const seen = new Set();
for (const pl of places) { const key = pl.name + "|" + Math.round(pl.cx / 6) + "|" + Math.round(pl.cy / 6); if (seen.has(key)) continue; seen.add(key); if (buildings.length >= 36) break;
  const w = Math.max(3, Math.min(9, Math.round(pl.bw) + 1)), h = Math.max(3, Math.min(7, Math.round(pl.bh) + 1)); let best = null;
  for (let r = 0; r <= 8 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r && !best; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = Math.round(pl.cx - w / 2) + dx, y = Math.round(pl.cy - h / 2) + dy; let free = true; for (let yy = y - 1; yy <= y + h && free; yy++) for (let xx = x - 1; xx <= x + w && free; xx++) { if (yy < 0 || xx < 0 || yy >= H || xx >= W) { free = false; break; } if (taken[yy * W + xx]) free = false; } for (let yy = y; yy < y + h && free; yy++) for (let xx = x; xx < x + w && free; xx++) if (!okTile(xx, yy)) free = false; if (free && (grid[(y + h) * W + x + (w >> 1)] === 4 || roadNear(x, y, w, h))) best = { x, y }; }
  if (!best) continue; for (let yy = best.y - 1; yy <= best.y + h; yy++) for (let xx = best.x - 1; xx <= best.x + w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) taken[yy * W + xx] = 1; buildings.push({ x: best.x, y: best.y, w, h, name: pl.name, icon: pl.icon, kind: pl.kind }); }
// 4b. a few ordinary shops from the biggest real building footprints, so the town has enough places (generic names)
{ const extra = []; for (const w of ways) { if (!w.t.building || w.t.name) continue; const p = pts(w.r); if (p.length < 4) continue; const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys); const [cx, cy] = centroid(p); if (cx < 4 || cy < 4 || cx > W - 4 || cy > H - 4 || bw * bh < 2.2) continue; extra.push({ cx, cy, bw, bh, a: bw * bh }); }
  extra.sort((a, b) => b.a - a.a); const GEN = [["🛒", "Mini Market"], ["👕", "Clothes Shop"], ["💊", "Pharmacy"], ["🥖", "Bakery"], ["🔧", "Hardware Shop"], ["💈", "Barber"], ["📱", "Phone Shop"], ["🐟", "Fish Market"]]; let gi = 0;
  for (const pl of extra) { if (buildings.length >= 18) break; const w = Math.max(3, Math.min(6, Math.round(pl.bw) + 1)), h = Math.max(3, Math.min(5, Math.round(pl.bh) + 1)); let best = null;
    for (let r = 0; r <= 4 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r && !best; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = Math.round(pl.cx - w / 2) + dx, y = Math.round(pl.cy - h / 2) + dy; let free = true; for (let yy = y - 1; yy <= y + h && free; yy++) for (let xx = x - 1; xx <= x + w && free; xx++) { if (yy < 0 || xx < 0 || yy >= H || xx >= W || taken[yy * W + xx]) free = false; } for (let yy = y; yy < y + h && free; yy++) for (let xx = x; xx < x + w && free; xx++) if (!okTile(xx, yy)) free = false; if (free && roadNear(x, y, w, h)) best = { x, y }; }
    if (!best) continue; for (let yy = best.y - 1; yy <= best.y + h; yy++) for (let xx = best.x - 1; xx <= best.x + w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) taken[yy * W + xx] = 1; const g = GEN[gi++ % GEN.length]; buildings.push({ x: best.x, y: best.y, w, h, name: g[1], icon: g[0], kind: "shop" }); } }
// 5. house plots (the Pereybere Estate idea): 3x3 houses on a 6-tile grid (three empty tiles between), inland, not on sand, roads or places, with a free tile at the door
const plots = []; const free3 = (x, y) => { for (let yy = y - 1; yy <= y + 4; yy++) for (let xx = x - 1; xx <= x + 3; xx++) { if (xx < 0 || yy < 0 || xx >= W || yy >= H || taken[yy * W + xx]) return false; } for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) { if (![3, 9].includes(grid[yy * W + xx]) || seaD[yy * W + xx] < 8) return false; } return [3, 9, 22, 4].includes(grid[(y + 3) * W + x + 1]); };
for (let gy = 2; gy < H - 6; gy += 6) for (let gx = 2; gx < W - 4; gx += 6) { if (free3(gx, gy)) { plots.push({ x: gx, y: gy }); for (let yy = gy - 1; yy <= gy + 3; yy++) for (let xx = gx - 1; xx <= gx + 3; xx++) taken[yy * W + xx] = 1; } }
// 6. the intercity bus station: beside the bazaar if there is one, else the biggest road crossing near the middle
const bz = buildings.find((b) => /Baza+r|Market/i.test(b.name)); let stop = null; const cx0 = bz ? bz.x + bz.w / 2 : W / 2, cy0 = bz ? bz.y + bz.h + 1 : H / 2;
for (let r = 0; r < 30 && !stop; r++) for (let dy = -r; dy <= r && !stop; dy++) for (let dx = -r; dx <= r && !stop; dx++) { const x = Math.floor(cx0 + dx), y = Math.floor(cy0 + dy); if (Math.max(Math.abs(dx), Math.abs(dy)) === r && x > 1 && y > 1 && x < W - 2 && y < H - 2 && grid[y * W + x] === 4) stop = { x: x + 0.5, y: y + 0.5 }; }
// the first two shops: the places closest to the bus station that are ordinary shops become a food stall and a bar
{ const cand = buildings.filter((b) => b.kind === "shop" || /Restaurant|Snack/.test(b.name)).sort((a, b) => Math.hypot(a.x - stop.x, a.y - stop.y) - Math.hypot(b.x - stop.x, b.y - stop.y)); if (cand[0]) Object.assign(cand[0], { name: "Dholl Puri Corner", icon: "🫓", open: "snack" }); if (cand[1]) Object.assign(cand[1], { name: "Sega Bar", icon: "🍹", open: "bar" }); }
plots.sort((a, b) => Math.hypot(a.x - stop.x, a.y - stop.y) - Math.hypot(b.x - stop.x, b.y - stop.y)); // the first addresses are the ones nearest the town centre
// an apartment block fallback (when every plot is taken): the biggest free grass patch
let apts = null; for (let y = 2; y < H - 10 && !apts; y++) for (let x = 2; x < W - 10 && !apts; x++) { let ok = true; for (let yy = y - 1; yy < y + 9 && ok; yy++) for (let xx = x - 1; xx < x + 8 && ok; xx++) if (taken[yy * W + xx] || !land[yy * W + xx] || ![3, 9, 22].includes(grid[yy * W + xx]) || seaD[yy * W + xx] < 3) ok = false; if (ok) apts = { x, y, w: 6, h: 7 }; }
// pack: run-length terrain so the file stays small
const rle = []; { let v = grid[0], n = 0; for (const c of grid) { if (c === v) n++; else { rle.push(v, n); v = c; n = 1; } } rle.push(v, n); }
const out = { id, name: R.name, w: W, h: H, tileM: M, lon0, lat0, credit: "Map data © OpenStreetMap contributors", terr: rle, buildings, plots, stop, apts };
const file = path.join(ROOT, "game", "public", id + "-map.js");
fs.writeFileSync(file, "// Built by tools/build-region.mjs from OpenStreetMap. Do not edit by hand.\n(window.REGION_MAPS = window.REGION_MAPS || {})[" + JSON.stringify(id) + "] = " + JSON.stringify(out) + ";\n");
const cnt = (c) => grid.reduce((s, v) => s + (v === c), 0);
console.log(`${id}: ${W}x${H} tiles at ${M} m. sea ${cnt(0)}, lagoon ${cnt(1)}, sand ${cnt(2)}, grass ${cnt(3)}, road ${cnt(4)}, park ${cnt(9)}, pavement ${cnt(22)}. ${buildings.length} places, ${plots.length} house plots, stop ${JSON.stringify(stop)}, apts ${JSON.stringify(apts)}. ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
console.log(buildings.map((b) => b.icon + " " + b.name).join(" | "));
// a quick picture for checking
const cols = { 0: [20, 60, 92], 1: [70, 170, 200], 2: [240, 225, 170], 3: [120, 190, 100], 4: [90, 90, 96], 9: [150, 210, 130], 11: [190, 210, 120], 12: [120, 220, 130], 22: [200, 195, 185] };
fs.writeFileSync(path.join(HERE, id + "-preview.json"), JSON.stringify({ W, H, grid: Array.from(grid), buildings, plots, stop, apts }));
