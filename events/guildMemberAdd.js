const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const structure = require("../config/structure.js");
const db = require("../utils/dataStore.js");
const { logAction } = require("../utils/logger.js");

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    await logAction(member.guild, "📥 Member Joined", `${member.user.tag} (<@${member.id}>) joined the server.`);

    // Auto Role on join (set by Owner/Co-Owner via the dashboard's Auto Roles button)
    const settings = db.load("settings");
    const autoRoleRecord = settings.find(s => s.key === "autoRoleId");
    if (autoRoleRecord?.value) {
      const autoRole = member.guild.roles.cache.get(autoRoleRecord.value);
      if (autoRole) await member.roles.add(autoRole).catch(() => {});
    }

    const welcomeChannel = member.guild.channels.cache.find(c => c.name.includes("welcome"));
    if (!welcomeChannel) return;

    const rulesChannel = member.guild.channels.cache.find(c => c.name.includes("rules") && !c.name.includes("hr-rules") && !c.name.includes("ia-rules"));

    const embed = new EmbedBuilder()
      .setTitle(`Welcome to Los Angeles RP, ${member.user.username}!`)
      .setDescription(`Please read the rules${rulesChannel ? ` in ${rulesChannel}` : ""}, then click **Agree** below to gain access to the server.`)
      .setThumbnail(member.user.displayAvatarURL())
      .setColor(structure.embedColor)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("view_rules").setLabel("📖 View Rules").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("verify_member").setLabel("✅ Agree").setStyle(ButtonStyle.Success)
    );

    await welcomeChannel.send({ content: `${member}`, embeds: [embed], components: [row] });
  }
};


