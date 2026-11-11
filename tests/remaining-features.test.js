const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Collection, ChannelType } = require('discord.js');
const structure = require('../config/structure');
const db = require('../utils/dataStore');
const handler = require('../events/interactionCreate');
const roles = require('../utils/roles');
const mocks = require('./helpers/discord');

// Keep test records in memory and reject any accidental access to retired stores.
const allowed = new Set(['tickets', 'applications', 'partnerships', 'suggestions', 'scheduledAnnouncements', 'offices', 'settings', 'staffProfiles', 'staffIdentities']);
const records = {};
db.load = store => {
  assert.ok(allowed.has(store), `Unexpected store: ${store}`);
  return records[store] ||= [];
};
db.save = (store, rows) => { db.load(store); records[store] = rows; };
db.find = (store, predicate) => db.load(store).filter(predicate);
db.add = (store, entry) => {
  const rows = db.load(store);
  const record = { ...entry, id: entry.id || `${store}_${rows.length}`, createdAt: new Date().toISOString() };
  rows.push(record);
  return record;
};
db.update = (store, id, updates) => {
  const record = db.load(store).find(row => row.id === id);
  if (!record) return null;
  Object.assign(record, updates);
  return record;
};
function interaction(customId, kind = 'Button') {
  const result = {
    customId, user: { id: 'owner' }, member: { id: 'owner' },
    guild: { id: 'guild', ownerId: 'owner', channels: { cache: new Collection() } },
    reply: async payload => { result.payload = payload; },
    showModal: async payload => { result.modal = payload; }
  };
  for (const type of ['Button', 'StringSelectMenu', 'UserSelectMenu', 'RoleSelectMenu', 'ModalSubmit', 'ChatInputCommand']) {
    result[`is${type}`] = () => type === kind;
  }
  return result;
}

test('all retained commands and events load; slash payloads validate', () => {
  const commands = fs.readdirSync(path.join(__dirname, '../commands')).map(file => require(`../commands/${file}`).data.toJSON());
  assert.equal(commands.length, 13);
  const names = commands.map(command => command.name);
  for (const name of ['rank', 'close', 'reopen', 'apphistory', 'appstats', 'announce', 'announce-staff', 'rules', 'setup', 'staffguide', 'suggest', 'ticketstats', 'schedule-announcement']) assert.ok(names.includes(name));
  for (const name of ['infraction', 'removeinfraction', 'loa', 'blacklist', 'duty', 'logshift', 'onduty', 'staffhours', 'staffleaderboard', 'report-player', 'session', 'profile', 'staffprofile', 'staffnote', 'editstaffprofile', 'backup', 'restore', 'owner-shutdown', 'owner-startup', 'wipe-server-chat']) assert.ok(!names.includes(name));
  for (const file of fs.readdirSync(path.join(__dirname, '../events'))) require(`../events/${file}`);
});

test('server setup builds valid dashboards and retains ticket/application panels', async () => {
  const guild = mocks.createGuild();
  const built = await require('../utils/serverBuilder').buildServer(guild);
  const allChannels = Object.values(structure.categories).flatMap(category => category.channels);
  assert.equal(new Set(Object.values(built).map(c => c.id)).size, allChannels.length);
  const channelCount = guild.channels.cache.size;
  // Existing channels and dynamically renamed statistics must survive another setup.
  built.STATS_1.name = '📊 Members: 42';
  await require('../utils/serverBuilder').buildServer(guild);
  assert.equal(guild.channels.cache.size, channelCount);
  assert.ok(!structure.categories.STAFF_TRAINING);
  assert.equal(guild.roles.cache.size, Object.keys(structure.roles).length);
  assert.ok(!structure.categories.HUMAN_RESOURCES && !structure.categories.INTERNAL_AFFAIRS);
  const sent = [...guild.channels.cache.values()].flatMap(c => c.sent);
  const hub = sent.find(p => p.embeds?.[0]?.title?.includes('Control Hub'));
  assert.ok(hub);
  const ids = hub.components.flatMap(row => {
    assert.ok(row.components.length > 0 && row.components.length <= 5);
    return row.components.map(c => c.custom_id);
  });
  for (const id of ['dash_tickets', 'dash_applications', 'dash_promote', 'dash_demote', 'dash_offices', 'staffdm_open', 'staffids_manage', 'staffguide_manage']) assert.ok(ids.includes(id));
  assert.ok(!ids.some(id => /loa|blacklist|shifts|moderation|departments|performance|terminate|editbot|mass_delete|activity_check|dash_dm/.test(id)));
  assert.ok(sent.some(p => p.components?.some(row => row.components.some(c => c.custom_id === 'ticket_open'))));
  assert.ok(sent.some(p => p.components?.some(row => row.components.some(c => c.custom_id === 'app_open'))));
});

test('ticket menu drops a saved blacklist appeal override and keeps custom ticket types', async () => {
  db.save('settings', [{ key: 'ticketTypesOverride_guild', value: {
    BLACKLIST_APPEAL: { label: 'Legacy appeal', questions: [] },
    CUSTOM: { label: 'Custom support', staffRole: 'SUPPORT', questions: [] }
  } }]);
  const i = interaction('ticket_open');
  await handler._handle(i, {});
  const values = i.payload.components[0].toJSON().components[0].options.map(o => o.value);
  assert.ok(values.includes('SUPPORT') && values.includes('CUSTOM') && values.includes('APPEAL'));
  assert.ok(!values.includes('BLACKLIST_APPEAL'));
  db.save('settings', []);
});

