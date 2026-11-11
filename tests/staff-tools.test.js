const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const mocks = require('./helpers/discord');
const db = require('../utils/dataStore');
const ids = require('../utils/staffIdentity');
const guides = require('../utils/staffGuide');
const { publishPanel } = require('../utils/managedPanels');
const handler = require('../events/interactionCreate');
const structure = require('../config/structure');
let data;
beforeEach(() => { data = {}; });
db.load = key => data[key] ||= [];
db.save = (key, value) => { data[key] = value; };
db.find = (key, pred) => db.load(key).filter(pred);
db.add = (key, record) => { const row = { ...record, id: `${key}_${db.load(key).length + 1}` }; db.load(key).push(row); return row; };
db.update = (key, id, updates) => { const row = db.load(key).find(r => r.id === id); if (!row) return null; Object.assign(row, updates); return row; };
function member(guild, userId, roleKey = 'MODERATOR') {
  const role = { id: roleKey, name: structure.roles[roleKey].name, position: 1 };
  guild.roles.cache.set(role.id, role);
  const person = { id: userId, user: { id: userId, bot: false }, roles: { cache: new Collection([[role.id, role]]) }, permissions: { has: () => false }, send: async () => {} };
  guild.members.cache.set(userId, person); return person;
}
function fields(i, values) { i.fields = { getTextInputValue: key => values[key] || '' }; return i; }

test('email registration normalises addresses, rejects collisions, and preserves assigned IDs on edits', () => {
  ids.registerEmail('g', 'one', ' FIRST@Example.COM ', 'owner');
  const first = ids.claimIdentity('g', 'one', 'first@example.com');
  assert.equal(first.staffId, 'LA-STAFF-0001');
  assert.equal(ids.claimIdentity('g', 'one', 'FIRST@example.com').staffId, first.staffId);
  assert.throws(() => ids.registerEmail('g', 'two', 'first@example.com', 'owner'), /already assigned/);
  ids.registerEmail('g', 'one', 'updated@example.com', 'owner');
  assert.equal(ids.claimIdentity('g', 'one', 'updated@example.com').staffId, first.staffId);
  assert.throws(() => ids.claimIdentity('g', 'one', 'first@example.com'), /not registered/);
  ids.registerEmail('g', 'two', 'second@example.com', 'owner');
  assert.equal(ids.claimIdentity('g', 'two', 'second@example.com').staffId, 'LA-STAFF-0002');
});

test('staff identities cannot be claimed by another member or used across guilds', () => {
  ids.registerEmail('g', 'one', 'one@example.com', 'owner');
  assert.throws(() => ids.claimIdentity('g', 'two', 'one@example.com'), /not registered/);
  assert.throws(() => ids.claimIdentity('other', 'one', 'one@example.com'), /not registered/);
  const record = ids.claimIdentity('g', 'one', 'one@example.com');
  assert.throws(() => ids.checkTicketId('g', 'two', record.staffId), /own staff ID/);
  assert.throws(() => ids.checkTicketId('other', 'one', record.staffId), /own staff ID/);
  assert.equal(ids.checkTicketId('g', 'one', record.staffId.toLowerCase()).userId, 'one');
});

