/**
 * Shared level-clear celebration: chocolate/confetti shower, Pip dancing,
 * a short SFX, and a Continue button. The shell pauses the round until the
 * kid taps through — no plain auto-skip past a level up.
 *
 * Mount once on the play stage; call show(level) when the HUD level climbs.
 */
import { drawMascot } from "./mascot.js";

const CHOCOLATE = ["#7c2d12", "#92400e", "#b45309", "#78350f", "#5c3310", "#3f1f0a"];
const CONFETTI = ["#f97316", "#ec4899", "#22c55e", "#38bdf8", "#eab308", "#a855f7", "#ef4444", "#fde68a"];

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return { w: rect.width || 1, h: rect.height || 1, dpr };
}

/**
 * @param {{ parent: HTMLElement, fx?: { cue: Function } }} opts
 */
export function createCelebration({ parent, fx = null } = {}) {
  if (!parent) throw new Error("createCelebration needs a parent element");

  const root = document.createElement("div");
  root.className = "celebrate";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "celebrate-title");
  root.innerHTML = `
    <canvas class="celebrate-fx" aria-hidden="true"></canvas>
    <div class="celebrate-card">
      <canvas class="celebrate-mascot" width="160" height="160" aria-hidden="true"></canvas>
      <p class="celebrate-eyebrow">Level clear!</p>
      <strong class="celebrate-title" id="celebrate-title">Level 2!</strong>
      <p class="celebrate-sub">Chocolate shower time</p>
      <button type="button" class="primary celebrate-continue">Continue</button>
    </div>
  `;
  parent.appendChild(root);

  const fxCanvas = root.querySelector(".celebrate-fx");
  const mascotCanvas = root.querySelector(".celebrate-mascot");
  const titleEl = root.querySelector(".celebrate-title");
  const btn = root.querySelector(".celebrate-continue");

  let active = false;
  let particles = [];
  let level = 1;
  let t0 = 0;
  let animT = 0;

  function spawnShower(view) {
    const count = 72;
    particles = [];
    for (let i = 0; i < count; i += 1) {
      const chocolate = Math.random() < 0.45;
      particles.push({
        x: Math.random(),
        y: -0.05 - Math.random() * 0.55,
        vx: (Math.random() - 0.5) * 0.18,
        vy: 0.22 + Math.random() * 0.45,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 8,
        size: chocolate ? 0.018 + Math.random() * 0.02 : 0.01 + Math.random() * 0.014,
        color: chocolate
          ? CHOCOLATE[(Math.random() * CHOCOLATE.length) | 0]
          : CONFETTI[(Math.random() * CONFETTI.length) | 0],
        kind: chocolate ? "choco" : "confetti",
        wobble: Math.random() * Math.PI * 2,
      });
    }
    // A few bigger chocolate bars near the top for the "shower" read.
    for (let i = 0; i < 10; i += 1) {
      particles.push({
        x: 0.1 + Math.random() * 0.8,
        y: -0.1 - Math.random() * 0.3,
        vx: (Math.random() - 0.5) * 0.1,
        vy: 0.28 + Math.random() * 0.25,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 4,
        size: 0.032 + Math.random() * 0.02,
        color: CHOCOLATE[(Math.random() * CHOCOLATE.length) | 0],
        kind: "bar",
        wobble: 0,
      });
    }
    void view;
  }

  function drawParticles(ctx, view, dt) {
    const u = Math.min(view.w, view.h);
    for (const p of particles) {
      p.wobble += dt * 4;
      p.x += (p.vx + Math.sin(p.wobble) * 0.04) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.y > 1.15) {
        p.y = -0.08;
        p.x = Math.random();
      }
      const px = p.x * view.w;
      const py = p.y * view.h;
      const s = p.size * u;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === "bar") {
        ctx.fillRect(-s * 1.4, -s * 0.55, s * 2.8, s * 1.1);
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(-s * 1.2, -s * 0.35, s * 1.6, s * 0.28);
      } else if (p.kind === "choco") {
        ctx.beginPath();
        ctx.roundRect(-s, -s * 0.7, s * 2, s * 1.4, s * 0.25);
        ctx.fill();
      } else {
        ctx.fillRect(-s * 0.7, -s * 1.4, s * 1.4, s * 2.8);
      }
      ctx.restore();
    }
  }

  function drawDance(now) {
    const ctx = mascotCanvas.getContext("2d");
    const dpr = Math.min(2, typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1);
    const css = 160;
    if (mascotCanvas.width !== css * dpr) {
      mascotCanvas.width = css * dpr;
      mascotCanvas.height = css * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);

    const beat = (now - t0) / 1000;
    // Alternate run / jump so Pip reads as dancing rather than jogging in place.
    const hop = Math.sin(beat * 8);
    const state = hop > 0.35 ? "jump" : "run";
    const jumpHeight = Math.max(0, hop) * 22;
    const sway = Math.sin(beat * 5) * 10;

    ctx.save();
    ctx.translate(css / 2 + sway, 0);
    drawMascot(ctx, {
      x: -27,
      groundY: css * 0.88,
      state,
      t: now,
      jumpHeight,
      scale: 1.05,
    });
    ctx.restore();
  }

  function show(nextLevel, now = performance.now()) {
    level = nextLevel;
    active = true;
    t0 = now;
    animT = 0;
    root.hidden = false;
    titleEl.textContent = `Level ${level}!`;
    const view = fitCanvas(fxCanvas);
    spawnShower(view);
    // Prefer the dedicated cue; fall back so older feedback stubs still cheer.
    if (fx?.cue) {
      if (!fx.cue("celebrate")) fx.cue("finish");
    }
    // Phone-first: focus the button so a second tap (or Enter) continues.
    queueMicrotask(() => btn.focus({ preventScroll: true }));
  }

  function hide() {
    if (!active && root.hidden) return;
    active = false;
    root.hidden = true;
    particles = [];
    const ctx = fxCanvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  }

  function frame(now, dt) {
    if (!active) return;
    animT += dt;
    const view = fitCanvas(fxCanvas);
    const ctx = fxCanvas.getContext("2d");
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    drawParticles(ctx, view, dt);
    drawDance(now);
  }

  btn.addEventListener("click", () => {
    fx?.cue?.("ui");
    hide();
  });

  return {
    get active() {
      return active;
    },
    show,
    hide,
    frame,
  };
}
