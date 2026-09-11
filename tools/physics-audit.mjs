/**
 * Does the motion in these games behave the same on every device?
 *
 * A game that integrates its own movement is only as correct as its timestep.
 * The same jump on a 30fps phone and a 144fps desktop should reach the same
 * height, take the same time and be equally winnable; where it does not, the
 * game is quietly harder on some hardware than others. This runs each moving
 * thing at several frame rates and prints what actually happens, alongside the
 * answer the maths says it should give.
 *
 *   node tools/physics-audit.mjs
 */
import { Physics } from "../stage0/js/physics.js";
import { createGame as createFruitSlice } from "../stage0/js/games/fruit-slice.js";
import { createGame as createBalloonPop } from "../stage0/js/games/balloon-pop.js";
import { signals, VIEW } from "../stage0/js/games/test-support.js";

const RATES = [30, 60, 90, 144];
const fx = { cue: () => true };
const pad = (s, n) => String(s).padEnd(n);

function head(title) {
  console.log(`\n${title}\n${"-".repeat(title.length)}`);
}

/* ------------------------------------------------------------------ *
 * 1. The rigid-body jump
 * ------------------------------------------------------------------ */
head("Jump the Wall: does the jump land where it was asked to?");
console.log("asked for a 180px apex after 950ms of hang\n");
console.log("fps    apex      hang");
for (const fps of RATES) {
  const dt = 1 / fps;
  const p = new Physics({ apexPx: 180, hangMs: 950 });
  for (let t = 0; t < 0.5; t += dt) p.step(dt);
  p.jump();
  let apex = 0;
  let landed = null;
  for (let t = 0; t < 2; t += dt) {
    p.step(dt);
    apex = Math.max(apex, p.feetPx);
    if (landed == null && t > 0.2 && p.grounded) landed = t + dt;
  }
  console.log(`${pad(fps, 6)} ${pad(apex.toFixed(1) + "px", 9)} ${(landed * 1000).toFixed(0)}ms`);
}

/* ------------------------------------------------------------------ *
 * 2. The fixed-step accumulator under a struggling device
 * ------------------------------------------------------------------ */
head("Jump the Wall: what happens after the device stalls?");
console.log("a stall, then smooth frames again. Obstacle speed is the honest clock:");
console.log("it moves at a known rate, so distance says how much time the world ran.\n");
console.log("stall             sim run during the 0.5s of smooth frames after");
for (const [ms, n] of [
  [16.7, 30],
  [150, 10],
  [400, 6],
]) {
  const p = new Physics();
  p.addObstacle(1, "wall", 100000, 300);
  for (let i = 0; i < n; i += 1) p.step(ms / 1000);
  const before = p.obstacleX(1);
  for (let i = 0; i < 30; i += 1) p.step(1 / 60);
  const simT = (before - p.obstacleX(1)) / 300;
  const note = simT > 0.6 ? `  <-- sprinting at ${(simT / 0.5).toFixed(1)}x` : "";
  console.log(`${pad(n + " x " + ms + "ms", 17)} ${simT.toFixed(3)}s${note}`);
}

/* ------------------------------------------------------------------ *
 * 3. The fruit arc
 * ------------------------------------------------------------------ */
head("Fruit Slice: where does the fruit actually go?");
console.log("spawned at y=1.12 (below the screen); y=0 is the top\n");

/** Launch one fruit with a known speed and follow it. */
function arc(vy, fps, { sliced = false } = {}) {
  const dt = 1 / fps;
  const game = createFruitSlice({ fx });
  game.start(0);
  const s = signals();
  let now = 0;
  game.tick(dt, s, (now += dt * 1000), VIEW);
  game.items = [
    {
      // Out of the way of the ids the game hands out, or we end up following
      // a fruit it spawned instead of the one under test.
      id: 9001,
      kind: { name: "melon", skin: "#4ade80", flesh: "#fca5a5", size: 1 },
      bomb: false,
      x: 0.5,
      y: 1.12,
      vx: 0,
      vy,
      spin: 0,
      angle: 0,
      size: 1,
      sliced: sliced ? 0.01 : 0,
      counted: false,
    },
  ];
  let top = 1.12;
  let flight = 0;
  for (let i = 0; i < Math.round(4 / dt); i += 1) {
    // Hold off the spawner so nothing else shares the screen.
    game.spawnTimer = 999;
    game.tick(dt, s, (now += dt * 1000), VIEW);
    const item = game.items.find((it) => it.id === 9001);
    if (!item) break;
    top = Math.min(top, item.y);
    if (item.y <= 1.12) flight += dt;
  }
  return { top, flight };
}

