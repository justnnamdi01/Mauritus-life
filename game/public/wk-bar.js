"use strict";
// A bar: a long wooden counter with a mirror and bottle shelves behind it, beer taps, stools, round tables, a small stage for the sega band,
// a bartender pouring, a glass-washing sink, a glass collector doing the rounds and regulars at the counter.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, counter, tableRound, chair, stool, plant, sink, fridge, blk, tableBlock, staffLook, NOT_WORK, IS_WORK } = X;
  const TABLES = [[3.5, 6.5], [6.5, 6.5], [10.5, 6.5], [13.5, 6.5], [4.5, 8.5], [11.5, 8.5]], STOOLS = [5.0, 6.5, 8.0, 9.5, 11.0];
  X.WK.bar = {
    w: 16, h: 11, accent: "#2a1d17", mood: "candle", floor: ["#5b3a2a", "#523324"],
    st: [["🍺", "Behind the bar (staff only)", "none", 8.0, 2.5, IS_WORK], ["🍹", "The bar", "none", 8.0, 4.4, NOT_WORK]],
    block(set) { blk(set, 3.0, 3, 12.9, 3.99); blk(set, 3.0, 1, 12.9, 1.0); for (const [x, y] of TABLES) tableBlock(set, x, y); blk(set, 12.4, 8.2, 15.0, 9.9); },
    spots: [{ lv: [0], x: 3.6, y: 2.55, face: 1, pose: "wash" }, { lv: [1, 2], x: 8.0, y: 2.45, face: 0, pose: "pour", prop: "bottle" }, { pt: true, x: 3.6, y: 2.55, face: 1, pose: "wash" }],
    build(gr, w, h) {
      // back bar: mirror, bottle shelves, lights
      B(gr, 8.6, 1.5, 0.06, "#8fa6b5", 8.0, 1.8, 1.04); B(gr, 8.8, 0.08, 0.2, "#3b2416", 8.0, 1.05, 1.1); B(gr, 8.8, 0.08, 0.2, "#3b2416", 8.0, 2.58, 1.1);
      for (let r = 0; r < 3; r++) { B(gr, 8.6, 0.05, 0.28, "#5a3a24", 8.0, 1.25 + r * 0.45, 1.2); for (let i = 0; i < 18; i++) { C(gr, 0.05, 0.06, 0.25, ["#7fd6c8", "#ffa733", "#e4572e", "#f4f1e8", "#2f7d4a", "#c0392b", "#b07be0"][(i * 3 + r) % 7], 3.9 + i * 0.47, 1.4 + r * 0.45, 1.2, 8); } }
      for (let i = 0; i < 9; i++) glowAt(gr, 0xffd98a, 0.05, 3.9 + i * 1.0, 2.68, 1.15);
      B(gr, 2.0, 0.8, 0.05, "#14222b", 12.6, 1.9, 1.05); signAt(gr, "BAR SÉGA", 12.6, 2.05, 1.08, 0.3, "#14222b", "#f2c94c"); signAt(gr, "Phoenix · Rum · Punch", 12.6, 1.7, 1.08, 0.14, "#14222b", "#f2e6c8");
      // the counter with taps, a till and a rail
      counter(gr, 7.95, 3.5, 9.9, 0.8, "#3b2416", "#6b4428", 1.05); B(gr, 9.9, 0.05, 0.1, "#c9a227", 7.95, 0.3, 4.0); for (let i = 0; i < 3; i++) { C(gr, 0.04, 0.04, 0.3, "#c9ced3", 5.8 + i * 0.4, 1.28, 3.5, 8); B(gr, 0.06, 0.06, 0.18, "#c9ced3", 5.8 + i * 0.4, 1.44, 3.58); } B(gr, 0.5, 0.35, 0.4, "#2a2e33", 11.4, 1.25, 3.5); for (let i = 0; i < 5; i++) C(gr, 0.1, 0.09, 0.18, "#bfe3f2", 7.0 + i * 0.5, 1.17, 3.55, 8);
      sink(gr, 3.7, 1.7, 1.6); B(gr, 0.7, 0.7, 0.5, "#c9ced3", 12.6, 0.35, 2.0); B(gr, 0.9, 1.5, 0.6, "#e9eef1", 11.9, 0.75, 1.5);
      for (const x of STOOLS) stool(gr, x, 4.35, 0.65, "#8a2f2f"); stool(gr, 12.2, 4.35, 0.65, "#8a2f2f");
      for (const [x, y] of TABLES) { tableRound(gr, x, y, 0.5, "#6b4428"); chair(gr, x - 0.8, y, 3, "#4a3a2a"); chair(gr, x + 0.8, y, 2, "#4a3a2a"); C(gr, 0.04, 0.04, 0.1, "#f4f1e8", x, 0.8, y, 8); glowAt(gr, 0xffc24a, 0.05, x, 0.88, y); }
      // the little stage for the sega band
      B(gr, 2.6, 0.22, 1.6, "#7a4a2b", 13.7, 0.11, 9.1); B(gr, 2.7, 0.04, 1.7, "#d9a441", 13.7, 0.23, 9.1); C(gr, 0.2, 0.17, 0.5, "#8a4a1c", 13.0, 0.5, 9.2, 12); C(gr, 0.2, 0.17, 0.5, "#8a4a1c", 13.4, 0.5, 9.4, 12); C(gr, 0.02, 0.02, 1.2, "#222", 14.3, 0.85, 9.2, 6); S(gr, 0.05, "#222", 14.3, 1.5, 9.2); signAt(gr, "SÉGA TONIGHT", 13.7, 2.4, 8.4, 0.3, "#14222b", "#ff7ab6");
      B(gr, 1.4, 0.9, 0.05, "#1a1f26", 3.0, 2.0, 1.05); B(gr, 1.3, 0.8, 0.02, "#2a8a4a", 3.0, 2.0, 1.08); // a TV showing football
      for (let i = 0; i < 5; i++) glowAt(gr, [0xff5a5a, 0xffd23c, 0x5ad1ff, 0xff7be5, 0x7bff9a][i], 0.06, 1.5 + i * 3.0, 2.8, 5.5); // fairy lights across the room
      plant(gr, 1.6, 9.8); plant(gr, 10.0, 10.3);
    },
    actors(looks) {
      const drinker = (id, x, i) => ({ id, look: looks[i], nodes: [[x, 4.35, 60, 1, "drink", "glass", "", 0, 0.65]], off: i * 2.3 });
      const seatD = (id, x, y, f, i) => ({ id, look: looks[i], nodes: [[x, y, 60, f, "drink", "glass", "", 0, 0.45]], off: i * 1.9 });
      const cust = (id, off, sx, seed) => ({ id, looks, seed, off, nodes: [[8, 10.5, 6, 1, "hide"], [8, 9.8, 0], [8, 5.0, 0], [sx, 5.0, 0], [sx, 4.35, 22, 1, "drink", "glass", "", 0, 0.65], [sx, 5.0, 0], [8, 5.0, 0], [8, 9.8, 0], [8, 10.5, 0]] });
      return [
        { id: "bt", look: staffLook(0, "bar", { hs: "short" }), yield: 1, nodes: [[8.0, 2.45, 6, 0, "pour", "bottle", "Un Phoenix?"], [6.0, 2.45, 5, 0, "pour", "bottle"], [9.8, 2.45, 5, 0, "wipe"]] },
        { id: "bt2", look: staffLook(1, "bar", { hs: "bun" }), nodes: [[10.8, 2.45, 8, 0, "wipe"], [10.8, 2.45, 7, 0, "pour", "glass", "Santé!"]] },
        { id: "wash", look: staffLook(2, "cleaner"), yield: 0, nodes: [[3.6, 2.55, 30, 1, "wash"]] },
        { id: "gc", look: staffLook(3, "bar"), spd: 1.3, nodes: [[13.4, 2.6, 1, 0, "stand"], [13.4, 5.5, 0], [13.5, 5.5, 2.4, 0, "stand", "tray", "", 1], [10.5, 5.5, 2.4, 0, "stand", "tray", "", 1], [6.5, 5.5, 2.4, 0, "stand", "tray", "", 1], [3.5, 5.5, 2.4, 0, "stand", "tray", "", 1], [5.0, 5.5, 0, 0, "stand", "tray", "", 1], [5.0, 7.5, 0, 0, "stand", "tray", "", 1], [4.5, 7.5, 2.4, 0, "stand", "tray", "", 1], [11.5, 7.5, 2.4, 0, "stand", "tray", "", 1], [13.4, 5.5, 0, 0, "stand", "tray", "", 1], [13.4, 2.6, 0, 0, "stand", "tray", "", 1], [4.6, 2.6, 3, 1, "stand", "tray"]] },
        drinker("d1", 5.0, 0), drinker("d2", 8.0, 1), drinker("d3", 11.0, 2),
        seatD("t1", 2.65, 6.5, 3, 3), seatD("t2", 4.35, 6.5, 2, 4), seatD("t3", 9.65, 6.5, 3, 5), seatD("t4", 11.35, 6.5, 2, 6),
        cust("c1", 0, 6.5, 1), cust("c2", 18, 9.5, 3)
      ];
    }
  };
})();
