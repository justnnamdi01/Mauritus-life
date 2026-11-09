"use strict";
// WORDS THAT FIT THE PLAYER: the game knows whether your character is a man or a woman and speaks to you the right way.
// People call you "madame" or "monsieur", a Bambous local says "frer" or "sœur", and so on. Everything else in the game treats everyone the same.
// Loaded after the game page.
(function () {
  const GN = window.GN = { sir: () => (typeof s !== "undefined" && s.g === "f" ? "madame" : "monsieur"), bro: () => (typeof s !== "undefined" && s.g === "f" ? "sœur" : "frer") };
  const cap = (w, orig) => (orig[0] === orig[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w);
  GN.fix = function (t) {
    if (typeof t !== "string" || !t) return t; if (typeof s === "undefined" || !s.made) return t; const f = s.g === "f";
    if (/madame,? ?(and |or |et )?monsieur|monsieur,? ?(and |or |et )?madame/i.test(t)) return t; // already addressed to everyone
    return t.replace(/\b(madame|monsieur)\b/gi, (m) => cap(f ? "madame" : "monsieur", m)).replace(/\b(frer|sœur|soeur)\b/gi, (m) => cap(f ? "sœur" : "frer", m));
  };
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === "function") window[name] = fn(o); };
  wrap("toast", (o) => function (text) { return o.call(this, GN.fix(text)); });
  wrap("personAt", (o) => function (id, L, x, z, face, moving, opt) { if (opt && typeof opt.bubble === "string") opt = Object.assign({}, opt, { bubble: GN.fix(opt.bubble) }); return o.call(this, id, L, x, z, face, moving, opt); });
  wrap("openMenu", (o) => function (title, acts, sub) { return o.call(this, GN.fix(title), acts, GN.fix(sub)); });
})();
