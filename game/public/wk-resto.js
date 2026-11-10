"use strict";
// A Mauritian restaurant: a steel kitchen at the back (stoves, prep table, dish sink, fridge), a pass counter with heat lamps, and a dining room
// with red-and-white tables, a host stand at the door, waiters, diners and guests who arrive, eat and pay.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, counter, tableRound, chair, plant, crockery, sink, stove, fridge, blk, tableBlock, staffLook, NOT_WORK, IS_WORK } = X;
  const TABLES = [[3.5, 7.5], [6.5, 7.5], [10.5, 7.5], [13.5, 7.5], [3.5, 9.5], [6.5, 9.5], [10.5, 9.5], [13.5, 9.5]];
  const HOST = { x: 12.0, y: 10.5 };
  X.WK.resto = {
    w: 16, h: 12, accent: "#b5533c", mood: "warm", floor: ["#d9b98a", "#d0ae7e"],
    floorAt: (x, y) => (y < 5 ? ["#c9cfd2", "#bcc3c7"] : y === 5 ? ["#8a5a34", "#7e5030"] : ["#d9b98a", "#d0ae7e"]),
    st: [["🧑‍🍳", "Kitchen (staff only)", "none", 9.4, 3.5, IS_WORK], ["🛎️", "Host stand", "none", HOST.x, 9.6, NOT_WORK]],
    block(set) { blk(set, 3.2, 1, 15.4, 1.99); blk(set, 2.2, 4, 11.8, 4.99); for (const [x, y] of TABLES) tableBlock(set, x, y); blk(set, 11.6, 10.4, 12.6, 10.9); },
    spots: [{ lv: [0], x: 12.7, y: 2.75, face: 1, pose: "wash" }, { lv: [1, 2], x: 4.4, y: 2.75, face: 1, pose: "cook" }],
    build(gr, w, h, b) {
      B(gr, 12.8, 1.7, 0.05, "#eef1f2", 8.9, 0.85, 1.02); B(gr, 12.8, 0.06, 0.06, "#c9ced3", 8.9, 1.72, 1.04); // white tiles behind the cooking
      stove(gr, 4.4, 1.65); stove(gr, 6.6, 1.65); // two ranges with hoods
      counter(gr, 9.4, 1.8, 2.3, 0.8, steel2(), "#cfd5d9", 0.92); for (let i = 0; i < 4; i++) B(gr, 0.4, 0.04, 0.3, ["#8a5a34", "#e8e2d2"][i % 2], 8.7 + i * 0.5, 0.96, 1.8); C(gr, 0.1, 0.1, 0.16, "#c0392b", 9.9, 1.06, 1.9, 8); B(gr, 0.2, 0.2, 0.2, "#3d8c4a", 9.1, 1.07, 1.8);
      sink(gr, 12.7, 1.7, 2.2); fridge(gr, 14.6, 1.5);
      for (let i = 0; i < 6; i++) { C(gr, 0.1 + (i % 2) * 0.05, 0.1 + (i % 2) * 0.05, 0.06, "#7f8a92", 8.2 + i * 0.5, 2.0, 1.1, 10).rotation.x = Math.PI / 2; } B(gr, 3.2, 0.03, 0.03, "#5d6770", 9.8, 2.28, 1.09); // pans on a rail
      counter(gr, 6.9, 4.75, 9.4, 0.6, "#8a5a34", "#d9d5ca", 1.0); for (const x of [3.2, 5.6, 8.2, 10.6]) { C(gr, 0.03, 0.03, 0.7, "#9aa4ab", x, 1.35, 4.65, 6); B(gr, 0.7, 0.04, 0.3, "#9aa4ab", x, 1.72, 4.65); glowAt(gr, 0xff8a3a, 0.09, x - 0.2, 1.65, 4.65); glowAt(gr, 0xff8a3a, 0.09, x + 0.2, 1.65, 4.65); crockery(gr, x, 1.03, 4.8); } // heat lamps over the pass, and plates waiting
      for (const [x, y] of TABLES) { tableRound(gr, x, y, 0.55, "#c0392b", "#f4f1e8"); chair(gr, x - 0.85, y, 3, "#8a5a34"); chair(gr, x + 0.85, y, 2, "#8a5a34"); C(gr, 0.05, 0.05, 0.12, "#bfe3f2", x, 0.81, y, 8); glowAt(gr, 0xffd98a, 0.04, x, 0.9, y); crockery(gr, x - 0.25, 0.75, y + 0.1, 1); crockery(gr, x + 0.25, 0.75, y - 0.1, 1); }
      counter(gr, HOST.x, HOST.y, 1.5, 0.6, "#5a3a24", "#a67c52", 1.0); B(gr, 0.4, 0.04, 0.3, "#f4f1e8", HOST.x - 0.3, 1.04, HOST.y); glowAt(gr, 0xffd98a, 0.07, HOST.x + 0.4, 1.12, HOST.y); B(gr, 0.3, 0.2, 0.2, "#2a2e33", HOST.x + 0.45, 1.1, HOST.y + 0.05); // host stand with the book and the till
      signAt(gr, "MENU DU JOUR", 5.2, 2.55, 1.04, 0.5, "#14222b", "#f2e6c8"); B(gr, 1.5, 0.02, 1.0, "#14222b", 5.2, 2.2, 1.03);
      B(gr, 0.9, 0.7, 0.04, "#2a6fb0", 8.0, 2.3, 1.03); B(gr, 0.7, 0.5, 0.03, "#f2b544", 8.0, 2.3, 1.06); // a painting on the back wall
      plant(gr, 1.6, 5.6); plant(gr, 14.6, 5.6); plant(gr, 1.6, 10.6); plant(gr, 14.5, 10.9);
      for (const [x, y] of [[3.5, 8.5], [6.5, 8.5], [10.5, 8.5], [13.5, 8.5]]) { C(gr, 0.02, 0.02, 0.9, "#222", x, 2.3, y, 4); C(gr, 0.2, 0.28, 0.18, "#c0392b", x, 1.8, y, 12); glowAt(gr, 0xffe2a0, 0.1, x, 1.7, y); } // pendant lamps over the tables
      B(gr, 1.6, 0.03, 0.9, "#7e1f1f", 8.0, 0.02, 10.75); // doormat
    },
    actors(looks) {
      const diners = []; [[0, 3.5, 7.5], [1, 6.5, 7.5], [2, 10.5, 7.5], [3, 13.5, 7.5], [4, 3.5, 9.5]].forEach(([i, x, y]) => { diners.push({ id: "dn" + i * 2, look: looks[(i * 2) % 8], off: i * 3.1, nodes: [[x - 0.85, y, 60, 3, "eat", "", "", 0, 0.45]] }, { id: "dn" + (i * 2 + 1), look: looks[(i * 2 + 1) % 8], off: i * 1.7, nodes: [[x + 0.85, y, 60, 2, "eat", "", "", 0, 0.45]] }); });
      const guest = (id, off, tx, ty, seatFace, seed) => ({ id, looks, seed, off, nodes: [[8, 11.4, 8, 1, "hide"], [8, 10.2, 0], [11.2, 10.3, 3, 3, "stand", "", "Table for one?"], [tx, 10.3, 0], [tx, ty, 26, seatFace, "eat", "", "", 0, 0.45], [tx, 10.3, 0], [11.2, 10.3, 3, 3, "stand", "", "L'addition, s'il vous plaît!"], [8, 10.2, 0], [8, 11.4, 0]] });
      return [
        { id: "chef", look: staffLook(0, "chef", { hs: "short" }), yield: 1, nodes: [[4.4, 2.75, 11, 1, "cook"], [6.6, 2.75, 7, 1, "cook"], [6.1, 3.9, 2.4, 0, "stand", "plate", "Order up!"]] },
        { id: "prep", look: staffLook(1, "chef"), nodes: [[9.4, 2.85, 12, 1, "chop"], [9.4, 2.85, 4, 1, "wipe"]] },
        { id: "wash", look: staffLook(2, "cleaner"), yield: 0, nodes: [[12.7, 2.75, 30, 1, "wash"]] },
        { id: "w1", look: staffLook(3, "waiter"), off: 4, spd: 1.35, nodes: [[6.3, 3.95, 2.2, 0, "stand", "plate", "", 1], [12.9, 3.95, 0, 0, "stand", "plate", "", 1], [12.9, 5.5, 0, 0, "stand", "plate", "", 1], [10.5, 6.5, 2.6, 0, "stand", "", "Bon appétit!"], [13.5, 6.5, 2.6, 0, "stand", "", "Bon appétit!"], [12.9, 5.5, 0], [12.9, 3.95, 0]] },
        { id: "w2", look: staffLook(4, "waiter"), off: 13, spd: 1.35, nodes: [[7.4, 3.95, 2.2, 0, "stand", "tray", "", 1], [12.9, 3.95, 0, 0, "stand", "tray", "", 1], [12.9, 5.5, 0, 0, "stand", "tray", "", 1], [6.5, 6.5, 2.6, 0, "stand", "", "Voilà!"], [3.5, 6.5, 2.6, 0, "stand", "", "Voilà!"], [12.9, 5.5, 0], [12.9, 3.95, 0]] },
        { id: "host", look: staffLook(5, "waiter", { hs: "bun" }), nodes: [[12.0, 9.6, 14, 0, "stand", "", "Bienvenue!"], [12.0, 9.6, 9, 0, "stand"]] },
        guest("g1", 0, 10.5 - 0.85, 9.5, 3, 1), guest("g2", 35, 6.5 + 0.85, 9.5, 2, 4)
      ];
    }
  };
  function steel2() { return "#b8c0c6"; }
})();
