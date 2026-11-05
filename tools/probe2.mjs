// list every named or tagged feature (nodes and ways) within a radius of a point in the OSM extract
import { createOSMStream } from "osm-pbf-parser-node";
const [src, lon, lat, rad] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const KX = 111320 * Math.cos(lat * Math.PI / 180), KY = 110600, nodes = new Map(), out = [];
for await (const it of createOSMStream(src)) {
  if (it.type === "node") { nodes.set(it.id, [it.lon, it.lat]); const d = Math.hypot((it.lon - lon) * KX, (it.lat - lat) * KY); if (d < rad && it.tags && Object.keys(it.tags).length) out.push({ k: "node", d: Math.round(d), t: it.tags }); }
  else if (it.type === "way") { const t = it.tags || {}; if (!Object.keys(t).length) continue; const p = it.refs.map((i) => nodes.get(i)).filter(Boolean); if (!p.length) continue; const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length, d = Math.hypot((cx - lon) * KX, (cy - lat) * KY); if (d < rad) out.push({ k: "way", d: Math.round(d), n: p.length, t }); }
}
const keep = out.filter((o) => o.t.name || o.t.tourism || o.t.amenity || o.t.leisure || o.t["seamark:type"] || o.t.man_made || o.t.waterway || o.t.historic || o.t.shop);
keep.sort((a, b) => a.d - b.d);
for (const o of keep.slice(0, 120)) console.log(o.k, o.d + "m", JSON.stringify(Object.fromEntries(Object.entries(o.t).filter(([k]) => /^(name|amenity|tourism|leisure|shop|man_made|historic|building|seamark:type|waterway|description|cuisine|brand|operator)$/.test(k)))));
console.log("total", out.length);
