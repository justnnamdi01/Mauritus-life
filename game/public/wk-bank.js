"use strict";
// A bank branch: marble lobby, a long teller counter with glass and three windows, a queue lane, loans desks, a glass manager's office,
// a vault door, ATMs, waiting benches, a security guard, and customers who queue, transact and leave.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, counter, chair, plant, deskSet, bench, clock, rope, blk, staffLook, NOT_WORK, IS_WORK } = X;
  const WIN = [8.6, 11.1, 13.6], TY = 3.75;
  X.WK.tower = {
    w: 18, h: 12, accent: "#2a3f63", mood: "cool", floor: ["#ebe7df", "#e0dbd0"],
    floorAt: (x, y) => (y < 5 ? ["#cfd6dc", "#c3cbd2"] : ["#ebe7df", "#e0dbd0"]),
    st: [["🏦", "Staff door", "none", 6.2, 4.4, IS_WORK], ["🛎️", "Customer service", "none", 10.8, 7.4, NOT_WORK]],
    block(set) { blk(set, 7.2, 4, 15.7, 4.99); blk(set, 1, 4, 1.99, 4.99); blk(set, 4, 4, 4.99, 4.99); blk(set, 2.8, 6, 3.7, 7.9); blk(set, 2.8, 8.6, 3.7, 10.4); blk(set, 16.0, 5.8, 16.8, 7.7); blk(set, 5.2, 9.5, 7.2, 10.0); blk(set, 11.0, 9.5, 13.0, 10.0); blk(set, 2.7, 2, 3.8, 2.9); },
    spots: [{ lv: [0], x: WIN[1], y: TY, face: 0, pose: "work", h: 0.45 }, { lv: [1], x: 4.1, y: 7.0, face: 2, pose: "work", h: 0.45 }, { lv: [2], x: 3.2, y: 1.55, face: 0, pose: "work", h: 0.45 }, { pt: true, x: WIN[0], y: TY, face: 0, pose: "work", h: 0.45 }],
    build(gr, w, h) {
      // back wall: vault, sign, clock
      C(gr, 0.95, 0.95, 0.35, "#9aa4ab", 8.0, 1.25, 1.2, 28).rotation.x = Math.PI / 2; C(gr, 0.78, 0.78, 0.4, "#6e7881", 8.0, 1.25, 1.2, 28).rotation.x = Math.PI / 2; C(gr, 0.18, 0.18, 0.5, "#c9a227", 8.0, 1.25, 1.2, 12).rotation.x = Math.PI / 2; for (let i = 0; i < 6; i++) { const sp = B(gr, 0.7, 0.05, 0.05, "#c9a227", 8.0, 1.25, 1.45); sp.rotation.z = i * Math.PI / 6; } B(gr, 2.3, 2.3, 0.2, "#4a525a", 8.0, 1.15, 1.05);
      signAt(gr, "COMMERCIAL BANK", 12.0, 2.9, 1.04, 0.5, "#1f3d6b", "#e8c96a"); clock(gr, 10.2, 2.9, 1.06);
      // manager's glass office
      B(gr, 3.7, 0.8, 0.08, "#8a5a34", 3.1, 0.4, 4.0); glass(gr, 3.7, 1.4, 0.05, 3.1, 1.5, 4.0); B(gr, 0.08, 0.8, 2.9, "#8a5a34", 4.9, 0.4, 2.55); glass(gr, 0.05, 1.4, 2.9, 4.9, 1.5, 2.55); B(gr, 3.7, 0.06, 0.06, "#6e7881", 3.1, 2.2, 4.0);
      deskSet(gr, 3.2, 2.4, 0, "#5a3a24", true, "#5a2a2a"); B(gr, 0.3, 0.02, 0.3, "#f4f1e8", 2.6, 0.78, 2.5); plant(gr, 1.6, 1.7); B(gr, 0.5, 0.35, 0.04, "#c9a227", 3.2, 1.7, 1.03);
      // tellers' counter with three glass windows, monitors and cash trays
      counter(gr, 11.45, 4.62, 8.5, 0.7, "#3a4a63", "#e9e6df", 1.05);
      for (const x of [7.4, 9.85, 12.35, 14.85]) B(gr, 0.08, 1.15, 0.08, "#6e7881", x, 1.62, 4.62); for (const x of [8.625, 11.1, 13.6]) glass(gr, 2.4, 1.15, 0.04, x, 1.62, 4.62);
      for (const x of WIN) { B(gr, 0.5, 0.34, 0.04, "#1e2226", x - 0.5, 1.28, 4.5); B(gr, 0.44, 0.28, 0.02, "#8fd0ff", x - 0.5, 1.28, 4.52); B(gr, 0.4, 0.04, 0.3, "#c49a6c", x + 0.5, 1.07, 4.62); B(gr, 0.5, 0.18, 0.04, "#c9a227", x, 1.45, 4.97); }
      for (const x of WIN) B(gr, 0.8, 0.5, 0.05, "#1f3d6b", x, 2.15, 4.62); // window number plates above each window
      B(gr, 0.6, 0.3, 0.04, "#f2b544", WIN[0], 2.15, 4.66); signAt(gr, "1", WIN[0], 2.15, 4.69, 0.28, "#1f3d6b", "#fff"); signAt(gr, "2", WIN[1], 2.15, 4.69, 0.28, "#1f3d6b", "#fff"); signAt(gr, "3", WIN[2], 2.15, 4.69, 0.28, "#1f3d6b", "#fff");
      for (const x of WIN) { chair(gr, x, 3.75, 0, "#2a2e35"); } B(gr, 1.2, 0.72, 0.6, "#4a525a", 15.8, 0.36, 2.2); B(gr, 1.2, 0.72, 0.6, "#4a525a", 15.8, 0.36, 3.2); // seats behind the glass, filing cabinets
      // queue lane to window 2
      rope(gr, 10.3, 6.5, 10.3, 8.8); rope(gr, 11.9, 6.5, 11.9, 8.8); rope(gr, 7.0, 6.5, 9.2, 6.5); rope(gr, 13.6, 6.5, 15.2, 6.5); signAt(gr, "QUEUE HERE · FILE ICI", 11.1, 1.6, 8.9, 0.22, "#1f3d6b", "#ffffff");
      // loans desks with client chairs
      deskSet(gr, 3.2, 7.0, 2, "#5a3a24", true, "#2a2e35"); chair(gr, 2.3, 7.0, 3, "#8f5f3a"); deskSet(gr, 3.2, 9.4, 2, "#5a3a24", true, "#2a2e35"); chair(gr, 2.3, 9.4, 3, "#8f5f3a"); signAt(gr, "LOANS · PRÊTS", 1.5, 1.9, 6.0, 0.25, "#1f3d6b", "#ffffff", Math.PI / 2);
      // ATMs on the right
      for (const z of [6.2, 7.4]) { B(gr, 0.7, 1.8, 0.8, "#2a4f8a", 16.4, 0.9, z); B(gr, 0.04, 0.4, 0.5, "#8fd0ff", 16.04, 1.35, z); B(gr, 0.04, 0.1, 0.4, "#111", 16.04, 1.0, z); glowAt(gr, 0x3dff7a, 0.05, 16.0, 1.1, z + 0.3); } signAt(gr, "ATM", 16.6, 2.2, 6.8, 0.3, "#2a4f8a", "#fff", -Math.PI / 2);
      // waiting benches and a coffee table
      bench(gr, 6.2, 9.8, 1.8); bench(gr, 12.0, 9.8, 1.8); B(gr, 0.7, 0.04, 0.5, "#8a5a34", 9.1, 0.4, 10.2); plant(gr, 1.7, 10.9); plant(gr, 16.4, 10.9); plant(gr, 16.4, 4.4);
      // gold line on the floor in front of the counter
      B(gr, 8.5, 0.01, 0.08, "#c9a227", 11.45, 0.015, 5.9);
      // flags
      for (const [x, c] of [[1.4, "#e4572e"], [1.55, "#2a4f8a"]]) { C(gr, 0.03, 0.03, 1.4, "#c9ced3", x, 0.7, 11.0, 6); B(gr, 0.3, 0.2, 0.02, c, x + 0.17, 1.3, 11.0); }
    },
    actors(looks) {
      const L = (i, k) => staffLook(i, k || "bank"), seat = (id, look, x, y, face, extra) => Object.assign({ id, look, nodes: [[x, y, 60, face, "work", "", "", 0, 0.45]] }, extra || {});
      const cust = (id, off, wx, seed, prop) => ({ id, looks, seed, off, nodes: [[9, 11.6, 8, 1, "hide"], [9, 10.4, 0], [10.9, 9.0, 2.2, 1, "stand", prop, ""], [10.9, 6.8, 1.2, 1, "stand", prop], [wx, 5.4, 7.5, 1, "stand", prop, "Bonjour!"], [10.9, 6.8, 0], [9, 10.4, 0], [9, 11.6, 0]] });
      return [
        seat("t1", L(0), WIN[0], TY, 0, { yield: 3 }), seat("t2", L(1), WIN[1], TY, 0, { yield: 0 }), seat("t3", L(2), WIN[2], TY, 0),
        seat("mgr", L(3, "bank"), 3.2, 1.55, 0, { yield: 2 }),
        seat("ln1", L(4), 4.1, 7.0, 2, { yield: 1 }), { id: "cl1", look: looks[0], nodes: [[2.35, 7.0, 60, 3, "sit", "papers", "", 0, 0.45]] },
        seat("ln2", L(5), 4.1, 9.4, 2), { id: "cl2", look: looks[1], nodes: [[2.35, 9.4, 60, 3, "sit", "papers", "", 0, 0.45]] },
        { id: "guard", look: staffLook(6, "guard", { cap: "#1d2630" }), spd: 0.9, nodes: [[7.4, 10.8, 5, 0, "stand"], [10.8, 10.8, 5, 0, "stand"], [13.6, 10.5, 5, 0, "stand", "", "Good morning."], [10.8, 10.8, 3, 0, "stand"]] },
        cust("c2", 0, WIN[1], 1, "papers"), cust("c1", 17, WIN[0], 3, ""), cust("c3", 31, WIN[2], 5, "papers"),
        { id: "atm", looks, seed: 2, off: 9, nodes: [[9, 11.6, 14, 1, "hide"], [9, 10.4, 0], [14.0, 10.7, 0], [14.0, 6.4, 0], [15.3, 6.4, 5.5, 3, "stand"], [14.0, 6.4, 0], [14.0, 10.7, 0], [9, 10.4, 0], [9, 11.6, 0]] },
        { id: "wt1", look: looks[2], nodes: [[5.8, 9.8, 60, 0, "sit", "papers", "", 0, 0.45]] }, { id: "wt2", look: looks[3], nodes: [[6.6, 9.8, 60, 0, "sit", "", "", 0, 0.45]] }
      ];
    }
  };
})();
