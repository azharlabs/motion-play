/**
 * The arcade catalogue.
 *
 * Every playable entry lazily imports a module exposing `createGame(opts)`,
 * which returns an object with this shape:
 *
 *   start(now)                     begin a round
 *   tick(dt, signals, now, view)   advance; returns { over }
 *   draw(ctx, view, signals, now)  paint into a `view` of { w, h } CSS pixels
 *
 * Both tick and draw get the same `view`, because a game that hit-tests in one
 * box and paints in another is generous in one direction and mean in the other.
 * `createGame({ fx })` receives the feedback object games cue sounds through.
 *   hud()                          { score, lives, time } for the shared bar
 *   summary()                      end-of-round stats
 *
 * `needs` decides how much of you has to be in shot, `backdrop` decides whether
 * the round is played over the camera image or over a drawn scene, and
 * `orientation` is "landscape" only for games that cannot be read in portrait.
 *
 * `skills` are the motor skills the game trains, which is how players browse
 * the arcade. `actions` are the movements it counts into the activity log.
 * Both draw from the vocabularies in ../skills.js, and a game listing anything
 * outside them fails its tests.
 *
 * `reachFor` names what the how-to demonstration puts at the end of a reach.
 * Two games ask for the same movement and are nothing alike to look at, and a
 * keeper shown popping a balloon has been told about the wrong game.
 */
