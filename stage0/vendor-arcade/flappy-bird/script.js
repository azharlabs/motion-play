// Flappy Bird — Game Logic
(function () {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const bestEl = document.getElementById('best');
    const startBtn = document.getElementById('start-btn');

    const W = canvas.width, H = canvas.height;
    const BIRD_SIZE = 18;
    const PIPE_W = 44;
    const GAP = 130;
    const GRAVITY = 0.35;
    const FLAP = -6;
    const PIPE_SPEED = 2.2;

    let bird, pipes, score, best, running, animId, frameCount;

    best = parseInt(localStorage.getItem('flappy_best')) || 0;
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

    function init() {
        cancelAnimationFrame(animId);
        bird = { x: 60, y: H / 2, vy: 0 };
        pipes = [];
        score = 0; frameCount = 0;
        scoreEl.textContent = 0;
        running = true;
        startBtn.textContent = 'Restart';
        loop();
    }

    function addPipe() {
        const minY = 60;
        const maxY = H - GAP - 60;
        const topH = minY + Math.random() * (maxY - minY);
        pipes.push({ x: W, topH, scored: false });
    }

    function flap() {
        if (!running) return;
        bird.vy = FLAP;
        playTone(500, 0.04);
    }

    function update() {
        frameCount++;
        // Bird physics
        bird.vy += GRAVITY;
        bird.y += bird.vy;

        // Pipe spawning
        if (frameCount % 90 === 0) addPipe();

        // Move pipes
        for (let i = pipes.length - 1; i >= 0; i--) {
            pipes[i].x -= PIPE_SPEED;
            // Score
            if (!pipes[i].scored && pipes[i].x + PIPE_W < bird.x) {
                pipes[i].scored = true;
                score++;
                scoreEl.textContent = score;
                playTone(600, 0.04);
            }
            // Remove off-screen
            if (pipes[i].x + PIPE_W < 0) pipes.splice(i, 1);
        }

        // Collision
        if (bird.y - BIRD_SIZE < 0 || bird.y + BIRD_SIZE > H) {
            gameOver();
            return;
        }

        for (const p of pipes) {
            if (bird.x + BIRD_SIZE > p.x && bird.x - BIRD_SIZE < p.x + PIPE_W) {
                if (bird.y - BIRD_SIZE < p.topH || bird.y + BIRD_SIZE > p.topH + GAP) {
                    gameOver();
                    return;
                }
            }
        }
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);

        // Pipes
        ctx.fillStyle = '#38b2ac';
        for (const p of pipes) {
            // Top pipe
            ctx.fillRect(p.x, 0, PIPE_W, p.topH);
            // Pipe cap top
            ctx.fillStyle = '#2c9a94';
            ctx.fillRect(p.x - 3, p.topH - 16, PIPE_W + 6, 16);
            ctx.fillStyle = '#38b2ac';
            // Bottom pipe
            const botY = p.topH + GAP;
            ctx.fillRect(p.x, botY, PIPE_W, H - botY);
            // Pipe cap bottom
            ctx.fillStyle = '#2c9a94';
            ctx.fillRect(p.x - 3, botY, PIPE_W + 6, 16);
            ctx.fillStyle = '#38b2ac';
        }

        // Bird
        ctx.fillStyle = '#ecc94b';
        ctx.beginPath();
        ctx.arc(bird.x, bird.y, BIRD_SIZE, 0, Math.PI * 2);
        ctx.fill();
        // Eye
        ctx.fillStyle = '#1a1d2e';
        ctx.beginPath();
        ctx.arc(bird.x + 6, bird.y - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(bird.x + 7, bird.y - 5, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Beak
        ctx.fillStyle = '#ed8936';
        ctx.beginPath();
        ctx.moveTo(bird.x + BIRD_SIZE, bird.y);
        ctx.lineTo(bird.x + BIRD_SIZE + 8, bird.y + 3);
        ctx.lineTo(bird.x + BIRD_SIZE, bird.y + 6);
        ctx.fill();

        // Score overlay
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = 'bold 48px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(score, W / 2, 70);
    }

    function gameOver() {
        running = false;
        startBtn.textContent = 'Play Again';
        playTone(200, 0.3);
        if (score > best) {
            best = score;
            bestEl.textContent = best;
            localStorage.setItem('flappy_best', best);
        }
    }

    function loop() {
        if (!running) return;
        update();
        draw();
        animId = requestAnimationFrame(loop);
    }

    canvas.addEventListener('click', flap);
    document.addEventListener('keydown', e => {
        if (e.key === ' ') { e.preventDefault(); flap(); }
    });

    startBtn.addEventListener('click', init);

    // Draw initial idle state
    bird = { x: 60, y: H / 2, vy: 0 };
    pipes = [];
    draw();
})();
