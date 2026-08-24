# Why Idle Games Hook People — Research & Application to Idyll

*Research into the psychology of idle/incremental games (Melvor Idle, Milky Way
Idle, Old School RuneScape) and the social "flex" layer of online games, with a
prioritized plan for applying it to Idyll. Sources at the bottom; a few
well-established patterns are noted as general design knowledge where the
session's search quota cut off before a source could be pulled.*

---

## 1. The core psychology — why "number go up" feels so good

**Variable-ratio reinforcement (the big one).** Unpredictable rewards are far
more compelling than predictable ones — B.F. Skinner's classic operant
conditioning result. The uncertainty of *what* you'll get, combined with the
possibility of something valuable, triggers dopamine in the brain's reward
pathways and creates a loop of anticipation → outcome → desire to try again.
This is why a fish table with a 1-in-3000 legendary is more gripping than a
vending machine that pays out the same value every cast. Idyll's rarity-
weighted catch rolls are already this mechanic — the research says to *lean
into the anticipation*, because:

**Dopamine is about anticipation, not the reward itself.** The spike comes
*before* the outcome — the moment the progress bar is about to fill, the cast
that might be the big one. Design implication: make the *approach* to a reward
visible (progress toward next level, "you're close" states, on-screen rolls)
rather than just the reward.

**Measurable growth.** RuneScape's grind is addictive because it "creates
achievable goals for imminent rewards and plays on the human need to see
measurable growth." Every XP drop is proof you're moving. The corollary: any
moment where effort produces *no visible number change* is a leak in the loop.

**Investment creates value (sunk-cost as a feature).** In OSRS, "almost
everything worth having requires long investments of time" — and that's
exactly *why* it feels valuable. The sense of accomplishment comes from the
struggle. Cheap rewards are forgettable; a 6-week Guild level is a shared
monument.

