/** Fruit Slice — swipe/reach to slice. MotionPlay original. */
(() => {
  const { qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest, burst, stepParticles, drawParticles, latestPose, installPoseListener, bindParentStop, fillSky, drawStars, drawGlow, drawCoin, drawHero, drawHills } = MPMini;
  installPoseListener();
  const cfg = readConfig();
  const title = cfg.title || "Fruit Slice";
  const accent = cfg.accent || "#22c55e";
  const canvas = qs("game"); const ctx = canvas.getContext("2d"); const hud = createHud();
  const KEY = "motionplay.fruit-swipe.best." + (cfg.skin || "default");
  let BEST = loadBest(KEY);
  const state = { mode: "ready", score: 0, misses: 0, spawn: 0.6, fruits: [], particles: [], last: 0, cursor: { x: 0.5, y: 0.5 }, prev: null };
  bindParentStop(state, hud);

  function start() {
    Object.assign(state, { mode: "play", score: 0, misses: 0, spawn: 0.5, fruits: [], particles: [], prev: null });
    setOverlay(hud, false); hud.status.textContent = "Swipe / reach through fruit";
  }
  function over() {
    state.mode = "over"; BEST = Math.max(BEST, state.score); saveBest(KEY, BEST); hud.best.textContent = String(BEST);
    setOverlay(hud, true, "Round over!", `Score ${state.score} · Tap / Space to retry`);
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { if (state.mode === "ready" || state.mode === "over") start(); else if (state.mode === "pause") { state.mode = "play"; setOverlay(hud, false); } }
    if (e.key === "ArrowLeft") state.cursor.x = Math.max(0.05, state.cursor.x - 0.08);
    if (e.key === "ArrowRight") state.cursor.x = Math.min(0.95, state.cursor.x + 0.08);
    if (e.key === "ArrowUp") state.cursor.y = Math.max(0.05, state.cursor.y - 0.08);
    if (e.key === "ArrowDown") state.cursor.y = Math.min(0.95, state.cursor.y + 0.08);
  });
  hud.overlay.addEventListener("click", () => { if (state.mode === "ready" || state.mode === "over") start(); else if (state.mode === "pause") { state.mode = "play"; setOverlay(hud, false); } });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    state.cursor.x = (e.clientX - r.left) / r.width;
    state.cursor.y = (e.clientY - r.top) / r.height;
  });

  function update(dt) {
    if (state.mode !== "play") return;
    const pose = latestPose();
    if (pose?.hands) {
      const hands = [pose.hands.left, pose.hands.right].filter((h) => h?.visible && h.x != null);
      if (hands.length) {
        const h = hands.reduce((a, b) => (a.y < b.y ? a : b));
        state.cursor.x = h.x; state.cursor.y = h.y;
      }
    }
    state.spawn -= dt;
    if (state.spawn <= 0) {
      const bomb = Math.random() < 0.18;
      state.fruits.push({
        x: 0.15 + Math.random() * 0.7, y: 1.1, vx: (Math.random() - 0.5) * 0.35,
        vy: -0.85 - Math.random() * 0.35, r: 0.045 + Math.random() * 0.02,
        kind: bomb ? "bomb" : "fruit", sliced: false, hue: Math.floor(Math.random() * 360),
      });
      state.spawn = Math.max(0.28, 0.75 - state.score * 0.004);
    }
    for (const f of state.fruits) {
      f.vy += 1.1 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
    }
    const cx = state.cursor.x, cy = state.cursor.y;
    const moved = state.prev && Math.hypot(cx - state.prev.x, cy - state.prev.y) > 0.02;
    if (moved) {
      for (const f of state.fruits) {
        if (f.sliced) continue;
        if (Math.hypot(f.x - cx, f.y - cy) < f.r + 0.04) {
          f.sliced = true;
          if (f.kind === "bomb") { state.misses += 2; burst(state.particles, canvas.clientWidth * f.x, canvas.clientHeight * f.y, "#ef4444", 16); }
          else { state.score += 1; burst(state.particles, canvas.clientWidth * f.x, canvas.clientHeight * f.y, accent, 12); }
        }
      }
    }
    state.prev = { x: cx, y: cy };
    for (const f of state.fruits) {
      if (!f.sliced && f.y > 1.2) { f.sliced = true; if (f.kind === "fruit") state.misses += 1; }
    }
    state.fruits = state.fruits.filter((f) => !f.sliced && f.y < 1.35);
    if (state.misses >= 5) over();
    state.particles = stepParticles(state.particles, dt);
    hud.score.textContent = String(state.score);
  }


  function draw(w, h) {
    const t = performance.now();
    fillSky(ctx, w, h, "#052e16", "#14532d", "#0f172a");
    drawHills(ctx, w, h, h * 0.72, "rgba(20,83,45,0.9)", 0.8, t * 0.0004);
    drawHills(ctx, w, h, h * 0.82, "rgba(6,78,59,0.95)", 1.6, t * 0.0006);
    // trail
    if (state.prev) {
      ctx.strokeStyle = "rgba(34,197,94,0.45)"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(state.prev.x * w, state.prev.y * h);
      ctx.lineTo(state.cursor.x * w, state.cursor.y * h);
      ctx.stroke();
    }
    for (const f of state.fruits) {
      const x = f.x * w, y = f.y * h, r = f.r * Math.min(w, h);
      if (f.kind === "bomb") {
        drawGlow(ctx, x, y, r * 2.4, "rgba(239,68,68,0.45)");
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#1f2937"; ctx.fill();
        ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(x, y - r * 0.7, r * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#f97316"; ctx.beginPath(); ctx.moveTo(x, y - r * 0.85); ctx.quadraticCurveTo(x + r * 0.4, y - r * 1.3, x + r * 0.1, y - r * 1.5); ctx.stroke();
      } else {
        drawGlow(ctx, x, y, r * 2.2, `hsla(${f.hue} 80% 55% / 0.4)`);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${f.hue} 80% 55%)`; ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.28, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
        // leaf
        ctx.fillStyle = "#86efac"; ctx.beginPath(); ctx.ellipse(x + r * 0.35, y - r * 0.75, r * 0.35, r * 0.18, -0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    const x = state.cursor.x * w, y = state.cursor.y * h;
    drawGlow(ctx, x, y, 36, "rgba(34,197,94,0.35)");
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    drawParticles(ctx, state.particles);
    ctx.fillStyle = "#e2e8f0"; ctx.font = "700 16px system-ui"; ctx.textAlign = "left";
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
  setOverlay(hud, true, title, "Swipe your arm or move the cursor through fruit. Avoid bombs. Tap or Space to start.");
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__fruitSwipe = { state, start };
})();
