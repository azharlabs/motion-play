/**
 * The activity log: what was played, when, and what the body did.
 *
 * Everything here is pure. The shell hands in the stored history and gets back
 * numbers to render, which keeps the arithmetic testable and means a corrupt
 * or half-written log degrades into an empty one instead of a broken screen.
 *
 * Days are local days. Someone playing at eleven at night expects it to count
 * as today, not as tomorrow in UTC.
 */
import { GAMES } from "./games/registry.js";
import { ACTION_IDS } from "./skills.js";

export const HISTORY_KEY = "motionplay.history";

/** Roughly two years of daily play. Old rounds fall off the end. */
export const MAX_ROUNDS = 800;

/** Local calendar day as YYYY-MM-DD, which sorts correctly as a string. */
export function dayKey(when) {
  const d = when instanceof Date ? when : new Date(when);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Turn a finished round into a log entry, dropping anything unrecognised so a
 * future game cannot write nonsense into the history.
 */
export function roundEntry({ game, at = Date.now(), ms = 0, score = 0, level = 1, actions = {} }) {
  const kept = {};
  for (const [id, n] of Object.entries(actions)) {
    if (ACTION_IDS.includes(id) && n > 0) kept[id] = Math.round(n);
  }
  return {
    game,
    at,
    day: dayKey(at),
    ms: Math.max(0, Math.round(ms)),
    score,
    level,
    actions: kept,
  };
}

/** Append a round, newest last, trimming the oldest once the log is full. */
export function addRound(history, entry, max = MAX_ROUNDS) {
  const next = [...(history ?? []), entry];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Anything that is not a well formed round is thrown away on read. */
export function parseHistory(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (e) => e && typeof e.game === "string" && typeof e.at === "number" && e.actions,
  );
}

const addInto = (target, source) => {
  for (const [id, n] of Object.entries(source ?? {})) target[id] = (target[id] ?? 0) + n;
  return target;
};

/**
 * Everything the activity screen shows, in one pass over the log.
 *
 * `days` limits the day-by-day breakdown; the totals always cover the whole
 * history, because "3,412 jumps since you started" is the number people want.
 */
export function summarise(history, { days = 14, now = Date.now(), catalogue = GAMES } = {}) {
  const rounds = history ?? [];
  const byId = new Map(catalogue.map((g) => [g.id, g]));

  const totals = { rounds: rounds.length, ms: 0, actions: {} };
  const dayMap = new Map();
  const gameMap = new Map();
  const skillMs = new Map();

  for (const round of rounds) {
    totals.ms += round.ms;
    addInto(totals.actions, round.actions);

    const day = round.day ?? dayKey(round.at);
    if (!dayMap.has(day)) dayMap.set(day, { day, rounds: 0, ms: 0, actions: {}, games: {} });
    const bucket = dayMap.get(day);
    bucket.rounds += 1;
    bucket.ms += round.ms;
    bucket.games[round.game] = (bucket.games[round.game] ?? 0) + 1;
    addInto(bucket.actions, round.actions);

    if (!gameMap.has(round.game)) {
      gameMap.set(round.game, {
        id: round.game,
        title: byId.get(round.game)?.title ?? round.game,
        rounds: 0,
        ms: 0,
        bestScore: 0,
        bestLevel: 0,
      });
    }
    const played = gameMap.get(round.game);
    played.rounds += 1;
    played.ms += round.ms;
    played.bestScore = Math.max(played.bestScore, round.score ?? 0);
    played.bestLevel = Math.max(played.bestLevel, round.level ?? 0);

    // A round counts in full towards each skill it trains. Splitting the time
    // between them would understate a game that works three things at once.
    for (const skill of byId.get(round.game)?.skills ?? []) {
      skillMs.set(skill, (skillMs.get(skill) ?? 0) + round.ms);
    }
  }

  const recent = [...dayMap.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, days);

  return {
    totals,
    days: recent,
    games: [...gameMap.values()].sort((a, b) => b.ms - a.ms),
    skills: [...skillMs.entries()]
      .map(([id, ms]) => ({ id, ms }))
      .sort((a, b) => b.ms - a.ms),
    streak: streakLength(dayMap, now),
  };
}

/**
 * Days played in a row, counting back from today. Yesterday still counts as a
 * live streak, so a day is not lost until it has fully passed.
 */
export function streakLength(dayMap, now = Date.now()) {
  const played = dayMap instanceof Map ? new Set(dayMap.keys()) : new Set(dayMap);
  if (!played.size) return 0;

  const cursor = new Date(now);
  if (!played.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!played.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (played.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** "12 min", "1 h 04", "40 s" — short enough for a stat tile. */
export function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} s`;
  const mins = Math.round(total / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}`;
}

/** "Today", "Yesterday", then "Tue 3 Sep". */
export function formatDay(day, now = Date.now()) {
  if (day === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === dayKey(yesterday)) return "Yesterday";

  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
