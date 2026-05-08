/* =========================================
   WHACK-A-MOLE — game.js
   Improved game logic: lives, levels, power-ups, mute, keyboard controls
   ========================================= */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOLE_COUNT = 9;
const LEVEL_POINTS = 10;
const POWER_DURATION = 7000;

const DIFFICULTY = {
  easy: {
    gameTime: 35,
    lives: 4,
    minUp: 950,
    maxUp: 1750,
    minDown: 560,
    maxDown: 980,
    bombChance: 0.05,
    goldenChance: 0.11,
    powerChance: 0.07,
    maxExtraMoles: 0,
  },
  medium: {
    gameTime: 35,
    lives: 3,
    minUp: 650,
    maxUp: 1250,
    minDown: 380,
    maxDown: 680,
    bombChance: 0.11,
    goldenChance: 0.13,
    powerChance: 0.07,
    maxExtraMoles: 1,
  },
  hard: {
    gameTime: 40,
    lives: 3,
    minUp: 380,
    maxUp: 780,
    minDown: 240,
    maxDown: 460,
    bombChance: 0.18,
    goldenChance: 0.14,
    powerChance: 0.06,
    maxExtraMoles: 2,
  },
};

const MOLE_TYPES = {
  normal: { points: 1, emoji: '😤', hitClass: 'positive', label: '+1' },
  golden: { points: 3, emoji: '🌟', hitClass: 'golden', label: '+3 ⭐' },
  bomb: { points: 0, emoji: '💣', hitClass: 'negative', label: '-1 ❤️' },
  power: { points: 0, emoji: '⚡', hitClass: 'power', label: '2× ⚡' },
};

const STREAK_BONUS_AT = 5;
const STREAK_BONUS_MULT = 2;
const POWER_MULT = 2;
const COMBO_MESSAGES = ['Combo!', 'Nice!', 'On Fire! 🔥', 'Unstoppable! ⚡', 'Legendary! 💎'];

// ─── State ────────────────────────────────────────────────────────────────────

let score = 0;
let timeLeft = 30;
let streak = 0;
let bestStreak = 0;
let level = 1;
let lives = 3;
let bestScore = parseInt(localStorage.getItem('wam_best') || '0', 10);
let currentDiff = 'easy';
let gameRunning = false;
let muted = localStorage.getItem('wam_muted') === 'true';
let powerActive = false;
let powerEndsAt = 0;

let countdownInterval = null;
let powerInterval = null;
let spawnTimers = [];

// ─── DOM References ───────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const scoreEl = $('score');
const timerEl = $('timer');
const streakEl = $('streak');
const livesEl = $('lives');
const bestEl = $('best-score');
const comboMsg = $('combo-msg');
const gameBoard = $('game-board');
const startBtn = $('start-btn');
const hitEffects = $('hit-effects');
const muteBtn = $('mute-btn');

const startOverlay = $('start-overlay');
const endOverlay = $('end-overlay');
const levelNumEl = $('level-num');
const levelProgressEl = $('level-progress');
const levelXpLabel = $('level-xp-label');
const levelUpFlash = $('levelup-flash');
const levelUpNum = $('levelup-num');
const powerWrap = $('power-up-wrap');
const powerTimerFill = $('power-timer-fill');
const particlesEl = $('particles');

// ─── Audio (Web Audio API) ────────────────────────────────────────────────────

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function getAudioCtx() {
  if (!AudioCtx || muted) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playTone(freq, type = 'sine', duration = 0.12, gain = 0.25, decay = true) {
  if (muted) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.connect(env);
    env.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    env.gain.setValueAtTime(gain, ctx.currentTime);

    if (decay) env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (_) {
    // Audio may be blocked until the first user gesture.
  }
}

function sfxWhack() { playTone(320, 'square', 0.1, 0.3); }
function sfxGolden() { playTone(880, 'sine', 0.2, 0.3); setTimeout(() => playTone(1100, 'sine', 0.15, 0.2), 80); }
function sfxBomb() { playTone(80, 'sawtooth', 0.25, 0.4); }
function sfxMiss() { playTone(200, 'sine', 0.07, 0.15); }
function sfxPower() { [740, 988, 1175].forEach((f, i) => setTimeout(() => playTone(f, 'triangle', 0.14, 0.22), i * 70)); }
function sfxLevel() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.18, 0.18), i * 90)); }
function sfxTick() { playTone(660, 'triangle', 0.05, 0.1); }
function sfxEnd() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.22, 0.2), i * 110)); }

