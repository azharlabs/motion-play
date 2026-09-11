import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drawSkillArt, hasSkillArt, skillPoses } from "./skill-art.js";
import { SKILLS } from "./skills.js";
import { BODY, SHOULDER, armPose } from "./demo.js";

/** Where a point lands once the current transform has been applied to it. */
const apply = (m, x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });

const times = (m, n) => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f,
});

/** Points along the piece of an arc actually swept, not the whole circle. */
function arcPoints(x, y, rx, ry, rot, from, to, ccw) {
  let end = to;
  if (!ccw && end < from) end += Math.PI * 2;
  if (ccw && end > from) end -= Math.PI * 2;
  const out = [];
  for (let i = 0; i <= 16; i += 1) {
    const a = from + ((end - from) * i) / 16;
    const px = Math.cos(a) * rx;
    const py = Math.sin(a) * ry;
    out.push({
      x: x + px * Math.cos(rot) - py * Math.sin(rot),
      y: y + px * Math.sin(rot) + py * Math.cos(rot),
    });
  }
  return out;
}

/**
 * A 2D context stand-in that records what was drawn and where it landed.
 *
 * It carries a real transform stack and follows curves round, because the
 * mistake worth catching is a prop hung off a shoulder or a hip that ends up
 * over the edge of the card. Nothing drawn may be NaN either: canvas paints a
 * bad number as nothing at all, so a scene posed off the end of an arm would
 * vanish quietly rather than fail.
 */
function stubCtx() {
  const calls = [];
  const points = [];
  const stack = [];
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const gradient = { addColorStop() {} };
  const target = { calls, points };

  const put = (x, y) => points.push(apply(m, x, y));

  const track = (prop, a) => {
    for (const n of a) assert.ok(typeof n !== "number" || Number.isFinite(n), `${prop} got ${n}`);
    switch (prop) {
      case "save":
        stack.push({ ...m });
        break;
      case "restore":
        m = stack.pop() ?? m;
        break;
      case "translate":
        m = times(m, { a: 1, b: 0, c: 0, d: 1, e: a[0], f: a[1] });
        break;
      case "scale":
        m = times(m, { a: a[0], b: 0, c: 0, d: a[1] ?? a[0], e: 0, f: 0 });
        break;
      case "rotate": {
        const [cos, sin] = [Math.cos(a[0]), Math.sin(a[0])];
        m = times(m, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
        break;
      }
      case "moveTo":
      case "lineTo":
        put(a[0], a[1]);
        break;
      case "quadraticCurveTo":
        put(a[0], a[1]);
        put(a[2], a[3]);
        break;
      case "roundRect":
      case "fillRect":
      case "rect":
        put(a[0], a[1]);
        put(a[0] + a[2], a[1] + a[3]);
        break;
      case "arc":
        for (const p of arcPoints(a[0], a[1], a[2], a[2], 0, a[3], a[4], a[5])) put(p.x, p.y);
        break;
      case "ellipse":
        for (const p of arcPoints(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7])) put(p.x, p.y);
        break;
      default:
        break;
    }
  };

  return new Proxy(target, {
    get(t, prop) {
      if (prop === "calls") return calls;
      if (prop === "points") return points;
      if (prop === "canvas") return { width: 480, height: 270 };
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (!(prop in t)) {
        t[prop] = (...args) => {
          calls.push([prop, ...args]);
          track(prop, args);
        };
      }
      return t[prop];
    },
    set() {
      return true;
    },
  });
}

const paint = (id) => {
  const ctx = stubCtx();
  drawSkillArt(ctx, id, 480, 270, "#f97316");
  return ctx;
};

