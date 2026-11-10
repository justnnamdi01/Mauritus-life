"use strict";
// The Games Room: neon cabinets with glowing screens, two racing seats, a claw machine with a moving claw, a dance mat with flashing arrows,
// a prize counter and a juice bar. Each game you start has a place: you walk to it and play it in front of the other players.
(function () {
  const X = window.WKX; if (!X) return; const { B, C, S, glass, glowAt, signAt, counter, chair, stool, plant, blk, staffLook, NOT_WORK } = X;
  const CAB = [3.0, 4.2, 5.4, 6.6, 7.8, 9.0], RACE = [[11.3, 3.6], [13.1, 3.6]], CLAW = { x: 14.2, z: 7.0 }, MAT = { x: 4.5, z: 7.8 }, JUICE = { x: 11.0, z: 8.5 };
  const ARC = X.ARC = { claw: null, tiles: [], t: 0 };
  X.WK.arcade = {
    w: 16, h: 11, accent: "#241741", mood: "party", floor: ["#1b1230", "#241741"],
    floorAt: (x, y) => ((x + y) % 4 < 1 ? ["#2a1a50", "#33205c"] : ["#1b1230", "#241741"]),
    st: [["🕹️", "The machines", "none", 6.0, 3.6, /Racing|Claw|Dance/], ["🥤", "Prize counter and juice", "none", JUICE.x, 9.4, /juice|Fresh|prize/i]],
    block(set) { blk(set, 2.5, 1, 9.6, 1.99); blk(set, 10.8, 1, 13.9, 1.99); blk(set, 13.5, 6.5, 14.9, 7.6); blk(set, 10.0, 8.0, 12.2, 8.99); },
    spots: [],
    actSpots: [{ re: /Racing/, x: RACE[0][0], y: 3.6, face: 1, pose: "work", h: 0.45 }, { re: /Claw/, x: 14.1, y: 8.5, face: 1, pose: "work" }, { re: /Dance mat/, x: MAT.x, y: MAT.z, face: 0, pose: "jog" }, { re: /juice|Fresh/i, x: JUICE.x, y: 9.5, face: 1, pose: "drink", prop: "glass" }],
    build(gr, w, h) {
      for (const [i, x] of CAB.entries()) { const col = ["#e4572e", "#2a6fb0", "#7a4fd1", "#3d8c4a", "#c2457a", "#f2b544"][i]; B(gr, 0.85, 1.7, 0.75, col, x, 0.85, 1.7); B(gr, 0.8, 0.34, 0.6, "#101018", x, 1.15, 1.85); const scr = B(gr, 0.62, 0.42, 0.04, "#101018", x, 1.15, 2.1); const gl = B(gr, 0.58, 0.38, 0.02, ["#7bff9a", "#7fd0ff", "#ff7be5", "#ffd23c", "#ff6a6a", "#9a7bff"][i], x, 1.15, 2.12); gl.material = new THREE.MeshBasicMaterial({ color: [0x7bff9a, 0x7fd0ff, 0xff7be5, 0xffd23c, 0xff6a6a, 0x9a7bff][i] }); ARC.tiles.push(gl); B(gr, 0.7, 0.1, 0.5, "#17171a", x, 0.75, 2.15); for (let k = 0; k < 3; k++) S(gr, 0.04, ["#ff3030", "#30ff60", "#3090ff"][k], x - 0.2 + k * 0.2, 0.83, 2.2); signAt(gr, ["ASTEROIDS", "PAC-MAN", "SPACE WAR", "FIGHT!", "DONKEY", "TETRIS"][i], x, 1.85, 2.1, 0.12, "#17171a", "#ffd23c"); }
      // racing seats with screens and wheels
      for (const [x, z] of RACE) { B(gr, 1.1, 1.4, 0.9, "#1b2a5a", x, 0.7, z - 0.45); B(gr, 0.9, 0.55, 0.05, "#101018", x, 1.35, z - 0.2); const gl = B(gr, 0.84, 0.5, 0.02, "#7fd0ff", x, 1.35, z - 0.17); gl.material = new THREE.MeshBasicMaterial({ color: 0x7fd0ff }); ARC.tiles.push(gl); const wh = C(gr, 0.17, 0.17, 0.03, "#17171a", x, 0.95, z + 0.05, 14); wh.rotation.x = 1.0; chair(gr, x, z + 0.55, 1, "#c0392b"); }
      signAt(gr, "RACING", 12.2, 2.4, 1.05, 0.3, "#1b2a5a", "#ffffff");
      // claw machine with a moving claw
      B(gr, 1.3, 0.7, 1.3, "#c0392b", CLAW.x, 0.35, CLAW.z); glass(gr, 1.3, 1.1, 1.3, CLAW.x, 1.25, CLAW.z); B(gr, 1.4, 0.15, 1.4, "#c0392b", CLAW.x, 1.85, CLAW.z); for (let i = 0; i < 9; i++) S(gr, 0.16, ["#f2b544", "#e4572e", "#3d8c4a", "#c2457a", "#2a6fb0", "#ffffff"][i % 6], CLAW.x - 0.45 + (i % 3) * 0.45, 0.85, CLAW.z - 0.4 + Math.floor(i / 3) * 0.4); const claw = new THREE.Group(); claw.position.set(CLAW.x, 1.7, CLAW.z); gr.add(claw); C(claw, 0.01, 0.01, 0.6, "#c9ced3", 0, -0.3, 0, 4); box(0.18, 0.1, 0.18, "#9aa4ab", 0, -0.62, 0, claw); for (const d of [-1, 1]) box(0.03, 0.2, 0.03, "#9aa4ab", d * 0.1, -0.74, 0, claw); ARC.claw = claw; signAt(gr, "CLAW", CLAW.x, 2.15, CLAW.z + 0.7, 0.25, "#c0392b", "#ffffff");
      // the dance mat: a platform of flashing arrows
      B(gr, 2.2, 0.1, 2.2, "#101018", MAT.x, 0.05, MAT.z); for (let i = 0; i < 9; i++) { const t = B(gr, 0.64, 0.04, 0.64, "#101018", MAT.x - 0.7 + (i % 3) * 0.7, 0.12, MAT.z - 0.7 + Math.floor(i / 3) * 0.7); t.material = new THREE.MeshBasicMaterial({ color: 0x3030a0 }); ARC.tiles.push(t); } signAt(gr, "DANCE MAT", MAT.x, 1.7, MAT.z - 1.4, 0.3, "#101018", "#ff7be5"); B(gr, 0.1, 1.7, 0.1, "#9aa4ab", MAT.x - 1.2, 0.85, MAT.z - 1.1); B(gr, 0.1, 1.7, 0.1, "#9aa4ab", MAT.x + 1.2, 0.85, MAT.z - 1.1); B(gr, 2.5, 0.08, 0.08, "#9aa4ab", MAT.x, 1.6, MAT.z - 1.1);
      // the prize counter and juice bar
      counter(gr, JUICE.x, 8.5, 2.4, 0.7, "#e4572e", "#f1ead4", 1.0); glass(gr, 2.3, 0.6, 0.6, JUICE.x, 1.35, 8.5); for (let i = 0; i < 6; i++) S(gr, 0.12, ["#f2b544", "#c2457a", "#2a6fb0", "#3d8c4a", "#e4572e", "#7a4fd1"][i], JUICE.x - 0.9 + i * 0.36, 1.18, 8.5); for (let i = 0; i < 4; i++) C(gr, 0.08, 0.07, 0.2, ["#f2b544", "#3d8c4a", "#c0392b", "#7a4fd1"][i], JUICE.x - 0.5 + i * 0.35, 1.1, 8.8, 8); signAt(gr, "JUS · PRIZES", JUICE.x, 2.1, 8.55, 0.28, "#e4572e", "#ffffff");
      signAt(gr, "GAMES ROOM", 8.0, 2.5, 1.04, 0.5, "#241741", "#ff7be5"); for (let i = 0; i < 8; i++) glowAt(gr, [0xff5a5a, 0xffd23c, 0x5ad1ff, 0xff7be5][i % 4], 0.07, 1.6 + i * 1.6, 2.9, 1.1); plant(gr, 1.5, 9.6); plant(gr, 14.6, 9.6);
    },
    actors(looks) {
      const cab = (id, i, look, off) => ({ id, look, off, nodes: [[CAB[i], 2.75, 7, 1, "work"], [CAB[i], 2.75, 3, 1, "stand"]] });
      return [
        cab("t1", 0, looks[0], 0), cab("t2", 2, looks[1], 3), cab("t3", 4, looks[2], 1), { id: "r1", look: looks[3], nodes: [[RACE[1][0], 4.15, 60, 1, "work", "", "", 0, 0.45]] },
        { id: "cl", look: looks[4], off: 2, nodes: [[14.1, 8.5, 9, 1, "work"], [14.1, 8.5, 4, 1, "stand", "", "Presque!"]] },
        { id: "dm", look: looks[5], off: 1, nodes: [[MAT.x, MAT.z, 40, 0, "jog"]] },
        { id: "at", look: staffLook(0, "shop", { shirt: "#7a4fd1" }), nodes: [[JUICE.x, 7.7, 9, 0, "scan"], [JUICE.x, 7.7, 6, 0, "stand", "", "Un jus de litchi?"]] },
        { id: "kid", looks, seed: 1, off: 5, nodes: [[8, 10.6, 8, 1, "hide"], [8, 9.8, 0], [9.0, 4.0, 0], [CAB[5], 3.2, 8, 1, "stand"], [9.0, 4.0, 0], [8, 9.8, 0], [8, 10.6, 0]] }
      ];
    }
  };
  X.ticks.push((now, def) => { if (def.wk !== "arcade") return; const t = now / 1000; ARC.tiles.forEach((m, i) => { if (i < 6) m.material.color.setHSL((t * 0.2 + i * 0.17) % 1, 0.8, 0.55); else if (i >= 8) m.material.color.setHSL((t * 0.5 + i * 0.11) % 1, 0.9, 0.4 + 0.2 * Math.sin(t * 6 + i)); }); if (ARC.claw) { ARC.claw.position.x = CLAW.x + Math.sin(t * 0.9) * 0.4; ARC.claw.position.z = CLAW.z + Math.cos(t * 0.7) * 0.4; ARC.claw.position.y = 1.7 - (Math.sin(t * 1.6) > 0.7 ? 0.45 : 0); } });
})();
