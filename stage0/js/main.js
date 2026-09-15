import { startCamera } from "./camera.js";
import { createPoseTracker } from "./pose.js";
import { MotionSignals, leadHands } from "./signals.js";
import { coverBox, poseMapping } from "./framing.js";
import { drawOverlay } from "./overlay.js";
import { FpsMeter } from "./fps.js";
import { drawMascotBadge } from "./mascot.js";
import { GAMES, gameById } from "./games/registry.js";
import { drawCardArt } from "./games/art.js";
import { drawSkillArt } from "./skill-art.js";
import { drawLevelBanner } from "./games/common.js";
import { createCelebration } from "./celebration.js";
import { createFeedback } from "./feedback.js";
import { PerfGovernor } from "./perf.js";
import { SKILLS, ACTIONS, skillById, actionById } from "./skills.js";
import { drawHowTo, currentClip, clipsFor, clipCue } from "./demo.js";
import { registerWorker, offerInstall, isInstalled } from "./pwa.js";
import { setupFeedback } from "./feedback-form.js";
import {
  HISTORY_KEY,
  addRound,
  formatDay,
  formatDuration,
  parseHistory,
  roundEntry,
  summarise,
} from "./stats.js";

const COUNTDOWN_MS = 2600;
const el = (id) => document.getElementById(id);

const els = {
  screens: {
    home: el("screen-home"),
    howto: el("screen-howto"),
    load: el("screen-load"),
    calibrate: el("screen-calibrate"),
    play: el("screen-play"),
    rest: el("screen-rest"),
    skill: el("screen-skill"),
    activity: el("screen-activity"),
    feedback: el("screen-feedback"),
  },
  btnFeedback: el("btn-feedback"),
  btnRestFeedback: el("btn-rest-feedback"),
  feedback: {
    back: el("btn-feedback-back"),
    rating: el("fb-rating"),
    game: el("fb-game"),
    notes: el("fb-notes"),
    diagnostics: el("fb-diagnostics"),
    tech: document.querySelector(".fb-tech"),
    send: el("btn-fb-send"),
    copy: el("btn-fb-copy"),
    status: el("fb-status"),
  },
  skillGrid: el("skill-grid"),
  skillTitle: el("skill-title"),
  skillBlurb: el("skill-blurb"),
  skillGames: el("skill-games"),
  skillEmpty: el("skill-empty"),
  btnSkillBack: el("btn-skill-back"),
  btnActivity: el("btn-activity"),
  btnActivityBack: el("btn-activity-back"),
  activityBody: el("activity-body"),
  activitySub: el("activity-sub"),
  logo: el("logo-mascot"),
  loadText: el("load-text"),
  howtoTitle: el("howto-title"),
  howtoTagline: el("howto-tagline"),
  howtoCanvas: el("howto-canvas"),
  howtoBadge: el("howto-badge"),
  howtoFraming: el("howto-framing"),
  howtoSteps: el("howto-steps"),
  howtoRules: el("howto-rules"),
  howtoSkills: el("howto-skills"),
  howtoLoading: el("howto-loading"),
  howtoLoadText: el("howto-load-text"),
  btnHowtoPlay: el("btn-howto-play"),
  btnHowtoBack: el("btn-howto-back"),
  calibTitle: el("calib-title"),
  calibHint: el("calib-hint"),
  calibFill: el("calib-fill"),
  calibTips: el("calib-tips"),
  calibSlot: el("calib-camera-slot"),
  playSlot: el("play-camera-slot"),
  cameraDock: el("camera-dock"),
  video: el("video"),
  overlay: el("overlay"),
  stage: el("stage"),
  game: el("game"),
  hudScore: el("hud-score"),
  hudTime: el("hud-time"),
  hudCombo: el("hud-combo"),
  hudLevel: el("hud-level"),
  hudLives: el("hud-lives"),
  btnSkeleton: el("btn-skeleton"),
  btnSound: el("btn-sound"),
  banner: el("banner"),
  bannerTitle: el("banner-title"),
  bannerSub: el("banner-sub"),
  stageNote: el("stage-note"),
  perfReadout: el("perf-readout"),
  rotateHint: el("rotate-hint"),
  restGame: el("rest-game"),
  restTitle: el("rest-title"),
  restScore: el("rest-score"),
  restCombo: el("rest-combo"),
  restCleared: el("rest-cleared"),
  restLevel: el("rest-level"),
  restActions: el("rest-actions"),
  restNote: el("rest-note"),
};

const poseFps = new FpsMeter();

const MUTE_KEY = "motionplay.muted";
const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false; // private browsing, or storage turned off
  }
};
const fx = createFeedback({ muted: readMuted() });
const celebration = createCelebration({ parent: els.stage, fx });

/*
 * Personal bests, one entry per game. Kept in local storage so a level you
 * reached is still yours tomorrow; everything degrades to "no best yet" if
 * storage is unavailable rather than breaking the home screen.
 */
const BEST_KEY = "motionplay.bests";

function readBests() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

let bests = readBests();