function updateMuteButton() {
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(muted));
  muteBtn.title = muted ? 'Sound is off' : 'Sound is on';
}

// ─── Background Effects ───────────────────────────────────────────────────────

function buildStars() {
  const container = $('stars');
  if (!container || container.childElementCount) return;

  for (let i = 0; i < 120; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
    s.style.cssText = `
      width:${size}px; height:${size}px;
      top:${Math.random() * 100}%;
      left:${Math.random() * 100}%;
      --dur:${(Math.random() * 4 + 2).toFixed(1)}s;
      --delay:-${(Math.random() * 4).toFixed(1)}s;
    `;
    container.appendChild(s);
  }
}

function buildParticles() {
  if (!particlesEl || particlesEl.childElementCount) return;

  for (let i = 0; i < 24; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    p.style.cssText = `
      left:${Math.random() * 100}%;
      --size:${(Math.random() * 6 + 4).toFixed(1)}px;
      --drift:${(Math.random() * 80 - 40).toFixed(1)}px;
      --dur:${(Math.random() * 10 + 9).toFixed(1)}s;
      --delay:-${(Math.random() * 12).toFixed(1)}s;
    `;
    particlesEl.appendChild(p);
  }
}

// ─── Mole SVG Builder ─────────────────────────────────────────────────────────

function moleSVG(type) {
  if (type === 'bomb') {
    return `
      <svg class="mole-svg" viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="50" cy="70" r="34" fill="#1a1a2e" stroke="#374151" stroke-width="3"/>
        <ellipse cx="38" cy="56" rx="8" ry="5" fill="rgba(255,255,255,.15)" transform="rotate(-30 38 56)"/>
        <path d="M50 36 Q62 20 70 10" stroke="#92400e" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <circle cx="70" cy="10" r="4" fill="#fbbf24"/>
        <circle cx="70" cy="10" r="7" fill="rgba(251,191,36,.35)"/>
        <text x="50" y="78" text-anchor="middle" font-size="28" fill="white">💀</text>
      </svg>`;
  }

  if (type === 'power') {
    return `
      <svg class="mole-svg" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <ellipse cx="50" cy="42" rx="40" ry="40" fill="rgba(96,165,250,.18)"/>
        <ellipse cx="50" cy="90" rx="28" ry="21" fill="#075985"/>
        <circle cx="50" cy="52" r="34" fill="#0284c7"/>
        <path d="M57 8 L32 55 H48 L41 101 L70 43 H53 Z" fill="#fde047" stroke="#f59e0b" stroke-width="2"/>
        <circle cx="36" cy="47" r="8" fill="white"/>
        <circle cx="64" cy="47" r="8" fill="white"/>
        <circle cx="38" cy="48" r="5" fill="#0f172a"/>
        <circle cx="66" cy="48" r="5" fill="#0f172a"/>
        <ellipse cx="50" cy="61" rx="6" ry="4" fill="#075985"/>
        <path d="M40 70 Q50 78 60 70" stroke="#075985" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      </svg>`;
  }

  if (type === 'golden') {
    return `
      <svg class="mole-svg" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <ellipse cx="50" cy="38" rx="38" ry="38" fill="rgba(251,191,36,.18)"/>
        <ellipse cx="50" cy="88" rx="28" ry="22" fill="#b45309"/>
        <circle cx="50" cy="48" r="34" fill="#d97706"/>
        <ellipse cx="36" cy="34" rx="10" ry="6" fill="rgba(255,255,255,.25)" transform="rotate(-25 36 34)"/>
        <polygon points="20,28 30,10 40,24 50,6 60,24 70,10 80,28" fill="#fbbf24" stroke="#f59e0b" stroke-width="1.5"/>
        <circle cx="50" cy="8" r="4" fill="#f87171"/>
        <circle cx="30" cy="12" r="3" fill="#34d399"/>
        <circle cx="70" cy="12" r="3" fill="#60a5fa"/>
        <circle cx="38" cy="44" r="8" fill="white"/>
        <circle cx="62" cy="44" r="8" fill="white"/>
        <circle cx="40" cy="45" r="5" fill="#1e3a5f"/>
        <circle cx="64" cy="45" r="5" fill="#1e3a5f"/>
        <circle cx="41" cy="43" r="2" fill="white"/>
        <circle cx="65" cy="43" r="2" fill="white"/>
        <ellipse cx="50" cy="56" rx="6" ry="4" fill="#92400e"/>
        <path d="M38 64 Q50 74 62 64" stroke="#92400e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <line x1="56" y1="56" x2="78" y2="50" stroke="#92400e" stroke-width="1.5" opacity=".6"/>
        <line x1="56" y1="60" x2="78" y2="62" stroke="#92400e" stroke-width="1.5" opacity=".6"/>
        <line x1="44" y1="56" x2="22" y2="50" stroke="#92400e" stroke-width="1.5" opacity=".6"/>
        <line x1="44" y1="60" x2="22" y2="62" stroke="#92400e" stroke-width="1.5" opacity=".6"/>
      </svg>`;
  }

  return `
    <svg class="mole-svg" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="50" cy="90" rx="26" ry="20" fill="#6b3a2a"/>
      <circle cx="50" cy="52" r="34" fill="#8b4513"/>
      <ellipse cx="36" cy="37" rx="10" ry="6" fill="rgba(255,255,255,.18)" transform="rotate(-25 36 37)"/>
      <ellipse cx="20" cy="30" rx="10" ry="13" fill="#8b4513"/>
      <ellipse cx="20" cy="30" rx="6" ry="9" fill="#e07b8a"/>
      <ellipse cx="80" cy="30" rx="10" ry="13" fill="#8b4513"/>
      <ellipse cx="80" cy="30" rx="6" ry="9" fill="#e07b8a"/>
      <circle cx="36" cy="46" r="9" fill="white"/>
      <circle cx="64" cy="46" r="9" fill="white"/>
      <circle cx="38" cy="47" r="5.5" fill="#1e1b4b"/>
      <circle cx="66" cy="47" r="5.5" fill="#1e1b4b"/>
      <circle cx="39" cy="45" r="2" fill="white"/>
      <circle cx="67" cy="45" r="2" fill="white"/>
      <ellipse cx="50" cy="59" rx="7" ry="4.5" fill="#c0392b"/>
      <path d="M40 68 Q50 77 60 68" stroke="#6b3a2a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <rect x="45" y="67" width="5" height="7" rx="1.5" fill="white"/>
      <rect x="51" y="67" width="5" height="7" rx="1.5" fill="white"/>
      <line x1="57" y1="59" x2="80" y2="53" stroke="#6b3a2a" stroke-width="1.5" opacity=".6"/>
      <line x1="57" y1="63" x2="80" y2="65" stroke="#6b3a2a" stroke-width="1.5" opacity=".6"/>
      <line x1="43" y1="59" x2="20" y2="53" stroke="#6b3a2a" stroke-width="1.5" opacity=".6"/>
      <line x1="43" y1="63" x2="20" y2="65" stroke="#6b3a2a" stroke-width="1.5" opacity=".6"/>
    </svg>`;
}

