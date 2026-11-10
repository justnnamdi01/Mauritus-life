"use strict";
// THE LIVING ISLAND: sugar cane fields you can see (and the birds that fly over them).
//  · Cane: tall swaying stalks on every cane tile of every map, drawn only near you. The highway regions and the inland edge of Flic en Flac get real cane fields.
//  · Birds: gulls and tropicbirds along the coast, flocks of green parakeets, red fodies and bulbuls round the trees, a kestrel hovering over the cane,
//    pigeons over the town. They fly by day, rest at night and stay out of rain. Loaded after the game page.
(function () {
  const LIFE = window.LIFE = { on: true, cane: null, birds: [], built: 0, t0: 0 };
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const RX = (() => { try { const p = regionDef("portlouis"); return (p.M.railExt || []).map(([x, y]) => [x, p.y0 + y]); } catch (e) { return []; } })(); const nearRail = (x, y) => { for (let k = 1; k < RX.length; k++) { const a = RX[k - 1], b = RX[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, tt = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)); if (Math.hypot(x - (a[0] + dx * tt), y - (a[1] + dy * tt)) < 4.5) return true; } return false; }; // keep the cane fields clear of the railway
  // ---- 1. make real cane fields on the grass of the highway regions and the inland side of Flic en Flac (before the ground is painted)
  try {
    if (typeof WREG !== "undefined" && typeof terr !== "undefined") for (const r of WREG) { const inland = r.id === "west" || r.id === "bambous", road = r.kind === "road"; if (!inland && !road) continue;
      for (let y = 2; y < r.M.h - 2; y++) for (let x = 2; x < r.M.w - 2; x++) { const gy = r.y0 + y, i = gy * W + x; if (terr[i] !== 3 || solid[i]) continue; if (r.id === "west" && x < 80) continue; if (nearRail(x, gy)) continue; const cx = Math.floor((x + hash(Math.floor(y / 16), 1) * 5) / 9), cy = Math.floor(y / 16); if (hash(cx, cy, 7) > (inland ? 0.5 : 0.34)) continue;
        let ok = true; for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (gy + dy) * W + (x + dx); if (terr[j] !== 3 && terr[j] !== 11) { ok = false; break; } } if (ok) { terr[i] = 11; try { r.T[y * r.M.w + x] = 11; } catch (e) {} } }
    }
  } catch (e) { console.warn("cane fields", e); }
  // ---- 2. cane stalks around the player
  const CAP = 24000, RAD = 34;
  function buildCane() {
    if (typeof R === "undefined" || !R.scene || typeof THREE === "undefined") return false;
    const geo = new THREE.CylinderGeometry(0.05, 0.085, 1, 4, 1, true); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff }); LIFE.caneU = { time: { value: 0 } };
    mat.onBeforeCompile = (sh) => { sh.uniforms.uTime = LIFE.caneU.time; sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = vec3(position); float sw = position.y * 0.16; transformed.x += sin(uTime * 1.6 + instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.5) * sw; transformed.z += cos(uTime * 1.3 + instanceMatrix[3].z * 0.7) * sw * 0.7;"); };
    const im = new THREE.InstancedMesh(geo, mat, CAP); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3); im.frustumCulled = false; im.count = 0; R.scene.add(im); LIFE.cane = im; LIFE.caneAt = { x: -999, y: -999 }; return true; }
  function fillCane() {
    const im = LIFE.cane, px = Math.floor(s.x), py = Math.floor(s.y), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(); let n = 0;
    outer: for (let y = Math.max(HO, py - RAD); y < Math.min(H, py + RAD); y++) for (let x = Math.max(0, px - RAD); x < Math.min(W, px + RAD); x++) { if (terr[y * W + x] !== 11) continue; if ((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) > RAD * RAD) continue;
      for (let k = 0; k < 6; k++) { if (n >= CAP) break outer; const h1 = hash(x * 4 + k, y, 3), h2 = hash(x, y * 4 + k, 5), hh = 1.1 + h1 * 0.9; e.set((h2 - 0.5) * 0.14, h1 * 6.28, (h1 - 0.5) * 0.14); q.setFromEuler(e); v.set(x + 0.12 + (k % 3) * 0.3 + (h2 - 0.5) * 0.18, 0, y + 0.18 + (k < 3 ? 0 : 0.5) + (h1 - 0.5) * 0.18); sc.set(1, hh, 1); m4.compose(v, q, sc); im.setMatrixAt(n, m4); col.setHSL(0.22 + h1 * 0.04, 0.55, 0.36 + h2 * 0.1); im.setColorAt(n, col); n++; } }
    im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; LIFE.caneAt = { x: s.x, y: s.y }; }
  // ---- 3. birds
  const SP = { // species: body colour, wing colour, size, speed, flaps per second, where it likes to be
    gull: { body: 0xf4f6f8, wing: 0xb9c3cc, tail: 0xf4f6f8, beak: 0xffc83d, size: 0.55, sp: 3.2, fl: 3.2, alt: [4.5, 8.5], pref: "sea", n: 5 },
    tropic: { body: 0xffffff, wing: 0xf1f1f1, tail: 0xffffff, beak: 0xe4452e, size: 0.5, sp: 3.6, fl: 4.5, alt: [6, 10], pref: "sea", n: 2, streamer: 1 },
    parakeet: { body: 0x3fb34f, wing: 0x2c8f3d, tail: 0x7ad14a, beak: 0xe4372e, size: 0.34, sp: 5.4, fl: 11, alt: [3, 6], pref: "land", n: 6, flock: 1 },
    fody: { body: 0xe03a2c, wing: 0x7a2a22, tail: 0xb82a20, beak: 0x2a2a2a, size: 0.22, sp: 3.6, fl: 14, alt: [1.6, 3.4], pref: "land", n: 4 },
    bulbul: { body: 0x7a5a3c, wing: 0x4a3a2c, tail: 0x3a2a20, beak: 0x1a1a1a, size: 0.24, sp: 3.4, fl: 13, alt: [1.6, 3.2], pref: "land", n: 3, crest: 0xc4282a },
    kingfisher: { body: 0x2fa6e8, wing: 0x1f6fc0, tail: 0xf0a030, beak: 0x1a1a1a, size: 0.24, sp: 4.2, fl: 15, alt: [1.2, 2.6], pref: "sea", n: 2 },
    pigeon: { body: 0x9aa4ae, wing: 0x7a8590, tail: 0x6a7580, beak: 0x2a2a2a, size: 0.32, sp: 3.8, fl: 8, alt: [3, 5.5], pref: "town", n: 5, flock: 1 },
    kestrel: { body: 0xb5683a, wing: 0x8a4a28, tail: 0xc98a52, beak: 0x2a2a2a, size: 0.5, sp: 2.2, fl: 5, alt: [6.5, 8], pref: "cane", n: 1, hover: 1 }
  };
  for (const k in SP) { SP[k].size *= 1.3; SP[k].alt = SP[k].alt.map((a) => Math.max(1.8, a * 0.75)); } // small, but still seen from the town camera
  function merged(parts) { // glue little shapes into one geometry with colours (one draw call per bird body)
    const pos = [], col = [], c = new THREE.Color(); for (const [g, color, mtx] of parts) { const gg = g.index ? g.toNonIndexed() : g.clone(); gg.applyMatrix4(mtx); const p = gg.attributes.position; c.setHex(color); for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(c.r, c.g, c.b); } }
    const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3)); out.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3)); out.computeVertexNormals(); return out; }
  const M4 = (x, y, z, sx, sy, sz, rz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz || 0)), new THREE.Vector3(sx, sy, sz));
  const bodyCache = {}, wingCache = {};
  function bodyGeo(k) { if (bodyCache[k]) return bodyCache[k]; const S = SP[k], sph = new THREE.SphereGeometry(0.5, 7, 5), cone = new THREE.ConeGeometry(0.5, 1, 4); const parts = [[sph, S.body, M4(0, 0, 0, 1, 0.55, 0.55)], [sph, S.body, M4(0.46, 0.1, 0, 0.42, 0.42, 0.42)], [cone, S.beak, M4(0.74, 0.08, 0, 0.14, 0.34, 0.14, -Math.PI / 2)], [cone, S.tail, M4(-0.62, 0, 0, S.streamer ? 0.12 : 0.34, S.streamer ? 1.6 : 0.6, 0.34, Math.PI / 2)]]; if (S.crest) parts.push([cone, S.crest, M4(0.46, 0.34, 0, 0.16, 0.3, 0.16, 0)]); return (bodyCache[k] = merged(parts)); }
  function wingGeo(k) { if (wingCache[k]) return wingCache[k]; const sh = new THREE.Shape(); sh.moveTo(0.35, 0); sh.lineTo(-0.05, 1.05); sh.lineTo(-0.45, 0.95); sh.lineTo(-0.3, 0); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); return (wingCache[k] = g); }
  function spawnBird(k, flock, home) {
    const S = SP[k], g = new THREE.Group(), body = new THREE.Mesh(bodyGeo(k), new THREE.MeshLambertMaterial({ vertexColors: true })), wm = new THREE.MeshLambertMaterial({ color: S.wing, side: THREE.DoubleSide }), wl = new THREE.Mesh(wingGeo(k), wm), wr = new THREE.Mesh(wingGeo(k), wm); wr.scale.z = -1; const pl = new THREE.Group(), pr = new THREE.Group(); pl.add(wl); pr.add(wr); pl.position.z = 0.05; pr.position.z = -0.05; g.add(body, pl, pr); g.scale.setScalar(S.size); g.userData = { pl, pr }; g.visible = false; R.scene.add(g);
    const b = { k, S, g, x: home.x + (Math.random() - 0.5) * 10, z: home.z + (Math.random() - 0.5) * 10, home, y: S.alt[0] + Math.random() * (S.alt[1] - S.alt[0]), ang: Math.random() * 6.28, tx: 0, tz: 0, tY: 0, ph: Math.random() * 6.28, lag: 0, flock, perch: 0, wait: 0 }; pick(b, true); LIFE.birds.push(b); return b; }
  const water = (x, z) => { const i = Math.floor(z) * W + Math.floor(x); return x >= 0 && z >= HO && x < W && z < H && terr[i] <= 1; };
  function pick(b, first) { // choose where to fly next: somewhere inside the bird's own patch of the island (it never follows the player)
    const S = b.S, want = S.pref, H0 = b.home, R0 = H0.r; for (let tries = 0; tries < 14; tries++) { const a = Math.random() * 6.28, r = 3 + Math.random() * R0, x = H0.x + Math.cos(a) * r, z = H0.z + Math.sin(a) * r; if (x < 1 || z < HO || x > W - 1 || z > H - 1) continue; if (okTerr(want, x, z) || tries > 11) { b.tx = x; b.tz = z; b.tY = S.alt[0] + Math.random() * (S.alt[1] - S.alt[0]); return; } }
    b.tx = H0.x + (Math.random() - 0.5) * 12; b.tz = H0.z + (Math.random() - 0.5) * 12; }
  function okTerr(want, x, z) { const t = terr[Math.floor(z) * W + Math.floor(x)]; return (want === "sea" && (t <= 1 || t === 2)) || (want === "land" && (t === 3 || t === 9 || t === 11)) || (want === "town" && (t === 4 || t === 22 || t === 3)) || (want === "cane" && t === 11); }
  function findHome(k, reg) { const S = SP[k]; for (let i = 0; i < 80; i++) { const x = 3 + Math.random() * (reg.M.w - 6), z = reg.y0 + 2 + Math.random() * (reg.M.h - 4); if (okTerr(S.pref, x, z)) return { x, z, r: S.pref === "sea" ? 20 : S.pref === "cane" ? 24 : 14 }; } return null; }
  function buildBirds() { // every bird lives in its own spot in a real town and stays around it
    if (typeof R === "undefined" || !R.scene || typeof THREE === "undefined") return false; const regs = WREG.filter((r) => ["grandbaie", "portlouis", "west", "bambous"].includes(r.id));
    for (const k in SP) { const S = SP[k]; for (const reg of regs) { const cnt = Math.max(1, Math.round(S.n * 0.7)); let home = null, leader = null; for (let i = 0; i < cnt; i++) { if (!S.flock || !home || i % 6 === 0) { home = findHome(k, reg); leader = null; } if (!home) break; const b = spawnBird(k, S.flock ? 1 : 0, home); if (S.flock) { if (!leader) leader = b; else { b.leader = leader; b.off = [(Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 1.2]; b.x = leader.x; b.z = leader.z; } } } } } return true; }
  function stepBirds(dt, now, day) {
    const t = now / 1000, near = 62; for (const b of LIFE.birds) { const S = b.S, g = b.g;
      if (b.leader) { b.tx = b.leader.x - Math.cos(b.leader.ang) * b.off[0] - Math.sin(b.leader.ang) * b.off[2] * 2 + b.off[0]; b.tz = b.leader.z - Math.sin(b.leader.ang) * b.off[0] + Math.cos(b.leader.ang) * b.off[1]; b.tY = b.leader.y + b.off[2]; }
      let dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz); if (!b.leader && d < 2.5) { if (S.hover && Math.random() < 0.7) { b.wait = 4 + Math.random() * 5; } pick(b); dx = b.tx - b.x; dz = b.tz - b.z; d = Math.hypot(dx, dz); }
      const want = Math.atan2(dz, dx); let da = want - b.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); b.ang += da * Math.min(1, dt * (S.hover ? 0.8 : 1.7)); const hov = b.wait > 0; if (hov) b.wait -= dt; const sp = hov ? 0.15 : S.sp * (b.leader ? Math.min(1.5, 0.8 + d * 0.25) : 1); b.x += Math.cos(b.ang) * sp * dt; b.z += Math.sin(b.ang) * sp * dt; b.y += (b.tY + Math.sin(t * 0.7 + b.ph) * 0.5 - b.y) * Math.min(1, dt * 0.8);
      const vis = LIFE.show && Math.hypot(b.x - s.x, b.z - s.y) < near; g.visible = vis; if (!vis) continue; g.position.set(b.x, b.y, b.z); g.rotation.set(0, -b.ang, Math.sin(t * 0.9 + b.ph) * 0.12 + da * 0.3);
      const glide = S.sp < 4 && S.fl < 6 && Math.sin(t * 0.5 + b.ph) > 0.2, f = Math.sin((t * S.fl + b.ph) * 6.283) * (glide ? 0.12 : 0.85); g.userData.pl.rotation.x = f; g.userData.pr.rotation.x = -f; }
  }
  LIFE.draw = function (now) {
    if (!LIFE.t0) LIFE.t0 = now; const dt = Math.min(0.1, (now - (LIFE.last || now)) / 1000); LIFE.last = now;
    if (!LIFE.built) { if (!LIFE.tried || now - LIFE.tried > 4000) { LIFE.tried = now; try { if (buildCane() && buildBirds()) LIFE.built = 1; } catch (e) { LIFE.built = -1; console.warn("life", e); } } return; } if (LIFE.built < 0) return;
    const out = !s.inside && typeof ride !== "undefined" ? true : !s.inside, day = typeof R.dayKnow === "number" ? R.dayKnow : 1; let wet = 0; try { wet = weather().wet || 0; } catch (e) {}
    LIFE.show = LIFE.on && !s.inside && day > 0.25 && wet < 0.4 && s.y >= HO;
    LIFE.cane.visible = LIFE.on && !s.inside; LIFE.caneU.time.value = now / 1000; if (LIFE.cane.visible && (Math.hypot(s.x - LIFE.caneAt.x, s.y - LIFE.caneAt.y) > 6 || !LIFE.caneN)) { LIFE.caneN = 1; fillCane(); }
    stepBirds(dt, now, day);
  };
  setInterval(() => { try { if (s.inside) { if (LIFE.cane) LIFE.cane.visible = false; for (const b of LIFE.birds) b.g.visible = false; } } catch (e) {} }, 250);
})();
