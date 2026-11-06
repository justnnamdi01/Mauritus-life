# Economy: paper check (2 Nov 2026)

Written from the game's own numbers, before any retuning. **No play test has been done**: treat every figure as an estimate and measure it in the closed test.

## How time works
- 1 game hour = 30 real seconds. A 4-hour shift takes 2 real minutes. A game day is 12 real minutes; a game week (rent day) is 84 real minutes.
- **Business income is paid per real hour** (and builds up for at most 24 real hours before you must collect), so businesses are a slow, long-term game.

## Starting point
| Role | Starts with | Rent a week |
|---|---|---|
| Resident | Rs 4,000 | Rs 2,500 |
| Student | Rs 10,000 (+ Rs 4,500 allowance each Monday) | Rs 1,500 |
| Tourist | Rs 46,000 (no local jobs) | Rs 7,000 |

Shift pay (4 hours): Bazaar, restaurant, fish market, bakery, snack kitchen Rs 500 / 750-800 / 1,050-1,150 across three ranks. Phone careers pay more per shift (Rs 1,000-1,600 at rank 1, up to Rs 6,000-8,500 at the top).
Food: a dholl puri is Rs 120 for +45 food; a baguette Rs 70 for +30. Hunger falls 2.2 points per game hour.

## The model (one player who only sleeps, eats and works)
Sleeps when energy is under 30, eats when food is under 35, otherwise works a shift. Over 4 game weeks (5.6 real hours). Script: not kept; the table is below.

| Shift pay | Money after 4 weeks | Per real hour | Food + rent as a share of income |
|---|---|---|---|
| Rs 500 (entry) | about Rs 27,000 | about Rs 4,100 | 43% |
| Rs 780 (promoted) | about Rs 50,000 | about Rs 8,200 | 27% |
| Rs 1,100 (top shift) | about Rs 76,000 | about Rs 12,900 | 19% |
| Rs 1,600 (career rank 1) | about Rs 117,000 | about Rs 20,200 | 13% |

## What this tells us
1. **The start is healthy.** A Resident pays rent of Rs 2,500 in week 1 and has to work. Costs eat 43% of entry pay, so a new player can save, but not instantly. First goal (Rs 10,000) is roughly 1.5 to 3 real hours of play.
2. **Costs do not grow with income.** Food and rent are flat, so a promotion nearly doubles what you keep. After the first few promotions money is easy, and nothing in the early game takes it back.
3. **Careers pay 2x to 3x the shift jobs.** That makes the shift jobs a starter only. Fine if intended.
4. **Mid-game sinks are weak.** Business income is about 24% a real day at most (a Rs 90,000 snack shop pays Rs 600 an hour). Wealth tax only starts at Rs 500,000 (0.5% a week). Between Rs 50,000 and Rs 500,000 there is almost nothing to spend on except businesses and homes.
5. **Realism check against Mauritius:** an entry shift is Rs 125 an hour, close to real entry wages. Food is dearer relative to wages than in real life, which acts as a sink and is fine.
6. **Not modelled:** fun, hygiene and bladder (they cost time and small money), clothes and furniture, taxes, disasters, patron shop, rival raids. They all need measuring in a play test.

## Decisions made (2 Nov 2026) and applied
- **Property tax:** 8% of the rent of the Studio, Two-bedroom and Penthouse, taken every Monday with the rent (the small room pays none). Unpaid tax carries to the next week.
- **15% VAT** on Grand Baie shop prices (shown included; it leaves the game). Shifts and free actions are not taxed.
- **Cyclone policy:** about 0.25% of your money (at least Rs 200) a week, disasters take 60% less. Disaster bands now start at Rs 100,000 (1% / 3% / 6% of the wealth above Rs 100,000, Rs 1M and Rs 10M), so they matter mid-game. Sandbags and shutters still work during the warning.
- **Students:** the role stays, with shifts and the allowance only.
- Money is still handled by the player's phone in this engine; only the cyclone policy and disaster bills are decided by the server. The rates are constants (`PROP_TAX`, `VAT`, `POLICY`); move them to the admin page before launch.

