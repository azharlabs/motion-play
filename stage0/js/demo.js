/**
 * "This is how you play it" — Pip demonstrating the movement, on a loop.
 *
 * Every game asks for a movement, and reading two lines of text is a poor way
 * to learn one. So Pip does it: front on, facing you the way you face the
 * phone, inside a drawn camera frame that shows how much of you has to be in
 * shot. Arms are posed by where the paw needs to be rather than by angles, so
 * a punch reaches for the pad and a swipe travels through the fruit, which
 * makes the clips read as the movement rather than as a wiggle.
 *
 * It is drawn rather than recorded: an animation loop costs nothing to ship,
 * stays sharp at any size, restyles with the game's own accent colour, and
 * cannot fall out of step with a game the way a video file would.
 *
 * The mascot here is a separate drawing from the side-on one in mascot.js.
 * That one runs and jumps in profile and has no arms at all, which is exactly
 * the half of the body these clips are about.
 */
import { FUR, FUR_DARK, CREAM, INK } from "./mascot.js";
import { actionById } from "./skills.js";
import { FRUIT, paintFruit } from "./games/fruit-slice.js";

/**
 * Pip's proportions, in figure units, measured from the ground between the
 * feet. Negative is up. A standing figure is about 200 tall, which is the
 * number the frame is sized against.
 *
 * Exported, along with `SHOULDER`, `inReach` and `arrow` below, because the
 * skill-shelf artwork poses the same mascot against the same props: anything
 * placed relative to a shoulder or a hip has to use these numbers or it will
 * drift off the body the first time the drawing changes.
 */
export const BODY = {
  hipY: -78,
  shoulderY: -140,
  headY: -170,
  headR: 23,
  shoulderHalf: 25,
  hipHalf: 15,
  upperArm: 34,
  foreArm: 34,
  thigh: 40,
  shin: 38,
  standing: 200,
};

/** Where an arm starts, and how far it gets. Clips aim at things using these. */
export const SHOULDER = { x: BODY.shoulderHalf + 3, y: BODY.shoulderY + 2 };
const REACH = BODY.upperArm + BODY.foreArm;

/**
 * Put a target within arm's length of the shoulder on that side.
 *
 * Props and paws are placed independently — the balloon goes where it looks
 * right, the paw goes to the balloon — and an arm asked for somewhere it
 * cannot get to just stops short, leaving a fox swatting at thin air. This
 * pulls anything too far away back onto the edge of the circle it can reach,
 * so contact always looks like contact.
 */
export function inReach(side, x, y, margin = 4) {
  const sx = side * SHOULDER.x;
  const dx = x - sx;
  const dy = y - SHOULDER.y;
  const d = Math.hypot(dx, dy);
  const max = REACH - margin;
  if (d <= max || d === 0) return { x, y };
  return { x: sx + (dx / d) * max, y: SHOULDER.y + (dy / d) * max };
}

/** The box every clip is composed in; scaled to fit whatever canvas we get. */
const STAGE = { w: 300, h: 250 };

/*
 * How far either side of centre a prop can go and still be in the picture.
 *
 * The two framings are not the same width. Upper body zooms to 1.6, which on
 * a 6:5 canvas leaves about 94 units of half-width, against the 170 that full
 * body gets. Anything positioned by eye against the roomy one — an arrow, the
 * spokes off a popped balloon — is sliced in half by the frame the moment the
 * same clip is used by an upper-body game, which is most of them.
 */
const EDGE = 92;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
/** Smooth 0..1 ramp, so nothing in a clip starts or stops abruptly. */
const ease = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));
/** A 0..1..0 pulse across the window, for a movement that goes and returns. */
const there = (p, from, to) => {
  const mid = (from + to) / 2;
  return p < from || p > to ? 0 : p < mid ? ease((p - from) / (mid - from)) : ease((to - p) / (to - mid));
};

/**
 * Place an elbow so the paw lands where the clip wants it.
 *
 * Posing an arm by shoulder and elbow angle means working out those angles
 * for every frame of every clip; posing it by where the paw goes means the
 * clip says "reach the balloon" and the elbow sorts itself out. `bend` picks
 * which way the elbow breaks, which for a figure seen front on is outwards.
 */
export function armPose(sx, sy, tx, ty, bend, upper = BODY.upperArm, fore = BODY.foreArm) {
  const dx = tx - sx;
  const dy = ty - sy;
  const raw = Math.hypot(dx, dy) || 1e-6;
  // An arm cannot reach further than it is long, nor fold inside itself.
  const d = clamp(raw, Math.abs(upper - fore) + 0.01, upper + fore - 0.01);
  const ux = dx / raw;
  const uy = dy / raw;
  const hand = { x: sx + ux * d, y: sy + uy * d };
  const cos = clamp((upper * upper + d * d - fore * fore) / (2 * upper * d), -1, 1);
  const spread = Math.acos(cos);
  const along = Math.atan2(uy, ux);
  const th = along + bend * spread;
  return { elbow: { x: sx + Math.cos(th) * upper, y: sy + Math.sin(th) * upper }, hand };
}

function limb(ctx, a, b, c, width, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
}