test('staff guide publishes stable panels and ID controls', async () => {
  const guild = mocks.createGuild('guide-test');
  const channel = mocks.createChannel(guild, { name: 'staff-guide' });
  const i = mocks.interaction(guild, '');
  i.options = { getString: () => null };
  await require('../commands/staffguide').execute(i);
  await require('../commands/staffguide').execute(i);
  assert.equal(channel.store.size, 4);
  const main = [...channel.store.values()].find(m => m.embeds[0].title === '📘 Staff Guide');
  assert.ok(main.components.flatMap(r => r.components).some(b => b.custom_id === 'staffid_get'));
  assert.ok(!/hr_open_case|ia_open_case/.test(JSON.stringify([...channel.store.values()])));
});

test('controls on old Discord messages report removal without running a retired system', async () => {
  for (const id of ['dash_loa', 'dash_blacklist', 'dash_shifts', 'dash_moderation', 'hr_open_case', 'ia_anon_report', 'case_claim::IA::IA-001', 'search_case', 'removeinfraction_select::member', 'dash_departments', 'dash_performance_review', 'dash_activity_check', 'dash_terminate', 'dept_manage_list', 'editprofile_field_select::member']) {
    const i = interaction(id);
    await handler._handle(i, {});
    assert.match(i.payload.content, /removed from the bot/);
  }
});

test('an old application picker cannot open a retired application', async () => {
  const i = interaction('app_type_select', 'StringSelectMenu');
  i.values = ['BLACKLIST_APPEAL'];
  await handler._handle(i, {});
  assert.match(i.payload.content, /no longer available/);
});

test('all explicitly protected channel groups match the original server layout', () => {
  const expected = require('./preserved-channels.json');
  for (const [category, channels] of Object.entries(expected)) {
    assert.ok(structure.categories[category], `Missing category ${category}`);
    assert.deepEqual(structure.categories[category].channels.map(c => c.name), channels);
  }
  assert.ok(!structure.categories.STAFF_TRAINING);
  assert.ok(!structure.categories.HUMAN_RESOURCES);
  assert.ok(!structure.categories.INTERNAL_AFFAIRS);
});

test('promotion and demotion still update roles, history, notifications and logs', async () => {
  for (const action of ['promote', 'demote']) {
    const i = interaction(`rank_reason_modal::${action}::member::new`, 'ModalSubmit');
    i.fields = { getTextInputValue: () => 'Rank change reason' };
    const prior = { id: 'prior', name: structure.roles.MODERATOR.name, position: 10 };
    const next = { id: 'new', name: structure.roles.HEAD_STAFF.name, position: 20 };
    const ping = { id: 'ping', name: structure.roles.STAFF_PING.name };
    const changes = [];
    const notifications = [];
    const target = { roles: { cache: new Collection([['prior', prior]]), remove: async r => changes.push(`remove:${r.id}`), add: async r => changes.push(`add:${r.id}`) }, send: async payload => notifications.push(payload) };
    const logs = [];
    i.guild.roles = { cache: new Collection([['prior', prior], ['new', next], ['ping', ping]]) };
    i.guild.members = { fetch: async () => target };
    i.guild.channels.cache.set('log', { name: 'promotions-demotions', send: async p => logs.push(p) });
    await handler._handle(i, {});
    assert.deepEqual(changes, ['remove:prior', 'add:new', 'add:ping']);
    const profile = roles.getOrCreateProfile('guild', 'member');
    assert.equal(profile[action === 'promote' ? 'promotions' : 'demotions'].length, 1);
    assert.equal(logs.length, 1);
    assert.equal(notifications.length, 1);
    assert.match(i.payload.content, new RegExp(action === 'promote' ? 'promoted' : 'demoted'));
  }
});

test('offices still create a private channel for selected roles', async () => {
  const i = interaction('office_roles_select::Meeting', 'RoleSelectMenu');
  i.values = ['role1'];
  i.guild.roles = { everyone: { id: 'everyone' } };
  i.guild.channels.cache.set('offices', { id: 'offices', name: 'Offices', type: ChannelType.GuildCategory });
  let created;
  i.guild.channels.create = async data => { created = data; return { id: 'room' }; };
  await handler._handle(i, {});
  assert.equal(created.parent, 'offices');
  assert.deepEqual(created.permissionOverwrites[1], { id: 'role1', allow: ['ViewChannel', 'SendMessages'] });
  assert.ok(db.load('offices').some(o => o.channelId === 'room'));
});

test('startup schedules only announcements and the retained voice statistics', async () => {
  const timers = [];
  const original = global.setInterval;
  global.setInterval = (fn, ms) => { timers.push({ fn, ms }); return 1; };
  try {
    await require('../events/ready').execute({ user: { tag: 'TestBot' }, guilds: { cache: new Collection() } });
    assert.deepEqual(timers.map(t => t.ms), [60_000, 300_000]);
    for (const timer of timers) await timer.fn();
  } finally { global.setInterval = original; }
});

