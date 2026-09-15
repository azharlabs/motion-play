import { startCamera } from "../camera.js";
import { createPoseTracker } from "../pose.js";
import { MotionSignals, leadHands } from "../signals.js";
import { ExternalMotionMapper } from "./motion-mapper.js";
import { ExternalGameBridge } from "./bridge.js";
import { EMBED_CATALOG, catalogEntry, embedUrl, CATALOG_CARD_IDS } from "./catalog.js";
import { gameById } from "../games/registry.js";
import { drawMascotBadge } from "../mascot.js";
import { drawHowTo, currentClip, clipsFor, clipCue } from "../demo.js";

const el = (id) => document.getElementById(id);
const library = el("library");
const preview = el("preview");
const playShell = el("play-shell");
const titleGrid = el("title-grid");
const logo = el("logo-mascot");
const howtoCanvas = el("howto-canvas");
const video = el("video");
const overlay = el("overlay");
const status = el("status");
const counts = el("counts");
const profileSelect = el("profile"); // may be absent — profile UI removed
const btnStart = el("start");
const btnStop = el("stop");
const gameFrame = el("game-frame");
const titleEl = el("game-title");
const btnPreviewBack = el("btn-preview-back");
const btnPreviewPlay = el("btn-preview-play");

const params = new URLSearchParams(location.search);
const cardId = params.get("card") || params.get("game") || "";
const previewId = params.get("preview") || "";
const catalog = cardId ? catalogEntry(cardId) : null;

let previewMeta = null;
let previewShownStep = -1;
let rafId = 0;

function hideAll() {
  if (library) library.hidden = true;
  if (preview) preview.hidden = true;
  if (playShell) playShell.hidden = true;
}

function showLibrary() {
  hideAll();
  if (library) library.hidden = false;
  document.title = "MotionPlay — Play";
  document.body.style.background = "";
  previewMeta = null;
}

function showPreview(id) {
  const entry = catalogEntry(id);
  const meta = gameById(id);
  if (!entry || !meta) return;
  hideAll();
  if (preview) preview.hidden = false;
  document.body.style.background = "";
  document.title = `MotionPlay — ${entry.title}`;
  previewMeta = meta;
  previewShownStep = -1;

  const title = el("preview-title");
  const tagline = el("preview-tagline");
  const badge = el("preview-badge");
  const framing = el("preview-framing");
  const steps = el("preview-steps");
  const rules = el("preview-rules");

  if (title) title.textContent = entry.title;
  if (tagline) tagline.textContent = entry.hint || meta.tagline || "";
  if (badge) {
    badge.className = `card-badge ${entry.needs === "upper" ? "upper" : "full"}`;
    badge.textContent = entry.needs === "upper" ? "Upper body" : "Full body";
  }
  if (framing) {
    framing.textContent =
      entry.needs === "upper"
        ? "Sit or stand close, with your head and both arms in the picture."
        : "Stand back until your whole body fits in the picture, head to feet.";
  }
  if (steps) {
    steps.replaceChildren(
      ...clipsFor(meta).map((clipId) => {
        const li = document.createElement("li");
        li.textContent = clipCue(clipId);
        return li;
      }),
    );
  }
  if (rules) {
    const howTo = meta.howTo || [];
    rules.replaceChildren(
      ...howTo.map((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        return li;
      }),
    );
  }

  // Deep-linkable preview without entering play yet.
  const url = new URL(location.href);
  url.searchParams.delete("card");
  url.searchParams.delete("game");
  url.searchParams.set("preview", id);
  history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString() + url.hash);

  if (btnPreviewPlay) {
    btnPreviewPlay.onclick = () => {
      const playUrl = new URL(location.href);
      playUrl.searchParams.delete("preview");
      playUrl.searchParams.set("card", id);
      location.assign(playUrl.pathname + "?" + playUrl.searchParams.toString() + playUrl.hash);
    };
  }
}

function showPlayShell() {
  hideAll();
  if (playShell) playShell.hidden = false;
  document.body.style.background = "#0d2a26";
}

