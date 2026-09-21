import { CANVAS_ENGINE_IDS } from "../games/registry.js";

/**
 * Maps skill-grid card ids to sticky MotionPlay embeds + control profiles.
 * Titles/productIds stay aligned with registry.js — this only chooses the play shell.
 *
 * `root: "vendor-arcade"` points at classic vendored HTML5 games under
 * stage0/vendor-arcade/. Default root is external-games (motion sticky embeds).
 *
 * The controller grid lists every catalog entry, plus the original canvas
 * engines (`CANVAS_ENGINE_IDS`) as separate Classic cards.
 */
export const EMBED_CATALOG = {
  "jump-the-wall": {
    title: "Motion Runner",
    slug: "jump-runner",
    profile: "runner",
    needs: "full",
    hint: "Jump · duck · lean",
    params: { title: "Motion Runner", accent: "#f97316" },
  },
  "lane-runner": {
    title: "Ninja Dodge",
    slug: "lane-runner",
    profile: "runner",
    needs: "full",
    hint: "Lean to dodge · jump · duck",
    params: { title: "Ninja Dodge", accent: "#0ea5e9" },
  },
  "ski-slalom": {
    title: "Kart Racer",
    slug: "kart-racer",
    profile: "racer",
    needs: "full",
    hint: "Lean to steer",
    params: { title: "Kart Racer", accent: "#38bdf8", skin: "kart" },
  },
  "fruit-slice": {
    title: "Fruit Slice",
    slug: "fruit-swipe",
    profile: "swipe",
    needs: "upper",
    hint: "Swipe / reach through fruit",
    params: { title: "Fruit Slice", accent: "#22c55e", skin: "fruit" },
  },
  "balloon-pop": {
    title: "Balloon Pop Adventure",
    slug: "reach-pop",
    profile: "reach",
    needs: "upper",
    hint: "Reach to pop balloons",
    params: { title: "Balloon Pop Adventure", accent: "#ec4899", skin: "balloons" },
  },
  goalkeeper: {
    title: "Goalkeeper Hero",
    slug: "reach-pop",
    profile: "reach",
    needs: "upper",
    hint: "Reach to save shots",
    params: { title: "Goalkeeper Hero", accent: "#6366f1", skin: "goal" },
  },
  "punch-out": {
    title: "Boxing Challenge",
    slug: "punch-pad",
    profile: "punch",
    needs: "upper",
    hint: "Punch the lit pad",
    params: { title: "Boxing Challenge", accent: "#ef4444", skin: "box" },
  },
  "squat-rush": {
    title: "Jump Island",
    slug: "squat-island",
    profile: "squat",
    needs: "full",
    hint: "Squat · jump · lean",
    params: { title: "Jump Island", accent: "#a855f7", skin: "squat" },
  },
  "pose-match": {
    title: "Dance Copycat",
    slug: "hold-pose",
    profile: "hold",
    needs: "full",
    hint: "Copy and hold the pose",
    params: { title: "Dance Copycat", accent: "#eab308", skin: "dance" },
  },
  "freeze-frame": {
    title: "Simon Says Motion",
    slug: "hold-pose",
    profile: "hold",
    needs: "full",
    hint: "Move on green · freeze on red",
    params: { title: "Simon Says Motion", accent: "#ef4444", skin: "simon" },
  },
  "sky-flap": {
    title: "Space Defender",
    slug: "raise-flap",
    profile: "raise",
    needs: "upper",
    hint: "Raise / lower arms to fly",
    params: { title: "Space Defender", accent: "#14b8a6" },
  },
  "orbit-keeper": {
    title: "Treasure Catch",
    slug: "reach-pop",
    profile: "reach",
    needs: "full",
    hint: "Reach / kick for treasure",
    params: { title: "Treasure Catch", accent: "#38bdf8", skin: "treasure" },
  },
  "body-drums": {
    title: "Animal Adventure",
    slug: "punch-pad",
    profile: "punch",
    needs: "full",
    hint: "Punch & knee-drive on cue",
    params: { title: "Animal Adventure", accent: "#fbbf24", skin: "drums" },
  },
  "hand-snake": {
    title: "Balance Bridge",
    slug: "squat-island",
    profile: "platformer",
    needs: "full",
    hint: "Lean to balance · jump gaps",
    params: { title: "Balance Bridge", accent: "#0f9b8e", skin: "balance" },
  },
  "hand-tetris": {
    title: "Adventure Climber",
    slug: "reach-pop",
    profile: "reach",
    needs: "upper",
    hint: "Reach and raise to climb",
    params: { title: "Adventure Climber", accent: "#60a5fa", skin: "climb" },
  },

  /* ---- Vendored classic arcade (HTML5) ---- */
  "arcade-snake": {
    title: "Snake",
    slug: "snake",
    root: "vendor-arcade",
    profile: "runner",
    needs: "upper",
    hint: "Lean to steer · arrow keys",
    params: { title: "Snake", accent: "#4ade80" },
  },
  "arcade-breakout": {
    title: "Breakout",
    slug: "breakout",
    root: "vendor-arcade",
    profile: "arcade",
    needs: "upper",
    hint: "Lean to move paddle",
    params: { title: "Breakout", accent: "#f472b6" },
  },
  "arcade-flappy": {
    title: "Flappy Bird",
    slug: "flappy-bird",
    root: "vendor-arcade",
    profile: "platformer",
    needs: "upper",
    hint: "Jump / Space to flap",
    params: { title: "Flappy Bird", accent: "#facc15" },
  },
  "arcade-whack": {
    title: "Whack-a-Mole",
    slug: "whack-a-mole",
    root: "vendor-arcade",
    profile: "punch",
    needs: "upper",
    hint: "Tap moles · punch pads optional",
    params: { title: "Whack-a-Mole", accent: "#fb923c" },
  },
  "arcade-tetris": {
    title: "Tetris",
    slug: "tetris",
    root: "vendor-arcade",
    profile: "platformer",
    needs: "upper",
    hint: "Lean to shift · jump to rotate",
    params: { title: "Tetris", accent: "#a78bfa" },
  },
  "arcade-invaders": {
    title: "Space Invaders",
    slug: "invaders",
    root: "vendor-arcade",
    profile: "arcade",
    needs: "upper",
    hint: "Lean to move · jump to fire",
    params: { title: "Space Invaders", accent: "#34d399" },
  },
  "arcade-asteroids": {
    title: "Asteroids",
    slug: "asteroids",
    root: "vendor-arcade",
    profile: "arcade",
    needs: "upper",
    hint: "Lean to turn · jump to thrust/fire",
    params: { title: "Asteroids", accent: "#94a3b8" },
  },
  "arcade-2048": {
    title: "2048",
    slug: "game-2048",
    root: "vendor-arcade",
    profile: "runner",
    needs: "upper",
    hint: "Lean to swipe tiles",
    params: { title: "2048", accent: "#fbbf24" },
  },
  "arcade-racer": {
    title: "Highway Racer",
    slug: "racer",
    root: "vendor-arcade",
    profile: "racer",
    needs: "full",
    hint: "Lean to steer · hold gas in frame",
    params: { title: "Highway Racer", accent: "#38bdf8" },
  },
  "arcade-pac": {
    title: "Pac-Chase",
    slug: "pac-chase",
    root: "vendor-arcade",
    profile: "runner",
    needs: "upper",
    hint: "Lean through the maze",
    params: { title: "Pac-Chase", accent: "#fde047" },
  },
  "arcade-frogger": {
    title: "Road Hopper",
    slug: "road-hopper",
    root: "vendor-arcade",
    profile: "platformer",
    needs: "full",
    hint: "Jump · lean across traffic",
    params: { title: "Road Hopper", accent: "#4ade80" },
  },
  "arcade-space": {
    title: "Galaxy Invaders",
    slug: "space-defenders",
    root: "vendor-arcade",
    profile: "arcade",
    needs: "upper",
    hint: "Lean · jump to shoot",
    params: { title: "Galaxy Invaders", accent: "#2dd4bf" },
  },
  "arcade-blaster": {
    title: "Asteroid Blaster",
    slug: "asteroid-blaster",
    root: "vendor-arcade",
    profile: "arcade",
    needs: "upper",
    hint: "Lean · jump to blast rocks",
    params: { title: "Asteroid Blaster", accent: "#c084fc" },
  },
  "arcade-underrun": {
    title: "Underrun",
    slug: "underrun",
    root: "vendor-arcade",
    profile: "platformer",
    needs: "full",
    hint: "Classic run-and-gun · keys",
    params: { title: "Underrun", accent: "#f97316" },
  },
};

