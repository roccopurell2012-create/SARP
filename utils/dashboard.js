const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const structure = require('../config/structure');
const { publishPanel } = require('./managedPanels');
function buildDashboard() {
    const embed = new EmbedBuilder()
      .setTitle(`${structure.botName} — Control Hub`)
      .setDescription("Manage tickets, applications, rules, announcements, partnerships, staff ranks, and offices.")
      .setColor(structure.embedColor)
      .setFooter({ text: `${structure.botName} | Dashboard` })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("dash_welcome").setLabel("Welcome System").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("dash_tickets").setLabel("Ticket System").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("dash_roles").setLabel("Auto Roles").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("dash_applications").setLabel("Staff Applications").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("dash_app_results").setLabel("Application Results").setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("dash_logging").setLabel("Logging").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("dash_announcements").setLabel("Announcements").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("dash_promote").setLabel("Promote").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("dash_demote").setLabel("Demote").setStyle(ButtonStyle.Danger)
    );
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("dash_partnerships").setLabel("Partnerships").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("dash_edit").setLabel("Edit Rules/Announcements").setStyle(ButtonStyle.Secondary)
    );
    const row4 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("dash_offices").setLabel("Offices").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("staffdm_open").setLabel("Send Bot DM").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("staffids_manage").setLabel("Staff Emails / IDs").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("staffguide_manage").setLabel("Staff Guide Settings").setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2, row3, row4] };
}
async function publishDashboard(guild, { replace = false } = {}) {
  const channel = guild.channels.cache.find(c => c.name.endsWith('staff-dashboard'));
  if (!channel) throw new Error('Run /setup first to create the staff-dashboard channel.');
  return publishPanel(guild, channel, 'dashboard', buildDashboard(), m => m.embeds.some(e => e.title?.endsWith(' — Control Hub')), { replace });
}
module.exports = { buildDashboard, publishDashboard };