function paintLibrary() {
  if (!titleGrid) return;
  titleGrid.replaceChildren();
  for (const id of CATALOG_CARD_IDS) {
    const entry = EMBED_CATALOG[id];
    const meta = gameById(id);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "title-card";
    btn.style.setProperty("--accent", entry.params?.accent || meta?.accent || "#0f9b8e");
    btn.dataset.card = id;

    const swatch = document.createElement("div");
    swatch.className = "title-swatch";
    swatch.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "title-name";
    name.textContent = entry.title;

    const hint = document.createElement("span");
    hint.className = "title-hint";
    hint.textContent = entry.hint || meta?.tagline || "";

    const badge = document.createElement("span");
    badge.className = "title-badge";
    badge.textContent = entry.needs === "upper" ? "Upper body" : "Full body";

    btn.append(swatch, name, hint, badge);
    btn.addEventListener("click", () => showPreview(id));
    li.append(btn);
    titleGrid.append(li);
  }
}

function drawHowToFrame(now) {
  if (!howtoCanvas || !previewMeta || preview?.hidden) return;
  const w = howtoCanvas.clientWidth;
  const h = howtoCanvas.clientHeight;
  if (!w || !h) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (howtoCanvas.width !== pw || howtoCanvas.height !== ph) {
    howtoCanvas.width = pw;
    howtoCanvas.height = ph;
  }

  const ctx = howtoCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawHowTo(ctx, { w, h }, previewMeta, now);

  const { index } = currentClip(previewMeta, now);
  if (index === previewShownStep) return;
  previewShownStep = index;
  const items = el("preview-steps")?.children;
  if (!items) return;
  for (let i = 0; i < items.length; i += 1) items[i].classList.toggle("showing", i === index);
}

function chromeLoop(now) {
  rafId = requestAnimationFrame(chromeLoop);
  if (library && !library.hidden && logo) {
    const ctx = logo.getContext("2d");
    ctx.clearRect(0, 0, logo.width, logo.height);
    drawMascotBadge(ctx, 60, 60, 110, now);
  }
  if (preview && !preview.hidden && previewMeta) {
    drawHowToFrame(now);
  }
}

/* ---- library / preview path (no ?card=) ---- */
if (!catalog) {
  paintLibrary();
  if (previewId && catalogEntry(previewId)) {
    showPreview(previewId);
  } else {
    showLibrary();
  }
  btnPreviewBack?.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.delete("preview");
    history.replaceState(null, "", url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") + url.hash);
    showLibrary();
  });
  requestAnimationFrame(chromeLoop);
}

/* ---- play session ---- */
const playMode = Boolean(playShell && (catalog || !library));

