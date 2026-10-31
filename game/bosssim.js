"use strict";
// The Halloween boss fight: your trained troops against Captain Citrouille, the pumpkin king of the old sugar estate.
// Pure and server-side. The fight is played in rounds of five seconds: before each round the player may use one ability
// (rally, heal, shield or a weak-spot strike), and every round returns a frame every half second for the client to play back in 3D.
const BOSS = { name: "Captain Citrouille", hp: 9000, smashEvery: 2, smashHits: 2, smash: 100, waveEvery: 7, wave: 28, enrageAt: 45, enrage: 1.5, maxT: 75 };
const ROLE = { // what each troop does in this fight: hit points, damage per second at level 1, and its special
  rookie: { hp: 60, dps: 8 }, bruiser: { hp: 140, dps: 24 }, hacker: { hp: 80, dps: 6 }, handler: { hp: 90, dps: 4 }, driver: { hp: 70, dps: 10 }
};
const ABIL = { rally: { cd: 3 }, heal: { cd: 3 }, shield: { cd: 3 }, weak: { cd: 2 } }; // rounds to wait before using it again
const ABX = { rally: 1.25, shield: 0.65, heal: 0.2, weak: 0.04 }; // how strong each ability is: damage x, boss damage x, share of health healed, share of the boss health
const ROUND_TICKS = 10, DT = 0.5; // a round is five seconds
const lvMul = (lv) => 1 + 0.3 * (Math.max(1, Math.min(6, lv | 0 || 1)) - 1);

function start(keys, TL) { // a new fight: your troops line up against the boss
  const T = keys.filter((k) => ROLE[k]).slice(0, 8).map((k, i) => { const m = lvMul(TL && TL[k]), r = ROLE[k]; return { i, k, max: Math.round(r.hp * m), hp: Math.round(r.hp * m), dps: r.dps * m, heal: k === "handler" ? 14 * m : 0 }; });
  return { T, bh: BOSS.hp, t: 0, sm: BOSS.smashEvery, wv: BOSS.waveEvery, rd: 0, cds: { rally: 0, heal: 0, shield: 0, weak: 0 }, over: false, won: false, last: null };
}

const alive = (S) => S.T.filter((x) => x.hp > 0);
function snap(S, e, a) { return { t: +S.t.toFixed(1), b: Math.max(0, Math.round(S.bh)), h: S.T.map((x) => Math.max(0, Math.round(x.hp))), e: e || null, a: a || null }; }

function view(S) { // what the client needs to draw the fight right now
  return { crew: S.T.map((x) => ({ k: x.k, max: x.max, hp: Math.max(0, Math.round(x.hp)) })), bossMax: BOSS.hp, bossHp: Math.max(0, Math.round(S.bh)), rd: S.rd, cds: Object.assign({}, S.cds), over: S.over, won: S.won, secs: +S.t.toFixed(1), enraged: S.t >= BOSS.enrageAt };
}

function autoPick(S) { // what a sensible commander would do: used by Auto-play
  const al = alive(S); if (al.some((x) => x.hp < x.max * 0.5) && S.cds.heal === 0) return "heal";
  if (S.cds.rally === 0) return "rally"; if (S.cds.shield === 0 && S.t >= 6) return "shield"; if (S.cds.weak === 0) return "weak"; return "";
}

function round(S, ability, acc, rnd) { // fight five seconds, using one ability at the start. Returns the frames of the round.
  rnd = rnd || Math.random; const frames = []; if (S.over) return frames;
  if (ability === "auto") ability = autoPick(S); if (!ABIL[ability] || S.cds[ability] > 0) ability = ""; // not allowed right now: just fight
  for (const k in S.cds) if (S.cds[k] > 0) S.cds[k]--; if (ability) S.cds[ability] = ABIL[ability].cd; S.rd++;
  let dmul = 1, bmul = 1;
  if (ability === "rally") dmul = ABX.rally; if (ability === "shield") bmul = ABX.shield;
  if (ability === "heal") for (const x of alive(S)) x.hp = Math.min(x.max, x.hp + x.max * ABX.heal);
  if (ability === "weak") { const a = Math.max(0.2, Math.min(1, Number(acc) || 0.6)); S.bh -= BOSS.hp * ABX.weak * a; }
  frames.push(snap(S, null, ability || null));
  for (let n = 0; n < ROUND_TICKS && S.bh > 0 && alive(S).length && S.t < BOSS.maxT; n++) {
    S.t += DT; let e = null; const al = alive(S);
    S.bh -= al.reduce((a, x) => a + x.dps * DT, 0) * dmul;
    for (const x of al) if (x.heal) { const w = al.filter((y) => y.hp < y.max).sort((a, b) => a.hp / a.max - b.hp / b.max)[0]; if (w) w.hp = Math.min(w.max, w.hp + x.heal * DT); }
    if (S.bh <= 0) { S.bh = 0; frames.push(snap(S, { k: "dead" })); break; }
    const weak = 1 - Math.min(0.3, 0.1 * al.filter((x) => x.k === "hacker").length), rage = S.t >= BOSS.enrageAt ? BOSS.enrage : 1;
    S.sm -= DT; S.wv -= DT;
    if (S.sm <= 0) { S.sm += BOSS.smashEvery; const pick = al.slice().sort(() => rnd() - 0.5).slice(0, BOSS.smashHits); for (const x of pick) x.hp -= BOSS.smash * weak * rage * bmul; e = { k: "smash", to: pick.map((x) => x.i) }; }
    if (S.wv <= 0) { S.wv += BOSS.waveEvery; for (const x of alive(S)) x.hp -= BOSS.wave * weak * rage * bmul; e = e || { k: "wave" }; if (e.k === "smash") e.wave = 1; }
    frames.push(snap(S, e));
  }
  if (S.bh <= 0) { S.over = true; S.won = true; } else if (!alive(S).length || S.t >= BOSS.maxT) { S.over = true; S.won = false; }
  S.last = { rd: S.rd, frames }; return frames;
}

function simulate(keys, TL, rnd) { // a whole fight on auto-play, for old game versions that cannot play it round by round
  const S = start(keys, TL), frames = [snap(S)]; while (!S.over) { const f = round(S, "auto", 0.7, rnd); for (let i = 1; i < f.length; i++) frames.push(f[i]); }
  return { won: S.won, bossHp: Math.round(S.bh), bossMax: BOSS.hp, frames, crew: S.T.map((x) => ({ k: x.k, max: x.max })), secs: +S.t.toFixed(1), left: alive(S).length };
}

module.exports = { simulate, start, round, view, autoPick, BOSS, ROLE, ABIL, ABX };
