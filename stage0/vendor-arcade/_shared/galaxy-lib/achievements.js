(function () { /* de-moduled */
'use strict';
// Achievement system for Galaxy Arcade
// ES Module — default export: AchievementManager

const STORAGE_PREFIX = 'galaxy-arcade-achievements-';
const GLOBAL_KEY = 'galaxy-arcade-global';

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
function saveJSON(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

// ── Toast notification system ───────────────────────────────────────────────

let toastQueue = [];
let toastActive = false;

function injectStyles() {
  if (document.getElementById('galaxy-achievement-styles')) return;
  const style = document.createElement('style');
  style.id = 'galaxy-achievement-styles';
  style.textContent = `
    .galaxy-achievement-toast {
      position: fixed; top: 20px; right: 20px; z-index: 99999;
      display: flex; align-items: center; gap: 12px;
      padding: 14px 20px; min-width: 280px; max-width: 380px;
      background: rgba(10, 10, 30, 0.92); border: 1px solid rgba(0, 255, 255, 0.4);
      border-radius: 8px; color: #e0e0ff; font-family: 'Segoe UI', Arial, sans-serif;
      box-shadow: 0 0 18px rgba(0, 255, 255, 0.25), inset 0 0 12px rgba(0, 255, 255, 0.05);
      transform: translateX(120%); transition: transform 0.4s ease, opacity 0.4s ease;
      opacity: 0;
    }
    .galaxy-achievement-toast.visible { transform: translateX(0); opacity: 1; }
    .galaxy-achievement-toast.fade-out { transform: translateX(120%); opacity: 0; }
    .galaxy-achievement-toast .toast-icon { font-size: 28px; flex-shrink: 0; }
    .galaxy-achievement-toast .toast-body { display: flex; flex-direction: column; gap: 2px; }
    .galaxy-achievement-toast .toast-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px;
      color: rgba(0, 255, 255, 0.7);
    }
    .galaxy-achievement-toast .toast-name { font-size: 15px; font-weight: 600; color: #fff; }
    .galaxy-achievement-toast .toast-desc { font-size: 12px; color: #aab; }
  `;
  document.head.appendChild(style);
}

function showToast(achievement) {
  injectStyles();
  toastQueue.push(achievement);
  if (!toastActive) processQueue();
}

function processQueue() {
  if (toastQueue.length === 0) { toastActive = false; return; }
  toastActive = true;
  const ach = toastQueue.shift();

  const el = document.createElement('div');
  el.className = 'galaxy-achievement-toast';
  el.innerHTML = `
    <span class="toast-icon">${ach.icon || '\u2B50'}</span>
    <div class="toast-body">
      <span class="toast-label">Achievement Unlocked</span>
      <span class="toast-name">${ach.name}</span>
      <span class="toast-desc">${ach.description}</span>
    </div>`;
  document.body.appendChild(el);

  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));

  setTimeout(() => {
    el.classList.add('fade-out');
    el.addEventListener('transitionend', () => { el.remove(); processQueue(); }, { once: true });
  }, 3000);
}

// ── Cross-game achievement definitions ──────────────────────────────────────

const CROSS_GAME_DEFS = [
  { id: 'arcade-regular', name: 'Arcade Regular', description: 'Play 5 different games', icon: '\uD83C\uDFAE', check: g => g.gamesPlayed.length >= 5 },
  { id: 'arcade-master', name: 'Arcade Master', description: 'Score 5000+ in 5 different games', icon: '\uD83C\uDFC6', check: () => AchievementManager.getGamesWithMinScore(5000) >= 5 },
  { id: 'completionist', name: 'Completionist', description: 'Unlock all achievements in any single game', icon: '\uD83D\uDCAF',
    check: () => {
      const all = AchievementManager.getAllGames();
      return Object.values(all).some(g => g.total > 0 && g.unlocked === g.total);
    }},
  { id: 'galaxy-champion', name: 'Galaxy Champion', description: 'Unlock all achievements across all games', icon: '\uD83D\uDE80',
    check: () => {
      const p = AchievementManager.getGlobalProgress();
      return p.total > 0 && p.unlocked === p.total;
    }},
];

// ── AchievementManager class ────────────────────────────────────────────────

class AchievementManager {
  #gameId;
  #definitions = [];
  #storageKey;

  constructor(gameId) {
    this.#gameId = gameId;
    this.#storageKey = STORAGE_PREFIX + gameId;
    this.#trackGamePlayed();
  }

  // ── Instance methods ────────────────────────────────────────────────────

  define(achievements) {
    this.#definitions = achievements.map(a => ({ ...a, game: this.#gameId }));
  }

  unlock(id) {
    if (this.isUnlocked(id)) return false;
    const data = this.#load();
    data.unlockedIds.push(id);
    this.#save(data);
    const def = this.#definitions.find(a => a.id === id);
    if (def) showToast(def);
    return true;
  }

  isUnlocked(id) {
    return this.#load().unlockedIds.includes(id);
  }

  getAll() {
    const unlocked = new Set(this.#load().unlockedIds);
    return this.#definitions.map(a => ({ ...a, unlocked: unlocked.has(a.id) }));
  }

  getUnlocked() {
    return this.getAll().filter(a => a.unlocked);
  }

  getProgress() {
    const unlocked = this.getUnlocked().length;
    const total = this.#definitions.length;
    return { unlocked, total, percent: total ? Math.round((unlocked / total) * 100) : 0 };
  }

  // ── Score helpers ───────────────────────────────────────────────────────

  reportScore(score) {
    const data = this.#load();
    if (score > (data.scores.highest || 0)) {
      data.scores.highest = score;
      this.#save(data);
    }
  }

  getHighScore() {
    return this.#load().scores.highest || 0;
  }

  // ── Static methods ──────────────────────────────────────────────────────

  static getAllGames() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith(STORAGE_PREFIX)) continue;
      const gameId = key.slice(STORAGE_PREFIX.length);
      const data = loadJSON(key, { unlockedIds: [], scores: {} });
      result[gameId] = {
        unlocked: data.unlockedIds.length,
        total: data.unlockedIds.length, // best-effort; true total requires define()
        highScore: data.scores.highest || 0,
        unlockedIds: data.unlockedIds,
      };
    }
    return result;
  }

  static getGlobalProgress() {
    const games = AchievementManager.getAllGames();
    let unlocked = 0, total = 0;
    for (const g of Object.values(games)) { unlocked += g.unlocked; total += g.total; }
    return { unlocked, total, percent: total ? Math.round((unlocked / total) * 100) : 0 };
  }

  static checkCrossGame() {
    const global = loadJSON(GLOBAL_KEY, { gamesPlayed: [], crossGameUnlocked: [] });
    const already = new Set(global.crossGameUnlocked);
    for (const def of CROSS_GAME_DEFS) {
      if (already.has(def.id)) continue;
      if (def.check(global)) {
        global.crossGameUnlocked.push(def.id);
        showToast(def);
      }
    }
    saveJSON(GLOBAL_KEY, global);
  }

  static getGamesWithMinScore(minScore) {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith(STORAGE_PREFIX)) continue;
      const data = loadJSON(key, { unlockedIds: [], scores: {} });
      if ((data.scores.highest || 0) >= minScore) count++;
    }
    return count;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  #load() {
    return loadJSON(this.#storageKey, { unlockedIds: [], scores: {} });
  }

  #save(data) {
    saveJSON(this.#storageKey, data);
  }

  #trackGamePlayed() {
    const global = loadJSON(GLOBAL_KEY, { gamesPlayed: [], crossGameUnlocked: [] });
    if (!global.gamesPlayed.includes(this.#gameId)) {
      global.gamesPlayed.push(this.#gameId);
      saveJSON(GLOBAL_KEY, global);
    }
  }
}

Object.assign(window, { AchievementManager });
})();
