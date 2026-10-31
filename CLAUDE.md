# Mauritius Life

The game lives in `game/` (the game page in `game/public/index.html`, the Node server in `game/server.js`). Railway deploys the main branch with root directory `game`. Read `docs/SPEC.md` for what we are building and `docs/LAUNCH.md` for the launch plan.

## Every player-facing update
Add an entry at the top of `UPDATES` in `game/public/index.html` (search for `const UPDATES`): a new date-style version string (for example `2026.12.01`, must sort after the previous one), the date, a short headline, and one item per new thing with an icon, a title, one plain sentence and an optional "Try it" action.

## Keep the in-game Guide current
The Guide (`const HOWTO` in `game/public/index.html`) explains how to do things. When you add or change a player-facing feature, add or edit its question and answer.

## New phone apps
When you add a phone app, also add it to `NEWAPPS` (app id and a short line). Remove entries once an app is no longer new.

## Track every ad
Whenever you add an ad, poster, promo, announcement, billboard, poll or marketing video, add a row to `game/ADS.md` (what, where players see it, how often, admin control, status). Update the status when it goes live or is retired.

## Lessons from Flic en Flac Life (do not repeat these)
- **The server decides money, prizes and winners.** Never trust the phone for rewards.
- **Before putting content in a region, check that region is open to everyone** (no test-account locks).
- **Never write player-facing text that says who will lose money.** Give players choices and things to buy.
- **Money sinks are part of the design.** Taxes, a patron shop, upkeep, disasters with paid cover. Retune them whenever the economy changes.
- **Keep houses spaced:** at least 3 empty tiles between private beach homes, never on the public beach.
- **Deploys cut connections.** Avoid deploying in the middle of an event. If a request can be lost, make it safe to repeat.
- **Test on a real phone.** The headless browser tests are slow; keep them short.
- **Data safety:** never commit `data.json`, `auth-secret.txt` or backups.
