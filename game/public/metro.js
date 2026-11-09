"use strict";
// THE METRO EXPRESS: real-looking tracks and trains, a timetable, and rides you can sit through.
//  · TRACKS: a gravel bed, sleepers, two steel rails and overhead wires along the real railway line of Port Louis, rising on concrete pillars at the stations.
//  · TRAINS: red-and-black articulated light-rail trains (three cars) with a glowing destination sign, running to a timetable worked out from the shared clock:
//    one every 60 seconds, doors open at the platform, people waiting on it.
//  · RIDE: tap in (Rs 35), sit in the carriage, look out of the window while the island slides by, and get off at the next station. A Skip button lets you arrive at once.
// Replaces the old white trams. Loaded after the game page.
(function () {
  const MET = window.MET = { ready: 0, train: [], ride: null, k: 0, yawOff: 0, pitch: 0.05 };
  const FARE = 35, hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const smooth = (u) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u)))) / 2;
  let P = null, STN = [], RUN = null; // the line, its stations and the timetable
  function mkPath(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); return { pts, cum, L: cum[cum.length - 1] }; }
  function at(d) { d = Math.max(0, Math.min(P.L, d)); const c = P.cum; let i = 1; while (i < c.length - 1 && d > c[i]) i++; const a = P.pts[i - 1], b = P.pts[i], sl = c[i] - c[i - 1] || 1, f = Math.max(0, Math.min(1, (d - c[i - 1]) / sl)); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, hx: (b.x - a.x) / sl, hy: (b.y - a.y) / sl }; }
  const elev = (d) => { let h = 0; for (const s2 of STN) { const k = 1 - (Math.abs(d - s2.d) - 5.5) / 7; h = Math.max(h, 1.45 * smooth(k)); } return h; }; // the line climbs onto a viaduct at each station
  function init() {
    if (MET.ready) return true; const r = regionDef("portlouis"); if (!r || !r.M.railLine || r.M.railLine.length < 4 || typeof R === "undefined" || !R.world) return false;
    const ext = (r.M.railExt || []).slice().reverse(), pts = ext.concat(r.M.railLine).map(([x, y]) => ({ x, y: r.y0 + y })).filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) > 0.05); // the real line, smoothed a little
    const sm = []; for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)]; sm.push(i === 0 || i === pts.length - 1 ? b : { x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 }); } P = mkPath(sm);
    STN = (r.M.railStations || []).map((q) => { const sx = q.x, sy = r.y0 + q.y; let best = 0, bd = 1e9; for (let d = 0; d <= P.L; d += 0.25) { const p = at(d), dd = Math.hypot(p.x - sx, p.y - sy); if (dd < bd) { bd = dd; best = d; } } return { name: q.name, d: best, x: at(best).x, y: at(best).y }; }).sort((a, b) => a.d - b.d);
    if (STN.length < 2) return false; buildTrack(); buildStations(); buildTimetable(); MET.line = P.pts; MET.ready = 1; return true; }
  // ---------------------------------------------------------------- the track
  function buildTrack() {
    const g = new THREE.Group(), V = THREE.Vector3, step = 0.5, N = Math.floor(P.L / step), q = new THREE.Quaternion(), one = new V(1, 1, 1), m4 = new THREE.Matrix4(), X = new V(1, 0, 0), up = new V(0, 1, 0);
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c }), seg = (k) => { const a = at(k * step), b = at((k + 1) * step); return { a: new V(a.x, 0.08 + elev(k * step), a.y), b: new V(b.x, 0.08 + elev((k + 1) * step), b.y) }; };
    const bed = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 1.5), mat(0x8a8f94), N), sleeper = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.07, 1.25), mat(0x6b5a4a), N), rl = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.07), mat(0xc9d0d6), N * 2); let nr = 0;
    for (let k = 0; k < N; k++) { const { a, b } = seg(k), mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a), len = dir.length(); dir.normalize(); q.setFromUnitVectors(X, dir); const flat = new V(dir.x, 0, dir.z).normalize(), side = new V(-flat.z, 0, flat.x);
      m4.compose(mid, q, new V(len * 1.02, 1, 1)); bed.setMatrixAt(k, m4); const sl = new THREE.Quaternion().setFromUnitVectors(new V(0, 0, 1), flat); m4.compose(mid.clone().add(new V(0, 0.09, 0)), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2)), one); sleeper.setMatrixAt(k, m4);
      for (const sgn of [-1, 1]) { m4.compose(mid.clone().add(side.clone().multiplyScalar(sgn * 0.3)).add(new V(0, 0.14, 0)), q, new V(len * 1.02, 1, 1)); rl.setMatrixAt(nr++, m4); } }
    bed.frustumCulled = sleeper.frustumCulled = rl.frustumCulled = false; g.add(bed, sleeper, rl);
    // the overhead wire: a pole every 5 tiles, a wire along the top
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 3.0, 6), mat(0x4a5258), Math.floor(P.L / 5) + 1), wire = []; let np = 0;
    for (let d = 2; d < P.L - 1; d += 5) { const a = at(d), side = new V(-a.hy, 0, a.hx), base = new V(a.x, elev(d), a.y).add(side.clone().multiplyScalar(0.95)); m4.compose(base.clone().add(new V(0, 1.55, 0)), new THREE.Quaternion(), one); poles.setMatrixAt(np++, m4); }
    poles.count = np; poles.frustumCulled = false; g.add(poles); for (let d = 0; d < P.L; d += 1.0) { const a = at(d), b = at(Math.min(P.L, d + 1.0)); wire.push(a.x, elev(d) + 2.75, a.y, b.x, elev(Math.min(P.L, d + 1.0)) + 2.75, b.y); } const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(wire), 3)); g.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x222a30 })));
    // viaduct pillars and a grey deck where the line is raised
    const pil = []; for (let d = 0; d < P.L; d += 3.2) { const h = elev(d); if (h > 0.25) pil.push([d, h]); } const pill = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 1, 0.55), mat(0xb8b6ae), Math.max(1, pil.length)); pil.forEach(([d, h], i) => { const a = at(d); m4.compose(new V(a.x, h / 2 - 0.02, a.y), new THREE.Quaternion(), new V(1, h, 1)); pill.setMatrixAt(i, m4); }); pill.frustumCulled = false; g.add(pill);
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.22, 2.0), mat(0xc9c8c2), N); for (let k = 0; k < N; k++) { const { a, b } = seg(k), mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a), len = dir.length(); dir.normalize(); const hh = (a.y + b.y) / 2; q.setFromUnitVectors(X, dir); m4.compose(new V(mid.x, hh - 0.12, mid.z), q, new V(len * 1.02, hh > 0.3 ? 1 : 0.001, 1)); deck.setMatrixAt(k, m4); } deck.frustumCulled = false; g.add(deck);
    // a tunnel mouth where the trains come out of the map
    const a0 = at(0), tg = new THREE.Group(); tg.position.set(a0.x, 0, a0.y); tg.rotation.y = -Math.atan2(a0.hy, a0.hx); box(0.5, 2.6, 3.4, "#9a9890", 0.2, 1.3, 0, tg); box(0.52, 2.0, 2.2, "#0a0c0e", 0.22, 1.0, 0, tg); const hill = new THREE.Mesh(new THREE.ConeGeometry(4.6, 3.4, 8), new THREE.MeshLambertMaterial({ color: 0x5f9a52 })); hill.position.set(-2.3, 1.5, 0); hill.scale.set(1.4, 1, 1); tg.add(hill); const sg = sprite(textTex("🚇 To Rose Hill and Curepipe · opening soon", "rgba(17,24,40,0.9)", "#ffd166", 30), 0.8); sg.position.set(1.0, 3.7, 0); tg.add(sg); R.world.add(tg);
    R.world.add(g); MET.g = g; MET.poleN = np;
  }
  function buildStations() {
    for (const st of STN) { const g = new THREE.Group(), a = at(st.d), ang = -Math.atan2(a.hy, a.hx), h = 1.45; g.position.set(a.x, h, a.y); g.rotation.y = ang;
      box(7.4, 0.28, 1.5, "#d4d2ca", 0, 0.0, -1.45, g); box(7.4, 0.05, 0.12, "#f2c230", 0, 0.16, -0.75, g); box(7.4, 0.05, 0.12, "#f2c230", 0, 0.16, 0.75 - 1.4, g); for (const x of [-3.4, 0, 3.4]) { box(0.1, 2.2, 0.1, "#3a4147", x, 1.1, -1.9, g); } box(7.6, 0.12, 1.9, "#2f3a44", 0, 2.25, -1.6, g); box(7.6, 0.05, 0.05, "#c8202c", 0, 2.12, -0.62, g); box(6.8, 0.9, 0.04, "#8fc3df", 0, 0.9, -2.2, g);
      const sp = sprite(textTex("🚇 " + st.name.replace(/^Port Louis /, "Port Louis · "), "rgba(200,32,44,0.94)", "#ffffff", 40), 0.9); sp.position.set(0, 3.1, -1.7); g.add(sp); R.world.add(g); st.mesh = g;
      // stairs and a turnstile down at street level
      const s2 = new THREE.Group(), dx = -a.hy, dz = a.hx; s2.position.set(a.x + dx * -2.4, 0, a.y + dz * -2.4); s2.rotation.y = ang; for (let i = 0; i < 5; i++) box(1.4, 0.3, 0.32, "#c9c8c2", 0, 0.15 + i * 0.3, i * 0.32, s2); box(1.4, 0.1, 0.5, "#c8202c", 0, 1.6, 1.9, s2); R.world.add(s2); } }
  // ---------------------------------------------------------------- the timetable (every train: arrive from the tunnel, Victoria, Place d'Armes, back, Victoria, out)
  function buildTimetable() {
    const V0 = STN[0].d, P0 = STN[STN.length - 1].d, sp = 2.1, run = (d0, d1) => 8 + Math.abs(d1 - d0) * 0.18, legs = [{ k: "away", dur: 18 }, { k: "run", d0: 0, d1: V0, dur: run(0, V0) }, { k: "dock", d: V0, st: 0, dur: 12 }, { k: "run", d0: V0, d1: P0, dur: run(V0, P0) }, { k: "dock", d: P0, st: STN.length - 1, dur: 14, flip: 1 }, { k: "run", d0: P0, d1: V0, dur: run(P0, V0) }, { k: "dock", d: V0, st: 0, dur: 10 }, { k: "run", d0: V0, d1: 0, dur: run(V0, 0) }];
    const c0 = legs.reduce((s2, l) => s2 + l.dur, 0), cyc = Math.max(120, Math.ceil(c0 / 60) * 60); legs[0].dur += cyc - c0; RUN = { legs, cyc };
    for (let i = 0; i < 2; i++) MET.train.push({ id: "mt" + i, off: i * (cyc / 2), cars: [], dest: "", d: 0, vis: false, dock: null });
  }
  function pose(tr, tt) { let t = ((tt + tr.off) % RUN.cyc + RUN.cyc) % RUN.cyc; for (const l of RUN.legs) { if (t < l.dur) { if (l.k === "away") return { vis: false, leg: l, t }; if (l.k === "dock") return { vis: true, d: l.d, dir: l === RUN.legs[2] ? 1 : l === RUN.legs[4] ? 1 : -1, leg: l, t, left: l.dur - t, st: l.st }; const u = smooth(t / l.dur); return { vis: true, d: l.d0 + (l.d1 - l.d0) * u, dir: l.d1 > l.d0 ? 1 : -1, leg: l, t, moving: true }; } t -= l.dur; } return { vis: false }; }
  MET.pose = pose;
  // ---------------------------------------------------------------- the trains
  const LED = {}; function ledTex(txt) { if (LED[txt]) return LED[txt]; const c = document.createElement("canvas"); c.width = 256; c.height = 48; const g = c.getContext("2d"); g.fillStyle = "#050505"; g.fillRect(0, 0, 256, 48); g.fillStyle = "#ffb000"; g.font = "700 26px monospace"; g.textAlign = "center"; g.fillText(txt, 128, 33); const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return (LED[txt] = t); }
  function carMesh(i, n) { // one car of the articulated train: red lower body, black roof band, dark windows, seats inside
    const g = new THREE.Group(), L = 2.4; box(L, 0.18, 1.05, "#2a2d33", 0, 0.34, 0, g); box(L, 0.5, 1.1, "#c8202c", 0, 0.68, 0, g); box(L, 0.46, 1.12, "#14161a", 0, 1.16, 0, g); box(L - 0.1, 0.1, 1.08, "#0b0c0e", 0, 1.45, 0, g); for (const z of [-0.57, 0.57]) box(L - 0.3, 0.36, 0.02, "#6aa6c9", 0, 1.16, z, g); for (const x of [-0.7, 0.7]) { box(0.04, 1.0, 0.04, "#15171b", x * 1.0, 0.95, 0.6, g); box(0.04, 1.0, 0.04, "#15171b", x * 1.0, 0.95, -0.6, g); }
    box(L - 0.2, 0.05, 0.9, "#7a7f86", 0, 0.45, 0, g); for (const x of [-0.7, 0.2, 0.9]) for (const z of [-0.33, 0.33]) box(0.4, 0.3, 0.3, "#2f5f9a", x, 0.62, z, g);
    if (i === 1) { box(0.9, 0.06, 0.5, "#2a2e35", 0, 1.55, 0, g); box(0.04, 0.3, 0.04, "#2a2e35", 0, 1.68, 0, g); box(0.7, 0.04, 0.04, "#2a2e35", 0, 1.84, 0, g); }
    if (i === 0 || i === n - 1) { const sgn = i === 0 ? 1 : -1; box(0.35, 0.9, 1.06, "#c8202c", sgn * (L / 2 + 0.12), 0.85, 0, g); box(0.12, 0.35, 0.9, "#14161a", sgn * (L / 2 + 0.3), 1.05, 0, g); const led = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17), new THREE.MeshBasicMaterial({ map: ledTex("PORT LOUIS") })); led.position.set(sgn * (L / 2 + 0.31), 1.37, 0); led.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(led); g.userData.led = led; for (const z of [-0.3, 0.3]) box(0.04, 0.12, 0.2, "#fff6c8", sgn * (L / 2 + 0.31), 0.6, z, g); }
    if (i < n - 1) box(0.5, 0.7, 0.9, "#1a1c20", L / 2 + 0.2, 0.75, 0, g); return g; }
  function ensureTrain(tr) { if (tr.cars.length) return; const n = 3; for (let i = 0; i < n; i++) { const c = carMesh(i, n); c.visible = false; R.world.add(c); tr.cars.push(c); } }
  MET.draw = function (now) {
    if (!MET.ready && !init()) return; if (typeof s === "undefined" || s.inside) { for (const tr of MET.train) for (const c of tr.cars) c.visible = false; return; }
    const tt = Date.now() / 1000, px = s.x, py = s.y; for (let i = TRAF.length - 1; i >= 0; i--) if (TRAF[i].tram) TRAF.splice(i, 1); // the old white trams are retired
    for (const tr of MET.train) { const p = pose(tr, tt); tr.vis = p.vis; tr.pose = p; tr.dock = p.vis && p.leg.k === "dock" ? p : null; const lead = p.vis ? at(p.d) : null; const near = p.vis && Math.hypot(lead.x - px, lead.y - py) < 90; if (!near) { for (const c of tr.cars) c.visible = false; continue; } ensureTrain(tr);
      const dir = p.dir, dest = dir > 0 ? "PORT LOUIS" : "CUREPIPE EXPRESS"; if (dest !== tr.dest) { tr.dest = dest; for (const c of tr.cars) if (c.userData.led) c.userData.led.material.map = ledTex(dest), c.userData.led.material.needsUpdate = true; }
      tr.cars.forEach((c, i) => { const dd = p.d - dir * i * 2.7, a = at(dd), b = at(dd + dir * 0.6), hx = (b.x - a.x) * dir, hy = (b.y - a.y) * dir, h = elev(dd); c.visible = true; c.position.set(a.x, h + 0.2, a.y); c.rotation.y = -Math.atan2(hy, hx) + (dir > 0 ? 0 : Math.PI); const ph = elev(dd + 0.8) - elev(dd - 0.8); c.rotation.z = Math.max(-0.2, Math.min(0.2, ph * 0.12)) * dir; }); }
    // people waiting on the platforms
    for (const st of STN) { if (Math.hypot(st.x - px, st.y - py) > 50) continue; const a = at(st.d), nx = -a.hy, nz = a.hx; for (let k = 0; k < 4; k++) { const off = (k - 1.5) * 1.3, x = a.x + nx * -2.1 + a.hx * off, y = a.y + nz * -2.1 + a.hy * off; personAt("metro" + STN.indexOf(st) + k, ambLook(40 + k + STN.indexOf(st) * 5, "portlouis"), x, y, 0, false, { name: "", lift: 1.6 }); } }
    if (MET.ride) rideTick();
  };
  // ---------------------------------------------------------------- boarding and riding
  const fmtT = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };
  function nextAt(si) { const tt = Date.now() / 1000; let best = 1e9, now = null; for (const tr of MET.train) { const base = ((tt + tr.off) % RUN.cyc + RUN.cyc) % RUN.cyc; let acc = 0; for (const l of RUN.legs) { if (l.k === "dock" && l.st === si && l === (si === 0 ? RUN.legs[2] : RUN.legs[4])) { if (base >= acc && base < acc + l.dur) now = { tr, left: acc + l.dur - base, leg: l }; const d = ((acc - base) % RUN.cyc + RUN.cyc) % RUN.cyc; best = Math.min(best, d); } acc += l.dur; } } return { now, wait: best }; }
  MET.acts = function () {
    if (!init()) return [A("Read the Metro map", "Free", 0, 0, {}, { msg: "A red-and-black Metro Express tram every minute." })]; const me = s.inside ? { x: s.ox, y: s.oy } : s, si = STN.reduce((b, st, i) => (Math.hypot(st.x - me.x, st.y - me.y) < Math.hypot(STN[b].x - me.x, STN[b].y - me.y) ? i : b), 0), other = STN.length - 1 - si === si ? 0 : (si === 0 ? STN.length - 1 : 0), nx = nextAt(si);
    const can = !!(nx.now && nx.now.left > 6), why = s.money < FARE ? "You need " + rs(FARE) : can ? "" : nx.now ? "The doors are closing. Wait for the next train." : "Next train in " + fmtT(nx.wait);
    return [{ label: "🚇 Board to " + STN[other].name, info: "Tap in with your MECard · Rs " + FARE + " · " + (nx.now ? "doors open, leaves in " + fmtT(nx.now.left) : "next train in " + fmtT(nx.wait)), why, go: () => { closeMenu(); MET.board(si, other); } },
      { label: "🗺️ Read the Metro map", info: "Free", go: () => { closeMenu(); evCard({ icon: "🚇", tag: "METRO EXPRESS", title: "The line", text: "Port Louis Victoria → Place d'Armes (open now)\\nRose Hill Central · Ébène Cybercity · Quatre Bornes · Phoenix and Trianon · Vacoas · Curepipe Central (opening soon, under the clouds)", opts: [{ label: "OK", pri: true, go: () => {} }] }); } }];
  };
  GBACTS.metro = MET.acts;
  MET.board = function (si, other) {
    if (MET.ride || busy || ride || s.inside || (window.HB && HB.ride) || (window.HUX && HUX.run)) { toast("Finish what you are doing first."); return; } if (s.money < FARE) { toast("You need " + rs(FARE) + "."); return; } const nx = nextAt(si); if (!nx.now) { toast("No train at the platform: next in " + fmtT(nx.wait) + "."); return; }
    const act = A("Ride the Metro Express", "", 3, FARE, { fun: 10, social: 4 }, { msg: "The Metro Express glides along the harbour. Doors, chime, and you are there." }); toast("🎫 Tap-in: MECard Rs " + FARE + ". Mind the doors."); path = [];
    busy = { a: act, left: 3, total: 3, rate: 0, pose: { k: "sit", x: s.x, y: s.y, h: 0.5, face: 1, lift: 0 }, from: [STN[other].x - 0.2, STN[other].y + 2.6] }; MET.ride = { tr: nx.now.tr, act, other, t0: performance.now(), skip: 0, boardedAt: Date.now() / 1000 }; MET.yawOff = 0; MET.pitch = 0.04; panel(); try { if (window.LVX) LVX.gain("place", "metro"); } catch (e) {}
  };
  const CAM = { el: null, drag: null };
  function panel() { panelOff(); const d = document.createElement("div"); d.id = "storyCap"; d.innerHTML = "<div><small>METRO EXPRESS</small><span id=\"mtTxt\">Doors closing…</span></div>"; const b = document.createElement("button"); b.textContent = "Skip ride"; b.onclick = () => { if (MET.ride) MET.ride.skip = 1; }; d.append(b); document.body.append(d); CAM.el = d; }
  function panelOff() { if (CAM.el) { CAM.el.remove(); CAM.el = null; } }
  { const down = (e) => { if (MET.ride) CAM.drag = { x: e.clientX, y: e.clientY }; }, move = (e) => { const d = CAM.drag; if (!d || !MET.ride) return; MET.yawOff -= (e.clientX - d.x) * 0.008; MET.pitch = Math.max(-0.3, Math.min(0.6, MET.pitch + (e.clientY - d.y) * 0.004)); d.x = e.clientX; d.y = e.clientY; path = []; }, up = () => { CAM.drag = null; }; const c = document.getElementById("world"); if (c) { c.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up); } }
  function seat(tr) { const p = tr.pose; if (!p || !p.vis) return null; const dd = p.d - p.dir * 2.7, a = at(dd), b = at(dd + p.dir * 0.6), hx = (b.x - a.x) * p.dir, hy = (b.y - a.y) * p.dir, hl = Math.hypot(hx, hy) || 1, nx = -hy / hl, nz = hx / hl; return { x: a.x + nx * 0.3 + hx / hl * 0.2, y: a.y + nz * 0.3 + hy / hl * 0.2, h: elev(dd) + 0.55, hx: hx / hl, hy: hy / hl }; }
  function rideTick() {
    const r = MET.ride, tr = r.tr; if (!busy || busy.a !== r.act) { end(false); return; } const sp = seat(tr); if (sp) { s.x = sp.x; s.y = sp.y; busy.pose = { k: "sit", x: sp.x, y: sp.y, h: sp.h, face: Math.abs(sp.hx) > Math.abs(sp.hy) ? (sp.hx > 0 ? 3 : 2) : sp.hy > 0 ? 0 : 1, lift: 0 }; }
    const p = tr.pose, arrived = p && p.vis && p.leg.k === "dock" && p.leg.st === r.other && p.t > 3, txt = document.getElementById("mtTxt"); if (txt) txt.textContent = arrived ? "Next stop: " + STN[r.other].name + ". Doors open." : p && p.leg.k === "dock" ? "Doors closing…" : "Heading for " + STN[r.other].name + ". Drag to look out of the window.";
    if (arrived || r.skip || performance.now() - r.t0 > 240000) end(true);
  }
  function end(ok) { const r = MET.ride; if (!r) return; const was = busy && busy.a === r.act; MET.ride = null; panelOff(); if (was) { if (ok) { finish(r.act); } else busy = null; } }
  MET.camOn = () => !!MET.ride || MET.k > 0.01;
  MET.camTick = function (now) {
    const dt = Math.min(0.2, (now - (MET.lastT || now)) / 1000); MET.lastT = now; const want = MET.ride ? 1 : 0; MET.k += (want - MET.k) * (1 - Math.exp(-dt * 4)); if (!want && MET.k < 0.01) { MET.k = 0; return; } const e = MET.k * MET.k * (3 - 2 * MET.k), V = THREE.Vector3, tr = MET.ride ? MET.ride.tr : null, sp = tr ? seat(tr) : null; if (sp) { MET.last = sp; } const q = MET.last || { x: s.x, y: s.y, h: 1, hx: 1, hy: 0 };
    const eye = new V(q.x - q.hx * 0.1, q.h + 0.78, q.y - q.hy * 0.1), base = Math.atan2(q.hx, q.hy), yaw = base - Math.PI / 2 + MET.yawOff + Math.sin(now / 2600) * 0.03, look = new V(eye.x + Math.sin(yaw) * 5, eye.y - 0.05 + Math.sin(MET.pitch) * 5, eye.z + Math.cos(yaw) * 5);
    R.camera.position.lerpVectors(R.camera.position.clone(), eye, Math.min(1, e * 1.0)); const la = R.tgt.clone().lerp(look, e); R.camera.lookAt(la); const fov = 40 + 25 * e; if (Math.abs(R.camera.fov - fov) > 0.05) { R.camera.fov = fov; R.camera.updateProjectionMatrix(); }
  };
  setInterval(() => { try { if (s.inside) { if (MET.g) MET.g.visible = true; } } catch (e) {} }, 1000);
})();
