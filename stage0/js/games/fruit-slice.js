import {
  BaseGame,
  clamp,
  distanceToPath,
  drawHandCursors,
  drawParticles,
  drawPops,
  HandPaths,
  lerp,
  Rep,
  unit,
  withShake,
} from "./common.js";

/**
 * Fruit Slice - swing a hand through the fruit as it arcs across the camera.
 *
 * A slice needs both contact and speed, so resting a hand in the air does
 * nothing; you have to actually swipe. Hand speed arrives already normalised
 * against shoulder width, so the same swing works near or far from the camera.
 */
const TAU = Math.PI * 2;

/*
 * Every fruit is a silhouette rather than a tinted circle.
 *
 * A round thing in five colours is one fruit five times over, and it reads as
 * a target rather than as food: nothing to recognise, so nothing to enjoy
 * cutting. So each kind states its own outline as a path, and everything else
 * is built from that one path — filled with skin for a whole fruit, filled
 * with flesh and rimmed for a half, and used as a clip for the markings, so a
 * stripe or a seed can be drawn freely and still never escape the fruit.
 *
 *   body    the outline, in units of the fruit's radius
 *   detail  markings on the skin, clipped to the body
 *   inside  what the cut reveals, clipped to the body
 *   top     stems and leaves, which are allowed outside the body
 */

const roundBody = (ctx, r) => {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
};

const ovalBody = (rx, ry) => (ctx, r) => {
  ctx.beginPath();
  ctx.ellipse(0, 0, r * rx, r * ry, 0, 0, TAU);
};

/** Pips, scattered at the given spots. */
function pips(ctx, r, colour, spots, scale = 1) {
  ctx.fillStyle = colour;
  for (const [sx, sy, rot = 0] of spots) {
    ctx.save();
    ctx.translate(sx * r, sy * r);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.07 * scale, r * 0.11 * scale, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** The wedges of a citrus cut across the middle. */
function citrus(ctx, r, colour, n = 8) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, r * 0.05);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84);
    ctx.stroke();
  }
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.11, 0, TAU);
  ctx.fill();
}

/** A short stalk, and usually a leaf beside it. */
function stalk(ctx, r, h, leaf = true) {
  ctx.strokeStyle = "#7c4a12";
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.7);
  ctx.quadraticCurveTo(r * 0.1, -r * (0.7 + h * 0.6), r * 0.06, -r * (0.7 + h));
  ctx.stroke();
  if (!leaf) return;
  ctx.fillStyle = "#4d7c0f";
  ctx.beginPath();
  ctx.ellipse(r * 0.36, -r * (0.72 + h * 0.7), r * 0.3, r * 0.15, -0.5, 0, TAU);
  ctx.fill();
}

