(function () { /* de-moduled */
'use strict';
/**
 * Pac-Chase — Pac-Man-style maze chase arcade game
 * Extends the shared GameEngine from Galaxy Zone Arcade.
 */




// ── Constants ────────────────────────────────────────────────

const W = 800;
const H = 600;
const COLS = 28;
const ROWS = 31;
const TILE = Math.floor(Math.min((W - 40) / COLS, (H - 60) / ROWS));
const MAZE_X = Math.floor((W - COLS * TILE) / 2);
const MAZE_Y = Math.floor((H - ROWS * TILE) / 2) + 10;
const HALF = TILE / 2;

const DOT_SCORE = 10;
const PELLET_SCORE = 50;
const GHOST_SCORES = [200, 400, 800, 1600];
const FRUIT_SCORES = [100, 300, 500, 100, 300, 500, 100, 300];
const FRUIT_NAMES = ['cherry', 'strawberry', 'orange', 'cherry', 'strawberry', 'orange', 'cherry', 'strawberry'];

// Directions: 0=right, 1=down, 2=left, 3=up
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const OPPOSITE = [2, 3, 0, 1];

// Ghost mode timers per level — alternating [scatter, chase] durations (seconds)
const MODE_TIMERS = [
  [7, 20, 7, 20, 5, 20, 5, Infinity],
  [7, 20, 7, 20, 5, 17, 1, Infinity],
  [5, 20, 5, 20, 5, 15, 1, Infinity],
];

// Frightened duration per level (seconds)
const FRIGHT_TIMES = [6, 5, 4, 3, 2, 2, 1, 1, 1, 0.5];

// Ghost base speed as fraction of player speed, escalating per level
const GHOST_SPEED_MULT = [0.75, 0.80, 0.85, 0.90, 0.92, 0.95];
const FRIGHT_SPEED = 0.50;
const TUNNEL_SPEED = 0.40;
const ELROY_SPEED_BONUS = 0.05;
const ELROY_DOT_THRESHOLDS = [20, 10];

// ── Maze (28x31): 0=empty 1=wall 2=dot 3=pellet 4=ghost-house 5=gate 6=tunnel ──
const MAZE_DEF = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
  [1,3,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,3,1],
  [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
  [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
  [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
  [0,0,0,0,0,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,2,1,1,0,1,1,1,5,5,1,1,1,0,1,1,2,1,0,0,0,0,0],
  [1,1,1,1,1,1,2,1,1,0,1,4,4,4,4,4,4,1,0,1,1,2,1,1,1,1,1,1],
  [6,0,0,0,0,0,2,0,0,0,1,4,4,4,4,4,4,1,0,0,0,2,0,0,0,0,0,6],
  [1,1,1,1,1,1,2,1,1,0,1,4,4,4,4,4,4,1,0,1,1,2,1,1,1,1,1,1],
  [0,0,0,0,0,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,0,0,0,0,0],
  [0,0,0,0,0,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,0,0,0,0,0],
  [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
  [1,3,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,3,1],
  [1,2,2,2,1,1,2,2,2,2,2,2,2,0,0,2,2,2,2,2,2,2,1,1,2,2,2,1],
  [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
  [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
  [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
  [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
  [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// Ghost scatter targets (home corners) — col, row
const SCATTER = [
  { x: 25, y: 0 },  // Blinky — top right
  { x: 2, y: 0 },   // Pinky — top left
  { x: 27, y: 30 }, // Inky — bottom right
  { x: 0, y: 30 },  // Clyde — bottom left
];

const GHOST_COLORS = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'];
const GHOST_NAMES = ['Blinky', 'Pinky', 'Inky', 'Clyde'];

const PLAYER_START = { x: 14, y: 23 };
const GHOST_STARTS = [
  { x: 14, y: 11 }, // Blinky — starts outside house
  { x: 14, y: 14 }, // Pinky — in house center
  { x: 12, y: 14 }, // Inky — in house left
  { x: 16, y: 14 }, // Clyde — in house right
];
const GHOST_EXIT = { x: 14, y: 11 };
const FRUIT_POS = { x: 14, y: 17 };

// ── Helpers ──────────────────────────────────────────────────

function tileX(px) { return Math.floor((px - MAZE_X) / TILE); }
function tileY(py) { return Math.floor((py - MAZE_Y) / TILE); }
function centerX(c) { return MAZE_X + c * TILE + HALF; }
function centerY(r) { return MAZE_Y + r * TILE + HALF; }
function dist(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }
function distSq(ax, ay, bx, by) { return (ax - bx) ** 2 + (ay - by) ** 2; }
function wrapCol(c) { return c < 0 ? COLS - 1 : c >= COLS ? 0 : c; }

function isWalkable(maze, c, r) {
  if (r < 0 || r >= ROWS) return false;
  if (c < 0 || c >= COLS) return r === 14; // tunnel row
  const t = maze[r][c];
  return t !== 1 && t !== 4;
}

function isGhostWalkable(maze, c, r, canUseGate) {
  if (r < 0 || r >= ROWS) return false;
  if (c < 0 || c >= COLS) return r === 14;
  const t = maze[r][c];
  return t !== 1 && (canUseGate || (t !== 5 && t !== 4));
}

// ── Ghost class ──────────────────────────────────────────────

class Ghost {
  constructor(index) {
    this.index = index;
    this.color = GHOST_COLORS[index];
    this.reset();
  }

  reset() {
    const s = GHOST_STARTS[this.index];
    this.x = centerX(s.x);
    this.y = centerY(s.y);
    this.col = s.x;
    this.row = s.y;
    this.dir = 3; // start facing up
    this.mode = this.index === 0 ? 'scatter' : 'house';
    this.frightened = false;
    this.eaten = false;
    this.animFrame = 0;
    this.animTimer = 0;
    this.houseTimer = this.index * 2.5; // staggered release
    this.elroy = 0;
  }

  getTarget(player, blinky, mode) {
    if (this.eaten) return GHOST_EXIT;
    if (this.frightened) {
      return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    }
    if (mode === 'scatter' && this.elroy === 0) return SCATTER[this.index];

    // Chase mode — each ghost has distinct AI personality
    switch (this.index) {
      case 0: // Blinky (Red) — directly targets player position
        return { x: player.col, y: player.row };

      case 1: { // Pinky (Pink) — targets 4 tiles ahead of player
        let tx = player.col + DX[player.dir] * 4;
        let ty = player.row + DY[player.dir] * 4;
        if (player.dir === 3) tx -= 4; // original overflow bug when facing up
        return { x: tx, y: ty };
      }

      case 2: { // Inky (Cyan) — vector doubling from Blinky's position
        let ax = player.col + DX[player.dir] * 2;
        let ay = player.row + DY[player.dir] * 2;
        if (player.dir === 3) ax -= 2;
        return { x: ax + (ax - blinky.col), y: ay + (ay - blinky.row) };
      }

      case 3: { // Clyde (Orange) — chases when far, retreats when close (<8 tiles)
        const d = dist(this.col, this.row, player.col, player.row);
        return d > 8 ? { x: player.col, y: player.row } : SCATTER[3];
      }

      default: return { x: player.col, y: player.row };
    }
  }
}

// ── Pac-Chase Game ───────────────────────────────────────────

class PacChase extends GameEngine {
  constructor() {
    super('game-canvas', { width: W, height: H, background: '#000' });
  }

  init() {
    // Achievements
    this.achievements = new AchievementManager('pac-chase');
    this.achievements.define([
      { id: 'dot-muncher',  name: 'Dot Muncher',  description: 'Eat all dots on level 1',                icon: '\u{1F7E1}' },
      { id: 'ghost-hunter', name: 'Ghost Hunter',  description: 'Eat all 4 ghosts in one power pellet',   icon: '\u{1F47B}' },
      { id: 'fruit-lover',  name: 'Fruit Lover',   description: 'Collect 3 fruits in one game',            icon: '\u{1F352}' },
      { id: 'level-3',      name: 'Level 3',       description: 'Reach level 3',                           icon: '\u{1F31F}' },
      { id: 'pac-master',   name: 'Pac-Master',    description: 'Score 10,000+ points',                    icon: '\u{1F3C6}' },
    ]);

    // Game state
    this.maze = [];
    this.totalDots = 0;
    this.dotsEaten = 0;
    this.ghostsEatenThisPellet = 0;
    this.fruitsCollected = 0;

    // Ghost mode tracking
    this.ghostMode = 'scatter';
    this.modeTimer = 0;
    this.modeIndex = 0;
    this.frightTimer = 0;
    this.frightDuration = 0;
    this.sirenTimer = 0;

    // Player state
    this.px = 0;
    this.py = 0;
    this.pdir = 2; // facing left
    this.pNextDir = 2;
    this.pSpeed = 0;
    this.mouthAngle = 0;
    this.mouthDir = 1;
    this.chomping = false;
    this.chompTimer = 0;

    // Ghosts
    this.ghosts = [new Ghost(0), new Ghost(1), new Ghost(2), new Ghost(3)];

    // Fruit
    this.fruitActive = false;
    this.fruitDisplayTimer = 0;
    this.fruitType = 0;

    // Sub-states for in-game sequences
    this.subState = 'menu';
    this.readyTimer = 0;
    this.deathTimer = 0;
    this.deathAngle = 0;
    this.levelClearTimer = 0;
    this.levelFlash = false;
    this.ghostEatPauseTimer = 0;
    this.ghostEatScore = 0;
    this.ghostEatX = 0;
    this.ghostEatY = 0;

    // Menu animation
    this.menuTimer = 0;
    this.menuChaseX = 0;

    // Score popups and timers
    this.popups = [];
    this.gameTime = 0;

    this.start();
  }

  // ── Maze setup ───────────────────────────────────────────

  _buildMaze() {
    this.maze = MAZE_DEF.map(r => [...r]);
    this.totalDots = 0;
    this.dotsEaten = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (this.maze[r][c] === 2 || this.maze[r][c] === 3) this.totalDots++;
  }

  _resetPositions() {
    this.px = centerX(PLAYER_START.x);
    this.py = centerY(PLAYER_START.y);
    this.pdir = 2;
    this.pNextDir = 2;
    this.mouthAngle = 0;
    this.mouthDir = 1;
    for (const g of this.ghosts) g.reset();
  }

  _startLevel() {
    this._buildMaze();
    this._resetPositions();
    this.fruitActive = false;
    this.ghostMode = 'scatter';
    this.modeTimer = 0;
    this.modeIndex = 0;
    this.frightTimer = 0;
    this.ghostsEatenThisPellet = 0;
    this.pSpeed = TILE * 8;
    this.subState = 'ready';
    this.readyTimer = 2.0;
    this.audio.play('start');
  }

  // ── Engine hooks ─────────────────────────────────────────

  onEnterState(state) {
    if (state === 'playing') {
      this.subState = 'ready';
      this._buildMaze();
      this._resetPositions();
      this.fruitsCollected = 0;
      this.fruitActive = false;
      this.ghostMode = 'scatter';
      this.modeTimer = 0;
      this.modeIndex = 0;
      this.frightTimer = 0;
      this.pSpeed = TILE * 8;
      this.readyTimer = 2.0;
      this.popups = [];
      this.gameTime = 0;
      this.audio.play('start');
    }
  }

  // ── Menu ─────────────────────────────────────────────────

  updateMenu(dt) {
    this.menuTimer += dt;
    this.menuChaseX += dt * 100;
    if (this.menuChaseX > W + 200) this.menuChaseX = -200;
  }

  renderMenu(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title with glow
    ctx.font = 'bold 52px "Courier New", monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 20;
    ctx.fillText('PAC-CHASE', W / 2, H * 0.25);
    ctx.shadowBlur = 0;

    // Chase animation — ghosts pursuing pac-man across the screen
    const cy = H * 0.42;
    const cx = this.menuChaseX;
    for (let i = 0; i < 4; i++) {
      this._drawGhostShape(ctx, cx - 30 * (i + 1) - 40, cy,
        GHOST_COLORS[i], Math.floor(this.menuTimer * 6) % 2);
    }

    // Pac-man with chomping animation
    const mouth = Math.abs(Math.sin(this.menuTimer * 10)) * 0.8;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(cx, cy, 12, mouth, Math.PI * 2 - mouth);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();

    // Instructions
    ctx.font = '16px "Courier New", monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Arrow Keys / WASD to move', W / 2, H * 0.78);
    ctx.fillText('ESC to pause', W / 2, H * 0.83);

    ctx.restore();
  }

  // ── Main update ──────────────────────────────────────────

  update(dt) {
    this.gameTime += dt;

    // Sub-state handling — ready countdown
    if (this.subState === 'ready') {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) this.subState = 'active';
      return;
    }

    // Ghost eat pause — brief freeze when eating a ghost
    if (this.subState === 'ghostEatPause') {
      this.ghostEatPauseTimer -= dt;
      if (this.ghostEatPauseTimer <= 0) this.subState = 'active';
      return;
    }

    // Death animation — pac-man deflates
    if (this.subState === 'death') {
      this.deathTimer -= dt;
      this.deathAngle = Math.min(Math.PI * 2, this.deathAngle + dt * Math.PI * 2.5);
      if (this.deathTimer <= 0) {
        this.lives--;
        if (this.lives <= 0) {
          this._checkFinal();
          this.gameOver();
          return;
        }
        this._resetPositions();
        this.subState = 'ready';
        this.readyTimer = 1.5;
      }
      return;
    }

    // Level clear — maze flashing
    if (this.subState === 'levelClear') {
      this.levelClearTimer -= dt;
      this.levelFlash = Math.floor(this.levelClearTimer * 6) % 2 === 0;
      if (this.levelClearTimer <= 0) {
        this.level++;
        if (this.level === 3) this.achievements.unlock('level-3');
        this._startLevel();
      }
      return;
    }

    if (this.subState !== 'active') return;

    // Player input
    if (this.input.isDown('LEFT')) this.pNextDir = 2;
    else if (this.input.isDown('RIGHT')) this.pNextDir = 0;
    else if (this.input.isDown('UP')) this.pNextDir = 3;
    else if (this.input.isDown('DOWN')) this.pNextDir = 1;

    this._movePlayer(dt);
    this._updateGhostModes(dt);
    for (const g of this.ghosts) this._moveGhost(g, dt);
    this._checkDots();
    this._checkFruit(dt);
    this._checkGhostCollisions();

    // Siren sound during frightened mode
    if (this.frightTimer > 0) {
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0) {
        this.audio.play('hit', { pitch: 0.4, volume: 0.3 });
        this.sirenTimer = 0.35;
      }
    }

    // Level complete check
    if (this.dotsEaten >= this.totalDots) {
      this.subState = 'levelClear';
      this.levelClearTimer = 2.0;
      if (this.level === 1) this.achievements.unlock('dot-muncher');
      this.audio.play('powerup');
    }

    // Mouth animation
    if (this.chomping) {
      this.mouthAngle += this.mouthDir * dt * 12;
      if (this.mouthAngle > 0.8) { this.mouthAngle = 0.8; this.mouthDir = -1; }
      if (this.mouthAngle < 0.05) { this.mouthAngle = 0.05; this.mouthDir = 1; }
    } else {
      this.mouthAngle *= 0.9;
    }
    this.chomping = false;

    // Update score popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].timer -= dt;
      this.popups[i].y -= dt * 40;
      if (this.popups[i].timer <= 0) this.popups.splice(i, 1);
    }

    // Ghost animation frames
    for (const g of this.ghosts) {
      g.animTimer += dt;
      if (g.animTimer > 0.1) {
        g.animTimer = 0;
        g.animFrame = (g.animFrame + 1) % 2;
      }
    }
  }

  // ── Player movement with cornering assist ────────────────

  _movePlayer(dt) {
    const speed = this.pSpeed * dt;
    const col = tileX(this.px);
    const row = tileY(this.py);
    const cx = centerX(col);
    const cy = centerY(row);

    // Pre-turn: try desired direction when close to intersection
    const nCol = col + DX[this.pNextDir];
    const nRow = row + DY[this.pNextDir];
    if (isWalkable(this.maze, nCol, nRow) && this.pNextDir !== this.pdir) {
      if (this.pNextDir === 0 || this.pNextDir === 2) {
        // Turning horizontal — snap Y to center first
        if (Math.abs(cy - this.py) < speed + 2) { this.py = cy; this.pdir = this.pNextDir; }
      } else {
        // Turning vertical — snap X to center first
        if (Math.abs(cx - this.px) < speed + 2) { this.px = cx; this.pdir = this.pNextDir; }
      }
    }

    // Move in current direction
    const fCol = col + DX[this.pdir];
    const fRow = row + DY[this.pdir];
    const canMove = isWalkable(this.maze, fCol, fRow);
    const atCenter = Math.abs(this.px - cx) < 2 && Math.abs(this.py - cy) < 2;

    if (canMove || !atCenter) {
      let nx = this.px + DX[this.pdir] * speed;
      let ny = this.py + DY[this.pdir] * speed;
      // Prevent overshooting into wall
      if (!canMove) {
        if (this.pdir === 0) nx = Math.min(nx, cx);
        if (this.pdir === 2) nx = Math.max(nx, cx);
        if (this.pdir === 1) ny = Math.min(ny, cy);
        if (this.pdir === 3) ny = Math.max(ny, cy);
      }
      this.px = nx;
      this.py = ny;
    }

    // Tunnel wrap — left/right edges
    if (this.px < MAZE_X - TILE) this.px = MAZE_X + COLS * TILE;
    if (this.px > MAZE_X + COLS * TILE) this.px = MAZE_X - TILE;
  }

  // ── Ghost movement & AI ──────────────────────────────────

  _moveGhost(g, dt) {
    // Ghosts in house bob up and down, waiting to be released
    if (g.mode === 'house') {
      g.houseTimer -= dt;
      if (g.houseTimer <= 0) {
        g.mode = 'leaving';
        g.x = centerX(GHOST_EXIT.x);
      }
      g.y += Math.sin(this.gameTime * 4 + g.index) * 0.5;
      return;
    }

    // Leaving house — slide upward to exit
    if (g.mode === 'leaving') {
      const ey = centerY(GHOST_EXIT.y);
      g.y += (ey - g.y) * dt * 4;
      if (Math.abs(g.y - ey) < 2) {
        g.y = ey;
        g.row = GHOST_EXIT.y;
        g.col = GHOST_EXIT.x;
        g.mode = this.ghostMode;
        g.dir = 2; // start moving left
      }
      return;
    }

    // Calculate speed based on state
    const lvl = Math.min(this.level - 1, GHOST_SPEED_MULT.length - 1);
    let sm = GHOST_SPEED_MULT[lvl];
    const inTunnel = g.col <= 0 || g.col >= COLS - 1;

    if (g.eaten) sm = 1.5; // eyes travel fast back to house
    else if (g.frightened) sm = FRIGHT_SPEED;
    else if (inTunnel) sm = TUNNEL_SPEED;
    else if (g.index === 0 && g.elroy > 0) sm += ELROY_SPEED_BONUS * g.elroy;

    const speed = this.pSpeed * sm * dt;
    const col = tileX(g.x);
    const row = tileY(g.y);
    const cx = centerX(col);
    const cy = centerY(row);
    g.col = col;
    g.row = row;

    // Check if eaten ghost reached home — regenerate
    if (g.eaten && col === GHOST_EXIT.x && row === GHOST_EXIT.y &&
        Math.abs(g.x - cx) < 3 && Math.abs(g.y - cy) < 3) {
      g.eaten = false;
      g.frightened = false;
      g.mode = this.ghostMode;
      g.x = cx;
      g.y = cy;
    }

    // At tile center — choose new direction based on AI target
    if (Math.abs(g.x - cx) < speed + 1 && Math.abs(g.y - cy) < speed + 1) {
      g.x = cx;
      g.y = cy;

      const target = g.getTarget(
        { col: tileX(this.px), row: tileY(this.py), dir: this.pdir },
        this.ghosts[0], this.ghostMode
      );

      // Pick direction closest to target (no reversing allowed)
      let bestDir = g.dir;
      let bestDist = Infinity;
      const gate = g.eaten || g.mode === 'leaving';

      for (let d = 0; d < 4; d++) {
        if (d === OPPOSITE[g.dir]) continue;
        const nc = wrapCol(col + DX[d]);
        const nr = row + DY[d];
        if (!isGhostWalkable(this.maze, nc, nr, gate)) continue;
        const dd = distSq(nc, nr, target.x, target.y);
        if (dd < bestDist) { bestDist = dd; bestDir = d; }
      }
      g.dir = bestDir;
    }

    // Move ghost
    g.x += DX[g.dir] * speed;
    g.y += DY[g.dir] * speed;

    // Tunnel wrap
    if (g.x < MAZE_X - TILE) g.x = MAZE_X + COLS * TILE;
    if (g.x > MAZE_X + COLS * TILE) g.x = MAZE_X - TILE;
  }

  // ── Ghost mode management (scatter/chase/frightened) ─────

  _updateGhostModes(dt) {
    // Frightened mode takes priority
    if (this.frightTimer > 0) {
      this.frightTimer -= dt;
      if (this.frightTimer <= 0) {
        for (const g of this.ghosts) {
          if (g.frightened && !g.eaten) {
            g.frightened = false;
            g.mode = this.ghostMode;
          }
        }
      }
      return; // Don't advance scatter/chase timer during fright
    }

    // Scatter/chase mode switching
    const ts = MODE_TIMERS[Math.min(this.level - 1, MODE_TIMERS.length - 1)];
    const idx = Math.min(this.modeIndex, ts.length - 1);
    this.modeTimer += dt;

    if (this.modeTimer >= ts[idx]) {
      this.modeTimer = 0;
      this.modeIndex++;
      this.ghostMode = this.modeIndex % 2 === 0 ? 'scatter' : 'chase';
      // Ghosts reverse direction on mode change
      for (const g of this.ghosts) {
        if (!g.frightened && !g.eaten && g.mode !== 'house' && g.mode !== 'leaving') {
          g.dir = OPPOSITE[g.dir];
          g.mode = this.ghostMode;
        }
      }
    }

    // Cruise Elroy — Blinky speeds up when few dots remain
    const dotsLeft = this.totalDots - this.dotsEaten;
    if (dotsLeft <= ELROY_DOT_THRESHOLDS[0]) this.ghosts[0].elroy = 1;
    if (dotsLeft <= ELROY_DOT_THRESHOLDS[1]) this.ghosts[0].elroy = 2;
  }

  // ── Dot & pellet collection ──────────────────────────────

  _checkDots() {
    const col = tileX(this.px);
    const row = tileY(this.py);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    const cx = centerX(col);
    const cy = centerY(row);
    if (Math.abs(this.px - cx) > HALF * 0.6 || Math.abs(this.py - cy) > HALF * 0.6) return;

    const tile = this.maze[row][col];

    if (tile === 2) {
      // Regular dot
      this.maze[row][col] = 0;
      this.dotsEaten++;
      this.addScore(DOT_SCORE);
      this.chomping = true;
      this.chompTimer++;
      // Waka-waka: alternating chomp sounds
      if (this.chompTimer % 2 === 0) this.audio.play('select', { pitch: 1.5 });
      this.particles.emit(this.px, this.py, 'sparkle', 2);

      // Trigger fruit at specific dot counts
      if (this.dotsEaten === 70 || this.dotsEaten === 170) {
        this.fruitActive = true;
        this.fruitDisplayTimer = 9;
        this.fruitType = Math.min(this.level - 1, FRUIT_NAMES.length - 1);
      }
    } else if (tile === 3) {
      // Power pellet — frighten all ghosts
      this.maze[row][col] = 0;
      this.dotsEaten++;
      this.addScore(PELLET_SCORE);
      this.chomping = true;
      this.ghostsEatenThisPellet = 0;
      this.audio.play('powerup');
      this.particles.emit(this.px, this.py, 'explosion', 8);

      const ft = FRIGHT_TIMES[Math.min(this.level - 1, FRIGHT_TIMES.length - 1)];
      this.frightTimer = ft;
      this.frightDuration = ft;
      this.sirenTimer = 0;

      for (const g of this.ghosts) {
        if (g.mode !== 'house' && g.mode !== 'leaving' && !g.eaten) {
          g.frightened = true;
          g.dir = OPPOSITE[g.dir]; // reverse on fright
        }
      }
    }
  }

  // ── Fruit bonuses ────────────────────────────────────────

  _checkFruit(dt) {
    if (!this.fruitActive) return;
    this.fruitDisplayTimer -= dt;
    if (this.fruitDisplayTimer <= 0) { this.fruitActive = false; return; }

    const fx = centerX(FRUIT_POS.x);
    const fy = centerY(FRUIT_POS.y);
    if (Math.abs(this.px - fx) < TILE && Math.abs(this.py - fy) < TILE) {
      const sc = FRUIT_SCORES[this.fruitType];
      this.addScore(sc);
      this.fruitActive = false;
      this.fruitsCollected++;
      this.popups.push({ x: fx, y: fy, text: String(sc), timer: 1.5 });
      this.audio.play('coin');
      this.particles.emit(fx, fy, 'confetti', 12);
      if (this.fruitsCollected >= 3) this.achievements.unlock('fruit-lover');
    }
  }

  // ── Ghost collision detection ────────────────────────────

  _checkGhostCollisions() {
    const pr = TILE * 0.6;
    for (const g of this.ghosts) {
      if (g.mode === 'house' || g.mode === 'leaving') continue;
      if (Math.abs(g.x - this.px) + Math.abs(g.y - this.py) > pr) continue;

      if (g.frightened && !g.eaten) {
        // Eat ghost — ascending score sequence
        g.eaten = true;
        g.frightened = false;
        this.ghostsEatenThisPellet++;
        const pts = GHOST_SCORES[Math.min(this.ghostsEatenThisPellet - 1, 3)];
        this.addScore(pts);
        this.popups.push({ x: g.x, y: g.y, text: String(pts), timer: 1.2 });
        this.effects.shake(4, 0.2);
        this.audio.play('score', { pitch: 0.8 + this.ghostsEatenThisPellet * 0.3 });
        this.particles.emit(g.x, g.y, 'sparkle', 6);

        // Brief pause to show score
        this.subState = 'ghostEatPause';
        this.ghostEatPauseTimer = 0.4;
        this.ghostEatScore = pts;
        this.ghostEatX = g.x;
        this.ghostEatY = g.y;

        if (this.ghostsEatenThisPellet >= 4) this.achievements.unlock('ghost-hunter');
      } else if (!g.eaten) {
        // Player caught — death sequence
        this.subState = 'death';
        this.deathTimer = 1.5;
        this.deathAngle = 0;
        this.audio.play('die');
      }
    }
  }

  _checkFinal() {
    if (this.score >= 10000) this.achievements.unlock('pac-master');
    this.achievements.reportScore(this.score);
    AchievementManager.checkCrossGame();
  }

  // ── Render ───────────────────────────────────────────────

  render(ctx) {
    if (this.subState === 'menu') return;

    this._renderMaze(ctx);
    if (this.fruitActive) this._renderFruit(ctx);
    if (this.subState !== 'death') {
      for (const g of this.ghosts) this._renderGhost(ctx, g);
    }
    this._renderPlayer(ctx);
    this._renderPopups(ctx);

    // READY! text overlay
    if (this.subState === 'ready') {
      ctx.save();
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.fillStyle = '#ffff00';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('READY!', W / 2, H / 2 + 20);
      ctx.restore();
    }

    // Ghost eat score display
    if (this.subState === 'ghostEatPause') {
      ctx.save();
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillStyle = '#00ffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.ghostEatScore), this.ghostEatX, this.ghostEatY);
      ctx.restore();
    }

    if (this.score >= 10000) this.achievements.unlock('pac-master');
  }

  // ── Maze rendering ───────────────────────────────────────

  _renderMaze(ctx) {
    ctx.save();
    const flash = this.subState === 'levelClear' && this.levelFlash;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = this.maze[r][c];
        const x = MAZE_X + c * TILE;
        const y = MAZE_Y + r * TILE;

        if (tile === 1) {
          ctx.fillStyle = flash ? '#ffffff' : '#2121de';
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          ctx.fillStyle = flash ? '#cccccc' : '#1010a0';
          ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        } else if (tile === 5) {
          ctx.fillStyle = '#ffb8ff';
          ctx.fillRect(x, y + HALF - 2, TILE, 4);
        } else if (tile === 2) {
          ctx.fillStyle = '#ffb8ae';
          ctx.beginPath();
          ctx.arc(x + HALF, y + HALF, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === 3 && Math.floor(performance.now() / 200) % 2) {
          ctx.fillStyle = '#ffb8ae';
          ctx.beginPath();
          ctx.arc(x + HALF, y + HALF, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // ── Player rendering (chomp + death animation) ───────────

  _renderPlayer(ctx) {
    ctx.save();
    ctx.translate(this.px, this.py);
    ctx.fillStyle = '#ffcc00';

    if (this.subState === 'death') {
      // Death: pac-man mouth opens wider until fully collapsed
      const s = this.deathAngle / 2;
      const e = Math.PI * 2 - this.deathAngle / 2;
      if (e > s) {
        ctx.beginPath();
        ctx.arc(0, 0, HALF - 2, s + Math.PI / 2, e + Math.PI / 2);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // Normal: directional mouth opening
      const da = [0, Math.PI / 2, Math.PI, -Math.PI / 2][this.pdir];
      ctx.beginPath();
      ctx.arc(0, 0, HALF - 2, da + this.mouthAngle, da + Math.PI * 2 - this.mouthAngle);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Ghost rendering ──────────────────────────────────────

  _renderGhost(ctx, g) {
    if (g.mode === 'house' || g.mode === 'leaving') {
      this._drawGhostShape(ctx, g.x, g.y, g.color, g.animFrame);
      return;
    }
    if (g.eaten) {
      // Just floating eyes navigating back to house
      this._drawEyes(ctx, g.x, g.y, g.dir);
      return;
    }
    if (g.frightened) {
      // Blue ghost with flashing warning when fright ending
      const flashing = this.frightTimer < 2 && Math.floor(this.frightTimer * 6) % 2;
      this._drawGhostShape(ctx, g.x, g.y, flashing ? '#ffffff' : '#2121ff', g.animFrame);
      this._drawScaredFace(ctx, g.x, g.y);
      return;
    }
    this._drawGhostShape(ctx, g.x, g.y, g.color, g.animFrame);
    this._drawEyes(ctx, g.x, g.y, g.dir);
  }

  _drawGhostShape(ctx, x, y, color, frame) {
    const r = HALF - 2;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    // Dome top
    ctx.arc(x, y - 2, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r - 2);
    // Wavy skirt bottom — alternates between frames
    const segW = (r * 2) / 3;
    const waveH = frame === 0 ? 3 : -3;
    for (let i = 0; i < 3; i++) {
      const sx = x + r - i * segW;
      const ex = sx - segW;
      ctx.quadraticCurveTo((sx + ex) / 2, y + r - 2 + waveH, ex, y + r - 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawEyes(ctx, x, y, dir) {
    const ox = [-3, 0, 3, 0];
    const oy = [0, 2, 0, -2];
    for (let s = -1; s <= 1; s += 2) {
      // White of eye
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x + s * 4, y - 3, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Blue pupil looking in movement direction
      ctx.fillStyle = '#00f';
      ctx.beginPath();
      ctx.arc(x + s * 4 + ox[dir] * 1.5, y - 3 + oy[dir] * 1.5, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawScaredFace(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#fff';
    // Small square eyes
    ctx.fillRect(x - 5, y - 5, 3, 3);
    ctx.fillRect(x + 3, y - 5, 3, 3);
    // Wavy frown mouth
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 3);
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(x - 6 + i * 4 + 2, y + (i % 2 === 0 ? 5 : 1));
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Fruit rendering (pixel-art style) ────────────────────

  _renderFruit(ctx) {
    const fx = centerX(FRUIT_POS.x);
    const fy = centerY(FRUIT_POS.y);
    const type = FRUIT_NAMES[this.fruitType];

    ctx.save();
    ctx.translate(fx, fy + Math.sin(performance.now() / 200) * 2);

    if (type === 'cherry') {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath(); ctx.arc(-3, 3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#00aa00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.quadraticCurveTo(0, -8, 3, 0);
      ctx.stroke();
    } else if (type === 'strawberry') {
      ctx.fillStyle = '#ff2222';
      ctx.beginPath();
      ctx.moveTo(0, 6); ctx.lineTo(-5, -2); ctx.lineTo(5, -2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#00cc00';
      ctx.fillRect(-4, -5, 8, 3);
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(-2, 0, 1, 1);
      ctx.fillRect(1, 1, 1, 1);
      ctx.fillRect(-1, 3, 1, 1);
    } else {
      // Orange
      ctx.fillStyle = '#ff8800';
      ctx.beginPath(); ctx.arc(0, 1, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#00aa00';
      ctx.fillRect(-1, -6, 2, 3);
    }

    ctx.restore();
  }

  // ── Score popups ─────────────────────────────────────────

  _renderPopups(ctx) {
    ctx.save();
    for (const p of this.popups) {
      ctx.globalAlpha = Math.min(1, p.timer * 2);
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  // ── Game over background ─────────────────────────────────

  renderGameOver(ctx) {
    this._renderMaze(ctx);
  }
}

// ── Bootstrap ────────────────────────────────────────────────

const game = new PacChase();

})();
