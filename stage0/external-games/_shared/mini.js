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

  /** Listen for parent controller stop/pause/resume control messages. */
  function installControlListener(onControl) {
    const CHANNEL = "motionplay.external-control.v1";
    const handler = (payload) => {
      if (!payload || payload.channel !== CHANNEL || payload.type !== "control") return;
      onControl?.(payload);
    };
    window.addEventListener("message", (event) => handler(event.data));
    window.addEventListener("mp-control", (event) => handler(event.detail));
  }

  /**
   * Freeze / resume a sticky embed on parent stop|pause|resume.
   * Soft Pause sheet uses pause+resume; Exit uses stop then navigates home.
   * @param {{ mode: string }} state  game state with a `mode` field ("play" | …)
   * @param {object|function} hudOrFn  HUD from createHud, or a custom control callback
   * @param {{ title?: string, body?: string, resumeStatus?: string }} [messages]
   */
  function bindParentStop(state, hudOrFn, messages = {}) {
    installControlListener((payload) => {
      const action = payload?.action;
      if (action === "resume") {
        if (state.mode !== "pause") return;
        state.mode = "play";
        if (typeof hudOrFn === "function") {
          hudOrFn(payload);
          return;
        }
        setOverlay(hudOrFn, false);
        if (hudOrFn?.status) {
          hudOrFn.status.textContent = messages.resumeStatus || "Go!";
        }
        return;
      }
      if (action !== "stop" && action !== "pause") return;
      if (state.mode !== "play") return;
      state.mode = "pause";
      if (typeof hudOrFn === "function") {
        hudOrFn(payload);
        return;
      }
      const title = messages.title || "Paused";
      const body =
        messages.body || "Paused · Continue from MotionPlay, or tap / Space here";
      setOverlay(hudOrFn, true, title, body);
      if (hudOrFn?.status) hudOrFn.status.textContent = "Paused";
    });
  }


  /** Soft vignette + vertical sky gradient. */
  function fillSky(ctx, w, h, top, mid, bot) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(0.45, mid || top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const v = ctx.createRadialGradient(w * 0.5, h * 0.35, h * 0.05, w * 0.5, h * 0.5, h * 0.85);
    v.addColorStop(0, "rgba(255,255,255,0.04)");
    v.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  /** Cheap deterministic twinkle field (no allocations per star). */
  function drawStars(ctx, w, h, n, seed, t) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < n; i++) {
      const x = ((i * 97 + seed * 13) % 1000) / 1000 * w;
      const y = ((i * 53 + seed * 29) % 1000) / 1000 * h * 0.7;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin((t || 0) * 0.002 + i));
      ctx.globalAlpha = tw;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawGlow(ctx, x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha == null ? 0.55 : alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawCoin(ctx, x, y, r, t) {
    const spin = 0.65 + 0.35 * Math.abs(Math.sin((t || 0) * 0.008));
    drawGlow(ctx, x, y, r * 2.2, "rgba(251,191,36,0.55)", 0.5);
    ctx.beginPath();
    ctx.ellipse(x, y, r * spin, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.2, y - r * 0.25, r * 0.25 * spin, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Simple cartoon hero: shadow + body + head + eyes. */
  function drawHero(ctx, x, y, s, accent, opts) {
    opts = opts || {};
    const squash = opts.squash == null ? 1 : opts.squash;
    const bodyH = (opts.bodyH || 70) * s * squash;
    const bodyW = (opts.bodyW || 36) * s * (squash < 0.8 ? 1.25 : 1);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4 * s, 20 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, x - bodyW / 2, y - bodyH, bodyW, bodyH, 10 * s);
    ctx.fillStyle = accent;
    ctx.fill();
    // belly highlight
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(ctx, x - bodyW * 0.22, y - bodyH * 0.85, bodyW * 0.44, bodyH * 0.45, 8 * s);
    ctx.fill();
    if (squash > 0.7) {
      const hy = y - bodyH - 12 * s;
      ctx.fillStyle = opts.skin || "#fdba74";
      ctx.beginPath();
      ctx.arc(x, hy, 13 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1f2937";
      ctx.beginPath();
      ctx.arc(x - 4 * s, hy - 1 * s, 2 * s, 0, Math.PI * 2);
      ctx.arc(x + 4 * s, hy - 1 * s, 2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHills(ctx, w, h, y0, color, seed, scroll) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 8; i++) {
      const x = (i / 8) * w;
      const y = y0 + Math.sin(i * 1.3 + seed + (scroll || 0)) * 18;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
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
    installControlListener,
    bindParentStop,
    fillSky,
    drawStars,
    drawGlow,
    drawCoin,
    drawHero,
    drawHills,
    shellHtmlMeta,
  };
})(window);