export const FRUIT = [
  {
    name: "watermelon",
    size: 1.2,
    skin: "#15803d",
    flesh: "#f43f5e",
    body: roundBody,
    detail: (ctx, r) => {
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = r * 0.15;
      for (const k of [-0.66, -0.22, 0.22, 0.66]) {
        ctx.beginPath();
        ctx.moveTo(k * r * 1.2, -r * 1.1);
        ctx.quadraticCurveTo(k * r * 1.7, 0, k * r * 1.2, r * 1.1);
        ctx.stroke();
      }
    },
    inside: (ctx, r) => {
      ctx.strokeStyle = "#dcfce7";
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.86, 0, TAU);
      ctx.stroke();
      pips(ctx, r, "#1f2937", [
        [0.3, -0.36, 0.4],
        [-0.28, -0.12, -0.3],
        [0.12, 0.34, 0.2],
        [-0.36, 0.36, 0.6],
        [0.42, 0.1, -0.5],
      ]);
    },
  },
  {
    name: "orange",
    size: 0.95,
    skin: "#f97316",
    flesh: "#fdba74",
    body: roundBody,
    detail: (ctx, r) => {
      ctx.fillStyle = "rgba(154,52,18,0.35)";
      for (let i = 0; i < 14; i += 1) {
        const a = (i / 14) * TAU * 1.6;
        const d = r * (0.25 + ((i * 7) % 10) / 15);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.045, 0, TAU);
        ctx.fill();
      }
    },
    inside: (ctx, r) => citrus(ctx, r, "#fff7ed"),
    top: (ctx, r) => stalk(ctx, r, 0.22),
  },
  {
    name: "lemon",
    size: 0.85,
    skin: "#facc15",
    flesh: "#fef9c3",
    // Tapered to a point at each end, which is the whole of a lemon's shape.
    body: (ctx, r) => {
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.bezierCurveTo(-r * 0.82, -r * 0.8, r * 0.5, -r * 0.82, r, 0);
      ctx.bezierCurveTo(r * 0.5, r * 0.82, -r * 0.82, r * 0.8, -r, 0);
      ctx.closePath();
    },
    inside: (ctx, r) => citrus(ctx, r * 0.86, "#fde047", 7),
  },
  {
    name: "strawberry",
    size: 0.9,
    skin: "#e11d48",
    flesh: "#fecdd3",
    body: (ctx, r) => {
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.bezierCurveTo(-r * 0.98, r * 0.22, -r * 0.9, -r * 0.88, 0, -r * 0.58);
      ctx.bezierCurveTo(r * 0.9, -r * 0.88, r * 0.98, r * 0.22, 0, r);
      ctx.closePath();
    },
    detail: (ctx, r) =>
      pips(
        ctx,
        r,
        "#fde047",
        [
          [0, -0.24],
          [-0.34, -0.2],
          [0.34, -0.2],
          [-0.2, 0.12],
          [0.2, 0.12],
          [0, 0.42],
          [-0.45, 0.3],
          [0.45, 0.3],
        ],
        0.62,
      ),
    inside: (ctx, r) => {
      ctx.fillStyle = "#fff1f2";
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.1, r * 0.26, r * 0.4, 0, 0, TAU);
      ctx.fill();
      // Veining out of the core towards the skin. Run it from a single point
      // up on the cut line instead and it fans into a comet tail.
      ctx.strokeStyle = "rgba(244,63,94,0.32)";
      ctx.lineWidth = Math.max(1, r * 0.04);
      for (const a of [-1.45, -0.85, -0.32, 0.32, 0.85, 1.45]) {
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.12);
        ctx.lineTo(Math.sin(a) * r * 0.76, -r * 0.12 + Math.cos(a) * r * 0.9);
        ctx.stroke();
      }
      pips(ctx, r, "#fb7185", [
        [-0.46, -0.16],
        [0.46, -0.16],
        [-0.3, 0.36],
        [0.3, 0.36],
      ], 0.48);
    },
    top: (ctx, r) => {
      ctx.fillStyle = "#4d7c0f";
      for (const a of [-0.9, -0.3, 0.3, 0.9]) {
        ctx.save();
        ctx.translate(0, -r * 0.58);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.2, r * 0.13, r * 0.3, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    },
  },
  {
    name: "banana",
    size: 1.05,
    skin: "#fde047",
    flesh: "#fefce8",
    /*
     * A belly and a shallower inner edge, meeting at a point on each end.
     *
     * The two curves have to be pulled well apart. Bring them together and
     * the crescent thins to a few percent of the radius, at which point the
     * outline stroke is wider than the fruit it is outlining and the banana
     * comes out as a dark grey smile.
     */
    body: (ctx, r) => {
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, -r * 0.45);
      ctx.quadraticCurveTo(0, r * 1.39, r * 0.95, -r * 0.45);
      ctx.quadraticCurveTo(0, r * 0.55, -r * 0.95, -r * 0.45);
      ctx.closePath();
    },
    detail: (ctx, r) => {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = r * 0.09;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-r * 0.58, -r * 0.28);
      ctx.quadraticCurveTo(0, r * 0.74, r * 0.58, -r * 0.28);
      ctx.stroke();
      // Dark at both ends, the way a banana always is.
      ctx.fillStyle = "#a16207";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * r * 0.88, -r * 0.38, r * 0.11, 0, TAU);
        ctx.fill();
      }
    },
  },
  {
    name: "apple",
    size: 0.95,
    skin: "#dc2626",
    flesh: "#fef2f2",
    // Dipped at the top where the stalk sits, so it is not just a circle.
    body: (ctx, r) => {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.68);
      ctx.bezierCurveTo(-r * 0.36, -r * 1.04, -r, -r * 0.82, -r, -r * 0.08);
      ctx.bezierCurveTo(-r, r * 0.76, -r * 0.46, r, 0, r * 0.86);
      ctx.bezierCurveTo(r * 0.46, r, r, r * 0.76, r, -r * 0.08);
      ctx.bezierCurveTo(r, -r * 0.82, r * 0.36, -r * 1.04, 0, -r * 0.68);
      ctx.closePath();
    },
    inside: (ctx, r) => {
      ctx.strokeStyle = "#fca5a5";
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.5);
      ctx.quadraticCurveTo(r * 0.34, 0, 0, r * 0.5);
      ctx.quadraticCurveTo(-r * 0.34, 0, 0, -r * 0.5);
      ctx.stroke();
      pips(ctx, r, "#78350f", [
        [0.13, -0.1, 0.5],
        [-0.13, 0.14, -0.5],
      ], 0.7);
    },
    top: (ctx, r) => stalk(ctx, r, 0.3),
  },
  {
    name: "pear",
    size: 1.0,
    skin: "#a3e635",
    flesh: "#f7fee7",
    body: (ctx, r) => {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.44, -r * 0.9, r * 0.44, -r * 0.18, r * 0.62, r * 0.2);
      ctx.bezierCurveTo(r * 0.94, r * 0.74, r * 0.5, r, 0, r);
      ctx.bezierCurveTo(-r * 0.5, r, -r * 0.94, r * 0.74, -r * 0.62, r * 0.2);
      ctx.bezierCurveTo(-r * 0.44, -r * 0.18, -r * 0.44, -r * 0.9, 0, -r);
      ctx.closePath();
    },
    detail: (ctx, r) => {
      ctx.fillStyle = "rgba(132,204,22,0.5)";
      for (const [sx, sy] of [[-0.2, 0.4], [0.24, 0.5], [0.02, 0.68], [-0.3, 0.62]]) {
        ctx.beginPath();
        ctx.arc(sx * r, sy * r, r * 0.05, 0, TAU);
        ctx.fill();
      }
    },
    inside: (ctx, r) =>
      pips(ctx, r, "#78350f", [
        [0.1, 0.3, 0.4],
        [-0.1, 0.44, -0.4],
      ], 0.7),
    top: (ctx, r) => stalk(ctx, r, 0.34, false),
  },
  {
    name: "kiwi",
    size: 0.85,
    skin: "#92400e",
    flesh: "#65a30d",
    body: ovalBody(0.88, 1),
    detail: (ctx, r) => {
      ctx.strokeStyle = "rgba(120,53,15,0.7)";
      ctx.lineWidth = Math.max(1, r * 0.04);
      for (let i = 0; i < 18; i += 1) {
        const a = (i / 18) * TAU * 2.3;
        const d = r * (0.2 + ((i * 5) % 12) / 17);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
        ctx.lineTo(Math.cos(a) * (d + r * 0.1), Math.sin(a) * (d + r * 0.1));
        ctx.stroke();
      }
    },
    inside: (ctx, r) => {
      ctx.fillStyle = "#f7fee7";
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.26, r * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#1c1917";
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * TAU;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.5, r * 0.05, r * 0.07, a, 0, TAU);
        ctx.fill();
      }
    },
  },
  {
    name: "plum",
    size: 0.82,
    skin: "#7e22ce",
    flesh: "#f5d0fe",
    body: ovalBody(0.94, 1),
    detail: (ctx, r) => {
      ctx.strokeStyle = "rgba(59,7,100,0.6)";
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.16, 0, 0, r * 0.9);
      ctx.stroke();
    },
    inside: (ctx, r) => {
      ctx.fillStyle = "#a16207";
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.2, r * 0.26, 0, 0, TAU);
      ctx.fill();
    },
  },
  {
    name: "pineapple",
    size: 1.15,
    skin: "#ca8a04",
    flesh: "#fde68a",
    body: (ctx, r) => {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.1, r * 0.64, r * 0.9, 0, 0, TAU);
    },
    detail: (ctx, r) => {
      ctx.strokeStyle = "rgba(120,53,15,0.55)";
      ctx.lineWidth = Math.max(1, r * 0.05);
      for (let i = -4; i <= 4; i += 1) {
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-r * dir, i * r * 0.28 - r);
          ctx.lineTo(r * dir, i * r * 0.28 + r * 0.4);
          ctx.stroke();
        }
      }
    },
    // Fibres running out from a pale core. Concentric rings, which is the
    // obvious thing to draw, come out as a cut onion.
    inside: (ctx, r) => {
      ctx.strokeStyle = "rgba(202,138,4,0.5)";
      ctx.lineWidth = Math.max(1, r * 0.045);
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.2, r * 0.1 + Math.sin(a) * r * 0.26);
        ctx.lineTo(Math.cos(a) * r * 0.62, r * 0.1 + Math.sin(a) * r * 0.88);
        ctx.stroke();
      }
      ctx.fillStyle = "#fef3c7";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.1, r * 0.17, r * 0.25, 0, 0, TAU);
      ctx.fill();
    },
    top: (ctx, r) => {
      ctx.fillStyle = "#4d7c0f";
      for (const a of [-0.75, -0.4, 0, 0.4, 0.75]) {
        ctx.save();
        ctx.translate(0, -r * 0.78);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-r * 0.1, 0);
        ctx.lineTo(0, -r * 0.52);
        ctx.lineTo(r * 0.1, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
  },
];

