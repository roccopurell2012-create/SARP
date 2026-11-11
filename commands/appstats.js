const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const structure = require("../config/structure.js");
const db = require("../utils/dataStore.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("appstats")
    .setDescription("View application statistics. Staff only.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const all = db.find("applications", a => a.guildId === interaction.guild.id);
    const pending = all.filter(a => a.status === "pending" || a.status === "under_review");
    const approved = all.filter(a => a.status === "approved");
    const rejected = all.filter(a => a.status === "rejected");
    const decided = approved.length + rejected.length;
    const approvalRate = decided ? Math.round((approved.length / decided) * 100) : null;

    const byType = {};
    for (const a of all) byType[a.type] = (byType[a.type] || 0) + 1;
    const typeBreakdown = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `${structure.applications[key]?.label || key}: ${count}`)
      .join("\n") || "N/A";

    const byReviewer = {};
    for (const a of all) if (a.reviewedBy) byReviewer[a.reviewedBy] = (byReviewer[a.reviewedBy] || 0) + 1;
    const reviewerBreakdown = Object.entries(byReviewer)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => `<@${id}>: ${count}`)
      .join("\n") || "N/A";

    const embed = new EmbedBuilder()
      .setTitle("📊 Application Statistics")
      .addFields(
        { name: "Total Applications", value: String(all.length), inline: true },
        { name: "Pending", value: String(pending.length), inline: true },
        { name: "Approved", value: String(approved.length), inline: true },
        { name: "Rejected", value: String(rejected.length), inline: true },
        { name: "Approval %", value: approvalRate !== null ? `${approvalRate}%` : "N/A", inline: true },
        { name: "By Department", value: typeBreakdown },
        { name: "By Reviewer (top 5)", value: reviewerBreakdown }
      )
      .setColor(structure.embedColor)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};


