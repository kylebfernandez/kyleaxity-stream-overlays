const http = require('http');

const fs = require('fs');

const path = require('path');

const { uIOhook } = require('uiohook-napi');
const hook = {
  start(handler) {
    uIOhook.on('input', handler);
    uIOhook.start();
  },
  stop() {
    uIOhook.stop();
    uIOhook.removeAllListeners('input');
  },
};

const { spawn } = require('child_process');

const { mapPoint } = require('./coordinates.cjs');

const { MatchStats } = require('./match-stats.cjs');

const { createGameWatch } = require('./game-watch.cjs');

const { KeyboardState } = require('./keyboard-state.cjs');

const { LoadoutIcons } = require('./loadout-icons.cjs');

const loadoutIcons = new LoadoutIcons();

const valorantCatalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'valorant-agents.json'), 'utf8'),
);
let valorantAgentId = null;
try {
  valorantAgentId = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'valorant-agent.json'), 'utf8'),
  ).agentId;
} catch {}
function selectedValorantAgent() {
  return valorantCatalog.find((a) => a.id === valorantAgentId) || null;
}
const keyboard = new KeyboardState(),
  keyboardClients = new Set();

let keyboardSpells = null,
  keyboardLoadout = { icons: {}, support: false },
  loadoutSignature = '',
  loadoutGeneration = 0,
  lastKeyCounts = {};

function updateKeyboardSpells(metadata) {
  const spells = metadata?.summonerSpells || null;

  if (JSON.stringify(spells) !== JSON.stringify(keyboardSpells)) {
    keyboardSpells = spells;
    sendKeyboard();
  }

  const signature = JSON.stringify(metadata?.loadout || null);

  if (signature !== loadoutSignature) {
    loadoutSignature = signature;
    const generation = ++loadoutGeneration;

    loadoutIcons
      .resolve(metadata?.loadout)
      .then((result) => {
        if (generation === loadoutGeneration) {
          keyboardLoadout = result;
          sendKeyboard();
        }
      })
      .catch(() => {});
  }
}

function keyboardGame() {
  return captureBounds?.kind === 'valorant' ? 'valorant' : 'league';
}

function keyboardFocused() {
  return (
    enabled &&
    gameSettings[keyboardGame()] !== false &&
    ['league-game', 'valorant'].includes(captureBounds?.kind)
  );
}

function keyboardPayload(state = keyboard.snapshot()) {
  const game = keyboardGame();
  return {
    ...state,
    game,
    rawMouse: rawMouseActive,
    spells: game === 'league' ? keyboardSpells : null,
    loadout: game === 'league' ? keyboardLoadout : { icons: {}, support: false },
    counts: matches.get(game)?.keyCounts || (game === 'league' ? lastKeyCounts : {}),
  };
}

function sendKeyboard(state = keyboard.snapshot()) {
  const message = 'data: ' + JSON.stringify(keyboardPayload(state)) + '\n\n';

  for (const client of keyboardClients) send(client, message, keyboardClients);
}

function resetKeyboard() {
  sendKeyboard(keyboard.focus(keyboardFocused(), keyboardGame()));
}

let rawMouseProcess = null,
  rawMouseRetry = null,
  rawMouseActive = false,
  rawMousePackets = 0,
  rawDX = 0,
  rawDY = 0,
  rawWheel = 0;
function watchRawMouse() {
  const child = spawn(path.join(__dirname, 'raw-mouse-wheel.exe'), [], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  rawMouseProcess = child;
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    if (buffer.length > 65536) {
      buffer = '';
      return;
    }
    let split;
    while ((split = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, split).trim();
      buffer = buffer.slice(split + 1);
      try {
        const data = JSON.parse(line);
        if (data.ready) {
          rawMouseActive = true;
          sendKeyboard();
          continue;
        }
        if (Number.isFinite(data.dx) && Number.isFinite(data.dy)) {
          rawMousePackets++;
          if (
            Number.isFinite(data.wheel) &&
            enabled &&
            captureBounds &&
            gameSettings[keyboardGame()] !== false &&
            ['valorant', 'league-game', 'league-client'].includes(captureBounds.kind)
          )
            rawWheel += data.wheel;
          if (enabled && captureBounds?.kind === 'valorant' && gameSettings.valorant !== false) {
            rawDX += data.dx;
            rawDY += data.dy;
          }
        }
      } catch {}
    }
  });
  child.on('error', () => {});
  child.on('close', () => {
    rawMouseProcess = null;
    rawMouseActive = false;
    rawDX = rawDY = rawWheel = 0;
    sendKeyboard();
    rawMouseRetry = setTimeout(watchRawMouse, 2000);
  });
}
const PORT = Number(process.env.OVERLAY_PORT || 17843);

