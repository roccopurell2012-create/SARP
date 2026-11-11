const { ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const structure = require("../config/structure.js");
const { logAction } = require("./logger.js");
const { publishPanel } = require("./managedPanels");
const { publishDashboard } = require("./dashboard");
const { publishStaffGuide } = require("./staffGuide");

async function buildServer(guild) {
  const createdRoles = {};

  // 1. Roles
  for (const [key, roleData] of Object.entries(structure.roles)) {
    let role = guild.roles.cache.find(r => r.name === roleData.name);
    if (!role) {
      role = await guild.roles.create({ name: roleData.name, color: roleData.color, hoist: true, mentionable: true });
    }
    createdRoles[key] = role;
  }

  // 2. Categories + channels
  const createdChannels = {};
  for (const [catKey, catData] of Object.entries(structure.categories)) {
    let category = guild.channels.cache.find(c => c.name === catData.name && c.type === ChannelType.GuildCategory);
    if (!category) {
      category = await guild.channels.create({ name: catData.name, type: ChannelType.GuildCategory });
    }
    if (catData.locked) await category.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });

    for (const chData of catData.channels) {
      const statsPrefix = { STATS_1: "📊 Members:", STATS_2: "🟢 Staff Online:", STATS_3: "🎫 Open Tickets:" }[chData.key];
      const expectedType = chData.voice ? ChannelType.GuildVoice : ChannelType.GuildText;
      let channel = guild.channels.cache.find(c => c.parentId === category.id && c.type === expectedType &&
        (c.name === chData.name || (statsPrefix && c.name.startsWith(statsPrefix))));
      if (!channel) {
        channel = await guild.channels.create({
          name: chData.name,
          type: chData.voice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id
        });
      }
      if (chData.locked) await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
      await channel.permissionOverwrites.edit(guild.client.user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      createdChannels[chData.key] = channel;
    }

    // Staff Team category: every role classified as staff can see everything in it
    if (catKey === "STAFF_TEAM") {
      for (const roleKey of structure.staffRoleKeys) {
        const role = createdRoles[roleKey];
        if (role) await category.permissionOverwrites.edit(role, { ViewChannel: true, SendMessages: true, Connect: true }).catch(() => {});
      }
    }

    // Apply the configured role access list to restricted categories.
    if (catData.restrictedTo && structure[catData.restrictedTo]) {
      for (const roleKey of structure[catData.restrictedTo]) {
        const role = createdRoles[roleKey];
        if (role) await category.permissionOverwrites.edit(role, { ViewChannel: true, SendMessages: true, Connect: true }).catch(() => {});
      }
    }
  }

  // 3. Owner/Co-Owner full access everywhere
  for (const roleKey of ["OWNER", "CO_OWNER"]) {
    const role = createdRoles[roleKey];
    for (const channel of Object.values(createdChannels)) {
      await channel.permissionOverwrites.edit(role, { ViewChannel: true, SendMessages: true, Connect: true }).catch(() => {});
    }
  }

  // 4. Ticket support role sees ticket category channels (handled per-ticket on creation)

  // 5. Dashboard
  const dashboardChannel = createdChannels["DASHBOARD"];
  if (dashboardChannel) {
    await publishDashboard(guild);
  }

  // 6. Ticket panel
  const ticketChannel = createdChannels["TICKETS"];
  if (ticketChannel) {
    const embed = new EmbedBuilder()
      .setTitle("Open a Ticket")
      .setDescription(Object.values(structure.ticketTypes).map(t => `• **${t.label}**`).join("\n"))
      .setColor(structure.embedColor);
    const menu = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_open").setLabel("Open Ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary)
    );
    await publishPanel(guild, ticketChannel, "ticket-panel", { embeds: [embed], components: [menu] }, m => m.embeds.some(e => e.title === "Open a Ticket"));
  }

  // 7. Application panel
  const appChannel = createdChannels["APPLICATION"];
  if (appChannel) {
    const embed = new EmbedBuilder()
      .setTitle("Staff Applications")
      .setDescription("Select an application below. Applications are long and scenario-based — take your time.")
      .setColor(structure.embedColor);
    const menu = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("app_open").setLabel("Apply").setEmoji("📄").setStyle(ButtonStyle.Primary)
    );
    await publishPanel(guild, appChannel, "application-panel", { embeds: [embed], components: [menu] }, m => m.embeds.some(e => e.title === "Staff Applications"));
  }

  await publishStaffGuide(guild);

  await logAction(guild, "🛠️ Server setup complete", `${structure.botName} — Los Angeles RP structure built.`);

  return createdChannels;
}

module.exports = { buildServer };