export function catalogEntry(cardId) {
  return EMBED_CATALOG[cardId] ?? null;
}

export function embedUrl(cardId) {
  const entry = catalogEntry(cardId);
  // Vercel trailingSlash=false may strip the directory slash; embeds use
  // root-absolute /external-games/... or /vendor-arcade/... asset URLs.
  if (!entry) return "./external-games/lane-runner/";
  const params = new URLSearchParams(entry.params || {});
  const q = params.toString();
  const root = entry.root === "vendor-arcade" ? "vendor-arcade" : "external-games";
  return `./${root}/${entry.slug}/${q ? `?${q}` : ""}`;
}

/**
 * Motion sticky embeds on the controller grid.
 * Delight keep-8 stay first; the remaining catalog motion titles follow.
 */
export const MOTION_LIBRARY_IDS = [
  "jump-the-wall", // Motion Runner
  "lane-runner", // Ninja Dodge
  "ski-slalom", // Kart Racer
  "fruit-slice", // Fruit Slice
  "balloon-pop", // Balloon Pop Adventure
  "punch-out", // Boxing Challenge
  "freeze-frame", // Simon Says Motion
  "goalkeeper", // Goalkeeper Hero
  "squat-rush", // Jump Island
  "pose-match", // Dance Copycat
  "sky-flap", // Space Defender
  "orbit-keeper", // Treasure Catch
  "body-drums", // Animal Adventure
  "hand-snake", // Balance Bridge
  "hand-tetris", // Adventure Climber
];

