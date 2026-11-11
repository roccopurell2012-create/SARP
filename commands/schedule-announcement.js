const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../utils/dataStore.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule-announcement")
    .setDescription("Schedule an announcement for later.")
    .addStringOption(opt => opt.setName("message").setDescription("Announcement text").setRequired(true))
    .addStringOption(opt => opt.setName("time").setDescription("ISO datetime, e.g. 2026-07-20T18:00:00Z").setRequired(true))
    .addStringOption(opt => opt.setName("ping").setDescription("everyone / here / none").setRequired(false)
      .addChoices({ name: "Everyone", value: "everyone" }, { name: "Here", value: "here" }, { name: "None", value: "none" }))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const message = interaction.options.getString("message");
    const time = interaction.options.getString("time");
    const ping = interaction.options.getString("ping") || "none";

    const targetDate = new Date(time);
    if (isNaN(targetDate.getTime())) {
      return interaction.reply({ content: "Invalid date format. Use ISO format like 2026-07-20T18:00:00Z", ephemeral: true });
    }

    db.add("scheduledAnnouncements", {
      message, ping, fireAt: targetDate.toISOString(), guildId: interaction.guild.id, posted: false
    });

    await interaction.reply({ content: `✅ Announcement scheduled for ${targetDate.toUTCString()}.`, ephemeral: true });
  }
};