test('ID records survive a real datastore reload and a new Node process', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sarp-identities-'));
  const cwd = path.join(__dirname, '..');
  const env = { ...process.env, SARP_DATA_DIR: directory };
  try {
    const create = "const s=require('./utils/staffIdentity');s.registerEmail('persist','member','staff@example.com','owner');process.stdout.write(s.claimIdentity('persist','member','staff@example.com').staffId)";
    const claim = "const s=require('./utils/staffIdentity');process.stdout.write(s.claimIdentity('persist','member','staff@example.com').staffId)";
    assert.equal(execFileSync(process.execPath, ['-e', create], { cwd, env, encoding: 'utf8' }), 'LA-STAFF-0001');
    assert.equal(execFileSync(process.execPath, ['-e', claim], { cwd, env, encoding: 'utf8' }), 'LA-STAFF-0001');
    assert.ok(fs.existsSync(path.join(directory, 'staff_identities.json')));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('owner controls reject non-owner staff at each modal/select/button stage', async () => {
  const guild = mocks.createGuild(); member(guild, 'mod');
  for (const [id, kind] of [['staffdm_open','Button'], ['staffdm_target','UserSelectMenu'], ['staffdm_send::target','ModalSubmit'], ['staffids_manage','Button'], ['staffids_target','UserSelectMenu'], ['staffids_save::mod','ModalSubmit'], ['staffguide_manage','Button'], ['staffguide_add','Button'], ['staffguide_select::remove','StringSelectMenu'], ['staffguide_save::edit::id-help','ModalSubmit']]) {
    const i = mocks.interaction(guild, id, kind, 'mod');
    await handler._handle(i, {});
    assert.match(i.payload.content, /Only the Owner and Co-Owner/);
    assert.ok(!i.modal);
  }
  assert.equal(db.load('staffIdentities').length, 0);
});

test('co-owner controls use registered role IDs even after a role is renamed', async () => {
  const guild = mocks.createGuild(); const co = member(guild, 'co', 'CO_OWNER');
  assert.ok(ids.isOwnerTeam(guild, co));
  guild.roles.cache.get('CO_OWNER').name = 'Renamed Co-Owner';
  assert.ok(ids.isOwnerTeam(guild, co));
  const i = mocks.interaction(guild, 'staffids_manage', 'Button', 'co');
  await handler._handle(i, {});
  assert.equal(i.payload.embeds[0].toJSON().title, 'Staff Emails / IDs');
});

test('bot DMs send only to the selected server member and report delivery failures', async () => {
  const guild = mocks.createGuild(); const target = member(guild, 'target');
  const sent = [];
  target.send = async payload => sent.push(payload);
  const log = mocks.createChannel(guild, { name: 'bot-logs' });
  const pick = mocks.interaction(guild, 'staffdm_target', 'UserSelectMenu'); pick.values = ['target'];
  await handler._handle(pick, {});
  assert.equal(pick.modal.toJSON().custom_id, 'staffdm_send::target');
  const i = fields(mocks.interaction(guild, 'staffdm_send::target', 'ModalSubmit'), { message: 'Hello staff member!' });
  await handler._handle(i, {});
  assert.equal(sent[0].content, 'Hello staff member!');
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
  assert.match(i.payload.content, /was sent/);
  assert.ok(!JSON.stringify(log.sent).includes('Hello staff member!'));
  target.send = async () => { throw new Error('Cannot send messages to this user'); };
  const failed = fields(mocks.interaction(guild, 'staffdm_send::target', 'ModalSubmit'), { message: 'Test failure' });
  await handler._handle(failed, {});
  assert.match(failed.payload.content, /could not deliver/);
  assert.equal(log.store.size, 1);
});

test('registered staff retrieve the same ID twice; non-staff cannot claim one', async () => {
  const guild = mocks.createGuild(); member(guild, 'staff');
  ids.registerEmail(guild.id, 'staff', 'staff@example.com', 'owner');
  for (let n = 0; n < 2; n++) {
    const i = fields(mocks.interaction(guild, 'staffid_claim', 'ModalSubmit', 'staff'), { email: 'staff@example.com' });
    await handler._handle(i, {});
    assert.match(i.payload.content, /LA-STAFF-0001/);
    assert.ok(i.payload.ephemeral);
  }
  ids.registerEmail(guild.id, 'guest', 'guest@example.com', 'owner');
  const guest = fields(mocks.interaction(guild, 'staffid_claim', 'ModalSubmit', 'guest'), { email: 'guest@example.com' });
  await handler._handle(guest, {});
  assert.match(guest.payload.content, /current staff/);
  assert.equal(ids.getIdentity(guild.id, 'guest').staffId, null);
});

test('staff-only ticket category lists the requested reasons and modal includes the ID hint', async () => {
  const guild = mocks.createGuild(); member(guild, 'staff');
  const i = mocks.interaction(guild, 'ticket_open', 'Button', 'staff');
  await handler._handle(i, {});
  assert.ok(i.payload.components[0].toJSON().components[0].options.some(o => o.value === 'STAFF_ONLY'));
  const group = mocks.interaction(guild, 'ticket_type_select', 'StringSelectMenu', 'staff'); group.values = ['STAFF_ONLY'];
  await handler._handle(group, {});
  assert.equal(group.payload.components[0].toJSON().components[0].options.length, 7);
  for (const type of Object.keys(structure.staffTicketTypes)) {
    const priority = mocks.interaction(guild, `ticket_priority_intake::${type}`, 'StringSelectMenu', 'staff'); priority.values = ['normal'];
    await handler._handle(priority, {});
    const json = priority.modal.toJSON();
    assert.ok(json.components.length <= 5);
    assert.equal(json.components[0].components[0].custom_id, 'staffId');
    assert.equal(json.components[0].components[0].placeholder, 'Go to staff guide to get your staff ID');
  }
});

test('staff ticket creation rejects missing/wrong/borrowed IDs and nonstaff before creating channels', async () => {
  const guild = mocks.createGuild(); member(guild, 'staff'); member(guild, 'other');
  ids.registerEmail(guild.id, 'staff', 'staff@example.com', 'owner');
  ids.registerEmail(guild.id, 'other', 'other@example.com', 'owner');
  const own = ids.claimIdentity(guild.id, 'staff', 'staff@example.com').staffId;
  const borrowed = ids.claimIdentity(guild.id, 'other', 'other@example.com').staffId;
  for (const wrong of ['', 'LA-STAFF-9999', borrowed]) {
    const i = fields(mocks.interaction(guild, 'ticket_intake::STAFF_REPORT::normal', 'ModalSubmit', 'staff'), { staffId: wrong });
    await handler._handle(i, {});
    assert.match(i.payload.content, /own staff ID/);
  }
  const guest = fields(mocks.interaction(guild, 'ticket_intake::STAFF_REPORT::normal', 'ModalSubmit', 'guest'), { staffId: own });
  await handler._handle(guest, {});
  assert.match(guest.payload.content, /current staff/);
  assert.equal(guild.channels.cache.size, 0);
  assert.equal(db.load('tickets').length, 0);
});

test('a verified staff ticket records the ID, stays private, and enters the existing support queue', async () => {
  const guild = mocks.createGuild(); member(guild, 'staff');
  const queue = mocks.createChannel(guild, { name: 'ticket-queue' });
  ids.registerEmail(guild.id, 'staff', 'staff@example.com', 'owner');
  const staffId = ids.claimIdentity(guild.id, 'staff', 'staff@example.com').staffId;
  let created;
  const originalCreate = guild.channels.create;
  guild.channels.create = async payload => { created = payload; return originalCreate(payload); };
  const i = fields(mocks.interaction(guild, 'ticket_intake::STAFF_HOURS::normal', 'ModalSubmit', 'staff'), { staffId, q1: 'Missing two hours', q2: 'Details', q3: 'none' });
  await handler._handle(i, {});
  assert.match(i.payload.content, /Ticket created/);
  assert.ok(i.deferred);
  const ticket = db.load('tickets')[0];
  assert.equal(ticket.staffId, staffId); assert.ok(ticket.staffOnly);
  assert.ok(created.permissionOverwrites.some(p => p.id.id === 'everyone' && p.deny.includes('ViewChannel')));
  assert.ok(created.permissionOverwrites.some(p => p.id === 'bot'));
  assert.ok(queue.sent[0].embeds[0].fields.some(f => f.name === 'Staff ID' && f.value === staffId));
  assert.equal(queue.sent[0].components[0].components[0].custom_id, `ticket_claim_${ticket.id}`);
});

test('ordinary support tickets still open without a staff ID', async () => {
  const guild = mocks.createGuild(); mocks.createChannel(guild, { name: 'ticket-queue' });
  const i = fields(mocks.interaction(guild, 'ticket_intake::SUPPORT::normal', 'ModalSubmit', 'guest'), { q1: 'Player', q2: 'Need assistance' });
  await handler._handle(i, {});
  assert.match(i.payload.content, /Ticket created/);
  assert.equal(db.load('tickets')[0].staffId, null);
});

test('info buttons add/edit/remove and remain within Discord component limits', () => {
  const first = guides.changeInfoButton('g', 'add', null, 'New policy', 'Read this policy.');
  const added = first.buttons.at(-1);
  assert.ok(added.id);
  guides.changeInfoButton('g', 'edit', added.id, 'Updated policy', 'Updated information.');
  assert.equal(guides.getGuideConfig('g').buttons.at(-1).content, 'Updated information.');
  guides.changeInfoButton('g', 'remove', added.id);
  assert.ok(!guides.getGuideConfig('g').buttons.some(b => b.id === added.id));
  assert.throws(() => guides.changeInfoButton('g', 'edit', 'missing', 'Label', 'Info'), /no longer exists/);
  assert.throws(() => guides.changeInfoButton('g', 'add', null, 'L'.repeat(81), 'Info'), /1–80/);
  while (guides.getGuideConfig('g').buttons.length < guides.MAX_INFO_BUTTONS) guides.changeInfoButton('g', 'add', null, 'More help', 'Details');
  assert.throws(() => guides.changeInfoButton('g', 'add', null, 'Too many', 'Info'), /up to 19/);
  const json = guides.buildGuideMessages('g')[0].payload.components.map(r => r.toJSON());
  assert.ok(json.length <= 5); assert.ok(json.every(r => r.components.length <= 5));
});

test('submitting guide edits replaces exactly one guide and dashboard, while retaining ID records', async () => {
  const guild = mocks.createGuild();
  const guide = mocks.createChannel(guild, { name: 'staff-guide' });
  const dash = mocks.createChannel(guild, { name: 'staff-dashboard' });
  await guides.publishStaffGuide(guild);
  await require('../utils/dashboard').publishDashboard(guild);
  const oldGuide = [...guide.store.keys()][0]; const oldDash = [...dash.store.keys()][0];
  ids.registerEmail(guild.id, 'owner', 'owner@example.com', 'owner');
  const stable = ids.claimIdentity(guild.id, 'owner', 'owner@example.com').staffId;
  const edit = fields(mocks.interaction(guild, 'staffguide_save::add', 'ModalSubmit'), { label: 'New Instructions', info: 'These instructions are new.' });
  await handler._handle(edit, {});
  assert.match(edit.payload.content, /Saved/);
  assert.equal(guide.store.size, 4); assert.equal(dash.store.size, 1);
  assert.ok(!guide.store.has(oldGuide)); assert.ok(!dash.store.has(oldDash));
  const main = [...guide.store.values()].find(m => m.embeds[0].title === '📘 Staff Guide');
  assert.ok(main.components.flatMap(r => r.components).some(b => b.label === 'New Instructions'));
  assert.equal(ids.claimIdentity(guild.id, 'owner', 'owner@example.com').staffId, stable);
});

test('panel migration removes old bot duplicates but keeps member messages', async () => {
  const guild = mocks.createGuild(); const channel = mocks.createChannel(guild, { name: 'staff-dashboard' });
  const payload = { embeds: [{ title: 'Example Panel' }] };
  channel.addMessage(payload, 'bot'); channel.addMessage(payload, 'bot');
  const human = channel.addMessage(payload, 'human');
  await publishPanel(guild, channel, 'example', payload, m => m.embeds[0]?.title === 'Example Panel');
  await Promise.all([publishPanel(guild, channel, 'example', payload, m => m.embeds[0]?.title === 'Example Panel'), publishPanel(guild, channel, 'example', payload, m => m.embeds[0]?.title === 'Example Panel')]);
  assert.equal(channel.store.size, 2); assert.ok(channel.store.has(human.id));
});

test('owner registration through the dashboard binds the email to the selected member', async () => {
  const guild = mocks.createGuild(); member(guild, 'staff');
  const pick = mocks.interaction(guild, 'staffids_target', 'UserSelectMenu'); pick.values = ['staff'];
  await handler._handle(pick, {});
  assert.equal(pick.modal.toJSON().custom_id, 'staffids_save::staff');
  const save = fields(mocks.interaction(guild, 'staffids_save::staff', 'ModalSubmit'), { email: 'staff@example.com' });
  await handler._handle(save, {});
  assert.match(save.payload.content, /Email saved/);
  assert.equal(ids.getIdentity(guild.id, 'staff').email, 'staff@example.com');
  assert.equal(ids.getIdentity(guild.id, 'staff').staffId, null);
});

test('information button clicks show only their configured information privately', async () => {
  const guild = mocks.createGuild(); member(guild, 'staff');
  const i = mocks.interaction(guild, 'staffinfo_id-help', 'Button', 'staff');
  await handler._handle(i, {});
  assert.equal(i.payload.embeds[0].toJSON().title, 'How Staff IDs Work');
  assert.ok(i.payload.ephemeral);
  assert.equal(db.load('staffIdentities').length, 0);
});

test('guide edit and remove controls update both published panels without duplicate messages', async () => {
  const guild = mocks.createGuild();
  const channel = mocks.createChannel(guild, { name: 'staff-guide' });
  const dashboard = mocks.createChannel(guild, { name: 'staff-dashboard' });
  await guides.publishStaffGuide(guild);
  await require('../utils/dashboard').publishDashboard(guild);
  const edit = fields(mocks.interaction(guild, 'staffguide_save::edit::id-help', 'ModalSubmit'), { label: 'ID Instructions', info: 'Updated staff ID details.' });
  await handler._handle(edit, {});
  const show = mocks.interaction(guild, 'staffinfo_id-help');
  await handler._handle(show, {});
  assert.equal(show.payload.embeds[0].toJSON().description, 'Updated staff ID details.');
  const remove = mocks.interaction(guild, 'staffguide_select::remove', 'StringSelectMenu'); remove.values = ['id-help'];
  await handler._handle(remove, {});
  assert.ok(!guides.getGuideConfig(guild.id).buttons.some(b => b.id === 'id-help'));
  assert.equal(channel.store.size, 4); assert.equal(dashboard.store.size, 1);
  const main = [...channel.store.values()].find(m => m.embeds[0].title === '📘 Staff Guide');
  assert.ok(main.components.flatMap(r => r.components).some(b => b.custom_id === 'staffid_get'));
});