// ─── Board Builder ────────────────────────────────────────────────────────────

const holes = [];

function buildBoard() {
  gameBoard.innerHTML = '';
  holes.length = 0;

  for (let i = 0; i < HOLE_COUNT; i++) {
    const hole = document.createElement('button');
    hole.className = 'hole';
    hole.id = `hole-${i}`;
    hole.type = 'button';
    hole.setAttribute('aria-label', `Hole ${i + 1}. Press ${i + 1} to whack.`);

    const ground = document.createElement('div');
    ground.className = 'hole-ground';

    // The mask clips the mole so it appears to rise from inside the hole,
    // while the front cover creates the visible lip of the hole.
    const moleMask = document.createElement('div');
    moleMask.className = 'hole-mask';

    const moleCont = document.createElement('div');
    moleCont.className = 'mole-container';
    moleCont.innerHTML = moleSVG('normal');

    const cover = document.createElement('div');
    cover.className = 'hole-cover';

    moleMask.appendChild(moleCont);
    hole.appendChild(ground);
    hole.appendChild(moleMask);
    hole.appendChild(cover);
    gameBoard.appendChild(hole);

    const holeData = { el: hole, moleContainer: moleCont, type: 'normal', isUp: false, whacked: false, hideTimer: null };
    holes.push(holeData);

    hole.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onWhack(i, e.clientX, e.clientY);
    });

    hole.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = hole.getBoundingClientRect();
        onWhack(i, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    });
  }
}

// ─── Score / UI helpers ───────────────────────────────────────────────────────

function updateBestScore() {
  bestEl.textContent = bestScore;
}

