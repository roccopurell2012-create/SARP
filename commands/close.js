const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const structure = require("../config/structure.js");
const db = require("../utils/dataStore.js");
const { logAction } = require("../utils/logger.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close the current ticket.")
    .addStringOption(opt => opt.setName("reason").setDescription("Reason for closing (optional)")),

  async execute(interaction) {
    const channel = interaction.channel;

    const reason = interaction.options.getString("reason") || "No reason provided";
    const tickets = db.find("tickets", t => t.channelId === channel.id && t.status === "open");
    if (tickets.length === 0) return interaction.reply({ content: "This isn't an open ticket channel — couldn't find a matching ticket record.", ephemeral: true });
    const ticket = tickets[0];

    await interaction.reply("🔒 Closing this ticket in 5 seconds — generating transcript...");

    // Capture a simple, readable transcript before the channel is deleted.
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    let transcript = "No transcript captured.";
    if (messages) {
      transcript = [...messages.values()].reverse()
        .map(m => `[${new Date(m.createdTimestamp).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}] ${m.author.tag}: ${m.content || "[attachment/embed]"}`)
        .join("\n");
    }

    db.update("tickets", ticket.id, {
      status: "closed",
      closedBy: interaction.user.id,
      closeReason: reason,
      closedAt: new Date().toISOString(),
      transcript
    });

    // DM the opener their transcript + a rate-support prompt.
    const opener = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
    if (opener) {
      const transcriptFile = new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: `ticket-${ticket.id}-transcript.txt` });
      const rateRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_rate_${ticket.id}`).setLabel("⭐ Rate Support").setStyle(ButtonStyle.Primary)
      );
      const dmEmbed = new EmbedBuilder()
        .setTitle("🎫 Your Ticket Was Closed")
        .setDescription(`Your ticket in **${interaction.guild.name}** has been closed.\n\n**Reason:** ${reason}`)
        .setColor(structure.embedColor);
      await opener.send({ embeds: [dmEmbed], files: [transcriptFile], components: [rateRow] }).catch(() => {});
    }

    await logAction(interaction.guild, "🎫 Ticket Closed", `Channel: #${channel.name}\nClosed by: <@${interaction.user.id}>\nReason: ${reason}`);

    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
};