**Beyond dopamine: competence, autonomy, goals.** Engagement research stresses
that lasting engagement also needs competence (I'm getting better), autonomy
(I chose this plan), goal progression, and meaningful decisions. Idle games
that are *pure* Skinner boxes burn out; Melvor and MWI last because planning
and optimization are real choices. Idyll's efficiency system ("push the new
zone or farm the old one?") is on the right track.

**Always-open loops.** Well-designed idle games keep several goals partially
complete at all times (the Zeigarnik effect — unfinished tasks occupy the
mind). When one bar fills, another should already be 80% done.

**The check-in rhythm.** Idle-game research (Pecorella's GDC work) finds the
most effective engagement cadence is a *rhythmic check-in* every 30 minutes to
2 hours — not constant play. Offline progress converts absence into
anticipation ("what's waiting for me?"). Our welcome-back recap is exactly
this; it should be the most celebratory screen in the game.

---

## 2. What each reference game does mechanically

### Old School RuneScape ("number go up," the ancestor)
- **The XP curve doubles-down on investment**: each level costs ~10.4% more
  than the last, so early levels rain down and late levels are monuments.
  (Idyll's curve deliberately mirrors this.)
- **Total level** — a single number summarizing your whole account; instantly
  comparable between players.
- **Skillcapes** — reaching level 99 grants a *wearable, visible* badge.
  It's not power; it's proof. Other players see it and know.
- **Collection log** — 1,700+ unique tracked drops. Described as "a badge of
  honor — a testament to your dedication, skill, and patience"; one of the
  most popular end-game goals. Completing a section = "bragging rights."
- **Pets** — ultra-rare (often 1-in-thousands) cosmetic drops from ordinary
  activities. "Prestigious status symbols" precisely *because* the drop rates
  are brutal; every cast is a lottery ticket for a permanent flex.
- **Party hats** — scarcity + history = status. They're valuable because they
  signal "I was there / I earned this," and players wear them *to be seen*.
- **Broadcasts** *(general design knowledge — search quota)*: level-99s and
  rare drops fire server/clanwide announcements with fireworks. The moment of
  achievement is *witnessed*, which multiplies its value. This is the single
  cheapest "flex" mechanic to build in a coop game.

### Melvor Idle (the solo distillation)
- **Mastery: a second progression layer per *action*.** Every individual item
  (each tree, each fish, each recipe) has its own Mastery level 1–99 granting
  bonuses to *that action*. Result: even inside one skill, there's always a
  bar about to fill. This is Melvor's engagement engine.
- **Mastery pool with checkpoints** at 10/25/50/95% granting skill-wide
  passive bonuses — a *meta*-bar over the per-action bars, plus a spendable
  resource (you can dump pool XP into a specific action's mastery = a
  meaningful choice).
- **Interconnected skills**: "all the hard work you put into one skill will
  in turn benefit others" — loops of growth, optimization, discovery.
- **Fits around life**: offline progression + cloud saves; "maxing your
  skills has never been more zen." The game respects absence.

### Milky Way Idle (the social multiplayer distillation)
- Minimal clicking + **action queue** (we have this).
- **Interdependent skills** + efficiency (we have this).
- **Enhancing** — gear upgrading with success chances; a voluntary
  slot-machine for progression (Phase 2 for us).
- **Marketplace, chat, guilds, leaderboard** — "the community aspect is a
  big bonus and main selling point." Even in an idle game, *other people* are
  the retention feature: prices give goals, chat gives belonging, leaderboards
  give status.
- **Random tasks** — rotating objectives that direct each session.

### Cross-cutting: the nested-loop timescale model
Successful incrementals run reward loops at every timescale simultaneously:

| Timescale | OSRS/Melvor/MWI example | Idyll today | Gap |
|---|---|---|---|
| Seconds | XP drop per action | catch + XP per cast | fine |
| Minutes | level-up, rare drop | level-ups, rares | ✅ but under-celebrated |
| Session (30m–2h) | task done, mastery level | queue finishes, recap | ✅ |
| Day | dailies, tasks | hotspots only | **gap: daily loop** |
| Week | 99s, gear tiers | rod tiers, guild levels | thin until Phase 2 |
| Month+ | collection log, pets, party hats | collection exists but shallow | **gap: chase content** |

---

## 3. The social "flex" layer — status in a two-player world

The research on party hats and collection logs converges on one principle:
**an achievement's value is multiplied by being *witnessed*.** Rarity matters
because it signals invested time to *someone else who understands the cost*.

Idyll's "server" is two people who love each other — which actually makes
this *stronger*, not weaker: the one other player is guaranteed to care. The
flex mechanics that translate:

1. **Broadcasts** — when your partner hits Fishing 50 or lands a Kraken
   Hatchling, it should announce in chat with fanfare, *while they're away
   too* (so you come home to "🎉 Ana reached Cooking 40 while you were out").
2. **Visible badges** — titles and cape-analogues shown next to your name in
   the party panel and chat, chosen by the wearer (autonomy = the flex is
   *curated*).
3. **Records board** — "biggest Swordfish: Ana, 287cm" per species. Every
   record is *takeable*, which creates friendly rivalry loops ("she beat my
   trout record while I slept").
4. **Firsts** — permanent "first to catch X" plaques in the collection.
   Scarcity in a 2-player game = there's only one "first," ever.
5. **Trophy display** — a shared page where record catches are *displayed*
   (the Boathouse Trophy Hall in Phase 2) — the party-hat principle: a place
   to wear it.

---

## 4. Honest-design guardrails

Idyll has no monetization, so we can use these levers guilt-free — but two
patterns from the literature are worth *refusing* anyway:

- **No fake near-misses.** Slot machines fabricate "almost won!" states;
  research classes this with gambling harm. Honest variant: *truthful* rare
  visibility (e.g., "something enormous took the bait but the line wasn't
  strong enough" only when a legendary was genuinely rolled and a real gear
  check genuinely failed — never a scripted tease).
- **Punishing streak loss.** Streaks that *take things away* create anxiety,
  not fun, especially for a couple with different play schedules. Use
  gain-only streaks (bonus if you return, no penalty if you don't).
- The rest — variable rewards, celebration, collection, status — are the
  same mechanics board games and hobbies use. A game two people return to
  because it feels *good* is the whole point.

---

## 5. Prioritized implementation plan for Idyll

Ordered by (impact on the loop) ÷ (effort), and by dependency.

### Tier 1 — Celebration & witness layer (the biggest cheap win)
The research is unanimous: the *moment* of achievement is under-exploited in
Idyll today (a toast). Make achievements loud and shared:
1. **Level-up fireworks** — full-screen-ish burst + sound-free juice on
   level-up; bigger at milestone levels (10/25/50/75/92/99).
2. **System broadcasts in chat** (persisted, so the partner sees them later):
   level milestones, new species, records broken, rare+ catches, achievements,
   guild level-ups. Rarity-colored.
3. **Rare-catch fanfare** — epic/legendary catches get a distinct on-screen
   moment (not just an inventory increment).

### Tier 2 — Zone Mastery (Melvor's engine, fishing-flavored)
Per-zone mastery level 1–50, fed by catches in that zone. Each level: +0.5%
rare chance and +0.2% efficiency *in that zone*; milestone levels (10/25/40/50)
unlock zone-specific perks (e.g., Pond 25: minnows auto-sell; Lake 40: +1
Golden Carp weight). Result: even a "farmed out" zone always has a bar about
to fill. One new number per zone, huge always-open-loop coverage.

### Tier 3 — Chase content & the deep collection log
1. **Shiny variants** — every species has a 1/500 "shiny" recolor logged
   separately in the Collection (the OSRS pet principle: any cast can be a
   permanent trophy). Shinies sell for 10× or display in the Trophy Hall.
2. **Records & firsts board** — per-species biggest-catch record holder +
   "first caught by," visible to both; a Records tab on the Collection.
3. **Collection completion %** per zone with rewards at 25/50/75/100%
   (Melvor pool-checkpoint pattern applied to collection).
4. **Bad-luck protection** *(general design knowledge)*: after N× the
   expected attempts without a legendary, quietly ramp the odds (a pity
   counter). Keeps brutal rarity exciting instead of despair-inducing for a
   2-player game with no market to buy your way out.

### Tier 4 — Identity & titles
1. **Titles** from achievements/guild ranks ("Leviathan Hunter," "The
   Idyllic"), one equipped, shown in party panel + chat.
2. **Cape analogue** — skill 99 grants a cosmetic badge on your name; total
   level milestones (150/250/350) grant frames. Pure status, zero power —
   exactly like skillcapes.

### Tier 5 — The daily rhythm (folds into Phase 3's Notice Board)
Daily coop task + gain-only return bonus ("first catch of the day is always
a guaranteed uncommon+"), weekly guild goal. Appointment mechanics tuned to
the 30min–2h check-in rhythm, never punishing absence.

### Sequencing note
Tier 1 first (it amplifies *every* existing and future reward), then Tier 2
(new always-open loops), then 3–5 interleaved with the existing Phase 2
(Gear & Boathouse) roadmap — enhancement itself is a variable-reward
mechanic, so Phase 2 already carries this research forward.

---

## Sources

- [Idle Game Psychology: Why Incremental Games Are So Engaging](https://thebillionaireempire.org/blogs/how-idle-games-use-psychology)
- [The Psychology of Addicting Games (Emotiv)](https://www.emotiv.com/neuroscience/addicting-games)
- [Dopamine Simulator Games: Why Incremental & Clicker Games Are So Addictive](https://www.playmushies.com/blog/dopamine-simulator-games-why-theyre-addictive.html)
- [In-Game Rewards: Understanding Why Video Games Are So Addictive (Simply Put Psych)](https://simplyputpsych.co.uk/gaming-psych/in-game-rewards-understanding-why-video-games-are-so-addictive)
- [How Idle Games Have Hacked Our Brains (VGTimes)](https://vgtimes.com/articles/163598-why-idle-games-are-so-popular.html)
- [The addictive psychology behind clicker games (Softonic)](https://en.softonic.com/articles/addictive-psychology-clicker-games)
- [Melvor Idle — Mastery (wiki)](https://wiki.melvoridle.com/w/Mastery)
- [Melvor Idle on Steam](https://store.steampowered.com/app/1267910/Melvor_Idle/)
- [Melvor Idle: Skill Mastery Guide (Games Fuze)](https://gamesfuze.com/guides/melvor-idle-skill-mastery-guide/)
- [Melvor Idle Guide (EarlyGuides)](https://earlyguides.com/melvor-idle)
- [How to Treat Runescape Addiction (The Mindful Gamer)](https://themindfulgamer.com/how-to-treat-runescape-addiction/)
- [Milky Way Idle — official site](https://www.milkywayidle.com/game)
- [Milky Way Idle on Steam](https://store.steampowered.com/app/3224420/Milky_Way_Idle/)
- [Milky Way Idle Wiki](https://milkywayidle.wiki.gg/)
- [How Runescape's party hat became so valuable (PCGamesN)](https://www.pcgamesn.com/runescape/party-hat-most-expensive-item)
- [OSRS Partyhat: The Ultimate Symbol of Wealth and Nostalgia (Win Rods)](https://win-rods.com/osrs-partyhat/)
- [Partyhats — RuneScape Wiki](https://runescape.wiki/w/Partyhats)
- [OSRS Collection Log Guide (MyPvM)](https://mypvm.com/blog/osrs-collection-log-guide-2026)
- [Collection log — OSRS Wiki](https://oldschool.runescape.wiki/w/Collection_log)
- [OSRS Pet Hunting Guide — Drop Rates & Collection Strategies](https://dropchancecalc.com/osrs-pet-complete-guide)
- [GDC 2015: Anthony Pecorella — "Idle Games: The Mechanics and Monetization of Self-Playing Games" (Internet Archive)](https://archive.org/details/GDC2015Pecorella)
- [Top 7 Idle Game Mechanics (Mobile Free To Play)](https://mobilefreetoplay.com/top-7-idle-game-mechanics/)
- [The Math of Idle Games, Part I (Game Developer)](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i)
