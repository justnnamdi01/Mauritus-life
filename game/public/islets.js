"use strict";
// ISLETS: a small island out in the sea for each town's richest-player statue, joined to the shore by a paved causeway,
// and a wider waterfront for Port Louis. Runs before the ground is painted, so it edits the tile map (terr) directly.
window.ISL_APPLY = function () {
  if (window.ISLETS) return; const ISLETS = window.ISLETS = [];
  if (typeof WREG === "undefined" || typeof terr === "undefined") return;
  const LAND = (i) => !solid[i] && [2, 3, 5, 9, 10, 22].includes(terr[i]), WATER = (i) => terr[i] <= 1;
  const set = (reg, x, y, t) => { const i = y * W + x; terr[i] = t; if (t > 1 && solid[i] === 1) solid[i] = 0; try { reg.T[(y - reg.y0) * reg.M.w + x] = t; } catch (e) {} };
  const hubOf = (reg) => { if (reg.id === "portlouis") { const z = (reg.M.zones || []).find((q) => q.k === "caudan"); if (z) return { x: z.x - 2, y: reg.y0 + z.y + 4 }; } return reg.stop ? { x: reg.stop.x, y: reg.stop.y } : { x: reg.M.w / 2, y: reg.y0 + reg.M.h / 2 }; };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], RAD = 6, CW = 4; // island radius, causeway length
  for (const reg of WREG) {
    if (reg.kind === "road") continue;
    try {
      const hub = hubOf(reg), x0 = 4, x1 = reg.M.w - 4, y0 = reg.y0 + 4, y1 = reg.y0 + reg.M.h - 4; let best = null, bs = 1e9;
      for (let y = Math.max(y0, Math.floor(hub.y) - 90); y < Math.min(y1, hub.y + 90); y++) for (let x = Math.max(x0, Math.floor(hub.x) - 90); x < Math.min(x1, hub.x + 90); x++) {
        if (!LAND(y * W + x)) continue; const d0 = Math.hypot(x - hub.x, y - hub.y); if (d0 >= bs || d0 < (reg.id === "west" ? 55 : 22)) continue;
        for (const [dx, dy] of DIRS) {
          let ok = true; for (let k = 1; k <= CW + 1 && ok; k++) for (let w = -1; w <= 1 && ok; w++) { const xx = x + dx * k + (dy ? w : 0), yy = y + dy * k + (dx ? w : 0); if (xx < 2 || yy < reg.y0 + 2 || xx >= reg.M.w - 2 || yy >= reg.y0 + reg.M.h - 2 || !WATER(yy * W + xx)) ok = false; }
          if (!ok) continue; const cx = x + dx * (CW + RAD), cy = y + dy * (CW + RAD);
          for (let yy = cy - RAD - 1; yy <= cy + RAD + 1 && ok; yy++) for (let xx = cx - RAD - 1; xx <= cx + RAD + 1; xx++) { if (xx < 2 || yy < reg.y0 + 2 || xx >= reg.M.w - 2 || yy >= reg.y0 + reg.M.h - 2 || !WATER(yy * W + xx)) { ok = false; break; } }
          if (ok) { bs = d0; best = { sx: x, sy: y, dx, dy, cx, cy }; break; }
        }
      }
      if (!best) { console.warn("islets: no sea room for", reg.id); continue; }
      const { sx, sy, dx, dy, cx, cy } = best;
      for (let k = 1; k <= CW + 2; k++) for (let w = -1; w <= 1; w++) { const xx = sx + dx * k + (dy ? w : 0), yy = sy + dy * k + (dx ? w : 0); set(reg, xx, yy, 22); } // the causeway
      for (let yy = cy - RAD - 1; yy <= cy + RAD + 1; yy++) for (let xx = cx - RAD - 1; xx <= cx + RAD + 1; xx++) { const d = Math.hypot(xx - cx, yy - cy); if (d <= RAD - 1.6) set(reg, xx, yy, d < RAD - 3 ? 3 : 22); else if (d <= RAD) set(reg, xx, yy, 2); else if (d <= RAD + 1.4 && terr[yy * W + xx] === 0) set(reg, xx, yy, 1); } // grass and paving inside, a ring of sand, shallows round it
      ISLETS.push({ reg: reg.id, x: cx, y: cy, k: 1, from: { x: sx + 0.5, y: sy + 0.5 }, dx, dy });
    } catch (e) { console.warn("islets", reg.id, e); }
  }
  try { // Port Louis: a wider waterfront, built out over the shallows next to the Caudan paving
    const reg = regionDef("portlouis"), hub = hubOf(reg), keep = ISLETS.find((q) => q.reg === "portlouis"); let n = 0;
    const far = (x, y) => !keep || Math.hypot(x - keep.x, y - keep.y) > RAD + 3;
    for (let pass = 0; pass < 3; pass++) { const add = []; for (let y = Math.floor(hub.y) - 22; y <= hub.y + 22; y++) for (let x = Math.floor(hub.x) - 24; x <= hub.x + 24; x++) { if (x < 3 || x >= reg.M.w - 3 || y < reg.y0 + 3 || y >= reg.y0 + reg.M.h - 3) continue; const i = y * W + x; if (terr[i] !== 1 || solid[i] || !far(x, y)) continue; let land = false; for (const [ax, ay] of DIRS) { const j = (y + ay) * W + x + ax; if ((terr[j] === 22 || terr[j] === 2 || terr[j] === 5) && !solid[j]) land = true; } if (land) add.push([x, y]); } for (const [x, y] of add) { set(reg, x, y, 22); n++; } }
    console.log("port louis waterfront: +" + n + " tiles");
  } catch (e) { console.warn("pl waterfront", e); }
};
