"use strict";
// ISLAND STANDING: the client side of the player level (the server in game/levels.js owns every XP point and every level).
//  · A level chip on the clock card that fills as you play, and a "+12 XP" float for every point.
//  · A level-up moment (paper falls, a card with your new title and gift).
//  · The Standing app on the phone: your level, what to do for XP today, what opens at which level.
// Loaded after the game page and the flat script.
(function () {
  const capA = (k) => window.claude && window.claude[k];
  const LVX = window.LVX = { st: null, loaded: 0, seen: 0, queue: [], places: {} };
  const TITLES = [[1, "Newcomer"], [3, "Local"], [6, "Regular"], [10, "Lakaz Owner"], [15, "Well Known"], [20, "Boss"], [30, "Big Name"], [40, "Island Star"], [50, "Legend"]];
  const rsf = (n) => "Rs " + Math.round(n).toLocaleString("en");

  // ---------------------------------------------------------------- the chip on the clock card
  const css = document.createElement("style");
  css.textContent = ".lvchip{display:flex;align-items:center;gap:6px;margin-top:4px;padding:0;background:none;border:0;color:#fff;font:700 .72rem system-ui,sans-serif;cursor:pointer;width:100%}.lvchip em{font-style:normal;background:#2a9d8f;border-radius:8px;padding:1px 6px;white-space:nowrap}.lvchip u{text-decoration:none;opacity:.85;white-space:nowrap}.lvchip span{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden;min-width:44px}.lvchip span i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffd166,#ff9f1c);transition:width .6s}.lvtabs{display:flex;gap:6px;margin:8px 0;flex-wrap:wrap}.lvtabs button{border:0;border-radius:14px;padding:6px 11px;font:700 .78rem system-ui,sans-serif;background:rgba(255,255,255,.1);color:inherit;cursor:pointer}.lvtabs button.on{background:#2a9d8f;color:#fff}.lvrow{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:12px;padding:9px 11px;margin:4px 0;background:rgba(255,255,255,.07);color:inherit;text-align:left;cursor:pointer;font:inherit}.lvrow.you{background:rgba(42,157,143,.35)}.lvrow b.rk{min-width:28px;text-align:center;font-size:1rem}.lvrow span{flex:1;display:flex;flex-direction:column}.lvrow small{opacity:.75}.xpfloat{position:fixed;left:18px;top:86px;z-index:60;color:#ffd166;font:800 .95rem system-ui,sans-serif;text-shadow:0 1px 3px #000a;pointer-events:none;animation:xpup 1.6s ease-out forwards}@keyframes xpup{from{opacity:0;transform:translateY(8px)}15%{opacity:1}to{opacity:0;transform:translateY(-34px)}}";
  document.head.append(css);
  function chip() { let b = document.getElementById("lvChip"); if (b) return b; const clk = document.querySelector(".hud.clock"); if (!clk) return null; b = document.createElement("button"); b.id = "lvChip"; b.type = "button"; b.className = "lvchip"; b.setAttribute("aria-label", "Your level"); b.innerHTML = "<em>Lv 1</em><span><i></i></span><u>🎯 0/3</u>"; b.onclick = () => { try { openPhone("standing"); } catch (e) {} }; clk.append(b); return b; }
  function paint() { const b = chip(), r = LVX.st; if (!b) return; b.hidden = !r || !(typeof s !== "undefined" && s.made); if (!r) return; b.firstChild.textContent = "Lv " + r.level; b.querySelector("i").style.width = (r.need ? Math.min(100, r.into / r.need * 100) : 100) + "%"; const gd = (r.goals || []).filter((g) => g.done).length; b.querySelector("u").textContent = "🎯 " + gd + "/" + (r.goals || []).length; b.title = r.title + " · " + r.into + "/" + r.need + " XP"; }
  function float(text) { try { const d = document.createElement("div"); d.className = "xpfloat"; d.textContent = text; document.body.append(d); setTimeout(() => d.remove(), 1700); } catch (e) {} }

  // ---------------------------------------------------------------- state
  async function load() { const a = capA("lvl"); if (!a) return null; let r = null; try { r = await a.state(); } catch (e) {} if (!r || !r.ok) return null; LVX.st = r; LVX.loaded = Date.now(); paint(); return r; }
  LVX.load = load;
  function absorb(m) { // an answer or a push from the server that carries the new numbers
    if (!m) return; const v = m.view || m; if (v && v.level !== undefined && v.xp !== undefined) { LVX.st = v; LVX.loaded = Date.now(); paint(); }
    (m.goalsDone || []).forEach((g, i) => setTimeout(() => { float("✅ " + g.text), toast("✅ Goal done: " + g.text + ". +" + g.xp + " XP and Rs " + g.cash + " in your mail."); }, 400 + i * 900));
    if (m.allDone) setTimeout(() => { try { confetti(80); } catch (e) {} toast("🌟 Your day is complete! Bonus +" + m.allDone.xp + " XP and Rs " + m.allDone.cash + (m.allDone.streak > 1 ? " · " + m.allDone.streak + " days in a row" : "") + "."); }, 1800);
    if (m.gained > 0) float("+" + m.gained + " XP" + (m.first ? " · first time!" : "")); if (m.up && m.up.length) m.up.forEach((u) => LVX.queue.push(u)); if (LVX.queue.length) setTimeout(next, 900);
  }
  window.addEventListener("fef-lvl", (e) => absorb(e.detail));
  LVX.gain = async function (kind, key) { const a = capA("lvl"); if (!a || typeof s === "undefined" || !s.made) return; try { absorb(await a.gain(kind, key)); } catch (e) {} };


  // ---------------------------------------------------------------- fireworks over your head when you level up
  LVX.fireworks = function () {
    try {
      if (typeof THREE === "undefined" || typeof R === "undefined" || !R.scene || (matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
      const room = s.inside && R.rooms && R.rooms[s.inside], parent = room || R.scene, ind = !!room, cols = [0xffd166, 0xff6b6b, 0x4ecdc4, 0xa78bfa, 0x7bd88f], N = 64, list = [], t0 = performance.now();
      for (let b = 0; b < 4; b++) setTimeout(() => {
        const g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), vel = [], ox = (Math.random() - 0.5) * (ind ? 2.4 : 6), oy = (ind ? 2.8 : 6) + Math.random() * (ind ? 0.6 : 2), oz = (Math.random() - 0.5) * (ind ? 1.6 : 4), sp = ind ? 2.6 : 4.4;
        for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1), v = sp * (0.55 + Math.random() * 0.45); vel.push([Math.sin(e) * Math.cos(a) * v, Math.cos(e) * v, Math.sin(e) * Math.sin(a) * v]); }
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); const m = new THREE.PointsMaterial({ size: ind ? 0.34 : 0.6, color: cols[b % cols.length], map: R.vfx ? R.vfx.soft : null, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }), pt = new THREE.Points(g, m); pt.frustumCulled = false; pt.position.set(s.x + ox, oy, s.y + oz); parent.add(pt); list.push({ pt, g, m, vel, t: performance.now() });
      }, b * 450);
      const step = (now) => { let live = 0; for (const f of list) { const age = (now - f.t) / 1000; if (age > 2.2) { if (f.pt.parent) { f.pt.parent.remove(f.pt); f.g.dispose(); f.m.dispose(); } continue; } live++; const p = f.g.attributes.position.array; for (let i = 0; i < N; i++) { p[i * 3] = f.vel[i][0] * age; p[i * 3 + 1] = f.vel[i][1] * age - (ind ? 1.2 : 3.2) * age * age; p[i * 3 + 2] = f.vel[i][2] * age; } f.g.attributes.position.needsUpdate = true; f.m.opacity = Math.max(0, 1 - age / 2.2); }
        if (live || now - t0 < 2200) requestAnimationFrame(step); }; requestAnimationFrame(step);
    } catch (e) { console.warn("fireworks", e); }
  };

  // ---------------------------------------------------------------- the level-up moment
  let showing = 0;
  function next() {
    if (showing || !LVX.queue.length) return; if ((typeof introOn !== "undefined" && introOn) || !$("sheet").hidden || !$("phone").hidden) { setTimeout(next, 2500); return; }
    const u = LVX.queue.shift(); if (window.ONB && ONB.quiet()) { LVX.fireworks(); toast("⭐ Level " + u.level + ": " + u.title + ". A gift of " + rsf(u.gift) + " is in your mail."); setTimeout(next, 800); return; } showing = 1; LVX.fireworks(); try { confetti(120); } catch (e) {} setTimeout(() => { try { confetti(90); } catch (e) {} }, 700);
    const perk = LVX.st && (LVX.st.perks || []).find((p) => p.lv === u.level);
    evCard({ icon: u.milestone ? "🏆" : "⭐", tag: "LEVEL UP", title: "Level " + u.level + ": " + u.title, text: "You earned a gift of " + rsf(u.gift) + ", waiting in your mail." + (perk ? " " + perk.text + " now." : "") + (u.milestone ? " A big milestone!" : ""), opts: [{ label: "Nice!", pri: true, go: () => { showing = 0; setTimeout(next, 600); } }, { label: "See my standing", go: () => { showing = 0; try { openPhone("standing"); } catch (e) {} } }] });
    setTimeout(() => { showing = 0; }, 20000);
  }

  // ---------------------------------------------------------------- the phone app
  LVX.app = async function (box) {
    let r = LVX.st; try { r = (await load()) || r; } catch (e) {} if (!r) { box.append(el("p", "pnote", "Your standing is loading. Try again in a moment.")); return; }
    appHero(box, "🏅", "Island Standing", "Level " + r.level + " · " + r.title, r.level >= r.max ? "You are a legend of the island." : r.into + " / " + r.need + " XP to level " + (r.level + 1) + (r.nextGift ? " (gift " + rsf(r.nextGift) + ")" : ""), r.need ? r.into / r.need * 100 : 100);
    box.append(el("p", "pnote", "You can reach every level on your own. Friends make it faster: helping a friend build gives a quarter more XP."));
    const lk = el("div", "lvtabs"); const b1 = el("button", "on", "🏆 Leaderboards"), b2 = el("button", "", "🪪 My card"); b1.type = b2.type = "button"; b1.onclick = () => openPhone("boards"); b2.onclick = () => { try { $("phone").hidden = true; } catch (e) {} LVX.card(window.MYUID || ""); }; lk.append(b1, b2); box.append(lk);
    box.append(el("p", "psec", "Your day"));
    (r.goals || []).forEach((g) => prow(box, (g.done ? "✅ " : "⬜ ") + g.text, g.done ? "Done" : g.have + " / " + g.n, "+" + g.xp + " XP and Rs " + g.cash));
    prow(box, r.allDone ? "🌟 All three done" : "🌟 Finish all three", "+" + r.bonus.xp + " XP, Rs " + r.bonus.cash, r.streak > 1 ? r.streak + " days in a row" : "New goals every morning");
    box.append(el("p", "psec", "Ways to earn XP today"));
    (r.ways || []).forEach((w) => prow(box, w.label, w.left > 0 ? "+" + w.xp + " XP" : "Done today", (w.first ? "First time bonus +" + w.first + " · " : "") + (w.k === "place" ? "Once for each new place" : w.left + " left today")));
    prow(box, "Flat upgrades", "+20 XP to start", "Finishing one gives even more, and friends who help earn 19 XP");
    box.append(el("p", "psec", "What opens"));
    (r.perks || []).forEach((p) => prow(box, (p.done ? "✅ " : "🔒 ") + p.text, "Level " + p.lv));
    box.append(el("p", "psec", "Titles"));
    TITLES.forEach(([l, n]) => prow(box, (r.level >= l ? "✅ " : "🔒 ") + n, "Level " + l));
    box.append(el("p", "pnote", "XP today: " + r.today + ". After " + r.soft + " XP in a day, more XP counts half, so nobody has to play for hours. Your level never goes down."));
  };


  // ---------------------------------------------------------------- the Standing card and the leaderboards (they never reset)
  LVX.sel = { scope: "island", board: "level" };
  const SCOPES = [["friends", "👥 Friends"], ["island", "🏝️ Island"], ["region", "📍 My region"]];
  const BOARDS = [["level", "⭐ Level"], ["flat", "🏠 Flat"], ["rich", "💰 Richest"], ["helpful", "🤝 Helpful"], ["explorer", "🧭 Explorer"]];
  LVX.card = async function (id) {
    const a = capA("lvl"); if (!a) return; let c = null; try { c = await a.card(id); } catch (e) {} if (!c || !c.ok) { toast("Couldn't open that card."); return; }
    if (c.hidden) { evCard({ icon: "🔒", tag: "STANDING", title: c.name, text: "This player keeps their standing private.", opts: [{ label: "OK", pri: true, go: () => {} }] }); return; }
    const lines = ["Level " + c.level + " · " + c.title + " (" + c.pct + "% to the next)", "Flat level " + c.flat + " · " + c.helps + " builds helped · " + c.places + " places found" + (c.streak > 1 ? " · " + c.streak + " days in a row" : "")];
    const opts = c.you ? [{ label: c.hide ? "Show me on the boards" : "Hide me from the boards", sub: "Your choice", go: async () => { try { await a.hide(!c.hide); toast(c.hide ? "You are on the boards again." : "You are hidden from the boards."); } catch (e) {} } }, { label: "Close", pri: true, go: () => {} }]
      : [{ label: c.friend ? "Remove friend" : "Add friend", pri: !c.friend, go: async () => { try { const r = await a.friend(c.id, c.friend); if (r && r.ok) toast(r.friend ? "👥 " + c.name + " is your friend." : "Removed."); else toast((r && r.error) || "Couldn't do that."); } catch (e) {} } }, { label: "Close", go: () => {} }];
    evCard({ icon: "🏅", tag: c.you ? "YOUR STANDING" : "STANDING", title: c.name, text: lines.join("\n"), opts });
  };
  LVX.boards = async function (box) {
    appHero(box, "🏆", "Leaderboards", "Your rank", "These never reset. Tap a name to see their card.");
    const wrap = el("div"); box.append(wrap); const a = capA("lvl");
    async function draw() {
      wrap.innerHTML = ""; const t1 = el("div", "lvtabs"), t2 = el("div", "lvtabs");
      SCOPES.forEach(([k, n]) => { const b = el("button", LVX.sel.scope === k ? "on" : "", n); b.type = "button"; b.onclick = () => { LVX.sel.scope = k; draw(); }; t1.append(b); });
      BOARDS.forEach(([k, n]) => { const b = el("button", LVX.sel.board === k ? "on" : "", n); b.type = "button"; b.onclick = () => { LVX.sel.board = k; draw(); }; t2.append(b); }); wrap.append(t1, t2);
      let r = null; try { r = await a.board(LVX.sel.scope, LVX.sel.board); } catch (e) {} if (!r || !r.ok) { wrap.append(el("p", "pnote", "Couldn't load the board.")); return; }
      wrap.append(el("p", "pnote", r.me ? "You are #" + r.me.rank + " of " + r.total + " · " + r.me.text : "Play a little to appear on this board."));
      if (LVX.sel.scope === "friends" && r.total <= 1) wrap.append(el("p", "pnote", "No friends yet. Tap a name on the Island board and add them, or help a friend build their flat."));
      const row = (x) => { const b = el("button", "lvrow" + (x.you ? " you" : "")); b.type = "button"; b.append(el("b", "rk", x.rank <= 3 ? ["🥇", "🥈", "🥉"][x.rank - 1] : "#" + x.rank)); const sp = el("span"); sp.append(el("b", "", x.name + (x.you ? " (you)" : "") + (x.friend ? " 👥" : "")), el("small", "", x.text)); b.append(sp, el("em", "", "Lv " + x.level)); b.onclick = () => LVX.card(x.id); return b; };
      r.top.forEach((x) => wrap.append(row(x))); if (r.near.length) { wrap.append(el("p", "psec", "Around you")); r.near.forEach((x) => wrap.append(row(x))); }
    }
    draw();
  };

  // ---------------------------------------------------------------- what earns XP (the phone only reports; the server decides)
  const _finish = window.finish;
  window.finish = function (a) { let before = -1; try { if (a && a.job !== undefined && typeof level === "function") before = level(a.job); } catch (e) {} const res = _finish.apply(this, arguments); try { if (before >= 0 && level(a.job) > before) setTimeout(() => LVX.gain("promo"), 1500); } catch (e) {} try { if (a && (a.job !== undefined || /Part-time/.test(a.label || ""))) LVX.gain("shift"); else if (a && /Ferris wheel/.test(a.label || "")) LVX.gain("ferris"); } catch (e) {} return res; };
  let lastIn = null;
  setInterval(() => { try { if (typeof s === "undefined" || !s.made) return; const p = s.inside || null; if (p === lastIn) return; lastIn = p; if (!p || p === "home") return; LVX.gain("visit"); if (!LVX.places[p]) { LVX.places[p] = 1; setTimeout(() => LVX.gain("place", String(p)), 1200); } } catch (e) {} }, 1500); // walking into a place counts as a visit, and the first time ever is worth XP
  setInterval(() => { if (typeof s !== "undefined" && s.made && Date.now() - LVX.loaded > 90000) load(); }, 5000);
  setTimeout(load, 2500);
})();
