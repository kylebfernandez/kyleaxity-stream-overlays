// Local aggregate counts plus a bounded, sampled screen path and density grid. No typed text.

const { labelForCode } = require('./keyboard-state.cjs');

class MatchStats {
  constructor(game, now, metadata = {}) {
    this.game = game;
    this.start = now;
    this.metadata = metadata;
    this.clicks = 0;
    this.keys = 0;

    this.travel = 0;
    this.direct = 0;
    this.pathBetween = 0;
    this.measuredPath = 0;

    this.clickSpread = 0;
    this.clickPairs = 0;
    this.previous = null;
    this.lastClick = null;

    this.lastActivity = now;
    this.idle = 0;
    this.held = new Set();
    this.keyCounts = {};

    this.pathSamples = [];
    this.sampleInterval = 100;
    this.lastSample = -Infinity;
    this.heat = new Array(48 * 27).fill(0);
    this.leftHeat = new Array(48 * 27).fill(0);
    this.rightHeat = new Array(48 * 27).fill(0);
    this.lastMapAt = null;
    this.lastHeatSample = -Infinity;
  }

  activity(now) {
    this.idle += Math.max(0, now - this.lastActivity - 1000);
    this.lastActivity = now;
  }

  input(e, now) {
    if (e.type === 5) {
      this.held.delete(e.keycode);
      return;
    }

    if (e.type === 4) {
      if (!this.held.has(e.keycode)) {
        this.held.add(e.keycode);
        if (e.countKey === false) return;

        const label = labelForCode(e.keycode, this.game);

        if (label && e.countKey !== false) this.keyCounts[label] = (this.keyCounts[label] || 0) + 1;

        // Exclude modifier-only keys and the overlay's toggle chord.

        if (
          ![0x1d, 0xe1d, 0x2a, 0x36, 0x38, 0xe38, 0xe5b, 0xe5c].includes(e.keycode) &&
          !(e.keycode === 0x43 && e.ctrlKey && e.shiftKey)
        ) {
          this.keys++;
          this.activity(now);
        }
      }

      return;
    }

    if (![7, 9, 10].includes(e.type)) return;

    if (e.x < 0 || e.x >= 1920 || e.y < 0 || e.y >= 1080) {
      this.previous = null;
      this.lastClick = null;
      this.pathBetween = 0;
      this.lastMapAt = null;
      this.lastSample = -Infinity;
      return;
    }

    const p = { x: e.x, y: e.y };

    const cell = Math.min(26, Math.floor(e.y / 40)) * 48 + Math.min(47, Math.floor(e.x / 40));

    if (e.type === 7) {
      if (e.button === 1) this.leftHeat[cell]++;
      if (e.button === 2) this.rightHeat[cell]++;
    }

    if (now - this.lastHeatSample >= 100) {
      this.heat[cell]++;
      this.lastHeatSample = now;
    }

    if (now - this.lastSample >= this.sampleInterval) {
      // Bounded, downsampled screen coordinates, never key text or game memory.

      this.pathSamples.push([
        Math.round(e.x),
        Math.round(e.y),
        this.lastMapAt === null || now - this.lastMapAt > 1000 ? 0 : 1,
      ]);

      this.lastSample = now;

      if (this.pathSamples.length > 3000) {
        this.pathSamples = this.pathSamples.filter((_, i) => i % 2 === 0);
        this.sampleInterval *= 2;
      }
    }

    this.lastMapAt = now;

    if (this.previous) {
      const d = Math.hypot(p.x - this.previous.x, p.y - this.previous.y);
      this.travel += d;
      this.pathBetween += d;
    }

    this.previous = p;
    this.activity(now);

    if (e.type === 7) {
      this.clicks++;

      if (this.lastClick) {
        const d = Math.hypot(p.x - this.lastClick.x, p.y - this.lastClick.y);
        this.direct += d;
        this.measuredPath += this.pathBetween;
        this.clickSpread += d;
        this.clickPairs++;
      }

      this.lastClick = p;
      this.pathBetween = 0;
    }
  }

  finish(now, metadata = {}) {
    const seconds = Math.max(0.001, (now - this.start) / 1000);

    return {
      game: this.game,
      endedAt: now,
      durationSeconds: seconds,
      ...this.metadata,
      ...metadata,

      apm: ((this.clicks + this.keys) * 60) / seconds,
      clicks: this.clicks,
      keys: this.keys,
      keyCounts: { ...this.keyCounts },

      pointerMap: {
        width: 1920,
        height: 1080,
        cols: 48,
        rows: 27,
        path: this.pathSamples,
        heat: this.heat,
        left: this.leftHeat,
        right: this.rightHeat,
      },

      travelPixels: this.travel,
      efficiency:
        this.measuredPath > 0 ? Math.min(100, (this.direct / this.measuredPath) * 100) : null,

      spreadPixels: this.clickPairs ? this.clickSpread / this.clickPairs : null,
      tempoHz: this.clicks / seconds,

      idleSeconds: Math.min(
        seconds,
        (this.idle + Math.max(0, now - this.lastActivity - 1000)) / 1000,
      ),
    };
  }
}

module.exports = { MatchStats };
