"use strict";
// THE CHARACTER STUDIO: one screen to make your character (when you start) and to try on and buy clothes (from the Wardrobe).
// A big 3D preview you can turn with your finger, a panel with tabs, rarity filters and a grid of cards with little 3D pictures and prices, and a Cancel / Buy button.
// It changes your look live and puts it back if you cancel. Loaded after the game page; it replaces the old "Who are you in Mauritius?" screen when 3D is available.
(function () {
  const RAR = [["free", "Starter", "#9aa4ab", 0], ["common", "Common", "#4cd37b", 700], ["rare", "Rare", "#4aa8ff", 2500], ["epic", "Epic", "#b06bff", 9000], ["legend", "Legendary", "#ffc53d", 1e12]]; // by price
  const rarityOf = (price) => RAR.find((r, i) => i === 0 ? price === 0 : price <= r[3]) || RAR[4];
  const CAP_CREATE = 700; // pieces up to this price are free picks when you start
  const TABS = [["head", "Hair", "💇"], ["body", "Tops", "👕"], ["legs", "Bottoms", "👖"], ["feet", "Shoes", "👟"], ["col", "Colours", "🎨"], ["you", "You", "🧑"]];
  const FOCUS = { head: [1.3, 1.9], body: [0.98, 3.0], legs: [0.6, 3.1], feet: [0.35, 2.4], col: [1.0, 3.6], you: [0.85, 4.3], all: [0.82, 4.3] }; // camera height and distance for each tab
  const ST = window.STUDIO_STATE = { open: false, mode: "create", tab: "head", sort: "default", rar: "all", own: false, snap: null, own0: null, yaw: 0, vel: 0, drag: null, fy: 0.85, fd: 4.3, q: [], thumbs: {}, busy: false };
  const SNAPKEYS = ["g", "skin", "head", "top", "legs", "feet", "hcol", "hs", "shirt", "pants", "role", "course", "name", "money", "rent", "style", "cha"];
  const css = document.createElement("style"); css.textContent = `
  #studio{position:fixed;inset:0;z-index:95;display:flex;flex-direction:column;background:#0a0f1c;color:#fff;font-family:Figtree,system-ui,sans-serif;-webkit-user-select:none;user-select:none}
  #studio .st-stage{position:relative;flex:0 0 46%;overflow:hidden;background:linear-gradient(#cdd6de 0,#e6ebef 62%,#b9a98f 62%,#8b6f4e 100%)}
  #studio .st-wall{position:absolute;inset:0 0 38% 0;background:linear-gradient(90deg,#c4ced8,#e9edf1 55%,#d5dbe1)}
  #studio .st-blinds{position:absolute;left:0;top:0;width:34%;height:62%;background:repeating-linear-gradient(#e8edf2 0 7px,#a9b4bf 7px 9px);opacity:.85}
  #studio .st-floor{position:absolute;left:0;right:0;bottom:0;height:38%;background:repeating-linear-gradient(90deg,#8d7050 0 46px,#7d6244 46px 48px)}
  #studio .st-tv{position:absolute;right:6%;top:12%;width:24%;height:20%;background:linear-gradient(160deg,#1f7a8c,#f4a259);border:5px solid #f4f1e8;border-radius:3px;box-shadow:0 2px 10px #0004}
  #studio canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
  #studio .st-top{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 0;pointer-events:none}
  #studio .st-title{background:#0b1226cc;border-radius:14px;padding:7px 12px;font-weight:800;font-size:.98rem;letter-spacing:.02em}
  #studio .st-mini{pointer-events:auto;background:#0b1226cc;color:#fff;border:0;border-radius:12px;padding:8px 11px;font:700 .82rem Figtree,sans-serif}
  #studio .st-banner{position:absolute;left:0;bottom:12px;background:linear-gradient(90deg,#2a45a8,#2a45a8cc 80%,#2a45a800);padding:7px 26px 7px 12px;font-weight:800;font-size:.92rem;display:none}
  #studio .st-hint{position:absolute;right:10px;bottom:8px;font-size:.72rem;opacity:.75;background:#0b122699;border-radius:8px;padding:3px 8px}
  #studio .st-panel{flex:1;min-height:0;display:flex;flex-direction:column;background:linear-gradient(#18233d,#0e1528);border-radius:20px 20px 0 0;margin-top:-16px;position:relative;box-shadow:0 -8px 24px #0008}
  #studio .st-tabs{display:flex;gap:6px;padding:10px 10px 4px;overflow-x:auto;scrollbar-width:none}
  #studio .st-tabs button{flex:0 0 auto;border:0;border-radius:10px;padding:8px 13px;background:#27344f;color:#dfe6f3;font:800 .82rem Figtree,sans-serif}
  #studio .st-tabs button.on{background:#e8eefc;color:#16203a}
  #studio .st-filters{display:flex;gap:8px;padding:6px 10px;align-items:center}
  #studio .st-filters select,#studio .st-filters button{background:#27344f;color:#fff;border:0;border-radius:9px;padding:8px 10px;font:700 .78rem Figtree,sans-serif;flex:1;min-width:0}
  #studio .st-filters button.on{background:#e8eefc;color:#16203a}
  #studio .st-grid{flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:6px 10px 10px;align-content:start}
  #studio .st-card{position:relative;align-self:start;width:100%;height:0;padding:0 0 108% 0;border-radius:12px;background:linear-gradient(#32415f,#212c47);border:2px solid transparent;overflow:hidden;color:#fff;cursor:pointer}
  #studio .st-card.on{border-color:#fff;box-shadow:0 0 0 2px #4cd37b66}
  #studio .st-card.lock{opacity:.55}
  #studio .st-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  #studio .st-card .ld{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.6rem;opacity:.5}
  #studio .st-price{position:absolute;left:5px;bottom:5px;background:#000b;border-radius:6px;padding:2px 6px 2px 4px;font:800 .72rem Figtree,sans-serif}
  #studio .st-price b{background:#ffd23c;color:#222;border-radius:4px;padding:0 4px;margin-right:4px}
  #studio .st-gem{position:absolute;right:6px;bottom:6px;width:14px;height:14px;border-radius:4px;transform:rotate(45deg);box-shadow:0 0 6px currentColor}
  #studio .st-chk{position:absolute;right:5px;top:5px;width:20px;height:20px;border-radius:50%;background:#35c46a;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:900}
  #studio .st-name{position:absolute;left:0;right:0;top:0;padding:4px 6px;font:700 .66rem Figtree,sans-serif;background:linear-gradient(#000a,#0000);text-align:left}
  #studio .st-sw{border-radius:50%;padding:0 0 100% 0;border:3px solid #ffffff22}
  #studio .st-sec{grid-column:1/-1;font:800 .8rem Figtree,sans-serif;color:#9fb0d0;margin:6px 2px 0}
  #studio .st-you{grid-column:1/-1;display:flex;flex-direction:column;gap:8px}
  #studio .st-you input,#studio .st-you select{background:#27344f;color:#fff;border:2px solid #3a4a6b;border-radius:10px;padding:11px;font:700 1rem Figtree,sans-serif}
  #studio .st-you .row{display:flex;gap:8px;flex-wrap:wrap}
  #studio .st-you .opt{flex:1;border:2px solid #3a4a6b;background:#27344f;color:#fff;border-radius:10px;padding:10px 6px;font:800 .84rem Figtree,sans-serif}
  #studio .st-you .opt.on{border-color:#ffd23c;background:#3a3a24}
  #studio .st-you small{opacity:.75}
  #studio .st-err{color:#ff8d8d;font-weight:700;min-height:1.1em}
  #studio .st-foot{display:flex;gap:10px;padding:8px 10px calc(env(safe-area-inset-bottom,0px) + 12px);background:#0e1528}
  #studio .st-foot button{border:0;border-radius:12px;padding:14px;font:900 1rem Figtree,sans-serif}
  #studio .st-cancel{flex:0 0 28%;background:#3a4560;color:#e8eefc}
  #studio .st-ok{flex:1;background:linear-gradient(#ffe36a,#ffc21a);color:#1a1405}
  #studio .st-ok:disabled{filter:grayscale(.8);opacity:.6}
  `; document.head.append(css);

  // ---------------- the shared 3D parts: a big preview and a small snapshot maker
  let PV = null, TH = null;
  function mkRenderer(w, h) { const cvs = document.createElement("canvas"), r = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, alpha: true, preserveDrawingBuffer: true }); r.outputEncoding = THREE.sRGBEncoding; r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setSize(w, h, false); const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 1.0)); const dl = new THREE.DirectionalLight(0xfff1d6, 0.8); dl.position.set(2, 4, 5); sc.add(dl); const cam = new THREE.PerspectiveCamera(28, w / h, 0.1, 30); return { cvs, r, sc, cam }; }
  const lookNow = () => myLook();
  function buildPerson(P) { if (P.p) P.sc.remove(P.p.g); P.p = makePerson(P.L); P.sc.add(P.p.g); P.p.g.rotation.y = 0; }
  function setLook(P, L) { const key = JSON.stringify(L); if (P.key !== key) { P.key = key; P.L = L; buildPerson(P); } }
  function previewLoop() { if (!ST.open) { PV.loop = 0; return; } const t = performance.now(); if (PV.p && PV.p.wait && PV.p.wait.every((f) => CHARS[f].state !== "loading")) buildPerson(PV);
    ST.yaw += ST.vel; ST.vel *= 0.92; if (!ST.drag) ST.yaw += (Math.sin(t / 1800) * 0.35 - ST.yaw) * 0.0 + 0; PV.p.g.rotation.y = ST.yaw + (ST.drag ? 0 : Math.sin(t / 2200) * 0.12); if (PV.p.sync) PV.p.sync(false, false);
    ST.fy += (FOCUS[ST.tab] ? FOCUS[ST.tab][0] : 0.85 - ST.fy) * 0 + ((FOCUS[ST.tab] || FOCUS.all)[0] - ST.fy) * 0.1; ST.fd += ((FOCUS[ST.tab] || FOCUS.all)[1] - ST.fd) * 0.1; const asp = PV.cvs.clientWidth / Math.max(1, PV.cvs.clientHeight); PV.cam.aspect = asp; PV.cam.updateProjectionMatrix(); const off = asp < 0.9 ? 0 : -0.4; PV.cam.position.set(off * 0.3, ST.fy + 0.1, ST.fd); PV.cam.lookAt(off * 0.3, ST.fy, 0); PV.r.render(PV.sc, PV.cam); PV.loop = requestAnimationFrame(previewLoop); }
  const ZOOMS = { head: [1.34, 1.31, 0.95], body: [0.98, 0.92, 2.2], legs: [0.52, 0.45, 2.3], feet: [0.16, 0.12, 1.5] };
  function lookWith(slot, id) { const L = Object.assign({}, lookNow()); const f = SLOT_FIELD[slot]; L[f === "top" ? "top" : f] = id; if (slot === "head") L.hs = ""; return L; }
  function queueThumb(img, ld, slot, id) { const key = [s.g, slot, id, s.skin, s.hcol, slot === "body" ? s.shirt : ""].join("|"); if (ST.thumbs[key]) { img.src = ST.thumbs[key]; ld.remove(); return; } ST.q.push({ img, ld, slot, id, key }); setTimeout(pump, 60); /* after the card is in the page */ }
  async function pump() { if (ST.busy) return; ST.busy = true; try { while (ST.q.length && ST.open) { const j = ST.q.shift(); if (!j.img.isConnected) continue; try { if (!TH) { TH = mkRenderer(120, 120); } const L = lookWith(j.slot, j.id); TH.L = L; let p = makePerson(L); const t0 = performance.now(); while (p.wait && !p.wait.every((f) => CHARS[f].state !== "loading") && performance.now() - t0 < 7000) { await new Promise((z) => setTimeout(z, 120)); } if (p.wait) p = makePerson(L); if (TH.p) TH.sc.remove(TH.p.g); TH.p = p; TH.sc.add(p.g); p.g.rotation.y = 0.35; if (p.sync) p.sync(false, false); const z = ZOOMS[j.slot]; TH.cam.position.set(0, z[0], z[2]); TH.cam.lookAt(0, z[1], 0); TH.cam.fov = 28; TH.cam.updateProjectionMatrix(); TH.r.render(TH.sc, TH.cam); ST.thumbs[j.key] = TH.cvs.toDataURL("image/png"); j.img.src = ST.thumbs[j.key]; j.ld.remove(); } catch (e) { console.warn("studio thumbnail", e && e.message); } await new Promise((z) => setTimeout(z, 30)); } } finally { ST.busy = false; } }

  // ---------------- what is owned, what a change costs
  function snapshot() { const o = {}; for (const k of SNAPKEYS) o[k] = s[k]; return o; }
  function restore() { if (ST.snap) for (const k of SNAPKEYS) s[k] = ST.snap[k]; }
  function owned0(g, slot, id) { // owned before you opened the studio (so trying something on does not make it yours)
    const key = pieceKey(g, slot, id); if (OUTFITS[g][slot][0][0] === id || s.wardrobe[key] || ST.own0[key]) return true; if (slot === "head" && !HATS[g].includes(id) && (OUTFITS[g].head.find((q) => q[0] === id) || [])[2] === 0) return true; return false; }
  function worn() { return pieceSet(myLook()); }
  function pending() { const g = worn().g, P = worn(); let cost = 0; const items = []; for (const sl of SLOTS) { const q = OUTFITS[g][sl].find((x) => x[0] === P[sl]); if (q && !owned0(g, sl, q[0]) && !(ST.mode === "create" && q[2] <= CAP_CREATE)) { cost += q[2]; items.push([sl, q]); } } const hc = HCOLS.find((c) => c[1] === s.hcol); if (ST.mode === "wardrobe" && ST.snap && s.hcol !== ST.snap.hcol && hc) { cost += hc[2]; items.push(["hcol", [hc[1], hc[0], hc[2]]]); } return { cost, items }; }

  // ---------------- the panel
  const $s = (id) => document.getElementById(id);
  function card(q, slot, g) { const [id, name, price] = q, P = worn(), on = P[slot] === id, own = owned0(g, slot, id), free = ST.mode === "create" ? price <= CAP_CREATE : own, lock = ST.mode === "create" ? price > CAP_CREATE : false, rar = rarityOf(price); const b = el("button", "st-card" + (on ? " on" : "") + (lock ? " lock" : "")); b.type = "button"; b.dataset.id = id;
    const ld = el("div", "ld", { head: "💇", body: "👕", legs: "👖", feet: "👟" }[slot]), img = document.createElement("img"); img.alt = ""; img.style.opacity = "0"; img.onload = () => { img.style.opacity = "1"; }; b.append(ld, img, el("div", "st-name", name)); queueThumb(img, ld, slot, id);
    const tag = el("div", "st-price"); tag.innerHTML = lock ? "<b>🔒</b>" + (price ? "Rs " + price.toLocaleString("en") : "") : free ? "<b>✓</b>" + (own || price === 0 ? "Yours" : "Free pick") : "<b>Rs</b>" + price.toLocaleString("en"); b.append(tag); const gem = el("div", "st-gem"); gem.style.background = rar[2]; gem.style.color = rar[2]; b.append(gem); if (on) b.append(el("div", "st-chk", "✓"));
    b.onclick = () => { if (lock) { toast("🔒 " + name + " (Rs " + price.toLocaleString("en") + ") unlocks in the game: buy it in the Wardrobe."); return; } s[SLOT_FIELD[slot]] = id; if (slot === "head" && s.hs !== "bald") s.hs = ""; banner(name + (price ? " · Rs " + price.toLocaleString("en") : " · free"), rar[2]); renderPanel(true); }; return b; }
  function banner(text, col) { const b = $s("stBanner"); if (!b) return; b.textContent = text; b.style.display = "block"; b.style.borderLeft = "4px solid " + col; clearTimeout(banner.t); banner.t = setTimeout(() => { b.style.display = "none"; }, 2600); }
  function renderPanel(keepScroll) {
    const grid = $s("stGrid"), top = grid.scrollTop; grid.innerHTML = ""; ST.q.length = 0; const g = worn().g;
    for (const b of $s("stTabs").children) b.classList.toggle("on", b.dataset.k === ST.tab);
    $s("stFilters").style.display = ST.tab === "col" || ST.tab === "you" ? "none" : "flex";
    const own = $s("stOwn"); own.style.display = ST.mode === "wardrobe" ? "" : "none"; own.classList.toggle("on", ST.own);
    $s("stSex").textContent = ST.mode === "create" ? (s.g === "f" ? "♀ Woman" : "♂ Man") : (g === "f" ? "♀ Woman" : "♂ Man"); $s("stSex").disabled = false;
    if (OUTFITS[g][ST.tab]) { let list = OUTFITS[g][ST.tab].slice(); if (ST.tab === "head" && ST.mode === "create") list = list.filter((q) => !HATS[g].includes(q[0]) || q[2] <= CAP_CREATE); if (ST.rar !== "all") list = list.filter((q) => rarityOf(q[2])[0] === ST.rar); if (ST.own) list = list.filter((q) => owned0(g, ST.tab, q[0])); if (ST.sort === "price") list.sort((a, b) => a[2] - b[2]); else if (ST.sort === "rarity") list.sort((a, b) => RAR.findIndex((r) => r[0] === rarityOf(b[2])[0]) - RAR.findIndex((r) => r[0] === rarityOf(a[2])[0]));
      if (!list.length) grid.append(el("p", "st-sec", "Nothing here with that filter.")); for (const q of list) grid.append(card(q, ST.tab, g)); }
    else if (ST.tab === "col") {
      if (ST.mode === "create") { grid.append(el("div", "st-sec", "Skin tone")); for (const c of SKINS) { const b = el("button", "st-card st-sw" + (s.skin === c ? " on" : "")); b.type = "button"; b.style.background = c; b.setAttribute("aria-label", "Skin " + c); b.onclick = () => { s.skin = c; ST.thumbs = {}; renderPanel(true); }; grid.append(b); } }
      grid.append(el("div", "st-sec", "Hair colour")); for (const [name, col, price] of HCOLS) { const b = el("button", "st-card st-sw" + (s.hcol === col ? " on" : "")); b.type = "button"; b.style.background = col; b.setAttribute("aria-label", name); const tag = el("div", "st-price"); tag.innerHTML = ST.mode === "create" ? "<b>✓</b>Free" : (s.hcol === col ? "<b>✓</b>On" : "<b>Rs</b>" + price); b.append(tag); b.onclick = () => { s.hcol = col; ST.thumbs = {}; banner(name, "#fff"); renderPanel(true); }; grid.append(b); }
      const TOPS = [""].concat(SHIRTS, ["#ffffff", "#1f2a44", "#15171a", "#8a1f2d", "#2f7a5a", "#d8c9a0", "#7d8590", "#ff8fa3"]), BOTS = ["", "#1f2a44", "#15171a", "#d8c9a0", "#4a6a9a", "#ffffff", "#6b5a3a", "#2f7a5a", "#8a1f2d", "#7d8590"], dye = (title, key, list) => { grid.append(el("div", "st-sec", title + " (free)")); for (const c of list) { const b = el("button", "st-card st-sw" + ((s[key] || "") === c ? " on" : "")); b.type = "button"; if (c) b.style.background = c; else { b.style.background = "linear-gradient(135deg,#888,#ddd)"; b.textContent = "As made"; b.style.fontSize = ".7rem"; b.style.fontWeight = "800"; } b.onclick = () => { s[key] = c; ST.thumbs = {}; renderPanel(true); }; grid.append(b); } };
      grid.append(el("div", "st-sec", "Everyday looks (free, for everyone)")); for (const [nm, tp, bt] of [["Beach day", "#35c4bb", "#ffffff"], ["Smart", "#ffffff", "#1f2a44"], ["Night out", "#15171a", "#15171a"], ["Sporty", "#2f7a5a", "#7d8590"], ["Sunday best", "#d8c9a0", "#8a1f2d"], ["Tropical", "#ffa733", "#4a6a9a"], ["Pink and grey", "#ff8fa3", "#7d8590"], ["Classic", "", ""]]) { const b = el("button", "st-card"); b.type = "button"; b.textContent = nm; b.style.fontWeight = "800"; b.style.fontSize = ".75rem"; b.onclick = () => { s.shirt = tp; s.pants = bt; ST.thumbs = {}; renderPanel(true); }; grid.append(b); }
      dye("Top colour", "shirt", TOPS); dye("Trousers colour", "pants", BOTS);
    } else { // you: name, body, status
      const box = el("div", "st-you"); if (ST.mode === "create") { box.append(el("label", "", "Your name")); const inp = el("input"); inp.id = "stName"; inp.type = "text"; inp.maxLength = 14; inp.placeholder = "Your name"; inp.value = s.name && s.name !== "Alex" ? s.name : ""; inp.oninput = () => { $s("stErr").textContent = ""; }; box.append(inp, el("div", "st-err", "")); box.lastChild.id = "stErr";
        box.append(el("label", "", "Status")); const row = el("div", "row"); for (const k of Object.keys(ROLE)) { const b = el("button", "opt" + (s.role === k ? " on" : ""), ROLE[k].label); b.type = "button"; b.onclick = () => { s.role = k; s.top = s.legs = s.feet = ""; renderPanel(true); }; row.append(b); } box.append(row, el("small", "", ROLE[s.role].info));
        if (s.role === "student") { box.append(el("label", "", "Course")); const row2 = el("div", "row"); for (const k of Object.keys(COURSES)) { const b = el("button", "opt" + (s.course === k ? " on" : ""), COURSES[k].short); b.type = "button"; b.onclick = () => { s.course = k; renderPanel(true); }; row2.append(b); } box.append(row2); }
        if (accApi()) { const lb = el("button", "opt", "🔐 Already playing? Log in to your character"); lb.type = "button"; lb.onclick = () => { close(false); accountSheet("login"); }; box.append(lb); } }
      else { box.append(el("p", "", "You are " + (s.name || "you") + ". Pick the tabs above to try on hair, tops, bottoms and shoes. What you like is bought in one go.")); }
      grid.append(box); }
    if (keepScroll) grid.scrollTop = top; updateFoot(); pump();
  }
  function updateFoot() { const ok = $s("stOk"); if (!ok) return; if (ST.mode === "create") { ok.textContent = "Start living"; ok.disabled = false; return; } const p = pending(); if (!p.cost) { ok.textContent = p.items.length ? "Wear it" : "Done"; ok.disabled = false; return; } ok.textContent = "Buy for Rs " + p.cost.toLocaleString("en"); ok.disabled = s.money < p.cost; if (ok.disabled) ok.textContent = "Need Rs " + (p.cost - s.money).toLocaleString("en") + " more"; }

  // ---------------- open, finish, cancel
  function close(restoreLook) { if (restoreLook) restore(); ST.open = false; const r = $s("studio"); if (r) r.remove(); ST.q.length = 0; if (PV) { PV.loop = 0; } }
  function finishCreate() {
    const inp = $s("stName"), nm = cleanText(inp ? inp.value : s.name, 14), bad = nameProblem(nm); if (bad) { ST.tab = "you"; renderPanel(); const i2 = $s("stName"); if (i2) { i2.value = nm; i2.focus(); $s("stErr").textContent = bad; } return; }
    s.name = nm; s.nameV2 = 1; s.money = ROLE[s.role].money; s.rent = ROLE[s.role].weekly; if (s.role === "resident") s.cha = 3;
    { const P = pieceSet(myLook()); for (const k of SLOTS) s.wardrobe[pieceKey(P.g, k, P[k])] = 1; }
    s.made = true; s.seenVer = updNow(); s.joined = s.joined || Date.now(); s.day0 = day(); s.permit = day() + permDays(); save(); close(false); closeMenu();
    toast("Bonzour " + s.name + ". Your room is paid until Monday. Go find work, or a party.");
    const tut = () => { if (!s.tutDone) setTimeout(fdStart, 500); }; setTimeout(() => traitPicker(() => (needsLogin() ? accountSheet("create", tut) : tut())), 600);
  }
  function finishWardrobe() { const p = pending(); if (p.cost > s.money) { toast("You need Rs " + (p.cost - s.money).toLocaleString("en") + " more."); return; } const g = worn().g; for (const [sl, q] of p.items) { if (sl === "hcol") { txn("Studio: hair colour", -q[2]); s.money -= q[2]; s.style = (s.style || 0) + 1; continue; } s.wardrobe[pieceKey(g, sl, q[0])] = 1; s.money -= q[2]; s.style = (s.style || 0) + 1; txn("Studio: " + q[1], -q[2]); } const P = worn(); for (const k of SLOTS) s.wardrobe[pieceKey(P.g, k, P[k])] = 1; save(); close(false); toast(p.items.length ? "✨ New look! " + (p.cost ? "Paid Rs " + p.cost.toLocaleString("en") + "." : "") : "Looking good."); if (typeof phoneRender === "function") try { phoneRender(); } catch (e) {} }
  window.openStudio = function (mode) {
    if (typeof R === "undefined" || !R.ok || ST.open) return false; ST.open = true; ST.mode = mode || "wardrobe"; ST.tab = ST.mode === "create" ? "head" : "body"; ST.sort = "default"; ST.rar = "all"; ST.own = false; ST.snap = snapshot(); ST.own0 = {}; ST.thumbs = {}; ST.yaw = 0.2; ST.vel = 0; ST.fy = 0.85; ST.fd = 4.3;
    for (const sl of SLOTS) for (const q of OUTFITS[worn().g][sl]) { if (worn()[sl] === q[0]) ST.own0[pieceKey(worn().g, sl, q[0])] = true; } // what you wear when you arrive is yours
    closeMenu(); const sheet = $("sheet"); if (sheet) sheet.hidden = true;
    const root = el("div"); root.id = "studio"; root.innerHTML = '<div class="st-stage"><div class="st-wall"></div><div class="st-blinds"></div><div class="st-tv"></div><div class="st-floor"></div><canvas id="stCanvas"></canvas><div class="st-top"><div class="st-title"></div><button class="st-mini" id="stRand" type="button">🎲 Surprise me</button></div><div class="st-banner" id="stBanner"></div><div class="st-hint">Drag to turn</div></div>'
      + '<div class="st-panel"><div class="st-tabs" id="stTabs"></div><div class="st-filters" id="stFilters"><select id="stRar"></select><select id="stSort"><option value="default">Sort: Default</option><option value="price">Price: low to high</option><option value="rarity">Rarity: high to low</option></select><button type="button" id="stSex"></button><button type="button" id="stOwn">Owned</button></div><div class="st-grid" id="stGrid"></div><div class="st-foot"><button type="button" class="st-cancel" id="stCancel">Cancel</button><button type="button" class="st-ok" id="stOk"></button></div></div>';
    document.body.append(root); root.querySelector(".st-title").textContent = ST.mode === "create" ? "Who are you in Mauritius?" : "Character Studio"; if (ST.mode === "create") $s("stCancel").style.display = "none";
    for (const [k, n, ic] of TABS) { if (ST.mode === "wardrobe" && k === "you") continue; const b = el("button", k === ST.tab ? "on" : "", ic + " " + n); b.type = "button"; b.dataset.k = k; b.onclick = () => { ST.tab = k; renderPanel(); $s("stGrid").scrollTop = 0; }; $s("stTabs").append(b); }
    const rs0 = $s("stRar"); rs0.innerHTML = '<option value="all">By rarity: all</option>' + RAR.map((r) => '<option value="' + r[0] + '">' + r[1] + "</option>").join(""); rs0.onchange = () => { ST.rar = rs0.value; renderPanel(); }; $s("stSort").onchange = () => { ST.sort = $s("stSort").value; renderPanel(); };
    $s("stSex").onclick = () => { s.g = s.g === "f" ? "m" : "f"; if (ST.mode === "create") s.head = s.top = s.legs = s.feet = ""; else { const g = s.g, hs = OUTFITS[g].head.filter((q) => !HATS[g].includes(q[0])).sort((a, b) => a[2] - b[2]), k = ROLE_LOOK[g].resident; s.head = hs.length ? hs[0][0] : ""; s.top = k[0]; s.legs = k[1]; s.feet = k[2]; } ST.thumbs = {}; renderPanel(); }; $s("stOwn").onclick = () => { ST.own = !ST.own; renderPanel(); };
    $s("stRand").onclick = () => { const g = worn().g, pick = (sl) => { const l = OUTFITS[g][sl].filter((q) => ST.mode === "create" ? q[2] <= CAP_CREATE && !(sl === "head" && HATS[g].includes(q[0])) : owned0(g, sl, q[0])); return l.length ? l[Math.floor(Math.random() * l.length)][0] : null; }; for (const sl of SLOTS) { const v = pick(sl); if (v) s[SLOT_FIELD[sl]] = v; } s.hs = ""; if (ST.mode === "create") s.hcol = HCOLS[Math.floor(Math.random() * HCOLS.length)][1]; renderPanel(true); };
    $s("stCancel").onclick = () => close(true); $s("stOk").onclick = () => (ST.mode === "create" ? finishCreate() : finishWardrobe());
    // the 3D preview
    const cvs = $s("stCanvas"), st = root.querySelector(".st-stage"); if (!PV) PV = mkRenderer(300, 400); PV.cvs.remove(); const rr0 = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, alpha: true }); rr0.outputEncoding = THREE.sRGBEncoding; rr0.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); PV.r.dispose(); PV.cvs = cvs; PV.r = rr0; PV.p = null; PV.key = ""; const fit = () => { rr0.setSize(st.clientWidth, st.clientHeight, false); }; fit(); new ResizeObserver(fit).observe(st); setLook(PV, lookNow()); PV.key = "";
    cvs.addEventListener("pointerdown", (e) => { ST.drag = { x: e.clientX }; ST.vel = 0; cvs.setPointerCapture(e.pointerId); }); cvs.addEventListener("pointermove", (e) => { if (!ST.drag) return; const dx = e.clientX - ST.drag.x; ST.yaw += dx * 0.012; ST.vel = dx * 0.004; ST.drag.x = e.clientX; }); const up = () => { ST.drag = null; }; cvs.addEventListener("pointerup", up); cvs.addEventListener("pointercancel", up);
    // keep the preview up to date with what you pick
    let lastKey = ""; const sync = () => { if (!ST.open) return; const L = lookNow(), k = JSON.stringify(L); if (k !== lastKey) { lastKey = k; PV.L = L; PV.key = k; buildPerson(PV); } setTimeout(sync, 120); }; sync(); if (!PV.loop) PV.loop = requestAnimationFrame(previewLoop);
    renderPanel(); return true;
  };
  // the new screen replaces the old one when 3D works (the old one stays as the fallback)
  const oldCreate = window.openCreate; window.openCreate = function () { if (typeof R !== "undefined" && R.ok && window.THREE && !window.STUDIO_OFF) { if (window.openStudio("create")) return; } return oldCreate.apply(this, arguments); };
})();
