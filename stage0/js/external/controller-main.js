import { startCamera } from "../camera.js";
import { createPoseTracker } from "../pose.js";
import { MotionSignals, leadHands } from "../signals.js";
import { ExternalMotionMapper } from "./motion-mapper.js";
import { ExternalGameBridge } from "./bridge.js";
import { CONTROL_PROFILES } from "./profiles.js";

const el = (id) => document.getElementById(id);
const video = el("video");
const overlay = el("overlay");
const status = el("status");
const counts = el("counts");
const profileSelect = el("profile");
const btnStart = el("start");
const btnStop = el("stop");
const gameFrame = el("game-frame");

for (const profile of Object.values(CONTROL_PROFILES)) {
  const option = document.createElement("option");
  option.value = profile.id;
  option.textContent = profile.label;
  profileSelect.append(option);
}
profileSelect.value = "runner";

let tracker = null;
let signals = null;
let mapper = null;
let bridge = null;
let running = false;
let lastSignal = { inFrame: false, hands: { left: {}, right: {} } };
let lastSignalAt = 0;

function controlTargets() {
  const targets = [window];
  try {
    if (gameFrame?.contentWindow) targets.push(gameFrame.contentWindow);
  } catch {
    // Cross-origin would throw; same-origin lane runner should not.
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
  status.textContent = text;
  status.dataset.mode = mode;
}

async function start() {
  if (running) return;
  btnStart.disabled = true;
  setStatus("Starting camera and pose tracking…");
  try {
    await startCamera(video);
    tracker = await createPoseTracker();
    signals = new MotionSignals({ mode: "full" });
    signals.startCalibration(performance.now());
    mapper = new ExternalMotionMapper(profileSelect.value);
    ensureBridge();
    running = true;
    btnStop.disabled = false;
    setStatus("Calibrating. Stand back with your full body in frame.", "calibrating");
    requestAnimationFrame(loop);
  } catch (error) {
    setStatus(`Could not start: ${error?.message ?? error}`, "error");
    btnStart.disabled = false;
  }
}

function stop() {
  if (!running) return;
  running = false;
  ensureBridge().release(mapper?.releaseAll() ?? [], { profile: mapper?.profile?.id });
  const stream = video.srcObject;
  if (stream?.getTracks) for (const track of stream.getTracks()) track.stop();
  video.srcObject = null;
  tracker = null;
  signals = null;
  mapper = null;
  btnStart.disabled = false;
  btnStop.disabled = true;
  setStatus("Stopped. Press Start to play the lane runner with your body again.");
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
    setStatus(s.inFrame ? "Hold still while MotionPlay calibrates…" : "Step back until your full body is visible.", "calibrating");
    return;
  }

  setStatus(
    s.inFrame
      ? `Live: ${mapper.profile.label}. Lean · jump · duck drives the runner.`
      : "Tracking paused. Come back into frame.",
    s.inFrame ? "live" : "paused",
  );

  const update = mapper.update(s);
  ensureBridge().send(update.events, { profile: mapper.profile.id });
  renderCounts(update.actions);

  const ctx = overlay.getContext("2d");
  const w = (overlay.width = video.videoWidth || 640);
  const h = (overlay.height = video.videoHeight || 480);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(20,30,45,.65)";
  ctx.fillRect(12, 12, Math.min(360, w - 24), 46);
  ctx.fillStyle = "white";
  ctx.font = "20px system-ui";
  ctx.fillText(mapper.profile.description, 22, 42, Math.min(330, w - 44));
}

btnStart.addEventListener("click", start);
btnStop.addEventListener("click", stop);
profileSelect.addEventListener("change", () => {
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
