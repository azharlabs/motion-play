/** Motion Runner — jump/duck focused endless runner. MotionPlay original. */
(() => {
  const { qs, readConfig, resizeCanvas, createHud, setOverlay, loadBest, saveBest, burst, stepParticles, drawParticles, roundRect, installPoseListener } = MPMini;
  installPoseListener();
  const cfg = readConfig();
  const title = cfg.title || "Motion Runner";
  const accent = cfg.accent || "#f97316";
  const canvas = qs("game");
  const ctx = canvas.getContext("2d");
  const hud = createHud();
  const KEY = "motionplay.jump-runner.best";
  let BEST = loadBest(KEY);
  const state = {
    mode: "ready", lane: 1, laneX: 1, y: 0, vy: 0, sliding: 0, invuln: 0,
    distance: 0, score: 0, coins: 0, speed: 1, spawnT: 0.7, things: [], particles: [],
    shake: 0, hits: 0, last: 0,
  };

  function reset() {
    Object.assign(state, { lane: 1, laneX: 1, y: 0, vy: 0, sliding: 0, invuln: 0, distance: 0, score: 0, coins: 0, speed: 1, spawnT: 0.7, things: [], particles: [], shake: 0, hits: 0 });
  }
  function start() { reset(); state.mode = "play"; setOverlay(hud, false); hud.status.textContent = "Jump · Duck · Lean"; }
  function over() {
    state.mode = "over";
    BEST = Math.max(BEST, Math.floor(state.score));
    saveBest(KEY, BEST); hud.best.textContent = String(BEST);
    setOverlay(hud, true, "Run over!", `Score ${Math.floor(state.score)} · Tap / Space to retry`);
  }
  function changeLane(d) { if (state.mode === "play") state.lane = Math.max(0, Math.min(2, state.lane + d)); }
  function jump() { if (state.mode !== "play" || state.y > 2 || state.sliding > 0) return; state.vy = 540; state.sliding = 0; }
  function slide() { if (state.mode !== "play" || state.y > 8) return; state.sliding = 0.55; state.vy = Math.min(state.vy, 0); state.y = 0; }

  function spawn() {
    const kinds = ["low", "high", "low", "high", "block", "coin"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const n = kind === "coin" ? 1 : Math.random() < 0.35 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      state.things.push({ kind: i && kind === "block" ? "low" : kind, lane: lanes[i], z: 1.05, taken: false });
    }
  }

  function onKey(e) {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a") { e.preventDefault(); changeLane(-1); }
    else if (k === "ArrowRight" || k === "d") { e.preventDefault(); changeLane(1); }
    else if (k === "ArrowUp" || k === "w") { e.preventDefault(); jump(); }
    else if (k === "ArrowDown" || k === "s") { e.preventDefault(); slide(); }
    else if (k === " " || k === "Enter") { e.preventDefault(); if (state.mode === "ready" || state.mode === "over") start(); }
  }
  window.addEventListener("keydown", onKey);
  hud.overlay.addEventListener("click", () => { if (state.mode === "ready" || state.mode === "over") start(); });

  function update(dt) {
    if (state.mode !== "play") return;
    state.speed = 1 + Math.min(1.6, state.distance / 900);
    const worldSpeed = 0.58 * state.speed;
    state.distance += worldSpeed * 60 * dt;
    state.score += (14 + state.speed * 16) * dt;
    state.laneX += (state.lane - state.laneX) * Math.min(1, dt * 14);
    if (state.sliding > 0) state.sliding = Math.max(0, state.sliding - dt);
    if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);
    state.vy -= 1650 * dt; state.y += state.vy * dt; if (state.y < 0) { state.y = 0; state.vy = 0; }
    state.spawnT -= dt;
    if (state.spawnT <= 0) { spawn(); state.spawnT = Math.max(0.36, 0.95 - state.speed * 0.2 + Math.random() * 0.12); }
    for (const t of state.things) t.z -= worldSpeed * dt;
    const hitZ = 0.12;
    for (const t of state.things) {
      if (t.taken || t.z > hitZ + 0.06 || t.z < hitZ - 0.08 || t.lane !== state.lane) continue;
      if (t.kind === "coin") { t.taken = true; state.coins++; state.score += 50; burst(state.particles, 0, 0, "#fbbf24", 10); continue; }
      if (state.invuln > 0) continue;
      const clear = (t.kind === "low" && state.y > 18) || (t.kind === "high" && state.sliding > 0);
      if (!clear) {
        state.invuln = 1; state.hits++; burst(state.particles, canvas.clientWidth / 2, canvas.clientHeight * 0.7, "#ef4444", 14);
        if (state.hits >= 3) { over(); return; }
      }
    }
    state.things = state.things.filter((t) => t.z > -0.05 && !t.taken);
    state.particles = stepParticles(state.particles, dt);
    hud.score.textContent = String(Math.floor(state.score));
  }

  function project(lane, z, w, h) {
    const horizon = h * 0.28, t = Math.max(0, Math.min(1, 1 - z)), ease = t * t;
    const y = horizon + ease * (h - horizon);
    const topW = w * 0.16, botW = w * 0.92, widthAt = topW + (botW - topW) * ease;
    const x = w * 0.5 - widthAt / 2 + ((lane + 0.5) / 3) * widthAt;
    return { x, y, scale: 0.25 + ease * 0.95 };
  }

  function draw(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a0b05"); g.addColorStop(0.4, "#3b1d0b"); g.addColorStop(1, "#0b1624");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const horizon = h * 0.28, cx = w * 0.5, topW = w * 0.16, botW = w * 0.92;
    ctx.beginPath(); ctx.moveTo(cx - topW / 2, horizon); ctx.lineTo(cx + topW / 2, horizon); ctx.lineTo(cx + botW / 2, h); ctx.lineTo(cx - botW / 2, h); ctx.closePath();
    ctx.fillStyle = "#1e293b"; ctx.fill();
    for (const t of [...state.things].sort((a, b) => b.z - a.z)) {
      const p = project(t.lane, t.z, w, h), s = p.scale;
      if (t.kind === "coin") { ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(p.x, p.y - 28 * s, 12 * s, 0, Math.PI * 2); ctx.fill(); continue; }
      const bh = t.kind === "low" ? 34 * s : t.kind === "high" ? 26 * s : 68 * s;
      let y0 = p.y - bh; if (t.kind === "high") y0 -= 55 * s;
      ctx.fillStyle = t.kind === "low" ? "#fb923c" : t.kind === "high" ? "#38bdf8" : accent;
      roundRect(ctx, p.x - 22 * s, y0, 44 * s, bh, 8 * s); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.max(10, 13 * s)}px system-ui`; ctx.textAlign = "center";
      ctx.fillText(t.kind === "low" ? "↑ JUMP" : t.kind === "high" ? "↓ DUCK" : "WALL", p.x, y0 + bh * 0.65);
    }
    const p = project(state.laneX, 0.12, w, h), s = p.scale;
    const lift = state.y * 0.35 * s, squash = state.sliding > 0 ? 0.55 : 1;
    if (!(state.invuln > 0 && Math.floor(state.invuln * 20) % 2 === 0)) {
      ctx.fillStyle = accent; roundRect(ctx, p.x - 18 * s, p.y - lift - 70 * s * squash, 36 * s, 70 * s * squash, 10 * s); ctx.fill();
      if (state.sliding <= 0) { ctx.fillStyle = "#fdba74"; ctx.beginPath(); ctx.arc(p.x, p.y - lift - 70 * s - 12 * s, 13 * s, 0, Math.PI * 2); ctx.fill(); }
    }
    drawParticles(ctx, state.particles);
    ctx.fillStyle = "#e2e8f0"; ctx.font = "700 16px system-ui"; ctx.textAlign = "left";
    const lives = Math.max(0, 3 - state.hits);
    ctx.fillText("♥".repeat(lives) + "♡".repeat(3 - lives), 14, 28);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.last) state.last = now;
    const dt = Math.min(0.05, (now - state.last) / 1000); state.last = now;
    update(dt);
    const { w, h } = resizeCanvas(canvas, ctx);
    draw(w, h);
  }
  hud.best.textContent = String(BEST);
  document.title = `MotionPlay — ${title}`;
  qs("overlay-title").textContent = title;
  setOverlay(hud, true, title, "Jump over low barriers · duck under high bars · lean to dodge walls. Tap or Space to start.");
  window.addEventListener("resize", () => resizeCanvas(canvas, ctx));
  requestAnimationFrame(frame);
  window.__jumpRunner = { state, start, jump, slide, changeLane };
})();
