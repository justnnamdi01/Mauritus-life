// net-adapter.js — makes the self-hosted backend look exactly like the page host the game expects.
// Load this BEFORE the game script. It defines window.claude = { use } so the game's
// claude.use("user" | "room" | "db") calls work against your own server over WebSocket.
(function () {
  "use strict";
  // this browser's player id and the signed key that proves it; the server issues both on first visit
  var uid = "", token = "", accountName = "";
  var visitInv = "", firstInv = ""; // the player id in an invite link (?inv=), so both of you get coins
  var visitRef = "", firstRef = ""; // the ?ref= tag on the link used to open the game this time, and the first one ever
  try { var q = new URLSearchParams(location.search); visitRef = String(q.get("ref") || q.get("utm_source") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24); firstRef = localStorage.getItem("fefRef1") || ""; if (visitRef && !firstRef) { firstRef = visitRef; localStorage.setItem("fefRef1", firstRef); } visitInv = String(q.get("inv") || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40); firstInv = localStorage.getItem("fefInv1") || ""; if (visitInv && !firstInv) { firstInv = visitInv; localStorage.setItem("fefInv1", firstInv); } } catch (e) {}
  try { if (localStorage.getItem("fef_rm") === "0" && !sessionStorage.getItem("fef_sess")) { localStorage.removeItem("fef_uid"); localStorage.removeItem("fef_token"); localStorage.removeItem("fef-sim-v2"); localStorage.removeItem("fef_rm"); } } catch (e) {} // someone who logged in without "Remember me" on an earlier visit: log them out now that the browser was closed
  try { uid = localStorage.getItem("fef_uid") || ""; token = localStorage.getItem("fef_token") || ""; } catch (e) {}
  var recoveredNow = false, welcomed = false, keptFor = ""; // was this browser recognised by its recovery cookie, has the server said hello, and which player the cookie was last set for
  function keepCookie() { try { if (!uid || !token || keptFor === uid || localStorage.getItem("fef_rm") === "0") return; keptFor = uid; fetch("/api/keep", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid: uid, token: token }), credentials: "same-origin" }).catch(function () { keptFor = ""; }); } catch (e) {} } // let the server remember this browser, so a wiped browser can still be recognised
  function dropCookie() { keptFor = ""; try { fetch("/api/keep", { method: "DELETE", credentials: "same-origin" }).catch(function () {}); } catch (e) {} } // forget this browser (logging out, a shared device, a removed character)
  function setKeep(keep, name) { // "Remember me": stay logged in on this device, or only until the browser is closed
    try { if (name) localStorage.setItem("fef_lastuser", String(name).toLowerCase().slice(0, 20)); if (keep) { localStorage.removeItem("fef_rm"); keepCookie(); } else { localStorage.setItem("fef_rm", "0"); sessionStorage.setItem("fef_sess", "1"); dropCookie(); } } catch (e) {}
  }
  function logout() { try { localStorage.removeItem("fef_uid"); localStorage.removeItem("fef_token"); localStorage.removeItem("fef-sim-v2"); localStorage.removeItem("fef_rm"); sessionStorage.removeItem("fef_sess"); } catch (e) {} uid = ""; token = ""; gone = true; dropCookie(); setTimeout(function () { location.reload(); }, 250); } // forget this device
  function remember(id, key) { uid = id; token = key; try { localStorage.setItem("fef_uid", id); localStorage.setItem("fef_token", key); } catch (e) {} } // keep them for next time

  var proto = location.protocol === "https:" ? "wss:" : "ws:";   // secure socket on https pages
  var URL = proto + "//" + location.host;                         // same origin as the page
  var ws = null, open = false, myPeer = "";                       // the socket, its state, and this tab's id
  var readyQ = [];                                                // callbacks waiting for the first connection
  function whenReady() { return new Promise(function (res) { if (open) res(); else readyQ.push(res); }); } // resolves once connected

  var peersCb = null, peersCloseCb = null;                        // the room listener
  var snaps = {};                                                 // active db subscriptions: id -> { col, limit, where, cb }
  var pending = {};                                               // db writes waiting for an ack: rid -> { resolve, reject, timer }
  var ridN = 0, subN = 0;                                         // counters for request ids and subscription ids

  var myPres = null, retry = 0;                                   // everything you have told the room (re-sent after a reconnect), and the reconnect timer
  function reconnectNow() { if (open || (ws && ws.readyState <= 1)) return; clearTimeout(retry); connect(); } // the screen came back: reconnect at once
  document.addEventListener("visibilitychange", function () { if (!document.hidden) reconnectNow(); }); // phone unlocked or tab shown again
  window.addEventListener("online", reconnectNow); window.addEventListener("pageshow", reconnectNow); // network back, or page restored
  var gone = false;                                                // set once an admin removed this character
  function removed(ban, reason) { // wipe this browser's copy of the deleted character; a ban keeps the id so the server can keep refusing it
    if (gone) return; gone = true; dropCookie(); try { var set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "fef-sim-v2") return; return set.call(this, k, v); }; } catch (e) {} // the game must not save it again
    try { localStorage.removeItem("fef-sim-v2"); if (!ban) { localStorage.removeItem("fef_uid"); localStorage.removeItem("fef_token"); } } catch (e) {}
    var d = document.createElement("div"); d.setAttribute("role", "alertdialog"); d.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#07171f;color:#eaf7f4;font:600 17px/1.5 system-ui,sans-serif;text-align:center";
    d.innerHTML = ban ? "<div><div style='font-size:48px'>⛔</div><p>This account has been banned from Flic en Flac Life.</p>" + (reason ? "<p>Reason: " + String(reason).replace(/[<>&]/g, " ") + "</p>" : "") + "<p style='font-size:14px;opacity:.8'>If you think this is a mistake, contact us on WhatsApp +230 5933 0011.</p></div>" : "<div><div style='font-size:48px'>🌴</div><p>This character was removed by the game admin.<br>Starting fresh…</p></div>"; document.body.appendChild(d); // tell the player
    if (!ban) setTimeout(function () { location.reload(); }, 2500); // a brand-new character
  }
  function connect() {
    if (gone) return; // removed: never reconnect as that character
    try { ws = new WebSocket(URL); } catch (e) { setTimeout(connect, 2000); return; } // retry if the socket cannot be created
    ws.onopen = function () { ws.send(JSON.stringify({ t: "hello", uid: uid, token: token || undefined, ref: visitRef, fref: firstRef, inv: firstInv })); }; // identify with our key (and which link brought you here, for the admin stats)
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === "removed") { removed(!!m.ban, m.reason); return; } // an admin deleted this character (or banned it)
      if (m.t === "welcome") { myPeer = m.peer; remember(m.uid, m.token); welcomed = true; recoveredNow = !!m.recovered; keepCookie(); accountName = m.account || ""; open = true; if (myPres) try { ws.send(JSON.stringify({ t: "presence", patch: myPres })); } catch (e) {} /* back online: tell everyone where you are again */ for (var id in snaps) sendSub(id); var q = readyQ; readyQ = []; q.forEach(function (r) { r(); }); } // accepted: the server says who we are, then restore subscriptions
      else if (m.t === "gov" && !m.rid) { govNow = m.gov || govNow; try { window.dispatchEvent(new Event("fef-gov")); } catch (e) {} } // the government changed: a new law, an election, a President
      else if (m.t === "gov.news") { try { window.dispatchEvent(new CustomEvent("fef-govnews", { detail: m })); } catch (e) {} }
      else if (m.t === "salon" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-salon", { detail: m })); } catch (e) {} } // Clawed by Taps: a booking changed or a message arrived
      else if (m.t === "flex" || m.t === "chal" || m.t === "passed") { try { window.dispatchEvent(new CustomEvent("fef-" + m.t, { detail: m })); } catch (e) {} } // competition: a flex post, a challenge update, someone passed you
      else if (m.t === "case" && !m.rid) { try { window.dispatchEvent(new Event("fef-case")); } catch (e) {} } // the agent or the court did something about you: look at your case now
      else if (m.t === "regions") { try { window.dispatchEvent(new CustomEvent("fef-regions", { detail: m.regions })); } catch (e) {} } // a region of the island opened or closed
      else if (m.t === "region.locked") { if (myPres && m.back) { for (var rk in m.back) { if (m.back[rk] === undefined) delete myPres[rk]; else myPres[rk] = m.back[rk]; } } try { window.dispatchEvent(new CustomEvent("fef-regionlocked", { detail: m })); } catch (e) {} } // the server would not let us into a locked region: our place was put back
      else if (m.t === "disaster") { try { window.dispatchEvent(new CustomEvent("fef-disaster", { detail: m })); } catch (e) {} } // a disaster is coming, hitting or over
      else if (m.t === "heist" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-heist", { detail: m })); } catch (e) {} } // a heist offer, or how it went
      else if (m.t === "hunt" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-hunt", { detail: m })); } catch (e) {} } // someone dug up the treasure
      else if (m.t === "biz" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-biz", { detail: m.m })); } catch (e) {} } // a business sent everyone a message
      else if (m.t === "flat" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-flat", { detail: m })); } catch (e) {} } // your flat has just been finished
      else if (m.t === "zone" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-zone", { detail: m })); } catch (e) {} } // you reached a landmark of a new town
      else if (m.t === "market" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-market", { detail: m })); } catch (e) {} } // a raid on a blanket, or your stall closed
      else if (m.t === "cutz" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-cutz", { detail: m })); } catch (e) {} } // the barber answered your booking
      else if (m.t === "poll" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-poll", { detail: m })); } catch (e) {} } // a new poll, or it closed
      else if (m.t === "trips" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-trips", { detail: m })); } catch (e) {} } // a trip request or answer
      else if (m.t === "belle" && !m.rid) { try { window.dispatchEvent(new CustomEvent("fef-belle", { detail: m })); } catch (e) {} } // Belle's Kitchen answered your booking
      else if (m.t === "cutz" || m.t === "biz" || m.t === "hw" || m.t === "hunt" || m.t === "dis" || m.t === "road" || m.t === "poll" || m.t === "trips" || m.t === "belle" || m.t === "heist" || m.t === "wealth" || m.t === "casino" || m.t === "job" || m.t === "market" || m.t === "zone" || m.t === "pass" || m.t === "push" || m.t === "hustle" || m.t === "flat" || m.t === "parl" || m.t === "party" || m.t === "account" || m.t === "homes" || m.t === "shop" || m.t === "promo" || m.t === "pay" || m.t === "chat.more" || m.t === "reward" || m.t === "fashion" || (m.t === "case" && m.rid) || (m.t === "gov" && m.rid) || (m.t === "ledger" && m.rid) || (m.t === "build" && m.rid) || (m.t === "feedback" && m.rid) || (m.t === "compete" && m.rid) || (m.t === "salon" && m.rid)) { var ar = asks[m.rid]; if (ar) { clearTimeout(ar.timer); delete asks[m.rid]; ar.resolve(m); } } // an answer to a login or home request
      if ((m.t === "welcome" && m.rich) || m.t === "rich") { richNow = m.rich || richNow; richCbs.forEach(function (cb) { try { cb(m.rich, m.prev || null, m.t === "rich"); } catch (e) {} }); } // who is the richest right now, and a change of crown
      if (m.t === "welcome" && m.flex) flexBack = m.flex;
      if (m.t === "welcome" && m.gov) { govNow = m.gov; try { window.dispatchEvent(new Event("fef-gov")); } catch (e) {} }
      if (m.t === "welcome" && m.news) newsBack = m.news, newsCbs.forEach(function (cb) { try { cb(m.news, true); } catch (e) {} }); // the latest gossip, on every (re)connect
      if (m.t === "welcome" && m.chat) chatBack = m.chat, chatCbs.forEach(function (cb) { try { cb(m.chat, true); } catch (e) {} }); // stored chat, on every (re)connect
      if (m.t === "chat") { chatCbs.forEach(function (cb) { try { cb([m.m], false); } catch (e) {} }); } // a new message
      if (m.t === "raidhit") { try { window.dispatchEvent(new Event("fef-raidhit")); } catch (e) {} } // someone raided you while you are playing: pay up now
      if (m.t === "team") { try { window.dispatchEvent(new CustomEvent("fef-team", { detail: m.m })); } catch (e) {} } // a reply from the Flic en Flac Team
      if (m.t === "chat.err") { chatCbs.forEach(function (cb) { try { cb([], false, m.error); } catch (e) {} }); } // a message the server would not take
      if ((m.t === "welcome" || m.t === "wall") && (m.wall || m.items)) { wallBack = m.wall || m.items; wallCbs.forEach(function (cb) { try { cb(wallBack); } catch (e) {} }); } // the Heart Wall
      if (m.t === "fashion.live" || m.t === "fashion.results") { fashionCbs.forEach(function (cb) { try { cb(m); } catch (e) {} }); } // the Fashion Show went live, or the results are in
      if (m.t === "wall.err") { wallCbs.forEach(function (cb) { try { cb(null, m.error); } catch (e) {} }); }
      if (m.t === "news") { newsCbs.forEach(function (cb) { try { cb([m.item], false); } catch (e) {} }); } // someone just got exposed
      else if (m.t === "relay") { relayCbs.forEach(function (cb) { try { cb(m.from, m.d); } catch (e) {} }); } // a game message from another player
      else if (m.t === "shop.offer" || m.t === "shop.hired" || m.t === "shop.left" || m.t === "shop.fired" || m.t === "shop.shift") { (shopCbs[m.t.slice(5)] || []).forEach(function (cb) { try { cb(m); } catch (e) {} }); } // snack shop news
      else if (m.t === "invited" || m.t === "kicked" || m.t === "live") { (homeCbs[m.t] || []).forEach(function (cb) { try { cb(m); } catch (e) {} }); } // someone invited you, or you were sent out of a home
      else if (m.t === "peers") { if (peersCb) peersCb({ total: m.total | 0, peers: m.peers.map(function (p) { return { peer: p.peer, presence: p.presence, kind: p.kind || "viewer", isMe: p.peer === myPeer, sameTab: p.peer === myPeer }; }) }); } // room update (and how many people have ever played)
      else if (m.t === "snap") { var s = snaps[m.id]; if (s && s.cb) s.cb({ docs: m.docs.map(function (d) { return { id: d.id, data: function () { return d.data; } }; }) }); } // a collection's data
      else if (m.t === "ack") { var pr = pending[m.rid]; if (pr) { clearTimeout(pr.timer); if (m.ok === false) { var er = new Error(m.error || "rejected"); er.code = m.code || "rejected"; pr.reject(er); } else pr.resolve(); delete pending[m.rid]; } } // a write landed
    };
    ws.onclose = function () { open = false; if (peersCloseCb) peersCloseCb(); clearTimeout(retry); retry = setTimeout(connect, 1500); }; // drop to solo and reconnect
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  connect();

  function req(obj) { // a db write that resolves when the server acknowledges it (so .then/.catch behave)
    return whenReady().then(function () {
      return new Promise(function (resolve, reject) {
        var rid = ++ridN; obj.rid = rid;
        pending[rid] = { resolve: resolve, reject: reject, timer: setTimeout(function () { delete pending[rid]; reject(new Error("timeout")); }, 8000) };
        try { ws.send(JSON.stringify(obj)); } catch (e) { clearTimeout(pending[rid].timer); delete pending[rid]; reject(e); }
      });
    });
  }
  var asks = {};                                                  // login requests waiting for an answer: rid -> { resolve, timer }
  var govNow = null; var richNow = null, richCbs = [];                               // the richest player, and who wants to hear when it changes
  var shopCbs = {};                                               // listeners for snack shop news
  var homeCbs = {};                                               // listeners for "invited" and "kicked"
  var relayCbs = [];                                              // listeners for game messages from other players
  var chatCbs = [], chatBack = null;                                             // listeners for stored chat
  var flexBack = [], newsCbs = [], newsBack = null, wallCbs = [], wallBack = null, fashionCbs = []; // town gossip listeners; Heart Wall listeners                                             // listeners for town gossip (people getting exposed)
  function ask(obj) { // a request whose answer comes back as a message (resolves with { ok, error, ... })
    return whenReady().then(function () {
      return new Promise(function (resolve) {
        var rid = ++ridN; obj.rid = rid;
        asks[rid] = { resolve: resolve, timer: setTimeout(function () { delete asks[rid]; resolve({ ok: false, error: "No answer from the server. Try again." }); }, 15000) };
        try { ws.send(JSON.stringify(obj)); } catch (e) { clearTimeout(asks[rid].timer); delete asks[rid]; resolve({ ok: false, error: "Not connected." }); }
      });
    });
  }
  function sendSub(id) { var s = snaps[id]; if (open && s) { try { ws.send(JSON.stringify({ t: "sub", id: id, col: s.col, limit: s.limit, where: s.where })); } catch (e) {} } } // start watching a collection
  function subscribe(col, limit, where, cb) { var id = "s" + (++subN); snaps[id] = { col: col, limit: limit, where: where, cb: cb }; whenReady().then(function () { sendSub(id); }); return function () { delete snaps[id]; if (open) try { ws.send(JSON.stringify({ t: "unsub", id: id })); } catch (e) {} }; } // returns an unsubscribe function

  function collection(col) {
    return {
      limit: function (n) { return { onSnapshot: function (cb) { return subscribe(col, n, null, cb); } }; },               // .limit(n).onSnapshot
      where: function (f, op, v) { return { onSnapshot: function (cb) { return subscribe(col, 0, { field: f, value: v }, cb); } }; }, // .where(f,"==",v).onSnapshot
      onSnapshot: function (cb) { return subscribe(col, 0, null, cb); },                                                   // whole-collection watch
      add: function (data) { return req({ t: "col.add", col: col, data: data }); },                                       // add a new document
      doc: function (id) { return { set: function (data) { return req({ t: "doc.set", path: col + "/" + id, data: data }); }, delete: function () { return req({ t: "doc.delete", col: col, id: id }); } }; } // one document in the collection
    };
  }
  function docRef(path) { return { set: function (data) { return req({ t: "doc.set", path: path, data: data }); } }; }     // db.doc("players/<uid>")

  // the object the game asks for
  window.claude = {
    use: function (name) {
      if (name === "user") return Promise.resolve({ id: function () { return whenReady().then(function () { return uid; }); } }); // who you are
      if (name === "room") return Promise.resolve({ onPeers: function (cb, closeCb) { peersCb = cb; peersCloseCb = closeCb; }, presence: function (patch) { myPres = Object.assign(myPres || {}, patch); if (open) try { ws.send(JSON.stringify({ t: "presence", patch: patch })); } catch (e) {} return Promise.resolve(); } }); // live players (remembered, so a reconnect restores you)
      if (name === "db") return Promise.resolve({ collection: collection, doc: docRef }); // the shared database
      return Promise.resolve(null); // anything else: not provided (the game falls back gracefully)
    },
    account: { // optional username + password, so a character can be played on other devices
      name: function () { return accountName; },
      ready: function () { return welcomed; },            // has the server said hello yet?
      recovered: function () { return recoveredNow; },    // did the server recognise this browser by its recovery cookie?
      lastUser: function () { try { return localStorage.getItem("fef_lastuser") || ""; } catch (e) { return ""; } }, // the username last used on this device
      keeping: function () { try { return localStorage.getItem("fef_rm") !== "0"; } catch (e) { return true; } },
      logout: function () { logout(); }, // log out of this device                                  // this character's login, or "" if none
      register: function (name, pass, keep) { return ask({ t: "account.register", name: name, pass: pass }).then(function (r) { if (r.ok) { accountName = r.name; setKeep(keep !== false, r.name); } return r; }); }, // add a login to this character
      login: function (name, pass, keep) { return ask({ t: "account.login", name: name, pass: pass }).then(function (r) { if (r.ok) { remember(r.uid, r.token); setKeep(keep !== false, name); } return r; }); }, // switch this browser to that character (reload afterwards)
    },
    promo: { // the community post: see it, tap Join, claim the bonus
      get: function () { return ask({ t: "promo.get" }); },
      claim: function () { return ask({ t: "promo.claim" }); },
      joinUrl: function () { return "/go/join?uid=" + encodeURIComponent(uid) + "&token=" + encodeURIComponent(token); } // opens the group through the game, so the tap is counted
    },
    agent: { // the Financial Crimes agent and the court
      get: function () { return ask({ t: "case.get" }); },
      docket: function () { return ask({ t: "case.docket" }); },
      ack: function (id, amt, done) { return ask({ t: "case.ack", id: id, amt: amt, done: done ? 1 : 0 }); },
      defend: function (id, defense) { return ask({ t: "case.defend", id: id, defense: defense }); }
    },
    salon: { // Clawed by Taps bookings
      get: function () { return ask({ t: "salon.get" }); },
      mine: function () { return ask({ t: "salon.mine" }); },
      track: function (ev) { return ask({ t: "salon.track", ev: ev }); },
      book: function (b) { return ask({ t: "salon.book", date: b.date, hour: b.hour, svc: b.svc, adds: b.adds, size: b.size, contact: b.contact, phone: b.phone, note: b.note }); },
      cancel: function (code) { return ask({ t: "salon.cancel", code: code }); },
      say: function (code, text, key) { return ask({ t: "salon.say", code: code, text: text, key: key }); },
      owner: function (key) { return ask({ t: "salon.owner", key: key }); },
      act: function (code, act, date, hour, key) { return ask({ t: "salon.owner.act", code: code, act: act, date: date, hour: hour, key: key }); }
    },
    compete: { // the flex feed, challenges, home ratings and crews
      back: function () { return flexBack; },
      flex: function (kind, arg) { return ask({ t: "flex.say", kind: kind, arg: arg }); },
      feed: function () { return ask({ t: "flex.get" }); },
      chals: function () { return ask({ t: "chal.list" }); },
      challenge: function (to, type, stake) { return ask({ t: "chal.new", to: to, type: type, stake: stake }); },
      accept: function (id) { return ask({ t: "chal.accept", id: id }); },
      decline: function (id) { return ask({ t: "chal.decline", id: id }); },
      report: function (id, score) { return ask({ t: "chal.report", id: id, score: score }); },
      rate: function (to, stars) { return ask({ t: "home.rate", to: to, stars: stars }); },
      topHomes: function () { return ask({ t: "home.top" }); },
      raidMe: function () { return ask({ t: "raid.me" }); },                                        // Raids: my defenses, shield and raids left
      raidLab: function (k) { return ask({ t: "raid.lab", k: k }); },                                // level up a troop type (takes time)
      raidTrain: function (k) { return ask({ t: "raid.train", k: k }); },                          // train a troop (takes time)
      raidShield: function () { return ask({ t: "raid.shield" }); },                                // buy a 2 hour shield
      raidRich: function () { return ask({ t: "raid.rich" }); },                                // the rich list as raid targets
      raidSearch: function (q, random) { return ask({ t: "raid.search", q: q || "", random: !!random }); },                   // find players to raid
      raidScout: function (to) { return ask({ t: "raid.scout", to: to }); },                        // look at their base
      raidGo: function (to, crew, rev) { return ask({ t: "raid.go", to: to, crew: crew, rev: !!rev }); },
      raidBuy: function (k) { return ask({ t: "raid.buy", k: k }); },                               // upgrade a defense
      raidLayout: function (pos) { return ask({ t: "raid.layout", pos: pos }); },                    // arrange your defenses inside your walls
      raidClaim: function () { return ask({ t: "raid.claim" }); },                                  // what happened while you were away
      raidAck: function (ids) { return ask({ t: "raid.ack", ids: ids }); },
      designs: function () { return ask({ t: "design.list" }); },                                   // the Design Awards: listed homes, scores, last winners
      designEnter: function (title) { return ask({ t: "design.enter", title: title }); },
      designLeave: function () { return ask({ t: "design.leave" }); },
      designView: function (to) { return ask({ t: "design.view", to: to }); },                      // how a listed home is laid out (open to everyone)
      designVote: function (to, stars) { return ask({ t: "design.vote", to: to, stars: stars }); },
      crew: function () { return ask({ t: "crew.get" }); },
      crews: function () { return ask({ t: "crew.list" }); },
      crewMake: function (tag, name, emoji) { return ask({ t: "crew.create", tag: tag, name: name, emoji: emoji }); },
      crewJoin: function (id) { return ask({ t: "crew.join", id: id }); },
      crewLeave: function () { return ask({ t: "crew.leave" }); },
      crewKick: function (who) { return ask({ t: "crew.kick", who: who }); }
    },
    feedback: { // bug reports, ideas and ratings
      send: function (row) { return ask({ t: "feedback.add", kind: row.kind, rating: row.rating, text: row.text, ctx: row.ctx }); }
    },
    build: { // tell the town about a new house going up, or finished
      say: function (kind, home, where, dur) { return ask({ t: "build.say", kind: kind, home: home, where: where, dur: dur }); }
    },
    ledger: { // report money lines to the server's ledger
      send: function (rows) { return ask({ t: "ledger.add", rows: rows }); }
    },
    gov: { // the two governments (Flic en Flac and Tamarin): elections, laws and the Presidents
      now: function () { return govNow; },
      get: function () { return ask({ t: "gov.get" }); },
      run: function (town, pitch) { return ask({ t: "gov.run", town: town, pitch: pitch }); },
      vote: function (town, uid) { return ask({ t: "gov.vote", town: town, for: uid }); },
      ballot: function (town, v) { return ask({ t: "gov.ballot", town: town, v: v }); },
      law: function (town, key, val) { return ask({ t: "gov.law", town: town, key: key, val: val }); },
      tax: function (town, amt) { return ask({ t: "gov.tax", town: town, amt: amt }); },
      arrive: function (town, heli) { return ask({ t: "gov.arrive", town: town, heli: heli ? 1 : 0 }); },
      resign: function (town) { return ask({ t: "gov.resign", town: town }); },
      embezzle: function (town, amt) { return ask({ t: "gov.embezzle", town: town, amt: amt }); },
      fire: function (town) { return ask({ t: "gov.fire", town: town }); },
      promise: function (town, list) { return ask({ t: "gov.promise", town: town, list: list }); },     // a candidate's promises (up to 3)
      campaign: function (town, kind) { return ask({ t: "gov.campaign", town: town, kind: kind }); },   // poster, rally or ad
      donate: function (town, to, amt) { return ask({ t: "gov.donate", town: town, to: to, amt: amt }); }, // give to a candidate's campaign
      debate: function (town, rival) { return ask({ t: "gov.debate", town: town, rival: rival }); },       // challenge a rival to a TV debate
      debateVote: function (town, uid) { return ask({ t: "gov.debateVote", town: town, for: uid }); },
    },
    road: { // trips between towns along the real roads
      plan: function (to) { return ask({ t: "road.plan", to: to }); },
      start: function (to, mode, car) { return ask({ t: "road.start", to: to, mode: mode, car: !!car }); },
      arrive: function () { return ask({ t: "road.arrive" }); }
    },
    dis: { // storm cover and the relief fund
      get: function () { return ask({ t: "dis.get" }); },
      prep: function (tier) { return ask({ t: "dis.prep", tier: tier }); },
      policy: function () { return ask({ t: "dis.policy" }); },
      give: function (amt) { return ask({ t: "dis.give", amt: amt }); }
    },
    hunt: { // the Halloween treasure hunt
      get: function () { return ask({ t: "hunt.get" }); },
      scan: function () { return ask({ t: "hunt.scan" }); },
      dig: function () { return ask({ t: "hunt.dig" }); },
      boss: function () { return ask({ t: "hunt.boss" }); },
      fight: function (crew) { return ask({ t: "hunt.fight", crew: crew }); },
      fightStart: function (crew) { return ask({ t: "hunt.fight.start", crew: crew }); },
      fightAct: function (rd, ability, acc) { return ask({ t: "hunt.fight.act", rd: rd, ability: ability, acc: acc }); }
    },
    hw: { // Halloween Night: candy, costumes, the ghost hunt
      get: function () { return ask({ t: "hw.get" }); },
      knock: function (door) { return ask({ t: "hw.knock", door: door }); },
      orb: function (id) { return ask({ t: "hw.orb", id: id }); },
      enter: function (costume, look) { return ask({ t: "hw.costume.enter", costume: costume, look: look }); },
      vote: function (uid) { return ask({ t: "hw.vote", for: uid }); }
    },
    biz: { // business chats (Belle's Kitchen, A* Cutz): read their messages, write to them
      load: function () { return ask({ t: "biz.load" }); },
      send: function (biz, text) { return ask({ t: "biz.send", biz: biz, text: text }); }
    },
    cutz: { // A* Cutz barber shop: book a cut
      get: function () { return ask({ t: "cutz.get" }); },
      mine: function () { return ask({ t: "cutz.mine" }); },
      book: function (date, hour, svc) { return ask({ t: "cutz.book", date: date, hour: hour, svc: svc }); },
      cancel: function (code) { return ask({ t: "cutz.cancel", code: code }); }
    },
    poll: { // a question from the team: one vote each
      get: function () { return ask({ t: "poll.get" }); },
      vote: function (id, opt) { return ask({ t: "poll.vote", id: id, opt: opt }); }
    },
    trips: { // student driver trips (hidden until the admin switches them on)
      get: function () { return ask({ t: "trips.get" }); },
      drivers: function (dest) { return ask({ t: "trips.drivers", dest: dest }); },
      save: function (d) { return ask({ t: "trips.driver.save", wa: d.wa, car: d.car, prices: d.prices, stop: d.stop, online: d.online, agree: d.agree }); },
      online: function (on) { return ask({ t: "trips.driver.online", online: !!on }); },
      request: function (r) { return ask({ t: "trips.request", dest: r.dest, driver: r.driver, pax: r.pax, stops: r.stops, when: r.when, note: r.note }); },
      mine: function () { return ask({ t: "trips.mine" }); },
      answer: function (id, accept) { return ask({ t: "trips.answer", id: id, accept: !!accept }); },
      cancel: function (id) { return ask({ t: "trips.cancel", id: id }); },
      done: function (id, stars) { return ask({ t: "trips.done", id: id, stars: stars }); },
      report: function (id, driver, text) { return ask({ t: "trips.report", id: id, driver: driver, text: text }); }
    },
    belle: { // Belle's Kitchen: book a table, see your bookings
      get: function () { return ask({ t: "belle.get" }); },
      mine: function () { return ask({ t: "belle.mine" }); },
      book: function (date, hour, size, note) { return ask({ t: "belle.book", date: date, hour: hour, size: size, note: note }); },
      cancel: function (code) { return ask({ t: "belle.cancel", code: code }); }
    },
    heist: { // two-player heists on the bank vault or a town treasury
      get: function () { return ask({ t: "heist.get" }); },
      plan: function (target, to, split) { return ask({ t: "heist.plan", target: target, to: to, split: split }); },
      answer: function (accept) { return ask({ t: "heist.answer", accept: !!accept }); },
      launch: function () { return ask({ t: "heist.launch" }); },
      cancel: function () { return ask({ t: "heist.cancel" }); }
    },
    casino: { // the Port Louis casino: the server spins, deals and rolls
      state: function () { return ask({ t: "casino.state" }); },
      exclude: function (days) { return ask({ t: "casino.exclude", days: days }); },
      roulette: function (bet, stake) { return ask({ t: "casino.roulette", bet: bet, stake: stake }); },
      slots: function (stake) { return ask({ t: "casino.slots", stake: stake }); },
      bjStart: function (stake) { return ask({ t: "casino.bj.start", stake: stake }); },
      bjHit: function () { return ask({ t: "casino.bj.hit" }); },
      bjStand: function () { return ask({ t: "casino.bj.stand" }); },
      bjDouble: function () { return ask({ t: "casino.bj.double" }); }
    },
    job: { // job challenges: the server sets the questions and pays the bonus
      start: function (game) { return ask({ t: "job.start", game: game }); },
      answer: function (id, answers) { return ask({ t: "job.answer", id: id, answers: answers }); },
      courierStart: function () { return ask({ t: "job.courier.start" }); },
      courierDone: function (id) { return ask({ t: "job.courier.done", id: id }); }
    },
    push: { // notifications: register this phone and choose what to get
      state: function () { return ask({ t: "push.state" }); },
      sub: function (sub) { return ask({ t: "push.sub", sub: sub }); },
      unsub: function (endpoint, all) { return ask({ t: "push.unsub", endpoint: endpoint, all: !!all }); },
      prefs: function (o) { return ask(Object.assign({ t: "push.prefs" }, o)); },
      test: function () { return ask({ t: "push.test" }); }
    },
    flat: { // timed upgrades of your flat: the server owns the clock
      state: function () { return ask({ t: "flat.state" }); },
      start: function () { return ask({ t: "flat.start" }); },
      nudge: function () { return ask({ t: "flat.nudge" }); },
      peek: function (owner) { return ask({ t: "flat.peek", owner: owner }); },
      help: function (owner) { return ask({ t: "flat.help", owner: owner }); },
      ack: function () { return ask({ t: "flat.ack" }); }
    },
    hustle: { // side hustles: the server times, charges and pays them
      state: function () { return ask({ t: "hustle.state" }); },
      start: function (id) { return ask({ t: "hustle.start", id: id }); },
      finish: function (id) { return ask({ t: "hustle.finish", id: id }); }
    },
    pass: { // the Island Pass: opens the highways and the other towns
      state: function () { return ask({ t: "pass.state" }); },
      buy: function () { return ask({ t: "pass.buy" }); }
    },
    zone: { // discovery: the new-in-town checklist and who is where
      state: function (town) { return ask({ t: "zone.state", town: town || "" }); },
      pulse: function () { return ask({ t: "zone.pulse" }); }
    },
    market: { // the street market: blankets, stock and sales between players
      list: function () { return ask({ t: "market.list" }); },
      open: function () { return ask({ t: "market.open" }); },
      stock: function (good, qty) { return ask({ t: "market.stock", good: good, qty: qty }); },
      price: function (good, price) { return ask({ t: "market.price", good: good, price: price }); },
      close: function () { return ask({ t: "market.close" }); },
      buy: function (seller, good) { return ask({ t: "market.buy", seller: seller, good: good }); }
    },
    wealth: { // the wealth ladder and the Patron shop
      get: function () { return ask({ t: "wealth.get" }); },
      sink: function (kind, what) { return ask({ t: "wealth.sink", kind: kind, what: what || "" }); }
    },
    parl: { // parliament, bills, the cabinet and votes of no confidence
      get: function (town) { return ask({ t: "parl.get", town: town }); },
      bill: function (town, key, val) { return ask({ t: "parl.bill", town: town, key: key, val: val }); },
      vote: function (town, id, v) { return ask({ t: "parl.vote", town: town, id: id, v: v }); },
      sign: function (town, id, v) { return ask({ t: "parl.sign", town: town, id: id, v: v }); },
      ncCall: function (town) { return ask({ t: "parl.nc.call", town: town }); },
      ncSign: function (town) { return ask({ t: "parl.nc.sign", town: town }); },
      ncVote: function (town, v) { return ask({ t: "parl.nc.vote", town: town, v: v }); },
      appoint: function (town, role, uid) { return ask({ t: "parl.cab.appoint", town: town, role: role, uid: uid }); },
      answer: function (town, accept) { return ask({ t: "parl.cab.answer", town: town, accept: !!accept }); },
      fire: function (town, role) { return ask({ t: "parl.cab.fire", town: town, role: role }); },
      resign: function (town) { return ask({ t: "parl.cab.resign", town: town }); },
      salary: function (town, amt) { return ask({ t: "parl.cab.salary", town: town, amt: amt }); }
    },
    party: { // political parties
      get: function () { return ask({ t: "party.get" }); },
      create: function (o) { return ask(Object.assign({ t: "party.create" }, o)); },
      join: function (id) { return ask({ t: "party.join", id: id }); },
      leave: function () { return ask({ t: "party.leave" }); },
      donate: function (amt) { return ask({ t: "party.donate", amt: amt }); },
      edit: function (o) { return ask(Object.assign({ t: "party.edit" }, o)); },
      kick: function (uid) { return ask({ t: "party.kick", uid: uid }); },
      leader: function (uid) { return ask({ t: "party.leader", uid: uid }); },
      ally: function (id) { return ask({ t: "party.ally", id: id }); },
      allyAnswer: function (from, accept) { return ask({ t: "party.allyAnswer", from: from, accept: !!accept }); },
      allyBreak: function () { return ask({ t: "party.allyBreak" }); },
      nominate: function (town, uid) { return ask({ t: "party.nominate", town: town, uid: uid }); }
    },
    rich: { // the richest player in town
      get: function () { return richNow; },
      on: function (cb) { richCbs.push(cb); if (richNow) try { cb(richNow, null, false); } catch (e) {} }
    },
    shop: { // snack shops: owners hire real students, students work shifts
      info: function () { return ask({ t: "shop.info" }); },
      open: function () { return ask({ t: "shop.open" }); },
      close: function () { return ask({ t: "shop.close" }); },
      hire: function (to) { return ask({ t: "shop.hire", to: to }); },
      accept: function (owner) { return ask({ t: "shop.accept", owner: owner }); },
      decline: function (owner) { return ask({ t: "shop.decline", owner: owner }); },
      quit: function () { return ask({ t: "shop.quit" }); },
      fire: function (to) { return ask({ t: "shop.fire", to: to }); },
      work: function () { return ask({ t: "shop.work" }); },
      collect: function () { return ask({ t: "shop.collect" }); },
      on: function (type, cb) { (shopCbs[type] = shopCbs[type] || []).push(cb); }               // "offer", "hired", "left", "fired" or "shift"
    },
    relay: { // quick messages to one other player, for two-player games
      send: function (to, d) { if (open) try { ws.send(JSON.stringify({ t: "relay", to: to, d: d })); } catch (e) {} }, // to their player id
      on: function (cb) { relayCbs.push(cb); }                                                                        // cb(fromUid, data)
    },
    chat: { // town chat and private messages, stored on the server
      send: function (to, text, cid, name) { if (!open) return false; try { ws.send(JSON.stringify({ t: "chat.send", to: to || "", text: text, cid: cid, name: name || "" })); return true; } catch (e) { return false; } }, // to a player id, or "" for town
      more: function (withUid, before) { return ask({ t: "chat.more", with: withUid || "", before: before || 0 }); }, // older messages: { ok, list, more }
      me: function () { return uid; },                                                                                 // your player id (known as soon as the server welcomes you)
      on: function (cb) { chatCbs.push(cb); if (chatBack) try { cb(chatBack, true); } catch (e) {} }                   // cb(messages, isBacklog)
    },
    wall: { // the Heart Wall: anonymous notes
      post: function (text) { if (!open) return false; try { ws.send(JSON.stringify({ t: "wall.post", text: text })); return true; } catch (e) { return false; } },
      act: function (kind, id) { if (open) try { ws.send(JSON.stringify({ t: "wall." + kind, id: id })); } catch (e) {} }, // heart, report or delete
      on: function (cb) { wallCbs.push(cb); if (wallBack) try { cb(wallBack); } catch (e) {} }                       // cb(items) or cb(null, error)
    },
    fashion: { // the Saturday Fashion Show
      status: function () { return ask({ t: "fashion.status" }); },                    // schedule, entries, votes
      enter: function (look) { return ask({ t: "fashion.enter", look: look }); },     // put your look in the show (until it starts)
      vote: function (id) { return ask({ t: "fashion.vote", id: id }); },             // vote for a look while it is live
      on: function (cb) { fashionCbs.push(cb); }                                       // cb({ t: "fashion.live" | "fashion.results" })
    },
    rewards: { // daily login reward and invite bonus
      status: function () { return ask({ t: "reward.status" }); }, // { streak, canClaim, amt, day, schedule, invites }
      claim: function () { return ask({ t: "reward.claim" }); }    // claim today's coins (once a day)
    },
    pay: function (to, amt, note) { return ask({ t: "pay", to: to, amt: amt, note: note || "" }); }, // send money: { ok, error }; it shows in your private chat too
    news: { // town gossip: cheaters and people caught doing something bad
      teamLoad: function () { return ask({ t: "team.load" }); },                                  // the Flic en Flac Team chat
      teamSend: function (text) { return ask({ t: "team.send", text: text }); },
      adReward: function (id, kind) { return ask({ t: "ad.reward", id: id, kind: kind }); }, // in-game money for pressing the ad's button or visiting its building (once each)
      adClaim: function (id, peek) { return ask({ t: "ad.claim", id: id, peek: !!peek }); }, // the first few players get a discount code
      ad: function (id, ev) { if (open) try { ws.send(JSON.stringify({ t: "ad.ev", id: id, ev: ev })); } catch (e) {} }, // an ad was seen, opened or clicked (counted for the client)
      expose: function (kind, victim, vuid) { if (open) try { ws.send(JSON.stringify({ t: "expose", kind: kind, victim: victim || "", vuid: vuid || "" })); } catch (e) {} }, // you got caught: the server tells everyone
      on: function (cb) { newsCbs.push(cb); if (newsBack) try { cb(newsBack, true); } catch (e) {} }                   // cb(items, isBacklog); gets the backlog if it already arrived
    },
    homes: { // private homes: your address, and who may come in
      claim: function (zone, o) { return ask({ t: "home.claim", zone: zone || "", reserve: o && o.reserve ? 1 : 0, release: o && o.release ? 1 : 0 }); },                                   // your address number (given once, kept forever)
      invites: function () { return ask({ t: "home.invites" }); },                               // who has invited you: { list: [{ owner, until }] }
      invite: function (to, hours) { return ask({ t: "home.invite", to: to, hours: hours }); },  // let a player in for a few hours
      uninvite: function (to) { return ask({ t: "home.uninvite", to: to }); },                    // take it back
      view: function (to) { return ask({ t: "home.view", to: to }); },                           // how their home is laid out (you must be invited)
      live: function () { return ask({ t: "home.live" }); },                                       // living together: { mine, at, kind, offers, sent }
      liveInvite: function (to, kind) { return ask({ t: "home.liveInvite", to: to, kind: kind }); }, // ask a player to move in (roommate or partner)
      liveAnswer: function (owner, accept) { return ask({ t: "home.liveAnswer", owner: owner, accept: !!accept }); }, // accept or decline
      liveLeave: function (to) { return ask({ t: "home.liveLeave", to: to || "" }); },             // move out (or, as the owner, ask someone to leave: pass their id)
      party: function (until) { return ask({ t: "home.party", until: until }); },                // open house until then (0 to close)
      on: function (type, cb) { (homeCbs[type] = homeCbs[type] || []).push(cb); }                 // "invited" or "kicked"
    }
  };
})();
