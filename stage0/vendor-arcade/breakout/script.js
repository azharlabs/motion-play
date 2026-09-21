// Breakout — Game Logic
(function () {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const bestEl = document.getElementById('best');
    const startBtn = document.getElementById('start-btn');

    const W = canvas.width, H = canvas.height;
    const PADDLE_W = 80, PADDLE_H = 12;
    const BALL_R = 6;
    const BRICK_ROWS = 5, BRICK_COLS = 8;
    const BRICK_W = (W - 20) / BRICK_COLS - 4;
    const BRICK_H = 16;
    const BRICK_PAD = 4;
    const BRICK_TOP = 40;
    const BRICK_LEFT = (W - (BRICK_COLS * (BRICK_W + BRICK_PAD) - BRICK_PAD)) / 2;
    const COLORS = ['#f56565', '#ecc94b', '#48bb78', '#38b2ac', '#667eea'];

    let paddleX, ballX, ballY, dx, dy, bricks, score, lives, best, running, animId;
    let leftPressed = false, rightPressed = false;

    best = parseInt(localStorage.getItem('breakout_best')) || 0;
    bestEl.textContent = best;

    function playTone(freq, dur) {
        try {
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.connect(g); g.connect(ac.destination);
            o.frequency.value = freq; g.gain.value = 0.08;
            o.start(); o.stop(ac.currentTime + dur);
        } catch (e) {}
    }

    function initBricks() {
        bricks = [];
        for (let r = 0; r < BRICK_ROWS; r++) {
            bricks[r] = [];
            for (let c = 0; c < BRICK_COLS; c++) {
                bricks[r][c] = { x: BRICK_LEFT + c * (BRICK_W + BRICK_PAD), y: BRICK_TOP + r * (BRICK_H + BRICK_PAD), alive: true };
            }
        }
    }

    function resetBall() {
        ballX = W / 2; ballY = H - 40;
        dx = 3 * (Math.random() > 0.5 ? 1 : -1); dy = -3;
        paddleX = (W - PADDLE_W) / 2;
    }

    function init() {
        cancelAnimationFrame(animId);
        score = 0; lives = 3;
        scoreEl.textContent = 0; livesEl.textContent = 3;
        initBricks(); resetBall();
        running = true;
        startBtn.textContent = 'Restart';
        loop();
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        // Bricks
        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                if (!bricks[r][c].alive) continue;
                ctx.fillStyle = COLORS[r];
                ctx.beginPath();
                const bx = bricks[r][c].x, by = bricks[r][c].y;
                ctx.roundRect(bx, by, BRICK_W, BRICK_H, 3);
                ctx.fill();
            }
        }
        // Paddle
        ctx.fillStyle = '#38b2ac';
        ctx.beginPath();
        ctx.roundRect(paddleX, H - 20, PADDLE_W, PADDLE_H, 6);
        ctx.fill();
        // Ball
        ctx.fillStyle = '#e8eaed';
        ctx.beginPath();
        ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
        ctx.fill();
    }

    function update() {
        // Paddle movement
        if (leftPressed && paddleX > 0) paddleX -= 5;
        if (rightPressed && paddleX < W - PADDLE_W) paddleX += 5;

        ballX += dx; ballY += dy;
        // Wall bounce
        if (ballX - BALL_R <= 0 || ballX + BALL_R >= W) dx = -dx;
        if (ballY - BALL_R <= 0) dy = -dy;
        // Paddle bounce
        if (ballY + BALL_R >= H - 20 && ballX >= paddleX && ballX <= paddleX + PADDLE_W) {
            dy = -Math.abs(dy);
            // Angle based on hit position
            const hit = (ballX - paddleX) / PADDLE_W;
            dx = 6 * (hit - 0.5);
            playTone(400, 0.04);
        }
        // Lose life
        if (ballY + BALL_R > H) {
            lives--;
            livesEl.textContent = lives;
            if (lives <= 0) {
                running = false;
                startBtn.textContent = 'Play Again';
                if (score > best) { best = score; bestEl.textContent = best; localStorage.setItem('breakout_best', best); }
                return;
            }
            resetBall();
        }
        // Brick collision
        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                const b = bricks[r][c];
                if (!b.alive) continue;
                if (ballX + BALL_R > b.x && ballX - BALL_R < b.x + BRICK_W &&
                    ballY + BALL_R > b.y && ballY - BALL_R < b.y + BRICK_H) {
                    b.alive = false;
                    dy = -dy;
                    score++;
                    scoreEl.textContent = score;
                    playTone(600, 0.04);
                    // Check win
                    if (bricks.every(row => row.every(br => !br.alive))) {
                        running = false;
                        playTone(800, 0.2);
                        startBtn.textContent = 'Play Again';
                        if (score > best) { best = score; bestEl.textContent = best; localStorage.setItem('breakout_best', best); }
                    }
                    return;
                }
            }
        }
    }

    function loop() {
        if (!running) return;
        update();
        draw();
        animId = requestAnimationFrame(loop);
    }

    // Controls
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') leftPressed = true;
        if (e.key === 'ArrowRight') rightPressed = true;
    });
    document.addEventListener('keyup', e => {
        if (e.key === 'ArrowLeft') leftPressed = false;
        if (e.key === 'ArrowRight') rightPressed = false;
    });
    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = W / rect.width;
        paddleX = (e.clientX - rect.left) * scaleX - PADDLE_W / 2;
        paddleX = Math.max(0, Math.min(W - PADDLE_W, paddleX));
    });

    startBtn.addEventListener('click', init);
    // Draw initial state
    initBricks(); resetBall(); draw();
})();
