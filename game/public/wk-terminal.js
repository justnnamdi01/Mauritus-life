"use strict";
// Victoria Urban Terminal: a polished hall with ticket booths and a departures board, a food court, benches with waiting travellers and their suitcases,
// two bus bays with real buses, conductors calling the stops, a hawker with a tray, and passengers who buy tickets, board, and get off.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, counter, chair, plant, bench, rope, clock, blk, staffLook, NOT_WORK, IS_WORK } = X;
  const BUS1 = { x: 19.0, y: 5.8 }, BUS2 = { x: 19.0, y: 10.4 }, DOOR1 = { x: 17.6, y: 7.2 }, DOOR2 = { x: 17.6, y: 11.8 };
  const bus = (gr, x, z, col) => { try { const bm = makeCar({ len: 2.6, col, bus: true }); R.dyn.remove(bm); bm.position.set(x, 0, z); bm.rotation.y = 0; bm.scale.set(1.75, 1.75, 1.75); gr.add(bm); return bm; } catch (e) { B(gr, 4.4, 1.7, 1.5, col, x, 1.0, z); return null; } };
  X.WK.terminal = {
    w: 24, h: 14, accent: "#3b4f63", mood: "cool", floor: ["#d8d9d6", "#c6c8c5"],
    floorAt: (x, y) => (x >= 15.5 ? ["#9aa0a5", "#8f959a"] : ["#d8d9d6", "#c6c8c5"]),
    st: [["🚌", "Bus bay (conductors)", "none", 17.6, 8.2, IS_WORK], ["🛎️", "Information desk", "none", 12.0, 6.5, NOT_WORK]],
    block(set) { blk(set, 2.5, 2, 10.5, 2.99); blk(set, 19.6, 1, 22.6, 1.99); blk(set, 16.4, 5, 21.4, 6.5); blk(set, 16.4, 9.6, 21.4, 11.2); blk(set, 3.4, 8.2, 5.0, 8.9); blk(set, 7.6, 8.2, 9.2, 8.9); blk(set, 3.4, 10.4, 5.0, 11.0); blk(set, 7.6, 10.4, 9.2, 11.0); blk(set, 11.2, 5.0, 12.8, 5.5); },
    spots: [{ lv: [0, 1, 2], x: DOOR1.x, y: DOOR1.y, face: 1, pose: "call", prop: "ticket" }],
    build(gr, w, h) {
      // departures board
      B(gr, 6.4, 1.7, 0.1, "#12161b", 14.0, 2.3, 1.05); for (const [i, t] of ["08:15  GRAND BAIE · QUAI 1", "08:40  FLIC EN FLAC · QUAI 2", "09:05  CUREPIPE · QUAI 3"].entries()) signAt(gr, t, 14.0, 2.75 - i * 0.42, 1.12, 0.26, "#12161b", i === 0 ? "#7bff9a" : "#f2e6c8"); signAt(gr, "DÉPARTS", 14.0, 3.3, 1.12, 0.22, "#12161b", "#ff9a3a");
      // three ticket booths with glass
      for (const x of [3.8, 6.5, 9.2]) { counter(gr, x, 2.7, 2.0, 0.7, "#2a3f63", "#e9e6df", 1.05); glass(gr, 2.0, 1.1, 0.04, x, 1.65, 2.7); B(gr, 0.5, 0.34, 0.04, "#1e2226", x + 0.5, 1.28, 2.55); signAt(gr, "BILLETS", x, 2.6, 2.75, 0.22, "#2a3f63", "#fff"); B(gr, 0.5, 0.02, 0.3, "#f4f1e8", x - 0.3, 1.1, 2.9); chair(gr, x, 1.8, 0, "#2a2e35"); }
      B(gr, 8.6, 2.4, 0.08, "#4a5a6a", 6.5, 1.2, 1.1);
      rope(gr, 6.0, 5.2, 6.0, 7.4); rope(gr, 7.4, 5.2, 7.4, 7.4);
      // food court counters
      for (const [x, c, t] of [[20.4, "#c0392b", "MINE FRITE"], [22.1, "#3d8c4a", "ALOUDA"]]) { counter(gr, x, 1.9, 1.5, 0.7, c, "#f1ead4", 1.0); signAt(gr, t, x, 2.3, 1.1, 0.24, c, "#fff"); for (let i = 0; i < 3; i++) C(gr, 0.1, 0.08, 0.1, ["#f2b544", "#e4572e", "#d9a441"][i], x - 0.4 + i * 0.4, 1.1, 1.9, 10); }
      // bus bays: painted lines, signs and the buses
      for (const [bz, n] of [[BUS1, "QUAI 1"], [BUS2, "QUAI 2"]]) { B(gr, 6.6, 0.01, 2.2, "#7c8288", bz.x, 0.02, bz.y); B(gr, 6.6, 0.015, 0.1, "#f2c94c", bz.x, 0.03, bz.y + 1.2); B(gr, 6.6, 0.015, 0.1, "#f2c94c", bz.x, 0.03, bz.y - 1.2); signAt(gr, n, 15.7, 2.4, bz.y + 0.4, 0.35, "#12161b", "#7bff9a", Math.PI / 2); }
      bus(gr, BUS1.x, BUS1.y, "#2f6fd0"); bus(gr, BUS2.x, BUS2.y, "#e4572e");
      // waiting benches and a few suitcases
      for (const [x, z] of [[4.2, 8.5], [8.4, 8.5], [4.2, 10.7], [8.4, 10.7]]) { bench(gr, x, z, 1.9, "#4a5a6a"); B(gr, 0.4, 0.5, 0.18, "#3a5a9a", x + 0.7, 0.25, z + 0.55); }
      B(gr, 1.8, 1.0, 0.7, "#2a3f63", 12.0, 0.5, 5.2); B(gr, 1.9, 0.06, 0.78, "#e9e6df", 12.0, 1.03, 5.2); signAt(gr, "INFORMATIONS", 12.0, 2.0, 5.2, 0.28, "#2a3f63", "#fff"); C(gr, 0.03, 0.03, 1.0, "#c9ced3", 11.0, 1.5, 5.2, 6); // information desk
      clock(gr, 10.8, 3.1, 1.08); signAt(gr, "VICTORIA URBAN TERMINAL", 11.0, 3.45, 1.08, 0.4, "#2a3f63", "#fff"); plant(gr, 1.6, 12.6); plant(gr, 14.6, 12.8);
    },
    actors(looks) {
      const pax = (id, off, seed, bk, dr) => { const lane = bk === 6.5, toBooth = lane ? [[6.7, 12.0, 0], [6.7, 5.4, 0], [bk, 3.6, 3.5, 1, "stand", "", "Un billet, SVP."], [6.7, 5.4, 0], [10.5, 4.7, 0]] : [[10.5, 12.0, 0], [10.5, 4.7, 0], [bk, 4.7, 0], [bk, 3.6, 3.5, 1, "stand", "", "Un billet, SVP."], [bk, 4.7, 0], [10.5, 4.7, 0]];
        return { id, looks, seed, off, nodes: [[12, 13.6, 5, 1, "hide"], [12, 12.6, 0]].concat(toBooth, [[15.0, 4.7, 0], [15.0, dr.y, 0], [dr.x - 0.8, dr.y, 2.2, 1, "stand", "ticket", "Bonjour!"], [dr.x - 0.2, dr.y, 14, 1, "hide"], [dr.x - 0.6, dr.y + 0.3, 0.3, 0, "stand", "suitcase", "", 1], [15.0, dr.y + 0.4, 0, 0, "stand", "suitcase", "", 1], [12.0, 12.2, 0, 0, "stand", "suitcase", "", 1], [12, 13.6, 0]]) }; };
      return [
        { id: "tk1", look: staffLook(0, "conductor"), nodes: [[3.8, 1.85, 40, 0, "work", "", "", 0, 0.45]] }, { id: "tk2", look: staffLook(1, "conductor"), nodes: [[6.5, 1.85, 40, 0, "work", "", "", 0, 0.45]] }, { id: "tk3", look: staffLook(2, "conductor"), nodes: [[9.2, 1.85, 40, 0, "work", "", "", 0, 0.45]] },
        { id: "cd1", look: staffLook(3, "conductor", { cap: "#2d6f46" }), yield: 0, nodes: [[DOOR1.x, DOOR1.y, 9, 1, "call", "ticket", "Grand Baie, Grand Baie! Mont, mont!"], [DOOR1.x, DOOR1.y, 5, 1, "stand", "ticket", "Avancez dans le bus, SVP."]] },
        { id: "cd2", look: staffLook(4, "conductor", { cap: "#2d6f46" }), off: 6, nodes: [[DOOR2.x, DOOR2.y, 8, 1, "call", "ticket", "Flic en Flac! Flic en Flac!"], [DOOR2.x, DOOR2.y, 6, 1, "stand", "ticket"]] },
        { id: "hk", look: staffLook(5, "market", { hs: "short", cap: "#e4572e" }), spd: 1.0, nodes: [[12.0, 8.6, 3, 0, "serve", "tray", "Dholl puri chaud! Gato piment!"], [14.0, 11.6, 3, 0, "serve", "tray", "Alouda glacé!"], [10.2, 12.0, 3, 0, "serve", "tray", "Dholl puri chaud!"], [12.0, 7.4, 3, 0, "serve", "tray"]] },
        { id: "cl", look: staffLook(6, "cleaner"), spd: 0.8, nodes: [[3.0, 6.0, 4, 0, "wipe"], [10.0, 6.0, 4, 0, "wipe"], [12.5, 9.2, 4, 0, "wipe"]] },
        { id: "gd", look: staffLook(7, "guard", { cap: "#1d2630" }), spd: 0.9, nodes: [[13.5, 12.4, 8, 0, "stand", "", "Bonne journée."], [10.5, 12.4, 8, 0, "stand"]] },
        pax("p1", 0, 1, 3.8, DOOR1), pax("p2", 22, 3, 6.5, DOOR1), pax("p3", 44, 5, 9.2, DOOR2), pax("p4", 11, 7, 6.5, DOOR2),
        { id: "w1", look: looks[0], nodes: [[3.6, 8.5, 60, 0, "sit", "", "", 0, 0.45]] }, { id: "w2", look: looks[1], nodes: [[4.9, 8.5, 60, 0, "sit", "", "", 0, 0.45]] }, { id: "w3", look: looks[2], nodes: [[8.0, 8.5, 60, 0, "sit", "", "", 0, 0.45]] },
        { id: "w4", look: looks[3], nodes: [[4.0, 10.7, 60, 0, "sit", "", "", 0, 0.45]] }, { id: "w5", look: looks[4], nodes: [[8.8, 10.7, 60, 0, "sit", "", "", 0, 0.45]] }
      ];
    }
  };
})();
