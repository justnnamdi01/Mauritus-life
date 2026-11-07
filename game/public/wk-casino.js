"use strict";
// The Port Louis casino: red carpet, chandeliers, a roulette table with a real spinning wheel and ball, a blackjack table that shows the actual cards,
// a row of slot machines whose reels spin and stop on the symbols the server drew, a cashier's cage, a bar, dealers, gamblers and a waitress.
// When you play, your character walks to the table or sits at the machine, and the game opens as a sheet so you can watch the room above it.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, counter, chair, stool, plant, rope, blk, staffLook, NOT_WORK, IS_WORK } = X;
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26], RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const RT = { x: 6.5, z: 6.8 }, BJ = { x: 14.0, z: 6.8 }, SLOT_X = (i) => 3.0 + i * 1.15, MY_SLOT = 2, SYM = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
  const CAS = X.CAS = { wheel: null, ball: null, ballA: 0, wheelSpeed: 0.01, cards: null, sig: "", slots: [], gr: null, t: 0 };
  const feltTex = () => { const c = document.createElement("canvas"); c.width = 384; c.height = 132; const g = c.getContext("2d"); g.fillStyle = "#0f6b3a"; g.fillRect(0, 0, 384, 132); g.strokeStyle = "#e8e2c0"; g.lineWidth = 2; g.strokeRect(4, 4, 376, 124); g.font = "bold 20px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#1a8f3a"; g.fillRect(8, 8, 34, 116); g.fillStyle = "#e8e2c0"; g.fillText("0", 25, 66);
    for (let n = 1; n <= 36; n++) { const col = Math.floor((n - 1) / 3), row = 2 - ((n - 1) % 3), x = 46 + col * 27, y = 8 + row * 38; g.fillStyle = RED.has(n) ? "#b3261e" : "#17171a"; g.fillRect(x, y, 26, 37); g.strokeStyle = "#e8e2c0"; g.strokeRect(x, y, 26, 37); g.fillStyle = "#fff"; g.font = "bold 14px sans-serif"; g.fillText(String(n), x + 13, y + 19); } const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; };
  const chips = (gr, x, z) => { for (let i = 0; i < 5; i++) C(gr, 0.09, 0.09, 0.025, ["#c0392b", "#17171a", "#2a6fb0", "#3d8c4a", "#f2b544"][i % 5], x + (i % 2) * 0.12, 0.93 + Math.floor(i / 2) * 0.026, z + (i % 3) * 0.05, 12); };
  function roulette(gr) {
    const x = RT.x, z = RT.z; B(gr, 3.8, 0.8, 1.8, "#3a2214", x, 0.4, z); B(gr, 3.9, 0.1, 1.9, "#6b4428", x, 0.84, z); const felt = mesh(new THREE.PlaneGeometry(2.6, 0.96), new THREE.MeshBasicMaterial({ map: feltTex() }), x + 0.55, 0.905, z + 0.05, gr, false); felt.rotation.x = -Math.PI / 2; B(gr, 1.2, 0.04, 1.6, "#0f6b3a", x - 1.3, 0.9, z);
    C(gr, 0.62, 0.66, 0.12, "#3a2214", x - 1.3, 0.95, z, 28); const wheel = new THREE.Group(); wheel.position.set(x - 1.3, 1.02, z); gr.add(wheel); C(wheel, 0.5, 0.5, 0.05, "#2a1a10", 0, 0, 0, 30);
    WHEEL.forEach((n, i) => { const a = i / 37 * Math.PI * 2, m = box(0.1, 0.05, 0.17, n === 0 ? "#1a8f3a" : RED.has(n) ? "#b3261e" : "#17171a", Math.cos(a) * 0.38, 0.03, Math.sin(a) * 0.38, wheel); m.rotation.y = -a; }); C(wheel, 0.22, 0.22, 0.06, "#c9a227", 0, 0.06, 0, 16); C(wheel, 0.03, 0.03, 0.2, "#c9a227", 0, 0.16, 0, 8); S(wheel, 0.05, "#c9a227", 0, 0.28, 0);
    const ball = sph(0.035, "#ffffff", 0.5, 0.07, 0, wheel, 8); CAS.wheel = wheel; CAS.ball = ball; chips(gr, x + 0.2, z + 0.3); chips(gr, x + 1.0, z - 0.2); chips(gr, x + 0.6, z + 0.5);
  }
  function blackjack(gr) {
    const x = BJ.x, z = BJ.z; B(gr, 3.4, 0.8, 1.7, "#3a2214", x, 0.4, z); B(gr, 3.5, 0.1, 1.8, "#6b4428", x, 0.84, z); B(gr, 3.2, 0.04, 1.5, "#0f6b3a", x, 0.9, z); for (let i = 0; i < 3; i++) { const r = C(gr, 0.22, 0.22, 0.005, "#e8e2c0", x - 0.9 + i * 0.9, 0.925, z + 0.35, 20); r.material = new THREE.MeshBasicMaterial({ color: 0x0b4f2a }); } signAt(gr, "BLACKJACK PAYS 3 TO 2", x, 0.93, z + 0.05, 0.1, "#0f6b3a", "#e8e2c0", 0).rotation.x = -Math.PI / 2; chips(gr, x + 1.2, z - 0.4); CAS.gr = gr;
    for (const dx of [-1.1, 0, 1.1]) stool(gr, x + dx, 8.5, 0.62, "#8a2f2f");
  }
  function slotMachine(gr, i) {
    const x = SLOT_X(i), z = 1.75, col = ["#b3261e", "#2a6fb0", "#c9a227", "#3d8c4a", "#7a4fd1", "#e4572e", "#2aa4a0", "#c2457a"][i]; B(gr, 0.9, 1.7, 0.7, col, x, 0.85, z); B(gr, 0.92, 0.3, 0.74, "#17171a", x, 1.85, z); signAt(gr, i === MY_SLOT ? "LUCKY 7" : "JACKPOT", x, 1.86, z + 0.38, 0.17, "#17171a", "#ffd23c"); B(gr, 0.7, 0.4, 0.06, "#0c0c10", x, 1.25, z + 0.34);
    const mats = []; for (let k = 0; k < 3; k++) { const m = new THREE.MeshBasicMaterial({ map: emojiTex(SYM[(i + k * 2) % 6]), transparent: true }); mesh(new THREE.PlaneGeometry(0.2, 0.2), m, x - 0.22 + k * 0.22, 1.25, z + 0.38, gr, false); mats.push(m); } CAS.slots[i] = mats;
    B(gr, 0.7, 0.14, 0.4, "#17171a", x, 0.78, z + 0.4); for (let k = 0; k < 3; k++) glowAt(gr, [0xff3030, 0xffd23c, 0x30ff60][k], 0.04, x - 0.2 + k * 0.2, 0.86, z + 0.55); C(gr, 0.03, 0.03, 0.5, "#c9ced3", x + 0.52, 1.1, z + 0.1, 6); S(gr, 0.08, "#c0392b", x + 0.52, 1.4, z + 0.1); for (let k = 0; k < 6; k++) glowAt(gr, 0xffd98a, 0.035, x - 0.4 + k * 0.16, 2.02, z + 0.38); stool(gr, x, 2.9, 0.62, "#8a2f2f");
  }
  function chandelier(gr, x, z) { C(gr, 0.02, 0.02, 0.8, "#c9a227", x, 3.0, z, 4); const r = C(gr, 0.5, 0.5, 0.04, "#c9a227", x, 2.55, z, 20); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; glowAt(gr, 0xffe2a0, 0.06, x + Math.cos(a) * 0.5, 2.6, z + Math.sin(a) * 0.5); C(gr, 0.015, 0.015, 0.2, "#e8e2c0", x + Math.cos(a) * 0.5, 2.45, z + Math.sin(a) * 0.5, 4); } C(gr, 0.2, 0.05, 0.4, "#e8e2c0", x, 2.3, z, 8); }
  X.ticks.push((now, def) => { if (def.wk !== "casinoPL") return; CAS.t = now / 1000; const busy = (typeof CSN !== "undefined") && CSN.busy, game = typeof CSN !== "undefined" ? CSN.game : "", open = !!document.getElementById("csn");
    if (CAS.wheel) { const spin = busy && game === "roulette"; CAS.wheelSpeed += ((spin ? 0.22 : 0.012) - CAS.wheelSpeed) * 0.05; CAS.wheel.rotation.y += CAS.wheelSpeed; const tgt = typeof CSN !== "undefined" && CSN.n !== undefined ? WHEEL.indexOf(CSN.n) / 37 * Math.PI * 2 : 0; if (spin) { CAS.ballA -= 0.5; CAS.ball.position.set(Math.cos(CAS.ballA) * 0.5, 0.07, Math.sin(CAS.ballA) * 0.5); } else { let d = tgt - CAS.ballA; d = Math.atan2(Math.sin(d), Math.cos(d)); CAS.ballA += d * 0.08; const rr = CAS.ball.position.length(); const nr = rr + (0.38 - rr) * 0.08; CAS.ball.position.set(Math.cos(CAS.ballA) * nr, 0.07, Math.sin(CAS.ballA) * nr); } }
    for (let i = 0; i < CAS.slots.length; i++) { const mats = CAS.slots[i]; if (!mats) continue; if (i === MY_SLOT && X.at && X.game === "slots") { if (busy && game === "slots") { if (((now / 90) | 0) !== CAS.rt) { CAS.rt = (now / 90) | 0; for (const m of mats) { m.map = emojiTex(SYM[(Math.random() * 6) | 0]); m.needsUpdate = true; } } } else if (CSN.reels && CAS.shown !== CSN.reels.join("")) { CAS.shown = CSN.reels.join(""); CSN.reels.forEach((sy, k) => { mats[k].map = emojiTex(sy); mats[k].needsUpdate = true; }); } } else { const tk = ((now / 1800 + i * 0.37) | 0); if (mats.tk !== tk) { mats.tk = tk; mats.forEach((m, k) => { m.map = emojiTex(SYM[(tk * 3 + k * 5 + i) % 6]); m.needsUpdate = true; }); } } }
    const v = typeof CSN !== "undefined" && game === "bj" && open ? CSN.view : null, sig = v ? v.player.join(",") + "|" + v.dealer.join(",") : ""; if (sig !== CAS.sig && CAS.gr) { CAS.sig = sig; if (CAS.cards) { CAS.gr.remove(CAS.cards); CAS.cards = null; } if (v) { const g = new THREE.Group(); const put = (cs, z0, ry) => cs.forEach((c, i) => { const back = c === "??", suit = back ? "" : c.slice(-1), red = suit === "♥" || suit === "♦", m = mesh(new THREE.PlaneGeometry(0.24, 0.34), new THREE.MeshBasicMaterial({ map: back ? textTex("🂠", "#1f3d8a", "#ffffff", 40) : textTex(c, "#ffffff", red ? "#b3261e" : "#17171a", 40) }), BJ.x - 0.6 + i * 0.3, 0.935 + i * 0.002, z0, g, false); m.rotation.x = -Math.PI / 2; m.rotation.z = ry + i * 0.05; }); put(v.dealer, BJ.z - 0.4, 0.05); put(v.player, BJ.z + 0.35, -0.04); CAS.gr.add(g); CAS.cards = g; } } });
  X.WK.casinoPL = {
    w: 22, h: 14, accent: "#4a0c17", mood: "party", floor: ["#4a0c17", "#400a14"],
    floorAt: (x, y) => (Math.abs(x - 11) < 1.1 || Math.abs(y - 9.5) < 0.5 ? ["#6b1424", "#5f1120"] : ["#4a0c17", "#400a14"]),
    st: [["🎡", "Roulette table", "none", RT.x, 9.3, /Roulette/], ["🃏", "Blackjack table", "none", BJ.x, 9.3, /Blackjack/], ["🎰", "Slot machines", "none", SLOT_X(MY_SLOT), 3.9, /Slots/], ["💵", "Cashier", "none", 17.5, 3.7, /Rules|cashier|Ask/i]],
    block(set) { blk(set, 4.7, 5.95, 8.3, 7.65); blk(set, 12.4, 6.0, 15.6, 7.6); blk(set, 3.0, 1, 11.6, 1.99); blk(set, 15.5, 2, 19.6, 2.99); blk(set, 19.0, 7, 19.99, 11.99); },
    games: { roulette: { x: RT.x, y: 8.5, face: 1, pose: "bet" }, bj: { x: BJ.x, y: 8.5, face: 1, pose: "work", h: 0.62 }, slots: { x: SLOT_X(MY_SLOT), y: 2.9, face: 1, pose: "work", h: 0.65 } },
    spots: [],
    build(gr, w, h) {
      for (let i = 0; i < 8; i++) slotMachine(gr, i); roulette(gr); blackjack(gr); for (const [x, z] of [[7.5, 4.8], [14.0, 4.8], [11, 10.5], [4, 10.5], [18, 6]]) chandelier(gr, x, z);
      for (const [x, z] of [[1.4, 1.4], [20.6, 1.4], [1.4, 12.6], [20.6, 12.6]]) { C(gr, 0.22, 0.26, 2.6, "#c9a227", x, 1.3, z, 12); C(gr, 0.3, 0.3, 0.1, "#e8d27a", x, 2.65, z, 12); }
      signAt(gr, "CASINO · WOLMAR SANDS", 11.0, 2.6, 1.04, 0.55, "#2a0610", "#ffd23c"); glowAt(gr, 0xff3a5a, 0.1, 6.5, 2.5, 1.06); glowAt(gr, 0xff3a5a, 0.1, 15.5, 2.5, 1.06);
      // cashier's cage
      counter(gr, 17.5, 2.6, 4.2, 0.7, "#2a0f14", "#c9a227", 1.05); for (let i = 0; i < 9; i++) B(gr, 0.04, 0.9, 0.04, "#c9a227", 15.6 + i * 0.5, 1.5, 2.6); B(gr, 4.2, 0.05, 0.08, "#c9a227", 17.5, 1.97, 2.6); signAt(gr, "CAISSE · CASHIER", 17.5, 2.5, 1.06, 0.3, "#2a0610", "#ffd23c"); for (let i = 0; i < 4; i++) C(gr, 0.1, 0.1, 0.08 + i * 0.03, ["#c0392b", "#17171a", "#2a6fb0", "#3d8c4a"][i], 16.4 + i * 0.3, 1.1, 2.5, 10);
      // the bar
      counter(gr, 19.5, 9.5, 0.8, 5.0, "#2a1a10", "#6b4428", 1.05); B(gr, 0.4, 1.7, 5.0, "#1a100a", 20.9, 0.85, 9.5); for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) C(gr, 0.05, 0.06, 0.25, ["#7fd6c8", "#ffa733", "#e4572e", "#c9a227", "#b07be0"][(i + r) % 5], 20.75, 1.0 + r * 0.42, 7.2 + i * 0.4, 8); for (const y of [8.0, 9.0, 10.0, 11.0]) stool(gr, 18.4, y, 0.65, "#8a2f2f"); signAt(gr, "BAR", 19.4, 2.2, 7.0, 0.3, "#2a0610", "#ffd23c", Math.PI / 2);
      rope(gr, 9.4, 11.4, 9.4, 12.6, "#b3261e"); rope(gr, 12.6, 11.4, 12.6, 12.6, "#b3261e"); plant(gr, 2.0, 12.4); plant(gr, 20.0, 12.6); B(gr, 22, 0.02, 0.5, "#c9a227", 11.0, 0.02, 5.2);
    },
    actors(looks) {
      const slot = (id, i, look, off) => ({ id, look, off, nodes: [[SLOT_X(i), 2.9, 6, 1, "work", "", "", 0, 0.65], [SLOT_X(i), 2.9, 2.5, 1, "stand", "", "", 0, 0.65]] }), seat = (id, look, x, y, f, pose, h, off) => ({ id, look, off: off || 0, nodes: [[x, y, 60, f, pose, "", "", 0, h || 0]] });
      return [
        { id: "dr", look: staffLook(0, "bank", { shirt: "#17171a", pants: "#17171a", hs: "bun" }), nodes: [[RT.x, 5.4, 7, 0, "serve"], [RT.x, 5.4, 6, 0, "stand", "", "Rien ne va plus!"]] },
        { id: "db", look: staffLook(1, "bank", { shirt: "#17171a", pants: "#17171a" }), nodes: [[BJ.x, 5.4, 6, 0, "work"], [BJ.x, 5.4, 5, 0, "serve", "", "Cartes?"]] },
        slot("g1", 0, looks[0], 0), slot("g2", 1, looks[1], 3), slot("g3", 4, looks[2], 5), slot("g4", 6, looks[3], 1),
        { id: "rt1", look: looks[4], nodes: [[5.0, 8.5, 8, 1, "bet"], [5.0, 8.5, 4, 1, "stand", "", "Rouge, comme toujours!"]] }, { id: "rt2", look: looks[5], off: 4, nodes: [[8.0, 8.5, 60, 1, "stand"]] },
        seat("b1", looks[6], BJ.x - 1.1, 8.5, 1, "work", 0.62, 2), seat("b2", looks[7], BJ.x + 1.1, 8.5, 1, "work", 0.62, 5),
        { id: "cash", look: staffLook(2, "bank", { shirt: "#17171a", pants: "#17171a" }), nodes: [[17.5, 1.7, 9, 0, "scan"], [17.5, 1.7, 6, 0, "stand", "", "Vos jetons, monsieur."]] },
        { id: "bt", look: staffLook(3, "bar", { hs: "short" }), nodes: [[20.5, 9.0, 6, 2, "pour", "bottle"], [20.5, 10.4, 5, 2, "wipe"], [20.5, 8.0, 5, 2, "pour", "glass", "Un cocktail?"]] },
        { id: "bp1", look: looks[2], off: 3, nodes: [[18.4, 9.0, 60, 3, "drink", "glass", "", 0, 0.65]] }, { id: "bp2", look: looks[1], off: 8, nodes: [[18.4, 11.0, 60, 3, "drink", "glass", "", 0, 0.65]] },
        { id: "wt", look: staffLook(4, "bar", { hs: "bun", shirt: "#b3261e" }), spd: 1.3, nodes: [[18.0, 12.2, 2, 1, "stand", "tray", "", 1], [11.0, 9.5, 2.4, 1, "stand", "tray", "Un verre, messieurs-dames?", 1], [7.0, 9.5, 2.4, 1, "stand", "tray", "", 1], [14.0, 9.5, 2.4, 1, "stand", "tray", "", 1], [18.0, 12.2, 0]] },
        { id: "gd", look: staffLook(5, "guard", { cap: "#17171a" }), spd: 0.8, nodes: [[8.4, 12.2, 8, 0, "stand", "", "Bonsoir."], [13.6, 12.2, 8, 0, "stand"]] },
        { id: "vis", looks, seed: 2, off: 6, nodes: [[11, 13.6, 10, 1, "hide"], [11, 12.6, 0], [11, 9.6, 0], [SLOT_X(6), 9.6, 0], [SLOT_X(6), 3.3, 6, 1, "stand"], [SLOT_X(6), 9.6, 0], [11, 9.6, 0], [11, 12.6, 0], [11, 13.6, 0]] }
      ];
    }
  };
})();
