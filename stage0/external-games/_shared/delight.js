/**
 * Shared sticky-loop delight kit for MotionPlay embeds.
 * Pip reactions, goal HUD, combo floats, soft SFX, confetti win — phone-light.
 */
(function (global) {
  const CONFETTI = ["#f97316", "#ec4899", "#22c55e", "#38bdf8", "#eab308", "#a855f7", "#ef4444", "#fde68a"];
  const CHOCO = ["#7c2d12", "#92400e", "#b45309", "#78350f"];

  function createSfx() {
    let ctx = null;
    let unlocked = false;

    function ac() {
      if (ctx) return ctx;
      const Ctor = global.AudioContext || global.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      return ctx;
    }

    function unlock() {
      const c = ac();
      if (!c) return;
      if (c.state === "suspended") c.resume().catch(() => {});
      unlocked = true;
    }

    function tone(freq, dur, type, gain, slide) {
      const c = ac();
      if (!c || !unlocked) return;
      const t0 = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || "triangle";
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
      g.gain.setValueAtTime(Math.max(0.0001, gain || 0.18), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }

    function cue(name, step) {
      unlock();
      const s = Math.max(0, Math.min(12, step | 0));
      const lift = Math.pow(2, s / 12);
      if (name === "hit" || name === "pop" || name === "slice" || name === "punch") {
        tone(520 * lift, 0.1, "triangle", 0.22, 240);
        return;
      }
      if (name === "combo") {
        tone(660 * lift, 0.08, "square", 0.12);
        tone(990 * lift, 0.12, "square", 0.1);
        return;
      }
      if (name === "miss") {
        tone(280, 0.18, "sawtooth", 0.12, 120);
        return;
      }
      if (name === "win" || name === "celebrate") {
        tone(523, 0.12, "sine", 0.16);
        setTimeout(() => tone(659, 0.12, "sine", 0.14), 70);
        setTimeout(() => tone(784, 0.18, "sine", 0.14), 140);
        return;
      }
      if (name === "ui") tone(740, 0.06, "sine", 0.1);
    }

    return { cue, unlock };
  }

  /** Tiny Pip face for corner reactions — no image assets. */
  function createBuddy() {
    let mood = "idle"; // idle | cheer | wink | oops
    let until = 0;

    function setMood(next, ms) {
      mood = next || "idle";
      until = performance.now() + (ms == null ? 700 : ms);
    }

    function draw(ctx, x, y, scale, now) {
      const t = now || performance.now();
      if (t > until && mood !== "idle") mood = "idle";
      const s = scale || 1;
      const bob = Math.sin(t / 180) * 2 * s;
      const hurt = mood === "oops";
      const cheer = mood === "cheer";
      const wink = mood === "wink";

      ctx.save();
      ctx.translate(x, y + bob);
      ctx.scale(s, s);

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(0, 28, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // body
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.ellipse(0, 8, 16, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff7ed";
      ctx.beginPath();
      ctx.ellipse(3, 12, 9, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // head
      const hy = cheer ? -18 : hurt ? -14 : -16;
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.ellipse(0, hy, 14, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff7ed";
      ctx.beginPath();
      ctx.ellipse(4, hy + 3, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // ears
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(-12, hy - 4);
      ctx.lineTo(-8, hy - 22);
      ctx.lineTo(-2, hy - 6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, hy - 6);
      ctx.lineTo(10, hy - 22);
      ctx.lineTo(14, hy - 4);
      ctx.fill();

      // eyes
      const blink = Math.sin(t / 900) > 0.985;
      ctx.fillStyle = "#fff";
      if (!blink) {
        ctx.beginPath();
        ctx.ellipse(-4, hy - 1, 3.2, wink ? 0.7 : 3.2, 0, 0, Math.PI * 2);
        ctx.ellipse(6, hy - 1, 3.2, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1f2937";
        ctx.beginPath();
        ctx.arc(-3.2, hy - 1, 1.6, 0, Math.PI * 2);
        ctx.arc(6.8, hy - 1, 1.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "#1f2937";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-7, hy - 1);
        ctx.lineTo(-1, hy - 1);
        ctx.moveTo(3, hy - 1);
        ctx.lineTo(9, hy - 1);
        ctx.stroke();
      }

      // nose + mouth
      ctx.fillStyle = "#1f2937";
      ctx.beginPath();
      ctx.ellipse(10, hy + 3, 2.2, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (hurt) ctx.arc(5, hy + 8, 3.5, Math.PI, 0);
      else if (cheer) ctx.arc(5, hy + 6, 4.5, 0.15, Math.PI - 0.15);
      else ctx.arc(5, hy + 7, 3.2, 0.2, Math.PI - 0.2);
      ctx.stroke();

      // sparkles when cheering
      if (cheer) {
        ctx.fillStyle = "#fbbf24";
        for (let i = 0; i < 3; i++) {
          const a = t / 120 + i * 2.1;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 22, hy - 8 + Math.sin(a) * 10, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
      return mood;
    }

    return {
      setMood,
      draw,
      get mood() {
        return mood;
      },
    };
  }

  function createFloats() {
    const items = [];
    function push(text, x, y, color) {
      items.push({
        text,
        x,
        y,
        vy: -48 - Math.random() * 30,
        life: 0.85,
        color: color || "#fff7ed",
      });
    }
    function step(dt) {
      for (const f of items) {
        f.life -= dt;
        f.y += f.vy * dt;
        f.vy += 20 * dt;
      }
      for (let i = items.length - 1; i >= 0; i--) if (items[i].life <= 0) items.splice(i, 1);
    }
    function draw(ctx) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const f of items) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
        ctx.font = "800 22px Nunito, system-ui, sans-serif";
        ctx.fillStyle = f.color;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 4;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }
    return { push, step, draw, items };
  }

  function createConfetti() {
    let parts = [];
    let active = false;
    let left = 0;

    function burst(w, h, n) {
      active = true;
      left = 2.4;
      const count = n || 56;
      parts = [];
      for (let i = 0; i < count; i++) {
        const choco = Math.random() < 0.35;
        parts.push({
          x: Math.random() * w,
          y: -20 - Math.random() * h * 0.4,
          vx: (Math.random() - 0.5) * 180,
          vy: 80 + Math.random() * 220,
          rot: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 8,
          size: choco ? 10 + Math.random() * 8 : 6 + Math.random() * 6,
          color: choco ? CHOCO[(Math.random() * CHOCO.length) | 0] : CONFETTI[(Math.random() * CONFETTI.length) | 0],
          kind: choco ? "choco" : "bit",
        });
      }
    }

    function step(dt, w, h) {
      if (!active) return;
      left -= dt;
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 420 * dt;
        p.rot += p.spin * dt;
      }
      if (left <= 0) {
        active = false;
        parts = [];
      }
    }

    function draw(ctx) {
      if (!active) return;
      for (const p of parts) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.kind === "choco") {
          ctx.fillRect(-p.size * 0.7, -p.size * 0.35, p.size * 1.4, p.size * 0.7);
        } else {
          ctx.fillRect(-p.size * 0.35, -p.size * 0.7, p.size * 0.7, p.size * 1.4);
        }
        ctx.restore();
      }
    }

    return {
      burst,
      step,
      draw,
      get active() {
        return active;
      },
    };
  }

  /**
   * Sticky loop helper: clear goals, combo, celebrate, funny miss.
   * @param {{ baseGoal:number, goalStep?:number, label:(n:number)=>string, missLimit?:number }} opts
   */
  function createLoop(opts) {
    const baseGoal = opts.baseGoal || 10;
    const goalStep = opts.goalStep == null ? 4 : opts.goalStep;
    const labelFn = opts.label || ((n) => `Goal ${n}`);
    const missLimit = opts.missLimit || 5;

    const state = {
      level: 1,
      goal: baseGoal,
      progress: 0,
      combo: 0,
      bestCombo: 0,
      misses: 0,
      shake: 0,
      celebrate: 0,
    };

    function goalLabel() {
      return labelFn(state.goal);
    }

    function resetRound() {
      state.level = 1;
      state.goal = baseGoal;
      state.progress = 0;
      state.combo = 0;
      state.misses = 0;
      state.shake = 0;
      state.celebrate = 0;
    }

    function nextLevel() {
      state.level += 1;
      state.goal = baseGoal + (state.level - 1) * goalStep;
      state.progress = 0;
      state.combo = 0;
      state.celebrate = 0;
    }

    /** @returns {{ cleared:boolean, combo:number }} */
    function hit() {
      state.progress += 1;
      state.combo += 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      const cleared = state.progress >= state.goal;
      if (cleared) state.celebrate = 2.2;
      return { cleared, combo: state.combo };
    }

    /** @returns {{ failed:boolean }} */
    function miss() {
      state.combo = 0;
      state.misses += 1;
      state.shake = 0.35;
      return { failed: state.misses >= missLimit };
    }

    function step(dt) {
      if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
      if (state.celebrate > 0) state.celebrate = Math.max(0, state.celebrate - dt);
    }

    function drawHud(ctx, w, h, accent) {
      const pad = 12;
      // Goal pill top-center
      const text = `${goalLabel()}  ·  ${state.progress}/${state.goal}`;
      ctx.font = "800 15px Nunito, system-ui, sans-serif";
      const tw = ctx.measureText(text).width;
      const bw = tw + 28;
      const bx = (w - bw) / 2;
      const by = 10;
      ctx.fillStyle = "rgba(15,23,42,0.55)";
      roundPill(ctx, bx, by, bw, 30, 15);
      ctx.fill();
      ctx.strokeStyle = accent || "#f97316";
      ctx.lineWidth = 2;
      roundPill(ctx, bx, by, bw, 30, 15);
      ctx.stroke();
      ctx.fillStyle = "#ecfdf8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, by + 15);

      // Combo
      if (state.combo >= 2) {
        ctx.font = "800 20px Nunito, system-ui, sans-serif";
        ctx.fillStyle = "#fde68a";
        ctx.textAlign = "right";
        ctx.fillText(`x${state.combo} combo`, w - pad, 58);
      }

      // Misses
      ctx.font = "700 14px Nunito, system-ui, sans-serif";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "left";
      ctx.fillText(`Miss ${state.misses}/${missLimit}`, pad, 58);

      // Level badge
      ctx.fillStyle = "rgba(15,155,142,0.35)";
      roundPill(ctx, pad, 10, 64, 26, 13);
      ctx.fill();
      ctx.fillStyle = "#99f6e4";
      ctx.font = "800 13px Nunito, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Lv ${state.level}`, pad + 32, 23);
    }

    function roundPill(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    return {
      state,
      goalLabel,
      resetRound,
      nextLevel,
      hit,
      miss,
      step,
      drawHud,
      missLimit,
    };
  }

  function funnyMissLine() {
    const lines = [
      "Whoopsie! Almost…",
      "Pip giggled — try again!",
      "Boing! Soft miss",
      "Silly slip — you got this",
      "Air ball! Hehe",
    ];
    return lines[(Math.random() * lines.length) | 0];
  }

  function funnyFailTitle() {
    const lines = ["Oh nooo!", "Giggle wipeout!", "Pip face-plant!", "Comedy crash!"];
    return lines[(Math.random() * lines.length) | 0];
  }

  global.MPDelight = {
    createSfx,
    createBuddy,
    createFloats,
    createConfetti,
    createLoop,
    funnyMissLine,
    funnyFailTitle,
  };
})(window);
