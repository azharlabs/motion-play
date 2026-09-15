/** Punch Pad — punch glowing targets. MotionPlay original. */
(() => {
  const { qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest, burst, stepParticles, drawParticles, latestPose, installPoseListener, bindParentStop, fillSky, drawStars, drawGlow, drawCoin, drawHero, drawHills, roundRect } = MPMini;
  installPoseListener();
  const cfg = readConfig();
  const skin = cfg.skin || "box";
  const title = cfg.title || (skin === "drums" ? "Animal Adventure" : "Boxing Challenge");
  const accent = cfg.accent || (skin === "drums" ? "#fbbf24" : "#ef4444");
  const canvas = qs("game"); const ctx = canvas.getContext("2d"); const hud = createHud();
  const KEY = "motionplay.punch-pad.best." + skin;
  let BEST = loadBest(KEY);
  const pads = [
    { id: "L", x: 0.28, y: 0.42, side: "left" },
    { id: "R", x: 0.72, y: 0.42, side: "right" },
    { id: "LK", x: 0.35, y: 0.72, side: "left", kick: true },
    { id: "RK", x: 0.65, y: 0.72, side: "right", kick: true },
  ].filter((p) => skin === "drums" || !p.kick);
  const state = { mode: "ready", score: 0, misses: 0, active: null, timer: 0, particles: [], last: 0, punchL: false, punchR: false, cool: 0 };
  bindParentStop(state, hud);

  function start() {
    Object.assign(state, { mode: "play", score: 0, misses: 0, active: null, timer: 0.3, particles: [], cool: 0 });
    setOverlay(hud, false); hud.status.textContent = skin === "drums" ? "Punch & kick on cue" : "Punch the lit pad";
  }
  function over() {
    state.mode = "over"; BEST = Math.max(BEST, state.score); saveBest(KEY, BEST); hud.best.textContent = String(BEST);
    setOverlay(hud, true, "Round over!", `Score ${state.score} · Tap / Space to retry`);
  }
  function pick() {
    const pool = pads; state.active = pool[Math.floor(Math.random() * pool.length)];
    state.timer = Math.max(0.7, 1.4 - state.score * 0.02);
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { if (state.mode === "ready" || state.mode === "over") start(); else if (state.mode === "pause") { state.mode = "play"; setOverlay(hud, false); } return; }
    if (state.mode !== "play" || state.cool > 0) return;
    if (e.key === "ArrowLeft" || e.key === "z" || e.key === "Z") tryHit("left", false);
    if (e.key === "ArrowRight" || e.key === "x" || e.key === "X") tryHit("right", false);
    if (e.key === "ArrowDown") tryHit(Math.random() < 0.5 ? "left" : "right", true);
  });
  hud.overlay.addEventListener("click", () => { if (state.mode === "ready" || state.mode === "over") start(); else if (state.mode === "pause") { state.mode = "play"; setOverlay(hud, false); } });

  function tryHit(side, kick) {
    state.cool = 0.18;
    if (!state.active) return;
    const ok = state.active.side === side && Boolean(state.active.kick) === Boolean(kick);
    if (ok) {
      state.score += 1;
      burst(state.particles, canvas.clientWidth * state.active.x, canvas.clientHeight * state.active.y, accent, 14);
      state.active = null; state.timer = 0.25;
    } else {
      state.misses += 1;
      if (state.misses >= 5) over();
    }
  }

  function update(dt) {
    if (state.mode !== "play") return;
    if (state.cool > 0) state.cool -= dt;
    const pose = latestPose();
    if (pose?.hands && state.cool <= 0) {
      for (const side of ["left", "right"]) {
        const h = pose.hands[side];
        if (!h?.visible || h.vx == null && h.x == null) continue;
        // Forward punch approximation: hand high and extended (low y, extreme x)
        const punching = h.y < 0.55 && (side === "left" ? h.x < 0.45 : h.x > 0.55);
        const flag = side === "left" ? "punchL" : "punchR";
        if (punching && !state[flag]) tryHit(side, false);
        state[flag] = punching;
      }
      if (pose.jump) tryHit(Math.random() < 0.5 ? "left" : "right", true);
    }
    if (pose?.controls) {
      // key-driven punches already handled
    }
    state.timer -= dt;
    if (state.timer <= 0) {
      if (state.active) { state.misses += 1; state.active = null; if (state.misses >= 5) { over(); return; } }
      pick();
    }
    state.particles = stepParticles(state.particles, dt);
    hud.score.textContent = String(state.score);
  }


  function draw(w, h) {
    const t = performance.now();
    fillSky(ctx, w, h, skin === "drums" ? "#422006" : "#1c1917", skin === "drums" ? "#78350f" : "#292524", "#0c0a09");
    // gym / jungle props
    if (skin === "drums") {
      drawHills(ctx, w, h, h * 0.78, "rgba(67,20,7,0.9)", 1.1, t * 0.0003);
      drawHills(ctx, w, h, h * 0.88, "rgba(28,25,23,0.95)", 2.0, t * 0.0005);
    } else {
      // ropes
      ctx.strokeStyle = "rgba(248,250,252,0.25)"; ctx.lineWidth = 4;
      for (const yy of [h * 0.22, h * 0.3, h * 0.38]) {
        ctx.beginPath(); ctx.moveTo(w * 0.08, yy); ctx.lineTo(w * 0.92, yy); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(248,250,252,0.35)"; ctx.lineWidth = 10;
      ctx.strokeRect(w * 0.08, h * 0.18, w * 0.84, h * 0.64);
    }
    for (const pad of pads) {
      const lit = state.active && state.active.id === pad.id;
      const x = pad.x * w, y = pad.y * h, r = Math.min(w, h) * 0.09;
      if (lit) drawGlow(ctx, x, y, r * 2.8, accent, 0.55 + 0.2 * Math.sin(t * 0.01));
      ctx.beginPath(); ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, lit ? "#fff7ed" : "#44403c");
      g.addColorStop(1, lit ? accent : "#1c1917");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = lit ? "#fff" : "#57534e"; ctx.lineWidth = lit ? 4 : 2; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 18px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(pad.kick ? "🦵" : (skin === "drums" ? "🥁" : "🥊"), x, y);
    }
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
  setOverlay(hud, true, title, "Punch the glowing pad (←/→ or body punches). Tap or Space to start.");
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__punchPad = { state, start };
})();
