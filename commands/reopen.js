const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const structure = require("../config/structure.js");
const db = require("../utils/dataStore.js");
const ticketTypesUtil = require("../utils/ticketTypes.js");
const { logAction } = require("../utils/logger.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reopen")
    .setDescription("Reopen a closed ticket, restoring its history. Staff only.")
    .addStringOption(opt => opt.setName("ticket_id").setDescription("The ticket ID to reopen").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const ticketId = interaction.options.getString("ticket_id");
    const ticket = db.find("tickets", t => t.id === ticketId && t.guildId === interaction.guild.id)[0];
    if (!ticket) return interaction.reply({ content: "Couldn't find a ticket with that ID.", ephemeral: true });
    if (ticket.status === "open") return interaction.reply({ content: "That ticket is already open.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const opener = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
    const channel = await interaction.guild.channels.create({
      name: `ticket-${opener?.user.username || "reopened"}`.toLowerCase().slice(0, 90),
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: ["ViewChannel"] },
        ...(opener ? [{ id: opener.id, allow: ["ViewChannel", "SendMessages"] }] : []),
        { id: interaction.user.id, allow: ["ViewChannel", "SendMessages"] }
      ]
    });

    const ticketType = ticketTypesUtil.getTicketType(interaction.guild.id, ticket.type);
    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket Reopened — ${ticketType?.label || ticket.type}`)
      .setDescription(`This ticket was reopened by <@${interaction.user.id}>.\n\n**Previous close reason:** ${ticket.closeReason || "N/A"}`)
      .addFields(Object.entries(ticket.answers || {}).map(([k, v]) => ({ name: ticketType?.questions?.find(q => q.id === k)?.label || k, value: (v || "N/A").slice(0, 1000) })))
      .setColor(structure.embedColor);
    await channel.send({ content: opener ? `${opener}` : undefined, embeds: [embed] });

    if (ticket.transcript) {
      await channel.send(`📄 **Previous transcript (for reference):**\n\`\`\`\n${ticket.transcript.slice(0, 1800)}\n\`\`\``).catch(() => {});
    }

    db.update("tickets", ticket.id, { status: "open", channelId: channel.id, claimedBy: interaction.user.id, reopenedBy: interaction.user.id, reopenedAt: new Date().toISOString() });
    await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true });

    await logAction(interaction.guild, "🔓 Ticket Reopened", `Ticket ${ticket.id} reopened by <@${interaction.user.id}> in ${channel}`);
    return interaction.followUp({ content: `✅ Ticket **${ticket.id}** reopened: ${channel}` });
  }
};


