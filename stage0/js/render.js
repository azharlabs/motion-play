import { drawMascot } from "./mascot.js";
import { OB_SHAPE, OB_WALL, OB_BRANCH } from "./physics.js";

export const FIELD_W = 960;
export const FIELD_H = 540;
export const GROUND_Y = 430;

const SKY_TOP = "#8ed7f7";
const SKY_LOW = "#d9f2ff";
const HILL_FAR = "#a7d8b4";
const HILL_NEAR = "#77c48f";
const GRASS = "#5cb874";
const GRASS_DARK = "#3f9c5c";
const SOIL = "#a97148";
const STONE = "#94a3b8";
const STONE_DARK = "#64748b";
const BARK = "#8b5a2b";
const LEAF = "#2f9e58";

/** The art is driven by the collider geometry so the two can never disagree. */
export const WALL_H = OB_SHAPE[OB_WALL].top;
export const BRANCH_CLEAR = OB_SHAPE[OB_BRANCH].top;
const BRANCH_UNDERSIDE = OB_SHAPE[OB_BRANCH].bottom;
const APEX_PX = 180;

/** Stable per-obstacle variation so bricks don't shimmer between frames. */
function rand(seed, i) {
  const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return x - Math.floor(x);
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

function heart(ctx, x, y, size, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 16, size / 16);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-9, -5, -4, -13, 0, -7);
  ctx.bezierCurveTo(4, -13, 9, -5, 0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export class GameRenderer {
  constructor() {
    this.particles = [];
    this.popups = [];
    this.shake = 0;
    this.flash = 0;
    this.scroll = { clouds: 0, hills: 0, trees: 0, ground: 0, flowers: 0 };
    this.prevJumping = false;
    this.landedAt = -Infinity;
  }

  reset() {
    this.particles.length = 0;
    this.popups.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  onScore(points, now) {
    this.popups.push({
      text: points > 1 ? `+${points}!` : "+1",
      x: 210 + Math.random() * 30,
      y: GROUND_Y - 150,
      born: now,
      life: 780,
    });
    for (let i = 0; i < 10; i += 1) {
      this.particles.push({
        x: 190,
        y: GROUND_Y - 90,
        vx: 40 + Math.random() * 160,
        vy: -120 + Math.random() * 90,
        life: 500 + Math.random() * 260,
        age: 0,
        size: 3 + Math.random() * 3,
        color: Math.random() > 0.5 ? "#fde047" : "#fff",
      });
    }
  }

  onHit() {
    this.shake = 16;
    this.flash = 1;
    for (let i = 0; i < 16; i += 1) {
      this.particles.push({
        x: 180,
        y: GROUND_Y - 70,
        vx: -180 + Math.random() * 360,
        vy: -220 + Math.random() * 140,
        life: 520 + Math.random() * 240,
        age: 0,
        size: 3 + Math.random() * 4,
        color: Math.random() > 0.5 ? "#f87171" : "#fbbf24",
      });
    }
  }

  #dust(x, y, count, color = "#e7d6bf") {
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        x: x + Math.random() * 30,
        y,
        vx: -90 + Math.random() * 40,
        vy: -30 - Math.random() * 60,
        life: 320 + Math.random() * 200,
        age: 0,
        size: 3 + Math.random() * 4,
        color,
      });
    }
  }

  #stepParticles(dt) {
    for (const p of this.particles) {
      p.age += dt * 1000;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 520 * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  #drawSky(ctx) {
    // The field is a fixed size, so this gradient never has to be built twice.
    if (!this.sky) {
      this.sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      this.sky.addColorStop(0, SKY_TOP);
      this.sky.addColorStop(1, SKY_LOW);
    }
    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, FIELD_W, GROUND_Y);

    ctx.fillStyle = "#fff3b0";
    ctx.beginPath();
    ctx.arc(820, 90, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.arc(820, 90, 34, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawClouds(ctx) {
    const off = this.scroll.clouds % 520;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    for (let i = 0; i < 4; i += 1) {
      const x = ((i * 320 - off) % (FIELD_W + 320)) - 160;
      const y = 60 + (i % 2) * 46;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.arc(x + 30, y + 6, 20, 0, Math.PI * 2);
      ctx.arc(x - 28, y + 8, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #drawHills(ctx) {
    const far = this.scroll.hills % 480;
    ctx.fillStyle = HILL_FAR;
    for (let i = -1; i < 4; i += 1) {
      const x = i * 480 - far;
      ctx.beginPath();
      ctx.ellipse(x + 240, GROUND_Y + 20, 260, 130, 0, Math.PI, 0);
      ctx.fill();
    }

    const near = this.scroll.trees % 360;
    ctx.fillStyle = HILL_NEAR;
    for (let i = -1; i < 5; i += 1) {
      const x = i * 360 - near;
      ctx.beginPath();
      ctx.ellipse(x + 180, GROUND_Y + 30, 200, 90, 0, Math.PI, 0);
      ctx.fill();
    }
  }

  #drawTrees(ctx) {
    const off = this.scroll.trees % 300;
    for (let i = -1; i < 5; i += 1) {
      const x = i * 300 - off + 60;
      ctx.fillStyle = "#6b4423";
      ctx.fillRect(x, GROUND_Y - 74, 14, 74);
      ctx.fillStyle = "#38a169";
      ctx.beginPath();
      ctx.arc(x + 7, GROUND_Y - 92, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#48bb78";
      ctx.beginPath();
      ctx.arc(x - 6, GROUND_Y - 100, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #drawGround(ctx) {
    ctx.fillStyle = SOIL;
    ctx.fillRect(0, GROUND_Y, FIELD_W, FIELD_H - GROUND_Y);
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, GROUND_Y, FIELD_W, 22);
    ctx.fillStyle = GRASS_DARK;
    ctx.fillRect(0, GROUND_Y + 18, FIELD_W, 5);

    const off = this.scroll.ground % 60;
    ctx.fillStyle = GRASS_DARK;
    for (let x = -off; x < FIELD_W + 60; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x + 8, GROUND_Y - 10);
      ctx.lineTo(x + 15, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#8c5f3f";
    for (let x = -((this.scroll.ground * 1.1) % 140); x < FIELD_W; x += 140) {
      ctx.fillRect(x, GROUND_Y + 44, 46, 8);
    }
  }

  #drawFlowers(ctx) {
    const off = this.scroll.flowers % 210;
    for (let i = -1; i < 7; i += 1) {
      const x = i * 210 - off;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, FIELD_H - 34, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(x, FIELD_H - 34, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ef7d9d";
      ctx.beginPath();
      ctx.arc(x + 96, FIELD_H - 20, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #groundShadow(ctx, cx, halfWidth, alpha = 0.22) {
    ctx.fillStyle = `rgba(20, 45, 25, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 8, halfWidth, halfWidth * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawWall(ctx, ob) {
    const h = WALL_H;
    const top = GROUND_Y - h;
    const rows = 6;
    const rowH = h / rows;

    this.#groundShadow(ctx, ob.x + ob.width / 2, ob.width * 0.75, 0.26);

    // Mortar body sits behind the blocks so the joints read as recessed.
    ctx.fillStyle = "#6b7688";
    roundRect(ctx, ob.x, top, ob.width, h, 4);
    ctx.fill();

    for (let row = 0; row < rows; row += 1) {
      const y = top + row * rowH;
      const offset = row % 2 ? -ob.width * 0.25 : 0;
      for (let col = -1; col < 3; col += 1) {
        const bx = ob.x + offset + col * (ob.width / 2);
        const bw = ob.width / 2;
        const left = Math.max(ob.x, bx);
        const right = Math.min(ob.x + ob.width, bx + bw);
        if (right - left < 3) continue;

        const shade = rand(ob.seed, row * 4 + col);
        const tone = 148 + Math.floor(shade * 26);
        ctx.fillStyle = `rgb(${tone}, ${tone + 8}, ${tone + 22})`;
        roundRect(ctx, left + 1.5, y + 1.5, right - left - 3, rowH - 3, 3);
        ctx.fill();

        // Light from the upper left.
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.fillRect(left + 3, y + 3, right - left - 6, 2.5);
        ctx.fillStyle = "rgba(30,41,59,0.18)";
        ctx.fillRect(left + 3, y + rowH - 6, right - left - 6, 2.5);
      }
    }

    // Weathered right edge.
    const edge = ctx.createLinearGradient(ob.x, 0, ob.x + ob.width, 0);
    edge.addColorStop(0, "rgba(255,255,255,0.10)");
    edge.addColorStop(0.6, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(30,41,59,0.22)");
    ctx.fillStyle = edge;
    roundRect(ctx, ob.x, top, ob.width, h, 4);
    ctx.fill();

    // Overhanging capstone.
    ctx.fillStyle = STONE_DARK;
    roundRect(ctx, ob.x - 6, top - 12, ob.width + 12, 14, 4);
    ctx.fill();
    ctx.fillStyle = STONE;
    roundRect(ctx, ob.x - 6, top - 12, ob.width + 12, 9, 4);
    ctx.fill();

    // Moss on the cap and a tuft at the base.
    ctx.fillStyle = LEAF;
    ctx.beginPath();
    ctx.ellipse(ob.x + 10, top - 10, 12, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(ob.x + ob.width - 14, top - 9, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GRASS_DARK;
    ctx.beginPath();
    ctx.ellipse(ob.x + 4, GROUND_Y, 12, 6, 0, Math.PI, 0);
    ctx.ellipse(ob.x + ob.width - 4, GROUND_Y, 10, 5, 0, Math.PI, 0);
    ctx.fill();
  }

  #drawBranch(ctx, ob) {
    const barY = GROUND_Y - BRANCH_CLEAR;
    const cx = ob.x + ob.width / 2;
    const thickness = 20;

    this.#groundShadow(ctx, cx, ob.width * 0.55, 0.16);

    // Limb descending out of a canopy that overhangs the top of the frame.
    ctx.strokeStyle = BARK;
    ctx.lineCap = "round";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(cx + 30, 40);
    ctx.quadraticCurveTo(cx + 26, barY - 70, cx + 2, barY - 4);
    ctx.stroke();

    ctx.fillStyle = "#1f7a44";
    ctx.beginPath();
    ctx.ellipse(cx + 30, 22, 74, 46, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 30, 6, 52, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f9e58";
    ctx.beginPath();
    ctx.ellipse(cx + 46, 6, 62, 38, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 6, -6, 54, 34, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main horizontal limb, tapering to the tip.
    ctx.beginPath();
    ctx.moveTo(ob.x + ob.width, barY + 2);
    ctx.lineTo(ob.x + 6, barY + 6);
    ctx.lineWidth = thickness;
    ctx.stroke();

    ctx.strokeStyle = "#6b4423";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const y = barY - 4 + i * 4;
      ctx.beginPath();
      ctx.moveTo(ob.x + 12 + rand(ob.seed, i) * 10, y);
      ctx.lineTo(ob.x + ob.width - 10, y + 1.5);
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    // Knot.
    ctx.fillStyle = "#5c3a1e";
    ctx.beginPath();
    ctx.ellipse(ob.x + ob.width * 0.62, barY + 3, 5, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Twigs and hanging leaf clusters.
    const greens = ["#2f9e58", "#3fb56a", "#78c850"];
    // Foliage hangs down to the collider's underside, so what looks low is low.
    const reach = BRANCH_CLEAR - BRANCH_UNDERSIDE - 31;
    for (let i = 0; i < 6; i += 1) {
      const lx = ob.x + 10 + i * ((ob.width - 18) / 5);
      const drop = (reach / 0.55) * (0.72 + rand(ob.seed, i + 9) * 0.28);

      ctx.strokeStyle = "#6b4423";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, barY + 8);
      ctx.lineTo(lx - 2, barY + 8 + drop * 0.5);
      ctx.stroke();

      for (let j = 0; j < 3; j += 1) {
        const angle = -0.9 + j * 0.8 + rand(ob.seed, i * 3 + j) * 0.4;
        ctx.fillStyle = greens[(i + j) % greens.length];
        ctx.save();
        ctx.translate(lx, barY + 10 + drop * 0.55);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 9, 6, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // A couple of leaves sitting on top of the limb for depth.
    ctx.fillStyle = "#7ed957";
    ctx.beginPath();
    ctx.ellipse(ob.x + ob.width - 12, barY - 8, 13, 8, -0.4, 0, Math.PI * 2);
    ctx.ellipse(ob.x + 22, barY - 7, 10, 6, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawPopups(ctx, now) {
    for (const p of this.popups) {
      const k = (now - p.born) / p.life;
      if (k > 1) continue;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = "#166534";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 5;
      ctx.font = "bold 34px 'Trebuchet MS', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.strokeText(p.text, p.x, p.y - k * 60);
      ctx.fillText(p.text, p.x, p.y - k * 60);
      ctx.restore();
    }
    this.popups = this.popups.filter((p) => now - p.born < p.life);
  }

  #drawBanner(ctx, title, subtitle) {
    ctx.fillStyle = "rgba(15,23,42,0.55)";
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 46px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillText(title, FIELD_W / 2, FIELD_H / 2 - 6);
    if (subtitle) {
      ctx.font = "24px 'Trebuchet MS', system-ui, sans-serif";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(subtitle, FIELD_W / 2, FIELD_H / 2 + 34);
    }
  }

  draw(ctx, game, motion, now, dt, banner = null) {
    const canvas = ctx.canvas;
    const scaleX = canvas.width / FIELD_W;
    const scaleY = canvas.height / FIELD_H;

    const moving = motion.inFrame !== false && !game.over;
    const speed = moving ? game.currentSpeed() : 0;
    this.scroll.clouds += speed * dt * 0.12;
    this.scroll.hills += speed * dt * 0.25;
    this.scroll.trees += speed * dt * 0.5;
    this.scroll.ground += speed * dt;
    this.scroll.flowers += speed * dt * 1.25;

    this.#stepParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 60);
    this.flash = Math.max(0, this.flash - dt * 2.2);

    ctx.save();
    ctx.scale(scaleX, scaleY);
    if (this.shake > 0.2) {
      ctx.translate(
        (Math.random() - 0.5) * this.shake,
        (Math.random() - 0.5) * this.shake
      );
    }

    this.#drawSky(ctx);
    this.#drawClouds(ctx);
    this.#drawHills(ctx);
    this.#drawTrees(ctx);
    this.#drawGround(ctx);

    for (const ob of game.obstacles) {
      if (ob.type === "wall") this.#drawWall(ctx, ob);
      else this.#drawBranch(ctx, ob);
    }

    // Straight from the rigid body, so what you see is what collides.
    const jumpHeight = game.player.feetPx ?? 0;

    if (this.prevJumping && !game.player.jumping) {
      this.#dust(game.playerX, GROUND_Y - 4, 8);
      this.landedAt = now;
    }
    this.prevJumping = game.player.jumping;

    if (!game.player.jumping && !game.player.ducking && moving && Math.random() < 0.25) {
      this.#dust(game.playerX - 6, GROUND_Y - 2, 1);
    }

    const state = game.player.jumping ? "jump" : game.player.ducking ? "duck" : "run";
    const invulnerable = now < game.invulnerableUntil;

    // Contact shadow shrinks as Pip rises, which sells the height.
    const lift = 1 - Math.min(1, jumpHeight / APEX_PX);
    this.#groundShadow(ctx, game.playerX + 27, 26 * (0.5 + lift * 0.5), 0.1 + lift * 0.16);

    ctx.save();
    if (invulnerable) ctx.globalAlpha = Math.sin(now / 60) > 0 ? 0.35 : 1;
    drawMascot(ctx, {
      x: game.playerX,
      groundY: GROUND_Y,
      state,
      t: now,
      jumpHeight,
      hurt: invulnerable,
    });
    ctx.restore();

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Lives, score and combo belong to the shared HUD the shell draws over
    // the canvas, so every game reads the same way.
    this.#drawPopups(ctx, now);

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(239,68,68,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    }

    if (banner) {
      this.#drawBanner(ctx, banner.title, banner.subtitle);
    } else if (motion.inFrame === false) {
      this.#drawBanner(ctx, "Step back!", "We need to see your whole body");
    } else if (motion.quality != null && motion.quality < 0.5) {
      ctx.fillStyle = "rgba(15,23,42,0.55)";
      roundRect(ctx, FIELD_W / 2 - 200, 16, 400, 44, 22);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "20px 'Trebuchet MS', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("More light helps tracking", FIELD_W / 2, 45);
    }

    ctx.restore();
  }
}