function blob(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function drawEar(ctx, x, y, tilt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = FUR;
  ctx.beginPath();
  ctx.moveTo(-9, 4);
  ctx.lineTo(0, -22);
  ctx.lineTo(9, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7c2d12";
  ctx.beginPath();
  ctx.moveTo(-4, 1);
  ctx.lineTo(0, -13);
  ctx.lineTo(4, 1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHead(ctx, x, y, tilt, effort) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  const r = BODY.headR;

  drawEar(ctx, -r * 0.62, -r * 0.66, -0.24);
  drawEar(ctx, r * 0.62, -r * 0.66, 0.24);

  blob(ctx, 0, 0, r, r * 0.94, FUR);
  // Cheeks and muzzle, so the face reads at thumbnail size.
  blob(ctx, 0, r * 0.34, r * 0.6, r * 0.42, CREAM);

  const squint = effort > 0.55 ? 0.45 : 1;
  blob(ctx, -r * 0.36, -r * 0.1, r * 0.19, r * 0.19 * squint, "#fff");
  blob(ctx, r * 0.36, -r * 0.1, r * 0.19, r * 0.19 * squint, "#fff");
  blob(ctx, -r * 0.34, -r * 0.09, r * 0.1, r * 0.1 * squint, INK);
  blob(ctx, r * 0.38, -r * 0.09, r * 0.1, r * 0.1 * squint, INK);
  blob(ctx, 0, r * 0.22, r * 0.13, r * 0.1, INK);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, r * 0.34, r * 0.26, 0.25, Math.PI - 0.25);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw Pip in a pose.
 *
 * `pose.arms` are paw targets in figure space, which is what the clips think
 * in. `reachOut` is how far a paw is coming at the camera: a jab thrown at the
 * lens barely moves across the picture, so it is shown by the paw growing,
 * which is what it genuinely looks like from where the phone is sitting.
 */
export function drawPip(ctx, pose) {
  const {
    lift = 0,
    crouch = 0,
    lean = 0,
    arms = {},
    feet = {},
    headTilt = 0,
    effort = 0,
  } = pose;

  const drop = crouch * 46;
  const hipY = BODY.hipY + drop - lift;
  const shoulderY = BODY.shoulderY + drop * 0.82 - lift;
  // The head sinks with the shoulders, not at its own rate. Dropping slower
  // than them opened a gap between the two, and since the chest only reaches
  // the chin by a few units in the first place, a deep enough duck floated
  // the head clean off the body.
  const headY = BODY.headY + drop * 0.82 - lift;

  ctx.save();
  // Leaning pivots at the hips, the way a body actually tips.
  ctx.translate(0, hipY);
  ctx.rotate((lean * Math.PI) / 180);
  ctx.translate(0, -hipY);

  // ---- legs, behind the body ----
  const footY = -lift * 0.35;
  for (const side of [-1, 1]) {
    const hip = { x: side * BODY.hipHalf, y: hipY };
    // Feet stay planted and roughly under the hips; only a squat widens the
    // stance, and only a little. Splayed legs read as a frog, not a squat.
    const foot = { x: side * (BODY.hipHalf + 4 + crouch * 14), y: footY };
    // Tucked up when airborne, so a jump reads as a jump.
    if (lift > 6) foot.y = hipY + 34;
    // A clip can drive one foot somewhere of its own — a knee coming up, say.
    // Hung off the hip like the arms are off the shoulder, so the leg travels
    // with the body rather than staying pinned to the frame.
    const stride = feet[side < 0 ? "left" : "right"];
    if (stride?.dx != null) foot.x = hip.x + stride.dx;
    if (stride?.dy != null) foot.y = hip.y + stride.dy;
    /*
     * Knees break outwards, which is the opposite way to elbows.
     *
     * A leg has to fold the same amount an arm does, but it is anchored at
     * both ends: hip above, foot on the floor. Bent the way an elbow bends,
     * the knee swings in and down, and once a squat is deep enough it crosses
     * the middle and meets the other one — the legs stop being legs and
     * become one splayed orange mass with the feet lost in it. Sent outwards
     * the same fold reads as what it is, and it is also what a squat actually
     * looks like from the front: knees tracking out over the toes.
     */
    const { elbow: knee, hand: ankle } = armPose(
      hip.x,
      hip.y,
      foot.x,
      foot.y,
      side > 0 ? -1 : 1,
      BODY.thigh,
      BODY.shin,
    );
    limb(ctx, hip, knee, ankle, 13, FUR_DARK);
    blob(ctx, ankle.x + side * 3, ankle.y + 1, 9, 5, FUR_DARK);
  }

  // ---- neck, under both, so the join never opens up ----
  // Chest and chin met by about three units, at one point, on the centre
  // line: enough to look joined head on and not enough anywhere else. This
  // is what actually holds the head on.
  blob(ctx, 0, (headY + shoulderY) / 2, 13, (shoulderY - headY) / 2 + 9, FUR);

  // ---- body ----
  const midY = (shoulderY + hipY) / 2;
  const half = (hipY - shoulderY) / 2;
  blob(ctx, 0, midY, BODY.shoulderHalf + 4, half + 10, FUR);
  blob(ctx, 0, midY + half * 0.28, BODY.shoulderHalf * 0.62, half * 0.72, CREAM);

  // ---- arms ----
  for (const side of [-1, 1]) {
    const key = side < 0 ? "left" : "right";
    // Rooted at the edge of the shoulder, not inside the chest, or the arm
    // appears to grow out of the middle of the body.
    const shoulder = { x: side * SHOULDER.x, y: shoulderY + 2 };
    const want = arms[key] ?? {};
    /*
     * Two ways to say where a paw goes, because clips need both. `x`/`y` is
     * a fixed spot in the picture, for reaching the balloon that is drawn
     * there. `dx`/`dy` hangs off the shoulder, for arms that should travel
     * with the body as it squats or leans. Neither given, they hang by the
     * hips.
     */
    const target =
      want.x != null
        ? { x: want.x, y: want.y }
        : {
            x: shoulder.x + (want.dx ?? side * 11),
            y: shoulder.y + (want.dy ?? 56),
          };
    // Elbows break downwards and outwards, the way arms do.
    const { elbow, hand } = armPose(shoulder.x, shoulder.y, target.x, target.y, side > 0 ? 1 : -1);
    limb(ctx, shoulder, elbow, hand, 10, FUR);
    // A paw coming at the camera is a bigger paw, not a moved one.
    const paw = 7 * (1 + (want.reachOut ?? 0) * 1.5);
    blob(ctx, hand.x, hand.y, paw, paw * 0.92, CREAM);
    if (want.reachOut > 0.25) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * want.reachOut})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, paw + 6 + want.reachOut * 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawHead(ctx, 0, headY, headTilt, effort);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Clips: one per movement, each a loop of its own length.
 * ------------------------------------------------------------------ */

/** Chest-height pads either side, as Punch Out lights them. */
function punchClip(p, accent) {
  const side = p < 0.5 ? 1 : -1;
  const local = (p % 0.5) / 0.5;
  // Wind up, throw, land, recover.
  const throwing = there(local, 0.15, 0.85);
  const hit = local > 0.45 && local < 0.6;
  const key = side < 0 ? "left" : "right";
  // Kept inside the viewfinder: at the upper-body zoom there are only about
  // 94 units either side of the centre, so a 23 pad out at 76 had its outer
  // edge shaved off flat against the frame.
  const padR = 19;
  const pad = { x: side * 72, y: BODY.shoulderY - 4 };
  // From a guard by the chin out to the pad.
  const guard = { x: side * 34, y: BODY.shoulderY + 12 };
  const paw = inReach(
    side,
    guard.x + (pad.x - guard.x) * throwing,
    guard.y + (pad.y - guard.y) * throwing,
  );

  return {
    pose: {
      effort: throwing,
      arms: { [key]: { ...paw, reachOut: throwing } },
    },
    back: (ctx) => {
      // The same focus mitt the game puts on screen: a lit face, a stitched
      // rim and a spot in the middle. A demonstration of a punch is worth
      // less if the thing being punched is not the thing you will see.
      for (const s of [-1, 1]) {
        const live = s === side && throwing > 0.2;
        const x = s * 72;
        const r = padR;

        const face = ctx.createRadialGradient(x - r * 0.35, pad.y - r * 0.4, r * 0.1, x, pad.y, r * 1.08);
        face.addColorStop(0, live ? "#fb7185" : "rgba(203,213,225,0.6)");
        face.addColorStop(0.55, live ? accent : "rgba(148,163,184,0.42)");
        face.addColorStop(1, live ? "#9f1239" : "rgba(71,85,105,0.4)");
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.arc(x, pad.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = live ? "#fff" : "rgba(255,255,255,0.45)";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.save();
        ctx.setLineDash([3.6, 3]);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = live ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(x, pad.y, r * 0.82, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = live ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.28)";
        ctx.beginPath();
        ctx.arc(x, pad.y, r * 0.36, 0, Math.PI * 2);
        ctx.fill();
        if (live) {
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.arc(x, pad.y, r * 0.17, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = live ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.ellipse(x - r * 0.36, pad.y - r * 0.42, r * 0.26, r * 0.17, -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    front: (ctx) => {
      if (!hit) return;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(pad.x + Math.cos(a) * 22, pad.y + Math.sin(a) * 22);
        ctx.lineTo(pad.x + Math.cos(a) * 32, pad.y + Math.sin(a) * 32);
        ctx.stroke();
      }
    },
  };
}

/** A ball, plain enough to read at the size a demonstration draws it. */
function drawBall(ctx, x, y, r) {
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(15,23,42,0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // A dark panel in the middle with seams running off it: the least a ball
  // can have and still be a ball rather than a white circle.
  const panel = r * 0.42;
  ctx.fillStyle = "rgba(15,23,42,0.72)";
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    const px = x + Math.cos(a) * panel;
    const py = y + Math.sin(a) * panel;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(15,23,42,0.6)";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * panel, y + Math.sin(a) * panel);
    ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
    ctx.stroke();
  }
}

/**
 * The thing at the end of a reach.
 *
 * Several games ask for the same stretch of the arm and are nothing alike to
 * look at. Balloon Pop waits for a touch and bursts; Goalkeeper stops a ball
 * that arrives on its own; Hand Snake leads a body to an apple; Hand Tetris
 * slides a block; Orbit Keeper taps floating balls. The movement is shared
 * and the prop is not — `meta.reachFor` picks which picture the player gets.
 */
function balloonProp(target, met, accent) {
  return {
    back: (ctx) => {
      if (met) return;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(target.x, target.y - 4, 17, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(target.x, target.y + 16);
      ctx.quadraticCurveTo(target.x + 6, target.y + 30, target.x, target.y + 42);
      ctx.stroke();
    },
    front: (ctx) => {
      if (!met) return;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      const far = Math.min(28, EDGE - Math.abs(target.x));
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(target.x + Math.cos(a) * (far * 0.46), target.y + Math.sin(a) * (far * 0.46));
        ctx.lineTo(target.x + Math.cos(a) * far, target.y + Math.sin(a) * far);
        ctx.stroke();
      }
    },
  };
}

/**
 * The arm is at full stretch for a moment in the middle of the reach and on
 * its way back out either side of it, so the ball has to arrive inside that
 * moment. Land it late and the picture shows a ball hanging in the air next
 * to a paw that has already given up on it.
 */
const CAUGHT = { from: 0.4, to: 0.52 };

function ballProp(target, side, local, accent) {
  const r = 13;
  const met = local > CAUGHT.from && local < CAUGHT.to;
  // In from off the corner, stopped dead on the paw, then away the way it
  // came — which is what a save looks like, rather than a ball that vanishes.
  const entry = { x: side * 178, y: BODY.shoulderY - 128 };
  const flown = local < CAUGHT.from ? ease(local / CAUGHT.from) : 1;
  const beaten = local > CAUGHT.to ? ease((local - CAUGHT.to) / (1 - CAUGHT.to)) : 0;
  const travel = flown - beaten;
  const at = {
    x: entry.x + (target.x - entry.x) * travel,
    y: entry.y + (target.y - entry.y) * travel,
  };
  const flying = !met && travel > 0.02 && travel < 0.99;

  return {
    back: (ctx) => {
      if (flying) {
        // Streaks lie back along the flight, so the ball reads as moving even
        // in a frame someone paused on.
        const dx = (target.x - entry.x) / 200;
        const dy = (target.y - entry.y) / 200;
        const heading = beaten > 0 ? -1 : 1;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        for (let i = 0; i < 3; i += 1) {
          ctx.globalAlpha = 0.45 - i * 0.12;
          const back = (18 + i * 16) * heading;
          const off = (i - 1) * 9;
          ctx.beginPath();
          ctx.moveTo(at.x - dx * back - dy * off, at.y - dy * back + dx * off);
          ctx.lineTo(at.x - dx * (back + 15) - dy * off, at.y - dy * (back + 15) + dx * off);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      drawBall(ctx, at.x, at.y, r);
    },
    front: (ctx) => {
      if (!met) return;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      // Spokes only on the far side of the paw: the ball stopped there.
      for (let i = 0; i < 5; i += 1) {
        const a = -Math.PI / 2 + ((i - 2) / 5) * Math.PI * 1.5;
        ctx.beginPath();
        ctx.moveTo(target.x + Math.cos(a) * (r + 3), target.y + Math.sin(a) * (r + 3));
        ctx.lineTo(target.x + Math.cos(a) * (r + 16), target.y + Math.sin(a) * (r + 16));
        ctx.stroke();
      }
    },
  };
}

/** A red apple with a stalk and a leaf — the thing Hand Snake is led onto. */
function drawApple(ctx, x, y, r) {
  const skin = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  skin.addColorStop(0, "#fca5a5");
  skin.addColorStop(0.6, "#ef4444");
  skin.addColorStop(1, "#991b1b");
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7c4a12";
  ctx.lineWidth = Math.max(1.6, r * 0.18);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.85);
  ctx.quadraticCurveTo(x + r * 0.2, y - r * 1.35, x + r * 0.08, y - r * 1.45);
  ctx.stroke();
  ctx.fillStyle = "#4d7c0f";
  ctx.beginPath();
  ctx.ellipse(x + r * 0.55, y - r * 1.2, r * 0.42, r * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Lead a snake to an apple.
 *
 * Hand Snake is not "reach out and poke something". The hand travels, the
 * snake banks after it, and the apple is where you are taking it. Sampling
 * the paw along a curved path and stroking those samples as a tapering body
 * is the same picture the game itself draws.
 */
function snakeReachClip(p, accent) {
  const apple = inReach(1, 62, BODY.shoulderY - 56);
  // A wide arc that ends on the apple, so the body has room to trail behind.
  // Allow u < 0 so the body keeps length at the start of the loop instead of
  // collapsing into a green blob. Path stays on Pip's right so the body never
  // drapes across the face on the way to the apple.
  const along = (u) => {
    const t = u <= 0 ? u : u >= 1 ? 1 : ease(u);
    const x = 22 + t * 40 + Math.sin(t * Math.PI) * 10;
    const y = BODY.shoulderY + 48 - t * 108;
    return inReach(1, x, y);
  };
  /*
   * The hand leads; the snake banks after it. Putting the head on the paw made
   * the body read as a green hose glued to the arm — the bug we are fixing,
   * just in another colour. A short lag keeps the head visible behind the paw
   * and matches how the game actually steers.
   */
  const lag = 0.12;
  const paw = along(p);
  const head = along(p - lag);
  const trail = [];
  for (let i = 16; i >= 0; i -= 1) {
    trail.push(along(p - lag - i * 0.04));
  }
  const gap = Math.hypot(head.x - apple.x, head.y - apple.y);
  const eaten = gap < 18 && p > 0.72;

  return {
    pose: { effort: 0.55, arms: { right: paw } },
    back: (ctx) => {
      if (!eaten) drawApple(ctx, apple.x, apple.y, 12);

      // Lead line from the hand to the snake, so the follow is explicit.
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(paw.x, paw.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Body behind the head: dark outline, green fill, light ridge on top.
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const [width, colour] of [
        [16, "rgba(22,101,52,0.55)"],
        [12, accent],
        [5, "rgba(190,242,100,0.55)"],
      ]) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (const pt of trail.slice(1)) ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
    },
    front: (ctx) => {
      // Head drawn in front of Pip so the paw never covers it.
      const hx = head.x;
      const hy = head.y;
      const ang = Math.atan2(paw.y - head.y, paw.x - head.x);
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ang);
      ctx.fillStyle = "#16a34a";
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(4, -3.5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(5, -3.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!eaten) return;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(apple.x + Math.cos(a) * 10, apple.y + Math.sin(a) * 10);
        ctx.lineTo(apple.x + Math.cos(a) * 20, apple.y + Math.sin(a) * 20);
        ctx.stroke();
      }
    },
  };
}

/** A bevelled tetromino cell, matching the look of Hand Tetris itself. */
function drawBlockCell(ctx, x, y, s, colour) {
  const r = s * 0.2;
  ctx.fillStyle = colour;
  roundRect(ctx, x, y, s, s, r);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  roundRect(ctx, x + s * 0.12, y + s * 0.1, s * 0.76, s * 0.24, s * 0.12);
  ctx.fill();
}

/**
 * Slide a falling block left and right with the hand.
 *
 * Hand Tetris steers by sweeping an arm across the body; the demonstration
 * has to show a piece moving with the paw, not a balloon waiting to be poked.
 */
function blockReachClip(p, accent) {
  const wave = Math.sin(p * Math.PI * 2);
  const slide = wave * 48;
  const y = BODY.shoulderY - 8;
  const paw = inReach(1, slide + 18, y + 10);
  const cell = 14;
  // An L piece hovering above the hand, drifting with the sweep.
  const ox = slide - 8;
  const oy = BODY.shoulderY - 52;
  const cells = [
    [0, 1],
    [1, 1],
    [2, 1],
    [2, 0],
  ];

  return {
    pose: { effort: Math.abs(wave) * 0.5, arms: { right: paw } },
    back: (ctx) => {
      // Soft well so the piece reads as sitting in a playfield.
      ctx.fillStyle = "rgba(15,23,42,0.35)";
      roundRect(ctx, -70, BODY.shoulderY - 70, 140, 58, 10);
      ctx.fill();
      for (const [cx, cy] of cells) {
        drawBlockCell(ctx, ox + cx * cell, oy + cy * cell, cell - 2, accent);
      }
    },
    front: (ctx) => {
      arrow(ctx, Math.sign(wave || 1) * (EDGE - 18), BODY.shoulderY + 18, Math.sign(wave || 1), 0, accent);
    },
  };
}

/**
 * Tap a floating ball back up — Orbit Keeper's reach, not a balloon on a string.
 */
function orbitReachClip(p, accent) {
  const side = p < 0.5 ? 1 : -1;
  const local = (p % 0.5) / 0.5;
  const out = there(local, 0.1, 0.8);
  const key = side < 0 ? "left" : "right";
  const target = inReach(side, side * 50, BODY.shoulderY - 48);
  const from = { x: side * (SHOULDER.x + 11), y: SHOULDER.y + 56 };
  const paw = {
    x: from.x + (target.x - from.x) * out,
    y: from.y + (target.y - from.y) * out,
  };
  // Ball drifts down then gets tapped back up when the paw meets it.
  const hit = local > 0.42 && local < 0.58;
  const drop = local < 0.5 ? ease(local / 0.5) : 1;
  const loft = local > 0.5 ? ease((local - 0.5) / 0.5) : 0;
  const ball = {
    x: target.x,
    y: target.y - 36 + drop * 36 - loft * 50,
  };

  return {
    pose: { effort: out * 0.75, arms: { [key]: paw } },
    back: (ctx) => {
      // A second ball hanging elsewhere, so it reads as juggling rather than
      // a single save.
      drawBall(ctx, -side * 44, BODY.shoulderY - 70, 10);
      drawBall(ctx, ball.x, ball.y, 12);
    },
    front: (ctx) => {
      if (!hit) return;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = 0; i < 5; i += 1) {
        const a = -Math.PI / 2 + ((i - 2) / 5) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(paw.x + Math.cos(a) * 12, paw.y + Math.sin(a) * 12);
        ctx.lineTo(paw.x + Math.cos(a) * 22, paw.y + Math.sin(a) * 22);
        ctx.stroke();
      }
    },
  };
}

/** Stretch out and touch it: balloons, balls, snakes, blocks, orbits. */
function reachClip(p, accent, meta) {
  const kind = meta?.reachFor ?? "balloon";
  if (kind === "snake") return snakeReachClip(p, accent);
  if (kind === "block") return blockReachClip(p, accent);
  if (kind === "orbit") return orbitReachClip(p, accent);

  const side = p < 0.5 ? 1 : -1;
  const local = (p % 0.5) / 0.5;
  const out = there(local, 0.1, 0.8);
  const key = side < 0 ? "left" : "right";
  const met = local > 0.46 && local < 0.62;
  // At the far edge of where the arm can get to, taken up rather than out:
  // `inReach` pulls it back onto the same circle either way, so the arm is
  // just as straight, and the balloon keeps clear of the sides of the frame.
  const target = inReach(side, side * 58, BODY.shoulderY - 62);
  const from = { x: side * (SHOULDER.x + 11), y: SHOULDER.y + 56 };
  const paw = {
    x: from.x + (target.x - from.x) * out,
    y: from.y + (target.y - from.y) * out,
  };

  const prop =
    kind === "ball" ? ballProp(target, side, local, accent) : balloonProp(target, met, accent);

  return { pose: { effort: out * 0.8, arms: { [key]: paw } }, ...prop };
}

/** A whole arm through the fruit, with the trail it leaves behind. */
function swipeClip(p, accent) {
  const sweep = ease(clamp((p - 0.15) / 0.45, 0, 1));
  const y = BODY.shoulderY - 16;
  // Both ends of the sweep have to be somewhere the arm can actually get to,
  // so it travels across the body rather than teleporting past it.
  const from = inReach(1, 84, y + 8);
  const to = inReach(1, -40, y - 4);
  const paw = { x: from.x + (to.x - from.x) * sweep, y: from.y + (to.y - from.y) * sweep };
  /*
   * Placed so that both halves have somewhere to go.
   *
   * The fruit is painted behind Pip, and there are only about 94 units either
   * side of centre at this zoom, so the two halves are flying between a wall
   * and a body: too far left and the near half disappears into his chest,
   * too far right and the far half is sliced again by the frame edge. A
   * smaller melon and a shorter throw leave room for both.
   */
  const fruitR = 15;
  const apart = 13;
  const fruit = { x: 59, y: y - 2 };
  const cut = paw.x <= fruit.x;

  return {
    pose: {
      effort: sweep > 0.05 && sweep < 0.95 ? 0.8 : 0,
      arms: { right: paw },
    },
    back: (ctx) => {
      if (!cut) {
        ctx.save();
        ctx.translate(fruit.x, fruit.y);
        paintFruit(ctx, fruitR, MELON, 0);
        ctx.restore();
        return;
      }
      // Two halves flying apart from where the paw went through.
      const gone = clamp((fruit.x - paw.x) / 50, 0, 1);
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(fruit.x + s * gone * apart, fruit.y + gone * gone * 26);
        ctx.rotate(s * gone * 1.1);
        paintFruit(ctx, fruitR, MELON, s);
        ctx.restore();
      }
    },
    front: (ctx) => {
      if (sweep <= 0.02 || sweep >= 0.99) return;
      // The trail thins out behind the paw.
      const grd = ctx.createLinearGradient(from.x, 0, paw.x, 0);
      grd.addColorStop(0, "rgba(255,255,255,0)");
      grd.addColorStop(1, "rgba(255,255,255,0.6)");
      ctx.strokeStyle = grd;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y - 6);
      ctx.quadraticCurveTo((from.x + paw.x) / 2, (from.y + paw.y) / 2 - 16, paw.x, paw.y);
      ctx.stroke();
    },
  };
}

/** Both arms overhead and down again — Sky Flap climbs; Hand Tetris turns. */
function raiseClip(p, accent, meta) {
  const up = there(p, 0.1, 0.9);
  /*
   * Hung off the shoulder rather than pinned to a spot in the picture. The
   * body lifts on to its toes as the arms go up, and paws left at fixed
   * heights stay put while the shoulders climb towards them — so the arms
   * fold back down at the exact top of the movement they are demonstrating.
   */
  const dx = 11 - up * 13;
  const dy = 56 - up * 118;
  const turn = meta?.raiseFor === "turn";
  return {
    pose: {
      effort: up * 0.6,
      lift: up * 10,
      arms: {
        left: { dx: -dx, dy },
        right: { dx, dy },
      },
    },
    back: (ctx) => {
      if (turn) {
        // A piece spinning above the head as the hand lifts to rotate it.
        const cell = 13;
        const rot = up * Math.PI / 2;
        ctx.save();
        ctx.translate(0, BODY.headY - 36);
        ctx.rotate(rot);
        for (const [cx, cy] of [[-1, 0], [0, 0], [1, 0], [0, -1]]) {
          drawBlockCell(ctx, cx * cell - cell / 2, cy * cell - cell / 2, cell - 2, accent);
        }
        ctx.restore();
        return;
      }
      // The gap it is climbing towards.
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + up * 0.4})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.moveTo(-96, BODY.headY - 46);
      ctx.lineTo(96, BODY.headY - 46);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    // Inside `EDGE`, with the 13 units the arrow head is wide allowed for:
    // at upper-body zoom anything further out is a sliver against the side.
    front: (ctx) => arrow(ctx, EDGE - 15, BODY.shoulderY - 10, 0, up > 0.5 ? -1 : 1, accent),
  };
}

/** Shoulders over, feet planted — lanes for Runner, gates for Slalom. */
function leanClip(p, accent, meta) {
  const wave = Math.sin(p * Math.PI * 2);
  const lean = wave * 22;
  const gates = meta?.leanFor === "gates";
  return {
    pose: { lean, headTilt: -lean * 0.006, effort: Math.abs(wave) * 0.5 },
    back: (ctx) => {
      if (gates) {
        // A red/blue flag pair with a band between them — pass inside.
        const y = -8;
        const half = 38;
        const cx = wave * 18;
        for (const [s, colour] of [[-1, "#ef4444"], [1, "#3b82f6"]]) {
          const x = cx + s * half;
          ctx.fillStyle = colour;
          ctx.fillRect(x - 2, y - 28, 4, 36);
          ctx.beginPath();
          ctx.moveTo(x, y - 28);
          ctx.lineTo(x + s * 18, y - 20);
          ctx.lineTo(x, y - 12);
          ctx.closePath();
          ctx.fill();
        }
        const inside = Math.abs(wave) < 0.55;
        ctx.fillStyle = inside ? "rgba(34,197,94,0.28)" : "rgba(148,163,184,0.18)";
        ctx.fillRect(cx - half + 4, y - 6, half * 2 - 8, 10);
        return;
      }
      for (const s of [-1, 0, 1]) {
        const live = Math.abs(wave) > 0.45 && Math.sign(wave) === s;
        ctx.fillStyle = live ? accent : "rgba(148,163,184,0.28)";
        ctx.beginPath();
        ctx.ellipse(s * 70, -8, 26, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    front: (ctx) => {
      arrow(ctx, Math.sign(wave || 1) * 112, BODY.shoulderY + 20, Math.sign(wave || 1), 0, accent);
    },
  };
}

/** Down into a squat and back up. */
function squatClip(p, accent) {
  const down = there(p, 0.08, 0.92);
  return {
    // Arms come forward as a counterweight, and stay with the body on the way
    // down, so they are hung off the shoulder rather than pinned to the frame.
    pose: {
      crouch: down,
      effort: down * 0.9,
      arms: {
        left: { dx: -6, dy: 30 - down * 26 },
        right: { dx: 6, dy: 30 - down * 26 },
      },
    },
    back: (ctx) => {
      // The depth the hips have to get under for the rep to count.
      ctx.strokeStyle = down > 0.75 ? accent : "rgba(255,255,255,0.35)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(-92, BODY.hipY + 40);
      ctx.lineTo(92, BODY.hipY + 40);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    front: () => {},
  };
}

/** Off both feet, over the thing in the way. */
function jumpClip(p, accent) {
  const air = there(p, 0.2, 0.75);
  return {
    pose: {
      lift: air * 56,
      crouch: p < 0.2 ? (p / 0.2) * 0.45 : 0,
      effort: air * 0.7,
      // Arms swing up with the jump, which is what makes it read as a jump.
      arms: {
        left: { dx: -10, dy: 34 - air * 62 },
        right: { dx: 10, dy: 34 - air * 62 },
      },
    },
    back: (ctx) => {
      // Beside the fox, not under it, or the thing being jumped is invisible
      // behind the legs at the moment it matters.
      ctx.fillStyle = accent;
      roundRect(ctx, 34, -48, 46, 48, 6);
      ctx.fill();
    },
    front: (ctx) => arrow(ctx, 100, BODY.hipY - 10, 0, -1, accent),
  };
}

/** Head under the thing coming at it. */
function duckClip(p, accent) {
  const low = there(p, 0.15, 0.85);
  return {
    pose: {
      crouch: low * 0.95,
      headTilt: low * 0.12,
      effort: low * 0.8,
      arms: { left: { dx: -4, dy: 40 }, right: { dx: 4, dy: 40 } },
    },
    back: (ctx) => {
      ctx.fillStyle = accent;
      roundRect(ctx, -110, BODY.shoulderY - 34, 220, 17, 8);
      ctx.fill();
    },
    front: (ctx) => arrow(ctx, 96, BODY.shoulderY + 10, 0, 1, accent),
  };
}

/** The fruit the slice clip demonstrates on: the game's most obvious one. */
const MELON = FRUIT[0];

/** Find the shape, then stop moving — or freeze when the light turns red. */
function holdClip(p, accent, meta) {
  if (meta?.holdFor === "freeze") {
    // Green: march and wave. Red: statue. The light is the whole instruction.
    const green = p < 0.48;
    const into = green ? there(p / 0.48, 0.05, 0.95) : 0;
    const march = green ? Math.sin(p * Math.PI * 8) * 0.35 : 0;
    return {
      pose: {
        effort: green ? 0.45 : 0.15,
        lean: green ? march * 6 : 0,
        arms: {
          left: {
            dx: -(14 + (green ? into * 8 : 0)),
            dy: 40 - (green ? into * 36 + Math.abs(march) * 10 : 0),
          },
          right: {
            dx: 14 + (green ? into * 8 : 0),
            dy: 40 - (green ? into * 28 + Math.abs(march) * 8 : 0),
          },
        },
      },
      back: (ctx) => {
        const lx = -72;
        const top = BODY.shoulderY - 50;
        const r = 11;
        const gap = 28;
        ctx.fillStyle = "#1f2937";
        roundRect(ctx, lx - r * 1.6, top - r * 1.5, r * 3.2, gap * 2 + r * 3.2, 8);
        ctx.fill();
        const lit = green ? 2 : 0;
        const colours = ["#ef4444", "rgba(255,255,255,0.14)", "#22c55e"];
        colours.forEach((colour, i) => {
          const on = i === lit;
          if (on) {
            const glow = ctx.createRadialGradient(lx, top + i * gap, r * 0.2, lx, top + i * gap, r * 2.2);
            glow.addColorStop(0, i === 0 ? "rgba(239,68,68,0.55)" : "rgba(34,197,94,0.55)");
            glow.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(lx, top + i * gap, r * 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = on ? colour : "rgba(255,255,255,0.14)";
          ctx.beginPath();
          ctx.arc(lx, top + i * gap, r, 0, Math.PI * 2);
          ctx.fill();
        });
      },
      front: () => {},
    };
  }

  const into = ease(clamp(p / 0.3, 0, 1));
  const held = clamp((p - 0.3) / 0.6, 0, 1);
  // Out into a star and stopped there.
  const star = inReach(1, 88, BODY.shoulderY - 34);
  const rest = { x: SHOULDER.x + 11, y: SHOULDER.y + 56 };
  const x = rest.x + (star.x - rest.x) * into;
  const y = rest.y + (star.y - rest.y) * into;
  return {
    pose: {
      arms: { left: { x: -x, y }, right: { x, y } },
      effort: 0.2,
    },
    back: (ctx) => {
      // The silhouette being matched, filling as it is held.
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.ellipse(0, BODY.shoulderY + 6, 74, 84, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (held <= 0) return;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, BODY.shoulderY + 6, 84, -Math.PI / 2, -Math.PI / 2 + held * Math.PI * 2);
      ctx.stroke();
    },
    front: () => {},
  };
}

/** How far the working foot is from its hip, part way into a knee drive. */
const kickFoot = (side, up) => ({ dx: side * (4 + up * 34), dy: 78 - up * 52 });

/** The counter-lean, in degrees, at that point in the drive. */
const kickLean = (side, up) => -side * up * 4;

/**
 * Where the knee itself ends up.
 *
 * Clips say where the *foot* goes and let `drawPip` fold the leg around it,
 * which is the right way round for walking and squatting but leaves a knee
 * drive with nothing to aim the pad at: the fold puts the knee a long way
 * from the foot, so a pad placed by eye at the foot gets toed rather than
 * kneed. This runs the same fold the drawing will run and reports the corner.
 */
function kneeAt(side, up) {
  const hip = { x: side * BODY.hipHalf, y: BODY.hipY };
  const step = kickFoot(side, up);
  const { elbow } = armPose(
    hip.x,
    hip.y,
    hip.x + step.dx,
    hip.y + step.dy,
    side > 0 ? -1 : 1,
    BODY.thigh,
    BODY.shin,
  );
  // Props are drawn outside the lean, so the knee has to be brought out of it.
  const a = (kickLean(side, up) * Math.PI) / 180;
  const dx = elbow.x;
  const dy = elbow.y - BODY.hipY;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: BODY.hipY + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/** One knee, then the other, driven up into a pad. */
function kickClip(p, accent) {
  // Left knee in the first half, right in the second, so the clip shows the
  // movement is done on both sides rather than looking like a limp.
  const first = p < 0.5;
  const half = first ? p / 0.5 : (p - 0.5) / 0.5;
  const side = first ? -1 : 1;
  const up = there(half, 0.12, 0.86);

  /*
   * Driven out to the side, not straight ahead.
   *
   * Head on, a knee coming at the camera is the one movement the view cannot
   * show: the thigh points down the lens and foreshortens to nothing, so the
   * leg reads as a stubby lump under the hip whatever it is doing. Angled out
   * far enough that the thigh has length on screen — and with the shin left
   * hanging plumb rather than tucked back under — the same movement draws as
   * an L, and where the corner of that L is, is unmistakably a knee.
   */
  const knee = kneeAt(side, up);
  const pad = kneeAt(side, 1);
  // Lit while the knee is actually in the pad, rather than at a guessed point
  // in the timeline that the fold above may or may not agree with.
  const gap = Math.hypot(knee.x - pad.x, knee.y - pad.y);
  const hit = clamp(1 - gap / 18, 0, 1);

  return {
    pose: {
      lean: kickLean(side, up),
      effort: up * 0.8,
      feet: { [side < 0 ? "left" : "right"]: kickFoot(side, up) },
      // The opposite arm swings up across the chest and the near one tucks in
      // and down: running form, and it also keeps the near paw off the knee,
      // which is the one place in the picture that has to stay readable.
      arms: {
        left: side < 0 ? { dx: -(11 - up * 7), dy: 56 + up * 10 } : { dx: -(11 - up * 4), dy: 56 - up * 34 },
        right: side > 0 ? { dx: 11 - up * 7, dy: 56 + up * 10 } : { dx: 11 - up * 4, dy: 56 - up * 34 },
      },
    },
    back: (ctx) => {
      ctx.fillStyle = hit > 0 ? accent : "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.ellipse(pad.x, pad.y, 22, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 3;
      ctx.stroke();
      if (hit <= 0) return;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(pad.x, pad.y, 22 + hit * 16, 15 + hit * 11, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
    front: () => {},
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A chunky direction marker, pointing whichever way the body should go. */
export function arrow(ctx, x, y, dx, dy, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.9;
  roundRect(ctx, -16, -4, 22, 8, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(6, -13);
  ctx.lineTo(20, 0);
  ctx.lineTo(6, 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Every movement, and how long it takes to show one.
 *
 * Slower than the real thing on purpose. These are being copied, not raced,
 * and a punch played back at punching speed is a blur that teaches nothing.
 */
export const CLIPS = {
  punch: { ms: 2000, draw: punchClip },
  reach: { ms: 2200, draw: reachClip },
  swipe: { ms: 1700, draw: swipeClip },
  raise: { ms: 2000, draw: raiseClip },
  lean: { ms: 2600, draw: leanClip },
  squat: { ms: 2200, draw: squatClip },
  jump: { ms: 1800, draw: jumpClip },
  duck: { ms: 1800, draw: duckClip },
  hold: { ms: 2800, draw: holdClip },
  kick: { ms: 2400, draw: kickClip },
};

/** The movements a game will actually demonstrate, in order. */
export const clipsFor = (meta) => (meta?.actions ?? []).filter((a) => CLIPS[a]);

/**
 * Which movement is on screen at time `t`, for a game with several.
 *
 * Games that ask for more than one thing — Jump the Wall wants a jump and a
 * duck — show each in turn rather than picking one, so the list of steps
 * beside the animation can follow along.
 */
export function currentClip(meta, t) {
  const ids = clipsFor(meta);
  if (!ids.length) return { id: null, index: -1, phase: 0 };
  const total = ids.reduce((sum, id) => sum + CLIPS[id].ms, 0);
  let at = ((t % total) + total) % total;
  for (let i = 0; i < ids.length; i += 1) {
    const span = CLIPS[ids[i]].ms;
    if (at < span) return { id: ids[i], index: i, phase: at / span };
    at -= span;
  }
  return { id: ids[0], index: 0, phase: 0 };
}

/**
 * How much of Pip the camera frame shows.
 *
 * Full-body games draw the whole figure standing in the frame; upper-body
 * games zoom in until it is head, chest and arms, cropped at the waist —
 * which is the framing the player is being asked to set up, so the picture
 * doubles as the target to copy.
 */
function framing(needs) {
  /*
   * Full-body framing has to hold Pip at the top of a jump, not standing.
   * Ear tips reach 37 above the head, so a still figure is 207 tall and the
   * 56 of lift in the jump makes it 263 — against the 237 of headroom the
   * old 0.95 at nine tenths of the way down left, which sliced the tips off
   * flat at the exact moment the clip is demonstrating.
   */
  return needs === "full"
    ? { scale: 0.88, groundY: 0.95 }
    : { scale: 1.6, groundY: 1.62 };
}

/**
 * Paint one frame of the demonstration.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{w:number,h:number}} view  in CSS pixels
 * @param {object} meta               a game from the registry
 * @param {number} t                  milliseconds, any origin
 */
export function drawHowTo(ctx, view, meta, t) {
  const accent = meta?.accent ?? "#f97316";
  ctx.clearRect(0, 0, view.w, view.h);
  if (!(view.w > 0) || !(view.h > 0)) return;

  /*
   * The viewfinder is the canvas, whatever shape the canvas turns out to be.
   * Only the figure inside it is scaled to fit, because a body squeezed to
   * match a letterbox is no longer a body worth copying.
   */
  const radius = Math.min(18, view.w / 4, view.h / 4);
  const bg = ctx.createLinearGradient(0, 0, 0, view.h);
  bg.addColorStop(0, "#1e293b");
  bg.addColorStop(1, "#334155");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, view.w, view.h, radius);
  ctx.fill();

  ctx.save();
  roundRect(ctx, 0, 0, view.w, view.h, radius);
  ctx.clip();

  const { id, phase } = currentClip(meta, t);
  const clip = id ? CLIPS[id].draw(phase, accent, meta) : null;
  const { scale, groundY } = framing(meta?.needs);
  const k = Math.min(view.w / STAGE.w, view.h / STAGE.h);

  ctx.save();
  ctx.translate(view.w / 2, view.h * groundY);
  ctx.scale(k * scale, k * scale);
  if (clip) clip.back(ctx);
  drawPip(ctx, clip?.pose ?? {});
  if (clip) clip.front(ctx);
  ctx.restore();
  ctx.restore();

  // Corner ticks, so the frame reads as a viewfinder rather than a card.
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  const inset = 12;
  const c = Math.min(20, view.w / 6, view.h / 6);
  for (const [cx, sx] of [[inset, 1], [view.w - inset, -1]]) {
    for (const [cy, sy] of [[inset, 1], [view.h - inset, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * c, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * c);
      ctx.stroke();
    }
  }
}

/** The caption under the animation: how to do the movement being shown. */
export const clipCue = (id) => actionById(id)?.cue ?? "";