function animateStat(el) {
  if (!el) return;
  el.classList.remove('pulse-anim');
  void el.offsetWidth;
  el.classList.add('pulse-anim');
  el.addEventListener('animationend', () => el.classList.remove('pulse-anim'), { once: true });
}

function updateLives() {
  livesEl.textContent = lives;
  livesEl.closest('.stat-pill')?.classList.toggle('danger', lives <= 1);
  animateStat(livesEl);
}

function updateLevelUI() {
  const xp = score % LEVEL_POINTS;
  const pct = Math.min(100, (xp / LEVEL_POINTS) * 100);
  levelNumEl.textContent = level;
  levelProgressEl.style.width = `${pct}%`;
  levelXpLabel.textContent = `${xp} / ${LEVEL_POINTS} pts`;
}

function showLevelUp(newLevel) {
  levelUpNum.textContent = newLevel;
  levelUpFlash.classList.remove('hidden');
  levelUpFlash.classList.add('show');
  sfxLevel();

  clearTimeout(showLevelUp._timer);
  showLevelUp._timer = setTimeout(() => {
    levelUpFlash.classList.remove('show');
    levelUpFlash.classList.add('hidden');
  }, 1150);
}

function setScore(val) {
  const previousLevel = level;
  score = Math.max(0, val);
  level = Math.floor(score / LEVEL_POINTS) + 1;

  scoreEl.textContent = score;
  animateStat(scoreEl);
  updateLevelUI();

  if (gameRunning && level > previousLevel) showLevelUp(level);
}

function setStreak(val) {
  streak = Math.max(0, val);
  streakEl.textContent = streak;
  animateStat(streakEl);

  if (streak > 0 && streak % STREAK_BONUS_AT === 0) {
    const idx = Math.min(Math.floor(streak / STREAK_BONUS_AT) - 1, COMBO_MESSAGES.length - 1);
    showCombo(COMBO_MESSAGES[idx]);
  } else if (powerActive) {
    showCombo('2× Power! ⚡');
  } else {
    clearCombo();
  }
}

function showCombo(msg) {
  comboMsg.textContent = msg;
  comboMsg.style.opacity = '1';
}

function clearCombo() {
  comboMsg.style.opacity = '0';
  setTimeout(() => {
    if (comboMsg.style.opacity === '0') comboMsg.textContent = '';
  }, 300);
}

function spawnHitText(label, x, y, cls) {
  const div = document.createElement('div');
  div.className = `hit-text ${cls}`;
  div.textContent = label;
  div.style.left = `${x - 20}px`;
  div.style.top = `${y - 30}px`;
  hitEffects.appendChild(div);
  div.addEventListener('animationend', () => div.remove());
}

function shakeScreen() {
  document.body.classList.remove('screen-shake');
  void document.body.offsetWidth;
  document.body.classList.add('screen-shake');
  document.body.addEventListener('animationend', () => document.body.classList.remove('screen-shake'), { once: true });
}

// ─── Power-up ─────────────────────────────────────────────────────────────────

function updatePowerUI() {
  if (!powerActive) return;

  const remaining = Math.max(0, powerEndsAt - Date.now());
  const pct = Math.max(0, Math.min(100, (remaining / POWER_DURATION) * 100));
  powerTimerFill.style.width = `${pct}%`;

  if (remaining <= 0) deactivatePower();
}

function activatePower() {
  powerActive = true;
  powerEndsAt = Date.now() + POWER_DURATION;
  powerWrap.style.visibility = 'visible';
  powerWrap.classList.add('active');
  showCombo('2× Power! ⚡');
  sfxPower();

  clearInterval(powerInterval);
  updatePowerUI();
  powerInterval = setInterval(updatePowerUI, 80);
}

function deactivatePower() {
  powerActive = false;
  clearInterval(powerInterval);
  powerInterval = null;
  powerWrap.classList.remove('active');
  powerTimerFill.style.width = '0%';
  powerWrap.style.visibility = 'hidden';
  if (gameRunning) clearCombo();
}

// ─── Mole Logic ───────────────────────────────────────────────────────────────

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function levelSpeed(value, floor) {
  const factor = Math.max(0.58, 1 - (level - 1) * 0.055);
  return Math.max(floor, Math.round(value * factor));
}

function pickMoleType() {
  const cfg = DIFFICULTY[currentDiff];
  const r = Math.random();

  if (r < cfg.bombChance) return 'bomb';
  if (r < cfg.bombChance + cfg.powerChance) return 'power';
  if (r < cfg.bombChance + cfg.powerChance + cfg.goldenChance) return 'golden';
  return 'normal';
}

