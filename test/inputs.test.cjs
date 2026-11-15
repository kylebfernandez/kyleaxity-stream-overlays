const { test } = require('node:test');
const assert = require('node:assert/strict');
const { KeyboardState } = require('../keyboard-state.cjs');
const { MatchStats } = require('../match-stats.cjs');
const { mapPoint } = require('../coordinates.cjs');
const { valorantSignal } = require('../game-watch.cjs');

test('game coordinates respect client bounds', () => {
  assert.deepEqual(mapPoint({ x: 900, y: 550 }, { x: 100, y: 100, width: 1600, height: 900 }), {
    x: 960,
    y: 540,
  });
  assert.equal(mapPoint({ x: 0, y: 0 }, null), null);
});

test('Valorant tilde events and chat visibility', () => {
  const keyboard = new KeyboardState();
  keyboard.focus(true, 'valorant');
  assert.deepEqual(keyboard.input({ type: 4, keycode: 0x29 }).keys, ['~']);
  assert.equal(keyboard.input({ type: 4, keycode: 0x29 }), null);
  keyboard.input({ type: 5, keycode: 0x29 });
  assert.equal(keyboard.input({ type: 4, keycode: 0x1c }).visible, true);
  assert.equal(keyboard.input({ type: 4, keycode: 0x10 }), null);
  assert.equal(keyboard.chat, true);
});

test('chat and held-key repeats do not inflate totals', () => {
  const match = new MatchStats('valorant', 0);
  match.input({ type: 4, keycode: 0x10, countKey: false }, 10);
  match.input({ type: 5, keycode: 0x10 }, 20);
  match.input({ type: 4, keycode: 0x11, countKey: true }, 30);
  match.input({ type: 4, keycode: 0x11, countKey: true }, 40);
  assert.equal(match.keys, 1);
  assert.deepEqual(match.keyCounts, { W: 1 });
});

test('cursor storage is bounded and separates click buttons', () => {
  const match = new MatchStats('league', 0);
  for (let i = 0; i < 10000; i++) {
    match.input({ type: 9, x: i % 1920, y: i % 1080 }, i * 100);
  }
  match.input({ type: 7, x: 100, y: 100, button: 1 }, 1000100);
  const summary = match.finish(1000200);
  assert.ok(summary.pointerMap.path.length <= 3000);
  assert.equal(
    summary.pointerMap.left.reduce((sum, value) => sum + value, 0),
    1,
  );
});

test('round end is not match end', () => {
  assert.equal(
    valorantSignal('LogShooterGameState: Warning: AShooterGameState::OnRoundEnded'),
    null,
  );
  assert.equal(
    valorantSignal("LogShooterGameState: Match Ended: Completion State: 'Completed'"),
    'complete',
  );
});
