/** Hold Pose — hold still / match cue. MotionPlay original. */
(() => {
  const { qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest, burst, stepParticles, drawParticles, latestPose, installPoseListener, roundRect } = MPMini;
  installPoseListener();
  const cfg = readConfig();
  const skin = cfg.skin || "dance";
  const title = cfg.title || (skin === "simon" ? "Simon Says Motion" : "Dance Copycat");
  const accent = cfg.accent || (skin === "simon" ? "#ef4444" : "#eab308");
  const canvas = qs("game"); const ctx = canvas.getContext("2d"); const hud = createHud();
  const KEY = "motionplay.hold-pose.best." + skin;
  let BEST = loadBest(KEY);
  const poses = [
    { id: "T", label: "Arms out", check: (p) => armsOut(p) },
    { id: "UP", label: "Arms up", check: (p) => armsUp(p) },
    { id: "LEAN_L", label: "Lean left", check: (p) => (p.lean ?? 0) < -0.35 },
    { id: "LEAN_R", label: "Lean right", check: (p) => (p.lean ?? 0) > 0.35 },
    { id: "STILL", label: "Freeze!", check: (p) => Math.abs(p.lean ?? 0) < 0.2 && !moving(p) },
  ];
  const state = { mode: "ready", score: 0, misses: 0, target: null, hold: 0, need: 0.85, phase: "move", timer: 0, particles: [], last: 0, green: true };

  function armsOut(p) {
    const L = p.hands?.left, R = p.hands?.right;
    return L?.visible && R?.visible && L.y < 0.65 && R.y < 0.65 && L.x < 0.4 && R.x > 0.6;
  }
  function armsUp(p) {
    const L = p.hands?.left, R = p.hands?.right;
    return L?.visible && R?.visible && L.y < 0.35 && R.y < 0.35;
  }
  function moving(p) {
    return Math.abs(p.lean ?? 0) > 0.25 || p.jump || p.ducking;
  }

  function start() {
    Object.assign(state, { mode: "play", score: 0, misses: 0, hold: 0, phase: "show", timer: 0.4, particles: [], green: true });
    pick(); setOverlay(hud, false); hud.status.textContent = "Hold the pose";
  }
  function over() {
    state.mode = "over"; BEST = Math.max(BEST, state.score); saveBest(KEY, BEST); hud.best.textContent = String(BEST);
    setOverlay(hud, true, "Round over!", `Score ${state.score} · Tap / Space to retry`);
  }
  function pick() {
    if (skin === "simon") {
      state.green = Math.random() > 0.4;
      state.target = state.green ? poses[Math.floor(Math.random() * 4)] : poses[4];
    } else {
      state.green = true;
      state.target = poses[Math.floor(Math.random() * 4)];
    }
    state.hold = 0; state.timer = 3.2; state.phase = "hold";
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { if (state.mode === "ready" || state.mode === "over") start(); }
  });
  hud.overlay.addEventListener("click", () => { if (state.mode === "ready" || state.mode === "over") start(); });

  // Keyboard simulate pose holds via arrow keys held
  const held = new Set();
  window.addEventListener("keydown", (e) => held.add(e.key));
  window.addEventListener("keyup", (e) => held.delete(e.key));

  function syntheticPose() {
    const pose = latestPose() || { lean: 0, hands: {} };
    if (!latestPose()) {
      // keyboard fallback
      const fake = { lean: 0, hands: { left: { visible: true, x: 0.45, y: 0.55 }, right: { visible: true, x: 0.55, y: 0.55 } }, jump: false, ducking: false };
      if (held.has("ArrowLeft")) fake.lean = -0.6;
      if (held.has("ArrowRight")) fake.lean = 0.6;
      if (held.has("ArrowUp")) { fake.hands.left.y = 0.2; fake.hands.right.y = 0.2; fake.hands.left.x = 0.35; fake.hands.right.x = 0.65; }
      if (held.has("ArrowDown")) { fake.hands.left.x = 0.25; fake.hands.right.x = 0.75; fake.hands.left.y = 0.5; fake.hands.right.y = 0.5; }
      return fake;
    }
    return pose;
  }

  function update(dt) {
    if (state.mode !== "play") return;
    const pose = syntheticPose();
    state.timer -= dt;
    if (state.phase === "hold" && state.target) {
      const ok = state.target.check(pose);
      // Simon red = must freeze (STILL). Green = must match.
      if (ok) {
        state.hold += dt;
        if (state.hold >= state.need) {
          state.score += 1;
          burst(state.particles, canvas.clientWidth * 0.5, canvas.clientHeight * 0.45, accent, 16);
          state.phase = "gap"; state.timer = 0.45; state.target = null;
        }
      } else {
        state.hold = Math.max(0, state.hold - dt * 0.6);
      }
      if (state.timer <= 0) {
        state.misses += 1; state.phase = "gap"; state.timer = 0.4; state.target = null;
        if (state.misses >= 4) over();
      }
    } else if (state.phase === "gap" && state.timer <= 0) {
      pick();
    }
    state.particles = stepParticles(state.particles, dt);
    hud.score.textContent = String(state.score);
  }

  function draw(w, h) {
    ctx.fillStyle = state.green ? "#1e293b" : "#450a0a"; ctx.fillRect(0, 0, w, h);
    roundRect(ctx, w * 0.15, h * 0.22, w * 0.7, h * 0.4, 24);
    ctx.fillStyle = state.green ? "#334155" : "#7f1d1d"; ctx.fill();
    ctx.fillStyle = "#f8fafc"; ctx.font = "bold 28px system-ui"; ctx.textAlign = "center";
    ctx.fillText(state.target ? state.target.label : "…", w * 0.5, h * 0.42);
    ctx.font = "16px system-ui"; ctx.fillStyle = accent;
    ctx.fillText(skin === "simon" ? (state.green ? "MOVE" : "FREEZE") : "HOLD", w * 0.5, h * 0.52);
    // progress
    const pw = w * 0.5, ph = 14;
    ctx.fillStyle = "#0f172a"; roundRect(ctx, w * 0.25, h * 0.7, pw, ph, 8); ctx.fill();
    ctx.fillStyle = accent; roundRect(ctx, w * 0.25, h * 0.7, pw * Math.min(1, state.hold / state.need), ph, 8); ctx.fill();
    drawParticles(ctx, state.particles);
    ctx.fillStyle = "#e2e8f0"; ctx.font = "700 16px system-ui"; ctx.textAlign = "left";
    ctx.fillText("Miss " + state.misses + "/4", 14, 28);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.last) state.last = now;
    const dt = Math.min(0.05, (now - state.last) / 1000); state.last = now;
    update(dt); const { w, h } = resizeCanvas(canvas, ctx); draw(w, h);
  }
  hud.best.textContent = String(BEST);
  qs("overlay-title").textContent = title; document.title = "MotionPlay — " + title;
  setOverlay(hud, true, title, "Copy the pose and hold it (arrow keys work for testing). Tap or Space to start.");
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__holdPose = { state, start };
})();
