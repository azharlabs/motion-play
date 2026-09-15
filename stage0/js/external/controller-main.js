import { startCamera, stopCamera } from "../camera.js";
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
const logoPreview = el("logo-mascot-preview");
const logoPlay = el("logo-mascot-play");
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

/** Play-session stop hook (set when play mode boots). */
let stopPlaySession = null;

function hideAll() {
  if (library) library.hidden = true;
  if (preview) preview.hidden = true;
  if (playShell) playShell.hidden = true;
}

function clearPlayQuery() {
  const url = new URL(location.href);
  url.searchParams.delete("card");
  url.searchParams.delete("game");
  url.searchParams.delete("preview");
  url.searchParams.delete("profile");
  url.searchParams.delete("autostart");
  const q = url.searchParams.toString();
  return url.pathname + (q ? `?${q}` : "") + url.hash;
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

function paintLogo(canvas, now, size) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const r = size || Math.min(canvas.width, canvas.height) * 0.92;
  drawMascotBadge(ctx, canvas.width / 2, canvas.height / 2, r, now);
}

function chromeLoop(now) {
  rafId = requestAnimationFrame(chromeLoop);
  if (library && !library.hidden && logo) paintLogo(logo, now, 110);
  if (preview && !preview.hidden) {
    paintLogo(logoPreview, now, 100);
    if (previewMeta) drawHowToFrame(now);
  }
  if (playShell && !playShell.hidden) paintLogo(logoPlay, now, 72);
}

function goHome(event) {
  // Always clear play session (camera / keys / embed) before leaving play.
  if (typeof stopPlaySession === "function") {
    try {
      stopPlaySession();
    } catch {
      /* ignore */
    }
  }

  const onPlay = playShell && !playShell.hidden;
  const onPreview = preview && !preview.hidden;

  // Soft-nav when library chrome is available on this page.
  if (!onPlay && library) {
    event?.preventDefault?.();
    history.replaceState(null, "", clearPlayQuery());
    showLibrary();
    return;
  }

  if (onPreview && library) {
    event?.preventDefault?.();
    history.replaceState(null, "", clearPlayQuery());
    showLibrary();
    return;
  }

  // Play shell with ?card= (or play.html): full navigation home after cleanup.
  if (onPlay) {
    event?.preventDefault?.();
    location.assign("./controller.html");
  }
}

function wireHomeLinks() {
  for (const node of document.querySelectorAll(".mp-home, #back-library, #back-home")) {
    node.addEventListener("click", goHome);
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
    history.replaceState(
      null,
      "",
      url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") + url.hash,
    );
    showLibrary();
  });
  requestAnimationFrame(chromeLoop);
  wireHomeLinks();
}

/* ---- play session ---- */
const playMode = Boolean(playShell && (catalog || !library));

if (playMode && catalog) {
  showPlayShell();
  requestAnimationFrame(chromeLoop);

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
      const detail = error?.message ?? String(error);
      // Soft fail: sticky embeds are already tappable/keyboard-playable without pose.
      setStatus(
        `Camera optional — ${detail}. Tap the game or use keys / Space to play anyway.`,
        "error",
      );
      if (btnStart) btnStart.disabled = false;
      // Still allow Stop so a mid-play tap-game can be paused from chrome.
      if (btnStop) btnStop.disabled = false;
    }
  }

  /**
   * Halt camera + pose, release injected keys, and tell the embed to pause/stop.
   * Always re-enables Start. Safe to call when camera never started (still pauses game).
   */
  function stop() {
    const wasRunning = running;
    running = false;

    try {
      tracker?.close?.();
    } catch {
      /* ignore */
    }
    tracker = null;
    signals = null;

    const released = mapper?.releaseAll?.() ?? [];
    const profileId = mapper?.profile?.id || defaultProfile;
    mapper = null;

    const b = ensureBridge();
    if (released.length) b.release(released, { profile: profileId, card: cardId || undefined });
    // Key-bridge releases any residual held keys; embeds freeze on stop/pause.
    b.control("stop", { profile: profileId, card: cardId || undefined });

    const stream = video?.srcObject;
    stopCamera(stream);
    if (video) video.srcObject = null;

    if (overlay) {
      try {
        const ctx = overlay.getContext("2d");
        ctx?.clearRect(0, 0, overlay.width || 0, overlay.height || 0);
      } catch {
        /* ignore */
      }
    }

    if (btnStart) btnStart.disabled = false;
    if (btnStop) btnStop.disabled = true;
    setStatus(
      wasRunning
        ? "Stopped. Press Start to play with your body again."
        : "Game paused. Press Start for body controls, or tap the game to continue.",
    );
  }

  stopPlaySession = stop;

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
    if (running) {
      try {
        ensureBridge().release(mapper?.releaseAll() ?? [], { profile: mapper?.profile?.id });
        ensureBridge().control("stop", { profile: mapper?.profile?.id, card: cardId || undefined });
      } catch {
        /* ignore */
      }
    }
  });

  renderCounts();
  setStatus("Game ready — tap / keys work now. Start enables optional camera controls.");
  // Stop can pause the embed even before camera Start.
  if (btnStop) btnStop.disabled = false;

  wireHomeLinks();

  // Camera enhances controls when available; never gate the embed on it.
  if (catalog && params.get("autostart") !== "0") {
    setTimeout(() => {
      if (!running) start();
    }, 250);
  }
} else if (playMode && !catalog && !library) {
  // play.html without ?card= — still show shell with default embed
  showPlayShell();
  requestAnimationFrame(chromeLoop);
  wireHomeLinks();
}
