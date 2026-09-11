/**
 * Pip the fox — MotionPlay's mascot, drawn procedurally so there are no
 * image assets to load and the character can squash, stretch and blink.
 *
 * Everything is drawn in a 54x110 box whose origin is the character's feet.
 */

export const FUR = "#f97316";
export const FUR_DARK = "#ea580c";
export const CREAM = "#fff7ed";
export const INK = "#1f2937";

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTail(ctx, t, state) {
  const sway = Math.sin(t / 140) * (state === "run" ? 14 : 5);
  const lift = state === "jump" ? -14 : state === "duck" ? 12 : 0;

  ctx.save();
  ctx.translate(-18, -46 + lift);
  ctx.rotate((sway * Math.PI) / 180);

  // Bushy tail built from overlapping blobs so it reads as fur, not an arm.
  ctx.fillStyle = FUR;
  ctx.beginPath();
  ctx.ellipse(-6, -2, 13, 11, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-18, -14, 14, 12, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-27, -28, 12, 11, -0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.ellipse(-32, -38, 10, 9, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLegs(ctx, t, state) {
  ctx.fillStyle = FUR_DARK;
  if (state === "jump") {
    ellipse(ctx, -8, -14, 8, 6);
    ctx.fillStyle = FUR_DARK;
    ellipse(ctx, 12, -12, 8, 6, FUR_DARK);
    ellipse(ctx, -8, -14, 8, 6, FUR_DARK);
    return;
  }
  if (state === "duck") {
    ellipse(ctx, -10, -5, 10, 5, FUR_DARK);
    ellipse(ctx, 12, -5, 10, 5, FUR_DARK);
    return;
  }
  const cycle = Math.sin(t / 70);
  const back = cycle * 9;
  const front = -cycle * 9;
  ctx.fillStyle = FUR_DARK;
  ctx.fillRect(-12 + back, -22, 9, 22);
  ctx.fillRect(8 + front, -22, 9, 22);
  ellipse(ctx, -8 + back, -1, 8, 4, FUR_DARK);
  ellipse(ctx, 12 + front, -1, 8, 4, FUR_DARK);
}

function drawEar(ctx, x, tilt) {
  ctx.save();
  ctx.translate(x, -10);
  ctx.rotate(tilt);
  ctx.fillStyle = FUR;
  ctx.beginPath();
  ctx.moveTo(-11, 6);
  ctx.lineTo(0, -30);
  ctx.lineTo(11, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(124, 45, 18, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#7c2d12";
  ctx.beginPath();
  ctx.moveTo(-5, 2);
  ctx.lineTo(0, -18);
  ctx.lineTo(5, 1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFace(ctx, t, state, hurt) {
  const blink = Math.sin(t / 900) > 0.985 ? 0.15 : 1;

  ellipse(ctx, 0, 0, 20, 18, FUR);
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 18, 0, 0, Math.PI * 2);
  ctx.stroke();
  ellipse(ctx, 8, 6, 12, 9, CREAM);

  const earTilt = state === "jump" ? 0.5 : state === "duck" ? 1.1 : 0.15;
  drawEar(ctx, -11, -earTilt);
  drawEar(ctx, 9, earTilt * 0.6);

  ctx.fillStyle = "#fff";
  ellipse(ctx, 2, -2, 6, 6 * blink, "#fff");
  ellipse(ctx, 15, -1, 5, 5 * blink, "#fff");

  if (blink > 0.5) {
    ctx.fillStyle = INK;
    ellipse(ctx, 3.5, -2, 3, 3, INK);
    ellipse(ctx, 16, -1, 2.6, 2.6, INK);
  }

  ellipse(ctx, 19, 6, 3.4, 3, INK);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (hurt) {
    ctx.arc(13, 12, 4, Math.PI, 0);
  } else {
    ctx.arc(13, 9, 4.5, 0.15, Math.PI - 0.15);
  }
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number, groundY:number, state:"run"|"jump"|"duck", t:number,
 *          jumpHeight:number, hurt?:boolean, scale?:number}} opts
 */
export function drawMascot(ctx, opts) {
  const { x, groundY, state, t, jumpHeight = 0, hurt = false, scale = 1 } = opts;

  const bob = state === "run" ? Math.abs(Math.sin(t / 70)) * 3 : 0;
  const squash = state === "duck" ? 1 : state === "jump" ? 1.08 : 1 + bob / 60;
  const widen = state === "duck" ? 1.24 : state === "jump" ? 0.94 : 1;

  ctx.save();
  ctx.translate(x + 27, groundY - jumpHeight - bob);
  ctx.scale(scale * widen, scale * squash);

  if (state === "jump") ctx.rotate(-0.12);

  // A soft dark edge keeps Pip readable against bright sky and grass.
  ctx.strokeStyle = "rgba(124, 45, 18, 0.55)";
  ctx.lineWidth = 2;

  drawTail(ctx, t, state);
  drawLegs(ctx, t, state);

  const bodyY = state === "duck" ? -26 : -52;
  const bodyRx = state === "duck" ? 30 : 24;
  const bodyRy = state === "duck" ? 20 : 30;
  ellipse(ctx, 0, bodyY, bodyRx, bodyRy, FUR);
  ctx.beginPath();
  ctx.ellipse(0, bodyY, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.stroke();
  ellipse(ctx, 6, bodyY + 8, bodyRx * 0.6, bodyRy * 0.55, CREAM);

  const headY = state === "duck" ? -44 : -86;
  const headX = state === "duck" ? 16 : 4;
  ctx.save();
  ctx.translate(headX, headY);
  if (state === "duck") ctx.rotate(0.35);
  drawFace(ctx, t, state, hurt);
  ctx.restore();

  ctx.restore();
}

/*
 * How much room a running Pip actually takes up, measured out from the soles.
 *
 * He is not 110 tall and he is not centred on his feet: the ear tips reach 135
 * above the ground at the top of the bob, and the tail swings far enough back
 * that he sits well to the right of his own middle. Sizing a badge on body
 * height alone put the crown of his head exactly on the top edge and both ears
 * off the canvas entirely, which is how the logo came to be a fox with no ears.
 */
const BADGE = { up: 138, down: 4, left: -66, right: 28 };

/** Pip standing in a box of `size`, centred on `cx`,`cy`, all of him inside. */
export function drawMascotBadge(ctx, cx, cy, size, t) {
  const tall = BADGE.up + BADGE.down;
  const k = size / Math.max(tall, BADGE.right - BADGE.left);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  // Centre his own extents on the badge rather than his feet or his middle.
  ctx.translate(-(BADGE.left + BADGE.right) / 2, (BADGE.up - BADGE.down) / 2);
  drawMascot(ctx, { x: -27, groundY: 0, state: "run", t, jumpHeight: 0 });
  ctx.restore();
}
