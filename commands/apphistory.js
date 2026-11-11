const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const structure = require("../config/structure.js");
const db = require("../utils/dataStore.js");

const STATUS_LABEL = { pending: "🕓 Pending", under_review: "🔎 Under Review", approved: "✅ Approved", rejected: "❌ Rejected", closed: "🔒 Closed" };

module.exports = {
  data: new SlashCommandBuilder()
    .setName("apphistory")
    .setDescription("View a member's application history.")
    .addUserOption(opt => opt.setName("user").setDescription("Who to look up (defaults to you)")),

  async execute(interaction) {
    const target = interaction.options.getUser("user") || interaction.user;
    const apps = db.find("applications", a => a.guildId === interaction.guild.id && a.userId === target.id)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (apps.length === 0) return interaction.reply({ content: `${target.tag} has no application history.`, ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle(`📄 Application History — ${target.tag}`)
      .setColor(structure.embedColor)
      .setDescription(apps.slice(0, 15).map(a =>
        `**${structure.applications[a.type]?.label || a.type}**\nStatus: ${STATUS_LABEL[a.status] || a.status}${a.reviewedBy ? ` — Reviewer: <@${a.reviewedBy}>` : ""}${a.createdAt ? ` — <t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:d>` : ""}`
      ).join("\n\n"))
      .setFooter({ text: `${apps.length} total application(s)` });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};


