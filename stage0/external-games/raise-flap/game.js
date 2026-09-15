/** Raise Flap — raise/lower arms to fly. MotionPlay original. */
(() => {
  const { qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest, burst, stepParticles, drawParticles, latestPose, installPoseListener, roundRect } = MPMini;
  installPoseListener();
  const cfg = readConfig();
  const title = cfg.title || "Space Defender";
  const accent = cfg.accent || "#14b8a6";
  const canvas = qs("game"); const ctx = canvas.getContext("2d"); const hud = createHud();
  const KEY = "motionplay.raise-flap.best";
  let BEST = loadBest(KEY);
  const state = { mode: "ready", y: 0.5, score: 0, hits: 0, spawn: 0.7, things: [], particles: [], last: 0, raise: 0.5 };

  function start() {
    Object.assign(state, { mode: "play", y: 0.5, score: 0, hits: 0, spawn: 0.6, things: [], particles: [], raise: 0.5 });
    setOverlay(hud, false); hud.status.textContent = "Raise arms to go up · lower to go down";
  }
  function over() {
    state.mode = "over"; BEST = Math.max(BEST, Math.floor(state.score)); saveBest(KEY, BEST); hud.best.textContent = String(BEST);
    setOverlay(hud, true, "Flight over!", `Score ${Math.floor(state.score)} · Tap / Space to retry`);
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { if (state.mode === "ready" || state.mode === "over") start(); }
    if (e.key === "ArrowUp" || e.key === "w") state.raise = Math.min(1, state.raise + 0.08);
    if (e.key === "ArrowDown" || e.key === "s") state.raise = Math.max(0, state.raise - 0.08);
  });
  hud.overlay.addEventListener("click", () => { if (state.mode === "ready" || state.mode === "over") start(); });

  function update(dt) {
    if (state.mode !== "play") return;
    const pose = latestPose();
    if (pose?.hands) {
      const hs = [pose.hands.left, pose.hands.right].filter((h) => h?.visible && h.y != null);
      if (hs.length) {
        const avgY = hs.reduce((s, h) => s + h.y, 0) / hs.length;
        state.raise = Math.max(0, Math.min(1, 1 - avgY)); // high hands -> high raise
      }
    }
    if (pose && pose.raise != null) state.raise = pose.raise;
    state.y += ((1 - state.raise) - state.y) * Math.min(1, dt * 4);
    state.score += 12 * dt;
    state.spawn -= dt;
    if (state.spawn <= 0) {
      const gap = 0.28 + Math.random() * 0.15;
      const mid = 0.2 + Math.random() * 0.6;
      state.things.push({ x: 1.1, gapY: mid, gap, passed: false });
      state.spawn = Math.max(0.9, 1.6 - state.score * 0.002);
    }
    for (const t of state.things) {
      t.x -= (0.35 + Math.min(0.35, state.score / 800)) * dt;
      if (!t.passed && t.x < 0.22) {
        t.passed = true;
        if (state.y < t.gapY - t.gap / 2 || state.y > t.gapY + t.gap / 2) {
          state.hits += 1;
          burst(state.particles, canvas.clientWidth * 0.22, canvas.clientHeight * state.y, "#ef4444", 12);
          if (state.hits >= 3) { over(); return; }
        } else {
          state.score += 25;
          burst(state.particles, canvas.clientWidth * 0.22, canvas.clientHeight * state.y, accent, 8);
        }
      }
    }
    state.things = state.things.filter((t) => t.x > -0.1);
    state.particles = stepParticles(state.particles, dt);
    hud.score.textContent = String(Math.floor(state.score));
  }

  function draw(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#042f2e"); g.addColorStop(1, "#0f172a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // stars
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % w, (i * 53) % h, 2, 2);
    for (const t of state.things) {
      const x = t.x * w, gapTop = (t.gapY - t.gap / 2) * h, gapBot = (t.gapY + t.gap / 2) * h;
      ctx.fillStyle = "#334155";
      roundRect(ctx, x, 0, 54, gapTop, 8); ctx.fill();
      roundRect(ctx, x, gapBot, 54, h - gapBot, 8); ctx.fill();
      ctx.fillStyle = accent; ctx.fillRect(x, gapTop - 6, 54, 6); ctx.fillRect(x, gapBot, 54, 6);
    }
    const px = w * 0.22, py = state.y * h;
    ctx.fillStyle = accent; roundRect(ctx, px - 22, py - 14, 44, 28, 12); ctx.fill();
    ctx.fillStyle = "#99f6e4"; ctx.beginPath(); ctx.arc(px + 10, py - 2, 5, 0, Math.PI * 2); ctx.fill();
    drawParticles(ctx, state.particles);
    ctx.fillStyle = "#e2e8f0"; ctx.font = "700 16px system-ui"; ctx.textAlign = "left";
    const lives = Math.max(0, 3 - state.hits);
    ctx.fillText("♥".repeat(lives) + "♡".repeat(3 - lives), 14, 28);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.last) state.last = now;
    const dt = Math.min(0.05, (now - state.last) / 1000); state.last = now;
    update(dt); const { w, h } = resizeCanvas(canvas, ctx); draw(w, h);
  }
  hud.best.textContent = String(BEST);
  qs("overlay-title").textContent = title; document.title = "MotionPlay — " + title;
  setOverlay(hud, true, title, "Raise both arms to fly up, lower them to drop. Tap or Space to start.");
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__raiseFlap = { state, start };
})();
