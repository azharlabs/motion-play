// Snake — Game Logic
(function () {
    // @section Setup & Constants
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const highScoreEl = document.getElementById('high-score');
    const startBtn = document.getElementById('start-btn');
    const diffBtns = document.querySelectorAll('#difficulty-selector .gb-btn');

    const GRID = 20;
    const TILE = canvas.width / GRID;
    let snake, food, direction, nextDirection, score, highScore, speed, interval, running;

    highScore = parseInt(localStorage.getItem('snake_best') || '0', 10);
    highScoreEl.textContent = 'Best: ' + highScore;
    speed = 150;

    // Difficulty selector
    diffBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            diffBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            speed = parseInt(btn.dataset.speed, 10);
            if (running) { clearInterval(interval); interval = setInterval(gameLoop, speed); }
        });
    });

    // @section Sound Effects
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

    // @section Initialization
    function init() {
        snake = [{ x: 10, y: 10 }];
        direction = { x: 1, y: 0 };
        nextDirection = { x: 1, y: 0 };
        score = 0;
        scoreEl.textContent = 'Score: 0';
        placeFood();
    }

    function placeFood() {
        do {
            food = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
        } while (snake.some(s => s.x === food.x && s.y === food.y));
    }

    // @section Rendering
    function draw() {
        ctx.fillStyle = '#0a0c12';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw grid lines (subtle)
        ctx.strokeStyle = 'rgba(45, 49, 72, 0.3)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= GRID; i++) {
            ctx.beginPath(); ctx.moveTo(i * TILE, 0); ctx.lineTo(i * TILE, canvas.height); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i * TILE); ctx.lineTo(canvas.width, i * TILE); ctx.stroke();
        }

        // Snake
        snake.forEach((seg, i) => {
            ctx.fillStyle = i === 0 ? '#38b2ac' : '#2c9a94';
            ctx.fillRect(seg.x * TILE + 1, seg.y * TILE + 1, TILE - 2, TILE - 2);
        });

        // Food
        ctx.fillStyle = '#f56565';
        ctx.beginPath();
        ctx.arc(food.x * TILE + TILE / 2, food.y * TILE + TILE / 2, TILE / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // @section Game Loop & Movement
    function gameLoop() {
        direction = nextDirection;
        const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

        // Wall collision
        if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) { gameOver(); return; }
        // Self collision
        if (snake.some(s => s.x === head.x && s.y === head.y)) { gameOver(); return; }

        snake.unshift(head);

        if (head.x === food.x && head.y === food.y) {
            score++;
            scoreEl.textContent = 'Score: ' + score;
            playTone(600, 0.1);
            placeFood();
        } else {
            snake.pop();
        }

        draw();
    }

    // @section Game Over
    function gameOver() {
        running = false;
        clearInterval(interval);
        playTone(200, 0.3);
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('snake_best', String(highScore));
            highScoreEl.textContent = 'Best: ' + highScore;
        }
        startBtn.textContent = 'Play Again';
        scoreEl.textContent = 'Game Over! Score: ' + score;
    }

    function start() {
        init();
        running = true;
        startBtn.textContent = 'Restart';
        clearInterval(interval);
        interval = setInterval(gameLoop, speed);
        draw();
    }

    startBtn.addEventListener('click', start);

    document.addEventListener('keydown', e => {
        const keyMap = {
            ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
            ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
            w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
            a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
            W: { x: 0, y: -1 }, S: { x: 0, y: 1 },
            A: { x: -1, y: 0 }, D: { x: 1, y: 0 }
        };
        const dir = keyMap[e.key];
        if (dir && running) {
            // Prevent 180° reversal
            if (dir.x !== -direction.x || dir.y !== -direction.y) {
                nextDirection = dir;
            }
            e.preventDefault();
        }
    });

    // Initial draw
    init();
    draw();
})();
