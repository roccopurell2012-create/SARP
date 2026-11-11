const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.SARP_DATA_DIR || path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  tickets: "tickets.json",
  staffIdentities: "staff_identities.json",
  applications: "applications.json",
  partnerships: "partnerships.json",
  suggestions: "suggestions.json",
  scheduledAnnouncements: "scheduled_announcements.json",
  offices: "offices.json",
  settings: "settings.json", // dashboard toggles (which applications are enabled, etc.)
  staffProfiles: "staff_profiles.json",
};

function filePath(store) {
  if (!FILES[store]) throw new Error(`dataStore: unknown store "${store}" — add it to FILES in utils/dataStore.js`);
  return path.join(DATA_DIR, FILES[store]);
}

function load(store) {
  const p = filePath(store);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, "[]");
    return [];
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function save(store, data) {
  const destination = filePath(store);
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
  fs.renameSync(temporary, destination);
}

function add(store, entry) {
  const data = load(store);
  entry.id = entry.id || `${store}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  entry.createdAt = new Date().toISOString();
  data.push(entry);
  save(store, data);
  return entry;
}

function update(store, id, updates) {
  const data = load(store);
  const idx = data.findIndex(e => e.id === id);
  if (idx === -1) return null;
  data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
  save(store, data);
  return data[idx];
}

function remove(store, id) {
  const data = load(store);
  const filtered = data.filter(e => e.id !== id);
  save(store, filtered);
  return filtered.length !== data.length;
}

function find(store, predicate) {
  return load(store).filter(predicate);
}

module.exports = { load, save, add, update, remove, find };


