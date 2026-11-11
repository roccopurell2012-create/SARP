const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const structure = require("../config/structure.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post an announcement, optionally pinging everyone/here/a role.")
    .addStringOption(opt => opt.setName("message").setDescription("The announcement text").setRequired(true))
    .addStringOption(opt => opt.setName("title").setDescription("Announcement title").setRequired(false))
    .addStringOption(opt =>
      opt.setName("ping").setDescription("Who to ping").setRequired(false)
        .addChoices(
          { name: "Everyone", value: "everyone" },
          { name: "Here", value: "here" },
          { name: "None", value: "none" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const message = interaction.options.getString("message");
    const title = interaction.options.getString("title") || "📢 Announcement";
    const ping = interaction.options.getString("ping") || "none";

    const channel = interaction.guild.channels.cache.find(c => c.name.includes("announcements") && !c.name.includes("staff-announcements"));
    if (!channel) return interaction.reply({ content: "Couldn't find the announcements channel.", ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(message)
      .setColor(structure.embedColor)
      .setFooter({ text: `Posted by ${interaction.user.tag}` })
      .setTimestamp();

    let pingText = "";
    if (ping === "everyone") pingText = "@everyone";
    if (ping === "here") pingText = "@here";

    await channel.send({ content: pingText || undefined, embeds: [embed] });
    await interaction.reply({ content: `✅ Announcement posted in ${channel}.`, ephemeral: true });
  }
};


