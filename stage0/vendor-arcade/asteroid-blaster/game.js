(function () { /* de-moduled */
'use strict';
/**
 * Asteroid Blaster — Asteroids-style vector shooter for Galaxy Zone Arcade.
 * Extends the shared GameEngine with full asteroid mechanics, UFOs, and hyperspace.
 */



// ── Constants ────────────────────────────────────────────────
const W = 800, H = 600;
const TAU = Math.PI * 2;
const { cos, sin, sqrt, random, floor, min, max, abs, atan2 } = Math;

const SHIP_RADIUS = 14;
const SHIP_ROTATE_SPEED = 4.5;     // rad/s
const SHIP_THRUST = 280;
const SHIP_FRICTION = 0.985;
const SHIP_MAX_SPEED = 400;
const MAX_BULLETS = 4;
const BULLET_SPEED = 500;
const BULLET_LIFE = 1.4;           // seconds
const BULLET_RADIUS = 2;

const AST_SIZES = { large: 40, medium: 20, small: 10 };
const AST_SPEEDS = { large: [40, 80], medium: [60, 120], small: [90, 180] };
const AST_POINTS = { large: 20, medium: 50, small: 100 };
const AST_VERTS = { large: 12, medium: 9, small: 7 };

const UFO_LARGE_RADIUS = 18;
const UFO_SMALL_RADIUS = 10;
const UFO_LARGE_SPEED = 100;
const UFO_SMALL_SPEED = 140;
const UFO_SHOOT_INTERVAL_LARGE = 1.8;
const UFO_SHOOT_INTERVAL_SMALL = 1.2;
const UFO_LARGE_POINTS = 200;
const UFO_SMALL_POINTS = 1000;
const UFO_BULLET_SPEED = 300;

const INVULN_TIME = 2.5;
const HYPERSPACE_INVULN = 1.0;
const HYPERSPACE_EXPLODE_CHANCE = 0.08;
const RESPAWN_DELAY = 1.5;
const WAVE_DELAY = 2.0;

// ── Helpers ──────────────────────────────────────────────────
function rand(lo, hi) { return random() * (hi - lo) + lo; }
function wrap(v, limit) { return ((v % limit) + limit) % limit; }
function dist(a, b) { return sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

function makeAsteroidShape(vertCount) {
  const shape = [];
  for (let i = 0; i < vertCount; i++) {
    const angle = (i / vertCount) * TAU;
    const r = 0.7 + random() * 0.3;
    shape.push({ angle, r });
  }
  return shape;
}

// ── Glow drawing helpers ─────────────────────────────────────
function setGlow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function clearGlow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

function drawGlowPoly(ctx, pts, color, lineW) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  setGlow(ctx, color, 12);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
    else ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
  ctx.stroke();
  clearGlow(ctx);
}

function drawGlowCircle(ctx, x, y, r, color, lineW) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  setGlow(ctx, color, 10);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  clearGlow(ctx);
}

// ── Game class ───────────────────────────────────────────────
class AsteroidBlaster extends GameEngine {
  init() {
    this.achievements = new AchievementManager('asteroid-blaster');
    this.achievements.define([
      { id: 'rock-breaker',       name: 'Rock Breaker',       description: 'Destroy your first large asteroid',  icon: '\uD83E\uDEA8' },
      { id: 'ufo-down',           name: 'UFO Down',           description: 'Shoot down a UFO',                   icon: '\uD83D\uDEF8' },
      { id: 'hyperspace-survivor', name: 'Hyperspace Survivor', description: 'Use hyperspace 3 times in one game', icon: '\u2728' },
      { id: 'clean-sweep',        name: 'Clean Sweep',        description: 'Clear a wave without dying',          icon: '\uD83E\uDDF9' },
      { id: 'space-legend',       name: 'Space Legend',       description: 'Score 10,000+ points',                icon: '\uD83C\uDF1F' },
    ]);

    this.ship = null;
    this.bullets = [];
    this.asteroids = [];
    this.ufo = null;
    this.ufoBullets = [];
    this.stars = [];
    this.menuAsteroids = [];

    this._respawnTimer = 0;
    this._waveTimer = 0;
    this._waveClearing = false;
    this._ufoTimer = 0;
    this._beatTimer = 0;
    this._beatInterval = 0.8;
    this._beatToggle = false;
    this._hyperspaceCount = 0;
    this._diedThisWave = false;
    this._deathFragments = [];

    // Generate background stars
    for (let i = 0; i < 80; i++) {
      this.stars.push({
        x: random() * W, y: random() * H,
        brightness: 0.3 + random() * 0.7,
        size: 0.5 + random() * 1.5,
      });
    }

    // Menu asteroids
    for (let i = 0; i < 6; i++) {
      this.menuAsteroids.push(this._createAsteroid(
        random() * W, random() * H, 'large'
      ));
    }
  }

  // ── State transitions ──────────────────────────────────────
  onEnterState(state) {
    if (state === 'playing') {
      this._resetGame();
    }
  }

  _resetGame() {
    this.ship = this._createShip();
    this.bullets = [];
    this.asteroids = [];
    this.ufo = null;
    this.ufoBullets = [];
    this._respawnTimer = 0;
    this._waveTimer = 0;
    this._waveClearing = false;
    this._ufoTimer = rand(15, 25);
    this._beatTimer = 0;
    this._beatInterval = 0.8;
    this._beatToggle = false;
    this._hyperspaceCount = 0;
    this._diedThisWave = false;
    this._deathFragments = [];
    this._spawnWave();
  }

  _createShip() {
    return {
      x: W / 2, y: H / 2,
      vx: 0, vy: 0,
      angle: -Math.PI / 2,
      thrusting: false,
      alive: true,
      invulnTimer: INVULN_TIME,
      radius: SHIP_RADIUS,
    };
  }

  // ── Asteroid creation ──────────────────────────────────────
  _createAsteroid(x, y, size, vx, vy) {
    const [sLo, sHi] = AST_SPEEDS[size];
    if (vx === undefined) {
      const angle = random() * TAU;
      const speed = rand(sLo, sHi);
      vx = cos(angle) * speed;
      vy = sin(angle) * speed;
    }
    return {
      x, y, vx, vy,
      size,
      radius: AST_SIZES[size],
      shape: makeAsteroidShape(AST_VERTS[size]),
      rotation: random() * TAU,
      rotSpeed: rand(-2, 2),
    };
  }

  _spawnWave() {
    const count = min(4 + this.level, 12);
    for (let i = 0; i < count; i++) {
      let x, y;
      // Spawn from edges
      if (random() < 0.5) {
        x = random() < 0.5 ? -30 : W + 30;
        y = random() * H;
      } else {
        x = random() * W;
        y = random() < 0.5 ? -30 : H + 30;
      }
      this.asteroids.push(this._createAsteroid(x, y, 'large'));
    }
    this._diedThisWave = false;
  }

  // ── UFO creation ───────────────────────────────────────────
  _spawnUFO() {
    const small = this.level >= 3 && random() < min(0.1 + this.level * 0.08, 0.7);
    const fromLeft = random() < 0.5;
    this.ufo = {
      x: fromLeft ? -20 : W + 20,
      y: rand(50, H - 50),
      vx: (fromLeft ? 1 : -1) * (small ? UFO_SMALL_SPEED : UFO_LARGE_SPEED),
      vy: 0,
      small,
      radius: small ? UFO_SMALL_RADIUS : UFO_LARGE_RADIUS,
      shootTimer: small ? UFO_SHOOT_INTERVAL_SMALL : UFO_SHOOT_INTERVAL_LARGE,
      dirTimer: rand(1, 3),
    };
  }

  // ── Main update ────────────────────────────────────────────
  update(dt) {
    const s = this.ship;

    // Beat tempo
    this._updateBeat(dt);

    // Ship input & physics
    if (s && s.alive) {
      this._updateShip(dt);
    } else if (s && !s.alive) {
      this._respawnTimer -= dt;
      if (this._respawnTimer <= 0) {
        if (this.lives <= 0) {
          this.achievements.reportScore(this.score);
          AchievementManager.checkCrossGame();
          this.gameOver();
          return;
        }
        this.ship = this._createShip();
      }
    }

    // Death fragments
    for (const f of this._deathFragments) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
      f.rotation += f.rotSpeed * dt;
    }
    this._deathFragments = this._deathFragments.filter(f => f.life > 0);

    // Bullets
    this._updateBullets(dt);

    // Asteroids
    for (const a of this.asteroids) {
      a.x = wrap(a.x + a.vx * dt, W);
      a.y = wrap(a.y + a.vy * dt, H);
      a.rotation += a.rotSpeed * dt;
    }

    // UFO
    this._updateUFO(dt);

    // UFO bullets
    for (const b of this.ufoBullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    this.ufoBullets = this.ufoBullets.filter(b => b.life > 0);

    // Collisions
    this._checkCollisions();

    // Wave clear check
    if (this.asteroids.length === 0 && !this._waveClearing) {
      this._waveClearing = true;
      this._waveTimer = WAVE_DELAY;
      if (!this._diedThisWave) {
        this.achievements.unlock('clean-sweep');
      }
    }
    if (this._waveClearing) {
      this._waveTimer -= dt;
      if (this._waveTimer <= 0) {
        this._waveClearing = false;
        this.level++;
        this._spawnWave();
        this._beatInterval = 0.8;
      }
    }

    // UFO spawn timer
    this._ufoTimer -= dt;
    if (this._ufoTimer <= 0 && !this.ufo) {
      this._spawnUFO();
      this._ufoTimer = rand(max(8, 20 - this.level * 2), max(12, 30 - this.level * 2));
    }

    // Score achievement
    if (this.score >= 10000) {
      this.achievements.unlock('space-legend');
    }
  }

  _updateShip(dt) {
    const s = this.ship;

    // Rotation
    if (this.input.isDown('LEFT'))  s.angle -= SHIP_ROTATE_SPEED * dt;
    if (this.input.isDown('RIGHT')) s.angle += SHIP_ROTATE_SPEED * dt;

    // Thrust
    s.thrusting = this.input.isDown('UP') || this.input.isDown('ACTION1');
    if (s.thrusting) {
      s.vx += cos(s.angle) * SHIP_THRUST * dt;
      s.vy += sin(s.angle) * SHIP_THRUST * dt;
      const spd = sqrt(s.vx * s.vx + s.vy * s.vy);
      if (spd > SHIP_MAX_SPEED) {
        s.vx *= SHIP_MAX_SPEED / spd;
        s.vy *= SHIP_MAX_SPEED / spd;
      }
      // Thrust particles
      if (random() < 0.6) {
        const bx = s.x - cos(s.angle) * 16;
        const by = s.y - sin(s.angle) * 16;
        this.particles.emitCustom(bx, by, {
          preset: 'fire',
          count: 1,
          angle: s.angle + Math.PI,
          spread: 0.3,
          speed: 80 + random() * 60,
          life: 0.3,
          size: 3,
          color: ['#ff8800', '#ffcc00', '#ff4400'],
        });
      }
    }

    // Friction
    s.vx *= SHIP_FRICTION;
    s.vy *= SHIP_FRICTION;

    // Position wrap
    s.x = wrap(s.x + s.vx * dt, W);
    s.y = wrap(s.y + s.vy * dt, H);

    // Invulnerability
    if (s.invulnTimer > 0) s.invulnTimer -= dt;

    // Shoot
    if (this.input.isPressed('ACTION2') && this.bullets.length < MAX_BULLETS) {
      this.bullets.push({
        x: s.x + cos(s.angle) * 16,
        y: s.y + sin(s.angle) * 16,
        vx: cos(s.angle) * BULLET_SPEED + s.vx * 0.3,
        vy: sin(s.angle) * BULLET_SPEED + s.vy * 0.3,
        life: BULLET_LIFE,
      });
      this.audio.play('shoot', { pitch: 1.5, volume: 0.5 });
    }

    // Hyperspace
    if (this.input.isPressed('ACTION3')) {
      this._doHyperspace();
    }

    // Thrust sound
    if (s.thrusting && random() < 0.15) {
      this.audio.play('hit', { volume: 0.08, pitch: 0.3 });
    }
  }

  _doHyperspace() {
    const s = this.ship;
    this.audio.play('powerup', { pitch: 2, volume: 0.4 });
    this.particles.emit(s.x, s.y, 'sparkle', 15);

    this._hyperspaceCount++;
    if (this._hyperspaceCount >= 3) {
      this.achievements.unlock('hyperspace-survivor');
    }

    // Risk of explosion on re-entry
    if (random() < HYPERSPACE_EXPLODE_CHANCE) {
      this._killShip();
      return;
    }

    s.x = rand(60, W - 60);
    s.y = rand(60, H - 60);
    s.vx = 0;
    s.vy = 0;
    s.invulnTimer = HYPERSPACE_INVULN;
    this.particles.emit(s.x, s.y, 'sparkle', 10);
  }

  _updateBullets(dt) {
    for (const b of this.bullets) {
      b.x = wrap(b.x + b.vx * dt, W);
      b.y = wrap(b.y + b.vy * dt, H);
      b.life -= dt;
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
  }

  _updateUFO(dt) {
    if (!this.ufo) return;
    const u = this.ufo;

    u.x += u.vx * dt;
    u.y += u.vy * dt;

    // Change vertical direction periodically
    u.dirTimer -= dt;
    if (u.dirTimer <= 0) {
      u.vy = rand(-60, 60);
      u.dirTimer = rand(1, 3);
    }
    u.y = max(30, min(H - 30, u.y));

    // Off screen removal
    if (u.x < -50 || u.x > W + 50) {
      this.ufo = null;
      return;
    }

    // Shooting
    u.shootTimer -= dt;
    if (u.shootTimer <= 0 && this.ship && this.ship.alive) {
      u.shootTimer = u.small ? UFO_SHOOT_INTERVAL_SMALL : UFO_SHOOT_INTERVAL_LARGE;
      let angle;
      if (u.small) {
        // Accurate shot toward player with slight variance
        angle = atan2(this.ship.y - u.y, this.ship.x - u.x) + rand(-0.15, 0.15);
      } else {
        // Random shot
        angle = random() * TAU;
      }
      this.ufoBullets.push({
        x: u.x, y: u.y,
        vx: cos(angle) * UFO_BULLET_SPEED,
        vy: sin(angle) * UFO_BULLET_SPEED,
        life: 2.0,
      });
      this.audio.play('shoot', { pitch: 0.6, volume: 0.3 });
    }

    // UFO warble sound
    if (random() < 0.05) {
      this.audio.play('select', { pitch: rand(0.5, 1.5), volume: 0.15 });
    }
  }

  // ── Collisions ─────────────────────────────────────────────
  _checkCollisions() {
    const s = this.ship;

    // Bullets vs asteroids
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        if (dist(b, a) < a.radius + BULLET_RADIUS) {
          this.bullets.splice(bi, 1);
          this._splitAsteroid(ai);
          break;
        }
      }
    }

    // Bullets vs UFO
    if (this.ufo) {
      for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
        const b = this.bullets[bi];
        if (dist(b, this.ufo) < this.ufo.radius + BULLET_RADIUS) {
          this.bullets.splice(bi, 1);
          const pts = this.ufo.small ? UFO_SMALL_POINTS : UFO_LARGE_POINTS;
          this.addScore(pts, this.ufo.x, this.ufo.y);
          this.particles.emit(this.ufo.x, this.ufo.y, 'explosion', 20);
          this.audio.play('explosion', { volume: 0.6 });
          this.effects.shake(4, 0.3);
          this.ufo = null;
          this.achievements.unlock('ufo-down');
          break;
        }
      }
    }

    // Ship vs asteroids
    if (s && s.alive && s.invulnTimer <= 0) {
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        if (dist(s, a) < a.radius + s.radius * 0.7) {
          this._splitAsteroid(ai);
          this._killShip();
          break;
        }
      }
    }

    // Ship vs UFO
    if (s && s.alive && s.invulnTimer <= 0 && this.ufo) {
      if (dist(s, this.ufo) < this.ufo.radius + s.radius * 0.7) {
        this.particles.emit(this.ufo.x, this.ufo.y, 'explosion', 15);
        this.ufo = null;
        this._killShip();
      }
    }

    // Ship vs UFO bullets
    if (s && s.alive && s.invulnTimer <= 0) {
      for (let i = this.ufoBullets.length - 1; i >= 0; i--) {
        if (dist(s, this.ufoBullets[i]) < s.radius) {
          this.ufoBullets.splice(i, 1);
          this._killShip();
          break;
        }
      }
    }
  }

  _splitAsteroid(index) {
    const a = this.asteroids[index];
    const pts = AST_POINTS[a.size];
    this.addScore(pts, a.x, a.y);

    // Particles
    const pColor = ['#888', '#aaa', '#ccc', '#fff'];
    this.particles.emitCustom(a.x, a.y, {
      preset: 'explosion',
      count: a.size === 'large' ? 18 : a.size === 'medium' ? 10 : 5,
      color: pColor,
      speed: 80,
      life: 0.5,
      size: a.size === 'large' ? 4 : 2,
    });

    // Sound + screen shake for large
    if (a.size === 'large') {
      this.audio.play('explosion', { volume: 0.5, pitch: 0.5 });
      this.effects.shake(6, 0.3);
      this.achievements.unlock('rock-breaker');
    } else if (a.size === 'medium') {
      this.audio.play('hit', { volume: 0.4, pitch: 0.8 });
    } else {
      this.audio.play('hit', { volume: 0.3, pitch: 1.5 });
    }

    // Split into smaller asteroids
    const nextSize = a.size === 'large' ? 'medium' : a.size === 'medium' ? 'small' : null;
    if (nextSize) {
      for (let i = 0; i < 2; i++) {
        const angle = random() * TAU;
        const [sLo, sHi] = AST_SPEEDS[nextSize];
        const speed = rand(sLo, sHi);
        this.asteroids.push(this._createAsteroid(
          a.x, a.y, nextSize,
          cos(angle) * speed, sin(angle) * speed
        ));
      }
    }

    this.asteroids.splice(index, 1);

    // Update beat tempo
    this._updateBeatTempo();
  }

  _killShip() {
    const s = this.ship;
    if (!s || !s.alive) return;
    s.alive = false;
    this._diedThisWave = true;
    this.lives--;
    this._respawnTimer = RESPAWN_DELAY;

    // Ship explosion fragments
    this._deathFragments = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU + rand(-0.3, 0.3);
      const speed = rand(60, 160);
      this._deathFragments.push({
        x: s.x, y: s.y,
        vx: cos(angle) * speed,
        vy: sin(angle) * speed,
        rotation: random() * TAU,
        rotSpeed: rand(-6, 6),
        len: rand(8, 18),
        life: 1.5,
      });
    }

    this.particles.emit(s.x, s.y, 'explosion', 30);
    this.audio.play('explosion', { volume: 0.7 });
    this.effects.shake(8, 0.4);
    this.effects.flash('#ff4400', 0.15);
  }

  // ── Beat tempo ─────────────────────────────────────────────
  _updateBeat(dt) {
    this._beatTimer -= dt;
    if (this._beatTimer <= 0) {
      this._beatTimer = this._beatInterval;
      this._beatToggle = !this._beatToggle;
      this.audio.play('select', {
        pitch: this._beatToggle ? 0.25 : 0.2,
        volume: 0.12,
      });
    }
  }

  _updateBeatTempo() {
    const total = max(1, 4 + this.level);
    const remaining = this.asteroids.length;
    const ratio = remaining / total;
    this._beatInterval = 0.15 + ratio * 0.65;
  }

  // ── Rendering ──────────────────────────────────────────────
  render(ctx) {
    this._drawStars(ctx);
    this._drawAsteroids(ctx, this.asteroids);

    // UFO
    if (this.ufo) this._drawUFO(ctx, this.ufo);

    // UFO bullets
    ctx.save();
    for (const b of this.ufoBullets) {
      drawGlowCircle(ctx, b.x, b.y, 3, '#ff4444', 1.5);
    }
    ctx.restore();

    // Bullets
    ctx.save();
    for (const b of this.bullets) {
      drawGlowCircle(ctx, b.x, b.y, BULLET_RADIUS, '#ffffff', 1.5);
    }
    ctx.restore();

    // Ship
    if (this.ship && this.ship.alive) {
      this._drawShip(ctx, this.ship);
    }

    // Death fragments
    this._drawDeathFragments(ctx);

    // Wave clear text
    if (this._waveClearing) {
      ctx.save();
      ctx.fillStyle = '#0ff';
      ctx.font = 'bold 32px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      setGlow(ctx, '#0ff', 15);
      ctx.fillText(`WAVE ${this.level} CLEAR`, W / 2, H / 2);
      clearGlow(ctx);
      ctx.restore();
    }
  }

  _drawStars(ctx) {
    ctx.save();
    for (const st of this.stars) {
      ctx.fillStyle = `rgba(255, 255, 255, ${st.brightness * 0.5})`;
      ctx.fillRect(st.x, st.y, st.size, st.size);
    }
    ctx.restore();
  }

  _drawShip(ctx, s) {
    // Blink during invulnerability
    if (s.invulnTimer > 0 && floor(s.invulnTimer * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);

    // Ship body (triangle)
    const pts = [
      [18, 0],
      [-12, -10],
      [-8, 0],
      [-12, 10],
    ];
    drawGlowPoly(ctx, pts, '#ffffff', 1.5);

    // Thrust flame
    if (s.thrusting) {
      const flicker = 0.7 + random() * 0.6;
      const flamePts = [
        [-8, -4],
        [-8 - 14 * flicker, 0],
        [-8, 4],
      ];
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1.5;
      setGlow(ctx, '#ff4400', 10);
      ctx.beginPath();
      ctx.moveTo(flamePts[0][0], flamePts[0][1]);
      ctx.lineTo(flamePts[1][0], flamePts[1][1]);
      ctx.lineTo(flamePts[2][0], flamePts[2][1]);
      ctx.stroke();
      clearGlow(ctx);
    }

    ctx.restore();
  }

  _drawAsteroids(ctx, asteroids) {
    ctx.save();
    for (const a of asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);

      const pts = a.shape.map(v => [
        cos(v.angle) * v.r * a.radius,
        sin(v.angle) * v.r * a.radius,
      ]);
      drawGlowPoly(ctx, pts, '#888888', 1.5);
      ctx.restore();
    }
    ctx.restore();
  }

  _drawUFO(ctx, u) {
    const r = u.radius;
    ctx.save();
    ctx.translate(u.x, u.y);

    // Body — two arcs
    const color = u.small ? '#ff44ff' : '#44ff44';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    setGlow(ctx, color, 10);

    // Bottom dome
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.4, 0, 0, Math.PI);
    ctx.stroke();

    // Top dome
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.6, r * 0.5, 0, Math.PI, 0);
    ctx.stroke();

    // Saucer line
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();

    clearGlow(ctx);
    ctx.restore();
  }

  _drawDeathFragments(ctx) {
    if (this._deathFragments.length === 0) return;
    ctx.save();
    for (const f of this._deathFragments) {
      const alpha = f.life / 1.5;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 1.5;
      setGlow(ctx, `rgba(255, 100, 50, ${alpha})`, 8);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rotation);
      ctx.beginPath();
      ctx.moveTo(-f.len / 2, 0);
      ctx.lineTo(f.len / 2, 0);
      ctx.stroke();
      ctx.restore();
    }
    clearGlow(ctx);
    ctx.restore();
  }

  // ── Menu ───────────────────────────────────────────────────
  updateMenu(dt) {
    for (const a of this.menuAsteroids) {
      a.x = wrap(a.x + a.vx * dt, W);
      a.y = wrap(a.y + a.vy * dt, H);
      a.rotation += a.rotSpeed * dt;
    }
  }

  renderMenu(ctx) {
    this._drawStars(ctx);
    this._drawAsteroids(ctx, this.menuAsteroids);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px "Courier New", monospace';
    setGlow(ctx, '#0ff', 20);
    ctx.fillText('ASTEROID', W / 2, H * 0.3);
    ctx.fillText('BLASTER', W / 2, H * 0.3 + 52);
    clearGlow(ctx);

    // Controls
    ctx.fillStyle = '#888';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('ARROWS: ROTATE/THRUST   Z: SHOOT   X: HYPERSPACE', W / 2, H * 0.82);

    ctx.restore();
  }

  renderGameOver(ctx) {
    this._drawStars(ctx);
    this._drawAsteroids(ctx, this.asteroids);
  }
}

// ── Boot ─────────────────────────────────────────────────────
const game = new AsteroidBlaster('game-canvas');
game.start();

})();
