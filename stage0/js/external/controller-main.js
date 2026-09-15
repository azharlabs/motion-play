import { startCamera } from "../camera.js";
import { createPoseTracker } from "../pose.js";
import { MotionSignals, leadHands } from "../signals.js";
import { ExternalMotionMapper } from "./motion-mapper.js";
import { ExternalGameBridge } from "./bridge.js";
import { CONTROL_PROFILES } from "./profiles.js";
import { EMBED_CATALOG, catalogEntry, embedUrl, CATALOG_CARD_IDS } from "./catalog.js";
import { gameById } from "../games/registry.js";

const el = (id) => document.getElementById(id);
const library = el("library");
const playShell = el("play-shell");
const titleGrid = el("title-grid");
const video = el("video");
const overlay = el("overlay");
const status = el("status");
const counts = el("counts");
const profileSelect = el("profile");
const btnStart = el("start");
const btnStop = el("stop");
const gameFrame = el("game-frame");
const titleEl = el("game-title");

const params = new URLSearchParams(location.search);
const cardId = params.get("card") || params.get("game") || "";
const catalog = cardId ? catalogEntry(cardId) : null;

function showLibrary() {
  if (library) library.hidden = false;
  if (playShell) playShell.hidden = true;
  document.title = "MotionPlay — Play";
  document.body.style.background = "";
}

function showPlayShell() {
  if (library) library.hidden = true;
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
    btn.addEventListener("click", () => {
      // Stay on the controller shell; deep-linkable via ?card=
      const url = new URL(location.href);
      url.searchParams.set("card", id);
      location.assign(url.pathname + "?" + url.searchParams.toString() + url.hash);
    });
    li.append(btn);
    titleGrid.append(li);
  }
}

/* ---- library-only page path (no play chrome on this document) ---- */
if (titleGrid && !catalog) {
  paintLibrary();
  showLibrary();
}

/* ---- play session ---- */
const playMode = Boolean(playShell && (catalog || !library));

if (playMode) {
  showPlayShell();

  const defaultProfile = catalog?.profile || params.get("profile") || "runner";
  const signalMode = catalog?.needs === "upper" ? "upper" : "full";

  if (profileSelect) {
    for (const profile of Object.values(CONTROL_PROFILES)) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.label;
      profileSelect.append(option);
    }
    profileSelect.value = defaultProfile in CONTROL_PROFILES ? defaultProfile : "runner";
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
      mapper = new ExternalMotionMapper(profileSelect?.value || defaultProfile);
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
  profileSelect?.addEventListener("change", () => {
    if (!running) return;
    ensureBridge().release(mapper?.releaseAll() ?? [], { profile: mapper?.profile?.id });
    mapper = new ExternalMotionMapper(profileSelect.value);
    renderCounts();
  });

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
}