/*
 * The activity log. Same storage story as the bests: nice to have, never
 * load-bearing, so a browser refusing local storage costs you the history and
 * nothing else.
 */
function readHistory() {
  try {
    return parseHistory(localStorage.getItem(HISTORY_KEY));
  } catch {
    return [];
  }
}

let history = readHistory();

function logRound(entry) {
  history = addRound(history, entry);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* the round still counted for this session */
  }
}

/** Save a finished round if it beat what was there. Returns true if it did. */
function recordBest(id, { score, level }) {
  const prev = bests[id] ?? { score: 0, level: 0 };
  if (level <= prev.level && score <= prev.score) return false;
  bests[id] = { score: Math.max(score, prev.score), level: Math.max(level, prev.level) };
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(bests));
  } catch {
    /* the best just will not survive a reload */
  }
  return true;
}

let phase = "home";
let tracker = null;
let poseReady = false;
let poseMeta = { delegate: "—", model: "—", mode: "—" };
let signals = null;
let entry = null;
let game = null;
// The how-to screen waits for the camera; these track that wait, and which
// selection it belongs to, so an abandoned one cannot start a round later.
const LEGACY_ARCADE = (() => {
  try {
    const params = new URLSearchParams(location.search);
    return params.get("legacy") === "1" || params.get("mode") === "legacy";
  } catch {
    return false;
  }
})();

let readyToPlay = false;
let selectToken = 0;
let shownStep = -1;
let lastTs = 0;
let lastLandmarks = null;
let lastSignal = { inFrame: false, hands: { left: {}, right: {} } };
let lastSignalAt = 0;
let countdownEnd = 0;
let spokenCount = -1;
let roundBegun = false;
let roundBanked = false;
let playLevel = 1;
let roundStartedAt = 0;
let fpsSamples = [];
let debugOn = false;
/**
 * The drawing surface, always derived from the canvas itself rather than
 * remembered. If it were stored, a resize between one frame and the next could
 * leave the coordinate space describing a different box than the one being
 * painted, and a game would draw at the wrong size.
 */
function currentView() {
  const dpr = canvasScale();
  const w = els.game.width / dpr;
  const h = els.game.height / dpr;
  // Pose coordinates describe the camera frame; when that frame is on screen
  // behind the game it is cropped to fill, so they need the same crop applied
  // before they mean anything in pixels.
  return { w, h, dpr, ...poseMapping(w, h, cameraFraming()) };
}

const cameraFraming = () => ({
  videoW: els.video.videoWidth,
  videoH: els.video.videoHeight,
  cropped: entry?.backdrop === "camera",
});

const perf = new PerfGovernor();

/**
 * Device pixels per CSS pixel for the game canvas. Capped by the governor, so
 * a phone that cannot fill 1.3 million pixels a frame quietly draws fewer
 * instead of stuttering.
 */
const canvasScale = () => Math.min(perf.scale, window.devicePixelRatio || 1);
let dockBox = "";
const keys = { jump: false, duck: false, left: false, right: false };

/*
 * The HUD is touched every frame but changes a few times a round. Writing
 * anyway makes the browser recalculate style sixty times a second for nothing,
 * so every write goes through these.
 */
function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function setHidden(node, hidden) {
  if (node.hidden !== hidden) node.hidden = hidden;
}

function setClass(node, name, on) {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}

/* ---------------- screens ---------------- */

function show(name) {
  phase = name;
  for (const [key, node] of Object.entries(els.screens)) node.hidden = key !== name;

  els.cameraDock.hidden = name !== "calibrate" && name !== "play";

  // Canvases measure zero while their screen is hidden, so size them after.
  requestAnimationFrame(fitCanvases);
  fitCanvases();
}

/**
 * Lay the fixed camera dock over the slot belonging to the current screen.
 * Cheap enough to run whenever anything moves, and it never touches the DOM
 * tree the video lives in.
 */
