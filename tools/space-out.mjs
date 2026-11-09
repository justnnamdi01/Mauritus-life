// Give the towns some breathing room (run after build-region.mjs and widen-water.mjs).
// Usage: node space-out.mjs grandbaie portlouis west bambous
//  1. big buildings are made a little smaller (they keep their front, so the door stays where it was);
//  2. any building closer than 3 tiles to a neighbour, to a house or to the Metro line is nudged away, when there is free ground for it;
//  3. Port Louis gets the railway's way out of town (`railExt`): the line carries on from the map corner across the countryside, kept clear of everything.
// Map data stays © OpenStreetMap contributors.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAIL_EXT = [[3.6, 85.9], [3.0, 94], [3.2, 103], [3.8, 112], [4.2, 121], [4.4, 132]]; // continues the real line past the bottom of the Port Louis map, over the grass, to a tunnel portal
for (const id of process.argv.slice(2)) {
  const file = path.join(ROOT, "game/public", id + "-map.js"), src = fs.readFileSync(file, "utf8"), i = src.indexOf("= {") + 2, j = src.lastIndexOf(";"), M = JSON.parse(src.slice(i, j)), w = M.w, h = M.h;
  const t = new Uint8Array(w * h); { let k = 0; for (let a = 0; a < M.terr.length; a += 2) { t.fill(M.terr[a], k, k + M.terr[a + 1]); k += M.terr[a + 1]; } }
  const B = M.buildings, houses = (M.houses || []).map((q) => ({ x: q[0], y: q[1], w: q[2], h: q[3], house: 1 }));
  const gap = (a, b) => { const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)); return Math.hypot(dx, dy); };
  const line = id === "portlouis" && M.railLine ? RAIL_EXT.map((q) => q.slice()).reverse().concat(M.railLine) : null; if (id === "portlouis") M.railExt = RAIL_EXT;
  const segD = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, tt = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)); return Math.hypot(px - (a[0] + dx * tt), py - (a[1] + dy * tt)); };
  const railGap = (b) => { if (!line) return 99; let d = 99; for (let x = b.x; x <= b.x + b.w; x += 0.5) for (const y of [b.y, b.y + b.h]) for (let k = 1; k < line.length; k++) d = Math.min(d, segD(x, y, line[k - 1], line[k])); for (let y = b.y; y <= b.y + b.h; y += 0.5) for (const x of [b.x, b.x + b.w]) for (let k = 1; k < line.length; k++) d = Math.min(d, segD(x, y, line[k - 1], line[k])); return d; };
  const isStation = (b) => /Metro Express|Metro/i.test(b.name || "") || b.kindx === "metro";
  let shrunk = 0, moved = 0;
  for (const b of B) { if (isStation(b)) continue; const nw = b.w >= 7 ? b.w - 2 : b.w >= 5 ? b.w - 1 : b.w, nh = b.h >= 7 ? b.h - 2 : b.h >= 5 ? b.h - 1 : b.h; if (nw !== b.w || nh !== b.h) { b.x += Math.floor((b.w - nw) / 2); b.y += b.h - nh; b.w = nw; b.h = nh; shrunk++; } } // keep the front (south) edge and the middle of the door
  const free = (b, nx, ny) => { if (nx < 2 || ny < 2 || nx + b.w > w - 2 || ny + b.h > h - 3) return false; for (let y = ny - 1; y <= ny + b.h; y++) for (let x = nx - 1; x <= nx + b.w; x++) { const c = t[y * w + x]; if (c === 0 || c === 1 || c === 4 || c === 23 || c === 22 && (y >= ny + b.h)) { if (!(x < nx || x >= nx + b.w || y < ny || y >= ny + b.h)) return false; } } for (const o of B.concat(houses)) { if (o === b) continue; if (gap({ x: nx, y: ny, w: b.w, h: b.h }, o) < 2) return false; } return true; };
  const worst = (b) => { let g = 99; for (const o of B.concat(houses)) if (o !== b) g = Math.min(g, gap(b, o)); return Math.min(g, isStation(b) ? 99 : railGap(b) - 0.6); };
  for (let pass = 0; pass < 8; pass++) { let any = false; for (const b of B) { if (isStation(b)) continue; const cur = worst(b); if (cur >= 3) continue; let best = null, bg = cur; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) { const nx = b.x + dx, ny = b.y + dy; if (!free(b, nx, ny)) continue; const probe = { x: nx, y: ny, w: b.w, h: b.h }; let g = 99; for (const o of B.concat(houses)) if (o !== b) g = Math.min(g, gap(probe, o)); g = Math.min(g, railGap(probe) - 0.6); if (g > bg + 0.4) { bg = g; best = [nx, ny]; } } if (best) { b.x = best[0]; b.y = best[1]; moved++; any = true; } } if (!any) break; }
  for (const b of B) { if (isStation(b) || railGap(b) >= 1.8) continue; let best = null, bg = railGap(b); for (let r = 1; r <= 6; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const nx = b.x + dx, ny = b.y + dy; if (!free(b, nx, ny)) continue; const g = railGap({ x: nx, y: ny, w: b.w, h: b.h }); if (g >= 2.2 && (!best || r < best.r)) best = { r, nx, ny }; } if (best) { b.x = best.nx; b.y = best.ny; moved++; } }
  let tight = 0, onRail = []; for (const b of B) { if (worst(b) < 2) tight++; if (!isStation(b) && railGap(b) < 1.8) onRail.push(b.name + "@" + b.x + "," + b.y); }
  fs.writeFileSync(file, src.slice(0, i) + JSON.stringify(M) + src.slice(j));
  console.log(id + ": " + shrunk + " made smaller, " + moved + " moved; " + tight + " still closer than 2 tiles" + (line ? "; near the railway: " + (onRail.join(", ") || "none") : ""));
}
