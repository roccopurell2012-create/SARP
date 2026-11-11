const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuideConfig, saveGuideConfig, publishStaffGuide } = require('../utils/staffGuide');
module.exports = {
  data: new SlashCommandBuilder().setName('staffguide')
    .setDescription('Publish or update the staff guide and permanent staff ID controls.')
    .addStringOption(opt => opt.setName('melonly_link').setDescription('Your Melonly staff dashboard URL').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'You need Manage Server permission to publish the guide.', ephemeral: true });
    const link = interaction.options.getString('melonly_link');
    if (link) {
      let url;
      try { url = new URL(link); } catch { return interaction.reply({ content: 'Enter a valid HTTPS dashboard link.', ephemeral: true }); }
      if (url.protocol !== 'https:' || /[\s()]/.test(link)) return interaction.reply({ content: 'Enter a valid HTTPS dashboard link.', ephemeral: true });
      const config = getGuideConfig(interaction.guild.id); config.melonlyLink = link; saveGuideConfig(interaction.guild.id, config);
    }
    await interaction.deferReply({ ephemeral: true });
    const channel = await publishStaffGuide(interaction.guild);
    return interaction.editReply({ content: `✅ Staff guide updated in ${channel}.` });
  }
};