/*
 * The arc, described by where it should end up rather than by a gravity
 * constant someone guessed at.
 *
 * The fruit has to travel to where the player's hands are. Standing in front
 * of a phone, hands live somewhere around the middle of the picture and reach
 * up towards a third of the way down; fruit that peaks below that is fruit
 * you have to stoop to reach, however good the swipe detection is. So the two
 * numbers that matter are stated — the top of the arc, and how long it hangs
 * there to be hit — and gravity and launch speed are solved from them.
 *
 * A throw reaching height h in hang time T needs g = 8h/T^2 and a launch of
 * 4h/T, which is the same solve jumpSolve does for the player's jump.
 */
const SPAWN_Y = 1.12; // just off the bottom of the screen
const PEAK_Y = 0.3; // where the top of the arc should sit
const RISE = SPAWN_Y - PEAK_Y;

/**
 * Gravity and launch speed for a throw that hangs for `hang` seconds.
 *
 * A throw reaching height h in hang time T needs g = 8h/T^2 and a launch of
 * 4h/T, which is the same solve jumpSolve does for the player's jump.
 */
const arcFor = (hang) => ({
  gravity: (8 * RISE) / (hang * hang),
  launch: (4 * RISE) / hang,
});

/*
 * Hang time is the difficulty dial, and it is the only one worth turning.
 *
 * The arc always peaks in the same place — where the hands are — so the fruit
 * is never out of reach, and what changes with the level is how long you have
 * to get there. Slow is not just easier, it is easier to learn from: at a
 * couple of seconds in the air you can watch a melon rise, pick your moment
 * and swing, which is how a first-time player finds out that the swipe has to
 * be fast. Then it tightens, level by level, until the same arc is over in
 * barely a second.
 */
