const structure = require("../config/structure.js");
const db = require("./dataStore.js");

// Ticket types start from the defaults baked into structure.js, then any
// per-guild edits saved via the dashboard are layered on top. A type marked
// `removed: true` in the override is hidden even if it exists in the code
// defaults — lets an Owner retire a default type without deleting code.
function getTicketTypes(guildId) {
  const settings = db.load("settings");
  const record = settings.find(s => s.key === `ticketTypesOverride_${guildId}`);
  const overrides = record?.value || {};

  const merged = { ...structure.ticketTypes };
  for (const [key, val] of Object.entries(overrides)) {
    if (val.removed) { delete merged[key]; continue; }
    merged[key] = val;
  }
  delete merged.BLACKLIST_APPEAL;
  return merged;
}

function saveTicketTypeOverride(guildId, key, data) {
  const settings = db.load("settings");
  let record = settings.find(s => s.key === `ticketTypesOverride_${guildId}`);
  if (!record) {
    record = { id: `settings_ticketTypesOverride_${guildId}`, key: `ticketTypesOverride_${guildId}`, value: {} };
    settings.push(record);
  }
  record.value = { ...(record.value || {}), [key]: data };
  db.save("settings", settings);
}

function removeTicketType(guildId, key) {
  saveTicketTypeOverride(guildId, key, { removed: true });
}

function getTicketType(guildId, key) {
  return structure.staffTicketTypes[key] || getTicketTypes(guildId)[key];
}
function isStaffTicketType(key) {
  return Object.hasOwn(structure.staffTicketTypes, key);
}
module.exports = { getTicketTypes, getTicketType, isStaffTicketType, saveTicketTypeOverride, removeTicketType };


