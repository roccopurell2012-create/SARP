const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { handleStaffTools } = require("../utils/staffTools");
const staffIdentity = require("../utils/staffIdentity");
const structure = require("../config/structure.js");
const db = require("../utils/dataStore.js");
const rolesUtil = require("../utils/roles.js");
const ticketTypesUtil = require("../utils/ticketTypes.js");
const { logAction } = require("../utils/logger.js");

function getAppQuestions(appKey) {
  const settings = db.load("settings");
  const override = settings.find(s => s.key === `appQuestions_${appKey}`);
  return override?.value ? [...override.value] : structure.applications[appKey].questions.map(q => ({ ...q }));
}

function saveAppQuestions(appKey, questions) {
  const settings = db.load("settings");
  let record = settings.find(s => s.key === `appQuestions_${appKey}`);
  if (!record) {
    record = { id: `settings_appQuestions_${appKey}`, key: `appQuestions_${appKey}`, value: null };
    settings.push(record);
  }
  record.value = questions;
  db.save("settings", settings);
}

function buildQuestionManagerView(appKey, interaction, prefix) {
  const questions = getAppQuestions(appKey);
  const embed = new EmbedBuilder()
    .setTitle(`📄 Manage Questions — ${structure.applications[appKey].label}`)
    .setDescription(questions.map((q, idx) => `**${idx + 1}.** ${q.label}`).join("\n") || "No questions yet.")
    .setFooter({ text: "Applicants answer these one at a time in DMs — no length limit." })
    .setColor(structure.embedColor);
  if (prefix) embed.setAuthor({ name: prefix });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`manage_app_add_${appKey}`).setLabel("➕ Add Question").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`manage_app_remove_${appKey}`).setLabel("➖ Remove Question").setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row], ephemeral: true };
}

// Runs the full application as a DM conversation: the bot asks each question
// as its own message (no length limit, unlike modals) and waits for a reply
// before sending the next one. Attempts the DM first so the interaction reply
// is accurate (some users have DMs closed to server members).
// Shared finish-line for approving/rejecting an application, whether the reason
// came from a modal (approve, or reject "Other") or a preset dropdown option.
async function finalizeApplication(interaction, id, approve, reason) {
  const updated = db.update("applications", id, { status: approve ? "approved" : "rejected", reviewedBy: interaction.user.id, reason, reviewedAt: new Date().toISOString() });
  if (!updated) return interaction.reply({ content: "Application not found.", ephemeral: true });

  if (approve) {
    const roleMap = { SAPS: "SAPS", EMS: "EMS", FIRE: "FIRE", MODERATOR: "MODERATOR", PARTNER: "PARTNER", STAFF: "MODERATOR" };
    const roleKey = roleMap[updated.type];
    if (roleKey) {
      const role = rolesUtil.resolveRole(interaction.guild, roleKey);
      const member = await interaction.guild.members.fetch(updated.userId).catch(() => null);
      if (role && member) await member.roles.add(role).catch(() => {});
      if (member && structure.staffRoleKeys.includes(roleKey)) {
        const staffPingRole = rolesUtil.resolveRole(interaction.guild, "STAFF_PING");
        if (staffPingRole) await member.roles.add(staffPingRole).catch(() => {});
      }
      if (member) rolesUtil.markStaffSince(interaction.guild.id, updated.userId);
    }
  }

  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const resultMessage = `<@${updated.userId}>, your **${structure.applications[updated.type]?.label}** was **${approve ? "APPROVED ✅" : "DENIED ❌"}** by <@${interaction.user.id}> on ${dateStr}.\n**Reason:** ${reason}`;

  const announceChannel = interaction.guild.channels.cache.find(c => c.name.includes("application-results"));
  if (announceChannel) await announceChannel.send(resultMessage);

  // Partnership applications include who to ping when it's posted — post the
  // full ad to the partnerships channel with that ping when approved.
  if (approve && updated.type === "PARTNER") {
    const partnershipChannel = interaction.guild.channels.cache.find(c => c.name.includes("partnership"));
    const pingText = (updated.answers?.q3 || "").trim();
    const shouldPing = pingText && pingText.toLowerCase() !== "none";
    if (partnershipChannel) {
      const adEmbed = new EmbedBuilder()
        .setTitle("🤝 New Partnership")
        .setDescription(updated.answers?.q1 || "N/A")
        .addFields({ name: "Representative", value: updated.answers?.q2 || "N/A" })
        .setColor(structure.embedColor)
        .setTimestamp();
      await partnershipChannel.send({ content: shouldPing ? pingText : undefined, embeds: [adEmbed] }).catch(() => {});
    }
  }

  const dmMember = await interaction.guild.members.fetch(updated.userId).catch(() => null);
  if (dmMember) {
    const dmEmbed = new EmbedBuilder()
      .setTitle(approve ? "🎉 APPLICATION APPROVED" : "❌ APPLICATION NOT APPROVED")
      .setDescription(approve ? `Congratulations! Your **${structure.applications[updated.type]?.label}** has been approved.` : `Unfortunately, your **${structure.applications[updated.type]?.label}** was not approved.\n\nYou may reapply after the cooldown period.`)
      .addFields({ name: approve ? "Approved By" : "Reviewed By", value: `<@${interaction.user.id}>` }, { name: "Reason", value: reason })
      .setColor(approve ? "#2ECC71" : "#E74C3C");
    await dmMember.send({ embeds: [dmEmbed] }).catch(() => {});
  }

  await logAction(interaction.guild, "📄 Application Reviewed", `<@${updated.userId}> — ${approve ? "Approved" : "Rejected"} by <@${interaction.user.id}> — Reason: ${reason}`);

  const resultsChannel = interaction.guild.channels.cache.find(c => c.name.includes("results") && !c.name.includes("application-results"));
  if (resultsChannel) {
    const msgs = await resultsChannel.messages.fetch({ limit: 50 }).catch(() => null);
    const original = msgs?.find(m => m.components?.[0]?.components?.some(c => c.customId === `app_approve_${id}`));
    if (original) await original.edit({ content: `Application **${approve ? "APPROVED ✅" : "REJECTED ❌"}** by <@${interaction.user.id}> on ${dateStr}`, components: [] }).catch(() => {});
  }

  const replyPayload = { content: `✅ Application ${approve ? "approved" : "rejected"} and posted to #application-results.`, ephemeral: true };
  if (interaction.replied || interaction.deferred) return interaction.followUp(replyPayload);
  return interaction.reply(replyPayload);
}