function positionDock() {
  const slot =
    phase === "calibrate" ? els.calibSlot : phase === "play" ? els.playSlot : null;
  if (!slot || els.cameraDock.hidden) return;

  const r = slot.getBoundingClientRect();
  if (!r.width) return;
  const box = [r.left, r.top, r.width, r.height].map(Math.round);
  const key = box.join(",");
  if (key !== dockBox) {
    dockBox = key;
    const [left, top, width, height] = box;
    Object.assign(els.cameraDock.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  }
  setClass(els.cameraDock, "as-pip", phase === "play");
  setClass(els.cameraDock, "behind", phase === "play" && entry?.backdrop === "camera");
}

/* ---------------- home ---------------- */

const gamesForSkill = (id) => GAMES.filter((g) => g.skills?.includes(id));

/**
 * One game card. Shared by the home grid and the skill screens so a game looks
 * and behaves the same wherever it is found. `highlight` is the skill whose
 * screen we are on, if any, so the card can show why it is in this list.
 */
function gameCard(meta, highlight = null) {
  const li = document.createElement("li");
  const card = document.createElement("button");
  card.type = "button";
  card.className = "game-card";
  card.dataset.game = meta.id;
  if (!meta.ready) card.disabled = true;

  const art = document.createElement("canvas");
  art.className = "card-art";
  art.width = 320;
  art.height = 180;
  drawCardArt(art.getContext("2d"), meta.id, 320, 180);

  const title = document.createElement("span");
  title.className = "card-title";
  title.textContent = meta.title;

  const tag = document.createElement("span");
  tag.className = "card-tag";
  tag.textContent = meta.tagline;

  const badge = document.createElement("span");
  if (!meta.ready) {
    badge.className = "card-badge soon";
    badge.textContent = "Coming next";
  } else {
    badge.className = `card-badge ${meta.needs}`;
    badge.textContent = meta.needs === "full" ? "Full body" : "Upper body";
  }

  // What this game asks of your body, so the health angle is on the card
  // itself rather than only on the skill shelf.
  const skills = document.createElement("span");
  skills.className = "card-skills";
  for (const id of meta.skills ?? []) {
    const skill = skillById(id);
    if (!skill) continue;
    const pill = document.createElement("span");
    pill.className = "skill-pill";
    if (id === highlight) pill.classList.add("on");
    pill.textContent = `${skill.icon} ${skill.label}`;
    skills.append(pill);
  }

  const best = document.createElement("span");
  best.className = "card-best";
  const record = bests[meta.id];
  best.textContent = record
    ? `Best · Level ${record.level} · ${record.score} pts`
    : "Not played yet";
  if (!record) best.classList.add("unplayed");

  card.append(art, title, tag, badge, skills, best);
  if (meta.ready) card.addEventListener("click", () => selectGame(meta.id));
  li.append(card);
  return li;
}

/**
 * The shelf of motor skills, as cards rather than a strip of filters.
 *
 * Each one is a way into the arcade for someone who knows what they want to
 * work on but not which game does it, which is most of the point of sorting
 * the games this way at all.
 */
function buildSkillGrid() {
  els.skillGrid.replaceChildren();

  for (const skill of SKILLS) {
    const games = gamesForSkill(skill.id);
    if (!games.length) continue;

    const li = document.createElement("li");
    const card = document.createElement("button");
    card.type = "button";
    card.className = "skill-card";
    card.dataset.skill = skill.id;
    card.style.setProperty("--tint", skill.tint);

    // Big enough to stay sharp on a desktop card; the tint behind it is the
    // element's own background, so the drawing only puts down Pip and props.
    const art = document.createElement("canvas");
    art.className = "skill-art";
    art.width = 480;
    art.height = 270;
    art.setAttribute("aria-hidden", "true");
    drawSkillArt(art.getContext("2d"), skill.id, art.width, art.height, skill.tint);

    const count = node("span", "skill-count", plural(games.length, "game"));

    card.append(
      art,
      node("span", "card-title", skill.label),
      node("span", "card-tag", skill.blurb),
      count,
    );
    card.addEventListener("click", () => openSkill(skill.id));
    li.append(card);
    els.skillGrid.append(li);
  }
}

/** Which skill screen is on show, and whether a round should return to it. */
let openSkillId = null;
let returnSkill = null;

/** Everything that trains one skill, on a screen of its own. */
function openSkill(id) {
  const skill = skillById(id);
  if (!skill) return;
  fx.cue("ui");
  openSkillId = id;

  const games = gamesForSkill(id);
  els.skillTitle.textContent = `${skill.icon} ${skill.label}`;
  els.skillBlurb.textContent = `${skill.blurb} · ${plural(games.length, "game")}`;

  els.skillGames.replaceChildren();
  for (const meta of games) els.skillGames.append(gameCard(meta, id));
  setHidden(els.skillEmpty, games.length > 0);

  show("skill");
}

/* ---------------- activity ---------------- */

/** Small helper: an element with a class and some text. */
function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

/** A labelled number, used across the activity screen. */
function tile(value, label) {
  const box = node("div", "stat-tile");
  box.append(node("span", "tile-value", value), node("span", "tile-label", label));
  return box;
}

/** "1 round" but "2 rounds". */
const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;

/** "12 jumps · 30 reaches", in catalogue order so it reads the same everywhere. */
function actionLine(actions) {
  return ACTIONS.filter((a) => actions[a.id] > 0)
    .map((a) => `${a.icon} ${actions[a.id]} ${a.unit}`)
    .join(" · ");
}

function buildActivity() {
  const view = summarise(history, { days: 14 });
  els.activityBody.replaceChildren();

  if (!view.totals.rounds) {
    els.activitySub.textContent = "Nothing logged yet.";
    els.activityBody.append(
      node("p", "empty-note", "Play a round and this fills up: what you played, when, and how many jumps, squats and punches it took."),
    );
    return;
  }

  els.activitySub.textContent = `${plural(view.totals.rounds, "round")} · ${formatDuration(view.totals.ms)} moving`;

  // Headline numbers.
  const top = node("div", "tile-row");
  top.append(
    tile(String(view.totals.rounds), view.totals.rounds === 1 ? "round played" : "rounds played"),
    tile(formatDuration(view.totals.ms), "time moving"),
    tile(String(view.streak), view.streak === 1 ? "day streak" : "day streak"),
  );
  els.activityBody.append(top);

  // Every movement, all time. This is the number the whole feature is for.
  els.activityBody.append(node("h2", "activity-head", "Movements so far"));
  const moves = node("div", "tile-row wrap");
  const counted = ACTIONS.filter((a) => view.totals.actions[a.id] > 0);
  for (const action of counted) {
    moves.append(tile(`${action.icon} ${view.totals.actions[action.id]}`, action.verb));
  }
  els.activityBody.append(
    counted.length ? moves : node("p", "empty-note", "No movements counted yet."),
  );

  // Time per motor skill, which is the health story.
  els.activityBody.append(node("h2", "activity-head", "Motor skills trained"));
  const bars = node("div", "bar-list");
  const widest = Math.max(...view.skills.map((s) => s.ms), 1);
  for (const entry of view.skills) {
    const skill = skillById(entry.id);
    if (!skill) continue;
    const row = node("div", "bar-row");
    row.append(node("span", "bar-label", `${skill.icon} ${skill.label}`));
    const track = node("div", "bar-track");
    const fill = node("div", "bar-fill");
    fill.style.width = `${Math.max(4, (entry.ms / widest) * 100)}%`;
    track.append(fill);
    row.append(track, node("span", "bar-value", formatDuration(entry.ms)));
    // Tapping a skill here takes you to the games that train it.
    row.addEventListener("click", () => openSkill(entry.id));
    bars.append(row);
  }
  els.activityBody.append(bars);

  // Day by day.
  els.activityBody.append(node("h2", "activity-head", "Day by day"));
  const list = node("div", "day-list");
  for (const day of view.days) {
    const card = node("div", "day-card");
    const head = node("div", "day-head");
    head.append(
      node("span", "day-name", formatDay(day.day)),
      node("span", "day-meta", `${plural(day.rounds, "round")} · ${formatDuration(day.ms)}`),
    );
    card.append(head);

    const played = Object.entries(day.games)
      .map(([id, n]) => `${gameById(id)?.title ?? id}${n > 1 ? ` ×${n}` : ""}`)
      .join(", ");
    card.append(node("p", "day-games", played));

    const line = actionLine(day.actions);
    if (line) card.append(node("p", "day-actions", line));
    list.append(card);
  }
  els.activityBody.append(list);
}

function openActivity() {
  fx.cue("ui");
  buildActivity();
  show("activity");
}

/* ---------------- sizing ---------------- */

function fitCanvases() {
  const dpr = canvasScale();

  const stage = els.stage?.getBoundingClientRect();
  if (stage?.width) {
    // Assigning width or height wipes the canvas even when the value is
    // unchanged, which would blank whatever the last frame drew.
    const w = Math.round(stage.width * dpr);
    const h = Math.round(stage.height * dpr);
    if (els.game.width !== w) els.game.width = w;
    if (els.game.height !== h) els.game.height = h;
  }

  const v = els.video;
  if (v.videoWidth) {
    const w = Math.min(480, v.videoWidth);
    const h = Math.round(w * (v.videoHeight / v.videoWidth));
    if (els.overlay.width !== w) els.overlay.width = w;
    if (els.overlay.height !== h) els.overlay.height = h;
    // Shape the reserved slots to the camera so the skeleton lines up exactly.
    document.documentElement.style.setProperty(
      "--cam-aspect",
      `${v.videoWidth} / ${v.videoHeight}`,
    );
  }

  positionDock();
}

/* ---------------- flow ---------------- */

/**
 * Picking a game shows you how to play it while the camera warms up.
 *
 * Starting the camera and building the pose model takes a few seconds the
 * first time, and that used to be a spinner. It is now the one moment the
 * player is definitely looking at the screen and not yet moving, which makes
 * it the right time to show them the movement — so the wait teaches instead
 * of just passing. Once everything is up the button goes live; on later games
 * that is immediate and this is simply the instructions.
 */
async function selectGame(id) {
  entry = gameById(id);
  if (!entry?.ready) return;

  // Started from a skill screen? Then that is where finishing should land, so
  // the next game in the same category is one tap away.
  returnSkill = phase === "skill" ? openSkillId : null;

  // Only a real tap is allowed to start audio, and this is the first one.
  fx.unlock();
  fx.cue("ui");

  showHowTo(entry);

  // Backing out or picking something else abandons whatever this one loads.
  selectToken += 1;
  const mine = selectToken;

  // Sticky product path: howto is instant; Play opens the embed shell.
  // Legacy arcade still preloads camera + Stage 0 game modules here.
  if (!LEGACY_ARCADE) {
    readyToPlay = true;
    els.howtoLoading.hidden = true;
    els.btnHowtoPlay.disabled = false;
    els.howtoLoadText.textContent = "Ready — Play opens the motion mini-game.";
    return;
  }

  try {
    if (!poseReady) {
      await startCamera(els.video);
      tracker = await createPoseTracker();
      poseMeta = { delegate: tracker.delegate, model: tracker.model, mode: tracker.mode };
      poseReady = true;
      fitCanvases();
    }
    if (mine !== selectToken) return;

    const mod = await entry.load();
    if (mine !== selectToken) return;
    game = mod.createGame({ fx });
    readyToPlay = true;
    els.howtoLoading.hidden = true;
    els.btnHowtoPlay.disabled = false;
  } catch (err) {
    if (mine !== selectToken) return;
    els.howtoLoadText.textContent =
      err?.name === "NotAllowedError"
        ? "Camera permission is required. Allow it, then try again."
        : `Could not start: ${err?.message || err}`;
    els.howtoLoading.querySelector(".spinner")?.setAttribute("hidden", "");
  }
}

/** Fill in the how-to screen for a game and put it on screen. */
function showHowTo(meta) {
  readyToPlay = false;
  shownStep = -1;
  els.btnHowtoPlay.disabled = true;
  els.howtoLoading.hidden = false;
  els.howtoLoading.querySelector(".spinner")?.removeAttribute("hidden");
  els.howtoLoadText.textContent = LEGACY_ARCADE
    ? poseReady
      ? "Loading game…"
      : "Starting camera and pose tracking…"
    : "Ready when you are…";

  setText(els.howtoTitle, meta.title);
  setText(els.howtoTagline, meta.tagline);
  els.howtoBadge.className = `card-badge ${meta.needs}`;
  els.howtoBadge.textContent = meta.needs === "full" ? "Full body" : "Upper body";
  setText(
    els.howtoFraming,
    meta.needs === "full"
      ? "Stand back until your whole body fits in the picture, head to feet."
      : "Sit or stand close, with your head and both arms in the picture.",
  );

  els.howtoSteps.replaceChildren(
    ...clipsFor(meta).map((id) => {
      const li = document.createElement("li");
      li.textContent = clipCue(id);
      return li;
    }),
  );
  els.howtoRules.replaceChildren(
    ...meta.howTo.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }),
  );

  const trains = meta.skills.map((id) => skillById(id)?.label).filter(Boolean);
  setText(els.howtoSkills, trains.length ? `Trains ${listOut(trains)}.` : "");

  show("howto");
}

