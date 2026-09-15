/**
 * Tiny shared helpers for MotionPlay-built sticky embeds.
 * Original MotionPlay code — permissive / project license.
 */
(function (global) {
  function qs(id) {
    return document.getElementById(id);
  }

  function readConfig() {
    const params = new URLSearchParams(location.search);
    const cfg = Object.assign({}, global.__MP_GAME_CONFIG || {});
    for (const [k, v] of params.entries()) cfg[k] = v;
    return cfg;
  }

  function resizeCanvas(canvas, ctx) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h, dpr };
  }

  function createHud() {
    return {
      score: qs("score"),
      best: qs("best"),
      status: qs("status"),
      overlay: qs("overlay"),
      title: qs("overlay-title"),
      body: qs("overlay-body"),
    };
  }

  function setOverlay(hud, show, title, body) {
    if (!hud.overlay) return;
    hud.overlay.hidden = !show;
    if (title != null && hud.title) hud.title.textContent = title;
    if (body != null && hud.body) hud.body.textContent = body;
  }

  function loadBest(key) {
    try {
      return Number(localStorage.getItem(key) || 0);
    } catch {
      return 0;
    }
  }

  function saveBest(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* ignore */
    }
  }

  function burst(particles, x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 280,
        vy: -Math.random() * 220 - 40,
        life: 0.45 + Math.random() * 0.35,
        color,
      });
    }
  }

  function stepParticles(particles, dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 600 * dt;
    }
    return particles.filter((p) => p.life > 0);
  }

  function drawParticles(ctx, particles) {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** Latest pose snapshot from parent controller (optional). */
  function latestPose() {
    return global.__motionPlayPose || null;
  }

  function installPoseListener() {
    const CHANNEL = "motionplay.external-control.v1";
    window.addEventListener("message", (event) => {
      const payload = event.data;
      if (payload?.channel !== CHANNEL || payload?.type !== "pose") return;
      global.__motionPlayPose = payload;
    });
  }

  function shellHtmlMeta(title) {
    document.title = title || document.title;
  }

  global.MPMini = {
    qs,
    readConfig,
    resizeCanvas,
    createHud,
    setOverlay,
    loadBest,
    saveBest,
    burst,
    stepParticles,
    drawParticles,
    roundRect,
    latestPose,
    installPoseListener,
    shellHtmlMeta,
  };
})(window);
