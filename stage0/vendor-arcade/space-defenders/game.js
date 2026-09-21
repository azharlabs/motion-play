(function () { /* de-moduled */
'use strict';
/**
 * Space Defenders — Space Invaders-style arcade shooter
 * Built on the Galaxy Zone shared engine.
 */





// ── Constants ────────────────────────────────────────────────

const W = 800, H = 600;
const PLAYER_Y = 560;
const PLAYER_SPEED = 280;
const BULLET_SPEED = 500;
const ALIEN_BULLET_SPEED = 200;
const ALIEN_COLS = 11;
const ALIEN_ROWS = 5;
const ALIEN_H_GAP = 48;
const ALIEN_V_GAP = 40;
const SHIELD_COUNT = 4;
const SHIELD_W = 44;
const SHIELD_H = 32;
const SHIELD_Y = 480;
const UFO_SPEED = 120;
const UFO_INTERVAL_MIN = 15;
const UFO_INTERVAL_MAX = 25;
const BONUS_LIFE_SCORE = 1500;

const ALIEN_POINTS = [30, 30, 20, 20, 10]; // row 0-1: small, 2-3: medium, 4: large

// ── Sprite Definitions ───────────────────────────────────────

const spr = new SpriteRenderer();

const ALIEN_SMALL = {
  frames: [
    spr.createSpriteFromString(`
..1...1..
...1.1...
..11111..
.11.111.1
111111111
1.1111111
1.1...1.1
...1.1...
`, ['#ff4466']),
    spr.createSpriteFromString(`
..1...1..
1..1.1..1
1.11111.1
111.11111
111111111
.11111111
..1...1..
.1.....1.
`, ['#ff4466']),
  ]
};

const ALIEN_MEDIUM = {
  frames: [
    spr.createSpriteFromString(`
...11....
..1111...
.111111..
11.11.11.
11111111.
..1..1...
.1.11.1..
1.1..1.1.
`, ['#44ff88']),
    spr.createSpriteFromString(`
...11....
..1111...
.111111..
11.11.11.
11111111.
.1.11.1..
1......1.
.1....1..
`, ['#44ff88']),
  ]
};

const ALIEN_LARGE = {
  frames: [
    spr.createSpriteFromString(`
....11......
...1111.....
..111111....
.11.11.11...
.11111111...
...1..1.....
..11.111....
.11.11.11...
11......11..
`, ['#44aaff']),
    spr.createSpriteFromString(`
....11......
...1111.....
..111111....
.11.11.11...
.11111111...
..1.11.1....
.1.1..1.1...
1.........1.
............
`, ['#44aaff']),
  ]
};

const PLAYER_SPRITE = spr.createSpriteFromString(`
....1.....
...111....
...111....
.111111111
11111111111
11111111111
11111111111
`, ['#00ffcc']);

const UFO_SPRITE = spr.createSpriteFromString(`
.....11111.....
...111111111...
..11111111111..
.1.11.11.11.1.
111111111111111
..111.111.111..
...1.......1...
`, ['#ff44ff']);

const BULLET_SPRITE = spr.createSpriteFromString(`
.1.
.1.
.1.
.1.
`, ['#ffff44']);

const ALIEN_BULLET_SPRITE = spr.createSpriteFromString(`
.1.
1.1
.1.
1.1
`, ['#ff6644']);

// ── Shield template (pixel grid) ────────────────────────────

function createShieldGrid() {
  const cols = SHIELD_W;
  const rows = SHIELD_H;
  const grid = new Uint8Array(cols * rows);
  // Classic bunker shape
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Arch shape: full rectangle with a notch at bottom-center
      const inRect = y >= 4 || (x >= 8 && x < cols - 8);
      const inNotch = y >= rows - 10 && x >= 14 && x < cols - 14;
      // Top rounded corners
      const topRound = y < 4 && (x < 8 - y * 2 || x >= cols - 8 + y * 2);
      grid[y * cols + x] = (inRect && !inNotch && !topRound) ? 1 : 0;
    }
  }
  return grid;
}

// ── Game Class ───────────────────────────────────────────────

class SpaceDefenders extends GameEngine {

