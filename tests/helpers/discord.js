const { Collection, ChannelType } = require('discord.js');
let serial = 10000;
function serialise(payload) {
  return { ...payload, embeds: payload.embeds?.map(e => e.toJSON ? e.toJSON() : e), components: payload.components?.map(c => c.toJSON ? c.toJSON() : c) };
}
function createChannel(guild, data = {}) {
  const store = new Collection();
  const channel = {
    id: String(++serial), name: data.name || 'test', type: data.type ?? ChannelType.GuildText, parentId: data.parent,
    permissionOverwrites: { edit: async () => {} },
    messages: { fetch: async query => {
      if (typeof query === 'string') return store.get(query) || null;
      const list = [...store.values()].reverse().filter(m => !query.before || Number(m.id) < Number(query.before)).slice(0, query.limit || 100);
      return new Collection(list.map(m => [m.id, m]));
    } },
    send: async payload => channel.addMessage(payload, guild.client.user.id),
    addMessage: (payload, authorId = 'human') => {
      const json = serialise(payload);
      const message = { id: String(++serial), author: { id: authorId }, embeds: json.embeds || [], components: json.components || [], pinned: false,
        edit: async next => { const json = serialise(next); Object.assign(message, json); channel.sent.push(json); return message; },
        delete: async () => { store.delete(message.id); },
        pin: async () => { message.pinned = true; }
      };
      store.set(message.id, message); channel.sent.push(json); return message;
    },
    sent: [], store,
    toString: () => `<#${channel.id}>`
  };
  guild.channels.cache.set(channel.id, channel);
  return channel;
}
function createGuild(id = 'guild') {
  const guild = { id, ownerId: 'owner', name: 'Test RP', client: { user: { id: 'bot' } },
    roles: { cache: new Collection(), everyone: { id: 'everyone' } }, channels: { cache: new Collection() }, members: { cache: new Collection() }
  };
  guild.roles.create = async data => { const role = { ...data, id: String(++serial) }; guild.roles.cache.set(role.id, role); return role; };
  guild.channels.create = async data => createChannel(guild, data);
  guild.members.fetch = async id => guild.members.cache.get(id) || null;
  return guild;
}
function interaction(guild, id, kind = 'Button', userId = 'owner') {
  const member = guild.members.cache.get(userId) || { id: userId, roles: { cache: new Collection() }, permissions: { has: () => userId === 'owner' } };
  const result = { customId: id, guild, user: { id: userId, username: userId, tag: userId }, member, values: [],
    reply: async payload => { result.payload = payload; result.replied = true; },
    update: async payload => { result.payload = payload; },
    showModal: async modal => { result.modal = modal; },
    deferReply: async () => { result.deferred = true; },
    editReply: async payload => { result.payload = payload; },
    followUp: async payload => { result.payload = payload; },
    isRepliable: () => true
  };
  for (const name of ['Button', 'StringSelectMenu', 'UserSelectMenu', 'RoleSelectMenu', 'ModalSubmit', 'ChatInputCommand']) result[`is${name}`] = () => name === kind;
  return result;
}
module.exports = { createGuild, createChannel, interaction };
