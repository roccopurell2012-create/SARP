const structure = require("../config/structure.js");
const db = require("./dataStore.js");

// ================= LIVE ROLE RESOLUTION =================
// Matching by role NAME breaks the moment someone renames a role in
// Discord. This keeps a per-guild registry (structure key -> role ID) in
// the settings table, built the first time each role is resolved and
// self-healing after that — so a rename in Discord never desyncs the bot.
// If a registered ID no longer exists (role deleted), it falls back to a
// live name match and re-registers whatever it finds.

function getRegistry(guildId) {
  const settings = db.load("settings");
  return settings.find(s => s.key === `roleRegistry_${guildId}`);
}

function saveRegistryEntry(guildId, structureKey, roleId) {
  const settings = db.load("settings");
  let record = settings.find(s => s.key === `roleRegistry_${guildId}`);
  if (!record) {
    record = { id: `settings_roleRegistry_${guildId}`, key: `roleRegistry_${guildId}`, value: {} };
    settings.push(record);
  }
  record.value = { ...(record.value || {}), [structureKey]: roleId };
  db.save("settings", settings);
}

// Resolves a structure.js role key (e.g. "SUPPORT") to the live Discord
// Role object it currently points to — by registered ID first, by name
// as a fallback/bootstrap.
function resolveRole(guild, structureKey) {
  const roleData = structure.roles[structureKey];
  if (!roleData) return null;

  const registry = getRegistry(guild.id);
  const registeredId = registry?.value?.[structureKey];
  if (registeredId) {
    const byId = guild.roles.cache.get(registeredId);
    if (byId) return byId;
  }

  // Fallback: match by the name currently configured in structure.js.
  // Covers first-run (nothing registered yet) and a deleted/recreated role.
  const byName = guild.roles.cache.find(r => r.name === roleData.name);
  if (byName) {
    saveRegistryEntry(guild.id, structureKey, byName.id);
    return byName;
  }
  return null;
}

// Given a guild member, returns their highest-position staff role among
// the currently-live roles for structure.staffRoleKeys — always reflects
// whatever's actually on the member right now, not a cached assumption.
function getHighestStaffRole(guild, member) {
  const staffRoles = structure.staffRoleKeys
    .map(key => ({ key, role: resolveRole(guild, key) }))
    .filter(r => r.role && member.roles.cache.has(r.role.id))
    .sort((a, b) => b.role.position - a.role.position);
  return staffRoles[0] || null;
}

function isStaff(guild, member) {
  return guild.ownerId === member.id || !!getHighestStaffRole(guild, member);
}

function hasDirectorPermission(guild, member, permission) {
  if (guild.ownerId === member.id) return true;
  for (const key of structure.directorRoleKeys || []) {
    const role = resolveRole(guild, key);
    if (role && member.roles.cache.has(role.id)) {
      const perms = structure.directorPermissions?.[key] || [];
      if (perms.includes(permission)) return true;
    }
  }
  return false;
}

// ================= STAFF PROFILES =================
function getOrCreateProfile(guildId, userId) {
  const profiles = db.load("staffProfiles");
  let profile = profiles.find(p => p.guildId === guildId && p.userId === userId);
  if (!profile) {
    profile = db.add("staffProfiles", { guildId, userId, staffSince: null, department: null, promotions: [], demotions: [] });
  }
  return profile;
}

function markStaffSince(guildId, userId) {
  const profile = getOrCreateProfile(guildId, userId);
  if (!profile.staffSince) db.update("staffProfiles", profile.id, { staffSince: new Date().toISOString() });
}

function recordPromotion(guildId, userId, { fromRole, toRole, by, reason }) {
  const profile = getOrCreateProfile(guildId, userId);
  const promotions = [...(profile.promotions || []), { fromRole, toRole, by, reason, date: new Date().toISOString() }];
  db.update("staffProfiles", profile.id, { promotions });
}

function recordDemotion(guildId, userId, { fromRole, toRole, by, reason }) {
  const profile = getOrCreateProfile(guildId, userId);
  const demotions = [...(profile.demotions || []), { fromRole, toRole, by, reason, date: new Date().toISOString() }];
  db.update("staffProfiles", profile.id, { demotions });
}

module.exports = {
  resolveRole, getHighestStaffRole, isStaff, hasDirectorPermission,
  getOrCreateProfile, markStaffSince, recordPromotion, recordDemotion
};

