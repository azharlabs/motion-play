/**
 * Safe, non-medical language for describing what a MotionPlay round asks a
 * child to practise. These are movement focuses, not promises that playing a
 * game will treat, prevent or improve a health condition.
 */
export const BENEFITS = [
  {
    id: "active-play",
    label: "Active play",
    icon: "🏃",
    description: "Keeps the body moving instead of playing only with taps or buttons.",
  },
  {
    id: "coordination",
    label: "Coordination",
    icon: "🎯",
    description: "Practises matching what the eyes see with a planned body movement.",
  },
  {
    id: "upper-body",
    label: "Upper-body movement",
    icon: "🙌",
    description: "Encourages repeated movement of the arms and shoulders.",
  },
  {
    id: "lower-body",
    label: "Lower-body movement",
    icon: "🦵",
    description: "Encourages movement through the hips, knees and legs.",
  },
  {
    id: "balance",
    label: "Balance",
    icon: "⚖️",
    description: "Practises controlled weight shifting while staying stable.",
  },
  {
    id: "reaction",
    label: "Reaction",
    icon: "⚡",
    description: "Practises responding quickly to a visual game cue.",
  },
  {
    id: "postural-control",
    label: "Postural control",
    icon: "🧍",
    description: "Practises keeping the body controlled while changing or holding position.",
  },
  {
    id: "cross-body",
    label: "Cross-body movement",
    icon: "↗️",
    description: "Encourages movements that travel across the body's midline.",
  },
  {
    id: "mobility",
    label: "Reach and mobility",
    icon: "🙆",
    description: "Encourages comfortable reaching in different directions and heights.",
  },
  {
    id: "motor-planning",
    label: "Motor planning",
    icon: "🧠",
    description: "Practises choosing and sequencing a movement to match the next challenge.",
  },
];

export const BENEFIT_IDS = BENEFITS.map((benefit) => benefit.id);

export const benefitById = (id) => BENEFITS.find((benefit) => benefit.id === id) ?? null;

export function benefitsForGame(game) {
  return (game?.benefits ?? []).map(benefitById).filter(Boolean);
}

/**
 * Aggregate benefit exposure from played rounds. A round's full active time is
 * credited to each focus named by its game, matching how motor-skill time is
 * already reported elsewhere in MotionPlay.
 */
export function benefitTime(history, catalogue) {
  const games = new Map((catalogue ?? []).map((game) => [game.id, game]));
  const totals = new Map();

  for (const round of history ?? []) {
    const game = games.get(round.game);
    if (!game) continue;
    for (const id of game.benefits ?? []) {
      if (!BENEFIT_IDS.includes(id)) continue;
      totals.set(id, (totals.get(id) ?? 0) + Math.max(0, round.ms ?? 0));
    }
  }

  return [...totals.entries()]
    .map(([id, ms]) => ({ id, ms, benefit: benefitById(id) }))
    .sort((a, b) => b.ms - a.ms || a.id.localeCompare(b.id));
}
