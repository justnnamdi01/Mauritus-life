// Island regions and the locks on them. The server decides who may stand where: the phone is never trusted.
// A player's position can say two things:
//   x, y    their place on the walkable map: rows from 232 down are Grand Baie, the rows above are Flic en Flac and the west.
//           The server works the region out from this itself, so a phone cannot claim the wrong one.
//   rg      the region the phone says it is in (only used when it sends no x, y)
//   ix, iy  their tile on the island map (150 m tiles, see public/island.json), when they travel on it
// If either points into a locked region, the server puts the old value back and tells the phone "region.locked".
"use strict";
const fs = require("fs");
const path = require("path");

const DEF = JSON.parse(fs.readFileSync(path.join(__dirname, "regions.json"), "utf8")).regions;
const ISL = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "island.json"), "utf8"));
const W = ISL.w, H = ISL.h;
const unrle = (a, n) => { const out = new Uint8Array(n); let i = 0; for (let k = 0; k < a.length; k += 2) { out.fill(a[k], i, i + a[k + 1]); i += a[k + 1]; } return out; };
const REGION_AT = unrle(ISL.region, W * H);
const BY_ID = Object.fromEntries(DEF.map((r) => [r.id, r]));
const DEFAULT_RG = "portlouis"; // the map every new player starts on: the capital, where the jobs are
const GB_ROW = 232; // the walkable map: rows from here down are Grand Baie (HO in public/index.html); its first tile row is GBY = 236
const loadMap = (id) => { try { const t = fs.readFileSync(path.join(__dirname, "public", id + "-map.js"), "utf8"); return JSON.parse(t.slice(t.indexOf("= {") + 2, t.lastIndexOf(";"))); } catch (e) { return null; } }; // a walkable map built from OpenStreetMap
// The island is one continuous strip of map, north to south, and the server lays it out exactly as the client does (see WREG in public/index.html): Grand Baie, the road, Port Louis, the road, Flic en Flac. Each map starts on the row where the one above ends.
const GBM = loadMap("grandbaie"), PLM = loadMap("portlouis"), FLM = loadMap("west"), RAM = loadMap("road-grandbaie-portlouis"), RBM = loadMap("road-portlouis-west");
const LAYOUT = []; { let y = GB_ROW + 4; for (const [id, M, kind] of [["grandbaie", GBM], ["road_grandbaie_portlouis", RAM, "road"], ["portlouis", PLM], ["road_portlouis_west", RBM, "road"], ["west", FLM]]) { if (!M) continue; LAYOUT.push({ id, M, kind, y0: y, block: LAYOUT.length ? y : GB_ROW }); y += M.h; } LAYOUT.END = y + 4; }
const STOPS = {}; for (const r of LAYOUT) STOPS[r.id] = { x: r.M.stop.x, y: r.y0 + r.M.stop.y }; // the bus stations: where to put someone back
if (!STOPS.grandbaie) STOPS.grandbaie = { x: 30.5, y: 260.5 };
const ROADMAPS = LAYOUT.filter((r) => r.kind === "road");
const walkRegion = (p) => { if (p.in) return ""; const y = Number(p.y); if (!(Number.isFinite(y) && p.x !== undefined)) return ""; if (y < GB_ROW || y >= LAYOUT.END) return "old"; for (let i = LAYOUT.length - 1; i >= 0; i--) if (y >= LAYOUT[i].block) return LAYOUT[i].id; return "old"; }; // rows above GB_ROW are the first game's old map: no region, never allowed // "" indoors or with no place

