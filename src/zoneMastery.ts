// Zone Mastery: a per-zone 1-50 level fed by catches made in that specific
// zone (Melvor's per-action progression layer, fishing-flavored) — a second,
// independent progression axis alongside the Fishing skill itself. Grants a
// modest zone-specific rare-chance and cast-speed bonus, so settling into
// one zone for a long stretch pays off beyond just the shared Fishing level.

export const ZONE_MASTERY_MAX = 50;

// Linear-ish growth, deliberately much shallower than the 99-level skill
// curve — level 50 lands around ~7,800 cumulative mastery XP, reachable in
// a few thousand catches in a zone you actually camp in, not tens of
// thousands.
const cumulative: number[] = [0, 0];
for (let lvl = 2; lvl <= ZONE_MASTERY_MAX + 1; lvl++) {
  const delta = 15 + (lvl - 2) * 6;
  cumulative[lvl] = cumulative[lvl - 1] + delta;
}

export function zoneMasteryLevelForXp(xp: number): number {
  let level = 1;
  while (level < ZONE_MASTERY_MAX && xp >= cumulative[level + 1]) level++;
  return level;
}

export function zoneMasteryProgress(xp: number): { level: number; into: number; needed: number; pct: number } {
  const level = zoneMasteryLevelForXp(xp);
  if (level >= ZONE_MASTERY_MAX) return { level, into: 0, needed: 0, pct: 1 };
  const base = cumulative[level];
  const next = cumulative[level + 1];
  const into = xp - base;
  const needed = next - base;
  return { level, into, needed, pct: needed > 0 ? into / needed : 0 };
}

// Flat per-catch mastery XP by rarity tier — deliberately independent of a
// zone's xpMult (which scales Fishing-skill XP), so mastery accrues at a
// comparable per-catch rate everywhere; a zone's naturally slower cast time
// is already the tradeoff for its richer rarity mix.
const MASTERY_XP: Record<string, number> = { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 20 };
export function masteryXpForRarity(rarity: string): number {
  return MASTERY_XP[rarity] ?? 1;
}

// +0.1pp rare chance and -0.1% cast time per level, capping at +5pp / -5%.
export function zoneMasteryRareBonus(level: number): number {
  return 0.001 * level;
}
export function zoneMasterySpeedMult(level: number): number {
  return 1 - 0.001 * level;
}
