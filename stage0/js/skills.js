/**
 * What the games ask of your body.
 *
 * Two vocabularies live here, and they answer different questions:
 *
 *   SKILLS   the motor skill a game trains — how you browse the arcade
 *   ACTIONS  a single physical movement — what gets counted while you play
 *
 * Keeping both in one file means the home screen, the games and the activity
 * log cannot drift apart: a game claiming a skill nobody browses by, or
 * counting a movement the log has no name for, is a test failure rather than a
 * quiet gap in the numbers.
 */

/**
 * Motor skills, ordered roughly head to toe so the shelf reads sensibly.
 * `blurb` is written for a player deciding what to do, not a physiotherapist.
 * `tint` is the card colour, so each skill is recognisable at a glance the way
 * the game cards are by their artwork.
 */
export const SKILLS = [
  {
    id: "coordination",
    label: "Hand-eye",
    icon: "🎯",
    tint: "#f97316",
    blurb: "Track a moving target and meet it with your hand",
  },
  {
    id: "reach",
    label: "Reach",
    icon: "🙆",
    tint: "#e11d48",
    blurb: "Extend to the edge of your range and come back",
  },
  {
    id: "upper-body",
    label: "Upper body",
    icon: "💪",
    tint: "#7c3aed",
    blurb: "Arms and shoulders working against the clock",
  },
  {
    id: "core",
    label: "Core",
    icon: "🧍",
    tint: "#0891b2",
    blurb: "Hold your middle steady while you move",
  },
  {
    id: "balance",
    label: "Balance",
    icon: "⚖️",
    tint: "#0f9b8e",
    blurb: "Shift your weight and stay in control of it",
  },
  {
    id: "lower-body",
    label: "Lower body",
    icon: "🦵",
    tint: "#2563eb",
    blurb: "Legs and hips doing the work",
  },
  {
    id: "agility",
    label: "Agility",
    icon: "⚡",
    tint: "#ca8a04",
    blurb: "Change what your body is doing, quickly",
  },
  {
    id: "reaction",
    label: "Reaction",
    icon: "⏱️",
    tint: "#db2777",
    blurb: "Move the moment something appears",
  },
  {
    id: "posture",
    label: "Posture",
    icon: "🧘",
    tint: "#65a30d",
    blurb: "Find a shape and hold it still",
  },
];

export const skillById = (id) => SKILLS.find((s) => s.id === id) ?? null;

/**
 * Countable movements. One entry per thing a body actually does, with the
 * wording the activity log uses.
 *
 * `unit` is the plural noun shown after a number; `verb` heads a column.
 * `cue` is how to actually do the movement, told to the player before a round
 * and captioning the animation that demonstrates it. It describes the body,
 * not the game: what to move and how far, so the same words hold whether you
 * are punching a pad or slicing a melon.
 */
export const ACTIONS = [
  {
    id: "jump",
    verb: "Jumps",
    unit: "jumps",
    icon: "🦘",
    cue: "Jump up off both feet, and land soft",
  },
  { id: "duck", verb: "Ducks", unit: "ducks", icon: "🙇", cue: "Drop into a crouch, head low" },
  {
    id: "squat",
    verb: "Squats",
    unit: "squats",
    icon: "🏋️",
    cue: "Sit down into a squat, then stand up tall",
  },
  {
    id: "punch",
    verb: "Punches",
    unit: "punches",
    icon: "🥊",
    cue: "Punch straight out towards the camera, then pull the hand back",
  },
  {
    id: "reach",
    verb: "Reaches",
    unit: "reaches",
    icon: "🙌",
    cue: "Stretch an arm right out until your elbow is straight",
  },
  {
    id: "swipe",
    verb: "Swipes",
    unit: "swipes",
    icon: "✋",
    cue: "Swing a whole arm across you, quickly",
  },
  {
    id: "lean",
    verb: "Lean switches",
    unit: "leans",
    icon: "↔️",
    cue: "Lean your shoulders left or right, feet planted",
  },
  {
    id: "raise",
    verb: "Arm raises",
    unit: "raises",
    icon: "🙆",
    cue: "Lift both arms above your head, then lower them",
  },
  {
    id: "hold",
    verb: "Poses held",
    unit: "holds",
    icon: "🧘",
    cue: "Take the shape and hold it still",
  },
  {
    id: "kick",
    verb: "Knee drives",
    unit: "knee drives",
    icon: "🦵",
    cue: "Drive one knee up high, then the other",
  },
];

export const actionById = (id) => ACTIONS.find((a) => a.id === id) ?? null;

/** Every action id, for validating what the games report. */
export const ACTION_IDS = ACTIONS.map((a) => a.id);