/** Every vendored HTML5 arcade title, including Asteroid Blaster and Underrun. */
export const ARCADE_LIBRARY_IDS = [
  "arcade-snake",
  "arcade-breakout",
  "arcade-flappy",
  "arcade-whack",
  "arcade-tetris",
  "arcade-invaders",
  "arcade-asteroids",
  "arcade-2048",
  "arcade-racer",
  "arcade-pac",
  "arcade-frogger",
  "arcade-space",
  "arcade-blaster",
  "arcade-underrun",
];

/** Embed catalog entries shown on the controller grid (motion + arcade). */
export const LIBRARY_CARD_IDS = [...MOTION_LIBRARY_IDS, ...ARCADE_LIBRARY_IDS];

/**
 * Original canvas engines, with ids that do not collide with embed cards.
 * Titles keep the product name plus "(Classic)" so they sit beside the embeds.
 */
export const LEGACY_LIBRARY_CARDS = CANVAS_ENGINE_IDS.map((engineId) => {
  const embed = EMBED_CATALOG[engineId];
  return {
    id: `canvas-${engineId}`,
    engineId,
    title: `${embed.title} (Classic)`,
    hint: `Original canvas · ${embed.hint}`,
    needs: embed.needs,
    accent: embed.params?.accent || "#0f9b8e",
  };
});

export function legacyCard(cardId) {
  return LEGACY_LIBRARY_CARDS.find((card) => card.id === cardId) ?? null;
}

/** Open the Stage 0 canvas engine. Camera starts on that page's Play tap. */
export function legacyPlayUrl(engineId) {
  const params = new URLSearchParams({
    legacy: "1",
    game: engineId,
    from: "controller",
  });
  return `./index.html?${params.toString()}`;
}

export function isLibraryCard(cardId) {
  return LIBRARY_CARD_IDS.includes(cardId) || Boolean(legacyCard(cardId));
}

export const CATALOG_CARD_IDS = Object.keys(EMBED_CATALOG);

/** Unified card descriptor for the controller grid and preview. */
export function libraryPresentation(cardId) {
  const embed = catalogEntry(cardId);
  if (embed) {
    return {
      kind: "embed",
      id: cardId,
      title: embed.title,
      hint: embed.hint || "",
      needs: embed.needs,
      accent: embed.params?.accent || "#0f9b8e",
      engineId: cardId,
    };
  }
  const canvas = legacyCard(cardId);
  if (!canvas) return null;
  return { kind: "canvas", ...canvas };
}

export const LIBRARY_SECTIONS = [
  {
    id: "motion",
    title: "Motion games",
    blurb: "Sticky motion embeds. Some titles share a shell with a different skin.",
    ids: MOTION_LIBRARY_IDS,
  },
  {
    id: "arcade",
    title: "Classic arcade",
    blurb: "Vendored HTML5 games. Lean, jump, and keys drive the same bridge.",
    ids: ARCADE_LIBRARY_IDS,
  },
  {
    id: "canvas",
    title: "Classic canvas",
    blurb: "Original Stage 0 engines. Preview here, then Play opens the canvas game.",
    ids: LEGACY_LIBRARY_CARDS.map((card) => card.id),
  },
];
