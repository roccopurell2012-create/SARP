const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const structure = require("../config/structure.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Create/post the server rules (Discord rules or In-Game/ERLC rules). Management+ only.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("rules_type_select")
      .setPlaceholder("Choose which rules to create")
      .addOptions(Object.entries(structure.ruleSets).map(([key, set]) => ({ label: set.label, value: key })));

    const row = new ActionRowBuilder().addComponents(menu);
    await interaction.reply({ content: "Which rule set do you want to build and post?", components: [row], ephemeral: true });
  }
};


