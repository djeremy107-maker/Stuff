// XP / level curve. Cumulative XP required to *reach* a given level.
// Smooth, RS-inspired growth so early levels are quick and later ones matter.

export const MAX_LEVEL = 99;

const cumulative: number[] = [0, 0]; // index by level; level 1 => 0 xp
for (let lvl = 2; lvl <= MAX_LEVEL + 1; lvl++) {
  const prev = cumulative[lvl - 1];
  const delta = Math.floor((lvl - 1) * 100 * Math.pow(1.104, lvl - 2));
  cumulative[lvl] = prev + delta;
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return cumulative[MAX_LEVEL];
  return cumulative[level];
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= cumulative[level + 1]) level++;
  return level;
}

// Progress toward the next level, 0..1 (returns 1 at max level).
export function levelProgress(xp: number): { level: number; into: number; needed: number; pct: number } {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, pct: 1 };
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const into = xp - base;
  const needed = next - base;
  return { level, into, needed, pct: needed > 0 ? into / needed : 0 };
}