let gameSettings = {
  league: true,
  valorant: true,
  desktop: false,
  desktopTrail: false,
  valorantTrail: false,
};

try {
  Object.assign(
    gameSettings,
    JSON.parse(fs.readFileSync(path.join(__dirname, 'game-settings.json'))),
  );
} catch {}

const clients = new Set();

const desktopClients = new Set();

let desktopProcess = null,
  desktopRetry = null;

function sendDesktop(events) {
  if (!gameSettings.desktopTrail)
    events = events.filter((e) => e.kind !== 'move' && e.kind !== 'click');

  if (!events.length) return;

  for (const client of desktopClients)
    send(client, 'data: ' + JSON.stringify(events) + '\n\n', desktopClients);
}

function launchDesktop() {
  if (!gameSettings.desktop) return;

  const child = spawn(path.join(__dirname, 'league-desktop-hud.exe'), [], {
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  desktopProcess = child;

  child.on('error', () => {});
  child.on('close', () => {
    desktopProcess = null;
    desktopRetry = setTimeout(launchDesktop, 2000);
  });
}

const summaryClients = new Set(),
  matches = new Map();

const summaryFile = path.join(__dirname, 'match-summaries.json');

let savedSummaries = {},
  lastSummary = null,
  gameWatch = null;

try {
  savedSummaries = JSON.parse(fs.readFileSync(summaryFile));
} catch {}

function publishSummary(summary) {
  lastSummary = summary
    ? {
        ...summary,
        id: Date.now() + '-' + Math.random().toString(36).slice(2),
        expiresAt: Date.now() + 25000,
      }
    : null;

  for (const client of summaryClients)
    send(client, 'data: ' + JSON.stringify(lastSummary) + '\n\n', summaryClients);

  sendDesktop([{ kind: 'summary', summary: lastSummary?.game === 'league' ? lastSummary : null }]);
}

function beginMatch(game, metadata) {
  if (gameSettings[game] === false) return;

  if (matches.has(game)) return;

  matches.set(game, new MatchStats(game, Date.now(), metadata));
  publishSummary(null);
  updateHook();

  if (game === 'league') lastKeyCounts = {};

  if (game === 'league') updateKeyboardSpells(metadata);
}

function finishMatch(game, metadata) {
  const match = matches.get(game);
  if (!match) return;

  matches.delete(game);

  const summary = match.finish(Date.now(), metadata);
  savedSummaries[game] = summary;

  if (game === 'league') {
    lastKeyCounts = { ...summary.keyCounts };
    sendKeyboard();
  }

  try {
    fs.writeFileSync(summaryFile, JSON.stringify(savedSummaries, null, 2));
  } catch (e) {
    console.error('Could not save aggregate summary:', e.code);
  }

  publishSummary(summary);
  updateHook();
}

const stateFile = path.join(__dirname, 'enabled-state.json');

let enabled = true,
  toggleHeld = false;

try {
  enabled = JSON.parse(fs.readFileSync(stateFile)).enabled !== false;
} catch {}

let latest = null,
  queue = [],
  running = false,
  mouseEvents = 0;

let captureBounds = null,
  geometryReader = null,
  geometryRetry = null;

function watchGeometry() {
  const child = spawn(path.join(__dirname, 'window-bounds.exe'), [], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });

  geometryReader = child;
  let buffer = '';

  child.stdout.on('data', (data) => {
    buffer += data.toString();
    let split;

    while ((split = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, split).trim();
      buffer = buffer.slice(split + 1);

      try {
        captureBounds = JSON.parse(line);
        latest = null;
        queue = [];
        rawDX = rawDY = rawWheel = 0;
        broadcast([{ kind: 'leave' }]);
        sendDesktop([{ kind: 'bounds', bounds: captureBounds }]);
        resetKeyboard();
        updateHook();
      } catch {}
    }
  });

  child.on('error', () => {});

  child.on('close', () => {
    captureBounds = null;
    geometryReader = null;
    geometryRetry = setTimeout(watchGeometry, 2000);
  });
}

function setEnabled(value) {
  enabled = value;
  latest = null;
  queue = [];

  fs.writeFileSync(stateFile, JSON.stringify({ enabled }));

  broadcast([{ kind: 'state', enabled }]);

  sendDesktop([{ kind: 'desktop-state', enabled, desktopEnabled: gameSettings.desktop }]);

  resetKeyboard();
}

function broadcast(events) {
  if (!events.length) return;

  const message = 'data: ' + JSON.stringify(events) + '\n\n';

  for (const client of clients) {
    send(client, message);
  }
}

function send(client, message, collection = clients) {
  if (client.destroyed || client.writableEnded || client.writableLength > 65536) {
    collection.delete(client);
    client.destroy();
    return;
  }

  try {
    client.write(message);
  } catch {
    collection.delete(client);
    client.destroy();
  }
}

function onInput(e) {
  // Only selected-key totals are saved; no typed text or ordered key history.

  const focusedGame =
    captureBounds?.kind === 'valorant'
      ? 'valorant'
      : captureBounds?.kind === 'league-game'
        ? 'league'
        : null;

  for (const [game, match] of matches) {
    if (e.type === 5 || game === focusedGame) {
      const mapped = mapPoint(e, captureBounds);

      match.input(
        [7, 9, 10].includes(e.type)
          ? { ...e, x: mapped?.x ?? -1, y: mapped?.y ?? -1 }
          : { ...e, countKey: !keyboard.chat },
        Date.now(),
      );
    }
  }

  if (e.type === 5 && e.keycode === 0x43) toggleHeld = false;

  if (
    e.type === 4 &&
    e.keycode === 0x43 &&
    e.ctrlKey &&
    e.shiftKey &&
    !e.altKey &&
    !e.metaKey &&
    !toggleHeld
  ) {
    toggleHeld = true;
    setEnabled(!enabled);
    return;
  }

  const keyboardUpdate = keyboard.input(e);
  if (keyboardUpdate) sendKeyboard(keyboardUpdate);

  if (e.type !== 9 && e.type !== 10 && e.type !== 7) return;

  mouseEvents++;

  if (!enabled) return;

  const captureGame =
    captureBounds?.kind === 'valorant'
      ? 'valorant'
      : captureBounds?.kind?.startsWith('league')
        ? 'league'
        : null;

  const mapped =
    captureGame && gameSettings[captureGame] !== false ? mapPoint(e, captureBounds) : null;

  const point = mapped
    ? {
        ...mapped,
        t: Date.now(),
        kind: e.type === 7 ? 'click' : 'move',
        button: e.type === 7 ? e.button : 0,
      }
    : { kind: 'leave' };

  if (point.kind === 'click') queue.push(point);
  else latest = point;
}

function updateHook() {
  const needed =
    clients.size > 0 ||
    matches.size > 0 ||
    (keyboardClients.size > 0 && keyboardFocused()) ||
    (gameSettings.desktopTrail &&
      desktopClients.size > 0 &&
      captureBounds?.kind?.startsWith('league'));

  if (needed && !running) {
    hook.start(onInput);
    running = true;
  }

  if (!needed && running) {
    hook.stop();
    running = false;
    toggleHeld = false;
    latest = null;
    queue = [];
  }
}

const server = http.createServer((req, res) => {
  const hosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
  const origins = hosts.map((host) => `http://${host}`);
  if (
    !hosts.includes(req.headers.host) ||
    (req.headers.origin && !origins.includes(req.headers.origin))
  ) {
    res.writeHead(403);
    return res.end('Local access only');
  }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  res.setHeader('Cache-Control', 'no-store');

  if (url.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');

    return res.end(
      JSON.stringify({
        service: 'stream-mouse-overlay',
        enabled,
        clients: clients.size,
        hookRunning: running,
        mouseEvents,
        rawMouseActive,
        rawMousePackets,
        captureBounds,
        postgameEnabled: true,
        activeMatches: [...matches.keys()],
        summaryClients: summaryClients.size,
        desktopClients: desktopClients.size,
        keyboardClients: keyboardClients.size,
        gameSettings,
      }),
    );
  }

  if (url.pathname === '/valorant-agent') {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ agent: selectedValorantAgent() }));
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      return res.end();
    }
    if (req.headers['x-overlay-control'] !== '1') {
      res.writeHead(403);
      return res.end();
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4096) req.destroy();
    });
    req.on('end', () => {
      try {
        const agentId = JSON.parse(body).agentId;
        if (!valorantCatalog.some((a) => a.id === agentId)) {
          res.writeHead(400);
          return res.end('Unknown agent');
        }
        fs.writeFileSync(path.join(__dirname, 'valorant-agent.json'), JSON.stringify({ agentId }));
        valorantAgentId = agentId;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ agent: selectedValorantAgent() }));
      } catch {
        res.writeHead(400);
        res.end('Invalid selection');
      }
    });
    return;
  }
  if (url.pathname === '/valorant-agents.json') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(valorantCatalog));
  }
  if (/^\/valorant-icons\/[a-f0-9-]+-(?:portrait|Q|E|C|X)\.png$/.test(url.pathname)) {
    const asset = path.join(__dirname, 'valorant-icons', path.basename(url.pathname));
    if (!fs.existsSync(asset)) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(fs.readFileSync(asset));
  }
  if (url.pathname === '/keyboard-events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
    keyboardClients.add(res);
    res.write('data: ' + JSON.stringify(keyboardPayload()) + '\n\n');

    const cleanup = () => {
      keyboardClients.delete(res);
      updateHook();
    };
    res.on('error', cleanup);
    res.on('close', cleanup);
    updateHook();
    return;
  }

  if (['/review.html', '/path-map.js'].includes(url.pathname)) {
    res.setHeader(
      'Content-Type',
      url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
    );
    return res.end(fs.readFileSync(path.join(__dirname, path.basename(url.pathname))));
  }

  if (url.pathname === '/keyboard.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(path.join(__dirname, 'keyboard.html')));
  }

  if (url.pathname === '/spell-catalog.json') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(fs.readFileSync(path.join(__dirname, 'spell-catalog.json')));
  }

  if (url.pathname === '/keyboard-preview.json') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(fs.readFileSync(path.join(__dirname, 'keyboard-preview.json')));
  }

  if (/^\/spell-icons\/[A-Za-z0-9_-]+\.png$/.test(url.pathname)) {
    const icon = path.join(__dirname, 'spell-icons', path.basename(url.pathname));

    if (!fs.existsSync(icon)) {
      res.writeHead(404);
      return res.end();
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(fs.readFileSync(icon));
  }

  if (/^\/game-icons\/[A-Za-z0-9_-]+\.png$/.test(url.pathname)) {
    const icon = path.join(__dirname, 'game-icons', path.basename(url.pathname));
    if (!fs.existsSync(icon)) {
      res.writeHead(404);
      return res.end();
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(fs.readFileSync(icon));
  }

  if (url.pathname === '/desktop-events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
    desktopClients.add(res);

    res.write(
      'data: ' +
        JSON.stringify([
          {
            kind: 'desktop-state',
            enabled,
            desktopEnabled: gameSettings.desktop,
            bounds: captureBounds,
            summary: lastSummary?.game === 'league' ? lastSummary : null,
          },
        ]) +
        '\n\n',
    );

    const cleanup = () => {
      desktopClients.delete(res);
      updateHook();
    };
    res.on('error', cleanup);
    res.on('close', cleanup);
    updateHook();
    return;
  }

  if (url.pathname === '/desktop-preview' && req.method === 'POST') {
    if (req.headers['x-overlay-control'] !== '1') {
      res.writeHead(403);
      return res.end();
    }

    const sample = {
      preview: true,
      game: 'league',
      status: 'PREVIEW · SAMPLE DATA',
      endedAt: Date.now(),
      expiresAt: Date.now() + 15000,
      durationSeconds: 1500,
      apm: 145.8,
      travelPixels: 186420,
      efficiency: 54,
      spreadPixels: 223,
      clicks: 2180,
      keys: 1465,
      keyCounts: { Q: 42, W: 18, E: 31, R: 4, D: 2, F: 3, V: 12, Ctrl: 6, Shift: 4, Space: 52 },
      tempoHz: 1.45,
      idleSeconds: 12,
    };

    sendDesktop([{ kind: 'summary', summary: sample }]);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }

  if (url.pathname === '/summary-events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });

    summaryClients.add(res);
    res.write('data: ' + JSON.stringify(lastSummary) + '\n\n');

    const cleanup = () => summaryClients.delete(res);
    res.on('error', cleanup);
    res.on('close', cleanup);
    return;
  }

  if (url.pathname === '/last-summary') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(savedSummaries));
  }

  if (
    ['/summary-preview', '/summary-hide', '/summary-replay'].includes(url.pathname) &&
    req.method === 'POST'
  ) {
    if (req.headers['x-overlay-control'] !== '1') {
      res.writeHead(403);
      return res.end();
    }

    if (url.pathname === '/summary-hide') publishSummary(null);
    else if (url.pathname === '/summary-replay') {
      const latest = Object.values(savedSummaries)
        .filter((s) => gameSettings[s.game] !== false)
        .sort((a, b) => b.endedAt - a.endedAt)[0];

      if (!latest) {
        res.writeHead(404);
        return res.end('No completed match has been captured yet.');
      }
      publishSummary(latest);
    } else
      publishSummary({
        preview: true,
        game: 'league',
        status: 'PREVIEW · SAMPLE DATA',
        endedAt: Date.now(),
        durationSeconds: 1500,
        apm: 145.8,
        travelPixels: 186420,
        efficiency: 54,
        spreadPixels: 223,
        clicks: 2180,
        keys: 1465,
        keyCounts: { Q: 42, W: 18, E: 31, R: 4, D: 2, F: 3, V: 12, Ctrl: 6, Shift: 4, Space: 52 },
        tempoHz: 1.45,
        idleSeconds: 12,
      });

    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }

  if (url.pathname === '/toggle' && req.method === 'POST') {
    if (req.headers['x-overlay-control'] !== '1') {
      res.writeHead(403);
      return res.end();
    }

    setEnabled(!enabled);

    res.setHeader('Content-Type', 'application/json');

    return res.end(JSON.stringify({ enabled }));
  }

  if (url.pathname === '/events') {
    res.on('error', () => {
      clients.delete(res);
      updateHook();
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write('data: ' + JSON.stringify([{ kind: 'state', enabled }]) + '\n\n');
    clients.add(res);
    updateHook();

    req.on('close', () => {
      clients.delete(res);
      updateHook();
    });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/overlay.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    return res.end(fs.readFileSync(path.join(__dirname, 'overlay.html')));
  }

  if (url.pathname === '/control') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    return res.end(fs.readFileSync(path.join(__dirname, 'control.html')));
  }

  if (url.pathname === '/postgame.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(path.join(__dirname, 'postgame.html')));
  }

  res.writeHead(404);
  res.end();
});