const HANG_EASY_S = 2.3;
const HANG_HARD_S = 1.15;

/** The pace of a throw with no level behind it, for anything spawned bare. */
const BASE = arcFor(1.6);

/**
 * Move one thrown thing on by `dt`, on the arc it is actually on.
 *
 * The obvious `y += vy * dt` is a straight line through a curve, and it misses
 * by more the longer the frame, so the same throw peaks a couple of percent of
 * the screen lower on a 30fps phone than on a fast laptop. A curve under
 * constant gravity has an exact answer, though - the extra half a g t-squared
 * below - which costs one more multiply and is right at any frame rate.
 *
 * Each fruit carries the gravity it was thrown under, rather than reading a
 * global one. Levelling up changes the pace of the next throw, and a melon
 * already in the air has to finish the arc it left on: swapping gravity out
 * from under it would kink the curve mid-flight and drop it short of the
 * hands it was aimed at.
 */
function fall(item, dt) {
  const g = item.gravity ?? BASE.gravity;
  item.x += item.vx * dt;
  item.y += item.vy * dt + 0.5 * g * dt * dt;
  item.vy += g * dt;
}

/**
 * One fruit of radius `r` at the origin: whole, or the half on one side.
 *
 * The caller places and turns it. Exported because the how-to screen has to
 * demonstrate a slice, and a demonstration of cutting a green circle in half
 * teaches the swing against a fruit the game does not contain.
 *
 * @param half  0 for the whole fruit, -1 or 1 for the half on that side
 */
