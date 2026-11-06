// The Port Louis casino. The SERVER spins the wheel, draws the cards and rolls the reels: the phone only shows the result.
// Money is in-game money with no real value. The house keeps a small edge (a money sink) and a player who has lost a lot in an hour is asked to take a break.
"use strict";
const crypto = require("crypto");
const MIN_BET = 20, MAX_BET = 2000, LOSS_CAP = 30000, HOUR = 3600000;
const rnd = (n) => crypto.randomInt(n);

// ---- roulette: a European wheel, 37 pockets
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? "green" : RED.has(n) ? "red" : "black");
const BETS = { red: (n) => n > 0 && RED.has(n), black: (n) => n > 0 && !RED.has(n), even: (n) => n > 0 && n % 2 === 0, odd: (n) => n % 2 === 1, low: (n) => n >= 1 && n <= 18, high: (n) => n >= 19, d1: (n) => n >= 1 && n <= 12, d2: (n) => n >= 13 && n <= 24, d3: (n) => n >= 25 }; // what each bet covers
const MULT = { red: 2, black: 2, even: 2, odd: 2, low: 2, high: 2, d1: 3, d2: 3, d3: 3, number: 36 }; // the total returned for each unit staked, stake included
function betOk(b) { return !!b && (b.type === "number" ? Number.isInteger(b.n) && b.n >= 0 && b.n <= 36 : Object.prototype.hasOwnProperty.call(BETS, b.type)); }
function roulette(b, stake) { // one spin: returns the pocket, its colour and the total paid back
  const n = rnd(37), win = b.type === "number" ? n === b.n : BETS[b.type](n); return { n, color: colorOf(n), win, payout: win ? stake * MULT[b.type] : 0 };
}

// ---- slots: three independent reels
const REEL = [["🍒", 30], ["🍋", 25], ["🔔", 20], ["⭐", 14], ["💎", 8], ["7️⃣", 3]]; // symbol and weight (out of 100)
const TRIPLE = { "🍒": 7, "🍋": 11, "🔔": 18, "⭐": 33, "💎": 92, "7️⃣": 275 }; // three of a kind pays this many times the stake
const PAIR_CHERRY = 1.5; // two cherries anywhere pay 1.5 times the stake
function pickSym() { let r = rnd(100); for (const [s, w] of REEL) { if (r < w) return s; r -= w; } return REEL[0][0]; }
function payFor(a, b, c) { if (a === b && b === c) return TRIPLE[a]; if ([a, b, c].filter((x) => x === "🍒").length === 2) return PAIR_CHERRY; return 0; }
function slots(stake) { const r = [pickSym(), pickSym(), pickSym()], m = payFor(r[0], r[1], r[2]); return { reels: r, mult: m, payout: Math.floor(stake * m) }; }
function slotsRtp() { let e = 0; for (const [a, wa] of REEL) for (const [b, wb] of REEL) for (const [c, wc] of REEL) e += (wa * wb * wc) / 1e6 * payFor(a, b, c); return e; } // the exact return to the player

// ---- blackjack: one deck, reshuffled every hand, the dealer stands on every 17, blackjack pays 3 to 2, you may double on your first move
const SUITS = ["♠", "♥", "♦", "♣"], RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
function newDeck() { const d = []; for (const s of SUITS) for (const r of RANKS) d.push(r + s); for (let i = d.length - 1; i > 0; i--) { const j = rnd(i + 1); [d[i], d[j]] = [d[j], d[i]]; } return d; }
function value(hand) { let t = 0, aces = 0; for (const c of hand) { const r = c.slice(0, -1); if (r === "A") { aces++; t += 11; } else t += "JQK".includes(r) ? 10 : +r; } while (t > 21 && aces) { t -= 10; aces--; } return t; }
const isBj = (h) => h.length === 2 && value(h) === 21;
function bjStart(stake) { const deck = newDeck(), g = { stake, deck, p: [deck.pop(), deck.pop()], d: [deck.pop(), deck.pop()], doubled: false, done: false, payout: 0, note: "", at: Date.now() };
  if (isBj(g.p) || isBj(g.d)) { g.done = true; if (isBj(g.p) && isBj(g.d)) { g.payout = stake; g.note = "Both have blackjack: a push."; } else if (isBj(g.p)) { g.payout = Math.floor(stake * 2.5); g.note = "Blackjack! Pays 3 to 2."; } else { g.payout = 0; g.note = "The dealer has blackjack."; } }
  return g; }
function bjDealer(g) { while (value(g.d) < 17) g.d.push(g.deck.pop()); } // stands on every 17
function bjFinish(g) { g.done = true; const pv = value(g.p), dv = value(g.d), stake = g.stake * (g.doubled ? 2 : 1);
  if (pv > 21) { g.payout = 0; g.note = "Bust."; } else { bjDealer(g); const d2 = value(g.d); if (d2 > 21) { g.payout = stake * 2; g.note = "The dealer busts: you win."; } else if (pv > d2) { g.payout = stake * 2; g.note = "You win."; } else if (pv === d2) { g.payout = stake; g.note = "Push: your stake comes back."; } else { g.payout = 0; g.note = "The dealer wins."; } }
  return g; }
function bjHit(g) { g.p.push(g.deck.pop()); if (value(g.p) >= 21) bjFinish(g); return g; }
function bjDouble(g) { g.doubled = true; g.p.push(g.deck.pop()); return bjFinish(g); }
function bjView(g) { return { done: g.done, doubled: g.doubled, stake: g.stake * (g.doubled ? 2 : 1), player: g.p, pv: value(g.p), dealer: g.done ? g.d : [g.d[0], "??"], dv: g.done ? value(g.d) : value([g.d[0]]), payout: g.done ? g.payout : 0, note: g.note }; }

// ---- the break: how much a player has lost over the last hour
function lossLast(hist, now) { let net = 0; for (const [t, n] of hist) if (now - t < HOUR) net += n; return -net; } // positive when they are down
function note(hist, now, net) { hist.push([now, net]); while (hist.length && now - hist[0][0] > HOUR) hist.shift(); if (hist.length > 400) hist.splice(0, hist.length - 400); }
module.exports = { MIN_BET, MAX_BET, LOSS_CAP, HOUR, roulette, betOk, MULT, colorOf, slots, slotsRtp, REEL, TRIPLE, bjStart, bjHit, bjDouble, bjFinish, bjView, value, lossLast, note };
