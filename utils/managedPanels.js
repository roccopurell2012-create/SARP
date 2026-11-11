const db = require('./dataStore');
const locks = new Map();

// Serialize publication per panel so simultaneous setup/editor requests cannot duplicate it.
async function publishPanel(guild, channel, key, payload, matches, { replace = false, pin = false } = {}) {
  const lockKey = `${guild.id}:${key}`;
  const prior = locks.get(lockKey) || Promise.resolve();
  const next = prior.catch(() => {}).then(async () => {
    const botId = guild.client.user.id;
    const settingsKey = `panel_${guild.id}_${key}`;
    const registered = db.find('settings', r => r.key === settingsKey)[0]?.value;
    const found = new Map();
    let before;
    // Also migrate older bot-authored panels which predate the message registry.
    for (;;) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!batch.size) break;
      for (const message of batch.values()) {
        if (message.author.id === botId && (matches(message) || (registered?.channelId === channel.id && registered.messageId === message.id))) found.set(message.id, message);
      }
      const last = batch.last().id;
      if (last === before || batch.size < 100) break;
      before = last;
    }
    let current = found.get(registered?.messageId) || found.values().next().value;
    const outgoing = { content: '', components: [], ...payload, allowedMentions: { parse: [] } };
    if (current && !replace) current = await current.edit(outgoing);
    else current = await channel.send(outgoing);
    // Publish first, then remove obsolete bot panels. Never delete member posts.
    for (const message of found.values()) if (message.id !== current.id) await message.delete();
    const settings = db.load('settings');
    let record = settings.find(r => r.key === settingsKey);
    if (!record) { record = { id: `settings_${settingsKey}`, key: settingsKey }; settings.push(record); }
    record.value = { channelId: channel.id, messageId: current.id };
    db.save('settings', settings);
    if (pin && !current.pinned) await current.pin().catch(() => {});
    return current;
  });
  locks.set(lockKey, next);
  try { return await next; } finally { if (locks.get(lockKey) === next) locks.delete(lockKey); }
}
module.exports = { publishPanel };