export function paintFruit(ctx, r, kind, half = 0) {
  const body = kind.body ?? roundBody;

  if (!half) {
    body(ctx, r);
    ctx.fillStyle = kind.skin;
    ctx.fill();

    // Markings and shine are clipped to the outline, so a painter can draw a
    // stripe straight off the edge and not have it hang in the air.
    ctx.save();
    body(ctx, r);
    ctx.clip();
    kind.detail?.(ctx, r);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.4, r * 0.2, r * 0.28, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();

    body(ctx, r);
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.stroke();

    kind.top?.(ctx, r);
    return;
  }

  // Cut: the same outline with half of it clipped away, flesh where the skin
  // was, and the rind left behind as a thick stroke around what survives.
  ctx.save();
  ctx.beginPath();
  ctx.rect(half > 0 ? 0 : -r * 2.4, -r * 2.4, r * 2.4, r * 4.8);
  ctx.clip();

  body(ctx, r);
  ctx.fillStyle = kind.flesh;
  ctx.fill();

  ctx.save();
  body(ctx, r);
  ctx.clip();
  kind.inside?.(ctx, r);
  ctx.restore();

  body(ctx, r);
  ctx.strokeStyle = kind.skin;
  ctx.lineWidth = r * 0.22;
  ctx.stroke();
  ctx.restore();
}

export function createGame(opts = {}) {
  return new FruitSlice(opts);
}

