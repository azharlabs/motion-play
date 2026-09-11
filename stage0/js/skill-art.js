/**
 * Artwork for the skill shelf: Pip doing the thing each skill is about.
 *
 * The cards used to carry an emoji, which names an object — a leg, a
 * stopwatch, a pair of scales — rather than showing a body doing anything.
 * Since the how-to screens already teach movements by drawing them, these use
 * the same mascot, the same accent-coloured props and the same figure units,
 * frozen at the moment in the movement that says the most. So "Balance" is a
 * fox holding itself over a tipping board, and the picture is understood
 * before the words under it are read.
 *
 * Drawn rather than downloaded, for the same reasons the rest of the arcade
 * is: nothing to fetch on a bad connection, nothing to cache for offline play,
 * no licence to honour, and it restyles with each skill's own tint.
 */
import { BODY, SHOULDER, arrow, drawPip, inReach } from "./demo.js";

/** The box a scene is composed in, matching the how-to animations. */
const STAGE = { w: 300, h: 250 };

/** Ground line as a fraction down the card, leaving room for props overhead. */
const GROUND = 0.93;

/**
 * How close the camera gets, and where the figure stands in the frame.
 *
 * Nine cards showing the same fox standing in the same spot at the same size
 * are nine cards nobody can tell apart, however carefully the props differ:
 * the silhouette is most of the picture and the props are a detail on top of
 * it. So the framing is part of what each skill says. The skills that live in
 * the arms and the middle are shot close, cropped at the hip the way the
 * how-to screens crop an upper-body game, and the ones about what the legs
 * and the whole body are doing are shot wide, with the figure small and air
 * around it. Then a glance at the shelf sees three different kinds of picture
 * before it reads a single label.
 *
 * `scale` multiplies the fit; `groundY` puts the floor a fraction of the way
 * down the card, and past 1 it is off the bottom, which is what crops the
 * legs; `offsetX` slides the figure off centre to leave a prop room.
 *
 * There is a limit to how close it is worth going. Pip is drawn with a head
 * nearly as wide as his chest, so past about this much the head takes the
 * card and the props end up level with his ears, where a punch pad looks
 * like an earring. Anything tighter than CHEST also brings the paws in
 * towards the shoulders, and an arm asked to fold that far comes out as a
 * hook with a stub on the end of it.
 */
const CHEST = { scale: 1.6, groundY: 1.4 };
const MID = { scale: 1.3, groundY: 1.12 };
const WIDE = { scale: 0.84, groundY: 0.84 };

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

/**
 * Where an arm that is not doing anything goes.
 *
 * Not straight down, however natural that sounds. The elbow breaks towards
 * the side the paw is on, so an arm asked to hang almost vertically puts its
 * elbow inside the chest and brings the forearm back out again — which draws
 * as a stub at the shoulder, an orange bar across the belly patch and a paw
 * apparently floating free beside the body. Held out and nearly straight,
 * there is no slack left for it to fold into.
 */
const hang = (side) => ({ dx: side * 30, dy: 58 });

/** Anything faint — ghosts, ranges, paths — at one strength across the set. */
function faint(ctx, alpha, paint) {
  ctx.save();
  ctx.globalAlpha = alpha;
  paint(ctx);
  ctx.restore();
}

function dashed(ctx, colour, dash, path, width = 3) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.beginPath();
  path(ctx);
  ctx.stroke();
  ctx.restore();
}

/** A ball, a pad, a target: whatever the movement is aimed at. */
function ball(ctx, x, y, r, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.28, 0, TAU);
  ctx.fill();
}

/** Short lines thrown out from a point: contact, or something lighting up. */
function spokes(ctx, x, y, inner, outer, colour, n = 8) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
    ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

/** An arrowhead sitting on a curve, pointing the way the curve is going. */
function head(ctx, x, y, angle, size, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.8, -size * 0.72);
  ctx.lineTo(-size * 0.8, size * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A swept arc with a head on each end: this part travels, back and forth. */
function sweep(ctx, cx, cy, r, from, to, colour) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, from, to);
  ctx.stroke();
  ctx.restore();
  head(ctx, cx + Math.cos(to) * r, cy + Math.sin(to) * r, to + Math.PI / 2, 8, colour);
  head(ctx, cx + Math.cos(from) * r, cy + Math.sin(from) * r, from - Math.PI / 2, 8, colour);
}