if (playMode && catalog) {
  showPlayShell();

  const defaultProfile = catalog?.profile || params.get("profile") || "runner";
  const signalMode = catalog?.needs === "upper" ? "upper" : "full";

  // Profile dropdown removed from primary UI; still honor catalog / ?profile= under the hood.
  if (profileSelect) {
    profileSelect.hidden = true;
    profileSelect.setAttribute("aria-hidden", "true");
  }

  if (catalog) {
    if (titleEl) {
      titleEl.replaceChildren();
      titleEl.append(document.createTextNode(catalog.title));
    }
    document.title = `MotionPlay — ${catalog.title}`;
    if (gameFrame) {
      gameFrame.src = embedUrl(cardId);
      gameFrame.title = catalog.title;
    }
  } else if (titleEl && !titleEl.textContent.trim()) {
    titleEl.textContent = "MotionPlay";
  }

  let tracker = null;
  let signals = null;
  let mapper = null;
  let bridge = null;
  let running = false;
  let lastSignal = { inFrame: false, hands: { left: {}, right: {} } };
  let lastSignalAt = 0;
  let poseThrottle = 0;

  function controlTargets() {
    const targets = [window];
    try {
      if (gameFrame?.contentWindow) targets.push(gameFrame.contentWindow);
    } catch {
      // Cross-origin would throw; same-origin embeds should not.
    }
    return targets;
  }

  function ensureBridge() {
    if (!bridge) bridge = new ExternalGameBridge({ targets: controlTargets() });
    else bridge.setTargets(controlTargets());
    return bridge;
  }

  function renderCounts(actions = {}) {
    if (!counts) return;
    const labels = {
      jump: "jumps",
      duck: "crouches/slides",
      lean: "direction changes",
    };
    counts.replaceChildren();
    for (const [id, label] of Object.entries(labels)) {
      const row = document.createElement("div");
      row.className = "count-row";
      row.textContent = `${label}: ${actions[id] ?? 0}`;
      counts.append(row);
    }
  }

  function setStatus(text, mode = "") {
    if (!status) return;
    status.textContent = text;
    status.dataset.mode = mode;
  }

  async function start() {
    if (running) return;
    if (btnStart) btnStart.disabled = true;
    setStatus("Starting camera and pose tracking…");
    try {
      await startCamera(video);
      tracker = await createPoseTracker();
      signals = new MotionSignals({ mode: signalMode });
      signals.startCalibration(performance.now());
      mapper = new ExternalMotionMapper(defaultProfile);
      ensureBridge();
      running = true;
      if (btnStop) btnStop.disabled = false;
      setStatus(
        signalMode === "upper"
          ? "Calibrating. Keep head and both arms in frame."
          : "Calibrating. Stand back with your full body in frame.",
        "calibrating",
      );
      requestAnimationFrame(loop);
    } catch (error) {
      setStatus(`Could not start: ${error?.message ?? error}`, "error");
      if (btnStart) btnStart.disabled = false;
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    ensureBridge().release(mapper?.releaseAll() ?? [], { profile: mapper?.profile?.id });
    const stream = video?.srcObject;
    if (stream?.getTracks) for (const track of stream.getTracks()) track.stop();
    if (video) video.srcObject = null;
    tracker = null;
    signals = null;
    mapper = null;
    if (btnStart) btnStart.disabled = false;
    if (btnStop) btnStop.disabled = true;
    setStatus("Stopped. Press Start to play with your body again.");
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!tracker || !signals) return;

    const tracked = tracker.track(video, now);
    if (tracked.fresh) {
      lastSignal = signals.update(tracked.landmarks ?? [], tracked.at);
      lastSignalAt = tracked.at;
    }

    const s = leadHands(lastSignal, now - lastSignalAt);
    if (!s.calibrated) {
      setStatus(s.inFrame ? "Hold still while MotionPlay calibrates…" : "Step back until you are visible.", "calibrating");
      return;
    }

    const hint = catalog?.hint || mapper.profile.description;
    setStatus(
      s.inFrame ? `Live: ${mapper.profile.label}. ${hint}` : "Tracking paused. Come back into frame.",
      s.inFrame ? "live" : "paused",
    );

    const update = mapper.update(s);
    const b = ensureBridge();
    b.send(update.events, { profile: mapper.profile.id, card: cardId || undefined });
    if (mapper.profile.sendPose || catalog) {
      if (now - poseThrottle > 32) {
        poseThrottle = now;
        b.sendPose(update.pose, { profile: mapper.profile.id, card: cardId || undefined });
      }
    }
    renderCounts(update.actions);

    if (!overlay || !video) return;
    const ctx = overlay.getContext("2d");
    const w = (overlay.width = video.videoWidth || 640);
    const h = (overlay.height = video.videoHeight || 480);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(13,42,38,.7)";
    ctx.fillRect(12, 12, Math.min(360, w - 24), 46);
    ctx.fillStyle = "#ecfdf8";
    ctx.font = "700 18px Nunito, system-ui";
    ctx.fillText(mapper.profile.description, 22, 42, Math.min(330, w - 44));
  }

  btnStart?.addEventListener("click", start);
  btnStop?.addEventListener("click", stop);

  gameFrame?.addEventListener("load", () => {
    if (bridge) bridge.setTargets(controlTargets());
  });

  window.addEventListener("beforeunload", () => {
    if (running) ensureBridge().release(mapper?.releaseAll() ?? [], { profile: mapper?.profile?.id });
  });

  renderCounts();

  if (catalog && params.get("autostart") !== "0") {
    setTimeout(() => {
      if (!running) start();
    }, 250);
  }
} else if (playMode && !catalog && !library) {
  // play.html without ?card= — still show shell with default embed
  showPlayShell();
}
