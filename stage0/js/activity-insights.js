import { GAMES } from "./games/registry.js";
import { ACTIONS } from "./skills.js";
import { BENEFITS, benefitById, benefitTime } from "./wellness.js";
import { dayKey } from "./stats.js";

const addCounts = (target, source) => {
  for (const [id, count] of Object.entries(source ?? {})) {
    if (count > 0) target[id] = (target[id] ?? 0) + count;
  }
  return target;
};

/**
 * A dashboard-ready view of what happened today.
 *
 * It deliberately reports observable activity only: time played, movements
 * detected, games played, and the movement focuses attached to those games.
 */
export function todayInsights(history, { now = Date.now(), catalogue = GAMES } = {}) {
  const today = dayKey(now);
  const gamesById = new Map(catalogue.map((game) => [game.id, game]));
  const rounds = (history ?? []).filter((round) => (round.day ?? dayKey(round.at)) === today);

  const actions = {};
  const gameCounts = new Map();
  let ms = 0;

  for (const round of rounds) {
    ms += Math.max(0, round.ms ?? 0);
    addCounts(actions, round.actions);
    gameCounts.set(round.game, (gameCounts.get(round.game) ?? 0) + 1);
  }

  const movements = ACTIONS.filter((action) => (actions[action.id] ?? 0) > 0).map((action) => ({
    ...action,
    count: actions[action.id],
  }));

  const games = [...gameCounts.entries()].map(([id, count]) => ({
    id,
    count,
    title: gamesById.get(id)?.title ?? id,
  }));

  const benefits = benefitTime(rounds, catalogue);

  return {
    day: today,
    rounds: rounds.length,
    ms,
    actions,
    movements,
    games,
    benefits,
    totalMovements: Object.values(actions).reduce((sum, count) => sum + count, 0),
  };
}

/** All known movement-focus cards, with zero-time entries included for UI grids. */
export function benefitDashboard(history, { catalogue = GAMES } = {}) {
  const totals = new Map(benefitTime(history, catalogue).map((entry) => [entry.id, entry.ms]));
  return BENEFITS.map((benefit) => ({ ...benefit, ms: totals.get(benefit.id) ?? 0 }));
}

/** Human-friendly summary for a completed round or today's dashboard. */
export function movementFocusSentence(benefitIds) {
  const labels = [...new Set(benefitIds ?? [])]
    .map(benefitById)
    .filter(Boolean)
    .map((benefit) => benefit.label.toLowerCase());

  if (!labels.length) return "Keep moving and have fun.";
  if (labels.length === 1) return `Movement focus: ${labels[0]}.`;
  if (labels.length === 2) return `Movement focus: ${labels[0]} and ${labels[1]}.`;
  return `Movement focus: ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}.`;
}
