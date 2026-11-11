const { EmbedBuilder } = require("discord.js");
const db = require("../utils/dataStore.js");
const structure = require("../config/structure.js");


module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    console.log(`✅ ${client.user.tag} is online.`);

    // Scheduled announcements checker - runs every minute
    setInterval(async () => {
      const scheduled = db.find("scheduledAnnouncements", a => !a.posted && new Date(a.fireAt) <= new Date());
      for (const item of scheduled) {
        const guild = client.guilds.cache.get(item.guildId);
        if (!guild) continue;
        const channel = guild.channels.cache.find(c => c.name.includes("announcements"));
        if (!channel) continue;

        let pingText = "";
        if (item.ping === "everyone") pingText = "@everyone";
        if (item.ping === "here") pingText = "@here";

        const embed = new EmbedBuilder()
          .setTitle("📢 Announcement")
          .setDescription(item.message)
          .setColor(structure.embedColor)
          .setTimestamp();

        await channel.send({ content: pingText || undefined, embeds: [embed] });
        db.update("scheduledAnnouncements", item.id, { posted: true });
      }
    }, 60 * 1000);

    // Stats voice channel updater - runs every 5 minutes
    // Uses the live staff role list (structure.staffRoleKeys) so newly added
    // roles like Staff/Member Director are automatically counted.
    async function updateStats() {
      for (const guild of client.guilds.cache.values()) {
        await guild.members.fetch().catch(() => {}); // ensure full member + presence cache

        const memberCount = guild.memberCount;
        const openTickets = db.find("tickets", t => t.guildId === guild.id && t.status === "open").length;

        const staffRoleNames = structure.staffRoleKeys.map(k => structure.roles[k]?.name).filter(Boolean);
        const onlineStaff = guild.members.cache.filter(m =>
          m.roles.cache.some(r => staffRoleNames.includes(r.name)) &&
          m.presence && ["online", "idle", "dnd"].includes(m.presence.status)
        ).size;

        const membersVC = guild.channels.cache.find(c => c.name.startsWith("📊 Members"));
        const staffVC = guild.channels.cache.find(c => c.name.startsWith("🟢 Staff Online"));
        const ticketsVC = guild.channels.cache.find(c => c.name.startsWith("🎫 Open Tickets"));

        if (membersVC) await membersVC.setName(`📊 Members: ${memberCount}`).catch(err => console.error("Failed to update Members VC:", err.message));
        if (staffVC) await staffVC.setName(`🟢 Staff Online: ${onlineStaff}`).catch(err => console.error("Failed to update Staff Online VC:", err.message));
        if (ticketsVC) await ticketsVC.setName(`🎫 Open Tickets: ${openTickets}`).catch(err => console.error("Failed to update Open Tickets VC:", err.message));
      }
    }

    updateStats(); // run once immediately on startup
    setInterval(updateStats, 5 * 60 * 1000);

  }
};


