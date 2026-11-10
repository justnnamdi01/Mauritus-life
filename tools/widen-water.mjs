// Widen the harbour water of a built region map so ships and boats have room (run after build-region.mjs).
// Usage: node widen-water.mjs grandbaie portlouis west   (optionally --by=3)
// Beach and grass tiles within `by` tiles of the water become shallow lagoon, but never next to roads, paving, buildings, houses, props or other marked places.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const by = +((process.argv.find((a) => a.startsWith("--by=")) || "--by=3").slice(5));
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
for (const id of ids) {
  const file = path.join(ROOT, "game/public", id + "-map.js"), src = fs.readFileSync(file, "utf8"), i = src.indexOf("= {") + 2, j = src.lastIndexOf(";"), M = JSON.parse(src.slice(i, j)), w = M.w, h = M.h;
  const t = new Uint8Array(w * h); { let k = 0; for (let a = 0; a < M.terr.length; a += 2) { t.fill(M.terr[a], k, k + M.terr[a + 1]); k += M.terr[a + 1]; } }
  const keep = new Uint8Array(w * h); const box = (x0, y0, x1, y1, pad) => { for (let y = Math.max(0, Math.floor(y0 - pad)); y <= Math.min(h - 1, Math.ceil(y1 + pad)); y++) for (let x = Math.max(0, Math.floor(x0 - pad)); x <= Math.min(w - 1, Math.ceil(x1 + pad)); x++) keep[y * w + x] = 1; };
  for (const b of M.buildings || []) box(b.x, b.y, b.x + b.w, b.y + b.h, 2.5); for (const q of M.houses || []) box(q[0], q[1], q[0] + q[2], q[1] + q[3], 2); for (const p of M.props || []) box(p.x, p.y, p.x, p.y, 2.5); for (const l of M.lots || []) box(l.x, l.y, l.x + l.w, l.y + l.h, 2); for (const b of M.boats || []) box(b.x - 2, b.y - 2, b.x + 2, b.y + 2, 1);
  if (M.stop) box(M.stop.x, M.stop.y, M.stop.x, M.stop.y, 5); for (const e of M.exits || []) if (typeof e.x === "number") box(e.x, e.y, e.x, e.y, 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ([4, 22, 9, 12, 7, 23, 11, 15, 17, 18].includes(t[y * w + x])) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) keep[yy * w + xx] = 1; }
  const water = (v) => v === 0 || v === 1; let dist = new Int16Array(w * h).fill(99), q = []; for (let k = 0; k < w * h; k++) if (water(t[k])) { dist[k] = 0; q.push(k); }
  for (let a = 0; a < q.length; a++) { const k = q[a], x = k % w, y = (k / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const n = ny * w + nx; if (dist[n] > dist[k] + 1) { dist[n] = dist[k] + 1; q.push(n); } } }
  let n = 0; for (let k = 0; k < w * h; k++) if ((t[k] === 2 || t[k] === 3) && dist[k] <= by && !keep[k]) { t[k] = 1; n++; }
  const rle = []; { let v = t[0], c = 0; for (let k = 0; k < w * h; k++) { if (t[k] === v && c < 65000) c++; else { rle.push(v, c); v = t[k]; c = 1; } } rle.push(v, c); }
  M.terr = rle; M.widened = by; fs.writeFileSync(file, src.slice(0, i) + JSON.stringify(M) + src.slice(j));
  console.log(id + ": " + n + " tiles of beach and grass became water (by " + by + ")");
}