/** Let the game throw its own fruit, and see where each one got to. */
function realArcs(fps, count = 400) {
  const dt = 1 / fps;
  const game = createFruitSlice({ fx });
  game.start(0);
  const s = signals();
  let now = 0;
  const flying = new Map();
  const tops = [];
  const air = [];
  for (let i = 0; i < Math.round(600 / dt) && tops.length < count; i += 1) {
    // Nobody is playing, so every fruit is dropped and the round keeps ending.
    // Start another one, or we measure four fruit and a lot of silence.
    if (game.over) game.start(now);
    game.tick(dt, s, (now += dt * 1000), VIEW);
    for (const item of game.items) {
      if (item.sliced > 0) continue;
      const f = flying.get(item.id) ?? { top: item.y, air: 0, rose: false };
      f.top = Math.min(f.top, item.y);
      f.air += dt;
      if (item.y < 1.05) f.rose = true;
      flying.set(item.id, f);
    }
    // An arc only counts once it has gone up and come all the way back down;
    // anything still climbing has a peak we have not seen yet.
    for (const [id, f] of flying) {
      const item = game.items.find((it) => it.id === id);
      // Fruit that vanished mid-arc (the round reset under it) is not an arc
      // we watched to the end, so it tells us nothing.
      if (!item) {
        flying.delete(id);
        continue;
      }
      if (!f.rose || item.y < 1.12) continue;
      tops.push(f.top);
      air.push(f.air);
      flying.delete(id);
    }
  }
  tops.sort((a, b) => a - b);
  return {
    n: tops.length,
    best: tops[0],
    median: tops[Math.floor(tops.length / 2)],
    worst: tops.at(-1),
    air: air.reduce((a, b) => a + b, 0) / air.length,
  };
}

console.log("fps    peak: highest / typical / lowest      time on screen");
for (const fps of RATES) {
  const r = realArcs(fps);
  console.log(
    `${pad(fps, 6)} ${pad(
      `${r.best.toFixed(3)} / ${r.median.toFixed(3)} / ${r.worst.toFixed(3)}  (${r.n} fruit)`,
      38,
    )} ${r.air.toFixed(2)}s`,
  );
}
console.log("\nthe player's hands live around 0.3-0.6, so the arc has to reach into that band");

head("Fruit Slice: do the two halves fall like the whole fruit did?");
for (const fps of [30, 144]) {
  const whole = arc(-1.06, fps);
  const half = arc(-1.06, fps, { sliced: true });
  console.log(
    `${pad(fps + "fps", 7)} whole peaks ${whole.top.toFixed(4)}, a half peaks ${half.top.toFixed(4)}`,
  );
}

/* ------------------------------------------------------------------ *
 * 4. Balloons
 * ------------------------------------------------------------------ */
head("Balloon Pop: do balloons rise at the same rate everywhere?");
console.log("fps    balloon height after 2s");
for (const fps of RATES) {
  const dt = 1 / fps;
  const game = createBalloonPop({ fx });
  game.start(0);
  const s = signals();
  let now = 0;
  game.tick(dt, s, (now += dt * 1000), VIEW);
  game.balloons = [
    { id: 9001, x: 0.5, y: 1, speed: 0.2, drift: 0, wobble: 0, size: 1, popping: 0 },
  ];
  for (let i = 0; i < Math.round(2 / dt); i += 1) {
    game.spawnTimer = 999;
    game.tick(dt, s, (now += dt * 1000), VIEW);
  }
  const b = game.balloons?.find((x) => x.id === 9001);
  console.log(`${pad(fps, 6)} ${b ? b.y.toFixed(4) : "gone"}`);
}

/* ------------------------------------------------------------------ *
 * 5. Particles
 * ------------------------------------------------------------------ */
head("Sparks: does the same burst look the same at every frame rate?");
console.log("fps    spread after 0.6s   average drop");
for (const fps of RATES) {
  const dt = 1 / fps;
  const g = createFruitSlice({ fx });
  g.start(0);
  // One spark per direction, so the spread is the physics and not the dice.
  g.particles = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
    x: 0.5,
    y: 0.5,
    vx: Math.cos((i / 8) * Math.PI * 2) * 0.55,
    vy: Math.sin((i / 8) * Math.PI * 2) * 0.55,
    gravity: 1.2,
    life: 0,
    max: 99,
    size: 1,
    color: "#fff",
  }));
  for (let i = 0; i < Math.round(0.6 / dt); i += 1) g.stepParticles(dt, { w: 1, h: 1 });
  const xs = g.particles.map((q) => q.x);
  const ys = g.particles.map((q) => q.y);
  const spread = Math.max(...xs) - Math.min(...xs);
  const drop = ys.reduce((a, b) => a + b, 0) / ys.length - 0.5;
  console.log(`${pad(fps, 6)} ${pad(spread.toFixed(4), 19)} ${drop.toFixed(4)}`);
}