setInterval(() => {
  if (rawWheel) {
    if (enabled && captureBounds)
      queue.push({ kind: 'wheel', direction: rawWheel > 0 ? 'up' : 'down' });
    rawWheel = 0;
  }
  if (rawDX || rawDY) {
    if (enabled && captureBounds?.kind === 'valorant')
      queue.push({ kind: 'rawmove', dx: rawDX, dy: rawDY });
    rawDX = rawDY = rawWheel = 0;
  }
  if (latest) {
    queue.push(latest);
    latest = null;
  }

  if (queue.length) {
    const batch = queue;
    queue = [];
    broadcast(batch);
    sendDesktop(batch);
  }
}, 16);

setInterval(() => {
  for (const c of clients) send(c, ': heartbeat\n\n');
  for (const c of summaryClients) send(c, ': heartbeat\n\n', summaryClients);
  for (const c of desktopClients) send(c, ': heartbeat\n\n', desktopClients);
  for (const c of keyboardClients) send(c, ': heartbeat\n\n', keyboardClients);
}, 15000).unref();

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') process.exit(0);
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  watchGeometry();
  watchRawMouse();

  launchDesktop();

  gameWatch = createGameWatch({
    enabledGames: gameSettings,
    start: beginMatch,
    update: (game, data) => {
      const match = matches.get(game);
      if (match) Object.assign(match.metadata, data);
      if (game === 'league') updateKeyboardSpells(data);
    },
    end: finishMatch,
  });
});

function shutdown() {
  clearTimeout(rawMouseRetry);
  if (rawMouseProcess) rawMouseProcess.kill();
  gameWatch?.stop();
  if (running) hook.stop();
  clearTimeout(geometryRetry);
  clearTimeout(desktopRetry);
  if (geometryReader) geometryReader.kill();
  if (desktopProcess) desktopProcess.kill();
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
