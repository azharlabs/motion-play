(function () { /* de-moduled */
'use strict';
/** Base GameEngine — game loop, state machine, scaling, HUD, lifecycle hooks. */





const STATES = ['init', 'menu', 'playing', 'paused', 'gameover', 'transition'];
const FPS_SAMPLES = 60;
const LS_PREFIX = 'galaxy_arcade_';

class GameEngine {
  constructor(canvasId, options = {}) {
    const { width = 800, height = 600, background = '#000', showFPS = false, maxDT = 1 / 30 } = options;

    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) throw new Error(`Canvas "${canvasId}" not found`);
    this.ctx = this.canvas.getContext('2d');

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.background = background;
    this.showFPS = showFPS;
    this._maxDT = maxDT;

    this.input = new InputManager();
    this.audio = new AudioManager();
    this.particles = new ParticleSystem();
    this.effects = new ScreenEffects(this.canvas);

    this._state = 'init';
    this._prevState = null;
    this.score = 0;
    this.highScore = this._loadHighScore();
    this.lives = 3;
    this.level = 1;

    this._rafId = null;
    this._lastTime = 0;
    this._running = false;
    this._fpsSamples = new Float32Array(FPS_SAMPLES);
    this._fpsSampleIdx = 0;
    this._fps = 0;
    this._pauseSel = 0;
    this._pauseOpts = ['Resume', 'Restart', 'Quit'];
    this._scaleX = 1;
    this._scaleY = 1;
    this._offsetX = 0;
    this._offsetY = 0;

    this._boundResize = this.resize.bind(this);
    this._boundVis = this._onVisibilityChange.bind(this);
    this._boundLoop = this._loop.bind(this);
    window.addEventListener('resize', this._boundResize);
    document.addEventListener('visibilitychange', this._boundVis);

    this.resize();
    this.init();
  }

  // ── Lifecycle Hooks (override in subclass) ──────────────────
  init() {}                    // called once after construction
  update(dt) {}                // game logic (playing state)
  render(ctx) {}               // draw game objects (playing state)
  onEnterState(state) {}       // state transition in
  onExitState(state) {}        // state transition out
  updateMenu(dt) {}            // optional menu logic
  renderMenu(ctx) {}           // optional menu drawing
  renderGameOver(ctx) {}       // optional game-over drawing

  // ── State Machine ───────────────────────────────────────────
  get state() { return this._state; }

  setState(newState) {
    if (!STATES.includes(newState) || newState === this._state) return;
    this._prevState = this._state;
    this.onExitState(this._state);
    this._state = newState;
    this.onEnterState(newState);
  }

  // ── Game Loop ───────────────────────────────────────────────
  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this.setState('menu');
    this._rafId = requestAnimationFrame(this._boundLoop);
  }

  stop() {
    this._running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  _loop(now) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._boundLoop);

    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    if (dt > this._maxDT) dt = this._maxDT;
    if (dt <= 0) return;

    // FPS
    this._fpsSamples[this._fpsSampleIdx] = dt;
    this._fpsSampleIdx = (this._fpsSampleIdx + 1) % FPS_SAMPLES;
    let sum = 0;
    for (let i = 0; i < FPS_SAMPLES; i++) sum += this._fpsSamples[i];
    this._fps = FPS_SAMPLES / sum;

    const timeScale = this.effects.getTimeScale();
    const sdt = dt * timeScale;
    this.effects.update(dt);
    const frozen = this.effects.isFrozen();

    this._handleInput();

    const ctx = this.ctx;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);

    switch (this._state) {
      case 'menu':
        if (!frozen) this.updateMenu(sdt);
        this._renderDefaultMenu(ctx);
        break;
      case 'playing':
        if (!frozen) { this.update(sdt); this.particles.update(sdt); }
        this.render(ctx);
        this.particles.draw(ctx);
        this.drawHUD(ctx);
        break;
      case 'paused':
        this.render(ctx);
        this.particles.draw(ctx);
        this.drawHUD(ctx);
        this._renderPauseOverlay(ctx);
        break;
      case 'gameover':
        this.render(ctx);
        this.particles.draw(ctx);
        this.drawHUD(ctx);
        this._renderDefaultGameOver(ctx);
        break;
      case 'transition':
        this.update(sdt);
        this.render(ctx);
        break;
    }

    this.effects.apply(ctx);
    this.effects.restoreShake(ctx);

    if (this.showFPS) {
      ctx.save();
      ctx.fillStyle = '#0f0';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`FPS: ${Math.round(this._fps)}`, 4, this.height - 6);
      ctx.restore();
    }

    this.input.update();
  }

  // ── Input Handling ──────────────────────────────────────────
  _handleInput() {
    if (this.input.isPressed('PAUSE')) {
      if (this._state === 'playing') {
        this.setState('paused');
        this.audio.pauseMusic();
        return;
      }
      if (this._state === 'paused') { this._resumeFromPause(); return; }
    }

    if (this._state === 'menu' || this._state === 'gameover') {
      if (this.input.isPressed('START') || this.input.isPressed('ACTION1')) {
        this._startGame();
      }
    }

    if (this._state === 'paused') {
      if (this.input.isPressed('UP')) {
        this._pauseSel = (this._pauseSel - 1 + this._pauseOpts.length) % this._pauseOpts.length;
        this.audio.play('select');
      }
      if (this.input.isPressed('DOWN')) {
        this._pauseSel = (this._pauseSel + 1) % this._pauseOpts.length;
        this.audio.play('select');
      }
      if (this.input.isPressed('START') || this.input.isPressed('ACTION1')) {
        this._selectPauseOption();
      }
    }
  }

  _startGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.particles.clear();
    this.audio.play('start');
    this.setState('playing');
  }

  _resumeFromPause() {
    this.audio.resumeMusic();
    this.setState('playing');
  }

  _selectPauseOption() {
    switch (this._pauseSel) {
      case 0: this._resumeFromPause(); break;
      case 1: this._startGame(); break;
      case 2: this.setState('menu'); this.audio.stopMusic(); break;
    }
    this._pauseSel = 0;
  }

  // ── Score & Game Over ───────────────────────────────────────
  /** Add points. Optionally spawn floating text at (x, y). */
  addScore(points, x, y) {
    this.score += points;
    if (x !== undefined && y !== undefined) {
      this.particles.emitCustom(x, y, {
        preset: 'floatingText',
        text: `+${points}`,
        color: '#ffcc00',
      });
    }
  }

  /** Transition to game over, save high score. */
  gameOver() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this._saveHighScore();
    }
    this.audio.stopMusic();
    this.audio.play('die');
    this.setState('gameover');
  }

  _getStorageKey() {
    return LS_PREFIX + location.pathname.replace(/[^a-z0-9]/gi, '_');
  }

  _loadHighScore() {
    try { return parseInt(localStorage.getItem(this._getStorageKey()), 10) || 0; }
    catch { return 0; }
  }

  _saveHighScore() {
    try { localStorage.setItem(this._getStorageKey(), String(this.highScore)); }
    catch { /* storage unavailable */ }
  }

  // ── HUD ─────────────────────────────────────────────────────
  drawHUD(ctx) {
    ctx.save();
    ctx.fillStyle = '#0ff';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.textBaseline = 'top';

    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${String(this.score).padStart(8, '0')}`, 10, 8);

    ctx.textAlign = 'center';
    ctx.fillText(`HI ${String(this.highScore).padStart(8, '0')}`, this.width / 2, 8);

    ctx.textAlign = 'right';
    ctx.fillText(`LV ${this.level}  ` + '\u2764'.repeat(Math.max(0, this.lives)), this.width - 10, 8);
    ctx.restore();
  }

  // ── Default UI Screens ──────────────────────────────────────
  _renderDefaultMenu(ctx) {
    this.renderMenu(ctx);
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PRESS START', this.width / 2, this.height * 0.65);
      ctx.restore();
    }
  }

  _renderPauseOverlay(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAUSED', this.width / 2, this.height * 0.3);

    ctx.font = '22px "Courier New", monospace';
    for (let i = 0; i < this._pauseOpts.length; i++) {
      const y = this.height * 0.45 + i * 40;
      const sel = i === this._pauseSel;
      ctx.fillStyle = sel ? '#0ff' : '#888';
      ctx.fillText((sel ? '> ' : '  ') + this._pauseOpts[i], this.width / 2, y);
    }
    ctx.restore();
  }

  _renderDefaultGameOver(ctx) {
    this.renderGameOver(ctx);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#f44';
    ctx.font = 'bold 42px "Courier New", monospace';
    ctx.fillText('GAME OVER', this.width / 2, this.height * 0.3);

    ctx.fillStyle = '#fff';
    ctx.font = '24px "Courier New", monospace';
    ctx.fillText(`SCORE: ${this.score}`, this.width / 2, this.height * 0.45);

    ctx.fillStyle = '#0ff';
    ctx.fillText(`HIGH SCORE: ${this.highScore}`, this.width / 2, this.height * 0.53);

    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.fillText('PRESS START TO PLAY AGAIN', this.width / 2, this.height * 0.7);
    }
    ctx.restore();
  }

  // ── Canvas Scaling ──────────────────────────────────────────
  resize() {
    const parent = this.canvas.parentElement || document.body;
    const rect = parent.getBoundingClientRect();
    const scale = Math.min(rect.width / this.width, rect.height / this.height);
    const dw = Math.floor(this.width * scale);
    const dh = Math.floor(this.height * scale);

    this.canvas.style.width = dw + 'px';
    this.canvas.style.height = dh + 'px';
    this.canvas.style.display = 'block';
    this.canvas.style.margin = 'auto';

    this._scaleX = this.width / dw;
    this._scaleY = this.height / dh;
    const cr = this.canvas.getBoundingClientRect();
    this._offsetX = cr.left;
    this._offsetY = cr.top;
  }

  /** Convert screen (client) coordinates to game (logical) coordinates. */
  toGameCoords(clientX, clientY) {
    return {
      x: (clientX - this._offsetX) * this._scaleX,
      y: (clientY - this._offsetY) * this._scaleY,
    };
  }

  // ── Visibility ──────────────────────────────────────────────
  _onVisibilityChange() {
    if (document.hidden) {
      if (this._state === 'playing') {
        this.setState('paused');
        this.audio.pauseMusic();
      }
    } else {
      this._lastTime = performance.now();
    }
  }

  // ── Navigation ──────────────────────────────────────────────
  /** Navigate back to the main arcade page. */
  backToArcade() {
    const base = document.querySelector('base');
    window.location.href = (base ? base.href : '/') + 'index.html';
  }

  // ── Cleanup ─────────────────────────────────────────────────
  destroy() {
    this.stop();
    this.input.destroy();
    window.removeEventListener('resize', this._boundResize);
    document.removeEventListener('visibilitychange', this._boundVis);
  }
}

Object.assign(window, { GameEngine });
})();
