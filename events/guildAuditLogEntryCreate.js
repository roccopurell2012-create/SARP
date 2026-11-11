const { AuditLogEvent } = require("discord.js");
const { logAction } = require("../utils/logger.js");

const LABELS = {
  [AuditLogEvent.ChannelDelete]: "Channel Deleted",
  [AuditLogEvent.RoleDelete]: "Role Deleted",
  [AuditLogEvent.RoleUpdate]: "Role Permissions Changed",
  [AuditLogEvent.MemberKick]: "Member Kicked",
  [AuditLogEvent.MemberBanAdd]: "Member Banned"
};

module.exports = {
  name: "guildAuditLogEntryCreate",
  async execute(auditLogEntry, guild) {
    const { action, executorId, targetId, reason } = auditLogEntry;
    const label = LABELS[action];
    if (!label) return;

    // General audit log monitoring — every tracked action gets logged with who/what/target.
    await logAction(guild, `🛡️ Audit Log: ${label}`, `Responsible: <@${executorId}>\nTarget: ${targetId || "N/A"}${reason ? `\nReason: ${reason}` : ""}`);

  }
};