export const GAMES = [
  {
    id: "jump-the-wall",
    skills: ["lower-body", "agility", "reaction"],
    actions: ["jump", "duck"],
    title: "Jump the Wall",
    tagline: "Jump the walls, duck the branches",
    needs: "full",
    backdrop: "scene",
    // A side-scroller needs room ahead of the player to be readable at all.
    orientation: "landscape",
    accent: "#f97316",
    howTo: ["Jump to clear a stone wall", "Crouch to duck under a branch"],
    ready: true,
    load: () => import("./jump-the-wall.js"),
  },
  {
    id: "balloon-pop",
    skills: ["reach", "coordination", "upper-body"],
    actions: ["reach"],
    title: "Balloon Pop",
    tagline: "Swat them before they escape",
    needs: "upper",
    backdrop: "camera",
    accent: "#ec4899",
    howTo: ["Reach out and touch a balloon to pop it", "Do not let one reach the top"],
    ready: true,
    load: () => import("./balloon-pop.js"),
  },
  {
    id: "lane-runner",
    skills: ["balance", "core", "reaction"],
    actions: ["lean"],
    title: "Lane Runner",
    tagline: "Lean to switch lanes",
    needs: "full",
    backdrop: "scene",
    accent: "#0ea5e9",
    howTo: ["Lean left or right to change lane", "Grab coins, dodge the barrels"],
    ready: true,
    load: () => import("./lane-runner.js"),
  },
  {
    id: "fruit-slice",
    skills: ["coordination", "upper-body", "reaction"],
    actions: ["swipe"],
    title: "Fruit Slice",
    tagline: "Swipe through the fruit",
    needs: "upper",
    backdrop: "camera",
    accent: "#22c55e",
    howTo: ["Swing a hand through the fruit", "Do not hit the bombs"],
    ready: true,
    load: () => import("./fruit-slice.js"),
  },
  {
    id: "goalkeeper",
    skills: ["reach", "reaction", "coordination"],
    actions: ["reach"],
    title: "Goalkeeper",
    tagline: "Dive and keep it out",
    needs: "upper",
    backdrop: "camera",
    accent: "#6366f1",
    reachFor: "ball",
    howTo: ["Reach to the ball with either hand", "Block as many as you can"],
    ready: true,
    load: () => import("./goalkeeper.js"),
  },
  {
    id: "punch-out",
    skills: ["upper-body", "reaction", "coordination"],
    actions: ["punch"],
    title: "Punch Out",
    tagline: "Hit the pads as they light up",
    needs: "upper",
    backdrop: "camera",
    accent: "#ef4444",
    howTo: ["Punch the pad that lights up", "Left pad, left hand"],
    ready: true,
    load: () => import("./punch-out.js"),
  },
  {
    id: "sky-flap",
    skills: ["upper-body", "coordination"],
    actions: ["raise"],
    title: "Sky Flap",
    tagline: "Rise and fall through the gaps",
    needs: "upper",
    backdrop: "scene",
    accent: "#14b8a6",
    howTo: ["Raise your hands to climb", "Lower them to drop"],
    ready: true,
    load: () => import("./sky-flap.js"),
  },
  {
    id: "ski-slalom",
    skills: ["balance", "core", "agility"],
    actions: ["lean"],
    title: "Ski Slalom",
    tagline: "Carve through every gate",
    needs: "full",
    backdrop: "scene",
    accent: "#38bdf8",
    howTo: ["Lean to steer down the hill", "Pass inside the flags"],
    ready: true,
    load: () => import("./ski-slalom.js"),
  },
  {
    id: "squat-rush",
    skills: ["lower-body", "core"],
    actions: ["squat"],
    title: "Squat Rush",
    tagline: "How many can you bank?",
    needs: "full",
    backdrop: "scene",
    accent: "#a855f7",
    howTo: ["Squat low, then stand tall", "Every clean rep scores"],
    ready: true,
    load: () => import("./squat-rush.js"),
  },
  {
    id: "pose-match",
    skills: ["posture", "balance", "core"],
    actions: ["hold"],
    title: "Pose Match",
    tagline: "Fill the shape before time runs out",
    needs: "full",
    backdrop: "camera",
    accent: "#eab308",
    howTo: ["Copy the silhouette shown", "Hold it until it locks in"],
    ready: true,
    load: () => import("./pose-match.js"),
  },
  {
    id: "hand-snake",
    skills: ["coordination", "reach", "upper-body"],
    actions: ["reach"],
    title: "Hand Snake",
    tagline: "Lead it to the apples, dodge its tail",
    needs: "upper",
    backdrop: "camera",
    accent: "#22c55e",
    howTo: [
      "Hold a hand up and move it — the snake follows",
      "Lead it onto the apples to grow",
      "Never let it cross its own tail",
    ],
    ready: true,
    load: () => import("./hand-snake.js"),
  },
  {
    id: "hand-tetris",
    skills: ["coordination", "reach", "upper-body"],
    actions: ["reach", "raise"],
    title: "Hand Tetris",
    tagline: "Slide the blocks, raise a hand to turn",
    needs: "upper",
    backdrop: "camera",
    accent: "#60a5fa",
    howTo: [
      "Sweep a hand across to slide the block",
      "Lift a hand above your shoulder to turn it",
      "Fill a whole row to clear it",
    ],
    ready: true,
    load: () => import("./hand-tetris.js"),
  },
  {
    id: "freeze-frame",
    skills: ["posture", "reaction", "core"],
    actions: ["hold"],
    title: "Freeze Frame",
    tagline: "Move on green, be a statue on red",
    needs: "full",
    backdrop: "camera",
    accent: "#ef4444",
    howTo: [
      "March and wave while the light is green",
      "The moment it turns red, freeze",
      "The smallest twitch gets you caught",
    ],
    ready: true,
    load: () => import("./freeze-frame.js"),
  },
  {
    id: "body-drums",
    skills: ["coordination", "lower-body", "reaction"],
    actions: ["punch", "kick"],
    title: "Body Drums",
    tagline: "Four pads, hit them on the beat",
    needs: "full",
    backdrop: "camera",
    accent: "#fbbf24",
    howTo: [
      "Punch the two high pads with your hands",
      "Drive a knee up into the two low ones",
      "Strike as the closing ring meets the pad",
    ],
    ready: true,
    load: () => import("./body-drums.js"),
  },
  {
    id: "orbit-keeper",
    skills: ["coordination", "reaction", "balance"],
    actions: ["reach", "kick"],
    title: "Orbit Keeper",
    tagline: "Keep them up, then land them in the bucket",
    needs: "full",
    backdrop: "camera",
    accent: "#38bdf8",
    howTo: [
      "The balls bounce off your real arms and legs",
      "Swing to send one further, hold still to tap it up",
      "Drop one into the sliding bucket to score",
    ],
    ready: true,
    load: () => import("./orbit-keeper.js"),
  },
];

export const gameById = (id) => GAMES.find((g) => g.id === id) ?? null;