function popMole(idx) {
  if (!gameRunning) return;
  const hole = holes[idx];
  if (!hole || hole.isUp) return;

  const type = pickMoleType();
  hole.type = type;
  hole.isUp = true;
  hole.whacked = false;

  clearTimeout(hole.hideTimer);
  hole.moleContainer.innerHTML = moleSVG(type);

  hole.el.classList.remove('up', 'golden', 'bomb', 'power', 'whacked');
  hole.el.classList.add('up');
  if (type === 'golden') hole.el.classList.add('golden');
  if (type === 'bomb') hole.el.classList.add('bomb');
  if (type === 'power') hole.el.classList.add('power');

  const cfg = DIFFICULTY[currentDiff];
  const upTime = randomBetween(levelSpeed(cfg.minUp, 260), levelSpeed(cfg.maxUp, 520));

  hole.hideTimer = setTimeout(() => {
    if (hole.isUp && !hole.whacked) hideMole(idx);
  }, upTime);
}

function hideMole(idx) {
  const hole = holes[idx];
  if (!hole) return;

  clearTimeout(hole.hideTimer);
  hole.hideTimer = null;
  hole.isUp = false;
  hole.whacked = false;
  hole.el.classList.remove('up', 'golden', 'bomb', 'power', 'whacked');
}

function getAvailableHoleIndexes(exclude = []) {
  const excluded = new Set(exclude);
  return holes
    .map((h, i) => (h.isUp || excluded.has(i)) ? null : i)
    .filter(i => i !== null);
}

function scheduleTimer(fn, delay) {
  const id = setTimeout(fn, delay);
  spawnTimers.push(id);
  return id;
}

function scheduleNextMole() {
  if (!gameRunning) return;

  const available = getAvailableHoleIndexes();
  if (!available.length) {
    scheduleTimer(scheduleNextMole, 180);
    return;
  }

  const cfg = DIFFICULTY[currentDiff];
  const idx = available[Math.floor(Math.random() * available.length)];
  popMole(idx);

  const extraChance = Math.min(0.15 + (level - 1) * 0.05, currentDiff === 'easy' ? 0.28 : 0.55);
  const maxExtra = Math.min(cfg.maxExtraMoles + Math.floor(level / 4), 2);

  for (let e = 0; e < maxExtra; e++) {
    if (Math.random() < extraChance) {
      const open = getAvailableHoleIndexes([idx]);
      if (open.length) {
        const idx2 = open[Math.floor(Math.random() * open.length)];
        scheduleTimer(() => popMole(idx2), 120 + e * 130);
      }
    }
  }

  const delay = randomBetween(levelSpeed(cfg.minDown, 170), levelSpeed(cfg.maxDown, 310));
  scheduleTimer(scheduleNextMole, delay);
}

// ─── Whack Handler ────────────────────────────────────────────────────────────

