const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, RoleSelectMenuBuilder } = require("discord.js");
const roles = require("../utils/roles.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Promote or demote a staff member using the server's real current roles.")
    .addUserOption(opt => opt.setName("user").setDescription("Who is this for?").setRequired(true))
    .addStringOption(opt => opt.setName("action").setDescription("Promote or demote").setRequired(true)
      .addChoices({ name: "Promote", value: "promote" }, { name: "Demote", value: "demote" }))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const canRank = interaction.guild.ownerId === interaction.user.id ||
      roles.hasDirectorPermission(interaction.guild, interaction.member, "promote") ||
      roles.hasDirectorPermission(interaction.guild, interaction.member, "demote") ||
      interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);
    if (!canRank) return interaction.reply({ content: "You don't have permission to promote/demote staff.", ephemeral: true });

    const user = interaction.options.getUser("user");
    const action = interaction.options.getString("action");

    const menu = new RoleSelectMenuBuilder()
      .setCustomId(`rank_role_select::${action}::${user.id}`)
      .setPlaceholder(`Select the new rank for ${user.tag}`)
      .setMinValues(1).setMaxValues(1);
    const row = new ActionRowBuilder().addComponents(menu);

    return interaction.reply({
      content: `Select the **real, current** Discord role to ${action} <@${user.id}> to:`,
      components: [row],
      ephemeral: true
    });
  }
};