/** "a, b and c" — for reading out a short list in a sentence. */
function listOut(items) {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Paint the looping demonstration, and keep the step list in step with it. */
function drawHowToFrame(now) {
  const canvas = els.howtoCanvas;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawHowTo(ctx, { w, h }, entry, now);

  // Only touch the list when the movement on screen actually changes.
  const { index } = currentClip(entry, now);
  if (index === shownStep) return;
  shownStep = index;
  const items = els.howtoSteps.children;
  for (let i = 0; i < items.length; i += 1) items[i].classList.toggle("showing", i === index);
}

/** Leave the instructions and get into frame. */
function beginCalibration() {
  if (!readyToPlay) return;
  fx.cue("ui");
  signals = new MotionSignals({ mode: entry.needs });
  signals.startCalibration(performance.now());
  lastLandmarks = null;

  els.calibTips.replaceChildren(
    ...framingTips(entry).map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    }),
  );
  show("calibrate");
}

function framingTips(meta) {
  const base =
    meta.needs === "full"
      ? ["Stand back until your whole body fits, head to feet", "Give yourself room to move"]
      : ["Sit or stand so your head and both arms are visible", "Keep your hands in shot"];
  return [...base, ...meta.howTo];
}

function startRound(now) {
  game.start(now);
  countdownEnd = now + COUNTDOWN_MS;
  spokenCount = -1;
  roundBegun = false;
  roundBanked = false;
  playLevel = 1;
  celebration.hide();
  fpsSamples = [];
  livesKey = "";
  els.stage.classList.toggle("camera-backdrop", entry.backdrop === "camera");
  show("play");
  wipeCanvas();
}

