"use strict";
// THE CITY AT NIGHT: street lamps with pools of light along every road, lit windows on every building (they come on at dusk, thin out late
// at night and go dark before dawn), glowing shop doors, and far-off lights in the hills. Built once from the buildings and roads that are
// already in the world; nothing here changes where anything stands. Loaded after the game page.
(function () {
  const NCX = window.NCX = { g: null, built: 0, bucket: -1, on: true, wins: [], lampN: 0, winN: 0 };
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const soft = () => (typeof R !== "undefined" && R.vfx && R.vfx.soft) || null;
  function build() {
    if (typeof R === "undefined" || !R.world || typeof THREE === "undefined" || typeof WREG === "undefined" || !R.vfx) return false;
    const groups = R.world.children.filter((c) => c.userData && c.userData.box); if (groups.length < 5) return false;
    const g = new THREE.Group(), tex = soft(), q0 = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), m4 = new THREE.Matrix4(), E = new THREE.Euler();
    // ---- lit windows: a grid on the walls of every building, each with its own bedtime
    const faces = [], doors = [];
    const addFace = (x, z, nx, nz, len, top, seedA, seedB) => { const cols = Math.max(1, Math.floor(len / 1.15)), rows = Math.max(1, Math.floor((top - 0.9) / 1.05)); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const k = hash(seedA * 7 + c, seedB * 13 + r, nx * 3 + nz); if (k < 0.18) continue; const t = (c + 0.5) / cols; const tx = nz !== 0 ? x + (t - 0.5) * len : x, tz = nx !== 0 ? z + (t - 0.5) * len : z; faces.push({ x: tx + nx * 0.035, y: 0.95 + r * 1.05 + 0.2, z: tz + nz * 0.035, ry: nx > 0 ? Math.PI / 2 : nx < 0 ? -Math.PI / 2 : nz < 0 ? Math.PI : 0, on: hash(seedA + c * 3, seedB + r * 5, 9), kind: hash(seedA, seedB * 3 + c + r, 2) }); } };
    const bb = new THREE.Box3(), tmp = new THREE.Box3();
    for (const gr of groups) { const b = gr.userData.box; bb.makeEmpty(); gr.traverse((m) => { if (m.isMesh && !m.isSprite && m.visible) { tmp.setFromObject(m); if (isFinite(tmp.max.y) && tmp.max.y - tmp.min.y < 30) bb.union(tmp); } }); let top = bb.isEmpty() ? 3 : Math.min(14, bb.max.y - 0.3); if (top < 2.2) continue;
      addFace(b.x + b.w / 2, b.y + b.h, 0, 1, b.w - 0.6, top, b.x, b.y); addFace(b.x + b.w, b.y + b.h / 2, 1, 0, b.h - 0.6, top, b.x + 1, b.y); addFace(b.x, b.y + b.h / 2, -1, 0, b.h - 0.6, top, b.x + 2, b.y); addFace(b.x + b.w / 2, b.y, 0, -1, b.w - 0.6, top, b.x + 3, b.y);
      doors.push([b.x + b.w / 2, b.y + b.h + 0.6]); }
    if (typeof DECOH !== "undefined") for (const d of DECOH) { addFace(d.x + d.w / 2, d.y + d.h, 0, 1, d.w - 0.6, 2.5, d.x, d.y); addFace(d.x + d.w, d.y + d.h / 2, 1, 0, d.h - 0.6, 2.5, d.x + 1, d.y); }
    const cap = Math.min(faces.length, 16000); faces.length = cap; faces.sort((a, b) => a.on - b.on); NCX.wins = faces;
    const wm = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.95 }), win = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.8), wm, Math.max(1, cap)); win.frustumCulled = false; win.renderOrder = 5; const cols = [0xffd27a, 0xffc766, 0xfff0c8, 0x9fd0ff].map((c) => new THREE.Color(c));
    faces.forEach((f, i) => { win.setColorAt(i, cols[f.kind < 0.55 ? 0 : f.kind < 0.8 ? 1 : f.kind < 0.93 ? 2 : 3]); }); if (win.instanceColor) win.instanceColor.needsUpdate = true; g.add(win); NCX.win = win; NCX.winN = cap;
    // ---- street lamps along the roads of every region, a pool of light under each and a halo at the bulb
    const lamps = []; for (const rg of WREG) { const M = rg.M; for (let y = 1; y < M.h - 1; y += 1) for (let x = 1; x < M.w - 1; x += 1) { if (rg.kind === "road") continue; const t = gbTile(x, rg.y0 + y); if (t !== 4) continue; const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => { const n = gbTile(x + dx, rg.y0 + y + dy); return n === 3 || n === 9 || n === 22 || n === 2; }); if (!side) continue; if ((x * 5 + y * 3) % 5 !== 0 && hash(x, y, 4) > 0.08) continue; if (lamps.some((l) => Math.abs(l[0] - x) < 4 && Math.abs(l[1] - (rg.y0 + y)) < 4)) continue; lamps.push([x + 0.5 + side[0] * 0.55, rg.y0 + y + 0.5 + side[1] * 0.55]); if (lamps.length > 1800) break; } }
    const poleG = new THREE.CylinderGeometry(0.04, 0.055, 2.5, 6), pole = new THREE.InstancedMesh(poleG, new THREE.MeshLambertMaterial({ color: 0x3a4147 }), Math.max(1, lamps.length)), bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }), Math.max(1, lamps.length));
    lamps.forEach(([x, z], i) => { m4.compose(p3.set(x, 1.25, z), q0, sc.set(1, 1, 1)); pole.setMatrixAt(i, m4); m4.compose(p3.set(x, 2.55, z), q0, sc.set(1, 0.7, 1)); bulbs.setMatrixAt(i, m4); }); pole.frustumCulled = bulbs.frustumCulled = false; g.add(pole, bulbs);
    const pts = (arr, size, col, y, order) => { const n = arr.length; const geo = new THREE.BufferGeometry(), pa = new Float32Array(Math.max(3, n * 3)); arr.forEach(([x, z], i) => { pa[i * 3] = x; pa[i * 3 + 1] = y; pa[i * 3 + 2] = z; }); geo.setAttribute("position", new THREE.BufferAttribute(pa, 3)); const m = new THREE.PointsMaterial({ size, map: tex, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }), p = new THREE.Points(geo, m); p.frustumCulled = false; p.renderOrder = order; g.add(p); return p; };
    NCX.pool = pts(lamps, 7.5, 0xffb347, 0.45, 4); NCX.halo = pts(lamps, 2.4, 0xffe3a0, 2.55, 6); NCX.door = pts(doors, 5, 0xffa940, 0.5, 4);
    const NEON = [[/casino|games|arcade/i, 0xff3fd0], [/bar|club|resto|sapphire|pub/i, 0x3fa9ff], [/market|bazar|bazaar/i, 0x7bd88f], [/bank|office|hotel|h[oô]tel/i, 0x9fe6ff], [/oceanarium|museum|theatre|theater/i, 0xa78bfa]];
    const byCol = new Map(); for (const b of BUILD) { const hit = NEON.find(([re]) => re.test(String(b.name || "") + " " + String(b.id || ""))); if (!hit) continue; if (!byCol.has(hit[1])) byCol.set(hit[1], []); byCol.get(hit[1]).push([b.x + b.w / 2, b.y + b.h + 1.1], [b.x + b.w / 2, b.y + b.h * 0.5]); } NCX.neon = []; for (const [c, arr] of byCol) NCX.neon.push(pts(arr, 8, c, 0.8, 5)); NCX.lampN = lamps.length;
    R.scene.add(g); NCX.g = g; NCX.built = 1; return true;
  }
  function onFrac(h) { // how many windows are lit at this hour (0 to 1): they come on at dusk, thin out late, and are mostly dark before dawn
    if (h >= 17.5 && h < 20.5) return (h - 17.5) / 3 * 0.85; if (h >= 20.5 || h < 1) return 0.85 - Math.max(0, (h >= 20.5 ? h - 20.5 : h + 3.5)) * 0.07; if (h < 5) return Math.max(0.08, 0.6 - (h - 1) * 0.12); if (h < 6.5) return Math.max(0, 0.12 - (h - 5) * 0.08); return 0; }
  function lightLevel() { // the city lights follow the player's graphics setting (not the Season 2 switch of the old effects): 0 plain, 1 glow, 2 full
    try { const m = typeof gfxMode === "function" ? gfxMode() : "auto"; let lv = m === "low" ? 0 : m === "med" ? 1 : m === "high" ? 2 : (Math.min(innerWidth, innerHeight) < 700 ? 1 : 2); if (m === "auto" && R.slow) lv = Math.min(lv, R.slow > 1 ? 0 : 1); return lv; } catch (e) { return 1; } }
  NCX.draw = function (now) {
    if (!NCX.built) { if (!NCX.tried || now - NCX.tried > 4000) { NCX.tried = now; try { build(); } catch (e) { NCX.built = -1; console.warn("nightcity", e); } } if (!NCX.g) return; }
    if (NCX.built < 0) return; const k = typeof R.dayKnow === "number" ? R.dayKnow : 1, night = Math.max(0, Math.min(1, (0.7 - k) / 0.6)); NCX.g.visible = NCX.on && !s.inside && night > 0.01; if (!NCX.g.visible) return;
    const lv = lightLevel(), flick = 0.94 + 0.06 * Math.sin(now / 300);
    NCX.pool.material.opacity = night * (lv > 0 ? 0.75 : 0); if (R.hemi) R.hemi.intensity *= 1 - 0.3 * night; if (R.sun) R.sun.intensity *= 1 - 0.25 * night; NCX.halo.material.opacity = night * (lv > 0 ? 0.85 * flick : 0.4); NCX.door.material.opacity = night * (lv > 0 ? 0.7 : 0); for (const p of NCX.neon) p.material.opacity = night * (lv > 0 ? 0.55 + 0.1 * Math.sin(now / 700) : 0); NCX.win.material.opacity = Math.min(0.95, night * 1.4);
    const f = onFrac(hour()), bucket = Math.round(f * 40); if (bucket !== NCX.bucket) { NCX.bucket = bucket; const q0 = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), z0 = new THREE.Vector3(0, 0, 0), p3 = new THREE.Vector3(), m4 = new THREE.Matrix4(), E = new THREE.Euler(); NCX.wins.forEach((w, i) => { if (w.on < f) { q0.setFromEuler(E.set(0, w.ry, 0)); m4.compose(p3.set(w.x, w.y, w.z), q0, sc); } else m4.compose(p3.set(0, -50, 0), q0, z0); NCX.win.setMatrixAt(i, m4); }); NCX.win.instanceMatrix.needsUpdate = true; }
  };
})();
