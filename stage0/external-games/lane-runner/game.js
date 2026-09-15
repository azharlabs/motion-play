/**
 * MotionPlay Lane Runner — original 3-lane endless runner.
 * Arrow keys: left/right lanes, up jump, down slide.
 */
(() => {
  const cfg = (window.MPMini && MPMini.readConfig()) || {};
  const bindParentStop = window.MPMini && MPMini.bindParentStop;
  const gameTitle = cfg.title || "Lane Runner";
  const accent = cfg.accent || "#f97316";
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hudScore = document.getElementById("score");
  const hudBest = document.getElementById("best");
  const hudStatus = document.getElementById("status");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayBody = document.getElementById("overlay-body");
  if (overlayTitle) overlayTitle.textContent = gameTitle;
  document.title = "MotionPlay — " + gameTitle;

  const LANES = 3;
  const STORAGE_KEY = "motionplay.lane-runner.best";
  const BEST = Number(localStorage.getItem(STORAGE_KEY) || 0);

  const state = {
    mode: "ready", // ready | play | pause | over
    lane: 1,
    laneX: 1,
    y: 0,
    vy: 0,
    sliding: 0,
    invuln: 0,
    distance: 0,
    score: 0,
    coins: 0,
    speed: 1,
    spawnT: 0.8,
    things: [],
    particles: [],
    shake: 0,
    nextId: 1,
    last: 0,
  };

  if (bindParentStop) bindParentStop(state, () => {
    setOverlay(true, "Paused", "Stopped from MotionPlay · tap or Space to continue");
    hudStatus.textContent = "Paused";
  });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function laneToX(lane, w) {
    const margin = w * 0.18;
    const usable = w - margin * 2;
    return margin + ((lane + 0.5) / LANES) * usable;
  }

  function resetRun() {
    state.lane = 1;
    state.laneX = 1;
    state.y = 0;
    state.vy = 0;
    state.sliding = 0;
    state.invuln = 0;
    state.distance = 0;
    state.score = 0;
    state.coins = 0;
    state.speed = 1;
    state.spawnT = 0.9;
    state.things = [];
    state.particles = [];
    state.shake = 0;
    state.nextId = 1;
    state._hits = 0;
  }

  function setOverlay(show, title, body) {
    overlay.hidden = !show;
    if (title != null) overlayTitle.textContent = title;
    if (body != null) overlayBody.textContent = body;
  }

  function start() {
    resetRun();
    state.mode = "play";
    setOverlay(false);
    hudStatus.textContent = "Lean · Jump · Duck";
  }

  function gameOver() {
    state.mode = "over";
    const best = Math.max(BEST, Math.floor(state.score));
    localStorage.setItem(STORAGE_KEY, String(best));
    hudBest.textContent = String(best);
    setOverlay(
      true,
      "Run over!",
      `Score ${Math.floor(state.score)} · Coins ${state.coins} · Tap or press Space to retry`,
    );
    hudStatus.textContent = "Tap / Space to retry";
    burst(laneToX(state.laneX, canvas.clientWidth), canvas.clientHeight * 0.72, "#f97316", 18);
  }

  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      state.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 280,
        vy: -Math.random() * 220 - 40,
        life: 0.45 + Math.random() * 0.35,
        color,
      });
    }
  }

  function spawn() {
    const kinds = ["block", "low", "high", "coin"];
    const roll = Math.random();
    let kind = "block";
    if (roll < 0.28) kind = "low";
    else if (roll < 0.5) kind = "high";
    else if (roll < 0.72) kind = "coin";

    const ramp = Math.min(1, state.distance / 1200);
    const blocked = Math.random() < 0.22 + 0.35 * ramp ? 2 : 1;
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);

    if (kind === "coin") {
      state.things.push({
        id: state.nextId++,
        kind: "coin",
        lane: lanes[0],
        z: 1.05,
        taken: false,
      });
      return;
    }

    const obstacleLanes = lanes.slice(0, blocked);
    for (const lane of obstacleLanes) {
      // Prefer variety; avoid identical kind on both if two
      const k =
        blocked === 2 && lane === obstacleLanes[1]
          ? kinds[Math.floor(Math.random() * 3)]
          : kind;
      state.things.push({
        id: state.nextId++,
        kind: k === "coin" ? "block" : k,
        lane,
        z: 1.05,
        taken: false,
      });
    }
  }

  function changeLane(dir) {
    if (state.mode !== "play") return;
    const next = Math.max(0, Math.min(2, state.lane + dir));
    if (next !== state.lane) state.lane = next;
  }

  function jump() {
    if (state.mode !== "play") return;
    if (state.y > 2 || state.sliding > 0) return;
    state.vy = 520;
    state.sliding = 0;
  }

  function slide() {
    if (state.mode !== "play") return;
    if (state.y > 8) return;
    state.sliding = 0.55;
    state.vy = Math.min(state.vy, 0);
    state.y = 0;
  }

  function onKey(e, down) {
    const key = e.key;
    if (!down) return;
    if (key === "ArrowLeft" || key === "a" || key === "A") {
      e.preventDefault();
      changeLane(-1);
    } else if (key === "ArrowRight" || key === "d" || key === "D") {
      e.preventDefault();
      changeLane(1);
    } else if (key === "ArrowUp" || key === "w" || key === "W") {
      e.preventDefault();
      jump();
    } else if (key === "ArrowDown" || key === "s" || key === "S") {
      e.preventDefault();
      slide();
    } else if (key === " " || key === "Enter") {
      e.preventDefault();
      if (state.mode === "ready" || state.mode === "over") start();
      else if (state.mode === "pause") {
        state.mode = "play";
        setOverlay(false);
      }
    } else if (key === "p" || key === "P") {
      if (state.mode === "play") {
        state.mode = "pause";
        setOverlay(true, "Paused", "Press P or Space to continue");
      } else if (state.mode === "pause") {
        state.mode = "play";
        setOverlay(false);
      }
    }
  }

  window.addEventListener("keydown", (e) => onKey(e, true));
  overlay.addEventListener("click", () => {
    if (state.mode === "ready" || state.mode === "over") start();
    else if (state.mode === "pause") {
      state.mode = "play";
      setOverlay(false);
    }
  });

  // Swipe / tap fallback for keyboard-less testing
  let touchX = 0;
  let touchY = 0;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      touchX = t.clientX;
      touchY = t.clientY;
      if (state.mode === "ready" || state.mode === "over") start();
    },
    { passive: true },
  );
  canvas.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchX;
      const dy = t.clientY - touchY;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) changeLane(dx < 0 ? -1 : 1);
      else if (dy < 0) jump();
      else slide();
    },
    { passive: true },
  );

  function update(dt) {
    if (state.mode !== "play") return;

    state.speed = 1 + Math.min(1.8, state.distance / 900);
    const worldSpeed = 0.55 * state.speed;
    state.distance += worldSpeed * 60 * dt;
    state.score += (12 + state.speed * 18) * dt + state.coins * 0;

    state.laneX += (state.lane - state.laneX) * Math.min(1, dt * 14);

    if (state.sliding > 0) state.sliding = Math.max(0, state.sliding - dt);
    if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

    state.vy -= 1600 * dt;
    state.y += state.vy * dt;
    if (state.y < 0) {
      state.y = 0;
      state.vy = 0;
    }

    state.spawnT -= dt;
    if (state.spawnT <= 0) {
      spawn();
      state.spawnT = Math.max(0.38, 1.05 - state.speed * 0.22 + Math.random() * 0.15);
    }

    const hitZ = 0.12;
    for (const thing of state.things) {
      thing.z -= worldSpeed * dt;
    }

    const playerLane = state.lane;
    const jumping = state.y > 18;
    const sliding = state.sliding > 0;

    for (const thing of state.things) {
      if (thing.taken || thing.z > hitZ + 0.06 || thing.z < hitZ - 0.08) continue;
      if (thing.lane !== playerLane) continue;

      if (thing.kind === "coin") {
        thing.taken = true;
        state.coins += 1;
        state.score += 50;
        burst(laneToX(state.laneX, canvas.clientWidth), canvas.clientHeight * 0.62, "#fbbf24", 12);
        continue;
      }

      if (state.invuln > 0) continue;

      let clear = false;
      if (thing.kind === "low" && jumping) clear = true;
      if (thing.kind === "high" && sliding) clear = true;
      if (thing.kind === "block") clear = false;

      if (!clear) {
        state.invuln = 1.1;
        state.shake = 0.35;
        state.score = Math.max(0, state.score - 40);
        burst(laneToX(state.laneX, canvas.clientWidth), canvas.clientHeight * 0.7, "#ef4444", 16);
        // One-hit for sticky arcade feel after a short grace via lives-as-invuln
        // End run on next solid hit while still recovering? Use 3 soft hits via score flag
        state._hits = (state._hits || 0) + 1;
        if (state._hits >= 3) {
          gameOver();
          return;
        }
      }
    }

    state.things = state.things.filter((t) => t.z > -0.05 && !t.taken);

    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 600 * dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);

    hudScore.textContent = String(Math.floor(state.score));
  }

  function drawRoad(w, h) {
    const horizon = h * 0.28;
    const groundTop = horizon;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b1a33");
    g.addColorStop(0.35, "#12263f");
    g.addColorStop(1, "#071018");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Sky glow
    const sky = ctx.createRadialGradient(w * 0.5, horizon - 20, 10, w * 0.5, horizon, w * 0.55);
    sky.addColorStop(0, "rgba(249,115,22,0.35)");
    sky.addColorStop(0.45, "rgba(56,189,248,0.12)");
    sky.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 40);

    // Twinkle field
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    for (let i = 0; i < 28; i++) {
      const x = ((i * 97) % 1000) / 1000 * w;
      const y = ((i * 53) % 1000) / 1000 * horizon;
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(state.distance * 0.02 + i));
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Far hills
    ctx.fillStyle = "rgba(15,23,42,0.85)";
    ctx.beginPath(); ctx.moveTo(0, horizon);
    for (let i = 0; i <= 6; i++) {
      const x = (i / 6) * w;
      const y = horizon - 18 - Math.sin(i * 1.7 + state.distance * 0.01) * 12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizon); ctx.closePath(); ctx.fill();

    // Perspective road trapezoid
    const topW = w * 0.16;
    const botW = w * 0.92;
    const cx = w * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2, groundTop);
    ctx.lineTo(cx + topW / 2, groundTop);
    ctx.lineTo(cx + botW / 2, h);
    ctx.lineTo(cx - botW / 2, h);
    ctx.closePath();
    const road = ctx.createLinearGradient(0, groundTop, 0, h);
    road.addColorStop(0, "#1e293b");
    road.addColorStop(1, "#0f172a");
    ctx.fillStyle = road;
    ctx.fill();

    // Lane lines
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2, groundTop);
    ctx.lineTo(cx + topW / 2, groundTop);
    ctx.lineTo(cx + botW / 2, h);
    ctx.lineTo(cx - botW / 2, h);
    ctx.closePath();
    ctx.clip();

    const scroll = (state.distance * 0.08) % 1;
    for (let i = 0; i < 14; i++) {
      const t = (i / 14 + scroll) % 1;
      const y = groundTop + t * t * (h - groundTop);
      const widthAt = topW + (botW - topW) * ((y - groundTop) / (h - groundTop));
      const alpha = 0.15 + t * 0.55;
      ctx.strokeStyle = `rgba(148,163,184,${alpha})`;
      ctx.lineWidth = 2 + t * 4;
      for (const frac of [1 / 3, 2 / 3]) {
        const x = cx - widthAt / 2 + widthAt * frac;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 10 + t * 28);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Side rails
    ctx.strokeStyle = "rgba(249,115,22,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2, groundTop);
    ctx.lineTo(cx - botW / 2, h);
    ctx.moveTo(cx + topW / 2, groundTop);
    ctx.lineTo(cx + botW / 2, h);
    ctx.stroke();
  }

  function project(lane, z, w, h) {
    const horizon = h * 0.28;
    const t = Math.max(0, Math.min(1, 1 - z));
    const ease = t * t;
    const y = horizon + ease * (h - horizon);
    const topW = w * 0.16;
    const botW = w * 0.92;
    const widthAt = topW + (botW - topW) * ease;
    const cx = w * 0.5;
    const x = cx - widthAt / 2 + ((lane + 0.5) / LANES) * widthAt;
    const scale = 0.25 + ease * 0.95;
    return { x, y, scale, widthAt };
  }

  function drawThings(w, h) {
    const ordered = [...state.things].sort((a, b) => b.z - a.z);
    for (const thing of ordered) {
      const p = project(thing.lane, thing.z, w, h);
      const s = p.scale;
      if (thing.kind === "coin") {
        const cx = p.x, cy = p.y - 30 * s, r = 14 * s;
        const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2);
        glow.addColorStop(0, "rgba(251,191,36,0.55)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, r * 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#fbbf24";
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath(); ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.28, 0, Math.PI * 2); ctx.fill();
        continue;
      }

      const bw = 46 * s;
      const bh =
        thing.kind === "low" ? 36 * s : thing.kind === "high" ? 28 * s : 70 * s;
      const baseY = p.y;
      let y0 = baseY - bh;
      if (thing.kind === "high") y0 = baseY - bh - 55 * s;

      ctx.fillStyle =
        thing.kind === "low" ? "#fb923c" : thing.kind === "high" ? "#38bdf8" : "#ef4444";
      roundRect(p.x - bw / 2, y0, bw, bh, 8 * s);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `bold ${Math.max(10, 14 * s)}px system-ui`;
      ctx.textAlign = "center";
      const hint = thing.kind === "low" ? "↑" : thing.kind === "high" ? "↓" : "↔";
      ctx.fillText(hint, p.x, y0 + bh * 0.65);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlayer(w, h) {
    const p = project(state.laneX, 0.12, w, h);
    const s = p.scale;
    const jumpLift = state.y * 0.35 * s;
    const slideSquash = state.sliding > 0 ? 0.55 : 1;
    const bodyH = 70 * s * slideSquash;
    const bodyW = 36 * s * (state.sliding > 0 ? 1.25 : 1);
    const x = p.x;
    const y = p.y - jumpLift;

    if (state.invuln > 0 && Math.floor(state.invuln * 20) % 2 === 0) return;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, p.y + 4, 22 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = accent;
    roundRect(x - bodyW / 2, y - bodyH, bodyW, bodyH, 10 * s);
    ctx.fill();

    // Head
    if (state.sliding <= 0) {
      ctx.fillStyle = "#fdba74";
      ctx.beginPath();
      ctx.arc(x, y - bodyH - 12 * s, 14 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Motion trail
    ctx.strokeStyle = "rgba(56,189,248,0.5)";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(x - 8 * s, y - 10 * s);
    ctx.lineTo(x - 28 * s, y + 10 * s);
    ctx.stroke();
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawHudExtras(w, h) {
    const hits = state._hits || 0;
    const lives = Math.max(0, 3 - hits);
    ctx.textAlign = "left";
    ctx.font = "700 16px system-ui";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText("♥".repeat(lives) + "♡".repeat(3 - lives), 14, 28);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.last) state.last = now;
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;

    update(dt);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }
    drawRoad(w, h);
    drawThings(w, h);
    drawPlayer(w, h);
    drawParticles();
    drawHudExtras(w, h);
    ctx.restore();
  }

  hudBest.textContent = String(BEST);
  setOverlay(
    true,
    gameTitle,
    "Body lean changes lanes · jump clears low barriers · duck slides under high bars. Tap or Space to start.",
  );
  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(frame);

  // Expose for quick smoke checks
  window.__laneRunner = { state, start, changeLane, jump, slide };
})();