/** Where a paw sits after travelling `t` of the way along a curve. */
function along(from, ctrl, to, t) {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y,
  };
}

/**
 * One frozen pose per skill.
 *
 * Each returns the same shape the how-to clips do — a pose for Pip, something
 * behind and something in front — plus an optional ghost, a second faded
 * figure for the skills that are about changing from one shape to another.
 */
const SCENES = {
  /** Eyes on a moving ball, paw arriving where it will be. */
  coordination(accent) {
    // High, so the arm goes up to meet it. Out at shoulder height it made the
    // same shape as the reach card next to it on the shelf — same mid shot,
    // same arm out to a round thing on the right — and the two cards were
    // telling each other apart on background colour alone.
    const target = { x: 62, y: BODY.headY - 8 };
    // A flight starting at the floor on the far side of the card. What this
    // skill is is the path, not the ball at the end of it, so the path is
    // given the room and the fox stands out of its way.
    const start = { x: -118, y: 2 };
    const ctrl = { x: -34, y: BODY.headY - 18 };
    const paw = inReach(1, target.x - 12, target.y + 10);

    return {
      ...MID,
      offsetX: -34,
      pose: {
        effort: 0.55,
        headTilt: 0.14,
        // Both arms up and out, watching it in: a body about to catch
        // something, rather than one arm working and one hanging.
        arms: { right: { ...paw, reachOut: 0.5 }, left: { x: -70, y: -120 } },
      },
      back: (ctx) => {
        faint(ctx, 0.55, () =>
          dashed(ctx, accent, [7, 9], (c) => {
            c.moveTo(start.x, start.y);
            c.quadraticCurveTo(ctrl.x, ctrl.y, target.x, target.y);
          }),
        );
        // Where it has just been, so the ball reads as travelling.
        for (const [t, a] of [[0.5, 0.14], [0.66, 0.22], [0.8, 0.34]]) {
          const at = along(start, ctrl, target, t);
          faint(ctx, a, () => ball(ctx, at.x, at.y, 12, accent));
        }
      },
      front: (ctx) => {
        ball(ctx, target.x, target.y, 16, accent);
        faint(ctx, 0.75, () => spokes(ctx, target.x, target.y, 22, 31, accent, 6));
      },
    };
  },

  /** Everything an arm has, out to the last inch of it. */
  reach(accent) {
    const far = inReach(1, 150, BODY.shoulderY - 54, 0);
    const r = Math.hypot(far.x - SHOULDER.x, far.y - SHOULDER.y);

    return {
      /*
       * Shot wide enough that the arc the arm can cover fits inside the card
       * whole. Cropped in close it came out as two unconnected runs of dashes
       * leaving the frame at the top and the bottom, which says nothing about
       * range; the point of the card is the size of that circle, so the card
       * has to be big enough to hold it.
       */
      scale: 1.05,
      groundY: 0.95,
      offsetX: -40,
      pose: {
        effort: 0.7,
        headTilt: 0.07,
        arms: { right: { ...far, reachOut: 0.25 }, left: hang(-1) },
      },
      back: (ctx) => {
        // The whole span the arm can cover, from hanging to full stretch.
        faint(ctx, 0.45, () =>
          dashed(ctx, accent, [6, 8], (c) =>
            c.arc(SHOULDER.x, SHOULDER.y, r, rad(-84), rad(84)),
          ),
        );
        faint(ctx, 0.55, () =>
          sweep(ctx, SHOULDER.x, SHOULDER.y, r * 0.62, rad(60), rad(-44), accent),
        );
      },
      front: (ctx) => {
        // The thing at the edge of the range, only just touched.
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(far.x + 13, far.y - 9, 13, 0, TAU);
        ctx.stroke();
        ball(ctx, far.x + 13, far.y - 9, 6, accent);
      },
    };
  },

  /** Arms and shoulders doing the work: one out, one on guard. */
  "upper-body"(accent) {
    /*
     * The pad sits out at arm's length, which is not a decision about
     * composition: a pad drawn closer than that is a pad the arm has to fold
     * up to reach, and a folded arm on a front-on figure is an orange hook.
     * Out here the arm is nearly straight and reads as a punch landing.
     */
    const pad = { x: 88, y: BODY.shoulderY - 6 };
    const paw = inReach(1, pad.x + 4, pad.y + 2);

    return {
      // The closest shot on the shelf: chest, shoulders and both arms, with
      // the legs out of it entirely, because they have nothing to do with it.
      ...CHEST,
      pose: {
        effort: 0.95,
        arms: {
          right: { ...paw, reachOut: 0.55 },
          // Kept back as a guard rather than put out on the second pad, which
          // made both arms level and turned the card into the core one.
          left: { x: -48, y: BODY.shoulderY - 26 },
        },
      },
      back: (ctx) => {
        for (const side of [-1, 1]) {
          const live = side > 0;
          ctx.fillStyle = live ? accent : "rgba(148,163,184,0.3)";
          ctx.beginPath();
          ctx.arc(side * pad.x, pad.y, 21, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = live ? "#fff" : "rgba(255,255,255,0.5)";
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      },
      front: (ctx) => spokes(ctx, pad.x, pad.y, 25, 34, "#fbbf24"),
    };
  },

  /** The top half swings; the middle refuses to come with it. */
  core(accent) {
    return {
      /*
       * Down to the hips, which is what separates this from the upper-body
       * card: a middle holding still cannot be shown by cropping to the part
       * that is moving. Not as far as the feet, though — the lean pivots the
       * whole figure at the hip, so with the legs in shot they tilt too and
       * a braced middle turns into a fox toppling sideways.
       */
      scale: 1.3,
      groundY: 1.24,
      pose: {
        lean: 14,
        headTilt: -0.05,
        effort: 0.6,
        arms: {
          left: { x: -92, y: BODY.shoulderY + 2 },
          right: { x: 92, y: BODY.shoulderY - 12 },
        },
      },
      back: (ctx) => {
        // The line the middle holds, whatever the shoulders are doing.
        faint(ctx, 0.5, () =>
          dashed(ctx, accent, [7, 8], (c) => {
            c.moveTo(0, BODY.headY - 30);
            c.lineTo(0, -4);
          }),
        );
      },
      front: (ctx) => {
        // Braced at the hips, travelling at the shoulders.
        ctx.strokeStyle = accent;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.ellipse(0, BODY.hipY - 4, 34, 15, 0, 0, TAU);
        ctx.stroke();
        // Ends kept well above shoulder height: swung wider, the arrowheads
        // came down on the paws and pinched them off their own forearms.
        faint(ctx, 0.85, () =>
          sweep(ctx, 0, BODY.hipY, 108, rad(-130), rad(-50), accent),
        );
      },
    };
  },

  /** Weight over a board that will not stay flat. */
  balance(accent) {
    const tilt = 8;
    return {
      // Wide and small: whether a whole body is holding itself up cannot be
      // seen from a close-up of it, and the board needs room underneath.
      ...WIDE,
      // Stood off the middle of the board and tipped with it, so that it is
      // the one card of the wide three that is visibly off-balance rather
      // than another fox standing square and symmetrical.
      offsetX: -16,
      pose: {
        lean: -9,
        headTilt: 0.05,
        effort: 0.5,
        arms: {
          left: { x: -112, y: BODY.shoulderY - 34 },
          right: { x: 108, y: BODY.shoulderY - 18 },
        },
      },
      back: (ctx) => {
        ctx.save();
        ctx.translate(0, 9);
        ctx.rotate(rad(tilt));
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(-104, -5, 208, 11, 5);
        ctx.fill();
        ctx.restore();

        // What it is tipping over.
        ctx.fillStyle = "rgba(71,85,105,0.55)";
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.lineTo(17, 32);
        ctx.lineTo(-17, 32);
        ctx.closePath();
        ctx.fill();
      },
      front: (ctx) => {
        // Which way it is going, and the correction being made.
        faint(ctx, 0.8, () => {
          arrow(ctx, 122, 12, 0.35, 1, accent);
          arrow(ctx, -122, -12, -0.35, -1, accent);
        });
      },
    };
  },

  /**
   * Legs and hips at the one moment they are unmistakably the ones working:
   * off the floor.
   *
   * Not by using the mascot's own jump, which tucks the knees up. A fox seen
   * front on folds its knees in behind its body, so the tighter the tuck the
   * less of a leg there is to see, and the card came out as an orange lump
   * with no legs in it at all. Instead the figure stands with its legs
   * straight — which is the one way they are unmistakably legs — and the
   * floor is drawn well below its feet. The gap does the talking.
   */
  "lower-body"(accent) {
    const floor = 74;
    return {
      scale: 0.82,
      // The feet sit high, because everything below them is the drop.
      groundY: 0.7,
      pose: {
        effort: 0.9,
        // Thrown up and out, the way arms go when the feet leave the floor.
        arms: {
          left: { x: -62, y: BODY.shoulderY - 30 },
          right: { x: 62, y: BODY.shoulderY - 30 },
        },
      },
      back: (ctx) => {
        dashed(ctx, accent, [10, 8], (c) => {
          c.moveTo(-112, floor);
          c.lineTo(112, floor);
        }, 4);
        // What it pushed off, directly under where it now is.
        faint(ctx, 0.3, () => {
          ctx.fillStyle = "#475569";
          ctx.beginPath();
          ctx.ellipse(0, floor, 40, 8, 0, 0, TAU);
          ctx.fill();
        });
      },
      // How far off the floor. Just the arrow: a second dashed line up at the
      // height of the feet read as a piece of the floor come loose.
      front: (ctx) => faint(ctx, 0.85, () => arrow(ctx, 96, floor - 12, 0, -1, accent)),
    };
  },

  /** Already going the other way, before the last shape has finished. */
  agility(accent) {
    return {
      // Wide, and standing well left of centre, because the card has to hold
      // two of him: where he is and where he just was, far enough apart that
      // the two sets of legs are not standing in each other.
      scale: 0.88,
      groundY: 0.88,
      offsetX: -34,
      pose: {
        lean: -15,
        effort: 0.75,
        // One arm up, one arm through: a stride caught front on.
        arms: { left: { x: -66, y: BODY.shoulderY - 14 }, right: { x: 70, y: -104 } },
      },
      // The shape just left behind. Faint and close, or it stops being a
      // trailing after-image and becomes a second fox standing there.
      ghost: {
        x: 74,
        alpha: 0.16,
        pose: {
          lean: 18,
          effort: 0.4,
          arms: { left: { x: -70, y: -104 }, right: { x: 66, y: BODY.shoulderY - 14 } },
        },
      },
      back: (ctx) => {
        faint(ctx, 0.75, () =>
          dashed(ctx, accent, [9, 8], (c) => {
            c.moveTo(96, -6);
            c.lineTo(30, -22);
            c.lineTo(-40, -6);
            c.lineTo(-100, -24);
          }),
        );
      },
      // Just the arrowhead on the path. There were speed lines behind the
      // shoulders as well, and they landed across the ghost's chest, where
      // they read as two marks left on the drawing by mistake.
      front: (ctx) => head(ctx, -104, -25, rad(197), 10, accent),
    };
  },

  /** It lit up a moment ago and the hand is already on its way. */
  reaction(accent) {
    const flash = { x: -84, y: BODY.shoulderY - 22 };
    const paw = inReach(-1, flash.x + 22, flash.y + 14);

    return {
      // Stood over to the right, so the thing that lit up owns the other side
      // of the card and the picture is read left to right, as it happened.
      ...MID,
      offsetX: 34,
      pose: {
        effort: 0.85,
        headTilt: -0.13,
        arms: { left: { ...paw, reachOut: 0.7 }, right: hang(1) },
      },
      back: (ctx) => {
        // Rings going out from the thing that just appeared.
        for (const [r, a] of [[30, 0.45], [42, 0.25]]) {
          faint(ctx, a, () => {
            ctx.strokeStyle = accent;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(flash.x, flash.y, r, 0, TAU);
            ctx.stroke();
          });
        }
        ball(ctx, flash.x, flash.y, 19, accent);
      },
      front: (ctx) => {
        faint(ctx, 0.7, () => {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          for (const [dy, len] of [[-13, 26], [2, 34], [17, 22]]) {
            ctx.beginPath();
            ctx.moveTo(paw.x + 22, paw.y + dy);
            ctx.lineTo(paw.x + 22 + len, paw.y + dy);
            ctx.stroke();
          }
        });
      },
    };
  },

  /** The shape found, and then nothing moving at all. */
  posture(accent) {
    const star = inReach(1, 90, BODY.shoulderY - 36);
    return {
      // Wide and dead centre. It is the only symmetrical card on the shelf,
      // which is the quickest way to say "hold this shape and stop moving".
      ...WIDE,
      pose: {
        effort: 0.2,
        arms: { left: { x: -star.x, y: star.y }, right: { x: star.x, y: star.y } },
      },
      back: (ctx) => {
        /*
         * The whole figure inside a ring, filling as much of it as it will,
         * and the ring closing as the hold is counted out. A ring drawn
         * around the shoulders got mistaken for the hoop on the core card,
         * so this one goes round everything — no other card on the shelf is
         * a circle with a fox inside it.
         */
        // Wide enough to take the ears in too, so the figure is inside the
        // ring rather than growing out through the top of it.
        const mid = { y: BODY.headY / 2 - 11, r: 112 };
        faint(ctx, 0.4, () =>
          dashed(ctx, "#475569", [6, 8], (c) => c.arc(0, mid.y, mid.r - 15, 0, TAU), 2),
        );
        ctx.strokeStyle = accent;
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0, mid.y, mid.r, rad(-90), rad(-90) + 0.72 * TAU);
        ctx.stroke();
      },
      front: (ctx) => {
        // Stacked straight, which is the whole of the instruction.
        faint(ctx, 0.4, () =>
          dashed(ctx, "#475569", [5, 7], (c) => {
            c.moveTo(0, BODY.headY - 34);
            c.lineTo(0, 2);
          }, 2),
        );
      },
    };
  },
};

/** Whether a skill has a picture of its own, for the tests to insist on. */
export const hasSkillArt = (id) => typeof SCENES[id] === "function";

/** Every pose a card puts on the page, so the tests can check the arms. */
export function skillPoses(id) {
  const scene = SCENES[id];
  if (!scene) return [];
  const { pose, ghost } = scene("#f97316");
  return ghost ? [pose, ghost.pose] : [pose];
}

/**
 * Paint a skill's card art into whatever box it is handed.
 *
 * The card supplies its tint as a background, so nothing is filled here: only
 * Pip and the props go down, and the wash shows through behind them.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} id      a skill id from skills.js
 * @param {number} w
 * @param {number} h
 * @param {string} accent  the skill's tint, used for every prop
 */
export function drawSkillArt(ctx, id, w, h, accent = "#f97316") {
  ctx.clearRect(0, 0, w, h);
  if (!(w > 0) || !(h > 0)) return;

  const scene = SCENES[id];
  if (!scene) return;
  const {
    pose,
    back,
    front,
    ghost,
    groundY = GROUND,
    scale = 1,
    offsetX = 0,
  } = scene(accent);

  const k = Math.min(w / STAGE.w, h / STAGE.h) * scale;
  ctx.save();
  ctx.translate(w / 2 + offsetX * k, h * groundY);
  ctx.scale(k, k);

  back?.(ctx);
  if (ghost) {
    ctx.save();
    ctx.globalAlpha = ghost.alpha;
    ctx.translate(ghost.x, 0);
    drawPip(ctx, ghost.pose);
    ctx.restore();
  }
  drawPip(ctx, pose);
  front?.(ctx);

  ctx.restore();
}