async function runDMApplication(interaction, appKey) {
  const user = interaction.user;
  const guild = interaction.guild;
  const app = structure.applications[appKey];
  const questions = getAppQuestions(appKey);

  let dm;
  try {
    dm = await user.createDM();
    await dm.send(`👋 Starting your **${app.label}** application for **${guild.name}**.\n\nI'll ask ${questions.length} question${questions.length === 1 ? "" : "s"} one at a time — just reply here with your answer to each. Reply **ready** to begin, or **cancel** anytime to stop.`);
  } catch {
    return interaction.reply({ content: "❌ I couldn't DM you — please enable direct messages from server members (Privacy Settings in this server) and try again.", ephemeral: true });
  }

  await interaction.reply({ content: `📬 Check your DMs — I've started your **${app.label}** application there!`, ephemeral: true });

  // Continue the conversation in the background — this can take many minutes.
  (async () => {
    try {
      const start = await dm.awaitMessages({ filter: m => m.author.id === user.id, max: 1, time: 5 * 60 * 1000, errors: ["time"] }).catch(() => null);
      if (!start || start.first().content.trim().toLowerCase() === "cancel") {
        await dm.send("Application cancelled — you can start again anytime from #application.").catch(() => {});
        return;
      }

      const answers = {};
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await dm.send(`**Question ${i + 1}/${questions.length}:**\n${q.label}`);
        const collected = await dm.awaitMessages({ filter: m => m.author.id === user.id, max: 1, time: 15 * 60 * 1000, errors: ["time"] }).catch(() => null);
        if (!collected) {
          await dm.send("⏱️ You took too long to respond — application cancelled. Start again anytime from #application.").catch(() => {});
          return;
        }
        const reply = collected.first().content.trim();
        if (reply.toLowerCase() === "cancel") {
          await dm.send("Application cancelled — you can start again anytime from #application.").catch(() => {});
          return;
        }
        answers[q.id] = reply;
      }

      const entry = db.add("applications", { guildId: guild.id, userId: user.id, type: appKey, answers, status: "pending", createdAt: new Date().toISOString() });

      const resultChannel = guild.channels.cache.find(c => c.name.includes("results"));
      const embed = new EmbedBuilder()
        .setTitle(`📄 New Application: ${app.label}`)
        .setDescription(`Applicant: <@${user.id}>`)
        .addFields(questions.map(q => ({ name: q.label.slice(0, 256), value: (answers[q.id] || "N/A").slice(0, 1000) })))
        .setColor(structure.embedColor)
        .setFooter({ text: `Application ID: ${entry.id} — visible to everyone` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`app_review_${entry.id}`).setLabel("📋 Mark Under Review").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`app_approve_${entry.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`app_reject_${entry.id}`).setLabel("Reject").setStyle(ButtonStyle.Danger)
      );

      if (resultChannel) await resultChannel.send({ embeds: [embed], components: [row] });
      await logAction(guild, "📄 Application Submitted", `${app.label} by <@${user.id}>`);
      await dm.send("✅ All done — your application has been submitted! Results are posted publicly in the server once staff review it.");
    } catch (err) {
      console.error(err);
      await dm.send("Something went wrong partway through — please start again from #application.").catch(() => {});
    }
  })();
}

module.exports = {
  name: "interactionCreate",
  // Every button/select/modal handler lives inside _handle — wrapped below so
  // a single bad interaction (e.g. a validation error like an over-length
  // modal label) can never again silently kill a response and leave the user
  // staring at Discord's "didn't respond in time" error.
  async execute(interaction, client) {
    try {
      await this._handle(interaction, client);
    } catch (err) {
      console.error("interactionCreate error:", err);
      const reply = { content: "❌ Something went wrong handling that. Please try again or contact an administrator.", ephemeral: true };
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
    }
  },

  async _handle(interaction, client) {
    if (await handleStaffTools(interaction)) return;
    // Older Discord messages can outlive the features that created their controls.
    if (interaction.customId && /^(?:dash_(?:moderation|loa|blacklist|shifts)$|loa_|hr_|ia_|case_|search_case(?:_|$)|removeinfraction_select::|dash_(?:departments|performance_review|terminate|dm|editbot|mass_delete|activity_check)$|dept_|perf_review_|terminate_|dm_|editbot_|owner_shutdown_|antiraid_|restore_|editprofile_|mass_delete_)/.test(interaction.customId)) {
      return interaction.reply({ content: "This feature has been removed from the bot. Please use the updated dashboard.", ephemeral: true });
    }

    // ================= SLASH COMMANDS =================
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return interaction.reply({ content: "This command is no longer available. Ask the owner to run npm run deploy.", ephemeral: true });
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(err);
        const reply = { content: "Something went wrong running that command.", ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
        else await interaction.reply(reply);
      }
      return;
    }

    // ================= RULES: TYPE SELECTED -> MODAL =================
    if (interaction.isStringSelectMenu() && interaction.customId === "rules_type_select") {
      const ruleKey = interaction.values[0];
      const set = structure.ruleSets[ruleKey];
      const modal = new ModalBuilder().setCustomId(`rules_submit_${ruleKey}`).setTitle(set.label.slice(0, 45));
      const input = new TextInputBuilder()
        .setCustomId("rules_text")
        .setLabel("Edit rules (one per line) or leave as-is")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(set.default.join("\n").slice(0, 4000))
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // ================= RULES: MODAL SUBMITTED =================
    if (interaction.isModalSubmit() && interaction.customId.startsWith("rules_submit_")) {
      const ruleKey = interaction.customId.replace("rules_submit_", "");
      const set = structure.ruleSets[ruleKey];
      const text = interaction.fields.getTextInputValue("rules_text");
      const lines = text.split("\n").filter(l => l.trim());

      const targetChannel = interaction.guild.channels.cache.find(c => c.name.includes("rules") && !c.name.includes("hr-rules") && !c.name.includes("ia-rules"));
      if (!targetChannel) return interaction.reply({ content: "Couldn't find the rules channel. Run /setup first.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`📖 ${set.label}`)
        .setDescription(lines.map((l, i) => `**${i + 1}.** ${l}`).join("\n"))
        .setColor(structure.embedColor)
        .setTimestamp();

      await targetChannel.send({ embeds: [embed] });
      await logAction(interaction.guild, "📖 Rules Updated", `${set.label} posted by <@${interaction.user.id}>`);
      return interaction.reply({ content: `✅ ${set.label} posted in ${targetChannel}.`, ephemeral: true });
    }

    // ================= VIEW RULES BUTTON =================
    if (interaction.isButton() && interaction.customId === "view_rules") {
      const rulesChannel = interaction.guild.channels.cache.find(c => c.name.includes("rules") && !c.name.includes("hr-rules") && !c.name.includes("ia-rules"));
      return interaction.reply({ content: rulesChannel ? `📖 Head over to ${rulesChannel} to read the rules.` : "Rules channel not found yet — ask staff.", ephemeral: true });
    }

    // ================= VERIFY (AGREE) BUTTON =================
    if (interaction.isButton() && interaction.customId === "verify_member") {
      const civilianRole = interaction.guild.roles.cache.find(r => r.name === structure.roles.CIVILIAN.name);
      if (civilianRole) await interaction.member.roles.add(civilianRole).catch(() => {});
      return interaction.reply({ content: "✅ Verified! You now have access to the server.", ephemeral: true });
    }

    // ================================================================
    // DASHBOARD BUTTONS — every one below returns real, live data
    // ================================================================

    if (interaction.isButton() && interaction.customId === "dash_welcome") {
      const embed = new EmbedBuilder()
        .setTitle(`Welcome to ${interaction.guild.name}`)
        .setDescription("This server runs on ERLC roleplay with a full staff structure, ticket system, and department roleplay.")
        .addFields(
          { name: "🎭 Get Started", value: "Verify in #welcome to unlock the server." },
          { name: "📖 Rules", value: "Read both Discord and In-Game rules in #rules before playing." },
          { name: "🎫 Need Help?", value: "Open a ticket in #create-a-ticket." },
          { name: "📄 Want to Staff?", value: "Apply in #application — applications are open per department." }
        )
        .setColor(structure.embedColor);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "dash_tickets") {
      const open = db.find("tickets", t => t.guildId === interaction.guild.id && t.status === "open");
      const embed = new EmbedBuilder()
        .setTitle("🎫 Ticket System")
        .setDescription(open.length
          ? open.map(t => `• <#${t.channelId}> — ${ticketTypesUtil.getTicketType(interaction.guild.id, t.type)?.label || t.type} — <@${t.userId}>`).join("\n")
          : "No open tickets right now.")
        .setColor(structure.embedColor);
      const editRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_types_manage").setLabel("✏️ Edit Ticket Types").setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ embeds: [embed], components: [editRow], ephemeral: true });
    }

    // ================= TICKET TYPES: MANAGE (list + add/edit/remove) =================
    if (interaction.isButton() && interaction.customId === "ticket_types_manage") {
      const types = ticketTypesUtil.getTicketTypes(interaction.guild.id);
      const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_types_select_edit")
        .setPlaceholder("Select a ticket type to edit, or add a new one")
        .addOptions([
          { label: "➕ Add New Ticket Type", value: "__new__" },
          ...Object.entries(types).map(([key, t]) => ({ label: t.label.slice(0, 100), value: key }))
        ].slice(0, 25));
      const removeMenu = new StringSelectMenuBuilder()
        .setCustomId("ticket_types_select_remove")
        .setPlaceholder("Or remove a ticket type")
        .addOptions(Object.entries(types).map(([key, t]) => ({ label: `🗑️ ${t.label}`.slice(0, 100), value: key })).slice(0, 25));
      const rows = [new ActionRowBuilder().addComponents(menu)];
      if (Object.keys(types).length > 0) rows.push(new ActionRowBuilder().addComponents(removeMenu));
      return interaction.reply({ content: "Select a ticket type to edit/add, or remove one below:", components: rows, ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_types_select_remove") {
      const key = interaction.values[0];
      const types = ticketTypesUtil.getTicketTypes(interaction.guild.id);
      const label = types[key]?.label || key;
      ticketTypesUtil.removeTicketType(interaction.guild.id, key);
      await logAction(interaction.guild, "🎫 Ticket Type Removed", `<@${interaction.user.id}> removed ticket type ${key} (${label})`);
      return interaction.reply({ content: `✅ Ticket type **${label}** removed.`, ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_types_select_edit") {
      const key = interaction.values[0];
      const types = ticketTypesUtil.getTicketTypes(interaction.guild.id);
      const existing = key === "__new__" ? null : types[key];

      const modal = new ModalBuilder().setCustomId(`ticket_type_edit_modal::${key === "__new__" ? "" : key}`).setTitle(existing ? "Edit Ticket Type" : "New Ticket Type");
      const fields = [
        new TextInputBuilder().setCustomId("type_key").setLabel("Type key (short, no spaces, e.g. SUPPORT)").setStyle(TextInputStyle.Short).setValue(key === "__new__" ? "" : key).setRequired(true),
        new TextInputBuilder().setCustomId("label").setLabel("Display label (e.g. General Support)").setStyle(TextInputStyle.Short).setValue(existing?.label || "").setRequired(true),
        new TextInputBuilder().setCustomId("q1").setLabel("Question 1 (leave blank to omit)").setStyle(TextInputStyle.Short).setValue(existing?.questions?.[0]?.label || "").setRequired(false),
        new TextInputBuilder().setCustomId("q2").setLabel("Question 2 (leave blank to omit)").setStyle(TextInputStyle.Short).setValue(existing?.questions?.[1]?.label || "").setRequired(false),
        new TextInputBuilder().setCustomId("q3").setLabel("Question 3 (leave blank to omit)").setStyle(TextInputStyle.Short).setValue(existing?.questions?.[2]?.label || "").setRequired(false)
      ];
      modal.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(f)));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_type_edit_modal::")) {
      const originalKey = interaction.customId.replace("ticket_type_edit_modal::", "");
      const newKey = interaction.fields.getTextInputValue("type_key").trim().toUpperCase().replace(/\s+/g, "_");
      const label = interaction.fields.getTextInputValue("label").trim();
      const questions = ["q1", "q2", "q3"]
        .map((id, i) => ({ id: `q${i + 1}`, label: interaction.fields.getTextInputValue(id).trim() }))
        .filter(q => q.label);

      if (questions.length === 0) {
        return interaction.reply({ content: "❌ A ticket type needs at least one question.", ephemeral: true });
      }

      // If the key changed (e.g. renaming), remove the old override entry so
      // it doesn't linger alongside the new one.
      if (originalKey && originalKey !== newKey) {
        ticketTypesUtil.removeTicketType(interaction.guild.id, originalKey);
      }
      ticketTypesUtil.saveTicketTypeOverride(interaction.guild.id, newKey, { label, questions });

      await logAction(interaction.guild, "🎫 Ticket Type Edited", `<@${interaction.user.id}> ${originalKey ? `edited ${originalKey} →` : "created"} ${newKey} (${label})`);
      return interaction.reply({ content: `✅ Ticket type **${label}** saved.`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "dash_roles") {
      const isOwnerTeam = interaction.guild.ownerId === interaction.user.id || interaction.member.roles.cache.some(r => r.name === structure.roles.CO_OWNER.name);
      if (!isOwnerTeam) {
        return interaction.reply({ content: "Only the Owner and Co-Owner can manage Auto Roles.", ephemeral: true });
      }
      const settings = db.load("settings");
      const current = settings.find(s => s.key === "autoRoleId");
      const embed = new EmbedBuilder()
        .setTitle("🎭 Auto Roles")
        .setDescription(Object.values(structure.roles).map(r => `${r.name}`).join("\n"))
        .addFields(
          { name: "How roles are assigned", value: "Join Role → auto on join (set below)\nCivilian → auto on verification (Agree button)\nDepartment/Mod roles → auto on application approval" },
          { name: "Current Join Role", value: current?.value ? `<@&${current.value}>` : "Not set" }
        )
        .setColor(structure.embedColor);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("dash_set_autorole").setLabel("Set Join Role ID").setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "dash_set_autorole") {
      const isOwnerTeam = interaction.guild.ownerId === interaction.user.id || interaction.member.roles.cache.some(r => r.name === structure.roles.CO_OWNER.name);
      if (!isOwnerTeam) {
        return interaction.reply({ content: "Only the Owner and Co-Owner can manage Auto Roles.", ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId("autorole_modal").setTitle("Set Join Auto Role");
      const input = new TextInputBuilder().setCustomId("role_id").setLabel("Role ID members get on join").setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "autorole_modal") {
      const roleId = interaction.fields.getTextInputValue("role_id").replace(/\D/g, "");
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: "Couldn't find a role with that ID in this server.", ephemeral: true });

      const settings = db.load("settings");
      let record = settings.find(s => s.key === "autoRoleId");
      if (!record) {
        record = { id: "settings_autoRoleId", key: "autoRoleId", value: null };
        settings.push(record);
      }
      record.value = roleId;
      db.save("settings", settings);
      await logAction(interaction.guild, "🎭 Auto Role Set", `Join role set to ${role} by <@${interaction.user.id}>`);
      return interaction.reply({ content: `✅ New members will now automatically receive ${role} on join.`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "dash_applications") {
      const settings = db.load("settings");
      const current = settings.find(s => s.key === "applications") || { key: "applications", value: {} };
      const row1 = new ActionRowBuilder();
      const row2 = new ActionRowBuilder();
      let i = 0;
      for (const [key, app] of Object.entries(structure.applications)) {
        const enabled = current.value[key] !== false;
        const btn = new ButtonBuilder().setCustomId(`toggle_app_${key}`).setLabel(`${app.label}: ${enabled ? "ON" : "OFF"}`).setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger);
        (i < 3 ? row1 : row2).addComponents(btn);
        i++;
      }
      const rows = row2.components.length ? [row1, row2] : [row1];

      const editMenu = new StringSelectMenuBuilder()
        .setCustomId("edit_app_questions_select")
        .setPlaceholder("Manage questions for an application")
        .addOptions(Object.entries(structure.applications).map(([key, app]) => ({ label: app.label, value: key })));
      rows.push(new ActionRowBuilder().addComponents(editMenu));

      return interaction.reply({ content: "Toggle applications on/off, or pick one below to add/remove its questions:", components: rows, ephemeral: true });
    }

    // ================= EDIT APPLICATION QUESTIONS: PICK APP -> MANAGE VIEW =================
    if (interaction.isStringSelectMenu() && interaction.customId === "edit_app_questions_select") {
      const appKey = interaction.values[0];
      return interaction.reply(buildQuestionManagerView(appKey, interaction));
    }

    // ================= MANAGE VIEW: ADD QUESTION BUTTON -> MODAL =================
    if (interaction.isButton() && interaction.customId.startsWith("manage_app_add_")) {
      const appKey = interaction.customId.replace("manage_app_add_", "");
      const modal = new ModalBuilder().setCustomId(`add_question_modal_${appKey}`).setTitle(`Add Question: ${structure.applications[appKey].label}`.slice(0, 45));
      const input = new TextInputBuilder().setCustomId("question_text").setLabel("New question").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // ================= ADD QUESTION MODAL SUBMITTED =================
    if (interaction.isModalSubmit() && interaction.customId.startsWith("add_question_modal_")) {
      const appKey = interaction.customId.replace("add_question_modal_", "");
      const text = interaction.fields.getTextInputValue("question_text").trim();
      if (!text) return interaction.reply({ content: "Question can't be blank.", ephemeral: true });

      const questions = getAppQuestions(appKey);
      questions.push({ id: `q${questions.length + 1}_${Date.now()}`, label: text, style: "PARAGRAPH" });
      saveAppQuestions(appKey, questions);

      await logAction(interaction.guild, "📄 Application Question Added", `${structure.applications[appKey].label} — added by <@${interaction.user.id}>`);
      return interaction.reply(buildQuestionManagerView(appKey, interaction, `✅ Question added. **${questions.length}** question(s) total.`));
    }

    // ================= MANAGE VIEW: REMOVE QUESTION BUTTON -> SELECT MENU =================
    if (interaction.isButton() && interaction.customId.startsWith("manage_app_remove_")) {
      const appKey = interaction.customId.replace("manage_app_remove_", "");
      const questions = getAppQuestions(appKey);
      if (questions.length <= 1) return interaction.reply({ content: "You need to keep at least one question — add another before removing this one.", ephemeral: true });

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`remove_question_select_${appKey}`)
        .setPlaceholder("Pick a question to remove")
        .addOptions(questions.map((q, idx) => ({ label: `${idx + 1}. ${q.label}`.slice(0, 100), value: String(idx) })));
      const row = new ActionRowBuilder().addComponents(menu);
      return interaction.reply({ content: "Which question do you want to remove?", components: [row], ephemeral: true });
    }

    // ================= REMOVE QUESTION SELECTED =================
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("remove_question_select_")) {
      const appKey = interaction.customId.replace("remove_question_select_", "");
      const idx = parseInt(interaction.values[0], 10);
      const questions = getAppQuestions(appKey);
      const removed = questions.splice(idx, 1);
      saveAppQuestions(appKey, questions);

      await logAction(interaction.guild, "📄 Application Question Removed", `${structure.applications[appKey].label} — "${removed[0]?.label}" removed by <@${interaction.user.id}>`);
      return interaction.reply(buildQuestionManagerView(appKey, interaction, `✅ Question removed. **${questions.length}** question(s) left.`));
    }

    if (interaction.isButton() && interaction.customId === "dash_app_results") {
      const pending = db.find("applications", a => a.status === "pending" && a.guildId === interaction.guild.id);
      const embed = new EmbedBuilder()
        .setTitle("📊 Applications Awaiting Review")
        .setDescription(pending.length
          ? pending.map(a => `• **${structure.applications[a.type]?.label}** — <@${a.userId}> — ID \`${a.id}\``).join("\n")
          : "No applications pending review.")
        .setColor(structure.embedColor);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "dash_logging") {
      const logChannel = interaction.guild.channels.cache.find(c => c.name.includes("bot-logs"));
      const embed = new EmbedBuilder()
        .setTitle("⚠️ Logging")
        .setDescription(`All actions (setup, tickets, applications, promotions/demotions, rules changes) are logged to ${logChannel || "#bot-logs"}.`)
        .setColor(structure.embedColor);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "dash_announcements") {
      const embed = new EmbedBuilder()
        .setTitle("📢 Announcements")
        .setDescription("Use `/announce` to post immediately, or `/schedule-announcement` to queue one for later. Both support pinging @everyone/@here.")
        .setColor(structure.embedColor);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.isButton() && (interaction.customId === "dash_promote" || interaction.customId === "dash_demote")) {
      const action = interaction.customId === "dash_promote" ? "promote" : "demote";
      const menu = new UserSelectMenuBuilder()
        .setCustomId(`rank_user_select_${action}`)
        .setPlaceholder("Search and select a member")
        .setMinValues(1)
        .setMaxValues(1);
      const row = new ActionRowBuilder().addComponents(menu);
      return interaction.reply({ content: `Select the member you want to ${action}:`, components: [row], ephemeral: true });
    }

    // ================= RANK: USER SELECTED -> LIVE ROLE DROPDOWN =================
    // Uses RoleSelectMenuBuilder so this always reflects the server's actual
    // current roles — renaming a role in Discord can never desync this picker.
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith("rank_user_select_")) {
      const action = interaction.customId.replace("rank_user_select_", "");
      const userId = interaction.values[0];
      const roleMenu = new RoleSelectMenuBuilder()
        .setCustomId(`rank_role_select::${action}::${userId}`)
        .setPlaceholder("Select the new rank")
        .setMinValues(1).setMaxValues(1);
      const row = new ActionRowBuilder().addComponents(roleMenu);
      return interaction.reply({ content: `What rank should <@${userId}> be ${action === "promote" ? "promoted" : "demoted"} to?`, components: [row], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "dash_partnerships") {
      // Requests submitted through the public Partnership application (in #application)
      // live in "applications" with type PARTNER — separate from staff-created ads below.
      const pendingApps = db.find("applications", a => a.guildId === interaction.guild.id && a.type === "PARTNER" && a.status !== "approved" && a.status !== "rejected");
      const ads = db.find("partnerships", p => p.guildId === interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle("🤝 Partnerships")
        .addFields(
          { name: "Pending Partnership Applications", value: pendingApps.length ? pendingApps.map(a => `• ${a.answers?.q1 || "N/A"} — <@${a.userId}>`).join("\n").slice(0, 1024) : "None — these come in via the Partnership application in #application." },
          { name: "Partnership Ads", value: ads.length ? ads.map(p => `• **${p.serverName}** — ${p.repId ? `Rep: <@${p.repId}>` : "No rep assigned"} (${p.status})`).join("\n").slice(0, 1024) : "No partnership ads created yet." }
        )
        .setColor(structure.embedColor);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("partnership_create_ad").setLabel("➕ Create Partnership Ad").setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ================= PARTNERSHIP: CREATE AD =================
    if (interaction.isButton() && interaction.customId === "partnership_create_ad") {
      const modal = new ModalBuilder().setCustomId("partnership_ad_modal").setTitle("Create Partnership Advertisement");
      const fields = [
        new TextInputBuilder().setCustomId("server_name").setLabel("Partner server name").setStyle(TextInputStyle.Short).setRequired(true),
        new TextInputBuilder().setCustomId("invite").setLabel("Invite link").setStyle(TextInputStyle.Short).setRequired(true),
        new TextInputBuilder().setCustomId("description").setLabel("Description / what they offer").setStyle(TextInputStyle.Paragraph).setRequired(true)
      ];
      modal.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(f)));
      return interaction.showModal(modal);
    }

    // ================= PARTNERSHIP: AD SUBMITTED -> CHOOSE REP (live member list) =================
    if (interaction.isModalSubmit() && interaction.customId === "partnership_ad_modal") {
      const serverName = interaction.fields.getTextInputValue("server_name").trim();
      const invite = interaction.fields.getTextInputValue("invite").trim();
      const description = interaction.fields.getTextInputValue("description").trim();

      const entry = db.add("partnerships", { guildId: interaction.guild.id, createdBy: interaction.user.id, serverName, invite, description, status: "pending_rep", repId: null });

      // UserSelectMenu pulls Discord's live list of everyone currently in the
      // server — not just staff, and never a code-defined list.
      const menu = new UserSelectMenuBuilder()
        .setCustomId(`partnership_choose_rep::${entry.id}`)
        .setPlaceholder("Choose a rep for this partnership")
        .setMinValues(1).setMaxValues(1);
      const row = new ActionRowBuilder().addComponents(menu);
      return interaction.reply({ content: `✅ Partnership ad for **${serverName}** created. Now choose a rep:`, components: [row], ephemeral: true });
    }

    // ================= PARTNERSHIP: REP CHOSEN -> ASSIGN & POST =================
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith("partnership_choose_rep::")) {
      const adId = interaction.customId.replace("partnership_choose_rep::", "");
      const repId = interaction.values[0];
      const ad = db.update("partnerships", adId, { repId, status: "assigned", assignedBy: interaction.user.id });
      if (!ad) return interaction.reply({ content: "Couldn't find this partnership ad.", ephemeral: true });

      const partnershipChannel = interaction.guild.channels.cache.find(c => c.name.includes("partnership"));
      const embed = new EmbedBuilder()
        .setTitle(`🤝 Partnership — ${ad.serverName}`)
        .setDescription(ad.description)
        .addFields(
          { name: "Invite", value: ad.invite, inline: true },
          { name: "Assigned Rep", value: `<@${repId}>`, inline: true }
        )
        .setColor(structure.embedColor)
        .setTimestamp();
      if (partnershipChannel) await partnershipChannel.send({ embeds: [embed] });

      const repMember = await interaction.guild.members.fetch(repId).catch(() => null);
      if (repMember) await repMember.send(`🤝 You've been assigned as the rep for the **${ad.serverName}** partnership in **${interaction.guild.name}**.`).catch(() => {});

      await logAction(interaction.guild, "🤝 Partnership Rep Assigned", `<@${interaction.user.id}> assigned <@${repId}> to the ${ad.serverName} partnership.`);
      return interaction.reply({ content: `✅ <@${repId}> assigned as rep for **${ad.serverName}**.`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "dash_edit") {
      const embed = new EmbedBuilder()
        .setTitle("✏️ Edit Server Content")
        .setDescription("Use these commands to re-edit and re-post content:\n• `/rules` — rebuild Discord or In-Game rules\n• `/announce` — post a new announcement\n• `/staffguide` — rebuild the staff guide\n\nRe-running these overwrites nothing automatically — old posts stay, new ones post fresh below them (delete old manually if needed).")
        .setColor(structure.embedColor);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ================= APPLICATION TOGGLE =================
    if (interaction.isButton() && interaction.customId.startsWith("toggle_app_")) {
      const appKey = interaction.customId.replace("toggle_app_", "");
      const settings = db.load("settings");
      let record = settings.find(s => s.key === "applications");
      if (!record) {
        record = { id: "settings_applications", key: "applications", value: {} };
        settings.push(record);
      }
      const currentlyEnabled = record.value[appKey] !== false;
      record.value[appKey] = !currentlyEnabled;
      db.save("settings", settings);
      await logAction(interaction.guild, "⚙️ Application Toggled", `${structure.applications[appKey].label} set to ${!currentlyEnabled ? "ON" : "OFF"} by <@${interaction.user.id}>`);
      return interaction.reply({ content: `${structure.applications[appKey].label} is now **${!currentlyEnabled ? "ON" : "OFF"}**.`, ephemeral: true });
    }

    // ================= OPEN TICKET (menu) =================
    if (interaction.isButton() && interaction.customId === "ticket_open") {
      const options = Object.entries(ticketTypesUtil.getTicketTypes(interaction.guild.id)).slice(0, 24).map(([key, t]) => ({ label: t.label.slice(0, 100), value: key }));
      if (staffIdentity.isStaff(interaction.guild, interaction.member)) options.push({ label: 'Staff Only Tickets', value: 'STAFF_ONLY', description: 'A permanent staff ID is required' });
      const menu = new StringSelectMenuBuilder().setCustomId('ticket_type_select').setPlaceholder('Choose a ticket type').addOptions(options);
      return interaction.reply({ content: 'What type of ticket do you need?', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    // ================= TICKET TYPE SELECTED -> PRIORITY QUESTION =================
    if (interaction.isStringSelectMenu() && ['ticket_type_select', 'staffticket_type_select'].includes(interaction.customId)) {
      const typeKey = interaction.values[0];
      if (typeKey === 'STAFF_ONLY') {
        if (!staffIdentity.isStaff(interaction.guild, interaction.member)) return interaction.reply({ content: 'Staff Only tickets are for current staff members.', ephemeral: true });
        const menu = new StringSelectMenuBuilder().setCustomId('staffticket_type_select').setPlaceholder('Choose your staff ticket reason')
          .addOptions(Object.entries(structure.staffTicketTypes).map(([key, t]) => ({ label: t.label, value: key })));
        return interaction.update({ content: 'Choose a staff ticket reason. Your own staff ID is required. Go to staff guide to get your staff ID.', components: [new ActionRowBuilder().addComponents(menu)] });
      }
      const ticketType = ticketTypesUtil.getTicketType(interaction.guild.id, typeKey);
      if (!ticketType) return interaction.reply({ content: 'This ticket type is no longer available.', ephemeral: true });
      if (ticketTypesUtil.isStaffTicketType(typeKey) && !staffIdentity.isStaff(interaction.guild, interaction.member)) return interaction.reply({ content: 'Staff Only tickets are for current staff members.', ephemeral: true });
      const menu = new StringSelectMenuBuilder().setCustomId(`ticket_priority_intake::${typeKey}`).setPlaceholder('How critical is this?')
        .addOptions({ label: '🟢 Low', value: 'low' }, { label: '🔵 Normal', value: 'normal' }, { label: '🟠 High', value: 'high' }, { label: '🔴 Urgent', value: 'urgent' });
      return interaction.update({ content: 'How critical is this?', components: [new ActionRowBuilder().addComponents(menu)] });
    }

    // ================= TICKET PRIORITY ANSWERED -> INTAKE QUESTIONS MODAL =================
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("ticket_priority_intake::")) {
      const typeKey = interaction.customId.replace("ticket_priority_intake::", "");
      const priority = interaction.values[0];
      const ticketType = ticketTypesUtil.getTicketType(interaction.guild.id, typeKey);

      if (!ticketType || !['low', 'normal', 'high', 'urgent'].includes(priority)) return interaction.reply({ content: 'Open the ticket menu again to choose a valid ticket type and priority.', ephemeral: true });
      const staffOnly = ticketTypesUtil.isStaffTicketType(typeKey);
      if (staffOnly && !staffIdentity.isStaff(interaction.guild, interaction.member)) return interaction.reply({ content: 'Staff Only tickets are for current staff members.', ephemeral: true });
      const modal = new ModalBuilder().setCustomId(`ticket_intake::${typeKey}::${priority}`).setTitle(ticketType.label.slice(0, 45));
      const rows = ticketType.questions.map(q =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(q.id).setLabel(q.label.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
      if (staffOnly) rows.unshift(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('staffId').setLabel('Your Staff ID').setPlaceholder('Go to staff guide to get your staff ID').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)));
      if (rows.length > 5) return interaction.reply({ content: 'This ticket form has too many questions. Please contact management.', ephemeral: true });
      modal.addComponents(...rows);
      return interaction.showModal(modal);
    }

    // ================= TICKET INTAKE MODAL SUBMITTED -> CREATE PRIVATE CHANNEL + QUEUE POST =================
    if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_intake::")) {
      const [, typeKey, priority] = interaction.customId.split("::");
      const ticketType = ticketTypesUtil.getTicketType(interaction.guild.id, typeKey);
      const guild = interaction.guild;
      const PRIORITY_EMOJI = { low: "🟢", normal: "🔵", high: "🟠", urgent: "🔴" };

      if (!ticketType || !Object.hasOwn(PRIORITY_EMOJI, priority)) return interaction.reply({ content: 'Open the ticket menu again to choose a valid ticket type and priority.', ephemeral: true });
      const staffOnly = ticketTypesUtil.isStaffTicketType(typeKey);
      let staffRecord = null;
      if (staffOnly) {
        if (!staffIdentity.isStaff(guild, interaction.member)) return interaction.reply({ content: 'Staff Only tickets are for current staff members.', ephemeral: true });
        try { staffRecord = staffIdentity.checkTicketId(guild.id, interaction.user.id, interaction.fields.getTextInputValue('staffId')); }
        catch (err) { return interaction.reply({ content: err.message, ephemeral: true }); }
      }
      const answers = {};
      for (const q of ticketType.questions) answers[q.id] = interaction.fields.getTextInputValue(q.id);
      await interaction.deferReply({ ephemeral: true });

      // Ticket channel is private to the opener only — NOT even Support can see it
      // until they Claim it from the queue. This matches: only the info filled in
      // is visible up front; full contents require claiming first.
      const channel = await guild.channels.create({
        name: `${PRIORITY_EMOJI[priority]}ticket-${interaction.user.username}`.toLowerCase().slice(0, 90),
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: ["ViewChannel"] },
          { id: guild.client.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
          { id: interaction.user.id, allow: ["ViewChannel", "SendMessages"] }
        ]
      });

      const entry = db.add("tickets", { guildId: guild.id, channelId: channel.id, userId: interaction.user.id, type: typeKey, status: "open", answers, claimedBy: null, priority, staffOnly, staffId: staffRecord?.staffId || null });

      const introEmbed = new EmbedBuilder()
        .setTitle(`🎫 ${ticketType.label}`)
        .setDescription(`Hi ${interaction.user}, your ticket has been submitted. A staff member will claim it and be with you shortly.\nUse \`/close\` when this is resolved.`)
        .addFields(
          { name: "Priority", value: `${PRIORITY_EMOJI[priority]} ${priority.toUpperCase()}`, inline: true },
          ...(staffRecord ? [{ name: 'Staff ID', value: staffRecord.staffId, inline: true }] : []),
          ...ticketType.questions.map(q => ({ name: q.label.slice(0, 256), value: (answers[q.id] || "N/A").slice(0, 1000) }))
        )
        .setColor(structure.embedColor);
      await channel.send({ content: `${interaction.user}`, embeds: [introEmbed] });

      // Queue post — visible ONLY to ticketQueueRoleKeys (Support + Owner/Co-Owner).
      // Shows just the submitted answers; the actual channel stays hidden until claimed.
      const queueChannel = guild.channels.cache.find(c => c.name.includes("ticket-queue"));
      if (queueChannel) {
        const queueEmbed = new EmbedBuilder()
          .setTitle(`🎫 New Ticket: ${ticketType.label}`)
          .setDescription(`Opened by: <@${interaction.user.id}>`)
          .addFields(
            { name: "Priority", value: `${PRIORITY_EMOJI[priority]} ${priority.toUpperCase()}`, inline: true },
            ...(staffRecord ? [{ name: 'Staff ID', value: staffRecord.staffId, inline: true }] : []),
          ...ticketType.questions.map(q => ({ name: q.label.slice(0, 256), value: (answers[q.id] || "N/A").slice(0, 1000) }))
          )
          .setColor(structure.embedColor)
          .setFooter({ text: `Ticket ID: ${entry.id} — unclaimed` })
          .setTimestamp();
        const claimRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ticket_claim_${entry.id}`).setLabel("Claim Ticket").setStyle(ButtonStyle.Success)
        );
        await queueChannel.send({ embeds: [queueEmbed], components: [claimRow] });
      }

      await logAction(guild, "🎫 Ticket Opened", `${ticketType.label} by <@${interaction.user.id}> in ${channel}`);
      return interaction.editReply({ content: `✅ Ticket created: ${channel} — a Support staff member will claim it shortly.` });
    }

    // ================= CLAIM TICKET =================
    if (interaction.isButton() && interaction.customId.startsWith("ticket_claim_")) {
      const isTicketStaff = interaction.guild.ownerId === interaction.user.id || interaction.member.roles.cache.some(r => r.name === structure.roles.CO_OWNER.name || r.name === structure.roles.SUPPORT.name);
      if (!isTicketStaff) {
        return interaction.reply({ content: "Only Support Staff can claim tickets.", ephemeral: true });
      }

      const id = interaction.customId.replace("ticket_claim_", "");
      const ticket = db.find("tickets", t => t.id === id)[0];
      if (!ticket) return interaction.reply({ content: "Ticket not found — it may have already been closed.", ephemeral: true });
      if (ticket.claimedBy) return interaction.reply({ content: `Already claimed by <@${ticket.claimedBy}>.`, ephemeral: true });

      db.update("tickets", id, { claimedBy: interaction.user.id });

      const channel = interaction.guild.channels.cache.get(ticket.channelId);
      if (channel) {
        await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true });
        const controlRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ticket_escalate_${id}`).setLabel("🔔 Request Another Role").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`ticket_transfer_${id}`).setLabel("🔁 Transfer Ticket").setStyle(ButtonStyle.Secondary)
        );
        await channel.send({ content: `✅ This ticket has been claimed by <@${interaction.user.id}>.`, components: [controlRow] });
      }

      await logAction(interaction.guild, "🎫 Ticket Claimed", `<@${interaction.user.id}> claimed ticket ${id}`);

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `Ticket ID: ${id} — claimed by ${interaction.user.tag}` });
      await interaction.update({ embeds: [updatedEmbed], components: [] });
    }

    // ================= OPEN APPLICATION (menu) =================
    if (interaction.isButton() && interaction.customId === "app_open") {
      const settings = db.load("settings");
      const record = settings.find(s => s.key === "applications");
      const enabledApps = Object.entries(structure.applications).filter(([key]) => !record || record.value[key] !== false);

      if (!enabledApps.length) return interaction.reply({ content: "No applications are currently open.", ephemeral: true });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("app_type_select")
        .setPlaceholder("Choose an application")
        .addOptions(enabledApps.map(([key, app]) => ({ label: app.label, value: key })));
      const row = new ActionRowBuilder().addComponents(menu);
      return interaction.reply({ content: "Which application would you like to submit? These are long — take your time on the scenarios.", components: [row], ephemeral: true });
    }

    // ================= APPLICATION TYPE SELECTED -> START DM CONVERSATION =================
    if (interaction.isStringSelectMenu() && interaction.customId === "app_type_select") {
      const appKey = interaction.values[0];
      if (!structure.applications[appKey]) {
        return interaction.reply({ content: "This application is no longer available. Open the application menu again.", ephemeral: true });
      }

      // Cooldown check — only looks at this application TYPE's most recent rejection.
      const priorRejections = db.find("applications", a => a.guildId === interaction.guild.id && a.userId === interaction.user.id && a.type === appKey && a.status === "rejected");
      if (priorRejections.length > 0) {
        const mostRecent = priorRejections.sort((a, b) => new Date(b.reviewedAt || b.id) - new Date(a.reviewedAt || a.id))[0];
        const rejectedAt = mostRecent.reviewedAt ? new Date(mostRecent.reviewedAt) : null;
        if (rejectedAt) {
          const cooldownMs = (structure.applicationCooldownDays || 7) * 24 * 60 * 60 * 1000;
          const remaining = rejectedAt.getTime() + cooldownMs - Date.now();
          if (remaining > 0) {
            const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            return interaction.reply({ content: `⏳ You cannot submit another **${structure.applications[appKey]?.label}** yet.\n\nYou can apply again in: **${days} days ${hours} hours**.`, ephemeral: true });
          }
        }
      }

      return runDMApplication(interaction, appKey);
    }

    // ================= APPLICATION: MARK UNDER REVIEW =================
    if (interaction.isButton() && interaction.customId.startsWith("app_review_")) {
      const isOwnerTeam = interaction.guild.ownerId === interaction.user.id || interaction.member.roles.cache.some(r => r.name === structure.roles.CO_OWNER.name);
      if (!isOwnerTeam) return interaction.reply({ content: "Only the Owner and Co-Owner can review applications.", ephemeral: true });

      const id = interaction.customId.replace("app_review_", "");
      const updated = db.update("applications", id, { status: "under_review", reviewingBy: interaction.user.id });
      if (!updated) return interaction.reply({ content: "Application not found.", ephemeral: true });

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `Application ID: ${id} — 🔎 Under Review by ${interaction.user.tag}` });
      await interaction.update({ embeds: [updatedEmbed] });
      return logAction(interaction.guild, "📋 Application Under Review", `<@${interaction.user.id}> is now reviewing application ${id}`);
    }

    // ================= APPLICATION APPROVE BUTTON -> REASON MODAL =================
    if (interaction.isButton() && interaction.customId.startsWith("app_approve_")) {
      const isOwnerTeam = interaction.guild.ownerId === interaction.user.id || interaction.member.roles.cache.some(r => r.name === structure.roles.CO_OWNER.name);
      if (!isOwnerTeam) {
        return interaction.reply({ content: "Only the Owner and Co-Owner can approve or reject applications.", ephemeral: true });
      }
      const id = interaction.customId.replace("app_approve_", "");
      const modal = new ModalBuilder().setCustomId(`app_reason_modal_approve_${id}`).setTitle("Approve Application");
      const input = new TextInputBuilder().setCustomId("reason").setLabel("Reason (leave blank or type 'No reason')").setStyle(TextInputStyle.Paragraph).setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // ================= APPLICATION REJECT BUTTON -> PRESET REASON DROPDOWN =================
    if (interaction.isButton() && interaction.customId.startsWith("app_reject_")) {
      const isOwnerTeam = interaction.guild.ownerId === interaction.user.id || interaction.member.roles.cache.some(r => r.name === structure.roles.CO_OWNER.name);
      if (!isOwnerTeam) {
        return interaction.reply({ content: "Only the Owner and Co-Owner can approve or reject applications.", ephemeral: true });
      }
      const id = interaction.customId.replace("app_reject_", "");
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`app_reject_reason_select_${id}`)
        .setPlaceholder("Select a rejection reason")
        .addOptions(structure.applicationRejectionReasons.map(r => ({ label: r.slice(0, 100), value: r.slice(0, 100) })));
      return interaction.reply({ content: "Select the reason for rejecting this application:", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("app_reject_reason_select_")) {
      const id = interaction.customId.replace("app_reject_reason_select_", "");
      const selected = interaction.values[0];
      if (selected === "Other") {
        const modal = new ModalBuilder().setCustomId(`app_reason_modal_reject_${id}`).setTitle("Reject Application");
        const input = new TextInputBuilder().setCustomId("reason").setLabel("Custom reason").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      return finalizeApplication(interaction, id, false, selected);
    }

    // ================= APPLICATION REASON MODAL SUBMITTED -> FINALIZE =================
    if (interaction.isModalSubmit() && interaction.customId.startsWith("app_reason_modal_")) {
      const rest = interaction.customId.replace("app_reason_modal_", "");
      const approve = rest.startsWith("approve_");
      const id = rest.replace(/^(approve_|reject_)/, "");
      const reason = interaction.fields.getTextInputValue("reason").trim() || "No reason provided";
      return finalizeApplication(interaction, id, approve, reason);
    }

    // ================= OFFICES (dashboard) =================
    if (interaction.isButton() && interaction.customId === "dash_offices") {
      const offices = db.find("offices", o => o.guildId === interaction.guild.id);
      const embed = new EmbedBuilder()
        .setTitle("🏢 Offices")
        .setDescription(offices.length ? offices.map(o => `• **${o.name}** — <#${o.channelId}>`).join("\n") : "No offices created yet.")
        .setColor(structure.embedColor);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("office_add").setLabel("➕ Add Office").setStyle(ButtonStyle.Success)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "office_add") {
      const modal = new ModalBuilder().setCustomId("office_name_modal").setTitle("New Office");
      const input = new TextInputBuilder().setCustomId("office_name").setLabel("Office name").setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "office_name_modal") {
      const officeName = interaction.fields.getTextInputValue("office_name").trim();
      const menu = new RoleSelectMenuBuilder()
        .setCustomId(`office_roles_select::${encodeURIComponent(officeName)}`)
        .setPlaceholder("Which roles can enter this office?")
        .setMinValues(1)
        .setMaxValues(10);
      const row = new ActionRowBuilder().addComponents(menu);
      return interaction.reply({ content: `Which roles should be able to enter **${officeName}**?`, components: [row], ephemeral: true });
    }

    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("office_roles_select::")) {
      const officeName = decodeURIComponent(interaction.customId.replace("office_roles_select::", ""));
      const roleIds = interaction.values;

      const officesCategory = interaction.guild.channels.cache.find(c => c.name.includes("Offices") && c.type === ChannelType.GuildCategory);
      const channel = await interaction.guild.channels.create({
        name: `🏢-${officeName}`.toLowerCase().replace(/\s+/g, "-"),
        type: ChannelType.GuildText,
        parent: officesCategory?.id,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone, deny: ["ViewChannel"] },
          ...roleIds.map(id => ({ id, allow: ["ViewChannel", "SendMessages"] }))
        ]
      });

      db.add("offices", { guildId: interaction.guild.id, name: officeName, channelId: channel.id, roleIds, createdBy: interaction.user.id });
      await logAction(interaction.guild, "🏢 Office Created", `${officeName} created by <@${interaction.user.id}>`);
      return interaction.reply({ content: `✅ Office **${officeName}** created: ${channel}`, ephemeral: true });
    }

    // ================= RANK: ROLE SELECTED -> REASON MODAL =================
    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("rank_role_select::")) {
      const [, action, userId] = interaction.customId.split("::");
      const roleId = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`rank_reason_modal::${action}::${userId}::${roleId}`).setTitle(`${action === "promote" ? "Promotion" : "Demotion"} Reason`);
      const input = new TextInputBuilder().setCustomId("reason").setLabel("Reason").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // ================= RANK: REASON SUBMITTED -> APPLY REAL ROLE CHANGE =================
    if (interaction.isModalSubmit() && interaction.customId.startsWith("rank_reason_modal::")) {
      const [, action, userId, roleId] = interaction.customId.split("::");
      const reason = interaction.fields.getTextInputValue("reason");

      const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
      const newRole = interaction.guild.roles.cache.get(roleId);
      if (!targetMember || !newRole) {
        return interaction.reply({ content: "❌ Couldn't find that member or role anymore — they may have left or the role was deleted.", ephemeral: true });
      }

      // Their current highest staff role becomes "fromRole" for the history record,
      // then gets removed in favor of the newly selected one (ranks are single-tier).
      const priorTop = rolesUtil.getHighestStaffRole(interaction.guild, targetMember);
      const fromRoleName = priorTop ? priorTop.role.name : "None";

      try {
        if (priorTop && priorTop.role.id !== newRole.id) {
          await targetMember.roles.remove(priorTop.role).catch(() => {});
        }
        await targetMember.roles.add(newRole);
        const staffPingRole = rolesUtil.resolveRole(interaction.guild, "STAFF_PING");
        if (staffPingRole && !targetMember.roles.cache.has(staffPingRole.id)) {
          await targetMember.roles.add(staffPingRole).catch(() => {});
        }
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: "❌ Something went wrong changing that member's role. Check the bot's role position and permissions.", ephemeral: true });
      }

      rolesUtil.markStaffSince(interaction.guild.id, userId);
      if (action === "promote") rolesUtil.recordPromotion(interaction.guild.id, userId, { fromRole: fromRoleName, toRole: newRole.name, by: interaction.user.id, reason });
      else rolesUtil.recordDemotion(interaction.guild.id, userId, { fromRole: fromRoleName, toRole: newRole.name, by: interaction.user.id, reason });


      const logChannel = interaction.guild.channels.cache.find(c => c.name.includes("promotions-demotions"));
      const logEmbed = new EmbedBuilder()
        .setTitle(action === "promote" ? "📈 Promotion" : "📉 Demotion")
        .addFields(
          { name: "User", value: `<@${userId}>`, inline: true },
          { name: "From", value: fromRoleName, inline: true },
          { name: "To", value: newRole.name, inline: true },
          { name: "Issued By", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Reason", value: reason }
        )
        .setColor(action === "promote" ? "#2ECC71" : "#E74C3C")
        .setTimestamp();
      if (logChannel) await logChannel.send({ embeds: [logEmbed] });

      const dmEmbed = new EmbedBuilder()
        .setTitle(action === "promote" ? "📈 You've been promoted!" : "📉 Rank Update")
        .setDescription(`Your rank in **${interaction.guild.name}** has changed.`)
        .addFields({ name: "New Rank", value: newRole.name }, { name: "Reason", value: reason })
        .setColor(structure.embedColor);
      await targetMember.send({ embeds: [dmEmbed] }).catch(() => {});

      await logAction(interaction.guild, `${action === "promote" ? "📈" : "📉"} Staff ${action === "promote" ? "Promoted" : "Demoted"}`, `<@${interaction.user.id}> changed <@${userId}>'s rank: ${fromRoleName} → ${newRole.name}`);
      return interaction.reply({ content: `✅ <@${userId}> ${action === "promote" ? "promoted" : "demoted"} to **${newRole.name}**.`, ephemeral: true });
    }

    // ================= TICKET: REQUEST SPECIFIC ROLE (escalate) =================
    if (interaction.isButton() && interaction.customId.startsWith("ticket_escalate_")) {
      const ticketId = interaction.customId.replace("ticket_escalate_", "");
      const isTicketStaff = interaction.guild.ownerId === interaction.user.id || interaction.member.roles.cache.some(r => structure.ticketQueueRoleKeys.includes(Object.keys(structure.roles).find(k => structure.roles[k].name === r.name)));
      if (!isTicketStaff) {
        return interaction.reply({ content: "Only staff with access to this ticket can request another role.", ephemeral: true });
      }

      // Live role picker — always reflects the server's actual current roles.
      const menu = new RoleSelectMenuBuilder()
        .setCustomId(`ticket_escalate_role_select::${ticketId}`)
        .setPlaceholder("Which role should be pinged and given access?")
        .setMinValues(1).setMaxValues(1);
      const row = new ActionRowBuilder().addComponents(menu);
      return interaction.reply({ content: "Which role do you need in this ticket?", components: [row], ephemeral: true });
    }

    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("ticket_escalate_role_select::")) {
      const ticketId = interaction.customId.replace("ticket_escalate_role_select::", "");
      const roleId = interaction.values[0];
      const ticket = db.find("tickets", t => t.id === ticketId)[0];
      if (!ticket) return interaction.reply({ content: "Couldn't find this ticket record.", ephemeral: true });

      const channel = interaction.guild.channels.cache.get(ticket.channelId);
      const role = interaction.guild.roles.cache.get(roleId);
      if (!channel || !role) return interaction.reply({ content: "Couldn't find the channel or role.", ephemeral: true });

      await channel.permissionOverwrites.edit(role, { ViewChannel: true, SendMessages: true });
      await channel.send(`🔔 ${role} — your help has been requested in this ticket by <@${interaction.user.id}>.`);
      await logAction(interaction.guild, "🔔 Ticket Escalated", `<@${interaction.user.id}> requested ${role.name} in ticket ${ticketId}`);
      return interaction.reply({ content: `✅ ${role.name} has been pinged and given access to this ticket.`, ephemeral: true });
    }

    // ================= TICKET: TRANSFER =================
    if (interaction.isButton() && interaction.customId.startsWith("ticket_transfer_")) {
      const ticketId = interaction.customId.replace("ticket_transfer_", "");
      const menu = new UserSelectMenuBuilder()
        .setCustomId(`ticket_transfer_select_${ticketId}`)
        .setPlaceholder("Who should this ticket be transferred to?")
        .setMinValues(1).setMaxValues(1);
      return interaction.reply({ content: "Select the staff member to transfer this ticket to:", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    if (interaction.isUserSelectMenu() && interaction.customId.startsWith("ticket_transfer_select_")) {
      const ticketId = interaction.customId.replace("ticket_transfer_select_", "");
      const newStaffId = interaction.values[0];
      const ticket = db.find("tickets", t => t.id === ticketId)[0];
      if (!ticket) return interaction.reply({ content: "Couldn't find this ticket record.", ephemeral: true });

      const channel = interaction.guild.channels.cache.get(ticket.channelId);
      const newMember = await interaction.guild.members.fetch(newStaffId).catch(() => null);
      if (!channel || !newMember) return interaction.reply({ content: "Couldn't find the channel or that member.", ephemeral: true });

      const previousClaimer = ticket.claimedBy;
      await channel.permissionOverwrites.edit(newStaffId, { ViewChannel: true, SendMessages: true });
      db.update("tickets", ticketId, { claimedBy: newStaffId, transferHistory: [...(ticket.transferHistory || []), { from: previousClaimer, to: newStaffId, by: interaction.user.id, date: new Date().toISOString() }] });

      await channel.send(`🔁 This ticket has been transferred from <@${previousClaimer}> to <@${newStaffId}> by <@${interaction.user.id}>. Full history/transcript is preserved.`);
      await newMember.send(`🔁 You've been assigned a ticket in **${interaction.guild.name}**: ${channel}`).catch(() => {});
      await logAction(interaction.guild, "🔁 Ticket Transferred", `Ticket ${ticketId}: <@${previousClaimer}> → <@${newStaffId}> by <@${interaction.user.id}>`);
      return interaction.reply({ content: `✅ Ticket transferred to <@${newStaffId}>.`, ephemeral: true });
    }

    // ================= TICKET: RATE SUPPORT =================
    if (interaction.isButton() && interaction.customId.startsWith("ticket_rate_")) {
      const ticketId = interaction.customId.replace("ticket_rate_", "");
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_rate_select_${ticketId}`)
        .setPlaceholder("How was your support experience?")
        .addOptions([1, 2, 3, 4, 5].map(n => ({ label: "⭐".repeat(n), value: String(n) })));
      return interaction.reply({ content: "How was your support experience?", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("ticket_rate_select_")) {
      const ticketId = interaction.customId.replace("ticket_rate_select_", "");
      const rating = parseInt(interaction.values[0], 10);
      const modal = new ModalBuilder().setCustomId(`ticket_rate_feedback_${ticketId}::${rating}`).setTitle("Optional Feedback");
      const input = new TextInputBuilder().setCustomId("feedback").setLabel("Anything you'd like to add? (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_rate_feedback_")) {
      const [ticketId, ratingStr] = interaction.customId.replace("ticket_rate_feedback_", "").split("::");
      const feedback = interaction.fields.getTextInputValue("feedback") || null;
      const ticket = db.update("tickets", ticketId, { rating: parseInt(ratingStr, 10), ratingFeedback: feedback });
      if (!ticket) return interaction.reply({ content: "Couldn't find this ticket record.", ephemeral: true });

      // This flow runs over DM (triggered from the /close transcript message),
      // so interaction.guild is always null here — look the guild up via the
      // ticket's stored guildId instead of assuming a live guild context.
      const guild = interaction.client.guilds.cache.get(ticket.guildId);
      if (guild) {
        const ratingsLogChannel = guild.channels.cache.find(c => c.name.includes("bot-logs"));
        if (ratingsLogChannel) {
          await ratingsLogChannel.send(`⭐ Rating for ticket ${ticketId} (staff: <@${ticket.claimedBy}>): ${"⭐".repeat(parseInt(ratingStr, 10))}${feedback ? `\n> ${feedback}` : ""}`).catch(() => {});
        }
      }
      return interaction.reply({ content: "✅ Thanks for the feedback!", ephemeral: true });
    }

  }
};

