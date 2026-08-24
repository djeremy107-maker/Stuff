import type { TimePhase, WeatherPhase } from "./content/types.js";

// The shared world clock: a pure function of real time (epoch ms), so both
// players always see the same sky with no server-side state to persist, and
// any past moment — including deep in an offline catch-up window — can be
// evaluated exactly the same way live or replayed.

const TIME_PHASES: TimePhase[] = ["dawn", "day", "dusk", "night"];
const TIME_PERIOD_MS = 3 * 3600 * 1000; // 3h per phase — a 12h full cycle

// Weighted toward clear so storms/fog feel like a event worth noticing.
const WEATHER_PHASES: WeatherPhase[] = ["clear", "clear", "clear", "rain", "clear", "storm", "clear", "fog"];
const WEATHER_PERIOD_MS = 35 * 60 * 1000; // 35 min per phase

export function timeOfDayAt(clock = Date.now()): TimePhase {
  return TIME_PHASES[Math.floor(clock / TIME_PERIOD_MS) % TIME_PHASES.length];
}
export function weatherAt(clock = Date.now()): WeatherPhase {
  return WEATHER_PHASES[Math.floor(clock / WEATHER_PERIOD_MS) % WEATHER_PHASES.length];
}
export function nextTimeChangeAt(clock = Date.now()): number {
  return (Math.floor(clock / TIME_PERIOD_MS) + 1) * TIME_PERIOD_MS;
}
export function nextWeatherChangeAt(clock = Date.now()): number {
  return (Math.floor(clock / WEATHER_PERIOD_MS) + 1) * WEATHER_PERIOD_MS;
}

export function worldStateAt(clock = Date.now()) {
  return {
    time: timeOfDayAt(clock),
    weather: weatherAt(clock),
    nextTimeAt: nextTimeChangeAt(clock),
    nextWeatherAt: nextWeatherChangeAt(clock),
  };
}
