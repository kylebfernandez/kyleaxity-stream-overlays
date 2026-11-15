const KEYS = new Map([
  [0x10, 'Q'],
  [0x11, 'W'],
  [0x12, 'E'],
  [0x13, 'R'],
  [0x20, 'D'],
  [0x21, 'F'],
  [0x02, '1'],
  [0x03, '2'],
  [0x04, '3'],
  [0x05, '4'],
  [0x06, '5'],
  [0x07, '6'],
  [0x08, '7'],
  [0x39, 'Space'],
]);

KEYS.set(0x2a, 'Shift');
KEYS.set(0x36, 'Shift');
KEYS.set(0x1d, 'Ctrl');
KEYS.set(0xe1d, 'Ctrl');

KEYS.set(0x2f, 'V');
KEYS.set(0x29, '~');

for (const [code, label] of [
  [0x1e, 'A'],
  [0x1f, 'S'],
  [0x2e, 'C'],
  [0x2d, 'X'],
  [0x30, 'B'],
  [0x0f, 'Tab'],
])
  KEYS.set(code, label);

const LEAGUE_KEYS = new Set([
  'Q',
  'W',
  'E',
  'R',
  'D',
  'F',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  'Space',
  'Shift',
  'Ctrl',
  'V',
]);

class KeyboardState {
  constructor() {
    this.held = new Set();
    this.chat = false;
    this.enterHeld = false;
    this.active = false;
    this.game = 'league';
  }

  focus(active, game = 'league') {
    this.game = game;
    this.active = active;
    this.held.clear();
    this.chat = false;
    this.enterHeld = false;
    return this.snapshot();
  }

  snapshot() {
    return {
      visible: this.active,
      keys: [...new Set([...this.held].map((code) => KEYS.get(code)))],
    };
  }

  input(e) {
    if (e.type !== 4 && e.type !== 5) return null;

    const enter = e.keycode === 0x1c || e.keycode === 0xe01c;

    if (enter && e.type === 5) {
      this.enterHeld = false;
      return null;
    }

    if (!this.active) return null;

    if (enter) {
      if (this.enterHeld) return null;
      this.enterHeld = true;
      this.chat = !this.chat;
      this.held.clear();
      return this.snapshot();
    }

    if (e.keycode === 0x01 && e.type === 4) {
      this.chat = false;
      this.held.clear();
      return this.snapshot();
    }

    const key = KEYS.get(e.keycode);
    if (!key || this.chat || (this.game === 'league' && !LEAGUE_KEYS.has(key))) return null;

    if (e.type === 4) {
      if (this.held.has(e.keycode)) return null;
      this.held.add(e.keycode);
    } else {
      if (!this.held.delete(e.keycode)) return null;
    }

    return this.snapshot();
  }
}

module.exports = {
  KeyboardState,
  labelForCode: (code, game = 'league') => {
    const label = KEYS.get(code);
    return game === 'valorant' || LEAGUE_KEYS.has(label) ? label : undefined;
  },
};
