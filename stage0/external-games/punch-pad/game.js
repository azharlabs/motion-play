/** Punch Pad — sticky delight loop. Boxing Challenge (box) + Animal Adventure (drums). */
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
  const skin = cfg.skin || "box";
  const title = cfg.title || (skin === "drums" ? "Animal Adventure" : "Boxing Challenge");
  const accent = cfg.accent || (skin === "drums" ? "#fbbf24" : "#ef4444");
  const canvas = qs("game");
  const ctx = canvas.getContext("2d");
  const hud = createHud();
  const KEY = "motionplay.punch-pad.best." + skin;
  let BEST = loadBest(KEY);

  const pads = [
    { id: "L", x: 0.28, y: 0.42, side: "left" },
    { id: "R", x: 0.72, y: 0.42, side: "right" },
    { id: "LK", x: 0.35, y: 0.72, side: "left", kick: true },
    { id: "RK", x: 0.65, y: 0.72, side: "right", kick: true },
  ].filter((p) => skin === "drums" || !p.kick);

  const sfx = createSfx();
  const buddy = createBuddy();
  const floats = createFloats();
  const confetti = createConfetti();
  const loop = createLoop({
    baseGoal: skin === "drums" ? 8 : 6,
    goalStep: 3,
    label: (n) => (skin === "drums" ? `Hit ${n}` : `Land ${n} punches`),
    missLimit: 5,
  });

  const state = {
    mode: "ready",
    score: 0,
    active: null,
    timer: 0,
    particles: [],
    last: 0,
    punchL: false,
    punchR: false,
    cool: 0,
  };

  bindParentStop(state, hud, {
    resumeStatus: skin === "drums" ? "Punch & kick on cue" : "Punch the lit pad",
  });

  function start() {
    Object.assign(state, {
      mode: "play",
      score: 0,
      active: null,
      timer: 0.3,
      particles: [],
      cool: 0,
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
    state.active = null;
    buddy.setMood("cheer", 1600);
    sfx.cue("celebrate");
    confetti.burst(canvas.clientWidth || 360, canvas.clientHeight || 640, 64);
    setOverlay(
      hud,
      true,
      "Level clear!",
      `${loop.goalLabel()} ✓ · Knockout! Tap / Space for level ${loop.state.level + 1}`,
    );
    hud.status.textContent = "Level clear!";
  }

  function advanceLevel() {
    loop.nextLevel();
    state.mode = "play";
    state.active = null;
    state.timer = 0.35;
    setOverlay(hud, false);
    hud.status.textContent = loop.goalLabel();
    buddy.setMood("wink", 700);
    sfx.cue("ui");
  }

  function pick() {
    const pool = pads;
    state.active = pool[Math.floor(Math.random() * pool.length)];
    state.timer = Math.max(0.65, 1.4 - state.score * 0.02 - loop.state.level * 0.04);
  }

  function softMiss(kind) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ax = state.active ? state.active.x : 0.5;
    const ay = state.active ? state.active.y : 0.45;
    const { failed } = loop.miss();
    floats.push(kind === "timeout" ? "too slow!" : "whiff!", w * ax, h * ay - 8, "#fda4af");
    buddy.setMood("oops", 650);
    sfx.cue("miss");
    state.active = null;
    state.timer = 0.28;
    if (failed) failOut();
  }

  function tryHit(side, kick) {
    state.cool = 0.18;
    if (!state.active || state.mode !== "play") return;
    const ok = state.active.side === side && Boolean(state.active.kick) === Boolean(kick);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (ok) {
      state.score += 1;
      const { cleared, combo } = loop.hit();
      burst(state.particles, w * state.active.x, h * state.active.y, accent, 14);
      floats.push(combo >= 3 ? `x${combo}!` : "pow!", w * state.active.x, h * state.active.y - 10, combo >= 3 ? "#fde68a" : "#fecaca");
      if (combo >= 3) {
        sfx.cue("combo", combo);
        buddy.setMood("cheer", 500);
      } else {
        sfx.cue("punch", combo);
        buddy.setMood(combo === 2 ? "wink" : "cheer", 400);
      }
      state.active = null;
      state.timer = 0.25;
      if (cleared) clearLevel();
    } else {
      softMiss("whiff");
    }
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
    if (state.mode !== "play" || state.cool > 0) return;
    if (e.key === "ArrowLeft" || e.key === "z" || e.key === "Z") tryHit("left", false);
    if (e.key === "ArrowRight" || e.key === "x" || e.key === "X") tryHit("right", false);
    if (e.key === "ArrowDown") tryHit(Math.random() < 0.5 ? "left" : "right", true);
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

    if (state.cool > 0) state.cool -= dt;
    const pose = latestPose();
    if (pose?.hands && state.cool <= 0) {
      for (const side of ["left", "right"]) {
        const h = pose.hands[side];
        if (!h?.visible || (h.vx == null && h.x == null)) continue;
        const punching = h.y < 0.55 && (side === "left" ? h.x < 0.45 : h.x > 0.55);
        const flag = side === "left" ? "punchL" : "punchR";
        if (punching && !state[flag]) tryHit(side, false);
        state[flag] = punching;
      }
      if (pose.jump) tryHit(Math.random() < 0.5 ? "left" : "right", true);
    }

    state.timer -= dt;
    if (state.timer <= 0) {
      if (state.active) softMiss("timeout");
      else if (state.mode === "play") pick();
    }

    loop.step(dt);
    state.particles = stepParticles(state.particles, dt);
    floats.step(dt);
    confetti.step(dt, canvas.clientWidth, canvas.clientHeight);
    hud.score.textContent = String(state.score);
    if (state.mode === "play") hud.status.textContent = `${loop.goalLabel()} · ${loop.state.progress}/${loop.state.goal}`;
  }

  function draw(w, h) {
    const t = performance.now();
    const shake = loop.state.shake > 0 ? (Math.random() - 0.5) * 10 * loop.state.shake : 0;
    ctx.save();
    ctx.translate(shake, shake * 0.5);

    fillSky(ctx, w, h, skin === "drums" ? "#422006" : "#1c1917", skin === "drums" ? "#78350f" : "#292524", "#0c0a09");
    if (skin === "drums") {
      drawHills(ctx, w, h, h * 0.78, "rgba(67,20,7,0.9)", 1.1, t * 0.0003);
      drawHills(ctx, w, h, h * 0.88, "rgba(28,25,23,0.95)", 2.0, t * 0.0005);
    } else {
      ctx.strokeStyle = "rgba(248,250,252,0.25)";
      ctx.lineWidth = 4;
      for (const yy of [h * 0.22, h * 0.3, h * 0.38]) {
        ctx.beginPath();
        ctx.moveTo(w * 0.08, yy);
        ctx.lineTo(w * 0.92, yy);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(248,250,252,0.35)";
      ctx.lineWidth = 10;
      ctx.strokeRect(w * 0.08, h * 0.18, w * 0.84, h * 0.64);
    }

    for (const pad of pads) {
      const lit = state.active && state.active.id === pad.id;
      const x = pad.x * w;
      const y = pad.y * h;
      const r = Math.min(w, h) * 0.09;
      if (lit) drawGlow(ctx, x, y, r * 2.8, accent, 0.55 + 0.2 * Math.sin(t * 0.01));
      ctx.beginPath();
      ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, lit ? "#fff7ed" : "#44403c");
      g.addColorStop(1, lit ? accent : "#1c1917");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = lit ? "#fff" : "#57534e";
      ctx.lineWidth = lit ? 4 : 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pad.kick ? "🦵" : skin === "drums" ? "🥁" : "🥊", x, y);
    }

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
  const goalHint = skin === "drums" ? "Hit 8 on cue" : "Land 6 punches to clear";
  setOverlay(hud, true, title, `${goalHint}. Punch the glowing pad (←/→). Tap or Space to start.`);
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__punchPad = { state, start, loop };
})();
