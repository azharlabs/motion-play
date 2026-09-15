/** Reach Pop — reach to pop targets. MotionPlay original. Skins via ?skin=. */
(() => {
  const { qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest, burst, stepParticles, drawParticles, latestPose, installPoseListener } = MPMini;
  installPoseListener();
  const cfg = readConfig();
  const skin = cfg.skin || "balloons";
  const skins = {
    balloons: { title: "Balloon Pop Adventure", accent: "#ec4899", emoji: "🎈", hint: "Reach to pop balloons" },
    goal: { title: "Goalkeeper Hero", accent: "#6366f1", emoji: "⚽", hint: "Reach to save the shots" },
    treasure: { title: "Treasure Catch", accent: "#38bdf8", emoji: "💎", hint: "Reach / kick to catch treasure" },
    climb: { title: "Adventure Climber", accent: "#60a5fa", emoji: "🧗", hint: "Reach and raise to climb" },
  };
  const S = skins[skin] || skins.balloons;
  const title = cfg.title || S.title;
  const accent = cfg.accent || S.accent;
  const canvas = qs("game"); const ctx = canvas.getContext("2d"); const hud = createHud();
  const KEY = "motionplay.reach-pop.best." + skin;
  let BEST = loadBest(KEY);
  const state = { mode: "ready", score: 0, misses: 0, spawn: 0.5, targets: [], particles: [], last: 0, hands: [{x:0.35,y:0.6},{x:0.65,y:0.6}] };

  function start() {
    Object.assign(state, { mode: "play", score: 0, misses: 0, spawn: 0.4, targets: [], particles: [] });
    setOverlay(hud, false); hud.status.textContent = S.hint;
  }
  function over() {
    state.mode = "over"; BEST = Math.max(BEST, state.score); saveBest(KEY, BEST); hud.best.textContent = String(BEST);
    setOverlay(hud, true, "Nice try!", `Score ${state.score} · Tap / Space to retry`);
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { if (state.mode === "ready" || state.mode === "over") start(); }
    const h = state.hands[0];
    if (e.key === "ArrowLeft") h.x = Math.max(0.05, h.x - 0.07);
    if (e.key === "ArrowRight") h.x = Math.min(0.95, h.x + 0.07);
    if (e.key === "ArrowUp") h.y = Math.max(0.05, h.y - 0.07);
    if (e.key === "ArrowDown") h.y = Math.min(0.95, h.y + 0.07);
  });
  hud.overlay.addEventListener("click", () => { if (state.mode === "ready" || state.mode === "over") start(); });

  function update(dt) {
    if (state.mode !== "play") return;
    const pose = latestPose();
    if (pose?.hands) {
      const L = pose.hands.left, R = pose.hands.right;
      if (L?.visible && L.x != null) state.hands[0] = { x: L.x, y: L.y };
      if (R?.visible && R.x != null) state.hands[1] = { x: R.x, y: R.y };
    }
    state.spawn -= dt;
    if (state.spawn <= 0) {
      state.targets.push({
        x: 0.12 + Math.random() * 0.76, y: skin === "goal" ? -0.1 : 1.05,
        vy: skin === "goal" ? 0.35 + Math.random() * 0.25 : -(0.18 + Math.random() * 0.2),
        vx: (Math.random() - 0.5) * 0.2, r: 0.055, life: 4, hit: false,
      });
      state.spawn = Math.max(0.35, 0.85 - state.score * 0.01);
    }
    for (const t of state.targets) {
      t.x += t.vx * dt; t.y += t.vy * dt; t.life -= dt;
      for (const h of state.hands) {
        if (!t.hit && Math.hypot(t.x - h.x, t.y - h.y) < t.r + 0.05) {
          t.hit = true; state.score += 1;
          burst(state.particles, canvas.clientWidth * t.x, canvas.clientHeight * t.y, accent, 14);
        }
      }
      if (!t.hit && (t.life <= 0 || t.y < -0.15 || t.y > 1.2)) { t.hit = true; state.misses += 1; }
    }
    state.targets = state.targets.filter((t) => !t.hit);
    if (state.misses >= 5) over();
    state.particles = stepParticles(state.particles, dt);
    hud.score.textContent = String(state.score);
  }

  function draw(w, h) {
    ctx.fillStyle = skin === "goal" ? "#14532d" : skin === "treasure" ? "#0c4a6e" : "#4a044e";
    ctx.fillRect(0, 0, w, h);
    if (skin === "goal") {
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 6;
      ctx.strokeRect(w * 0.15, h * 0.08, w * 0.7, h * 0.35);
    }
    for (const t of state.targets) {
      const x = t.x * w, y = t.y * h, r = t.r * Math.min(w, h);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
      ctx.font = `${Math.max(16, r)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(S.emoji, x, y);
    }
    state.hands.forEach((hand, i) => {
      ctx.beginPath(); ctx.arc(hand.x * w, hand.y * h, 16, 0, Math.PI * 2);
      ctx.strokeStyle = i ? "#fb923c" : "#38bdf8"; ctx.lineWidth = 3; ctx.stroke();
    });
    drawParticles(ctx, state.particles);
    ctx.fillStyle = "#e2e8f0"; ctx.font = "700 16px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("Miss " + state.misses + "/5", 14, 28);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.last) state.last = now;
    const dt = Math.min(0.05, (now - state.last) / 1000); state.last = now;
    update(dt); const { w, h } = resizeCanvas(canvas, ctx); draw(w, h);
  }
  hud.best.textContent = String(BEST);
  qs("overlay-title").textContent = title; document.title = "MotionPlay — " + title;
  setOverlay(hud, true, title, S.hint + ". Tap or Space to start.");
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__reachPop = { state, start };
})();
