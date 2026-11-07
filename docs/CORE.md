# Mauritius Life: the core of the game (the hook)

Written 7 Nov 2026. This is the design for what makes players come back every day, feel the game is going somewhere, and tell their friends. It is built from your points: **things must be seen, not just said** (the character acts everything out), **Clash of Clans** (you upgrade something, leave, and come back to see it done), **GTA** (a main story to follow, and a free island to play in), and the **story and ideas** you told me. Everything here is a plan; none of it is built yet except where it says so.

---

## 0. The idea in one paragraph

**You start with a flat in Port Louis and a name nobody knows. Over weeks you turn it into a place the whole island talks about.** Two things grow together:

1. **Your Lakaz** (your home, your business, your crew's hideout): a thing you *build over real time* and walk through and show to friends. This is the Clash part. It gives a reason to log in tomorrow.
2. **Your Zistwar** (your story): a campaign of missions with a cast of characters you care about, that sends you across the island. This is the GTA part. It gives a reason to keep playing today.

Between the two is a living island (real clock, jobs, games, events, other players) that is fun to just be in. The loop is: **do a mission or a job → earn money and materials → start an upgrade that takes real time → leave → come back to see it → the next mission opens.**

> The promise on the first screen: **"Rise from a flat in Port Louis to the biggest name in Mauritius."**

---

## 1. Who we are making this for

**Core player (launch):** Mauritians aged **15 to 30** on **phones**, plus the diaspora. They live on WhatsApp, TikTok, Instagram and Facebook. (From `docs/LAUNCH.md`.)

What that tells us about how they play:

| Fact | What we do about it |
|---|---|
| Phone, in short bursts: the bus, a break, before bed. Evening is the peak. | A session is **3 to 10 minutes** with a clear end. Everything important can be done in one thumb-reach. Timers are set so the "ready" moment lands on **bus time, lunch time and after school (about 07:00, 13:00, 17:00, 21:00)**. |
| Free to play, small or no spending money. They pay with **time and friends**, not cash. | Progress is bought with **time + effort + friends helping**, never a paywall. Monetise cosmetics later. |
| Social proof is everything: screenshots, group chats, "look what I got". | Every big moment makes something **shareable** (a card, a clip of the camera tour, a flat photo). Invite links are rewarded for both sides. |
| They know Mauritius deeply: the places, the Kreol jokes, the food, the bus. | **Authenticity is the hook**: real places, real food, real phrases, real buses, real clock, real weather (cyclone season). Nobody else can make this. |
| Many are teens. | No real-money gambling, ever (the casino is play money with rules and self-exclusion). Rewards for logging out and sleeping. No guilt streaks. No text that says who will lose money. |

**What they want to feel** (the emotional promises, in order of how much they drive return):
1. *"I'm building something that's mine and it's getting better while I'm away."* (Clash)
2. *"I'm the main character of a story about my island."* (GTA)
3. *"My friends are here and I want to show off to them."* (social)
4. *"There is always something fun to do right now."* (live island)

Anything we add must serve at least one of these four. If it does not, we do not build it.

---

## 2. The five loops (how long each one lasts, what pulls you round it)

```
 30 seconds   ACT        do one visible thing (a shift, a game, an errand)        → a small reward and a tick of progress
 5-10 minutes SESSION    "Today's run": mission or jobs → collect → start timers → check the town → leave with a reason to return
 1 day        DAILY      timers finish · Today list · streak · evening event · one friend nudge
 1 week       WEEKLY     crew contract · weekly event · rank · a story chapter
 6-8 weeks    SEASON     story act finale · a new part of the island opens · ladder resets with prestige and rewards
```

Each loop must be **closed**: the player knows what they just did, what they got, and what is next. The player should never finish a session with nothing to come back for.

### The rule of three open loops
At the end of **every** session the player has at least **three things waiting**: (1) an upgrade timer running, (2) a mission or goal half-done, (3) something that a friend or the world will change (a crew contract, an event tonight, a business filling up). If any session ends with fewer than three, that is a design bug.

---

## 3. Part A, the Clash side: Your Lakaz grows while you are away

### 3.1 What you build (the three things that grow)

| Thing | What it is | How it grows | What the player *sees* |
|---|---|---|---|
| **The Flat → House** | Your home (Victoria Heights flat first, then a house in the Players' Estate, Grand Baie or Flic en Flac) | **Levels 1 to 10** of upgrades: bed, kitchen, TV and sofa, balcony, desk, art, lighting, a roof terrace, a guest room, a vault | The room visibly changes each level (new objects, new colours, a view). Friends can walk in. A photo button. |
| **The Business** | A food cart → stall → shop → restaurant → franchise (or a market stall, a taxi, a bar: pick a path) | Levels and **staff slots**. It **earns while you are offline**, up to a cap (4 h at first, 8 h later), and you **collect** | The business exists in the world: a cart at the terminal, a stall in the market. NPC staff work in it. You collect from the till and see the queue. |
| **You (skills and look)** | Cooking, fitness, charisma, driving, business sense. Outfits and titles. | Skills **train over real time** (like Clash heroes) and unlock better jobs, better shifts, more missions. | Your character's body, clothes and title above their head. |

### 3.2 The timer ladder (the heart of "come back and see it")

Every upgrade takes **real time**, and the time grows. The first ones are so short that a new player sees a result **in the first session**.

| Upgrade level | Real time | Cost (to be tuned, see 3.5) | What it does | Why it brings you back |
|---|---|---|---|---|
| L1 | **2 min** | tiny | a visible change | you see it done *before you leave the first session* |
| L2 | **10 min** | small | another change | "I'll finish a shift then see it" |
| L3 | **1 hour** | medium | change + a perk | the first real "come back later" |
| L4 | **4 hours** | medium | change + perk | lunch / after school |
| L5 | **overnight (10 h)** | big | big change + unlock | the **morning return** |
| L6 | **1 day** | big | unlock | the daily habit |
| L7 | **2 days** | large | unlock | weekend |
| L8-L10 | **3, 5, 7 days** | very large | prestige | the long game, with friends helping to speed it |

Rules that make this work:
- **Builder slots, not infinite queues.** Start with **1 slot**. A **second slot** comes from the story (Island Pass mission), a **third** from Crew rank. A free slot is the thing that pulls you back ("my builder is idle!").
- **Visible progress bar** over the thing being built, in the world and on the phone Home screen.
- **"Ready!" moment:** when you return, the finished thing is announced with a short camera move to it. That moment is the reward.
- **Friends can help**: a friend who visits your place can tap "Help" to shave 5% (max 5 helps). It makes visiting a reason to be social.
- **Speed-up with effort, not money:** doing a job shift or finishing a mission *reduces the timer by a few minutes*. So playing today speeds up tomorrow.
- **Never lose progress by being away.** Business income caps; it does not rot or get stolen while you sleep (see raids below).

### 3.3 Materials: why different jobs matter

Money alone makes every job the same. So **jobs also drop materials**, and each upgrade needs money **and** a mix of materials. That gives every workplace you just built a reason to exist:

| Where you work | What it gives | Used for |
|---|---|---|
| Restaurant, dholl stall, bakery | **Flavour** (ingredients, recipes) | the kitchen, the business, food buffs |
| Bank, terminal | **Contacts** (favours, tickets) | the Island Pass, rank, staff slots |
| Market | **Goods** (crates, cloth, spice) | furniture, stall upgrades |
| Bar, casino, arcade | **Buzz** (fame, tips) | the look, parties, popularity |
| Supermarket | **Supplies** | basic upgrades, flat levels |

So a player who wants a better kitchen is pushed to the restaurant; a player who wants the Pass is pushed to the bank. **The island's variety becomes the progression.** Rare drops (a gold spoon, a vintage radio) come from jobs with a small chance and are **collectibles** (see 5.2).

### 3.4 Defence and rivals (Clash's attack and defend, made friendly)

The game already has **Raids** and **Heists**. We keep them but make them safe and fun for teens:
- **New-player shield: 3 days** with no raids.
- Raids steal **only a capped slice of what is in your business till** (never your savings, never your flat). You can **protect** it with upgrades (a guard, a camera, a dog) bought with materials. A raid is a **short, visible scene** (the raider sneaks into the room, your guard reacts), not a menu.
- **Revenge** is always available for a day: raided players get a one-tap "go back and get them".
- Heists are **co-op** with friends (2 to 4 players), planned and done in the real rooms (the bank vault, the casino cashier), with a payout shared by the crew. This is the big GTA fantasy, and it sells the friend invite.

### 3.5 Pacing (the numbers are placeholders until we measure)

Cost and time numbers in this document are **targets expressed in play-minutes**, not rupees. **The old economy paper check is out of date**: shifts are now about **18 seconds on screen plus the walk to the post**, and the player earns far faster per real hour than that sheet assumed. Before we set prices:
1. Write a small script that plays the game as a typical player (shifts, meals, sleeps) and prints money per real minute.
2. Set each upgrade's cost as **income per minute × the minutes we want it to take** (see the table in section 8).
3. Check against the targets: **Day 1** ≈ 15 to 20 min of play, **Days 2 to 7** ≈ 8 to 12 min a day, **the Island Pass around Day 2**, **the first business around Day 3 to 4**, **Crew around Day 4 to 7**.
4. Measure it with real players in the closed test and retune.

### 3.6 One main job, plus side hustles (the way people really earn in Mauritius)

**One career at a time.** The first time a player works a shift they are asked: *"Make this your career?"* A career gets **full pay, a promotion every 4 good shifts** (dishwasher → cook → chef, teller → loans officer → manager) and **its own path in the story**. Other workplaces still take you for **odd jobs: about half pay, three a day, no promotion**. Changing career is allowed **after 3 days**. This gives the player an identity ("I'm a teller, he's a baker") and a reason to pick, instead of doing everything at once. *(Built.)*

**Side hustles** are the small jobs people really do on the island for extra money. They are **short (about 40 seconds on screen), cost a small stake, are capped per day, and are decided by the server**. Each one is acted out in the street with people around:

| Hustle | Where | What you see yourself doing | Stake | Pay | Per day | Hours | Status |
|---|---|---|---|---|---|---|---|
| **Gato piment round** 🧺 | Victoria terminal, then Place d'Armes, the Caudan, the casino | Carry a wicker basket on a round of Port Louis; people ask for one and buy | Rs 120 | Rs 260 to 420 | 8 | 06:00-20:00 | **Built** |
| **Fish off the quay** 🎣 | The Caudan quay by the water | Cast a line, wait with Oncle Jean beside you, a bobber dips, reel in; the server decides what bites (sardine, vieille, capitaine, thon, or an old boot) | Rs 60 | Rs 10 to 1,000 | 8 | 05:00-20:00 | **Built** |
| **Busk at the stage** 🎤 | The waterfront stage | Climb on stage and sing a sega; a crowd gathers and dances; they tip | free | Rs 220 to 640 | 5 | 17:00-23:00 | **Built** |
| Watch the cars (gardien) | Place d'Armes lot | Wave cars into spaces in a hi-vis vest for tips | free | Rs 180 to 320 | 6 | all day | Next |
| Phone repair | Chinatown stall | Fix a phone in a small puzzle | parts | per repair | 6 | day | Later |
| Tutoring (leçons) | A café | Sit with a schoolkid | free | per hour | 3 | 15:00-19:00 | Later |
| Taxi marron / delivery | The roads | Take a fare across town | fuel | per fare | 8 | all day | Needs cars |
| Market blanket | The market | Already in the game (server-side) | stock | profit | n/a | day | **Built earlier** |

Rules: a **daily cap of Rs 4,500 from all hustles** so they never replace the career; a **cooldown** between rounds; a **stake** so they feel like a small business; and a **cancelled round loses its stake**. All of this is in `game/hustle.js` and is covered by `game/test/hustle.test.js`.

### 3.7 Every place in the tour has a job (the tour is a promise)

The camera tour shows four places. Each now has something to **do**, something **fun**, and a **reason to come back**:

| The place | Do | Fun | Come back for |
|---|---|---|---|
| **Your flat** | Home menu, upgrades (M1) | Show friends, sleep, the daily reward | Timers finishing, the daily reward and streak |
| **Victoria Urban Terminal** | Your career shifts as receveur, odd jobs, the courier dash, buses, the Island Pass | The food court, the buses, a hawker with a tray | Missions on the board (M3), gato piment rounds |
| **The waterfront** | Fish off the quay, sit on a bench and watch the ships | **Ride the Ferris wheel in a real gondola** (built), ships docking | The sunset, the lit wheel at night |
| **The stage** | **Busk for tips** (built), dance, watch the band | The crowd dances with you; sega every evening | **17:00 every day, with a notification** (built) |

The phone's **Hustles app** shows these as "Today in Port Louis", with live status (open now, countdown to 17:00) and **Go** buttons that draw the arrows to each place.

---

### 3.8 Player level, "Island Standing" (the reward system for a player on their own)
**Idea.** One number on the player, Level 1 to 50, that says "how much of your own life you have built". **A player can reach every level alone.** Friends and Crew make it faster and more fun, but nothing is locked behind other people. The feeling we want is independence and responsibility: this is *my* flat, *my* job, *my* name on the island, and it needs me.

**How you earn XP (all solo-possible).** Finishing shifts and hustles, starting and finishing flat upgrades, keeping the daily routine (eat, sleep, wash, a shift), visiting a new Album place, finishing missions, paying your bills and tax on time. Bigger and more varied things give more XP, and the first time you do anything gives a bonus, so there is always a new thing to try.
**Social is a bonus, not a gate.** Helping a friend build, a Crew job, a visit to your flat, or inviting someone who stays 3 days gives about 25% extra XP and some cosmetics only seen in company. Skipping it never blocks you.

**Responsibility (why it feels like yours).**
- **Your flat is your responsibility:** rent or upkeep is a small regular cost (a money sink), and a well-kept flat gives a comfort bonus. Never a penalty that takes things away; neglect only means you miss the bonus.
- **Your job is a commitment:** the main job (one at a time) has its own rank that rises with shifts done; a promotion at set ranks raises pay and unlocks a better uniform and workplace spot.
- **A daily "Your day" list (3 small goals)** and a **weekly goal** that you pick yourself, so there is a plan to own.
- **A level-based Lakaz:** the Penthouse needs level 20, so the flat is how you *see* your level.

**What a level gives (so it feels like building something).**
- Every level: a small gift (cash, a material or a cosmetic) and a title on the name tag (Newcomer, Local, Regular, Lakaz Owner, Boss, Legend), with Mauritian badges from the Album.
- Milestones every 5 levels unlock real things: a second builder slot (two flat upgrades at once), more hustle slots, new shops and districts, higher flat levels, new clothes in the Studio, a bigger phone, more Crew size.
- The level-up is a scene in the world (fireworks over your flat, neighbours cheering), never just a toast.
- "Next level" bar always visible on the profile, with the two or three quickest ways to fill it.

**Compare and strive (the Clash part: your base first, then the world).** The main loop is you and your own place. On top of that, a player who wants to can see where they stand:
- **Your Standing card** (level, flat level, job rank, Album %, days played) that other players can open from your name tag.
- **Visit and admire:** walk into a friend's or a stranger's flat (existing home visits) and see their level, their flat and their title. A "Like" on a flat gives the owner a little XP and a notification.
- **Leaderboards that never reset** (your rank is what you have built, it is never wiped): tabs **Friends** and **Island** (everyone), plus **My region**. Boards: Highest Level, Best Flat, Richest, Most Helpful, Album %. Because nothing resets, newcomers see "your rank" and the next 3 people above them, not only the top of the island, so they always have a close target. Milestone badges (Top 100, Top 10, #1) are kept for as long as you hold the rank.
- **Showcase:** pick your three proudest things (flat level, a badge, a rare clothing piece) to show on your card.
- Never forced: leaderboards are in the phone, not in the way, and a player can hide their card.

**Why people come back.** A visible next reward each session, a daily list that fills in minutes, and the flat finishing while away. The bar never drains when you are away.

**How it ties to what exists.** Shifts and hustles already call `FLX.nudge()`: add `XP.gain(kind)` beside it. The server owns XP and level (`db.players[uid].xp`) in a new `levels.js`, same server-decides pattern, `paid` for gifts. Flat level cap follows player level.

**Ethics.** Levels never go down; no timers that punish being away; no text that says anyone is behind. XP per day has a soft cap so nobody has to play for hours.

**Build order.** (1) XP, levels, titles, level-up scene, profile bar, first-time bonuses. (2) "Your day" list, job rank and promotions. (3) Upkeep and the milestone unlocks. (4) Social bonus XP once Crew exists. Numbers are placeholders for the pacing script.

## 4. Part B, the GTA side: a story to follow and an island to be free in

### 4.1 The campaign: "Zistwar" (the story)

A campaign of **missions** with a cast, a rival, a mystery and choices. You follow it **when you want**; the island is open the whole time. It is told in **Acts** that match the launch regions:

| Act | Where | The story | What it unlocks |
|---|---|---|---|
| **Prologue** (built) | Your flat, Port Louis | Your first morning. The lost suitcase. Guide Anita. | The Walkabout, first jobs |
| **Act 1: "Ti Dimounn"** (small person) | Port Louis | You arrive with nothing. You meet the crew (the people who help you), you make your first money, you find out someone is squeezing the market and the terminal. | Jobs, the Island Pass, builder slot 2, the business |
| **Act 2: "Lagrenn"** (the seed) | Grand Baie and Flic en Flac | You open your first real business. A rival moves in. A friend betrays you or saves you (your choice). | Other towns, bigger businesses, Crew |
| **Act 3: "Lakaz"** (home) | the whole island | You take on the person behind it. Your crew, your name, your block. | Prestige, the title, Season 2 |

Each Act is **8 to 12 missions**, about **3 to 6 minutes** each. A season is one Act plus events.

### 4.2 What a mission looks like (the GTA feeling, every time)

A mission always has the same shape so players learn it and look forward to it:

1. **The hook** (8 to 12 seconds): a short camera move and a line from a character (we built this for Chapter 1). Something has happened.
2. **The task**: a place to go (arrows and a map marker), something visible to do. Always **in the world, never a menu**: carry, follow, serve a rush, run a stall, deliver, perform at the sega stage, take a photo, chase a thief across the market.
3. **A twist or a choice** (about half the missions): two options with different consequences. A choice changes who likes you (**loyalty**), who shows up later, and a small reward. There is no wrong answer.
4. **The payoff**: not just money. An unlock (a room, a town, a builder slot), a **cosmetic**, a **collectible**, or a **scene** (a character moves into your flat, a rival appears at your stall).
5. **The cliffhanger**: one line that opens the next mission. The next mission is **already on the board**.

**Variety rule:** no two missions in a row use the same task type.

### 4.3 Sample missions: Act 1 "Ti Dimounn" (ten, so the Act is concrete)

| # | Name | Task (what you see yourself doing) | Choice or twist | Payoff |
|---|---|---|---|---|
| 1 | The Lost Suitcase *(built)* | Carry a suitcase across Port Louis to Anita | Mme Chen's bag is the clue to a bigger problem | Lunch box, first goal |
| 2 | First Shift | Work a shift at a real workplace of your choice | Which job you pick starts a different **path** (food, bank, market, night) | First materials, flat Level 1 starts |
| 3 | Queue Jumper | Serve a rush of impatient customers at your post | Serve the loud one first, or the elderly one | **Loyalty** with the crew member who saw it |
| 4 | The Missing Takings | Walk the market asking stallholders; a thief ran off | Report the thief or let them go | Rival introduced; a market contact |
| 5 | Sega on the Quay | Perform or dance on the waterfront stage at 17:00 | Dance, sing or tip the band | Buzz, a cosmetic, a **crowd** that remembers you |
| 6 | The Pass | Do a favour at the bank; an official offers the Island Pass | Pay the price, or do a second favour for a discount | **Island Pass**, builder slot 2 |
| 7 | Night Bus | Conduct the late bus; a passenger is being followed | Help them, or ignore it | A friend NPC who later appears in Grand Baie |
| 8 | Your Own Cart | Buy and set up a food cart at the terminal; first customers | Sell cheap or sell fancy | **Your first business** |
| 9 | The Squeeze | The rival's people lean on your cart; a chase through the market | Fight back, pay, or ask the crew | A **crew member** joins you permanently |
| 10 | Open Road | Drive (or take the bus) to Grand Baie with the crew | The route chooses your first stop | End of Act 1: **Act 2 opens** |

Acts 2 and 3 follow the same pattern with bigger stakes: a lost tourist yacht, a wedding to cater (Cavadee, Divali), a sega band to manage, a cyclone night where the whole server helps, a business takeover.

### 4.4 The cast (people to care about)

Characters are what make a story stick. We already have **Guide Anita** (greeter) and **Mme Chen** (cook). Add, by name and personality, each with a home and a schedule in the world:

- **Anita**: warm, organised, knows everyone; your first friend.
- **Mme Chen**: bossy, funny, loves a secret; the market's memory.
- **Raj the taxi driver**: gossip, shortcuts, always late.
- **Oncle Jean (the old fisherman)**: slow, wise, tells the island's stories.
- **Sandy (the stage singer)**: ambitious; wants to leave; you can help.
- **The rival, "Bhai Dev"** or a woman rival: not evil, **greedy and charming**; he shows up at your places, offers deals, sabotages, then helps once.
- **The Mentor** (appears later): the person you become.

Characters **react to your choices** (loyalty from 0 to 5). Loyalty unlocks a **scene** (they cook for you, they cover for you, they show up in a heist) and a **perk** (a free taxi, a discount). Players want to **max a favourite** the way they max a hero in a game.

### 4.5 The free-roam island (so there is always something to do without the story)

The story is optional. The island always offers (and we are building these):
- **Jobs** in real workplaces (done: 8 kinds in three towns).
- **Games and nights out**: casino, Games Room, Ferris wheel, bars, sega nights at 17:00, football, beaches.
- **Errands**: courier dash, the market, taxi runs.
- **Collections**: the **Mauritius Album** (see 5.2).
- **The photo spots and places**: Instagram-worthy corners that give a **small reward the first time** and a share card.
- **Events**: weekly and seasonal (Divali, Cavadee, Spring Festival, cyclone prep). Real events at the real dates.
- **Other players**: visiting homes, dancing at the stage, joining a parade.

### 4.6 The living island (why it feels alive, so people check)

- **The real clock.** The market is busy at dawn, the stage at 17:00, the casino at night. Weather changes. Cyclone season is a real, dramatic event.
- **A "Tonight in Port Louis" panel** (City Pulse): what is on **now** and **later today**, with a live count of players and a tap to walk there. This is the evening hook.
- **NPCs with routines** (we have this): drivers, vendors, residents, now workers.
- **One new thing per week** the whole island talks about (a festival, a rumour, a visitor).

---

## 5. How we make it *sticky* (the psychology, with the ethics)

These are the tools. Each one is chosen to feel good and to be fair to a 15-year-old.

### 5.1 The hook patterns we use

| Pattern | How it appears | Guardrail |
|---|---|---|
| **A timer you can see** (Clash) | Every build and training has a bar and a ready notice | Short first timers; never a paywall |
| **Open loops** (unfinished tasks pull at you) | Three open loops at every session end | No fake urgency; a loop can always be left |
| **Variable rewards** | A job can drop a **rare** item; a **mystery crate** on the daily; a stage tip can be huge | **Pity timer**: a rare drop is guaranteed after N tries; no real-money loot boxes |
| **Collection** | The **Mauritius Album**, outfit sets, furniture sets, titles, bird and landmark stickers | Collections are **earned by playing and exploring**, not bought |
| **Streaks, with forgiveness** | A small daily bonus that grows over 7 days | **One free miss per week**; the streak never resets to zero in one miss |
| **Identity and status** | Your title, outfit, home, rank and Crew badge **show above your head and in your flat** | Rank is by activity as well as wealth, so being rich is not the only way up |
| **Social obligation** | Crew contracts, friend help on timers, co-op heists | Always opt-in; leaving a Crew is free |
| **Mastery** | Skills, job levels, speed runs of shifts, high scores in the Games Room | Short, fair, readable |
| **Story cliffhangers** | Each mission ends on a hook; the next is on the board | You can always put the story down and play free |

### 5.2 The Mauritius Album (a reason to explore every corner)
A collection book with pages by town: **places** (visit), **foods** (try), **people** (talk to them), **wildlife** (spot the dodo statue, the pink pigeon), **moments** (be at the stage at 17:00, ride the Ferris wheel at sunset). Each page completed gives a **title, a cosmetic or a materials bundle**. It teaches the island, rewards curiosity (the GTA exploration itch), and every entry is **a share card** ("I found the Dodo of Port Louis").

### 5.3 Rewards for leaving (the opposite of a trap)
Clash's "rested bonus" idea: **being offline earns something** (business income up to the cap, a rested-energy bonus, a "welcome back" crate). The message is "go live your life, we kept your place". This is also the honest answer for teen well-being. We also add a **"good night" feature**: if a player's local time is past midnight, the game gently offers sleep for a bonus. It is cheap, kind, and gets noticed.

### 5.3b Notifications (built, and how they are used)

The Clash loop needs a reason to open the game again. We use **web push** (a message from the game to the phone, even when the game is closed). It is **opt-in, asked once at a good moment** (right after the first reward), and the rules protect the player:
- **At most 2 a day**, **none between 23:00 and 07:00** (Mauritius time), **none while the player is already in the game**.
- The player chooses the kinds: **daily reward waiting** (08:30, protects a streak), **tonight's sega** (16:45), **a friend joined through your link** (immediately), and later **an upgrade or business is ready** and **a new mission**.
- Settings live in the phone's **Alerts** app: turn on or off, switch each kind, send yourself a test.
- **iPhone needs the game added to the Home Screen first** (Apple only allows push for installed web apps); the app says so.
- The server schedules a message for a known time (`schedule`), so when M1's timers exist, "your flat is ready" is one line of code.
- The server needs the `web-push` package and, on the live site, an environment variable `PUSH_CONTACT` (a `mailto:` address). The keys are created and stored by the server.

### 5.4 Things we will not do
- No gambling-based or random-purchase monetisation.
- No timers that **punish** you (nothing rots, no mass-loss of progress).
- No text that says someone will lose money.
- No push spam. **At most 2 notifications a day**, never at night, only for things the player chose (see 5.3b).
- No pay-to-win. Later paid items are **cosmetic** (outfits, flat themes, a name colour) and **convenience** (a second builder slot as a one-time unlock is the most we would consider, and only after a fair free path exists).

---

## 6. The first 15 minutes (the script, because this decides everything)

The goal: by minute 15 the player has **seen their character act, seen something finish, felt a choice, and set a timer they want to come back for.**

| Minute | What happens | Why |
|---|---|---|
| 0:00 | Name, look, three traits. Camera drops into the flat. | Identity first. |
| 0:45 | Step out. **Camera tour** (built) shows the capital. | The wow, and the map in the head. |
| 1:15 | **Mission 1: the lost suitcase** (built). Anita and Mme Chen, the first friends. | A story and two people. |
| 3:00 | Anita says "take the first shift". The player picks a **job** and **walks to their post**, works in front of colleagues (built). | The core action, visible. |
| 4:00 | Paid, with **materials**. A card: **"Start your flat's first upgrade"** (2 minutes, free). | The first timer, with an instant payoff. |
| 4:30 | The player **plays a mini-game** (the Games Room or the stage) while waiting. | Choice and fun while the timer runs. |
| 6:30 | **Ready!** The camera glides to the improved flat. | The Clash moment. |
| 7:00 | **Mission 2 starts**: a choice (who to serve first). **Loyalty** appears. | A decision with consequences. |
| 10:00 | Second upgrade offered (10 minutes). The **business seed** is shown on the board ("a food cart in 3 days of play"). | The long goal is visible. |
| 12:00 | **Invite a friend** card: both get a gift. A Today list is shown. | The social hook. |
| 15:00 | "Your builder is working. Come back at lunch." A notification time is offered. | The reason to return. |

### The return schedule (what pulls them back on each day)

| Day | The pull | What they find |
|---|---|---|
| **Day 1 (evening)** | "Your flat is ready" | L3 done; Mission 3; a crate; the stage at 17:00 is on tonight |
| **Day 2** | The Island Pass story (Mission 6); streak day 2 | The first real unlock; builder slot 2 |
| **Day 3** | The cart business | Income to collect; first customers |
| **Day 4-5** | A friend joined; **Crew** invite | A shared contract; help on timers |
| **Day 7** | The weekly event; the first **Album page** | A title; Act 1 nearly done |
| **Day 14** | Act 1 finale; Act 2 opens | A new town; a new rival |
| **Day 30** | Season end: prestige, rewards, the ranking | A reason to restart the ladder with bragging rights |

---

## 7. Crew (the social engine, Clash's clan)

- **Size 5 to 20.** A crew has a **hideout** (a building in Port Louis everyone can enter and decorate) that levels up with contributions, like a clan base.
- **Weekly contract**: a shared goal with a visible bar (e.g. *"Cater the Divali market: 500 plates"*, *"Run 200 bus tickets"*). Everyone's shifts count. Reaching tiers gives all members materials and a cosmetic.
- **Help**: members help each other's timers (5% each).
- **Crew versus crew**: a weekly ranking and a small, friendly rivalry feed ("Bagatelle Boys overtook Port Louis Rats").
- **Co-op heists and dares** use the crew.
- **Presence:** a crew **banner** and name tag on every member. People want to belong and to show it.

Friends outside a crew: visit homes, gift, **co-work a shift** (two players at the same post get a bonus and see each other), ride the wheel together.

---

## 8. The systems to build, in order (so we do not build a hundred things at once)

Each milestone is one thing a player will notice and has a **test that says it is done**. Server owns everything that matters.

| # | Milestone | What we build | Done when |
|---|---|---|---|
| **M1** | **"Your Place grows"** | Server-owned **timed upgrades** for the flat (L1-L5, builder slot, "ready" notice, camera moment, friend-help later); the Home screen shows the bar; the flat visibly changes each level; a **Today panel** with 3 goals and the stage time | A new player sees an upgrade finish in minute 6, returns after 10 minutes, 1 hour and next day and finds the next one waiting |
| **M2** | **"The jobs feed it"** | **Materials** from the eight workplaces; upgrade costs in money + materials; the **pacing script** and a retune; first-session mission 2 and 3 with a **choice** and **loyalty** | A player who wants a better kitchen is pulled to the restaurant; first 20 minutes tested on a real phone |
| **M3** | **"The story"** | The **mission engine** (server state per player: act, mission, flags, loyalty), the **mission board** at the terminal, **Act 1 missions 1 to 10**, the **Island Pass as a mission reward**, cast with homes and routines | A player can play Act 1 start to finish and open Grand Baie through the story |
| **M4** | **"Your business"** | The cart → stall → shop ladder, **offline earning with a cap**, staff NPCs, the till and queue visible in the world, defence upgrades | A player collects income after a night away and sees staff working |
| **M5** | **"Crew"** | Crews, the hideout, weekly contract, help, crew rank, co-op shift bonus | Two real friends form a crew and finish a contract together |
| **M6** | **"The Album and events"** | The Mauritius Album, the Tonight panel, the weekly event system, Season 1 and the prestige reward | A new week starts with something new and a reason to log in at 17:00 |
| **M7** | **"Raids and heists, made friendly"** | Shield, capped steals, visible raids, revenge, co-op heist in the bank vault | Raids are fun and never feel unfair to a new player |

### The data this needs (sketch, so the server person knows)

```
players[uid].builds   = [{ id, kind: "flat"|"biz"|"skill", level, startAt, endAt, helps }]   // times are SERVER times
players[uid].slots    = 1                                                                  // builder slots
players[uid].mats     = { flavour, contacts, goods, buzz, supplies }
players[uid].story    = { act, mission, flags: {...}, loyalty: { anita:3, chen:2, ... } }
players[uid].streak   = { days, lastDay, freeMissUsed }
players[uid].album    = { pageId: [entries] }
crews[id]             = { name, members[], hideoutLevel, contract: { goal, progress, endsAt } }
```
Requests: `build.start / build.collect / build.help`, `mission.state / mission.choose / mission.done`, `album.mark`, `crew.*`. All rewards and timers are decided on the server and safe to repeat (a lost request must not give a reward twice).

### How we know it works (measure from day one)
Add simple counters on the server (no personal data): **time to first upgrade, time to first return, D1 / D7 / D30 return, sessions a day, missions completed per day, where players stop in the first 15 minutes, how many invite a friend, how many join a crew.** Targets from `docs/LAUNCH.md`: **30% playing on day 7**. We read these numbers every week and cut what does not move them.

---

## 9. What we already have that this uses

| We have | Used for |
|---|---|
| Real workplaces with staff and customers (8 kinds) | Jobs that give **materials**; a business with NPC staff |
| The camera tour and Chapter 1 story card | The mission **hook** and the **"Ready!"** moment |
| Server-side casino, jobs, market, Island Pass | The server is already the authority on money and rewards |
| Real-clock events, the stage, the Ferris wheel, the Games Room | The evening hook and the free-roam fun |
| NPCs, drivers, residents with personalities | The **cast** of the story |
| Raids, heists, homes, parties, rich list, parliament (from Flic en Flac Life) | **Defence, co-op, status**; reskin and rebalance |
| The visual rule (`CLAUDE.md`) | Every mission and upgrade is **acted out in the world** |

**What is missing** (so the roadmap is honest): the timed-upgrade system, materials, the mission engine and cast, offline-earning businesses, crews, the Album, the notification channel, analytics, and a re-tuned economy.

---

## 10. Questions for you (these change the plan)

1. **Audience age floor**: is 15 the real minimum? If younger players are expected, we tighten chat, the casino and the notifications.
2. **Notifications**: the best channel for this audience is **WhatsApp or web push**. Which do you want to use first (it needs a small service)? Without any notification, the Clash loop works much less well.
3. **Crew first or business first?** I suggest the flat's timers first (M1), then jobs and materials (M2), then the story (M3). Do you want the story earlier so the first week feels bigger?
4. **The rival**: a man, a woman, or a faceless company? It sets the tone (comic, serious, local gangster, family business).
5. **Money later**: are cosmetics enough for the business, or do you plan sponsors and partners (local brands in the world)?

---

**Short version of the plan:** *grow your place on real timers (Clash), follow a story full of people you care about across a real island (GTA), do every action in the world where people can see it, do it with friends, and always leave the player three things to come back to.*
