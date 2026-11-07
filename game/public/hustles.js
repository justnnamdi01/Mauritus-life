"use strict";
// Hustles, careers and notifications on the phone.
//  · ONE main job (your career: full pay, promotions). Other workplaces give odd jobs at about half pay, a few a day.
//  · SIDE HUSTLES, the small jobs people really do in Mauritius: selling gato piment, fishing off the quay, busking at the stage. The server times, charges and pays them;
//    here they are acted out in the street, with people around. Also: the Ferris wheel ride, taken in a real gondola.
//  · NOTIFICATIONS: ask once at a good moment, choose what you get, test it, switch it off.
// Loaded after the game page and the workplaces, so it can use the page's helpers (s, busy, path, personAt, evCard, guideTo, OBJ, ...).
(function () {
  const capA = (k) => window.claude && window.claude[k];
  const dayK = () => Math.floor((Date.now() + 4 * 3600000) / 86400000), mutHour = () => new Date(Date.now() + 4 * 3600000).getUTCHours();
  const HUX = window.HUX = { camLift: 0, run: null, pose: null, state: null };
  const PLR = () => regionDef("portlouis");
  const here = () => regionOfY(s.inside ? s.oy : s.y);

  // ======================================================= notifications
  const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
  const pushOk = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const b64 = (str) => { const pad = "=".repeat((4 - str.length % 4) % 4), raw = atob((str + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
  const reg = () => { if (!("serviceWorker" in navigator)) return Promise.resolve(null); return navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).catch(() => null); };
  if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  async function pushEnable() {
    const a = capA("push"); if (!a) return { ok: false, error: "Notifications are not available right now." };
    if (!pushOk()) return { ok: false, error: isIOS() && !standalone() ? "On iPhone, first add the game to your Home Screen (Share, then Add to Home Screen), open it from there and try again." : "This browser cannot show notifications." };
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission(); if (perm !== "granted") return { ok: false, error: "Notifications are blocked. You can allow them in your browser's site settings." };
    const r0 = await reg(); if (!r0) return { ok: false, error: "Could not start the notification service." };
    const st = await a.state().catch(() => null); if (!st || !st.ok || !st.key) return { ok: false, error: (st && st.error) || "The game server has notifications switched off." };
    let sub = await r0.pushManager.getSubscription(); if (!sub) sub = await r0.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(st.key) });
    return a.sub(sub.toJSON());
  }
  async function pushDisable() { const a = capA("push"), r0 = await reg(); if (r0) { const sub = await r0.pushManager.getSubscription(); if (sub) await sub.unsubscribe().catch(() => {}); } return a ? a.unsub(null, true) : null; }
  HUX.pushEnable = pushEnable;
  HUX.askPush = (why) => { // ask once, right after something good happened
    if (s.pushAsked && dayK() - s.pushAsked < 3) return; if (typeof Notification !== "undefined" && Notification.permission === "denied") return; s.pushAsked = dayK(); save();
    evCard({ icon: "🔔", tag: "STAY IN THE LOOP", title: "Want a heads-up?", text: (why || "Nice work.") + " We can send you a short message when the evening sega starts, your daily reward is waiting, or a friend joins. At most two a day, never at night, and you choose what you get.", opts: [{ label: "Yes, notify me", sub: "You can change it any time in Alerts", pri: true, go: async () => { const r = await pushEnable(); toast(r && r.ok ? "🔔 Notifications are on." : "🔔 " + ((r && r.error) || "Could not turn them on.")); } }, { label: "Not now", sub: "Ask me again in a few days", go: () => {} }] });
  };
  HUX.alerts = async function (box) { // the settings, at the bottom of the Alerts app
    const a = capA("push"); box.append(el("p", "psec", "Notifications")); const slot = el("div"); box.append(slot); if (!a) { slot.append(el("p", "pnote", "Notifications need the game server.")); return; }
    const draw = (st) => { slot.innerHTML = ""; if (!st || !st.ok) { slot.append(el("p", "pnote", (st && st.error) || "Could not load.")); return; }
      const granted = typeof Notification !== "undefined" && Notification.permission === "granted", on = st.devices > 0 && st.on && granted;
      slot.append(el("p", "pnote", on ? "On for this phone. You get at most " + st.max + " a day, never between 23:00 and 07:00, and none while you are playing." : "Off. Turn them on to hear about the evening sega, your daily reward and friends who join."));
      const main = el("button", "prow"), ml = el("span", "", on ? "🔕 Turn notifications off" : "🔔 Turn notifications on"); ml.append(el("small", "", on ? "Removes this phone" : isIOS() && !standalone() ? "On iPhone: add to Home Screen first" : "Asks your phone for permission")); main.type = "button"; main.append(ml, el("b", "", "›"));
      main.onclick = async () => { main.disabled = true; const r = on ? await pushDisable() : await pushEnable(); if (r && r.ok === false) toast("🔔 " + r.error); draw(await a.state().catch(() => null)); }; slot.append(main);
      if (on) { for (const k of Object.keys(st.kinds)) { const row = el("button", "prow"), l = el("span", "", (st.kinds[k].on ? "✅ " : "⬜ ") + st.kinds[k].label); row.type = "button"; row.append(l, el("b", "", st.kinds[k].on ? "On" : "Off")); row.onclick = async () => { const o = {}; o[k] = !st.kinds[k].on; draw(await a.prefs({ kinds: o }).catch(() => null)); }; slot.append(row); }
        const t = el("button", "prow"), tl = el("span", "", "📨 Send me a test"); tl.append(el("small", "", "Check it arrives")); t.type = "button"; t.append(tl, el("b", "", "›")); t.onclick = async () => { const r = await a.test().catch(() => null); toast(r && r.ok ? "📨 Sent: look at your notifications." : "📨 " + ((r && r.error) || "Could not send.")); }; slot.append(t); } };
    draw(await a.state().catch(() => null));
  };

  // ======================================================= one main job, and odd jobs for everything else
  const ODD_MAX = 3, ODD_CUT = 0.55, CHANGE_MS = 3 * 86400000;
  const _shift = window.shift;
  const oddUsed = () => (s.odd && s.odd.d === dayK() ? s.odd.n : 0);
  function oddRun(id) { const j = JOBS[id]; return function () { const lv = level(id), m = mood(), f = m > 65 ? 1.15 : m < 35 ? 0.8 : 1; const pay = Math.round(j.pay[lv] * ODD_CUT * f * (s.grad ? 1.2 : 1) * (1 + Math.min(s.cha + s.style, 30) * 0.01)); s.money += pay; txn(j.name + " odd job", pay); s.odd = { d: dayK(), n: oddUsed() + 1 }; return "Odd job done: " + rs(pay) + ". It does not count towards a promotion. (" + (ODD_MAX - oddUsed()) + " left today)"; }; }
  function oddAct(id, a) { const j = JOBS[id], task = (a.label || "").replace(/^Work a shift: /, ""); a.label = "Odd job: " + task; a.info = "4 hours · about " + rs(Math.round(j.pay[level(id)] * ODD_CUT)) + " · not your career"; a.run = oddRun(id); if (!a.why && oddUsed() >= ODD_MAX) a.why = "Enough odd jobs today (" + ODD_MAX + ")"; return a; }
  window.shift = function (id) {
    const a = _shift(id), j = JOBS[id]; if (!a || !j) return a; const main = s.main && s.main.id;
    if (!main) { a.info = "Choose this as your career · " + a.info; a.go = () => careerOffer(id); return a; }
    if (main === id) { a.label = a.label + " ⭐"; return a; }
    return oddAct(id, a);
  };
  function careerOffer(id) {
    const j = JOBS[id]; evCard({ icon: "📝", tag: "CHOOSE YOUR CAREER", title: "Make " + j.name + " your career?", text: "You have ONE main job at a time. Your career pays full wages and you are promoted every 4 good shifts. Other workplaces still give odd jobs at about half pay, " + ODD_MAX + " a day. You can change career after 3 days.",
      opts: [{ label: "Yes, this is my career", sub: "Full pay · promotions", pri: true, go: () => { s.main = { id, since: Date.now() }; save(); toast("📝 Your career: " + j.name + "."); startAction(window.shift(id)); } }, { label: "Just a day's work", sub: "An odd job at half pay", go: () => { startAction(oddAct(id, _shift(id))); } }] });
  }
  HUX.changeCareer = () => { if (!s.main) return; const wait = s.main.since + CHANGE_MS - Date.now(); if (wait > 0) { toast("You can change career in " + Math.ceil(wait / 3600000) + " hours."); return; } s.main = null; save(); toast("📝 You are free to choose a new career."); phoneRender && phoneRender(); };

  // ======================================================= the Hustles app
  const fmtHour = (h) => String(h).padStart(2, "0") + ":00";
  const SITE = {
    gato: () => { const o = OBJ.find((q) => /Victoria Urban Terminal/.test(q.name || "")) || { x: 59.5, y: PLR().y0 + 73.5 }; return { x: o.x, y: o.y, label: "Victoria Urban Terminal" }; },
    fish: () => { const q = quay(); return { x: q.x, y: q.y, label: "the Caudan quay" }; },
    busk: () => { const st = stageProp(); return { x: st.x, y: PLR().y0 + st.y + 4, label: "the waterfront stage" }; }
  };
  const stageProp = () => (PLM.props || []).find((o) => o.k === "stage") || { x: 56.5, y: 16 };
  HUX.app = async function (box, link) {
    appHero(box, "🧺", "Work and hustles", s.main ? "Career: " + (JOBS[s.main.id] || {}).name : "Choose your career", "One main job. Side hustles for extra.");
    // the career
    box.append(el("p", "psec", "Your career"));
    if (s.main && JOBS[s.main.id]) { const j = JOBS[s.main.id], lv = level(s.main.id), card = el("div", "jobcard"); card.append(el("small", "jlabel", "MAIN JOB ⭐")); const top = el("div", "jtop"); top.append(el("b", "", j.titles[lv])); card.append(top, el("span", "jsub", j.name + " · about " + rs(j.pay[lv]) + " a shift"));
      const prog = (s.jobs[s.main.id] || 0) % 4, bar = el("div", "jbar"), fill = el("i"); fill.style.width = (lv >= 2 ? 100 : prog * 25) + "%"; bar.append(fill); card.append(bar, el("span", "jnote", lv >= 2 ? "Top of the ladder." : prog + "/4 good shifts to " + j.titles[lv + 1]));
      const odd = el("span", "jnote", "Odd jobs elsewhere: " + (ODD_MAX - oddUsed()) + " left today (about half pay)."); card.append(odd); const ch = el("button", "jquit"); ch.type = "button"; const w = s.main.since + CHANGE_MS - Date.now(); ch.textContent = w > 0 ? "Change career in " + Math.ceil(w / 3600000) + " h" : "Change career"; ch.disabled = w > 0; ch.onclick = HUX.changeCareer; card.append(ch); box.append(card); }
    else box.append(el("p", "pnote", "You have no main job yet. Walk into a bank, restaurant, bakery, bar, shop, market or the bus terminal and choose Work a shift: you will be asked if it is your career."));
    // side hustles
    box.append(el("p", "psec", "Side hustles")); const slot = el("div"); box.append(slot); const a = capA("hustle"); let st = null; try { st = a ? await a.state() : null; } catch (e) {}
    if (!st || !st.ok) slot.append(el("p", "pnote", "Side hustles need the game server.")); else {
      slot.append(el("p", "pnote", "Made today: " + rs(st.earned) + " of " + rs(st.dayCap) + "."));
      for (const id of Object.keys(st.defs)) { const d = st.defs[id], where = SITE[id](), r = el("button", "prow"), l = el("span", "", d.icon + " " + d.name); const status = !d.open ? "Opens " + fmtHour(d.from) : d.runs >= d.cap ? "Done for today" : d.wait > 0 ? "Ready in " + d.wait + " s" : "Ready"; l.append(el("small", "", d.blurb + " · " + (d.cost ? "stake " + rs(d.cost) : "free") + " · " + (d.cap - d.runs) + " left today · " + status)); r.type = "button"; r.append(l, el("b", "", "Go ▸"));
        r.onclick = () => { closePhone(); if (here() !== "portlouis") { toast("🧺 This one is in Port Louis."); return; } if (Math.hypot(s.x - where.x, s.y - where.y) < 12 && d.open) start(id); else guideTo(where.x, where.y, where.label); }; slot.append(r); } }
    // the places in the tour
    box.append(el("p", "psec", "Today in Port Louis"));
    const h = mutHour(), tour = [["🏠", "Your flat", "Daily reward and your home", () => { closePhone(); const d = myDoor(); if (d) guideTo(d.x, d.y, "your flat"); }], ["🚌", "Victoria Urban Terminal", "Jobs, buses, the courier dash, gato piment rounds", () => { closePhone(); guideTo(54.5, PLR().y0 + 69.5, "the terminal"); }], ["🎡", "Ferris wheel", h >= 10 && h < 23 ? "Open now · Rs 120 · the best view of the bay" : "Opens 10:00", () => { closePhone(); const o = OBJ.find((q) => /Ferris/.test(q.name || "")); if (o) guideTo(o.x, o.y, "the Ferris wheel"); }], ["🎤", "Waterfront stage", h >= 17 && h < 23 ? "LIVE NOW · watch, dance or busk for tips" : "Sega every evening at 17:00 (in " + (h < 17 ? 17 - h : 24 - h + 17) + " h)", () => { closePhone(); const o = SITE.busk(); guideTo(o.x, o.y, "the stage"); }], ["🎣", "The Caudan quay", "Cast a line from the quay at the water's edge", () => { closePhone(); const o = SITE.fish(); guideTo(o.x, o.y, "the quay"); }]];
    for (const [icon, name, sub, fn] of tour) { const r = el("button", "prow"), l = el("span", "", icon + " " + name); l.append(el("small", "", sub)); r.type = "button"; r.append(l, el("b", "", "›")); r.onclick = fn; box.append(r); }
  };

  // ======================================================= acting a hustle out in the street
  const quay = () => { const st = stageProp(), r0 = PLR().y0; let best = null, bd = 1e9; for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) { const x = Math.floor(st.x) + dx, y = r0 + Math.floor(st.y) + dy; if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) continue; const t = terr[y * W + x]; if (t >= 2 && !solid[y * W + x] && terr[y * W + x - 2] <= 1 && terr[y * W + x - 1] <= 1) { const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = { x: x + 0.7, y: y + 0.5 }; } } } return best || { x: st.x - 6, y: r0 + st.y }; };
  const looks = (n, seed) => { const o = []; for (let i = 0; i < n; i++) o.push(ambLook(seed + i * 3, "portlouis")); return o; };
  const OLD = { g: "m", skin: SKINS[3], hair: "#d8d8d8", shirt: "#2a6fb0", pants: "#4a3a2a", role: "resident", hs: "short", cap: "#e8e2d2" };
  const SCENES = {
    gato() {
      const names = [[/Victoria Urban Terminal/, "the terminal"], [/Place d'Armes/, "Place d'Armes"], [/Caudan Waterfront/, "the Caudan"], [/Casino/, "the casino"]], r0 = PLR().y0, stops = [];
      for (const [re] of names) { const o = OBJ.find((q) => re.test(q.name || "")); if (o) stops.push({ x: o.x, y: o.y + 1.1 }); }
      if (stops.length < 3) stops.push({ x: 54.5, y: r0 + 69.5 }, { x: 59.5, y: r0 + 64.5 }, { x: 49.5, y: r0 + 46 });
      const lk = looks(stops.length, 11), says = ["Un gato piment, SVP!", "Combien le sac?", "Donne-moi deux!", "Ça sent bon, ça!"], steps = stops.map((p, i) => ({ go: [p.x - 1.0, p.y], wait: 3.2, pose: "serve", prop: "gato", face: 3, say: i === 0 ? "Gato piment! Cho cho!" : "Gato piment chaud!" }));
      steps.push({ go: [stops[0].x - 1, stops[0].y], wait: 1.5, pose: "stand", prop: "gato", face: 0, say: "Sold out! Mersi!" });
      return { steps, walkPose: { k: "carry", prop: "gato" }, buyers: stops.map((p, i) => ({ x: p.x + 0.4, y: p.y, look: lk[i], say: says[i % 4], left: 0 })), draw(now, R0) { this.buyers.forEach((c, i) => { if (R0.i < i - 0 && R0.i >= 0 && Math.hypot(c.x - s.x, c.y - s.y) > 30) return; let x = c.x, y = c.y, face = 2, moving = false, bubble = ""; if (R0.i === i && R0.mode === "do") bubble = c.say; if (R0.i > i || (R0.i === i && R0.mode === "do" && R0.t > 1.8)) { c.left = Math.min(8, c.left + 0.016 * 1.4); x = c.x + c.left; moving = c.left < 8; face = 3; if (c.left >= 8) return; } if (R0.i >= 0 || R0.i === -1) personAt("hu_b" + i, c.look, x, y, face, moving, { name: "", bubble, prop: R0.i > i ? "plate" : "" }); }); } };
    },
    fish() {
      const q = quay(), lk = OLD, steps = [{ go: [q.x, q.y], wait: 4, pose: "fish", prop: "rod", face: 2, say: "Casting…" }, { wait: 26, pose: "fish", prop: "rod", face: 2 }, { wait: 6, pose: "fish", alt: 1, prop: "rod", face: 2, say: "Ça mord!" }, { wait: 5, pose: "stand", prop: "rod", face: 2 }];
      const sc = { steps, walkPose: { k: "stand", prop: "rod" }, q, bob: null, line: null, init() { const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe4572e })); const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); top.position.y = 0.1; b.add(top); b.position.set(q.x - 3.2, 0.05, q.y); b.visible = false; R.world.add(b); this.bob = b; const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff })); this.line.frustumCulled = false; this.line.visible = false; R.world.add(this.line); }, done() { for (const m of [this.bob, this.line]) if (m) { R.world.remove(m); } this.bob = this.line = null; },
        draw(now, R0) { personAt("hu_jean", lk, q.x, q.y + 1.6, 2, false, { name: "Oncle Jean", pose: { k: "fish", x: q.x, y: q.y + 1.6, h: 0, face: 2, prop: "rod" }, bubble: ((now / 9000) | 0) % 2 && ((now / 1000) % 9) < 4 ? "Patience, mo zenfan." : ((now / 1000) % 9) < 4 ? "In my day the fish were bigger." : "" });
          if (this.bob) { const casting = R0.i >= 0 && R0.mode === "do" && R0.i >= 0 && R0.i <= 3 && (R0.i > 0 || R0.t > 1.2); this.bob.visible = this.line.visible = casting; if (casting) { const bite = R0.i === 1 && R0.t > 19 || R0.i === 2, dip = bite ? Math.abs(Math.sin(now / 90)) * 0.2 : Math.sin(now / 700) * 0.04; this.bob.position.set(q.x - 3.2 + (R0.i === 2 ? 0.35 * Math.min(1, R0.t / 5) * 0 : 0), 0.02 - dip, q.y); const p = this.line.geometry.attributes.position; p.setXYZ(0, q.x - 0.9, 2.1, q.y - 0.05); p.setXYZ(1, this.bob.position.x, this.bob.position.y + 0.1, this.bob.position.z); p.needsUpdate = true; } } } };
      return sc;
    },
    busk() {
      const st = stageProp(), r0 = PLR().y0, X0 = st.x, Y0 = r0 + st.y + 0.3, lk = looks(9, 41), crowd = lk.map((l, i) => ({ look: l, x: X0 - 4.4 + (i % 5) * 2.2 + (i > 4 ? 1.1 : 0), y: r0 + st.y + 3.4 + Math.floor(i / 5) * 1.4, at: 3 + i * 3.2 }));
      return { steps: [{ go: [X0, Y0], wait: 41, pose: "sing", face: 0, lift: 0.52, say: "Zot pare pou séga?" }, { wait: 2.5, pose: "stand", face: 0, lift: 0.52, say: "Mersi, Port Louis!" }], walkPose: { k: "stand" }, crowd, draw(now, R0) { const t = R0.i < 0 ? 0 : (R0.i === 0 ? R0.t : 45); crowd.forEach((c, i) => { if (R0.i >= 0 && t + (R0.i >= 1 ? 0 : 0) < c.at) return; personAt("hu_c" + i, c.look, c.x, c.y, 1, false, { name: "", dance: ["afro", "afro", "afro"][i % 3] }); }); } };
    }
  };
  const PANEL = { el: null };
  function panel(text, onCancel) { if (!PANEL.el) { PANEL.el = document.createElement("div"); PANEL.el.id = "storyCap"; document.body.append(PANEL.el); } PANEL.el.innerHTML = ""; const d = document.createElement("div"), sm = document.createElement("small"); sm.textContent = "SIDE HUSTLE"; d.append(sm, document.createTextNode(text)); const bar = document.createElement("div"); bar.style.cssText = "height:5px;border-radius:3px;background:#ffffff33;margin-top:6px;overflow:hidden"; const f = document.createElement("i"); f.style.cssText = "display:block;height:100%;width:0;background:#ffc53d"; bar.append(f); d.append(bar); PANEL.fill = f; PANEL.el.append(d); const b = document.createElement("button"); b.textContent = "Cancel"; b.onclick = onCancel; PANEL.el.append(b); }
  const panelOff = () => { if (PANEL.el) { PANEL.el.remove(); PANEL.el = null; } };
  async function start(id) {
    if (HUX.run || busy || ride || (window.WKX && WKX.at)) { toast("Finish what you are doing first."); return; } if (here() !== "portlouis") { toast("🧺 Hustles are in Port Louis."); return; }
    const a = capA("hustle"); if (!a) { toast("Side hustles need the game server."); return; } const r = await a.start(id).catch(() => null); if (!r || !r.ok) { toast("🧺 " + ((r && r.error) || "Could not start.")); return; }
    const D = (HUX.defs && HUX.defs[id]) || {}; if (r.paid && !r.again) { s.money -= r.paid; txn("Side hustle stake", -r.paid); save(); }
    if (s.inside) leaveBuilding(); path = []; const sc = SCENES[id](); if (sc.init) sc.init();
    HUX.run = { id, secs: r.secs, t0: performance.now(), i: -1, mode: "", t: 0, sc, steps: sc.steps, until: 0, done: false }; HUX.scene = sc;
    const names = { gato: "🧺 Selling gato piment round Port Louis", fish: "🎣 Fishing off the quay", busk: "🎤 Singing for the evening crowd" }; panel(names[id] || "Hustling", () => cancel(true)); nextStep();
  }
  function cancel(msg) { const R0 = HUX.run; if (!R0) return; if (R0.sc && R0.sc.done) R0.sc.done(); HUX.run = null; HUX.pose = null; HUX.scene = null; HUX.camLift = 0; panelOff(); path = []; if (msg) toast("✋ You stopped. The stake is lost."); }
  function nextStep() {
    const R0 = HUX.run; if (!R0) return; R0.i++; const st = R0.steps[R0.i]; if (!st) { finishRun(); return; } R0.t = 0;
    if (st.go) { const route = findPath(s.x, s.y, st.go[0], st.go[1]); if (route && route.length) { path = route; R0.mode = "walk"; R0.walkT0 = performance.now(); HUX.pose = R0.sc.walkPose ? { k: R0.sc.walkPose.k, prop: R0.sc.walkPose.prop, h: 0 } : null; return; } s.x = st.go[0]; s.y = st.go[1]; }
    arrive(st);
  }
  function arrive(st) { const R0 = HUX.run; R0.mode = "do"; R0.until = performance.now() + st.wait * 1000; R0.stT0 = performance.now(); s.face = st.face == null ? s.face : st.face; HUX.pose = { k: st.pose || "stand", x: s.x, y: s.y, h: st.h || 0, face: s.face, prop: st.prop || "", alt: st.alt, lift: st.lift || 0 }; if (st.say) { myBubble.text = st.say; myBubble.until = performance.now() + 3200; } }
  async function finishRun() {
    const R0 = HUX.run; if (!R0 || R0.done) return; R0.done = true; const id = R0.id, a = capA("hustle"); HUX.pose = { k: "stand", x: s.x, y: s.y, h: 0, face: s.face, prop: R0.sc.walkPose ? R0.sc.walkPose.prop : "", lift: HUX.pose && HUX.pose.lift || 0 };
    const left = R0.secs * 1000 * 0.9 - (performance.now() - R0.t0); if (left > 0) await new Promise((z) => setTimeout(z, left));
    let r = await a.finish(id).catch(() => null); if (r && !r.ok && /not finished/.test(r.error || "")) { await new Promise((z) => setTimeout(z, 2500)); r = await a.finish(id).catch(() => null); }
    if (R0.sc.done) R0.sc.done(); HUX.run = null; HUX.pose = null; HUX.scene = null; panelOff();
    if (!r || !r.ok) { toast("🧺 " + ((r && r.error) || "The round was not counted.")); return; }
    const msg = id === "fish" ? (r.icon || "🐟") + " You caught " + (/^an /.test(r.fish) ? r.fish : "a " + r.fish) + "! Sold for " + rs(r.payout) + "." : id === "busk" ? "🎤 The crowd tipped " + rs(r.payout) + "." : "🧺 Sold out! You made " + rs(r.payout) + " (about " + rs(Math.max(0, r.profit)) + " profit).";
    toast(msg); s.fun = clamp(s.fun + 8); save(); if (id === "fish" && r.icon) floatIcon(r.icon);
    if (!s.pushAsked && !(typeof Notification !== "undefined" && Notification.permission === "denied")) setTimeout(() => HUX.askPush("Good round."), 1800);
  }
  function floatIcon(ch) { try { const sp = sprite(emojiTex(ch), 1.1); sp.position.set(s.x, 2.4, s.y); R.world.add(sp); const t0 = performance.now(); const iv = setInterval(() => { const k = (performance.now() - t0) / 3000; sp.position.y = 2.4 + k * 1.2; if (k >= 1) { clearInterval(iv); R.world.remove(sp); } }, 40); } catch (e) {} }
  HUX.start = start;
  setInterval(() => { try { const R0 = HUX.run; if (!R0 || R0.done) return; const now = performance.now(); if (panelFill()) PANEL.fill.style.width = Math.min(100, (now - R0.t0) / (R0.secs * 10)) + "%";
    if (R0.mode === "walk") { keys = {}; const st = R0.steps[R0.i]; const far = Math.hypot(s.x - st.go[0], s.y - st.go[1]); if (!path.length || far < 0.7 || now - R0.walkT0 > 45000) { path = []; if (far > 1.5) { s.x = st.go[0]; s.y = st.go[1]; } arrive(st); } return; }
    if (R0.mode === "do") { R0.t = (now - R0.stT0) / 1000; if (path.length || Object.values(keys).some(Boolean)) { cancel(true); return; } if (now >= R0.until) nextStep(); } } catch (e) { console.warn("hustle", e); } }, 100);
  const panelFill = () => !!(PANEL.el && PANEL.fill);
  HUX.drawOut = function (now) { const R0 = HUX.run; if (R0 && HUX.scene && HUX.scene.draw && !s.inside) HUX.scene.draw(now, R0); };

  // ======================================================= the Ferris wheel, ridden in a real gondola
  HUX.ferris = function (friend) {
    if (HUX.run || busy || ride || typeof R === "undefined" || !R.ferris) { toast("The wheel is not ready."); return; } const h = mutHour(); if (h < 10 || h >= 23) { toast("🎡 The wheel runs 10:00 to 23:00."); return; }
    const cost = friend ? 200 : 120; if (s.money < cost) { toast("You need " + rs(cost) + "."); return; } const f = (PLM.props || []).find((o) => o.k === "ferris"); if (!f) return; const fx = f.x, fz = PLR().y0 + f.y, exit = { x: fx, y: fz + 3.4 };
    const act = A("Ride the Ferris wheel", "", 15, cost, friend ? { fun: 36, social: 18 } : { fun: 30, social: 6 }, { msg: friend ? "Two seats, one view, no phone signal for a minute." : "At the top the whole bay opens up: the harbour, the mountains, the lights of the Caudan. You wave at a ship." });
    const go = () => { // walk to the loading point, then climb in and ride
      const t0 = performance.now(), DUR = 26000, base = FER.ang; FER.boost = 3.2; let gi = 0, best = 9; const gs = R.ferris.children.filter((c) => c.userData && c.userData.an !== undefined); gs.forEach((g, i) => { const a = Math.atan2(Math.sin(g.userData.an + FER.ang), Math.cos(g.userData.an + FER.ang)), d = Math.abs(a + Math.PI / 2); if (d < best) { best = d; gi = i; } }); const gon = gs[gi]; if (!gon) { FER.boost = 1; return; }
      s.inside && leaveBuilding(); path = []; busy = { a: act, left: act.min, total: act.min, rate: 0, pose: { k: "sit", x: exit.x, y: exit.y, h: 0.5, face: 1, lift: 0 }, from: [exit.x, exit.y] };
      FER.ride = { gon, t0, DUR }; const iv = setInterval(() => { try { const k = (performance.now() - t0) / DUR, a = gon.userData.an + FER.ang, gx = fx + Math.cos(a) * 5.2, gy = 7 + Math.sin(a) * 5.2; if (k >= 1 || !busy || busy.a !== act) { clearInterval(iv); FER.boost = 1; FER.ride = null; HUX.camLift = 0; const was = busy && busy.a === act; busy = null; s.x = exit.x; s.y = exit.y; s.face = 0; if (was) finish(act); return; } s.x = gx; s.y = fz; s.face = 1; busy.pose = { k: "sit", x: gx, y: fz, h: gy - 0.55 + 0.5, face: 1, lift: 0 }; HUX.camLift = Math.max(0, gy - 1.6) * 0.8; } catch (e) { clearInterval(iv); FER.boost = 1; busy = null; HUX.camLift = 0; } }, 40);
    };
    const route = findPath(s.x, s.y, exit.x, exit.y); if (s.inside || !route || !route.length || Math.hypot(s.x - exit.x, s.y - exit.y) < 1) { go(); return; } path = route; toast("🚶 Walking to the wheel…"); const t1 = performance.now(), iv0 = setInterval(() => { if (busy || performance.now() - t1 > 25000) { clearInterval(iv0); return; } if (!path.length || Math.hypot(s.x - exit.x, s.y - exit.y) < 0.8) { clearInterval(iv0); go(); } }, 200);
  };
})();
