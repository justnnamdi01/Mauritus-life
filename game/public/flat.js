"use strict";
// YOUR FLAT GROWS: the client side of the timed upgrades (the server in game/upgrades.js owns every price and every clock).
//  · The upgrade board in your home: see the next level, pay and start it. Builders then arrive and work in the room while the clock runs.
//  · Ten levels that visibly change the room (panelling, lamps, window flowers, a gallery, cove lighting, a garden, a chandelier, a mirror, smart lights, the penthouse).
//  · A progress sign above your door, a "Ready!" moment with a camera sweep, finished shifts that speed the builders up, friends who help from a visit.
// Loaded after the game page and the workplaces.
(function () {
  const capA = (k) => window.claude && window.claude[k];
  const FLX = window.FLX = { st: null, off: 0, loaded: 0, cam: null, acts: [], sp: null, spKey: "" };
  const fmt = (sec) => { sec = Math.max(0, Math.round(sec)); const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return d ? d + "d " + h + "h" : h ? h + "h " + (m ? m + "m" : "") : m ? m + "m" + (m < 5 && x ? " " + x + "s" : "") : x + "s"; };
  const nowS = () => Date.now() + FLX.off;
  const left = () => (FLX.st && FLX.st.run ? Math.max(0, (FLX.st.run.t1 - nowS()) / 1000) : 0);
  const level = () => (FLX.st ? FLX.st.level : 0);
  FLX.left = left; FLX.level = level; FLX.fmt = fmt;

  // ---------------------------------------------------------------- state
  async function load() { const a = capA("flat"); if (!a) return null; let r = null; try { r = await a.state(); } catch (e) {} if (!r || !r.ok) return null; const was = FLX.st; FLX.st = r; FLX.off = r.now - Date.now(); FLX.loaded = Date.now(); if (was && was.level !== r.level) dropRoom(); if (r.ready) ready(r.ready); return r; }
  FLX.load = load;
  function dropRoom() { try { if (R.rooms && R.rooms.home) { R.scene.remove(R.rooms.home); delete R.rooms.home; } } catch (e) {} } // the room is built again with the new level
  setInterval(() => { if (!FLX.loaded || Date.now() - FLX.loaded > 60000) load(); }, 4000);
  window.addEventListener("fef-flat", () => load());
  setInterval(() => { try { const r = FLX.st; if (r && r.run && nowS() >= r.run.t1 && Date.now() - FLX.loaded > 1500) load(); } catch (e) {} }, 1500);

  // ---------------------------------------------------------------- ready
  let readyShown = 0;
  function ready(rd) {
    if (readyShown >= rd.level) return; readyShown = rd.level; const a = capA("flat"), L = FLX.st.levels[rd.level - 1]; if (a) a.ack().catch(() => {}); dropRoom();
    banner("🏠 LEVEL " + rd.level, L.name); toast("🏠 Your flat is level " + rd.level + ": " + L.name + ". Comfort +" + rd.level * 3 + "%.");
    if (s.inside || (typeof introOn !== "undefined" && introOn) || !$("sheet").hidden) return;
    evCard({ icon: "🏠", tag: "UPGRADE COMPLETE", title: "Level " + rd.level + ": " + L.name, text: L.desc + ". Resting at home now restores " + rd.level * 3 + "% more.", opts: [{ label: "Show me", sub: "Go and see it", pri: true, go: () => showFlat() }, { label: "Later", go: () => {} }] });
  }
  function showFlat() { try { if (typeof goHome === "function") goHome(); } catch (e) {} FLX.cam = { t0: performance.now(), dur: 6500 }; }
  FLX.camOn = () => !!(FLX.cam && s.inside === "home" && performance.now() - FLX.cam.t0 < FLX.cam.dur);
  FLX.camTick = function (now) { const c = FLX.cam, k = (now - c.t0) / c.dur, e = k * k * (3 - 2 * k), w = rw(), h = rh(), a = -0.9 + e * 1.8, dist = Math.max(w, h) * 0.9; R.tgt.set(w / 2, 0.9, h / 2 + 0.3); R.camera.position.set(w / 2 + Math.sin(a) * dist * 0.75, dist * 0.55 + 1.2, h / 2 + 0.3 + Math.cos(a) * dist * 0.8); R.camera.lookAt(R.tgt); };

  // ---------------------------------------------------------------- the room: ten levels, all on the walls and ceiling so they never block your furniture
  const gm = (c) => new THREE.MeshBasicMaterial({ color: c });
  function dress(gr, w, h, def) {
    const lv = level(), b = (W, H, D, c, x, y, z) => box(W, H, D, c, x, y, z, gr), cy = (rt, rb, hh, c, x, y, z, seg) => cyl(rt, rb, hh, c, x, y, z, gr, seg || 10), sp = (r, c, x, y, z) => sph(r, c, x, y, z, gr, 8), glowAt = (c, r, x, y, z) => mesh(new THREE.SphereGeometry(r, 8, 6), gm(c), x, y, z, gr, false), gold = lv >= 10;
    if (lv < 1) return; const wood = gold ? "#c9a227" : "#8a5a34", trim = gold ? "#e8d27a" : "#c49a6c";
    // L1 panelling along the back and left walls
    b(w - 2.2, 0.85, 0.06, wood, w / 2, 0.47, 1.05); b(w - 2.2, 0.07, 0.1, trim, w / 2, 0.93, 1.06); b(0.06, 0.85, h - 2.2, wood, 1.05, 0.47, h / 2); b(0.1, 0.07, h - 2.2, trim, 1.06, 0.93, h / 2); b(w - 2.2, 0.1, 0.1, trim, w / 2, 0.06, 1.06); b(0.1, 0.1, h - 2.2, trim, 1.06, 0.06, h / 2);
    if (lv >= 2) for (const fx of [0.22, 0.5, 0.78]) { const x = w * fx, z = h * 0.34; cy(0.012, 0.012, 0.7, "#222", x, 2.4, z, 4); cy(0.07, 0.3, 0.3, "#f2b544", x, 2.0, z, 12); glowAt(0xffe2a0, 0.1, x, 1.88, z); } // L2 hanging lamps
    if (lv >= 3) { let xs = []; try { xs = winSpans(def).map(([a, c]) => (a + c) / 2); } catch (e) {} if (!xs.length) xs = [3, w - 3]; for (const x of xs) { b(1.5, 0.18, 0.3, "#6b4a2a", x, 1.0, 1.22); for (let i = 0; i < 6; i++) sp(0.1, ["#e4572e", "#f2b544", "#c2457a", "#ffffff", "#7a4fd1", "#ff7a59"][i], x - 0.6 + i * 0.24, 1.2 + (i % 2) * 0.04, 1.22); } } // L3 flower boxes
    if (lv >= 4) for (let i = 0; i < 5; i++) { const z = 2.0 + i * Math.max(0.9, (h - 4.4) / 4), c = ["#e4572e", "#2a6fb0", "#f2b544", "#3d8c4a", "#c2457a"][i]; b(0.06, 0.85, 0.65, "#17171a", 1.07, 1.75 + (i % 2) * 0.12, z); b(0.04, 0.7, 0.5, c, 1.1, 1.75 + (i % 2) * 0.12, z); b(0.045, 0.2, 0.3, "#f4f1e8", 1.12, 1.62 + (i % 2) * 0.12, z); } // L4 gallery
    if (lv >= 5) { b(w - 2, 0.1, 0.2, "#f4f1e8", w / 2, 2.64, 1.12); b(0.2, 0.1, h - 2, "#f4f1e8", 1.12, 2.64, h / 2); mesh(new THREE.BoxGeometry(w - 2.4, 0.04, 0.06), gm(0xffe2a0), w / 2, 2.55, 1.2, gr, false); mesh(new THREE.BoxGeometry(0.06, 0.04, h - 2.4), gm(0xffe2a0), 1.2, 2.55, h / 2, gr, false); } // L5 cove lighting
    if (lv >= 6) { for (const [x, z] of [[w - 2.2, 2.4], [2.6, h - 2.6], [w - 2.4, h - 2.6]]) { cy(0.01, 0.01, 0.9, "#222", x, 2.2, z, 4); cy(0.16, 0.12, 0.2, "#8a4a1c", x, 1.7, z, 10); for (let i = 0; i < 4; i++) sp(0.16, "#2f8f4a", x + (i - 1.5) * 0.12, 1.55 - (i % 2) * 0.1, z + (i % 2) * 0.1); } for (const y of [1.4, 1.95]) { b(0.34, 0.05, 1.4, "#6b4a2a", 1.22, y, h * 0.72); for (let i = 0; i < 3; i++) { cy(0.07, 0.06, 0.12, "#8a4a1c", 1.22, y + 0.09, h * 0.72 - 0.4 + i * 0.4, 8); sp(0.11, "#3da05a", 1.22, y + 0.2, h * 0.72 - 0.4 + i * 0.4); } } } // L6 hanging plants and wall shelves
    if (lv >= 7) { const x = w / 2, z = h / 2; cy(0.012, 0.012, 0.6, "#c9a227", x, 2.7, z, 4); const r = cy(0.55, 0.55, 0.05, "#c9a227", x, 2.35, z, 24); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; glowAt(0xffe2a0, 0.07, x + Math.cos(a) * 0.55, 2.42, z + Math.sin(a) * 0.55); cy(0.015, 0.015, 0.18, "#e8e2c0", x + Math.cos(a) * 0.55, 2.28, z + Math.sin(a) * 0.55, 4); } sp(0.14, "#cfe9f3", x, 2.15, z); cy(0.18, 0.04, 0.3, "#e8e2c0", x, 2.5, z, 8); } // L7 chandelier
    if (lv >= 8) { const x = w / 2; b(1.9, 1.55, 0.05, "#c9a227", x, 1.62, 1.06); b(1.76, 1.41, 0.03, "#a9c3d3", x, 1.62, 1.09); b(0.08, 1.2, 0.02, "#e8f4f8", x - 0.5, 1.62, 1.11); for (let i = 0; i < 14; i++) b(0.05, 1.9, 0.05, i % 2 ? "#8a5a34" : "#6b4a2a", 1.08, 1.0 + 0.0, 2.2 + i * 0.16 * Math.max(1, (h - 5) / 2.2)); } // L8 mirror and slats
    if (lv >= 9) { mesh(new THREE.BoxGeometry(w - 2.6, 0.03, 0.05), gm(0x35e0d0), w / 2, 0.14, 1.14, gr, false); mesh(new THREE.BoxGeometry(0.05, 0.03, h - 2.6), gm(0x35e0d0), 1.14, 0.14, h / 2, gr, false); b(0.06, 0.34, 0.24, "#17171a", 1.1, 1.3, h - 2.2); mesh(new THREE.BoxGeometry(0.02, 0.26, 0.18), gm(0x6ff0e0), 1.14, 1.3, h - 2.2, gr, false); } // L9 smart-home glow and panel
    if (lv >= 10) { const x = w / 2, z = h / 2; cy(0.9, 0.9, 0.05, "#e8d27a", x, 2.4, z, 28); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; glowAt(0xfff0b0, 0.06, x + Math.cos(a) * 0.9, 2.46, z + Math.sin(a) * 0.9); cy(0.02, 0.02, 0.35, "#cfe9f3", x + Math.cos(a) * 0.9, 2.2, z + Math.sin(a) * 0.9, 4); } const m = mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: textTex((s.name || "Your") + "'s Penthouse", "#2a1d17", "#e8d27a", 64) }), w / 2, 2.2, 1.07, gr, false); m.scale.set(0.45 * m.material.map.userData.aspect, 0.45, 1); } // L10 the penthouse
  }
  // builders who work in the room while an upgrade is running
  const BUILD_LOOK = (i) => ({ g: "m", skin: SKINS[(i + 1) % 5], hair: "#1a120c", role: "resident", head: "worker", top: "worker", legs: "worker", feet: "worker" });
  function builders(now, def) {
    const r = FLX.st; const run = r && r.run && nowS() < r.run.t1 ? r.run : null; const g = R.rooms && R.rooms.home;
    if (g) { if (run && !g.userData.site) { const s2 = new THREE.Group(); const w = def.w, h = def.h; const bx = (W, H, D, c, x, y, z) => box(W, H, D, c, x, y, z, s2); bx(1.6, 0.04, 1.1, "#e8e2d0", w - 3.0, 0.03, 3.1); bx(0.4, 0.3, 0.4, "#c0392b", w - 3.4, 0.2, 3.0); bx(0.4, 0.3, 0.4, "#2a6fb0", w - 2.8, 0.2, 3.3); for (const dx of [-0.25, 0.25]) bx(0.06, 2.2, 0.06, "#c9ced3", 2.4 + dx, 1.1, 2.3); for (let i = 0; i < 6; i++) bx(0.5, 0.05, 0.06, "#c9ced3", 2.4, 0.3 + i * 0.35, 2.3); const sign = mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: textTex("WORK IN PROGRESS", "#f2b544", "#17171a", 56) }), w / 2, 1.4, h - 1.2, s2, false); sign.scale.set(0.4 * sign.material.map.userData.aspect, 0.4, 1); g.add(s2); g.userData.site = s2; } else if (!run && g.userData.site) { g.remove(g.userData.site); g.userData.site = null; } }
    if (!run) return; const w = def.w, h = def.h, door = [w / 2, h - 1.3], sec = now / 1000, X = window.WKX; if (!X || !X.mkActor) return;
    if (!FLX.acts.length || FLX.actsFor !== run.t0 + ":" + w + "x" + h) { FLX.actsFor = run.t0 + ":" + w + "x" + h; const off = -(run.t0 / 1000); FLX.acts = [X.mkActor({ id: "b1", look: BUILD_LOOK(0), off, nodes: [[door[0], door[1], 0.2, 1], [w - 3.0, 3.8, 14, 1, "stack", "box"], [door[0], door[1], 1.5, 1, "stand"], [w - 3.2, 3.8, 10, 1, "carry", "box", "", 1]] }), X.mkActor({ id: "b2", look: BUILD_LOOK(2), off: off - 6, nodes: [[door[0] - 1, door[1], 0.2, 1], [2.1, h / 2, 16, 2, "chop"], [2.1, h / 2 + 1.4, 12, 2, "wipe"]] })]; }
    for (const a of FLX.acts) { const q = X.actorAt(a, sec); if (q.hide) continue; personAt("flat_" + a.id, q.look, q.x, q.y, q.face, q.moving, { name: a.id === "b1" ? "🏗️ Builder" : "", bubble: q.say, pose: q.pose ? { k: q.pose, x: q.x, y: q.y, h: q.h, face: q.face, prop: q.prop } : null, prop: q.prop }); }
  }
  if (window.WKX && WKX.ticks) WKX.ticks.push((now, def) => { if (s.inside === "home") { try { builders(now, def); } catch (e) { console.warn("builders", e); } } });
  // dress the room and add the upgrade board when the home is laid out
  const _hs = window.homeSetup;
  window.homeSetup = function (src, key, owner) {
    _hs.apply(this, arguments); const D = ROOMDEF[key || "home"]; if (!D) return; const guest = (key || "home") !== "home";
    if (!guest) { D.build3d = (gr, w, h) => dress(gr, w, h, D); const taken = (ROOM.home || []).map((o) => [o.x, o.y]); let spot; try { spot = homeFreeSpot(D.t || 1, taken, [D.w - 2.2, D.h - 2.4]); } catch (e) { spot = [D.w - 2.2, D.h - 2.6]; } ROOM.home.push({ icon: "🛠️", name: "Flat upgrades", kind: "", x: spot[0], y: spot[1], use: true, acts: upgradeActs }); }
    else if (s.visitOf) { const ownerId = s.visitOf, list = ROOM[key]; if (list) { const spot = homeFreeSpot(D.t || 1, list.map((o) => [o.x, o.y]), [D.w - 2.2, D.h - 2.4]); list.push({ icon: "🔨", name: "Help build", kind: "", x: spot[0], y: spot[1], use: true, acts: () => helpActs(ownerId) }); } }
  };
  // ---------------------------------------------------------------- the upgrade board
  function upgradeActs() {
    const r = FLX.st, out = []; if (!r) { load(); return [{ label: "⏳ Loading…", info: "Try again in a moment", go: () => closeMenu() }]; }
    if (r.run && nowS() < r.run.t1) { const n = r.run.nudges, max = 6; out.push({ label: "🏗️ Building: " + r.run.name, info: fmt(left()) + " left · " + r.run.desc, go: () => closeMenu() }); out.push({ label: "⏩ Work a shift to speed it up", info: "Each finished shift takes about 2 minutes off (" + n + " of " + max + " used)", go: () => { closeMenu(); openPhone("hustle"); } }); out.push({ label: "👫 Ask a friend to help", info: "A friend who visits can take 5% off (" + r.run.helps + " of 5 so far)", go: () => { closeMenu(); openPhone("people"); } }); }
    else if (r.next) { const n = r.next, why = s.money < n.cost ? "You need " + rs(n.cost) : ""; out.push({ label: "🛠️ Start level " + n.to + ": " + n.name, info: rs(n.cost) + " · " + fmt(n.secs) + " · " + n.desc, why, go: () => { closeMenu(); startUpgrade(); } }); }
    else out.push({ label: "👑 Your flat is a penthouse", info: "There is nothing left to build", go: () => closeMenu() });
    out.push({ label: "📋 All the levels", info: "Level " + r.level + " of " + r.max + " · comfort +" + r.comfort + "%", go: () => { closeMenu(); levelsMenu(); } }); return out;
  }
  function levelsMenu() { const r = FLX.st; openMenu("🏠 Your flat · level " + r.level, r.levels.map((l) => ({ label: (l.lv <= r.level ? "✅ " : l.lv === r.level + 1 ? "🛠️ " : "🔒 ") + "Level " + l.lv + ": " + l.name, info: l.desc + " · " + rs(l.cost) + " · " + fmt(l.secs), go: () => {} })), "Each level takes longer. Playing speeds it up; friends can help."); }
  async function startUpgrade() {
    const a = capA("flat"); if (!a) return; const r = await a.start().catch(() => null); if (!r || !r.ok) { toast("🛠️ " + ((r && r.error) || "Could not start.")); return; }
    if (r.paid && !r.again) { s.money -= r.paid; txn("Flat upgrade: " + r.run.name, -r.paid); save(); } FLX.st = r; FLX.off = r.now - Date.now(); FLX.loaded = Date.now(); FLX.acts = []; FLX.sp = null;
    toast("🏗️ The builders are on it: " + r.run.name + " will be ready in " + fmt(left()) + "."); if (typeof Notification !== "undefined" && Notification.permission !== "granted" && window.HUX) setTimeout(() => HUX.askPush("The builders are working."), 2200);
  }
  FLX.start = startUpgrade;
  // ---------------------------------------------------------------- friends who help
  function helpActs(owner) { return [{ label: "🔨 Help build their flat", info: "Takes a few minutes off · they thank you with Rs 40", go: async () => { closeMenu(); const a = capA("flat"); const p = await a.peek(owner).catch(() => null); if (!p || !p.ok) { toast("Could not check."); return; } if (!p.running) { toast("🔨 Nothing is being built there right now."); return; } if (p.helped) { toast("You already helped with this one."); return; } startAction(A("Help build their flat", "", 10, 0, { fun: 6, social: 8 }, { run() { a.help(owner).then((r) => { if (r && r.ok) { if (r.thanks) { toast("🔨 You took " + fmt(r.cut) + " off. Thanks: Rs " + r.thanks + " is on its way."); } else toast("🔨 You took " + fmt(r.cut) + " off."); } else toast("🔨 " + ((r && r.error) || "Could not help.")); }).catch(() => {}); return "You rolled up your sleeves and got stuck in. 🔨"; } })); } }]; }
  // ---------------------------------------------------------------- finished shifts speed the builders up, and rest at home is better
  FLX.nudge = async function () { const r = FLX.st; if (!r || !r.run || nowS() >= r.run.t1) return; const a = capA("flat"); try { const n = await a.nudge(); if (n && n.ok) { FLX.st = n; FLX.off = n.now - Date.now(); FLX.loaded = Date.now(); toast("⏩ The builders speed up: about " + fmt(n.saved) + " saved."); } } catch (e) {} };
  const _finish = window.finish;
  window.finish = function (a) {
    let a2 = a; const lv = level(); if (lv && a && a.fx && s.inside === "home") { const f = Object.assign({}, a.fx), k = 1 + 0.03 * lv; for (const key of ["energy", "fun"]) if (f[key] > 0) f[key] = Math.round(f[key] * k); a2 = Object.assign({}, a, { fx: f }); }
    const res = _finish.call(this, a2); if (a && (a.job !== undefined || /Part-time/.test(a.label || ""))) FLX.nudge(); if (a && (a.job !== undefined || /Part-time/.test(a.label || ""))) FLX.offerFirst(); return res; };
  FLX.offerFirst = function () { if (s.flatOffer || level() > 0 || (FLX.st && FLX.st.run) || !FLX.st || s.money < 300 || s.inside || (typeof introOn !== "undefined" && introOn)) return; s.flatOffer = 1; save(); setTimeout(() => evCard({ icon: "🛠️", tag: "YOUR PLACE", title: "Make your flat yours", text: "Your first upgrade costs Rs 300 and takes just 2 minutes: fresh panelling along the walls. Builders do the work while you play, and the next ones take longer, so there is always something to come back to.", opts: [{ label: "Take me home", sub: "Then tap the 🛠️ board", pri: true, go: () => { try { goHome(); } catch (e) {} } }, { label: "Later", go: () => {} }] }), 2500); };
  // ---------------------------------------------------------------- a sign over your door while it is being built
  FLX.drawOut = function (now) {
    const r = FLX.st; if (!r || s.inside) { if (FLX.sp) FLX.sp.visible = false; return; } const run = r.run && nowS() < r.run.t1 ? r.run : null; let d; try { d = myDoor(); } catch (e) { d = null; } if (!run || !d) { if (FLX.sp) FLX.sp.visible = false; return; }
    const text = "🏗️ " + run.name + " · " + fmt(left()), pct = Math.min(1, 1 - left() / run.total), key = text.slice(0, -2) + Math.round(pct * 20);
    if (!FLX.sp || FLX.spKey !== key) { FLX.spKey = key; const c = document.createElement("canvas"); c.width = 512; c.height = 128; const g = c.getContext("2d"); g.fillStyle = "rgba(17,24,40,0.88)"; g.beginPath(); g.roundRect ? g.roundRect(4, 4, 504, 120, 22) : g.rect(4, 4, 504, 120); g.fill(); g.fillStyle = "#fff"; g.font = "700 38px Figtree, sans-serif"; g.textAlign = "center"; g.fillText(text, 256, 52); g.fillStyle = "#33415f"; g.fillRect(40, 78, 432, 20); g.fillStyle = "#ffc53d"; g.fillRect(40, 78, 432 * pct, 20); const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; if (!FLX.sp) { FLX.sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); FLX.sp.scale.set(5, 1.25, 1); FLX.sp.renderOrder = 20; R.world.add(FLX.sp); } else { FLX.sp.material.map.dispose(); FLX.sp.material.map = tex; FLX.sp.material.needsUpdate = true; } }
    FLX.sp.visible = Math.hypot(d.x - s.x, d.y - s.y) < 40; FLX.sp.position.set(d.x, 4.2 + Math.sin(now / 600) * 0.06, d.y - 1.2);
  };
  // ---------------------------------------------------------------- the card in the Hustles app
  FLX.card = async function (box) {
    box.append(el("p", "psec", "Your flat")); if (!FLX.st || Date.now() - FLX.loaded > 5000) await load(); const r = FLX.st; if (!r) { box.append(el("p", "pnote", "Your flat needs the game server.")); return; }
    const card = el("div", "jobcard"); card.append(el("small", "jlabel", "YOUR FLAT · LEVEL " + r.level + " OF " + r.max)); const top = el("div", "jtop"); top.append(el("b", "", r.level ? r.levels[r.level - 1].name : "Bare walls")); card.append(top);
    const run = r.run && nowS() < r.run.t1 ? r.run : null; if (run) { const pct = Math.min(100, Math.round((1 - left() / run.total) * 100)), bar = el("div", "jbar"), fill = el("i"); fill.style.width = pct + "%"; bar.append(fill); card.append(el("span", "jsub", "🏗️ Building level " + run.to + ": " + run.name), bar, el("span", "jnote", fmt(left()) + " left · finished shifts and friends speed it up")); }
    else if (r.next) { card.append(el("span", "jsub", "Next: level " + r.next.to + ", " + r.next.name + " · " + rs(r.next.cost) + " · " + fmt(r.next.secs)), el("span", "jnote", r.next.desc)); } else card.append(el("span", "jsub", "A penthouse. Nothing left to build."));
    const go = el("button", "jwork"); go.type = "button"; go.textContent = run || r.next ? "Go to my flat" : "Visit my flat"; go.onclick = () => { closePhone(); try { goHome(); } catch (e) {} }; card.append(go); box.append(card);
  };
  setTimeout(() => { try { if (ROOMDEF.home) homeSetup(); } catch (e) {} }, 1500); // a home laid out before this loaded gets its board
})();