/**
 * Blank the play canvas. The canvas is only resized when its size actually
 * changes, so without this the last frame of the previous game would sit on
 * screen until the new one paints.
 */
function wipeCanvas() {
  const ctx = els.game.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, els.game.width, els.game.height);
}

/**
 * Save what the current round achieved, whether it ran out or was walked away
 * from: a round quit halfway is still exercise that happened.
 *
 * Safe to call twice, and it ignores rounds too short to mean anything so
 * tapping into a game and straight back out does not litter the log.
 */
function bankRound() {
  if (!game || !roundBegun || roundBanked) return null;
  roundBanked = true;

  const summary = game.summary();
  const ms = playedMs();
  const moved = Object.values(summary.actions ?? {}).some((n) => n > 0);
  const beaten = recordBest(entry.id, { score: summary.score, level: summary.level ?? 1 });

  if (ms >= 3000 || moved) {
    logRound(
      roundEntry({
        game: entry.id,
        ms,
        score: summary.score,
        level: summary.level ?? 1,
        actions: summary.actions ?? {},
      }),
    );
  }
  return { summary, beaten };
}

function finishRound() {
  celebration.hide();
  fx.cue("finish");
  const { summary: s, beaten } = bankRound() ?? { summary: game.summary(), beaten: false };
  const avg = fpsSamples.length ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0;
  els.restGame.textContent = entry.title;
  els.restTitle.textContent = rankFor(s.score).title;
  els.restScore.textContent = String(s.score);
  els.restCombo.textContent = String(s.bestCombo ?? 0);
  els.restCleared.textContent = String(s.cleared ?? 0);
  els.restLevel.textContent = String(s.level ?? 1);
  els.restNote.textContent = roundNote(s, beaten, avg);
  paintRoundActions(s.actions ?? {});

  show("rest");
}

