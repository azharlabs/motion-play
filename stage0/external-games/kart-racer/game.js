/** Kart Racer — lean to steer. MotionPlay original. */
(() => {
  const { qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest, burst, stepParticles, drawParticles, roundRect, installPoseListener } = MPMini;
  installPoseListener();
  const cfg = readConfig();
  const title = cfg.title || "Kart Racer";
  const accent = cfg.accent || "#38bdf8";
  const canvas = qs("game"); const ctx = canvas.getContext("2d"); const hud = createHud();
  const KEY = "motionplay.kart-racer.best." + (cfg.skin || "default");
  let BEST = loadBest(KEY);
  const state = { mode: "ready", x: 0.5, vx: 0, dist: 0, score: 0, speed: 1, spawn: 0.8, things: [], particles: [], hits: 0, last: 0, steer: 0 };

  function start() {
    Object.assign(state, { mode: "play", x: 0.5, vx: 0, dist: 0, score: 0, speed: 1, spawn: 0.8, things: [], particles: [], hits: 0, steer: 0 });
    setOverlay(hud, false); hud.status.textContent = "Lean to steer · stay on track";
  }
  function over() {
    state.mode = "over"; BEST = Math.max(BEST, Math.floor(state.score)); saveBest(KEY, BEST); hud.best.textContent = String(BEST);
    setOverlay(hud, true, "Race over!", `Score ${Math.floor(state.score)} · Tap / Space to retry`);
  }
  function onKey(e) {
    if (e.key === "ArrowLeft" || e.key === "a") state.steer = -1;
    else if (e.key === "ArrowRight" || e.key === "d") state.steer = 1;
    else if (e.key === " " || e.key === "Enter") { if (state.mode === "ready" || state.mode === "over") start(); }
  }
  function onUp(e) {
    if (["ArrowLeft","a","ArrowRight","d"].includes(e.key)) state.steer = 0;
  }
  window.addEventListener("keydown", onKey); window.addEventListener("keyup", onUp);
  hud.overlay.addEventListener("click", () => { if (state.mode === "ready" || state.mode === "over") start(); });

  function update(dt) {
    if (state.mode !== "play") return;
    state.speed = 1 + Math.min(2, state.dist / 800);
    state.dist += state.speed * 60 * dt;
    state.score += (10 + state.speed * 20) * dt;
    state.vx += state.steer * 2.8 * dt;
    state.vx *= Math.pow(0.08, dt);
    state.x += state.vx * dt;
    if (state.x < 0.12 || state.x > 0.88) {
      state.hits++; state.x = Math.max(0.12, Math.min(0.88, state.x)); state.vx *= -0.4;
      burst(state.particles, canvas.clientWidth * state.x, canvas.clientHeight * 0.75, "#ef4444", 10);
      if (state.hits >= 3) { over(); return; }
    }
    state.spawn -= dt;
    if (state.spawn <= 0) {
      state.things.push({ x: 0.2 + Math.random() * 0.6, z: 1.1, kind: Math.random() < 0.35 ? "coin" : "cone" });
      state.spawn = Math.max(0.35, 0.9 - state.speed * 0.15);
    }
    for (const t of state.things) t.z -= 0.55 * state.speed * dt;
    for (const t of state.things) {
      if (t.z < 0.08 || t.z > 0.14) continue;
      if (Math.abs(t.x - state.x) > 0.09) continue;
      if (t.kind === "coin") { t.z = -1; state.score += 40; burst(state.particles, canvas.clientWidth * state.x, canvas.clientHeight * 0.7, "#fbbf24", 8); }
      else { t.z = -1; state.hits++; burst(state.particles, canvas.clientWidth * state.x, canvas.clientHeight * 0.7, "#ef4444", 12); if (state.hits >= 3) { over(); return; } }
    }
    state.things = state.things.filter((t) => t.z > -0.05);
    state.particles = stepParticles(state.particles, dt);
    hud.score.textContent = String(Math.floor(state.score));
  }

  function draw(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#082f49"); g.addColorStop(0.35, "#0c4a6e"); g.addColorStop(1, "#022c22");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const horizon = h * 0.32, cx = w * 0.5;
    ctx.fillStyle = "#334155";
    ctx.beginPath(); ctx.moveTo(cx - w * 0.08, horizon); ctx.lineTo(cx + w * 0.08, horizon); ctx.lineTo(cx + w * 0.48, h); ctx.lineTo(cx - w * 0.48, h); ctx.closePath(); ctx.fill();
    // center line
    const scroll = (state.dist * 0.05) % 1;
    ctx.strokeStyle = "rgba(248,250,252,0.55)"; ctx.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const t = (i / 12 + scroll) % 1; const y = horizon + t * t * (h - horizon);
      ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, y + 12 + t * 20); ctx.stroke();
    }
    for (const t of [...state.things].sort((a,b)=>b.z-a.z)) {
      const ease = Math.max(0, Math.min(1, 1 - t.z)) ** 2;
      const roadHalf = w * (0.08 + 0.4 * ease);
      const x = cx + (t.x - 0.5) * roadHalf * 2;
      const y = horizon + ease * (h - horizon);
      const s = 0.3 + ease * 1.1;
      if (t.kind === "coin") { ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(x, y - 10*s, 12*s, 0, Math.PI*2); ctx.fill(); }
      else { ctx.fillStyle = "#f97316"; roundRect(ctx, x - 10*s, y - 28*s, 20*s, 28*s, 4*s); ctx.fill(); }
    }
    const kx = cx + (state.x - 0.5) * w * 0.75;
    const ky = h * 0.78;
    ctx.fillStyle = accent; roundRect(ctx, kx - 28, ky - 22, 56, 36, 10); ctx.fill();
    ctx.fillStyle = "#0f172a"; roundRect(ctx, kx - 18, ky - 34, 36, 16, 6); ctx.fill();
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
  setOverlay(hud, true, title, "Lean left/right to steer. Avoid cones, grab coins. Tap or Space to start.");
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__kartRacer = { state, start };
})();
