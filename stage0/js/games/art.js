/**
 * Tiny illustrations for the home screen cards. Each one paints into whatever
 * box it is handed, so the same routine works for a phone thumbnail and a
 * desktop card.
 */
const round = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

function sky(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function ground(ctx, w, h, color, at = 0.72) {
  ctx.fillStyle = color;
  ctx.fillRect(0, h * at, w, h * (1 - at));
}

function stickFigure(ctx, x, y, s, color = "#1f2937", pose = "stand") {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y - s * 1.15, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.85);
  ctx.lineTo(x, y - s * 0.2);
  ctx.stroke();
  ctx.beginPath();
  if (pose === "reach") {
    ctx.moveTo(x - s * 0.55, y - s * 1.1);
    ctx.lineTo(x, y - s * 0.7);
    ctx.lineTo(x + s * 0.55, y - s * 1.1);
  } else if (pose === "wide") {
    ctx.moveTo(x - s * 0.62, y - s * 0.55);
    ctx.lineTo(x, y - s * 0.72);
    ctx.lineTo(x + s * 0.62, y - s * 0.55);
  } else {
    ctx.moveTo(x - s * 0.5, y - s * 0.4);
    ctx.lineTo(x, y - s * 0.7);
    ctx.lineTo(x + s * 0.5, y - s * 0.4);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, y + s * 0.45);
  ctx.lineTo(x, y - s * 0.2);
  ctx.lineTo(x + s * 0.4, y + s * 0.45);
  ctx.stroke();
}

