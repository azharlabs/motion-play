/**
 * Maps skill-grid card ids to sticky MotionPlay embeds + control profiles.
 * Titles/productIds stay aligned with registry.js — this only chooses the play shell.
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
};

export function catalogEntry(cardId) {
  return EMBED_CATALOG[cardId] ?? null;
}

export function embedUrl(cardId) {
  const entry = catalogEntry(cardId);
  // Vercel trailingSlash=false may strip the directory slash; embeds use
  // root-absolute /external-games/... asset URLs so scripts still load.
  if (!entry) return "./external-games/lane-runner/";
  const params = new URLSearchParams(entry.params || {});
  const q = params.toString();
  return `./external-games/${entry.slug}/${q ? `?${q}` : ""}`;
}

export const CATALOG_CARD_IDS = Object.keys(EMBED_CATALOG);
