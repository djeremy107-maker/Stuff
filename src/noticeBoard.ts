import { db } from "./db.js";
import { gameData } from "./content/gameData.js";
import type { PlayerState } from "./engine.js";

// The Merchant's Dock: a daily-rotating shared notice board. Three regular
// orders (fulfillable by either player, coins paid instantly per unit) plus
// one coop order with a bigger target — since `delivered` is one shared
// counter, "both contribute" falls out naturally from either player calling
// deliverOrder, no separate per-player tracking needed.
export interface Order {
  id: string;
  item: string;
  qty: number;
  delivered: number;
  multiplier: number; // sell-value multiplier paid per unit delivered
  marksReward: number; // Guild Marks paid once, on full completion
  coop: boolean;
  completed: boolean;
}

const DAY_MS = 24 * 3600 * 1000;

// Small deterministic PRNG so a given day always rolls the same orders (nice
// if the row is ever reset, and avoids needing an external cron).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function orderPool(): { id: string; value: number }[] {
  return Object.values(gameData.items)
    .filter((it) => (it.category === "fish" || it.category === "material") && (it.value ?? 0) > 0)
    .map((it) => ({ id: it.id, value: it.value! }));
}

function makeOrder(rng: () => number, index: number, dayKey: number, coop: boolean): Order {
  const pool = orderPool();
  const item = pool[Math.floor(rng() * pool.length)];
  const baseQty = coop ? 36 : 12;
  const rawQty = Math.round(baseQty * (12 / Math.max(2, item.value)));
  const qty = Math.max(3, Math.min(coop ? 120 : 60, rawQty));
  const multiplier = Math.round((1.5 + rng() * 0.5) * 100) / 100;
  const marksReward = coop ? 20 + Math.round(rng() * 10) : Math.max(2, Math.round(3 + rng() * 5));
  return { id: `${dayKey}-${index}`, item: item.id, qty, delivered: 0, multiplier, marksReward, coop, completed: false };
}

function generateOrders(dayKey: number): Order[] {
  const rng = mulberry32(dayKey);
  const orders: Order[] = [];
  for (let i = 0; i < 3; i++) orders.push(makeOrder(rng, i, dayKey, false));
  orders.push(makeOrder(rng, 3, dayKey, true));
  return orders;
}

const selectBoard = db.prepare("SELECT orders_json, refreshed_at FROM notice_board WHERE id = 1");
const regenBoard = db.prepare("UPDATE notice_board SET orders_json = ?, refreshed_at = ? WHERE id = 1");
const saveOrdersStmt = db.prepare("UPDATE notice_board SET orders_json = ? WHERE id = 1");

// Reads today's orders, regenerating (once) if the day has rolled over.
export function noticeBoardOrders(): Order[] {
  const row = selectBoard.get() as { orders_json: string; refreshed_at: number };
  const dayKey = Math.floor(Date.now() / DAY_MS);
  const savedDayKey = Math.floor(row.refreshed_at / DAY_MS);
  if (!row.refreshed_at || dayKey !== savedDayKey) {
    const orders = generateOrders(dayKey);
    regenBoard.run(JSON.stringify(orders), Date.now());
    return orders;
  }
  return JSON.parse(row.orders_json);
}

const selectMarks = db.prepare("SELECT marks FROM guild WHERE id = 1");
const addMarks = db.prepare("UPDATE guild SET marks = marks + ? WHERE id = 1");
const spendMarksStmt = db.prepare("UPDATE guild SET marks = marks - ? WHERE id = 1 AND marks >= ?");

export function guildMarksBalance(): number {
  const row = selectMarks.get() as { marks: number } | undefined;
  return row?.marks ?? 0;
}
export function creditGuildMarks(n: number) {
  if (n > 0) addMarks.run(n);
}
export function spendGuildMarks(n: number): boolean {
  return spendMarksStmt.run(n, n).changes > 0;
}

export function noticeBoardInfo() {
  const dayKey = Math.floor(Date.now() / DAY_MS);
  return {
    orders: noticeBoardOrders(),
    nextRefreshAt: (dayKey + 1) * DAY_MS,
    marks: guildMarksBalance(),
  };
}

export interface DeliverResult {
  ok: boolean;
  error?: string;
  coins?: number;
  marks?: number;
  completed?: boolean;
}

export function deliverOrder(p: PlayerState, orderId: string, qty: number): DeliverResult {
  const orders = noticeBoardOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, error: "That order is no longer available — check back tomorrow." };
  if (order.completed) return { ok: false, error: "That order has already been fulfilled." };
  const remaining = order.qty - order.delivered;
  const want = Math.max(1, Math.floor(qty || 1));
  const give = Math.min(want, remaining);
  const def = gameData.items[order.item];
  if (!def) return { ok: false, error: "Unknown item." };
  if ((p.inventory[order.item] || 0) < give) return { ok: false, error: `You don't have ${give}x ${def.name}.` };

  p.inventory[order.item] -= give;
  if (p.inventory[order.item] <= 0) delete p.inventory[order.item];
  const coins = Math.round((def.value ?? 0) * order.multiplier * give);
  p.coins += coins;
  order.delivered += give;

  let marks = 0;
  let completed = false;
  if (order.delivered >= order.qty) {
    order.completed = true;
    completed = true;
    marks = order.marksReward;
    creditGuildMarks(marks);
  }
  saveOrdersStmt.run(JSON.stringify(orders));
  p.updatedAt = Date.now();
  return { ok: true, coins, marks, completed };
}

export function buyWithMarks(p: PlayerState, item: string, qty: number): { ok: boolean; error?: string } {
  const entry = gameData.marksShop.find((e) => e.item === item);
  if (!entry) return { ok: false, error: "The Guild Marks shop doesn't stock that." };
  qty = Math.max(1, Math.floor(qty));
  const cost = entry.price * qty;
  if (!spendGuildMarks(cost)) return { ok: false, error: "Not enough Guild Marks." };
  p.inventory[item] = (p.inventory[item] || 0) + qty;
  p.updatedAt = Date.now();
  return { ok: true };
}