const PAINTERS = {
  "jump-the-wall"(ctx, w, h) {
    sky(ctx, w, h, "#8ed7f7", "#d9f2ff");
    ground(ctx, w, h, "#5cb874");
    ctx.fillStyle = "#94a3b8";
    round(ctx, w * 0.62, h * 0.42, w * 0.13, h * 0.3, 3);
    ctx.fill();
    stickFigure(ctx, w * 0.33, h * 0.6, h * 0.2, "#f97316", "reach");
  },

  "balloon-pop"(ctx, w, h) {
    sky(ctx, w, h, "#ffe1ef", "#fff6fa");
    const balloons = [
      [0.24, 0.36, "#ff5d8f"],
      [0.52, 0.24, "#4cc9f0"],
      [0.78, 0.42, "#ffd166"],
    ];
    for (const [bx, by, c] of balloons) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(w * bx, h * by, w * 0.075, h * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = Math.max(1, w * 0.008);
      ctx.beginPath();
      ctx.moveTo(w * bx, h * by + h * 0.15);
      ctx.lineTo(w * bx, h * by + h * 0.3);
      ctx.stroke();
    }
    stickFigure(ctx, w * 0.5, h * 0.95, h * 0.24, "#be185d", "reach");
  },

  "lane-runner"(ctx, w, h) {
    sky(ctx, w, h, "#bfe9ff", "#e8f7e4");
    ctx.fillStyle = "#7cc47f";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#4b5563";
    ctx.fillRect(w * 0.22, 0, w * 0.56, h);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect(w * 0.4, h * (0.08 + i * 0.32), w * 0.025, h * 0.16);
      ctx.fillRect(w * 0.575, h * (0.08 + i * 0.32), w * 0.025, h * 0.16);
    }
    ctx.fillStyle = "#b45309";
    round(ctx, w * 0.26, h * 0.2, w * 0.13, h * 0.2, 3);
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    round(ctx, w * 0.61, h * 0.62, w * 0.14, h * 0.22, 4);
    ctx.fill();
  },

  "fruit-slice"(ctx, w, h) {
    sky(ctx, w, h, "#dcfce7", "#f7fee7");
    const fruit = [
      [0.28, 0.6, "#ef4444"],
      [0.55, 0.34, "#f59e0b"],
      [0.76, 0.62, "#84cc16"],
    ];
    for (const [fx, fy, c] of fruit) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(w * fx, h * fy, h * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = Math.max(2, h * 0.05);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(w * 0.12, h * 0.82);
    ctx.quadraticCurveTo(w * 0.5, h * 0.1, w * 0.92, h * 0.5);
    ctx.stroke();
  },

  goalkeeper(ctx, w, h) {
    sky(ctx, w, h, "#c7d2fe", "#eef2ff");
    ground(ctx, w, h, "#4ade80", 0.78);
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = Math.max(2, h * 0.05);
    ctx.strokeRect(w * 0.12, h * 0.24, w * 0.76, h * 0.54);
    stickFigure(ctx, w * 0.42, h * 0.76, h * 0.2, "#4338ca", "wide");
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(w * 0.74, h * 0.5, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = Math.max(1, h * 0.018);
    ctx.stroke();
  },

  "punch-out"(ctx, w, h) {
    sky(ctx, w, h, "#fee2e2", "#fff1f2");
    for (const [px, py, on] of [
      [0.28, 0.38, true],
      [0.72, 0.38, false],
    ]) {
      ctx.fillStyle = on ? "#ef4444" : "#fca5a5";
      ctx.beginPath();
      ctx.arc(w * px, h * py, h * 0.19, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = Math.max(1, h * 0.02);
      ctx.stroke();
    }
    stickFigure(ctx, w * 0.5, h * 0.98, h * 0.22, "#991b1b", "reach");
  },

  "sky-flap"(ctx, w, h) {
    sky(ctx, w, h, "#99f6e4", "#ecfeff");
    ctx.fillStyle = "#0d9488";
    ctx.fillRect(w * 0.58, 0, w * 0.16, h * 0.34);
    ctx.fillRect(w * 0.58, h * 0.66, w * 0.16, h * 0.34);
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.5, h * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.5);
    ctx.lineTo(w * 0.18, h * 0.36);
    ctx.lineTo(w * 0.2, h * 0.56);
    ctx.closePath();
    ctx.fill();
  },

  "ski-slalom"(ctx, w, h) {
    sky(ctx, w, h, "#e0f2fe", "#ffffff");
    ctx.strokeStyle = "#bae6fd";
    ctx.lineWidth = Math.max(2, h * 0.04);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 0);
    ctx.quadraticCurveTo(w * 0.2, h * 0.5, w * 0.6, h);
    ctx.stroke();
    for (const [fx, fy, c] of [
      [0.3, 0.3, "#ef4444"],
      [0.66, 0.58, "#3b82f6"],
    ]) {
      ctx.fillStyle = c;
      ctx.fillRect(w * fx, h * fy, w * 0.04, h * 0.24);
      ctx.beginPath();
      ctx.moveTo(w * fx + w * 0.04, h * fy);
      ctx.lineTo(w * fx + w * 0.16, h * fy + h * 0.05);
      ctx.lineTo(w * fx + w * 0.04, h * fy + h * 0.1);
      ctx.closePath();
      ctx.fill();
    }
  },

  "squat-rush"(ctx, w, h) {
    sky(ctx, w, h, "#f3e8ff", "#faf5ff");
    ground(ctx, w, h, "#c4b5fd", 0.8);
    stickFigure(ctx, w * 0.32, h * 0.78, h * 0.2, "#7c3aed", "stand");
    stickFigure(ctx, w * 0.68, h * 0.82, h * 0.15, "#a855f7", "wide");
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = Math.max(2, h * 0.035);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.28);
    ctx.lineTo(w * 0.5, h * 0.56);
    ctx.moveTo(w * 0.44, h * 0.5);
    ctx.lineTo(w * 0.5, h * 0.58);
    ctx.lineTo(w * 0.56, h * 0.5);
    ctx.stroke();
  },

  "pose-match"(ctx, w, h) {
    sky(ctx, w, h, "#fef9c3", "#fffbeb");
    ctx.fillStyle = "rgba(234,179,8,0.35)";
    round(ctx, w * 0.16, h * 0.12, w * 0.68, h * 0.76, h * 0.1);
    ctx.fill();
    ctx.setLineDash([h * 0.07, h * 0.05]);
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = Math.max(2, h * 0.03);
    round(ctx, w * 0.16, h * 0.12, w * 0.68, h * 0.76, h * 0.1);
    ctx.stroke();
    ctx.setLineDash([]);
    stickFigure(ctx, w * 0.5, h * 0.8, h * 0.22, "#a16207", "wide");
  },

  "hand-snake"(ctx, w, h) {
    sky(ctx, w, h, "#dcfce7", "#f0fdf4");

    // A body curling towards an apple, drawn as one stroke laid over itself
    // so the light back shows along the top of the green.
    const spine = [
      [0.1, 0.78],
      [0.3, 0.84],
      [0.46, 0.66],
      [0.34, 0.44],
      [0.5, 0.3],
      [0.68, 0.4],
    ];
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(w * spine[0][0], h * spine[0][1]);
      for (const [x, y] of spine.slice(1)) ctx.lineTo(w * x, h * y);
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [width, colour] of [
      [h * 0.2, "#15803d"],
      [h * 0.15, "#22c55e"],
      [h * 0.06, "rgba(190,242,100,0.6)"],
    ]) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      path();
      ctx.stroke();
    }

    // Head and eye at the leading end.
    const hx = w * 0.68;
    const hy = h * 0.4;
    ctx.fillStyle = "#16a34a";
    ctx.beginPath();
    ctx.ellipse(hx, hy, h * 0.11, h * 0.085, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(hx + h * 0.03, hy - h * 0.05, h * 0.032, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(hx + h * 0.04, hy - h * 0.055, h * 0.015, 0, Math.PI * 2);
    ctx.fill();

    // The apple it is heading for.
    const ax = w * 0.84;
    const ay = h * 0.24;
    const ar = h * 0.09;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7c4a12";
    ctx.lineWidth = Math.max(1.5, ar * 0.2);
    ctx.beginPath();
    ctx.moveTo(ax, ay - ar * 0.9);
    ctx.lineTo(ax + ar * 0.15, ay - ar * 1.5);
    ctx.stroke();
    ctx.fillStyle = "#4d7c0f";
    ctx.beginPath();
    ctx.ellipse(ax + ar * 0.6, ay - ar * 1.3, ar * 0.45, ar * 0.22, -0.5, 0, Math.PI * 2);
    ctx.fill();
  },

  "hand-tetris"(ctx, w, h) {
    sky(ctx, w, h, "#e0f2fe", "#f8fafc");

    const cell = h * 0.17;
    const cols = 5;
    const rows = 5;
    const left = (w - cell * cols) / 2;
    const top = h * 0.08;

    ctx.fillStyle = "rgba(15,23,42,0.55)";
    round(ctx, left, top, cell * cols, cell * rows, cell * 0.25);
    ctx.fill();

    // Bevelled cell, the same read as the blocks in the game itself.
    const block = (cx, cy, color) => {
      const pad = cell * 0.08;
      const s = cell - pad * 2;
      const x = left + cx * cell + pad;
      const y = top + cy * cell + pad;
      ctx.fillStyle = color;
      round(ctx, x, y, s, s, s * 0.2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.42)";
      round(ctx, x + s * 0.12, y + s * 0.1, s * 0.76, s * 0.24, s * 0.12);
      ctx.fill();
    };

    // A settled stack with one row about to complete.
    block(0, 4, "#f87171");
    block(1, 4, "#4ade80");
    block(2, 4, "#fbbf24");
    block(4, 4, "#c084fc");
    block(0, 3, "#60a5fa");
    block(1, 3, "#fb923c");

    // The piece on its way down, with its landing spot outlined.
    block(2, 1, "#22d3ee");
    block(3, 1, "#22d3ee");
    block(3, 0, "#22d3ee");

    ctx.strokeStyle = "rgba(34,211,238,0.55)";
    ctx.lineWidth = Math.max(1.5, cell * 0.09);
    round(ctx, left + 3 * cell + cell * 0.16, top + 4 * cell + cell * 0.16, cell * 0.68, cell * 0.68, cell * 0.14);
    ctx.stroke();
  },

  "freeze-frame"(ctx, w, h) {
    sky(ctx, w, h, "#fee2e2", "#fff7ed");
    ground(ctx, w, h, "#fecaca", 0.82);

    // The light, red and lit, with the other two lamps dark.
    const r = h * 0.075;
    const lx = w * 0.22;
    const top = h * 0.22;
    const gap = r * 2.4;
    ctx.fillStyle = "#1f2937";
    round(ctx, lx - r * 1.7, top - r * 1.7, r * 3.4, gap * 2 + r * 3.4, r * 0.7);
    ctx.fill();

    const glow = ctx.createRadialGradient(lx, top, r * 0.2, lx, top, r * 2.4);
    glow.addColorStop(0, "rgba(239,68,68,0.65)");
    glow.addColorStop(1, "rgba(239,68,68,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, top, r * 2.4, 0, Math.PI * 2);
    ctx.fill();

    [
      ["#ef4444", 0],
      ["rgba(255,255,255,0.14)", 1],
      ["rgba(255,255,255,0.14)", 2],
    ].forEach(([colour, i]) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(lx, top + i * gap, r, 0, Math.PI * 2);
      ctx.fill();
    });

    // A figure caught mid-stride and holding it, arms still out.
    stickFigure(ctx, w * 0.66, h * 0.8, h * 0.24, "#b91c1c", "wide");

    // Motion ticks either side, to say the stillness is deliberate.
    ctx.strokeStyle = "rgba(185,28,28,0.45)";
    ctx.lineWidth = Math.max(1.5, h * 0.018);
    ctx.lineCap = "round";
    for (const [x, dy] of [
      [0.86, -0.1],
      [0.9, 0],
      [0.86, 0.1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(w * x, h * (0.6 + dy));
      ctx.lineTo(w * (x + 0.06), h * (0.6 + dy));
      ctx.stroke();
    }
  },

  "body-drums"(ctx, w, h) {
    sky(ctx, w, h, "#1e1b4b", "#312e81");

    // Four pads round a figure: two up at hand height, two low for the knees.
    const pad = (x, y, r, colour, ring) => {
      const g = ctx.createRadialGradient(w * x - r * 0.3, h * y - r * 0.35, r * 0.1, w * x, h * y, r);
      g.addColorStop(0, "rgba(30,41,80,0.95)");
      g.addColorStop(1, "rgba(10,12,30,0.95)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w * x, h * y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.beginPath();
      ctx.arc(w * x, h * y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (!ring) return;
      // The approach ring, still closing on this one.
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.beginPath();
      ctx.arc(w * x, h * y, r * 1.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const r = h * 0.11;
    pad(0.18, 0.36, r, "#22d3ee", false);
    pad(0.82, 0.36, r, "#f472b6", true);
    pad(0.34, 0.76, r * 0.86, "#fbbf24", false);
    pad(0.66, 0.76, r * 0.86, "#4ade80", false);

    stickFigure(ctx, w * 0.5, h * 0.82, h * 0.24, "#e0e7ff", "wide");

    // The beat, ticking along the top.
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (const [i, x] of [0.4, 0.47, 0.54, 0.61].entries()) {
      ctx.globalAlpha = i === 0 ? 0.95 : 0.3;
      ctx.beginPath();
      ctx.arc(w * x, h * 0.1, h * (i === 0 ? 0.035 : 0.022), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  "orbit-keeper"(ctx, w, h) {
    sky(ctx, w, h, "#0c4a6e", "#0ea5e9");

    // A figure with its arms out, which is what the balls bounce off.
    stickFigure(ctx, w * 0.42, h * 0.8, h * 0.24, "#e0f2fe", "wide");

    // Balls in the air, each with the arc it came in on.
    const ball = (x, y, r, colour) => {
      const g = ctx.createRadialGradient(w * x - r * 0.35, h * y - r * 0.4, r * 0.1, w * x, h * y, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, colour);
      g.addColorStop(1, "rgba(15,23,42,0.9)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w * x, h * y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = Math.max(1.5, h * 0.014);
    ctx.setLineDash([h * 0.05, h * 0.05]);
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.62);
    ctx.quadraticCurveTo(w * 0.42, h * 0.06, w * 0.72, h * 0.44);
    ctx.stroke();
    ctx.setLineDash([]);

    ball(0.2, 0.62, h * 0.075, "#f472b6");
    ball(0.44, 0.2, h * 0.075, "#facc15");
    ball(0.72, 0.44, h * 0.075, "#4ade80");

    // The bucket they are being herded into.
    const bx = w * 0.66;
    const bw = w * 0.26;
    const by = h * 0.8;
    const bh = h * 0.16;
    ctx.fillStyle = "rgba(15,23,42,0.8)";
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw * 0.84, by + bh);
    ctx.lineTo(bx + bw * 0.16, by + bh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = Math.max(2, bh * 0.18);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bw, by);
    ctx.stroke();
  },
};

export function drawCardArt(ctx, id, w, h) {
  ctx.clearRect(0, 0, w, h);
  const painter = PAINTERS[id];
  if (painter) {
    painter(ctx, w, h);
    return;
  }
  sky(ctx, w, h, "#e5e7eb", "#f3f4f6");
}