class FruitSlice extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 75_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "slice",
      clearsPerLevel: opts.clearsPerLevel ?? 7,
    });
    this.sliceSpeed = opts.sliceSpeed ?? 2.2;
    this.spawnEvery = opts.spawnEvery ?? 1.5;
    this.bombChance = opts.bombChance ?? 0.16;
    this.reset();
  }

  reset() {
    super.reset();
    this.items = [];
    this.trails = { left: [], right: [] };
    this.swipes = {
      left: new Rep(this.sliceSpeed, this.sliceSpeed * 0.5),
      right: new Rep(this.sliceSpeed, this.sliceSpeed * 0.5),
    };
    this.spawnTimer = 0.6;
    this.nextId = 1;
    this.flash = 0;
    this.hands = new HandPaths();
  }

  /** Fruit radius in pixels. */
  static radius(view, size = 1) {
    return unit(view) * 0.072 * size;
  }

  #spawn(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const t = this.ramp();
    this.spawnTimer = Math.max(0.5, this.spawnEvery * (1 - 0.62 * t));
    // Slow, floating arcs to begin with, tightening as the levels come.
    const arc = arcFor(lerp(HANG_EASY_S, HANG_HARD_S, t));

    // One or two at a time later in the round. Early on it is one, so there
    // is only ever a single thing to watch while the swing is being learnt.
    const batch = Math.random() < 0.08 + t * 0.5 ? 2 : 1;
    for (let i = 0; i < batch; i += 1) {
      // Bombs get more common late, so a fast round stays risky rather than
      // just becoming a wider version of the same swing.
      const bomb = Math.random() < this.bombChance * (0.6 + 0.9 * t);
      const kind = FRUIT[Math.floor(Math.random() * FRUIT.length)];
      const x = 0.16 + Math.random() * 0.68;
      this.items.push({
        id: this.nextId++,
        bomb,
        kind,
        x,
        y: SPAWN_Y,
        gravity: arc.gravity,
        // Enough spread that no two throws peak in quite the same place.
        vx: (0.5 - x) * (0.35 + Math.random() * 0.3),
        // Height goes as the square of this, so the spread has to stay small:
        // a tenth off the launch is a fifth off the arc, which is the
        // difference between peaking at the hands and peaking out of reach.
        vy: -arc.launch * (0.965 + Math.random() * 0.07),
        // Slow fruit turns slowly, or it spins on the spot like a top.
        spin: (Math.random() - 0.5) * lerp(3.2, 6.5, t),
        angle: Math.random() * Math.PI,
        size: bomb ? 0.95 : kind.size,
        sliced: 0,
        counted: false,
      });
    }
  }

  tick(dt, signals, now, view) {
    const result = { over: false, sliced: 0, bomb: false, dropped: 0 };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    this.flash = Math.max(0, this.flash - dt * 3);
    if (!signals.inFrame) {
      this.hands.reset();
      return result;
    }

    this.#spawn(dt);
    const box = view ?? { w: 1, h: 1 };

    // Keep a short trail per hand purely for the blade effect.
    for (const side of ["left", "right"]) {
      const hand = signals.hands?.[side];
      const trail = this.trails[side];
      if (hand?.visible && hand.x != null) trail.push({ x: hand.x, y: hand.y, t: 0 });
      for (const p of trail) p.t += dt;
      this.trails[side] = trail.filter((p) => p.t < 0.18).slice(-12);
    }

    // A swipe is a swipe whether or not it found fruit, so the activity log
    // counts the arm movement rather than the hits.
    for (const side of ["left", "right"]) {
      const hand = signals.hands?.[side];
      const speed = hand?.visible && hand.x != null ? hand.speed : 0;
      if (this.swipes[side].step(speed)) this.countAction("swipe");
    }

    // A blade is the line the hand swept this frame, not the point it reached.
    const blades = this.hands
      .update(box, signals, now)
      .filter(({ hand }) => hand.speed >= this.sliceSpeed);

    for (const item of this.items) {
      if (item.sliced > 0) {
        // Falls exactly like the fruit it came out of; see below.
        item.sliced += dt * 2;
        fall(item, dt);
        continue;
      }

      fall(item, dt);
      item.angle += item.spin * dt;

      const r = FruitSlice.radius(box, item.size);
      const px = item.x * box.w;
      const py = item.y * box.h;

      for (const { from, to } of blades) {
        const reach = r + unit(box) * 0.04;
        if (distanceToPath(from, to, px, py) > reach) continue;
        item.sliced = 0.01;
        if (item.bomb) {
          this.flash = 1;
          result.bomb = true;
          if (this.penalise({ x: item.x, y: item.y, color: "#f59e0b" })) {
            this.over = true;
            result.over = true;
          }
        } else {
          // Juice sprays from where the blade went through, and the score
          // floats up clear of the fruit rather than sitting on the cut face
          // the slice just opened up.
          result.sliced += this.award(item.x, item.y, null, {
            color: item.kind.flesh,
            count: 14,
            popY: item.y - (r * 1.5) / box.h,
          });
        }
        break;
      }

      // Fruit that falls back off the bottom is a miss; bombs are fine to duck.
      if (item.sliced === 0 && item.y > 1.2 && item.vy > 0 && !item.counted) {
        item.counted = true;
        if (!item.bomb) {
          result.dropped += 1;
          if (this.penalise({ x: item.x, y: 1.02, color: item.kind.skin })) {
            this.over = true;
            result.over = true;
          }
        }
      }
    }

    this.items = this.items.filter(
      (i) => i.sliced < 1.4 && i.y < 1.45 && i.y > -0.6,
    );
    return result;
  }

  draw(ctx, view, signals) {
    withShake(ctx, this.shake, () => {
      for (const side of ["left", "right"]) this.#drawBlade(ctx, view, this.trails[side]);
      for (const item of this.items) {
        const r = FruitSlice.radius(view, item.size);
        const x = item.x * view.w;
        const y = item.y * view.h;
        if (item.bomb) this.#drawBomb(ctx, x, y, r, item);
        else this.#drawFruit(ctx, x, y, r, item);
      }
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
      drawHandCursors(ctx, view, signals, { radius: 0.038 });
    });

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(239,68,68,${this.flash * 0.4})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  #drawBlade(ctx, view, trail) {
    if (trail.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = unit(view) * 0.022;
    ctx.beginPath();
    // The trail is where your hand has been, so it maps like a hand.
    ctx.moveTo(view.poseX(trail[0].x), view.poseY(trail[0].y));
    for (const p of trail.slice(1)) ctx.lineTo(view.poseX(p.x), view.poseY(p.y));
    ctx.stroke();
    ctx.restore();
  }

  #drawFruit(ctx, x, y, r, item) {
    if (item.sliced <= 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(item.angle);
      paintFruit(ctx, r, item.kind, 0);
      ctx.restore();
      return;
    }

    const split = item.sliced * r * 1.2;
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(x + dir * split, y);
      ctx.rotate(item.angle);
      paintFruit(ctx, r, item.kind, dir);
      ctx.restore();
    }
  }

  #drawBomb(ctx, x, y, r, item) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(item.angle * 0.3);
    ctx.fillStyle = "#1f2937";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.35, r * 0.18, r * 0.24, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.5, -r * 1.5, r * 0.75, -r * 1.1);
    ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(r * 0.75, -r * 1.1, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    void clamp;
  }
}
