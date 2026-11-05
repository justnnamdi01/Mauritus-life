// find named features and the big roads/rails in Port Louis, with their lon/lat
import { createOSMStream } from "osm-pbf-parser-node";
const src = "osm/mauritius-261101.osm.pbf", nodes = new Map(), out = [];
const box = { x0: 57.485, x1: 57.52, y0: -20.175, y1: -20.148 };
const inb = (lo, la) => lo > box.x0 && lo < box.x1 && la > box.y0 && la < box.y1;
const want = /victoria|immigration|gare|place d.armes|government|central market|bazar|chinatown|odysseo|casino|bank|mcb|caudan|metro|terminal|bus|jardin|champ de mars|hotel de ville|theatre|cathedral|synagogue|mosque|post office|labourdonnais|la bourdonnais|baudin/i;
for await (const it of createOSMStream(src)) {
  if (it.type === "node") { nodes.set(it.id, [it.lon, it.lat]); if (inb(it.lon, it.lat) && it.tags && (it.tags.name || it.tags.railway || it.tags.public_transport) && (want.test(it.tags.name || "") || it.tags.railway || it.tags.public_transport)) out.push(["node", it.lon.toFixed(5), it.lat.toFixed(5), JSON.stringify(Object.fromEntries(Object.entries(it.tags).filter(([k]) => /^(name|railway|public_transport|amenity|tourism|highway|historic)$/.test(k))))]); }
  else if (it.type === "way") { const t = it.tags || {}; const p = it.refs.map((i) => nodes.get(i)).filter(Boolean); if (!p.length) continue; const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length; if (!inb(cx, cy)) continue;
    const big = /^(motorway|trunk|motorway_link|trunk_link)$/.test(t.highway || "") || t.railway || t.bridge || t.tunnel || (t.name && want.test(t.name));
    if (big) out.push(["way", cx.toFixed(5), cy.toFixed(5), JSON.stringify(Object.fromEntries(Object.entries(t).filter(([k]) => /^(name|highway|railway|bridge|tunnel|ref|lanes|oneway|amenity|tourism|building|historic|layer)$/.test(k)))), p.length + "pts " + p[0].map((v) => v.toFixed(4)).join(",") + " -> " + p[p.length - 1].map((v) => v.toFixed(4)).join(",")]); }
}
out.sort((a, b) => a[0].localeCompare(b[0]) || +a[1] - +b[1]);
for (const o of out.slice(0, 160)) console.log(o.join(" "));
console.log("total", out.length);
