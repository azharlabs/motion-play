(function () { /* de-moduled */
'use strict';
// ── Particle System ─────────────────────────────────────────
// Object-pooled 2D canvas particle system for arcade games.

const TAU = Math.PI * 2;
const { random, cos, sin, floor, min, max, abs, sqrt } = Math;

// ── Helpers ─────────────────────────────────────────────────

const rand = (lo, hi) => random() * (hi - lo) + lo;
const pick = (arr) => arr[floor(random() * arr.length)];
const vary = (base, variance) => base + rand(-variance, variance);

// ── Particle (internal) ────────────────────────────────────

class Particle {
  constructor() {
    this.alive = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 1;
    this.size = 4;
    this.startSize = 4;
    this.endSize = 4;
    this.color = '#ffffff';
    this.alpha = 1;
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.gravity = 0;
    this.friction = 1;
    this.shape = 'circle';
    this.text = '';
  }

  reset(x, y, config) {
    this.alive = true;
    this.x = x;
    this.y = y;

    // Velocity from angle + speed
    const speed = vary(config.speed ?? 100, config.speedVariance ?? 0);
    const angle = vary(config.angle ?? 0, config.spread ?? TAU);
    this.vx = cos(angle) * speed;
    this.vy = sin(angle) * speed;

    this.maxLife = max(0.01, vary(config.life ?? 1, config.lifeVariance ?? 0));
    this.life = this.maxLife;

    const size = vary(config.size ?? 4, config.sizeVariance ?? 0);
    this.startSize = max(0.5, size);
    this.endSize = max(0, config.endSize ?? 0);
    this.size = this.startSize;

    this.color = Array.isArray(config.color) ? pick(config.color) : (config.color ?? '#ffffff');
    this.alpha = config.alpha ?? 1;
    this.rotation = config.rotation ?? rand(0, TAU);
    this.rotationSpeed = config.rotationSpeed ?? 0;
    this.gravity = config.gravity ?? 0;
    this.friction = config.friction ?? 1;
    this.shape = config.shape ?? 'circle';
    this.text = config.text ?? '';
  }

  update(dt) {
    if (!this.alive) return;

    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }

    // Physics
    this.vy += this.gravity * dt;
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotationSpeed * dt;

    // Interpolate size and alpha based on remaining life
    const t = 1 - this.life / this.maxLife; // 0 at birth, 1 at death
    this.size = this.startSize + (this.endSize - this.startSize) * t;
    this.alpha = 1 - t;
  }
}

// ── Preset Configurations ──────────────────────────────────

const PARTICLE_PRESETS = {

  explosion: {
    count: 30,
    speed: 200,
    speedVariance: 100,
    angle: 0,
    spread: Math.PI, // full circle (+-PI from angle 0)
    life: 0.6,
    lifeVariance: 0.2,
    size: 6,
    sizeVariance: 3,
    endSize: 0,
    color: ['#ff4400', '#ff8800', '#ffcc00', '#ffee66'],
    gravity: 0,
    friction: 0.96,
    shape: 'circle',
  },

  sparkle: {
    count: 8,
    speed: 30,
    speedVariance: 20,
    angle: 0,
    spread: Math.PI,
    life: 0.8,
    lifeVariance: 0.3,
    size: 2,
    sizeVariance: 1,
    endSize: 0,
    color: ['#ffffff', '#aaeeff', '#88ffff'],
    gravity: 0,
    friction: 0.98,
    shape: 'circle',
  },

  trail: {
    count: 3,
    speed: 60,
    speedVariance: 20,
    angle: Math.PI, // default: trailing left
    spread: 0.3,
    life: 0.4,
    lifeVariance: 0.1,
    size: 3,
    sizeVariance: 1,
    endSize: 0,
    color: '#ffffff',
    gravity: 0,
    friction: 0.95,
    shape: 'circle',
  },

  debris: {
    count: 12,
    speed: 180,
    speedVariance: 80,
    angle: 0,
    spread: Math.PI,
    life: 1.2,
    lifeVariance: 0.4,
    size: 5,
    sizeVariance: 3,
    endSize: 2,
    color: ['#888888', '#aaaaaa', '#666666', '#bbbbbb'],
    gravity: 400,
    friction: 0.99,
    shape: 'square',
    rotationSpeed: 8,
  },

  smoke: {
    count: 6,
    speed: 30,
    speedVariance: 15,
    angle: -Math.PI / 2, // upward
    spread: 0.5,
    life: 1.5,
    lifeVariance: 0.5,
    size: 8,
    sizeVariance: 4,
    endSize: 20,
    color: ['#555555', '#666666', '#777777', '#444444'],
    gravity: -20,
    friction: 0.97,
    shape: 'circle',
  },

  fire: {
    count: 10,
    speed: 80,
    speedVariance: 40,
    angle: -Math.PI / 2,
    spread: 0.4,
    life: 0.6,
    lifeVariance: 0.2,
    size: 8,
    sizeVariance: 3,
    endSize: 2,
    color: ['#ffcc00', '#ff8800', '#ff4400', '#ff2200'],
    gravity: -60,
    friction: 0.97,
    shape: 'circle',
  },

  stars: {
    count: 5,
    speed: 10,
    speedVariance: 5,
    angle: 0,
    spread: Math.PI,
    life: 3,
    lifeVariance: 1,
    size: 1.5,
    sizeVariance: 0.5,
    endSize: 0,
    color: ['#ffffff', '#ffffdd', '#ffeedd'],
    gravity: 0,
    friction: 1,
    shape: 'star',
  },

  confetti: {
    count: 20,
    speed: 150,
    speedVariance: 80,
    angle: -Math.PI / 2,
    spread: 0.8,
    life: 2,
    lifeVariance: 0.5,
    size: 6,
    sizeVariance: 2,
    endSize: 4,
    color: ['#ff3366', '#33ccff', '#ffcc00', '#66ff66', '#ff66ff', '#ffffff'],
    gravity: 300,
    friction: 0.99,
    shape: 'square',
    rotationSpeed: 6,
  },

  floatingText: {
    count: 1,
    speed: 40,
    speedVariance: 5,
    angle: -Math.PI / 2,
    spread: 0.2,
    life: 1.2,
    lifeVariance: 0.1,
    size: 16,
    sizeVariance: 0,
    endSize: 16,
    color: '#ffffff',
    gravity: -30,
    friction: 0.98,
    shape: 'text',
    text: '',
  },
};

// ── Star Drawing Helper ────────────────────────────────────

function drawStar(ctx, cx, cy, size, rotation) {
  const spikes = 5;
  const outerR = size;
  const innerR = size * 0.4;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = rotation + (i * Math.PI) / spikes;
    const px = cx + cos(a) * r;
    const py = cy + sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// ── ParticleSystem ─────────────────────────────────────────

class ParticleSystem {

  /**
   * @param {number} maxParticles — maximum particle count (pre-allocated pool)
   */
  constructor(maxParticles = 500) {
    this._max = maxParticles;
    this._pool = new Array(maxParticles);
    this._aliveCount = 0;

    // Index tracking: alive particles are packed at indices [0, _aliveCount).
    // Dead particles sit at [_aliveCount, _max).
    for (let i = 0; i < maxParticles; i++) {
      this._pool[i] = new Particle();
    }
  }

  // ── Public API ───────────────────────────────────────────

  /** Number of currently active particles. */
  get alive() {
    return this._aliveCount;
  }

  /**
   * Emit particles using a named preset.
   * @param {number} x
   * @param {number} y
   * @param {string|object} preset — preset name or preset config object
   * @param {number} [count] — override the preset's default count
   */
  emit(x, y, preset, count) {
    const config = typeof preset === 'string' ? PARTICLE_PRESETS[preset] : preset;
    if (!config) return;
    this._spawn(x, y, config, count ?? config.count ?? 1);
  }

  /**
   * Emit particles with a custom config that merges over a preset or stands alone.
   * @param {number} x
   * @param {number} y
   * @param {object} config — full or partial particle config
   */
  emitCustom(x, y, config) {
    const base = config.preset ? { ...PARTICLE_PRESETS[config.preset], ...config } : config;
    this._spawn(x, y, base, config.count ?? base.count ?? 1);
  }

  /**
   * Update all live particles.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    let i = 0;
    while (i < this._aliveCount) {
      const p = this._pool[i];
      p.update(dt);
      if (!p.alive) {
        // Swap with last alive particle and shrink the alive region
        this._aliveCount--;
        this._pool[i] = this._pool[this._aliveCount];
        this._pool[this._aliveCount] = p;
        // Don't increment i — re-check the swapped particle
      } else {
        i++;
      }
    }
  }

  /**
   * Render all live particles to a 2D canvas context.
   * Skips off-screen particles. Batches by shape when possible.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (this._aliveCount === 0) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const margin = 50; // off-screen cull margin

    ctx.save();

    // Sort by shape for minimal state changes (simple bucket approach)
    // We iterate once and draw inline — good enough for <500 particles.
    for (let i = 0; i < this._aliveCount; i++) {
      const p = this._pool[i];

      // Off-screen cull
      if (p.x < -margin || p.x > w + margin || p.y < -margin || p.y > h + margin) continue;

      ctx.globalAlpha = max(0, p.alpha);

      if (p.shape === 'text') {
        this._drawText(ctx, p);
      } else if (p.shape === 'circle') {
        this._drawCircle(ctx, p);
      } else if (p.shape === 'square') {
        this._drawSquare(ctx, p);
      } else if (p.shape === 'star') {
        this._drawStarShape(ctx, p);
      } else if (p.shape === 'line') {
        this._drawLine(ctx, p);
      }
    }

    ctx.restore();
  }

  /** Kill all particles immediately. */
  clear() {
    for (let i = 0; i < this._aliveCount; i++) {
      this._pool[i].alive = false;
    }
    this._aliveCount = 0;
  }

  // ── Internals ────────────────────────────────────────────

  _spawn(x, y, config, count) {
    for (let i = 0; i < count; i++) {
      if (this._aliveCount >= this._max) return; // pool exhausted
      const p = this._pool[this._aliveCount];
      p.reset(x, y, config);
      this._aliveCount++;
    }
  }

  _drawCircle(ctx, p) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, max(0.5, p.size), 0, TAU);
    ctx.fill();
  }

  _drawSquare(ctx, p) {
    ctx.fillStyle = p.color;
    const half = p.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillRect(-half, -half, half * 2, half * 2);
    ctx.restore();
  }

  _drawStarShape(ctx, p) {
    ctx.fillStyle = p.color;
    drawStar(ctx, p.x, p.y, max(0.5, p.size), p.rotation);
  }

  _drawLine(ctx, p) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = max(0.5, p.size * 0.4);
    const len = sqrt(p.vx * p.vx + p.vy * p.vy) * 0.05;
    const nx = p.vx === 0 && p.vy === 0 ? 1 : p.vx / (abs(p.vx) + abs(p.vy));
    const ny = p.vx === 0 && p.vy === 0 ? 0 : p.vy / (abs(p.vx) + abs(p.vy));
    ctx.beginPath();
    ctx.moveTo(p.x - nx * len, p.y - ny * len);
    ctx.lineTo(p.x + nx * len, p.y + ny * len);
    ctx.stroke();
  }

  _drawText(ctx, p) {
    if (!p.text) return;
    ctx.fillStyle = p.color;
    ctx.font = `bold ${floor(p.size)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.text, p.x, p.y);
  }
}

Object.assign(window, { ParticleSystem, PARTICLE_PRESETS });
})();
