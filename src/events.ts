import { gameData } from "./content/gameData.js";

// A live "hotspot" event: one zone gets boosted rare chance + faster casts for
// a short window. It's the same for both players — a shared reason to go fish
// the same spot together.
export interface FishingEvent {
  zoneId: string;
  zoneName: string;
  icon: string;
  rareBonus: number; // added to rare-catch bonus while fishing this zone
  speedMult: number; // multiplies cast time (lower = faster)
  startsAt: number;
  endsAt: number;
}

const EVENT_INTERVAL_MS = Number(process.env.EVENT_INTERVAL_MIN ?? 8) * 60 * 1000;
const EVENT_DURATION_MS = Number(process.env.EVENT_DURATION_MIN ?? 3) * 60 * 1000;

let current: FishingEvent | null = null;

export function getActiveEvent(now = Date.now()): FishingEvent | null {
  if (current && now < current.endsAt) return current;
  return null;
}

function rollEvent(): FishingEvent {
  const zone = gameData.zones[Math.floor(Math.random() * gameData.zones.length)];
  const now = Date.now();
  return {
    zoneId: zone.id,
    zoneName: zone.name,
    icon: zone.icon,
    rareBonus: 0.15,
    speedMult: 0.85,
    startsAt: now,
    endsAt: now + EVENT_DURATION_MS,
  };
}

// Start the event loop. `onChange` is called whenever the active event starts
// or ends so the server can broadcast it.
export function startEvents(onChange: (event: FishingEvent | null) => void) {
  const begin = () => {
    current = rollEvent();
    onChange(current);
    setTimeout(() => {
      current = null;
      onChange(null);
    }, EVENT_DURATION_MS);
  };
  // Kick one off shortly after boot, then on the interval.
  setTimeout(begin, 20_000);
  setInterval(begin, EVENT_INTERVAL_MS);
}
