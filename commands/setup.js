const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildServer } = require("../utils/serverBuilder.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Builds the entire Los Angeles RP server: roles, categories, channels, and the dashboard. Owner only.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild ?? await interaction.client.guilds.fetch(interaction.guildId).catch(() => null);
    if (!guild) {
      return interaction.reply({ content: "❌ Couldn't load this server yet — wait a few seconds after inviting the bot and try again.", ephemeral: true });
    }

    if (guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: "Only the server owner can run /setup.", ephemeral: true });
    }

    await interaction.reply({ content: "🛠️ Building your Los Angeles RP server... this can take a minute.", ephemeral: true });

    try {
      await buildServer(guild);
      await interaction.followUp({ content: "✅ Server build complete — roles, channels, dashboard, tickets, and applications are live. Run `/staffguide` next, then `/rules`.", ephemeral: true });
    } catch (err) {
      console.error(err);
      await interaction.followUp({ content: "❌ Something went wrong during setup — check the bot's role position and permissions.", ephemeral: true });
    }
  }
};


