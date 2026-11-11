const { logAction } = require("../utils/logger.js");

module.exports = {
  name: "messageUpdate",
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // embed-only or non-content update, skip
    if (newMessage.channel.name?.startsWith("ticket-")) return;

    const oldContent = (oldMessage.content || "[uncached]").slice(0, 300);
    const newContent = (newMessage.content || "[empty]").slice(0, 300);
    await logAction(newMessage.guild, "✏️ Message Edited", `Author: ${newMessage.author?.tag || "Unknown"}\nChannel: ${newMessage.channel}\nBefore: ${oldContent}\nAfter: ${newContent}`);
  }
};


