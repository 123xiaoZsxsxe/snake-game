(() => {
  "use strict";

  const GRID_SIZE = 24;
  const BOARD_PADDING = 12;
  const BASE_STEP_MS = 145;
  const MIN_STEP_MS = 62;
  const SCORE_PER_FOOD = 10;
  const STORAGE_BEST = "neon-snake-best";
  const STORAGE_MUTED = "neon-snake-muted";
  const STORAGE_MODE = "neon-snake-mode";

  const OBSTACLE_COUNT = 18;
  const SPECIAL_INTERVAL_EVERY = 5;
  const SPECIAL_DURATION_SECONDS = 6;
  const SLOW_DURATION_SECONDS = 6;
  const SLOW_STEP_ADD = 55;
  const BONUS_POINTS = 30;
  const SHRINK_AMOUNT = 3;

  const SPECIAL_COLORS = {
    bonus: { main: "#ffd36b", glow: "rgba(255, 211, 107, 0.9)", name: "黄金核心" },
    slow: { main: "#60e8ff", glow: "rgba(96, 232, 255, 0.9)", name: "寒冰核心" },
    shrink: { main: "#c4b5fd", glow: "rgba(196, 181, 253, 0.9)", name: "虚空核心" }
  };

  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  const KEY_DIRECTIONS = {
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right"
  };

  const canvas = document.getElementById("gameCanvas");
  const context = canvas.getContext("2d");

  const elements = {
    score: document.getElementById("scoreValue"),
    best: document.getElementById("bestValue"),
    speed: document.getElementById("speedValue"),
    overlay: document.getElementById("gameOverlay"),
    overlayContent: document.querySelector(".overlay-content"),
    overlayKicker: document.getElementById("overlayKicker"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayStats: document.getElementById("overlayStats"),
    finalScore: document.getElementById("finalScoreValue"),
    finalBest: document.getElementById("finalBestValue"),
    primaryButton: document.getElementById("primaryBtn"),
    pauseButton: document.getElementById("pauseBtn"),
    soundButton: document.getElementById("soundBtn"),
    statusDot: document.getElementById("statusDot"),
    statusText: document.getElementById("statusText"),
    toast: document.getElementById("toast"),
    directionButtons: Array.from(document.querySelectorAll("[data-direction]")),
    modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
    tips: Array.from(document.querySelectorAll(".tip-item p"))
  };

  const storage = {
    get(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch (error) {
        // The game remains playable when storage is blocked.
      }
    }
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatScore(value) {
    return String(value).padStart(3, "0");
  }

  function setTipContent(paragraph, title, body) {
    paragraph.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = title;
    paragraph.appendChild(strong);
    paragraph.appendChild(document.createTextNode(body));
  }

  function pathRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  class AudioEngine {
    constructor() {
      this.enabled = storage.get(STORAGE_MUTED, "false") !== "true";
      this.audioContext = null;
    }

    unlock() {
      if (!this.enabled) {
        return;
      }

      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          return;
        }

        if (!this.audioContext) {
          this.audioContext = new AudioContextClass();
        }

        if (this.audioContext.state === "suspended") {
          this.audioContext.resume().catch(() => {});
        }
      } catch (error) {
        this.audioContext = null;
      }
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      storage.set(STORAGE_MUTED, String(!enabled));
      if (enabled) {
        this.unlock();
      }
    }

    tone(frequency, duration, options = {}) {
      if (!this.enabled) {
        return;
      }

      this.unlock();
      if (!this.audioContext) {
        return;
      }

      try {
        const now = this.audioContext.currentTime + (options.delay || 0);
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const volume = options.volume || 0.035;

        oscillator.type = options.type || "sine";
        oscillator.frequency.setValueAtTime(frequency, now);
        if (options.endFrequency) {
          oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, now + duration);
        }

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.025);
      } catch (error) {
        // Audio is enhancement only; gameplay must never depend on it.
      }
    }

    play(name) {
      if (!this.enabled) {
        return;
      }

      if (name === "eat") {
        this.tone(520, 0.075, { type: "triangle", volume: 0.04 });
        this.tone(780, 0.09, { type: "triangle", volume: 0.028, delay: 0.055 });
      } else if (name === "start") {
        this.tone(280, 0.12, { type: "sine", volume: 0.025, endFrequency: 560 });
      } else if (name === "pause") {
        this.tone(420, 0.1, { type: "sine", volume: 0.018, endFrequency: 260 });
      } else if (name === "crash") {
        this.tone(170, 0.32, { type: "sawtooth", volume: 0.045, endFrequency: 55 });
      } else if (name === "win") {
        this.tone(440, 0.12, { type: "triangle", volume: 0.035 });
        this.tone(660, 0.12, { type: "triangle", volume: 0.035, delay: 0.1 });
        this.tone(880, 0.2, { type: "triangle", volume: 0.03, delay: 0.2 });
      } else if (name === "bonus") {
        this.tone(600, 0.09, { type: "triangle", volume: 0.04 });
        this.tone(900, 0.11, { type: "triangle", volume: 0.03, delay: 0.06 });
      } else if (name === "slow") {
        this.tone(760, 0.12, { type: "sine", volume: 0.03, endFrequency: 360 });
        this.tone(360, 0.16, { type: "sine", volume: 0.025, delay: 0.1 });
      } else if (name === "shrink") {
        this.tone(500, 0.08, { type: "square", volume: 0.022, endFrequency: 220 });
        this.tone(220, 0.1, { type: "square", volume: 0.018, delay: 0.08 });
      }
    }
  }
  class SnakeGame {
    constructor() {
      this.state = "ready";
      this.mode = this.loadMode();
      this.snake = [];
      this.direction = DIRECTIONS.right;
      this.queuedDirections = [];
      this.food = { x: 17, y: 12 };
      this.specialFood = null;
      this.specialExpiresAt = 0;
      this.obstacles = [];
      this.score = 0;
      this.best = this.loadBestScore();
      this.foodsEaten = 0;
      this.stepMs = BASE_STEP_MS;
      this.slowUntil = 0;
      this.runTime = 0;
      this.accumulator = 0;
      this.lastTimestamp = 0;
      this.visualTime = 0;
      this.particles = [];
      this.shake = 0;
      this.swipeStart = null;
      this.toastTimer = null;
      this.canvasSize = 0;
      this.pixelRatio = 1;
      this.audio = new AudioEngine();

      this.resetBoardState();
      this.bindEvents();
      this.updateSoundButton();
      this.syncModeControls();
      this.updateHowToPlay();
      this.fitBoardToViewport();
      this.resizeCanvas();
      this.updateHud();
      this.setStatus("等待开始", "");
      this.showOverlay("ready");

      this.frame = this.frame.bind(this);
      window.requestAnimationFrame(this.frame);
    }

    loadBestScore() {
      const stored = Number.parseInt(storage.get(STORAGE_BEST, "0"), 10);
      return Number.isFinite(stored) ? Math.max(0, stored) : 0;
    }

    loadMode() {
      const stored = storage.get(STORAGE_MODE, "classic");
      return stored === "obstacles" ? "obstacles" : "classic";
    }

    resetBoardState() {
      this.snake = [
        { x: 12, y: 12 },
        { x: 11, y: 12 },
        { x: 10, y: 12 }
      ];
      this.direction = DIRECTIONS.right;
      this.queuedDirections = [];
      this.food = { x: 17, y: 12 };
      this.specialFood = null;
      this.specialExpiresAt = 0;
      this.foodsEaten = 0;
      this.slowUntil = 0;
      this.runTime = 0;
      this.particles = [];
      this.obstacles = this.generateObstacles();
    }

    generateObstacles() {
      const obstacles = [];
      if (this.mode !== "obstacles") {
        return obstacles;
      }

      const reserved = new Set(this.snake.map((segment) => `${segment.x},${segment.y}`));
      for (let x = 10; x <= 16; x += 1) {
        for (let y = 11; y <= 13; y += 1) {
          reserved.add(`${x},${y}`);
        }
      }

      let attempts = 0;
      while (obstacles.length < OBSTACLE_COUNT && attempts < 3000) {
        attempts += 1;
        const x = Math.floor(Math.random() * GRID_SIZE);
        const y = Math.floor(Math.random() * GRID_SIZE);
        const key = `${x},${y}`;
        if (!reserved.has(key)) {
          reserved.add(key);
          obstacles.push({ x, y });
        }
      }

      return obstacles;
    }

    bindEvents() {
      elements.primaryButton.addEventListener("click", () => {
        this.audio.unlock();
        this.handlePrimaryAction();
      });

      elements.pauseButton.addEventListener("click", () => {
        this.audio.unlock();
        this.handlePauseAction();
      });

      elements.soundButton.addEventListener("click", () => {
        const enabled = !this.audio.enabled;
        this.audio.setEnabled(enabled);
        this.updateSoundButton();
        if (enabled) {
          this.audio.play("start");
        }
      });

      elements.modeButtons.forEach((button) => {
        button.addEventListener("click", () => {
          this.switchMode(button.dataset.mode);
        });
      });

      window.addEventListener("keydown", (event) => this.handleKeyDown(event));
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.state === "running") {
          this.pauseGame();
        }
      });

      canvas.addEventListener("pointerdown", (event) => this.beginSwipe(event));
      canvas.addEventListener("pointerup", (event) => this.endSwipe(event));
      canvas.addEventListener("pointercancel", () => {
        this.swipeStart = null;
      });

      elements.directionButtons.forEach((button) => {
        button.addEventListener("click", () => {
          this.audio.unlock();
          this.handleDirectionInput(button.dataset.direction);
        });
      });

      if ("ResizeObserver" in window) {
        const resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        resizeObserver.observe(canvas);
      }
      window.addEventListener("resize", () => {
        this.fitBoardToViewport();
        this.resizeCanvas();
      });
    }

    switchMode(mode) {
      const nextMode = mode === "obstacles" ? "obstacles" : "classic";
      if (nextMode === this.mode) {
        return;
      }

      if (this.state === "running" || this.state === "paused") {
        this.showToast("请结束当前局后再切换模式");
        this.syncModeControls();
        return;
      }

      this.mode = nextMode;
      storage.set(STORAGE_MODE, this.mode);
      this.resetBoardState();
      if (this.state === "ready") {
        this.spawnFood();
      }
      this.syncModeControls();
      this.updateHowToPlay();
      this.fitBoardToViewport();
      if (this.state === "ready") {
        this.showOverlay("ready");
      }
    }

    syncModeControls() {
      const isLocked = this.state === "running" || this.state === "paused";
      elements.modeButtons.forEach((button) => {
        const active = button.dataset.mode === this.mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.disabled = isLocked;
      });
    }

    updateHowToPlay() {
      if (this.mode === "obstacles") {
        setTipContent(elements.tips[0], "收集核心", "每个能量核心增加 10 分和 1 节身体。");
        setTipContent(elements.tips[1], "特殊能量", "黄金 +30 分，寒冰减速，虚空缩短蛇身。");
        setTipContent(elements.tips[2], "躲避障碍", "紫色障碍物与墙壁一样致命，请绕行。");
      } else {
        setTipContent(elements.tips[0], "收集核心", "每个能量核心增加 10 分和 1 节身体。");
        setTipContent(elements.tips[1], "逐渐加速", "吃得越多，移动速度越快，最高 2.3 倍。");
        setTipContent(elements.tips[2], "避免碰撞", "撞墙或撞到自己都会结束游戏。");
      }
    }
    handleKeyDown(event) {
      if (event.repeat) {
        return;
      }

      const key = event.key.toLowerCase();
      const directionName = KEY_DIRECTIONS[key];

      if (directionName) {
        event.preventDefault();
        this.audio.unlock();
        this.handleDirectionInput(directionName);
        return;
      }

      const isButton = event.target instanceof HTMLElement && event.target.tagName === "BUTTON";

      if (event.code === "Space" && !isButton) {
        event.preventDefault();
        this.handlePauseAction();
      } else if (key === "p" || key === "escape") {
        event.preventDefault();
        this.handlePauseAction();
      } else if (key === "enter" && !isButton) {
        event.preventDefault();
        this.handlePrimaryAction();
      }
    }

    handleDirectionInput(directionName) {
      if (this.state === "ready") {
        this.beginGame();
      }

      if (this.state === "running") {
        this.setDirection(directionName);
      }
    }

    setDirection(directionName) {
      const next = DIRECTIONS[directionName];
      if (!next) {
        return;
      }

      const lastQueuedName = this.queuedDirections[this.queuedDirections.length - 1];
      const current = lastQueuedName ? DIRECTIONS[lastQueuedName] : this.direction;

      if (next.x === current.x && next.y === current.y) {
        return;
      }

      if (next.x === -current.x && next.y === -current.y) {
        return;
      }

      if (this.queuedDirections.length < 2) {
        this.queuedDirections.push(directionName);
      }
    }

    handlePrimaryAction() {
      if (this.state === "paused") {
        this.resumeGame();
      } else {
        this.beginGame();
      }
    }

    handlePauseAction() {
      if (this.state === "running") {
        this.pauseGame();
      } else if (this.state === "paused") {
        this.resumeGame();
      } else {
        this.beginGame();
      }
    }

    beginGame() {
      this.resetBoardState();
      this.score = 0;
      this.stepMs = this.computeStepMs();
      this.accumulator = 0;
      this.shake = 0;
      this.lastTimestamp = performance.now();
      this.state = "running";
      this.spawnFood();
      this.hideOverlay();
      this.updateHud();
      this.setStatus("游戏中", "is-running");
      this.syncModeControls();
      elements.pauseButton.textContent = "暂停";
      this.audio.play("start");
    }

    pauseGame() {
      if (this.state !== "running") {
        return;
      }

      this.state = "paused";
      this.accumulator = 0;
      this.showOverlay("paused");
      this.setStatus("已暂停", "is-paused");
      this.syncModeControls();
      elements.pauseButton.textContent = "继续";
      this.audio.play("pause");
    }

    resumeGame() {
      if (this.state !== "paused") {
        return;
      }

      this.state = "running";
      this.accumulator = 0;
      this.lastTimestamp = performance.now();
      this.hideOverlay();
      this.setStatus("游戏中", "is-running");
      this.syncModeControls();
      elements.pauseButton.textContent = "暂停";
      this.audio.play("start");
    }

    computeStepMs() {
      const base = Math.max(MIN_STEP_MS, BASE_STEP_MS - (this.score / SCORE_PER_FOOD) * 4);
      if (this.slowUntil > 0 && this.runTime < this.slowUntil) {
        return Math.min(base + SLOW_STEP_ADD, BASE_STEP_MS + SLOW_STEP_ADD);
      }
      return base;
    }
    update() {
      if (this.specialFood && this.runTime >= this.specialExpiresAt) {
        const expiredCenter = this.cellCenter(this.specialFood.x, this.specialFood.y);
        this.burst(expiredCenter.x, expiredCenter.y, SPECIAL_COLORS[this.specialFood.type].main, 10, 0.14);
        this.specialFood = null;
      }

      if (this.slowUntil > 0 && this.runTime >= this.slowUntil) {
        this.slowUntil = 0;
        this.stepMs = this.computeStepMs();
      }

      if (this.queuedDirections.length > 0) {
        const nextDirectionName = this.queuedDirections.shift();
        this.direction = DIRECTIONS[nextDirectionName];
      }

      const head = this.snake[0];
      const nextHead = {
        x: head.x + this.direction.x,
        y: head.y + this.direction.y
      };

      const hitWall =
        nextHead.x < 0 ||
        nextHead.x >= GRID_SIZE ||
        nextHead.y < 0 ||
        nextHead.y >= GRID_SIZE;

      if (hitWall) {
        this.endGame();
        return;
      }

      const hitObstacle = this.obstacles.some(
        (obstacle) => obstacle.x === nextHead.x && obstacle.y === nextHead.y
      );
      if (hitObstacle) {
        this.endGame();
        return;
      }

      const eatsNormal = nextHead.x === this.food.x && nextHead.y === this.food.y;
      const eatsSpecial =
        this.specialFood !== null &&
        nextHead.x === this.specialFood.x &&
        nextHead.y === this.specialFood.y;

      const collisionBody = eatsNormal ? this.snake : this.snake.slice(0, -1);
      const hitSelf = collisionBody.some(
        (segment) => segment.x === nextHead.x && segment.y === nextHead.y
      );

      if (hitSelf) {
        this.endGame();
        return;
      }

      this.snake.unshift(nextHead);

      if (eatsSpecial) {
        const type = this.specialFood.type;
        this.consumeSpecialFood(type);
        if (type !== "shrink") {
          this.snake.pop();
        }
        return;
      }

      if (!eatsNormal) {
        this.snake.pop();
        return;
      }

      this.applyNormalFood();
    }

    applyNormalFood() {
      this.score += SCORE_PER_FOOD;
      this.foodsEaten += 1;
      this.stepMs = this.computeStepMs();
      this.best = Math.max(this.best, this.score);
      storage.set(STORAGE_BEST, this.best);
      this.updateHud();

      const foodCellCenter = this.cellCenter(this.food.x, this.food.y);
      this.burst(foodCellCenter.x, foodCellCenter.y, "#79ffb2", 15, 0.2);
      this.audio.play("eat");

      if (!this.spawnFood()) {
        this.winGame();
        return;
      }

      this.maybeSpawnSpecialFood();
    }

    consumeSpecialFood(type) {
      const special = this.specialFood;
      const cellCenter = this.cellCenter(special.x, special.y);
      const color = SPECIAL_COLORS[type].main;
      this.specialFood = null;

      if (type === "bonus") {
        this.score += BONUS_POINTS;
        this.best = Math.max(this.best, this.score);
        storage.set(STORAGE_BEST, this.best);
        this.stepMs = this.computeStepMs();
        this.burst(cellCenter.x, cellCenter.y, color, 22, 0.28);
        this.audio.play("bonus");
        this.showToast("黄金核心 +30");
      } else if (type === "slow") {
        this.slowUntil = this.runTime + SLOW_DURATION_SECONDS;
        this.stepMs = this.computeStepMs();
        this.burst(cellCenter.x, cellCenter.y, color, 20, 0.24);
        this.audio.play("slow");
        this.showToast("寒冰核心：减速 6 秒");
      } else if (type === "shrink") {
        this.snake.length = Math.max(3, this.snake.length - (SHRINK_AMOUNT + 1));

        this.burst(cellCenter.x, cellCenter.y, color, 18, 0.26);
        this.audio.play("shrink");
        this.showToast("虚空核心：缩短 3 节");
      }

      this.updateHud();
    }

    maybeSpawnSpecialFood() {
      if (this.specialFood) {
        return;
      }

      const shouldSpawn =
        this.foodsEaten === 2 ||
        this.foodsEaten % SPECIAL_INTERVAL_EVERY === 0 ||
        Math.random() < 0.22;

      if (shouldSpawn) {
        this.spawnSpecialFood();
      }
    }

    spawnSpecialFood() {
      const occupied = new Set(this.snake.map((segment) => `${segment.x},${segment.y}`));
      this.obstacles.forEach((obstacle) => occupied.add(`${obstacle.x},${obstacle.y}`));
      if (this.food) {
        occupied.add(`${this.food.x},${this.food.y}`);
      }

      const available = [];
      for (let y = 0; y < GRID_SIZE; y += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
          if (!occupied.has(`${x},${y}`)) {
            available.push({ x, y });
          }
        }
      }

      if (available.length === 0) {
        return false;
      }

      const roll = Math.random();
      const type = roll < 0.5 ? "bonus" : roll < 0.8 ? "slow" : "shrink";
      const chosen = available[Math.floor(Math.random() * available.length)];

      this.specialFood = {
        x: chosen.x,
        y: chosen.y,
        type
      };
      this.specialExpiresAt = this.runTime + SPECIAL_DURATION_SECONDS;
      return true;
    }

    endGame() {
      this.state = "gameover";
      const headCenter = this.cellCenter(this.snake[0].x, this.snake[0].y);
      this.burst(headCenter.x, headCenter.y, "#ff6688", 28, 0.34);
      this.shake = 1;
      this.audio.play("crash");
      this.best = Math.max(this.best, this.score);
      storage.set(STORAGE_BEST, this.best);
      this.updateHud();
      this.setStatus("游戏结束", "is-over");
      this.syncModeControls();
      elements.pauseButton.textContent = "重开";
      this.showOverlay("gameover");

      if (this.score > 0 && this.score === this.best) {
        this.showToast("新纪录！");
      }
    }

    winGame() {
      this.state = "won";
      this.audio.play("win");
      this.setStatus("棋盘清空", "is-running");
      this.syncModeControls();
      elements.pauseButton.textContent = "重开";
      this.showOverlay("won");
      this.showToast("棋盘清空！");
    }
    spawnFood() {
      const occupied = new Set(this.snake.map((segment) => `${segment.x},${segment.y}`));
      this.obstacles.forEach((obstacle) => occupied.add(`${obstacle.x},${obstacle.y}`));
      if (this.specialFood) {
        occupied.add(`${this.specialFood.x},${this.specialFood.y}`);
      }

      const available = [];
      for (let y = 0; y < GRID_SIZE; y += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
          if (!occupied.has(`${x},${y}`)) {
            available.push({ x, y });
          }
        }
      }

      if (available.length === 0) {
        return false;
      }

      const foodIndex = Math.floor(Math.random() * available.length);
      this.food = available[foodIndex];
      return true;
    }

    cellCenter(gridX, gridY) {
      const cell = (this.canvasSize - BOARD_PADDING * 2) / GRID_SIZE;
      return {
        x: (BOARD_PADDING + (gridX + 0.5) * cell) / this.canvasSize,
        y: (BOARD_PADDING + (gridY + 0.5) * cell) / this.canvasSize
      };
    }

    burst(x, y, color, count, force) {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.35 + Math.random() * 0.8) * force;
        const life = 0.38 + Math.random() * 0.42;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          size: 1.8 + Math.random() * 3.4,
          color
        });
      }
    }

    updateParticles(deltaSeconds) {
      for (const particle of this.particles) {
        particle.x += particle.vx * deltaSeconds;
        particle.y += particle.vy * deltaSeconds;
        particle.vy += 0.08 * deltaSeconds;
        particle.life -= deltaSeconds;
      }

      this.particles = this.particles.filter((particle) => particle.life > 0);
    }

    updateHud() {
      elements.score.textContent = formatScore(this.score);
      elements.best.textContent = formatScore(this.best);
      elements.speed.textContent = `${(BASE_STEP_MS / this.stepMs).toFixed(1)}x`;
    }

    setStatus(text, className) {
      elements.statusText.textContent = text;
      elements.statusDot.className = `status-dot${className ? ` ${className}` : ""}`;
    }

    updateSoundButton() {
      elements.soundButton.classList.toggle("is-muted", !this.audio.enabled);
      const label = this.audio.enabled ? "关闭音效" : "开启音效";
      elements.soundButton.setAttribute("aria-label", label);
      elements.soundButton.title = label;
    }

    showOverlay(mode) {
      const isObstacles = this.mode === "obstacles";
      const content = {
        ready: {
          kicker: isObstacles ? "ARCADE // HAZARD" : "ARCADE // READY",
          title: isObstacles ? "障碍模式" : "准备出发",
          text: isObstacles
            ? "收集能量核心，绕开紫色障碍物，别撞上自己的身体。"
            : "吞下能量核心，别撞上边界或自己的身体。",
          button: "开始游戏"
        },
        paused: {
          kicker: "SYSTEM // PAUSED",
          title: "暂停中",
          text: "休息一下。按空格、P 或下方按钮继续游戏。",
          button: "继续游戏"
        },
        gameover: {
          kicker: "GAME // OVER",
          title: "能量耗尽",
          text: "这次差一点。调整路线，再冲一次最高纪录。",
          button: "再来一局"
        },
        won: {
          kicker: "SECTOR // CLEARED",
          title: "全域清除",
          text: "你占满了整个棋盘，能量网络已完全点亮。",
          button: "再玩一局"
        }
      }[mode];

      elements.overlayKicker.textContent = content.kicker;
      elements.overlayTitle.textContent = content.title;
      elements.overlayText.textContent = content.text;
      elements.primaryButton.querySelector("span").textContent = content.button;
      elements.finalScore.textContent = formatScore(this.score);
      elements.finalBest.textContent = formatScore(this.best);
      elements.overlayStats.hidden = mode !== "gameover" && mode !== "won";
      elements.overlay.setAttribute("aria-hidden", "false");
      elements.overlay.classList.remove("is-hidden");

      elements.overlayContent.style.animation = "none";
      void elements.overlayContent.offsetWidth;
      elements.overlayContent.style.animation = "";
    }

    hideOverlay() {
      elements.overlay.classList.add("is-hidden");
      elements.overlay.setAttribute("aria-hidden", "true");
      if (document.activeElement === elements.primaryButton) {
        elements.primaryButton.blur();
      }
    }

    showToast(message) {
      window.clearTimeout(this.toastTimer);
      elements.toast.textContent = message;
      elements.toast.classList.add("is-visible");
      this.toastTimer = window.setTimeout(() => {
        elements.toast.classList.remove("is-visible");
      }, 1900);
    }
    beginSwipe(event) {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      this.swipeStart = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };

      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (error) {
          // Pointer capture is optional.
        }
      }
    }

    endSwipe(event) {
      if (!this.swipeStart || event.pointerId !== this.swipeStart.id) {
        return;
      }

      const deltaX = event.clientX - this.swipeStart.x;
      const deltaY = event.clientY - this.swipeStart.y;
      const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      this.swipeStart = null;

      if (distance < 24) {
        return;
      }

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.handleDirectionInput(deltaX > 0 ? "right" : "left");
      } else {
        this.handleDirectionInput(deltaY > 0 ? "down" : "up");
      }
    }

    fitBoardToViewport() {
      const shell = document.querySelector(".game-shell");
      const panel = document.querySelector(".game-panel");
      const board = document.querySelector(".board-wrap");
      const topbar = document.querySelector(".topbar");
      const scoreboard = document.querySelector(".scoreboard");
      const modeSwitch = document.querySelector(".mode-switch");
      const toolbar = document.querySelector(".game-toolbar");
      const tips = document.querySelector(".how-to-play");
      const touchControls = document.querySelector(".touch-controls");

      if (!shell || !panel || !board) {
        return;
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const bodyStyle = window.getComputedStyle(document.body);
      const bodyPadX = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight);
      const bodyPadY = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);

      const panelStyle = window.getComputedStyle(panel);
      const panelPadX = parseFloat(panelStyle.paddingLeft) + parseFloat(panelStyle.paddingRight);
      const panelPadY = parseFloat(panelStyle.paddingTop) + parseFloat(panelStyle.paddingBottom);
      const panelBorderY =
        parseFloat(panelStyle.borderTopWidth) + parseFloat(panelStyle.borderBottomWidth);
      const panelBorderX =
        parseFloat(panelStyle.borderLeftWidth) + parseFloat(panelStyle.borderRightWidth);

      const marginBottom = (element) => {
        if (!element) {
          return 0;
        }
        return parseFloat(window.getComputedStyle(element).marginBottom) || 0;
      };
      const marginTop = (element) => {
        if (!element) {
          return 0;
        }
        return parseFloat(window.getComputedStyle(element).marginTop) || 0;
      };

      const chromeHeight =
        bodyPadY +
        (topbar ? topbar.offsetHeight + marginBottom(topbar) : 0) +
        (scoreboard ? scoreboard.offsetHeight + marginBottom(scoreboard) : 0) +
        (modeSwitch ? modeSwitch.offsetHeight + marginBottom(modeSwitch) : 0) +
        panelPadY +
        panelBorderY +
        (toolbar ? toolbar.offsetHeight : 0) +
        (tips && tips.offsetHeight > 0 ? tips.offsetHeight + marginTop(tips) : 0) +
        (touchControls && touchControls.offsetHeight > 0
          ? touchControls.offsetHeight + marginTop(touchControls)
          : 0);

      const availableBoardHeight = Math.max(180, viewportHeight - chromeHeight);
      const shellChromeWidth = panelPadX + panelBorderX;
      const maxWidthByViewport = Math.max(220, viewportWidth - bodyPadX);

      let shellWidth = Math.min(760, availableBoardHeight + shellChromeWidth, maxWidthByViewport);
      shellWidth = Math.max(220, shellWidth);
      document.documentElement.style.setProperty("--shell-width", `${Math.round(shellWidth)}px`);
    }
    resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1) {
        return;
      }

      const newSize = Math.floor(rect.width);
      const newPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      if (newSize === this.canvasSize && newPixelRatio === this.pixelRatio) {
        return;
      }

      this.canvasSize = newSize;
      this.pixelRatio = newPixelRatio;
      canvas.width = Math.round(newSize * newPixelRatio);
      canvas.height = Math.round(newSize * newPixelRatio);
      context.setTransform(newPixelRatio, 0, 0, newPixelRatio, 0, 0);
    }

    frame(timestamp) {
      if (!this.lastTimestamp) {
        this.lastTimestamp = timestamp;
      }

      const deltaSeconds = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
      this.lastTimestamp = timestamp;
      this.visualTime += deltaSeconds;

      if (this.state === "running") {
        this.runTime += deltaSeconds;
        this.accumulator += deltaSeconds * 1000;
        while (this.accumulator >= this.stepMs && this.state === "running") {
          this.accumulator -= this.stepMs;
          this.update();
        }
      }

      this.updateParticles(deltaSeconds);
      this.shake = Math.max(0, this.shake - deltaSeconds * 2.8);
      this.render(timestamp);
      window.requestAnimationFrame(this.frame);
    }

    render(timestamp) {
      if (!this.canvasSize) {
        this.resizeCanvas();
        if (!this.canvasSize) {
          return;
        }
      }

      const size = this.canvasSize;
      const cell = (size - BOARD_PADDING * 2) / GRID_SIZE;
      context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      context.clearRect(0, 0, size, size);

      context.save();
      if (this.shake > 0) {
        const shakeDistance = this.shake * 7;
        context.translate(
          (Math.random() - 0.5) * shakeDistance,
          (Math.random() - 0.5) * shakeDistance
        );
      }

      this.drawBoard(size);
      this.drawGrid(size);
      this.drawObstacles(cell);
      this.drawFood(cell, timestamp);
      this.drawSpecialFood(cell, timestamp);
      this.drawSnake(cell);
      this.drawParticles(size);
      context.restore();
    }

    drawBoard(size) {
      const background = context.createRadialGradient(
        size * 0.5,
        size * 0.42,
        0,
        size * 0.5,
        size * 0.5,
        size * 0.72
      );
      background.addColorStop(0, "#0c1c24");
      background.addColorStop(0.55, "#08131c");
      background.addColorStop(1, "#050b12");
      context.fillStyle = background;
      context.fillRect(0, 0, size, size);

      const halo = context.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.42);
      halo.addColorStop(0, "rgba(121, 255, 178, 0.045)");
      halo.addColorStop(1, "rgba(121, 255, 178, 0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, size, size);
    }

    drawGrid(size) {
      const start = BOARD_PADDING;
      const end = size - BOARD_PADDING;
      const cell = (end - start) / GRID_SIZE;

      context.save();
      context.strokeStyle = "rgba(141, 224, 186, 0.065)";
      context.lineWidth = 1;
      context.beginPath();

      for (let index = 0; index <= GRID_SIZE; index += 1) {
        const position = Math.round(start + index * cell) + 0.5;
        context.moveTo(position, start);
        context.lineTo(position, end);
        context.moveTo(start, position);
        context.lineTo(end, position);
      }

      context.stroke();
      context.strokeStyle = "rgba(121, 255, 178, 0.13)";
      context.strokeRect(start + 0.5, start + 0.5, end - start - 1, end - start - 1);
      context.restore();
    }

    drawObstacles(cell) {
      if (!this.obstacles.length) {
        return;
      }

      const inset = cell * 0.08;
      const size = cell - inset * 2;
      const radius = cell * 0.18;

      context.save();
      for (const obstacle of this.obstacles) {
        const x = BOARD_PADDING + obstacle.x * cell + inset;
        const y = BOARD_PADDING + obstacle.y * cell + inset;

        context.shadowColor = "rgba(167, 139, 250, 0.55)";
        context.shadowBlur = cell * 0.4;
        context.fillStyle = "rgba(139, 92, 246, 0.34)";
        pathRoundedRect(context, x, y, size, size, radius);
        context.fill();

        context.shadowBlur = 0;
        context.strokeStyle = "rgba(196, 181, 253, 0.55)";
        context.lineWidth = 1;
        context.stroke();

        context.fillStyle = "rgba(221, 214, 254, 0.75)";
        const inner = cell * 0.12;
        pathRoundedRect(
          context,
          x + cell * 0.28,
          y + cell * 0.28,
          Math.max(inner, cell * 0.44),
          Math.max(inner, cell * 0.44),
          radius * 0.6
        );
        context.fill();
      }
      context.restore();
    }
    drawFood(cell, timestamp) {
      if (!this.food || this.state === "won") {
        return;
      }

      const x = BOARD_PADDING + (this.food.x + 0.5) * cell;
      const y = BOARD_PADDING + (this.food.y + 0.5) * cell;
      const pulse = 1 + Math.sin(timestamp * 0.006) * 0.08;
      const radius = cell * 0.29 * pulse;

      context.save();
      context.translate(x, y);

      context.shadowColor = "rgba(121, 255, 178, 0.9)";
      context.shadowBlur = cell * 0.9;
      context.fillStyle = "rgba(121, 255, 178, 0.14)";
      context.beginPath();
      context.arc(0, 0, cell * 0.48 * pulse, 0, Math.PI * 2);
      context.fill();

      context.rotate(Math.PI / 4);
      context.shadowBlur = cell * 0.65;
      context.fillStyle = "#aaffca";
      pathRoundedRect(context, -radius * 0.72, -radius * 0.72, radius * 1.44, radius * 1.44, cell * 0.08);
      context.fill();

      context.shadowBlur = 0;
      context.fillStyle = "#ecfff3";
      context.beginPath();
      context.arc(-radius * 0.18, -radius * 0.18, Math.max(1.2, cell * 0.07), 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    drawSpecialFood(cell, timestamp) {
      if (!this.specialFood || this.state === "won") {
        return;
      }

      const color = SPECIAL_COLORS[this.specialFood.type];
      const x = BOARD_PADDING + (this.specialFood.x + 0.5) * cell;
      const y = BOARD_PADDING + (this.specialFood.y + 0.5) * cell;
      const remaining = clamp(
        (this.specialExpiresAt - this.runTime) / SPECIAL_DURATION_SECONDS,
        0,
        1
      );
      const pulse = 1 + Math.sin(timestamp * 0.007) * 0.1;

      context.save();
      context.translate(x, y);

      context.shadowColor = color.glow;
      context.shadowBlur = cell * 0.9;
      context.fillStyle = "rgba(255, 255, 255, 0.06)";
      context.beginPath();
      context.arc(0, 0, cell * 0.5 * pulse, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = color.main;
      context.lineWidth = Math.max(1.5, cell * 0.08);
      context.beginPath();
      context.arc(0, 0, cell * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining);
      context.stroke();

      context.rotate(Math.PI / 4);
      context.shadowBlur = cell * 0.6;
      context.fillStyle = color.main;
      const radius = cell * 0.27 * pulse;
      pathRoundedRect(context, -radius * 0.72, -radius * 0.72, radius * 1.44, radius * 1.44, cell * 0.07);
      context.fill();
      context.restore();

      this.drawSpecialSymbol(this.specialFood.type, x, y, cell, color.main);
    }

    drawSpecialSymbol(type, x, y, cell, color) {
      context.save();
      context.translate(x, y);
      context.strokeStyle = "#08131c";
      context.fillStyle = "#08131c";
      context.lineWidth = Math.max(1.5, cell * 0.07);
      context.lineCap = "round";

      const half = cell * 0.13;

      if (type === "bonus") {
        context.beginPath();
        context.moveTo(-half, 0);
        context.lineTo(half, 0);
        context.moveTo(0, -half);
        context.lineTo(0, half);
        context.stroke();
      } else if (type === "slow") {
        for (const angle of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
          context.beginPath();
          context.moveTo(Math.cos(angle) * half, Math.sin(angle) * half);
          context.lineTo(-Math.cos(angle) * half, -Math.sin(angle) * half);
          context.stroke();
        }
      } else {
        const arrow = cell * 0.11;
        context.beginPath();
        context.moveTo(-half, 0);
        context.lineTo(-half + arrow, -arrow);
        context.moveTo(-half, 0);
        context.lineTo(-half + arrow, arrow);
        context.moveTo(half, 0);
        context.lineTo(half - arrow, -arrow);
        context.moveTo(half, 0);
        context.lineTo(half - arrow, arrow);
        context.stroke();
      }

      context.restore();
    }

    drawSnake(cell) {
      if (!this.snake.length) {
        return;
      }

      const inset = cell * 0.1;
      const segmentSize = cell - inset * 2;
      const radius = cell * 0.28;

      context.save();
      for (let index = this.snake.length - 1; index >= 0; index -= 1) {
        const segment = this.snake[index];
        const x = BOARD_PADDING + segment.x * cell + inset;
        const y = BOARD_PADDING + segment.y * cell + inset;
        const isHead = index === 0;
        const brightness = 58 + 9 * (1 - index / Math.max(this.snake.length, 1));

        context.shadowColor = isHead ? "rgba(121, 255, 178, 0.75)" : "rgba(121, 255, 178, 0.24)";
        context.shadowBlur = isHead ? cell * 0.65 : cell * 0.22;
        context.fillStyle = isHead ? "#c8ffdc" : `hsl(156 92% ${brightness}%)`;
        pathRoundedRect(context, x, y, segmentSize, segmentSize, radius);
        context.fill();

        context.shadowBlur = 0;
        context.strokeStyle = isHead ? "rgba(240, 255, 247, 0.58)" : "rgba(210, 255, 228, 0.12)";
        context.lineWidth = 1;
        context.stroke();
      }

      this.drawSnakeEyes(cell);
      context.restore();
    }

    drawSnakeEyes(cell) {
      const head = this.snake[0];
      const centerX = BOARD_PADDING + (head.x + 0.5) * cell;
      const centerY = BOARD_PADDING + (head.y + 0.5) * cell;
      const forwardX = this.direction.x;
      const forwardY = this.direction.y;
      const sideX = -forwardY;
      const sideY = forwardX;
      const eyeRadius = Math.max(1.5, cell * 0.075);

      for (const side of [-1, 1]) {
        const eyeX = centerX + forwardX * cell * 0.15 + sideX * side * cell * 0.2;
        const eyeY = centerY + forwardY * cell * 0.15 + sideY * side * cell * 0.2;
        context.fillStyle = "#071018";
        context.beginPath();
        context.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
        context.fill();
      }
    }

    drawParticles(size) {
      context.save();
      for (const particle of this.particles) {
        const opacity = clamp(particle.life / particle.maxLife, 0, 1);
        context.globalAlpha = opacity;
        context.fillStyle = particle.color;
        context.shadowColor = particle.color;
        context.shadowBlur = 8;
        context.beginPath();
        context.arc(particle.x * size, particle.y * size, particle.size * opacity, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }

  const game = new SnakeGame();
  if (new URLSearchParams(window.location.search).has("debug")) {
    window.__snakeGame = game;
  }
})();