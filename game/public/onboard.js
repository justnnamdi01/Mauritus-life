"use strict";
// THE FIRST FIVE MINUTES.
//  1. INSTANT DROP: a new player sees one input ("IslandRider_42") and one button ("Jump In"). No gender, traits or outfit forms: they get a random look and stand on the
//     pavement in front of the Caudan waterfront with the controls in their hands.
//  2. STYLE IT IN THE WORLD: a mirror and clothes rack stand right by the spawn with a floating "Style Your Avatar" marker, which opens the Character Studio.
//  3. A BUCKET LIST, not a tutorial: a small pinned Island Checklist pays Auntie Marie's money (the server pays) whenever they do things naturally, in any order.
//  4. LATE ACCOUNT: no password until they have something to lose (first Rs 2,500 earned, first outfit or car bought, or leaving the tab).
//  5. QUIET FIRST SESSION: no pop-ups in session 1 except a small floating WhatsApp icon; daily rewards, notifications and cards wait for session 2.
// Loaded after the game page and the other scripts.
(function () {
  const capA = (k) => window.claude && window.claude[k];
  const ONB = window.ONB = { done: {}, sent: {}, open: false, flags: {} };
  const quiet = () => !!(typeof s !== "undefined" && s.made && (s.sessions | 0) <= 1);
  ONB.quiet = quiet;
  const rnd = (n) => Math.floor(Math.random() * n);
  // ------------------------------------------------------------ sessions: a new session is a visit after 30 quiet minutes
  function sessionTick() {
    if (typeof s === "undefined" || !s.made) return; const now = Date.now();
    if (!ONB.counted) { ONB.counted = 1; if (s.sessions === undefined) s.sessions = s.joined && now - s.joined < 3600000 ? 1 : 9; else if (!s.lastSeen || now - s.lastSeen > 30 * 60000) s.sessions = (s.sessions | 0) + 1; }
    s.lastSeen = now;
  }
  setInterval(sessionTick, 15000); setTimeout(sessionTick, 3000);
  // ------------------------------------------------------------ 1. the instant drop
  const css = document.createElement("style");
  css.textContent = ".jihero{font-size:3rem;text-align:center}#card .jin{width:100%;font:700 1.2rem system-ui,sans-serif;padding:12px 14px;border-radius:12px;border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:inherit;text-align:center;box-sizing:border-box}.jig{display:flex;gap:8px;justify-content:center;margin:8px 0}.jigb{flex:1;padding:8px 6px;border-radius:12px;border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:inherit;font:700 .95rem system-ui,sans-serif;cursor:pointer}.jigb.on{background:#2a9d8f;border-color:#2a9d8f;color:#fff}.jifine{font-size:.72rem;opacity:.7;text-align:center;margin:8px 0 0}.jierr{color:#ff9f9f;min-height:1.2em;text-align:center;font-size:.85rem;margin:4px 0}.jilink{display:block;text-align:center;margin-top:10px;opacity:.8;background:none;border:0;color:inherit;text-decoration:underline;font-size:.85rem;width:100%}#onbPill{position:fixed;left:12px;top:160px;z-index:28;display:none;align-items:center;gap:6px;padding:6px 11px;border-radius:18px;border:0;background:rgba(10,24,34,.78);color:#fff;font:700 .78rem system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}#onbPill b{color:#ffd166}#onbPanel{position:fixed;left:12px;top:196px;z-index:29;width:min(290px,calc(100vw - 24px));display:none;background:rgba(10,24,34,.92);color:#fff;border-radius:14px;padding:10px 12px;font:600 .82rem system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.45)}#onbPanel h4{margin:0 0 6px;font-size:.9rem}#onbPanel div.r{display:flex;gap:8px;align-items:center;padding:4px 0;opacity:.95}#onbPanel div.r.d{opacity:.55;text-decoration:line-through}#onbPanel div.r em{margin-left:auto;font-style:normal;color:#ffd166}#onbPanel small{display:block;opacity:.7;margin-top:6px;font-weight:500}body.tpv #onbPill{left:132px;top:126px}body.tpv #onbPanel{left:132px;top:162px;width:min(260px,calc(100vw - 144px))}#onbWa{position:fixed;right:12px;bottom:200px;width:40px;height:40px;border-radius:50%;background:#25d366;color:#fff;border:0;font-size:1.3rem;z-index:27;display:none;box-shadow:0 3px 10px rgba(0,0,0,.4);cursor:pointer}#quest,#questTab{display:none!important}";
  document.head.append(css);
  const GUEST = () => "IslandRider_" + (10 + rnd(90));
  function jumpIn() {
    try { if (s.inside) leaveBuilding(); const sp = ONB.spot; s.inside = ""; s.x = sp.x; s.y = sp.y; path = []; R.tgt.set(s.x, 0.6, s.y); R.wasInside = null; } catch (e) {} // the street is behind the card, so they already see where they will be
    const card = $("card"); card.className = "card"; card.innerHTML = "";
    const err = el("p", "jierr", ""), inp = el("input", "jin"); inp.id = "jiNm"; inp.type = "text"; inp.maxLength = 14; inp.value = GUEST(); inp.setAttribute("aria-label", "Guest name"); inp.autocomplete = "off";
    const go = el("button", "start", "Jump In"); go.type = "button";
    ONB.pickG = Math.random() < 0.5 ? "m" : "f"; const gw = el("div", "jig"); const gb = {}; for (const [g, lab] of [["m", "👨 Man"], ["f", "👩 Woman"]]) { const b = el("button", "jigb" + (ONB.pickG === g ? " on" : ""), lab); b.type = "button"; b.onclick = () => { ONB.pickG = g; for (const k in gb) gb[k].classList.toggle("on", k === g); }; gb[g] = b; gw.append(b); }
    card.append(el("div", "jihero", "🏝️"), el("h2", "", "Welcome to Mauritius Life"), el("p", "", "The island is waiting. Pick a name, or keep this one."), inp, gw, err, go, el("p", "jifine", "Mauritius Life is for players aged 18 and over. By tapping Jump In you confirm that you are 18 or older."));
    if (window.claude && window.claude.account) { const lb = el("button", "jilink", "Already have a character? Log in"); lb.type = "button"; lb.onclick = () => accountSheet("login"); card.append(lb); }
    inp.oninput = () => { err.textContent = ""; }; inp.onkeydown = (e) => { if (e.key === "Enter") go.click(); };
    go.onclick = () => { let nm = cleanText(inp.value, 14) || GUEST(); let bad = nameProblem(nm); if (bad) { err.textContent = bad; inp.focus(); return; } makeGuest(nm); };
    $("sheet").hidden = false; setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) {} }, 120);
  }
  function randomLook() {
    const g = ONB.pickG === "f" || ONB.pickG === "m" ? ONB.pickG : (Math.random() < 0.5 ? "m" : "f"); s.g = g; s.role = "resident"; s.skin = SKINS[rnd(SKINS.length)]; const hc = HCOLS.filter((q) => q[2] <= 600); s.hcol = hc[rnd(hc.length)][1];
    const hairs = OUTFITS[g].head.filter((q) => q[2] <= 600 && !HATS[g].includes(q[0])); s.head = hairs.length ? hairs[rnd(hairs.length)][0] : ""; const kits = [ROLE_LOOK[g].resident, ROLE_LOOK[g].tourist, ROLE_LOOK[g].student], k = kits[rnd(kits.length)]; s.top = k[0]; s.legs = k[1]; s.feet = k[2]; s.shirt = Math.random() < 0.6 ? SHIRTS[rnd(SHIRTS.length)] : "";
  }
  function spawnSpot() { // paving in front of the Caudan waterfront
    const R0 = regionDef("portlouis"), z = (R0.M.zones || []).find((q) => q.k === "caudan") || { x: 52, y: 36 }, cx = z.x - 2, cy = R0.y0 + z.y + 4; let best = null, bd = 1e9;
    for (let y = Math.floor(cy) - 12; y <= cy + 12; y++) for (let x = Math.floor(cx) - 14; x <= cx + 14; x++) { const i = y * W + x; if (terr[i] !== 22 || solid[i]) continue; let ok = true; for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (y + dy) * W + (x + dx); if (solid[j] || (terr[j] !== 22 && terr[j] !== 4 && terr[j] !== 3)) { ok = false; break; } } if (ok) { const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; } } }
    return best || { x: R0.stop.x, y: R0.stop.y };
  }
  ONB.spot = spawnSpot();
  function makeGuest(nm) {
    randomLook(); s.name = nm; s.nameV2 = 1; s.money = ROLE.resident.money; s.rent = ROLE.resident.weekly; s.cha = 3; s.traits = s.traits || [];
    { const P = pieceSet(myLook()); for (const k of SLOTS) s.wardrobe[pieceKey(P.g, k, P[k])] = 1; } s.wardN0 = Object.keys(s.wardrobe).length;
    s.made = true; s.seenVer = updNow(); s.joined = s.joined || Date.now(); s.day0 = day(); s.permit = day() + permDays(); s.sessions = 1; s.lastSeen = Date.now(); s.tutDone = 1; s.fdAsked = 1; s.fd = -1;
    closeMenu(); if (s.inside) { try { leaveBuilding(); } catch (e) {} } const sp = ONB.spot; s.inside = ""; s.x = sp.x; s.y = sp.y; s.face = 0; path = []; try { R.tgt.set(s.x, 0.6, s.y); R.wasInside = null; } catch (e) {} save();
    toast("🏝️ Welcome, " + s.name + "! Tap the ground to walk, or use W A S D. Try 🎥 for third-person view.");
    setTimeout(() => { try { if (window.TPX && !TPX.on) TPX.toggle(true); } catch (e) {} }, 1200);
  }
  const _open = window.openCreate;
  window.openCreate = function () { if (typeof s !== "undefined" && s.made && _open) return _open.apply(this, arguments); jumpIn(); };
  setTimeout(() => { try { if (!s.made && introOn) { endIntro(false); const i = document.getElementById("intro"); if (i) i.hidden = true; } } catch (e) {} }, 30); // new players skip the film and go straight to the controls
  // ------------------------------------------------------------ 2. the mirror at the spawn
  function buildMirror() {
    if (ONB.mirror || typeof R === "undefined" || !R.world || typeof THREE === "undefined") return false; const sp = ONB.spot, x = sp.x + 3.0, z = sp.y - 0.4, g = new THREE.Group(); g.position.set(x, 0, z);
    box(2.0, 0.12, 0.7, "#6b4a2f", 0, 0.06, 0, g); box(1.5, 2.1, 0.08, "#c9d6df", 0, 1.15, -0.1, g); box(1.6, 2.2, 0.06, "#c9a227", 0, 1.15, -0.16, g); box(0.1, 1.6, 0.1, "#6b4a2f", 1.05, 0.9, 0.2, g); box(0.1, 1.6, 0.1, "#6b4a2f", 1.5, 0.9, 0.2, g); box(0.6, 0.08, 0.08, "#6b4a2f", 1.28, 1.7, 0.2, g);
    for (const [c, dx] of [["#e4572e", 1.12], ["#2a9d8f", 1.28], ["#f2b544", 1.44]]) box(0.12, 0.55, 0.3, c, dx, 1.4, 0.2, g);
    const tag = sprite(textTex("🪞 Style Your Avatar", "rgba(17,24,40,0.88)", "#ffd166", 42), 0.8); tag.position.set(0, 3.0, 0); g.add(tag); const ar = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xffd166 })); ar.rotation.x = Math.PI; ar.position.set(0, 2.45, 0); g.add(ar); ONB.arrow = ar; R.world.add(g); ONB.mirror = g; return true; }
  OBJ.push({ id: "mirror", x: ONB.spot.x + 3.0, y: ONB.spot.y + 0.9, icon: "🪞", name: "Style Your Avatar", acts: () => [{ label: "🪞 Try on clothes and hair", info: "Open the Character Studio: free to look, pay for what you like", go: () => { closeMenu(); ONB.flags.style = 1; if (!(window.openStudio && window.openStudio("wardrobe"))) toast("The mirror needs 3D."); } }] });
  // ------------------------------------------------------------ 3. the Island Checklist
  const LIST = [["ride", "🛵", "Ride a vehicle"], ["chat", "💬", "Send a chat message"], ["snack", "🍢", "Grab a snack"], ["style", "🪞", "Style your avatar at the mirror"], ["enter", "🚪", "Walk into a shop or building"], ["phone", "📱", "Open your phone"], ["work", "💼", "Earn your first wages"], ["fun", "🎡", "Try something fun"]];
  const pill = el("button"); pill.id = "onbPill"; pill.type = "button"; document.body.append(pill); const panel = el("div"); panel.id = "onbPanel"; document.body.append(panel);
  const wa = el("button"); wa.id = "onbWa"; wa.type = "button"; wa.textContent = "💬"; wa.title = "Join the community on WhatsApp"; wa.setAttribute("aria-label", "WhatsApp community"); document.body.append(wa);
  pill.onclick = () => { ONB.open = !ONB.open; render(); }; wa.onclick = () => { try { const api = window.claude && window.claude.promo; if (api) api.get().then((i) => { if (i && i.ok && i.on) { if (i.tapped && !i.claimed) promoClaimCard(i); else promoCard(i); } }); } catch (e) {} };
  function render() {
    const items = ONB.items || LIST.map(([id, ic, tx]) => ({ id, ic, text: tx, pay: 0 })), n = items.filter((i) => ONB.done[i.id]).length, all = n === items.length;
    pill.innerHTML = "🏝️ Island checklist <b>" + n + "/" + items.length + "</b>"; panel.innerHTML = "";
    const h = el("h4", "", "🧓🏾 Auntie Marie's island checklist"); panel.append(h);
    for (const it of items) { const r = el("div", "r" + (ONB.done[it.id] ? " d" : "")); r.append(el("span", "", (ONB.done[it.id] ? "✅" : it.ic || "⬜")), el("span", "", it.text), el("em", "", "+Rs " + it.pay)); panel.append(r); }
    panel.append(el("small", "", all ? "All done! Auntie Marie is proud of you." : "Do them in any order. Cash lands in your mail as you go."));
    panel.style.display = ONB.open ? "block" : "none";
  }
  async function loadList() { const a = capA("lvl"); if (!a) return; try { const r = await a.state(); if (r && r.ok && r.bucket) { ONB.items = r.bucket.items.map((i) => { const L = LIST.find((q) => q[0] === i.id) || []; return { id: i.id, ic: L[1], text: i.text, pay: i.pay }; }); for (const i of r.bucket.items) if (i.done) ONB.done[i.id] = 1; ONB.all = !!r.bucket.all; render(); } } catch (e) {} }
  async function claim(id) {
    if (ONB.done[id] || ONB.sent[id]) return; ONB.sent[id] = 1; const a = capA("lvl"); if (!a) return;
    try { const r = await a.bucket(id); if (r && r.ok) { ONB.done[id] = 1; if (!r.already && r.paid) { const L = LIST.find((q) => q[0] === id) || []; toast("🧓🏾 Auntie Marie: " + (L[2] || "Nice") + "! +Rs " + r.paid + (r.bonus ? " and a Rs " + r.bonus + " bonus for the whole list!" : "")); try { if (window.LVX) LVX.load(); } catch (e) {} } if (r.bucket) ONB.all = !!r.bucket.all; render(); } else ONB.sent[id] = 0; } catch (e) { ONB.sent[id] = 0; }
  }
  ONB.flag = (k) => { ONB.flags[k] = 1; };
  const _finish = window.finish; window.finish = function (a) { try { const l = String((a && a.label) || ""); if (a && a.fx && a.fx.hunger > 0 && /snack|dholl|gato|food|meal|eat|lunch|breakfast|dinner|juice|coffee|alouda|bread|bake|drink|burger|pizza|cafe|café|noodle|rice|curry|samosa|fish|chips|roll/i.test(l)) ONB.flags.snack = 1; if (a && (a.job !== undefined || /shift|part-time|work|odd job/i.test(l))) ONB.flags.work = 1; if (/ferris|ferry|boat|pirogue|arcade|casino|wheel|dance|surf|cruise|sailing|quad|karaoke|cinema|bowling|golf|games room|fun/i.test(l)) ONB.flags.fun = 1; } catch (e) {} return _finish.apply(this, arguments); };
  const _studio = window.openStudio; if (_studio) window.openStudio = function () { ONB.flags.style = 1; return _studio.apply(this, arguments); };
  function detect() {
    if (typeof s === "undefined" || !s.made) { pill.style.display = "none"; panel.style.display = "none"; return; }
    const hide = introOn || !$("phone").hidden || !$("sheet").hidden; const allDone = ONB.items && ONB.items.every((i) => ONB.done[i.id]); pill.style.display = hide || allDone ? "none" : "flex"; if (hide || allDone) panel.style.display = "none"; else panel.style.display = ONB.open ? "block" : "none";
    const f = ONB.flags; if ((typeof scoot !== "undefined" && scoot) || (typeof cyc !== "undefined" && cyc) || (typeof ride !== "undefined" && ride && ride.on) || (window.HB && HB.ride)) f.ride = 1; try { if (threads.town.some((m) => m.me)) f.chat = 1; } catch (e) {} if (s.inside && s.inside !== "home") f.enter = 1; if (!$("phone").hidden) f.phone = 1;
    for (const [id] of LIST) if (f[id]) claim(id);
  }
  setInterval(() => { try { detect(); } catch (e) {} }, 700); setTimeout(loadList, 3500); setInterval(() => { if (typeof s !== "undefined" && s.made && !ONB.items) loadList(); }, 8000);
  // the old pinned goal card is replaced by this checklist (its goals still live in Phone → Goals)
  // ------------------------------------------------------------ 4. an account only when there is something to lose
  const savePrompt = (why) => {
    if (typeof s === "undefined" || !s.made || !needsLogin() || ONB.prompting || Date.now() - (ONB.lastPrompt || 0) < 15 * 60000 || !$("sheet").hidden || introOn) return; ONB.prompting = 1; ONB.lastPrompt = Date.now();
    const card = $("card"); card.className = "card"; card.innerHTML = ""; const go = el("button", "start", "Save my progress"), later = el("button", "close", "Not now"); go.type = later.type = "button";
    card.append(el("div", "jihero", "🔐"), el("h2", "", why === "car" ? "Don't lose your ride!" : why === "outfit" ? "Don't lose your new look!" : "Don't lose your cash!"), el("p", "", "Add a quick username and password to keep your save file safe, and play on any phone or computer."), go, later);
    go.onclick = () => { ONB.prompting = 0; accountSheet("create"); }; later.onclick = () => { ONB.prompting = 0; $("sheet").hidden = true; }; $("sheet").hidden = false;
  };
  ONB.savePrompt = savePrompt;
  setInterval(() => { try { if (!s.made || !needsLogin()) return; const earned = Object.values(s.src || {}).reduce((a, b) => a + (+b || 0), 0) + (ONB.items ? ONB.items.filter((i) => ONB.done[i.id]).reduce((a, i) => a + i.pay, 0) : 0);
    if (!ONB.p1 && earned >= 2500) { ONB.p1 = 1; savePrompt("cash"); } else if (!ONB.p2 && (typeof hasCar === "function" && hasCar() || Object.keys(s.wardrobe || {}).length > (s.wardN0 || 99))) { ONB.p2 = 1; savePrompt(typeof hasCar === "function" && hasCar() ? "car" : "outfit"); } else if (s.savePending && !ONB.p3) { ONB.p3 = 1; s.savePending = 0; savePrompt("cash"); } } catch (e) {} }, 3000);
  document.addEventListener("visibilitychange", () => { try { if (document.visibilityState === "hidden" && s.made && needsLogin() && (Object.keys(s.wardrobe || {}).length > (s.wardN0 || 99) || s.money > 5000 || (typeof hasCar === "function" && hasCar()))) { s.savePending = 1; save(); } } catch (e) {} });
  document.addEventListener("mouseout", (e) => { try { if (!e.relatedTarget && e.clientY <= 2 && s.made && needsLogin() && (s.money > 5000 || Object.keys(s.wardrobe || {}).length > (s.wardN0 || 99))) { ONB.exit = ONB.exit || 0; if (!ONB.exit++) savePrompt("cash"); } } catch (x) {} });
  // ------------------------------------------------------------ 5. a quiet first session
  const _wb = window.welcomeBack; if (_wb) window.welcomeBack = function () { if (quiet()) return; return _wb.apply(this, arguments); };
  const _ro = window.rewardOffer; if (_ro) window.rewardOffer = function () { if (quiet()) return; return _ro.apply(this, arguments); };
  const _wn = window.whatsNewCheck; if (_wn) window.whatsNewCheck = function () { if (quiet()) return; return _wn.apply(this, arguments); };
  const _se = window.showExposed; if (_se) window.showExposed = function () { if (typeof s === "undefined" || !s.made || quiet()) return; return _se.apply(this, arguments); };
  const _sm = window.storyMaybe; if (_sm) window.storyMaybe = function () { if (quiet()) return; return _sm.apply(this, arguments); };
  const _ev = window.evCard; if (_ev) window.evCard = function (o) { if (quiet() && o && /LEVEL UP|UPGRADE COMPLETE|YOUR PLACE|COMMUNITY|CROWN|NEWS|DAILY|WELCOME|ALERT|POLL|VOTE|SEASON|RICH|ISLAND READY/i.test(String(o.tag || ""))) { try { toast((o.icon || "") + " " + (o.title || "") + (o.text ? ": " + String(o.text).slice(0, 90) : "")); } catch (e) {} return; } return _ev.apply(this, arguments); };
  setTimeout(() => { try { if (window.HUX && HUX.askPush) { const a = HUX.askPush; HUX.askPush = function () { if (quiet()) return; return a.apply(this, arguments); }; } if (window.FLX && FLX.offerFirst) { const o = FLX.offerFirst; FLX.offerFirst = function () { if (quiet()) return; return o.apply(this, arguments); }; } } catch (e) {} }, 0);
  // the one thing allowed on screen in session 1: a small WhatsApp icon (only if the community post is switched on)
  async function waCheck() { try { const api = window.claude && window.claude.promo; if (!api || typeof s === "undefined" || !s.made) return; const i = await api.get(); wa.style.display = i && i.ok && i.on && !i.claimed ? "block" : "none"; } catch (e) {} }
  setTimeout(waCheck, 6000); setInterval(waCheck, 120000);
  setInterval(() => { try { if (ONB.arrow) ONB.arrow.position.y = 2.45 + Math.sin(performance.now() / 300) * 0.12; if (!ONB.mirror) buildMirror(); } catch (e) {} }, 100);
})();
