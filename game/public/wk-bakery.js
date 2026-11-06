"use strict";
// A boulangerie: a brick oven at the back, a kneading table, a flour store and a mixer, a glass display counter with bread and gâteaux,
// a few café tables, and bakers who knead, bake, carry trays and serve the queue.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, counter, tableRound, chair, plant, blk, tableBlock, staffLook, NOT_WORK, IS_WORK } = X;
  const loaf = (gr, x, y, z, col, len) => { const m = C(gr, 0.07, 0.07, len || 0.4, col || "#d9a441", x, y, z, 8); m.rotation.z = Math.PI / 2; return m; };
  const bunTray = (gr, x, y, z) => { B(gr, 0.7, 0.03, 0.45, "#9aa4ab", x, y, z); for (let i = 0; i < 6; i++) S(gr, 0.1, "#d9a441", x - 0.25 + (i % 3) * 0.25, y + 0.1, z - 0.1 + Math.floor(i / 3) * 0.22); };
  X.WK.bakery = {
    w: 14, h: 10, accent: "#c9a273", mood: "gold", floor: ["#f3e3c5", "#e8d3ac"],
    floorAt: (x, y) => (y < 4 ? ["#e8dec8", "#ded2b6"] : ["#f3e3c5", "#e8d3ac"]),
    st: [["🥖", "Bakehouse (staff only)", "none", 7.4, 3.3, IS_WORK], ["🛎️", "Bakery counter", "none", 6.5, 6.4, NOT_WORK]],
    block(set) { blk(set, 2.4, 5, 10.6, 5.99); blk(set, 2.4, 1, 3.4, 1.99); blk(set, 5.2, 2, 8.0, 2.9); blk(set, 8.4, 1, 10.9, 1.99); blk(set, 11.6, 1, 12.9, 1.99); for (const [x, y] of [[3.5, 8.5], [10.5, 8.5]]) tableBlock(set, x, y); },
    spots: [{ lv: [0], x: 6.6, y: 3.45, face: 1, pose: "knead" }, { lv: [1, 2], x: 9.5, y: 3.0, face: 1, pose: "stack", prop: "bread" }, { pt: true, x: 6.6, y: 3.45, face: 1, pose: "knead" }],
    build(gr, w, h) {
      B(gr, 10.6, 1.4, 0.05, "#f4f0e6", 6.2, 0.7, 1.02); // tiles
      // brick oven with a glowing mouth and chimney
      B(gr, 2.8, 2.2, 1.1, "#a0522d", 9.6, 1.1, 1.6); B(gr, 2.9, 0.15, 1.2, "#7a3c1c", 9.6, 2.25, 1.6); B(gr, 0.7, 1.6, 0.6, "#8a4524", 9.6, 3.1, 1.3); B(gr, 1.4, 0.8, 0.1, "#1b0f08", 9.6, 0.95, 2.18); B(gr, 1.2, 0.6, 0.05, "#ff7a1f", 9.6, 0.92, 2.21); glowAt(gr, 0xffb347, 0.18, 9.6, 0.9, 2.1); B(gr, 1.6, 0.06, 0.4, "#6b4a2a", 9.6, 0.58, 2.3); bunTray(gr, 9.2, 0.62, 2.3); // oven
      B(gr, 0.06, 1.6, 0.06, "#6b4a2a", 11.0, 1.2, 2.2); B(gr, 0.7, 0.05, 0.4, "#8a6a44", 11.3, 0.9, 2.2); // peel against the wall
      // racks of cooling bread
      B(gr, 1.3, 1.9, 0.6, "#8a5a34", 12.3, 0.95, 1.6); for (let i = 0; i < 4; i++) { B(gr, 1.2, 0.04, 0.55, "#6b4a2a", 12.3, 0.4 + i * 0.4, 1.6); for (let j = 0; j < 3; j++) loaf(gr, 11.95 + j * 0.35, 0.5 + i * 0.4, 1.6, i % 2 ? "#d9a441" : "#c28a3a", 0.3); }
      // flour store and a mixer
      for (let i = 0; i < 5; i++) B(gr, 0.7, 0.4, 0.45, "#e8dfc9", 1.6 + (i % 2) * 0.1, 0.2 + Math.floor(i / 2) * 0.4, 1.7 + (i % 2) * 0.55); B(gr, 0.7, 0.4, 0.45, "#e8dfc9", 1.6, 0.2, 2.3);
      B(gr, 0.9, 1.0, 0.9, "#c9ced3", 3.8, 0.5, 1.8); C(gr, 0.4, 0.3, 0.45, "#e8eef1", 3.8, 1.2, 1.9, 16); B(gr, 0.1, 0.5, 0.1, "#8a929a", 3.8, 1.5, 1.7);
      // the kneading table with dough
      B(gr, 3.0, 0.9, 1.1, "#c49a6c", 6.6, 0.45, 2.45); B(gr, 3.1, 0.06, 1.2, "#e8dfc9", 6.6, 0.93, 2.45); for (let i = 0; i < 5; i++) S(gr, 0.17, "#f1e3c4", 5.6 + i * 0.5, 1.05, 2.4 + (i % 2) * 0.2); C(gr, 0.04, 0.04, 0.5, "#8a5a34", 6.0, 0.98, 2.7, 8).rotation.z = Math.PI / 2; B(gr, 0.5, 0.02, 0.4, "#f4f1e8", 7.4, 0.97, 2.7);
      // the display counter: glass front, bread and gâteaux, a till
      B(gr, 8.4, 1.0, 0.7, "#8a5a34", 6.6, 0.5, 5.5); glass(gr, 8.2, 0.55, 0.62, 6.6, 1.28, 5.5); B(gr, 8.4, 0.06, 0.7, "#c49a6c", 6.6, 1.55, 5.5);
      for (let i = 0; i < 9; i++) { const x = 2.9 + i * 0.9; if (i % 3 === 0) loaf(gr, x, 1.1, 5.5, "#d9a441", 0.5); else if (i % 3 === 1) { C(gr, 0.17, 0.17, 0.1, "#f4d9e8", x, 1.12, 5.5, 12); S(gr, 0.06, "#c0392b", x, 1.22, 5.5); } else for (let j = 0; j < 3; j++) { const c = C(gr, 0.08, 0.1, 0.12, "#e0a64a", x - 0.2 + j * 0.2, 1.12, 5.5, 8); c.rotation.z = 0.3; } }
      B(gr, 0.5, 0.35, 0.4, "#2a2e33", 9.9, 1.75, 5.5); B(gr, 0.4, 0.2, 0.02, "#8fd0ff", 9.9, 1.8, 5.3); signAt(gr, "BOULANGERIE · PÂTISSERIE", 6.6, 2.7, 1.04, 0.5, "#6b3a1c", "#f6e6c4");
      // baskets of baguettes on the left wall, café tables, plants
      for (let i = 0; i < 4; i++) { C(gr, 0.28, 0.22, 0.4, "#b98a4b", 1.5, 0.2, 5.0 + i * 0.7, 10); for (let j = 0; j < 3; j++) { const l = C(gr, 0.04, 0.04, 0.8, "#d9a441", 1.5 + (j - 1) * 0.1, 0.65, 5.0 + i * 0.7, 6); l.rotation.z = 0.12 * (j - 1); } }
      for (const [x, y] of [[3.5, 8.5], [10.5, 8.5]]) { tableRound(gr, x, y, 0.5, "#f4f1e8", "#e4572e"); chair(gr, x - 0.8, y, 3, "#8f5f3a"); chair(gr, x + 0.8, y, 2, "#8f5f3a"); C(gr, 0.1, 0.1, 0.03, "#fff", x - 0.15, 0.78, y, 12); loaf(gr, x + 0.1, 0.8, y + 0.05, "#e0a64a", 0.18); }
      plant(gr, 1.5, 8.8); plant(gr, 12.6, 8.8);
    },
    actors(looks) {
      return [
        { id: "kn", look: staffLook(0, "baker"), yield: 0, nodes: [[6.6, 3.45, 30, 1, "knead"]] },
        { id: "bk", look: staffLook(1, "baker", { hs: "bun" }), yield: 1, nodes: [[9.5, 3.0, 5, 1, "stack"], [9.5, 3.0, 3, 1, "carry", "bread", "", 1], [12.0, 3.0, 2, 1, "stand", "bread"], [9.5, 3.0, 0]] },
        { id: "mx", look: staffLook(2, "baker"), nodes: [[3.8, 2.9, 20, 1, "work"], [3.8, 2.9, 4, 1, "wipe"]] },
        { id: "cash", look: staffLook(3, "apron", { hs: "bun" }), nodes: [[6.6, 4.3, 10, 0, "scan", "", "Bonjour!"], [6.6, 4.3, 8, 0, "stand", "", "Merci, bonne journée!"]] },
        { id: "srv", look: staffLook(4, "apron"), off: 6, nodes: [[4.4, 4.3, 7, 0, "serve", "bread"], [8.8, 4.3, 7, 0, "serve", "bread"]] },
        { id: "cu1", looks, seed: 0, off: 0, nodes: [[7, 9.6, 6, 1, "hide"], [7, 8.7, 0], [4.8, 6.5, 6, 1, "stand", "", "Deux baguettes!"], [6.6, 6.5, 0, 0], [7.0, 8.7, 0], [7, 9.6, 0, 1, "hide"]].map((n, i) => (i === 2 ? n : n)) },
        { id: "cu2", looks, seed: 3, off: 12, nodes: [[7, 9.6, 6, 1, "hide"], [7, 8.7, 0], [8.4, 6.5, 6, 1, "stand", "", "Un gâteau coco, SVP!"], [7.0, 8.7, 0], [7, 9.6, 0]] },
        { id: "cu3", looks, seed: 5, off: 26, nodes: [[7, 9.6, 6, 1, "hide"], [7, 8.7, 0], [6.6, 6.5, 6, 1, "stand", "bread"], [3.5, 7.5, 14, 0, "eat", "", "", 0, 0], [7.0, 8.7, 0], [7, 9.6, 0]] },
        { id: "sit1", look: looks[2], nodes: [[4.3, 8.5, 60, 2, "eat", "", "", 0, 0.45]] }, { id: "sit2", look: looks[4], nodes: [[9.7, 8.5, 60, 3, "eat", "", "", 0, 0.45]] }
      ];
    }
  };
})();
