const db = require('./dataStore');
const roles = require('./roles');

function isOwnerTeam(guild, member) {
  if (!guild || !member) return false;
  if (guild.ownerId === member.id) return true;
  return ['OWNER', 'CO_OWNER'].some(key => {
    const role = roles.resolveRole(guild, key);
    return role && member.roles.cache.has(role.id);
  });
}
function isStaff(guild, member) {
  return !!guild && !!member && roles.isStaff(guild, member);
}
function normaliseEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid staff email address.');
  return email;
}
function registerEmail(guildId, userId, value, addedBy) {
  const email = normaliseEmail(value);
  const rows = db.load('staffIdentities');
  if (rows.some(r => r.guildId === guildId && r.email === email && r.userId !== userId)) {
    throw new Error('That email is already assigned to another member.');
  }
  let row = rows.find(r => r.guildId === guildId && r.userId === userId);
  if (!row) {
    row = { id: `identity_${guildId}_${userId}`, guildId, userId, staffId: null, createdAt: new Date().toISOString() };
    rows.push(row);
  }
  Object.assign(row, { email, addedBy, updatedAt: new Date().toISOString() });
  db.save('staffIdentities', rows);
  return row;
}
function getIdentity(guildId, userId) {
  return db.find('staffIdentities', r => r.guildId === guildId && r.userId === userId)[0] || null;
}
// Synchronous read/allocate/save, with no await between allocation and persistence.
// All IDs and email ownership live in one durable, guild-scoped record set.
function claimIdentity(guildId, userId, value) {
  const email = normaliseEmail(value);
  const rows = db.load('staffIdentities');
  const row = rows.find(r => r.guildId === guildId && r.userId === userId && r.email === email);
  if (!row) throw new Error('This email is not registered to your Discord account. Ask the Owner or Co-Owner to add it first.');
  if (!row.staffId) {
    const maximum = rows.filter(r => r.guildId === guildId).reduce((n, r) => Math.max(n, Number(r.staffId?.match(/^LA-STAFF-(\d+)$/)?.[1] || 0)), 0);
    row.staffId = `LA-STAFF-${String(maximum + 1).padStart(4, '0')}`;
    row.claimedAt = new Date().toISOString();
    db.save('staffIdentities', rows);
  }
  return row;
}
function checkTicketId(guildId, userId, staffId) {
  const row = getIdentity(guildId, userId);
  if (!row?.staffId || row.staffId !== String(staffId || '').trim().toUpperCase()) {
    throw new Error('Enter your own staff ID. Go to staff guide to get your staff ID.');
  }
  return row;
}
module.exports = { isOwnerTeam, isStaff, normaliseEmail, registerEmail, getIdentity, claimIdentity, checkTicketId };
