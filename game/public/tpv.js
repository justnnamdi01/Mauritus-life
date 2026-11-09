"use strict";
// THIRD-PERSON VIEW and the MINI-MAP.
//  · A 🎥 button (or the V key) swings the camera from the town's overview down behind your shoulder, smoothly, and back again. Works outdoors and in every room.
//  · Move with W A S D (or the on-screen stick), look around by dragging, Q and E turn the camera. Taps on doors and things still work.
//  · A round mini-map at the top turns with the camera, like a car's sat-nav: roads, buildings, water, other players and you. Tap it to zoom.
// Loaded after the game page.
(function () {
  const TPX = window.TPX = { on: false, k: 0, yaw: Math.atan2(-0.36, -0.56), pitch: 0.24, joy: { x: 0, y: 0 }, heading: 0, dragAt: 0, mmZoom: 1, dirx: 0.36, dirz: 0.56 };
  const V3 = () => THREE.Vector3, ease = (t) => t * t * (3 - 2 * t), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const css = document.createElement("style");
  css.textContent = "#tpvBtn.on{background:#2a9d8f;color:#fff}#tpJoy{position:fixed;left:22px;bottom:104px;width:118px;height:118px;border-radius:50%;background:rgba(10,24,34,.38);border:2px solid rgba(255,255,255,.35);z-index:40;touch-action:none;display:none}#tpJoy i{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(255,255,255,.78);box-shadow:0 2px 8px rgba(0,0,0,.35);pointer-events:none}#tpMap{position:fixed;left:12px;top:124px;width:112px;height:112px;border-radius:50%;border:3px solid rgba(255,255,255,.85);box-shadow:0 3px 14px rgba(0,0,0,.45);z-index:30;display:none;background:#0b1f2c}#tpMapN{position:fixed;left:12px;top:124px;width:112px;height:112px;z-index:31;pointer-events:none;display:none}#tpMapN b{position:absolute;left:50%;top:-2px;transform:translateX(-50%);font:800 11px system-ui,sans-serif;color:#fff;background:#e4572e;border-radius:8px;padding:0 5px}#tpMapL{position:fixed;left:12px;top:238px;width:112px;text-align:center;font:700 10px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000;z-index:31;pointer-events:none;display:none}body.tpv .hud.music{top:268px}body.tpv #quest{top:268px}";
  document.head.append(css);
  // ------------------------------------------------------------ the buttons and the stick
  const zoomBox = document.querySelector(".zoom"), btn = document.createElement("button"); btn.className = "pill"; btn.id = "tpvBtn"; btn.type = "button"; btn.setAttribute("aria-label", "Third-person view"); btn.title = "Third-person view (V)"; btn.textContent = "🎥";
  if (zoomBox) zoomBox.insertBefore(btn, zoomBox.firstChild);
  const joy = document.createElement("div"); joy.id = "tpJoy"; joy.innerHTML = "<i></i>"; document.body.append(joy);
  const mm = document.createElement("canvas"); mm.id = "tpMap"; mm.width = mm.height = 224; document.body.append(mm); const mmN = document.createElement("div"); mmN.id = "tpMapN"; mmN.innerHTML = "<b>N</b>"; document.body.append(mmN); const mmL = document.createElement("div"); mmL.id = "tpMapL"; document.body.append(mmL);
  let joyId = null; const knob = joy.firstChild;
  const joyMove = (e) => { const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } TPX.joy.x = Math.abs(dx) < 0.12 ? 0 : dx; TPX.joy.y = Math.abs(dy) < 0.12 ? 0 : dy; knob.style.transform = "translate(" + dx * 34 + "px," + dy * 34 + "px)"; };
  joy.addEventListener("pointerdown", (e) => { joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (x) {} joyMove(e); e.preventDefault(); e.stopPropagation(); path = []; });
  joy.addEventListener("pointermove", (e) => { if (e.pointerId === joyId) { joyMove(e); e.stopPropagation(); } });
  const joyEnd = (e) => { if (e.pointerId === joyId) { joyId = null; TPX.joy.x = TPX.joy.y = 0; knob.style.transform = ""; e.stopPropagation(); } };
  joy.addEventListener("pointerup", joyEnd); joy.addEventListener("pointercancel", joyEnd);
  // ------------------------------------------------------------ moving and looking
  const held = (k) => !!(typeof keys !== "undefined" && (keys[k] || keys[k.toUpperCase()]));
  TPX.axis = function () { // what you ask for, as a direction on the ground
    let fwd = (held("w") || held("ArrowUp") ? 1 : 0) - (held("s") || held("ArrowDown") ? 1 : 0), str = (held("d") ? 1 : 0) - (held("a") ? 1 : 0); fwd -= TPX.joy.y; str += TPX.joy.x; if (!fwd && !str) return { dx: 0, dy: 0 };
    const fx = Math.sin(TPX.yaw), fz = Math.cos(TPX.yaw), rx = -fz, rz = fx; return { dx: fx * fwd + rx * str, dy: fz * fwd + rz * str };
  };
  addEventListener("keydown", (e) => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; const k = e.key; if (k === "v" || k === "V") { toggle(); return; } if (!TPX.on) return; if (k === "q" || k === "Q" || k === "ArrowLeft") { TPX.yaw += 0.18; TPX.dragAt = performance.now(); } else if (k === "e" || k === "E" || k === "ArrowRight") { TPX.yaw -= 0.18; TPX.dragAt = performance.now(); } });
  let drag = null; // dragging anywhere on the world turns the camera (a short tap still taps)
  addEventListener("pointerdown", (e) => { if (!TPX.on || e.target.id !== "world") return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; }, true);
  addEventListener("pointermove", (e) => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) > 8) drag.moved = true; if (drag.moved) { TPX.yaw -= (e.clientX - (drag.lx === undefined ? drag.x : drag.lx)) * 0.0062; TPX.pitch = Math.max(0.04, Math.min(0.85, TPX.pitch + (e.clientY - (drag.ly === undefined ? drag.y : drag.ly)) * 0.004)); TPX.dragAt = performance.now(); path = []; e.stopImmediatePropagation(); } drag.lx = e.clientX; drag.ly = e.clientY; }, true);
  const dEnd = (e) => { if (drag && e.pointerId === drag.id) { if (drag.moved) e.stopImmediatePropagation(); drag = null; } };
  addEventListener("pointerup", dEnd, true); addEventListener("pointercancel", dEnd, true);
  // ------------------------------------------------------------ the camera
  const allowed = () => TPX.on && !introOn && !(typeof ride !== "undefined" && ride && ride.on) && !s.jf && !s.hf && !(window.HB && HB.ride) && !(window.HUX && HUX.rideOn && HUX.rideOn()) && !(typeof SIT !== "undefined" && SIT.on) && !(typeof busy !== "undefined" && busy && busy.pose && busy.pose.k === "sit");
  TPX.camOn = function () { const want = allowed() ? 1 : 0; if (!want && TPX.k < 0.002) { TPX.k = 0; return false; } return true; };
  TPX.camTick = function (now) {
    const dt = Math.min(0.1, (now - (TPX.last || now)) / 1000); TPX.last = now; const want = allowed() ? 1 : 0; TPX.k += (want - TPX.k) * (1 - Math.exp(-dt * 4.2)); if (Math.abs(want - TPX.k) < 0.003) TPX.k = want; const e = ease(Math.max(0, Math.min(1, TPX.k)));
    const V = THREE.Vector3, ind = !!s.inside, fx = Math.sin(TPX.yaw), fz = Math.cos(TPX.yaw), rx = -fz, rz = fx, base = ind ? 0 : (R.dyn ? R.dyn.position.y : 0);
    const dist = ind ? 3.1 : 4.6, pit = TPX.pitch, T = new V(s.x + rx * 0.42, base + 1.15, s.y + rz * 0.42), cam = new V(T.x - fx * Math.cos(pit) * dist, T.y + Math.sin(pit) * dist + 0.35, T.z - fz * Math.cos(pit) * dist);
    if (ind) { const w = rw(), h = rh(); cam.x = Math.max(0.3, Math.min(w - 0.3, cam.x)); cam.z = Math.max(0.3, Math.min(h - 0.3, cam.z)); cam.y = Math.min(cam.y, 2.7); }
    const look = new V(T.x + fx * 3.2, T.y - 0.1 + Math.sin(pit) * -1.2 + 0.25, T.z + fz * 3.2);
    const iso = R.camera.position.clone(), isoLook = R.tgt.clone(); R.camera.position.lerpVectors(iso, cam, e); const la = isoLook.lerp(look, e); R.camera.lookAt(la);
    const fov = 40 + (62 - 40) * e; if (Math.abs(R.camera.fov - fov) > 0.05) { R.camera.fov = fov; R.camera.updateProjectionMatrix(); }
    TPX.dirx = -fx * 0.6; TPX.dirz = -fz * 0.6; if (TPX.k === 0 && R.camera.fov !== 40) { R.camera.fov = 40; R.camera.updateProjectionMatrix(); }
  };
  function toggle(force) { TPX.on = force === undefined ? !TPX.on : !!force; btn.classList.toggle("on", TPX.on); document.body.classList.toggle("tpv", TPX.on); try { s.tpv = TPX.on ? 1 : 0; save(); } catch (e) {} if (TPX.on) { TPX.heading = [0, Math.PI, -Math.PI / 2, Math.PI / 2][s.face | 0] || 0; toast("🎥 Third-person view: drag to look around, WASD or the stick to move. Tap 🎥 to go back."); } }
  btn.onclick = () => toggle(); TPX.toggle = toggle;
  // ------------------------------------------------------------ the mini-map
  let big = null;
  const COL = { 0: [11, 61, 99], 1: [42, 155, 181], 2: [233, 217, 166], 3: [127, 174, 95], 4: [75, 79, 85], 9: [93, 160, 90], 11: [169, 185, 78], 12: [111, 191, 111], 22: [189, 184, 170], 15: [106, 143, 90], 17: [120, 160, 100], 18: [120, 160, 100] };
  function buildBig() {
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"), im = g.createImageData(W, H), d = im.data; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, t = terr[y * W + x], col = y < HO ? [9, 20, 28] : (COL[t] || [112, 150, 96]); d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
    g.putImageData(im, 0, 0); g.fillStyle = "#7d6f66"; for (const b of BUILD) g.fillRect(b.x, b.y, b.w, b.h); g.fillStyle = "#a39688"; if (typeof DECOH !== "undefined") for (const h of DECOH) g.fillRect(h.x, h.y, h.w, h.h); big = c; TPX.big = c; }
  const mg = mm.getContext("2d"); mg.imageSmoothingEnabled = false;
  mm.addEventListener("click", () => { TPX.mmZoom = TPX.mmZoom === 1 ? 1.8 : TPX.mmZoom === 1.8 ? 0.6 : 1; });
  function drawMap() {
    const show = TPX.on && !s.inside && s.made && !introOn && $("sheet").hidden && $("phone").hidden; for (const el of [mm, mmN, mmL]) el.style.display = show ? "block" : "none"; joy.style.display = TPX.on && !introOn && !s.inside ? "block" : (TPX.on && s.inside ? "block" : "none"); if (!show) return;
    if (!big) buildBig(); const S = 224, sc = 3.0 * TPX.mmZoom, cx = S / 2, cy = S / 2, fx = Math.sin(TPX.yaw), fz = Math.cos(TPX.yaw), a = -Math.PI / 2 - Math.atan2(fz, fx);
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.fillStyle = "#0b1f2c"; mg.fillRect(0, 0, S, S); mg.save(); mg.translate(cx, cy); mg.rotate(a); mg.scale(sc, sc); mg.translate(-s.x, -s.y); mg.drawImage(big, 0, 0);
    mg.fillStyle = "#37e08a"; for (const k in others) { const o = others[k]; if (o.p && !o.p.in && Math.hypot(o.x - s.x, o.y - s.y) < 60) { mg.beginPath(); mg.arc(o.x, o.y, 1.1, 0, 7); mg.fill(); } }
    if (window.CRT && CRT.minimap) CRT.minimap(mg, s);
    const hd = Math.atan2(Math.cos(TPX.heading), Math.sin(TPX.heading)); mg.translate(s.x, s.y); mg.rotate(hd); mg.fillStyle = "#fff"; mg.strokeStyle = "#e4572e"; mg.lineWidth = 0.5; mg.beginPath(); mg.moveTo(2.6, 0); mg.lineTo(-1.6, 1.6); mg.lineTo(-0.7, 0); mg.lineTo(-1.6, -1.6); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
    const rg = typeof regionOfY === "function" ? regionOfY(Math.floor(s.y)) : "", def = typeof regionDef === "function" ? regionDef(rg) : null; mmL.textContent = def ? def.name : ""; mmN.firstChild.style.transform = "translateX(-50%)"; mmN.style.transform = "rotate(" + (-a) + "rad)"; mmN.firstChild.style.transform = "translateX(-50%) rotate(" + a + "rad)";
  }
  (function loop() { try { drawMap(); } catch (e) { if (!TPX.err) { TPX.err = 1; console.warn("minimap", e); } } requestAnimationFrame(loop); })();
  setTimeout(() => { try { if (s.tpv) toggle(true); } catch (e) {} }, 2500);
})();
