# Women and men in Mauritius Life: an audit (9 Nov 2026)

Both men and women will play, so every system should feel equally good for both. This lists what the game does today (read from the code, and a browser check of a woman character), what is unequal, and what to fix first. Nothing here is changed yet.

## What already works
- **Choosing and changing gender:** Jump In offers Man or Woman (random one pre-selected); the mirror and the Character Studio can switch at any time.
- **Looks and poses:** a woman character renders without errors on the street, in third person and in the main work poses; the random starter look works for both.
- **Fair starts:** both get the same money, rent, jobs, flat upgrades, XP, levels, boats, Metro and leaderboards. The patron list (Sugar Mummies and Daddies) is 6 and 6.
- **Mixed crowds:** shop and workplace staff alternate between men and women.

## What is unequal (most important first)
1. **Street harassment event (women only).** While a woman walks, mostly in the evening, an older man can appear and bother her; in about a third of cases he offers money to come to his bungalow tonight. Men get no equivalent. It also counts "harassed" and "reported" on her record. For a game that wants women playing, this is the largest risk: it can read as the game targeting women, and the money offer is sexual solicitation. Recommended: remove the money offer; make the event rare and neutral; give EVERY player (men too) a comparable stranger event (a pushy salesman, a pickpocket, a scammer); keep a quick "Walk away / Report" choice with no penalty.
2. **Women-only life systems.** Period tracker (can be switched off), pregnancy risk after intimacy, pregnancy tests and check-ups, a termination option, and the weekly cost of children. Men have no cost or risk at all, so the same choice costs women real time and money and men nothing. Recommended: (a) keep them but make them clearly optional and switchable (a "Life events" switch for everyone, off by default); (b) give men a matching cost when they have a partner who is pregnant (support, time, a share of the weekly child cost); (c) confirm the age floor (see below).
3. **Class perks.** "Pretty Girl" (a woman with style 5+) gets 20% off Hair & Nails and +10% tips at work; "King" says "(men)" and "Queen" is for women. The Big Baller and Surf Legend classes are open to all. There is no equal stylish perk for men. Recommended: rename Pretty Girl to a neutral "Stylish" class open to everyone with the same perk; make King and Queen the same class with two titles.
4. **Fewer everyday clothes for women.** 40 pieces for women against 43 for men, and several of the women's are costumes (witch robe, hooded cloak, sci-fi suit). Neither gender has swimwear, formal wear, traditional wear (sari, salwar, hijab and modest wear) or natural hair textures (braids, curls). Recommended: add a set of everyday outfits for both: swimwear, formal, traditional and modest wear, and hair textures that match the island's communities. This also covers the 5 skin tones.
5. **Fewer women in town.** The 24 named residents are 16 men and 8 women. Recommended: bring it to 12 and 12 when the next residents are added, with women in more roles (drivers, police, bosses).
6. **Relationship words.** Only "girlfriend" and "boyfriend", chosen from the other person's gender. There is no neutral option. Recommended: a neutral "partner" and let people choose.
7. **Wording.** About 22 places use "he/him/his" as the default, and a few old lines are gendered ("Leave like a princess" for men in the nail salon, which is switched off).
8. **Builders and similar new props** use male looks only (my builders and hard-hat workers); the housekeeper is a woman. Recommended: alternate them.

## Not built yet but must be designed for both
- **Bambous guns, cartels and opps:** enemy crews and the player's cartel should include women, and there must be no gendered violence or harassment in them.
- **Story missions (Zistwar):** equal numbers of women and men as leads, bosses and allies.

## Open questions for the owner
- **Age floor:** pregnancy, intimacy and the termination option make this an adult game. Do we set a minimum age (CORE.md suggests 15 for the game, with these systems at 18)?
- **Harassment event:** remove it, or keep a gentler version for everyone?
- **Life events:** should the period, pregnancy and children systems be on, off or optional by default?

## Suggested order
1. Harassment event: remove the money offer and make it neutral for everyone (small).
2. Neutral class names and perks (small).
3. Life events as a switch for everyone, and a matching cost for men (medium).
4. New everyday outfits and hair textures for both (medium, art).
5. Residents and relationship words (small).

## Done (10 Nov 2026)
1. **Street event:** replaced by rare "pushy strangers" (a salesman, someone asking for Rs 200, a bag brush) for every player, men or women as the stranger, no money-for-sex offer, with Walk away and Report (no penalty). Never in the first visit.
2. **Classes:** "Pretty Girl" is now "Stylish" (style 5+, open to everyone, same perks). King/Queen and His/Her Majesty stay as two titles of the same level.
3. **Life events:** period tracking is now opt-in (it was on by default). Adult romance stays an opt-in 18+ switch. A man who hooks up now has the same pregnancy chance for his partner: after the same time he becomes a father and pays the same childcare as a mother (Rs 1,500 a week each child).
4. **Outfits:** the character pack only has these pieces, so no new clothes models were possible. Instead: free top and trousers dyes with 14 and 10 colours for both genders, and 8 "Everyday looks" (Beach day, Smart, Night out, Sporty, Sunday best, Tropical, Pink and grey, Classic) in the mirror and the Studio. **Still needs art:** swimwear, formal wear, traditional and modest wear (sari, salwar, hijab) and natural hair textures (braids, curls, afro) need new 3D models (commission or a CC0 pack).
5. **Residents and words:** 8 new women (16 and 16 now). A Settings switch for "partner" instead of girlfriend/boyfriend (matched to the other person by default).
6. **Wording that fits the player (`gender.js`):** madame/monsieur and frer/sœur follow your character in toasts, NPC speech and menus.
Not yet: other "he/she" lines in older text, builders' looks, Bambous crews.