let db = null, persist = () => {}, onChange = () => {};
function init(theDb, persistFn, changed) { // call once the save has loaded
  db = theDb; persist = persistFn; onChange = changed || onChange;
  const st = db.regions && typeof db.regions === "object" ? db.regions : {}; db.regions = {};
  for (const r of DEF) { const s = st[r.id] || {}; db.regions[r.id] = { open: typeof s.open === "boolean" ? s.open : !!r.open, opensAt: Number(s.opensAt) || 0 }; }
  setInterval(tick, 30000).unref();
}
function isOpen(id, now) { // open now? (a set opening date opens it by itself)
  const s = db && db.regions[id]; if (!s) return false;
  return s.open || (s.opensAt > 0 && (now || Date.now()) >= s.opensAt);
}
function tick() { // a region whose opening date has passed becomes open for good
  let changed = false; for (const id in db.regions) { const s = db.regions[id]; if (!s.open && s.opensAt > 0 && Date.now() >= s.opensAt) { s.open = true; s.opensAt = 0; changed = true; } }
  if (changed) { persist(); onChange(); }
}
function regionAt(ix, iy) { // which region an island tile is in ("" off the map)
  const x = Math.floor(ix), y = Math.floor(iy); if (!(x >= 0 && y >= 0 && x < W && y < H)) return ""; return ISL.regions[REGION_AT[y * W + x]] || "";
}
function list() { // what every phone may know
  return DEF.map((r) => ({ id: r.id, name: r.name, color: r.color, map: r.map || "", open: isOpen(r.id), opensAt: db.regions[r.id].opensAt || 0 }));
}
function spawn() { // somewhere safe: the first seed of the first open region
  const r = (isOpen(DEFAULT_RG) && STOPS[DEFAULT_RG] ? BY_ID[DEFAULT_RG] : null) || DEF.find((q) => isOpen(q.id) && STOPS[q.id]) || BY_ID[DEFAULT_RG], [lo, la] = r.seeds[0]; // an open region that has a walkable map
  const rg = STOPS[r.id] ? r.id : "grandbaie"; return { rg, x: STOPS[rg].x, y: STOPS[rg].y, ix: (lo - ISL.lon0) * ISL.kx / ISL.tileM, iy: (ISL.lat0 - la) * ISL.ky / ISL.tileM };
}
function roadOpen(id) { const r = ROADMAPS.find((q) => q.id === id); return !!r && isOpen(r.M.a) && isOpen(r.M.b); }
function portalOk(prev, next) { // a move from one region to another is allowed only between two maps that touch, close to the line where they join (a fast vehicle covers several tiles between two position updates)
  const px = Number(prev && prev.x), py = Number(prev && prev.y), nx = Number(next && next.x), ny = Number(next && next.y); if (![px, py, nx, ny].every(Number.isFinite)) return false;
  const a = LAYOUT.findIndex((r) => r.id === walkRegion({ x: px, y: py })), b = LAYOUT.findIndex((r) => r.id === walkRegion({ x: nx, y: ny })); if (a < 0 || b < 0 || Math.abs(a - b) !== 1) return false;
  const line = LAYOUT[Math.max(a, b)].block; return Math.abs(py - line) < 14 && Math.abs(ny - line) < 14 && Math.hypot(nx - px, ny - py) < 24;
}
function placeOk(p) { // is a presence somewhere it is allowed to be? returns "" or the locked region's id
  const rg = walkRegion(p) || (p.rg === undefined || p.rg === "" ? DEFAULT_RG : String(p.rg)); // where they stand decides, not what the phone says
  if (rg.startsWith("road_")) return roadOpen(rg) ? "" : rg; // a highway is open when both its towns are
  if (!BY_ID[rg] || !isOpen(rg)) return BY_ID[rg] ? rg : "?";
  if (p.ix !== undefined || p.iy !== undefined) { const ix = Number(p.ix), iy = Number(p.iy), at = regionAt(ix, iy); if (!Number.isFinite(ix) || !Number.isFinite(iy) || !at) return "?"; if (!isOpen(at)) return at; }
  return "";
}
// Check a presence patch before it is merged. `prev` is the player's presence as it was. Returns the patch to merge
// (with any locked fields put back) and the id of the region that was refused, if any.
function filterPatch(prev, patch) {
  if (!patch || typeof patch !== "object") return { patch, refused: "" };
  const KEYS = ["rg", "ix", "iy", "x", "y"]; if (!KEYS.some((k) => k in patch)) return { patch, refused: "" };
  const next = Object.assign({}, prev, patch), bad = placeOk(next); if (!bad) return { patch, refused: "" };
  const fixed = Object.assign({}, patch), back = placeOk(prev || {}) ? spawn() : { rg: prev.rg, ix: prev.ix, iy: prev.iy, x: prev.x, y: prev.y }; // put the last good place back (or a safe spawn)
  for (const k of KEYS) if (k in patch || back[k] !== undefined) { if (back[k] === undefined) delete fixed[k]; else fixed[k] = back[k]; }
  return { patch: fixed, refused: bad };
}
function info(id) { const r = BY_ID[id]; return r ? { id, name: r.name, opensAt: db.regions[id].opensAt || 0 } : { id: "", name: "that place", opensAt: 0 }; }
// The admin card: open or close a region, or set when it opens (ms since 1970, 0 for no date).
function adminSet(b) {
  const s = db.regions[String(b.id || "")]; if (!s) return { ok: false, error: "No such region." };
  if (b.open === false && STOPS[String(b.id)] && !DEF.some((q) => q.id !== b.id && STOPS[q.id] && isOpen(q.id))) return { ok: false, error: "Keep at least one region with a walkable map open: players need somewhere to stand." };
  if (b.open !== undefined) { s.open = b.open === true; if (s.open) s.opensAt = 0; }
  if (b.opensAt !== undefined) { const t = Number(b.opensAt) || 0; if (t && !(t > Date.now())) return { ok: false, error: "Pick an opening date in the future." }; s.opensAt = t; }
  persist(); onChange(); return { ok: true, regions: list() };
}
const regionOfPresence = (p) => walkRegion(p || {}); // which region a presence is standing in ("" indoors or with no place yet; "old" = the first game's unreachable rows)
module.exports = { portalOk, LAYOUT, regionOfPresence, STOPS, walkRegion, init, isOpen, regionAt, list, spawn, placeOk, filterPatch, info, adminSet, DEFAULT_RG };
