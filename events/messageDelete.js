const { logAction } = require("../utils/logger.js");

module.exports = {
  name: "messageDelete",
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    if (message.channel.name?.startsWith("ticket-") || message.channel.name === "evidence-vault") return; // expected deletions, not worth logging noise for
    const content = message.content ? message.content.slice(0, 500) : "[no cached content / embed / attachment]";
    await logAction(message.guild, "🗑️ Message Deleted", `Author: ${message.author?.tag || "Unknown"}\nChannel: ${message.channel}\nContent: ${content}`);
  }
};


