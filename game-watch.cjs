const fs = require('fs');
const path = require('path');
const https = require('https');
function valorantSignal(line) {
  if (/LogGameFlowStateManager:.*Transitioning from \w+ to InGame\b/.test(line)) return 'start';
  if (/LogShooterGameState: Match Ended: Completion State: 'Completed'/.test(line))
    return 'complete';
  if (/LogGameFlowStateManager:.*Transitioning from InGame to (?!InGame\b)/.test(line))
    return 'exit';
  return null;
}
function leagueMetadata(data) {
  const active = data.activePlayer || {};
  const player = (data.allPlayers || []).find(
    (p) =>
      (active.riotId && p.riotId === active.riotId) ||
      (active.summonerName && p.summonerName === active.summonerName),
  );
  const metadata = {
    champion: player?.championName || null,
    kda: player?.scores
      ? `${player.scores.kills} / ${player.scores.deaths} / ${player.scores.assists}`
      : null,
  };
  if (player?.summonerSpells) {
    const spell = (s) =>
      s
        ? {
            id:
              (s.rawDisplayName || '').match(
                /^GeneratedTip_SummonerSpell_(.+)_DisplayName$/,
              )?.[1] || null,
            name: s.displayName || '',
          }
        : null;
    metadata.summonerSpells = {
      D: spell(player.summonerSpells.summonerSpellOne),
      F: spell(player.summonerSpells.summonerSpellTwo),
    };
  }
  if (player) {
    metadata.loadout = {
      champion: player.championName || '',
      championId: (player.rawChampionName || '').replace(/^game_character_displayname_/i, ''),
      role: player.position || player.teamPosition || null,
      abilities: Object.fromEntries(
        ['Q', 'W', 'E', 'R'].map((key) => [
          key,
          { name: active.abilities?.[key]?.displayName || '' },
        ]),
      ),
      items: (player.items || []).map((item) => ({
        id: item.itemID,
        slot: item.slot,
        name: item.displayName || '',
      })),
    };
  }
  return metadata;
}
function getLeague() {
  return new Promise((resolve, reject) => {
    // The game's local API uses a self-signed certificate. This exception is restricted to this single loopback request.
    const req = https.get(
      {
        hostname: '127.0.0.1',
        port: 2999,
        path: '/liveclientdata/allgamedata',
        rejectUnauthorized: false,
        timeout: 1200,
      },
      (res) => {
        let text = '';
        res.on('data', (b) => {
          text += b;
          if (text.length > 2e6) req.destroy(new Error('Response too large'));
        });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) throw Error('Game API unavailable');
            resolve(JSON.parse(text));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Game API timeout')));
    req.on('error', reject);
  });
}
function createGameWatch({
  start,
  update,
  end,
  leagueFetch = getLeague,
  valorantLogPath,
  pollInterval = 2000,
  enabledGames = { league: true, valorant: true },
}) {
  let stopped = false,
    busy = false,
    leagueActive = false,
    leagueFinished = false,
    leagueFailures = 0,
    lastLeagueTime = 0;
  const logFile =
    valorantLogPath ||
    path.join(process.env.LOCALAPPDATA || '', 'VALORANT', 'Saved', 'Logs', 'ShooterGame.log');
  let logOffset = null,
    logBirth = null,
    logBuffer = '',
    valorantActive = false;
  function consumeValorant(text) {
    for (const line of text.split(/\r?\n/)) {
      const signal = valorantSignal(line);
      if (signal === 'start' && !valorantActive) {
        valorantActive = true;
        start('valorant', {});
      }
      if (signal === 'complete' && valorantActive) {
        valorantActive = false;
        end('valorant', { status: 'MATCH COMPLETE' });
      }
      if (signal === 'exit' && valorantActive) {
        valorantActive = false;
        end('valorant', { status: 'SESSION ENDED' });
      }
    }
  }
  function pollValorant() {
    try {
      const stat = fs.statSync(logFile);
      if (logOffset === null) {
        // Inspect only current state; never replay historical finished matches at startup.
        const fd = fs.openSync(logFile, 'r');
        const length = Math.min(stat.size, 262144);
        const bytes = Buffer.alloc(length);
        try {
          fs.readSync(fd, bytes, 0, length, stat.size - length);
        } finally {
          fs.closeSync(fd);
        }
        let inGame = false;
        for (const line of bytes.toString().split(/\r?\n/)) {
          const s = valorantSignal(line);
          if (s === 'start') inGame = true;
          if (s === 'complete' || s === 'exit') inGame = false;
        }
        if (inGame && Date.now() - stat.mtimeMs < 60000) {
          valorantActive = true;
          start('valorant', { partial: true });
        }
        logOffset = stat.size;
        logBirth = stat.birthtimeMs;
        return;
      }
      if (stat.size < logOffset || stat.birthtimeMs !== logBirth) {
        if (valorantActive) end('valorant', { status: 'SESSION ENDED', partial: true });
        valorantActive = false;
        logOffset = 0;
        logBirth = stat.birthtimeMs;
        logBuffer = '';
      }
      if (stat.size === logOffset) return;
      const startOffset = Math.max(logOffset, stat.size - 2e6),
        length = stat.size - startOffset;
      const fd = fs.openSync(logFile, 'r'),
        bytes = Buffer.alloc(length);
      try {
        fs.readSync(fd, bytes, 0, length, startOffset);
      } finally {
        fs.closeSync(fd);
      }
      logOffset = stat.size;
      logBuffer += bytes.toString();
      const split = logBuffer.lastIndexOf('\n');
      if (split >= 0) {
        consumeValorant(logBuffer.slice(0, split));
        logBuffer = logBuffer.slice(split + 1);
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        logOffset = null;
        logBuffer = '';
      }
    }
  }
  async function pollLeague() {
    try {
      const data = await leagueFetch();
      if (stopped) return;
      const gameTime = data.gameData?.gameTime;
      if (!Number.isFinite(gameTime)) return;
      leagueFailures = 0;
      if (gameTime < lastLeagueTime - 10) {
        leagueFinished = false;
        if (leagueActive) end('league', { status: 'SESSION ENDED', partial: true });
        leagueActive = false;
      }
      lastLeagueTime = gameTime;
      const metadata = leagueMetadata(data);
      const gameEnd = (data.events?.Events || []).find((e) => e.EventName === 'GameEnd');
      if (gameEnd && !leagueActive) {
        leagueFinished = true;
        return;
      }
      if (!leagueActive && !leagueFinished) {
        leagueActive = true;
        start('league', { ...metadata, partial: gameTime > 15 });
      }
      if (leagueActive) update('league', metadata);
      if (gameEnd && leagueActive) {
        leagueActive = false;
        leagueFinished = true;
        end('league', {
          ...metadata,
          status:
            gameEnd.Result === 'Win'
              ? 'VICTORY'
              : gameEnd.Result === 'Lose'
                ? 'DEFEAT'
                : 'MATCH COMPLETE',
        });
      }
    } catch {
      if (stopped) return;
      leagueFailures++;
      if (leagueFailures >= 6) {
        if (leagueActive) {
          leagueActive = false;
          end('league', { status: 'SESSION ENDED' });
        }
        leagueFinished = false;
        lastLeagueTime = 0;
      }
    }
  }
  async function poll() {
    if (stopped || busy) return;
    busy = true;
    try {
      if (enabledGames.valorant !== false) pollValorant();
      if (enabledGames.league !== false) await pollLeague();
    } finally {
      busy = false;
    }
  }
  poll();
  const timer = setInterval(poll, pollInterval);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    status() {
      return { leagueActive, valorantActive };
    },
  };
}
module.exports = { createGameWatch, valorantSignal, leagueMetadata };
