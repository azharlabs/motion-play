/** Squat Island / Balance Bridge — squat & lean platformer. MotionPlay original. */
(() => {
  const { qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest, burst, stepParticles, drawParticles, latestPose, installPoseListener, bindParentStop, fillSky, drawStars, drawGlow, drawCoin, drawHero, drawHills, roundRect } = MPMini;
  installPoseListener();
  const cfg = readConfig();
  const skin = cfg.skin || "squat";
  const title = cfg.title || (skin === "balance" ? "Balance Bridge" : "Jump Island");
  const accent = cfg.accent || (skin === "balance" ? "#0f9b8e" : "#a855f7");
  const canvas = qs("game"); const ctx = canvas.getContext("2d"); const hud = createHud();
  const KEY = "motionplay.squat-island.best." + skin;
  let BEST = loadBest(KEY);
  const state = { mode: "ready", x: 0.2, y: 0, vy: 0, onGround: true, score: 0, hits: 0, spawn: 0.9, plats: [], particles: [], last: 0, squatPulse: false, wasSquat: false, lean: 0 };
  bindParentStop(state, hud);

  function start() {
    Object.assign(state, { mode: "play", x: 0.2, y: 0, vy: 0, onGround: true, score: 0, hits: 0, spawn: 0.5, plats: [{ x: 0.15, w: 0.28, y: 0 }], particles: [], squatPulse: false, wasSquat: false, lean: 0 });
    setOverlay(hud, false); hud.status.textContent = skin === "balance" ? "Lean to balance · jump gaps" : "Squat to charge · jump islands";
  }
  function over() {
    state.mode = "over"; BEST = Math.max(BEST, Math.floor(state.score)); saveBest(KEY, BEST); hud.best.textContent = String(BEST);
    setOverlay(hud, true, "Fell!", `Score ${Math.floor(state.score)} · Tap / Space to retry`);
  }
  function jump() {
    if (!state.onGround) return;
    state.vy = skin === "balance" ? 0.95 : 1.15;
    state.onGround = false;
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      if (state.mode === "ready" || state.mode === "over") start();
      else if (state.mode === "pause") { state.mode = "play"; setOverlay(hud, false); }
      else jump();
    }
    if (e.key === "ArrowUp" || e.key === "w") jump();
    if (e.key === "ArrowDown" || e.key === "s") { if (!state.wasSquat) { state.squatPulse = true; } state.wasSquat = true; }
    if (e.key === "ArrowLeft" || e.key === "a") state.lean = -1;
    if (e.key === "ArrowRight" || e.key === "d") state.lean = 1;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowDown" || e.key === "s") { state.wasSquat = false; if (state.squatPulse) { state.squatPulse = false; jump(); } }
    if (["ArrowLeft","a","ArrowRight","d"].includes(e.key)) state.lean = 0;
  });
  hud.overlay.addEventListener("click", () => { if (state.mode === "ready" || state.mode === "over") start(); else if (state.mode === "pause") { state.mode = "play"; setOverlay(hud, false); } else jump(); });

  function update(dt) {
    if (state.mode !== "play") return;
    const pose = latestPose();
    if (pose) {
      if (pose.lean != null) state.lean = pose.lean > 0.3 ? 1 : pose.lean < -0.3 ? -1 : state.lean * 0.9;
      const duck = pose.ducking || (pose.crouch ?? 0) > 0.55;
      if (duck && !state.wasSquat) state.squatPulse = true;
      if (!duck && state.wasSquat && state.squatPulse) { state.squatPulse = false; jump(); }
      state.wasSquat = duck;
      if (pose.jump) jump();
    }
    const scroll = (0.22 + Math.min(0.25, state.score / 600)) * dt;
    state.score += 10 * dt;
    for (const p of state.plats) p.x -= scroll;
    state.spawn -= dt;
    if (state.spawn <= 0) {
      const last = state.plats[state.plats.length - 1];
      const gap = 0.12 + Math.random() * 0.12;
      const w = 0.18 + Math.random() * 0.16;
      state.plats.push({ x: (last ? last.x + last.w + gap : 1.1), w, y: (Math.random() - 0.5) * 0.08 });
      state.spawn = 0.2;
    }
    state.plats = state.plats.filter((p) => p.x + p.w > -0.05);
    state.x += state.lean * 0.35 * dt;
    state.x = Math.max(0.08, Math.min(0.45, state.x));
    state.vy -= 2.6 * dt;
    state.y += state.vy * dt;
    state.onGround = false;
    for (const p of state.plats) {
      if (state.x > p.x && state.x < p.x + p.w && state.y <= p.y + 0.02 && state.y >= p.y - 0.08 && state.vy <= 0) {
        state.y = p.y; state.vy = 0; state.onGround = true;
      }
    }
    if (state.y < -0.55) {
      state.hits += 1; state.y = 0; state.vy = 0; state.x = 0.2;
      state.plats = [{ x: 0.1, w: 0.3, y: 0 }];
      burst(state.particles, canvas.clientWidth * 0.3, canvas.clientHeight * 0.7, "#ef4444", 14);
      if (state.hits >= 3) over();
    }
    state.particles = stepParticles(state.particles, dt);
    hud.score.textContent = String(Math.floor(state.score));
  }


  function draw(w, h) {
    const t = performance.now();
    if (skin === "balance") fillSky(ctx, w, h, "#042f2e", "#0f766e", "#0f172a");
    else fillSky(ctx, w, h, "#2e1065", "#6d28d9", "#0f172a");
    drawStars(ctx, w, h, 26, skin === "balance" ? 4 : 8, t);
    drawHills(ctx, w, h, h * 0.55, skin === "balance" ? "rgba(19,78,74,0.7)" : "rgba(76,29,149,0.55)", 0.7, state.score * 0.01);
    // water / void
    const water = ctx.createLinearGradient(0, h * 0.72, 0, h);
    water.addColorStop(0, skin === "balance" ? "rgba(34,211,238,0.35)" : "rgba(129,140,248,0.3)");
    water.addColorStop(1, "rgba(15,23,42,0.95)");
    ctx.fillStyle = water; ctx.fillRect(0, h * 0.72, w, h * 0.28);
    // shimmer
    ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const y = h * 0.76 + i * 10 + Math.sin(t * 0.004 + i) * 3;
      ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(w - 20, y + 2); ctx.stroke();
    }
    const groundY = h * 0.72;
    for (const plat of state.plats) {
      const x = plat.x * w, yy = groundY - plat.y * h, ww = plat.w * w;
      drawGlow(ctx, x + ww / 2, yy + 8, ww * 0.6, accent, 0.25);
      const g = ctx.createLinearGradient(x, yy, x, yy + 22);
      g.addColorStop(0, "#fff7ed"); g.addColorStop(0.35, accent); g.addColorStop(1, "#0f172a");
      ctx.fillStyle = g; roundRect(ctx, x, yy, ww, 18, 8); ctx.fill();
      // grass tuft
      ctx.fillStyle = skin === "balance" ? "#5eead4" : "#c4b5fd";
      ctx.fillRect(x + 6, yy - 6, 4, 8); ctx.fillRect(x + ww * 0.5, yy - 8, 4, 10); ctx.fillRect(x + ww - 12, yy - 5, 4, 7);
    }
    const px = state.x * w, py = groundY - state.y * h - 36;
    drawHero(ctx, px, py + 36, 1, "#f97316", { bodyH: 36, bodyW: 32, squash: state.onGround ? 1 : 0.92 });
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
  setOverlay(hud, true, title, (skin === "balance" ? "Lean to stay on the bridge and jump gaps." : "Squat then stand to jump islands. Lean to shift.") + " Tap or Space to start.");
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__squatIsland = { state, start };
})();
