import { createOSMStream } from "osm-pbf-parser-node";
const nodes = new Map(); const re = /central market|bazar|bazaar|marché|market|government house|hôtel du gouvernement|hotel du gouvernement|jardin de la compagnie|champ de mars|theatre|theâtre|aapravasi|fort adelaide|citadel/i;
for await (const it of createOSMStream("osm/mauritius-261101.osm.pbf")) {
  if (it.type === "node") { nodes.set(it.id, [it.lon, it.lat]); if (it.tags && it.tags.name && re.test(it.tags.name) && it.lon > 57.485 && it.lon < 57.52 && it.lat > -20.175 && it.lat < -20.15) console.log("node", it.lon.toFixed(5), it.lat.toFixed(5), it.tags.name, it.tags.amenity || it.tags.tourism || it.tags.historic || ""); }
  else if (it.type === "way" && it.tags && it.tags.name && re.test(it.tags.name)) { const p = it.refs.map((i) => nodes.get(i)).filter(Boolean); if (!p.length) continue; const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length; if (cx > 57.485 && cx < 57.52 && cy > -20.175 && cy < -20.15) console.log("way", cx.toFixed(5), cy.toFixed(5), it.tags.name, it.tags.amenity || it.tags.tourism || it.tags.historic || it.tags.building || ""); }
}
