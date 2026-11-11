// Routed from interactionCreate; not a standalone Discord event.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const identity = require('./staffIdentity');
const guide = require('./staffGuide');
const { publishDashboard } = require('./dashboard');
const db = require('./dataStore');
const structure = require('../config/structure');
const { logAction } = require('./logger');

const reply = (i, content) => i.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
function textModal(id, title, fields) {
  const modal = new ModalBuilder().setCustomId(id).setTitle(title);
  for (const f of fields) {
    const input = new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.long ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(true).setMaxLength(f.max);
    if (f.value) input.setValue(f.value);
    if (f.placeholder) input.setPlaceholder(f.placeholder);
    modal.addComponents(row(input));
  }
  return modal;
}
function guideManager(guildId) {
  const config = guide.getGuideConfig(guildId);
  return {
    embeds: [new EmbedBuilder().setTitle('Staff Guide Settings').setDescription('Add, edit, or remove information buttons. Get Staff ID always stays. Changes replace the published guide and refresh the dashboard.').addFields({ name: 'Information buttons', value: config.buttons.map(b => `• ${b.label}`).join('\n') || 'No information buttons.' }).setColor(structure.embedColor)],
    components: [row(button('staffguide_add', 'Add', ButtonStyle.Success), button('staffguide_edit', 'Edit'), button('staffguide_remove', 'Remove', ButtonStyle.Danger))], ephemeral: true
  };
}
async function saveGuideChange(i, action, id, label, content) {
  try { guide.changeInfoButton(i.guild.id, action, id, label, content); }
  catch (err) { await reply(i, err.message); return; }
  await i.deferReply({ ephemeral: true });
  try {
    await guide.publishStaffGuide(i.guild, { replace: true });
    await publishDashboard(i.guild, { replace: true });
    await logAction(i.guild, '📘 Staff Guide Updated', `<@${i.user.id}> ${action === 'add' ? 'added' : action === 'edit' ? 'edited' : 'removed'} an information button.`);
    await i.editReply({ content: '✅ Saved. The staff guide and dashboard have been replaced with the updated panels.', ...guideManager(i.guild.id) });
  } catch (err) {
    console.error('Staff guide publish failed:', err);
    await i.editReply({ content: 'Your changes were saved, but I could not refresh the panels. Check my channel permissions and run /setup to retry.' });
  }
}
async function handleStaffTools(i) {
  const id = i.customId || '';
  if (!/^(staffdm_|staffids_|staffguide_|staffid_|staffinfo_)/.test(id)) return false;
  if (!i.guild) { await reply(i, 'Use this control inside the server.'); return true; }
  const admin = /^(staffdm_|staffids_|staffguide_)/.test(id);
  if (admin && !identity.isOwnerTeam(i.guild, i.member)) { await reply(i, 'Only the Owner and Co-Owner can use this control.'); return true; }
  if (!admin && !identity.isStaff(i.guild, i.member)) { await reply(i, 'This control is for current staff members only.'); return true; }

  if (id === 'staffdm_open' && i.isButton()) {
    await i.reply({ content: 'Choose the server member who should receive your message.', components: [row(new UserSelectMenuBuilder().setCustomId('staffdm_target').setPlaceholder('Choose a member').setMinValues(1).setMaxValues(1))], ephemeral: true });
  } else if (id === 'staffdm_target' && i.isUserSelectMenu()) {
    await i.showModal(textModal(`staffdm_send::${i.values[0]}`, 'Send a Bot DM', [{ id: 'message', label: 'Message to send', long: true, max: 2000 }]));
  } else if (id.startsWith('staffdm_send::') && i.isModalSubmit()) {
    const targetId = id.split('::')[1];
    const message = i.fields.getTextInputValue('message').trim();
    if (!message || message.length > 2000) { await reply(i, 'Enter a message of 1–2000 characters.'); return true; }
    await i.deferReply({ ephemeral: true });
    const member = await i.guild.members.fetch(targetId).catch(() => null);
    if (!member || member.user.bot) { await i.editReply({ content: 'Choose a human member who is still in this server.' }); return true; }
    try { await member.send({ content: message, allowedMentions: { parse: [] } }); }
    catch { await i.editReply({ content: 'I could not deliver that DM. The member may have DMs disabled or may have blocked the bot.' }); return true; }
    await logAction(i.guild, '📩 Bot DM Sent', `<@${i.user.id}> sent a bot DM to <@${targetId}>. Message content is private.`);
    await i.editReply({ content: `✅ Your message was sent to <@${targetId}>.` });
  } else if (id === 'staffids_manage' && i.isButton()) {
    const records = db.find('staffIdentities', r => r.guildId === i.guild.id);
    const description = records.slice(0, 20).map(r => `<@${r.userId}> — \`${r.email}\` — **${r.staffId || 'Not claimed'}**`).join('\n') || 'No staff emails have been registered yet.';
    await i.reply({ embeds: [new EmbedBuilder().setTitle('Staff Emails / IDs').setDescription(description.slice(0, 4000)).setFooter({ text: `${records.length} registered • showing up to 20 • no inbox access required` }).setColor(structure.embedColor)], components: [row(button('staffids_add', 'Add / Update Email', ButtonStyle.Primary))], ephemeral: true });
  } else if (id === 'staffids_add' && i.isButton()) {
    await i.reply({ content: 'Select the member this email belongs to. Only that Discord member can claim its staff ID.', components: [row(new UserSelectMenuBuilder().setCustomId('staffids_target').setPlaceholder('Select the staff member').setMinValues(1).setMaxValues(1))], ephemeral: true });
  } else if (id === 'staffids_target' && i.isUserSelectMenu()) {
    const existing = identity.getIdentity(i.guild.id, i.values[0]);
    await i.showModal(textModal(`staffids_save::${i.values[0]}`, 'Register Staff Email', [{ id: 'email', label: 'Assigned staff email', max: 254, value: existing?.email, placeholder: 'staff@yourdomain.com' }]));
  } else if (id.startsWith('staffids_save::') && i.isModalSubmit()) {
    const targetId = id.split('::')[1];
    await i.deferReply({ ephemeral: true });
    const member = await i.guild.members.fetch(targetId).catch(() => null);
    if (!member || member.user.bot) { await i.editReply({ content: 'Choose a human member who is still in this server.' }); return true; }
    let record;
    try { record = identity.registerEmail(i.guild.id, targetId, i.fields.getTextInputValue('email'), i.user.id); }
    catch (err) { await i.editReply({ content: err.message }); return true; }
    await logAction(i.guild, '🪪 Staff Email Registered', `<@${i.user.id}> updated the staff email record for <@${targetId}>.`);
    await i.editReply({ content: `✅ Email saved for <@${targetId}>. They can use Get Staff ID in staff guide.${record.staffId ? ` Their permanent ID remains **${record.staffId}**.` : ''}` });
  } else if (id === 'staffid_get' && i.isButton()) {
    await i.showModal(textModal('staffid_claim', 'Get Your Staff ID', [{ id: 'email', label: 'Registered staff email', max: 254, placeholder: 'No inbox access needed — enter your address' }]));
  } else if (id === 'staffid_claim' && i.isModalSubmit()) {
    let record;
    try { record = identity.claimIdentity(i.guild.id, i.user.id, i.fields.getTextInputValue('email')); }
    catch (err) { await reply(i, err.message); return true; }
    await reply(i, `🪪 Your permanent staff ID is **${record.staffId}**.\nUse it when opening Staff Only tickets. Verifying again returns this same ID.`);
  } else if (id.startsWith('staffinfo_') && i.isButton()) {
    const info = guide.getGuideConfig(i.guild.id).buttons.find(b => b.id === id.slice('staffinfo_'.length));
    if (!info) await reply(i, 'This information button was removed. Open the updated staff guide.');
    else await i.reply({ embeds: [new EmbedBuilder().setTitle(info.label).setDescription(info.content).setColor(structure.embedColor)], ephemeral: true });
  } else if (id === 'staffguide_manage' && i.isButton()) {
    await i.reply(guideManager(i.guild.id));
  } else if (id === 'staffguide_add' && i.isButton()) {
    if (guide.getGuideConfig(i.guild.id).buttons.length >= guide.MAX_INFO_BUTTONS) { await reply(i, 'Remove a button before adding another. The maximum is 19 information buttons.'); return true; }
    await i.showModal(textModal('staffguide_save::add', 'Add Information Button', [{ id: 'label', label: 'Button label', max: 80 }, { id: 'info', label: 'Information shown when clicked', long: true, max: 4000 }]));
  } else if (['staffguide_edit', 'staffguide_remove'].includes(id) && i.isButton()) {
    const buttons = guide.getGuideConfig(i.guild.id).buttons;
    if (!buttons.length) { await reply(i, 'There are no information buttons yet. Use Add first.'); return true; }
    const action = id === 'staffguide_edit' ? 'edit' : 'remove';
    await i.reply({ content: `Choose the information button to ${action}.`, components: [row(new StringSelectMenuBuilder().setCustomId(`staffguide_select::${action}`).setPlaceholder('Choose a button').addOptions(buttons.map(b => ({ label: b.label, value: b.id }))))], ephemeral: true });
  } else if (id.startsWith('staffguide_select::') && i.isStringSelectMenu()) {
    const action = id.split('::')[1];
    const info = guide.getGuideConfig(i.guild.id).buttons.find(b => b.id === i.values[0]);
    if (!info) { await reply(i, 'That button was removed. Reopen Staff Guide Settings.'); return true; }
    if (action === 'remove') await saveGuideChange(i, 'remove', info.id);
    else if (action === 'edit') await i.showModal(textModal(`staffguide_save::edit::${info.id}`, 'Edit Information Button', [{ id: 'label', label: 'Button label', max: 80, value: info.label }, { id: 'info', label: 'Information shown when clicked', long: true, max: 4000, value: info.content }]));
    else await reply(i, 'Reopen Staff Guide Settings.');
  } else if (id.startsWith('staffguide_save::') && i.isModalSubmit()) {
    const [, action, infoId] = id.split('::');
    if (!['add', 'edit'].includes(action)) { await reply(i, 'Reopen Staff Guide Settings.'); return true; }
    await saveGuideChange(i, action, infoId, i.fields.getTextInputValue('label'), i.fields.getTextInputValue('info'));
  } else await reply(i, 'This control is no longer available. Open the updated dashboard or guide.');
  return true;
}
module.exports = { handleStaffTools };