/**
 * How long this round actually ran. Timed from the first real frame rather
 * than from the game's clock, because the countdown is not exercise and a
 * round quit halfway should log the half that happened.
 */
function playedMs() {
  return roundBegun ? Math.max(0, performance.now() - roundStartedAt) : 0;
}

/** The movement tally on the results screen: "18 jumps · 4 ducks". */
function paintRoundActions(actions) {
  const parts = ACTIONS.filter((a) => actions[a.id] > 0).map(
    (a) => `${a.icon} ${actions[a.id]} ${actions[a.id] === 1 ? a.unit.replace(/s$/, "") : a.unit}`,
  );
  els.restActions.textContent = parts.join(" · ");
  setHidden(els.restActions, parts.length === 0);
}

/**
 * What to say under the scoreboard. A new best outranks the usual encouragement,
 * and weak tracking is worth mentioning because it is fixable.
 */
function roundNote(summary, beaten, fps) {
  if (fps && fps < 12) {
    return "Tracking was struggling — more light, or a bit more space, will help.";
  }
  if (beaten) return `New best! You reached level ${summary.level ?? 1}.`;
  return rankFor(summary.score).note;
}

function rankFor(score) {
  if (score >= 45) return { title: "Gold run!", note: "That was seriously quick." };
  if (score >= 25) return { title: "Silver run", note: "Strong pace — go for gold." };
  if (score >= 10) return { title: "Bronze run", note: "Nice work. One more round?" };
  return { title: "Warm-up done", note: "Get a bit more of yourself in frame and try again." };
}

/* ---------------- per-frame ---------------- */

function updatePose(now) {
  if (!tracker || !signals) return;

  // Hand over the newest camera frame and take whatever came back. On the
  // worker the answer describes a slightly older frame, so the filters are
  // told when it was taken rather than when it turned up: otherwise a hand's
  // speed would be measured over the wrong slice of time.
  const { landmarks, at, fresh, inferMs } = tracker.track(els.video, now);
  if (!fresh) return;

  perf.poseCost(inferMs);
  poseFps.hit(now);
  lastLandmarks = landmarks ?? null;
  lastSignal = signals.update(lastLandmarks ?? [], at);
  lastSignalAt = at;
}

/*
 * The numbers behind a round that feels sticky.
 *
 * "draw" is how often the screen updates, "pose" is how often the camera is
 * actually looked at, and "detect" is how long one look costs. If detect is
 * anywhere near a frame, that is where the stutter is coming from, and no
 * amount of tuning the drawing will help.
 */
const drawFps = new FpsMeter();

function paintPerfReadout(now) {
  drawFps.hit(now);
  const report = perf.report();
  els.perfReadout.textContent = [
    `draw ${Math.round(drawFps.value() ?? 0)}fps`,
    `pose ${Math.round(poseFps.value() ?? 0)}fps`,
    `detect ${report.avgInferMs}ms`,
    `scale ${report.scale}x`,
    `${poseMeta.mode} ${poseMeta.delegate} ${poseMeta.model}`,
  ].join("  ·  ");
}

/** Fold keyboard fallbacks into the motion signals. */
function withKeys(s) {
  return {
    ...s,
    jump: Boolean(s.jump || keys.jump),
    ducking: Boolean(s.ducking || keys.duck),
    lean: keys.left ? -1 : keys.right ? 1 : s.lean,
  };
}

function runCalibrate(s) {
  els.calibFill.style.width = `${Math.round((s.progress || 0) * 100)}%`;
  if (!s.inFrame) {
    els.calibTitle.textContent = entry.needs === "full" ? "Step back" : "Come into frame";
    els.calibHint.textContent =
      entry.needs === "full"
        ? "We need to see you from head to feet"
        : "We need to see your head and both arms";
  } else if (s.quality < 0.5) {
    els.calibTitle.textContent = "A bit more light";
    els.calibHint.textContent = "Tracking is weak — brighten the room if you can";
  } else {
    els.calibTitle.textContent = "Hold still";
    els.calibHint.textContent = "Measuring how you stand…";
  }
}

let livesKey = "";

