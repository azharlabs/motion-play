(function () { /* de-moduled */
'use strict';
/**
 * Road Hopper — A Frogger-style road-crossing arcade game
 * Navigate your frog from the bottom to the top, dodging traffic and riding logs.
 */






// ── Constants ────────────────────────────────────────────────
const W = 800;
const H = 600;
const COLS = 16;
const ROWS = 14;
const CELL_W = W / COLS;           // 50
const CELL_H = H / ROWS;           // ~42.86
const FROG_SIZE = CELL_W * 0.7;
const HOP_DURATION = 0.12;
const BASE_TIMER = 30;
const TIMER_BAR_H = 6;
const HOME_SLOTS = 5;
const HOME_SLOT_W = CELL_W * 2;

// Row indices (bottom = row 13, top = row 0)
const ROW_START = 13;             // safe sidewalk
const ROW_ROAD_FIRST = 12;       // road lanes 12..8
const ROW_ROAD_LAST = 8;
const ROW_MEDIAN = 7;            // safe median
const ROW_RIVER_FIRST = 6;       // river lanes 6..2
const ROW_RIVER_LAST = 2;
const ROW_HOME = 1;              // home row
const ROW_TIMER = 0;             // timer / top border

// Colors
const COL_GRASS = '#2d6e2d';
const COL_ROAD = '#333340';
const COL_ROAD_LINE = '#666640';
const COL_WATER = '#1a3a6e';
const COL_WATER_LIGHT = '#2a4a8e';
const COL_SIDEWALK = '#556655';
const COL_HOME_BG = '#1a2a1a';

// Vehicle definitions: [type, widthCells, color, accentColor]
const VEHICLE_TYPES = [
  { type: 'car',       w: 1.4, color: '#cc3333', accent: '#ff6666', speed: 1.0 },
  { type: 'car2',      w: 1.4, color: '#3366cc', accent: '#6699ff', speed: 1.0 },
  { type: 'truck',     w: 2.4, color: '#cc9933', accent: '#ffcc66', speed: 0.7 },
  { type: 'racecar',   w: 1.2, color: '#cc33cc', accent: '#ff66ff', speed: 1.6 },
  { type: 'bulldozer', w: 1.8, color: '#669933', accent: '#99cc66', speed: 0.45 },
];

// Log definitions: [widthCells]
const LOG_WIDTHS = [3, 4, 6];

// ── HUD elements ─────────────────────────────────────────────
const hudScore = document.getElementById('hud-score');
const hudLevel = document.getElementById('hud-level');
const hudLives = document.getElementById('hud-lives');

// ── Helper: row Y position ──────────────────────────────────
const rowY = (row) => row * CELL_H;
const rowCenterY = (row) => row * CELL_H + CELL_H / 2;

// ── RoadHopper Game ─────────────────────────────────────────

class RoadHopper extends GameEngine {
  constructor() {
    super('game-canvas', { width: W, height: H, background: '#111' });

    this.achievements = new AchievementManager('road-hopper');
    this.achievements.define([
      { id: 'safe-crossing',  name: 'Safe Crossing',  description: 'Reach home for the first time',       icon: '\u{1F438}' },
      { id: 'fly-catcher',    name: 'Fly Catcher',    description: 'Land on a home with a fly',            icon: '\u{1FAB0}' },
      { id: 'speed-frog',     name: 'Speed Frog',     description: 'Reach home with 50%+ time remaining', icon: '\u26A1' },
      { id: 'turtle-rider',   name: 'Turtle Rider',   description: 'Ride turtles for 5 seconds total',    icon: '\u{1F422}' },
      { id: 'level-5-frog',   name: 'Level 5 Frog',   description: 'Reach level 5',                       icon: '\u{1F31F}' },
    ]);

    this.menuFrogY = 0;
    this.menuBounceTimer = 0;
    this.turtleRideTime = 0;

    this.start();
  }

  // ── State hooks ───────────────────────────────────────────
  onEnterState(state) {
    if (state === 'playing') {
      this._initLevel();
      this.effects.setCRT(true);
    }
    if (state === 'menu') {
      this.effects.setCRT(true);
      this.menuFrogY = 0;
    }
  }

  onExitState(state) {
    if (state === 'playing') this.effects.setCRT(false);
  }

  _startGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.turtleRideTime = 0;
    this.particles.clear();
    this.audio.play('start');
    this.setState('playing');
  }

  // ── Level init ────────────────────────────────────────────
  _initLevel() {
    this.frog = { x: W / 2, y: rowCenterY(ROW_START), row: ROW_START, targetX: W / 2, targetY: rowCenterY(ROW_START), hopTimer: 0, hopDir: 0, alive: true, onLog: null, highestRow: ROW_START };
    this.timer = BASE_TIMER - (this.level - 1) * 2;
    if (this.timer < 12) this.timer = 12;
    this.maxTimer = this.timer;
    this.homes = [];
    for (let i = 0; i < HOME_SLOTS; i++) {
      const slotX = (i + 0.5) * (W / HOME_SLOTS);
      this.homes.push({ x: slotX, filled: false, hasFly: false, hasCroc: false });
    }
    // Randomly place a fly in one home
    if (randomChance(0.6)) {
      this.homes[randomInt(0, HOME_SLOTS - 1)].hasFly = true;
    }
    // Croc in home slot at higher levels
    if (this.level >= 3 && randomChance(0.4)) {
      const crocSlot = randomInt(0, HOME_SLOTS - 1);
      if (!this.homes[crocSlot].hasFly) this.homes[crocSlot].hasCroc = true;
    }

    this._buildLanes();
    this.deathTimer = 0;
    this.levelCompleteTimer = 0;
    this.waterAnim = 0;
    this._updateHUD();
  }

  _buildLanes() {
    const lvl = this.level;
    const speedMult = 1 + (lvl - 1) * 0.12;
    this.lanes = [];

    // Road lanes (rows 8-12, 5 lanes)
    for (let i = 0; i < 5; i++) {
      const row = ROW_ROAD_FIRST - i;
      const dir = i % 2 === 0 ? 1 : -1;
      const vType = randomChoice(VEHICLE_TYPES);
      const baseSpeed = (60 + randomRange(20, 50)) * vType.speed * speedMult;
      const gap = randomRange(3.5, 6) - lvl * 0.15;
      const count = Math.floor(W / (Math.max(gap, 2) * CELL_W)) + 1;
      const vehicles = [];
      for (let v = 0; v < count; v++) {
        vehicles.push({
          x: v * gap * CELL_W * dir + (dir > 0 ? -CELL_W : W + CELL_W),
          w: vType.w * CELL_W,
          color: vType.color,
          accent: vType.accent,
          type: vType.type,
        });
      }
      this.lanes.push({ row, dir, speed: baseSpeed, items: vehicles, isRiver: false });
    }

    // River lanes (rows 2-6, 5 lanes)
    for (let i = 0; i < 5; i++) {
      const row = ROW_RIVER_FIRST - i;
      const dir = i % 2 === 0 ? -1 : 1;
      const baseSpeed = (40 + randomRange(10, 35)) * speedMult;
      const isTurtleLane = i === 1 || i === 3;
      const logW = isTurtleLane ? 3 : randomChoice(LOG_WIDTHS);
      const gap = randomRange(3, 5.5) - lvl * 0.1;
      const count = Math.floor(W / (Math.max(gap, 2.5) * CELL_W)) + 2;
      const items = [];
      for (let j = 0; j < count; j++) {
        const obj = {
          x: j * gap * CELL_W,
          w: logW * CELL_W,
          isTurtle: isTurtleLane,
          divePhase: 0,      // 0-1 cycle
          diveSpeed: isTurtleLane ? randomRange(0.15, 0.3) + lvl * 0.03 : 0,
          diving: false,
        };
        // Stagger turtle dive phases
        if (isTurtleLane) obj.divePhase = randomRange(0, 1);
        items.push(obj);
      }
      this.lanes.push({ row, dir, speed: baseSpeed, items, isRiver: true, isTurtleLane });
    }

    // Croc in a river lane at higher levels
    this.crocLane = null;
    if (lvl >= 4 && randomChance(0.5)) {
      const riverLane = this.lanes.find(l => l.isRiver && !l.isTurtleLane);
      if (riverLane) {
        this.crocLane = {
          row: riverLane.row,
          x: -200,
          w: 4 * CELL_W,
          speed: riverLane.speed * 0.8,
          dir: riverLane.dir,
          timer: randomRange(5, 12),
          active: false,
        };
      }
    }
  }

  // ── Update ────────────────────────────────────────────────
  update(dt) {
    if (this.levelCompleteTimer > 0) {
      this.levelCompleteTimer -= dt;
      if (this.levelCompleteTimer <= 0) {
        this.level++;
        if (this.level >= 5) this.achievements.unlock('level-5-frog');
        this._initLevel();
      }
      return;
    }

    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        if (this.lives <= 0) {
          this.achievements.reportScore(this.score);
          this.gameOver();
          return;
        }
        this._respawnFrog();
      }
      return;
    }

    this.waterAnim += dt;

    // Timer
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0;
      this._killFrog('time');
      return;
    }
    // Timer warning sound
    if (this.timer < 5 && Math.floor(this.timer * 2) % 2 === 0 && this.timer > 0.5) {
      // Flashing handled in render
    }

    this._handleFrogInput(dt);
    this._updateFrogHop(dt);
    this._updateLanes(dt);
    this._updateCroc(dt);
    this._checkCollisions();
    this._updateHUD();
  }

  _handleFrogInput(dt) {
    if (!this.frog.alive || this.frog.hopTimer > 0) return;

    let dx = 0, dy = 0;
    if (this.input.isPressed('UP'))    dy = -1;
    if (this.input.isPressed('DOWN'))  dy = 1;
    if (this.input.isPressed('LEFT'))  dx = -1;
    if (this.input.isPressed('RIGHT')) dx = 1;

    if (dx !== 0 || dy !== 0) {
      // Prioritize vertical
      if (dy !== 0) dx = 0;
      let newX = this.frog.x + dx * CELL_W;
      let newY = this.frog.y + dy * CELL_H;
      let newRow = this.frog.row + dy;

      // Bounds
      newX = clamp(newX, CELL_W / 2, W - CELL_W / 2);
      newRow = clamp(newRow, ROW_HOME, ROW_START);
      newY = rowCenterY(newRow);
      if (dx !== 0) { newY = this.frog.y; newRow = this.frog.row; }

      this.frog.targetX = newX;
      this.frog.targetY = newY;
      this.frog.hopTimer = HOP_DURATION;
      this.frog.hopDir = dy !== 0 ? (dy < 0 ? 0 : 2) : (dx < 0 ? 3 : 1); // 0=up,1=right,2=down,3=left
      this.frog.startX = this.frog.x;
      this.frog.startY = this.frog.y;

      if (dy !== 0) this.frog.row = newRow;

      // Forward hop scoring
      if (dy === -1 && newRow < this.frog.highestRow) {
        this.frog.highestRow = newRow;
        this.addScore(10, this.frog.x, this.frog.y - 10);
      }

      this.audio.play('jump', { volume: 0.4, pitch: 1.2 });
    }
  }

  _updateFrogHop(dt) {
    if (this.frog.hopTimer <= 0) return;
    this.frog.hopTimer -= dt;
    const t = clamp(1 - this.frog.hopTimer / HOP_DURATION, 0, 1);
    this.frog.x = lerp(this.frog.startX, this.frog.targetX, t);
    this.frog.y = lerp(this.frog.startY, this.frog.targetY, t);
    if (this.frog.hopTimer <= 0) {
      this.frog.x = this.frog.targetX;
      this.frog.y = this.frog.targetY;
      this.frog.hopTimer = 0;
    }
  }

  _updateLanes(dt) {
    for (const lane of this.lanes) {
      for (const item of lane.items) {
        item.x += lane.dir * lane.speed * dt;
        // Wrap around
        if (lane.dir > 0 && item.x > W + item.w) item.x = -item.w;
        if (lane.dir < 0 && item.x < -item.w) item.x = W + item.w;

        // Turtle diving
        if (item.isTurtle) {
          item.divePhase += item.diveSpeed * dt;
          if (item.divePhase > 1) item.divePhase -= 1;
          // Dive cycle: 0-0.6 surface, 0.6-0.7 sinking, 0.7-0.85 underwater, 0.85-1.0 rising
          item.diving = item.divePhase > 0.7 && item.divePhase < 0.85;
          item.sinking = item.divePhase > 0.6 && item.divePhase <= 0.7;
          item.rising = item.divePhase >= 0.85 && item.divePhase <= 1.0;
        }
      }
    }
  }

  _updateCroc(dt) {
    if (!this.crocLane) return;
    const c = this.crocLane;
    if (!c.active) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.active = true;
        c.x = c.dir > 0 ? -c.w : W + c.w;
      }
      return;
    }
    c.x += c.dir * c.speed * dt;
    if ((c.dir > 0 && c.x > W + c.w) || (c.dir < 0 && c.x < -c.w * 2)) {
      c.active = false;
      c.timer = randomRange(8, 15);
    }
  }

  _checkCollisions() {
    if (!this.frog.alive || this.frog.hopTimer > 0) return;
    const fx = this.frog.x;
    const fy = this.frog.y;
    const fr = FROG_SIZE * 0.35;

    // Check home row
    if (this.frog.row === ROW_HOME) {
      this._checkHome();
      return;
    }

    // Road collision
    if (this.frog.row >= ROW_ROAD_LAST && this.frog.row <= ROW_ROAD_FIRST) {
      for (const lane of this.lanes) {
        if (lane.isRiver || lane.row !== this.frog.row) continue;
        for (const v of lane.items) {
          if (fx + fr > v.x && fx - fr < v.x + v.w) {
            this._killFrog('road');
            return;
          }
        }
      }
    }

    // River: must be on a log/turtle
    if (this.frog.row >= ROW_RIVER_LAST && this.frog.row <= ROW_RIVER_FIRST) {
      let onSomething = false;
      let ridingSpeed = 0;

      // Check croc
      if (this.crocLane && this.crocLane.active && this.crocLane.row === this.frog.row) {
        const c = this.crocLane;
        if (fx + fr > c.x && fx - fr < c.x + c.w) {
          // On croc body is safe, but mouth (front 20%) is deadly
          const mouthStart = c.dir > 0 ? c.x + c.w * 0.8 : c.x;
          const mouthEnd = c.dir > 0 ? c.x + c.w : c.x + c.w * 0.2;
          if (fx > Math.min(mouthStart, mouthEnd) && fx < Math.max(mouthStart, mouthEnd)) {
            this._killFrog('croc');
            return;
          }
          onSomething = true;
          ridingSpeed = c.dir * c.speed;
        }
      }

      if (!onSomething) {
        for (const lane of this.lanes) {
          if (!lane.isRiver || lane.row !== this.frog.row) continue;
          for (const item of lane.items) {
            if (fx + fr > item.x && fx - fr < item.x + item.w) {
              if (item.isTurtle && item.diving) {
                continue; // underwater, can't stand on
              }
              onSomething = true;
              ridingSpeed = lane.dir * lane.speed;
              // Track turtle riding time
              if (item.isTurtle && !item.diving) {
                this.turtleRideTime += 1 / 60; // approximate
                if (this.turtleRideTime >= 5) this.achievements.unlock('turtle-rider');
              }
              break;
            }
          }
          if (onSomething) break;
        }
      }

      if (!onSomething) {
        this._killFrog('water');
        return;
      }
      // Ride along with log/turtle
      this.frog.x += ridingSpeed * (1 / 60);
      this.frog.targetX = this.frog.x;
      // Fall off screen
      if (this.frog.x < -CELL_W || this.frog.x > W + CELL_W) {
        this._killFrog('water');
      }
    }
  }

  _checkHome() {
    const fx = this.frog.x;
    let landed = false;
    for (const home of this.homes) {
      if (home.filled) continue;
      const hw = HOME_SLOT_W * 0.4;
      if (fx > home.x - hw && fx < home.x + hw) {
        // Check croc mouth in home
        if (home.hasCroc) {
          this._killFrog('croc');
          return;
        }
        home.filled = true;
        landed = true;

        let pts = 50;
        const timeRatio = this.timer / this.maxTimer;

        // Fly bonus
        if (home.hasFly) {
          pts += 200;
          this.achievements.unlock('fly-catcher');
          home.hasFly = false;
        }

        // Time bonus
        pts += Math.floor(this.timer * 2);

        this.addScore(pts, fx, this.frog.y - 20);
        this.audio.play('powerup', { volume: 0.6 });
        this.achievements.unlock('safe-crossing');

        if (timeRatio >= 0.5) this.achievements.unlock('speed-frog');

        // Sparkle particles
        this.particles.emit(home.x, rowCenterY(ROW_HOME), 'sparkle');
        this.particles.emit(home.x, rowCenterY(ROW_HOME), {
          count: 12, speed: 80, speedVariance: 40, angle: -Math.PI / 2, spread: Math.PI,
          life: 0.8, lifeVariance: 0.2, size: 4, sizeVariance: 2, endSize: 0,
          color: ['#00ff88', '#88ff88', '#ffff44', '#ffffff'], friction: 0.96,
        });

        break;
      }
    }

    if (!landed) {
      // Missed all home slots
      this._killFrog('water');
      return;
    }

    // Check if all homes filled
    if (this.homes.every(h => h.filled)) {
      this.levelCompleteTimer = 2.5;
      this.audio.play('score', { volume: 0.8 });
      this.effects.flash('#00ff44', 0.3);
      // Bonus for level clear
      this.addScore(1000, W / 2, H / 2);
      this.particles.emit(W / 2, H / 2, 'confetti');
    } else {
      this._respawnFrog();
    }
  }

  _killFrog(cause) {
    if (!this.frog.alive) return;
    this.frog.alive = false;
    this.lives--;
    this.deathTimer = 1.5;

    this.effects.shake(8, 0.4);
    this.audio.play('die', { volume: 0.7 });

    const fx = this.frog.x;
    const fy = this.frog.y;

    if (cause === 'water' || cause === 'croc') {
      // Splash
      this.particles.emit(fx, fy, {
        count: 16, speed: 100, speedVariance: 50, angle: -Math.PI / 2, spread: Math.PI * 0.8,
        life: 0.6, lifeVariance: 0.2, size: 5, sizeVariance: 2, endSize: 0,
        color: ['#4488ff', '#66aaff', '#88ccff', '#ffffff'], gravity: 200, friction: 0.97,
      });
    } else if (cause === 'road') {
      // Splat
      this.particles.emit(fx, fy, {
        count: 14, speed: 120, speedVariance: 60, angle: 0, spread: Math.PI,
        life: 0.5, lifeVariance: 0.15, size: 4, sizeVariance: 2, endSize: 1,
        color: ['#ff3333', '#ff6633', '#ffcc33', '#888888'], gravity: 150, friction: 0.96,
      });
    } else {
      this.particles.emit(fx, fy, 'explosion');
    }

    this.effects.flash('#ff0000', 0.15);
    this._updateHUD();
  }

  _respawnFrog() {
    this.frog.x = W / 2;
    this.frog.y = rowCenterY(ROW_START);
    this.frog.row = ROW_START;
    this.frog.targetX = this.frog.x;
    this.frog.targetY = this.frog.y;
    this.frog.hopTimer = 0;
    this.frog.alive = true;
    this.frog.highestRow = ROW_START;
    this.timer = this.maxTimer;
  }

  _updateHUD() {
    hudScore.textContent = `SCORE ${String(this.score).padStart(8, '0')}`;
    hudLevel.textContent = `LV ${this.level}`;
    hudLives.textContent = '\u2764'.repeat(Math.max(0, this.lives));
  }

  // ── Menu ──────────────────────────────────────────────────
  updateMenu(dt) {
    this.menuBounceTimer += dt;
    this.menuFrogY = Math.sin(this.menuBounceTimer * 3) * 8;
  }

  renderMenu(ctx) {
    // Draw a preview of the game world
    this._drawBackground(ctx);

    // Darken
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    // Title
    drawNeonText(ctx, 'ROAD HOPPER', W / 2, H * 0.2, 48, '#00ff66', 18);

    // Animated frog
    ctx.save();
    ctx.translate(W / 2, H * 0.38 + this.menuFrogY);
    this._drawFrogSprite(ctx, 0, 0, 2.5, 0);
    ctx.restore();

    // Subtitle
    ctx.save();
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#668877';
    ctx.fillText('Cross the road. Ride the river. Get home.', W / 2, H * 0.52);
    ctx.restore();

    // Controls
    ctx.save();
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#556666';
    ctx.fillText('Arrow Keys / WASD to Move  |  ESC to Pause', W / 2, H * 0.82);
    ctx.restore();
  }

  // ── Render ────────────────────────────────────────────────
  render(ctx) {
    this._drawBackground(ctx);
    this._drawLanes(ctx);
    this._drawHomes(ctx);
    this._drawTimerBar(ctx);

    if (this.frog.alive) {
      const hopT = this.frog.hopTimer > 0 ? 1 - this.frog.hopTimer / HOP_DURATION : 0;
      // Depth perspective: slight scale based on row
      const scale = 1.0 - (ROW_START - this.frog.row) * 0.015;
      this._drawFrogSprite(ctx, this.frog.x, this.frog.y, scale, this.frog.hopDir, hopT);
    }

    // Level complete overlay
    if (this.levelCompleteTimer > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);
      drawNeonText(ctx, 'LEVEL COMPLETE!', W / 2, H * 0.4, 40, '#00ff88', 16);
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffcc00';
      ctx.fillText(`+1000 BONUS`, W / 2, H * 0.52);
      ctx.restore();
    }
  }

  renderGameOver(ctx) {
    // Background still visible through default overlay
  }

  drawHUD(ctx) {
    // Use the HTML HUD, skip canvas HUD
  }

  // ── Drawing helpers ───────────────────────────────────────

  _drawBackground(ctx) {
    // Row-by-row background
    for (let row = 0; row < ROWS; row++) {
      const y = rowY(row);
      if (row === ROW_START) {
        ctx.fillStyle = COL_SIDEWALK;
      } else if (row >= ROW_ROAD_LAST && row <= ROW_ROAD_FIRST) {
        ctx.fillStyle = COL_ROAD;
      } else if (row === ROW_MEDIAN) {
        ctx.fillStyle = COL_GRASS;
      } else if (row >= ROW_RIVER_LAST && row <= ROW_RIVER_FIRST) {
        ctx.fillStyle = COL_WATER;
      } else if (row === ROW_HOME) {
        ctx.fillStyle = COL_HOME_BG;
      } else if (row === ROW_TIMER) {
        ctx.fillStyle = '#111';
      } else {
        ctx.fillStyle = '#222';
      }
      ctx.fillRect(0, y, W, CELL_H + 1);
    }

    // Road lane markings
    for (let row = ROW_ROAD_LAST; row <= ROW_ROAD_FIRST; row++) {
      const y = rowY(row);
      ctx.strokeStyle = COL_ROAD_LINE;
      ctx.lineWidth = 1;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Grass tufts on safe zones
    ctx.fillStyle = '#3a8a3a';
    for (const safeRow of [ROW_START, ROW_MEDIAN]) {
      const y = rowY(safeRow);
      for (let gx = 0; gx < W; gx += 30) {
        const gy = y + randomRange(5, CELL_H - 5);
        ctx.fillRect(gx + 5, gy, 3, 5);
        ctx.fillRect(gx + 12, gy + 3, 2, 4);
      }
    }

    // Water animation (subtle wave lines)
    if (this.waterAnim !== undefined) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = COL_WATER_LIGHT;
      ctx.lineWidth = 1;
      for (let row = ROW_RIVER_LAST; row <= ROW_RIVER_FIRST; row++) {
        const y = rowCenterY(row);
        ctx.beginPath();
        for (let wx = 0; wx < W; wx += 4) {
          const wy = y + Math.sin((wx + this.waterAnim * 60) * 0.05) * 3;
          wx === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawLanes(ctx) {
    for (const lane of this.lanes) {
      const scale = 1.0 - (ROW_START - lane.row) * 0.015;
      for (const item of lane.items) {
        if (lane.isRiver) {
          this._drawRiverObject(ctx, item, lane, scale);
        } else {
          this._drawVehicle(ctx, item, lane, scale);
        }
      }
    }

    // Draw croc
    if (this.crocLane && this.crocLane.active) {
      this._drawCroc(ctx, this.crocLane);
    }
  }

  _drawVehicle(ctx, v, lane, scale) {
    const y = rowCenterY(lane.row);
    const h = CELL_H * 0.65 * scale;
    const drawY = y - h / 2;
    const w = v.w * scale;

    ctx.save();
    // Body
    ctx.fillStyle = v.color;
    const r = 4;
    ctx.beginPath();
    ctx.roundRect(v.x, drawY, w, h, r);
    ctx.fill();

    // Accent stripe
    ctx.fillStyle = v.accent;
    ctx.fillRect(v.x + 4, drawY + h * 0.3, w - 8, h * 0.2);

    // Windshield
    ctx.fillStyle = '#aaddff';
    ctx.globalAlpha = 0.6;
    const wsX = lane.dir > 0 ? v.x + w * 0.65 : v.x + w * 0.1;
    ctx.fillRect(wsX, drawY + 3, w * 0.2, h - 6);
    ctx.globalAlpha = 1;

    // Headlights
    ctx.fillStyle = '#ffff88';
    const hlX = lane.dir > 0 ? v.x + w - 4 : v.x;
    ctx.fillRect(hlX, drawY + 3, 4, 4);
    ctx.fillRect(hlX, drawY + h - 7, 4, 4);

    // Wheels
    ctx.fillStyle = '#222';
    ctx.fillRect(v.x + 6, drawY - 2, 8, 3);
    ctx.fillRect(v.x + w - 14, drawY - 2, 8, 3);
    ctx.fillRect(v.x + 6, drawY + h - 1, 8, 3);
    ctx.fillRect(v.x + w - 14, drawY + h - 1, 8, 3);

    ctx.restore();
  }

  _drawRiverObject(ctx, item, lane, scale) {
    const y = rowCenterY(lane.row);
    const h = CELL_H * 0.55 * scale;
    const drawY = y - h / 2;
    const w = item.w * scale;

    if (item.isTurtle) {
      // Draw turtle group (3 turtles per platform)
      const turtleCount = 3;
      const tw = w / turtleCount;

      ctx.save();
      // Diving state affects appearance
      if (item.diving) {
        ctx.globalAlpha = 0.2;
      } else if (item.sinking) {
        ctx.globalAlpha = 0.5 + (0.7 - item.divePhase) * 5;
      } else if (item.rising) {
        ctx.globalAlpha = 0.5 + (item.divePhase - 0.85) * 3.3;
      }

      for (let t = 0; t < turtleCount; t++) {
        const tx = item.x + t * tw + tw * 0.15;
        const tSize = tw * 0.7;
        // Shell
        ctx.fillStyle = '#338844';
        ctx.beginPath();
        ctx.ellipse(tx + tSize / 2, drawY + h / 2, tSize / 2, h / 2 * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
        // Shell pattern
        ctx.fillStyle = '#44aa55';
        ctx.beginPath();
        ctx.ellipse(tx + tSize / 2, drawY + h / 2, tSize / 3, h / 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.fillStyle = '#55bb66';
        const headDir = lane.dir > 0 ? tSize + 2 : -6;
        ctx.beginPath();
        ctx.arc(tx + headDir, drawY + h / 2, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // Log
      ctx.save();
      ctx.fillStyle = '#8B5A2B';
      ctx.beginPath();
      ctx.roundRect(item.x, drawY, w, h, h / 2);
      ctx.fill();

      // Wood grain
      ctx.strokeStyle = '#6B3A1B';
      ctx.lineWidth = 1;
      for (let lx = item.x + 15; lx < item.x + w - 10; lx += 20) {
        ctx.beginPath();
        ctx.moveTo(lx, drawY + 4);
        ctx.lineTo(lx + 5, drawY + h - 4);
        ctx.stroke();
      }

      // Bark highlight
      ctx.fillStyle = '#9B6A3B';
      ctx.fillRect(item.x + 4, drawY + 3, w - 8, 3);
      ctx.restore();
    }
  }

  _drawCroc(ctx, croc) {
    const y = rowCenterY(croc.row);
    const h = CELL_H * 0.6;
    const drawY = y - h / 2;

    ctx.save();
    // Body
    ctx.fillStyle = '#336633';
    ctx.beginPath();
    ctx.roundRect(croc.x, drawY, croc.w, h, 4);
    ctx.fill();

    // Scales
    ctx.fillStyle = '#447744';
    for (let sx = croc.x + 10; sx < croc.x + croc.w - 20; sx += 12) {
      ctx.fillRect(sx, drawY + 4, 6, h - 8);
    }

    // Head/mouth at front
    const mouthX = croc.dir > 0 ? croc.x + croc.w * 0.8 : croc.x;
    const mouthW = croc.w * 0.2;
    ctx.fillStyle = '#cc3333';
    ctx.fillRect(mouthX, drawY + 4, mouthW, h - 8);

    // Eyes
    ctx.fillStyle = '#ffff00';
    const eyeX = croc.dir > 0 ? croc.x + croc.w * 0.75 : croc.x + croc.w * 0.2;
    ctx.beginPath();
    ctx.arc(eyeX, drawY + 6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX, drawY + h - 6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(eyeX + 1, drawY + 6, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + 1, drawY + h - 6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawHomes(ctx) {
    const y = rowCenterY(ROW_HOME);
    for (const home of this.homes) {
      const hw = HOME_SLOT_W * 0.4;
      if (home.filled) {
        // Show a small frog in the filled home
        ctx.save();
        ctx.translate(home.x, y);
        this._drawFrogSprite(ctx, 0, 0, 0.7, 0);
        ctx.restore();
        // Glow
        ctx.save();
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#00ff44';
        ctx.lineWidth = 2;
        ctx.strokeRect(home.x - hw, rowY(ROW_HOME) + 4, hw * 2, CELL_H - 8);
        ctx.restore();
      } else {
        // Empty home slot
        ctx.save();
        ctx.fillStyle = '#0a1a0a';
        ctx.fillRect(home.x - hw, rowY(ROW_HOME) + 4, hw * 2, CELL_H - 8);
        ctx.strokeStyle = '#336633';
        ctx.lineWidth = 1;
        ctx.strokeRect(home.x - hw, rowY(ROW_HOME) + 4, hw * 2, CELL_H - 8);

        // Fly
        if (home.hasFly) {
          const flyBob = Math.sin(performance.now() * 0.008) * 3;
          ctx.fillStyle = '#ffcc00';
          ctx.beginPath();
          ctx.arc(home.x, y + flyBob, 4, 0, Math.PI * 2);
          ctx.fill();
          // Wings
          ctx.fillStyle = 'rgba(255,255,200,0.5)';
          ctx.beginPath();
          ctx.ellipse(home.x - 5, y + flyBob - 2, 4, 2, -0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(home.x + 5, y + flyBob - 2, 4, 2, 0.3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Croc peek in home
        if (home.hasCroc) {
          ctx.fillStyle = '#336633';
          ctx.beginPath();
          ctx.ellipse(home.x, y + 4, 12, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          // Eyes
          ctx.fillStyle = '#ff4444';
          ctx.beginPath();
          ctx.arc(home.x - 5, y + 1, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(home.x + 5, y + 1, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  _drawTimerBar(ctx) {
    const ratio = clamp(this.timer / this.maxTimer, 0, 1);
    const barW = W - 20;
    const barY = 4;

    // Background
    ctx.fillStyle = '#222';
    ctx.fillRect(10, barY, barW, TIMER_BAR_H);

    // Fill
    const hue = ratio > 0.5 ? 120 : ratio > 0.25 ? 60 : 0;
    ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
    ctx.fillRect(10, barY, barW * ratio, TIMER_BAR_H);

    // Flash when low
    if (this.timer < 5 && Math.floor(performance.now() / 300) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,0,0,0.3)';
      ctx.fillRect(10, barY, barW, TIMER_BAR_H);
    }

    // Border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, barY, barW, TIMER_BAR_H);

    // TIME label
    ctx.save();
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TIME', 12, barY + TIMER_BAR_H + 2);
    ctx.restore();
  }

  _drawFrogSprite(ctx, x, y, scale, dir, hopT = 0) {
    ctx.save();
    ctx.translate(x, y);

    const s = FROG_SIZE * scale;
    const half = s / 2;

    // Hop stretch effect
    let stretchX = 1, stretchY = 1;
    if (hopT > 0) {
      const arc = Math.sin(hopT * Math.PI);
      if (dir === 0 || dir === 2) { stretchX = 1 - arc * 0.15; stretchY = 1 + arc * 0.25; }
      else { stretchX = 1 + arc * 0.25; stretchY = 1 - arc * 0.15; }
    }
    ctx.scale(stretchX, stretchY);

    // Rotation based on direction
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    ctx.rotate(angles[dir] || 0);

    // Body
    ctx.fillStyle = '#33cc44';
    ctx.beginPath();
    ctx.ellipse(0, 2, half * 0.55, half * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#44dd55';
    ctx.beginPath();
    ctx.ellipse(0, -half * 0.35, half * 0.4, half * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-half * 0.22, -half * 0.5, half * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(half * 0.22, -half * 0.5, half * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-half * 0.2, -half * 0.52, half * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(half * 0.24, -half * 0.52, half * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#2aaa38';
    // Back legs
    ctx.beginPath();
    ctx.ellipse(-half * 0.45, half * 0.4, half * 0.18, half * 0.3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(half * 0.45, half * 0.4, half * 0.18, half * 0.3, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ── Instantiate ─────────────────────────────────────────────
const game = new RoadHopper();

})();
