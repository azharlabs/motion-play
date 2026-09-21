// Whack-a-Mole — Game Logic
(function () {
    const gridEl = document.getElementById('mole-grid');
    const scoreEl = document.getElementById('score');
    const timerEl = document.getElementById('timer');
    const bestEl = document.getElementById('best');
    const startBtn = document.getElementById('start-btn');

    const HOLES = 9;
    const GAME_TIME = 30;
    let score, timeLeft, gameInterval, moleTimeout, running;
    let best = parseInt(localStorage.getItem('wam_best') || '0', 10);
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

    // Build holes
    const holes = [];
    for (let i = 0; i < HOLES; i++) {
        const hole = document.createElement('div');
        hole.className = 'mole-hole';
        hole.addEventListener('click', () => whack(i));
        gridEl.appendChild(hole);
        holes.push(hole);
    }

    function whack(i) {
        if (!running || !holes[i].classList.contains('active')) return;
        holes[i].classList.remove('active');
        holes[i].classList.add('whacked');
        holes[i].textContent = '';
        setTimeout(() => holes[i].classList.remove('whacked'), 300);
        score++;
        scoreEl.textContent = score;
        playTone(700, 0.08);
    }

    function showMole() {
        holes.forEach(h => { h.classList.remove('active'); h.textContent = ''; });
        const idx = Math.floor(Math.random() * HOLES);
        holes[idx].classList.add('active');
        holes[idx].textContent = '🐹';

        // Mole visible time decreases as score increases
        const visibleTime = Math.max(400, 900 - score * 15);
        moleTimeout = setTimeout(() => {
            holes[idx].classList.remove('active');
            holes[idx].textContent = '';
            if (running) showMole();
        }, visibleTime);
    }

    function endGame() {
        running = false;
        clearInterval(gameInterval);
        clearTimeout(moleTimeout);
        holes.forEach(h => { h.classList.remove('active'); h.textContent = ''; });
        if (score > best) {
            best = score;
            localStorage.setItem('wam_best', String(best));
            bestEl.textContent = best;
        }
        playTone(300, 0.2);
        startBtn.textContent = 'Play Again';
    }

    function start() {
        score = 0;
        timeLeft = GAME_TIME;
        scoreEl.textContent = '0';
        timerEl.textContent = timeLeft;
        running = true;
        startBtn.textContent = 'Playing...';

        showMole();
        gameInterval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = timeLeft;
            if (timeLeft <= 0) endGame();
        }, 1000);
    }

    startBtn.addEventListener('click', () => {
        if (!running) start();
    });
})();
