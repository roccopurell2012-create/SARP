const { EmbedBuilder } = require("discord.js");
const structure = require("../config/structure.js");

async function logAction(guild, title, description) {
  try {
    const logChannel = guild.channels.cache.find(c => c.name.includes("bot-logs"));
    if (!logChannel) return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(structure.embedColor)
      .setTimestamp();
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("logAction failed:", err);
  }
}

module.exports = { logAction };


