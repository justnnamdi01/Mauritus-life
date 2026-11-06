"use strict";
// Port Louis' Central Market hall: two rows of stalls under striped canopies (fruit, vegetables, spices, fish, flowers, cloth), a delivery lorry at the back,
// hanging flags, porters who carry crates from the lorry to the stalls, sellers who call out, and shoppers with baskets who browse and buy.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, plant, blk, staffLook, NOT_WORK, IS_WORK } = X;
  const SX = [6.5, 10.5, 14.5, 18.5], RA = 4.2, RB = 8.2, KINDS = ["fruit", "veg", "spice", "fish", "flower", "cloth", "veg", "fruit"], CAN = ["#e4572e", "#2a6fb0", "#f2b544", "#3d8c4a", "#c2457a", "#2aa4a0", "#7a4fd1", "#e4572e"];
  const stall = (gr, x, z, kind, col) => {
    B(gr, 2.6, 0.85, 0.9, "#8a5a34", x, 0.43, z); B(gr, 2.7, 0.06, 1.0, "#c49a6c", x, 0.88, z); for (const dx of [-1.25, 1.25]) for (const dz of [-0.45, 0.45]) C(gr, 0.04, 0.04, 2.3, "#6b4a2a", x + dx, 1.15, z + dz, 6);
    for (let i = 0; i < 6; i++) B(gr, 0.46, 0.05, 1.2, i % 2 ? "#f4f1e8" : col, x - 1.15 + i * 0.46, 2.35 + 0.0, z, 0).rotation.x = 0;
    B(gr, 2.8, 0.18, 0.04, col, x, 2.2, z + 0.62);
    if (kind === "fruit") for (let i = 0; i < 12; i++) S(gr, 0.12, ["#f2b544", "#e4572e", "#c0392b", "#7bb43d", "#f2822e"][i % 5], x - 1.0 + (i % 6) * 0.4, 1.0 + Math.floor(i / 6) * 0.2, z + (i % 2) * 0.2 - 0.1);
    else if (kind === "veg") for (let i = 0; i < 6; i++) { B(gr, 0.34, 0.2, 0.4, "#b98a4b", x - 1.0 + i * 0.4, 1.0, z); for (let j = 0; j < 3; j++) S(gr, 0.1, ["#3d8c4a", "#c0392b", "#7bb43d", "#d9a441", "#8a3a8a"][(i + j) % 5], x - 1.05 + i * 0.4 + j * 0.1 - 0.1, 1.17, z); }
    else if (kind === "spice") for (let i = 0; i < 6; i++) { const c = C(gr, 0.0, 0.17, 0.3, ["#e4572e", "#f2b544", "#8a4a1c", "#3d8c4a", "#c0392b", "#d9a441"][i], x - 1.0 + i * 0.4, 1.06, z, 8); }
    else if (kind === "fish") { B(gr, 2.3, 0.1, 0.7, "#cfe3ec", x, 0.95, z); for (let i = 0; i < 6; i++) { const f = S(gr, 0.13, ["#7a8a95", "#b9c4cc", "#c0392b", "#8a9aa5"][i % 4], x - 0.9 + i * 0.36, 1.05, z + (i % 2) * 0.2 - 0.1); f.scale.set(1.8, 0.6, 0.8); } }
    else if (kind === "flower") for (let i = 0; i < 8; i++) { C(gr, 0.1, 0.07, 0.3, "#9aa4ab", x - 1.0 + i * 0.28, 1.05, z, 8); for (let j = 0; j < 3; j++) S(gr, 0.08, ["#e4572e", "#f2b544", "#c2457a", "#ffffff", "#7a4fd1"][(i + j) % 5], x - 1.0 + i * 0.28 + j * 0.05 - 0.05, 1.28 + j * 0.03, z); }
    else for (let i = 0; i < 6; i++) { const r = C(gr, 0.1, 0.1, 0.8, ["#c2457a", "#2a6fb0", "#f2b544", "#3d8c4a", "#e4572e", "#7a4fd1"][i], x - 1.0 + i * 0.4, 1.3, z - 0.1, 10); r.rotation.z = 0.3; }
  };
  X.WK.bazar = {
    w: 22, h: 14, accent: "#b98a4b", mood: "gold", floor: ["#d9c7a0", "#cdb98c"],
    floorAt: (x, y) => (Math.abs(y - 6.0) < 1.6 || y > 10.2 ? ["#cdbd97", "#c2b18a"] : ["#d9c7a0", "#cdb98c"]),
    st: [["📦", "Delivery bay (staff only)", "none", 4.6, 4.9, IS_WORK], ["🧺", "The market", "none", 11.0, 12.3, NOT_WORK]],
    block(set) { for (const x of SX) { blk(set, x - 1.3, RA - 0.5, x + 1.3, RA + 0.5); blk(set, x - 1.3, RB - 0.5, x + 1.3, RB + 0.5); } blk(set, 1, 1, 4.2, 3.5); },
    spots: [{ lv: [0], x: 4.9, y: 4.0, face: 2, pose: "stack", prop: "crate" }, { lv: [1, 2], x: SX[1], y: RA - 0.95, face: 0, pose: "call" }, { pt: true, x: SX[2], y: RB - 0.95, face: 0, pose: "serve" }],
    build(gr, w, h) {
      // the lorry at the back, with crates on the ramp
      B(gr, 3.2, 1.7, 1.6, "#e8e2d2", 2.6, 0.95, 2.4); B(gr, 1.0, 1.3, 1.5, "#2a6fb0", 4.4, 0.75, 2.4); B(gr, 0.04, 0.5, 1.1, "#8fd0ff", 4.92, 0.95, 2.4); for (const dz of [-0.6, 0.6]) C(gr, 0.32, 0.32, 0.3, "#222", 4.0, 0.3, 2.4 + dz * 1.2, 12).rotation.x = Math.PI / 2; B(gr, 0.7, 0.05, 1.6, "#6b4a2a", 4.95, 0.55, 2.4).rotation.z = 0.15;
      for (let i = 0; i < 4; i++) B(gr, 0.5, 0.32, 0.4, "#b98a4b", 5.3 + (i % 2) * 0.55, 0.16 + Math.floor(i / 2) * 0.32, 3.1 + (i % 2) * 0.2); signAt(gr, "LIVRAISON", 2.6, 2.4, 1.05, 0.28, "#14222b", "#f2e6c8");
      SX.forEach((x, i) => { stall(gr, x, RA, KINDS[i], CAN[i]); stall(gr, x, RB, KINDS[i + 4] || "veg", CAN[i + 4] || "#e4572e"); });
      // bunting across the aisle
      for (let r = 0; r < 2; r++) for (let i = 0; i < 26; i++) { const f = B(gr, 0.28, 0.34, 0.02, ["#e4572e", "#f2b544", "#2a6fb0", "#3d8c4a", "#c2457a", "#ffffff"][(i + r) % 6], 3.5 + i * 0.6, 3.05 - Math.sin(i / 25 * Math.PI) * 0.1, 6.0 + r * 0.0); f.rotation.z = 0.0; } B(gr, 15.5, 0.02, 0.02, "#6b4a2a", 11.0, 3.2, 6.0);
      signAt(gr, "BAZAR CENTRAL · CENTRAL MARKET", 12.0, 2.55, 1.05, 0.45, "#7a3c1c", "#f6e6c4");
      for (let i = 0; i < 6; i++) { C(gr, 0.28, 0.22, 0.4, "#b98a4b", 2.0 + i * 0.05, 0.2, 8.4 + i * 0.55, 10); } for (let i = 0; i < 5; i++) B(gr, 0.5, 0.3, 0.4, "#c49a6c", 20.5, 0.15 + (i % 3) * 0.3, 10.5 + Math.floor(i / 3) * 0.5);
      plant(gr, 1.6, 12.6); plant(gr, 20.4, 12.8);
    },
    actors(looks) {
      const vendor = (id, x, z, i, say, yieldI) => Object.assign({ id, look: staffLook(i, "market", { hs: i % 2 ? "bun" : "short" }), off: i * 3, nodes: [[x, z, 8, 0, "call", "", say], [x, z, 6, 0, "serve"]] }, yieldI !== undefined ? { yield: yieldI } : {});
      const shop = (id, off, seed, a, b) => ({ id, looks, seed, off, nodes: [[11, 13.6, 4, 1, "hide"], [11, 12.6, 0], [8.5, 11.0, 0], [8.5, 9.4, 0], [a, RB + 0.95, 4.5, 1, "stand", "basket", "Combien le kilo?"], [8.5, 9.4, 0], [8.5, 5.7, 0], [b, RA + 0.95, 4.5, 1, "stand", "basket", "Ça c'est frais?"], [8.5, 5.7, 0], [8.5, 11.0, 0], [11, 12.6, 0], [11, 13.6, 0]] });
      return [
        vendor("va1", SX[0], RA - 0.95, 0, "Mangues, mangues!"), vendor("va2", SX[1], RA - 0.95, 1, "Brèdes fraîches!", 1), vendor("va3", SX[2], RA - 0.95, 2, "Safran, cumin, piment!"), vendor("va4", SX[3], RA - 0.95, 3, "Poisson du jour!"),
        vendor("vb1", SX[0], RB - 0.95, 4, "Ananas Victoria!"), vendor("vb2", SX[1], RB - 0.95, 5, "Des fleurs!"), vendor("vb3", SX[2], RB - 0.95, 6, "Tissus, tissus!", 2), vendor("vb4", SX[3], RB - 0.95, 7, "Litchis, litchis!"),
        { id: "p1", look: staffLook(8, "market"), yield: 0, nodes: [[4.9, 4.0, 5, 2, "stack", "crate"], [4.9, 4.0, 1.5, 2, "carry", "crate", "", 1], [SX[0] - 0.4, 3.3, 3, 0, "stand", "crate"], [4.9, 4.0, 0]] },
        { id: "p2", look: staffLook(9, "market"), off: 13, nodes: [[4.9, 4.6, 4, 2, "stack", "crate"], [4.9, 4.6, 1.5, 2, "carry", "crate", "", 1], [4.9, 5.7, 0, 2, "carry", "crate", "", 1], [8.5, 5.7, 0, 2, "carry", "crate", "", 1], [SX[1] - 0.2, 5.7, 3, 1, "stand", "crate"], [8.5, 5.7, 0], [4.9, 5.7, 0], [4.9, 4.6, 0]] },
        shop("s1", 0, 1, 6.5, 6.5), shop("s2", 15, 3, 14.5, 18.5), shop("s3", 29, 5, 10.5, 14.5), shop("s4", 40, 7, 18.5, 10.5)
      ];
    }
  };
})();
