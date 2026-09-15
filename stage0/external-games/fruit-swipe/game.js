/** Fruit Slice — sticky delight loop (swipe / reach). */
(() => {
  const {
    qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest,
    burst, stepParticles, drawParticles, latestPose, installPoseListener,
    bindParentStop, fillSky, drawGlow, drawHills,
  } = MPMini;
  const {
    createSfx, createBuddy, createFloats, createConfetti, createLoop,
    funnyMissLine, funnyFailTitle,
  } = MPDelight;

  installPoseListener();
  const cfg = readConfig();
  const title = cfg.title || "Fruit Slice";
  const accent = cfg.accent || "#22c55e";
  const canvas = qs("game");
  const ctx = canvas.getContext("2d");
  const hud = createHud();
  const KEY = "motionplay.fruit-swipe.best." + (cfg.skin || "default");
  let BEST = loadBest(KEY);

  const sfx = createSfx();
  const buddy = createBuddy();
  const floats = createFloats();
  const confetti = createConfetti();
  const loop = createLoop({
    baseGoal: 8,
    goalStep: 4,
    label: (n) => `Slice ${n}`,
    missLimit: 5,
  });

  const state = {
    mode: "ready",
    score: 0,
    spawn: 0.6,
    fruits: [],
    particles: [],
    last: 0,
    cursor: { x: 0.5, y: 0.5 },
    prev: null,
  };

  bindParentStop(state, hud, { resumeStatus: "Swipe / reach through fruit" });

  function start() {
    Object.assign(state, {
      mode: "play",
      score: 0,
      spawn: 0.5,
      fruits: [],
      particles: [],
      prev: null,
    });
    loop.resetRound();
    setOverlay(hud, false);
    hud.status.textContent = loop.goalLabel();
    sfx.unlock();
    buddy.setMood("wink", 600);
  }

  function failOut() {
    state.mode = "over";
    BEST = Math.max(BEST, state.score);
    saveBest(KEY, BEST);
    hud.best.textContent = String(BEST);
    buddy.setMood("oops", 1400);
    sfx.cue("miss");
    setOverlay(
      hud,
      true,
      funnyFailTitle(),
      `${funnyMissLine()} Score ${state.score} · Best combo x${loop.state.bestCombo} · Tap / Space to retry`,
    );
  }

  function clearLevel() {
    state.mode = "celebrate";
    buddy.setMood("cheer", 1600);
    sfx.cue("celebrate");
    confetti.burst(canvas.clientWidth || 360, canvas.clientHeight || 640, 64);
    setOverlay(
      hud,
      true,
      "Level clear!",
      `${loop.goalLabel()} ✓ · Juicy! Tap / Space for level ${loop.state.level + 1}`,
    );
    hud.status.textContent = "Level clear!";
  }

  function advanceLevel() {
    loop.nextLevel();
    state.mode = "play";
    state.fruits = [];
    state.spawn = 0.4;
    setOverlay(hud, false);
    hud.status.textContent = loop.goalLabel();
    buddy.setMood("wink", 700);
    sfx.cue("ui");
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      if (state.mode === "ready" || state.mode === "over") start();
      else if (state.mode === "celebrate") advanceLevel();
      else if (state.mode === "pause") {
        state.mode = "play";
        setOverlay(hud, false);
      }
      return;
    }
    if (e.key === "ArrowLeft") state.cursor.x = Math.max(0.05, state.cursor.x - 0.08);
    if (e.key === "ArrowRight") state.cursor.x = Math.min(0.95, state.cursor.x + 0.08);
    if (e.key === "ArrowUp") state.cursor.y = Math.max(0.05, state.cursor.y - 0.08);
    if (e.key === "ArrowDown") state.cursor.y = Math.min(0.95, state.cursor.y + 0.08);
  });
  hud.overlay.addEventListener("click", () => {
    if (state.mode === "ready" || state.mode === "over") start();
    else if (state.mode === "celebrate") advanceLevel();
    else if (state.mode === "pause") {
      state.mode = "play";
      setOverlay(hud, false);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    state.cursor.x = (e.clientX - r.left) / r.width;
    state.cursor.y = (e.clientY - r.top) / r.height;
  });
  canvas.addEventListener("pointerdown", () => sfx.unlock());

  function update(dt) {
    if (state.mode === "celebrate") {
      loop.step(dt);
      state.particles = stepParticles(state.particles, dt);
      floats.step(dt);
      confetti.step(dt, canvas.clientWidth, canvas.clientHeight);
      return;
    }
    if (state.mode !== "play") return;

    const pose = latestPose();
    if (pose?.hands) {
      const hands = [pose.hands.left, pose.hands.right].filter((h) => h?.visible && h.x != null);
      if (hands.length) {
        const h = hands.reduce((a, b) => (a.y < b.y ? a : b));
        state.cursor.x = h.x;
        state.cursor.y = h.y;
      }
    }

    state.spawn -= dt;
    if (state.spawn <= 0) {
      const bomb = Math.random() < 0.18;
      state.fruits.push({
        x: 0.15 + Math.random() * 0.7,
        y: 1.1,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.85 - Math.random() * 0.35,
        r: 0.045 + Math.random() * 0.02,
        kind: bomb ? "bomb" : "fruit",
        sliced: false,
        hue: Math.floor(Math.random() * 360),
      });
      state.spawn = Math.max(0.26, 0.75 - state.score * 0.004 - loop.state.level * 0.02);
    }

    for (const f of state.fruits) {
      f.vy += 1.1 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = state.cursor.x;
    const cy = state.cursor.y;
    const moved = state.prev && Math.hypot(cx - state.prev.x, cy - state.prev.y) > 0.02;
    if (moved) {
      for (const f of state.fruits) {
        if (f.sliced) continue;
        if (Math.hypot(f.x - cx, f.y - cy) < f.r + 0.04) {
          f.sliced = true;
          if (f.kind === "bomb") {
            loop.miss();
            const { failed } = loop.miss(); // bombs sting for two misses
            burst(state.particles, w * f.x, h * f.y, "#ef4444", 16);
            floats.push("boom!", w * f.x, h * f.y, "#fecaca");
            buddy.setMood("oops", 800);
            sfx.cue("miss");
            if (failed || loop.state.misses >= loop.missLimit) failOut();
          } else {
            state.score += 1;
            const { cleared, combo } = loop.hit();
            burst(state.particles, w * f.x, h * f.y, accent, 12);
            floats.push(combo >= 3 ? `x${combo}!` : "slice!", w * f.x, h * f.y - 10, combo >= 3 ? "#fde68a" : "#bbf7d0");
            if (combo >= 3) {
              sfx.cue("combo", combo);
              buddy.setMood("cheer", 500);
            } else {
              sfx.cue("slice", combo);
              buddy.setMood(combo === 2 ? "wink" : "cheer", 400);
            }
            if (cleared) clearLevel();
          }
        }
      }
    }
    state.prev = { x: cx, y: cy };

    for (const f of state.fruits) {
      if (!f.sliced && f.y > 1.2) {
        f.sliced = true;
        if (f.kind === "fruit") {
          const { failed } = loop.miss();
          floats.push("slip!", w * f.x, h * 0.92, "#fda4af");
          buddy.setMood("oops", 600);
          sfx.cue("miss");
          if (failed) failOut();
        }
      }
    }
    state.fruits = state.fruits.filter((f) => !f.sliced && f.y < 1.35);
    loop.step(dt);
    state.particles = stepParticles(state.particles, dt);
    floats.step(dt);
    confetti.step(dt, w, h);
    hud.score.textContent = String(state.score);
    if (state.mode === "play") hud.status.textContent = `${loop.goalLabel()} · ${loop.state.progress}/${loop.state.goal}`;
  }

  function draw(w, h) {
    const t = performance.now();
    const shake = loop.state.shake > 0 ? (Math.random() - 0.5) * 10 * loop.state.shake : 0;
    ctx.save();
    ctx.translate(shake, shake * 0.5);

    fillSky(ctx, w, h, "#052e16", "#14532d", "#0f172a");
    drawHills(ctx, w, h, h * 0.72, "rgba(20,83,45,0.9)", 0.8, t * 0.0004);
    drawHills(ctx, w, h, h * 0.82, "rgba(6,78,59,0.95)", 1.6, t * 0.0006);

    if (state.prev) {
      ctx.strokeStyle = "rgba(34,197,94,0.45)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(state.prev.x * w, state.prev.y * h);
      ctx.lineTo(state.cursor.x * w, state.cursor.y * h);
      ctx.stroke();
    }

    for (const f of state.fruits) {
      const x = f.x * w;
      const y = f.y * h;
      const r = f.r * Math.min(w, h);
      if (f.kind === "bomb") {
        drawGlow(ctx, x, y, r * 2.4, "rgba(239,68,68,0.45)");
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#1f2937";
        ctx.fill();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath();
        ctx.arc(x, y - r * 0.7, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        drawGlow(ctx, x, y, r * 2.2, `hsla(${f.hue} 80% 55% / 0.4)`);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${f.hue} 80% 55%)`;
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#86efac";
        ctx.beginPath();
        ctx.ellipse(x + r * 0.35, y - r * 0.75, r * 0.35, r * 0.18, -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const x = state.cursor.x * w;
    const y = state.cursor.y * h;
    drawGlow(ctx, x, y, 36, "rgba(34,197,94,0.35)");
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    drawParticles(ctx, state.particles);
    floats.draw(ctx);
    confetti.draw(ctx);
    loop.drawHud(ctx, w, h, accent);
    buddy.draw(ctx, w - 48, h - 56, 1.15, t);
    ctx.restore();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.last) state.last = now;
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;
    update(dt);
    const { w, h } = resizeCanvas(canvas, ctx);
    draw(w, h);
  }

  hud.best.textContent = String(BEST);
  qs("overlay-title").textContent = title;
  document.title = "MotionPlay — " + title;
  setOverlay(hud, true, title, "Slice 8 fruit to clear · avoid bombs. Tap or Space to start.");
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__fruitSwipe = { state, start, loop };
})();