  init() {
    this.achievements = new AchievementManager('space-defenders');
    this.achievements.define([
      { id: 'first-contact', name: 'First Contact', description: 'Destroy your first alien', icon: '\u{1F47E}' },
      { id: 'ufo-hunter', name: 'UFO Hunter', description: 'Shoot down the mystery ship', icon: '\u{1F6F8}' },
      { id: 'shield-tactician', name: 'Shield Tactician', description: 'Clear a wave with at least one shield intact', icon: '\u{1F6E1}' },
      { id: 'wave-5', name: 'Wave 5', description: 'Reach wave 5', icon: '\u{1F30A}' },
      { id: 'space-ace', name: 'Space Ace', description: 'Score 3000+ points', icon: '\u{1F680}' },
    ]);

    this.aliensKilled = 0;
    this.bonusLifeAwarded = false;

    // Menu animation
    this.menuAliens = [];
    for (let i = 0; i < 8; i++) {
      this.menuAliens.push({ x: -60 + i * 90, y: 200, frame: 0, type: i % 3 });
    }
    this.menuTimer = 0;
    this.menuMarchDir = 1;
  }

  // ── State Transitions ──────────────────────────────────────

  onEnterState(state) {
    if (state === 'playing') {
      if (this._prevState === 'menu' || this._prevState === 'gameover') {
        this._initGame();
      }
    }
  }

  _initGame() {
    this.player = { x: W / 2, alive: true, respawnTimer: 0 };
    this.playerBullet = null;
    this.alienBullets = [];
    this.wave = 1;
    this.aliensKilled = 0;
    this.bonusLifeAwarded = false;
    this._setupWave();
  }

  _setupWave() {
    // Build alien grid
    this.aliens = [];
    const startY = 60 + Math.min((this.wave - 1) * 10, 80);
    const startX = 100;
    for (let r = 0; r < ALIEN_ROWS; r++) {
      for (let c = 0; c < ALIEN_COLS; c++) {
        let type; // 0=small, 1=medium, 2=large
        if (r < 2) type = 0;
        else if (r < 4) type = 1;
        else type = 2;
        this.aliens.push({
          x: startX + c * ALIEN_H_GAP,
          y: startY + r * ALIEN_V_GAP,
          type, row: r, col: c,
          alive: true, frame: 0,
        });
      }
    }

    this.alienDir = 1; // 1=right, -1=left
    this.alienMoveTimer = 0;
    this.alienStepCount = 0;
    this.marchTone = 0; // alternates 0/1

    // Shields
    this.shields = [];
    const shieldSpacing = W / (SHIELD_COUNT + 1);
    for (let i = 0; i < SHIELD_COUNT; i++) {
      this.shields.push({
        x: shieldSpacing * (i + 1) - SHIELD_W,
        y: SHIELD_Y,
        grid: createShieldGrid(),
      });
    }

    // UFO
    this.ufo = null;
    this.ufoTimer = UFO_INTERVAL_MIN + Math.random() * (UFO_INTERVAL_MAX - UFO_INTERVAL_MIN);
    this.ufoSoundTimer = 0;

    // Wave clear state
    this.waveClearTimer = 0;
    this.waveClearing = false;

    this.alienBullets = [];
    this.playerBullet = null;
  }

  // ── Alien march speed ──────────────────────────────────────

  _marchInterval() {
    const alive = this.aliens.filter(a => a.alive).length;
    const total = ALIEN_ROWS * ALIEN_COLS;
    // Speeds up as aliens die. Base interval decreases with wave.
    const base = Math.max(0.15, 0.55 - (this.wave - 1) * 0.04);
    const ratio = alive / total;
    return base * (0.1 + 0.9 * ratio);
  }

  // ── Update ─────────────────────────────────────────────────

  update(dt) {
    if (this.waveClearing) {
      this.waveClearTimer -= dt;
      if (this.waveClearTimer <= 0) {
        this.waveClearing = false;
        this.wave++;
        if (this.wave === 5) this.achievements.unlock('wave-5');
        this._setupWave();
      }
      return;
    }

    this._updatePlayer(dt);
    this._updatePlayerBullet(dt);
    this._updateAliens(dt);
    this._updateAlienBullets(dt);
    this._updateUFO(dt);
    this._checkCollisions();

    // Bonus life
    if (!this.bonusLifeAwarded && this.score >= BONUS_LIFE_SCORE) {
      this.bonusLifeAwarded = true;
      this.lives++;
      this.audio.play('powerup');
    }

    // Achievement: space ace
    if (this.score >= 3000) this.achievements.unlock('space-ace');

    // Check wave clear
    if (this.aliens.every(a => !a.alive)) {
      this.waveClearing = true;
      this.waveClearTimer = 1.5;
      this.audio.play('powerup');

      // Shield tactician: any shield with pixels remaining?
      const hasShield = this.shields.some(s => s.grid.some(v => v));
      if (hasShield) this.achievements.unlock('shield-tactician');
    }

    // Check if aliens reached bottom
    const lowestAlive = this.aliens.filter(a => a.alive);
    if (lowestAlive.length > 0) {
      const maxY = Math.max(...lowestAlive.map(a => a.y));
      if (maxY >= PLAYER_Y - 20) {
        this._playerDeath(true);
      }
    }
  }