function onWhack(idx, clientX, clientY) {
  if (!gameRunning) return;
  const hole = holes[idx];
  if (!hole) return;

  if (!hole.isUp) {
    spawnHitText('miss', clientX, clientY, 'miss');
    sfxMiss();
    return;
  }

  const info = MOLE_TYPES[hole.type];

  if (hole.type === 'bomb') {
    lives = Math.max(0, lives - 1);
    updateLives();
    setStreak(0);
    sfxBomb();
    shakeScreen();
    spawnHitText(info.label, clientX, clientY, info.hitClass);
  } else if (hole.type === 'power') {
    activatePower();
    spawnHitText(info.label, clientX, clientY, info.hitClass);
  } else {
    let pts = info.points;
    let multiplier = 1;

    if (streak >= STREAK_BONUS_AT - 1) multiplier *= STREAK_BONUS_MULT;
    if (powerActive) multiplier *= POWER_MULT;

    pts *= multiplier;
    setScore(score + pts);
    setStreak(streak + 1);
    bestStreak = Math.max(bestStreak, streak);

    if (hole.type === 'golden') sfxGolden(); else sfxWhack();

    const label = multiplier > 1 ? `${info.label} ×${multiplier}!` : info.label;
    spawnHitText(label, clientX, clientY, info.hitClass);
  }

  hole.whacked = true;
  hole.el.classList.add('whacked');
  setTimeout(() => hideMole(idx), 210);

  if (lives <= 0) {
    setTimeout(() => endGame('lives'), 230);
  }
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function startCountdown() {
  clearInterval(countdownInterval);
  timeLeft = DIFFICULTY[currentDiff].gameTime;
  timerEl.textContent = timeLeft;
  timerEl.classList.remove('timer-low');

  countdownInterval = setInterval(() => {
    timeLeft -= 1;
    timerEl.textContent = timeLeft;

    if (timeLeft <= 5 && timeLeft > 0) {
      timerEl.classList.add('timer-low');
      sfxTick();
    }

    if (timeLeft <= 0) endGame('time');
  }, 1000);
}

// ─── Game Flow ────────────────────────────────────────────────────────────────

function clearGameTimers() {
  clearInterval(countdownInterval);
  countdownInterval = null;

  spawnTimers.forEach(clearTimeout);
  spawnTimers.length = 0;

  holes.forEach((_, i) => hideMole(i));
  deactivatePower();
}

function resetGameState() {
  const cfg = DIFFICULTY[currentDiff];
  score = 0;
  streak = 0;
  bestStreak = 0;
  level = 1;
  lives = cfg.lives;
  timeLeft = cfg.gameTime;

  scoreEl.textContent = '0';
  streakEl.textContent = '0';
  timerEl.textContent = String(timeLeft);
  timerEl.classList.remove('timer-low');
  updateLives();
  updateLevelUI();
  clearCombo();
}

function startGame() {
  clearGameTimers();
  gameRunning = true;
  startOverlay.classList.add('hidden');
  endOverlay.classList.add('hidden');
  startBtn.disabled = true;

  resetGameState();
  startCountdown();
  scheduleTimer(scheduleNextMole, 350);
}

function endGame(reason = 'time') {
  if (!gameRunning) return;

  gameRunning = false;
  clearGameTimers();
  startBtn.disabled = false;
  sfxEnd();

  const isNewRecord = score > bestScore;
  if (isNewRecord) {
    bestScore = score;
    localStorage.setItem('wam_best', bestScore);
    updateBestScore();
  }

  $('final-score').textContent = score;
  $('final-best').textContent = bestScore;
  $('final-streak').textContent = bestStreak;
  $('final-level').textContent = level;

  const badge = $('new-record-badge');
  badge.classList.toggle('hidden', !isNewRecord);

  const titleEl = $('end-title');
  const emojiEl = $('end-emoji');

  if (reason === 'lives') {
    titleEl.textContent = 'Out of Lives!';
    emojiEl.textContent = '💥';
  } else if (score >= 35) {
    titleEl.textContent = "You're a Legend!";
    emojiEl.textContent = '🏆';
  } else if (score >= 20) {
    titleEl.textContent = 'Excellent Reflexes!';
    emojiEl.textContent = '🎉';
  } else if (score >= 10) {
    titleEl.textContent = 'Great Job!';
    emojiEl.textContent = '😄';
  } else {
    titleEl.textContent = 'Keep Practicing!';
    emojiEl.textContent = '😅';
  }

  endOverlay.classList.remove('hidden');
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (gameRunning) return;
    currentDiff = btn.dataset.level;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const cfg = DIFFICULTY[currentDiff];
    timerEl.textContent = cfg.gameTime;
    lives = cfg.lives;
    updateLives();
  });
});

startBtn.addEventListener('click', () => {
  if (!gameRunning) startGame();
});

$('overlay-start-btn').addEventListener('click', () => {
  if (!gameRunning) startGame();
});

$('play-again-btn').addEventListener('click', () => {
  if (!gameRunning) startGame();
});

$('change-diff-btn').addEventListener('click', () => {
  endOverlay.classList.add('hidden');
});

muteBtn.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('wam_muted', String(muted));
  updateMuteButton();
});

document.addEventListener('keydown', (e) => {
  if (!gameRunning) return;

  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= HOLE_COUNT) {
    const hole = holes[n - 1];
    const rect = hole.el.getBoundingClientRect();
    onWhack(n - 1, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
});

window.addEventListener('blur', () => {
  // Prevent runaway timers when the tab loses focus at the end of a round.
  if (!gameRunning) clearGameTimers();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  buildStars();
  buildParticles();
  buildBoard();
  updateBestScore();
  updateMuteButton();

  lives = DIFFICULTY[currentDiff].lives;
  timeLeft = DIFFICULTY[currentDiff].gameTime;
  timerEl.textContent = String(timeLeft);
  updateLives();
  updateLevelUI();

  setTimeout(() => startOverlay.classList.remove('hidden'), 200);
})();
