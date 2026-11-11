const { logAction } = require("../utils/logger.js");

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    await logAction(member.guild, "📤 Member Left", `${member.user.tag} (<@${member.id}>) left or was removed from the server.`);
  }
};


