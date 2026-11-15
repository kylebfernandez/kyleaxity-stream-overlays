const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

async function download(url, target) {
  if (fs.existsSync(target)) return;
  const parsed = new URL(url);
  if (!['media.valorant-api.com', 'ddragon.leagueoflegends.com'].includes(parsed.hostname)) {
    throw new Error('Unexpected asset host');
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Asset request failed: ${response.status}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  const gameFolder = path.join(root, 'game-icons');
  const spellFolder = path.join(root, 'spell-icons');
  fs.mkdirSync(gameFolder, { recursive: true });
  fs.mkdirSync(spellFolder, { recursive: true });
  const spells = read('spell-catalog.json');
  const jobs = spells.spells.map((spell) => [
    `https://ddragon.leagueoflegends.com/cdn/${spells.version}/img/spell/${spell.image}`,
    path.join(spellFolder, spell.image),
  ]);
  jobs.push([
    `https://ddragon.leagueoflegends.com/cdn/${spells.version}/img/item/2055.png`,
    path.join(gameFolder, 'item-2055.png'),
  ]);
  const response = await fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true', {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Could not load agent artwork catalog');
  const remote = (await response.json()).data;
  const catalog = read('valorant-agents.json');
  const slots = { Ability1: 'Q', Ability2: 'E', Grenade: 'C', Ultimate: 'X' };
  for (const agent of catalog) {
    const entry = remote.find((item) => item.uuid === agent.id);
    if (!entry) continue;
    for (const ability of entry.abilities) {
      const key = slots[ability.slot];
      const local = agent.abilities[key];
      if (key && local?.src && ability.displayIcon) {
        jobs.push([ability.displayIcon, path.join(gameFolder, path.basename(local.src))]);
      }
    }
  }
  async function worker() {
    for (;;) {
      const job = jobs.pop();
      if (!job) return;
      await download(...job);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log('Ability and summoner artwork cached locally.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
