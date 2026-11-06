"use strict";
// A dholl puri and street-food shop: a hot tawa griddle with steam, a rolling table with dough and a stack of rotis, jars of chutney and gâteau piment on the open counter,
// a dish sink in the back, high standing tables, and customers who order a wrap and eat it on the spot.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, counter, tableRound, plant, sink, fridge, blk, staffLook, NOT_WORK, IS_WORK } = X;
  const HI = [[3.5, 6.5], [5.5, 6.5], [8.5, 6.5]];
  X.WK.dholl = {
    w: 12, h: 9, accent: "#d98a2b", mood: "warm", floor: ["#ead9b0", "#e0cc9a"],
    floorAt: (x, y) => (y < 4 ? ["#d7cfb6", "#cdc5aa"] : ["#ead9b0", "#e0cc9a"]),
    st: [["🫓", "Kitchen (staff only)", "none", 6.0, 3.2, IS_WORK], ["🛎️", "Serving counter", "none", 5.4, 5.2, NOT_WORK]],
    block(set) { blk(set, 2.2, 4, 9.8, 4.99); blk(set, 3.2, 1, 7.4, 1.99); blk(set, 8.0, 1, 8.9, 2.4); blk(set, 9.4, 1, 10.9, 1.99); for (const [x, y] of HI) set.add(Math.floor(x) + "," + Math.floor(y)); },
    spots: [{ lv: [0], x: 10.1, y: 2.75, face: 1, pose: "wash" }, { lv: [1, 2], x: 5.0, y: 2.8, face: 1, pose: "cook" }, { pt: true, x: 10.1, y: 2.75, face: 1, pose: "wash" }],
    build(gr, w, h) {
      B(gr, 9.4, 1.5, 0.05, "#f1ead4", 6.0, 0.75, 1.02);
      // the tawa: a big round griddle on a gas stand, with steam
      B(gr, 2.6, 0.85, 0.9, "#9aa4ab", 5.0, 0.43, 1.7); B(gr, 2.7, 0.05, 1.0, "#6e7881", 5.0, 0.88, 1.7); C(gr, 0.55, 0.55, 0.05, "#23272b", 4.4, 0.94, 1.7, 24); C(gr, 0.45, 0.45, 0.05, "#23272b", 5.6, 0.94, 1.75, 24); C(gr, 0.2, 0.2, 0.22, "#a85a2a", 6.2, 1.06, 1.4, 12); for (const x of [4.4, 5.6]) glowAt(gr, 0xff7a2a, 0.07, x, 0.86, 2.15);
      for (let i = 0; i < 3; i++) { C(gr, 0.04, 0.12, 0.5, "#ffffff", 4.4 + i * 0.1, 1.45 + i * 0.12, 1.7, 8).material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 - i * 0.05, depthWrite: false }); }
      B(gr, 2.2, 0.5, 0.5, "#9aa4ab", 5.0, 2.5, 1.35); B(gr, 0.5, 0.8, 0.4, "#9aa4ab", 5.0, 3.0, 1.3); // extractor hood
      // rolling table: dough balls, a rolling pin, a stack of dholl puri
      B(gr, 1.6, 0.9, 1.0, "#c49a6c", 8.45, 0.45, 1.75); B(gr, 1.7, 0.06, 1.1, "#e8dfc9", 8.45, 0.93, 1.75); for (let i = 0; i < 4; i++) S(gr, 0.13, "#f1e3c4", 7.95 + i * 0.33, 1.05, 1.65); C(gr, 0.035, 0.035, 0.55, "#8a5a34", 8.45, 0.99, 2.05, 8).rotation.z = Math.PI / 2; for (let i = 0; i < 6; i++) C(gr, 0.22, 0.22, 0.03, "#e8c47a", 8.9, 0.98 + i * 0.03, 1.5, 14);
      B(gr, 0.5, 0.9, 0.5, "#e9eef1", 8.9, 0.45, 1.1);
      sink(gr, 10.2, 1.7, 1.9); fridge(gr, 11.0, 1.15, "#dfe6ea");
      // shelves with oil, spices and jars
      for (let r = 0; r < 2; r++) { B(gr, 3.4, 0.05, 0.3, "#8a5a34", 3.0, 1.9 + r * 0.55, 1.15); for (let i = 0; i < 9; i++) C(gr, 0.07, 0.07, 0.25, ["#e4572e", "#f3a712", "#3d8c4a", "#c9a227", "#b07be0"][(i + r) % 5], 1.5 + i * 0.37, 2.05 + r * 0.55, 1.15, 8); }
      // the open counter: chutney bowls, gâteau piment, a heated box, a bell, a till
      B(gr, 7.6, 1.0, 0.7, "#c8553d", 6.0, 0.5, 4.5); B(gr, 7.7, 0.06, 0.8, "#f1ead4", 6.0, 1.03, 4.5);
      for (let i = 0; i < 5; i++) { C(gr, 0.17, 0.12, 0.1, ["#3d8c4a", "#c0392b", "#d9a441", "#8a4a1c", "#e4572e"][i], 2.7 + i * 0.5, 1.12, 4.4, 12); }
      glass(gr, 1.3, 0.5, 0.6, 7.8, 1.32, 4.5); for (let i = 0; i < 6; i++) S(gr, 0.1, "#b5651d", 7.35 + (i % 3) * 0.3, 1.12 + Math.floor(i / 3) * 0.2, 4.5); C(gr, 0.08, 0.1, 0.06, "#c9a227", 5.2, 1.1, 4.5, 10); B(gr, 0.4, 0.3, 0.3, "#2a2e33", 9.0, 1.2, 4.5);
      B(gr, 1.9, 0.9, 0.05, "#14222b", 2.6, 2.45, 1.05); signAt(gr, "DHOLL PURI · Rs 20", 2.6, 2.7, 1.07, 0.18, "#14222b", "#f2e6c8"); signAt(gr, "FARATHA · MINE FRITE · ALOUDA", 2.6, 2.4, 1.07, 0.14, "#14222b", "#f2e6c8");
      // high standing tables and bins
      for (const [x, y] of HI) { C(gr, 0.4, 0.4, 0.05, "#c8553d", x, 1.1, y, 16); C(gr, 0.05, 0.07, 1.05, "#5a5a5e", x, 0.55, y, 8); C(gr, 0.3, 0.3, 0.03, "#5a5a5e", x, 0.02, y, 10); }
      plant(gr, 1.6, 7.7); B(gr, 0.5, 0.7, 0.5, "#4a5a63", 10.6, 0.35, 7.7);
    },
    actors(looks) {
      const cust = (id, off, cx, seed, hx) => ({ id, looks, seed, off, nodes: [[6, 8.5, 5, 1, "hide"], [6, 7.6, 0], [6, 5.8, 0], [cx, 5.2, 6, 1, "stand", "", "Un dholl puri, SVP!"], [hx[0] - 0.9, 5.4, 0], [hx[0] - 0.9, hx[1], 12, 3, "eat", "plate", ""], [hx[0] - 0.9, 7.3, 0], [6, 7.3, 0], [6, 7.8, 0], [6, 8.5, 0]] });
      return [
        { id: "tawa", look: staffLook(0, "apron", { hs: "short" }), yield: 1, nodes: [[5.0, 2.8, 9, 1, "cook"], [5.0, 2.8, 4, 1, "chop"]] },
        { id: "roll", look: staffLook(1, "apron"), nodes: [[8.45, 2.7, 14, 1, "knead"], [8.45, 2.7, 3, 1, "wipe"]] },
        { id: "wash", look: staffLook(2, "cleaner"), yield: 0, nodes: [[10.1, 2.75, 30, 1, "wash"]] },
        { id: "srv", look: staffLook(3, "apron", { hs: "bun" }), nodes: [[4.0, 3.9, 6, 0, "serve", "plate", "Voilà!"], [7.0, 3.9, 6, 0, "scan", "", "Merci, bon appétit!"]] },
        cust("c1", 0, 4.0, 1, HI[0]), cust("c2", 10, 6.2, 4, HI[1]), cust("c3", 21, 8.2, 2, HI[2]),
        { id: "eat1", look: looks[5], nodes: [[3.5, 7.3, 60, 1, "eat", "plate"]] }
      ];
    }
  };
})();
