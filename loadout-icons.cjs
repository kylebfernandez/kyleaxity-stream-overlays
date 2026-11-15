const fs = require('fs'),
  path = require('path');
const SLOT_KEYS = ['1', '2', '3', '5', '6', '7', '4'];
const SUPPORT_ITEMS = new Set([
  'World Atlas',
  'Runic Compass',
  'Bounty of Worlds',
  'Celestial Opposition',
  'Dream Maker',
  "Zaz'Zak's Realmspike",
  'Solstice Sleigh',
  'Bloodsong',
]);
function supportLoadout(loadout, itemData) {
  return (
    /^(UTILITY|SUPPORT)$/i.test(loadout?.role || '') ||
    (loadout?.items || []).some((i) => SUPPORT_ITEMS.has(itemData[String(i.id)]?.name || i.name))
  );
}
class LoadoutIcons {
  constructor(folder = __dirname) {
    this.folder = folder;
    this.version = JSON.parse(fs.readFileSync(path.join(folder, 'spell-catalog.json'))).version;
    this.champions = JSON.parse(fs.readFileSync(path.join(folder, 'champion-catalog.json'))).data;
    this.items = JSON.parse(fs.readFileSync(path.join(folder, 'item-catalog.json'))).data;
    this.pending = new Map();
    this.championData = new Map();
    fs.mkdirSync(path.join(folder, 'game-icons'), { recursive: true });
  }
  async icon(group, file) {
    if (!/^[A-Za-z0-9_-]+\.png$/.test(file || '') || !['spell', 'item'].includes(group))
      return null;
    const local = group + '-' + file,
      target = path.join(this.folder, 'game-icons', local);
    if (fs.existsSync(target)) return '/game-icons/' + local;
    if (!this.pending.has(local))
      this.pending.set(
        local,
        (async () => {
          try {
            const r = await fetch(
              `https://ddragon.leagueoflegends.com/cdn/${this.version}/img/${group}/${file}`,
              { signal: AbortSignal.timeout(8000) },
            );
            if (!r.ok) return null;
            const data = Buffer.from(await r.arrayBuffer());
            if (data.length > 262144) return null;
            fs.writeFileSync(target, data);
            return '/game-icons/' + local;
          } catch {
            return null;
          } finally {
            this.pending.delete(local);
          }
        })(),
      );
    return this.pending.get(local);
  }
  async champion(id) {
    if (!/^[A-Za-z0-9]+$/.test(id)) return null;
    if (!this.championData.has(id))
      this.championData.set(
        id,
        (async () => {
          try {
            const r = await fetch(
              `https://ddragon.leagueoflegends.com/cdn/${this.version}/data/en_US/champion/${id}.json`,
              { signal: AbortSignal.timeout(8000) },
            );
            if (!r.ok) return null;
            return (await r.json()).data[id];
          } catch {
            return null;
          }
        })(),
      );
    return this.championData.get(id);
  }
  async resolve(loadout) {
    if (!loadout) return { icons: {}, support: false };
    const icons = {},
      jobs = [];
    const champion = Object.values(this.champions).find(
      (c) =>
        c.id.toLowerCase() === (loadout.championId || '').toLowerCase() ||
        c.name.toLowerCase() === (loadout.champion || '').toLowerCase(),
    );
    if (champion) {
      const data = await this.champion(champion.id);
      for (const [index, key] of ['Q', 'W', 'E', 'R'].entries()) {
        const spell = data?.spells?.[index];
        if (spell)
          jobs.push(
            this.icon('spell', spell.image?.full).then((src) => {
              if (src) icons[key] = { src, name: loadout.abilities?.[key]?.name || spell.name };
            }),
          );
      }
    }
    const support = supportLoadout(loadout, this.items);
    if (support) {
      const entry = this.items['2055'];
      if (entry)
        jobs.push(
          this.icon('item', entry.image?.full).then((src) => {
            if (src) icons.V = { src, name: 'Control Ward' };
          }),
        );
    }
    await Promise.all(jobs);
    return { icons, support };
  }
}
module.exports = { LoadoutIcons, SLOT_KEYS, supportLoadout };
