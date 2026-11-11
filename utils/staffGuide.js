const { randomBytes } = require('node:crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./dataStore');
const structure = require('../config/structure');
const { publishPanel } = require('./managedPanels');
const MAX_INFO_BUTTONS = 19;
const DEFAULT_BUTTONS = [
  { id: 'id-help', label: 'How Staff IDs Work', content: 'Click Get Staff ID and enter the staff email registered to your Discord account by the Owner or Co-Owner. Your ID stays the same every time. No email inbox access is needed.' },
  { id: 'ticket-help', label: 'Staff Ticket Help', content: 'Open a ticket, choose Staff Only Tickets, select a reason, and enter your own staff ID. You can report staff, log missed hours, or contest an infraction, strike, warning, or demotion.' },
  { id: 'contact-help', label: 'Management Help', content: 'If your email is not registered or your staff details need correcting, contact the Owner or Co-Owner in Discord. Do not share passwords.' }
];
function getGuideConfig(guildId) {
  const stored = db.find('settings', r => r.key === `staffGuideConfig_${guildId}`)[0]?.value || {};
  return { melonlyLink: stored.melonlyLink || 'https://melonly.xyz/', buttons: stored.buttons || DEFAULT_BUTTONS.map(b => ({ ...b })) };
}
function saveGuideConfig(guildId, config) {
  const settings = db.load('settings');
  const key = `staffGuideConfig_${guildId}`;
  let row = settings.find(s => s.key === key);
  if (!row) { row = { id: `settings_${key}`, key }; settings.push(row); }
  row.value = config;
  db.save('settings', settings);
}
function changeInfoButton(guildId, action, id, label, content) {
  const config = getGuideConfig(guildId);
  const index = config.buttons.findIndex(b => b.id === id);
  if (action !== 'add' && index < 0) throw new Error('That button no longer exists. Reopen Staff Guide Settings.');
  if (action === 'remove') config.buttons.splice(index, 1);
  else {
    label = String(label || '').trim(); content = String(content || '').trim();
    if (!label || label.length > 80 || !content || content.length > 4000) throw new Error('Use a button label of 1–80 characters and information of 1–4000 characters.');
    if (action === 'add') {
      if (config.buttons.length >= MAX_INFO_BUTTONS) throw new Error('You can add up to 19 information buttons.');
      config.buttons.push({ id: randomBytes(6).toString('hex'), label, content });
    } else if (action === 'edit') config.buttons[index] = { ...config.buttons[index], label, content };
    else throw new Error('Unknown button action.');
  }
  saveGuideConfig(guildId, config);
  return config;
}
function buildGuideMessages(guildId) {
  const config = getGuideConfig(guildId);
  const controls = [new ButtonBuilder().setCustomId('staffid_get').setLabel('Get Staff ID').setStyle(ButtonStyle.Primary), ...config.buttons.map(b => new ButtonBuilder().setCustomId(`staffinfo_${b.id}`).setLabel(b.label).setStyle(ButtonStyle.Secondary))];
  const rows = [];
  for (let i = 0; i < controls.length; i += 5) rows.push(new ActionRowBuilder().addComponents(...controls.slice(i, i + 5)));
  const embed = (title, description) => new EmbedBuilder().setTitle(title).setDescription(description).setColor(structure.embedColor);
  return [
    { key: 'staff-guide', title: '📘 Staff Guide', payload: { embeds: [embed('📘 Staff Guide', 'Get your permanent staff ID below, or open an information button. Enter the email registered to your Discord account. You do not need to receive or read emails.').addFields(
      { name: 'Staff Dashboard (Melonly)', value: `[Open Dashboard](${config.melonlyLink})` },
      { name: 'Staff Tickets', value: 'Open a ticket → Staff Only Tickets. Your own staff ID is required. Go to staff guide to get your staff ID.' }
    )], components: rows } },
    { key: 'guide-started', title: '👋 Welcome to the Staff Team!', payload: { embeds: [embed('👋 Welcome to the Staff Team!', 'Read the rules and staff expectations before getting started.').addFields(
      { name: '🚨 Light Strings (Patrol Vehicle)', value: 'Light String 1 — patrol/driving\nLight String 2 — traffic stops\nLight String 3 — parked or out of your vehicle' },
      { name: '⚠️ Reporting Other Staff', value: 'Open a Staff Only ticket to report staff misconduct. Contact the Owner or Co-Owner for urgent concerns.' }
    )] } },
    { key: 'guide-expectations', title: '📋 Staff Expectations', payload: { embeds: [embed('📋 Staff Expectations', '1. Stay professional and impartial.\n2. Respond to tickets promptly while available.\n3. Log promotions and demotions.\n4. Never abuse admin commands.\n5. Escalate uncertainty to Management.\n6. Treat every member with respect.\n7. Report staff misconduct.')] } },
    { key: 'guide-punishment', title: '⚖️ Punishment Guide', payload: { embeds: [embed('⚖️ Punishment Guide', '**Community Members:**\nWarning 1 — Verbal warning\nWarning 2 — Verbal warning\nWarning 3 — Verbal warning + final warning DM\nWarning 4 — Kick\nWarning 5 — Permanent ban')] } }
  ];
}
async function publishStaffGuide(guild, { replace = false } = {}) {
  const channel = guild.channels.cache.find(c => c.name.includes('staff-guide'));
  if (!channel) throw new Error('Run /setup first to create the staff-guide channel.');
  for (const item of buildGuideMessages(guild.id)) await publishPanel(guild, channel, item.key, item.payload, m => m.embeds.some(e => e.title === item.title), { replace: replace && item.key === 'staff-guide', pin: item.key !== 'staff-guide' });
  return channel;
}
module.exports = { MAX_INFO_BUTTONS, getGuideConfig, saveGuideConfig, changeInfoButton, buildGuideMessages, publishStaffGuide };
