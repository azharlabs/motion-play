/** Reach Pop — sticky delight loop. Skins via ?skin=. Balloon Pop first. */
(() => {
  const {
    qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest,
    burst, stepParticles, drawParticles, latestPose, installPoseListener,
    bindParentStop, fillSky, drawStars, drawGlow, drawHills,
  } = MPMini;
  const {
    createSfx, createBuddy, createFloats, createConfetti, createLoop,
    funnyMissLine, funnyFailTitle,
  } = MPDelight;

  installPoseListener();
  const cfg = readConfig();
  const skin = cfg.skin || "balloons";
  const skins = {
    balloons: { title: "Balloon Pop Adventure", accent: "#ec4899", emoji: "🎈", hint: "Reach to pop balloons", goal: (n) => `Pop ${n}`, hitCue: "pop", base: 10, step: 4 },
    goal: { title: "Goalkeeper Hero", accent: "#6366f1", emoji: "⚽", hint: "Reach to save the shots", goal: (n) => `Save ${n}`, hitCue: "hit", base: 8, step: 3 },
    treasure: { title: "Treasure Catch", accent: "#38bdf8", emoji: "💎", hint: "Reach / kick to catch treasure", goal: (n) => `Catch ${n}`, hitCue: "hit", base: 8, step: 3 },
    climb: { title: "Adventure Climber", accent: "#60a5fa", emoji: "🧗", hint: "Reach and raise to climb", goal: (n) => `Grab ${n}`, hitCue: "hit", base: 8, step: 3 },
  };
  const S = skins[skin] || skins.balloons;
  const title = cfg.title || S.title;
  const accent = cfg.accent || S.accent;
  const canvas = qs("game");
  const ctx = canvas.getContext("2d");
  const hud = createHud();
  const KEY = "motionplay.reach-pop.best." + skin;
  let BEST = loadBest(KEY);

  const sfx = createSfx();
  const buddy = createBuddy();
  const floats = createFloats();
  const confetti = createConfetti();
  const loop = createLoop({
    baseGoal: S.base,
    goalStep: S.step,
    label: S.goal,
    missLimit: 5,
  });

  const state = {
    mode: "ready",
    score: 0,
    spawn: 0.5,
    targets: [],
    particles: [],
    last: 0,
    hands: [{ x: 0.35, y: 0.6 }, { x: 0.65, y: 0.6 }],
    pendingLevel: false,
  };

  bindParentStop(state, hud, { resumeStatus: S.hint });

  function start() {
    Object.assign(state, {
      mode: "play",
      score: 0,
      spawn: 0.4,
      targets: [],
      particles: [],
      pendingLevel: false,
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
    state.pendingLevel = true;
    state.mode = "celebrate";
    buddy.setMood("cheer", 1600);
    sfx.cue("celebrate");
    confetti.burst(canvas.clientWidth || 360, canvas.clientHeight || 640, 64);
    setOverlay(
      hud,
      true,
      "Level clear!",
      `${loop.goalLabel()} ✓ · Chocolate shower! Tap / Space for level ${loop.state.level + 1}`,
    );
    hud.status.textContent = "Level clear!";
  }

  function advanceLevel() {
    loop.nextLevel();
    state.pendingLevel = false;
    state.mode = "play";
    state.targets = [];
    state.spawn = 0.35;
    setOverlay(hud, false);
    hud.status.textContent = loop.goalLabel();
    buddy.setMood("wink", 700);
    sfx.cue("ui");
  }

  function onHit(target, w, h) {
    state.score += 1;
    const { cleared, combo } = loop.hit();
    burst(state.particles, w * target.x, h * target.y, accent, 14);
    floats.push(combo >= 3 ? `x${combo}!` : "+1", w * target.x, h * target.y - 12, combo >= 3 ? "#fde68a" : "#fff");
    if (combo >= 3) {
      sfx.cue("combo", combo);
      buddy.setMood("cheer", 500);
    } else {
      sfx.cue(S.hitCue, combo);
      buddy.setMood(combo === 2 ? "wink" : "cheer", 420);
    }
    if (cleared) clearLevel();
  }

  function onMissSoft(target, w, h) {
    const { failed } = loop.miss();
    floats.push("boing!", w * (target?.x ?? 0.5), h * (target?.y ?? 0.35), "#fda4af");
    buddy.setMood("oops", 700);
    sfx.cue("miss");
    if (failed) failOut();
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
    const h = state.hands[0];
    if (e.key === "ArrowLeft") h.x = Math.max(0.05, h.x - 0.07);
    if (e.key === "ArrowRight") h.x = Math.min(0.95, h.x + 0.07);
    if (e.key === "ArrowUp") h.y = Math.max(0.05, h.y - 0.07);
    if (e.key === "ArrowDown") h.y = Math.min(0.95, h.y + 0.07);
  });
  hud.overlay.addEventListener("click", () => {
    if (state.mode === "ready" || state.mode === "over") start();
    else if (state.mode === "celebrate") advanceLevel();
    else if (state.mode === "pause") {
      state.mode = "play";
      setOverlay(hud, false);
    }
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
      const L = pose.hands.left;
      const R = pose.hands.right;
      if (L?.visible && L.x != null) state.hands[0] = { x: L.x, y: L.y };
      if (R?.visible && R.x != null) state.hands[1] = { x: R.x, y: R.y };
    }

    state.spawn -= dt;
    if (state.spawn <= 0) {
      state.targets.push({
        x: 0.12 + Math.random() * 0.76,
        y: skin === "goal" ? -0.1 : 1.05,
        vy: skin === "goal" ? 0.35 + Math.random() * 0.25 : -(0.18 + Math.random() * 0.2),
        vx: (Math.random() - 0.5) * 0.2,
        r: 0.055,
        life: 4,
        hit: false,
        bounce: 0,
      });
      state.spawn = Math.max(0.32, 0.85 - state.score * 0.01 - loop.state.level * 0.02);
    }

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const t of state.targets) {
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.bounce > 0) t.bounce -= dt;
      for (const hand of state.hands) {
        if (!t.hit && Math.hypot(t.x - hand.x, t.y - hand.y) < t.r + 0.05) {
          t.hit = true;
          onHit(t, w, h);
        }
      }
      if (!t.hit && (t.life <= 0 || t.y < -0.15 || t.y > 1.2)) {
        t.hit = true;
        t.bounce = 0.4;
        onMissSoft(t, w, h);
      }
    }
    state.targets = state.targets.filter((t) => !t.hit);
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
    ctx.translate(shake, shake * 0.6);

    if (skin === "goal") fillSky(ctx, w, h, "#14532d", "#166534", "#052e16");
    else if (skin === "treasure") fillSky(ctx, w, h, "#0c4a6e", "#075985", "#082f49");
    else if (skin === "climb") fillSky(ctx, w, h, "#1e3a8a", "#1d4ed8", "#0f172a");
    else fillSky(ctx, w, h, "#4a044e", "#86198f", "#3b0764");
    drawStars(ctx, w, h, 28, skin.length, t);

    if (skin === "goal") {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 6;
      ctx.strokeRect(w * 0.15, h * 0.08, w * 0.7, h * 0.35);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 8; i++) {
        const x = w * 0.15 + w * 0.7 * (i / 8);
        ctx.beginPath();
        ctx.moveTo(x, h * 0.08);
        ctx.lineTo(x, h * 0.43);
        ctx.stroke();
      }
      drawHills(ctx, w, h, h * 0.85, "rgba(20,83,45,0.9)", 0.5, 0);
    } else if (skin === "treasure") {
      drawHills(ctx, w, h, h * 0.75, "rgba(8,47,73,0.95)", 1.2, t * 0.0004);
      ctx.fillStyle = "rgba(125,211,252,0.25)";
      for (let i = 0; i < 10; i++) {
        const x = ((i * 89) % 1000) / 1000 * w;
        const y = h * 0.9 - ((t * 0.04 + i * 40) % (h * 0.8));
        ctx.beginPath();
        ctx.arc(x, y, 4 + (i % 3) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (skin === "climb") {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? "rgba(30,58,138,0.35)" : "rgba(15,23,42,0.35)";
        ctx.fillRect(0, (i / 6) * h, w, h / 6);
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const x = ((i * 160 + t * 0.01) % (w + 40)) - 20;
        const y = h * 0.15 + (i % 3) * 40;
        drawGlow(ctx, x, y, 24, "rgba(236,72,153,0.25)", 0.4);
      }
    }

    for (const target of state.targets) {
      const x = target.x * w;
      const y = target.y * h;
      const r = target.r * Math.min(w, h);
      drawGlow(ctx, x, y, r * 2.4, accent, 0.45);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.35, accent);
      g.addColorStop(1, "#0f172a");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.font = `${Math.max(16, r)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(S.emoji, x, y);
    }

    state.hands.forEach((hand, i) => {
      const hx = hand.x * w;
      const hy = hand.y * h;
      drawGlow(ctx, hx, hy, 28, i ? "rgba(251,146,60,0.4)" : "rgba(56,189,248,0.4)");
      ctx.beginPath();
      ctx.arc(hx, hy, 16, 0, Math.PI * 2);
      ctx.strokeStyle = i ? "#fb923c" : "#38bdf8";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = i ? "rgba(251,146,60,0.25)" : "rgba(56,189,248,0.25)";
      ctx.fill();
    });

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
  setOverlay(hud, true, title, `${S.hint}. Goal: ${S.goal(S.base)}. Tap or Space to start.`);
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__reachPop = { state, start, loop };
})();
