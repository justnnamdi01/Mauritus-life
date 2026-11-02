// Flic en Flac Life — self-hosted backend (hardened for real players)
// Implements exactly what the game asks the page host for:
//   claude.use("user") -> { id() }        a stable player id
//   claude.use("room") -> presence/peers  live multiplayer
//   claude.use("db")   -> players + mail  saves, leaderboard, money transfers
// One Node process serves the static game AND the realtime backend over the same port.
//
// SAFETY MODEL (read before launch):
//   - A tab can only WRITE its own players/<uid> document, only ADD to `mail`, and only
//     DELETE a `mail` document addressed to itself. It can never overwrite another player.
//   - Every write is rate-limited and size-capped; messages above 64 KB are dropped by ws.
//   - Identity is server-issued: every browser gets a uid plus a signed key (HMAC with a server
//     secret). hello must present a valid key, so nobody can claim someone else's uid.
//     Optional username + password logins (scrypt-hashed) let a player move to another device.
//   - Money is still client-authoritative (the game reports its own balance); see README.

const http = require("http");          // static file server
const fs = require("fs");              // read files and persist the database
const path = require("path");          // safe path joins
const crypto = require("crypto");      // random ids
const zlib = require("zlib");          // compress the big text files
const { WebSocketServer } = require("ws"); // the realtime transport
const REG = require("./regions.js");     // island regions and their locks (the server enforces them)

const PORT = process.env.PORT || 8080;                 // the port to listen on
const PUBLIC = path.join(__dirname, "public");         // where the game files live
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json"); // where saves persist
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".glb": "model/gltf-binary",".webmanifest": "application/manifest+json" };

// ---------- safety limits ----------
const MAX_DOC = 192 * 1024;  // biggest player save we accept (bytes of JSON); big homes and lots of friends need room
const MAX_MAIL = 2 * 1024;   // biggest money-transfer message
const MAX_PRESENCE = 4 * 1024; // biggest presence patch
const MAIL_CAP = 5000;       // keep at most this many mail documents (prune oldest)
const MAX_SUBS = 12;         // subscriptions per tab
const RATE_CAP = 40;         // write-token bucket size
const RATE_REFILL = 4;       // tokens added per second

const TOWN_KEEP = 3000, DM_KEEP = 400, DM_THREADS = 4000, CHAT_BACK = 40, TOWN_BACK = 250; // chat kept on the server: town lines (weeks of it), lines per private chat, private chats in all, private lines sent back on login, town lines sent back on login (older ones load on request)
function sizeOk(data, max) { try { return JSON.stringify(data).length <= max; } catch (e) { return false; } } // reject oversized or circular data
function allow(me) { // token-bucket rate limiter per connection
  const now = Date.now(); me.tokens = Math.min(RATE_CAP, me.tokens + (now - me.last) / 1000 * RATE_REFILL); me.last = now; // refill over time
  if (me.tokens < 1) return false; me.tokens -= 1; return true; // spend one token per write
}
const NEW_LIFE_EARN = 150000, NEW_LIFE_SEND = 5000, NEWLIFE_SENT = new Map(); // a new life may send only a little until it has earned something
const PAY_MAX = 1000000000; // the most one transfer can carry
function validMail(d) { // a money transfer must look right before we store it
  return d && typeof d.to === "string" && d.to.length > 0 && d.to.length <= 64 && Number.isFinite(+d.amt) && +d.amt >= 1 && +d.amt <= PAY_MAX; // recipient id + sane amount
}
function cleanMail(d) { return { to: String(d.to).slice(0, 64), from: String(d.from || "Someone").slice(0, 24), amt: Math.floor(+d.amt), at: Date.now() }; } // store only known fields, server timestamp
function pruneMail() { // keep the mail collection from growing without bound
  const ids = Object.keys(db.mail); if (ids.length <= MAIL_CAP) return; // still small enough
  ids.map((id) => [id, (db.mail[id] && db.mail[id].at) || 0]).sort((a, b) => a[1] - b[1]).slice(0, ids.length - MAIL_CAP).forEach(([id]) => delete db.mail[id]); // drop the oldest
}

// ---------- the little Firestore-like database (collections of documents) ----------
const dict = (o) => Object.assign(Object.create(null), o || {}); // a lookup table with no prototype (so "__proto__" is just a key)
const WALL_KEEP = 150; // anonymous notes kept on the Heart Wall
let db = { players: {}, mail: {}, nc: dict(), promo: { on: true, link: "https://chat.whatsapp.com/CNcLISBrDiGF93txjMtjcx", title: "Join the Flic en Flac Life community", text: "Join our WhatsApp community for updates, events and giveaways.", reward: 19000, id: 1 }, promoLog: dict(), agent: { on: true, w: dict(), cool: dict(), lastRoutine: Date.now() }, cases: dict(), caseLog: [], gov: null, govs: null, ledger: null, ledgerFeed: [], wealth: null, feedback: [], flex: [], salon: null, chal: null, crews: null, hr: null, hotw: null, rich: null, shops: dict(), homes: dict(), auth: { bound: dict(), accounts: dict(), names: dict() }, invites: dict(), news: [], removed: dict(), archive: dict(), live: dict(), liveOffers: dict(), parties: dict(), chat: { town: [], dm: dict() }, wall: [], stats: { users: dict(), days: dict() }, rewards: { users: dict(), inv: dict() }, fashion: { key: "", entries: dict(), votes: dict(), done: 0, ann: dict(), last: null } }; // public collections, plus private login data, home invites and town gossip
const BACKUP_DIR0 = path.join(path.dirname(DATA_FILE), "backups");
function readDataText() { // the saved game: the main file, or if it is damaged the half-written copy, or the newest daily backup (never start empty over a damaged file)
  const tryFile = (f) => { try { const txt = fs.readFileSync(f, "utf8"); JSON.parse(txt); return txt; } catch (e) { return null; } };
  const main = tryFile(DATA_FILE); if (main) return main; const exists = fs.existsSync(DATA_FILE);
  if (exists) { try { fs.copyFileSync(DATA_FILE, DATA_FILE + ".corrupt-" + Date.now()); console.error("DATA FILE IS DAMAGED: kept a copy and trying to recover"); } catch (e) {} }
  const tmp = tryFile(DATA_FILE + ".tmp"); if (tmp) { console.warn("recovered from the temporary save"); return tmp; }
  try { const names = fs.readdirSync(BACKUP_DIR0).filter((n) => /^data-\d{4}-\d{2}-\d{2}(-\d{2})?\.json$/.test(n)).sort().reverse(); for (const n of names) { const b = tryFile(path.join(BACKUP_DIR0, n)); if (b) { console.warn("recovered from backup " + n); return b; } } } catch (e) {}
  if (exists) console.error("NO USABLE SAVE OR BACKUP FOUND"); return "{}";
}
try { const loaded = JSON.parse(readDataText()); db.regions = loaded.regions && typeof loaded.regions === "object" ? loaded.regions : null; db.players = loaded.players || {}; db.mail = loaded.mail || {}; db.news = Array.isArray(loaded.news) ? loaded.news.slice(-60) : []; db.homes = dict(loaded.homes); db.removed = dict(loaded.removed); db.archive = dict(loaded.archive); db.heist = loaded.heist && typeof loaded.heist === 'object' ? loaded.heist : null; db.season = loaded.season && typeof loaded.season === 'object' ? loaded.season : null; db.belle = loaded.belle && typeof loaded.belle === 'object' ? loaded.belle : null; db.cutz = loaded.cutz && typeof loaded.cutz === 'object' ? loaded.cutz : null; db.biz = loaded.biz && typeof loaded.biz === 'object' ? loaded.biz : null; db.hw = loaded.hw && typeof loaded.hw === 'object' ? loaded.hw : null; db.hunt = loaded.hunt && typeof loaded.hunt === 'object' ? loaded.hunt : null; db.poll = loaded.poll && typeof loaded.poll === 'object' ? loaded.poll : null; db.trips = loaded.trips && typeof loaded.trips === 'object' ? loaded.trips : null; db.levy = loaded.levy && typeof loaded.levy === 'object' ? loaded.levy : null; db.disaster = loaded.disaster && typeof loaded.disaster === 'object' ? loaded.disaster : null; db.patron = loaded.patron && typeof loaded.patron === 'object' ? loaded.patron : null; db.parties = dict(loaded.parties); for (const k in db.parties) { const q = db.parties[k]; q.members = dict(q.members); } db.live = dict(loaded.live); db.liveOffers = dict(loaded.liveOffers); for (const k in db.live) db.live[k] = dict(db.live[k]); for (const k in db.liveOffers) db.liveOffers[k] = dict(db.liveOffers[k]); const a = loaded.auth || {}; db.auth = { bound: dict(a.bound), accounts: dict(a.accounts), names: dict(a.names) }; db.nc = dict(loaded.nc); db.promo = Object.assign({ on: true, link: "https://chat.whatsapp.com/CNcLISBrDiGF93txjMtjcx", title: "Join the Flic en Flac Life community", text: "Join our WhatsApp community for updates, events and giveaways.", reward: 19000, id: 1 }, loaded.promo || {}); db.agent = Object.assign({ on: true, w: dict(), cool: dict(), lastRoutine: Date.now() }, loaded.agent || {}); db.agent.w = dict(db.agent.w); db.agent.cool = dict(db.agent.cool); db.cases = dict(loaded.cases); db.caseLog = Array.isArray(loaded.caseLog) ? loaded.caseLog.slice(-100) : []; db.gov = loaded.gov || null; db.govs = loaded.govs || null; db.ledger = loaded.ledger || null; db.wealth = loaded.wealth || null; db.feedback = Array.isArray(loaded.feedback) ? loaded.feedback.slice(-2000) : []; db.flex = Array.isArray(loaded.flex) ? loaded.flex : []; db.salon = loaded.salon || null; db.chal = loaded.chal || null; db.crews = loaded.crews || null; db.hr = loaded.hr || null; db.hotw = loaded.hotw || null; db.design = loaded.design || null; db.cg = dict(loaded.cg); db.bz = loaded.bz || null; db.seizures = Array.isArray(loaded.seizures) ? loaded.seizures.slice(-1000) : []; db.assets = loaded.assets && typeof loaded.assets === "object" ? loaded.assets : {}; db.assetsSeeded = loaded.assetsSeeded || 0; db.proposals = Array.isArray(loaded.proposals) ? loaded.proposals.slice(-300) : []; db.payFix = loaded.payFix && typeof loaded.payFix === "object" ? loaded.payFix : {}; db.payFixAt = loaded.payFixAt || Date.now(); db.team = dict(loaded.team); db.ads = dict(loaded.ads); db.raid = loaded.raid || null; db.ledgerFeed = Array.isArray(loaded.ledgerFeed) ? loaded.ledgerFeed.slice(-2000) : []; db.promoLog = dict(loaded.promoLog); for (const k in db.promoLog) db.promoLog[k] = dict(db.promoLog[k]); db.rich = loaded.rich && typeof loaded.rich === "object" ? loaded.rich : null; db.shops = dict(loaded.shops); db.invites = dict(); for (const k in loaded.invites || {}) db.invites[k] = dict(loaded.invites[k]); const c = loaded.chat || {}; db.chat = { town: Array.isArray(c.town) ? c.town.slice(-TOWN_KEEP) : [], dm: dict(c.dm) }; db.wall = Array.isArray(loaded.wall) ? loaded.wall.slice(-WALL_KEEP) : []; db.chatRecovered = loaded.chatRecovered ? 1 : 0; const st = loaded.stats || {}; db.stats = { users: dict(st.users), days: dict(st.days) }; const rw = loaded.rewards || {}; db.rewards = { users: dict(rw.users), inv: dict(rw.inv) }; const fa = loaded.fashion || {}; db.fashion = { key: String(fa.key || ""), entries: dict(fa.entries), votes: dict(fa.votes), done: fa.done ? 1 : 0, ann: dict(fa.ann), last: fa.last || null }; } catch (e) {} // load last state (known collections only)
REG.init(db, persist, regionsChanged); // which regions are open, saved with everything else
const PUBLIC_COLS = ["players", "mail", "homes"];      // the only collections a tab may read (homes: which player lives at which address)
let saveTimer = null;                                  // debounce disk writes
const BACKUP_DIR = path.join(path.dirname(DATA_FILE), "backups"); // daily copies of everyone's progress, kept for two weeks
function backupDaily() { try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); const now = new Date(), f = path.join(BACKUP_DIR, "data-" + now.toISOString().slice(0, 10) + "-" + String(Math.floor(now.getUTCHours() / 6) * 6).padStart(2, "0") + ".json"); if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(db)); const old = fs.readdirSync(BACKUP_DIR).filter((n) => /^data-\d{4}-\d{2}-\d{2}(-\d{2})?\.json$/.test(n)).sort().slice(0, -56); for (const n of old) fs.unlinkSync(path.join(BACKUP_DIR, n)); } catch (e) { console.warn("backup failed", e.message); } } // a copy every 6 hours, the last 14 days kept
setTimeout(backupDaily, 60000); setInterval(backupDaily, 3600000); // a minute after start, then hourly (one file per day)
const PSTAT = { writes: 0, fails: 0, skipped: 0, lastOkAt: 0, lastErr: "", lastErrAt: 0, bytes: 0, ms: 0 }; let saving = false, dirty = false, maxPlayers = Object.keys(db.players).length; // how saving is going, for the admin page
function pFail(msg) { PSTAT.fails++; PSTAT.lastErr = String(msg).slice(0, 160); PSTAT.lastErrAt = Date.now(); console.error("SAVE FAILED:", PSTAT.lastErr); }
function writeSnapshot(sync) { // write everything to a temporary file, then swap it in, so a crash can never leave a half-written save
  const n = Object.keys(db.players).length; if (maxPlayers >= 10 && n < maxPlayers * 0.5) { PSTAT.skipped++; pFail("refused to save: players fell from " + maxPlayers + " to " + n); return false; } if (n > maxPlayers) maxPlayers = n;
  const t0 = Date.now(), tmp = DATA_FILE + ".tmp"; let body; try { body = JSON.stringify(db); } catch (e) { pFail(e.message); return false; }
  const done = () => { PSTAT.writes++; PSTAT.lastOkAt = Date.now(); PSTAT.bytes = body.length; PSTAT.ms = Date.now() - t0; };
  if (sync) { try { fs.writeFileSync(tmp, body); fs.renameSync(tmp, DATA_FILE); done(); return true; } catch (e) { pFail(e.message); return false; } }
  saving = true; fs.writeFile(tmp, body, (e) => { if (e) { saving = false; pFail(e.message); dirty = true; return; } fs.rename(tmp, DATA_FILE, (e2) => { saving = false; if (e2) { pFail(e2.message); dirty = true; return; } done(); if (dirty) { dirty = false; persist(); } }); }); return true;
}
function persist() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (saving) return; dirty = false; writeSnapshot(false); }, 400); } // write at most ~2x/sec, one write at a time
setInterval(() => { if (dirty && !saving) persist(); }, 15000); // never leave changes waiting
function flushAndExit(code) { try { clearTimeout(saveTimer); writeSnapshot(true); } catch (e) {} process.exit(code); } // a redeploy or restart saves everything first
process.on("SIGTERM", () => flushAndExit(0)); process.on("SIGINT", () => flushAndExit(0)); process.on("uncaughtException", (e) => { console.error("CRASH:", e && e.stack || e); flushAndExit(1); });

// ---------- player identity: signed keys, plus optional logins ----------
const SECRET_FILE = process.env.AUTH_SECRET_FILE || path.join(path.dirname(DATA_FILE), "auth-secret.txt"); // kept next to the saves
let SECRET = process.env.AUTH_SECRET || "";            // set AUTH_SECRET in production, or let the server make one
if (!SECRET) { try { SECRET = fs.readFileSync(SECRET_FILE, "utf8").trim(); } catch (e) {} }
if (!SECRET) { SECRET = crypto.randomBytes(32).toString("hex"); try { fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 }); } catch (e) { console.warn("Could not save " + SECRET_FILE + ": every player gets a new identity after a restart. Set AUTH_SECRET.", e.message); } }
const ALLOW_LEGACY = process.env.ALLOW_LEGACY_IDS !== "0"; // let browsers from before keys keep their old id; set ALLOW_LEGACY_IDS=0 once your players have moved over
const UID_RE = /^[a-z0-9]{6,40}$/, NAME_RE = /^[a-z0-9_]{3,20}$/; // what ids and usernames look like
function sign(uid) { return crypto.createHmac("sha256", SECRET).update(uid).digest("base64url"); } // the key that proves you own a uid
function keyOk(uid, key) { if (typeof key !== "string") return false; const a = Buffer.from(sign(uid)), b = Buffer.from(key); return a.length === b.length && crypto.timingSafeEqual(a, b); } // constant-time check
function hashPass(pass, salt) { return new Promise((ok, no) => crypto.scrypt(pass, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? no(e) : ok(k)))); } // slow on purpose
const loginFails = new Map();                          // username -> { n, until }: lock a name for a minute after 5 wrong passwords

// ---------- a recovery cookie: if a browser forgets who a player is (cleared storage, a purge), the cookie remembers ----------
const KEEP_AGE = 365 * 86400; // a year
const cookieOf = (req, name) => { const m = new RegExp("(?:^|;\\s*)" + name + "=([^;]+)").exec(String((req && req.headers && req.headers.cookie) || "")); return m ? m[1] : ""; };
function keepIdentity(req) { // the player this browser's recovery cookie names, if it is genuine (and still allowed)
  const v = cookieOf(req, "fefid"), i = v.indexOf("."); if (i < 1) return null; const uid = v.slice(0, i), token = v.slice(i + 1);
  return UID_RE.test(uid) && keyOk(uid, token) && !db.removed[uid] ? { uid, token } : null;
}
function keepRoute(req, res) { // POST /api/keep {uid, token}: set the cookie · DELETE /api/keep: clear it
  const secure = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https", base = "; Path=/; HttpOnly; SameSite=Lax" + (secure ? "; Secure" : "");
  if (req.method === "DELETE") { res.writeHead(204, { "set-cookie": "fefid=; Max-Age=0" + base, "cache-control": "no-store" }); return res.end(); }
  let body = ""; req.on("data", (c) => { body += c; if (body.length > 2000) req.destroy(); });
  req.on("end", () => { let m = {}; try { m = JSON.parse(body || "{}"); } catch (e) {} const uid = String(m.uid || ""), token = String(m.token || "");
    if (!UID_RE.test(uid) || !keyOk(uid, token) || db.removed[uid]) { res.writeHead(403, { "cache-control": "no-store" }); return res.end(); }
    res.writeHead(204, { "set-cookie": "fefid=" + uid + "." + token + "; Max-Age=" + KEEP_AGE + base, "cache-control": "no-store" }); res.end(); });
}
function whoIs(m) { // work out a connecting tab's uid from its hello; bound[uid] is 1 once its key is sent, 2 once the browser has used it
  const id = String(m.uid || "");
  if (UID_RE.test(id) && keyOk(id, m.token)) { if (db.auth.bound[id] !== 2) { db.auth.bound[id] = 2; persist(); } return id; } // returning player with a valid key
  if (ALLOW_LEGACY && UID_RE.test(id) && !m.token && db.auth.bound[id] !== 2) { if (!db.auth.bound[id]) { db.auth.bound[id] = 1; persist(); } return id; } // a browser from before keys existed claims its old id (again, if the key never reached it)
  const fresh = crypto.randomBytes(12).toString("hex"); db.auth.bound[fresh] = 2; persist(); return fresh; // no id, a wrong key, or someone else's id: a brand-new player (its key is required from now on)
}
// ---------- homes: one private address per player, entered only by its owner and invited guests ----------
const parties = new Map();                             // owner uid -> time their house party ends (anyone may come in until then)
const homeOf = (uid) => { for (const i in db.homes) if (db.homes[i].uid === uid && !db.homes[i].res) return +i; return -1; }; const resOf = (uid) => { for (const i in db.homes) if (db.homes[i].uid === uid && db.homes[i].res) return +i; return -1; }; // a reserved lot is a building site for a home you are still waiting for // a player's address number, or -1
function canVisit(owner, guest) { // may this guest be inside this owner's home (or their house party)?
  if (!owner || owner === guest) return true;           // your own place
  if ((parties.get(owner) || 0) > Date.now()) return true; // a party is on: open house
  if (db.design && db.design.entries && db.design.entries[owner]) return true; // listed in the Design Awards: anyone may tour it
  if (db.live[owner] && db.live[owner][guest]) return true; // they live there
  const inv = db.invites[owner]; return !!(inv && inv[guest] > Date.now()); // an invite that has not run out
}
const LIVE_MAX = 4, LIVE_KINDS = ["roommate", "partner"]; // living together: up to four people move in with an owner, and one of them may be a partner
const livesAtOf = (uid) => { for (const o in db.live) if (db.live[o][uid]) return o; return ""; }; // whose home someone has moved into
function liveInfo(uid) { // who lives in my home, where I live, and offers waiting for me
  const mine = Object.keys(db.live[uid] || {}).map((g) => ({ uid: g, kind: db.live[uid][g].kind, at: db.live[uid][g].at })), at = livesAtOf(uid), pend = Object.keys(db.liveOffers[uid] || {}).map((o) => ({ owner: o, kind: db.liveOffers[uid][o].kind, at: db.liveOffers[uid][o].at })), sent = []; for (const g in db.liveOffers) if (db.liveOffers[g][uid]) sent.push({ uid: g, kind: db.liveOffers[g][uid].kind });
  return { mine, at, kind: at ? db.live[at][uid].kind : "", offers: pend, sent };
}
function roomOwner(p) { // whose private room a presence says it is in ("" for public places)
  const where = typeof p.in === "string" ? p.in : "";
  if (where.startsWith("home:")) return where.slice(5); // someone's home
  if (where === "houseparty") return typeof p.ph === "string" ? p.ph : ""; // someone's house party
  return "";
}
function tellUid(uid, obj) { for (const [, p] of peers) if (p.uid === uid) send(p.ws, obj); } // every open tab of one player
function kickGuest(owner, guest) { // send a guest out of someone's home right away
  for (const [, p] of peers) if (p.uid === guest && roomOwner(p.presence || {}) === owner) { p.presence.in = ""; p.presence.ph = ""; peersDirty = true; send(p.ws, { t: "kicked", owner }); }
}
const TAM_BASE = 1000, TAM_PLOTS = 10; // the Tamarin Crown Estate: ten villas, addresses 1000 to 1009
const BEACH_BASE = 2000, BEACH_PLOTS = 7; // the Palm Beach lots on the sand: seven homes, addresses 2000 to 2006
const zoneOfIdx = (i) => (i >= BEACH_BASE ? "beach" : i >= TAM_BASE ? "tam" : "fef");
const zoneRange = (z) => (z === "beach" ? [BEACH_BASE, BEACH_PLOTS, "Palm Beach is full."] : [TAM_BASE, TAM_PLOTS, "The Tamarin Crown Estate is full."]);
function homes(ws, me, m) { // claim an address, invite or uninvite a guest, open your house for a party, list your invites
  const reply = (o) => send(ws, Object.assign({ t: "homes", rid: m.rid }, o));
  if (m.t === "home.claim") { // everyone gets the lowest free address, once
    let i = homeOf(me.uid); const zone = m.zone === "tam" || m.zone === "beach" || m.zone === "fef" ? m.zone : ""; // Flic en Flac plots are 0 and up; the Tamarin Crown Estate has its own addresses from 1000 and Palm Beach from 2000
    const rz = resOf(me.uid);
    if (zone && m.reserve) { if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); if (i >= 0 && zoneOfIdx(i) === zone) return reply({ ok: true, index: i }); if (rz >= 0 && zoneOfIdx(rz) === zone) return reply({ ok: true, index: i, reserved: rz }); if (rz >= 0) { delete db.homes[rz]; } // hold a lot while your new home is built, keeping your old home
      const [base, n, full] = zone === "fef" ? [0, 1e9, ""] : zoneRange(zone); let k = base; while (db.homes[k]) k++; if (k >= base + n) return reply({ ok: false, error: full }); db.homes[k] = { uid: me.uid, at: Date.now(), res: 1 }; persist(); fanout("homes"); return reply({ ok: true, index: i, reserved: k }); }
    if (m.release) { if (rz >= 0) { delete db.homes[rz]; persist(); fanout("homes"); } return reply({ ok: true, index: i }); }
    if (zone && rz >= 0 && zoneOfIdx(rz) === zone) { if (i >= 0) delete db.homes[i]; db.homes[rz] = { uid: me.uid, at: Date.now() }; persist(); fanout("homes"); return reply({ ok: true, index: rz }); } // the new home is finished: move in to the reserved lot
    if (zone && i >= 0 && zoneOfIdx(i) !== zone) { if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); // moving between places
      if (zone !== "fef") { const [base, n, full] = zoneRange(zone); let k = base; while (db.homes[k]) k++; if (k >= base + n) return reply({ ok: false, error: full }); delete db.homes[i]; db.homes[k] = { uid: me.uid, at: Date.now() }; i = k; }
      else { delete db.homes[i]; i = 0; while (db.homes[i]) i++; db.homes[i] = { uid: me.uid, at: Date.now() }; }
      persist(); fanout("homes"); return reply({ ok: true, index: i }); }
    if (i < 0) { if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); i = 0; while (db.homes[i]) i++; db.homes[i] = { uid: me.uid, at: Date.now() }; persist(); fanout("homes"); }
    return reply({ ok: true, index: i });
  }
  if (m.t === "home.invites") { // who has invited me, and until when
    const list = []; for (const owner in db.invites) { const until = db.invites[owner][me.uid]; if (until > Date.now()) list.push({ owner, until }); }
    return reply({ ok: true, list });
  }
  if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  const to = String(m.to || "");
  if (m.t === "home.invite") { // let one player in for a few hours
    if (!UID_RE.test(to) || to === me.uid) return reply({ ok: false, error: "You can't invite that player." });
    const until = Date.now() + Math.min(24, Math.max(1, Number(m.hours) || 3)) * 3600000, inv = db.invites[me.uid] || (db.invites[me.uid] = dict());
    for (const g in inv) if (inv[g] < Date.now()) delete inv[g]; // tidy old ones
    if (Object.keys(inv).length >= 50) return reply({ ok: false, error: "You have too many open invites. Cancel some first." });
    inv[to] = until; persist(); tellUid(to, { t: "invited", owner: me.uid, until }); return reply({ ok: true, until });
  }
  if (m.t === "home.view") { // how someone's home is laid out, fresh from the server, for a guest who may come in
    if (!UID_RE.test(to) || !canVisit(to, me.uid)) return reply({ ok: false, error: "You are not invited in." });
    const c = slimOf(to, db.players[to]); return reply({ ok: true, hv: c ? c.hv : null });
  }
  if (m.t === "home.uninvite") { // take an invite back (and walk them out if they are inside)
    const inv = db.invites[me.uid]; if (inv) delete inv[to]; persist(); if (!canVisit(me.uid, to)) kickGuest(me.uid, to); return reply({ ok: true });
  }
  if (m.t === "home.live") return reply(Object.assign({ ok: true }, liveInfo(me.uid))); // living together: the picture
  if (m.t === "home.liveInvite") { // ask someone to move in with me (as a roommate or a partner)
    const kind = LIVE_KINDS.includes(m.kind) ? m.kind : "roommate"; if (!UID_RE.test(to) || to === me.uid || !db.players[to] || db.removed[to]) return reply({ ok: false, error: "You can't ask that player." });
    if (homeOf(me.uid) < 0) return reply({ ok: false, error: "You need a home of your own first." }); if (livesAtOf(me.uid)) return reply({ ok: false, error: "You live in someone else's home. Move out first." });
    const res = db.live[me.uid] || (db.live[me.uid] = dict()); if (res[to]) return reply({ ok: false, error: "They already live with you." }); if (Object.keys(res).length >= LIVE_MAX) return reply({ ok: false, error: "Your home is full: up to " + LIVE_MAX + " people can live with you." });
    if (kind === "partner" && Object.values(res).some((r) => r.kind === "partner")) return reply({ ok: false, error: "You already live with a partner." });
    const offers = db.liveOffers[to] || (db.liveOffers[to] = dict()); if (!offers[me.uid] && Object.keys(offers).length >= 10) return reply({ ok: false, error: "They have too many offers waiting." });
    offers[me.uid] = { kind, at: Date.now() }; persist(); tellUid(to, { t: "live", ev: "offer", from: me.uid, name: nameOfSrv(me.uid), kind }); return reply({ ok: true });
  }
  if (m.t === "home.liveAnswer") { // accept or decline an offer to move in
    const owner = String(m.owner || ""), off = (db.liveOffers[me.uid] || {})[owner]; if (!off) return reply({ ok: false, error: "That offer is no longer there." }); delete db.liveOffers[me.uid][owner];
    if (!m.accept) { persist(); tellUid(owner, { t: "live", ev: "declined", from: me.uid, name: nameOfSrv(me.uid) }); return reply({ ok: true }); }
    const res = db.live[owner] || (db.live[owner] = dict()); if (homeOf(owner) < 0 || !db.players[owner]) return reply({ ok: false, error: "That home isn't there any more." }); if (Object.keys(res).length >= LIVE_MAX) return reply({ ok: false, error: "That home is full." });
    if (off.kind === "partner" && Object.values(res).some((r) => r.kind === "partner")) return reply({ ok: false, error: "They already live with a partner." }); if ((db.live[me.uid] && Object.keys(db.live[me.uid]).length) ) return reply({ ok: false, error: "People live in your home. Ask them to move out first." });
    const old = livesAtOf(me.uid); if (old) { delete db.live[old][me.uid]; tellUid(old, { t: "live", ev: "left", from: me.uid, name: nameOfSrv(me.uid) }); }
    res[me.uid] = { kind: off.kind, at: Date.now() }; persist(); tellUid(owner, { t: "live", ev: "accepted", from: me.uid, name: nameOfSrv(me.uid), kind: off.kind }); return reply(Object.assign({ ok: true }, liveInfo(me.uid)));
  }
  if (m.t === "home.liveLeave") { // a resident moves out, or the owner asks them to
    const owner = to ? me.uid : String(m.owner || livesAtOf(me.uid)), who = to || me.uid; if (!db.live[owner] || !db.live[owner][who]) return reply({ ok: false, error: "They don't live there." });
    delete db.live[owner][who]; persist(); tellUid(to ? to : owner, { t: "live", ev: to ? "evicted" : "left", from: me.uid, name: nameOfSrv(me.uid) }); if (!canVisit(owner, who)) kickGuest(owner, who); return reply({ ok: true });
  }
  if (m.t === "home.party") { // open house while a party runs (at most 15 minutes from now)
    const until = Math.min(Date.now() + 15 * 60000, Number(m.until) || 0), was = (parties.get(me.uid) || 0) > Date.now(); if (until > Date.now()) parties.set(me.uid, until); else parties.delete(me.uid);
    if (until > Date.now() && !was && Date.now() - (me.partyPostAt || 0) > 5 * 60000) { // a new party: invite everyone in the public chat, with a button that takes them there
      me.partyPostAt = Date.now(); const nm = cleanName((db.players[me.uid] || {}).name || (me.presence || {}).name) || "Someone", msg = { id: crypto.randomBytes(6).toString("hex"), from: me.uid, name: nm, to: "", text: ("🎉 " + nm + " is hosting a house party for the next 10 minutes! Everyone is welcome: come in and dance in their home. [[go:party" + me.uid + "]]").slice(0, 200), at: Date.now(), cid: "" };
      db.chat.town.push(msg); if (db.chat.town.length > TOWN_KEEP) db.chat.town.splice(0, db.chat.town.length - TOWN_KEEP); for (const [, p] of peers) if (p.uid) send(p.ws, { t: "chat", m: msg }); persist(); }
    return reply({ ok: true });
  }
  return reply({ ok: false, error: "Unknown request." });
}
setInterval(() => { for (const [owner, until] of parties) if (until <= Date.now()) { parties.delete(owner); for (const [, p] of peers) if (p.uid && roomOwner(p.presence || {}) === owner && !canVisit(owner, p.uid)) kickGuest(owner, p.uid); } }, 15000); // parties end: uninvited guests go home


// ---------- snack shops: an owner hires real students to work shifts ----------
const SHOP_WAGE = 1100, SHOP_CUT = 700, SHOP_STAFF = 4, SHOP_DAY = 6, SHOP_EARN_CAP = 500000, SHOP_OFFER_MS = 48 * 3600000; // a shift pays the student; part of what it brings in goes to the owner
const shopOf = (uid, make) => db.shops[uid] || (make ? (db.shops[uid] = { staff: dict(), offers: dict(), earned: 0 }) : null);
const nameOfSrv = (u) => String((db.players[u] || {}).name || "Someone").slice(0, 16);
const jobOf = (uid) => { for (const o in db.shops) if (db.shops[o].staff && db.shops[o].staff[uid]) return o; return ""; }; // the owner a student works for, if any
function shop(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "shop", rid: m.rid }, o)); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  const to = String(m.to || m.owner || ""), mine = shopOf(me.uid);
  if (m.t === "shop.info") { // my shop, my job, and the offers waiting for me
    const job = jobOf(me.uid), offers = []; for (const o in db.shops) { const at = db.shops[o].offers && db.shops[o].offers[me.uid]; if (at && Date.now() - at < SHOP_OFFER_MS) offers.push({ owner: o, name: nameOfSrv(o) }); }
    return reply({ ok: true, owned: mine ? { earned: mine.earned | 0, staff: Object.keys(mine.staff).map((u) => ({ uid: u, name: nameOfSrv(u), shifts: mine.staff[u].total | 0 })), offered: Object.keys(mine.offers).filter((u) => Date.now() - mine.offers[u] < SHOP_OFFER_MS).map((u) => ({ uid: u, name: nameOfSrv(u) })) } : null, job: job ? { owner: job, name: nameOfSrv(job), wage: SHOP_WAGE, left: Math.max(0, SHOP_DAY - ((db.shops[job].staff[me.uid].day === dayKey(Date.now())) ? db.shops[job].staff[me.uid].n | 0 : 0)) } : null, offers });
  }
  if (m.t === "shop.open") { shopOf(me.uid, true); persist(); return reply({ ok: true }); }
  if (m.t === "shop.close") { const sh = shopOf(me.uid); if (sh) { for (const u in sh.staff) tellUid(u, { t: "shop.fired", owner: me.uid }); delete db.shops[me.uid]; persist(); } return reply({ ok: true, earned: sh ? sh.earned | 0 : 0 }); }
  if (m.t === "shop.hire") {
    if (!mine) return reply({ ok: false, error: "Buy a snack shop first." }); if (!UID_RE.test(to) || to === me.uid || !db.players[to]) return reply({ ok: false, error: "You can't hire that player." });
    if (String(db.players[to].role) !== "student") return reply({ ok: false, error: "Only students can work shifts." }); if (mine.staff[to]) return reply({ ok: false, error: "They already work for you." });
    if (Object.keys(mine.staff).length >= SHOP_STAFF) return reply({ ok: false, error: "Your shop is full (" + SHOP_STAFF + " staff)." }); if (jobOf(to)) return reply({ ok: false, error: "They already have a snack job." });
    mine.offers[to] = Date.now(); persist(); tellUid(to, { t: "shop.offer", owner: me.uid, name: nameOfSrv(me.uid) }); return reply({ ok: true });
  }
  if (m.t === "shop.accept" || m.t === "shop.decline") {
    const sh = shopOf(to), at = sh && sh.offers[me.uid]; if (!at || Date.now() - at > SHOP_OFFER_MS) return reply({ ok: false, error: "That offer has run out." });
    delete sh.offers[me.uid]; if (m.t === "shop.decline") { persist(); return reply({ ok: true }); }
    if (jobOf(me.uid)) return reply({ ok: false, error: "You already have a snack job. Quit it first." }); if (String((db.players[me.uid] || {}).role) !== "student") return reply({ ok: false, error: "Only students can work shifts." });
    if (Object.keys(sh.staff).length >= SHOP_STAFF) return reply({ ok: false, error: "That shop is full." });
    sh.staff[me.uid] = { at: Date.now(), day: "", n: 0, total: 0, last: 0 }; persist(); tellUid(to, { t: "shop.hired", uid: me.uid, name: nameOfSrv(me.uid) }); return reply({ ok: true, owner: to, name: nameOfSrv(to), wage: SHOP_WAGE });
  }
  if (m.t === "shop.quit") { const o = jobOf(me.uid); if (o) { delete db.shops[o].staff[me.uid]; persist(); tellUid(o, { t: "shop.left", uid: me.uid, name: nameOfSrv(me.uid) }); } return reply({ ok: true }); }
  if (m.t === "shop.fire") { if (mine && mine.staff[to]) { delete mine.staff[to]; persist(); tellUid(to, { t: "shop.fired", owner: me.uid }); } if (mine && mine.offers[to]) { delete mine.offers[to]; persist(); } return reply({ ok: true }); }
  if (m.t === "shop.work") { // a student finished a shift
    const o = jobOf(me.uid); if (!o) return reply({ ok: false, error: "You don't have a snack job." }); const st = db.shops[o].staff[me.uid], day = dayKey(Date.now()), now = Date.now();
    if (String((db.players[me.uid] || {}).role) !== "student") return reply({ ok: false, error: "Only students can work shifts." }); if (st.day !== day) { st.day = day; st.n = 0; } if (st.n >= SHOP_DAY) return reply({ ok: false, error: "That's enough shifts for today. Back tomorrow." });
    if (now - (st.last || 0) < 20000) return reply({ ok: false, error: "Catch your breath first." }); st.n++; st.total = (st.total | 0) + 1; st.last = now; db.shops[o].earned = Math.min(SHOP_EARN_CAP, (db.shops[o].earned | 0) + SHOP_CUT); persist();
    tellUid(o, { t: "shop.shift", uid: me.uid, name: nameOfSrv(me.uid), cut: SHOP_CUT }); return reply({ ok: true, wage: SHOP_WAGE, owner: o, name: nameOfSrv(o), left: SHOP_DAY - st.n });
  }
  if (m.t === "shop.collect") { if (!mine) return reply({ ok: false, error: "You have no snack shop." }); const amt = mine.earned | 0; mine.earned = 0; persist(); return reply({ ok: true, amt }); }
  return reply({ ok: false, error: "Unknown request." });
}


// ---------- the community post: players join your group through the game, then claim a bonus (once each), and you track it in /admin ----------
const PROMO_WAIT = 20000, PROMO_IP_CAP = 5; // seconds between tapping the link and claiming, and bonuses per network per day
const promoLog = () => db.promoLog[db.promo.id] || (db.promoLog[db.promo.id] = dict());
const promoLive = () => !!(db.promo.on && /^https:\/\//.test(db.promo.link));
const ipHash = (req) => crypto.createHash("sha256").update(String((req && req.headers && req.headers["x-forwarded-for"]) || (req && req.socket && req.socket.remoteAddress) || "").split(",")[0].trim() + SECRET).digest("hex").slice(0, 16);
function promoView(uid) { const L = promoLog()[uid] || {}; return { ok: true, on: promoLive(), title: db.promo.title, text: db.promo.text, reward: db.promo.reward | 0, id: db.promo.id, tapped: !!L.tap, claimed: !!L.claim }; }
function promo(ws, me, m) { // a player sees the post, and claims the bonus
  const reply = (o) => send(ws, Object.assign({ t: "promo", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet." }); const log = promoLog(), L = log[me.uid] || (log[me.uid] = { name: "", shown: 0, tap: 0, claim: 0 });
  L.name = String((db.players[me.uid] || {}).name || (me.presence || {}).name || L.name || "Player").slice(0, 16);
  if (m.t === "promo.get") { if (promoLive() && !L.shown) { L.shown = Date.now(); persist(); } return reply(promoView(me.uid)); }
  if (m.t === "promo.claim") {
    if (!promoLive()) return reply({ ok: false, error: "This offer isn't running right now." }); if (L.claim) return reply(Object.assign(promoView(me.uid), { ok: false, error: "You already claimed this bonus." }));
    if (!L.tap) return reply(Object.assign(promoView(me.uid), { ok: false, error: "Tap Join first, join the group, then come back and claim." })); if (Date.now() - L.tap < PROMO_WAIT) return reply(Object.assign(promoView(me.uid), { ok: false, error: "Finish joining the group first, then press Claim." }));
    if (!db.players[me.uid]) return reply(Object.assign(promoView(me.uid), { ok: false, error: "Play for a minute first, then claim." }));
    const ip = me.ipH || "", day = dayKey(Date.now()); let n = 0; for (const u in log) if (log[u].claim && log[u].ip === ip && dayKey(log[u].claim) === day) n++; if (ip && n >= PROMO_IP_CAP) return reply(Object.assign(promoView(me.uid), { ok: false, error: "This network has claimed the maximum for today. Try again tomorrow." }));
    L.claim = Date.now(); L.ip = ip; L.paid = db.promo.reward | 0; rewardCoins(me.uid, L.paid, "Community bonus", "📣 Thanks for joining the community!"); persist(); return reply(Object.assign(promoView(me.uid), { ok: true, paid: L.paid }));
  }
}
function promoGo(req, res, q) { // GET /go/join?uid=&token=: note the tap, then send the player to the group
  const uid = String(q.get("uid") || ""), token = String(q.get("token") || "");
  if (promoLive() && UID_RE.test(uid) && keyOk(uid, token) && !db.removed[uid]) { const log = promoLog(), L = log[uid] || (log[uid] = { name: "", shown: 0, tap: 0, claim: 0 }); L.name = String((db.players[uid] || {}).name || L.name || "Player").slice(0, 16); if (!L.tap) L.tap = Date.now(); L.taps = (L.taps | 0) + 1; persist(); }
  res.writeHead(302, { location: promoLive() ? db.promo.link : "/", "cache-control": "no-store" }); res.end();
}
function promoReport() { // what the admin sees
  const log = promoLog(), rows = Object.keys(log).map((u) => ({ uid: u, name: String((db.players[u] || {}).name || log[u].name || "Player"), shown: log[u].shown || 0, tap: log[u].tap || 0, taps: log[u].taps | 0, claim: log[u].claim || 0, paid: log[u].paid | 0 })).sort((a, b) => (b.claim || 0) - (a.claim || 0) || b.tap - a.tap || b.shown - a.shown);
  return { promo: db.promo, live: promoLive(), stats: { shown: rows.filter((r) => r.shown).length, tapped: rows.filter((r) => r.tap).length, claimed: rows.filter((r) => r.claim).length, paid: rows.reduce((a, r) => a + r.paid, 0), players: Object.keys(db.players).length }, list: rows.slice(0, 500) };
}

async function account(ws, me, m) { // create a login for this character, or log in to another one
  const reply = (o) => send(ws, Object.assign({ t: "account", rid: m.rid }, o));
  if (!allow(me) || !allow(me)) return reply({ ok: false, error: "Slow down a little." }); // costs two write tokens
  const name = String(m.name || "").trim().toLowerCase(), pass = String(m.pass || "");
  if (!NAME_RE.test(name)) return reply({ ok: false, error: "Usernames are 3-20 letters, numbers or _." });
  if (pass.length < 8 || pass.length > 200) return reply({ ok: false, error: "Passwords need at least 8 characters." });
  try {
    if (m.t === "account.register") {
      const taken = () => db.auth.accounts[name] ? "That username is taken." : db.auth.names[me.uid] ? "This character already has a login." : ""; // one login per character, one character per login
      if (taken()) return reply({ ok: false, error: taken() });
      const salt = crypto.randomBytes(16).toString("hex"), hash = (await hashPass(pass, salt)).toString("hex");
      if (taken()) return reply({ ok: false, error: taken() }); // someone may have taken it while we hashed
      db.auth.accounts[name] = { uid: me.uid, salt, hash, at: Date.now() }; db.auth.names[me.uid] = name; persist();
      return reply({ ok: true, name });
    }
    const f = loginFails.get(name); if (f && f.until > Date.now()) return reply({ ok: false, error: "Too many tries. Wait a minute and try again." });
    let acc = db.auth.accounts[name], banned = null; if (!acc) for (const u in db.removed) { const r = db.removed[u]; if (r.ban && r.login === name && db.archive[u] && db.archive[u].acc) { acc = db.archive[u].acc; banned = r; break; } } // a banned player's login is kept, only to tell them why they cannot come in
    const got = await hashPass(pass, acc ? acc.salt : "no-such-user"); // same work whether or not the name exists
    if (!acc || !crypto.timingSafeEqual(got, Buffer.from(acc.hash, "hex"))) {
      const n = (f ? f.n : 0) + 1; if (loginFails.size > 10000) loginFails.clear(); loginFails.set(name, { n, until: n >= 5 ? Date.now() + 60000 : 0 });
      return reply({ ok: false, error: "Wrong username or password." });
    }
    if (banned) return reply({ ok: false, banned: true, error: "⛔ This account has been banned from Flic en Flac Life." + (banned.reason ? " Reason: " + banned.reason + "." : "") + " If you think this is a mistake, contact us. " + SUPPORT_LINE });
    loginFails.delete(name); return reply({ ok: true, name, uid: acc.uid, token: sign(acc.uid) }); // the browser switches to this character
  } catch (e) { return reply({ ok: false, error: "Something went wrong. Try again." }); }
}

// ---------- admin: find and delete players (only when ADMIN_KEY is set on the server) ----------
const ADMIN_KEY = String(process.env.ADMIN_KEY || ""); // the password for /admin; at least 12 characters, or the admin tools stay off
const adminFails = new Map();                          // ip -> { n, until }: lock out after 8 wrong keys
function adminOk(req) { // is this request from someone holding the admin key?
  if (ADMIN_KEY.length < 12) return false; const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(got).digest(), b = crypto.createHash("sha256").update(ADMIN_KEY).digest(); return crypto.timingSafeEqual(a, b); // constant-time compare
}
function playerRow(uid) { // what the admin page shows about one player
  const d = db.players[uid] || {}, login = db.auth.names[uid] || "", online = [...peers.values()].some((p) => p.uid === uid && !p.away);
  return { uid, name: String(d.name || "(no name)").slice(0, 24), login, money: Number.isFinite(d.money) ? Math.round(d.money) : 0, role: String(d.role || ""), joined: d.joined || 0, savedAt: d.savedAt || 0, home: homeOf(uid), online, cheat: ((db.cg[uid] || {}).flags || []).length };
}
const SUPPORT_LINE = "Support: WhatsApp +230 5933 0011 or the Team chat in the game.";
function archiveOf(src, uid) { // everything needed to bring one player back: their save, their login and their house address
  const login = (src.auth.names || {})[uid] || "", acc = login && src.auth.accounts[login] && src.auth.accounts[login].uid === uid ? src.auth.accounts[login] : null, homes = {}; for (const i in src.homes || {}) if (src.homes[i] && src.homes[i].uid === uid) homes[i] = src.homes[i];
  return src.players[uid] ? { player: src.players[uid], login, acc, homes } : null;
}
function removePlayer(uid, ban, reason) { // delete everything about one player, and kick them out if they are online
  const keep = archiveOf(db, uid); if (keep) db.archive[uid] = Object.assign(keep, { at: Date.now() }); // kept in the data file so an admin can bring them back with their progress
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); fs.writeFileSync(path.join(BACKUP_DIR, "before-delete-" + uid + "-" + Date.now() + ".json"), JSON.stringify(db)); } catch (e) { return "Could not write a backup, so nothing was deleted: " + e.message; } // a backup first, always
  const name = (db.players[uid] || {}).name || ""; delete db.players[uid]; // their save
  const login = db.auth.names[uid]; if (login && db.auth.accounts[login] && db.auth.accounts[login].uid === uid) delete db.auth.accounts[login]; delete db.auth.names[uid]; // their username and password
  for (const i in db.homes) if (db.homes[i].uid === uid) delete db.homes[i]; parties.delete(uid); // their address goes back to the pool
  delete db.invites[uid]; for (const o in db.invites) delete db.invites[o][uid]; // invites from and to them
  partyDrop(uid);   delete db.live[uid]; for (const o in db.live) delete db.live[o][uid]; delete db.liveOffers[uid]; for (const g in db.liveOffers) delete db.liveOffers[g][uid]; // where they lived, who lived with them, and offers
  for (const id in db.mail) if (db.mail[id].to === uid) delete db.mail[id]; db.news = db.news.filter((n) => n.uid !== uid && n.vuid !== uid); // money waiting for them, and gossip about them
  db.chat.town = db.chat.town.filter((c) => c.from !== uid); db.wall = db.wall.filter((w) => w.uid !== uid); for (const k in db.chat.dm) if (k.split("|").includes(uid)) delete db.chat.dm[k]; // their messages
  db.removed[uid] = { at: Date.now(), ban: !!ban, name: String(name).slice(0, 24), login: login || "", reason: String(reason || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 140) }; persist(); // remember, so their browser starts fresh (or stays out if banned)
  for (const [id, p] of peers) if (p.uid === uid) { send(p.ws, { t: "removed", ban: !!ban, reason: db.removed[uid].reason }); const w = p.ws; setTimeout(() => { try { w && w.close(); } catch (e) {} }, 300); peers.delete(id); } // kick them out now
  peersDirty = true; fanout("players"); fanout("homes"); fanout("mail"); return ""; // everyone's lists update
}
function adminApi(req, res, url) { // the JSON API behind /admin
  const json = (code, o) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(o)); };
  if (ADMIN_KEY.length < 12) return json(404, { ok: false, error: "Admin is turned off. Set ADMIN_KEY (12+ characters) on the server and restart it." });
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(), f = adminFails.get(ip);
  if (f && f.until > Date.now()) return json(429, { ok: false, error: "Too many wrong keys. Wait 10 minutes." });
  if (!adminOk(req)) { const n = (f ? f.n : 0) + 1; if (adminFails.size > 5000) adminFails.clear(); adminFails.set(ip, { n, until: n >= 8 ? Date.now() + 600000 : 0 }); return json(401, { ok: false, error: "Wrong admin key." }); }
  adminFails.delete(ip); const q = new URL(req.url, "http://x").searchParams;
  if (req.method === "GET" && url === "/api/admin/players") { // search by name, login or id
    const s = String(q.get("q") || "").trim().toLowerCase(), ids = Object.keys(db.players).filter((uid) => { if (!s) return true; const r = playerRow(uid); return r.name.toLowerCase().includes(s) || r.login.includes(s) || uid.includes(s); });
    const rows = ids.map(playerRow).sort((a, b) => a.name.localeCompare(b.name)); return json(200, { ok: true, total: Object.keys(db.players).length, count: rows.length, players: rows.slice(0, 200) });
  }
  if (url === "/api/admin/feedback" && (req.method === "GET" || req.method === "POST")) { // bug reports, ideas and ratings: read, resolve, delete
    const report = (qs) => { const kind = String((qs && qs.get("kind")) || ""), openOnly = !!(qs && qs.get("open")); let rows = db.feedback.slice(); const rated = rows.filter((r) => r.rating > 0), dist = [0, 0, 0, 0, 0, 0]; for (const r of rated) dist[r.rating]++;
      const counts = {}; for (const k of FB_KINDS) counts[k] = rows.filter((r) => r.kind === k).length; if (FB_KINDS.includes(kind)) rows = rows.filter((r) => r.kind === kind); if (openOnly) rows = rows.filter((r) => !r.done);
      return { ok: true, total: db.feedback.length, openCount: db.feedback.filter((r) => !r.done).length, avg: rated.length ? Math.round(rated.reduce((a, r) => a + r.rating, 0) / rated.length * 100) / 100 : 0, ratings: rated.length, dist: dist.slice(1), counts, rows: rows.sort((a, b) => b.t - a.t).slice(0, 300) }; };
    if (req.method === "GET") return json(200, report(new URL(req.url, "http://x").searchParams));
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 2000) req.destroy(); });
    req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (b.done) { const r = db.feedback.find((q) => q.id === String(b.done)); if (r) r.done = r.done ? 0 : 1; } if (b.delete) db.feedback = db.feedback.filter((q) => q.id !== String(b.delete)); persist(); json(200, report(null)); }); return; }
  if (req.method === "GET" && url.startsWith("/api/admin/ledger")) { // every transaction: the latest across the game, or one player's, with totals
    const qs = new URL(req.url, "http://x").searchParams, uid = String(qs.get("uid") || ""), q = String(qs.get("q") || "").trim().toLowerCase(), limit = Math.max(1, Math.min(2000, +qs.get("limit") || 300));
    let rows = uid ? (db.ledger[uid] || []).map((r) => Object.assign({ u: uid, n: String((db.players[uid] || {}).name || "") }, r)) : db.ledgerFeed.slice();
    if (q) rows = rows.filter((r) => String(r.n || "").toLowerCase().includes(q) || String(r.l || "").toLowerCase().includes(q) || (db.auth.names[r.u] || "").includes(q));
    rows = rows.sort((a, b) => b.t - a.t).slice(0, limit); let inn = 0, out = 0; for (const r of rows) { if (r.a > 0) inn += r.a; else out += -r.a; }
    return json(200, { ok: true, rows, count: rows.length, totalIn: inn, totalOut: out, players: Object.keys(db.ledger).length });
  }
  if (req.method === "GET" && url.startsWith("/api/admin/income")) { // where one player's money comes from: lifetime totals by kind, the biggest sources, and the latest lines
    const uid = String(new URL(req.url, "http://x").searchParams.get("uid") || ""), d = db.players[uid]; if (!d) return json(404, { ok: false, error: "No such player." });
    let sv = {}; try { sv = JSON.parse(d.save || "{}") || {}; } catch (e) {} const rows = (db.ledger[uid] || []).slice().sort((a, b) => b.t - a.t), by = {}, byPlace = {};
    for (const r of rows) { const k = r.l; const g = by[k] || (by[k] = { l: k, n: 0, inn: 0, out: 0 }); g.n++; if (r.a > 0) g.inn += r.a; else g.out += -r.a; if (r.a > 0) { const w = r.w || "elsewhere"; byPlace[w] = (byPlace[w] || 0) + r.a; } }
    const groups = Object.values(by), inn = rows.reduce((a, r) => a + (r.a > 0 ? r.a : 0), 0), out = rows.reduce((a, r) => a + (r.a < 0 ? -r.a : 0), 0), raid = db.raid || {};
    return json(200, { ok: true, name: String(d.name || ""), cash: Math.round(Number(sv.money) || 0), worth: Math.round(Number(d.money) || 0), src: srcOf(d), since: rows.length ? rows[rows.length - 1].t : 0, inn, out, count: rows.length,
      topIn: groups.filter((g) => g.inn > 0).sort((a, b) => b.inn - a.inn).slice(0, 12), topOut: groups.filter((g) => g.out > 0).sort((a, b) => b.out - a.out).slice(0, 6), places: Object.entries(byPlace).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w, a]) => ({ w, a })),
      recent: rows.slice(0, 40), flags: ((db.cg[uid] || {}).flags || []).slice().reverse(), raidsDone: (raid.att && raid.att[uid] && raid.att[uid].n) || 0, raided: (raid.rep && raid.rep[uid] || []).length });
  }
  if (req.method === "GET" && url === "/api/admin/ads") { // how each ad is doing: totals, unique players and the last 14 days
    const out = {}; for (const id of AD_IDS) { const a = db.ads[id] || { days: {} }, days = Object.keys(a.days).sort(), tot = { view: 0, open: 0, click: 0 }, uv = { view: new Set(), open: new Set(), click: new Set() };
      for (const dk of days) { const d = a.days[dk]; for (const ev of AD_EVS) tot[ev] += d[ev] | 0; for (const u of Object.keys(d.u || {})) for (const ev of AD_EVS) if (d.u[u][ev]) uv[ev].add(u); }
      out[id] = { rewards: (() => { const r = (db.ads[id] || {}).rewards || {}, o = { click: 0, visit: 0, paid: 0 }; for (const u in r) for (const k of ["click", "visit"]) if (r[u][k]) { o[k]++; o.paid += (AD_REWARD[id] || {})[k] || 0; } return o; })(), announced: (db.ads[id] || {}).announced || 0, codes: Object.entries((db.ads[id] || {}).codes || {}).map(([u, c]) => ({ name: playerName(u), login: db.auth.names[u] || "", code: c.code, at: c.at })).sort((x, y) => x.at - y.at), total: tot, players: { view: uv.view.size, open: uv.open.size, click: uv.click.size }, days: days.slice(-14).map((dk) => ({ day: dk, view: a.days[dk].view | 0, open: a.days[dk].open | 0, click: a.days[dk].click | 0 })) }; }
    return json(200, { ok: true, ads: out });
  }
  if (url.startsWith("/api/admin/team") && (req.method === "GET" || req.method === "POST")) { // the team inbox: who wrote, read a conversation, reply
    if (req.method === "GET") { const qs = new URL(req.url, "http://x").searchParams, uid = String(qs.get("uid") || "");
      if (uid) { const c = db.team[uid]; if (!c) return json(404, { ok: false, error: "No messages." }); c.un = 0; persist(); return json(200, { ok: true, name: playerName(uid), m: c.m }); }
      const rows = Object.keys(db.team).filter((u) => db.team[u].m.some((q) => q.from === "me")).map((u) => { const c = db.team[u], last = c.m[c.m.length - 1]; return { uid: u, name: playerName(u), login: db.auth.names[u] || "", un: c.un | 0, last }; }).sort((a, b) => (b.last.at || 0) - (a.last.at || 0)).slice(0, 200); return json(200, { ok: true, rows, unread: rows.reduce((a, r) => a + (r.un ? 1 : 0), 0) }); }
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 2000) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const uid = String(b.uid || ""), text = String(b.text || "").trim().slice(0, 400); if (!UID_RE.test(uid) || !(db.players[uid] || db.team[uid]) || !text) return json(400, { ok: false, error: "Pick a player and write a reply." });
      const m2 = teamPush(uid, "team", text); teamOf(uid).un = 0; persist(); tellUid(uid, { t: "team", m: m2 }); json(200, { ok: true }); }); return; }
  if (req.method === "GET" && url === "/api/admin/requests") { // seizures the cheat watch is asking for: nothing happens until you decide
    const rows = db.proposals.filter((q) => q.status === "pending").slice().reverse(), done = db.proposals.filter((q) => q.status !== "pending").slice(-20).reverse(); return json(200, { ok: true, rows, done }); }
  if (req.method === "POST" && url === "/api/admin/requests") { // approve (take the money) or decline (leave it)
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 1000) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const q = db.proposals.find((x) => x.id === String(b.id || "")); if (!q || q.status !== "pending") return json(404, { ok: false, error: "That request is already decided." });
      if (b.decision === "decline") { q.status = "declined"; q.decidedAt = Date.now(); persist(); return json(200, { ok: true }); }
      if (b.decision !== "approve") return json(400, { ok: false, error: "Approve or decline." }); const d = db.players[q.uid]; if (!d) return json(404, { ok: false, error: "That player no longer exists." }); const T = govT(b.town), amt = Math.max(1, Math.min(Math.round(+b.amt || q.amt), q.amt)), now = Date.now();
      (db.raid.debit[q.uid] = db.raid.debit[q.uid] || []).push({ id: crypto.randomBytes(5).toString("hex"), amt, by: "", kind: "seize", note: "Money that could not be explained was removed.", at: now }); if (db.raid.debit[q.uid].length > 30) db.raid.debit[q.uid].shift(); if (b.town) treasuryAdd(T, amt); seizeLog(q.uid, amt, "approved request", b.town ? T : "", q.reason); worthDown(q.uid, amt); tellUid(q.uid, { t: "raidhit" }); q.status = "approved"; q.decidedAt = now; q.took = amt; persist(); json(200, { ok: true, amt }); }); return; }
  if (req.method === "GET" && url === "/api/admin/lostpay") { // transfers over Rs 10,000,000 that the game threw away on arrival (found in the private chats), and which ones you have already paid out
    const rows = []; for (const k of Object.keys(db.chat.dm)) for (const m of db.chat.dm[k]) if (m && m.pay > 10000000 && m.at < db.payFixAt && m.to && db.players[m.to]) rows.push({ id: m.id, from: m.from, fromName: String(m.name || "").slice(0, 24), to: m.to, toName: String((db.players[m.to] || {}).name || "").slice(0, 24), amt: m.pay, at: m.at, paid: db.payFix[m.id] || 0 });
    return json(200, { ok: true, rows: rows.sort((a, b) => b.at - a.at).slice(0, 200) }); }
  if (req.method === "POST" && url === "/api/admin/lostpay") { // pay one of them to the player who never got it
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 500) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } let hit = null; for (const k of Object.keys(db.chat.dm)) for (const m of db.chat.dm[k]) if (m && m.id === String(b.id || "") && m.pay > 10000000 && m.at < db.payFixAt) hit = m;
      if (!hit || !db.players[hit.to]) return json(404, { ok: false, error: "No such transfer." }); if (db.payFix[hit.id]) return json(400, { ok: false, error: "Already paid out." }); for (let left = hit.pay; left > 0;) { const part = Math.min(left, 9500000); mailTo(hit.to, part, "Transfer from " + String(hit.name || "a player").slice(0, 16) + " (re-sent)", "Game team"); left -= part; } db.payFix[hit.id] = Date.now(); persist(); json(200, { ok: true, amt: hit.pay }); }); return; }
  if (req.method === "GET" && url.startsWith("/api/admin/dossier")) { // everything we hold on one player, for an investigation
    const uid = String(new URL(req.url, "http://x").searchParams.get("uid") || ""), d = db.players[uid]; if (!d) return json(404, { ok: false, error: "No such player." });
    let sv = {}; try { sv = JSON.parse(d.save || "{}") || {}; } catch (e) {}
    const led = (db.ledger[uid] || []).slice().sort((a, b) => a.t - b.t), tr = [];
    for (const k of Object.keys(db.chat.dm)) for (const m of db.chat.dm[k]) if (m && m.pay > 0 && (m.from === uid || m.to === uid)) tr.push({ id: m.id, at: m.at, dir: m.from === uid ? "sent" : "received", amount: m.pay, other: m.from === uid ? m.to : m.from, otherName: String((db.players[m.from === uid ? m.to : m.from] || {}).name || ""), note: String(m.text || "").slice(0, 80) });
    tr.sort((a, b) => a.at - b.at); const kinds = {}; for (const r of led) { const g = kinds[r.l] || (kinds[r.l] = { n: 0, inn: 0, out: 0 }); g.n++; if (r.a > 0) g.inn += r.a; else g.out += -r.a; }
    const sent = {}; for (const t of tr) if (t.dir === "received") { const o = sent[t.other] || (sent[t.other] = { name: t.otherName, n: 0, total: 0 }); o.n++; o.total += t.amount; }
    const others = Object.keys(sent).map((u) => { const l2 = db.ledger[u] || []; return { uid: u, name: sent[u].name, received: sent[u].total, transfers: sent[u].n, theirWorth: Math.round(Number((db.players[u] || {}).money) || 0), theirBigDebits: l2.filter((r) => r.a <= -1000000).slice(-10).map((r) => ({ t: r.t, l: r.l, a: r.a })) }; });
    return json(200, { ok: true, exportedAt: Date.now(), uid, name: String(d.name || ""), login: db.auth.names[uid] || "", joined: d.joined || 0, savedAt: d.savedAt || 0, worth: Math.round(Number(d.money) || 0), cash: Math.round(Number(sv.money) || 0), income: srcOf(d),
      saveSummary: { biz: sv.biz || null, inv: sv.inv || null, bank: sv.bank != null ? sv.bank : sv.savings != null ? sv.savings : null, home: sv.home, car: sv.car }, cheatWatch: db.cg[uid] || null, ledgerCount: led.length, ledgerByKind: kinds, ledger: led, transfers: tr, senders: others,
      netWorthHistory: db.agent.w[uid] || [], assets: db.assets[uid] || [], seizures: db.seizures.filter((z) => z.uid === uid), pendingMail: (db.mail[uid] || []).slice(0, 50) });
  }
  if (url === "/api/admin/season") { // see the season, change when it starts, the cash reset and the wealth levy, or start Season 2 now
    const S = db.season, L = db.levy; if (req.method === "GET") return json(200, { ok: true, n: S.n, at: S.at, start: S.start, wipe: S.wipe, levy: { on: L.on, mult: L.mult, total: L.total, hits: L.hits, last: L.last }, firedAt: S.firedAt, count: S.count, hall: S.hall, preview: S.n < 2 ? seasonPreview() : null });
    if (req.method === "POST") { let body = ""; req.on("data", (c) => { body += c; if (body.length > 1000) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (b.levyOn !== undefined) L.on = b.levyOn === true; if (b.levyMult !== undefined) { const m = +b.levyMult; if (!Number.isFinite(m) || m < 0 || m > 5) return json(400, { ok: false, error: "Levy strength must be between 0 and 5." }); L.mult = m; }
      if (S.n < 2) {
        if (b.wipe !== undefined) S.wipe = b.wipe === true;
        if (b.at !== undefined) { const at = +b.at; if (!Number.isFinite(at) || at < Date.now() - 60000) return json(400, { ok: false, error: "Pick a time in the future." }); S.at = at; }
        if (b.start !== undefined) { const st = Math.round(+b.start); if (!Number.isFinite(st) || st < 1000 || st > 5000000) return json(400, { ok: false, error: "Starting cash must be between 1,000 and 5,000,000." }); S.start = st; }
        if (b.fire === true) { const r = seasonFire("admin"); if (!r.ok) return json(400, r); return json(200, { ok: true, fired: true, players: r.players }); }
      } else if (b.fire === true || b.wipe !== undefined || b.at !== undefined || b.start !== undefined) return json(400, { ok: false, error: "Season 2 has already started." });
      persist(); json(200, { ok: true }); }); return; } }
  if (url === "/api/admin/regions") { // open or close regions of the island, or set the date one opens
    if (req.method === "GET") return json(200, { ok: true, regions: REG.list(), now: Date.now() });
    if (req.method === "POST") { let body = ""; req.on("data", (c) => { body += c; if (body.length > 500) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const r = REG.adminSet(b); json(r.ok ? 200 : 400, r); }); return; } }
  if (url === "/api/admin/disaster") { // switch automatic disasters on or off, set one off now, see what the last ones cost
    const D = db.disaster; if (req.method === "GET") return json(200, { ok: true, auto: D.auto, cur: D.cur, next: D.next, total: D.total, log: D.log.slice(-8).reverse(), seasonLive: db.season.n >= 2 });
    if (req.method === "POST") { let body = ""; req.on("data", (c) => { body += c; if (body.length > 500) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (b.auto !== undefined) D.auto = b.auto === true; if (b.start) { const r = disasterStart(String(b.start), "admin"); if (!r.ok) return json(400, r); } if (b.cancel === true && D.cur) { D.cur = null; disasterCast("end"); } persist(); json(200, { ok: true }); }); return; } }
  if (url === "/api/admin/belle") { // Belle's Kitchen: see the bookings, answer them, change the discount and WhatsApp number
    const c = BEL.cfg; if (req.method === "GET") return json(200, { ok: true, cfg: c, list: Object.values(BEL.bk).sort((a, b) => slotAt(b.date, b.hour) - slotAt(a.date, a.hour)).slice(0, 80) });
    if (req.method === "POST") { let body = ""; req.on("data", (x) => { body += x; if (body.length > 1500) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (b.pct !== undefined) { const v = Math.round(+b.pct); if (!(v >= 0 && v <= 60)) return json(400, { ok: false, error: "Discount must be 0 to 60." }); c.pct = v; }
      if (b.whatsapp !== undefined) { const w = String(b.whatsapp).replace(/\D/g, ""); if (w.length < 8 || w.length > 15) return json(400, { ok: false, error: "Use the full number with country code, digits only." }); c.whatsapp = w; c.show = "+" + w.slice(0, 3) + " " + w.slice(3, 7) + " " + w.slice(7); }
      if (b.code) { const k = BEL.bk[String(b.code)]; if (!k) return json(404, { ok: false, error: "No such booking." }); if (!["confirmed", "declined", "done", "booked"].includes(String(b.status))) return json(400, { ok: false, error: "Bad status." }); k.status = String(b.status); k.reply = blClean(b.reply, 140);
        tellUid(k.uid, { t: "belle", ev: "upd", code: k.code, status: k.status, text: k.reply }); }
      persist(); json(200, { ok: true }); }); return; } }
  if (url === "/api/admin/trips") { // student driver trips: the on/off switch, who can test it, verify drivers, requests and reports
    const T = db.trips; if (req.method === "GET") return json(200, { ok: true, on: T.on, cfg: T.cfg, paid: T.paid, testers: T.testers.map((u) => ({ uid: u, name: nameOfSrv(u) })), drivers: Object.entries(T.drivers).map(([u, d]) => ({ uid: u, name: d.name, wa: d.wa, car: d.car, verified: !!d.verified, online: !!d.online, trips: d.trips || 0, rating: d.rn ? Math.round(d.rs / d.rn * 10) / 10 : 0, blocked: T.blocked.includes(u) })), reqs: Object.values(T.reqs).sort((a, b) => b.created - a.created).slice(0, 40).map((r) => Object.assign({}, r, { driverName: (T.drivers[r.driver] || {}).name || "" })), reports: T.reports.slice(-30).reverse() });
    if (req.method === "POST") { let body = ""; req.on("data", (x) => { body += x; if (body.length > 1500) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (b.on !== undefined) T.on = b.on === true;
      if (b.cfg && typeof b.cfg === "object") { const c = T.cfg; if (b.cfg.on !== undefined) c.on = b.cfg.on === true; for (const [k, mx] of [["passenger", 100000], ["first", 100000], ["driver", 100000], ["bonus", 100000], ["cap", 20], ["minMin", 240]]) if (b.cfg[k] !== undefined) { const v = Math.round(Number(b.cfg[k])); if (!(v >= 0 && v <= mx)) return json(400, { ok: false, error: k + " must be 0 to " + mx + "." }); c[k] = v; } }
      if (b.addTester) { const q = String(b.addTester).trim().toLowerCase(), hit = Object.keys(db.players).find((u) => u === q || String(db.players[u].name || "").toLowerCase() === q); if (!hit) return json(404, { ok: false, error: "No player with that name." }); if (!T.testers.includes(hit)) T.testers.push(hit); }
      if (b.removeTester) T.testers = T.testers.filter((u) => u !== String(b.removeTester));
      if (b.verify) { const d = T.drivers[String(b.verify)]; if (!d) return json(404, { ok: false, error: "No such driver." }); d.verified = b.value !== false; }
      if (b.block) { const u = String(b.block); if (b.value === false) T.blocked = T.blocked.filter((x) => x !== u); else if (!T.blocked.includes(u)) { T.blocked.push(u); if (T.drivers[u]) T.drivers[u].online = false; } }
      persist(); json(200, { ok: true }); }); return; } }
  if (url === "/api/admin/poll") { // send a poll to the whole game, see the results, close it
    const P = db.poll; if (req.method === "GET") { const c = P.cur; return json(200, { ok: true, cur: c ? { id: c.id, q: c.q, desc: c.desc, opts: c.opts, closed: !!c.closed, at: c.at, counts: plCounts(c) } : null, hist: P.hist }); }
    if (req.method === "POST") { let body = ""; req.on("data", (x) => { body += x; if (body.length > 3000) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (b.close === true) { if (!P.cur) return json(400, { ok: false, error: "No poll to close." }); P.cur.closed = true; persist(); for (const [, p] of peers) send(p.ws, { t: "poll", ev: "closed" }); return json(200, { ok: true }); }
      if (b.create) { const q = blClean(b.create.q, 200), desc = blClean(b.create.desc, 500), opts = (Array.isArray(b.create.opts) ? b.create.opts : []).map((o) => blClean(o, 80)).filter(Boolean).slice(0, 6); if (!q) return json(400, { ok: false, error: "Write the question." }); if (opts.length < 2) return json(400, { ok: false, error: "Give at least 2 answers." });
        if (P.cur) { P.hist.push({ q: P.cur.q, opts: P.cur.opts, counts: plCounts(P.cur), at: P.cur.at, endedAt: Date.now() }); P.hist = P.hist.slice(-10); }
        P.cur = { id: crypto.randomBytes(4).toString("hex"), q, desc, opts, closed: false, at: Date.now(), votes: {} }; townSys("📊 Flic en Flac Team", "📊 New poll: " + q + " Open the game's poll card, or Settings → Poll, to vote."); for (const [, p] of peers) send(p.ws, { t: "poll", ev: "new" }); persist(); return json(200, { ok: true }); }
      json(400, { ok: false, error: "Nothing to do." }); }); return; } }
  if (url === "/api/admin/halloween") { // Halloween Night: on or off, when it runs, who is winning
    if (req.method === "GET") { const ps = Object.keys(HW.users).length, tot = Object.values(HW.users).reduce((a, x) => a + x.candy, 0); return json(200, { ok: true, on: HW.on, from: HW.from, to: HW.to, active: hwActive(), paid: HW.paid, players: ps, candy: tot, hunted: Object.values(HW.users).filter((x) => x.hunted).length, top: hwTop(10), entries: Object.entries(HW.entries).map(([u, e]) => ({ name: playerName(u), costume: e.costume, votes: Object.values(HW.users).filter((x) => x.vote === u).length })).sort((a, b) => b.votes - a.votes) }); }
    if (req.method === "POST") { let body = ""; req.on("data", (x) => { body += x; if (body.length > 1000) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (b.on !== undefined) HW.on = b.on === true; if (b.from) { const v = Date.parse(b.from); if (!Number.isFinite(v)) return json(400, { ok: false, error: "Bad start time." }); HW.from = v; } if (b.to) { const v = Date.parse(b.to); if (!Number.isFinite(v)) return json(400, { ok: false, error: "Bad end time." }); HW.to = v; }
      if (b.resetAnn) HW.ann = 0; persist(); return json(200, { ok: true, on: HW.on, from: HW.from, to: HW.to }); }); return; } }
  if (url === "/api/admin/hunt") { // the treasure hunt: on or off, the winner, who is where, and the log
    if (req.method === "GET") { const ps = Object.entries(HUNT.players).map(([u, x]) => ({ name: playerName(u), stage: x.stage, scans: x.scans, digs: x.digs })).sort((a, b) => b.stage - a.stage || b.digs - a.digs).slice(0, 25); return json(200, { ok: true, on: HUNT.on, active: huntActive(), prize: HUNT.prize, autoPay: HUNT.autoPay, winner: HUNT.winner, places: HUNT.places, prizes: HUNT.prizes, players: Object.keys(HUNT.players).length, top: ps, log: HUNT.log.slice(-30).reverse() }); }
    if (req.method === "POST") { let body = ""; req.on("data", (x) => { body += x; if (body.length > 800) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (b.on !== undefined) HUNT.on = b.on === true; if (b.autoPay !== undefined) HUNT.autoPay = b.autoPay === true; if (b.approve) huntPay(); if (b.reset === "restart") { HUNT.winner = null; HUNT.places = []; HUNT.players = dict(); HUNT.log = []; HUNT.ann = 0; HUNT.firsts = dict(); HUNT.lairN = 0; HUNT.bestHp = 0; } persist(); return json(200, { ok: true }); }); return; } }
  if (url === "/api/admin/biz") { // send a message from a business chat to every player
    if (req.method === "GET") return json(200, { ok: true, list: Object.keys(BIZ).map((id) => ({ id, name: BIZ[id].name })), sent: db.biz.posts.slice(-20).reverse() });
    if (req.method === "POST") { let body = ""; req.on("data", (x) => { body += x; if (body.length > 2000) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      const m = bizPost(String(b.biz || ""), String(b.text || "")); if (!m) return json(400, { ok: false, error: "Pick a business and write a message." }); return json(200, { ok: true, m }); }); return; } }
  if (url === "/api/admin/cutz") { // A* Cutz: bookings, the discount and the WhatsApp number
    const c = CZ.cfg; if (req.method === "GET") return json(200, { ok: true, cfg: c, list: Object.values(CZ.bk).sort((a, b) => slotAt(b.date, b.hour) - slotAt(a.date, a.hour)).slice(0, 80) });
    if (req.method === "POST") { let body = ""; req.on("data", (x) => { body += x; if (body.length > 1500) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (b.disc !== undefined) { const v = Math.round(+b.disc); if (!(v >= 0 && v <= 2000)) return json(400, { ok: false, error: "Discount must be 0 to 2000." }); c.disc = v; }
      if (b.whatsapp !== undefined) { const w = String(b.whatsapp).replace(/\D/g, ""); if (w.length < 8 || w.length > 15) return json(400, { ok: false, error: "Use the full number with country code, digits only." }); c.whatsapp = w; c.show = "+" + w.slice(0, 3) + " " + w.slice(3, 7) + " " + w.slice(7); }
      if (b.code) { const k = CZ.bk[String(b.code)]; if (!k) return json(404, { ok: false, error: "No such booking." }); if (!["confirmed", "declined", "done", "booked"].includes(String(b.status))) return json(400, { ok: false, error: "Bad status." }); k.status = String(b.status); k.reply = blClean(b.reply, 140); tellUid(k.uid, { t: "cutz", ev: "upd", code: k.code, status: k.status, text: k.reply }); }
      persist(); json(200, { ok: true }); }); return; } }
  if (req.method === "GET" && url === "/api/admin/assets") { // one player's business and investment history, or everyone who recently lost something
    const q = new URL(req.url, "http://x").searchParams, uid = String(q.get("uid") || "");
    if (uid) { const list = (db.assets[uid] || []).slice().reverse().slice(0, 60), d = db.players[uid]; let cur = null; if (d) { try { const v = JSON.parse(d.save || "{}") || {}; cur = assetSum(assetPick(v), v.px); } catch (e) {} } return json(200, { ok: true, uid, name: d ? String(d.name || "") : "", now: cur, snaps: list.map((s2) => ({ at: s2.at, cash: s2.cash, sum: s2.sum, alert: s2.alert || "", pin: !!s2.pin })) }); }
    const rows = []; for (const u of Object.keys(db.assets)) { const d = db.players[u]; if (!d) continue; for (const s2 of db.assets[u]) if (s2.alert && Date.now() - s2.at < 14 * 86400000) rows.push({ uid: u, name: String(d.name || "").slice(0, 24), at: s2.at, alert: s2.alert }); }
    return json(200, { ok: true, rows: rows.sort((a, b) => b.at - a.at).slice(0, 100), tracked: Object.keys(db.assets).length }); }
  if (req.method === "POST" && url === "/api/admin/assets/restore") { // put some of a player's assets back from a snapshot, leaving their cash and everything else alone
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 1000) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const uid = String(b.uid || ""), cur = db.players[uid]; if (!UID_RE.test(uid) || !cur) return json(404, { ok: false, error: "No such player." });
      const snap = (db.assets[uid] || []).find((s2) => s2.at === +b.at); if (!snap) return json(404, { ok: false, error: "That snapshot is gone." }); const parts = (Array.isArray(b.parts) ? b.parts : []).filter((g) => ASSET_GROUPS[g]); if (!parts.length) return json(400, { ok: false, error: "Pick what to restore." });
      let v; try { v = JSON.parse(cur.save || "{}") || {}; } catch (e) { return json(500, { ok: false, error: "Their current save could not be read." }); }
      try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); fs.writeFileSync(path.join(BACKUP_DIR, "before-restore-" + uid + "-" + Date.now() + ".json"), JSON.stringify({ players: { [uid]: cur } })); } catch (e) {}
      const wBefore = assetWorth(v);
      for (const g of parts) for (const k of ASSET_GROUPS[g]) { if (snap.a[k] === undefined) delete v[k]; else v[k] = JSON.parse(JSON.stringify(snap.a[k])); }
      const now = Date.now(), wAfter = assetWorth(v); db.players[uid] = Object.assign({}, cur, { save: JSON.stringify(v), savedAt: now, restoreAt: now, money: Math.max(0, Math.round((Number(cur.money) || 0) - (wBefore - wAfter))) }); try { assetTrack(uid, db.players[uid]); const l = db.assets[uid]; if (l && l.length) l[l.length - 1].alert = "restored by admin: " + parts.join(", "); } catch (e) {}
      db.caseLog.push({ at: now, name: String(cur.name || "Someone").slice(0, 16), text: "Admin restored " + parts.join(", ") + " from " + new Date(snap.at).toISOString().slice(0, 16).replace("T", " ") }); if (db.caseLog.length > 100) db.caseLog.shift(); persist(); fanout("players"); json(200, { ok: true }); }); return; }
  if (req.method === "POST" && url === "/api/admin/assets/seize") { // take chosen businesses and investments away from a player; what they were worth can go to a town treasury
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 2000) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const uid = String(b.uid || ""), cur = db.players[uid]; if (!UID_RE.test(uid) || !cur) return json(404, { ok: false, error: "No such player." });
      let v; try { v = JSON.parse(cur.save || "{}") || {}; } catch (e) { return json(500, { ok: false, error: "Their current save could not be read." }); }
      const px = v.px && typeof v.px === "object" ? v.px : {}, took = []; let value = 0;
      for (const k of (Array.isArray(b.biz) ? b.biz : []).slice(0, 40)) if (v.biz && v.biz[String(k)]) { value += (Number(v.biz[String(k)].spent) || 0) * 0.5; delete v.biz[String(k)]; took.push(String(k)); } // a business is worth half what they spent on it, as when selling
      for (const g of (Array.isArray(b.inv) ? b.inv : []).slice(0, 3)) if (v.inv && ["save", "fund", "crypto"].includes(g) && Number(v.inv[g]) > 0) { value += g === "save" ? Number(v.inv[g]) : Number(v.inv[g]) * (Number(px[g]) || 100); v.inv[g] = 0; took.push(g); }
      if (!took.length) return json(400, { ok: false, error: "Tick something to take." }); value = Math.round(value); const T = b.town ? govT(b.town) : "", note = String(b.note || "Seized by the Financial Crimes agent.").replace(/[\u0000-\u001f]/g, "").slice(0, 80);
      try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); fs.writeFileSync(path.join(BACKUP_DIR, "before-seize-" + uid + "-" + Date.now() + ".json"), JSON.stringify({ players: { [uid]: cur } })); } catch (e) {}
      const now = Date.now(); db.players[uid] = Object.assign({}, cur, { save: JSON.stringify(v), savedAt: now, restoreAt: now, money: Math.max(0, Math.round((Number(cur.money) || 0) - value)) });
      try { assetTrack(uid, db.players[uid]); const l = db.assets[uid]; if (l && l.length) l[l.length - 1].alert = "seized by admin: " + took.join(", "); } catch (e) {}
      if (T) treasuryAdd(T, value); seizeLog(uid, value, "assets: " + took.join(", "), T, note); db.caseLog.push({ at: now, name: String(cur.name || "Someone").slice(0, 16), text: "Admin seized " + took.join(", ") + " (worth Rs " + value.toLocaleString("en") + ")" + (T ? " for the " + GOV_NAME[T] + " treasury" : "") + ": " + note }); if (db.caseLog.length > 100) db.caseLog.shift(); persist(); fanout("players"); json(200, { ok: true, took, value }); }); return; }
  if (req.method === "GET" && url.startsWith("/api/admin/seizures")) { // every seizure, newest first, and how much has been given back
    const q = new URL(req.url, "http://x").searchParams, uid = String(q.get("uid") || ""), rows = db.seizures.filter((z) => !uid || z.uid === uid).slice().reverse().slice(0, 300).map((z) => Object.assign({}, z, { town: z.town ? GOV_NAME[z.town] || z.town : "" })), out = db.seizures.reduce((a, z) => a + z.amt, 0), back = db.seizures.reduce((a, z) => a + (z.back || 0), 0);
    return json(200, { ok: true, rows, total: db.seizures.length, out, back }); }
  if (req.method === "POST" && url === "/api/admin/seizures/return") { // give seized money back: all of it or part of it (the treasury gives up what it still has)
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 500) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const z = db.seizures.find((q) => q.id === String(b.id || "")); if (!z) return json(404, { ok: false, error: "No such seizure." }); if (!db.players[z.uid]) return json(404, { ok: false, error: "That player no longer exists." });
      const left = z.amt - (z.back || 0), want = b.all === false && +b.amt > 0 ? Math.min(left, Math.round(+b.amt)) : left; if (!(want > 0)) return json(400, { ok: false, error: "Everything seized here has already been given back." });
      for (let n = want; n > 0;) { const part = Math.min(n, 9500000); mailTo(z.uid, part, "Refund: seized money returned", "Game team"); n -= part; }
      let fromTreasury = 0; if (z.town && db.govs && db.govs[z.town]) { fromTreasury = Math.min(want, Math.max(0, db.govs[z.town].treasury || 0)); db.govs[z.town].treasury -= fromTreasury; } // the treasury gives back what it still has; the rest is paid new
      z.back = (z.back || 0) + want; z.backAt = Date.now(); z.backFrom = (z.backFrom || 0) + fromTreasury; db.caseLog.push({ at: Date.now(), name: z.name, text: "Admin returned Rs " + want.toLocaleString("en") + " that had been seized" }); if (db.caseLog.length > 100) db.caseLog.shift(); persist(); govTell(); json(200, { ok: true, amt: want, left: z.amt - z.back, fromTreasury }); }); return; }
  if (req.method === "POST" && url === "/api/admin/refund") { // give a player back what the cheat watch took
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 500) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const uid = String(b.uid || ""); if (!UID_RE.test(uid) || !db.players[uid]) return json(404, { ok: false, error: "No such player." });
      const g = db.cg[uid]; let amt = 0; for (const f of (g && g.flags) || []) if (f.took && !f.refunded) { amt += f.took; f.refunded = Date.now(); } if (!(amt > 0)) return json(200, { ok: true, amt: 0 }); for (let left = amt; left > 0;) { const part = Math.min(left, 9500000); mailTo(uid, part, "Refund: money taken back by mistake", "Game team"); left -= part; } persist(); json(200, { ok: true, amt }); }); return; }
  if (req.method === "POST" && url === "/api/admin/ads") { // announce the ad again in town chat
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 500) req.destroy(); }); req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } if (b.announce === "devcon") devconAnnounce(); json(200, { ok: true }); }); return; }
  if (req.method === "GET" && url === "/api/admin/suspects") { // players whose history looks wrong: a score and the reasons, most suspicious first
    const out = [];
    for (const uid of Object.keys(db.players)) { const d = db.players[uid]; if (!d || db.removed[uid]) continue; const why = []; let score = 0, cash = 0; try { cash = Math.floor(Number(JSON.parse(d.save || "{}").money) || 0); } catch (e) {}
      const g = db.cg[uid] || {}, src = srcOf(d), tot = SRC_KEYS.reduce((a, k) => a + src[k], 0), worth = Math.round(Number(d.money) || 0), led = db.ledger[uid] || [];
      if (g.edit) { score += 150; why.push("Cash jumped to an exact round number (" + g.edit + "x), the save was probably edited by hand: last +Rs " + (g.editAmt || 0).toLocaleString("en") + " on " + new Date(g.editAt).toISOString().slice(0, 16).replace("T", " ")); }
      if (g.clock) { score += 150; why.push("Phone clock moved forward to farm business earnings (" + g.clock + " saves reset, last " + new Date(g.clockAt).toISOString().slice(0, 16).replace("T", " ") + ")"); }
      for (const f of g.flags || []) { score += 100; why.push("Money from nowhere: +Rs " + f.d.toLocaleString("en") + (f.took ? " (taken back)" : " (not taken back)") + " on " + new Date(f.t).toISOString().slice(0, 16).replace("T", " ")); }
      if (g.d0 != null) { const drift = cash - g.sum - g.d0; if (drift >= CG_MIN) { score += 60; why.push("Right now Rs " + drift.toLocaleString("en") + " of their cash has no recorded source"); } }
      if (tot >= 500000) { const bad = src.crime + src.gamble + src.gift; if (bad / tot >= 0.6) { score += 30; why.push(Math.round(bad / tot * 100) + "% of their income is crime, gambling or gifts (Rs " + bad.toLocaleString("en") + ")"); } }
      const unx = led.filter((r) => r.a >= 1000000 && CG_UNEXPLAINED.test(r.l)).sort((a, b) => b.a - a.a); if (unx.length) { score += 80; why.push("Unexplained income: " + unx.length + " line" + (unx.length > 1 ? "s" : "") + " the game could not trace to anything, biggest +Rs " + unx[0].a.toLocaleString("en") + " (\"" + unx[0].l + "\") on " + new Date(unx[0].t).toISOString().slice(0, 16).replace("T", " ")); }
      const big = led.filter((r) => r.a >= 10000000 && !/admin|game team/i.test(r.l)).sort((a, b) => b.a - a.a)[0]; if (big) { score += 20; why.push("One line of +Rs " + big.a.toLocaleString("en") + ": " + big.l); }
      const hist = (db.agent.w[uid] || []); for (let i = 1; i < hist.length; i++) { const up = hist[i].w - hist[i - 1].w, inc = SRC_KEYS.reduce((a, k) => a + Math.max(0, (hist[i].src[k] || 0) - (hist[i - 1].src[k] || 0)), 0); if (up >= 5000000 && inc < up * 0.25) { score += 40; why.push("Net worth rose Rs " + up.toLocaleString("en") + " between two checks with only Rs " + inc.toLocaleString("en") + " of income recorded"); break; } }
      if (worth >= 5000000 && tot > 0 && worth > tot * 4 + 2000000) { score += 25; why.push("Worth Rs " + worth.toLocaleString("en") + " but only Rs " + tot.toLocaleString("en") + " of income ever recorded (weak signal for older players)"); }
      if (score >= 25) out.push({ uid, name: String(d.name || "(no name)").slice(0, 24), login: db.auth.names[uid] || "", worth, cash, score, why, flags: (g.flags || []).length });
    }
    out.sort((a, b) => b.score - a.score); return json(200, { ok: true, total: Object.keys(db.players).length, count: out.length, rows: out.slice(0, 100) });
  }
  if (url === "/api/admin/parties" && (req.method === "GET" || req.method === "POST")) { // political parties: see them, take down one with a bad name
    const report = () => ({ ok: true, parties: Object.values(db.parties).map((q) => Object.assign(partySum(q), { created: q.created })).sort((a, b) => b.n - a.n) });
    if (req.method === "GET") return json(200, report()); let body = ""; req.on("data", (c) => { body += c; if (body.length > 2000) req.destroy(); });
    req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const q = db.parties[String(b.delete || "")]; if (!q) return json(404, { ok: false, error: "No such party." });
      for (const T of GOV_TOWNS) { const r = db.govs[T].race; if (r) for (const u in r.cands) if (r.cands[u].party === q.id) r.cands[u].party = ""; } for (const T of GOV_TOWNS) { const pr = db.govs[T].pres; if (pr && pr.party === q.id) pr.party = ""; } delete db.parties[q.id]; persist(); townSys("🎗️ Politics", q.name + " [" + q.tag + "] was disbanded by the game team."); govTell(); json(200, report()); }); return; }
  if (url === "/api/admin/gov" && (req.method === "GET" || req.method === "POST")) { // the governments: see them, remove a President, cancel or close an election
    const report = () => ({ ok: true, gov: govPub(), races: GOV_TOWNS.map((T) => ({ town: T, race: db.govs[T].race ? { ends: db.govs[T].race.ends, cands: Object.values(db.govs[T].race.cands).map((c) => ({ uid: c.uid, name: c.name, votes: govTally(T)[c.uid] | 0 })) } : null, hist: db.govs[T].hist.slice(-10).reverse() })) });
    if (req.method === "GET") return json(200, report());
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 2000) req.destroy(); });
    req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const T = govT(b.town), g = db.govs[T];
      if (b.action === "depose" && g.pres) govEnd(T, "voted out"); else if (b.action === "cancel" && g.race) { g.race = null; persist(); govTell(); } else if (b.action === "close" && g.race) { g.race.ends = Date.now(); govTick(); } else if (b.action === "opentamarin") { db.govs.fef.done = 1; persist(); govTell(); }
      json(200, report()); }); return; }
  if (url === "/api/admin/health" && req.method === "GET") { // is the game saving properly? where, how often, how big, and any odd events
    let st = null, bk = []; try { const f = fs.statSync(DATA_FILE); st = { size: f.size, mtime: f.mtimeMs }; } catch (e) {} try { bk = fs.readdirSync(BACKUP_DIR).filter((n) => /^data-/.test(n)).sort().slice(-6).map((n) => { const f = fs.statSync(path.join(BACKUP_DIR, n)); return { n, size: f.size }; }); } catch (e) {}
    const led = Object.values(db.ledger).reduce((a, r) => a + (Array.isArray(r) ? r.length : 0), 0), docs = Object.values(db.players).map((d) => (typeof d.save === "string" ? d.save.length : 0)).sort((a, b) => b - a);
    return json(200, { ok: true, file: DATA_FILE, volume: /^\/data\b/.test(DATA_FILE) || !!process.env.DATA_FILE, file_stat: st, backups: bk, players: Object.keys(db.players).length, ledgerRows: led, feedback: db.feedback.length, biggestSave: docs[0] || 0, maxDoc: MAX_DOC, uptime: Math.round(process.uptime()), persist: PSTAT, diag: DIAG.slice(-30).reverse(), mem: Math.round(process.memoryUsage().rss / 1048576) }); }
  if (url === "/api/admin/salon" && (req.method === "GET" || req.method === "POST")) { // Clawed by Taps: settings, owner key, bookings
    const report = () => ({ ok: true, track: sbTrackReport(), cfg: SAL.cfg, allowNames: SAL.cfg.allow.map((u) => ({ u, n: playerName(u) })), ownerNames: SAL.cfg.ownerUids.map((u) => ({ u, n: playerName(u), login: (db.auth.names || {})[u] || "" })), stats: sbStats(), bookings: Object.values(SAL.bk).sort((a, b) => b.created - a.created).slice(0, 100).map((b) => sbView(b, "owner")) });
    if (req.method === "GET") return json(200, report());
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const c = SAL.cfg;
      if (typeof b.name === "string") c.name = sbClean(b.name, 40) || c.name; if (typeof b.owner === "string") c.owner = sbClean(b.owner, 30) || c.owner; if (typeof b.bio === "string") c.bio = sbClean(b.bio, 500); if (typeof b.whatsapp === "string") c.whatsapp = b.whatsapp.replace(/[^0-9]/g, "").slice(0, 16);
      if (Array.isArray(b.menu) && b.menu.length) c.menu = b.menu.slice(0, 12).map((s, i) => ({ id: String(s.id || "m" + i).replace(/[^a-z0-9_]/gi, "").slice(0, 12), t: sbClean(s.t, 40), i: sbClean(s.i, 4), main: s.main ? 1 : 0, add: s.add ? 1 : 0, combo: s.combo ? 1 : 0, noadd: s.noadd ? 1 : 0, items: (Array.isArray(s.items) ? s.items : []).slice(0, 40).map((q, k) => ({ id: String(q.id || "i" + i + "_" + k).replace(/[^a-z0-9_]/gi, "").slice(0, 12), n: sbClean(q.n, 70), p: Math.max(0, Math.min(1e6, Math.round(Number(q.p) || 0))), u: q.u === "pair" || q.u === "finger" ? q.u : "" })).filter((q) => q.n) })).filter((s) => s.t && s.items.length);
      if (Number.isFinite(+b.comboPrice)) c.comboPrice = Math.max(0, Math.min(1e6, Math.round(+b.comboPrice)));
      if (Number.isFinite(+b.from)) c.from = Math.max(0, Math.min(22, Math.round(+b.from))); if (Number.isFinite(+b.to)) c.to = Math.max(c.from + 1, Math.min(24, Math.round(+b.to))); if (Array.isArray(b.days)) c.days = b.days.map(Number).filter((d) => d >= 0 && d <= 6);
      if (typeof b.discUntil === "string") c.discUntil = b.discUntil ? Date.parse(b.discUntil + "T23:59:59+04:00") || 0 : 0; if (Number.isFinite(+b.reward)) c.reward = Math.max(0, Math.min(100000, Math.round(+b.reward)));
      if (Array.isArray(b.caps)) c.caps = b.caps.slice(0, 12).map((x) => sbClean(x, 60));
      if (b.regenKey) c.ownerKey = crypto.randomBytes(9).toString("hex"); if (typeof b.ownerName === "string" && b.ownerName.trim()) { const f = findPlayerBy(b.ownerName); if (f.err) return json(404, { ok: false, error: f.err }); if (!c.ownerUids.includes(f.id)) c.ownerUids.push(f.id); } if (b.removeOwner) c.ownerUids = c.ownerUids.filter((u) => u !== b.removeOwner);
      if (typeof b.open === "boolean") c.open = b.open; if (typeof b.allowName === "string" && b.allowName.trim()) { const f = findPlayerBy(b.allowName); if (f.err) return json(404, { ok: false, error: f.err }); if (!c.allow.includes(f.id)) c.allow.push(f.id); } if (b.removeAllow) c.allow = c.allow.filter((u) => u !== b.removeAllow);
      persist(); json(200, report()); }); return; }
  if (url === "/api/admin/wealthtax" && (req.method === "GET" || req.method === "POST")) { // the weekly wealth tax on rich players: switch it, set the three rates
    if (req.method === "GET") return json(200, { ok: true, wealth: db.wealth });
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 1000) req.destroy(); });
    req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      const w = { on: typeof b.on === "boolean" ? b.on : db.wealth.on, b: db.wealth.b.map((x, i) => [x[0], Array.isArray(b.rates) && Number.isFinite(+b.rates[i]) ? Math.max(0, Math.min(0.2, +b.rates[i] / 100)) : x[1]]) }; db.wealth = wealthNorm(w); persist(); govTell(); json(200, { ok: true, wealth: db.wealth }); }); return; }
  if (url === "/api/admin/raids" && (req.method === "GET" || req.method === "POST")) { // raids: switch them, tune the rules, see the totals
    const view = () => ({ ok: true, cfg: db.raid.cfg, stats: db.raid.stats, shielded: Object.keys(db.raid.shield).filter((u) => db.raid.shield[u] > Date.now()).length, pending: Object.values(db.raid.debit).reduce((a, l) => a + l.length, 0), targets: Object.keys(db.players).filter((u) => raidTarget(u, Date.now())).length });
    if (req.method === "GET") return json(200, view());
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 1000) req.destroy(); });
    req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const c = db.raid.cfg, num = (v, lo, hi, d) => (Number.isFinite(+v) && v !== "" && v !== null ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
      if (typeof b.on === "boolean") c.on = b.on; c.minNw = num(b.minNw, 100000, 1e12, c.minNw); c.tax = num(b.tax, 0, 90, c.tax); c.perDay = num(b.perDay, 1, 50, c.perDay); c.shieldH = num(b.shieldH, 0, 168, c.shieldH); c.searchFee = num(b.searchFee, 0, 1e6, c.searchFee); c.revengeH = num(b.revengeH, 0, 168, c.revengeH); c.onMult = num(b.onMult, 0, 100, c.onMult == null ? 40 : c.onMult); c.hitsPerDay = num(b.hitsPerDay, 1, 50, c.hitsPerDay == null ? 3 : c.hitsPerDay); c.poorPct = num(b.poorPct, 0, 100, c.poorPct == null ? 25 : c.poorPct); c.minAny = num(b.minAny, 0, 1e9, c.minAny == null ? 20000 : c.minAny); c.cashCap = num(b.cashCap, 5, 100, c.cashCap == null ? 30 : c.cashCap); persist(); json(200, view()); }); return; }
  if (url === "/api/admin/agent" && (req.method === "GET" || req.method === "POST")) { // the Financial Crimes agent: switch it off, release a frozen player
    const report = () => ({ ok: true, on: !!db.agent.on, cases: Object.values(db.cases).sort((a, b) => b.opened - a.opened).slice(0, 40), log: db.caseLog.slice(-20).reverse() });
    if (req.method === "GET") return json(200, report());
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 4000) req.destroy(); });
    req.on("end", () => { let b = {}; try { b = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (typeof b.on === "boolean") db.agent.on = b.on;
      if (b.investigate) { const uid = String(b.investigate), d = db.players[uid]; if (!d) return json(404, { ok: false, error: "No player with that id." }); if (caseOf(uid)) return json(400, { ok: false, error: "That player already has a case open." });
        const now = Date.now(), id = crypto.randomBytes(6).toString("hex"), agent = AG_NAMES[parseInt(id.slice(0, 2), 16) % AG_NAMES.length], reason = String(b.reason || "Admin investigation").replace(/[\u0000-\u001f]/g, "").slice(0, 80), pct = Math.max(0.1, Math.min(1, (+b.pct || 90) / 100));
        const c = { id, uid, name: b.anon ? "A player" : String(d.name || "Someone").slice(0, 16), kind: "admin", reason, opened: now, status: "frozen", agent, pct, frozenAmt: 0, ack: 0, gain: 0, src: srcOf(d), worth: Math.round(Number(d.money) || 0), expires: now + AG_EXPIRE, fine: 0, jail: 0, verdict: "", defense: "", done: 0 };
        db.cases[id] = c; townSys("🕵️ Financial Crimes", agent + " opened an investigation into " + c.name + ": " + reason + ". Assets frozen until the court rules."); pushCase(uid, c);
        const pub = String((b.publish && b.publish.text) || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 190); // a short public notice, with no name in it
        if (pub) { townSys("📣 Flic en Flac Team", pub); const item = { id: crypto.randomBytes(6).toString("hex"), kind: "court", icon: "⚖️", text: pub, who: "A player", uid: "", vuid: "", at: now }; db.news.push(item); if (db.news.length > 60) db.news.splice(0, db.news.length - 60); persist(); for (const [, p] of peers) send(p.ws, { t: "news", item }); } }
      if (b.rule) { const r = b.rule, c = Object.values(db.cases).find((q) => q.uid === String(r.uid) && caseOpen(q)); if (c) { const v = ["cleared", "convicted", "taxed"].includes(r.verdict) ? r.verdict : "cleared", fine = v === "cleared" ? 0 : Math.max(0, Math.min(1e10, Math.round(+r.fine || 0))), jail = v === "convicted" ? Math.max(0, Math.min(720, Math.round(+r.jail || 0))) : 0, why = String(r.note || "Ruled by the court.").slice(0, 100);
        Object.assign(c, { status: v, fine, jail, defense: "admin", verdict: why, closed: Date.now(), v: (c.v | 0) + 1 }); db.agent.cool[c.uid] = Date.now() + AG_COOL; townSys("⚖️ Court", v === "cleared" ? c.name + " was cleared. Assets released." : c.name + (v === "taxed" ? " settled: Rs " : " was convicted and fined Rs ") + fine.toLocaleString("en") + (jail ? " plus a jail sentence" : "") + ". " + why); pushCase(c.uid, c); } }
      if (b.seize) { const z = b.seize, uid = String(z.uid || ""), d = db.players[uid]; if (!d) return json(404, { ok: false, error: "No player with that id." }); const T = govT(z.town), cash = raidCash(uid), want = +z.pct > 0 ? Math.round(cash * Math.min(100, +z.pct) / 100) : Math.round(+z.amt || 0), amt = Math.max(0, Math.min(want, cash)), note = String(z.note || "Seized by the Financial Crimes agent.").replace(/[\u0000-\u001f]/g, "").slice(0, 80);
        if (!(amt > 0)) return json(400, { ok: false, error: "They have no cash to take (last saved cash Rs " + cash.toLocaleString("en") + ")." }); (db.raid.debit[uid] = db.raid.debit[uid] || []).push({ id: crypto.randomBytes(5).toString("hex"), amt, by: "", kind: "seize", note, at: Date.now() }); if (db.raid.debit[uid].length > 30) db.raid.debit[uid].shift(); treasuryAdd(T, amt); seizeLog(uid, amt, "admin", T, note); worthDown(uid, amt);
        db.caseLog.push({ at: Date.now(), name: String(d.name || "Someone").slice(0, 16), text: "Admin seized Rs " + amt.toLocaleString("en") + " for the " + GOV_NAME[T] + " treasury: " + note }); if (db.caseLog.length > 100) db.caseLog.shift(); if (z.announce) townSys("🕵️ Financial Crimes", String(d.name || "Someone").slice(0, 16) + " had Rs " + amt.toLocaleString("en") + " seized for the " + GOV_NAME[T] + " treasury. " + note); } // take money from a player (when they next play, never below zero) and give it to the treasury
      if (b.refund) { const all = b.refund === "all", list = Object.values(db.cases).filter((q) => (all || q.id === String(b.refund)) && (q.status === "taxed" || q.status === "convicted") && (q.fine | 0) > 0 && !q.refunded && db.players[q.uid]); for (const c of list) { for (let left = c.fine | 0; left > 0;) { const part = Math.min(left, 9500000); mailTo(c.uid, part, "Refund: court fine returned", "Game team"); left -= part; } c.refunded = Date.now(); db.caseLog.push({ at: Date.now(), name: c.name, text: "Fine of Rs " + (c.fine | 0).toLocaleString("en") + " refunded by an administrator." }); if (db.caseLog.length > 100) db.caseLog.shift(); } } // give back fines the agent took by mistake (one case, or every unrefunded fine still on record)
      if (b.release) { const c = Object.values(db.cases).find((q) => q.uid === String(b.release) && caseOpen(q)); if (c) { Object.assign(c, { status: "cleared", fine: 0, jail: 0, defense: "admin", verdict: "Released by an administrator.", closed: Date.now(), v: (c.v | 0) + 1 }); db.agent.cool[c.uid] = Date.now() + AG_COOL; townSys("⚖️ Court", c.name + " was cleared. Assets released."); pushCase(c.uid, c); } }
      persist(); json(200, report()); }); return; }  if (req.method === "GET" && url === "/api/admin/promo") return json(200, Object.assign({ ok: true }, promoReport())); // the community post: settings, numbers and who joined
  if (req.method === "POST" && (url === "/api/admin/promo" || url === "/api/admin/promo/new")) {
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 8000) req.destroy(); });
    req.on("end", () => { let m = {}; try { m = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      if (url === "/api/admin/promo/new") { db.promo.id = (db.promo.id | 0) + 1; persist(); return json(200, Object.assign({ ok: true }, promoReport())); } // a fresh post: everybody can claim again, and the numbers start from zero
      const link = String(m.link || "").trim(); if (link && !/^https:\/\/[^\s<>"]{4,300}$/.test(link)) return json(400, { ok: false, error: "The link must start with https:// (a WhatsApp invite looks like https://chat.whatsapp.com/…)." });
      const reward = Math.floor(Number(m.reward)); if (!(reward >= 0 && reward <= 1000000)) return json(400, { ok: false, error: "The bonus must be between 0 and 1,000,000." }); if (m.on && !link) return json(400, { ok: false, error: "Add the group link before turning it on." });
      Object.assign(db.promo, { on: !!m.on, link, title: String(m.title || "").replace(/[<>]/g, "").trim().slice(0, 60) || "Join our WhatsApp community", text: String(m.text || "").replace(/[<>]/g, "").trim().slice(0, 300), reward }); persist(); json(200, Object.assign({ ok: true }, promoReport())); });
    return;
  }
  if (req.method === "GET" && url === "/api/admin/stats") return json(200, Object.assign({ ok: true }, statsReport())); // retention, visit length, busy hours, link sources
  if (req.method === "GET" && url === "/api/admin/wall") { // every Heart Wall note with who wrote it (newest first)
    return json(200, { ok: true, notes: db.wall.slice().reverse().map((w) => ({ id: w.id, text: w.text, at: w.at, uid: w.uid, name: String((db.players[w.uid] || {}).name || "?").slice(0, 24), hearts: (w.hearts || []).length, reports: (w.reports || []).length, hidden: !!w.hidden })) });
  }
  if (req.method === "POST" && (url === "/api/admin/wall/delete" || url === "/api/admin/wall/show")) { // take a note down, or put a reported one back up
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 512) req.destroy(); });
    req.on("end", () => { let m = {}; try { m = JSON.parse(body || "{}"); } catch (e) {} const w = db.wall.find((q) => q.id === String(m.id || "")); if (!w) return json(404, { ok: false, error: "That note is gone." });
      if (url === "/api/admin/wall/delete") db.wall = db.wall.filter((q) => q !== w); else { w.hidden = false; w.reports = []; } wallFanout(); json(200, { ok: true }); }); return;
  }
  if (req.method === "GET" && url === "/api/admin/history") { // one player's saved progress in every backup, newest first
    const uid = String(q.get("uid") || ""); if (!UID_RE.test(uid)) return json(400, { ok: false, error: "That isn't a player id." });
    const row = (file, at, d) => { if (!d) return null; let sv = {}; try { sv = JSON.parse(d.save || "{}") || {}; } catch (e) {} return { file, at, savedAt: d.savedAt || 0, name: String(d.name || "").slice(0, 24), worth: Math.round(+d.money || 0), cash: Math.round(+sv.money || 0), day: Math.floor((+sv.t || 0) / 1440) + 1 }; };
    const out = [row("current", Date.now(), db.players[uid])];
    let files = []; try { files = fs.readdirSync(BACKUP_DIR).filter((n) => /^(data-|before-)[\w-]+\.json$/.test(n)); } catch (e) {}
    for (const n of files) { try { const st = fs.statSync(path.join(BACKUP_DIR, n)), d = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, n), "utf8")); out.push(row(n, st.mtimeMs, (d.players || {})[uid])); } catch (e) {} }
    return json(200, { ok: true, uid, versions: out.filter(Boolean).sort((a, b) => b.at - a.at) });
  }
  if (req.method === "POST" && (url === "/api/admin/restore" || url === "/api/admin/give")) { // put a player back to a saved version, or send one player money
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 2048) req.destroy(); });
    req.on("end", () => { let m = {}; try { m = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const uid = String(m.uid || "");
      if (!UID_RE.test(uid)) return json(400, { ok: false, error: "That isn't a player id." }); if (url === "/api/admin/restore") delete db.cg[uid]; /* a restore moves their cash on purpose: start the cheat watch again */
      if (url === "/api/admin/give") { const amt = Math.max(0, Math.floor(+m.amount || 0)), item = /^(buddy::\d{1,3}|staff:(housekeeper|chef|chauffeur|trainer|assistant|bodyguard):\d{1,3})$/.test(String(m.item || "")) ? String(m.item) : "";
        if (amt > 10000000 || (!amt && !item)) return json(400, { ok: false, error: "Send an amount up to Rs 10,000,000, a gift, or both." });
        const id = crypto.randomBytes(10).toString("hex"); db.mail[id] = { to: uid, from: cleanName(m.from) || "Game team", amt, at: Date.now() }; if (item) db.mail[id].item = item; const note = String(m.note || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 140); if (note) db.mail[id].note = note;
        pruneMail(); persist(); fanout("mail"); return json(200, { ok: true }); }
      const file = String(m.file || ""); if (!/^(data-|before-)[\w-]+\.json$/.test(file)) return json(400, { ok: false, error: "Pick a backup to restore." });
      let d; try { d = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, file), "utf8")); } catch (e) { return json(404, { ok: false, error: "That backup could not be read." }); }
      const old = (d.players || {})[uid]; if (!old || typeof old.save !== "string") return json(404, { ok: false, error: "That backup has no save for this player." });
      try { fs.writeFileSync(path.join(BACKUP_DIR, "before-restore-" + uid + "-" + Date.now() + ".json"), JSON.stringify({ players: { [uid]: db.players[uid] } })); } catch (e) {} // keep what we replace, just in case
      const now = Date.now(); db.players[uid] = Object.assign({}, old, { savedAt: now, restoreAt: now }); persist(); fanout("players"); // the game sees restoreAt and loads this save
      return json(200, { ok: true }); });
    return;
  }
  if (req.method === "POST" && url === "/api/admin/gift") { // send money to random players, as if from a player
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 2048) req.destroy(); });
    req.on("end", () => { let m = {}; try { m = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      const amt = Math.floor(+m.amount), from = cleanName(m.from) || "Someone", nOn = Math.max(0, Math.min(50, m.online | 0)), nAny = Math.max(0, Math.min(50, m.any | 0)), role = ["student", "resident", "tourist"].includes(m.role) ? m.role : "";
      if (!(amt >= 1 && amt <= 10000000)) return json(400, { ok: false, error: "Amount must be between Rs 1 and Rs 10,000,000." });
      const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const online = new Set(); for (const [, p] of peers) if (p.uid && !p.away && db.players[p.uid] && (!role || (p.presence || {}).role === role || db.players[p.uid].role === role)) online.add(p.uid); // who is playing right now
      const picked = shuffle([...online]).slice(0, nOn), others = shuffle(Object.keys(db.players).filter((u) => !picked.includes(u) && !db.removed[u])).slice(0, nAny); // the lucky ones
      const sent = []; for (const uid of picked.concat(others)) { const id = crypto.randomBytes(10).toString("hex"); db.mail[id] = { to: uid, from, amt, at: Date.now() }; sent.push({ uid, name: String((db.players[uid] || {}).name || "(no name)").slice(0, 24), online: [...peers.values()].some((q) => q.uid === uid && !q.away), role: String((db.players[uid] || {}).role || "") }); }
      pruneMail(); persist(); fanout("mail"); // online players get it at once, the rest next time they play
      return json(200, { ok: true, sent, onlineFound: online.size }); });
    return;
  }
  if (req.method === "GET" && url === "/api/admin/banned") return json(200, { ok: true, banned: Object.entries(db.removed).filter(([, r]) => r.ban).map(([uid, r]) => ({ uid, name: r.name, at: r.at, reason: r.reason || "", login: r.login || "", saved: !!(db.archive[uid] && db.archive[uid].player) })) }); // the ban list
  if (req.method === "POST" && url === "/api/admin/password") { // set a new password for a player who forgot theirs (or give a player with no login one)
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 2048) req.destroy(); });
    req.on("end", async () => { let m = {}; try { m = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); }
      const uid = String(m.uid || ""), pass = String(m.password || ""); if (!UID_RE.test(uid)) return json(400, { ok: false, error: "That isn't a player id." });
      if (!db.players[uid] && !db.auth.names[uid]) return json(404, { ok: false, error: "No player with that id." });
      if (pass.length < 8 || pass.length > 200) return json(400, { ok: false, error: "The password needs at least 8 characters." });
      let name = db.auth.names[uid] || "";
      if (!name) { name = String(m.username || "").trim().toLowerCase(); if (!NAME_RE.test(name)) return json(400, { ok: false, error: "This player has no login yet. Give a username of 3-20 letters, numbers or _." }); if (db.auth.accounts[name]) return json(400, { ok: false, error: "That username is taken." }); }
      try { const salt = crypto.randomBytes(16).toString("hex"), hash = (await hashPass(pass, salt)).toString("hex"); db.auth.accounts[name] = { uid, salt, hash, at: Date.now() }; db.auth.names[uid] = name; loginFails.delete(name); persist(); }
      catch (e) { return json(500, { ok: false, error: "Could not set the password." }); }
      console.log("Admin set a new password for", name, uid); return json(200, { ok: true, login: name }); }); return; }
  if (req.method === "POST" && (url === "/api/admin/delete" || url === "/api/admin/unban")) { // read a small JSON body
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 2048) req.destroy(); });
    req.on("end", () => { let m = {}; try { m = JSON.parse(body || "{}"); } catch (e) { return json(400, { ok: false, error: "Bad request." }); } const uid = String(m.uid || "");
      if (!UID_RE.test(uid)) return json(400, { ok: false, error: "That isn't a player id." });
      if (url === "/api/admin/unban") { const r = db.removed[uid]; if (!r) return json(200, { ok: true });
        if (m.restore === false) { r.ban = false; persist(); return json(200, { ok: true, restored: false }); } // they may come back as a new character
        let keep = db.archive[uid], from = "the saved archive"; if (!keep || !keep.player) { keep = null; try { const fs2 = fs.readdirSync(BACKUP_DIR).filter((n) => n.startsWith("before-delete-" + uid + "-")).sort(); for (let i = fs2.length - 1; i >= 0 && !keep; i--) { const old = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, fs2[i]), "utf8")); old.auth = old.auth || { names: {}, accounts: {} }; keep = archiveOf(old, uid); from = "the backup " + fs2[i]; } } catch (e) {} } // older removals: the backup taken just before the delete
        if (!keep) return json(404, { ok: false, error: "No saved progress was found for this player, so there is nothing to restore." });
        db.players[uid] = Object.assign({}, keep.player, { restoreAt: Date.now() }); // the game adopts this saved progress the next time they open it
        if (keep.acc && keep.login && !db.auth.accounts[keep.login]) { db.auth.accounts[keep.login] = keep.acc; db.auth.names[uid] = keep.login; }
        let home = 0; for (const i in keep.homes || {}) if (!db.homes[i]) { db.homes[i] = keep.homes[i]; home++; }
        delete db.removed[uid]; delete db.archive[uid]; persist(); peersDirty = true; fanout("players"); fanout("homes");
        console.log("Admin reinstated", r.name || uid, "from", from); return json(200, { ok: true, restored: true, name: r.name, login: keep.login || "", home: home > 0, from }); }
      if (!db.players[uid] && !db.auth.names[uid]) return json(404, { ok: false, error: "No player with that id." });
      const err = removePlayer(uid, !!m.ban, m.reason); return err ? json(500, { ok: false, error: err }) : json(200, { ok: true }); });
    return;
  }
  return json(404, { ok: false, error: "Unknown admin request." });
}

// ---------- the HTTP side: serve the game from /public ----------
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || "/").split("?")[0]);   // the path only
  if (url.startsWith("/api/admin/")) return adminApi(req, res, url); // the admin tools
  if (url === "/api/keep" && (req.method === "POST" || req.method === "DELETE")) return keepRoute(req, res); // the recovery cookie
  if (url === "/go/join" && req.method === "GET") return promoGo(req, res, new URL(req.url, "http://x").searchParams); // the community post's Join button
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end("method not allowed"); } // read-only static server
  const origin = (() => { const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim(), proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() === "https" ? "https" : "http"; return /^[a-z0-9.\-]+(:\d+)?$/i.test(host) ? proto + "://" + host : ""; })(); // this site's own address, for links search engines and previews need in full
  if (url === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" }); return res.end("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n" + (origin ? "\nSitemap: " + origin + "/sitemap.xml\n" : "")); } // tell search engines what to skip
  if (url === "/sitemap.xml") { res.writeHead(200, { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" }); return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + origin + '/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>' + origin + '/about</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>\n'); } // the pages worth listing
  if (url === "/admin") url = "/admin.html";                      // the admin page
  if (url === "/about") url = "/about.html";                      // the plain-text page about the game
  if (url === "/api/season") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); const S = db.season, L = db.levy, qu = new URL(req.url, "http://x").searchParams.get("uid") || ""; return res.end(JSON.stringify({ n: S.n, at: S.at, start: S.start, wipe: S.wipe, levy: { on: L.on, free: LEVY_TIERS[0][0] }, now: Date.now(), hall: S.n >= 2 ? S.hall : [], mine: S.n >= 2 && UID_RE.test(qu) && S.honours[qu] ? S.honours[qu] : null })); } // the season clock, the Hall of Fame and your own badge
  if (url === "/api/disaster") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); const c = db.disaster.cur; return res.end(JSON.stringify({ now: Date.now(), cur: c ? { kind: c.kind, name: c.name, warnAt: c.warnAt, hitAt: c.hitAt, endAt: c.endAt } : null })); } // is a disaster coming or happening?
  if (url === "/api/regions") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); return res.end(JSON.stringify({ ok: true, now: Date.now(), regions: REG.list() })); } // which parts of the island are open
  if (url === "/api/time") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); return res.end(JSON.stringify({ t: Date.now() })); } // the trusted clock: businesses pay by this, not by the phone's clock
  if (url === "/api/stats") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache", "x-robots-tag": "noindex" }); return res.end(JSON.stringify({ total: playedCount() })); } // the welcome screen's population
  if (url === "/") url = "/index.html";                           // default page
  const file = path.join(PUBLIC, path.normalize(url).replace(/^(\.\.[\/\\])+/, "")); // block path escapes
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end("forbidden"); } // stay inside public/
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found"); } // missing file
    const ext = path.extname(file), isHtml = ext === ".html";
    if (file === path.join(PUBLIC, "index.html") || file === path.join(PUBLIC, "about.html")) countVisit(req, res, new URLSearchParams(String(req.url || "").split("?")[1] || "")); // count the page view
    if (isHtml) buf = Buffer.from(buf.toString("utf8").split("__SITE__").join(origin)); // link previews and canonical links need the full address
    const head = { "content-type": MIME[ext] || "application/octet-stream", "cache-control": isHtml || ext === ".js" || ext === ".json" ? "no-cache" : "public, max-age=86400", "x-content-type-options": "nosniff" };
    if (file === path.join(PUBLIC, "admin.html")) head["x-robots-tag"] = "noindex, nofollow"; // the admin page never shows in search
    if (/^(\.html|\.js|\.json|\.svg|\.css)$/.test(ext) && buf.length > 1024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) { buf = zlib.gzipSync(buf, { level: 6 }); head["content-encoding"] = "gzip"; } // 1 MB of page shrinks to a fraction
    head.vary = "accept-encoding"; res.writeHead(200, head); // serve it
    res.end(buf);
  });
});

// ---------- the realtime side: one WebSocket per open game tab ----------
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 }); // share the HTTP port; drop messages above 256 KB
const peers = new Map();                               // peerId -> { ws, uid, presence, tokens, last }
const subs = new Map();                                // ws -> [ { subId, col, limit, where } ]
let peersDirty = false;                                // did the room change since the last broadcast?
function regionsChanged() { // a region opened or closed: tell every phone, and walk anyone now in a locked region somewhere safe
  const list = REG.list(); for (const [, p] of peers) { send(p.ws, { t: "regions", regions: list }); // an "away" player has no socket: send skips them, but they are still moved
    const bad = p.presence && REG.placeOk(p.presence); if (bad) { const sp = REG.spawn(); Object.assign(p.presence, sp); peersDirty = true; send(p.ws, Object.assign({ t: "region.locked", back: sp }, REG.info(bad))); } }
}

function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} } } // one message (an "away" player has no socket)
const AWAY_MS = 5 * 60000;                             // a player whose connection drops (phone screen off) stays in the world as "away" this long
function roomList() { const out = []; for (const [peer, p] of peers) if (p.uid) out.push({ peer, kind: "viewer", presence: p.away ? Object.assign({}, p.presence, { away: 1, mv: false }) : p.presence || {} }); return out; } // everyone in town (away players marked)
function playedCount() { return Object.keys(db.players).length; } // everyone who has ever made a character

// ---------- town gossip: cheaters and people caught doing something bad get exposed to everyone ----------
const EXPOSE = { // what each kind of scandal says ({o} the offender, {v} the victim)
  cheat: ["💔", "{o} was caught cheating on {v}!"], sneak: ["🫣", "{o} got caught with a sneak link behind {v}'s back!"],
  pickpocket: ["🚓", "{o} was caught pickpocketing {v}!"], robbery: ["🚔", "Police tracked down {o} for robbing {v}!"],
  bag: ["👜", "{o} was caught snatching a tourist's bag on the beach!"], zaza: ["🚬", "{o} got busted smoking zaza at the res!"],
  race: ["🏁", "{o} got busted street racing on Coastal Road!"], fridge: ["🍗", "{o} was caught raiding the shared fridge at SLR!"],
  permit: ["👮", "{o} was caught without a valid permit!"],
  salon: ["💅", "{o} got caught lurking in Clawed by Taps, the girls-only nail salon! 👀"],
  arson: ["🔥", "{o} was caught setting the Presidential Palace on fire!"],
  loan: ["🤝", "{o} borrowed money from {v} and never paid it back! 👀"],
  sugar: ["💎", "{o} was spotted with a sugar patron. The whole town is talking!"],
  burgled: ["🚨", "Burglars raided {o}'s house while they were away! Lock up, everyone."],
  drugs: ["💊", "{o} was busted with drugs in Bambous Town!"], bust: ["🚔", "Police smashed {o}'s dealing operation in Bambous Town!"]
};
const cleanName = (v) => String(v || "").replace(/[<>\n\r\t]/g, "").trim().slice(0, 16); // names are shown as text, but keep them short and tidy
function expose(me, m) { // a player was caught: tell the whole town and remember it
  const t = EXPOSE[m.kind]; if (!t) return;
  const now = Date.now(); if (now - (me.exposedAt || 0) < 20000) return; me.exposedAt = now; // at most one scandal every 20 seconds per tab
  const doc = db.players[me.uid] || {}, who = cleanName(doc.name || (me.presence || {}).name) || "Someone", vic = cleanName(m.victim) || "their partner";
  const item = { id: crypto.randomBytes(6).toString("hex"), kind: m.kind, icon: t[0], text: t[1].replace("{o}", who).replace("{v}", vic), who, uid: me.uid, vuid: UID_RE.test(String(m.vuid || "")) ? String(m.vuid) : "", at: now };
  db.news.push(item); if (db.news.length > 60) db.news.splice(0, db.news.length - 60); persist(); // keep the latest 60
  for (const [, p] of peers) send(p.ws, { t: "news", item }); // everyone online sees it now
}
// ---------- chat: town chat and private messages are stored, so they are still there when you come back ----------
const chatRate = new Map(), lastSay = new Map(); // per player: chat allowance, and the last old-style message stored (so a reconnect does not repeat it)
const dmKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a); // one thread per pair of players
function chatSend(me, m) { // store one message and deliver it to everyone who should see it now
  const text = String(m.text || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, 200); // same tidy-up as the game
  const to = String(m.to || ""); if (!text || (to && (!UID_RE.test(to) || to === me.uid))) return; // empty, or a bad recipient
  if (to) { const gone = db.removed[to]; if (gone || !db.players[to]) { send(me.ws, { t: "chat.err", error: gone && gone.ban ? "🚫 This player has been banned from Flic en Flac Life, so they can't get your message." : "This player is no longer in the game." }); return; } } // nobody can message someone who was banned or removed
  const now = Date.now(), bucket = chatRate.get(me.uid) || { n: 10, at: now }; bucket.n = Math.min(10, bucket.n + (now - bucket.at) / 1000); bucket.at = now; chatRate.set(me.uid, bucket); // about one message a second per player, bursts of 10 allowed
  if (bucket.n < 1) { send(me.ws, { t: "chat.err", error: "You're sending messages too fast. Wait a second." }); return; } bucket.n -= 1;
  const doc = db.players[me.uid] || {}, name = cleanName(doc.name || (me.presence || {}).name || m.name) || "Player";
  const msg = { id: crypto.randomBytes(6).toString("hex"), from: me.uid, name, to, text, at: now, cid: String(m.cid || "").slice(0, 24) };
  if (!to) { db.chat.town.push(msg); if (db.chat.town.length > TOWN_KEEP) db.chat.town.splice(0, db.chat.town.length - TOWN_KEEP); for (const [, p] of peers) if (p.uid) send(p.ws, { t: "chat", m: msg }); } // everyone in town
  else { const k = dmKey(me.uid, to), th = db.chat.dm[k] || (db.chat.dm[k] = []); th.push(msg); if (th.length > DM_KEEP) th.splice(0, th.length - DM_KEEP); pruneDm(); tellUid(to, { t: "chat", m: msg }); tellUid(me.uid, { t: "chat", m: msg }); } // the two of them (offline players get it next login)
  persist();
}
function pay(ws, me, m) { // a money transfer, checked here, delivered by mail, and shown in the two players' private chat
  const reply = (ok, error) => send(ws, { t: "pay", rid: m.rid, ok, error }); const to = String(m.to || ""), amt = Math.floor(+m.amt || 0);
  if (!me.uid) return reply(false, "You're not signed in yet. Try again in a moment.");
  if (!UID_RE.test(to) || to === me.uid || !db.players[to]) return reply(false, db.removed[to] && db.removed[to].ban ? "This player has been banned, so they can't receive money." : "That player can't receive money.");
  if (!(amt >= 1 && amt <= PAY_MAX)) return reply(false, "Enter an amount between Rs 1 and Rs 1,000,000,000.");
  { const dd = db.players[me.uid] || {}, life = (() => { const sr = srcOf(dd); return SRC_KEYS.reduce((a, k) => a + sr[k], 0); })(); // a brand new life (or a restart) cannot be used to farm starting cash: until it has earned Rs 150,000 it may send Rs 5,000 a day
    if (life < NEW_LIFE_EARN) { const t0 = Date.now(), w = NEWLIFE_SENT.get(me.uid); if (!w || t0 - w.t > 86400000) NEWLIFE_SENT.set(me.uid, { t: t0, a: 0 }); const cur = NEWLIFE_SENT.get(me.uid); if (cur.a + amt > NEW_LIFE_SEND) return reply(false, "New characters can send up to Rs " + NEW_LIFE_SEND.toLocaleString("en") + " a day until they have earned Rs " + NEW_LIFE_EARN.toLocaleString("en") + " in the game."); cur.a += amt; } }
  const now = Date.now(), last = me.payAt || 0; if (now - last < 1500) return reply(false, "Slow down: one transfer at a time."); me.payAt = now;
  const doc = db.players[me.uid] || {}, name = cleanName(doc.name || (me.presence || {}).name) || "Someone", note = String(m.note || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  for (let left = amt, i = 0; left > 0; i++) { const part = Math.min(left, 9500000), id = crypto.randomBytes(10).toString("hex"); db.mail[id] = { to, from: name.slice(0, 24), amt: part, at: now + i, note: i ? "" : note }; left -= part; } pruneMail(); fanout("mail"); // the money itself, in parts of at most Rs 9,500,000 (the game only accepts a part that size, so a bigger one would have been thrown away)
  const msg = { id: crypto.randomBytes(6).toString("hex"), from: me.uid, name, to, text: "💸 Sent Rs " + amt.toLocaleString("en") + (note ? " · " + note : ""), at: now, pay: amt }; const k = dmKey(me.uid, to), th = db.chat.dm[k] || (db.chat.dm[k] = []); th.push(msg); if (th.length > DM_KEEP) th.splice(0, th.length - DM_KEEP); pruneDm(); tellUid(to, { t: "chat", m: msg }); tellUid(me.uid, { t: "chat", m: msg }); // and a line in your chat
  persist(); reply(true);
}
function pruneDm() { const ks = Object.keys(db.chat.dm); if (ks.length <= DM_THREADS) return; ks.map((k) => [k, (db.chat.dm[k].slice(-1)[0] || {}).at || 0]).sort((a, b) => a[1] - b[1]).slice(0, ks.length - DM_THREADS).forEach(([k]) => delete db.chat.dm[k]); } // drop the quietest old chats
function chatBacklog(uid) { // what one player sees on login: recent town chat and their private chats
  const dms = []; for (const k in db.chat.dm) { const [a, b] = k.split("|"); if (a === uid || b === uid) dms.push(db.chat.dm[k]); }
  dms.sort((x, y) => ((y.slice(-1)[0] || {}).at || 0) - ((x.slice(-1)[0] || {}).at || 0)); // newest chats first
  return db.chat.town.slice(-TOWN_BACK).concat(...dms.slice(0, 60).map((th) => th.slice(-CHAT_BACK)));
}
// ---------- the Heart Wall: anonymous notes everyone can read (the server knows who wrote each one, so admins can deal with abuse) ----------
const wallRate = new Map(); // uid -> when they last pinned a note
function wallFor(uid) { // what one player sees: no author ids, just whether a note is theirs and whether they hearted it
  return db.wall.filter((w) => !w.hidden).slice(-80).map((w) => ({ id: w.id, text: w.text, at: w.at, hearts: (w.hearts || []).length, mine: w.uid === uid, hearted: (w.hearts || []).includes(uid), reported: (w.reports || []).includes(uid) }));
}
function wallFanout() { for (const [, p] of peers) if (p.uid) send(p.ws, { t: "wall", items: wallFor(p.uid) }); persist(); } // everyone's wall updates
function wall(me, m) {
  if (!me.uid) return; const now = Date.now(), w = db.wall.find((q) => q.id === String(m.id || ""));
  if (m.t === "wall.post") {
    const text = String(m.text || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, 240); if (text.length < 2) return;
    const last = wallRate.get(me.uid) || 0; if (now - last < 120000) { send(me.ws, { t: "wall.err", error: "You can pin one note every 2 minutes. Wait " + Math.ceil((120000 - (now - last)) / 1000) + "s." }); return; } wallRate.set(me.uid, now);
    db.wall.push({ id: crypto.randomBytes(6).toString("hex"), text, at: now, uid: me.uid, hearts: [], reports: [] }); if (db.wall.length > WALL_KEEP) db.wall.splice(0, db.wall.length - WALL_KEEP);
  } else if (!w) return;
  else if (m.t === "wall.heart") { w.hearts = w.hearts || []; const i = w.hearts.indexOf(me.uid); if (i >= 0) w.hearts.splice(i, 1); else w.hearts.push(me.uid); }
  else if (m.t === "wall.report") { w.reports = w.reports || []; if (w.uid === me.uid || w.reports.includes(me.uid)) return; w.reports.push(me.uid); if (w.reports.length >= 3) w.hidden = true; } // three reports hide it until an admin looks
  else if (m.t === "wall.delete") { if (w.uid !== me.uid) return; db.wall = db.wall.filter((q) => q !== w); }
  wallFanout();
}
// ---------- stats for /admin: who comes back, how long a visit lasts, when it is busy, and which link people came from ----------
const TZ_MS = 4 * 3600000, STAT_DAYS = 70; // Mauritius time (UTC+4); keep about ten weeks
const dayKey = (t) => new Date(t + TZ_MS).toISOString().slice(0, 10), hourOf = (t) => new Date(t + TZ_MS).getUTCHours();
const cleanRef = (v) => { const r = String(v || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24); return r; };
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|monitor|uptime|lighthouse|headless|curl|wget|python|go-http|axios|node-fetch|java\//i; // link-preview fetchers, search engines and scripts are not visitors
const visitSets = {}; // day -> Set of the short visitor ids seen that day (rebuilt from the saved list after a restart)
function visitSource(q, referer, own) { // where this visit came from: a ?ref= tag, else the site that linked here
  const tag = cleanRef(q.get("ref")); if (tag) return tag; let h = ""; try { h = new URL(referer).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) {} if (!h || h === own) return "direct";
  for (const [re, n] of [[/google\./, "google"], [/bing\.|duckduckgo|yahoo\.|ecosia|brave\./, "search"], [/facebook\.|fb\.com|fb\.me|messenger/, "facebook"], [/instagram\./, "instagram"], [/tiktok/, "tiktok"], [/(^|\.)t\.co$|twitter\.|(^|\.)x\.com$/, "twitter"], [/linkedin\.|lnkd\.in/, "linkedin"], [/whatsapp|wa\.me/, "whatsapp"], [/youtube\.|youtu\.be/, "youtube"], [/reddit\./, "reddit"], [/snapchat/, "snapchat"]]) if (re.test(h)) return n;
  return "site:" + h.replace(/[^a-z0-9.-]/g, "").slice(0, 22);
}
function countVisit(req, res, q) { // one page opened on the site (the game or the about page): visitors are told apart by a plain cookie that holds a random number, nothing personal
  if (req.method !== "GET") return; const ua = String(req.headers["user-agent"] || ""), D = statDay(dayKey(Date.now()));
  if (!ua || BOT_RE.test(ua)) { D.b = (D.b || 0) + 1; persist(); return; }
  const ck = /(?:^|;\s*)fev=([a-f0-9]{16})(?:;|$)/.exec(String(req.headers.cookie || "")), id = ck ? ck[1] : crypto.randomBytes(8).toString("hex"), key = id.slice(0, 10), day = dayKey(Date.now());
  const own = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().replace(/^www\./, "").replace(/:\d+$/, "").toLowerCase();
  const S = visitSets[day] || (visitSets[day] = new Set(D.u || [])); for (const k in visitSets) if (k !== day) delete visitSets[k]; // today's visitors
  D.pv = (D.pv || 0) + 1; if (!S.has(key) && S.size < 20000) { S.add(key); (D.u = D.u || []).push(key); } if (!ck) D.nv = (D.nv || 0) + 1; // page views, visitors today, and first-time visitors
  const src = visitSource(q, req.headers.referer, own); D.pr = D.pr || {}; D.pr[src] = (D.pr[src] || 0) + 1; persist();
  if (!ck) { const secure = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https"; res.setHeader("set-cookie", "fev=" + id + "; Max-Age=31536000; Path=/; SameSite=Lax; HttpOnly" + (secure ? "; Secure" : "")); } // remember this browser for a year
}
function statDay(d) { const S = db.stats.days; if (!S[d]) { S[d] = { s: 0, t: 0, l: [], h: Array(24).fill(0), v: {}, pv: 0, u: [], nv: 0, b: 0, pr: {} }; const ks = Object.keys(S).sort(); while (ks.length > STAT_DAYS) delete S[ks.shift()]; } return S[d]; }
function statSeen(uid, m, isNew) { // a player said hello: mark today as a day they played, and remember where they first came from
  const now = Date.now(), d = dayKey(now), U = db.stats.users; let u = U[uid];
  if (!u) u = U[uid] = { f: isNew ? d : "", r: isNew ? cleanRef(m.fref || m.ref) || "direct" : "" , d: [] }; // players from before tracking keep no first day or source
  if (u.d[u.d.length - 1] !== d) { u.d.push(d); if (u.d.length > STAT_DAYS) u.d.splice(0, u.d.length - STAT_DAYS); }
  const ref = cleanRef(m.ref); if (ref) { const D = statDay(d); D.v[ref] = (D.v[ref] || 0) + 1; } persist(); // a visit through a tagged link
}
const sessOpen = new Map(); // uid -> { start, timer }: a visit in progress (a quick reconnect continues the same visit)
function sessStart(uid) { const o = sessOpen.get(uid); if (o) { clearTimeout(o.timer); o.timer = null; o.tabs = (o.tabs || 0) + 1; return; } sessOpen.set(uid, { start: Date.now(), timer: null, tabs: 1 }); }
function sessStop(uid) { const o = sessOpen.get(uid); if (!o) return; o.tabs = Math.max(0, (o.tabs || 1) - 1); if (o.tabs) return; // other tabs still open
  o.end = Date.now(); o.timer = setTimeout(() => { sessOpen.delete(uid); const sec = Math.round((o.end - o.start) / 1000); if (sec < 10) return; const D = statDay(dayKey(o.start)); D.s++; D.t += Math.min(sec, 6 * 3600); if (D.l.length < 2000) D.l.push(Math.min(sec, 6 * 3600)); persist(); }, 120000); } // gone for 2 minutes: the visit is over
setInterval(() => { const now = Date.now(), on = new Set(); for (const [, p] of peers) if (p.uid && !p.away && p.ws) on.add(p.uid); const D = statDay(dayKey(now)), h = hourOf(now); if (on.size > D.h[h]) { D.h[h] = on.size; persist(); } }, 60000); // the most players online at once, each hour
function statsReport() { // everything the admin Stats card shows
  const U = db.stats.users, days = Object.keys(db.stats.days).sort(), active = {}; for (const uid in U) for (const d of U[uid].d) (active[d] = active[d] || new Set()).add(uid);
  const add = (d, n) => dayKey(Date.parse(d + "T00:00:00Z") - TZ_MS + n * 86400000), today = dayKey(Date.now()), med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const back = (d, n) => { const A = active[d], B = active[add(d, n)]; if (!A || !A.size) return null; if (add(d, n) > today) return null; let c = 0; for (const u of A) if (B && B.has(u)) c++; return c; };
  const within = (d) => { const A = active[d]; if (!A || !A.size || add(d, 1) > today) return null; let c = 0; for (const u of A) { for (let i = 1; i <= 7; i++) { const B = active[add(d, i)]; if (B && B.has(u)) { c++; break; } } } return c; };
  const rows = days.slice(-14).reverse().map((d) => { const D = db.stats.days[d], A = active[d] || new Set(), nw = Object.values(U).filter((u) => u.f === d).length, pk = Math.max(...D.h); return { day: d, active: A.size, fresh: nw, d1: back(d, 1), d7: back(d, 7), w7: within(d), w7full: add(d, 7) <= today, visits: D.s, avgMin: D.s ? Math.round(D.t / D.s / 6) / 10 : 0, medMin: Math.round(med(D.l) / 6) / 10, peak: pk, peakHour: pk ? D.h.indexOf(pk) : null }; });
  const last7 = days.slice(-7), hours = Array.from({ length: 24 }, (_, h) => { const v = last7.map((d) => db.stats.days[d].h[h]); return { h, avg: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : 0, max: v.length ? Math.max(...v) : 0 }; });
  const refs = {}; for (const d of days.slice(-30)) for (const [r, n] of Object.entries(db.stats.days[d].v)) (refs[r] = refs[r] || { ref: r, visits: 0, players: 0, d1: 0, d1base: 0 }).visits += n;
  for (const uid in U) { const u = U[uid]; if (!u.f || !u.r) continue; const R = (refs[u.r] = refs[u.r] || { ref: u.r, visits: 0, players: 0, d1: 0, d1base: 0 }); R.players++; if (add(u.f, 1) <= today) { R.d1base++; if (u.d.includes(add(u.f, 1))) R.d1++; } }
  for (const r of rows) { const D = db.stats.days[r.day]; r.pv = D.pv || 0; r.uv = (D.u || []).length; r.nv = D.nv || 0; r.bots = D.b || 0; } // site visits for each day
  const sum = (ds, f) => ds.reduce((a, d) => a + f(db.stats.days[d]), 0), srcs = {}; for (const d of days.slice(-30)) for (const [k, n] of Object.entries(db.stats.days[d].pr || {})) srcs[k] = (srcs[k] || 0) + n;
  const site = { todayViews: sum(days.slice(-1), (D) => D.pv || 0), todayVisitors: sum(days.slice(-1), (D) => (D.u || []).length), weekViews: sum(last7, (D) => D.pv || 0), weekVisitors: sum(last7, (D) => (D.u || []).length), weekNew: sum(last7, (D) => D.nv || 0), monthViews: sum(days.slice(-30), (D) => D.pv || 0), allViews: sum(days, (D) => D.pv || 0), sources: Object.entries(srcs).map(([k, n]) => ({ src: k, views: n })).sort((a, b) => b.views - a.views).slice(0, 15), since: days.find((d) => db.stats.days[d].pv) || "" };
  const allL = last7.flatMap((d) => db.stats.days[d].l), wk = last7.reduce((a, d) => ({ s: a.s + db.stats.days[d].s, t: a.t + db.stats.days[d].t }), { s: 0, t: 0 });
  return { site, today, since: days[0] || today, rows, hours, refs: Object.values(refs).sort((a, b) => b.players - a.players || b.visits - a.visits), week: { visits: wk.s, avgMin: wk.s ? Math.round(wk.t / wk.s / 6) / 10 : 0, medMin: Math.round(med(allL) / 6) / 10 } };
}
// ---------- coins that bring players back: a daily login streak, and a bonus for both players when a friend joins through your link ----------
const DAILY = [500, 750, 1000, 1500, 2000, 3000, 5000]; // day 1 to day 7 of the streak; it repeats, a little bigger each week
const dailyAmt = (n) => DAILY[(n - 1) % 7] + Math.min(6, Math.floor((n - 1) / 7)) * 500; // +Rs 500 for every completed week, up to +Rs 3,000
const INVITER_BONUS = 3000, FRIEND_BONUS = 2000, INVITE_DAY_CAP = 5, INVITE_MINS = Math.max(1, +process.env.INVITE_MINS || 5); // coins for the one who shared, coins for the one who joined, rewarded joins a day, and minutes the friend must play
function rewardCoins(uid, amt, from, note) { const id = crypto.randomBytes(10).toString("hex"); db.mail[id] = { to: uid, from, amt, at: Date.now(), note }; pruneMail(); fanout("mail"); } // coins arrive like any other transfer: even if the player is offline, they get them next time
function rewardStatus(uid) { // what the player sees: streak, whether today's reward is waiting, and how their invites are going
  const U = db.rewards.users, u = U[uid] || { streak: 0, last: "", best: 0, total: 0 }, now = Date.now(), today = dayKey(now), yest = dayKey(now - 86400000);
  const live = u.last === today || u.last === yest, streak = live ? u.streak : 0, can = u.last !== today, next = u.last === today ? u.streak + 1 : u.last === yest ? u.streak + 1 : 1;
  const mine = Object.values(db.rewards.inv).filter((r) => r.by === uid), paid = mine.filter((r) => r.paid);
  return { ok: true, streak, best: u.best || 0, canClaim: can, next, amt: dailyAmt(next), day: ((next - 1) % 7) + 1, schedule: DAILY.map((_, i) => dailyAmt(next - ((next - 1) % 7) + i)), lost: !live && u.streak > 1, tomorrow: dailyAmt((can ? next : u.streak) + 1), invites: { joined: paid.length, waiting: mine.length - paid.length, earned: paid.length * INVITER_BONUS, inviter: INVITER_BONUS, friend: FRIEND_BONUS } };
}
function rewardClaim(uid) { // claim today's reward (once a day, by Mauritius time)
  const st = rewardStatus(uid); if (!st.canClaim) return Object.assign(st, { ok: false, error: "You already claimed today. Come back tomorrow!" });
  const U = db.rewards.users, u = U[uid] || (U[uid] = { streak: 0, last: "", best: 0, total: 0 }); u.streak = st.next; u.last = dayKey(Date.now()); u.best = Math.max(u.best || 0, u.streak); u.total = (u.total || 0) + st.amt;
  rewardCoins(uid, st.amt, "Daily reward", "🎁 Day " + st.day + " of your streak"); persist(); return Object.assign(rewardStatus(uid), { ok: true, claimed: st.amt, claimedDay: st.day });
}
function inviteStart(newUid, inviter) { // a brand-new player opened someone's invite link: remember it, and pay out once they have really played
  inviter = String(inviter || ""); if (!UID_RE.test(inviter) || inviter === newUid || !db.players[inviter] || db.rewards.inv[newUid]) return;
  db.rewards.inv[newUid] = { by: inviter, at: Date.now(), mins: 0, paid: 0 }; persist();
}
setInterval(() => { // every minute: count minutes the invited friend is online, and pay both when they've played long enough
  const now = Date.now(), on = new Set(); for (const [, p] of peers) if (p.uid && !p.away && p.ws) on.add(p.uid); let changed = false;
  for (const [nu, r] of Object.entries(db.rewards.inv)) { if (r.paid) continue; if (now - r.at > 7 * 86400000) { delete db.rewards.inv[nu]; changed = true; continue; } if (on.has(nu)) { r.mins++; changed = true; }
    if (r.mins < INVITE_MINS || !db.players[r.by] || !db.players[nu]) continue;
    const U = db.rewards.users, u = U[r.by] || (U[r.by] = { streak: 0, last: "", best: 0, total: 0 }), d = dayKey(now); if (!u.invDay || u.invDay.d !== d) u.invDay = { d, n: 0 }; if (u.invDay.n >= INVITE_DAY_CAP) continue; // a lot of joins in one day: the rest wait until tomorrow
    u.invDay.n++; r.paid = now; changed = true; const friend = cleanName(db.players[nu].name) || "A friend", host = cleanName(db.players[r.by].name) || "your friend";
    rewardCoins(r.by, INVITER_BONUS, "Invite bonus", "🎉 " + friend + " joined through your link!"); rewardCoins(nu, FRIEND_BONUS, "Welcome bonus", "🎁 You joined through " + host + "'s link"); }
  if (changed) persist();
}, 60000);
// ---------- the Saturday Fashion Show: everyone shares one schedule, enters a look, votes, and the winners get coins ----------
const SHOW_HOUR = 19, SHOW_MINS = 45, SHOW_PRIZES = [20000, 10000, 5000], SHOW_FAVOURITE = 10000, SHOW_VOTER = 200, SHOW_MAX = 24; // Saturdays 19:00 to 19:45 Mauritius time; prizes for the top three player looks, a bonus if the crowd's overall favourite is a player, coins for every voter, and how many players can enter
const FASHION_NPC = ["Midnight Gold", "Beach Chic", "Street Royalty", "Sega Queen", "Corporate Slay", "Island Explorer", "Neon Punk", "Moon Walker"]; // the designer looks (their pictures live in the game)
const TEST_SHOW = +process.env.FASHION_TEST_START || 0, TEST_LEN = +process.env.FASHION_TEST_MINS || SHOW_MINS; // for testing only: pretend the show starts at this time
function showTimes(now) { // the show that is on now, or the next one
  if (TEST_SHOW) { let st = TEST_SHOW; while (st + TEST_LEN * 60000 <= now) st += 7 * 86400000; return { start: st, end: st + TEST_LEN * 60000, key: "t" + st }; }
  const L = new Date(now + TZ_MS), add = (6 - L.getUTCDay() + 7) % 7; let start = Date.UTC(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate() + add, SHOW_HOUR, 0) - TZ_MS; if (start + SHOW_MINS * 60000 <= now) start += 7 * 86400000; return { start, end: start + SHOW_MINS * 60000, key: dayKey(start) };
}
function townSys(name, text) { const msg = { id: crypto.randomBytes(6).toString("hex"), from: "system", name, to: "", text: String(text).slice(0, 200), at: Date.now(), cid: "" }; db.chat.town.push(msg); if (db.chat.town.length > TOWN_KEEP) db.chat.town.splice(0, db.chat.town.length - TOWN_KEEP); for (const [, p] of peers) if (p.uid) send(p.ws, { t: "chat", m: msg }); persist(); } // a message from the game itself in town chat
const HEXC = /^#[0-9a-fA-F]{3,8}$/, PIECE = /^[a-z0-9]{1,20}$/;
function cleanLook(l) { l = l && typeof l === "object" ? l : {}; const h = (v) => (HEXC.test(String(v || "")) ? String(v) : ""), pc = (v) => (PIECE.test(String(v || "")) ? String(v) : ""); return { g: l.g === "f" ? "f" : "m", skin: h(l.skin), hcol: h(l.hcol), hs: ["short", "fade", "afro", "long", "braids", "bun", "bald"].includes(l.hs) ? l.hs : "", nails: h(l.nails), shirt: l.shirt === "" ? "" : h(l.shirt), pants: l.pants === "" ? "" : h(l.pants), cap: h(l.cap), shades: !!l.shades, role: /^[a-z]{3,12}$/.test(String(l.role || "")) ? String(l.role) : "resident", hd: pc(l.hd), tp: pc(l.tp), lg: pc(l.lg), ft: pc(l.ft) }; }
function fashionFinish(F) { // count the votes, pay the winners and tell the town
  const counts = {}; for (const v of Object.values(F.votes)) counts[v] = (counts[v] || 0) + 1; const pl = Object.entries(F.entries).map(([id, e]) => ({ id, uid: e.uid, name: e.name, votes: counts[id] || 0, at: e.at })).sort((a, b) => b.votes - a.votes || a.at - b.at);
  const all = pl.concat(FASHION_NPC.map((n, i) => ({ id: "n" + i, name: n, votes: counts["n" + i] || 0, at: 1e15, npc: 1 }))).sort((a, b) => b.votes - a.votes || a.at - b.at), top = all[0], total = Object.keys(F.votes).length, winners = [];
  pl.filter((x) => x.votes > 0).slice(0, 3).forEach((x, i) => { let amt = SHOW_PRIZES[i]; if (top && top.id === x.id) amt += SHOW_FAVOURITE; rewardCoins(x.uid, amt, "Fashion Show", (i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉") + " Your look placed #" + (i + 1) + (top && top.id === x.id ? " and was the crowd's favourite!" : "")); winners.push({ name: x.name, votes: x.votes, prize: amt }); });
  for (const uid of Object.keys(F.votes)) rewardCoins(uid, SHOW_VOTER, "Fashion Show", "👏 Thanks for voting from the front row");
  F.last = { key: F.key, total, top: all.slice(0, 3).map((x) => ({ id: x.id, name: x.name, votes: x.votes, npc: !!x.npc })), winners }; F.done = 1; persist();
  if (total) townSys("👗 Fashion Show", "Results are in! Look of the night: " + (top ? top.name : "—") + " (" + (top ? top.votes : 0) + " votes)." + (winners.length ? " Top players: " + winners.map((w, i) => (i + 1) + ". " + w.name + " (Rs " + w.prize.toLocaleString("en") + ")").join(" · ") : "") + " See you next Saturday at 19:00!"); else townSys("👗 Fashion Show", "That's a wrap on this week's Fashion Show. See you next Saturday at 19:00. Enter your look!");
  for (const [, p] of peers) if (p.uid) send(p.ws, { t: "fashion.results", last: F.last });
}
function fashionRoll(now) { // move on to the current week's show (and settle the one that just ended)
  const cur = showTimes(now), F = db.fashion; if (F.key !== cur.key) { if (F.key && !F.done && (Object.keys(F.entries).length || Object.keys(F.votes).length)) fashionFinish(F); db.fashion = { key: cur.key, entries: dict(), votes: dict(), done: 0, ann: dict(), last: F.last }; persist(); } return cur;
}
function fashionTick() { // announcements: a day before, half an hour before, and when it goes live
  const now = Date.now(), cur = fashionRoll(now), F = db.fashion; const say = (k, text, ev) => { if (F.ann[k]) return; F.ann[k] = 1; persist(); townSys("👗 Fashion Show", text); if (ev) for (const [, p] of peers) if (p.uid) send(p.ws, { t: ev, start: cur.start, end: cur.end }); };
  if (now >= cur.start && now < cur.end) say("live", "The Fashion Show is LIVE! Head to the runway by the beach road and vote for your favourite look. One vote each.", "fashion.live");
  else if (now >= cur.start - 30 * 60000 && now < cur.start) say("soon", "The Fashion Show starts in 30 minutes! Last chance to enter your look in the Events app.");
  else if (now >= cur.start - 24 * 3600000 && now < cur.start - 23 * 3600000) say("day", "Tomorrow at 19:00: the Fashion Show! Enter your look in the Events app and win up to Rs 20,000.");
}
setInterval(fashionTick, 15000);

// ---------- the richest player: a statue in town, and everyone is told when the crown changes hands ----------
let richCand = ""; // someone who looks richer than the king: they must stay ahead for a moment before the crown moves
function richTop() { let top = null; for (const uid in db.players) { const d = db.players[uid]; if (!d || db.removed[uid]) continue; const w = Math.round(Number(d.money) || 0); if (!top || w > top.worth) top = { uid, name: String(d.name || "Someone").slice(0, 16), worth: w }; } return top; }
function richTell(prev) { const r = db.rich; for (const [, p] of peers) send(p.ws, { t: "rich", rich: r, prev: prev || null }); }
function richCheck() {
  const top = richTop(); if (!top || top.worth < 1000) return; const cur = db.rich, king = cur && db.players[cur.uid] && !db.removed[cur.uid] ? db.players[cur.uid] : null;
  if (!cur || !king) { db.rich = { uid: top.uid, name: top.name, worth: top.worth, since: Date.now() }; richCand = ""; persist(); richTell(null); return; } // the first crown, or the king left the game
  const kw = Math.round(Number(king.money) || 0), kn = String(king.name || cur.name).slice(0, 16);
  if (top.uid === cur.uid || top.worth <= kw) { richCand = ""; if (cur.worth !== kw || cur.name !== kn) { cur.worth = kw; cur.name = kn; persist(); richTell(null); } return; } // still the richest (a tie keeps the crown)
  if (richCand !== top.uid) { richCand = top.uid; return; } // wait one more check: it must hold
  const prev = { uid: cur.uid, name: cur.name }; db.rich = { uid: top.uid, name: top.name, worth: top.worth, since: Date.now() }; richCand = ""; persist(); richTell(prev);
  townSys("👑 Rich list", top.name + " is now the richest player in Flic en Flac with Rs " + top.worth.toLocaleString("en") + "! " + prev.name + " lost the crown. Visit the statue.");
}

// ---------- the Financial Crimes agent and the court: watches how people get rich, freezes assets until the court rules ----------
const AG_MS = Math.max(1000, +process.env.AGENT_MS || 60000); // how often the agent looks (shorter when testing)
const AG_MIN_GAIN = +process.env.AGENT_MIN_GAIN || 80000, AG_WIN = 20 * 60000, AG_EXPIRE = Math.max(60000, +process.env.AGENT_EXPIRE_MS || 30 * 60000), AG_ROUTINE = +process.env.AGENT_ROUTINE_MS || 3 * 3600000, AG_COOL = +process.env.AGENT_COOL_MS || 2 * 3600000, AG_AUTO = +process.env.AGENT_AUTO_MS || 3 * 60000, AG_BASE = +process.env.AGENT_BASE_MS || 3 * 60000, AG_SAMPLE = +process.env.AGENT_SAMPLE_MS || 4 * 60000;
const AG_NAMES = ["Agent Ramphul", "Agent Beeharry", "Agent Dubois", "Agent Naidoo", "Agent Pillay"]; // the investigators
const SRC_KEYS = ["job", "biz", "invest", "gamble", "gift", "crime", "other"];
const srcOf = (d) => { try { const v = JSON.parse(d.save || "{}"), o = {}; for (const k of SRC_KEYS) o[k] = Math.max(0, Math.round(Number(v.src && v.src[k]) || 0)); return o; } catch (e) { const o = {}; for (const k of SRC_KEYS) o[k] = 0; return o; } };
const honest = (ds) => (ds.job | 0) + (ds.biz | 0) + (ds.invest | 0), earned = (ds) => { let t = 0; for (const k of SRC_KEYS) t += ds[k] | 0; return t; }; // what the player made from work, business and investments, and everything they took in; honest money is never a reason to freeze anyone
const caseOpen = (c) => c.status === "frozen";
const caseOf = (uid) => { for (const id in db.cases) { const c = db.cases[id]; if (c.uid === uid && (caseOpen(c) || !c.done)) return c; } return null; }; // a player's live case, or one they have not yet been told the end of
function caseView(c) { return { id: c.id, kind: c.kind, reason: c.reason, status: c.status, agent: c.agent, pct: c.pct, opened: c.opened, expires: c.expires, gain: c.gain, src: c.src, worth: c.worth, fine: c.fine, jail: c.jail, frozen: c.frozenAmt | 0, verdict: c.verdict || "", defense: c.defense || "", done: !!c.done }; }
function docket() { const rows = Object.values(db.cases).sort((a, b) => (b.closed || b.opened) - (a.closed || a.opened)).slice(0, 12); return rows.map((c) => ({ name: c.name, kind: c.kind, reason: c.reason, status: c.status, fine: c.fine | 0, at: c.closed || c.opened, agent: c.agent })); } // the public docket
function pushCase(uid, c) { tellUid(uid, { t: "case", case: c ? caseView(c) : null }); }
function openCase(uid, d, reason, kind, gain, src, rank) {
  if (caseOf(uid) || !db.agent.on) return null; const now = Date.now(), id = crypto.randomBytes(6).toString("hex"), agent = AG_NAMES[parseInt(id.slice(0, 2), 16) % AG_NAMES.length];
  const c = { id, uid, name: String(d.name || "Someone").slice(0, 16), kind, reason, opened: now, status: "frozen", agent, pct: kind === "routine" ? 0.5 : 0.9, frozenAmt: 0, ack: 0, gain: Math.round(gain), src, worth: Math.round(Number(d.money) || 0), expires: now + (kind === "routine" ? AG_AUTO : AG_EXPIRE), fine: 0, jail: 0, verdict: "", defense: "", done: 0 };
  db.cases[id] = c; persist(); const rich = rank && rank <= 3 ? " (#" + rank + " on the rich list)" : "";
  townSys("🕵️ Financial Crimes", kind === "routine" ? agent + " is auditing " + c.name + rich + ". Assets frozen until the books are checked." : agent + " opened an investigation into " + c.name + rich + ": " + reason + ". Assets frozen until the court rules.");
  pushCase(uid, c); return c;
}
function ruleCase(c, defense) { // the court decides
  if (!c || !caseOpen(c)) return c; const s0 = c.src || {}, crime = s0.crime | 0, risky = (s0.gamble | 0) + (s0.gift | 0), now = Date.now();
  let verdict = "cleared", fine = 0, jail = 0, why = "The books check out.";
  if (crime >= 12000 || (c.kind !== "routine" && crime > 0 && crime >= 0.25 * Math.max(1, c.gain))) { verdict = "convicted"; fine = Math.max(5000, Math.round(crime * 1.5)); jail = 360; why = "Guilty of handling stolen money."; }
  else if (c.kind !== "routine" && risky >= AG_MIN_GAIN * 0.5 && risky >= 0.6 * Math.max(1, earned(s0))) { verdict = "taxed"; fine = Math.round(risky * 0.2); why = "Gambling and transfers taxed at 20%."; }
  if (verdict === "convicted") { if (defense === "lawyer") { fine = Math.round(fine * 0.6); jail = 180; why += " The lawyer got the sentence cut."; } else if (defense === "guilty") { fine = Math.round(fine * 0.7); jail = 0; why += " Pleading guilty spared the cell."; } else if (defense === "absentia") { fine = Math.round(fine * 1.2); why += " They did not show up to court."; } }
  Object.assign(c, { status: verdict, fine, jail, defense: defense || "auto", verdict: why, closed: now, v: (c.v | 0) + 1 }); db.agent.cool[c.uid] = now + AG_COOL; db.agent.w[c.uid] = []; // fresh start after a ruling
  const caseLog = db.caseLog; caseLog.push({ name: c.name, verdict, fine, at: now }); if (caseLog.length > 100) caseLog.splice(0, caseLog.length - 100); persist();
  townSys("⚖️ Court", verdict === "cleared" ? c.name + " was cleared. Assets released. " + why : verdict === "taxed" ? c.name + " settled: Rs " + fine.toLocaleString("en") + " tax paid, assets released. " + why : c.name + " was convicted and fined Rs " + fine.toLocaleString("en") + (jail ? " plus a jail sentence" : "") + ". " + why);
  pushCase(c.uid, c); return c;
} // end ruleCase
function agentScan() {
  if (!db.agent.on) return; const now = Date.now(), rows = [];
  for (const uid in db.players) { const d = db.players[uid]; if (!d || db.removed[uid] || !d.save) continue; rows.push({ uid, d, w: Math.round(Number(d.money) || 0), src: srcOf(d) }); }
  rows.sort((a, b) => b.w - a.w); rows.forEach((r, i) => { r.rank = i + 1; });
  for (const c of Object.values(db.cases)) { if (!caseOpen(c)) { if (!c.done && now - (c.closed || 0) > 86400000) c.done = 1; if (c.done && now - (c.closed || 0) > 7 * 86400000) delete db.cases[c.id]; continue; } if (now >= c.expires) ruleCase(c, c.kind === "routine" ? "auto" : "absentia"); } // cases that run out of time are ruled on
  for (const r of rows) {
    const hist = db.agent.w[r.uid] || (db.agent.w[r.uid] = []); if (!hist.length || now - hist[hist.length - 1].t >= AG_SAMPLE) { hist.push({ t: now, w: r.w, src: r.src }); if (hist.length > 12) hist.shift(); }
    if (caseOf(r.uid) || (db.agent.cool[r.uid] || 0) > now || r.w < 20000) continue;
    const base = hist.find((h) => h.t >= now - AG_WIN && now - h.t >= AG_BASE); if (!base) continue; const gain = r.w - base.w, ds = {}; for (const k of SRC_KEYS) ds[k] = Math.max(0, r.src[k] - (base.src[k] || 0));
    let reason = "", kind = "fraud"; if (ds.crime >= 12000) reason = "money from theft"; else if (gain >= AG_MIN_GAIN && ds.gamble + ds.gift >= 0.6 * earned(ds) && ds.gamble + ds.gift >= AG_MIN_GAIN * 0.5) reason = "huge winnings and transfers"; else if (r.rank <= 3 && gain >= AG_MIN_GAIN * 2 && gain >= 0.3 * base.w && honest(ds) < 0.7 * earned(ds)) { reason = "wealth grew very fast"; kind = "routine"; } // a quick audit of the very rich: half frozen, cleared in minutes if the books are clean
    if (reason) openCase(r.uid, r.d, reason, kind, gain, ds, r.rank);
  }
  if (now - (db.agent.lastRoutine || 0) >= AG_ROUTINE && rows.length) { const k = rows.find((r) => r.w >= 50000 && !caseOf(r.uid) && (db.agent.cool[r.uid] || 0) <= now); if (k) { db.agent.lastRoutine = now; const hist = db.agent.w[k.uid] || [], base = hist[0], ds = {}; for (const key of SRC_KEYS) ds[key] = base ? Math.max(0, k.src[key] - (base.src[key] || 0)) : 0; if (earned(ds) > 0 && honest(ds) < 0.7 * earned(ds)) openCase(k.uid, k.d, "routine audit of the richest player", "routine", base ? k.w - base.w : 0, ds, k.rank); } } // every few hours the richest player's books are checked
}
setInterval(agentScan, AG_MS); setTimeout(agentScan, Math.min(15000, AG_MS));
function agentWs(ws, me, m) { // a player asks about their case, confirms a freeze, or defends themselves
  const reply = (o) => send(ws, Object.assign({ t: "case", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet." });
  const c = caseOf(me.uid);
  if (m.t === "case.get") return reply({ ok: true, case: c ? caseView(c) : null, docket: docket(), on: !!db.agent.on });
  if (m.t === "case.docket") return reply({ ok: true, docket: docket() });
  if (!c || c.id !== String(m.id || "")) return reply({ ok: false, error: "No such case." });
  if (m.t === "case.ack") { if (caseOpen(c)) { c.ack = 1; c.frozenAmt = Math.max(0, Math.min(1e10, Math.round(Number(m.amt) || 0))); } else if (m.done) c.done = 1; persist(); return reply({ ok: true, case: caseView(c) }); }
  if (m.t === "case.defend") { if (!caseOpen(c)) return reply({ ok: false, error: "The case is already closed.", case: caseView(c) }); const df = ["records", "lawyer", "guilty"].includes(m.defense) ? m.defense : "records"; ruleCase(c, df); return reply({ ok: true, case: caseView(c) }); }
  return reply({ ok: false, error: "Unknown request." });
} // end agentWs
// ---------- the governments: Flic en Flac and Tamarin each elect their own rich President for 3 days; the people can vote them out ----------
const GOV_TERM = Math.max(60000, +process.env.GOV_TERM_MS || 3 * 86400000), GOV_CAMPAIGN = Math.max(30000, +process.env.GOV_CAMPAIGN_MS || 12 * 3600000), GOV_FEE = 100000, GOV_LAW_CD = Math.max(1000, +process.env.GOV_LAW_CD_MS || 600000);
const GOV_EMB_CD = Math.max(500, +process.env.GOV_EMB_CD_MS || 1200000); // how often a President may take from the treasury
const GOV_EMB_MAX = 0.8; // a President may take any amount, but never more than 80% of the treasury
const GOV_CLASSES = ["mogul", "tycoon", "king", "queen", "majestym", "majestyf"]; // Business Mogul or higher can stand
const GOV_TOWNS = ["fef", "tam", "tri"], GOV_NAME = { fef: "Flic en Flac", tam: "Tamarin", tri: "Trianon" };
const govT = (v) => (GOV_TOWNS.includes(v) ? v : "fef"); // a town code from a request, Flic en Flac if unknown
const GOV_DEF = { tax: 0, fuel: 1, rent: 1, fines: 1, police: 2, health: 0, roads: 0, grants: 0, tourism: 0, surf: 0 }; // the laws at the start of every term
const GOV_PROG = { health: 20000, roads: 15000, grants: 25000, tourism: 15000, surf: 15000 }; // what each public programme costs per day out of the treasury
const GOV_PROG_TOWN = { fef: ["health", "roads", "grants", "tourism"], tam: ["roads", "grants", "tourism", "surf"], tri: ["roads", "grants", "tourism"] }; // Flic has the hospital, Tamarin the surf school
const govFresh = () => ({ pres: null, race: null, done: 0, laws: Object.assign({}, GOV_DEF), treasury: 0, ballot: { remove: dict(), keep: dict() }, hist: [], lawAt: dict(), here: dict(), progAt: Date.now(), heat: 0, stolen: 0, exposed: 0, embAt: 0, fire: 0, fireN: 0 });
function govNorm(g) { const d = govFresh(); if (!g || typeof g !== "object") return d; const o = Object.assign(d, g); o.laws = Object.assign({}, GOV_DEF, g.laws || {}); o.ballot = { remove: dict(g.ballot && g.ballot.remove), keep: dict(g.ballot && g.ballot.keep) }; o.lawAt = dict(g.lawAt); o.here = dict(g.here); o.hist = Array.isArray(g.hist) ? g.hist.slice(-20) : []; if (o.race) { o.race.cands = dict(o.race.cands); o.race.voted = dict(o.race.voted); } return o; }
if (!db.govs && db.gov) { db.govs = { fef: Object.assign({}, db.gov, { done: db.gov.pres || (db.gov.hist && db.gov.hist.length) ? 1 : 0 }) }; } // the old single government becomes Flic en Flac's
db.govs = db.govs || {}; for (const T of GOV_TOWNS) db.govs[T] = govNorm(db.govs[T]); delete db.gov;
const tamOpen = () => !!db.govs.fef.done; // Tamarin votes after Flic en Flac has held its first election
const govPubOne = (T) => { const g = db.govs[T]; return { pres: g.pres ? { uid: g.pres.uid, name: g.pres.name, since: g.pres.since, until: g.pres.until, votes: g.pres.votes | 0, party: partyTag(g.pres.party), promises: g.pres.promises || [] } : null, laws: g.laws, treasury: Math.round(g.treasury), heat: g.heat | 0, exposed: Math.round(g.exposed || 0), fire: g.fire > Date.now() ? g.fire : 0, race: g.race ? { ends: g.race.ends, n: Object.keys(g.race.cands).length } : null }; };
const WEALTH_DEF = { on: true, b: [[500000, 0.005], [3000000, 0.01], [20000000, 0.02]] }; // the weekly wealth tax on the rich: a rate on net worth above each line
function wealthNorm(w) { const o = { on: !(w && w.on === false), b: WEALTH_DEF.b.map((x) => x.slice()) }; if (w && Array.isArray(w.b)) w.b.slice(0, 3).forEach((x, i) => { const r = Number(x && x[1]); if (Number.isFinite(r) && r >= 0 && r <= 0.2) o.b[i][1] = r; }); return o; }
db.wealth = wealthNorm(db.wealth);
db.patron = db.patron || {}; db.patron.items = Array.isArray(db.patron.items) ? db.patron.items.slice(-200) : []; db.patron.firsts = db.patron.firsts && typeof db.patron.firsts === 'object' ? db.patron.firsts : {}; db.patron.pts = db.patron.pts && typeof db.patron.pts === 'object' ? db.patron.pts : {}; db.patron.at = db.patron.at && typeof db.patron.at === 'object' ? db.patron.at : {};
const govPub = () => Object.assign({ tamOpen: tamOpen(), wt: db.wealth }, ...GOV_TOWNS.map((T) => ({ [T]: govPubOne(T) }))); // what everybody needs to know
function govNews(text) { for (const [, p] of peers) send(p.ws, { t: "gov.news", text }); }
function govTell() { const o = { t: "gov", gov: govPub() }; for (const [, p] of peers) send(p.ws, o); }
const govTally = (T) => { const r = db.govs[T].race, c = {}; if (r) for (const v in r.voted) c[r.voted[v]] = (c[r.voted[v]] || 0) + 1; return c; };
const presOfUid = (uid) => GOV_TOWNS.find((T) => db.govs[T].pres && db.govs[T].pres.uid === uid) || "";
const candOfUid = (uid) => GOV_TOWNS.find((T) => db.govs[T].race && db.govs[T].race.cands[uid]) || "";
function govViewOne(uid, T) { const g = db.govs[T], d = db.players[uid] || {}, tl = govTally(T), nr = Object.keys(g.ballot.remove).length + (g.heat | 0), nk = Object.keys(g.ballot.keep).length + (g.pres ? g.pres.votes | 0 : 0);
  return Object.assign(govPubOne(T), { town: T, name: GOV_NAME[T], open: T === "fef" || tamOpen(), fee: GOV_FEE, term: GOV_TERM, canRun: GOV_CLASSES.includes(d.cls), cls: d.cls || "", cands: g.race ? Object.values(g.race.cands).map((c) => ({ uid: c.uid, name: c.name, votes: tl[c.uid] | 0, pitch: c.pitch || "", party: partyTag(c.party), promises: c.promises || [], buzz: c.buzz | 0, fund: Math.round(c.fund || 0), backed: !!c.backed, donors: Object.keys(c.donors || {}).length })).sort((a, b) => b.votes - a.votes || (b.buzz | 0) - (a.buzz | 0)) : [], last: g.last || null, camp: CAMP, debateCost: DEBATE_COST, debate: debateView(T, uid), cab: cabView(T), nSeats: Object.keys(mpsOf(T)).length, promiseList: PROMISE_LIST[T], kept: g.pres ? keptOf(T) : null, myVote: g.race ? g.race.voted[uid] || "" : "", ballot: { remove: nr, keep: nk, mine: g.ballot.remove[uid] ? "remove" : g.ballot.keep[uid] ? "keep" : "" }, hist: g.hist.slice(-5).reverse(), progCost: GOV_PROG, progs: GOV_PROG_TOWN[T], lawAt: g.lawAt, now: Date.now() }); }
const govView = (uid) => Object.assign({ ok: true, fee: GOV_FEE, tamOpen: tamOpen(), myPres: presOfUid(uid), myRun: candOfUid(uid) }, ...GOV_TOWNS.map((T) => ({ [T]: govViewOne(uid, T) }))); // every town in one answer
function govEnd(T, how) { const g = db.govs[T]; if (!g.pres) return; g.hist.push({ name: g.pres.name, since: g.pres.since, until: Date.now(), how }); g.hist = g.hist.slice(-20); const n = g.pres.name; g.pres = null; g.laws = Object.assign({}, GOV_DEF); g.ballot = { remove: dict(), keep: dict() }; g.lawAt = dict(); g.heat = 0; g.stolen = 0; g.exposed = 0; g.fire = 0; g.cab = null; g.nc = null; for (const b of g.bills || []) if (b.status === "voting" || b.status === "passed") b.status = "void"; persist();
  const tn = GOV_NAME[T]; townSys("🏛️ " + tn + " Government", how === "no confidence" ? "President " + n + " of " + tn + " lost a vote of no confidence in Parliament! The laws are back to normal. Rich players can register for a new election." : how === "voted out" ? "President " + n + " of " + tn + " was voted out by the people! The laws are back to normal. Rich players can register for a new election." : how === "resigned" ? "President " + n + " of " + tn + " resigned. The laws are back to normal. Rich players can register for a new election." : "President " + n + "'s 3-day term in " + tn + " is over. The laws are back to normal. Rich players can register for a new election."); govTell(); govNews("🏛️ The presidency of " + tn + " is vacant. Rich players can now run for President."); }
function govExpose(T, how) { // the President's embezzling comes out: the people are furious
  const g = db.govs[T], tn = GOV_NAME[T]; if (!g.pres || !(g.stolen > 0)) return; const n = Math.round(g.stolen); g.exposed = (g.exposed || 0) + g.stolen; g.stolen = 0; g.heat = Math.min(12, (g.heat | 0) + 3); persist();
  townSys("🚨 SCANDAL in " + tn, "President " + g.pres.name + " took Rs " + n.toLocaleString("en") + " from the " + tn + " treasury, exposed by " + how + "! The people can vote them out in the Government app."); govNews("🚨 President " + g.pres.name + " of " + tn + " was caught embezzling Rs " + n.toLocaleString("en") + "!"); govTell(); }
function govTick() { const now = Date.now();
  for (const T of GOV_TOWNS) { const g = db.govs[T], tn = GOV_NAME[T];
    if (g.race && now >= g.race.ends) { const tl = govTally(T), list = Object.values(g.race.cands).sort((a, b) => (tl[b.uid] | 0) - (tl[a.uid] | 0) || (b.buzz | 0) - (a.buzz | 0) || a.at - b.at), top = list[0];
      if (!top || !(tl[top.uid] | 0)) { if (!list.length) g.race = null; else { g.race.ends = now + 3600000; townSys("🏛️ " + tn + " Government", "Nobody has voted yet in the " + tn + " election! It stays open for one more hour. Open the Government app to vote."); } persist(); govTell(); }
      else { const tot = list.reduce((n, c) => n + (tl[c.uid] | 0), 0); g.last = { at: now, total: tot, rows: list.slice(0, 8).map((c) => ({ name: c.name, party: partyTag(c.party), votes: tl[c.uid] | 0, pct: tot ? Math.round((tl[c.uid] | 0) / tot * 100) : 0 })) }; { const wp = db.parties[top.party]; if (wp) { wp.wins = (wp.wins | 0) + 1; const grant = Math.min(STATE_FUND, Math.floor(g.treasury * 0.5)); if (grant > 0) { g.treasury -= grant; wp.funds = (wp.funds || 0) + grant; townSys("🎗️ Politics", wp.name + " [" + wp.tag + "] won " + tn + " and receives a Rs " + grant.toLocaleString("en") + " victory grant from the treasury."); } } }
        g.parl = seatsFrom(list, tl); g.bills = []; g.cab = null; g.nc = null;
        g.pres = { uid: top.uid, name: top.name, since: now, until: now + GOV_TERM, votes: tl[top.uid] | 0, party: top.party || "", promises: (top.promises || []).slice(0, 3) }; g.laws = Object.assign({}, GOV_DEF); g.ballot = { remove: dict(), keep: dict() }; g.lawAt = dict(); g.here = dict(); g.heat = 0; g.stolen = 0; g.exposed = 0; g.fire = 0; g.race = null; const first = !g.done; g.done = 1; persist();
        townSys("🏛️ " + tn + " Government", top.name + " won the " + tn + " election with " + (tl[top.uid] | 0) + " vote" + ((tl[top.uid] | 0) === 1 ? "" : "s") + " and is the new President of " + tn + "! The term lasts 3 days. Long live the President!"); townSys("🗳️ " + tn + " results", g.last.rows.slice(0, 4).map((r) => r.name + (r.party ? " [" + r.party.tag + "]" : "") + " " + r.votes + " (" + r.pct + "%)").join(" · ") + ". Turnout: " + g.last.total + " vote" + (g.last.total === 1 ? "" : "s") + "." + ((top.promises || []).length ? " Promises: " + top.promises.map((k) => (PROMISES[k] || ["?"])[0]).join("; ") + "." : "")); govTell(); govNews("🏛️ " + top.name + " is the new President of " + tn + "!");
        if (T === "fef" && first) { townSys("🏛️ Tamarin and Trianon Governments", "Flic en Flac has its President. Tamarin and Trianon can now hold their own elections: rich players can register in the Government app."); govNews("🏛️ The Tamarin and Trianon elections are now open. Rich players can run in the Government app."); } } }
    if (g.pres && g.stolen > 0 && Math.random() < Math.min(0.8, g.stolen / 150000) * 15 / 3600) govExpose(T, "a leaked bank statement"); // stolen money leaks out sooner or later
    if (g.fire && now >= g.fire) { g.fire = 0; persist(); townSys("🔥 " + tn + " Palace", "The fire at the Presidential Palace is out. The firefighters say the walls are still standing."); govTell(); }
    if (g.pres && now >= g.pres.until) govEnd(T, "term over");
    if (g.pres && now - g.progAt >= 3600000) { const hrs = Math.floor((now - g.progAt) / 3600000); g.progAt += hrs * 3600000; for (const k in GOV_PROG) if (g.laws[k]) { const cost = GOV_PROG[k] / 24 * hrs * ((k === "health" && hasMin(T, "health")) || (k === "tourism" && hasMin(T, "tourism")) ? 0.75 : 1); if (g.treasury >= cost) g.treasury -= cost; else { g.laws[k] = 0; townSys("🏛️ " + tn + " Government", "The treasury ran dry: the " + k + " programme was cancelled."); } } persist(); govTell(); } else if (!g.pres) g.progAt = now; } }
setInterval(govTick, 15000); setInterval(() => { try { parlTick(); } catch (e) { console.warn("parlTick", e.message); } }, 10000);
function govWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "gov", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet." });
  const T = govT(m.town), g = db.govs[T], tn = GOV_NAME[T], d = db.players[me.uid], now = Date.now(); if (!d) return reply({ ok: false, error: "Play a little first." });
  if (m.t === "gov.get") return reply(govView(me.uid));
  if (m.t === "gov.run") { if (T !== "fef" && !tamOpen()) return reply({ ok: false, error: "The " + tn + " election opens after the Flic en Flac election." }); { const own = presOfUid(me.uid); if (own) return reply({ ok: false, error: "You are already President of " + GOV_NAME[own] + ". Nobody can lead two towns." }); } if (!GOV_CLASSES.includes(d.cls)) return reply({ ok: false, error: "Only Business Moguls and richer can stand for President." }); if (g.pres) return reply({ ok: false, error: tn + " has a President already. Elections open when the term ends." });
    const other = presOfUid(me.uid) || candOfUid(me.uid); if (other && other !== T) return reply({ ok: false, error: "You are already " + (presOfUid(me.uid) ? "President" : "a candidate") + " in " + GOV_NAME[other] + ". Nobody can lead two towns." });
    if ((Number(d.money) || 0) < GOV_FEE + 50000) return reply({ ok: false, error: "You need " + (GOV_FEE + 50000).toLocaleString("en") + " to campaign." });
    if (g.race && g.race.cands[me.uid]) return reply({ ok: false, error: "You are already a candidate." });
    const myParty = partyOf(me.uid); if (myParty && g.race && Object.values(g.race.cands).some((c) => c.party === myParty.id)) return reply({ ok: false, error: "Your party " + myParty.name + " already has a candidate in this election." }); if (myParty && myParty.ally && g.race && Object.values(g.race.cands).some((c) => c.party === myParty.ally)) return reply({ ok: false, error: "Your coalition partner already has a candidate in this election. Back them instead." });
    if (!g.race) g.race = { ends: now + GOV_CAMPAIGN, cands: dict(), voted: dict() }; g.race.cands[me.uid] = { uid: me.uid, name: String(d.name || "Someone").slice(0, 16), at: now, pitch: String(m.pitch || "").slice(0, 60), party: myParty ? myParty.id : "", promises: [], buzz: 0, fund: 0, donors: dict(), cd: dict() }; g.treasury += GOV_FEE; persist();
    townSys("🏛️ " + tn + " Government", String(d.name || "Someone").slice(0, 16) + " is running for President of " + tn + "! Open the Government app to vote. The vote closes " + new Date(g.race.ends).toUTCString().slice(5, 22) + " UTC."); govTell(); return reply(Object.assign(govView(me.uid), { paid: 1 })); }
  if (m.t === "gov.vote") { if (!g.race) return reply({ ok: false, error: "No election right now." }); const c = String(m.for || ""); if (!g.race.cands[c]) return reply({ ok: false, error: "No such candidate." }); g.race.voted[me.uid] = c; persist(); return reply(govView(me.uid)); }
  if (m.t === "gov.ballot") { if (!g.pres) return reply({ ok: false, error: "There is no President." }); if (g.pres.uid === me.uid) return reply({ ok: false, error: "The President cannot vote on their own term." }); const v = m.v === "remove" ? "remove" : "keep"; delete g.ballot.remove[me.uid]; delete g.ballot.keep[me.uid]; g.ballot[v][me.uid] = 1; persist();
    const nr = Object.keys(g.ballot.remove).length + (g.heat | 0), nk = Object.keys(g.ballot.keep).length + (g.pres.votes | 0); if (nr >= 3 && nr > nk) { govEnd(T, "voted out"); return reply(govView(me.uid)); } return reply(govView(me.uid)); }
  if (m.t === "gov.law") { if (!g.pres || g.pres.uid !== me.uid) return reply({ ok: false, error: "Only the President of " + tn + " can change its laws." }); const k = String(m.key || ""); if (!(k in GOV_DEF)) return reply({ ok: false, error: "No such law." }); let v = Number(m.val); if (!Number.isFinite(v)) return reply({ ok: false, error: "Bad value." });
    if (GOV_PROG[k] && !GOV_PROG_TOWN[T].includes(k)) return reply({ ok: false, error: tn + " has no such programme." });
    if ((g.lawAt[k] || 0) + GOV_LAW_CD > now) return reply({ ok: false, error: "That law was changed a moment ago. Try again in " + Math.ceil(((g.lawAt[k] || 0) + GOV_LAW_CD - now) / 60000) + " min." });
    if (k === "tax") v = Math.round(Math.max(0, Math.min(15, v))); else if (k === "police") v = Math.round(Math.max(0, Math.min(3, v))); else if (k === "fuel" || k === "rent") v = Math.round(Math.max(0.7, Math.min(1.5, v)) * 20) / 20; else if (k === "fines") v = Math.round(Math.max(0.5, Math.min(2, v)) * 20) / 20; else { v = v ? 1 : 0; if (v && g.treasury < GOV_PROG[k]) return reply({ ok: false, error: "The treasury cannot pay for that yet (needs " + GOV_PROG[k].toLocaleString("en") + " a day)." }); }
    if (g.laws[k] === v) return reply({ ok: false, error: "That is the law already." }); g.laws[k] = v; g.lawAt[k] = now; persist();
    const say = { tax: "Income tax on wages and business is now " + v + "%.", fuel: "Petrol prices are now " + Math.round(v * 100) + "% of normal.", rent: "Rents are now " + Math.round(v * 100) + "% of normal.", fines: "Fines and bail are now " + Math.round(v * 100) + "% of normal.", police: "Police patrols are now " + ["off", "light", "normal", "heavy"][v] + ".", health: v ? "Free healthcare starts today." : "Free healthcare has ended.", roads: v ? "Road repair is funded: everyone drives faster." : "Road repair funding has ended.", grants: v ? "Student grants are open." : "Student grants have ended.", tourism: v ? "A tourism campaign boosts wages." : "The tourism campaign has ended.", surf: v ? "Surf lessons are free for everyone." : "Free surf lessons have ended." }[k];
    townSys("🏛️ " + tn + " Government", "President " + g.pres.name + " of " + tn + ": " + say); govTell(); return reply(Object.assign(govView(me.uid), { ok: true })); }
  if (m.t === "gov.tax") { if (!g.pres) return reply({ ok: true }); const a = Math.max(0, Math.min(50000, Math.round(Number(m.amt) || 0))); me.taxAt = me.taxAt || {}; if (now - (me.taxAt[T] || 0) < 8000) return reply({ ok: true }); me.taxAt[T] = now; g.treasury += hasMin(T, "finance") ? Math.round(a * 1.1) : a; persist(); return reply({ ok: true }); }
  if (m.t === "gov.arrive") { const home = presOfUid(me.uid); if (!home) return reply({ ok: false }); const gh = db.govs[home], town = govT(m.town); if ((gh.here[town] || 0) + 300000 > now) return reply({ ok: true }); gh.here[town] = now; persist(); const who = "President " + gh.pres.name + " of " + GOV_NAME[home];
    townSys("🎖️ The President", who + " has arrived in " + GOV_NAME[town] + " with " + (m.heli ? "a helicopter and " : "") + "the bodyguards!"); govNews("🎖️ " + who + " has arrived in " + GOV_NAME[town] + "! Look out for the bodyguards."); return reply({ ok: true }); }
  if (m.t === "gov.embezzle") { if (!g.pres || g.pres.uid !== me.uid) return reply({ ok: false, error: "Only the President of " + tn + " has the keys to the treasury." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); const a = Math.floor(Number(m.amt) || 0), cap = Math.floor((g.treasury || 0) * GOV_EMB_MAX); if (!(a >= 1000)) return reply({ ok: false, error: "Take at least Rs 1,000." }); if (a > cap) return reply({ ok: false, error: "Not all of it: you can take up to Rs " + cap.toLocaleString("en") + " (" + Math.round(GOV_EMB_MAX * 100) + "% of the treasury)." });
    if ((g.embAt || 0) + GOV_EMB_CD > now) return reply({ ok: false, error: "The auditors are watching. Try again in " + Math.ceil(((g.embAt || 0) + GOV_EMB_CD - now) / 60000) + " min." }); if (g.treasury < a) return reply({ ok: false, error: "The treasury only has " + Math.round(g.treasury).toLocaleString("en") + "." });
    const share = a / Math.max(1, g.treasury); g.treasury -= a; g.embAt = now; g.stolen = (g.stolen || 0) + a; for (let left = a; left > 0;) { const part = Math.min(left, 9500000); mailTo(me.uid, part, "Consulting fee", "The Palace"); left -= part; } /* the mailbox takes up to Rs 10M at a time */ persist(); const caught = Math.random() < Math.min(0.95, 0.15 + 0.75 * share + (hasMin(T, "police") ? 0.15 : 0)); /* the bigger the haul, the likelier it leaks */ if (caught) govExpose(T, "a palace clerk"); else govTell(); return reply(Object.assign(govView(me.uid), { ok: true, took: a, caught: caught ? 1 : 0 })); }
  if (m.t === "gov.fire") { if (!g.pres) return reply({ ok: false, error: "There is no President to be angry at." }); if (g.pres.uid === me.uid) return reply({ ok: false, error: "You can't burn your own palace." }); if (g.fire > now) return reply({ ok: false, error: "The palace is already burning!" }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    if ((me.fireAt || 0) + 3600000 > now) return reply({ ok: false, error: "You lit one just now. Lie low for a while." }); if ((g.fireAt || 0) + 1800000 > now) return reply({ ok: false, error: "The palace was on fire a moment ago. Wait for the firefighters to finish." });
    me.fireAt = now; g.fireAt = now; g.fire = now + 15 * 60000; g.fireN = (g.fireN | 0) + 1; const dmg = Math.min(g.treasury, Math.max(20000, Math.round(g.treasury * 0.15))); g.treasury -= dmg; persist(); const caught = Math.random() < 0.5;
    townSys("🔥 " + tn + " Palace", "The Presidential Palace of " + tn + " is on FIRE! President " + g.pres.name + "'s people say repairs will cost Rs " + Math.round(dmg).toLocaleString("en") + " from the treasury." + (caught ? " Police are searching for the arsonist." : "")); govNews("🔥 The " + tn + " Presidential Palace is on fire!"); govTell(); return reply(Object.assign(govView(me.uid), { ok: true, caught: caught ? 1 : 0, dmg: Math.round(dmg) })); }
  if (m.t === "gov.promise") { // a candidate tells voters what they will do
    const c = g.race && g.race.cands[me.uid]; if (!c) return reply({ ok: false, error: "Only a candidate in this election can make promises." }); const list = (Array.isArray(m.list) ? m.list : []).map(String).filter((k, i, a2) => PROMISE_LIST[T].includes(k) && a2.indexOf(k) === i).slice(0, 3); c.promises = list; persist(); govTell(); return reply(Object.assign(govView(me.uid), { ok: true })); }
  if (m.t === "gov.campaign") { // spend on the campaign: posters, a rally or an ad
    const c = g.race && g.race.cands[me.uid], k = CAMP[String(m.kind || "")]; if (!c || !k) return reply({ ok: false, error: "Only a candidate can campaign." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); const kind = String(m.kind); c.cd = c.cd || dict();
    if ((c.cd[kind] || 0) + k.cd > now) return reply({ ok: false, error: "Wait " + Math.ceil(((c.cd[kind] || 0) + k.cd - now) / 60000) + " min before doing that again." });
    const fromFund = (c.fund || 0) >= k.cost; if (!fromFund && (Number(d.money) || 0) < k.cost) return reply({ ok: false, error: "You need " + k.cost.toLocaleString("en") + " for that." }); if (fromFund) c.fund -= k.cost;
    c.cd[kind] = now; c.buzz = Math.min(100, (c.buzz | 0) + k.buzz); const pt = partyTag(c.party), who = c.name + (pt ? " [" + pt.tag + "]" : ""); persist();
    townSys("🗳️ " + tn + " campaign", kind === "poster" ? who + " plastered " + tn + " with campaign posters." : kind === "rally" ? "🎤 " + who + " held a rally in " + tn + (c.pitch ? ': "' + c.pitch + '"' : "") + (c.promises && c.promises.length ? " Promises: " + c.promises.map((q) => (PROMISES[q] || ["?"])[0]).join("; ") + "." : "") : "📺 " + who + " is on every screen in " + tn + ": vote for change!");
    if (kind === "ad") { const item = { id: crypto.randomBytes(6).toString("hex"), kind: "campaign", icon: "🗳️", text: who + " bought a campaign ad in " + tn + ". Election closes in " + Math.max(1, Math.round((g.race.ends - now) / 3600000)) + "h.", who: c.name, uid: me.uid, vuid: "", at: now }; db.news.push(item); if (db.news.length > 60) db.news.splice(0, db.news.length - 60); for (const [, p] of peers) send(p.ws, { t: "news", item }); }
    govTell(); return reply(Object.assign(govView(me.uid), { ok: true, paid: fromFund ? 0 : k.cost, cost: k.cost })); }
  if (m.t === "gov.donate") { // give money to a candidate's campaign fund
    const c = g.race && g.race.cands[String(m.to || "")], a2 = Math.floor(Number(m.amt) || 0); if (!c) return reply({ ok: false, error: "That candidate isn't running." }); if (!(a2 >= 1000 && a2 <= 1000000)) return reply({ ok: false, error: "Give between Rs 1,000 and Rs 1,000,000." }); if (c.uid === me.uid) return reply({ ok: false, error: "Use your own cash for your own campaign." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    if ((Number(d.money) || 0) < a2) return reply({ ok: false, error: "You don't have that much." }); c.fund = (c.fund || 0) + a2; c.donors = c.donors || dict(); c.donors[me.uid] = (c.donors[me.uid] || 0) + a2; persist(); tellUid(c.uid, { t: "gov.news", text: "🗳️ " + nameOfSrv(me.uid) + " donated Rs " + a2.toLocaleString("en") + " to your campaign." }); return reply(Object.assign(govView(me.uid), { ok: true, paid: a2 })); }
  if (m.t === "gov.debate") { // challenge a rival to a TV debate: the viewers pick the winner
    const c = g.race && g.race.cands[me.uid], r = g.race && g.race.cands[String(m.rival || "")]; if (!c) return reply({ ok: false, error: "Only a candidate can start a debate." }); if (!r || r.uid === me.uid) return reply({ ok: false, error: "Pick a rival candidate." }); if (g.race.debate) return reply({ ok: false, error: "A debate is on already." }); if ((c.dbAt || 0) + DEBATE_CD > now) return reply({ ok: false, error: "You debated recently. Try again in " + Math.ceil(((c.dbAt || 0) + DEBATE_CD - now) / 60000) + " min." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    if ((Number(d.money) || 0) < DEBATE_COST) return reply({ ok: false, error: "A TV slot costs Rs " + DEBATE_COST.toLocaleString("en") + "." }); c.dbAt = now; const topic = DEBATE_TOPICS[Math.floor(Math.random() * DEBATE_TOPICS.length)]; g.race.debate = { a: c.uid, b: r.uid, topic, ends: now + DEBATE_MS, votes: dict() }; persist(); townSys("📺 " + tn + " debate", c.name + " challenged " + r.name + " to a live TV debate on " + topic + ". Watch and vote for the winner in the Government app: " + Math.round(DEBATE_MS / 60000) + " minutes."); govTell(); return reply(Object.assign(govView(me.uid), { ok: true, paid: DEBATE_COST })); }
  if (m.t === "gov.debateVote") { const dd = g.race && g.race.debate; if (!dd) return reply({ ok: false, error: "No debate is on." }); const f = String(m.for || ""); if (f !== dd.a && f !== dd.b) return reply({ ok: false, error: "Pick one of the two." }); if (me.uid === dd.a || me.uid === dd.b) return reply({ ok: false, error: "The debaters don't vote." }); dd.votes[me.uid] = f; persist(); return reply(govView(me.uid)); }
  if (m.t === "gov.resign") { if (!g.pres || g.pres.uid !== me.uid) return reply({ ok: false, error: "You are not the President of " + tn + "." }); govEnd(T, "resigned"); return reply(govView(me.uid)); }
  reply({ ok: false, error: "Unknown request." });
}
// ---------- politics: parties, campaign promises and what the candidates do ----------
const PROMISES = { tax: ["Cut income tax to 3% or less", (l) => l.tax <= 3], health: ["Free healthcare", (l) => l.health === 1], fuel: ["Cheaper petrol (90% or less)", (l) => l.fuel <= 0.9], rent: ["Lower rents (90% or less)", (l) => l.rent <= 0.9], fines: ["Lower fines (90% or less)", (l) => l.fines <= 0.9], police: ["Heavy police patrols", (l) => l.police >= 3], grants: ["Open student grants", (l) => l.grants === 1], roads: ["Fund road repair", (l) => l.roads === 1], tourism: ["Run a tourism campaign", (l) => l.tourism === 1], surf: ["Free surf lessons", (l) => l.surf === 1] };
const PROMISE_LIST = { fef: ["tax", "health", "fuel", "rent", "fines", "police", "grants", "roads", "tourism"], tam: ["tax", "fuel", "rent", "fines", "police", "grants", "roads", "tourism", "surf"], tri: ["tax", "fuel", "rent", "fines", "police", "grants", "roads", "tourism"] };
const CAMP = { poster: { cost: 50000, buzz: 1, cd: 10 * 60000 }, rally: { cost: 150000, buzz: 3, cd: 30 * 60000 }, ad: { cost: 300000, buzz: 6, cd: 60 * 60000 } }; // posters, a rally in town, a TV and phone ad
const keptOf = (T) => { const g = db.govs[T], pr = (g.pres && g.pres.promises) || []; return pr.map((k) => ({ k, text: (PROMISES[k] || ["?"])[0], kept: !!(PROMISES[k] && PROMISES[k][1](g.laws)) })); }; // which promises the President has kept so far
const partyOf = (uid) => { for (const id in db.parties) if (db.parties[id].members[uid]) return db.parties[id]; return null; };
const partyTag = (id) => { const q = id && db.parties[id]; return q ? { id: q.id, tag: q.tag, icon: q.icon, color: q.color, name: q.name } : null; };
const STATE_FUND = 500000, PARTY_FEE = 250000, PARTY_MAX = 50, PARTY_ICONS = ["🌹", "🌴", "🦅", "⭐", "🔥", "⚓", "🐬", "🦁", "🌊", "🏛️", "✊", "🌿", "💎", "⚡", "🛡️", "🕊️"], PARTY_COLORS = ["#d64545", "#e8892f", "#d9b500", "#3f9d5a", "#2a9bb5", "#3d6fd6", "#8a55c8", "#d6549a"];
const partySum = (q) => ({ id: q.id, name: q.name, tag: q.tag, icon: q.icon, color: q.color, ally: q.ally ? partyTag(q.ally) : null, allyOffer: q.allyOffer && db.parties[q.allyOffer.from] ? partyTag(q.allyOffer.from) : null, n: Object.keys(q.members).length, wins: q.wins | 0, leader: nameOfSrv(q.leader), manifesto: q.manifesto, funds: Math.round(q.funds || 0) });
const partyView = (q) => q ? Object.assign(partySum(q), { leaderUid: q.leader, created: q.created, members: Object.keys(q.members).map((u) => ({ uid: u, name: nameOfSrv(u), at: q.members[u].at, leader: u === q.leader })).sort((a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0) || a.at - b.at) }) : null;
function partyDrop(uid) { // someone leaves, is kicked or is deleted: the party carries on, or ends if it is empty
  const q = partyOf(uid); if (!q) return; delete q.members[uid]; const left = Object.keys(q.members).sort((a, b) => q.members[a].at - q.members[b].at);
  if (!left.length) { delete db.parties[q.id]; townSys("🎗️ Politics", q.name + " [" + q.tag + "] has disbanded."); } else if (q.leader === uid) { q.leader = left[0]; tellUid(q.leader, { t: "gov.news", text: "🎗️ You are now the leader of " + q.name + "." }); } persist();
}
function partyWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "party", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet." }); const d = db.players[me.uid]; if (!d) return reply({ ok: false, error: "Play a little first." });
  const mine = partyOf(me.uid), all = () => Object.values(db.parties).map(partySum).sort((a, b) => b.n - a.n || b.wins - a.wins).slice(0, 40), view = () => ({ ok: true, mine: partyView(partyOf(me.uid)), list: all(), fee: PARTY_FEE, icons: PARTY_ICONS, colors: PARTY_COLORS });
  if (m.t === "party.get") return reply(view());
  if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); const now = Date.now();
  if (m.t === "party.create") {
    if (mine) return reply({ ok: false, error: "You are in a party already. Leave it first." }); const name = String(m.name || "").replace(/[^A-Za-z0-9 '&\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 20), tag = String(m.tag || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4), icon = PARTY_ICONS.includes(m.icon) ? m.icon : "⭐", color = PARTY_COLORS.includes(m.color) ? m.color : PARTY_COLORS[0];
    if (name.length < 3) return reply({ ok: false, error: "Give your party a name of at least 3 letters." }); if (tag.length < 2) return reply({ ok: false, error: "The short tag needs 2 to 4 letters or numbers." }); if (Object.values(db.parties).some((q) => q.name.toLowerCase() === name.toLowerCase() || q.tag === tag)) return reply({ ok: false, error: "A party already has that name or tag." });
    if ((Number(d.money) || 0) < PARTY_FEE) return reply({ ok: false, error: "Founding a party costs Rs " + PARTY_FEE.toLocaleString("en") + "." }); if (Object.keys(db.parties).length >= 200) return reply({ ok: false, error: "There are too many parties already." });
    const id = crypto.randomBytes(4).toString("hex"); db.parties[id] = { id, name, tag, icon, color, manifesto: String(m.manifesto || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 160), leader: me.uid, members: dict(), funds: PARTY_FEE, wins: 0, created: now }; db.parties[id].members[me.uid] = { at: now }; persist();
    townSys("🎗️ Politics", nameOfSrv(me.uid) + " founded a new party: " + icon + " " + name + " [" + tag + "]. Join it in the Parties app."); return reply(Object.assign(view(), { paid: PARTY_FEE })); }
  if (m.t === "party.join") { if (mine) return reply({ ok: false, error: "You are in a party already. Leave it first." }); const q = db.parties[String(m.id || "")]; if (!q) return reply({ ok: false, error: "That party isn't there any more." }); if (Object.keys(q.members).length >= PARTY_MAX) return reply({ ok: false, error: "That party is full." }); q.members[me.uid] = { at: now }; persist(); tellUid(q.leader, { t: "gov.news", text: "🎗️ " + nameOfSrv(me.uid) + " joined " + q.name + "." }); return reply(view()); }
  if (m.t === "party.leave") { if (!mine) return reply({ ok: false, error: "You are not in a party." }); for (const T of GOV_TOWNS) { const r = db.govs[T].race; if (r && r.cands[me.uid]) return reply({ ok: false, error: "You are a candidate in the " + GOV_NAME[T] + " election. Finish that first." }); } partyDrop(me.uid); return reply(view()); }
  if (!mine) return reply({ ok: false, error: "You are not in a party." }); const isLead = mine.leader === me.uid;
  if (m.t === "party.donate") { const a2 = Math.floor(Number(m.amt) || 0); if (!(a2 >= 1000 && a2 <= 5000000)) return reply({ ok: false, error: "Give between Rs 1,000 and Rs 5,000,000." }); if ((Number(d.money) || 0) < a2) return reply({ ok: false, error: "You don't have that much." }); mine.funds = (mine.funds || 0) + a2; persist(); return reply(Object.assign(view(), { paid: a2 })); }
  if (!isLead) return reply({ ok: false, error: "Only the party leader can do that." });
  if (m.t === "party.edit") { if (typeof m.manifesto === "string") mine.manifesto = m.manifesto.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 160); if (PARTY_ICONS.includes(m.icon)) mine.icon = m.icon; if (PARTY_COLORS.includes(m.color)) mine.color = m.color; persist(); return reply(view()); }
  if (m.t === "party.kick") { const u = String(m.uid || ""); if (u === me.uid || !mine.members[u]) return reply({ ok: false, error: "They aren't in your party." }); for (const T of GOV_TOWNS) { const r = db.govs[T].race; if (r && r.cands[u] && r.cands[u].party === mine.id) return reply({ ok: false, error: "They are your candidate in " + GOV_NAME[T] + " right now." }); } partyDrop(u); tellUid(u, { t: "gov.news", text: "🎗️ You were removed from " + mine.name + "." }); return reply(view()); }
  if (m.t === "party.leader") { const u = String(m.uid || ""); if (!mine.members[u] || u === me.uid) return reply({ ok: false, error: "Pick another member." }); mine.leader = u; persist(); tellUid(u, { t: "gov.news", text: "🎗️ " + nameOfSrv(me.uid) + " made you the leader of " + mine.name + "." }); return reply(view()); }
  if (m.t === "party.ally") { const o = db.parties[String(m.id || "")]; if (!o || o.id === mine.id) return reply({ ok: false, error: "Pick another party." }); if (mine.ally) return reply({ ok: false, error: "You are in a coalition already. Break it first." }); if (o.ally) return reply({ ok: false, error: "That party is in a coalition already." }); o.allyOffer = { from: mine.id, at: now }; persist(); tellUid(o.leader, { t: "gov.news", text: "🤝 " + mine.name + " [" + mine.tag + "] proposes a coalition with " + o.name + ". Answer in the Parties app." }); return reply(view()); }
  if (m.t === "party.allyAnswer") { const f = db.parties[String(m.from || "")]; if (!mine.allyOffer || !f || mine.allyOffer.from !== f.id) return reply({ ok: false, error: "That offer is gone." }); delete mine.allyOffer; if (!m.accept) { persist(); return reply(view()); } if (mine.ally || f.ally) return reply({ ok: false, error: "One of you is in a coalition already." }); mine.ally = f.id; f.ally = mine.id; persist(); townSys("🤝 Politics", mine.icon + " " + mine.name + " and " + f.icon + " " + f.name + " formed a coalition. They will back one candidate between them."); return reply(view()); }
  if (m.t === "party.allyBreak") { const f = mine.ally && db.parties[mine.ally]; if (!f) return reply({ ok: false, error: "You are not in a coalition." }); if (f) delete f.ally; delete mine.ally; persist(); townSys("🤝 Politics", mine.name + " left its coalition with " + (f ? f.name : "its partner") + "."); return reply(view()); }
  if (m.t === "party.nominate") { // the party backs a member for President: the registration fee comes out of the party funds
    const T = govT(m.town), g = db.govs[T], tn = GOV_NAME[T], u = String(m.uid || ""), dd = db.players[u]; if (!mine.members[u] || !dd) return reply({ ok: false, error: "Pick a member of your party." });
    if (T !== "fef" && !tamOpen()) return reply({ ok: false, error: "The " + tn + " election opens after the Flic en Flac election." }); if (g.pres) return reply({ ok: false, error: tn + " has a President already. Elections open when the term ends." });
    const other = presOfUid(u) || candOfUid(u); if (other) return reply({ ok: false, error: (u === me.uid ? "You are" : "They are") + " already " + (presOfUid(u) ? "President" : "a candidate") + " in " + GOV_NAME[other] + "." });
    if (g.race && Object.values(g.race.cands).some((c) => c.party === mine.id)) return reply({ ok: false, error: "Your party already has a candidate in " + tn + "." }); if (mine.ally && g.race && Object.values(g.race.cands).some((c) => c.party === mine.ally)) return reply({ ok: false, error: "Your coalition partner already has a candidate in " + tn + "." }); if ((mine.funds || 0) < GOV_FEE) return reply({ ok: false, error: "The party needs Rs " + GOV_FEE.toLocaleString("en") + " in its funds to register a candidate (it has Rs " + Math.round(mine.funds || 0).toLocaleString("en") + ")." });
    mine.funds -= GOV_FEE; g.treasury += GOV_FEE; if (!g.race) g.race = { ends: now + GOV_CAMPAIGN, cands: dict(), voted: dict() }; g.race.cands[u] = { uid: u, name: String(dd.name || "Someone").slice(0, 16), at: now, pitch: ("Backed by " + mine.name).slice(0, 60), party: mine.id, backed: 1, promises: [], buzz: 0, fund: 0, donors: dict(), cd: dict() }; persist();
    townSys("🏛️ " + tn + " Government", mine.icon + " " + mine.name + " [" + mine.tag + "] nominated " + String(dd.name || "Someone").slice(0, 16) + " for President of " + tn + "! Open the Government app to vote. The vote closes " + new Date(g.race.ends).toUTCString().slice(5, 22) + " UTC."); govTell(); tellUid(u, { t: "gov.news", text: "🗳️ " + mine.name + " nominated you for President of " + tn + ". Set your promises in the Government app." }); return reply(view()); }
  reply({ ok: false, error: "Unknown request." });
}
// ---------- seasons: Season 1 ends at a set time, everyone's cash restarts, and the old ranking is kept as a Hall of Fame ----------
const SEASON2_AT = Date.parse(process.env.SEASON2_AT || "2026-10-30T22:00:00+04:00"); // 10:00 PM in Mauritius on 30 October 2026
db.season = db.season && typeof db.season === "object" ? db.season : {}; { const S = db.season; S.n = S.n >= 2 ? 2 : 1; S.at = Number.isFinite(S.at) ? S.at : SEASON2_AT; S.start = Number.isFinite(S.start) ? S.start : 250000; S.hall = Array.isArray(S.hall) ? S.hall : []; S.firedAt = S.firedAt || 0; S.count = S.count || 0; if (S.n < 2 && S.atv !== 2) { S.at = SEASON2_AT; S.atv = 2; S.ann = {}; } /* the start moved to Friday 30 October, 10 PM: use it and announce again */ S.wipe = S.wipe === true; S.honours = S.honours && typeof S.honours === "object" ? S.honours : {}; }
db.levy = db.levy && typeof db.levy === "object" ? db.levy : {}; { const L = db.levy; L.on = L.on !== false; L.mult = Number.isFinite(L.mult) && L.mult >= 0 && L.mult <= 5 ? L.mult : 1; L.last = L.last || 0; L.total = L.total || 0; L.hits = L.hits || 0; } // the wealth levy: big fortunes pay a little every day once Season 2 is live
const seasonLive = () => db.season.n >= 2; // new features (heists, new buildings, move skins) unlock with Season 2
function seasonHall() { // the final ranking: honest players only, the top 10 get named
  const rows = []; for (const uid of Object.keys(db.players)) { if (db.removed[uid]) continue; const d = db.players[uid], flagged = (((db.cg || {})[uid] || {}).flags || []).length > 0; rows.push({ uid, name: String(d.name || "Player").slice(0, 16), worth: Math.max(0, Math.round(Number(d.money) || 0)), flagged }); }
  rows.sort((a, b) => b.worth - a.worth); const clean = rows.filter((r) => !r.flagged); clean.forEach((r, i) => { r.rank = i + 1; }); return { rows, clean };
}
function seasonPreview() { const h = seasonHall(); return { players: h.rows.length, flagged: h.rows.length - h.clean.length, top: h.clean.slice(0, 10).map((r) => ({ rank: r.rank, name: r.name, worth: r.worth })), totalWorth: h.rows.reduce((a, r) => a + r.worth, 0) }; }
function seasonFire(by) { // start Season 2: back everything up, rewrite every save, keep the Hall of Fame
  const S = db.season; if (S.n >= 2) return { ok: false, error: "Season 2 has already started." };
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); fs.writeFileSync(path.join(BACKUP_DIR, "before-season2-" + Date.now() + ".json"), JSON.stringify(db)); } catch (e) { return { ok: false, error: "Could not write a backup, so nothing was reset: " + e.message }; }
  const h = seasonHall(), now = Date.now(); S.hall = h.clean.slice(0, 10).map((r) => ({ rank: r.rank, name: r.name, worth: r.worth }));
  let n = 0; for (const uid of Object.keys(db.players)) {
    const cur = db.players[uid]; let v; try { v = JSON.parse(cur.save || "{}") || {}; } catch (e) { continue; } if (!v.made) continue;
    const row = h.rows.find((r) => r.uid === uid), cl = h.clean.find((r) => r.uid === uid), rank = cl ? cl.rank : 0;
    const honour = !cl ? "" : rank === 1 ? "Champion" : rank === 2 ? "Runner-up" : rank === 3 ? "Third place" : rank <= 10 ? "Top 10" : rank <= 25 ? "Top 25" : "Veteran";
    const s1 = { rank, worth: row ? row.worth : 0, honour, of: h.clean.length };
    if (!S.wipe) { S.honours[uid] = s1; n++; continue; } // no cash reset: just remember the badge (their game picks it up)
    v.s1 = s1; v.seasonN = 2;
    v.money = S.start; v.fz = null; v.inv = Object.assign({}, v.inv || {}, { save: 0, fund: 0, crypto: 0 }); // cash, savings, fund, crypto and frozen money restart; homes, cars, jets and businesses stay
    const bizPart = Math.round(Object.values(v.biz || {}).reduce((a, b) => a + (Number(b && b.spent) || 0) * 0.5, 0));
    db.players[uid] = Object.assign({}, cur, { save: JSON.stringify(v), savedAt: now, restoreAt: now, money: S.start + bizPart }); n++;
  }
  if (S.wipe && db.raid && db.raid.debit) for (const uid of Object.keys(db.raid.debit)) delete db.raid.debit[uid]; // old fines are part of Season 1
  S.n = 2; S.firedAt = now; S.count = n; S.by = by || "timer";
  const top = S.hall[0]; townSys("📣 Flic en Flac Team", "🏁 Season 2 has begun! The Season 1 Hall of Fame is saved" + (top ? " (champion: " + top.name + ")" : "") + ". Heists are now open. " + (S.wipe ? "Everyone restarts with Rs " + S.start.toLocaleString("en") + "." : "Big fortunes now pay a small daily wealth levy to the town treasuries until the economy settles."));
  const item = { id: crypto.randomBytes(6).toString("hex"), kind: "court", icon: "🏁", text: S.wipe ? "Season 2 has begun! The Season 1 Hall of Fame is saved and everyone restarts with the same cash." : "Season 2 has begun! The Season 1 Hall of Fame is saved, Heists are open, and big fortunes now pay a small daily levy to the town treasuries.", who: "The team", uid: "", vuid: "", at: now }; db.news.push(item); if (db.news.length > 60) db.news.splice(0, db.news.length - 60); for (const [, p] of peers) send(p.ws, { t: "news", item });
  persist(); fanout("players"); return { ok: true, players: n };
}
const LEVY_MS = Math.max(3000, +process.env.LEVY_MS || 3600000); // how often the levy is charged (hourly)
const LEVY_TIERS = [[1000000, 10000000, 0.005], [10000000, 50000000, 0.015], [50000000, Infinity, 0.03]]; // daily rate on the part of cash + savings inside each band
function levyDaily(w) { let tax = 0; for (const [lo, hi, r] of LEVY_TIERS) if (w > lo) tax += (Math.min(w, hi) - lo) * r; return tax * db.levy.mult; }
function levyTick() { // once an hour: charge big fortunes 1/24 of the daily levy; it is taken the next time they play and goes to the town treasuries
  const L = db.levy, now = Date.now(); if (!L.on || db.season.n < 2 || now - L.last < LEVY_MS) return; L.last = now; let hits = 0, sum = 0;
  for (const uid of Object.keys(db.players)) { if (db.removed[uid]) continue; let v; try { v = JSON.parse(db.players[uid].save || "{}") || {}; } catch (e) { continue; } if (!v.made) continue;
    const w = Math.max(0, Number(v.money) || 0) + Math.max(0, Number(v.inv && v.inv.save) || 0); const amt = Math.round(levyDaily(w) / 24); if (!(amt > 0)) continue;
    const q = (db.raid.debit[uid] = db.raid.debit[uid] || []), pend = q.filter((d) => d.kind === "levy").reduce((a, d) => a + d.amt, 0); if (pend + amt > w) continue; // never more than they have
    const lv = q.filter((d) => d.kind === "levy"); if (lv.length >= 24) lv[lv.length - 1].amt += amt; else q.push({ id: crypto.randomBytes(5).toString("hex"), amt, by: "", kind: "levy", note: "Wealth levy", at: now });
    for (const T of GOV_TOWNS) treasuryAdd(T, amt / GOV_TOWNS.length); hits++; sum += amt; }
  L.total += sum; L.hits = hits; if (hits) persist();
}
setInterval(() => { try { levyTick(); } catch (e) { console.warn("levyTick", e.message); } }, Math.min(60000, LEVY_MS));
// ---------- natural disasters: a warning, a hit everyone can feel, and a repair bill that grows with your wealth ----------
const DIS_WARN_MS = Math.max(5000, +process.env.DIS_WARN_MS || 120000), DIS_HIT_MS = Math.max(5000, +process.env.DIS_HIT_MS || 50000); // two minutes of warning, then about 50 seconds of disaster
const DIS_KINDS = { cyclone: { icon: "🌀", name: "Cyclone", sev: 1, names: ["Berguitta", "Batsirai", "Belal", "Freddy", "Gamede", "Hollanda", "Gaelle"], say: "tore through the island" }, flood: { icon: "🌊", name: "Flash flood", sev: 0.7, names: ["Kenzo", "Maya", "Dina"], say: "flooded the island" }, quake: { icon: "🌋", name: "Earthquake", sev: 1.2, names: ["Tremor"], say: "shook the island" } };
db.disaster = db.disaster && typeof db.disaster === "object" ? db.disaster : {}; { const D = db.disaster; D.auto = D.auto !== false; D.cur = D.cur && typeof D.cur === "object" ? D.cur : null; D.next = D.next || 0; D.log = Array.isArray(D.log) ? D.log.slice(-20) : []; D.total = D.total || 0; }
const DIS_PREP = { bags: { name: "Sandbags", icon: "🧱", cost: 0.3, cut: 0.45 }, shield: { name: "Storm shutters", icon: "🛡️", cost: 0.55, cut: 0.8 } }; // storm cover: what it costs (a share of the estimated damage) and how much of the damage it stops
function disasterBill(w, sev) { let b = 0; for (const [lo, hi, r] of [[500000, 5000000, 0.01], [5000000, 50000000, 0.03], [50000000, Infinity, 0.06]]) if (w > lo) b += (Math.min(w, hi) - lo) * r; return Math.round(b * sev); } // repairs cost nothing under Rs 500k and a lot for big fortunes
function disasterSay(text, icon) { townSys("📣 Flic en Flac Team", text); const item = { id: crypto.randomBytes(6).toString("hex"), kind: "court", icon, text, who: "The team", uid: "", vuid: "", at: Date.now() }; db.news.push(item); if (db.news.length > 60) db.news.splice(0, db.news.length - 60); for (const [, p] of peers) send(p.ws, { t: "news", item }); }
function disasterCast(ev) { const c = db.disaster.cur; for (const [, p] of peers) send(p.ws, { t: "disaster", ev, kind: c ? c.kind : "", name: c ? c.name : "" }); }
function disasterStart(kind, by) {
  const D = db.disaster, K = DIS_KINDS[kind]; if (D.cur) return { ok: false, error: "A disaster is already happening." }; if (!K) return { ok: false, error: "Unknown disaster." }; const now = Date.now();
  D.cur = { kind, name: K.names[Math.floor(Math.random() * K.names.length)], phase: "warn", warnAt: now, hitAt: now + DIS_WARN_MS, endAt: now + DIS_WARN_MS + DIS_HIT_MS, by: by || "auto", hits: 0, total: 0, prep: {} };
  disasterSay(K.icon + " " + K.name.toUpperCase() + " WARNING! " + K.name + " " + D.cur.name + " reaches the island in " + Math.round(DIS_WARN_MS / 60000 * 10) / 10 + " min. Secure your property: storm cover is on sale in the warning bar. Stay safe!", K.icon); disasterCast("warn"); persist(); return { ok: true };
}
function disasterHit() {
  const D = db.disaster, c = D.cur, K = DIS_KINDS[c.kind], now = Date.now(); c.phase = "hit"; let hits = 0, sum = 0, top = 0;
  for (const uid of Object.keys(db.players)) { if (db.removed[uid]) continue; let bill = disasterBill(Number(db.players[uid].money) || 0, K.sev); const pr = c.prep && c.prep[uid]; if (pr && DIS_PREP[pr.tier]) bill = Math.round(bill * (1 - DIS_PREP[pr.tier].cut)); if (!(bill > 0)) continue; (db.raid.debit[uid] = db.raid.debit[uid] || []).push({ id: crypto.randomBytes(5).toString("hex"), amt: bill, by: "", kind: "disaster", note: K.name + " " + c.name, at: now }); hits++; sum += bill; if (bill > top) top = bill; }
  for (const T of GOV_TOWNS) treasuryAdd(T, sum * 0.3 / GOV_TOWNS.length); // 30% becomes disaster relief for the town treasuries, the rest is spent on repairs
  c.hits = hits; c.total = sum; D.total += sum; disasterSay(K.icon + " " + K.name + " " + c.name + " " + K.say + "! " + (hits ? hits + (hits === 1 ? " property was" : " properties were") + " damaged and the repair crews are out. Thank you to everyone who got storm cover or gave to the relief fund." : "No property was badly damaged. Thank you for preparing!") + " Relief money went to the town treasuries.", K.icon); disasterCast("hit"); persist();
}
function disWs(ws, me, m) { // storm cover and the relief fund
  const reply = (o) => send(ws, Object.assign({ t: "dis", rid: m.rid }, o)); if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." });
  const D = db.disaster, c = D.cur, w = Number(db.players[me.uid].money) || 0, K = c ? DIS_KINDS[c.kind] : null, est = c && K ? disasterBill(w, K.sev) : 0; if (c) c.prep = c.prep || {};
  if (m.t === "dis.get") return reply({ ok: true, warn: !!c && c.phase === "warn", kind: c ? c.kind : "", name: c ? c.name : "", hitAt: c ? c.hitAt : 0, now: Date.now(), estimate: est, mine: c && c.prep[me.uid] ? c.prep[me.uid].tier : "", tiers: Object.keys(DIS_PREP).map((id) => ({ id, name: DIS_PREP[id].name, icon: DIS_PREP[id].icon, cost: Math.round(est * DIS_PREP[id].cost), cut: DIS_PREP[id].cut })), relief: D.relief | 0 });
  if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  if (m.t === "dis.prep") { if (!c || c.phase !== "warn") return reply({ ok: false, error: "Nothing is coming right now." }); if (c.prep[me.uid]) return reply({ ok: false, error: "Your property is already covered." }); const id = String(m.tier || ""), tier = DIS_PREP[id]; if (!tier) return reply({ ok: false, error: "Pick a cover." }); if (est < 1000) return reply({ ok: false, error: "Your property is not at risk. Nothing to protect!" });
    const cost = Math.round(est * tier.cost); if (w < cost) return reply({ ok: false, error: "You need Rs " + cost.toLocaleString("en") + " for that." }); c.prep[me.uid] = { tier: id, cost }; persist(); return reply({ ok: true, tier: id, cost, cut: tier.cut }); }
  if (m.t === "dis.give") { const amt = Math.round(Number(m.amt)); if (!(amt >= 1000)) return reply({ ok: false, error: "The smallest gift is Rs 1,000." }); if (amt > 20000000) return reply({ ok: false, error: "That is too much for one gift. Try Rs 20,000,000 or less." }); if (w < amt) return reply({ ok: false, error: "You need Rs " + amt.toLocaleString("en") + "." });
    D.relief = (D.relief | 0) + amt; D.givers = D.givers && typeof D.givers === "object" ? D.givers : {}; D.givers[me.uid] = (D.givers[me.uid] | 0) + amt; treasuryAdd(raidTown(me.uid), amt); db.patron.pts[me.uid] = (db.patron.pts[me.uid] | 0) + Math.round(amt / 1000); const nm = nameOfSrv(me.uid);
    if (amt >= 100000) townSys("❤️ Island relief", nm + " gave Rs " + amt.toLocaleString("en") + " to the island relief fund. Thank you!"); persist(); return reply({ ok: true, paid: amt, total: D.givers[me.uid] }); }
  reply({ ok: false, error: "Unknown request." });
}
function disasterEnd() { const D = db.disaster, c = D.cur; D.log.push({ at: Date.now(), kind: c.kind, name: c.name, hits: c.hits, total: c.total, by: c.by }); D.cur = null; D.next = Date.now() + (24 + Math.random() * 24) * 3600000; disasterCast("end"); persist(); }
function disasterTick() {
  const D = db.disaster, now = Date.now(); if (D.cur) { if (D.cur.phase === "warn" && now >= D.cur.hitAt) disasterHit(); else if (D.cur.phase === "hit" && now >= D.cur.endAt) disasterEnd(); return; }
  if (!D.auto || db.season.n < 2) return; if (!D.next) { D.next = now + (24 + Math.random() * 24) * 3600000; persist(); return; }
  if (now >= D.next) { const r = Math.random(); disasterStart(r < 0.5 ? "cyclone" : r < 0.8 ? "flood" : "quake", "auto"); }
}
setInterval(() => { try { disasterTick(); } catch (e) { console.warn("disasterTick", e.message); } }, 2000);
function seasonAnnounce() { // tell the whole game about Season 2 when this is deployed, a day before, and an hour before (chat, gossip and the phone all show it)
  const S = db.season, left = S.at - Date.now(); if (S.n >= 2 || left <= 0) return; S.ann = S.ann && typeof S.ann === "object" ? S.ann : {};
  const when = new Date(S.at).toLocaleString("en-GB", { timeZone: "Indian/Mauritius", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const post = (k, text) => { if (S.ann[k]) return; S.ann[k] = Date.now(); townSys("📣 Flic en Flac Team", text); const item = { id: crypto.randomBytes(6).toString("hex"), kind: "court", icon: "🏁", text, who: "The team", uid: "", vuid: "", at: Date.now() }; db.news.push(item); if (db.news.length > 60) db.news.splice(0, db.news.length - 60); for (const [, p] of peers) send(p.ws, { t: "news", item }); persist(); };
  post("a", "🏁 Season 2 is coming! " + when + " (Mauritius time). Heists open, the Season 1 Hall of Fame is saved, and big fortunes start paying a small daily levy to the town treasuries. Phone → Rich list → Season has the countdown.");
  if (left < 24 * 3600000) post("b", "⏰ Season 2 starts in less than 24 hours! Phone → Rich list → Season.");
  if (left < 3600000) post("c", "🏁 Season 2 starts in less than 1 hour! Get ready.");
}
setInterval(() => { try { seasonAnnounce(); } catch (e) { console.warn("seasonAnnounce", e.message); } }, 20000);
setInterval(() => { try { if (db.season.n < 2 && Date.now() >= db.season.at) { const r = seasonFire("timer"); if (!r.ok) console.warn("seasonFire", r.error); } } catch (e) { console.warn("seasonTick", e.message); } }, 15000);
// ---------- heists: two players rob the bank vault or a town treasury together, split the loot, and can get caught ----------
db.heist = db.heist || {}; { const H = db.heist; H.vault = H.vault && typeof H.vault === "object" ? H.vault : { bal: 2000000, at: Date.now() }; H.jobs = H.jobs && typeof H.jobs === "object" ? H.jobs : {}; H.cd = H.cd && typeof H.cd === "object" ? H.cd : {}; H.stats = H.stats && typeof H.stats === "object" ? H.stats : {}; H.pend = Array.isArray(H.pend) ? H.pend : []; H.log = Array.isArray(H.log) ? H.log.slice(-40) : []; }
const HEIST_CD = Math.max(15000, +process.env.HEIST_CD_MS || 6 * 3600000), HEIST_OFFER_MS = Math.max(15000, +process.env.HEIST_OFFER_MS || 15 * 60000), HEIST_LEAK_MS = Math.max(5000, +process.env.HEIST_LEAK_MS || 10 * 60000), HEIST_FINE = 50000, VAULT_CAP = 3000000, VAULT_REFILL = 400000; // a crew gets caught on the spot, or the CCTV names them later
const HEIST_TARGETS = { bank: { name: "MCB bank vault", base: 0.45, min: 400000, icon: "🏦" }, fef: { name: "Flic en Flac treasury", base: 0.4, min: 200000, icon: "🏛️" }, tam: { name: "Tamarin treasury", base: 0.4, min: 200000, icon: "🏛️" }, tri: { name: "Trianon treasury", base: 0.4, min: 200000, icon: "🏛️" } };
const heistTown = (t) => (t === "bank" ? "fef" : t);
function vaultBal() { const v = db.heist.vault, now = Date.now(); v.bal = Math.min(VAULT_CAP, (v.bal || 0) + (now - (v.at || now)) / 3600000 * VAULT_REFILL); v.at = now; return Math.round(v.bal); } // the bank vault slowly fills again
const heistPool = (t) => (t === "bank" ? vaultBal() : Math.round(db.govs[t].treasury || 0));
const heistChance = (t) => { const T = heistTown(t), g = db.govs[T], pl = g.laws && Number.isFinite(g.laws.police) ? g.laws.police : 2; return Math.max(0.12, Math.min(0.65, HEIST_TARGETS[t].base - pl * 0.07 - (g.pres && hasMin(T, "police") ? 0.05 : 0))); }; // heavier police patrols and a Police Minister make it harder
const heistActive = (uid) => Object.values(db.heist.jobs).find((j) => (j.a === uid || j.b === uid) && (j.status === "invited" || j.status === "ready") && Date.now() < j.ends) || null;
const heistStat = (u) => db.heist.stats[u] || (db.heist.stats[u] = { win: 0, caught: 0, loot: 0 });
function heistFine(u, amt, t, note) { amt = Math.round(amt); if (!(amt > 0)) return; (db.raid.debit[u] = db.raid.debit[u] || []).push({ id: crypto.randomBytes(5).toString("hex"), amt, by: "", kind: "heist", note, at: Date.now() }); if (db.raid.debit[u].length > 30) db.raid.debit[u].shift(); if (t === "bank") db.heist.vault.bal += amt; else treasuryAdd(t, amt); } // the fine is taken when they next play, and goes back to what they robbed
function heistView(uid) { const H = db.heist, now = Date.now(), j = heistActive(uid);
  return { ok: true, targets: Object.keys(HEIST_TARGETS).map((id) => ({ id, name: HEIST_TARGETS[id].name, icon: HEIST_TARGETS[id].icon, pool: heistPool(id), chance: Math.round(heistChance(id) * 100), min: HEIST_TARGETS[id].min })), job: j ? { id: j.id, target: j.target, targetName: HEIST_TARGETS[j.target].name, a: j.a, b: j.b, aName: nameOfSrv(j.a), bName: nameOfSrv(j.b), split: j.split, status: j.status, ends: j.ends, me: j.a === uid ? "a" : "b", chance: Math.round(heistChance(j.target) * 100) } : null, cd: Math.max(0, (H.cd[uid] || 0) + HEIST_CD - now), stats: heistStat(uid), fine: HEIST_FINE, log: H.log.slice(-8).reverse() }; }
function heistLog(text) { db.heist.log.push({ at: Date.now(), text }); if (db.heist.log.length > 40) db.heist.log.shift(); }
function heistResolve(h) { const now = Date.now(), tg = HEIST_TARGETS[h.target], T = heistTown(h.target), win = Math.random() < heistChance(h.target), aN = nameOfSrv(h.a), bN = nameOfSrv(h.b), H = db.heist; h.status = "done"; h.doneAt = now; H.cd[h.a] = now; H.cd[h.b] = now;
  if (win) { const pool = heistPool(h.target), loot = Math.max(1000, Math.min(2500000, Math.floor(pool * (0.12 + Math.random() * 0.13)))); if (h.target === "bank") H.vault.bal -= loot; else db.govs[T].treasury = Math.max(0, db.govs[T].treasury - loot); const sa = Math.floor(loot * h.split / 100), sb = loot - sa; mailTo(h.a, sa, "Your share of the " + tg.name + " heist", "A shady friend"); mailTo(h.b, sb, "Your share of the " + tg.name + " heist", "A shady friend");
    heistStat(h.a).win++; heistStat(h.b).win++; heistStat(h.a).loot += sa; heistStat(h.b).loot += sb; h.result = { win: true, loot, sa, sb };
    const say = "A two-person crew robbed the " + tg.name + " and got away with Rs " + loot.toLocaleString("en") + "! Police are searching for them."; townSys("🚨 Heist", say); heistLog(tg.icon + " " + say); const item = { id: crypto.randomBytes(6).toString("hex"), kind: "crime", icon: "🚨", text: say, who: "Someone", uid: "", vuid: "", at: now }; db.news.push(item); if (db.news.length > 60) db.news.splice(0, db.news.length - 60); for (const [, p] of peers) send(p.ws, { t: "news", item });
    tellUid(h.a, { t: "heist", ev: "win", loot, share: sa, target: tg.name }); tellUid(h.b, { t: "heist", ev: "win", loot, share: sb, target: tg.name }); if (h.target !== "bank" && db.govs[T].pres) tellUid(db.govs[T].pres.uid, { t: "gov.news", text: "🚨 Thieves stole Rs " + loot.toLocaleString("en") + " from the " + tg.name + "!" });
    if (Math.random() < 0.35) H.pend.push({ at: now + HEIST_LEAK_MS * (1 + Math.random() * 3), id: h.id }); // sometimes the CCTV shows who it was, later
  } else { for (const u of [h.a, h.b]) { heistFine(u, HEIST_FINE, h.target === "bank" ? "bank" : T, "Caught robbing the " + tg.name); heistStat(u).caught++; tellUid(u, { t: "heist", ev: "caught", jail: 60, fine: HEIST_FINE, target: tg.name }); } h.result = { win: false };
    const say = aN + " and " + bN + " were caught trying to rob the " + tg.name + "! Fined Rs " + HEIST_FINE.toLocaleString("en") + " each and locked up."; townSys("🚓 Heist", say); heistLog(tg.icon + " " + say); }
  persist(); }
function heistTick() { const now = Date.now(), H = db.heist; let ch = false;
  for (const j of Object.values(H.jobs)) { if ((j.status === "invited" || j.status === "ready") && now >= j.ends) { j.status = "expired"; ch = true; } if (j.doneAt && now - j.doneAt > 7 * 86400000) delete H.jobs[j.id]; }
  for (const q of H.pend.slice()) { if (now < q.at) continue; H.pend.splice(H.pend.indexOf(q), 1); const j = H.jobs[q.id]; if (!j || !j.result || !j.result.win) continue; const tg = HEIST_TARGETS[j.target], T = heistTown(j.target), aN = nameOfSrv(j.a), bN = nameOfSrv(j.b); j.revealed = true;
    for (const [u, share] of [[j.a, j.result.sa], [j.b, j.result.sb]]) { heistFine(u, Math.round(share * 0.3), j.target === "bank" ? "bank" : T, "Identified on CCTV after the " + tg.name + " heist"); heistStat(u).caught++; tellUid(u, { t: "heist", ev: "caught", jail: 45, fine: Math.round(share * 0.3), target: tg.name, late: 1 }); }
    const say = "CCTV identified the thieves behind the " + tg.name + " heist: " + aN + " and " + bN + ". They were fined and locked up."; townSys("🕵️ Police", say); heistLog(tg.icon + " " + say); ch = true; }
  if (ch) persist(); }
setInterval(() => { try { heistTick(); } catch (e) { console.warn("heistTick", e.message); } }, 15000);
function heistWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "heist", rid: m.rid }, o)); if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." }); if (!seasonLive()) return reply({ ok: false, error: "Heists arrive in Season 2." }); if (m.t === "heist.get") return reply(heistView(me.uid)); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  const H = db.heist, now = Date.now(), done = () => { persist(); return reply(heistView(me.uid)); };
  if (m.t === "heist.plan") { const tid = String(m.target || ""), tg = HEIST_TARGETS[tid], to = String(m.to || ""); if (!tg) return reply({ ok: false, error: "Pick a target." }); if (!UID_RE.test(to) || to === me.uid || !db.players[to] || db.removed[to]) return reply({ ok: false, error: "Pick a partner." });
    if (heistActive(me.uid)) return reply({ ok: false, error: "You have a heist planned already." }); if (heistActive(to)) return reply({ ok: false, error: nameOfSrv(to) + " is busy with another heist." }); if ((H.cd[me.uid] || 0) + HEIST_CD > now) return reply({ ok: false, error: "Lie low: you can plan another in " + Math.ceil(((H.cd[me.uid] || 0) + HEIST_CD - now) / 60000) + " min." }); if ((H.cd[to] || 0) + HEIST_CD > now) return reply({ ok: false, error: nameOfSrv(to) + " is lying low after a job." });
    if (heistPool(tid) < tg.min) return reply({ ok: false, error: "There isn't enough in the " + tg.name + " to be worth it (needs Rs " + tg.min.toLocaleString("en") + ")." }); const split = Math.max(40, Math.min(70, Math.round(Number(m.split) || 50)));
    const j = { id: crypto.randomBytes(4).toString("hex"), a: me.uid, b: to, target: tid, split, status: "invited", at: now, ends: now + HEIST_OFFER_MS }; H.jobs[j.id] = j; tellUid(to, { t: "heist", ev: "offer", from: me.uid, name: nameOfSrv(me.uid), target: tg.name, split: 100 - split }); return done(); }
  if (m.t === "heist.answer") { const j = heistActive(me.uid); if (!j || j.b !== me.uid || j.status !== "invited") return reply({ ok: false, error: "No offer for you." }); if (m.accept) { j.status = "ready"; j.ends = now + HEIST_OFFER_MS; tellUid(j.a, { t: "heist", ev: "ready", name: nameOfSrv(me.uid) }); } else { j.status = "declined"; tellUid(j.a, { t: "heist", ev: "declined", name: nameOfSrv(me.uid) }); } return done(); }
  if (m.t === "heist.launch") { const j = heistActive(me.uid); if (!j || j.a !== me.uid || j.status !== "ready") return reply({ ok: false, error: "Your partner has to say yes first." }); if (heistPool(j.target) < HEIST_TARGETS[j.target].min) { j.status = "expired"; return reply({ ok: false, error: "There isn't enough left to steal." }); } heistResolve(j); return done(); }
  if (m.t === "heist.cancel") { const j = heistActive(me.uid); if (!j) return reply({ ok: false, error: "Nothing to cancel." }); j.status = "declined"; const o = j.a === me.uid ? j.b : j.a; tellUid(o, { t: "heist", ev: "declined", name: nameOfSrv(me.uid) }); return done(); }
  reply({ ok: false, error: "Unknown request." }); }
// ---------- parliament, bills, the cabinet, debates and votes of no confidence ----------
const PARL_SEATS = 15, BILL_MS = Math.max(20000, +process.env.BILL_MS || 2 * 3600000), SIGN_MS = Math.max(20000, +process.env.SIGN_MS || 3600000), NC_MS = Math.max(20000, +process.env.NC_MS || 3600000), NC_COOL = Math.max(20000, +process.env.NC_COOL_MS || 12 * 3600000), DEBATE_MS = Math.max(15000, +process.env.DEBATE_MS || 10 * 60000), DEBATE_COST = 100000, DEBATE_CD = Math.max(15000, +process.env.DEBATE_CD_MS || 6 * 3600000), CAB_PAY_MS = Math.max(20000, +process.env.CAB_PAY_MS || 6 * 3600000);
const MINISTRIES = { finance: ["💼", "Finance", "The treasury collects 10% more tax"], health: ["🏥", "Health", "Free healthcare costs 25% less"], police: ["👮", "Police", "Embezzlers are caught more often"], tourism: ["🏖️", "Tourism", "The tourism campaign costs 25% less"] };
const DEBATE_TOPICS = ["Taxes", "Healthcare", "Petrol prices", "Rent", "Police and crime", "Tourism", "Roads", "Student grants"];
const hasMin = (T, role) => !!(db.govs[T].cab && db.govs[T].cab.min && db.govs[T].cab.min[role]);
function seatsFrom(list, tl) { // seats by the share of the vote that each party (or each independent) won
  const blocs = {}; let total = 0; for (const c of list) { const v = tl[c.uid] | 0, key = c.party && db.parties[c.party] ? c.party : "u:" + c.uid; const b = blocs[key] || (blocs[key] = { key, party: key[0] === "u" ? "" : key, uid: key[0] === "u" ? c.uid : "", name: key[0] === "u" ? c.name : db.parties[key].name, votes: 0 }); b.votes += v; total += v; }
  if (!total) return { at: Date.now(), seats: [] }; const rows = Object.values(blocs).map((b) => { const q = PARL_SEATS * b.votes / total; return Object.assign(b, { n: Math.floor(q), rem: q - Math.floor(q) }); }); let left = PARL_SEATS - rows.reduce((n, b) => n + b.n, 0); rows.slice().sort((a, b) => b.rem - a.rem || b.votes - a.votes).forEach((b) => { if (left > 0) { b.n++; left--; } });
  return { at: Date.now(), seats: rows.filter((b) => b.n > 0).sort((a, b) => b.n - a.n).map((b) => ({ key: b.key, party: b.party, uid: b.uid, name: b.name, n: b.n, votes: b.votes })) };
}
function mpsOf(T) { // who sits in Parliament now: each party's members fill its seats, oldest members first; an independent holds their own seat
  const g = db.govs[T], out = {}; for (const st of (g.parl && g.parl.seats) || []) { if (st.party) { const q = db.parties[st.party]; if (!q) continue; Object.keys(q.members).sort((a, b) => q.members[a].at - q.members[b].at).slice(0, st.n).forEach((u) => { if (db.players[u] && !db.removed[u]) out[u] = st.key; }); } else if (db.players[st.uid] && !db.removed[st.uid]) out[st.uid] = st.key; } return out;
}
const lawSay = (k, v) => ({ tax: "Income tax on wages and business is now " + v + "%.", fuel: "Petrol prices are now " + Math.round(v * 100) + "% of normal.", rent: "Rents are now " + Math.round(v * 100) + "% of normal.", fines: "Fines and bail are now " + Math.round(v * 100) + "% of normal.", police: "Police patrols are now " + ["off", "light", "normal", "heavy"][v] + ".", health: v ? "Free healthcare starts today." : "Free healthcare has ended.", roads: v ? "Road repair is funded: everyone drives faster." : "Road repair funding has ended.", grants: v ? "Student grants are open." : "Student grants have ended.", tourism: v ? "A tourism campaign boosts wages." : "The tourism campaign has ended.", surf: v ? "Surf lessons are free for everyone." : "Free surf lessons have ended." }[k]);
function lawCheck(T, k, v) { const g = db.govs[T]; if (!(k in GOV_DEF)) return { err: "No such law." }; v = Number(v); if (!Number.isFinite(v)) return { err: "Bad value." }; if (GOV_PROG[k] && !GOV_PROG_TOWN[T].includes(k)) return { err: GOV_NAME[T] + " has no such programme." };
  if (k === "tax") v = Math.round(Math.max(0, Math.min(15, v))); else if (k === "police") v = Math.round(Math.max(0, Math.min(3, v))); else if (k === "fuel" || k === "rent") v = Math.round(Math.max(0.7, Math.min(1.5, v)) * 20) / 20; else if (k === "fines") v = Math.round(Math.max(0.5, Math.min(2, v)) * 20) / 20; else v = v ? 1 : 0;
  if (g.laws[k] === v) return { err: "That is the law already." }; return { v }; }
function billEnact(T, b, how) { const g = db.govs[T], c = lawCheck(T, b.key, b.val); if (c.err) { b.status = "failed"; b.why = c.err; return; } if (GOV_PROG[b.key] && c.v && g.treasury < GOV_PROG[b.key]) { b.status = "failed"; b.why = "The treasury cannot pay for it."; return; } g.laws[b.key] = c.v; g.lawAt[b.key] = Date.now(); b.status = "law"; townSys("🏛️ " + GOV_NAME[T] + " Parliament", "New law: " + lawSay(b.key, c.v) + " (" + how + ")"); }
function billClose(T, b) { const g = db.govs[T], yes = Object.keys(b.yes).length, no = Object.keys(b.no).length; if (yes > no && yes >= 1) { if (g.pres && b.by === g.pres.uid) billEnact(T, b, "proposed by the President and passed"); else { b.status = "passed"; b.signBy = Date.now() + SIGN_MS; townSys("🏛️ " + GOV_NAME[T] + " Parliament", "A bill passed Parliament (" + yes + " for, " + no + " against): " + lawSay(b.key, lawCheck(T, b.key, b.val).v === undefined ? b.val : lawCheck(T, b.key, b.val).v) + " The President has " + Math.round(SIGN_MS / 60000) + " min to sign or veto."); } } else { b.status = "failed"; b.why = "Not enough votes"; townSys("🏛️ " + GOV_NAME[T] + " Parliament", "A bill failed in Parliament (" + yes + " for, " + no + " against)."); } }
function parlTick() { const now = Date.now(); let ch = 0;
  for (const T of GOV_TOWNS) { const g = db.govs[T];
    for (const b of g.bills || []) { if (b.status === "voting" && now >= b.ends) { billClose(T, b); ch++; } else if (b.status === "passed" && now >= b.signBy) { billEnact(T, b, "became law without the President's signature"); ch++; } }
    if (g.nc && g.nc.status === "vote" && now >= g.nc.ends) { const y = Object.keys(g.nc.yes).length, n = Object.keys(g.nc.no).length, tot = Object.keys(mpsOf(T)).length; if (y > n && y * 2 > tot) { g.nc = null; govEnd(T, "no confidence"); } else { townSys("🏛️ " + GOV_NAME[T] + " Parliament", "The vote of no confidence failed (" + y + " for, " + n + " against). The President stays."); g.ncAt = now; g.nc = null; persist(); govTell(); } ch++; }
    if (g.race && g.race.debate && now >= g.race.debate.ends) { const d = g.race.debate, ca = g.race.cands[d.a], cb = g.race.cands[d.b]; let va = 0, vb = 0; for (const u in d.votes) if (d.votes[u] === d.a) va++; else vb++; if (ca && cb) { const aw = va > vb || (va === vb && (ca.buzz | 0) >= (cb.buzz | 0)), w = aw ? ca : cb, l = aw ? cb : ca; w.buzz = Math.min(100, (w.buzz | 0) + 5); l.buzz = Math.min(100, (l.buzz | 0) + 1); const pt = partyTag(w.party);
        townSys("📺 " + GOV_NAME[T] + " debate", w.name + (pt ? " [" + pt.tag + "]" : "") + " won the TV debate on " + d.topic + " against " + l.name + " (" + Math.max(va, vb) + " to " + Math.min(va, vb) + " in the viewers' vote)."); const item = { id: crypto.randomBytes(6).toString("hex"), kind: "campaign", icon: "📺", text: w.name + " beat " + l.name + " in the " + GOV_NAME[T] + " TV debate on " + d.topic + ".", who: w.name, uid: w.uid, vuid: "", at: now }; db.news.push(item); if (db.news.length > 60) db.news.splice(0, db.news.length - 60); for (const [, p] of peers) send(p.ws, { t: "news", item }); } g.race.debate = null; ch++; }
    if (g.pres && g.cab && g.cab.min) { if (!g.cab.payAt) g.cab.payAt = now; if (now - g.cab.payAt >= CAB_PAY_MS) { g.cab.payAt = now; for (const role in g.cab.min) { const m = g.cab.min[role], pay = Math.round((g.cab.salary || 20000) * CAB_PAY_MS / 86400000); if (pay > 0 && g.treasury >= pay) { g.treasury -= pay; mailTo(m.uid, pay, "Minister's salary", "The Treasury"); } } ch++; } }
  }
  if (ch) { persist(); govTell(); } }
function debateView(T, uid) { const g = db.govs[T], d = g.race && g.race.debate; if (!d) return null; let va = 0, vb = 0; for (const u in d.votes) if (d.votes[u] === d.a) va++; else vb++; return { a: d.a, b: d.b, aName: (g.race.cands[d.a] || {}).name || "?", bName: (g.race.cands[d.b] || {}).name || "?", topic: d.topic, ends: d.ends, va, vb, my: d.votes[uid] || "" }; }
function cabView(T) { const g = db.govs[T], c = g.cab; return { min: Object.keys((c && c.min) || {}).map((r) => ({ role: r, uid: c.min[r].uid, name: c.min[r].name, since: c.min[r].since })), salary: (c && c.salary) || 20000, offers: Object.keys((c && c.offers) || {}).map((u) => ({ uid: u, name: nameOfSrv(u), role: c.offers[u].role })), roles: MINISTRIES }; }
function parlView(T, uid) { const g = db.govs[T], mp = mpsOf(T), bySeat = {}; for (const u in mp) (bySeat[mp[u]] = bySeat[mp[u]] || []).push({ uid: u, name: nameOfSrv(u) }); const tot = Object.keys(mp).length;
  const bills = (g.bills || []).slice(-12).reverse().map((b) => ({ id: b.id, by: b.by, byName: b.byName, key: b.key, val: b.val, text: lawSay(b.key, (lawCheck(T, b.key, b.val).v === undefined ? b.val : lawCheck(T, b.key, b.val).v)) || b.key, status: b.status, ends: b.ends, signBy: b.signBy || 0, yes: Object.keys(b.yes).length, no: Object.keys(b.no).length, my: b.yes[uid] ? "yes" : b.no[uid] ? "no" : "", why: b.why || "" }));
  const nc = g.nc ? { status: g.nc.status, by: nameOfSrv(g.nc.by), sigs: Object.keys(g.nc.sigs).length, need: Math.max(1, Math.ceil(tot / 3)), yes: Object.keys(g.nc.yes || {}).length, no: Object.keys(g.nc.no || {}).length, ends: g.nc.ends || 0, mySig: !!g.nc.sigs[uid], my: (g.nc.yes || {})[uid] ? "yes" : (g.nc.no || {})[uid] ? "no" : "" } : null;
  return { ok: true, town: T, name: GOV_NAME[T], total: PARL_SEATS, filled: tot, seats: ((g.parl && g.parl.seats) || []).map((st) => { const q = st.party ? db.parties[st.party] : null; return { key: st.key, n: st.n, name: q ? q.name : st.name, tag: q ? q.tag : "IND", icon: q ? q.icon : "👤", color: q ? q.color : "#888888", votes: st.votes, mps: bySeat[st.key] || [] }; }), isMp: !!mp[uid], isPres: !!(g.pres && g.pres.uid === uid), pres: g.pres ? { uid: g.pres.uid, name: g.pres.name } : null, bills, nc, ncCool: (g.ncAt || 0) + NC_COOL > Date.now() ? (g.ncAt || 0) + NC_COOL : 0, cab: cabView(T), laws: g.laws, lawKeys: Object.keys(GOV_DEF).filter((k) => !GOV_PROG[k] || GOV_PROG_TOWN[T].includes(k)), myMinistry: Object.keys((g.cab && g.cab.min) || {}).find((r) => g.cab.min[r].uid === uid) || "", myOffer: g.cab && g.cab.offers && g.cab.offers[uid] ? g.cab.offers[uid].role : "" }; }
function parlWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "parl", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet." }); if (!db.players[me.uid]) return reply({ ok: false, error: "Play a little first." });
  const T = govT(m.town), g = db.govs[T], tn = GOV_NAME[T], now = Date.now(); if (m.t === "parl.get") return reply(parlView(T, me.uid)); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  const mp = mpsOf(T), isMp = !!mp[me.uid], isPres = !!(g.pres && g.pres.uid === me.uid), tot = Object.keys(mp).length, done = (extra) => { persist(); govTell(); return reply(Object.assign(parlView(T, me.uid), extra || {})); };
  if (m.t === "parl.bill") { if (!g.pres) return reply({ ok: false, error: tn + " has no President." }); if (!isMp && !isPres) return reply({ ok: false, error: "Only members of Parliament and the President can propose a bill." }); g.bills = g.bills || []; const open = g.bills.filter((b) => b.status === "voting" || b.status === "passed"); if (open.length >= 3) return reply({ ok: false, error: "Three bills are open already. Wait for them to finish." }); if (open.some((b) => b.by === me.uid)) return reply({ ok: false, error: "You already have a bill open." });
    const c = lawCheck(T, String(m.key || ""), m.val); if (c.err) return reply({ ok: false, error: c.err }); if (open.some((b) => b.key === m.key)) return reply({ ok: false, error: "A bill on that law is already open." }); const b = { id: crypto.randomBytes(4).toString("hex"), by: me.uid, byName: nameOfSrv(me.uid), key: String(m.key), val: c.v, at: now, ends: now + BILL_MS, yes: dict(), no: dict(), status: "voting", signBy: 0 }; if (isMp) b.yes[me.uid] = 1; g.bills.push(b); if (g.bills.length > 30) g.bills.splice(0, g.bills.length - 30);
    townSys("🏛️ " + tn + " Parliament", b.byName + " proposed a bill: " + lawSay(b.key, c.v) + " Members vote in the Parliament app."); return done(); }
  if (m.t === "parl.vote") { const b = (g.bills || []).find((q) => q.id === String(m.id || "")); if (!b || b.status !== "voting") return reply({ ok: false, error: "That bill is not up for a vote." }); if (!isMp) return reply({ ok: false, error: "Only members of Parliament vote on bills." }); delete b.yes[me.uid]; delete b.no[me.uid]; (m.v === "no" ? b.no : b.yes)[me.uid] = 1; const y = Object.keys(b.yes).length, n = Object.keys(b.no).length; if (y * 2 > tot || n * 2 >= tot) billClose(T, b); return done(); }
  if (m.t === "parl.sign") { const b = (g.bills || []).find((q) => q.id === String(m.id || "")); if (!b || b.status !== "passed") return reply({ ok: false, error: "That bill is not waiting for you." }); if (!isPres) return reply({ ok: false, error: "Only the President signs or vetoes." }); if (m.v === "veto") { b.status = "vetoed"; townSys("🏛️ " + tn + " Parliament", "President " + g.pres.name + " vetoed a bill passed by Parliament."); } else billEnact(T, b, "signed by President " + g.pres.name); return done(); }
  if (m.t === "parl.nc.call") { if (!g.pres) return reply({ ok: false, error: "There is no President." }); if (!isMp) return reply({ ok: false, error: "Only members of Parliament can call this." }); if (g.nc) return reply({ ok: false, error: "A vote of no confidence is already open." }); if ((g.ncAt || 0) + NC_COOL > now) return reply({ ok: false, error: "Parliament voted on this recently. Try again in " + Math.ceil(((g.ncAt || 0) + NC_COOL - now) / 60000) + " min." });
    g.nc = { by: me.uid, at: now, sigs: dict(), yes: dict(), no: dict(), status: "sign", ends: 0 }; g.nc.sigs[me.uid] = 1; townSys("🏛️ " + tn + " Parliament", nameOfSrv(me.uid) + " wants a vote of no confidence in President " + g.pres.name + ". One third of Parliament must sign."); if (Object.keys(g.nc.sigs).length >= Math.max(1, Math.ceil(tot / 3))) { g.nc.status = "vote"; g.nc.ends = now + NC_MS; townSys("🏛️ " + tn + " Parliament", "The vote of no confidence against President " + g.pres.name + " is open for " + Math.round(NC_MS / 60000) + " min."); } return done(); }
  if (m.t === "parl.nc.sign") { if (!g.nc || g.nc.status !== "sign" || !isMp) return reply({ ok: false, error: "Nothing to sign." }); g.nc.sigs[me.uid] = 1; if (Object.keys(g.nc.sigs).length >= Math.max(1, Math.ceil(tot / 3))) { g.nc.status = "vote"; g.nc.ends = now + NC_MS; townSys("🏛️ " + tn + " Parliament", "The vote of no confidence against President " + g.pres.name + " is open for " + Math.round(NC_MS / 60000) + " min."); } return done(); }
  if (m.t === "parl.nc.vote") { if (!g.nc || g.nc.status !== "vote" || !isMp) return reply({ ok: false, error: "No vote is open for you." }); delete g.nc.yes[me.uid]; delete g.nc.no[me.uid]; (m.v === "no" ? g.nc.no : g.nc.yes)[me.uid] = 1; const y = Object.keys(g.nc.yes).length, n = Object.keys(g.nc.no).length; if (y * 2 > tot) { g.nc = null; govEnd(T, "no confidence"); return done(); } if (n * 2 >= tot) { townSys("🏛️ " + tn + " Parliament", "The vote of no confidence failed (" + y + " for, " + n + " against). The President stays."); g.ncAt = now; g.nc = null; } return done(); }
  if (m.t.startsWith("parl.cab.")) { const c = g.cab || (g.cab = { min: dict(), offers: dict(), salary: 20000, payAt: now }); c.min = dict(c.min); c.offers = dict(c.offers);
    if (m.t === "parl.cab.appoint") { if (!isPres) return reply({ ok: false, error: "Only the President appoints ministers." }); const role = String(m.role || ""), u = String(m.uid || ""); if (!MINISTRIES[role]) return reply({ ok: false, error: "No such ministry." }); if (!db.players[u] || db.removed[u] || u === me.uid) return reply({ ok: false, error: "Pick another player." }); if (c.min[role]) return reply({ ok: false, error: "That ministry has a minister. Dismiss them first." }); if (Object.values(c.min).some((x) => x.uid === u)) return reply({ ok: false, error: "They already run a ministry." }); if (Object.keys(c.offers).length >= 4) return reply({ ok: false, error: "Wait for answers to your other offers." });
      c.offers[u] = { role, at: now }; tellUid(u, { t: "gov.news", text: "🏛️ President " + g.pres.name + " offers you the " + MINISTRIES[role][1] + " ministry of " + tn + ". Answer in the Parliament app." }); return done(); }
    if (m.t === "parl.cab.answer") { const o = c.offers[me.uid]; if (!o) return reply({ ok: false, error: "No offer for you." }); delete c.offers[me.uid]; if (!m.accept) return done(); if (c.min[o.role]) return reply({ ok: false, error: "That ministry was filled." }); c.min[o.role] = { uid: me.uid, name: nameOfSrv(me.uid), since: now }; townSys("🏛️ " + tn + " Government", nameOfSrv(me.uid) + " is the new " + MINISTRIES[o.role][1] + " Minister of " + tn + ". " + MINISTRIES[o.role][2] + "."); return done(); }
    if (m.t === "parl.cab.fire") { if (!isPres) return reply({ ok: false, error: "Only the President dismisses ministers." }); const r = String(m.role || ""), x = c.min[r]; if (!x) return reply({ ok: false, error: "Nobody holds that ministry." }); delete c.min[r]; townSys("🏛️ " + tn + " Government", "President " + g.pres.name + " dismissed " + x.name + " as " + MINISTRIES[r][1] + " Minister."); return done(); }
    if (m.t === "parl.cab.resign") { const r = Object.keys(c.min).find((k) => c.min[k].uid === me.uid); if (!r) return reply({ ok: false, error: "You are not a minister." }); delete c.min[r]; townSys("🏛️ " + tn + " Government", nameOfSrv(me.uid) + " resigned as " + MINISTRIES[r][1] + " Minister."); return done(); }
    if (m.t === "parl.cab.salary") { if (!isPres) return reply({ ok: false, error: "Only the President sets salaries." }); c.salary = Math.max(10000, Math.min(100000, Math.round(Number(m.amt) || 20000))); return done(); } }
  reply({ ok: false, error: "Unknown request." }); }
// ---------- the money ledger: every transaction a player's game reports, kept for the admin ----------
db.ledger = dict(db.ledger); for (const k in db.ledger) if (!Array.isArray(db.ledger[k])) delete db.ledger[k];
const LED_PLAYER_CAP = 800, LED_FEED_CAP = 2000;
// ---------- ads in the game (a client's building and billboard): how many players saw it, opened it and clicked through ----------
db.ads = dict(db.ads); const AD_IDS = ["devcon", "belle", "cutz"], AD_EVS = ["view", "open", "click"];
function adTrack(me, m) { const id = String(m.id || ""), ev = String(m.ev || ""); if (!me.uid || !AD_IDS.includes(id) || !AD_EVS.includes(ev)) return; const a = db.ads[id] || (db.ads[id] = { days: {} }), day = new Date().toISOString().slice(0, 10), d = a.days[day] || (a.days[day] = { view: 0, open: 0, click: 0, u: {} }); d[ev]++; const k = d.u[me.uid] || (d.u[me.uid] = {}); k[ev] = (k[ev] | 0) + 1; if (Object.keys(d.u).length > 3000) return; persist(); }
const AD_REWARD = { devcon: { click: 150000, visit: 20000 } }; // in-game money for pressing "Get your pass" and for visiting and using the building, once per player each
function adReward(me, m, reply) { const id = String(m.id || "devcon"), kind = String(m.kind || ""), rw = AD_REWARD[id]; if (!rw || !rw[kind] || !AD_IDS.includes(id)) return reply({ ok: false, error: "No reward." });
  const a = db.ads[id] || (db.ads[id] = { days: {} }), paid = a.rewards || (a.rewards = {}), mine = paid[me.uid] || (paid[me.uid] = {}); if (mine[kind]) return reply({ ok: true, already: true, amt: 0 });
  mine[kind] = Date.now(); rewardCoins(me.uid, rw[kind], "Flic en Flac Team", kind === "click" ? "Thanks for checking out DevCon 2026" : "Thanks for visiting DevCon 2026"); persist(); return reply({ ok: true, amt: rw[kind], kind }); }
function devconAnnounce() { townSys("💻 DevCon 2026", "Sat 7 Nov in Flic en Flac! Click Get your pass: Rs 150,000. Visit the DevCon building and join in: Rs 20,000. [[go:devcon]]"); const a = db.ads.devcon || (db.ads.devcon = { days: {} }); a.announced = Date.now(); persist(); }
function bambousAnnounce() { townSys("🏚️ Bambous Town", "Bambous Town is OPEN! Rough, local and risky: dealers, police, filth and big shady money. You need Rs 500,000 net worth. [[go:bambous]]"); db.bz = { announced: Date.now() }; persist(); }
setTimeout(() => { try { if (!(db.bz && db.bz.announced)) bambousAnnounce(); } catch (e) {} }, 12000);
setTimeout(() => { try { if (!(db.ads.devcon && db.ads.devcon.announced)) devconAnnounce(); } catch (e) {} }, 8000); // the first time the server runs with this ad, announce it in town chat
const AD_PROMO = { devcon: { max: 5, off: 100, prefix: "FLIC100" } }; // the first 5 players to claim get a code worth Rs 100 off the client's ticket
function adClaim(me, m, reply) { const id = String(m.id || ""), pr = AD_PROMO[id]; if (!pr || !AD_IDS.includes(id)) return reply({ ok: false, error: "No offer." }); const a = db.ads[id] || (db.ads[id] = { days: {} }), codes = a.codes || (a.codes = {}), mine = codes[me.uid], used = Object.keys(codes).length;
  if (mine) return reply({ ok: true, code: mine.code, mine: true, left: Math.max(0, pr.max - used), max: pr.max, off: pr.off });
  if (m.peek) return reply({ ok: true, mine: false, left: Math.max(0, pr.max - used), max: pr.max, off: pr.off });
  if (used >= pr.max) return reply({ ok: false, gone: true, error: "All " + pr.max + " codes are taken.", left: 0, max: pr.max, off: pr.off });
  let code; do { code = pr.prefix + "-" + crypto.randomBytes(3).toString("hex").toUpperCase(); } while (Object.values(codes).some((q) => q.code === code)); codes[me.uid] = { code, at: Date.now() }; persist(); return reply({ ok: true, code, mine: true, left: Math.max(0, pr.max - used - 1), max: pr.max, off: pr.off }); }
// ---------- the Flic en Flac Team chat: every player can message the game team, and the admin replies from the admin page ----------
db.team = dict(db.team); const TEAM_KEEP = 80;
const teamOf = (u) => db.team[u] || (db.team[u] = { m: [], un: 0 });
function teamPush(u, from, text, extra) { const c = teamOf(u), m = Object.assign({ from, text: String(text).slice(0, 400), at: Date.now() }, extra || {}); c.m.push(m); if (c.m.length > TEAM_KEEP) c.m.splice(0, c.m.length - TEAM_KEEP); return m; }
function teamWs(me, m, reply) {
  if (m.t === "team.load") return reply({ ok: true, m: teamOf(me.uid).m.slice(-60) });
  if (m.t === "team.send") { if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); const text = String(m.text || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, 300); if (!text) return reply({ ok: false, error: "Write a message first." });
    const c = teamOf(me.uid), first = !c.m.some((q) => q.from === "me"), out = [teamPush(me.uid, "me", text)]; c.un = (c.un | 0) + 1; c.name = playerName(me.uid); if (first) out.push(teamPush(me.uid, "team", "Thanks for your message! 💙 The Flic en Flac Team has it and will reply right here.", { auto: 1 })); persist(); return reply({ ok: true, m: out }); }
}
// ---------- cheat watch: money that appears without any recorded transaction ----------
// The browser owns a player's cash, so someone can type a number into it. Every real change is reported as a ledger line, so cash minus the ledger total should stay level ("drift"). A big, lasting rise is money from nowhere.
db.cg = dict(db.cg); const cgOf = (u) => db.cg[u] || (db.cg[u] = { sum: 0, d0: null, pend: null, flags: [], claw: 0 });
const CG_UNEXPLAINED = /^(Other income|Earned: )/; // lines the game writes for money it could not trace to anything
const CG_K = +process.env.CG_TIME_SCALE || 1, CG_MIN = 300000, CG_AUTO = process.env.CG_AUTO === "1" ? 2000000 : Infinity; // automatic take-back is OFF unless the server is started with CG_AUTO=1: until it is proven it never hits real players, a flag only goes to the admin
function cheatCheck(u, data, now) {
  const g = cgOf(u); if (now - (g.at || 0) < 20000 / CG_K) return; g.at = now; let cash; try { cash = Math.floor(Number(JSON.parse(data.save || "{}").money)); } catch (e) { return; } if (!Number.isFinite(cash)) return;
  if (g.d0 == null) { g.d0 = cash - g.sum; g.dl = 0; return; } let drift = cash - g.sum - g.d0; const rise = drift - (g.dl || 0); if (rise > 0 && rise < 25000 && !g.pend) { g.d0 += rise; drift -= rise; } g.dl = drift; /* small unrecorded gains (a tip, a refund) are absorbed; only a real jump stays */
  if (drift < CG_MIN) { g.pend = null; if (drift < -CG_MIN) g.d0 = cash - g.sum; /* money legitimately left without a line: follow it down */ return; }
  if (!g.pend) { g.pend = { t: now, d: drift }; return; } if (now - g.pend.t < 120000 / CG_K) return; // it must last two minutes, so a late ledger line can catch up
  if (drift < g.pend.d * 0.8) { g.pend = { t: now, d: drift }; return; }
  g.flags.push({ t: now, d: drift, cash, took: 0 }); if (g.flags.length > 20) g.flags.shift(); g.pend = null;
  if (!db.proposals.some((q) => q.uid === u && q.status === "pending")) { const d = db.players[u] || {}; db.proposals.push({ id: crypto.randomBytes(5).toString("hex"), uid: u, name: String(d.name || "Someone").slice(0, 16), amt: drift, cash, reason: "Cash rose by Rs " + drift.toLocaleString("en") + " with no recorded source", at: now, status: "pending" }); if (db.proposals.length > 300) db.proposals.shift(); diag("seize_request", u, "Rs " + drift); } // the watch only asks: nothing is taken until the admin approves it
  g.d0 += drift; // the baseline moves so it is not reported again
  persist();
}
function ledgerAdd(me, rows) { // a player's game reports its latest money lines (label, amount, balance after, place)
  if (!me.uid || !Array.isArray(rows)) return 0; const doc = db.players[me.uid] || {}, name = String(doc.name || (me.presence || {}).name || "Someone").slice(0, 24), now = Date.now(), mine = db.ledger[me.uid] || (db.ledger[me.uid] = []); let n = 0;
  for (const r of rows.slice(0, 100)) { if (!r || typeof r !== "object") continue; const a = Math.round(Number(r.a)), b = Math.round(Number(r.b)); if (!Number.isFinite(a) || a === 0 || Math.abs(a) > 1e11) continue;
    const rid = String(r.i || "").replace(/[^a-z0-9]/gi, "").slice(0, 18); if (rid && mine.slice(-150).some((q) => q.i === rid)) continue; /* a line we already have: the answer got lost and the game sent it again */ const row = { i: rid || undefined, t: Math.min(now, Math.max(now - 86400000, Math.round(Number(r.t) || now))), l: String(r.l || "").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, 60) || "Money", a, b: Number.isFinite(b) ? b : 0, w: String(r.w || "").replace(/[^a-z0-9_ -]/gi, "").slice(0, 16) };
    mine.push(row); db.ledgerFeed.push(Object.assign({ u: me.uid, n: name }, row)); n++; if (!(a > 0 && CG_UNEXPLAINED.test(row.l))) cgOf(me.uid).sum += a; /* the game labels any change it could not explain "Other income": that is not a source */ }
  if (mine.length > LED_PLAYER_CAP) mine.splice(0, mine.length - LED_PLAYER_CAP); if (db.ledgerFeed.length > LED_FEED_CAP) db.ledgerFeed.splice(0, db.ledgerFeed.length - LED_FEED_CAP); if (n) persist(); return n;
}
// ---------- feedback: bug reports, ideas and star ratings from players, for the admin ----------
const FB_KINDS = ["bug", "idea", "problem", "praise"];
function feedbackAdd(me, m) { // one report or rating
  if (!me.uid) return { ok: false, error: "Not signed in yet." }; const now = Date.now(), day = db.feedback.filter((r) => r.u === me.uid && now - r.t < 86400000);
  if (day.length >= 10) return { ok: false, error: "That is plenty for today. Thank you! Try again tomorrow." }; if (day.length && now - day[day.length - 1].t < 20000) return { ok: false, error: "One moment before sending another." };
  const kind = FB_KINDS.includes(m.kind) ? m.kind : "idea", rating = Math.max(0, Math.min(5, Math.round(Number(m.rating) || 0))), text = String(m.text || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "").trim().slice(0, 600);
  if (!text && !rating) return { ok: false, error: "Write something or give a star rating." };
  let ctx = ""; try { const c0 = m.ctx && typeof m.ctx === "object" ? Object.assign({}, m.ctx) : {}; const d0 = db.players[me.uid] || {}; c0.srv = { savedAt: d0.savedAt || 0, money: Math.round(Number(d0.money) || 0), saveBytes: typeof d0.save === "string" ? d0.save.length : 0, ledger: (db.ledger[me.uid] || []).length, lastLedger: ((db.ledger[me.uid] || []).slice(-1)[0] || {}).t || 0, diag: DIAG.filter((q) => q.u === me.uid).slice(-3) }; ctx = JSON.stringify(c0).slice(0, 1800); } catch (e) {}
  const doc = db.players[me.uid] || {}, row = { id: crypto.randomBytes(5).toString("hex"), t: now, u: me.uid, n: String(doc.name || (me.presence || {}).name || "Someone").slice(0, 24), kind, rating, text, ctx, done: 0 };
  db.feedback.push(row); if (db.feedback.length > 2000) db.feedback.splice(0, db.feedback.length - 2000); persist(); return { ok: true };
}
// ---------- competition: the flex feed, overtaken alerts, challenges with stakes, home ratings and crews ----------
db.flex = Array.isArray(db.flex) ? db.flex.slice(-150) : []; db.chal = dict(db.chal); db.crews = dict(db.crews); db.hr = dict(db.hr); db.hotw = db.hotw && typeof db.hotw === "object" ? db.hotw : { week: -1 }; db.design = db.design && typeof db.design === "object" ? db.design : { week: -1 }; db.design.entries = dict(db.design.entries); db.design.past = Array.isArray(db.design.past) ? db.design.past.slice(-8) : [];
const RAID = require("./raidsim.js"), RAID_CFG = { on: true, minNw: 5000000, tax: 15, perDay: 3, shieldH: 6, searchFee: 1000, revengeH: 24, onMult: 40, shieldBuyH: 2, shieldCoolH: 2, shieldPct: 0.5, shieldMin: 50000, hitsPerDay: 3, poorPct: 25, minAny: 20000, cashCap: 30 }; // raids: the rules, all changeable in admin
db.raid = db.raid && typeof db.raid === "object" ? db.raid : {}; db.raid.cfg = Object.assign({}, RAID_CFG, db.raid.cfg); for (const k of ["def", "shield", "att", "rep", "debit", "rev", "lay", "army", "upg", "shb", "hit", "lab"]) db.raid[k] = dict(db.raid[k]); db.raid.stats = Object.assign({ n: 0, stolen: 0, tax: 0, fees: 0 }, db.raid.stats);
const playerName = (u) => cleanName((db.players[u] || {}).name) || "Someone";
const isHidden = (u) => !!(db.players[u] && db.players[u].pf && db.players[u].pf.hide);
const argClean = (v) => String(v || "").replace(/[^\p{L}\p{N} '.,&·#+-]/gu, "").trim().slice(0, 40);
const FLEX = { jet: (a) => "bought a " + a + " private jet ✈️", car: (a) => "bought a " + a + " 🚗", home: (a) => "moved into a " + a + " 🏠", villa: (a) => "bought a " + a + " in the Tamarin Crown Estate 🔒", class: (a) => "became a " + a + " 🏅", rank: (a) => "is now #" + a + " on the rich list 💰", ach: (a) => "unlocked the badge " + a + " 🏆", win: (a) => "won " + a + " 🥇", crew: (a) => "started the crew " + a + " 🤝", hotw: (a) => "has the Home of the Week 🏠", design: (a) => "won " + a + " in the Design Awards 🏆" };
function flexSay(uid, kind, arg) { if (!FLEX[kind] || !uid || isHidden(uid)) return null; const item = { id: crypto.randomBytes(5).toString("hex"), t: Date.now(), u: uid, n: playerName(uid), k: kind, text: playerName(uid) + " " + FLEX[kind](argClean(arg) || "something big") }; db.flex.push(item); if (db.flex.length > 150) db.flex.splice(0, db.flex.length - 150); persist(); for (const [, p] of peers) send(p.ws, { t: "flex", item }); return item; }
const mailTo = (to, amt, note, from) => { if (!db.players[to] || !(amt >= 1)) return; db.mail[crypto.randomBytes(10).toString("hex")] = { to, from: from || "Challenge", amt: Math.round(amt), at: Date.now(), note: String(note || "").slice(0, 60) }; pruneMail(); fanout("mail"); }; // pay a player from the server
// ----- the wealth ladder: the first player to reach each rank is remembered, and the rich can spend on the island (the Patron shop) -----
const WEALTH_TIERS = [["saver", 10000, "Saver", "🪙"], ["comfy", 50000, "Comfortable", "💵"], ["rising", 150000, "Rising Star", "📈"], ["mogul", 500000, "Business Mogul", "🏢"], ["millionaire", 1000000, "Millionaire", "💎"], ["tycoon", 3000000, "Tycoon", "🎩"], ["magnate", 8000000, "Magnate", "🏦"], ["majesty", 20000000, "Majesty", "🏛️"], ["legend", 50000000, "Legend", "🌟"], ["icon", 100000000, "Icon", "🔱"]];
function wealthFirsts(rows) { const F = db.patron.firsts, seeded = !!db.patron.seeded, sorted = rows.slice(); let ch = false;
  for (const [id, thr, nm, ic] of WEALTH_TIERS) { if (F[id]) continue; const hit = sorted.filter(([u, m]) => m >= thr && !isHidden(u)).sort((a, b) => a[1] - b[1])[0]; if (!hit) continue; F[id] = { uid: hit[0], name: nameOfSrv(hit[0]), at: seeded ? Date.now() : 0 }; ch = true; if (seeded) townSys("🏆 Wealth", F[id].name + " is the first player on the island to reach " + ic + " " + nm + " (Rs " + thr.toLocaleString("en") + ")!"); }
  if (!seeded) { db.patron.seeded = 1; ch = true; } if (ch) persist(); }
const NAMEABLE = { stade: "Stade Germain Comarmond", casino: "Grand Casino", skytower: "Sky Tower", mall: "Cascavelle Mall", resort: "Wolmar Sands Resort", uni: "Middlesex University", club69: "Club 69" }; // building ids a patron can put their name on
const SINKS = { gala: { cost: 2000000, cd: 6 * 3600000, name: "Charity gala", icon: "🥂" }, naming: { cost: 25000000, cd: 0, name: "Naming rights", icon: "🪧", tier: "legend" }, statue: { cost: 10000000, cd: 0, name: "Golden statue", icon: "🗽" } };
const patronView = (uid) => ({ ok: true, tiers: WEALTH_TIERS.map(([id, thr, nm, ic]) => ({ id, thr, name: nm, icon: ic, first: db.patron.firsts[id] ? { name: db.patron.firsts[id].name, at: db.patron.firsts[id].at } : null })), items: db.patron.items.slice(-12).reverse().map((q) => (q.kind === "naming" ? Object.assign({}, q, { label: NAMEABLE[q.what] || q.what }) : q)), board: Object.keys(db.patron.pts).map((u) => ({ name: nameOfSrv(u), pts: db.patron.pts[u] | 0 })).sort((a, b) => b.pts - a.pts).slice(0, 8), taken: db.patron.items.filter((q) => q.kind === "naming").map((q) => q.what), nameable: NAMEABLE, named: db.patron.items.filter((q) => q.kind === "naming").map((q) => ({ id: q.what, name: q.name })), statues: db.patron.items.filter((q) => q.kind === "statue").map((q) => ({ name: q.name, at: q.at })), sinks: SINKS, myStatue: db.patron.items.some((q) => q.kind === "statue" && q.uid === uid), galaCd: Math.max(0, ((db.patron.at[uid] || {}).gala || 0) + SINKS.gala.cd - Date.now()) });
function wealthWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "wealth", rid: m.rid }, o)); if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." }); if (m.t === "wealth.get") return reply(patronView(me.uid)); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  if (m.t === "wealth.sink") { const k = SINKS[String(m.kind || "")]; if (!k) return reply({ ok: false, error: "No such purchase." }); const d = db.players[me.uid], kind = String(m.kind), now = Date.now(), nm = nameOfSrv(me.uid); if ((Number(d.money) || 0) < k.cost) return reply({ ok: false, error: "You need Rs " + k.cost.toLocaleString("en") + "." });
    const at = db.patron.at[me.uid] || (db.patron.at[me.uid] = {}); if (k.cd && (at[kind] || 0) + k.cd > now) return reply({ ok: false, error: "Wait " + Math.ceil(((at[kind] || 0) + k.cd - now) / 60000) + " min before another one." });
    let what = "";
    if (kind === "naming") { const tr = WEALTH_TIERS.find((q) => q[0] === k.tier); if (tr && (Number(d.money) || 0) < tr[1]) return reply({ ok: false, error: "Naming rights need the " + tr[3] + " " + tr[2] + " rank first (worth Rs " + tr[1].toLocaleString("en") + ")." }); what = String(m.what || ""); if (!NAMEABLE[what]) return reply({ ok: false, error: "Pick a landmark." }); if (db.patron.items.some((q) => q.kind === "naming" && q.what === what)) return reply({ ok: false, error: "Someone already named " + NAMEABLE[what] + "." }); }
    if (kind === "statue" && db.patron.items.some((q) => q.kind === "statue" && q.uid === me.uid)) return reply({ ok: false, error: "You already have a golden statue." });
    if (kind === "gala") { const online = [...new Set([...peers.values()].filter((p) => p.uid && p.uid !== me.uid && !p.away).map((p) => p.uid))].slice(0, 200), each = online.length ? Math.min(20000, Math.floor(k.cost * 0.5 / online.length)) : 0; for (const u of online) if (each >= 1) mailTo(u, each, "Gift from " + nm + "'s charity gala", nm); what = online.length + " guests"; }
    at[kind] = now; db.patron.pts[me.uid] = (db.patron.pts[me.uid] | 0) + Math.round(k.cost / 1000); const it = { id: crypto.randomBytes(4).toString("hex"), uid: me.uid, name: nm, kind, what, at: now, cost: k.cost }; db.patron.items.push(it); if (db.patron.items.length > 200) db.patron.items.shift(); persist();
    const say = kind === "gala" ? "🥂 " + nm + " threw a charity gala for the whole island and every guest got a gift! Cost: Rs " + k.cost.toLocaleString("en") + "." : kind === "naming" ? "🪧 " + nm + " bought the naming rights: " + NAMEABLE[what] + " is now " + nm + "'s " + NAMEABLE[what] + "! Look for the sign." : "🗽 " + nm + " unveiled a golden statue of themselves on the plaza by the Grand Casino. Rs " + k.cost.toLocaleString("en") + " well spent.";
    townSys("🎩 Island Patron", say); const item = { id: crypto.randomBytes(6).toString("hex"), kind: "campaign", icon: k.icon, text: say, who: nm, uid: me.uid, vuid: "", at: now }; db.news.push(item); if (db.news.length > 60) db.news.splice(0, db.news.length - 60); for (const [, p] of peers) send(p.ws, { t: "news", item });
    return reply(Object.assign(patronView(me.uid), { paid: k.cost })); }
  reply({ ok: false, error: "Unknown request." }); }
// ----- overtaken alerts -----
const rankPrev = new Map(), passedAt = new Map();
function rankTick() { const rows = []; for (const u in db.players) { const d = db.players[u]; if (!d || db.removed[u] || !d.save) continue; rows.push([u, Math.round(Number(d.money) || 0)]); } rows.sort((a, b) => b[1] - a[1]); const now = Date.now();
  rows.forEach(([u], i) => { const r = i + 1, prev = rankPrev.get(u); if (prev && r > prev && prev <= 30 && now - (passedAt.get(u) || 0) > 600000) { const above = rows[i - 1] && rows[i - 1][0]; if (above && (rankPrev.get(above) || 1e9) > prev) { passedAt.set(u, now); tellUid(u, { t: "passed", by: isHidden(above) ? "Someone" : playerName(above), rank: r, was: prev }); } } });
  rows.forEach(([u], i) => rankPrev.set(u, i + 1)); wealthFirsts(rows); }
setInterval(rankTick, 30000); setTimeout(rankTick, 8000);
// ----- challenges -----
const CH_TYPES = ["money", "surf", "golf"], CH_WINDOW = Math.max(60000, +process.env.CHAL_WINDOW_MS || 24 * 3600000), CH_OFFER = 3600000;
const chView = (c) => ({ id: c.id, a: c.a, b: c.b, an: playerName(c.a), bn: playerName(c.b), type: c.type, stake: c.stake, status: c.status, created: c.created, until: c.until || 0, sa: c.sa, sb: c.sb, win: c.win || "" });
const chTell = (c) => { const v = { t: "chal", c: chView(c) }; tellUid(c.a, v); tellUid(c.b, v); };
function chSettle(c) { // decide the winner and pay out
  if (c.status !== "live") return; const hasA = c.sa !== null, hasB = c.sb !== null; let win = ""; const pot = c.stake * 2, prize = Math.round(pot * 0.95);
  if (!hasA && !hasB) { mailTo(c.a, c.stake, "Challenge refund"); mailTo(c.b, c.stake, "Challenge refund"); } else if (hasA && !hasB) win = c.a; else if (!hasA && hasB) win = c.b; else if (c.sa === c.sb) { mailTo(c.a, c.stake, "Challenge tie: stake back"); mailTo(c.b, c.stake, "Challenge tie: stake back"); } else win = c.sa > c.sb ? c.a : c.b;
  if (win) { mailTo(win, prize, "Won the " + c.type + " challenge"); flexSay(win, "win", "a " + c.type + " challenge for Rs " + prize.toLocaleString("en")); } c.status = "done"; c.win = win || "tie"; persist(); chTell(c); }
function chTick() { const now = Date.now(); for (const id in db.chal) { const c = db.chal[id]; if (c.status === "offer" && now - c.created > CH_OFFER) { c.status = "expired"; mailTo(c.a, c.stake, "Challenge not answered: stake back"); persist(); chTell(c); } else if (c.status === "live" && now >= c.until) chSettle(c); else if (["done", "declined", "expired"].includes(c.status) && now - (c.until || c.created) > 3 * 86400000) delete db.chal[id]; } }
setInterval(chTick, 30000);
function competeWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "compete", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet." }); const now = Date.now(), d = db.players[me.uid]; if (!d) return reply({ ok: false, error: "Play a little first." });
  if (m.t === "flex.say") { me.flexAt = me.flexAt || 0; if (now - me.flexAt < 8000) return reply({ ok: true }); me.flexAt = now; flexSay(me.uid, String(m.kind), m.arg); return reply({ ok: true }); }
  if (m.t === "flex.get") return reply({ ok: true, feed: db.flex.slice(-40).reverse() });
  if (m.t === "chal.list") return reply({ ok: true, list: Object.values(db.chal).filter((c) => (c.a === me.uid || c.b === me.uid)).sort((x, y) => y.created - x.created).slice(0, 12).map(chView) });
  if (m.t === "chal.new") { const to = String(m.to || ""), type = String(m.type || ""), stake = Math.round(Number(m.stake) || 0); if (!UID_RE.test(to) || to === me.uid || !db.players[to]) return reply({ ok: false, error: "Pick another player." }); if (!CH_TYPES.includes(type)) return reply({ ok: false, error: "Pick a challenge." }); if (!(stake >= 1000 && stake <= 1000000)) return reply({ ok: false, error: "The stake is Rs 1,000 to Rs 1,000,000." });
    const mine = Object.values(db.chal).filter((c) => (c.a === me.uid || c.b === me.uid) && (c.status === "offer" || c.status === "live")); if (mine.length >= 3) return reply({ ok: false, error: "You already have 3 open challenges." }); if (Object.values(db.chal).some((c) => c.status === "offer" && c.a === me.uid && c.b === to)) return reply({ ok: false, error: "You already challenged them." });
    const c = { id: crypto.randomBytes(5).toString("hex"), a: me.uid, b: to, type, stake, status: "offer", created: now, until: 0, sa: null, sb: null, win: "" }; db.chal[c.id] = c; persist(); chTell(c); return reply({ ok: true, c: chView(c) }); }
  const c = db.chal[String(m.id || "")];
  if (m.t === "chal.accept") { if (!c || c.b !== me.uid || c.status !== "offer") return reply({ ok: false, error: "That challenge is not open." }); c.status = "live"; c.until = now + CH_WINDOW; persist(); chTell(c); return reply({ ok: true, c: chView(c) }); }
  if (m.t === "chal.decline") { if (!c || (c.b !== me.uid && c.a !== me.uid) || c.status !== "offer") return reply({ ok: false, error: "That challenge is not open." }); c.status = "declined"; mailTo(c.a, c.stake, "Challenge declined: stake back"); persist(); chTell(c); return reply({ ok: true }); }
  if (m.t === "chal.report") { if (!c || c.status !== "live" || (c.a !== me.uid && c.b !== me.uid)) return reply({ ok: false, error: "No live challenge." }); const sc = Number(m.score); if (!Number.isFinite(sc)) return reply({ ok: false, error: "Bad score." }); const k = c.a === me.uid ? "sa" : "sb"; if (c[k] === null || sc > c[k]) c[k] = Math.round(sc * 100) / 100; persist(); chTell(c); if (c.sa !== null && c.sb !== null && now >= c.until) chSettle(c); return reply({ ok: true, c: chView(c) }); }
  // ----- home ratings -----
  if (m.t === "home.rate") { const to = String(m.to || ""), stars = Math.round(Number(m.stars)); if (!UID_RE.test(to) || to === me.uid || !db.players[to]) return reply({ ok: false, error: "You can't rate that home." }); if (!(stars >= 1 && stars <= 5)) return reply({ ok: false, error: "Pick 1 to 5 stars." });
    const h = db.hr[to] || (db.hr[to] = { r: dict() }), prev = h.r[me.uid]; if (prev && now - prev.t < 7 * 86400000) return reply({ ok: false, error: "You rated this home recently. Rate it again next week." }); me.rateN = (me.rateN || 0) + 1; if (me.rateN > 30) return reply({ ok: false, error: "That is plenty of ratings for now." });
    h.r[me.uid] = { s: stars, t: now }; const ks = Object.keys(h.r); if (ks.length > 200) delete h.r[ks.sort((a, b) => h.r[a].t - h.r[b].t)[0]]; persist(); return reply({ ok: true, avg: homeAvg(to) }); }
  // ----- Design Awards: list your home, others tour it and give it stars, the best homes of the week win -----
  if (m.t.startsWith("design.")) return designWs(me, m, reply, now);
  if (m.t.startsWith("raid.")) return raidWs(me, m, reply, now);
  if (m.t === "home.top") return reply({ ok: true, top: topHomes(), hotw: db.hotw && db.hotw.uid ? db.hotw : null });
  // ----- crews -----
  const crewOf = (u) => Object.values(db.crews).find((q) => q.members.includes(u));
  if (m.t === "crew.get") { const cr = crewOf(me.uid); return reply({ ok: true, crew: cr ? crewView(cr, true) : null }); }
  if (m.t === "crew.list") return reply({ ok: true, crews: Object.values(db.crews).map((q) => crewView(q, false)).sort((a, b) => b.worth - a.worth).slice(0, 20), mine: (crewOf(me.uid) || {}).id || "" });
  if (m.t === "crew.create") { if (crewOf(me.uid)) return reply({ ok: false, error: "Leave your crew first." }); const tag = String(m.tag || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4), name = argClean(m.name).slice(0, 20), emoji = Array.from(String(m.emoji || "🤝"))[0] || "🤝"; if (tag.length < 3) return reply({ ok: false, error: "The tag needs 3 or 4 letters or numbers." }); if (name.length < 3) return reply({ ok: false, error: "Give the crew a name (3+ letters)." }); if (Object.values(db.crews).some((q) => q.tag === tag)) return reply({ ok: false, error: "That tag is taken." });
    const cr = { id: crypto.randomBytes(4).toString("hex"), tag, name, emoji, leader: me.uid, members: [me.uid], created: now }; db.crews[cr.id] = cr; persist(); flexSay(me.uid, "crew", "[" + tag + "] " + name); return reply({ ok: true, crew: crewView(cr, true) }); }
  if (m.t === "crew.join") { if (crewOf(me.uid)) return reply({ ok: false, error: "Leave your crew first." }); const cr = db.crews[String(m.id || "")]; if (!cr) return reply({ ok: false, error: "No such crew." }); if (cr.members.length >= 12) return reply({ ok: false, error: "That crew is full." }); cr.members.push(me.uid); persist(); return reply({ ok: true, crew: crewView(cr, true) }); }
  if (m.t === "crew.leave") { const cr = crewOf(me.uid); if (!cr) return reply({ ok: true }); cr.members = cr.members.filter((u) => u !== me.uid); if (!cr.members.length) delete db.crews[cr.id]; else if (cr.leader === me.uid) cr.leader = cr.members[0]; persist(); return reply({ ok: true }); }
  if (m.t === "crew.kick") { const cr = crewOf(me.uid), who = String(m.who || ""); if (!cr || cr.leader !== me.uid || who === me.uid || !cr.members.includes(who)) return reply({ ok: false, error: "Only the leader can remove members." }); cr.members = cr.members.filter((u) => u !== who); persist(); return reply({ ok: true, crew: crewView(cr, true) }); }
  reply({ ok: false, error: "Unknown request." });
}
function crewView(cr, full) { const worth = cr.members.reduce((a, u) => a + (isHidden(u) ? 0 : Math.round(Number((db.players[u] || {}).money) || 0)), 0); const o = { id: cr.id, tag: cr.tag, name: cr.name, emoji: cr.emoji, n: cr.members.length, worth, leader: cr.leader, leaderName: playerName(cr.leader) };
  if (full) o.members = cr.members.map((u) => ({ u, n: playerName(u), worth: isHidden(u) ? null : Math.round(Number((db.players[u] || {}).money) || 0), lead: u === cr.leader })); return o; }
const DESIGN_WEEK = 7 * 86400000, DESIGN_PRIZES = [500000, 250000, 100000], DESIGN_MIN = 3; // a contest a week, prizes for the top three, at least 3 votes to place
const designWeek = () => Math.floor(Date.now() / DESIGN_WEEK);
function designScore(e) { const v = Object.values(e.votes || {}); if (!v.length) return { avg: 0, n: 0 }; return { avg: Math.round(v.reduce((a, r) => a + r.s, 0) / v.length * 100) / 100, n: v.length }; }
function designRows(forUid) { return Object.keys(db.design.entries).filter((u) => db.players[u] && !db.removed[u]).map((u) => { const e = db.design.entries[u], sc = designScore(e), c = slimOf(u, db.players[u]), hv = c ? c.hv : null; return { u, name: playerName(u), title: e.title || "", since: e.t, avg: sc.avg, n: sc.n, home: hv ? hv.home : 0, pieces: hv ? hv.decor.length : 0, decor: hv ? hv.decor.slice(0, 80) : [], mine: forUid && e.votes[forUid] ? e.votes[forUid].s : 0 }; }).sort((a, b) => (b.n >= DESIGN_MIN) - (a.n >= DESIGN_MIN) || b.avg - a.avg || b.n - a.n || a.since - b.since); }
function designWs(me, m, reply, now) {
  const E = db.design.entries;
  if (m.t === "design.list") return reply({ ok: true, rows: designRows(me.uid), mine: E[me.uid] ? { title: E[me.uid].title } : null, ends: (designWeek() + 1) * DESIGN_WEEK, prizes: DESIGN_PRIZES, min: DESIGN_MIN, past: db.design.past.slice(-3).reverse() });
  if (m.t === "design.enter") { const title = argClean(m.title).slice(0, 40); if (title.length < 3) return reply({ ok: false, error: "Give your home a name (3+ letters)." }); const c = slimOf(me.uid, db.players[me.uid]); if (!c) return reply({ ok: false, error: "Save your game first, then try again." }); if (c.hv.decor.length < 3) return reply({ ok: false, error: "Put at least 3 pieces of furniture in your home first." });
    const isNew = !E[me.uid]; E[me.uid] = Object.assign(E[me.uid] || { t: now, votes: dict() }, { title }); persist(); if (isNew) townSys("🏆 Design Awards", playerName(me.uid) + " entered their home \"" + title + "\" in the Design Awards. Tour it from the Awards app and give it stars!"); return reply({ ok: true }); }
  if (m.t === "design.leave") { delete E[me.uid]; persist(); return reply({ ok: true }); }
  const to = String(m.to || ""); if (!UID_RE.test(to) || !E[to] || !db.players[to]) return reply({ ok: false, error: "That home is not in the Design Awards." });
  if (m.t === "design.view") { const c = slimOf(to, db.players[to]); return reply({ ok: true, hv: c ? c.hv : null, title: E[to].title }); }
  if (m.t === "design.vote") { const stars = Math.round(Number(m.stars)); if (to === me.uid) return reply({ ok: false, error: "You can't vote for your own home." }); if (!(stars >= 1 && stars <= 5)) return reply({ ok: false, error: "Pick 1 to 5 stars." });
    me.dvN = (me.dvN || 0) + 1; if (me.dvN > 60) return reply({ ok: false, error: "That is plenty of votes for now." }); E[to].votes[me.uid] = { s: stars, t: now }; persist(); return reply({ ok: true, score: designScore(E[to]) }); }
  return reply({ ok: false, error: "Unknown request." });
}
function designTick() { const wk = designWeek(); if (db.design.week === wk) return; if (db.design.week < 0) { db.design.week = wk; persist(); return; } // the first run only starts the clock
  const rows = designRows("").filter((r) => r.n >= DESIGN_MIN).slice(0, 3), winners = rows.map((r, i) => ({ u: r.u, name: r.name, title: r.title, avg: r.avg, n: r.n, prize: DESIGN_PRIZES[i] }));
  for (const [i, w] of winners.entries()) { mailTo(w.u, w.prize, (["1st", "2nd", "3rd"][i]) + " place, Design Awards", "Design Awards"); flexSay(w.u, "design", ["1st place", "2nd place", "3rd place"][i]); }
  if (winners.length) townSys("🏆 Design Awards", "This week's best home: " + winners[0].name + "'s \"" + winners[0].title + "\" with " + winners[0].avg + " stars from " + winners[0].n + " votes!" + (winners[1] ? " 2nd: " + winners[1].name + "." : "") + (winners[2] ? " 3rd: " + winners[2].name + "." : "") + " A new week starts now: list your home in the Awards app.");
  db.design.past.push({ week: db.design.week, winners }); db.design.past = db.design.past.slice(-8); for (const u in db.design.entries) db.design.entries[u].votes = dict(); db.design.week = wk; persist(); } // pay the winners, then every listed home starts the new week with no votes
setInterval(designTick, 600000); setTimeout(designTick, 25000);
// ----- Raids: offline players worth over the limit can be raided; the crew's money and the tax go to the treasury -----
const raidSaveCache = new Map(); // player id -> { sv, cash }: the cash in their last saved game
function raidCash(u) { const d = db.players[u], sv = d && d.save; if (typeof sv !== "string" || !sv) return 0; let c = raidSaveCache.get(u); if (c && c.sv === sv) return c.cash; let v = {}; try { v = JSON.parse(sv) || {}; } catch (e) {} c = { sv, cash: Math.max(0, Math.floor(Number(v.money) || 0)) }; raidSaveCache.set(u, c); return c.cash; }
function worthDown(u, amt) { const d = db.players[u]; if (d && Number.isFinite(Number(d.money))) d.money = Math.max(0, Math.round(Number(d.money) - amt)); } // the rich list reads this number, so a seizure or rollback shows there at once instead of when the player next saves
function assetWorth(v) { try { const sm = assetSum(assetPick(v), v.px); return (sm.invVal || 0) + sm.biz.reduce((a, b) => a + (Number(b.spent) || 0) * 0.5, 0); } catch (e) { return 0; } }
const raidTown = (u) => (zoneOfIdx(homeOf(u)) === "tam" ? "tam" : "fef"); // which treasury a player's money goes to
db.seizures = Array.isArray(db.seizures) ? db.seizures : []; db.assets = db.assets && typeof db.assets === "object" ? db.assets : {}; db.proposals = Array.isArray(db.proposals) ? db.proposals : []; db.payFix = db.payFix && typeof db.payFix === "object" ? db.payFix : {}; db.payFixAt = db.payFixAt || Date.now();
// ---- business and investment history: a snapshot every time someone's assets change, so the admin can put them back ----
const ASSET_GROUPS = { biz: ["biz", "bizPeak"], inv: ["inv"], jet: ["jet"], cars: ["fleet", "car", "carKind", "carCol", "carMods", "carIdx"], home: ["home"], misc: ["chopOwn", "stall", "scooter", "bike", "bed", "tv", "cooler", "king"] };
const ASSET_KEYS = [].concat(...Object.values(ASSET_GROUPS));
function assetPick(v) { const a = {}; for (const k of ASSET_KEYS) if (v[k] !== undefined) a[k] = v[k]; return a; }
function assetSum(a, px) { // a few plain facts about a set of assets, for the admin list and for spotting losses
  const biz = a.biz && typeof a.biz === "object" ? Object.keys(a.biz).map((k) => ({ k, lvl: Number(a.biz[k] && a.biz[k].lvl) || 1, spent: Math.round(Number(a.biz[k] && a.biz[k].spent) || 0) })) : [], inv = a.inv && typeof a.inv === "object" ? a.inv : {}, p = px && typeof px === "object" ? px : {};
  const invVal = Math.round((Number(inv.save) || 0) + (Number(inv.fund) || 0) * (Number(p.fund) || 100) + (Number(inv.crypto) || 0) * (Number(p.crypto) || 100));
  return { biz, invVal, inv: { save: Math.round(Number(inv.save) || 0), fund: Math.round((Number(inv.fund) || 0) * 100) / 100, crypto: Math.round((Number(inv.crypto) || 0) * 100) / 100 }, jet: a.jet && a.jet.m ? String(a.jet.m) : "", cars: Array.isArray(a.fleet) ? a.fleet.length : 0, home: Number(a.home) || 0 };
}
function assetTrack(id, data, atOverride) {
  let v; try { v = JSON.parse(typeof data.save === "string" ? data.save : "{}") || {}; } catch (e) { return; } const a = assetPick(v), sm = assetSum(a, v.px); if (!Object.keys(a).length) return;
  const sig = JSON.stringify([sm.biz, sm.inv, sm.jet, sm.cars, sm.home, a.chopOwn ? 1 : 0, a.stall ? 1 : 0]), list = db.assets[id] = Array.isArray(db.assets[id]) ? db.assets[id] : [], last = list[list.length - 1], now = atOverride || Date.now();
  if (last && (last.sig === sig || (atOverride && atOverride <= last.at))) return; const sl = last ? last.sum : null, alert = [];
  if (sl) { const gone = sl.biz.filter((b) => !sm.biz.some((c) => c.k === b.k)).map((b) => b.k); if (gone.length) alert.push("lost business: " + gone.join(", ")); const down = sl.biz.filter((b) => sm.biz.some((c) => c.k === b.k && c.lvl < b.lvl)).map((b) => b.k); if (down.length) alert.push("business level dropped: " + down.join(", ")); if (sl.invVal > 50000 && sm.invVal < sl.invVal * 0.5) alert.push("investments fell from " + sl.invVal + " to " + sm.invVal); if (sl.jet && !sm.jet) alert.push("lost the jet"); if (sl.cars > sm.cars) alert.push("cars " + sl.cars + " to " + sm.cars); }
  if (last && !alert.length && now - last.at < 600000 && JSON.stringify(last.sum.biz.map((b) => b.k)) === JSON.stringify(sm.biz.map((b) => b.k))) { last.sig = sig; last.sum = sm; last.a = a; last.cash = Math.round(Number(v.money) || 0); return; } // small changes within ten minutes just update the newest snapshot
  if (alert.length && last) last.pin = 1; // keep the last good one for ever
  list.push({ at: now, sig, cash: Math.round(Number(v.money) || 0), sum: sm, a, alert: alert.join("; "), pin: 0 }); if (alert.length && !atOverride) diag("assets_lost", id, alert.join("; "));
  while (list.length > 60) { const i = list.findIndex((q) => !q.pin); list.splice(i < 0 ? 0 : i, 1); }
}
function assetSeed() { // on a fresh start, build history from the daily backups (oldest first), so lost businesses can be found in them, then add everyone's current save
  if (db.assetsSeeded) return; let files = []; try { files = fs.readdirSync(BACKUP_DIR).filter((n) => /^data-[\w-]+\.json$/.test(n)).map((n) => ({ n, m: fs.statSync(path.join(BACKUP_DIR, n)).mtimeMs })).sort((a, b) => a.m - b.m).slice(-14); } catch (e) {}
  let i = 0; const next = () => { if (i >= files.length) { for (const id of Object.keys(db.players)) try { assetTrack(id, db.players[id]); } catch (e) {} db.assetsSeeded = Date.now(); persist(); return; } const f = files[i++]; try { const d = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f.n), "utf8")); for (const id of Object.keys(d.players || {})) if (db.players[id]) try { assetTrack(id, d.players[id], f.m); } catch (e) {} } catch (e) {} setTimeout(next, 150); }; setTimeout(next, 5000);
}
function seizeLog(uid, amt, kind, town, note) { // keep a record of every seizure so the admin can see it and give the money back
  const d = db.players[uid] || {}; db.seizures.push({ id: crypto.randomBytes(5).toString("hex"), uid, name: String(d.name || "Someone").slice(0, 16), amt: Math.round(amt), kind, town: town || "", note: String(note || "").slice(0, 80), at: Date.now(), back: 0, backAt: 0, backFrom: 0 }); if (db.seizures.length > 1000) db.seizures.splice(0, db.seizures.length - 1000); persist();
}
function treasuryAdd(T, amt) { amt = Math.round(amt); if (!(amt > 0) || !db.govs || !db.govs[T]) return; db.govs[T].treasury = (db.govs[T].treasury || 0) + amt; }
const raidOnline = (u) => { for (const [, p] of peers) if (p.uid === u && p.ws && !p.away) return true; return false; }; // "away" players have closed the game: they can be raided
const raidDay = (now) => Math.floor(now / 86400000);
const raidHitsLeft = (u, now) => { const h = db.raid.hit[u], c = db.raid.cfg; return Math.max(0, (c.hitsPerDay == null ? 3 : c.hitsPerDay) - (h && h.d === raidDay(now) ? h.n : 0)); }; // how many more times this player can be attacked today
function raidLeft(u, now) { const a = db.raid.att[u]; return Math.max(0, db.raid.cfg.perDay - (a && a.d === raidDay(now) ? a.n : 0)); }
const RAID_K = +process.env.RAID_TIME_SCALE || 1; // 1 normally; a test server can speed training and building up
const RAID_TRAIN_S = { rookie: 20 / RAID_K, bruiser: 60 / RAID_K, hacker: 120 / RAID_K, handler: 90 / RAID_K, driver: 60 / RAID_K }, RAID_UPG_S = [120 / RAID_K, 600 / RAID_K, 1800 / RAID_K, 7200 / RAID_K, 21600 / RAID_K]; // seconds to train one troop; seconds to build defense level 1 to 5
const RAID_LAB_S = [0, 0, 300 / RAID_K, 1200 / RAID_K, 3600 / RAID_K, 14400 / RAID_K, 43200 / RAID_K], RAID_LAB_X = [0, 0, 5, 15, 40, 100, 250]; // seconds to reach troop level 2 to 6, and the cost as a multiple of the troop's training cost
const raidTroopLv = (u) => { const o = {}; const lb = db.raid.lab[u]; for (const k of Object.keys(RAID.CREW)) o[k] = Math.max(1, Math.min(RAID.TROOP_MAX, (lb && lb.lv && lb.lv[k]) | 0 || 1)); return o; };
function raidSettle(u, now) {
  const lb = db.raid.lab[u]; if (lb && lb.up && lb.up.until <= now) { lb.lv = lb.lv || {}; lb.lv[lb.up.k] = Math.max(lb.lv[lb.up.k] | 0, lb.up.to); lb.up = null; } // finish the upgrade and the training that are done
  const R = db.raid, g = R.upg[u]; if (g && g.until <= now) { (R.def[u] = R.def[u] || {})[g.k] = Math.max(RAID.lv(R.def[u], g.k), g.to); delete R.upg[u]; }
  const a = R.army[u] = R.army[u] || { have: {}, q: [] }; while (a.q.length && a.q[0].done <= now) { const q = a.q.shift(); a.have[q.k] = (a.have[q.k] | 0) + 1; } return a;
}
const raidShieldPrice = (nw, c) => Math.max(c.shieldMin == null ? 50000 : c.shieldMin, Math.round(nw * (c.shieldPct == null ? 0.5 : c.shieldPct) / 100));
const raidRichSet = () => new Set(Object.keys(db.players).filter((u) => !db.removed[u] && !isHidden(u)).sort((a, b) => (Number(db.players[b].money) || 0) - (Number(db.players[a].money) || 0)).slice(0, 20)); // the rich list: the 20 richest players
function raidTarget(u, now, any) { // can this player be raided right now? returns their numbers, or null (any: ignore whether they are online, to tell you if you are exposed)
  const d = db.players[u], c = db.raid.cfg; raidSettle(u, now); if (!d || db.removed[u]) return null; const nw = Math.round(Number(d.money) || 0), on = raidOnline(u);
  const rich = nw >= c.minNw || (nw > 0 && raidRichSet().has(u)), onM = on ? (c.onMult == null ? 40 : c.onMult) / 100 : 1, poorM = rich ? 1 : (c.poorPct == null ? 25 : c.poorPct) / 100, mult = onM * poorM; // online players give less, and so do players who are not rich
  if (!rich && nw < (c.minAny == null ? 20000 : c.minAny)) return null; if (on && !(onM > 0)) return null; if (!any && raidHitsLeft(u, now) <= 0) return null;
  if (now - (Number(d.savedAt) || 0) > 30 * 86400000) return null; if ((db.raid.shield[u] || 0) > now) return null; if (Object.values(db.cases).some((q) => q.uid === u && caseOpen(q))) return null; // idle for a month, shielded, or frozen by the court
  const cash = raidCash(u); if (cash < 10000) return null; // nothing worth taking; and one raid never takes more than a share of their cash (see raidCap), so nobody is wiped out
  return { nw, cash, on, mult, rich };
}
const raidCap = (cash, c) => Math.floor(cash * (c.cashCap == null ? 30 : c.cashCap) / 100); // the most one raid can take: a share of the cash they hold
function raidRow(u, t) { const lv = Object.assign({}, db.raid.def[u]), hide = isHidden(u), P = RAID.STAR_PCT, vcut = 1 - Math.min(0.5, RAID.VAULT_CUT * RAID.lv(lv, "vault")); return { u, name: playerName(u), on: !!t.on, nw: hide ? null : t.nw, poor: !t.rich, loot: hide ? null : [1, 2, 3].map((s) => Math.min(raidCap(t.cash, db.raid.cfg), Math.round(t.nw * P[s] / 100 * vcut * t.mult))), lv: { fence: RAID.lv(lv, "fence"), wall: RAID.lv(lv, "wall"), dog: RAID.lv(lv, "dog"), guard: RAID.lv(lv, "guard"), cam: RAID.lv(lv, "cam"), laser: RAID.lv(lv, "laser"), panic: RAID.lv(lv, "panic"), vault: RAID.lv(lv, "vault") } }; }
function raidMine(uid, now) { const army = raidSettle(uid, now), R0 = db.raid, nw0 = Math.round(Number(db.players[uid] && db.players[uid].money) || 0), c0 = R0.cfg, sb = R0.shb[uid] || 0, upg = R0.upg[uid] || null; const rv = []; for (const k in db.raid.rev[uid] || {}) { const r = db.raid.rev[uid][k]; if (r.until > now && db.players[k]) rv.push({ u: k, name: playerName(k), until: r.until }); }
  return { ok: true, cfg: db.raid.cfg, def: Object.assign({}, db.raid.def[uid]), shield: Math.max(0, (db.raid.shield[uid] || 0) - now) ? db.raid.shield[uid] : 0, left: raidLeft(uid, now), rev: rv, costs: RAID.DEF_COST, crew: RAID.CREW, max: RAID.CREW_MAX, exposed: !!raidTarget(uid, now, true), defPos: RAID.defaultPos(db.raid.def[uid]), layout: RAID.layout(db.raid.def[uid], db.raid.lay[uid]), pos: RAID.cleanPos(db.raid.def[uid], db.raid.lay[uid]), town: raidTown(uid), now, hitsLeft: raidHitsLeft(uid, now), lab: { lv: raidTroopLv(uid), up: (R0.lab[uid] && R0.lab[uid].up) || null, max: RAID.TROOP_MAX, sec: RAID_LAB_S, x: RAID_LAB_X }, upg: upg ? { k: upg.k, to: upg.to, until: upg.until } : null, defTime: RAID_UPG_S, army: { have: army.have, q: army.q.map((q) => ({ k: q.k, done: q.done })), max: RAID.CREW_MAX, sec: RAID_TRAIN_S }, sh: { price: raidShieldPrice(nw0, c0), hours: c0.shieldBuyH == null ? 2 : c0.shieldBuyH, cool: sb > now ? sb : 0, on: (db.raid.shield[uid] || 0) > now ? db.raid.shield[uid] : 0 } }; }
function raidMail(to, amt, note) { amt = Math.round(amt); while (amt > 0) { const part = Math.min(amt, 9500000); mailTo(to, part, note, "Raids"); amt -= part; } } // the mailbox takes up to Rs 10M at a time
const raidShAnn = new Set(); // shields already announced as down
setInterval(() => { try { const now = Date.now(), R = db.raid; if (!R || !R.shield) return; const rich = raidRichSet(); for (const u of Object.keys(R.shield)) { const until = R.shield[u]; if (until > now) continue; if (until < now - 120000 || raidShAnn.has(u + ":" + until)) continue; raidShAnn.add(u + ":" + until); const d = db.players[u]; if (!d || db.removed[u] || isHidden(u) || !(rich.has(u) || (Number(d.money) || 0) >= R.cfg.minNw)) continue; townSys("🛡️ Shield down", playerName(u) + "'s shield is down. They can be raided now!"); } if (raidShAnn.size > 400) raidShAnn.clear(); } catch (e) {} }, 20000);
function raidWs(me, m, reply, now) {
  const c = db.raid.cfg, R = db.raid;
  if (m.t === "raid.me") return reply(raidMine(me.uid, now));
  if (m.t === "raid.buy") { const k = String(m.k || ""); if (!RAID.DEF_KEYS.includes(k)) return reply({ ok: false, error: "Unknown defense." }); const cur = RAID.lv(R.def[me.uid], k); if (cur >= 5) return reply({ ok: false, error: "That defense is already at its best." });
    raidSettle(me.uid, now); if (R.upg[me.uid] && R.upg[me.uid].until > now) return reply({ ok: false, error: "Your builders are busy. Wait for the current upgrade to finish." });
    const cur2 = RAID.lv(R.def[me.uid], k); if (cur2 >= 5) return reply({ ok: false, error: "That defense is already at its best." }); const cost = RAID.DEF_COST[k][cur2], until = now + RAID_UPG_S[cur2] * 1000; R.upg[me.uid] = { k, to: cur2 + 1, until }; treasuryAdd(raidTown(me.uid), cost); R.stats.fees += cost; persist(); return reply({ ok: true, k, lv: cur2 + 1, cost, until, now }); }
  if (m.t === "raid.lab") { const k = String(m.k || ""); if (!RAID.CREW[k]) return reply({ ok: false, error: "Unknown troop." }); raidSettle(me.uid, now); const lb = R.lab[me.uid] = R.lab[me.uid] || { lv: {}, up: null }; if (lb.up && lb.up.until > now) return reply({ ok: false, error: "Your training camp is busy. Wait for the current level-up to finish." });
    const cur = raidTroopLv(me.uid)[k]; if (cur >= RAID.TROOP_MAX) return reply({ ok: false, error: "That troop is already at its top level." }); const to = cur + 1, cost = RAID.CREW[k].cost * RAID_LAB_X[to], until = now + RAID_LAB_S[to] * 1000; lb.up = { k, to, until }; treasuryAdd(raidTown(me.uid), cost); R.stats.fees += cost; persist(); return reply({ ok: true, k, lv: to, cost, until, now }); }
  if (m.t === "raid.train") { const k = String(m.k || ""); if (!RAID.CREW[k]) return reply({ ok: false, error: "Unknown troop." }); const a = raidSettle(me.uid, now), have = Object.values(a.have).reduce((x, y) => x + y, 0);
    if (have + a.q.length >= RAID.CREW_MAX) return reply({ ok: false, error: "Your barracks are full (" + RAID.CREW_MAX + " troops)." }); const cost = RAID.CREW[k].cost, last = a.q.length ? a.q[a.q.length - 1].done : now; a.q.push({ k, done: Math.max(now, last) + RAID_TRAIN_S[k] * 1000 });
    treasuryAdd(raidTown(me.uid), cost); R.stats.fees += cost; persist(); return reply({ ok: true, k, cost, done: a.q[a.q.length - 1].done, now }); }
  if (m.t === "raid.shield") { const d = db.players[me.uid], nw = Math.round(Number(d && d.money) || 0); if (R.shield[me.uid] > now) return reply({ ok: false, error: "You are already shielded." }); if ((R.shb[me.uid] || 0) > now) return reply({ ok: false, error: "Your shield is recharging. Try again later." });
    const price = raidShieldPrice(nw, c), h = c.shieldBuyH == null ? 2 : c.shieldBuyH; R.shield[me.uid] = now + h * 3600000; R.shb[me.uid] = R.shield[me.uid] + (c.shieldCoolH == null ? 2 : c.shieldCoolH) * 3600000; treasuryAdd(raidTown(me.uid), price); R.stats.fees += price; persist(); return reply({ ok: true, cost: price, until: R.shield[me.uid], now }); }
  if (m.t === "raid.layout") { if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); const clean = RAID.cleanPos(R.def[me.uid], m.pos); R.lay[me.uid] = clean; persist(); return reply({ ok: true, layout: RAID.layout(R.def[me.uid], clean), pos: clean }); } // arrange your own base
  if (m.t === "raid.claim") { const debits = (R.debit[me.uid] || []).map((q) => ({ id: q.id, amt: q.amt, by: q.by, kind: q.kind || "", note: q.note || "" })), reps = (R.rep[me.uid] || []).slice(-12).reverse(); const fresh = (R.rep[me.uid] || []).filter((q) => !q.seen).length; for (const q of R.rep[me.uid] || []) q.seen = 1; if (fresh) persist(); return reply({ ok: true, debits, reps, fresh }); }
  if (m.t === "raid.ack") { const ids = new Set((Array.isArray(m.ids) ? m.ids : []).map(String)); R.debit[me.uid] = (R.debit[me.uid] || []).filter((q) => !ids.has(q.id)); if (!R.debit[me.uid].length) delete R.debit[me.uid]; persist(); return reply({ ok: true }); }
  if (!c.on) return reply({ ok: false, error: "Raids are closed for now." });
  if (m.t === "raid.search") { const q = String(m.q || "").trim().toLowerCase().slice(0, 20); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    let list = Object.keys(db.players).filter((u) => u !== me.uid).map((u) => [u, raidTarget(u, now)]).filter(([, t]) => t); if (q) list = list.filter(([u]) => playerName(u).toLowerCase().includes(q));
    if (m.random && !q) { const mine = Math.max(1, Math.round(Number(db.players[me.uid] && db.players[me.uid].money) || 1)), near = list.filter(([, t]) => t.nw >= mine / 4 && t.nw <= mine * 4); if (near.length >= 3) list = near; } // a random search finds players about as wealthy as you
    const total = list.length; for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } list = list.slice(0, 5).sort((a, b) => b[1].nw - a[1].nw);
    treasuryAdd(raidTown(me.uid), c.searchFee); R.stats.fees += c.searchFee; persist(); return reply({ ok: true, fee: c.searchFee, total, rows: list.map(([u, t]) => raidRow(u, t)), left: raidLeft(me.uid, now) }); }
  if (m.t === "raid.rich") { const rows = [...raidRichSet()].filter((u) => u !== me.uid).map((u) => { const t = raidTarget(u, now); if (t) return [t.nw, raidRow(u, t)]; const sh = db.raid.shield[u] || 0, nw = Math.round(Number(db.players[u].money) || 0); return sh > now ? [nw, { u, name: playerName(u), nw, sh, lv: {} }] : null; }).filter(Boolean).sort((a, b) => b[0] - a[0]).map((q) => q[1]); return reply({ ok: true, rows, left: raidLeft(me.uid, now), now }); } // the rich list, free to look at
  const to = String(m.to || ""); if (!UID_RE.test(to) || !db.players[to] || to === me.uid) return reply({ ok: false, error: "Pick a target." });
  if (m.t === "raid.scout") { const t = raidTarget(to, now); if (!t) return reply({ ok: false, error: "That player can't be raided right now." }); return reply({ ok: true, row: raidRow(to, t), layout: RAID.layout(R.def[to], R.lay[to]), army: { have: raidSettle(me.uid, now).have }, myShield: (R.shield[me.uid] || 0) > now }); }
  if (m.t === "raid.go") { if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); const rv = (R.rev[me.uid] || {})[to], rev = !!(m.rev && rv && rv.until > now);
    if (!rev && raidLeft(me.uid, now) <= 0) return reply({ ok: false, error: "You've used your " + c.perDay + " raids for today. Come back tomorrow." }); const t = raidTarget(to, now); if (!t) return reply({ ok: false, error: "That player can't be raided right now." });
    const crew = RAID.cleanCrew(m.crew); if (!crew.some((q) => q.k !== "driver")) return reply({ ok: false, error: "Send at least one fighter." }); const army = raidSettle(me.uid, now); for (const k of Object.keys(RAID.CREW)) if (crew.filter((q) => q.k === k).length > (army.have[k] | 0)) return reply({ ok: false, error: "You don't have enough " + k + "s trained. Train troops in the Troops tab." });
    const sim = RAID.simulate(R.def[to], crew, R.lay[to], raidTroopLv(me.uid)), cost = sim.crewCost;
    { const h = R.hit[to]; R.hit[to] = h && h.d === raidDay(now) ? { d: h.d, n: h.n + 1 } : { d: raidDay(now), n: 1 }; } /* one more attack on them today */ for (const q of crew) army.have[q.k]--; if (R.shield[me.uid] > now) delete R.shield[me.uid]; /* troops are spent; attacking drops your own shield */ if (!rev) { const a = R.att[me.uid]; R.att[me.uid] = a && a.d === raidDay(now) ? { d: a.d, n: a.n + 1 } : { d: raidDay(now), n: 1 }; } else delete R.rev[me.uid][to];
    const loot = Math.min(raidCap(t.cash, c), Math.round(t.nw * sim.pct * t.mult)), tax = Math.round(loot * c.tax / 100), net = loot - tax, town = raidTown(to), an = playerName(me.uid), vn = playerName(to), seen = sim.seen && sim.stars >= 1;
    treasuryAdd(town, tax); R.stats.n++; R.stats.tax += tax;
    if (sim.stars < 1) { const back = Math.min(Math.round(cost / 2), (db.govs && db.govs[town] && db.govs[town].treasury) || 0); if (back > 0) { db.govs[town].treasury -= back; raidMail(to, back, "Your defenses beat a raid"); } } // the troops were paid for when trained: a failed raid pays the defender back half
    if (loot > 0) { (R.debit[to] = R.debit[to] || []).push({ id: crypto.randomBytes(5).toString("hex"), amt: loot, by: seen ? an : "", at: now }); if (R.debit[to].length > 30) R.debit[to].shift(); raidMail(me.uid, net, "Raid on " + vn); R.stats.stolen += loot; R.shield[to] = now + c.shieldH * 3600000; }
    const rep = { id: crypto.randomBytes(5).toString("hex"), at: now, by: seen ? an : "", byU: seen ? me.uid : "", stars: sim.stars, loot, end: sim.end, seen: 0 }; (R.rep[to] = R.rep[to] || []).push(rep); if (R.rep[to].length > 20) R.rep[to].shift();
    if (sim.stars >= 1 && seen) { (R.rev[to] = R.rev[to] || {})[me.uid] = { until: now + c.revengeH * 3600000 }; } // a free revenge raid, only against a raider the cameras saw
    persist(); tellUid(to, { t: "raidhit" });
    if (sim.stars >= 1 && loot >= 100000) townSys("🏴‍☠️ Raid", (seen ? an : "A masked crew") + " raided " + vn + "'s home and got away with Rs " + loot.toLocaleString("en") + " (" + "★".repeat(sim.stars) + ")! Rs " + tax.toLocaleString("en") + " went to the " + GOV_NAME[town] + " treasury.");
    else if (sim.stars === 0) townSys("🛡️ Raid", vn + "'s defenses stopped " + (sim.seen ? an : "a crew") + "'s raid!");
    return reply({ ok: true, result: { stars: sim.stars, end: sim.end, events: sim.events, frames: sim.frames, layout: sim.layout, crew: sim.crew, limit: sim.limit, loot, tax, net, cost: 0, lost: cost, seen, town: GOV_NAME[town] }, left: raidLeft(me.uid, now), name: vn }); }
  return reply({ ok: false, error: "Unknown request." });
} // end raidWs
function homeAvg(uid) { const h = db.hr[uid]; if (!h) return { avg: 0, n: 0 }; const v = Object.values(h.r); if (!v.length) return { avg: 0, n: 0 }; return { avg: Math.round(v.reduce((a, r) => a + r.s, 0) / v.length * 100) / 100, n: v.length }; }
function topHomes() { return Object.keys(db.hr).filter((u) => db.players[u] && !db.removed[u]).map((u) => Object.assign({ u, n: playerName(u) }, homeAvg(u))).filter((r) => r.n >= 2).sort((a, b) => b.avg - a.avg || b.n - a.n).slice(0, 10).map((r) => ({ u: r.u, name: r.n, avg: r.avg, n: r.n })); } // note: n on the row is the number of ratings
function hotwTick() { const wk = Math.floor(Date.now() / (7 * 86400000)); if (db.hotw.week === wk) return; const best = Object.keys(db.hr).map((u) => { const v = Object.values(db.hr[u].r).filter((r) => Date.now() - r.t < 7 * 86400000); return { u, n: v.length, avg: v.length ? v.reduce((a, r) => a + r.s, 0) / v.length : 0 }; }).filter((r) => r.n >= 3 && db.players[r.u] && !db.removed[r.u]).sort((a, b) => b.avg - a.avg || b.n - a.n)[0];
  db.hotw = { week: wk, uid: best ? best.u : "", name: best ? playerName(best.u) : "", avg: best ? Math.round(best.avg * 100) / 100 : 0, n: best ? best.n : 0 }; persist(); if (best) { townSys("🏠 Home of the Week", playerName(best.u) + "'s home is the Home of the Week with " + db.hotw.avg + " stars from " + best.n + " visitors! Visit it and say hello."); flexSay(best.u, "hotw", ""); } }
setInterval(hotwTick, 600000); setTimeout(hotwTick, 20000);
// ---------- Clawed by Taps: real-life nail appointments booked in the game ----------
const MN = (id, n, p, u) => ({ id, n, p, u: u || "" }), SAL_MENU = [ // the price list: main services (pick one) and extra art add-ons
  { id: "plain", t: "Plain Sets", i: "💅", main: 1, items: [MN("pl_s", "Short", 700), MN("pl_m", "Medium", 750), MN("pl_l", "Long", 800)] },
  { id: "french", t: "Plain French Tips", i: "🤍", main: 1, items: [MN("fr_s", "Short", 750), MN("fr_m", "Medium", 850), MN("fr_l", "Long", 950)] },
  { id: "gel", t: "Gel Overlay", i: "💎", main: 1, items: [MN("gel_p", "Plain", 700)] },
  { id: "toes", t: "Toes", i: "🦶", main: 1, items: [MN("toe_p", "Tips on Toes (Plain)", 650), MN("toe_f", "French Tips on Toes", 750)] },
  { id: "combo", t: "Combo Deals", i: "💖", main: 1, combo: 1, items: [MN("c1s", "Plain French Tips + French Tips on Toes · Short", 1400), MN("c1m", "Plain French Tips + French Tips on Toes · Medium", 1500), MN("c1l", "Plain French Tips + French Tips on Toes · Long", 1600), MN("c2s", "Tips with Simple Art + Toe Tips · Short", 1500), MN("c2m", "Tips with Simple Art + Toe Tips · Medium", 1600), MN("c2l", "Tips with Simple Art + Toe Tips · Long", 1700), MN("c3s", "Tips with Complex Art + Toe Tips · Short", 1600), MN("c3m", "Tips with Complex Art + Toe Tips · Medium", 1700), MN("c3l", "Tips with Complex Art + Toe Tips · Long", 1800), MN("c4s", "Plain Tips + Plain Toe Tips · Short", 1200), MN("c4m", "Plain Tips + Plain Toe Tips · Medium", 1300), MN("c4l", "Plain Tips + Plain Toe Tips · Long", 1400)] },
  { id: "soak", t: "Soak Off", i: "🧴", main: 1, noadd: 1, items: [MN("sk_my", "My Work", 250), MN("sk_gel", "Gel (Not My Work)", 350), MN("sk_acr", "Acrylic", 450), MN("tsk_my", "Toes Soak Off · My Work", 200), MN("tsk_not", "Toes Soak Off · Not My Work", 300), MN("tsk_acr", "Toes Soak Off · Acrylic", 400)] },
  { id: "add", t: "Extra Art (add-ons)", i: "✨", add: 1, items: [MN("a_cross", "Crosses", 50, "pair"), MN("a_charm", "Small Charms", 50), MN("a_bow", "Bow Ties", 50), MN("a_flow", "3D Flowers", 150, "pair"), MN("a_swirl", "3D Swirls", 15, "finger"), MN("a_aura", "Aura", 20, "finger"), MN("a_simple", "Simple Art", 150), MN("a_complex", "Complex Art", 200), MN("a_toeart", "Complex Art on Toes", 150)] }
];
db.salon = db.salon && typeof db.salon === "object" ? db.salon : {}; const SAL = db.salon;
SAL.cfg = Object.assign({ name: "Clawed by Taps", owner: "Taps", bio: "Flic's baddest. Hand-painted nail art, gel and acrylic sets, French tips and toes by Taps. Book a one hour appointment in the game and see her in real life.", whatsapp: "23055126462", menu: SAL_MENU, from: 9, to: 17, days: [1, 2, 3, 4, 5, 6], comboPrice: 1000, discUntil: 0, reward: 5000, ownerKey: "", ownerUids: [], allow: [], open: false, photos: ["/taps/1.jpg", "/taps/2.jpg", "/taps/3.jpg", "/taps/4.jpg", "/taps/5.jpg"], caps: ["Pink flowers and gold beads", "Gold line art", "Tiger tips", "Matte leopard", "Burgundy and gold stars"] }, SAL.cfg || {});
if (!SAL.cfg.promoSet) { SAL.cfg.promoSet = 1; SAL.cfg.comboPrice = 1000; SAL.cfg.discUntil = Date.now() + 14 * 86400000; } if (!SAL.cfg.launchV) { SAL.cfg.launchV = 1; SAL.cfg.open = true; SAL.cfg.reward = 50000; SAL.cfg.comboPrice = 1000; SAL.cfg.discUntil = Date.now() + 14 * 86400000; SAL.cfg.endNoted = 0; setTimeout(() => { try { townSys("💅 Clawed by Taps", "Clawed by Taps is OPEN! Book a real nail appointment with Taps in the Clawed by Taps app. Every combo is Rs 1,000 for 2 weeks and your first booking earns you Rs " + SAL.cfg.reward.toLocaleString("en") + " in-game cash!"); } catch (e) {} }, 8000); } // launch: open to everyone, a two week deal and a bigger first-booking reward
if (SAL.cfg.menuV !== 1) { SAL.cfg.menuV = 1; SAL.cfg.menu = SAL_MENU; delete SAL.cfg.services; } // the launch deal runs for two weeks from the first start
if (!SAL.cfg.ownerKey) SAL.cfg.ownerKey = crypto.randomBytes(9).toString("hex"); SAL.bk = dict(SAL.bk); SAL.track = SAL.track && typeof SAL.track === "object" ? SAL.track : { total: {}, days: {}, uniq: {} }; // what players do with the ads: counts, per day, and who
const SB_EVENTS = ["ad_seen", "poster", "poster_book", "poster_prices", "poster_visit", "card_shown", "card_book", "card_gallery", "app_open", "banner"];
function sbTrack(uid, ev) { const T = SAL.track, d = mvDate(); T.total[ev] = (T.total[ev] || 0) + 1; (T.days[d] || (T.days[d] = {}))[ev] = ((T.days[d] || {})[ev] || 0) + 1; const u = T.uniq[ev] || (T.uniq[ev] = {}); if (uid && Object.keys(u).length < 20000) u[uid] = 1; const ds = Object.keys(T.days).sort(); while (ds.length > 60) delete T.days[ds.shift()]; persist(); }
setInterval(() => { const c = SAL.cfg; if (c.open && c.comboPrice > 0 && c.discUntil && !c.endNoted && c.discUntil - Date.now() < 86400000 && c.discUntil > Date.now()) { c.endNoted = 1; persist(); townSys("💅 Clawed by Taps", "Last day! Every Clawed by Taps combo is Rs " + c.comboPrice.toLocaleString("en") + " until tomorrow. Book yours in the Clawed by Taps app."); } }, 600000); // one reminder the day before the deal ends
const SB_ACTIVE = ["pending", "confirmed"], MV_OFF = 4 * 3600000; // Mauritius is UTC+4 all year
const mvDate = (t) => new Date((t === undefined ? Date.now() : t) + MV_OFF).toISOString().slice(0, 10), mvDow = (ds) => new Date(ds + "T00:00:00Z").getUTCDay(), slotAt = (ds, h) => Date.parse(ds + "T00:00:00Z") + (h - 4) * 3600000;
const sbUid = (me, key) => (me.uid && SAL.cfg.ownerUids.includes(me.uid)) || (key && key === SAL.cfg.ownerKey);
const sbClean = (v, n) => String(v || "").replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const sbPromo = () => SAL.cfg.comboPrice > 0 && (!SAL.cfg.discUntil || Date.now() < SAL.cfg.discUntil);
const sbPrice = (it, sec) => (sec.combo && sbPromo() ? Math.min(it.p, SAL.cfg.comboPrice) : it.p);
function sbOrder(mainId, adds) { // work out what a customer picked and what it costs
  let sec = null, it = null; for (const s of SAL.cfg.menu) { if (!s.main) continue; const f = s.items.find((q) => q.id === mainId); if (f) { sec = s; it = f; } } if (!it) return null; const add = SAL.cfg.menu.find((s) => s.add), out = []; let price = sbPrice(it, sec), name = sec.t + ": " + it.n, saved = it.p - price;
  if (!sec.noadd && add && adds && typeof adds === "object") for (const id of Object.keys(adds).slice(0, 12)) { const a = add.items.find((q) => q.id === id), q = Math.round(Number(adds[id])); if (!a || !(q >= 1)) continue; const mx = a.u === "finger" ? 10 : a.u === "pair" ? 5 : 1; if (q > mx) return null; price += a.p * q; name += " + " + a.n + (q > 1 ? " ×" + q : ""); out.push([id, q]); }
  return { name: name.slice(0, 200), price, saved, adds: out }; }
const sbPub = () => { const c = SAL.cfg; return { name: c.name, owner: c.owner, bio: c.bio, menu: c.menu, from: c.from, to: c.to, days: c.days, photos: c.photos, caps: c.caps, reward: c.reward, promo: sbPromo() ? { price: c.comboPrice, until: c.discUntil } : null, hasWa: !!c.whatsapp }; };
const sbView = (b, mine) => ({ code: b.code, name: b.name, date: b.date, hour: b.hour, svc: b.svc, svcName: b.svcName, price: b.price, saved: b.saved || 0, size: b.size || 1, contact: b.contact, phone: mine === "owner" ? b.phone : (mine ? b.phone : ""), note: b.note, status: b.status, created: b.created, log: (b.log || []).slice(-30), disc: b.disc || null, uid: mine === "owner" ? b.uid : undefined, moved: !!b.moved, reward: b.reward || 0 });
const sbTaken = (ds, h, except) => Object.values(SAL.bk).some((b) => b.date === ds && b.hour === h && SB_ACTIVE.includes(b.status) && b.code !== except);
const sbSlotOk = (ds, h) => { const c = SAL.cfg; if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || !Number.isInteger(h) || h < c.from || h + 1 > c.to) return "That time is outside opening hours."; if (!c.days.includes(mvDow(ds))) return "The salon is closed that day."; const t = slotAt(ds, h); if (t < Date.now() + 1800000) return "That time has passed or is too soon."; if (t > Date.now() + 22 * 86400000) return "You can book up to three weeks ahead."; return ""; };
function sbTellOwners(o) { for (const [, p] of peers) if (p.uid && SAL.cfg.ownerUids.includes(p.uid)) send(p.ws, o); }
function sbStats() { const all = Object.values(SAL.bk), now = Date.now(), wk = now - 7 * 86400000, cnt = {}, svc = {}, dow = [0, 0, 0, 0, 0, 0, 0], cust = {}; let rev = 0, revWk = 0; for (const b of all) { cnt[b.status] = (cnt[b.status] || 0) + 1; cust[b.uid] = (cust[b.uid] || 0) + 1; if (b.status === "done") { rev += b.price || 0; if (b.created > wk) revWk += b.price || 0; } if (b.status !== "cancelled" && b.status !== "declined") { svc[b.svcName] = (svc[b.svcName] || 0) + 1; dow[mvDow(b.date)]++; } }
  const top = Object.entries(svc).sort((a, b) => b[1] - a[1])[0]; return { total: all.length, counts: cnt, week: all.filter((b) => b.created > wk).length, today: all.filter((b) => b.date === mvDate() && SB_ACTIVE.includes(b.status)).length, upcoming: all.filter((b) => SB_ACTIVE.includes(b.status) && slotAt(b.date, b.hour) >= now).length, customers: Object.keys(cust).length, repeat: Object.values(cust).filter((n) => n > 1).length, revenue: rev, revenueWeek: revWk, top: top ? top[0] : "", dow }; }
function findPlayerBy(q) { // an admin typed a name: match the login (like clawedbytaps), the character name or the id, then fall back to a unique partial match
  const s0 = String(q || "").trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, ""); if (!s0) return { err: "Type a name." };
  const rows = Object.keys(db.players).filter((u) => !db.removed[u]).map((u) => ({ u, login: String((db.auth.names || {})[u] || "").toLowerCase(), name: String(playerName(u)).toLowerCase().replace(/\s+/g, "") }));
  let hit = rows.filter((r) => r.u === s0 || r.login === s0 || r.name === s0); if (!hit.length) hit = rows.filter((r) => (r.login && r.login.includes(s0)) || r.name.includes(s0));
  if (hit.length === 1) return { id: hit[0].u }; if (!hit.length) return { err: "No player found for “" + String(q).trim().slice(0, 30) + "”. Use their login (like clawedbytaps) or their character name exactly as shown in the player list." };
  return { err: "More than one player matches: " + hit.slice(0, 6).map((r) => (r.login ? "@" + r.login : playerName(r.u)) + " (" + playerName(r.u) + ")").join(", ") + ". Type the full login." };
}
function sbTrackReport() { // numbers for the admin: rewards paid out, and how the ads and poster are doing
  const T = SAL.track, all = Object.values(SAL.bk), paid = all.filter((b) => b.reward > 0), uniq = {}; for (const ev of SB_EVENTS) uniq[ev] = Object.keys(T.uniq[ev] || {}).length; const days = Object.keys(T.days).sort().slice(-7).map((d) => ({ d, ev: T.days[d] }));
  const byDay = {}; for (const b of paid) { const d = mvDate(b.created); byDay[d] = byDay[d] || { n: 0, amt: 0 }; byDay[d].n++; byDay[d].amt += b.reward; }
  return { rewards: { n: paid.length, total: paid.reduce((a, b) => a + b.reward, 0), perBooking: SAL.cfg.reward, byDay: Object.keys(byDay).sort().slice(-7).map((d) => ({ d, n: byDay[d].n, amt: byDay[d].amt })), recent: paid.sort((a, b) => b.created - a.created).slice(0, 15).map((b) => ({ name: b.name, amt: b.reward, code: b.code, at: b.created })) }, total: T.total, uniq, days, bookings: all.length, bookedPlayers: new Set(all.map((b) => b.uid)).size };
}
// ---------- polls: the team asks all players a question; one vote each; results shown after you vote ----------
db.poll = db.poll && typeof db.poll === "object" ? db.poll : {}; { const P = db.poll; P.cur = P.cur && typeof P.cur === "object" ? P.cur : null; P.hist = Array.isArray(P.hist) ? P.hist.slice(-10) : []; }
const plCounts = (c) => { const n = c.opts.map(() => 0); for (const u in c.votes) if (n[c.votes[u]] !== undefined) n[c.votes[u]]++; return n; };
const plView = (uid) => { const c = db.poll.cur; if (!c) return null; const mine = c.votes[uid], show = mine !== undefined || c.closed, n = plCounts(c); return { id: c.id, q: c.q, desc: c.desc, opts: c.opts, closed: !!c.closed, mine: mine === undefined ? -1 : mine, counts: show ? n : null, total: show ? n.reduce((a, b) => a + b, 0) : null }; };
function pollWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "poll", rid: m.rid }, o)), c = db.poll.cur; if (!me.uid || !db.players[me.uid] || db.removed[me.uid]) return reply({ ok: false, error: "Play a little first." });
  if (m.t === "poll.get") return reply({ ok: true, poll: plView(me.uid) });
  if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  if (m.t === "poll.vote") { if (!c || c.id !== String(m.id || "")) return reply({ ok: false, error: "This poll has ended." }); if (c.closed) return reply({ ok: false, error: "This poll is closed." }); const o = Math.round(Number(m.opt)); if (!(o >= 0 && o < c.opts.length)) return reply({ ok: false, error: "Pick an answer." }); c.votes[me.uid] = o; persist(); return reply({ ok: true, poll: plView(me.uid) }); }
  reply({ ok: false, error: "Unknown request." });
}
// ---------- Student drivers: learner drivers offer real trips, passengers pick where they want to go and message the driver. Hidden from players until the admin switches it on ----------
const TRIP_PLACES = [ // [id, name, standard price in rupees, longitude, latitude]
  ["cascavelle", "Cascavelle", 150, 57.3716, -20.2937], ["flic", "Flic en Flac", 150, 57.3667, -20.2767], ["bambous", "Bambous", 350, 57.3935, -20.2522], ["tamarin", "Tamarin", 400, 57.3708, -20.3269], ["rosehill", "Rose Hill", 500, 57.4667, -20.2333],
  ["quatrebornes", "Quatre Bornes", 500, 57.4797, -20.2667], ["phoenix", "Phoenix", 500, 57.4953, -20.2994], ["trianon", "Trianon", 600, 57.4730, -20.2790], ["tribeca", "Tribeca", 650, 57.4690, -20.2850], ["bagatelle", "Bagatelle", 700, 57.4960, -20.2400],
  ["moka", "Moka", 700, 57.5100, -20.2300], ["portlouis", "Port Louis", 800, 57.5012, -20.1609], ["curepipe", "Curepipe", 600, 57.5222, -20.3189], ["lemorne", "Le Morne", 1200, 57.3171, -20.4521], ["grandbaie", "Grand Baie", 1900, 57.5800, -20.0116],
  ["flacq", "Flacq", 2000, 57.7131, -20.1897], ["airport", "Airport", 1500, 57.6836, -20.4302], ["delivery", "Delivery", 150, 0, 0]];
const TRIP_STOP = 50; // the standard fee for each extra stop
db.trips = db.trips && typeof db.trips === "object" ? db.trips : {}; { const T = db.trips; T.on = T.on === true; T.testers = Array.isArray(T.testers) ? T.testers : []; T.drivers = dict(T.drivers); T.reqs = dict(T.reqs); T.reports = Array.isArray(T.reports) ? T.reports.slice(-100) : []; T.blocked = Array.isArray(T.blocked) ? T.blocked : []; T.cfg = Object.assign({ on: true, passenger: 2000, first: 10000, driver: 5000, bonus: 2000, cap: 3, minMin: 10 }, T.cfg && typeof T.cfg === "object" ? T.cfg : {}); T.firsts = T.firsts && typeof T.firsts === "object" ? T.firsts : {}; T.pay = T.pay && typeof T.pay === "object" ? T.pay : {}; T.paid = T.paid || 0; }
const tripsAllowed = (uid) => db.trips.on || db.trips.testers.includes(uid);
const tripPrices = () => { const o = {}; for (const p of TRIP_PLACES) o[p[0]] = p[2]; return o; };
const trClean = (v, n) => String(v || "").replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const trDriverPub = (uid, d, dest) => { const prices = d.prices || {}; return { uid, name: d.name, car: d.car, price: dest ? (prices[dest] > 0 ? prices[dest] : null) : null, stop: d.stop, trips: d.trips || 0, rating: d.rn ? Math.round(d.rs / d.rn * 10) / 10 : 0, rn: d.rn || 0 }; };
const trReqView = (r, forDriver) => { const d = db.trips.drivers[r.driver] || {}; return { id: r.id, dest: r.dest, pax: r.pax, stops: r.stops, when: r.when, note: r.note, status: r.status, price: r.price, name: forDriver ? r.name : undefined, driver: r.driver ? d.name || "" : "", wa: r.status === "accepted" || r.status === "done" ? (forDriver ? "" : d.wa || "") : "", created: r.created, rated: r.rated || 0 }; };
function tripsWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "trips", rid: m.rid }, o)), T = db.trips, now = Date.now();
  if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." }); if (!tripsAllowed(me.uid)) return reply({ ok: false, hidden: true });
  const mine = T.drivers[me.uid];
  if (m.t === "trips.get") return reply({ ok: true, places: TRIP_PLACES.map((p) => ({ id: p[0], name: p[1], price: p[2], lon: p[3], lat: p[4] })), stop: TRIP_STOP, rewards: { on: db.trips.cfg.on, passenger: db.trips.cfg.passenger, first: db.trips.cfg.first, driver: db.trips.cfg.driver, bonus: db.trips.cfg.bonus, cap: db.trips.cfg.cap, minMin: db.trips.cfg.minMin, firstDone: !!db.trips.firsts[me.uid] }, driver: mine ? { wa: mine.wa, car: mine.car, prices: mine.prices, stop: mine.stop, online: !!mine.online, verified: !!mine.verified, trips: mine.trips || 0, rating: mine.rn ? Math.round(mine.rs / mine.rn * 10) / 10 : 0, blocked: T.blocked.includes(me.uid) } : null });
  if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  if (m.t === "trips.drivers") { const dest = String(m.dest || ""); if (!TRIP_PLACES.some((p) => p[0] === dest)) return reply({ ok: false, error: "Pick where you want to go." }); return reply({ ok: true, list: Object.entries(T.drivers).filter(([u, d]) => d.verified && d.online && u !== me.uid && !T.blocked.includes(u) && d.prices && d.prices[dest] > 0).map(([u, d]) => trDriverPub(u, d, dest)).sort((a, b) => a.price - b.price).slice(0, 30) }); }
  if (m.t === "trips.driver.save") { if (T.blocked.includes(me.uid)) return reply({ ok: false, error: "You cannot offer trips." }); const wa = String(m.wa || "").replace(/\D/g, ""); if (wa.length < 8 || wa.length > 15) return reply({ ok: false, error: "Add your WhatsApp number with the country code, digits only." }); const car = trClean(m.car, 40); if (!car) return reply({ ok: false, error: "Say which car you drive." });
    if (!mine && m.agree !== true) return reply({ ok: false, error: "You must confirm the safety rules first." }); const prices = {}; const inP = m.prices && typeof m.prices === "object" ? m.prices : {}; for (const p of TRIP_PLACES) { const v = Math.round(Number(inP[p[0]])); if (v > 0 && v <= 20000) prices[p[0]] = v; else if (inP[p[0]] === 0 || inP[p[0]] === null) { /* not offered */ } else prices[p[0]] = p[2]; }
    const stop = Math.round(Number(m.stop)); const d = T.drivers[me.uid] = Object.assign({ created: now, verified: false, trips: 0, rs: 0, rn: 0 }, mine || {}, { name: nameOfSrv(me.uid), wa, car, prices, stop: stop >= 0 && stop <= 1000 ? stop : TRIP_STOP, online: m.online === true, agreed: (mine && mine.agreed) || now }); persist(); return reply({ ok: true, driver: { wa: d.wa, car: d.car, prices: d.prices, stop: d.stop, online: d.online, verified: d.verified } }); }
  if (m.t === "trips.driver.online") { if (!mine) return reply({ ok: false, error: "Set up your driver profile first." }); mine.online = m.online === true; persist(); return reply({ ok: true, online: mine.online }); }
  if (m.t === "trips.request") { const dest = String(m.dest || ""), place = TRIP_PLACES.find((p) => p[0] === dest); if (!place) return reply({ ok: false, error: "Pick where you want to go." }); const drv = String(m.driver || ""), d = T.drivers[drv]; if (!d || !d.verified || !d.online || drv === me.uid || T.blocked.includes(drv)) return reply({ ok: false, error: "That driver is not available now." });
    const price = d.prices && d.prices[dest]; if (!(price > 0)) return reply({ ok: false, error: "That driver does not go there." }); const open = Object.values(T.reqs).filter((r) => r.uid === me.uid && ["open", "accepted"].includes(r.status)); if (open.length >= 3) return reply({ ok: false, error: "You already have 3 open trips. Finish or cancel one first." });
    const stops = Math.max(0, Math.min(5, Math.round(Number(m.stops)) || 0)), pax = Math.max(1, Math.min(4, Math.round(Number(m.pax)) || 1)); const id = "TR-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    T.reqs[id] = { id, uid: me.uid, name: nameOfSrv(me.uid), driver: drv, dest, pax, stops, price: price + stops * d.stop, when: trClean(m.when, 40) || "Now", note: trClean(m.note, 100), status: "open", created: now }; tellUid(drv, { t: "trips", ev: "req", id, name: nameOfSrv(me.uid), dest: place[1] }); persist(); return reply({ ok: true, req: trReqView(T.reqs[id], false) }); }
  if (m.t === "trips.mine") { const asPass = Object.values(T.reqs).filter((r) => r.uid === me.uid).sort((a, b) => b.created - a.created).slice(0, 12).map((r) => trReqView(r, false)), asDrv = Object.values(T.reqs).filter((r) => r.driver === me.uid).sort((a, b) => b.created - a.created).slice(0, 20).map((r) => trReqView(r, true)); return reply({ ok: true, asPass, asDrv }); }
  if (m.t === "trips.answer") { const r = T.reqs[String(m.id || "")]; if (!r || r.driver !== me.uid) return reply({ ok: false, error: "No such trip." }); if (r.status !== "open") return reply({ ok: false, error: "That trip is already " + r.status + "." }); r.status = m.accept === true ? "accepted" : "declined"; if (r.status === "accepted") r.acceptedAt = now; tellUid(r.uid, { t: "trips", ev: "upd", id: r.id, status: r.status, driver: nameOfSrv(me.uid) }); persist(); return reply({ ok: true }); }
  if (m.t === "trips.cancel") { const r = T.reqs[String(m.id || "")]; if (!r || (r.uid !== me.uid && r.driver !== me.uid)) return reply({ ok: false, error: "No such trip." }); if (!["open", "accepted"].includes(r.status)) return reply({ ok: false, error: "That trip is closed." }); r.status = "cancelled"; tellUid(r.uid === me.uid ? r.driver : r.uid, { t: "trips", ev: "upd", id: r.id, status: "cancelled" }); persist(); return reply({ ok: true }); }
  if (m.t === "trips.done") { const r = T.reqs[String(m.id || "")]; if (!r || r.uid !== me.uid) return reply({ ok: false, error: "No such trip." }); if (r.status !== "accepted") return reply({ ok: false, error: "Only an accepted trip can be finished." }); const star = Math.round(Number(m.stars)); r.status = "done"; const d = T.drivers[r.driver]; if (d) { d.trips = (d.trips || 0) + 1; if (star >= 1 && star <= 5) { d.rs = (d.rs || 0) + star; d.rn = (d.rn || 0) + 1; r.rated = star; } }
    // in-game money for using it: both people are paid by the server (so it cannot be faked on the phone), with limits so it cannot be farmed
    const c = T.cfg, day = mvDate(), place = (TRIP_PLACES.find((q) => q[0] === r.dest) || [0, r.dest])[1]; for (const k of Object.keys(T.pay)) if (!k.endsWith("|" + day)) delete T.pay[k]; let why = ""; const kP = r.uid + "|" + day, kD = r.driver + "|" + day, kPair = r.uid + "|" + r.driver + "|" + day;
    if (!c.on) why = "off"; else if (r.acceptedAt && now - r.acceptedAt < c.minMin * 60000) why = "early"; else if (T.pay[kPair]) why = "pair"; else if ((T.pay[kP] || 0) >= c.cap || (T.pay[kD] || 0) >= c.cap) why = "cap"; else if (!d) why = "off";
    let got = 0; if (!why) { const pa = T.firsts[r.uid] ? c.passenger : c.first, da = c.driver + (star === 5 ? c.bonus : 0); mailTo(r.uid, pa, "Trip to " + place, "Student drivers"); mailTo(r.driver, da, "Trip with " + nameOfSrv(r.uid), "Student drivers"); T.pay[kPair] = 1; T.pay[kP] = (T.pay[kP] || 0) + 1; T.pay[kD] = (T.pay[kD] || 0) + 1; T.firsts[r.uid] = 1; T.paid += pa + da; r.paid = { p: pa, d: da }; got = pa; tellUid(r.driver, { t: "trips", ev: "paid", amt: da }); }
    persist(); return reply({ ok: true, reward: got, why }); }
  if (m.t === "trips.report") { const r = T.reqs[String(m.id || "")], who = String(m.driver || (r ? r.driver : "")); T.reports.push({ at: now, by: me.uid, byName: nameOfSrv(me.uid), driver: who, driverName: (T.drivers[who] || {}).name || "", id: r ? r.id : "", text: trClean(m.text, 200) || "No details" }); T.reports = T.reports.slice(-100); persist(); return reply({ ok: true }); }
  reply({ ok: false, error: "Unknown request." });
}
// ---------- Belle's Kitchen: an African restaurant in Flic en Flac. Players book a table in the game and get a discount; the owner is reached on WhatsApp ----------
db.belle = db.belle && typeof db.belle === "object" ? db.belle : {}; const BEL = db.belle;
BEL.cfg = Object.assign({ name: "Belle's Kitchen", whatsapp: "23055165327", show: "+230 5516 5327", pct: 15, from: 12, to: 22, cap: 6, maxSize: 8, maxActive: 3 }, BEL.cfg && typeof BEL.cfg === "object" ? BEL.cfg : {}); BEL.bk = dict(BEL.bk); BEL.ann = BEL.ann || 0;
const BL_ACTIVE = ["booked", "confirmed"];
const blClean = (v, n) => String(v || "").replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const blView = (b) => ({ code: b.code, date: b.date, hour: b.hour, size: b.size, status: b.status, note: b.note || "", reply: b.reply || "", created: b.created });
function blPerk(uid) { const now = Date.now(); let best = 0; for (const b of Object.values(BEL.bk)) { if (b.uid !== uid || !BL_ACTIVE.includes(b.status)) continue; const st = slotAt(b.date, b.hour); if (now >= st - 30 * 60000 && now < st + 2 * 3600000) best = Math.max(best, st + 2 * 3600000); } return best ? { pct: BEL.cfg.pct, until: best } : null; } // the booked-guest discount: from half an hour before your table until two hours after
function blTaken(ds, h) { return Object.values(BEL.bk).filter((b) => b.date === ds && b.hour === h && BL_ACTIVE.includes(b.status)).length; }
function belleWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "belle", rid: m.rid }, o)), c = BEL.cfg, now = Date.now(); if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." });
  if (m.t === "belle.get") { const days = []; for (let i = 0; i < 7; i++) { const ds = mvDate(now + i * 86400000), slots = {}; for (let h = c.from; h < c.to; h++) { if (slotAt(ds, h) < now + 30 * 60000) continue; slots[h] = Math.max(0, c.cap - blTaken(ds, h)); } days.push({ date: ds, dow: mvDow(ds), slots }); } return reply({ ok: true, days, pct: c.pct, wa: c.whatsapp, show: c.show, maxSize: c.maxSize, perk: blPerk(me.uid) }); }
  if (m.t === "belle.mine") return reply({ ok: true, wa: c.whatsapp, show: c.show, pct: c.pct, perk: blPerk(me.uid), list: Object.values(BEL.bk).filter((b) => b.uid === me.uid).sort((a, b) => b.created - a.created).slice(0, 12).map(blView) });
  if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  if (m.t === "belle.book") { const ds = String(m.date || ""), h = Math.round(Number(m.hour)), size = Math.round(Number(m.size)); if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return reply({ ok: false, error: "Pick a day." });
    if (!(h >= c.from && h < c.to)) return reply({ ok: false, error: "We take bookings from " + c.from + ":00 to " + c.to + ":00." }); if (!(size >= 1 && size <= c.maxSize)) return reply({ ok: false, error: "Tables seat 1 to " + c.maxSize + " people." });
    if (slotAt(ds, h) < now + 30 * 60000 || slotAt(ds, h) > now + 8 * 86400000) return reply({ ok: false, error: "Pick a time in the next 7 days." });
    const mine = Object.values(BEL.bk).filter((b) => b.uid === me.uid && BL_ACTIVE.includes(b.status)); if (mine.length >= c.maxActive) return reply({ ok: false, error: "You already have " + c.maxActive + " bookings. Cancel one first." }); if (mine.some((b) => b.date === ds && b.hour === h)) return reply({ ok: false, error: "You already booked that time." });
    if (blTaken(ds, h) >= c.cap) return reply({ ok: false, error: "That hour is full. Try another time." });
    let code = ""; do { code = "BK-" + crypto.randomBytes(2).toString("hex").toUpperCase(); } while (BEL.bk[code]); const nm = nameOfSrv(me.uid);
    BEL.bk[code] = { code, uid: me.uid, name: nm, date: ds, hour: h, size, note: blClean(m.note, 100), status: "booked", created: now };
    persist(); return reply({ ok: true, booking: blView(BEL.bk[code]), wa: c.whatsapp, show: c.show, pct: c.pct }); }
  if (m.t === "belle.cancel") { const b = BEL.bk[String(m.code || "")]; if (!b || b.uid !== me.uid) return reply({ ok: false, error: "No such booking." }); if (!BL_ACTIVE.includes(b.status)) return reply({ ok: false, error: "That booking is already closed." }); b.status = "cancelled"; persist(); return reply({ ok: true, booking: blView(b) }); }
  reply({ ok: false, error: "Unknown request." });
}
function belleAnnounce() { // once, as a message from Belle's Kitchen in everyone's Messages (never in public chat)
  if (BEL.dm) return; BEL.dm = Date.now();
  bizPost("belle", "🍛 Belle's Kitchen is open in Flic en Flac! African food with a luxury touch: jollof, egusi, grilled fish and more. 50% off your first jollof or fried rice, " + BEL.cfg.pct + "% off when you book a table at the host stand, or message Belle on WhatsApp " + BEL.cfg.show + "."); }
setTimeout(() => { try { belleAnnounce(); } catch (e) { console.warn("belleAnnounce", e.message); } }, 20000);
// ---------- A* Cutz: a modern barber shop in Tamarin. Book from the game for Rs 100 off and a medal; message the shop on WhatsApp ----------
const CUTZ_SERVICES = [["cut", "Normal haircut", 400], ["cutenh", "Haircut + enhancements", 500], ["cutbeard", "Haircut + beard", 500], ["cutall", "Haircut + beard + enhancements", 600], ["line", "Line up", 200], ["lineenh", "Line up + enhancements", 300]];
db.cutz = db.cutz && typeof db.cutz === "object" ? db.cutz : {}; const CZ = db.cutz;
CZ.cfg = Object.assign({ name: "A* Cutz", whatsapp: "23058493970", show: "+230 5849 3970", alt: "+255 789 052 899", disc: 100, from: 9, to: 19, cap: 2, maxActive: 3 }, CZ.cfg && typeof CZ.cfg === "object" ? CZ.cfg : {}); CZ.bk = dict(CZ.bk); CZ.ann = CZ.ann || 0;
const czView = (b) => ({ code: b.code, date: b.date, hour: b.hour, svc: b.svc, svcName: b.svcName, price: b.price, status: b.status, reply: b.reply || "", created: b.created });
function czPerk(uid) { const now = Date.now(); let best = 0; for (const b of Object.values(CZ.bk)) { if (b.uid !== uid || !BL_ACTIVE.includes(b.status)) continue; const st = slotAt(b.date, b.hour); if (now >= st - 30 * 60000 && now < st + 2 * 3600000) best = Math.max(best, st + 2 * 3600000); } return best ? { disc: CZ.cfg.disc, until: best } : null; }
const czTaken = (ds, h) => Object.values(CZ.bk).filter((b) => b.date === ds && b.hour === h && BL_ACTIVE.includes(b.status)).length;
function cutzWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "cutz", rid: m.rid }, o)), c = CZ.cfg, now = Date.now(); if (!me.uid || !db.players[me.uid]) return reply({ ok: false, error: "Play a little first." });
  const info = { wa: c.whatsapp, show: c.show, alt: c.alt, disc: c.disc };
  if (m.t === "cutz.get") { const days = []; for (let i = 0; i < 7; i++) { const ds = mvDate(now + i * 86400000), slots = {}; for (let h = c.from; h < c.to; h++) { if (slotAt(ds, h) < now + 30 * 60000) continue; slots[h] = Math.max(0, c.cap - czTaken(ds, h)); } days.push({ date: ds, slots }); } return reply(Object.assign({ ok: true, days, services: CUTZ_SERVICES.map((q) => ({ id: q[0], name: q[1], price: q[2] })), perk: czPerk(me.uid) }, info)); }
  if (m.t === "cutz.mine") return reply(Object.assign({ ok: true, perk: czPerk(me.uid), list: Object.values(CZ.bk).filter((b) => b.uid === me.uid).sort((a, b) => b.created - a.created).slice(0, 12).map(czView) }, info));
  if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  if (m.t === "cutz.book") { const ds = String(m.date || ""), h = Math.round(Number(m.hour)), sv = CUTZ_SERVICES.find((q) => q[0] === String(m.svc || "")); if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return reply({ ok: false, error: "Pick a day." }); if (!sv) return reply({ ok: false, error: "Pick a service." });
    if (!(h >= c.from && h < c.to)) return reply({ ok: false, error: "We take bookings from " + c.from + ":00 to " + c.to + ":00." }); if (slotAt(ds, h) < now + 30 * 60000 || slotAt(ds, h) > now + 8 * 86400000) return reply({ ok: false, error: "Pick a time in the next 7 days." });
    const mine = Object.values(CZ.bk).filter((b) => b.uid === me.uid && BL_ACTIVE.includes(b.status)); if (mine.length >= c.maxActive) return reply({ ok: false, error: "You already have " + c.maxActive + " bookings. Cancel one first." }); if (mine.some((b) => b.date === ds && b.hour === h)) return reply({ ok: false, error: "You already booked that time." }); if (czTaken(ds, h) >= c.cap) return reply({ ok: false, error: "That hour is full. Try another time." });
    let code = ""; do { code = "CZ-" + crypto.randomBytes(2).toString("hex").toUpperCase(); } while (CZ.bk[code]); const nm = nameOfSrv(me.uid); const first = !Object.values(CZ.bk).some((b) => b.uid === me.uid);
    CZ.bk[code] = { code, uid: me.uid, name: nm, date: ds, hour: h, svc: sv[0], svcName: sv[1], price: sv[2], status: "booked", created: now }; townSys("✂️ A* Cutz", nm + " just booked a cut at A* Cutz in Tamarin! Book from the game for Rs " + c.disc + " off and a medal."); persist(); return reply(Object.assign({ ok: true, booking: czView(CZ.bk[code]), first }, info)); }
  if (m.t === "cutz.cancel") { const b = CZ.bk[String(m.code || "")]; if (!b || b.uid !== me.uid) return reply({ ok: false, error: "No such booking." }); if (!BL_ACTIVE.includes(b.status)) return reply({ ok: false, error: "That booking is already closed." }); b.status = "cancelled"; persist(); return reply({ ok: true, booking: czView(b) }); }
  reply({ ok: false, error: "Unknown request." });
}
function cutzAnnounce() { if (CZ.dm) return; CZ.dm = Date.now(); bizPost("cutz", "✂️ A* Cutz is open in Tamarin! A cool, modern barber shop: cuts from Rs 400, line ups from Rs 200. Book from the game for Rs " + CZ.cfg.disc + " off and a medal, or message us on WhatsApp " + CZ.cfg.show + "."); } // once, in everyone's Messages
setTimeout(() => { try { cutzAnnounce(); } catch (e) { console.warn("cutzAnnounce", e.message); } }, 25000);
// ---------- business chats: each client business (Belle's Kitchen, A* Cutz) has its own chat in everyone's Messages. Announcements go there, never to public chat ----------
const BIZ = { belle: { name: "Belle's Kitchen", reply: () => "Thanks for your message! 🍛 To book a table, open the restaurant in the game and use the host stand for " + BEL.cfg.pct + "% off. For anything else, message Belle on WhatsApp " + BEL.cfg.show + "." }, hw: { name: "Halloween Night", reply: () => "Boo! 🎃 Open the Halloween app to see the candy leaderboard, pick a costume and start the ghost hunt. Knock on doors around town for candy!" }, cutz: { name: "A* Cutz", reply: () => "Thanks for your message! ✂️ Book a cut at the reception desk in the game for Rs " + CZ.cfg.disc + " off and a medal. For anything else, message us on WhatsApp " + CZ.cfg.show + "." } };
db.biz = db.biz && typeof db.biz === "object" ? db.biz : {}; db.biz.posts = Array.isArray(db.biz.posts) ? db.biz.posts.slice(-200) : [];
function bizPost(biz, text) { if (!BIZ[biz]) return null; const m = { id: crypto.randomBytes(6).toString("hex"), biz, text: String(text).replace(/\s+/g, " ").trim().slice(0, 300), at: Date.now() }; if (!m.text) return null; db.biz.posts.push(m); if (db.biz.posts.length > 200) db.biz.posts.splice(0, db.biz.posts.length - 200); for (const [, p] of peers) if (p.uid) send(p.ws, { t: "biz", m }); persist(); return m; } // to every player, online now or next login
function bizWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "biz", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet." });
  if (m.t === "biz.load") return reply({ ok: true, list: Object.keys(BIZ).map((id) => ({ id, name: BIZ[id].name })), m: db.biz.posts.slice(-100) });
  if (m.t === "biz.send") { const biz = String(m.biz || ""); if (!BIZ[biz]) return reply({ ok: false, error: "No such business." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    const text = String(m.text || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, 300); if (!text) return reply({ ok: false, error: "Write a message first." });
    const now = Date.now(); return reply({ ok: true, m: [{ id: crypto.randomBytes(6).toString("hex"), biz, from: "me", text, at: now }, { id: crypto.randomBytes(6).toString("hex"), biz, from: "biz", text: BIZ[biz].reply(), at: now + 1, auto: 1 }] }); }
  reply({ ok: false, error: "Unknown request." });
}
// ---------- Halloween Night: trick or treat for candy, a costume contest, and a ghost hunt at the Trianon ruins ----------
const HW_COSTUMES = ["vampire", "witch", "zombie", "pumpkin", "skeleton", "ghost"], HW_ORBS = 6, HW_NAMES = ["door"];
db.hw = db.hw && typeof db.hw === "object" ? db.hw : {}; const HW = db.hw;
HW.on = HW.on !== false; HW.from = Number.isFinite(HW.from) ? HW.from : Date.parse(process.env.HW_FROM || "2026-10-30T18:00:00+04:00"); HW.to = Number.isFinite(HW.to) ? HW.to : Date.parse(process.env.HW_TO || "2026-11-02T23:59:00+04:00"); if (HW.to === Date.parse("2026-11-02T06:00:00+04:00")) HW.to = Date.parse(process.env.HW_TO || "2026-11-02T23:59:00+04:00"); // the event now runs until the end of Monday 2 November, two days after Halloween (saved games that still had the old end time get the new one) HW.users = dict(HW.users); HW.entries = dict(HW.entries); HW.ann = HW.ann || 0; HW.paid = HW.paid || 0;
const hwActive = () => HW.on && Date.now() >= HW.from && Date.now() < HW.to;
const hwUser = (u) => HW.users[u] || (HW.users[u] = { candy: 0, knocks: {}, dayK: "", dayN: 0, orbs: [], hunted: 0, vote: "" });
const hwTop = (n) => Object.entries(HW.users).filter(([u, x]) => x.candy > 0 && db.players[u]).sort((a, b) => b[1].candy - a[1].candy).slice(0, n).map(([u, x]) => ({ uid: u, name: playerName(u), candy: x.candy }));
function hwView(uid) { const me = hwUser(uid), votes = {}; for (const u in HW.users) { const v = HW.users[u].vote; if (v && HW.entries[v]) votes[v] = (votes[v] | 0) + 1; }
  const ents = Object.entries(HW.entries).filter(([u]) => db.players[u]).map(([u, e]) => ({ uid: u, name: playerName(u), costume: e.costume, look: e.look, votes: votes[u] | 0, mine: u === uid })).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name)).slice(0, 16);
  return { ok: true, active: hwActive(), from: HW.from, to: HW.to, now: Date.now(), paid: HW.paid, me: { candy: me.candy, orbs: me.orbs, hunted: me.hunted, vote: me.vote, entered: !!HW.entries[uid] }, top: hwTop(10), entries: ents }; }
function hwWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "hw", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet." }); const now = Date.now();
  if (m.t === "hw.get") return reply(hwView(me.uid));
  if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
  if (!hwActive()) return reply({ ok: false, error: "Halloween Night is over. See you next year! 👻" });
  const u = hwUser(me.uid);
  if (m.t === "hw.knock") { const door = String(m.door || "").toLowerCase(); if (!/^[a-z0-9_]{2,24}$/.test(door)) return reply({ ok: false, error: "Nobody lives there." }); const day = new Date().toISOString().slice(0, 10); if (u.dayK !== day) { u.dayK = day; u.dayN = 0; } if (u.dayN >= 60) return reply({ ok: false, error: "You have knocked on enough doors today. Come back tomorrow!" });
    const last = u.knocks[door] | 0; if (now - last < 20 * 60000) return reply({ ok: false, error: "They already gave you a treat. Try again in " + Math.ceil((20 * 60000 - (now - last)) / 60000) + " min." });
    u.knocks[door] = now; u.dayN++; if (Object.keys(u.knocks).length > 120) { const ks = Object.keys(u.knocks).sort((a, b) => u.knocks[a] - u.knocks[b]); for (const k of ks.slice(0, ks.length - 100)) delete u.knocks[k]; }
    const r = Math.random(); let kind = "treat", candy = 1 + Math.floor(Math.random() * 3); if (r < 0.18) { kind = "trick"; candy = 0; } else if (r > 0.9) { kind = "big"; candy = 6; } u.candy += candy; persist(); return reply({ ok: true, kind, candy, total: u.candy, door }); }
  if (m.t === "hw.orb") { const id = Math.round(Number(m.id)); if (!(id >= 0 && id < HW_ORBS)) return reply({ ok: false, error: "No such ghost." }); if (u.hunted) return reply({ ok: true, done: true, already: true, orbs: u.orbs, total: u.candy }); if (!u.orbs.includes(id)) u.orbs.push(id); let paid = 0, candy = 0; if (u.orbs.length >= HW_ORBS) { u.hunted = now; candy = 15; paid = 15000; u.candy += candy; mailTo(me.uid, paid, "Haunted ruins ghost hunt", "Halloween Night"); } persist(); return reply({ ok: true, orbs: u.orbs, done: !!u.hunted, candy, paid, total: u.candy }); }
  if (m.t === "hw.costume.enter") { const co = String(m.costume || ""); if (!HW_COSTUMES.includes(co)) return reply({ ok: false, error: "Pick a costume first." }); const L = m.look && typeof m.look === "object" ? m.look : {}, look = {}; for (const k of ["g", "skin", "hair", "hs", "shirt", "pants", "cap", "shades", "role", "shadesCol", "nails", "chain"]) { const v = L[k]; if (typeof v === "string" && v.length <= 12) look[k] = v; else if (typeof v === "boolean") look[k] = v; } HW.entries[me.uid] = { costume: co, look, at: HW.entries[me.uid] ? HW.entries[me.uid].at : now }; persist(); return reply(hwView(me.uid)); }
  if (m.t === "hw.vote") { const to = String(m.for || ""); if (!HW.entries[to] || !db.players[to]) return reply({ ok: false, error: "No such costume." }); if (to === me.uid) return reply({ ok: false, error: "You can't vote for yourself." }); if (u.vote) return reply({ ok: false, error: "You already voted." }); u.vote = to; persist(); return reply(hwView(me.uid)); }
  reply({ ok: false, error: "Unknown request." });
}
function hwTick() { // the start announcement, and the prizes when it ends
  const now = Date.now(); if (HW.on && now >= HW.from && now < HW.to && !HW.ann) { HW.ann = now; bizPost("hw", "🎃 Halloween Night is here! Knock on doors around town for candy, wear a spooky costume and enter the contest, and hunt the 6 ghosts at the old Trianon ruins. Open the Halloween app on your phone!"); }
  if (HW.on && now >= HW.to && !HW.paid) { HW.paid = now; const votes = {}; for (const u in HW.users) { const v = HW.users[u].vote; if (v && HW.entries[v]) votes[v] = (votes[v] | 0) + 1; } const win = Object.keys(votes).sort((a, b) => votes[b] - votes[a]).slice(0, 3), cp = hwTop(3), pz = [50000, 25000, 10000], cz = [30000, 15000, 5000]; let text = "👻 Halloween Night is over! ";
    win.forEach((u, i) => { mailTo(u, pz[i], "Halloween costume contest", "Halloween Night"); }); cp.forEach((c, i) => { mailTo(c.uid, cz[i], "Halloween candy leaderboard", "Halloween Night"); });
    if (win.length) text += "Best costume: " + win.map((u) => playerName(u)).join(", ") + ". "; if (cp.length) text += "Most candy: " + cp.map((c) => c.name + " (" + c.candy + ")").join(", ") + ". "; text += "Thanks for playing!"; bizPost("hw", text); persist(); }
}
setInterval(() => { try { hwTick(); } catch (e) { console.warn("hwTick", e.message); } }, 30000);
// ---------- The Halloween treasure hunt: five clues, a metal detector, and Rs 15,000,000 for the first player to dig up the chest. The places only exist here on the server ----------
const HUNT_STAGES = [ // x, y, how close you must be, and the clue that leads there (the clue for stage i is shown when stage i - 1 is done)
  { x: 10.5, y: 7.5, r: 2.2, name: "the coconut stand", clue: "👻 Clue 1: \"Where tourists sip from shells and palms lean toward the waves, a ghost buried the first key. Dig beside the stand that sells what falls from the trees.\"", hint: "Hint: it is on the beach, in the far north west, near the Dive Centre." },
  { x: 11, y: 42.5, r: 2.4, name: "Saxo Beach Club", clue: "🦇 Clue 2: \"The party starts when the sun goes down and ends when it comes back up. Walk the sand south until the music is loud, and dig at the club's front door.\"", hint: "Hint: follow the beach south. Saxo Beach Club is a dark building with a thatch roof." },
  { x: 81.5, y: 44.5, r: 2.4, name: "SSR Airport", clue: "✈️ Clue 3: \"Metal birds sleep behind this fence, waiting for those with deep pockets. Head east across town, and dig where the gate meets the road.\"", hint: "Hint: the airport sign is in the middle of town, east of the beach. Look for the private jets." },
  { x: 93, y: 27.3, r: 2.4, name: "the golden statue", clue: "👑 Clue 4: \"The richest of them all stands in gold, watching the casino lights. Stand before him and dig, but don't wake the ghosts.\"", hint: "Hint: the golden statue is on a marble plaza beside the Grand Casino, north east of the airport." },
  { x: 238.5, y: 145.5, r: 2.2, name: "the old sugar estate", clue: "💀 Clue 5 (the last!): \"Far beyond the highway, where cane once crushed and now the ghosts roam, the treasure lies among the broken stones. Find the sugar mould and dig.\"", hint: "Hint: take the highway to Trianon. The old sugar estate ruins are in the south west of Trianon, with six ghosts floating around. The treasure is in the middle." }
];
db.hunt = db.hunt && typeof db.hunt === "object" ? db.hunt : {}; const HUNT = db.hunt;
HUNT.on = HUNT.on !== false; HUNT.prize = HUNT.prize | 0 || 15000000; HUNT.players = dict(HUNT.players); HUNT.winner = HUNT.winner || null; HUNT.places = Array.isArray(HUNT.places) ? HUNT.places : (HUNT.winner ? [HUNT.winner] : []); HUNT.prizes = Array.isArray(HUNT.prizes) && HUNT.prizes.length === 3 ? HUNT.prizes.map((x) => x | 0) : [15000000, 5000000, 2500000]; HUNT.winner = HUNT.places[0] || null; const PLACE_WORD = ["1st", "2nd", "3rd"]; HUNT.log = Array.isArray(HUNT.log) ? HUNT.log.slice(-60) : []; HUNT.autoPay = HUNT.autoPay !== false; HUNT.ann = HUNT.ann || 0; HUNT.firsts = dict(HUNT.firsts); HUNT.lairN = HUNT.lairN | 0; HUNT.bestHp = Number(HUNT.bestHp) || 0;
const huntActive = () => HUNT.on && hwActive() && HUNT.places.length < 3; // it ends when all three places are taken
const huntUser = (u) => HUNT.players[u] || (HUNT.players[u] = { stage: 0, scans: 0, digs: 0, scanAt: 0, digAt: 0, miss: 0, day: "", dayN: 0 });
function huntPos(me) { // where a player really is: their last position, unless it jumped further than anyone can travel
  const pr = me.presence || {}, x = Number(pr.x), y = Number(pr.y); if (!Number.isFinite(x) || !Number.isFinite(y)) return null; const now = Date.now(), v = me.hv || (me.hv = { x, y, t: now }), dt = Math.max(0.2, (now - v.t) / 1000), d = Math.hypot(x - v.x, y - v.y);
  if (v.px === undefined || Math.hypot(x - v.px, y - v.py) > 1.5) { v.px = x; v.py = y; v.pt = now; } // how long they have stood still
  const settled = now - v.pt >= 2500; // a ride, a taxi or a flight can drop you far away: once you stand still for a moment there, it counts
  if (d > 30 * dt + 5 && !pr.jf && !pr.hl && !settled) return { x: v.x, y: v.y, bad: true }; v.x = x; v.y = y; v.t = now; return { x, y, bad: false, inside: !!pr.in }; }
function huntNews(text) { bizPost("hw", text); for (const [, pp] of peers) if (pp.uid) send(pp.ws, { t: "hunt", ev: "news", text }); } // tell everyone how the hunt is going: in the Halloween chat, and as a pop-up for those playing now (never says where anything is)
function huntLog(uid, what, extra) { HUNT.log.push(Object.assign({ at: Date.now(), uid, name: playerName(uid), what }, extra || {})); if (HUNT.log.length > 60) HUNT.log.splice(0, HUNT.log.length - 60); }
function huntView(uid) { const u = huntUser(uid), st = HUNT_STAGES[u.stage]; return { ok: true, active: huntActive(), on: HUNT.on, prize: HUNT.prize, total: HUNT_STAGES.length, winner: HUNT.winner ? { name: HUNT.winner.name, at: HUNT.winner.at } : null, places: HUNT.places.map((q, i) => ({ place: i + 1, name: q.name })), prizes: HUNT.prizes, me: { stage: u.stage, done: u.stage >= HUNT_STAGES.length, clue: st ? st.clue : "", hint: st && u.miss >= 3 ? st.hint : "", scans: u.scans, digs: u.digs, place: HUNT.places.findIndex((q) => q.uid === uid) + 1 }, boss: u.stage >= HUNT_STAGES.length }; }
function huntWs(ws, me, m) { // a mistake in here must never leave a player waiting for an answer that never comes
  try { huntWs2(ws, me, m); } catch (e) { console.warn("hunt", e && e.message); send(ws, { t: "hunt", rid: m.rid, ok: false, error: "Something went wrong on the server. Try again in a moment." }); }
}
function huntWs2(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "hunt", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet." }); const now = Date.now();
  if (m.t === "hunt.get") return reply(huntView(me.uid));
  if (!huntActive()) return reply({ ok: false, error: HUNT.places.length >= 3 ? "The treasure has been won! 1st " + HUNT.places[0].name + ", 2nd " + HUNT.places[1].name + ", 3rd " + HUNT.places[2].name + "." : "The treasure hunt is not on right now." });
  const u = huntUser(me.uid), st = HUNT_STAGES[u.stage]; if (m.t === "hunt.boss" || m.t.startsWith("hunt.fight")) return huntBoss(me, m, reply, u, now);
  if (!st) return reply({ ok: false, error: "You found every clue! Go and face Captain Citrouille at the old sugar estate." });
  const pos = huntPos(me); if (!pos) return reply({ ok: false, error: "Walk around first so I can see where you are." }); if (pos.bad) return reply({ ok: false, error: "You moved too fast. Walk there!" }); const d = Math.hypot(pos.x - st.x, pos.y - st.y), day = new Date().toISOString().slice(0, 10); if (u.day !== day) { u.day = day; u.dayN = 0; }
  if (m.t === "hunt.scan") { if (now - u.scanAt < 3000) return reply({ ok: false, error: "The metal detector is warming up..." }); if (u.dayN >= 600) return reply({ ok: false, error: "The detector's battery is flat. Try again tomorrow." }); u.scanAt = now; u.scans++; u.dayN++; const heat = d > 70 ? 0 : d > 35 ? 1 : d > 18 ? 2 : d > 9 ? 3 : d > 4 ? 4 : 5; persist(); return reply({ ok: true, heat, label: ["Freezing", "Cold", "Cool", "Warm", "Hot", "Burning"][heat] }); }
  if (m.t === "hunt.dig") { if (pos.inside) return reply({ ok: false, error: "You can't dig inside a building." }); if (now - u.digAt < 4000) return reply({ ok: false, error: "Wait a moment before digging again." }); if (u.dayN >= 600) return reply({ ok: false, error: "You are too tired to dig. Try again tomorrow." }); u.digAt = now; u.digs++; u.dayN++;
    if (d > st.r) { u.miss++; persist(); return reply({ ok: true, found: false, msg: u.miss >= 3 ? "Still nothing. " + st.hint : "Nothing here but dirt and worms.", hint: u.miss >= 3 ? st.hint : "" }); }
    u.stage++; u.miss = 0; const last = u.stage >= HUNT_STAGES.length; huntLog(me.uid, last ? "reached the chest" : "found stage " + u.stage, { x: Math.round(pos.x), y: Math.round(pos.y) });
    hwUser(me.uid).candy += 5; { const nm = playerName(me.uid), n = u.stage; try { if (last) { if (HUNT.lairN++ < 6) huntNews("🎃 " + nm + " has all 5 keys and is heading to fight Captain Citrouille for the Rs " + HUNT.prize.toLocaleString("en") + "! " + (HUNT.lairN === 1 ? "The first one there!" : "The race is on!")); } else if (!HUNT.firsts[n]) { HUNT.firsts[n] = nm; huntNews("🗝️ " + nm + " is the first to find key " + n + " of 5! " + (n >= 3 ? "The hunt is heating up." : "Who is next?")); } } catch (e) {} }
    if (!last) { persist(); return reply({ ok: true, found: true, stage: u.stage, total: HUNT_STAGES.length, spot: st.name, candy: 5, clue: HUNT_STAGES[u.stage].clue }); }
    if (HUNT.places.length >= 3) { persist(); return reply({ ok: true, found: true, stage: u.stage, total: HUNT_STAGES.length, spot: st.name, late: true, winner: HUNT.winner.name }); }
    persist(); return reply({ ok: true, found: true, stage: u.stage, total: HUNT_STAGES.length, spot: st.name, lair: true, candy: 5 }); } // the last dig wakes the boss: the prize goes to whoever beats him
  reply({ ok: false, error: "Unknown request." });
}
const BOSSIM = require("./bosssim");
const HUNT_LAIR = HUNT_STAGES[HUNT_STAGES.length - 1];
const HUNT_FIGHTS = new Map(); // a fight in progress, by player. The troops sent in are also saved with the hunt data (u.fight), so a server restart never costs a player their troops
function huntFightFinish(me, u, won, bossHp, now) { // a fight is over: either way the troops are spent. A win takes a place on the podium if one is free.
  u.fight = null; u.fightAt = now; u.fights = (u.fights | 0) + 1; HUNT_FIGHTS.delete(me.uid); huntLog(me.uid, won ? "beat the boss" : "lost to the boss", { left: bossHp });
  if (!won) { if (bossHp < BOSSIM.BOSS.hp * 0.25 && (!HUNT.bestHp || bossHp < HUNT.bestHp)) { HUNT.bestHp = bossHp; huntNews("⚔️ " + playerName(me.uid) + "'s troops took Captain Citrouille down to " + bossHp.toLocaleString("en") + " health, but he survived! Who can finish him?"); } persist(); return { won: false, sim: { bossHp, bossMax: BOSSIM.BOSS.hp } }; }
  hwUser(me.uid).candy += 50; if (HUNT.places.length >= 3 || HUNT.places.some((q) => q.uid === me.uid)) { persist(); return { won: true, late: true, candy: 50, sim: { bossHp: 0, bossMax: BOSSIM.BOSS.hp } }; } // somebody took the last place while you were fighting
  const pl = { uid: me.uid, name: playerName(me.uid), at: now, paid: 0 }; HUNT.places.push(pl); HUNT.winner = HUNT.places[0]; const place = HUNT.places.length; if (HUNT.autoPay) huntPay(); persist();
  return { won: true, place, prize: HUNT.prizes[place - 1], paid: !!pl.paid, candy: 50, sim: { bossHp: 0, bossMax: BOSSIM.BOSS.hp } };
}
function huntBoss(me, m, reply, u, now) { // the pumpkin king guards the chest: bring your trained troops to the lair
  if (u.stage < HUNT_STAGES.length) return reply({ ok: false, error: "Find all five keys first." });
  const pos = huntPos(me), here = !!pos && !pos.bad && Math.hypot(pos.x - HUNT_LAIR.x, pos.y - HUNT_LAIR.y) <= 14, army = raidSettle(me.uid, now), TL = raidTroopLv(me.uid);
  if (u.fight && !HUNT_FIGHTS.has(me.uid)) { for (const k of u.fight.keys || []) if (RAID.CREW[k]) army.have[k] = (army.have[k] | 0) + 1; u.fight = null; persist(); } // the server restarted in the middle of a fight: the troops come back
  if (u.fight && HUNT_FIGHTS.has(me.uid) && now - HUNT_FIGHTS.get(me.uid).at > 20 * 60000) { const F = HUNT_FIGHTS.get(me.uid); const r = huntFightFinish(me, u, false, Math.round(F.S.bh), now); } // left for twenty minutes: the fight is lost
  const fight = HUNT_FIGHTS.get(me.uid);
  if (m.t === "hunt.boss") return reply({ ok: true, boss: { name: BOSSIM.BOSS.name, hp: BOSSIM.BOSS.hp }, have: army.have, lv: TL, here, fighting: !!fight, defeated: HUNT.places.length >= 3 ? HUNT.places.map((q, i) => PLACE_WORD[i] + " " + q.name).join(", ") : "", places: HUNT.places.map((q, i) => ({ place: i + 1, name: q.name })), prizes: HUNT.prizes, mine: HUNT.places.findIndex((q) => q.uid === me.uid) + 1, wait: Math.max(0, Math.ceil(((u.fightAt || 0) + 15000 - now) / 1000)) });
  if (m.t === "hunt.fight.act") { // one round of a fight in progress: pick an ability (or none), and the next five seconds are played
    if (!fight) return reply({ ok: false, error: "There is no fight going on." }); const S = fight.S, rd = m.rd | 0; fight.at = now;
    if (S.last && rd === S.rd - 1) return reply({ ok: true, frames: S.last.frames, fight: BOSSIM.view(S), replay: true }); // the answer got lost on the way: you still show the old round, so play the latest round again
    if (rd !== S.rd) return reply({ ok: true, frames: [], fight: BOSSIM.view(S), stale: true });
    if (!allow(me)) return reply({ ok: false, error: "Slow down a little." });
    const frames = BOSSIM.round(S, String(m.ability || ""), Number(m.acc)), rep = { ok: true, frames, fight: BOSSIM.view(S) }; if (S.over) Object.assign(rep, huntFightFinish(me, u, S.won, Math.round(S.bh), now)); return reply(rep);
  }
  if (HUNT.places.length >= 3) return reply({ ok: false, error: "All three places are taken. Captain Citrouille has been beaten." }); if (HUNT.places.some((q) => q.uid === me.uid)) return reply({ ok: false, error: "You already took a place on the podium. Well done!" });
  if (m.t === "hunt.fight.start" && fight) return reply({ ok: true, fight: BOSSIM.view(fight.S), resumed: true }); // you left the fight and came back
  if (!pos) return reply({ ok: false, error: "Walk around first so I can see where you are." }); if (pos.bad) return reply({ ok: false, error: "You moved too fast. Walk there!" }); if (!here) return reply({ ok: false, error: "Captain Citrouille is at the old sugar estate in Trianon. Go to the ruins to fight him." });
  if (now - (u.fightAt || 0) < 15000) return reply({ ok: false, error: "Your troops are catching their breath..." });
  const keys = (Array.isArray(m.crew) ? m.crew : []).map(String).filter((k) => RAID.CREW[k]).slice(0, RAID.CREW_MAX); if (!keys.some((k) => k !== "driver")) return reply({ ok: false, error: "Send at least one fighter." });
  for (const k of Object.keys(RAID.CREW)) if (keys.filter((q) => q === k).length > (army.have[k] | 0)) return reply({ ok: false, error: "You don't have enough " + k + "s trained. Train troops in the Raids app." });
  for (const k of keys) army.have[k]--; u.fightAt = now; // the troops are spent, win or lose
  if (m.t === "hunt.fight.start") { u.fight = { keys, at: now }; const S = BOSSIM.start(keys, TL); HUNT_FIGHTS.set(me.uid, { S, at: now }); persist(); return reply({ ok: true, fight: BOSSIM.view(S), resumed: false }); }
  const sim = BOSSIM.simulate(keys, TL), fin = huntFightFinish(me, u, sim.won, sim.bossHp, now); return reply(Object.assign({ ok: true, sim }, fin, { sim })); // the old one-shot fight, for game versions from before the 3D battle
}
function huntPay() { // pay every place that has not been paid yet, each with its own prize
  HUNT.places.forEach((w, i) => { if (w.paid || !db.players[w.uid]) return; const prize = HUNT.prizes[i] | 0; let left = prize; while (left > 0) { const part = Math.min(left, 9500000); mailTo(w.uid, part, "Halloween treasure hunt " + PLACE_WORD[i] + " place", "Treasure hunt"); left -= part; } w.paid = Date.now();
    const medal = ["🥇", "🥈", "🥉"][i], rest = 3 - HUNT.places.length; bizPost("hw", medal + " " + w.name + " beat Captain Citrouille and won " + PLACE_WORD[i] + " place in the treasure hunt: Rs " + prize.toLocaleString("en") + "! " + (rest > 0 ? rest + " place" + (rest > 1 ? "s" : "") + " left, so keep going!" : "All three places are taken. Thanks to everyone who hunted."));
    townSys(medal + " Treasure hunt", w.name + " beat the Halloween boss and won " + PLACE_WORD[i] + " place: Rs " + prize.toLocaleString("en") + "!"); for (const [, pp] of peers) if (pp.uid) send(pp.ws, { t: "hunt", ev: "won", name: w.name, place: i + 1, left: rest, prize }); huntLog(w.uid, "was paid Rs " + prize + " for " + PLACE_WORD[i] + " place"); });
  persist(); }
setInterval(() => { try { if (HUNT.on && hwActive() && !HUNT.ann) { HUNT.ann = Date.now(); bizPost("hw", "🗺️ TREASURE HUNT: a chest worth Rs 15,000,000 is buried somewhere in Flic en Flac. Dodo will give you clues. Follow the five clues, then beat the Halloween boss with your troops. The first player to defeat him keeps it all! Open the Halloween app to start."); persist(); } } catch (e) { console.warn("hunt", e.message); } }, 30000);
function salonWs(ws, me, m) {
  const reply = (o) => send(ws, Object.assign({ t: "salon", rid: m.rid }, o)); const c = SAL.cfg, now = Date.now(), isOwner = sbUid(me, String(m.key || ""));
  if (!me.uid) return reply({ ok: false, error: "Not signed in yet." }); if (!c.open && !isOwner && !c.ownerUids.includes(me.uid) && !c.allow.includes(me.uid)) return reply({ ok: false, locked: true, error: "Not available yet." }); // invite only until the owner opens it
  if (isOwner && !c.ownerUids.includes(me.uid)) { c.ownerUids.push(me.uid); persist(); } // an owner key links this account to the salon
  if (m.t === "salon.get") { const avail = {}; for (let i = 0; i < 22; i++) { const ds = mvDate(now + i * 86400000); if (!c.days.includes(mvDow(ds))) continue; const taken = []; for (let h = c.from; h < c.to; h++) if (sbTaken(ds, h)) taken.push(h); avail[ds] = taken; } const mineDays = Object.values(SAL.bk).filter((b) => b.uid === me.uid && SB_ACTIVE.includes(b.status)).map((b) => b.date); return reply({ ok: true, perm: 1, cfg: sbPub(), avail, mineDays, isOwner: !!(me.uid && c.ownerUids.includes(me.uid)), today: mvDate() }); }
  if (m.t === "salon.track") { const ev = String(m.ev || ""); if (SB_EVENTS.includes(ev) && allow(me)) sbTrack(me.uid, ev); return reply({ ok: true }); }
  if (m.t === "salon.mine") return reply({ ok: true, wa: c.whatsapp, list: Object.values(SAL.bk).filter((b) => b.uid === me.uid).sort((a, b) => b.created - a.created).slice(0, 15).map((b) => sbView(b, true)) });
  if (m.t === "salon.book") { if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); const ds = String(m.date || ""), h = Math.round(Number(m.hour)), svc = sbOrder(String(m.svc || ""), m.adds), size = Math.max(1, Math.min(20, Math.round(Number(m.size)) || 1)), contact = m.contact === "wa" ? "wa" : "game", phone = String(m.phone || "").replace(/[^0-9+]/g, "").slice(0, 16), why = sbSlotOk(ds, h);
    if (why) return reply({ ok: false, error: why }); if (!svc) return reply({ ok: false, error: "Pick a set from the menu and check your extras." }); if (contact === "wa" && phone.replace(/\D/g, "").length < 7) return reply({ ok: false, error: "Add your WhatsApp number so Taps can reach you." });
    if (Object.values(SAL.bk).some((b) => b.uid === me.uid && b.date === ds && SB_ACTIVE.includes(b.status))) return reply({ ok: false, error: "You already have a booking that day. One per day, please." }); if (Object.values(SAL.bk).filter((b) => b.uid === me.uid && SB_ACTIVE.includes(b.status)).length >= 3) return reply({ ok: false, error: "You already have 3 upcoming bookings." });
    if (sbTaken(ds, h)) return reply({ ok: false, error: "Someone just took that slot. Pick another." });
    let code; do { code = "TAPS-" + Array.from({ length: 5 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[crypto.randomInt(31)]).join(""); } while (SAL.bk[code]);
    const first = !Object.values(SAL.bk).some((b) => b.uid === me.uid), pub = sbPub(), nm = playerName(me.uid); const b = { code, uid: me.uid, name: nm, date: ds, hour: h, svc: String(m.svc), adds: svc.adds, size, svcName: svc.name + (size > 1 ? " · group of " + size : ""), price: svc.price * size, saved: svc.saved * size, contact, phone: contact === "wa" ? phone : "", note: sbClean(m.note, 140), status: "pending", created: now, log: [], disc: svc.saved > 0 ? { saved: svc.saved * size } : null, reward: 0 };
    if (first && c.reward >= 1) { b.reward = c.reward; mailTo(me.uid, c.reward, "Booked Clawed by Taps", "Clawed by Taps"); } SAL.bk[code] = b; persist();
    townSys("💅 Clawed by Taps", nm + " just booked a real nail appointment with Taps! Book yours in the Clawed by Taps app."); sbTellOwners({ t: "salon", ev: "new", code, name: nm, date: ds, hour: h }); return reply({ ok: true, b: sbView(b, true), wa: c.whatsapp }); }
  if (m.t === "salon.cancel" || m.t === "salon.say") { const b = SAL.bk[String(m.code || "")]; if (!b) return reply({ ok: false, error: "No such booking." }); const mineB = b.uid === me.uid; if (!mineB && !isOwner) return reply({ ok: false, error: "That is not your booking." });
    if (m.t === "salon.cancel") { if (!mineB || !SB_ACTIVE.includes(b.status)) return reply({ ok: false, error: "You can't cancel that." }); b.status = "cancelled"; persist(); sbTellOwners({ t: "salon", ev: "cancel", code: b.code, name: b.name }); return reply({ ok: true, b: sbView(b, true) }); }
    const text = sbClean(m.text, 200); if (!text) return reply({ ok: false, error: "Type a message." }); if (!allow(me)) return reply({ ok: false, error: "Slow down a little." }); b.log = b.log || []; b.log.push({ from: mineB ? "you" : "owner", text, t: now }); if (b.log.length > 60) b.log.shift(); persist();
    if (mineB) sbTellOwners({ t: "salon", ev: "msg", code: b.code, name: b.name, text }); else tellUid(b.uid, { t: "salon", ev: "msg", code: b.code, text, from: c.owner }); return reply({ ok: true, b: sbView(b, mineB ? true : "owner") }); }
  if (m.t.startsWith("salon.owner")) { if (!isOwner) return reply({ ok: false, error: "That screen is only for the salon owner." });
    if (m.t === "salon.owner") { const list = Object.values(SAL.bk).filter((b) => SB_ACTIVE.includes(b.status) || now - b.created < 14 * 86400000).sort((a, b) => slotAt(a.date, a.hour) - slotAt(b.date, b.hour)).slice(-120).map((b) => sbView(b, "owner")); return reply({ ok: true, list, stats: sbStats(), wa: c.whatsapp, cfg: sbPub(), today: mvDate() }); }
    if (m.t === "salon.owner.act") { const b = SAL.bk[String(m.code || "")], act = String(m.act || ""); if (!b) return reply({ ok: false, error: "No such booking." }); let say = "";
      if (act === "accept" && b.status === "pending") { b.status = "confirmed"; say = "Taps confirmed your booking " + b.code + " for " + b.date + " at " + String(b.hour).padStart(2, "0") + ":00."; } else if (act === "decline" && SB_ACTIVE.includes(b.status)) { b.status = "declined"; say = "Taps can't do your booking " + b.code + ". Pick another time."; } else if (act === "done" && SB_ACTIVE.includes(b.status)) b.status = "done"; else if (act === "noshow" && SB_ACTIVE.includes(b.status)) b.status = "noshow";
      else if (act === "move" && SB_ACTIVE.includes(b.status)) { const ds = String(m.date || ""), h = Math.round(Number(m.hour)), why = sbSlotOk(ds, h); if (why) return reply({ ok: false, error: why }); if (sbTaken(ds, h, b.code)) return reply({ ok: false, error: "That slot is taken." }); if (Object.values(SAL.bk).some((q) => q.uid === b.uid && q.date === ds && SB_ACTIVE.includes(q.status) && q.code !== b.code)) return reply({ ok: false, error: "That customer already has a booking that day." }); b.date = ds; b.hour = h; b.status = "confirmed"; b.moved = true; say = "Taps moved your booking " + b.code + " to " + ds + " at " + String(h).padStart(2, "0") + ":00."; } else return reply({ ok: false, error: "That doesn't apply to this booking." });
      if (say) { b.log = b.log || []; b.log.push({ from: "owner", text: say, t: now, sys: 1 }); tellUid(b.uid, { t: "salon", ev: "upd", code: b.code, status: b.status, text: say }); } persist(); return reply({ ok: true, b: sbView(b, "owner"), stats: sbStats() }); } }
  reply({ ok: false, error: "Unknown request." });
}
const RICH_MS = Math.max(1000, +process.env.RICH_CHECK_MS || 30000); setInterval(richCheck, RICH_MS); setTimeout(richCheck, Math.min(5000, RICH_MS)); // how often the crown is checked (shorter when testing)

function fashionStatus(uid) { // what a player sees
  const now = Date.now(), cur = fashionRoll(now), F = db.fashion, counts = {}; for (const v of Object.values(F.votes)) counts[v] = (counts[v] || 0) + 1;
  const players = Object.entries(F.entries).map(([id, e]) => ({ id, name: e.name, look: e.look, votes: counts[id] || 0, mine: e.uid === uid, at: e.at })).sort((a, b) => a.at - b.at);
  return { ok: true, now, start: cur.start, end: cur.end, live: now >= cur.start && now < cur.end, players, npcVotes: FASHION_NPC.map((_, i) => counts["n" + i] || 0), myVote: F.votes[uid] || "", mine: players.some((x) => x.mine), last: F.last, prizes: SHOW_PRIZES, favourite: SHOW_FAVOURITE, voter: SHOW_VOTER, full: players.length >= SHOW_MAX };
}
function fashion(ws, me, m) { // enter a look, or vote
  const reply = (o) => send(ws, Object.assign({ t: "fashion", rid: m.rid }, o)); if (!me.uid) return reply({ ok: false, error: "Not signed in yet. Try again in a moment." }); const now = Date.now(), cur = fashionRoll(now), F = db.fashion;
  if (m.t === "fashion.status") return reply(fashionStatus(me.uid));
  if (m.t === "fashion.enter") { if (now >= cur.start) return reply(Object.assign(fashionStatus(me.uid), { ok: false, error: "Entries closed when the show started. Enter early next week!" })); const id = "p_" + me.uid; if (!F.entries[id] && Object.keys(F.entries).length >= SHOW_MAX) return reply(Object.assign(fashionStatus(me.uid), { ok: false, error: "The runway is full this week. Be early next Saturday!" }));
    const doc = db.players[me.uid] || {}; F.entries[id] = { uid: me.uid, name: cleanName(doc.name || (me.presence || {}).name) || "Player", look: cleanLook(m.look), at: (F.entries[id] || {}).at || now }; persist(); return reply(fashionStatus(me.uid)); }
  if (m.t === "fashion.vote") { if (!(now >= cur.start && now < cur.end)) return reply(Object.assign(fashionStatus(me.uid), { ok: false, error: now < cur.start ? "Voting opens when the show starts." : "Voting has closed." })); const id = String(m.id || "");
    if (!(F.entries[id] || /^n[0-7]$/.test(id))) return reply(Object.assign(fashionStatus(me.uid), { ok: false, error: "That look isn't in the show." })); if (id === "p_" + me.uid) return reply(Object.assign(fashionStatus(me.uid), { ok: false, error: "You can't vote for yourself 😄" }));
    F.votes[me.uid] = id; persist(); return reply(fashionStatus(me.uid)); }
}
function broadcastPeers() { const list = roomList(), total = playedCount(); for (const [, p] of peers) send(p.ws, { t: "peers", peers: list, total }); } // tell every tab who is here
setInterval(() => { const now = Date.now(); for (const [id, p] of peers) if (p.away && now - p.away > AWAY_MS) { peers.delete(id); peersDirty = true; } }, 15000); // away too long: they have really gone
setInterval(() => { for (const [, p] of peers) { if (!p.ws || p.away) continue; if (p.alive === false) { try { p.ws.terminate(); } catch (e) {} continue; } p.alive = false; try { p.ws.ping(); } catch (e) {} } }, 25000); // a heartbeat: sockets that stop answering are closed (and their player turns "away")
setInterval(() => { if (peersDirty) { peersDirty = false; broadcastPeers(); } }, 100); // at most ~10 room updates a second

// read a whole collection as the game expects: [{ id, data }]
// What other players need from someone's saved game: how their home looks (to visit it) and how they look (for offline avatars). Their whole save stays on the server.
const slimCache = new Map(); // player id -> { sv: the save text, hv: home view, lk: look }
const sStr = (v, n) => (typeof v === "string" ? v.slice(0, n) : ""), sNum = (v) => (Number.isFinite(v) ? v : 0), sXY = (p) => (Array.isArray(p) ? [sNum(p[0]), sNum(p[1])] : null);
function slimOf(id, d) {
  const sv = d && d.save; if (typeof sv !== "string" || !sv) return null; let c = slimCache.get(id); if (c && c.sv === sv) return c;
  let v = {}; try { v = JSON.parse(sv) || {}; } catch (e) {} const arr = (a, n, f) => (Array.isArray(a) ? a.slice(0, n).map(f) : []), obj = (o, f) => { const r = {}; if (o && typeof o === "object") for (const k of Object.keys(o).slice(0, 60)) r[sStr(k, 24)] = f(o[k]); return r; };
  c = { sv, hv: { home: sNum(v.home) | 0, tv: !!v.tv, king: !!v.king, bed: !!v.bed, wallK: sStr(v.wallK, 16), floorK: sStr(v.floorK, 16), decor: arr(v.decor, 80, (k) => sStr(k, 16)), decorXY: arr(v.decorXY, 80, sXY), decorRot: arr(v.decorRot, 80, sNum), pet: v.pet && typeof v.pet === "object" ? { k: sStr(v.pet.k, 12), name: sStr(v.pet.name, 14) } : null, petXY: sXY(v.petXY), petRot: sNum(v.petRot), fixXY: obj(v.fixXY, sXY), fixRot: obj(v.fixRot, sNum), accentK: sStr(v.accentK, 16), mood: sStr(v.mood, 12), decorCol: arr(v.decorCol, 80, (c) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : "")) },
    lk: { g: sStr(v.g, 1), skin: sStr(v.skin, 12), shirt: sStr(v.shirt, 12), pants: sStr(v.pants, 12), cap: sStr(v.cap, 24), shades: !!v.shades, role: sStr(v.role, 12), hs: sStr(v.hs, 16), hcol: sStr(v.hcol, 12), nails: sStr(v.nails, 12), head: sStr(v.head, 40), top: sStr(v.top, 40), legs: sStr(v.legs, 40), feet: sStr(v.feet, 40), bag: sStr(v.bag, 16), chain: sStr(v.chain, 12), shadesCol: sStr(v.shadesCol, 12) } };
  slimCache.set(id, c); return c;
}
const DIAG = []; function diag(kind, uid, info) { const d = db.players[uid] || {}; DIAG.push({ t: Date.now(), k: kind, u: uid, n: String(d.name || "").slice(0, 16), i: String(info || "").slice(0, 160) }); if (DIAG.length > 200) DIAG.shift(); console.warn("[save]", kind, uid, info || ""); } // odd save events, for the admin
function roundGuard(id, data, now) { // cash that lands on an exact round million after a big jump: the save was edited by hand
  const prev = db.players[id]; if (!prev || typeof prev.save !== "string" || typeof data.save !== "string") return;
  const a = prev.save.match(/"money":(\d+(?:\.\d+)?)/), b = data.save.match(/"money":(\d+(?:\.\d+)?)/); if (!a || !b) return; const was = +a[1], is = +b[1];
  if (is >= 10000000 && is - was >= 10000000 && is % 1000000 === 0) { const g = cgOf(id); g.edit = (g.edit || 0) + 1; g.editAt = now; g.editAmt = Math.round(is - was); diag("cash_edit", id, "cash jumped " + Math.round(was) + " to exactly " + Math.round(is)); }
}
function clockGuard(id, data, now) { // a business "last collected" in the future means the phone clock was moved forward to farm earnings: put it back and note it
  if (!data || typeof data.save !== "string" || data.save.indexOf('"biz"') < 0) return;
  const m = data.save.match(/"at":(\d{13})/g); if (!m || !m.some((x) => +x.slice(5) > now + 300000)) return; // cheap look first
  const v = JSON.parse(data.save), b = v && v.biz; if (!b || typeof b !== "object") return; let n = 0;
  for (const k of Object.keys(b)) if (b[k] && Number(b[k].at) > now + 300000) { b[k].at = now; n++; }
  if (!n) return; data.save = JSON.stringify(v); const g = cgOf(id); g.clock = (g.clock || 0) + 1; g.clockAt = now; diag("clock_ahead", id, n + " businesses had a collect time in the future, reset");
}
function ownDocSave(me, id, data, queued) { // a player's own saved game: stored at most about every 1.5 seconds (a burst is merged into the newest), and refused out loud if it is too big
  const now = Date.now(); if (!queued && !sizeOk(data, MAX_DOC)) { diag("too_big", id, "over " + MAX_DOC + " bytes"); return { ok: false, code: "too_big", error: "Your save is too big to store online." }; }
  if (!queued && now - (me.docAt || 0) < 1500) { me.docPending = data; if (!me.docTimer) me.docTimer = setTimeout(() => { me.docTimer = null; const d = me.docPending; me.docPending = null; if (d && !db.removed[id]) ownDocSave(me, id, d, true); }, 1600); return { ok: true, queued: 1 }; }
  if (!sizeOk(data, MAX_DOC)) { diag("too_big", id, "over " + MAX_DOC + " bytes"); return { ok: false, code: "too_big", error: "Your save is too big to store online." }; }
  const prev = db.players[id]; if (prev && typeof prev.name === "string" && data && typeof data.name === "string" && data.name !== prev.name && prev.name !== "Alex") { if ((db.nc[id] || 0) >= 1) data.name = prev.name; else db.nc[id] = 1; } // a name can be changed once
  if (prev && prev.savedAt && data.savedAt && prev.savedAt - data.savedAt > 300000) diag("older_save", id, "stored is " + Math.round((prev.savedAt - data.savedAt) / 60000) + " min newer than the one sent"); // a tab with old progress is saving over newer progress
  if (prev && Number(prev.money) > 100000 && Number(data.money) < Number(prev.money) * 0.5) diag("worth_dropped", id, "net worth " + Math.round(prev.money) + " to " + Math.round(data.money));
  try { clockGuard(id, data, now); } catch (e) {}
  try { roundGuard(id, data, now); } catch (e) {}
  db.players[id] = data; me.docAt = now; try { cheatCheck(id, data, now); } catch (e) {} try { assetTrack(id, data); } catch (e) {} persist(); fanout("players"); return { ok: true };
}
function docsOf(col, limit, where, forUid) {
  if (!PUBLIC_COLS.includes(col)) return [];           // never hand out login data
  let rows = Object.entries(db[col] || {}).map(([id, data]) => ({ id, data })); // every doc
  if (col === "players") rows = rows.map((r) => { if (r.id === forUid || !r.data || typeof r.data.save !== "string") return r; const c = slimOf(r.id, r.data), d = Object.assign({}, r.data); delete d.save; if (c) { d.hv = c.hv; d.lk = c.lk; } return { id: r.id, data: d }; }); // others get the slim view, you get your own whole save
  if (where) rows = rows.filter((r) => r.data && r.data[where.field] === where.value); // a simple field == value filter
  if (limit) rows = rows.slice(0, limit);               // cap the count
  return rows;
}
function pushSnap(ws, sub) { send(ws, { t: "snap", id: sub.subId, docs: docsOf(sub.col, sub.limit, sub.where, ws.fefUid || "") }); } // send a subscription its data
function fanout(col) { for (const [ws, list] of subs) for (const sub of list) if (sub.col === col) pushSnap(ws, sub); } // tell every watcher of this collection

wss.on("connection", (ws, req) => {
  const keep = keepIdentity(req); // who the recovery cookie says this browser is, if anyone
  const peerId = crypto.randomBytes(8).toString("hex");  // this tab's id
  peers.set(peerId, { ws, uid: "", presence: {}, tokens: RATE_CAP, last: Date.now(), alive: true }); // register it (presence + uid fill in later)
  ws.on("pong", () => { const p = peers.get(peerId); if (p) p.alive = true; }); // still there
  subs.set(ws, []);                                      // no db subscriptions yet
  peersDirty = true;                                     // the room changed
  const helloTimer = setTimeout(() => { const me = peers.get(peerId); if (me && !me.uid) ws.close(); }, 10000); // must say hello within 10 s

  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; } // ignore junk
    const me = peers.get(peerId); if (!me) return;        // gone already
    if (m.t === "hello") { // who this tab is: checked against its key, then welcomed (once per connection)
      if (me.uid) return; clearTimeout(helloTimer);
      let recovered = false; if (keep && !(UID_RE.test(String(m.uid || "")) && keyOk(String(m.uid), m.token))) { m = Object.assign({}, m, { uid: keep.uid, token: keep.token }); recovered = !!(db.players[keep.uid] || db.auth.bound[keep.uid]); } // this browser forgot who it is, but the cookie remembers
      const gone = db.removed[String(m.uid || "")]; if (gone && keyOk(String(m.uid), m.token)) { send(ws, { t: "removed", ban: !!gone.ban, reason: gone.reason || "" }); peers.delete(peerId); peersDirty = true; setTimeout(() => { try { ws.close(); } catch (e) {} }, 300); return; } // an admin deleted this character: tell the browser to start fresh (or that it is banned)
      const wasKnown = !!db.players[String(m.uid || "")]; me.uid = whoIs(m); ws.fefUid = me.uid; me.ipH = ipHash(req); try { const isNew = !wasKnown && !db.stats.users[me.uid]; statSeen(me.uid, m, isNew); if (isNew) inviteStart(me.uid, m.inv); sessStart(me.uid); me.sess = true; } catch (e) {} // stats: today, where from, and a visit starting
      for (const [id, p] of peers) if (p.away && p.uid === me.uid) { if (!Object.keys(me.presence).length) me.presence = p.presence; peers.delete(id); } peersDirty = true; // back from "away": take your old spot
      send(ws, { t: "welcome", peer: peerId, uid: me.uid, token: sign(me.uid), account: db.auth.names[me.uid] || "", news: db.news.slice(-25), chat: chatBacklog(me.uid), wall: wallFor(me.uid), rich: db.rich, gov: govPub(), flex: db.flex.slice(-30).reverse(), recovered }); return; // its id, key, login name and the latest gossip
    }
    if (!me.uid && m.rid && typeof m.t === "string" && (m.t.startsWith("hunt.") || m.t.startsWith("hw."))) { send(ws, { t: m.t.split(".")[0], rid: m.rid, ok: false, error: "Reconnecting to the server... try again in a moment." }); return; } // right after a reconnect: say so instead of staying silent
    if (!me.uid) return;                                  // nothing else until hello
    if (m.t === "team.load" || m.t === "team.send") { teamWs(me, m, (o) => send(ws, Object.assign({ t: "compete", rid: m.rid }, o))); return; }
    if (m.t === "ad.reward") { if (!allow(me)) return send(ws, { t: "compete", rid: m.rid, ok: false, error: "Slow down a little." }); adReward(me, m, (o) => send(ws, Object.assign({ t: "compete", rid: m.rid }, o))); return; }
    if (m.t === "ad.claim") { if (!allow(me)) return send(ws, { t: "compete", rid: m.rid, ok: false, error: "Slow down a little." }); adClaim(me, m, (o) => send(ws, Object.assign({ t: "compete", rid: m.rid }, o))); return; }
    if (m.t === "ad.ev") { if (allow(me)) adTrack(me, m); return; } // an ad was seen, opened or clicked
    if (m.t === "expose") { expose(me, m); return; }      // someone got caught
    if (m.t === "wall.post" || m.t === "wall.heart" || m.t === "wall.report" || m.t === "wall.delete") { wall(me, m); return; } // the Heart Wall
    if (m.t === "chat.send") { chatSend(me, m); return; }
    if (m.t === "chat.more") { // older messages: town chat, or your private chat with one player
      const w = String(m.with || ""), before = +m.before || Date.now(), list = !w ? db.chat.town : UID_RE.test(w) ? db.chat.dm[dmKey(me.uid, w)] || [] : [];
      const older = list.filter((c) => (c.at || 0) < before); send(ws, { t: "chat.more", rid: m.rid, ok: true, list: older.slice(-150), more: older.length > 150 }); return;
    }
    if (m.t === "fashion.status" || m.t === "fashion.enter" || m.t === "fashion.vote") { fashion(ws, me, m); return; } // the Fashion Show
    if (m.t === "reward.status" || m.t === "reward.claim") { if (!me.uid) { send(ws, { t: "reward", rid: m.rid, ok: false, error: "Not signed in yet. Try again in a moment." }); return; } send(ws, Object.assign({ t: "reward", rid: m.rid }, m.t === "reward.claim" ? rewardClaim(me.uid) : rewardStatus(me.uid))); return; } // the daily reward and invite stats
    if (m.t === "pay") { pay(ws, me, m); return; } // send another player money (with a line in your chat)  // a town or private message (stored)
    if (m.t === "account.register" || m.t === "account.login") { account(ws, me, m); return; } // logins
    if (m.t === "relay") { // a game message for one other player (football moves, chess moves, challenges)
      const to = String(m.to || ""), now = Date.now(); me.rt = Math.min(60, (me.rt == null ? 60 : me.rt) + (now - (me.rl || now)) / 1000 * 30); me.rl = now; // its own allowance: about 30 a second
      if (!UID_RE.test(to) || to === me.uid || me.rt < 1 || !sizeOk(m.d, 2048)) return; me.rt -= 1; // bad target, too fast or too big: dropped
      tellUid(to, { t: "relay", from: me.uid, d: m.d }); return; // passed straight on, never stored
    }
    if (m.t === "promo.get" || m.t === "promo.claim") { promo(ws, me, m); return; } // the community post
    if (typeof m.t === "string" && m.t.startsWith("biz.")) { bizWs(ws, me, m); return; } // business chats
    if (typeof m.t === "string" && m.t.startsWith("hw.")) { hwWs(ws, me, m); return; } // Halloween Night
    if (typeof m.t === "string" && m.t.startsWith("hunt.")) { huntWs(ws, me, m); return; } // the treasure hunt
    if (typeof m.t === "string" && m.t.startsWith("dis.")) { disWs(ws, me, m); return; } // storm cover and the relief fund
    if (typeof m.t === "string" && m.t.startsWith("cutz.")) { cutzWs(ws, me, m); return; } // A* Cutz barber shop
    if (typeof m.t === "string" && m.t.startsWith("poll.")) { pollWs(ws, me, m); return; } // polls
    if (typeof m.t === "string" && m.t.startsWith("trips.")) { tripsWs(ws, me, m); return; } // student driver trips (hidden until switched on)
    if (typeof m.t === "string" && m.t.startsWith("belle.")) { belleWs(ws, me, m); return; } // Belle's Kitchen
    if (typeof m.t === "string" && (m.t.startsWith("flex.") || m.t.startsWith("chal.") || m.t.startsWith("crew.") || m.t.startsWith("salon.") || m.t === "home.rate" || m.t === "home.top" || m.t.startsWith("design.") || m.t.startsWith("raid."))) { if (m.t.startsWith("salon.")) salonWs(ws, me, m); else competeWs(ws, me, m); return; } // competition: flex feed, challenges, crews, home ratings
    if (m.t === "feedback.add") { send(ws, Object.assign({ t: "feedback", rid: m.rid }, feedbackAdd(me, m))); return; } // a bug report or rating
    if (m.t === "build.say") { const now = Date.now(); if (now - (me.buildSay || 0) < 20000) { send(ws, { t: "build", rid: m.rid, ok: true }); return; } me.buildSay = now; const doc = db.players[me.uid] || {}, who = String(doc.name || "Someone").slice(0, 16), home = String(m.home || "a new home").replace(/[\u0000-\u001f<>]/g, "").slice(0, 40), where = String(m.where || "").replace(/[\u0000-\u001f<>]/g, "").slice(0, 40), dur = String(m.dur || "").replace(/[\u0000-\u001f<>]/g, "").slice(0, 24);
      townSys("🏗️ Builders", m.kind === "done" ? who + "'s new " + home + (where ? " in " + where : "") + " is finished! Go and take a look." : who + " has started building a " + home + (where ? " in " + where : "") + "! The builders say it will take " + (dur || "a while") + "."); send(ws, { t: "build", rid: m.rid, ok: true }); return; } // the town hears about new houses
    if (m.t === "ledger.add") { const n = ledgerAdd(me, m.rows); send(ws, { t: "ledger", rid: m.rid, ok: true, n }); return; } // money lines from a player
    if (typeof m.t === "string" && m.t.startsWith("gov.")) { govWs(ws, me, m); return; } // the government
    if (typeof m.t === "string" && m.t.startsWith("heist.")) { heistWs(ws, me, m); return; } // two-player heists
    if (typeof m.t === "string" && m.t.startsWith("wealth.")) { wealthWs(ws, me, m); return; } // the wealth ladder and the Patron shop
    if (typeof m.t === "string" && m.t.startsWith("party.")) { partyWs(ws, me, m); return; } // political parties
    if (typeof m.t === "string" && m.t.startsWith("parl.")) { parlWs(ws, me, m); return; } // parliament, bills, the cabinet and no-confidence
    if (typeof m.t === "string" && m.t.startsWith("case.")) { agentWs(ws, me, m); return; } // the Financial Crimes agent and the court
    if (typeof m.t === "string" && m.t.startsWith("shop.")) { shop(ws, me, m); return; } // snack shops and their student staff
    if (m.t === "home.claim" || m.t === "home.invites" || m.t === "home.invite" || m.t === "home.uninvite" || m.t === "home.party" || m.t === "home.view" || m.t === "home.live" || m.t === "home.liveInvite" || m.t === "home.liveAnswer" || m.t === "home.liveLeave") { homes(ws, me, m); return; } // homes and invites
    if (m.t === "presence") { if (sizeOk(m.patch, MAX_PRESENCE)) { // merge a small presence patch
      const rgx = REG.filterPatch(me.presence || {}, m.patch); if (rgx.refused) { m.patch = rgx.patch; send(ws, Object.assign({ t: "region.locked", back: { rg: m.patch.rg, ix: m.patch.ix, iy: m.patch.iy } }, REG.info(rgx.refused))); } // a locked region: the old place is put back
      me.presence = Object.assign(me.presence || {}, m.patch || {}); me.presence.uid = me.uid; // nobody can pose as another player
      const say = (m.patch || {}).say; if (say && typeof say.text === "string" && !say.to && !say.v && lastSay.get(me.uid) !== say.n) { lastSay.set(me.uid, say.n); chatSend(me, { text: say.text }); } // a town message from a game that has not updated yet: store it too, so everyone sees it
      const owner = roomOwner(me.presence); if (!canVisit(owner, me.uid)) { me.presence.in = ""; me.presence.ph = ""; send(ws, { t: "kicked", owner }); } // no invite: not allowed in
      peersDirty = true; } return; }
    if (m.t === "doc.set") { // only your own players/<uid>, nothing else
      const parts = String(m.path || "").split("/"), col = parts[0], id = parts[1]; // which document
      if (col === "players" && id && id === me.uid && !db.removed[id]) { const r = ownDocSave(me, id, m.data); send(ws, Object.assign({ t: "ack", rid: m.rid }, r.ok ? {} : { ok: false, code: r.code, error: r.error })); return; } // save your own record
      send(ws, { t: "ack", rid: m.rid }); return; // always ack so the client never hangs
    }
    if (m.t === "col.add") { // only valid mail (money transfers) may be added
      if (m.col === "mail" && allow(me) && sizeOk(m.data, MAX_MAIL) && validMail(m.data)) { const id = crypto.randomBytes(10).toString("hex"); db.mail[id] = cleanMail(m.data); pruneMail(); persist(); fanout("mail"); } // store a cleaned copy
      send(ws, { t: "ack", rid: m.rid }); return;
    }
    if (m.t === "doc.delete") { // you may only clear mail addressed to you
      if (m.col === "mail" && db.mail[m.id] && db.mail[m.id].to === me.uid && allow(me)) { delete db.mail[m.id]; persist(); fanout("mail"); } // remove your claimed transfer
      send(ws, { t: "ack", rid: m.rid }); return;
    }
    if (m.t === "sub") { const list = subs.get(ws); if (list && list.length < MAX_SUBS) { const sub = { subId: m.id, col: String(m.col || "").slice(0, 32), limit: Math.min(1000, +m.limit || 0), where: m.where || null }; list.push(sub); pushSnap(ws, sub); } return; } // watch a collection (capped)
    if (m.t === "unsub") { subs.set(ws, (subs.get(ws) || []).filter((s) => s.subId !== m.id)); return; } // stop watching
  });

  ws.on("close", () => { clearTimeout(helloTimer); subs.delete(ws); const p = peers.get(peerId); if (p && p.uid && p.sess) sessStop(p.uid); // the connection dropped (and the visit may be ending)
    if (p && p.uid && typeof (p.presence || {}).x === "number") { p.away = Date.now(); p.ws = null; } else peers.delete(peerId); peersDirty = true; }); // a player who was in town stays as "away" for a while; others just leave
  ws.on("error", () => {});                               // never crash on a socket error
});

(function townFromBackups() { // town chat used to keep only 120 lines: bring older lines back from the backups, once, so past days show again
  if (db.chatRecovered) return; let files = []; try { files = fs.readdirSync(BACKUP_DIR).filter((n) => /\.json$/.test(n)); } catch (e) { return; }
  const byId = new Map(db.chat.town.map((c) => [c.id, c]));
  for (const n of files) { try { const d = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, n), "utf8")); for (const c of ((d.chat || {}).town || [])) if (c && typeof c.id === "string" && !byId.has(c.id) && typeof c.text === "string") byId.set(c.id, c); } catch (e) {} }
  const before = db.chat.town.length; db.chat.town = [...byId.values()].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-TOWN_KEEP); db.chatRecovered = 1; persist();
  if (db.chat.town.length > before) console.log("Recovered " + (db.chat.town.length - before) + " older town chat lines from backups");
})();
server.listen(PORT, () => console.log("Mauritius Life running on http://localhost:" + PORT)); // go
assetSeed(); // build the business and investment history from the backups
(function mailSplit() { // mail still waiting that is bigger than the game accepts is cut into parts it does accept, so nothing sent earlier is thrown away
  let n = 0; for (const id of Object.keys(db.mail)) { const m = db.mail[id]; if (!m || !(m.amt > 9500000)) continue; let left = m.amt; delete db.mail[id]; for (let i = 0; left > 0; i++) { const part = Math.min(left, 9500000), nid = crypto.randomBytes(10).toString("hex"); db.mail[nid] = Object.assign({}, m, { amt: part, note: i ? "" : m.note }); if (i && db.mail[nid].item) delete db.mail[nid].item; left -= part; n++; } }
  if (n) { console.log("[mail] split big transfers into", n, "parts"); persist(); }
})();