  _updatePlayer(dt) {
    if (!this.player.alive) {
      this.player.respawnTimer -= dt;
      if (this.player.respawnTimer <= 0) {
        if (this.lives <= 0) {
          this.achievements.reportScore(this.score);
          AchievementManager.checkCrossGame();
          this.gameOver();
          return;
        }
        this.player.alive = true;
        this.player.x = W / 2;
      }
      return;
    }

    if (this.input.isDown('LEFT'))  this.player.x -= PLAYER_SPEED * dt;
    if (this.input.isDown('RIGHT')) this.player.x += PLAYER_SPEED * dt;
    this.player.x = Math.max(20, Math.min(W - 20, this.player.x));

    if (this.input.isPressed('ACTION1') && !this.playerBullet) {
      this.playerBullet = { x: this.player.x, y: PLAYER_Y - 10 };
      this.audio.play('shoot');
    }
  }

  _updatePlayerBullet(dt) {
    if (!this.playerBullet) return;
    this.playerBullet.y -= BULLET_SPEED * dt;
    if (this.playerBullet.y < 0) this.playerBullet = null;
  }

  _updateAliens(dt) {
    this.alienMoveTimer += dt;
    const interval = this._marchInterval();

    if (this.alienMoveTimer >= interval) {
      this.alienMoveTimer = 0;
      this.alienStepCount++;

      // March sound: alternating two bass tones
      this._playMarchSound();

      // Find alive extent
      let minX = W, maxX = 0;
      for (const a of this.aliens) {
        if (!a.alive) continue;
        if (a.x < minX) minX = a.x;
        if (a.x > maxX) maxX = a.x;
      }

      const stepX = 8 + Math.min(this.wave, 5) * 2;
      let dropDown = false;

      if (this.alienDir === 1 && maxX + stepX > W - 30) dropDown = true;
      if (this.alienDir === -1 && minX - stepX < 30) dropDown = true;

      for (const a of this.aliens) {
        if (!a.alive) continue;
        if (dropDown) {
          a.y += 16;
        } else {
          a.x += stepX * this.alienDir;
        }
        // Toggle animation frame on each step
        a.frame = a.frame ? 0 : 1;
      }

      if (dropDown) this.alienDir *= -1;

      // Random alien fires
      this._alienFire();
    }
  }

  _alienFire() {
    const alive = this.aliens.filter(a => a.alive);
    if (alive.length === 0) return;

    // More bullets as wave increases and fewer aliens remain
    const maxBullets = 1 + Math.floor(this.wave * 0.5);
    const chance = 0.3 + this.wave * 0.08 + (1 - alive.length / (ALIEN_ROWS * ALIEN_COLS)) * 0.3;

    if (this.alienBullets.length < maxBullets && Math.random() < chance) {
      // Pick a random bottom-row alien (lowest alive in each column)
      const cols = {};
      for (const a of alive) {
        if (!cols[a.col] || a.y > cols[a.col].y) cols[a.col] = a;
      }
      const shooters = Object.values(cols);
      const shooter = shooters[Math.floor(Math.random() * shooters.length)];
      this.alienBullets.push({ x: shooter.x + 4, y: shooter.y + 10 });
    }
  }

  _updateAlienBullets(dt) {
    for (let i = this.alienBullets.length - 1; i >= 0; i--) {
      const b = this.alienBullets[i];
      b.y += ALIEN_BULLET_SPEED * dt;
      if (b.y > H) this.alienBullets.splice(i, 1);
    }
  }