describe("skill card artwork", () => {
  it("has a picture for every skill on the shelf", () => {
    for (const skill of SKILLS) {
      assert.ok(hasSkillArt(skill.id), `"${skill.label}" has no artwork, so its card would be bare`);
    }
  });

  it("draws something for each of them", () => {
    for (const skill of SKILLS) {
      const drawn = paint(skill.id).calls.filter(([c]) => c === "fill" || c === "stroke");
      assert.ok(drawn.length > 8, `${skill.id} only painted ${drawn.length} times`);
    }
  });

  /*
   * The sides and the top are hard edges: a pad or an arrow hanging off one is
   * a mistake, and it looks like one. The bottom is not, because the closer
   * shots crop the legs off on purpose, exactly as the how-to screens do for
   * an upper-body game — so what is checked below the card is that the crop
   * stays a crop rather than the whole picture sliding out of shot.
   */
  it("keeps the scene inside the sides and the top of the card", () => {
    // A hair of slack for line width, since these are centre lines.
    const slack = 6;
    for (const skill of SKILLS) {
      for (const p of paint(skill.id).points) {
        assert.ok(
          p.x > -slack && p.x < 480 + slack,
          `${skill.id} drew at x=${Math.round(p.x)} of 480`,
        );
        assert.ok(p.y > -slack, `${skill.id} drew at y=${Math.round(p.y)}, above the card`);
      }
    }
  });

  it("crops the figure at most at the hip, never losing the body", () => {
    for (const skill of SKILLS) {
      const ys = paint(skill.id).points.map((p) => p.y);
      assert.ok(
        Math.max(...ys) < 270 * 2.4,
        `${skill.id} drew at y=${Math.round(Math.max(...ys))}, far below a 270 card`,
      );
    }
  });

  it("fills the card rather than huddling in the middle of it", () => {
    for (const skill of SKILLS) {
      const ys = paint(skill.id).points.map((p) => p.y);
      assert.ok(Math.min(...ys) < 70, `${skill.id} leaves the top of the card empty`);
      assert.ok(Math.max(...ys) > 200, `${skill.id} floats above the bottom of the card`);
    }
  });

  /*
   * Three kinds of shot across the shelf. Without this the cards drift back
   * towards each other one tidy-up at a time, which is how they ended up
   * looking identical the first time.
   */
  it("does not shoot every skill the same way", () => {
    const heights = SKILLS.map((skill) => {
      const ys = paint(skill.id).points.map((p) => p.y);
      // How tall the figure is drawn, which is what the framing decides.
      return Math.max(...ys) - Math.min(...ys);
    });
    const spread = Math.max(...heights) / Math.min(...heights);
    assert.ok(spread > 1.6, `every card is framed alike (tallest is only ${spread.toFixed(2)}x)`);
  });

  /*
   * The elbow breaks towards the side its paw is on, so an arm posed nearly
   * straight down folds its elbow into the middle of the chest and sends the
   * forearm back out — which paints as a stub on the shoulder and a paw
   * apparently detached beside the belly. It went unnoticed on six of the
   * nine cards, because it draws perfectly happily and only looks wrong.
   */
  it("never folds an elbow into the chest", () => {
    for (const skill of SKILLS) {
      for (const pose of skillPoses(skill.id)) {
        const shoulderY = BODY.shoulderY + (pose.crouch ?? 0) * 46 * 0.82 - (pose.lift ?? 0);
        for (const side of [-1, 1]) {
          const want = pose.arms?.[side < 0 ? "left" : "right"] ?? {};
          const shoulder = { x: side * SHOULDER.x, y: shoulderY + 2 };
          const to =
            want.x != null
              ? { x: want.x, y: want.y }
              : { x: shoulder.x + (want.dx ?? side * 11), y: shoulder.y + (want.dy ?? 56) };
          const { elbow } = armPose(shoulder.x, shoulder.y, to.x, to.y, side);
          assert.ok(
            Math.abs(elbow.x) > BODY.shoulderHalf,
            `${skill.id} puts its ${side < 0 ? "left" : "right"} elbow at x=${Math.round(
              elbow.x,
            )}, inside a chest ${BODY.shoulderHalf} wide`,
          );
        }
      }
    }
  });

  it("uses the skill's own colour, not one baked into the drawing", () => {
    const ctx = stubCtx();
    let seen = false;
    const spy = new Proxy(ctx, {
      get: (t, p) => t[p],
      set(t, p, v) {
        if ((p === "fillStyle" || p === "strokeStyle") && v === "#0891b2") seen = true;
        return true;
      },
    });
    drawSkillArt(spy, "core", 480, 270, "#0891b2");
    assert.ok(seen, "the tint never reached the props");
  });

  it("paints nothing at all for a skill it does not know", () => {
    const ctx = stubCtx();
    drawSkillArt(ctx, "telekinesis", 480, 270, "#f97316");
    assert.deepEqual(
      ctx.calls.map(([c]) => c),
      ["clearRect"],
    );
  });

  it("survives a card with no room in it", () => {
    for (const [w, h] of [[0, 0], [480, 0], [0, 270]]) {
      const ctx = stubCtx();
      drawSkillArt(ctx, "balance", w, h, "#0f9b8e");
      assert.deepEqual(ctx.calls.map(([c]) => c), ["clearRect"]);
    }
  });
});
