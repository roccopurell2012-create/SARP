const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const structure = require("../config/structure.js");
const db = require("../utils/dataStore.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion for the server.")
    .addStringOption(opt => opt.setName("idea").setDescription("Your suggestion").setRequired(true)),

  async execute(interaction) {
    const idea = interaction.options.getString("idea");
    const channel = interaction.guild.channels.cache.find(c => c.name.includes("suggestions"));
    if (!channel) return interaction.reply({ content: "Suggestions channel not found.", ephemeral: true });

    const entry = db.add("suggestions", { guildId: interaction.guild.id, userId: interaction.user.id, idea, status: "pending" });

    const embed = new EmbedBuilder()
      .setTitle("💡 New Suggestion")
      .setDescription(idea)
      .addFields({ name: "Submitted By", value: `<@${interaction.user.id}>` })
      .setColor(structure.embedColor)
      .setFooter({ text: `Suggestion ID: ${entry.id}` })
      .setTimestamp();

    const msg = await channel.send({ embeds: [embed] });
    await msg.react("👍");
    await msg.react("👎");
    await interaction.reply({ content: "✅ Suggestion submitted!", ephemeral: true });
  }
};