  _updateUFO(dt) {
    if (this.ufo) {
      this.ufo.x += this.ufo.dir * UFO_SPEED * dt;
      // Eerie oscillating sound
      this.ufoSoundTimer -= dt;
      if (this.ufoSoundTimer <= 0) {
        this.ufoSoundTimer = 0.5;
        this.audio.play('select', { pitch: 0.5 + Math.random() * 0.3, volume: 0.4 });
      }
      if (this.ufo.x < -40 || this.ufo.x > W + 40) {
        this.ufo = null;
      }
    } else {
      this.ufoTimer -= dt;
      if (this.ufoTimer <= 0) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.ufo = { x: dir === 1 ? -30 : W + 30, y: 35, dir };
        this.ufoTimer = UFO_INTERVAL_MIN + Math.random() * (UFO_INTERVAL_MAX - UFO_INTERVAL_MIN);
        this.ufoSoundTimer = 0;
      }
    }
  }

  // ── Collisions ─────────────────────────────────────────────

  _checkCollisions() {
    // Player bullet vs aliens
    if (this.playerBullet) {
      const b = this.playerBullet;
      for (const a of this.aliens) {
        if (!a.alive) continue;
        const sprW = a.type === 2 ? 12 : 9;
        const sprH = a.type === 2 ? 9 : 8;
        const scale = 3;
        if (b.x >= a.x && b.x <= a.x + sprW * scale &&
            b.y >= a.y && b.y <= a.y + sprH * scale) {
          a.alive = false;
          this.playerBullet = null;
          const pts = ALIEN_POINTS[a.row];
          this.addScore(pts, a.x + sprW * scale / 2, a.y);
          this.audio.play('explosion', { volume: 0.6 });
          this.particles.emit(a.x + sprW * scale / 2, a.y + sprH * scale / 2, 'explosion', 15);
          this.aliensKilled++;
          if (this.aliensKilled === 1) this.achievements.unlock('first-contact');
          break;
        }
      }
    }

    // Player bullet vs UFO
    if (this.playerBullet && this.ufo) {
      const b = this.playerBullet;
      const u = this.ufo;
      if (b.x >= u.x && b.x <= u.x + 15 * 3 &&
          b.y >= u.y && b.y <= u.y + 7 * 3) {
        const pts = [50, 100, 150, 200, 300][Math.floor(Math.random() * 5)];
        this.addScore(pts, u.x + 22, u.y);
        this.audio.play('explosion', { volume: 0.8, pitch: 0.6 });
        this.particles.emit(u.x + 22, u.y + 10, 'explosion', 25);
        this.effects.shake(6, 0.3);
        this.playerBullet = null;
        this.ufo = null;
        this.achievements.unlock('ufo-hunter');
      }
    }

    // Player bullet vs shields
    if (this.playerBullet) {
      this._bulletVsShields(this.playerBullet, true);
      if (this.playerBullet && this.playerBullet.hit) this.playerBullet = null;
    }

    // Alien bullets vs player
    if (this.player.alive) {
      for (let i = this.alienBullets.length - 1; i >= 0; i--) {
        const b = this.alienBullets[i];
        if (b.x >= this.player.x - 16 && b.x <= this.player.x + 16 &&
            b.y >= PLAYER_Y - 5 && b.y <= PLAYER_Y + 21) {
          this.alienBullets.splice(i, 1);
          this._playerDeath(false);
          break;
        }
      }
    }

    // Alien bullets vs shields
    for (let i = this.alienBullets.length - 1; i >= 0; i--) {
      this._bulletVsShields(this.alienBullets[i], false);
      if (this.alienBullets[i] && this.alienBullets[i].hit) {
        this.alienBullets.splice(i, 1);
      }
    }

    // Aliens vs shields (aliens march through shields)
    for (const a of this.aliens) {
      if (!a.alive) continue;
      const aw = (a.type === 2 ? 12 : 9) * 3;
      const ah = (a.type === 2 ? 9 : 8) * 3;
      for (const s of this.shields) {
        const sw = SHIELD_W * 2, sh = SHIELD_H * 2;
        if (a.x + aw > s.x && a.x < s.x + sw &&
            a.y + ah > s.y && a.y < s.y + sh) {
          // Eat away shield pixels where alien overlaps
          for (let py = 0; py < SHIELD_H; py++) {
            for (let px = 0; px < SHIELD_W; px++) {
              const wx = s.x + px * 2;
              const wy = s.y + py * 2;
              if (wx + 2 > a.x && wx < a.x + aw && wy + 2 > a.y && wy < a.y + ah) {
                s.grid[py * SHIELD_W + px] = 0;
              }
            }
          }
        }
      }
    }
  }

  _bulletVsShields(bullet, fromBelow) {
    const scale = 2; // shield pixels are rendered at 2x
    for (const s of this.shields) {
      if (bullet.x < s.x || bullet.x > s.x + SHIELD_W * scale) continue;
      if (bullet.y < s.y || bullet.y > s.y + SHIELD_H * scale) continue;

      // Convert world coords to grid coords
      const bx = Math.floor((bullet.x - s.x) / scale);
      const by = Math.floor((bullet.y - s.y) / scale);

      // Check a small area around impact
      let hitSomething = false;
      const radius = 3;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const px = bx + dx;
          const py = by + dy;
          if (px < 0 || px >= SHIELD_W || py < 0 || py >= SHIELD_H) continue;
          if (s.grid[py * SHIELD_W + px]) {
            s.grid[py * SHIELD_W + px] = 0;
            hitSomething = true;
          }
        }
      }

      if (hitSomething) {
        bullet.hit = true;
        this.particles.emit(bullet.x, bullet.y, {
          count: 6, speed: 60, speedVariance: 30, life: 0.3, lifeVariance: 0.1,
          size: 2, sizeVariance: 1, endSize: 0, color: '#22cc66',
          angle: fromBelow ? -Math.PI / 2 : Math.PI / 2, spread: 0.6,
          gravity: 0, friction: 0.95, shape: 'square',
        });
        break;
      }
    }
  }

  _playerDeath(instant) {
    this.player.alive = false;
    this.player.respawnTimer = 2;
    this.lives--;
    this.playerBullet = null;
    this.audio.play('die');
    this.effects.shake(8, 0.4);
    this.effects.flash('#ff0000', 0.2);
    this.particles.emit(this.player.x, PLAYER_Y + 10, 'explosion', 30);

    if (instant && this.lives <= 0) {
      this.achievements.reportScore(this.score);
      AchievementManager.checkCrossGame();
      this.gameOver();
    }
  }

  // ── Sound ──────────────────────────────────────────────────

  _playMarchSound() {
    this.marchTone = this.marchTone ? 0 : 1;
    const pitch = this.marchTone ? 0.35 : 0.3;
    this.audio.play('hit', { pitch, volume: 0.5 });
  }

  // ── Render ─────────────────────────────────────────────────

  render(ctx) {
    // Starfield background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    this._drawStars(ctx);

    if (this.waveClearing) {
      ctx.save();
      ctx.fillStyle = '#0f0';
      ctx.font = 'bold 36px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`WAVE ${this.wave} CLEAR!`, W / 2, H / 2);
      ctx.restore();
      return;
    }

    // Shields
    this._drawShields(ctx);

    // Aliens
    for (const a of this.aliens) {
      if (!a.alive) continue;
      const sheet = a.type === 0 ? ALIEN_SMALL : a.type === 1 ? ALIEN_MEDIUM : ALIEN_LARGE;
      spr.drawAnimatedSprite(ctx, sheet, a.x, a.y, a.frame, 3);
    }

    // UFO
    if (this.ufo) {
      spr.drawSprite(ctx, UFO_SPRITE, this.ufo.x, this.ufo.y, 3);
    }

    // Player
    if (this.player.alive) {
      spr.drawSprite(ctx, PLAYER_SPRITE, this.player.x - 16, PLAYER_Y, 3);
    } else if (this.player.respawnTimer > 0 && Math.floor(this.player.respawnTimer * 6) % 2 === 0) {
      // Blink during respawn
      ctx.globalAlpha = 0.3;
      spr.drawSprite(ctx, PLAYER_SPRITE, this.player.x - 16, PLAYER_Y, 3);
      ctx.globalAlpha = 1;
    }

    // Player bullet
    if (this.playerBullet) {
      spr.drawSprite(ctx, BULLET_SPRITE, this.playerBullet.x - 4, this.playerBullet.y - 6, 3);
    }

    // Alien bullets
    for (const b of this.alienBullets) {
      spr.drawSprite(ctx, ALIEN_BULLET_SPRITE, b.x - 4, b.y - 6, 3);
    }

    // Wave indicator
    ctx.save();
    ctx.fillStyle = '#888';
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`WAVE ${this.wave}`, 10, H - 6);
    ctx.restore();
  }

  _drawStars(ctx) {
    // Seeded pseudo-random stars (deterministic per frame for no flicker)
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 7919 + 31) * 104729) % W;
      const sy = ((i * 6271 + 17) * 104729) % H;
      const bright = ((i * 3571) % 100) / 100;
      ctx.globalAlpha = 0.2 + bright * 0.5;
      ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  _drawShields(ctx) {
    for (const s of this.shields) {
      for (let py = 0; py < SHIELD_H; py++) {
        for (let px = 0; px < SHIELD_W; px++) {
          if (!s.grid[py * SHIELD_W + px]) continue;
          ctx.fillStyle = '#22cc66';
          ctx.fillRect(s.x + px * 2, s.y + py * 2, 2, 2);
        }
      }
    }
  }

  // ── Menu ───────────────────────────────────────────────────

  updateMenu(dt) {
    this.menuTimer += dt;
    if (this.menuTimer >= 0.6) {
      this.menuTimer = 0;
      // March menu aliens
      for (const a of this.menuAliens) {
        a.x += 20 * this.menuMarchDir;
        a.frame = a.frame ? 0 : 1;
      }
      const rightMost = Math.max(...this.menuAliens.map(a => a.x));
      const leftMost = Math.min(...this.menuAliens.map(a => a.x));
      if (rightMost > W - 80 || leftMost < 30) {
        this.menuMarchDir *= -1;
        for (const a of this.menuAliens) a.y += 10;
        // Reset if they go too low
        if (this.menuAliens[0].y > 340) {
          this.menuAliens.forEach((a, i) => {
            a.x = 80 + i * 90;
            a.y = 200;
          });
        }
      }
    }
  }

  renderMenu(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    this._drawStars(ctx);

    // Title
    drawNeonText(ctx, 'SPACE DEFENDERS', W / 2, 100, 48, '#00ffcc', 15);

    // Draw marching menu aliens
    for (const a of this.menuAliens) {
      const sheet = a.type === 0 ? ALIEN_SMALL : a.type === 1 ? ALIEN_MEDIUM : ALIEN_LARGE;
      spr.drawAnimatedSprite(ctx, sheet, a.x, a.y, a.frame, 3);
    }

    // Score table
    ctx.save();
    ctx.font = '18px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ff4466';
    ctx.fillText('= 30 PTS', W / 2 + 30, 390);
    spr.drawSprite(ctx, ALIEN_SMALL.frames[0], W / 2 - 70, 382, 2);

    ctx.fillStyle = '#44ff88';
    ctx.fillText('= 20 PTS', W / 2 + 30, 420);
    spr.drawSprite(ctx, ALIEN_MEDIUM.frames[0], W / 2 - 70, 412, 2);

    ctx.fillStyle = '#44aaff';
    ctx.fillText('= 10 PTS', W / 2 + 30, 450);
    spr.drawSprite(ctx, ALIEN_LARGE.frames[0], W / 2 - 70, 442, 2);

    ctx.fillStyle = '#ff44ff';
    ctx.fillText('= ??? PTS', W / 2 + 30, 480);
    spr.drawSprite(ctx, UFO_SPRITE, W / 2 - 75, 472, 2);

    ctx.restore();

    // High score
    if (this.highScore > 0) {
      ctx.save();
      ctx.fillStyle = '#0ff';
      ctx.font = '18px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`HIGH SCORE: ${this.highScore}`, W / 2, 530);
      ctx.restore();
    }

    // Controls hint
    ctx.save();
    ctx.fillStyle = '#666';
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS: Move  |  SPACE: Fire  |  ESC: Pause', W / 2, H - 20);
    ctx.restore();
  }

  // ── Game Over ──────────────────────────────────────────────

  renderGameOver(ctx) {
    this._drawStars(ctx);

    // Draw remaining scene faded
    ctx.globalAlpha = 0.3;
    this._drawShields(ctx);
    for (const a of this.aliens) {
      if (!a.alive) continue;
      const sheet = a.type === 0 ? ALIEN_SMALL : a.type === 1 ? ALIEN_MEDIUM : ALIEN_LARGE;
      spr.drawAnimatedSprite(ctx, sheet, a.x, a.y, a.frame, 3);
    }
    ctx.globalAlpha = 1;

    // "INVASION COMPLETE" subtext
    ctx.save();
    ctx.fillStyle = '#ff4444';
    ctx.font = '20px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('THE INVASION IS COMPLETE', W / 2, H * 0.38);
    ctx.restore();
  }
}

// ── Bootstrap ────────────────────────────────────────────────

const game = new SpaceDefenders('game-canvas', {
  width: W,
  height: H,
  background: '#000',
});
game.start();

})();