- **Travel fares (3 Nov):** a new money sink with the real distances: bus Rs 25 + 5 a km, taxi Rs 150 + 20 a km, own car Rs 3 a km (Grand Baie to Port Louis: bus Rs 129, taxi Rs 564, car Rs 62). Re-measure in the closed test: if players rarely leave Grand Baie, lower the fares; if they commute constantly, raise them. Constants are in `game/roads.js` (`MODES`).

## Still to decide
- Re-measure after the closed test; then retune the numbers in `game/public/index.html` (`PROP_TAX`, `VAT`) and `game/server.js` (`POLICY`, `disasterBill`).

## Other options considered
- **A. Mid-game money sinks.** Pick two or three: a weekly **property tax** on homes (Studio/Two-bedroom/Penthouse), **business licences** (a share of each collection), a **VAT** line in shop prices (Mauritius VAT is 15%), a **cyclone-season levy** or paid cover (Jan-Mar, already in the engine as disasters).
- **B. Costs that scale.** Make rent and food a share of net worth for the better homes only (the game already ties home rent to the home you choose).
- **C. Students.** The university is gone. Either remove the Student role, or make it "Student: part-time shifts only, Rs 4,500 allowance", with university classes returning when Port Louis opens.
- **D. Seasons.** Keep the season reset and wealth levy from the old engine as the late-game sink.
- **E. Founders' Race (launch week).** Pick the net worth to race to so that the top 100 reach it in roughly 3 days of play: use the per-hour figures above after the play test.

## Measure in the closed test
Money at 30 minutes, 1 hour, 3 hours and 1 day of play, split by Resident/Student/Tourist; how many shifts per hour; what players buy first; who runs out of money and quits.

## Port Louis jobs (session 16)
Two new shifts use the standard shift formula (4 hours, level every 4 shifts): **Bank clerk** (Rs 700, 1,100, 1,700) at the two towers, 9 to 16, and **Bus conductor** (Rs 550, 800, 1,100) at Victoria Urban Terminal, 6 to 19. The **Metro Express** ride costs Rs 20, the **Oceanarium** ticket Rs 250 and the terminal's supermarket shop Rs 500 (8 meals), all with 15% VAT. Retune with the rest of the economy when it is measured.

## The casino, job bonuses and the market (session 17)
- **Casino (money sink):** slots return 93.3%, roulette 97.3% (the zero), blackjack about 94% with simple play. Bets Rs 20 to 2,000. After Rs 30,000 of net losses in an hour the server refuses bets. The server's totals are in `db.casino.stat` (staked, paid out, rounds); check them when you measure the economy.
- **Job challenge bonuses (faucet):** teller up to Rs 450 and conductor up to Rs 450 per challenge, courier Rs 250 to 400, each with an 8-minute cooldown and a **Rs 4,000 a day** cap per player (`JOB_DAY_CAP` in `capital.js`).
- **Market:** the wholesaler's price is about half the fair price, so a seller who sells at the fair price makes about 90 to 100 per sale after the 6% market fee (a sink). A licensed pitch costs Rs 150 per two hours (a sink). A raid destroys the stock (a sink).

## New in town (session 19)
Each player is paid once per town, by the server, Rs 100 for each of three landmarks and Rs 200 for finishing: Rs 500 per town, Rs 1,500 in all, a one-off faucet for newcomers (`LM_PAY`, `LM_BONUS` in `capital.js`).

## The Island Pass (session 21)
Everybody starts in Port Louis with Rs 2,500. The Island Pass costs Rs 5,000, one time (`PASS_PRICE` in `capital.js`): a sink that also paces the opening hours, because a new player needs jobs (terminal, market, bank, casino bonus) before they can leave the capital. Players who existed before the pass were given it. Hub sinks: Ferris wheel Rs 120 / 200, Games Room Rs 40 to 80 per game, tip the band Rs 100. Retune the Rs 5,000 after the closed test: aim for about 2 to 3 hours of work for a new player.
