const { logAction } = require("../utils/logger.js");

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember) {
    // Role changes
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (addedRoles.size > 0 || removedRoles.size > 0) {
      const parts = [];
      if (addedRoles.size) parts.push(`Added: ${addedRoles.map(r => r.name).join(", ")}`);
      if (removedRoles.size) parts.push(`Removed: ${removedRoles.map(r => r.name).join(", ")}`);
      await logAction(newMember.guild, "🎭 Role Change", `<@${newMember.id}> — ${parts.join(" | ")}`);
    }

    // Nickname changes
    if (oldMember.nickname !== newMember.nickname) {
      await logAction(newMember.guild, "✏️ Nickname Changed", `<@${newMember.id}>: "${oldMember.nickname || oldMember.user.username}" → "${newMember.nickname || newMember.user.username}"`);
    }
  }
};