/** Rebuild the hearts only when the count actually changes. */
function drawLives({ lives = 0, maxLives = 0 }) {
  const key = `${lives}/${maxLives}`;
  if (key === livesKey) return;
  livesKey = key;
  // Time-attack games run with no lives at all; the bar just stays empty.
  els.hudLives.dataset.max = String(maxLives);
  els.hudLives.replaceChildren(
    ...Array.from({ length: maxLives }, (_, i) => {
      const s = document.createElement("span");
      const alive = i < lives;
      s.className = alive ? "heart" : "heart lost";
      s.textContent = alive ? "♥" : "♡";
      return s;
    }),
  );
}

function needsRotating() {
  return entry?.orientation === "landscape" && window.innerHeight > window.innerWidth;
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function drawCameraBackdrop(ctx, view) {
  const v = els.video;
  if (!v.videoWidth) return;
  // Mirrored and cropped to fill, matching the preview the player sees. The
  // same box decides where the games think a hand is, so the two cannot drift.
  const box = coverBox(v.videoWidth, v.videoHeight, view.w, view.h);
  ctx.save();
  ctx.translate(view.w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(v, box.left, box.top, box.width, box.height);
  ctx.restore();
  ctx.fillStyle = "rgba(9, 16, 22, 0.28)";
  ctx.fillRect(0, 0, view.w, view.h);
}

function runPlay(s, now, dt) {
  // Hold the round at the countdown until the phone is the right way round,
  // so nobody loses lives to a screen they cannot read.
  const rotate = needsRotating();
  setHidden(els.rotateHint, !rotate);
  if (rotate) countdownEnd = now + COUNTDOWN_MS;

  // Games hit-test in pixels, so they need the same box the draw uses. Without
  // it a reach that looks right across a phone is twice as generous down it.
  const view = currentView();

  const counting = now < countdownEnd;
  const cheering = celebration.active;

  if (!counting && !cheering) {
    // Start the clock on the first real frame, not when the countdown began.
    // Otherwise the countdown eats a few seconds of every round, and the
    // difficulty ramp is already ahead of what the player has actually seen.
    if (!roundBegun) {
      roundBegun = true;
      roundStartedAt = now;
      game.start(now);
      playLevel = 1;
    }
    const ev = game.tick(dt, s, now, view);
    if (ev.over) {
      finishRound();
      return;
    }
    const leveled = game.hud().level ?? 1;
    // Pause on level clear: chocolate shower + dancing Pip + Continue.
    // Kids should celebrate before the next wave, not auto-skip the moment.
    if (leveled > playLevel) {
      playLevel = leveled;
      celebration.show(playLevel, now);
    }
  }

  const hud = game.hud();
  setText(els.hudScore, String(hud.score));
  setText(els.hudLevel, `Lv ${hud.level ?? 1}`);
  setText(els.hudTime, formatTime(hud.timeLeft));
  setHidden(els.hudCombo, (hud.combo ?? 0) < 3);
  if (!els.hudCombo.hidden) setText(els.hudCombo, `x${hud.combo}`);
  drawLives(hud);

  const ctx = els.game.getContext("2d");
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.w, view.h);

  if (entry.backdrop === "camera") drawCameraBackdrop(ctx, view);
  // While cheering, keep painting the frozen world under the overlay (dt 0 so
  // game-local sparkles do not keep drifting as if time still ran).
  game.draw(ctx, view, s, now, cheering ? 0 : dt);
  if (!cheering) {
    drawLevelBanner(ctx, view, hud.level ?? 1, hud.levelFlash ?? 0);
  } else {
    celebration.frame(now, dt);
  }

  setHidden(els.stageNote, s.inFrame || counting || cheering);

  if (rotate || cheering) {
    setHidden(els.banner, true);
  } else if (counting) {
    const left = Math.ceil((countdownEnd - now) / 1000);
    setHidden(els.banner, false);
    setText(els.bannerTitle, left > 1 ? String(left - 1) : "Go!");
    setText(els.bannerSub, left > 1 ? entry.howTo[0] : "");
    // One sound per number, so you can start moving without watching the screen.
    if (left !== spokenCount) {
      spokenCount = left;
      fx.cue(left > 1 ? "tick" : "go");
    }
  } else {
    setHidden(els.banner, true);
    const fps = poseFps.value();
    if (fps) fpsSamples.push(fps);
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const rawMs = lastTs ? now - lastTs : 16.7;
  const dt = lastTs ? Math.min(0.05, rawMs / 1000) : 0.016;
  lastTs = now;

  // Only judge the device while it is actually drawing a game.
  if (phase === "play" && perf.frame(rawMs)) fitCanvases();

  if (phase === "home" && els.logo) {
    const ctx = els.logo.getContext("2d");
    ctx.clearRect(0, 0, els.logo.width, els.logo.height);
    drawMascotBadge(ctx, 60, 60, 110, now);
  }

  if (phase === "howto" && entry) {
    drawHowToFrame(now);
    return;
  }

  if (phase !== "calibrate" && phase !== "play") return;

  // Keeps up with the mobile address bar sliding in and out.
  positionDock();
  updatePose(now);
  // Carry the hands forward by however stale the reading is, so what the game
  // sees matches where the player's hands are now rather than at capture.
  const s = withKeys(leadHands(lastSignal, now - lastSignalAt));
  keys.jump = false;
  // Pose runs slower than render; consume the pulse so it is not replayed.
  lastSignal.jump = false;

  if (debugOn) {
    drawOverlay(els.overlay.getContext("2d"), lastLandmarks, s.debug, true);
    paintPerfReadout(now);
  }

  if (phase === "calibrate") {
    runCalibrate(s);
    if (s.calibrated) startRound(now);
    return;
  }

  if (phase === "play" && game) runPlay(s, now, dt);
}

/* ---------------- wiring ---------------- */

function goHome() {
  celebration.hide();
  bankRound();
  game = null;
  signals = null;
  // Anything still loading for the game just abandoned is no longer wanted.
  selectToken += 1;
  readyToPlay = false;
  els.rotateHint.hidden = true;
  // Back to the skill you were browsing, if you came in through one.
  if (returnSkill) openSkill(returnSkill);
  else show("home");
}

function launchStickyPlay() {
  if (!entry?.id) return;
  fx.cue("ui");
  location.href = `./play.html?card=${encodeURIComponent(entry.id)}`;
}

els.btnHowtoPlay.addEventListener("click", () => {
  if (LEGACY_ARCADE) beginCalibration();
  else launchStickyPlay();
});
els.btnHowtoBack.addEventListener("click", goHome);
el("btn-load-back").addEventListener("click", goHome);
el("btn-calib-back").addEventListener("click", goHome);
el("btn-quit").addEventListener("click", goHome);
el("btn-home").addEventListener("click", goHome);
el("btn-again").addEventListener("click", () => selectGame(entry.id));

function paintSoundButton() {
  els.btnSound.setAttribute("aria-pressed", String(!fx.muted));
  els.btnSound.firstElementChild.textContent = fx.muted ? "🔇" : "🔊";
}

function toggleSound() {
  const muted = fx.toggle();
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* the setting just will not survive a reload */
  }
  paintSoundButton();
  // Unmuting is itself a tap, so it can both start audio and prove it works.
  if (!muted) {
    fx.unlock();
    fx.cue("ui");
  }
}

els.btnSound.addEventListener("click", toggleSound);
paintSoundButton();

/** Leave a browsing screen for the full arcade, forgetting where we were. */
function backToHome() {
  returnSkill = null;
  openSkillId = null;
  fx.cue("ui");
  show("home");
}

els.btnActivity.addEventListener("click", openActivity);
els.btnActivityBack.addEventListener("click", backToHome);
els.btnSkillBack.addEventListener("click", backToHome);

/* ---------------- feedback ---------------- */

/**
 * Where the feedback screen goes back to.
 *
 * Reached from the home screen it should return there, but reached from the
 * results of a round it should go back to those results, so the player can
 * still hit "Play again" after saying their piece.
 */
let feedbackFrom = "home";

const openFeedbackScreen = setupFeedback({
  els: els.feedback,
  games: GAMES,
  // Read at the moment of sending, so a report written after a round carries
  // that round's numbers rather than the ones from start-up.
  context: () => ({
    installed: isInstalled(),
    pose: poseReady
      ? {
          model: poseMeta.model,
          delegate: poseMeta.delegate,
          fps: Math.round(poseFps.value() ?? 0),
          inferMs: perf.report().avgInferMs,
        }
      : null,
  }),
  onClose: () => {
    fx.cue("ui");
    show(feedbackFrom);
  },
});

function openFeedback(from, aboutGame = "") {
  feedbackFrom = from;
  fx.cue("ui");
  show("feedback");
  openFeedbackScreen(aboutGame);
}

els.btnFeedback.addEventListener("click", () => openFeedback("home"));
els.btnRestFeedback.addEventListener("click", () => openFeedback("rest", entry?.title ?? ""));

els.btnSkeleton.addEventListener("click", () => {
  debugOn = !debugOn;
  els.btnSkeleton.setAttribute("aria-pressed", String(debugOn));
  setHidden(els.perfReadout, !debugOn);
  const ctx = els.overlay.getContext("2d");
  ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
});

window.addEventListener("resize", fitCanvases);
window.addEventListener("orientationchange", () => setTimeout(fitCanvases, 250));
els.video.addEventListener("loadedmetadata", fitCanvases);

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "ArrowUp") keys.jump = true;
  if (e.key === "ArrowDown") keys.duck = true;
  if (e.key === "ArrowLeft") keys.left = true;
  if (e.key === "ArrowRight") keys.right = true;
  if (e.key === "Escape" && phase === "play") goHome();
  if (e.key === "d" || e.key === "D") els.btnSkeleton.click();
  if (e.key === "m" || e.key === "M") toggleSound();
});
window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowDown") keys.duck = false;
  if (e.key === "ArrowLeft") keys.left = false;
  if (e.key === "ArrowRight") keys.right = false;
});

buildSkillGrid();
fitCanvases();
registerWorker();
offerInstall(els.screens.home);
requestAnimationFrame(loop);
