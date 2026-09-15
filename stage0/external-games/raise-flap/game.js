/** Raise Flap — raise/lower arms to fly. MotionPlay original. */
(() => {
  const { qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest, burst, stepParticles, drawParticles, latestPose, installPoseListener, bindParentStop, fillSky, drawStars, drawGlow, drawCoin, drawHero, drawHills, roundRect } = MPMini;
  installPoseListener();
  const cfg = readConfig();
  const title = cfg.title || "Space Defender";
  const accent = cfg.accent || "#14b8a6";
  const canvas = qs("game"); const ctx = canvas.getContext("2d"); const hud = createHud();
  const KEY = "motionplay.raise-flap.best";
  let BEST = loadBest(KEY);
  const state = { mode: "ready", y: 0.5, score: 0, hits: 0, spawn: 0.7, things: [], particles: [], last: 0, raise: 0.5 };
  bindParentStop(state, hud);

  function start() {
    Object.assign(state, { mode: "play", y: 0.5, score: 0, hits: 0, spawn: 0.6, things: [], particles: [], raise: 0.5 });
    setOverlay(hud, false); hud.status.textContent = "Raise arms to go up · lower to go down";
  }
  function over() {
    state.mode = "over"; BEST = Math.max(BEST, Math.floor(state.score)); saveBest(KEY, BEST); hud.best.textContent = String(BEST);
    setOverlay(hud, true, "Flight over!", `Score ${Math.floor(state.score)} · Tap / Space to retry`);
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { if (state.mode === "ready" || state.mode === "over") start(); else if (state.mode === "pause") { state.mode = "play"; setOverlay(hud, false); } }
    if (e.key === "ArrowUp" || e.key === "w") state.raise = Math.min(1, state.raise + 0.08);
    if (e.key === "ArrowDown" || e.key === "s") state.raise = Math.max(0, state.raise - 0.08);
  });
  hud.overlay.addEventListener("click", () => { if (state.mode === "ready" || state.mode === "over") start(); else if (state.mode === "pause") { state.mode = "play"; setOverlay(hud, false); } });

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
    const t = performance.now();
    fillSky(ctx, w, h, "#042f2e", "#115e59", "#0f172a");
    drawStars(ctx, w, h, 48, 11, t);
    // nebula
    drawGlow(ctx, w * 0.7, h * 0.25, w * 0.35, "rgba(20,184,166,0.25)", 0.5);
    drawGlow(ctx, w * 0.2, h * 0.55, w * 0.25, "rgba(56,189,248,0.18)", 0.45);
    for (const th of state.things) {
      const x = th.x * w, gapTop = (th.gapY - th.gap / 2) * h, gapBot = (th.gapY + th.gap / 2) * h;
      const pillar = ctx.createLinearGradient(x, 0, x + 54, 0);
      pillar.addColorStop(0, "#1e293b"); pillar.addColorStop(0.5, "#475569"); pillar.addColorStop(1, "#1e293b");
      ctx.fillStyle = pillar;
      roundRect(ctx, x, 0, 54, gapTop, 8); ctx.fill();
      roundRect(ctx, x, gapBot, 54, h - gapBot, 8); ctx.fill();
      drawGlow(ctx, x + 27, gapTop, 40, "rgba(20,184,166,0.35)");
      ctx.fillStyle = accent; ctx.fillRect(x, gapTop - 8, 54, 8); ctx.fillRect(x, gapBot, 54, 8);
      // rivets
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 12 + i * 15, gapTop - 4, 2, 0, Math.PI * 2); ctx.fill(); }
    }
    const px = w * 0.22, py = state.y * h;
    const flap = Math.sin(t * 0.012) * 10;
    drawGlow(ctx, px, py, 48, "rgba(20,184,166,0.4)");
    // ship
    ctx.fillStyle = accent; roundRect(ctx, px - 24, py - 14, 48, 28, 12); ctx.fill();
    ctx.fillStyle = "#99f6e4"; ctx.beginPath(); ctx.arc(px + 12, py - 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(153,246,228,0.7)";
    ctx.beginPath(); ctx.moveTo(px - 24, py); ctx.lineTo(px - 40, py - 8 - flap); ctx.lineTo(px - 40, py + 8 + flap); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px - 10, py + 10); ctx.lineTo(px - 28, py + 22 + flap * 0.5); ctx.lineTo(px + 6, py + 14); ctx.closePath(); ctx.fill();
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
