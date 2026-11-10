"use strict";
// A supermarket: fridge wall and a produce island at the back, three double-sided aisles of shelves, two checkouts with conveyor belts and cashiers,
// trolleys at the door, a clothes corner, shoppers with baskets who browse, queue and pay, and a stock clerk filling shelves from a cart.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, counter, plant, shelfUnit, fridge, blk, staffLook, NOT_WORK, IS_WORK, chair } = X;
  const AISLES = [5.5, 7.5, 9.5];
  const cartAt = (gr, x, z, ry) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; box(0.7, 0.05, 0.5, "#6b7782", 0, 0.45, 0, g); box(0.7, 0.35, 0.04, "#6b7782", 0, 0.65, -0.25, g); for (const dx of [-0.34, 0.34]) box(0.04, 0.35, 0.5, "#6b7782", dx, 0.65, 0, g); for (const [dx, dz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) box(0.06, 0.1, 0.06, "#222", dx, 0.05, dz, g); gr.add(g); };
  X.WK.mall = {
    w: 22, h: 14, accent: "#3a6ea5", mood: "cool", floor: ["#e6e8ea", "#d6dade"],
    floorAt: (x, y) => (y < 3 ? ["#c9ced3", "#bfc5ca"] : (x >= 14 && y >= 8 ? ["#dfe5ea", "#d2dae0"] : ["#e6e8ea", "#d6dade"])),
    st: [["📦", "Stockroom (staff only)", "none", 3.0, 3.6, IS_WORK], ["🛎️", "Customer service", "none", 11.0, 12.0, NOT_WORK], ["👗", "Fashion corner", "none", 18.5, 3.6, /Fashion|Designer|dress|shoes|bags/i]],
    block(set) { for (const y of AISLES) blk(set, 3.0, y - 0.49, 12.5, y + 0.49); blk(set, 3.0, 1, 14.4, 1.99); blk(set, 8.0, 3.0, 10.6, 3.99); blk(set, 15.2, 10.0, 17.0, 10.99); blk(set, 18.8, 10.0, 20.6, 10.99); blk(set, 16.8, 1, 20.6, 1.99); },
    spots: [{ lv: [0], x: 2.4, y: 5.5, face: 3, pose: "stack", prop: "box" }, { pt: true, x: 2.4, y: 5.5, face: 3, pose: "stack", prop: "box" }],
    build(gr, w, h) {
      // fridge wall and produce island at the back
      for (let i = 0; i < 6; i++) { fridge(gr, 3.5 + i * 1.1, 1.5, "#dfe9ee"); glass(gr, 0.9, 1.7, 0.04, 3.5 + i * 1.1, 1.0, 1.95); for (let j = 0; j < 4; j++) B(gr, 0.7, 0.1, 0.02, ["#f6b3c8", "#9bd9b0", "#f7e3a1", "#b9d9f2"][(i + j) % 4], 3.5 + i * 1.1, 0.4 + j * 0.4, 1.93); } signAt(gr, "FRAIS · FRESH", 7.0, 2.55, 1.04, 0.3, "#2a6fb0", "#fff");
      B(gr, 2.6, 0.7, 1.0, "#8a5a34", 9.3, 0.35, 3.5); for (let i = 0; i < 9; i++) S(gr, 0.13, ["#e4572e", "#f2b544", "#3d8c4a", "#c0392b", "#d9a441"][i % 5], 8.3 + (i % 5) * 0.4, 0.85, 3.3 + Math.floor(i / 5) * 0.4); B(gr, 2.7, 0.08, 1.1, "#c49a6c", 9.3, 0.72, 3.5);
      // three aisles of shelving, back to back, with signs
      AISLES.forEach((y, i) => { shelfUnit(gr, 7.75, y - 0.22, 9.5, 0.4, 2, 0, null, "#d7dde2"); shelfUnit(gr, 7.75, y + 0.22, 9.5, 0.4, 2, Math.PI, null, "#d7dde2"); signAt(gr, ["RIZ · PÂTES", "BOISSONS", "ÉPICES · CONSERVES"][i], 12.9, 2.6, y, 0.22, "#2a6fb0", "#fff", -Math.PI / 2); });
      // checkouts: belts, scanners, cashiers' stools, a candy rack
      for (const x of [16.1, 19.7]) { B(gr, 1.8, 0.85, 0.7, "#6b7782", x, 0.43, 10.0); B(gr, 1.4, 0.04, 0.5, "#23272b", x - 0.1, 0.88, 10.0); B(gr, 0.4, 0.3, 0.3, "#2a2e33", x + 0.65, 1.0, 10.0); glowAt(gr, 0xff3030, 0.04, x + 0.65, 1.0, 9.85); B(gr, 0.5, 0.34, 0.04, "#1e2226", x + 0.5, 1.3, 10.2); B(gr, 0.04, 0.9, 0.5, "#cfd4d8", x - 0.95, 0.5, 8.9); signAt(gr, "CAISSE", x, 2.2, 10.0, 0.3, "#c0392b", "#fff"); chair(gr, x, 11.1, 1, "#2a2e35"); }
      for (let i = 0; i < 4; i++) cartAt(gr, 18.2 + (i % 2) * 0.1, 12.4 - i * 0.45, 0.2); for (let i = 0; i < 3; i++) B(gr, 0.4, 0.2, 0.3, "#d9a441", 14.2, 0.1 + i * 0.2, 12.4); // trolleys and stacked baskets
      // clothes corner
      for (let i = 0; i < 3; i++) { B(gr, 1.4, 0.04, 0.04, "#9aa4ab", 17.6 + i * 1.5, 1.4, 2.8); for (let j = 0; j < 5; j++) B(gr, 0.2, 0.55, 0.06, ["#c2457a", "#2a6fb0", "#f2b544", "#3d8c4a", "#e4572e"][(i + j) % 5], 17.1 + i * 1.5 + j * 0.25, 1.1, 2.8); C(gr, 0.03, 0.03, 1.4, "#9aa4ab", 16.9 + i * 1.5, 0.7, 2.8, 6); C(gr, 0.03, 0.03, 1.4, "#9aa4ab", 18.3 + i * 1.5, 0.7, 2.8, 6); }
      // the stock clerk's cart and boxes at the end of aisle 1
      cartAt(gr, 1.9, 5.3, Math.PI / 2); for (let i = 0; i < 4; i++) B(gr, 0.4, 0.3, 0.35, "#c49a6c", 1.7 + (i % 2) * 0.1, 0.65 + Math.floor(i / 2) * 0.3, 5.1 + (i % 2) * 0.35); B(gr, 0.8, 0.5, 0.5, "#c49a6c", 1.6, 0.25, 6.7);
      signAt(gr, "SUPERMARCHÉ", 14.0, 3.0, 1.05, 0.45, "#c0392b", "#fff"); plant(gr, 1.7, 12.6); plant(gr, 20.4, 12.8);
    },
    actors(looks) {
      const shop = (id, off, seed, pick, basket) => ({ id, looks, seed, off, nodes: [[11, 13.6, 6, 1, "hide"], [11, 12.8, 0], [13.4, 11.6, 0], [13.4, 6.5, 0], [pick[0], 6.5, 3, 1, "stand", basket], [13.4, 6.5, 0, 1, "stand", basket], [13.4, 8.5, 0, 1, "stand", basket], [pick[1], 8.5, 3, 1, "stand", basket], [13.4, 8.5, 0, 1, "stand", basket], [13.4, 9.2, 0, 1, "stand", basket], [pick[2], 9.2, 4.5, 1, "stand", basket], [13.4, 9.2, 0], [13.4, 11.6, 0], [11, 12.8, 0], [11, 13.6, 0]] });
      return [
        { id: "stk", look: staffLook(0, "shop"), yield: 0, nodes: [[2.4, 5.5, 14, 3, "stack", "box"], [2.4, 5.5, 4, 3, "stand"]] },
        { id: "ck1", look: staffLook(1, "shop", { hs: "bun" }), nodes: [[16.1, 11.05, 11, 1, "scan"], [16.1, 11.05, 6, 1, "stand", "", "Bonjour! Un sac?"]] },
        { id: "ck2", look: staffLook(2, "shop"), nodes: [[19.7, 11.05, 9, 1, "scan"], [19.7, 11.05, 8, 1, "stand", "", "Merci, bonne journée!"]] },
        { id: "mg", look: staffLook(3, "bank", { cap: "#22364a" }), spd: 1.0, nodes: [[13.4, 11.4, 4, 0, "stand", "papers"], [13.4, 6.5, 5, 0, "stand", "papers"], [13.4, 11.8, 0, 0, "stand", "papers", "", 1], [4.0, 12.0, 4, 0, "stand", "papers", "", 1], [13.4, 11.8, 0]] },
        { id: "pd", look: staffLook(4, "shop", { hs: "bun" }), nodes: [[9.3, 2.55, 20, 0, "stand", "", "Mangues fraîches!"], [9.3, 2.55, 8, 0, "wipe"]] },
        shop("s1", 0, 1, [10, 11, 16.1], "basket"), shop("s2", 14, 4, [5, 6, 19.7], "basket"), shop("s3", 28, 2, [8, 4, 16.1], "basket"),
        { id: "pay1", looks, seed: 6, off: 5, nodes: [[11, 13.6, 8, 1, "hide"], [11, 12.8, 0], [13.4, 11.9, 0], [13.4, 9.2, 0], [16.1, 9.2, 8, 1, "stand", "basket", "Bonjour!"], [13.4, 9.2, 0], [13.4, 11.9, 0], [11, 12.8, 0], [11, 13.6, 0]] },
        { id: "pay2", looks, seed: 7, off: 20, nodes: [[11, 13.6, 10, 1, "hide"], [11, 12.8, 0], [13.4, 11.9, 0], [13.4, 9.2, 0], [19.7, 9.2, 8, 1, "stand", "basket", "Merci!"], [13.4, 9.2, 0], [13.4, 11.9, 0], [11, 12.8, 0], [11, 13.6, 0]] }
      ];
    }
  };
})();
