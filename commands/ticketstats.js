const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const structure = require("../config/structure.js");
const db = require("../utils/dataStore.js");
const ticketTypesUtil = require("../utils/ticketTypes.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketstats")
    .setDescription("View ticket statistics. Staff only.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const ticketTypes = ticketTypesUtil.getTicketTypes(interaction.guild.id);
    const all = db.find("tickets", t => t.guildId === interaction.guild.id);
    const open = all.filter(t => t.status === "open");
    const closed = all.filter(t => t.status === "closed");
    const rated = closed.filter(t => typeof t.rating === "number");
    const avgRating = rated.length ? (rated.reduce((sum, t) => sum + t.rating, 0) / rated.length).toFixed(1) : "N/A";

    const byType = {};
    for (const t of all) byType[t.type] = (byType[t.type] || 0) + 1;
    const typeBreakdown = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `${ticketTypes[key]?.label || key}: ${count}`)
      .join("\n") || "N/A";

    const claimCounts = {};
    for (const t of closed) if (t.claimedBy) claimCounts[t.claimedBy] = (claimCounts[t.claimedBy] || 0) + 1;
    const topClaimer = Object.entries(claimCounts).sort((a, b) => b[1] - a[1])[0];

    const resolutionTimes = closed.filter(t => t.closedAt && t.createdAt).map(t => new Date(t.closedAt) - new Date(t.createdAt));
    const avgResolutionMin = resolutionTimes.length ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length / 60000) : null;

    const embed = new EmbedBuilder()
      .setTitle("🎫 Ticket Statistics")
      .addFields(
        { name: "Total Tickets", value: String(all.length), inline: true },
        { name: "Open", value: String(open.length), inline: true },
        { name: "Closed", value: String(closed.length), inline: true },
        { name: "Average Rating", value: avgRating === "N/A" ? "N/A" : `⭐ ${avgRating} (${rated.length} ratings)`, inline: true },
        { name: "Average Resolution Time", value: avgResolutionMin !== null ? `${Math.floor(avgResolutionMin / 60)}h ${avgResolutionMin % 60}m` : "N/A", inline: true },
        { name: "Top Staff (by closed tickets)", value: topClaimer ? `<@${topClaimer[0]}> (${topClaimer[1]})` : "N/A", inline: true },
        { name: "By Type", value: typeBreakdown }
      )
      .setColor(structure.embedColor)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};


