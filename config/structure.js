// ==========================================================
// LOS ANGELES RP - SERVER STRUCTURE CONFIG
// This file is the single source of truth for every role,
// channel, and category the bot creates and references.
// Every command/system below points back to an ID in here.
// ==========================================================

module.exports = {
  botName: "Los Angeles RP HQ",
  embedColor: "#1F6FEB", // LA blue, editable via /editbot

  // ---------------- ROLES ----------------
  // permissions: "all" = full server access (bypasses locks)
  roles: {
    OWNER:        { name: "👑 Owner",           color: "#FFD700", permissions: "all" },
    CO_OWNER:     { name: "🛡️ Co-Owner",        color: "#FFD700", permissions: "all" },
    MANAGEMENT:   { name: "⚙️ Management",      color: "#E67E22", permissions: "staff_high" },
    HEAD_STAFF:   { name: "🔨 Head Staff",      color: "#E67E22", permissions: "staff_high" },
    MOD_LEAD:     { name: "🛡️ Moderation Team Lead", color: "#3498DB", permissions: "staff_mid" },
    MOD_CHAIN:    { name: "🛡️ Moderation Chain of Command", color: "#3498DB", permissions: "staff_mid" },
    MODERATOR:    { name: "🛠️ Moderator",       color: "#3498DB", permissions: "staff_mid" },
    SUPPORT:      { name: "🎫 Support Staff",   color: "#3498DB", permissions: "staff_low" },
    STAFF_PING:   { name: "📢 Staff",           color: "#5865F2", permissions: "ping_only" },
    SAPS:         { name: "🚔 LAPD",            color: "#2C3E50", permissions: "department" },
    EMS:          { name: "🚑 LAFD EMS",        color: "#C0392B", permissions: "department" },
    FIRE:         { name: "🚒 LAFD",            color: "#D35400", permissions: "department" },
    CIVILIAN:     { name: "🎭 Civilian",        color: "#95A5A6", permissions: "public" },
    PARTNER:      { name: "🤝 Partner",         color: "#8E44AD", permissions: "partner" },
    ONLINE_INGAME:   { name: "🟢 Online In Game", color: "#2ECC71", permissions: "status" },
    ON_BREAK_INGAME: { name: "🟡 On Break In Game", color: "#F1C40F", permissions: "status" }
  },

  // Roles considered "staff" for channel visibility purposes (Staff Team category)
  staffRoleKeys: ["OWNER", "CO_OWNER", "MANAGEMENT", "HEAD_STAFF", "MOD_LEAD", "MODERATOR", "SUPPORT"],
  // Director-tier roles — configured with specific bot permissions below, NOT blanket Administrator
  directorRoleKeys: [],
  // What each director role is allowed to do through the bot (checked in code, not just Discord perms)
  directorPermissions: {},
  // Only these roles can see/claim tickets, per your requirement — everyone else, even other staff, cannot view tickets
  ticketQueueRoleKeys: ["OWNER", "CO_OWNER", "SUPPORT"],

  // ---------------- CATEGORIES + CHANNELS ----------------
  categories: {
    BULLETIN: {
      name: "★ ───  Bulletin  ─── ★",
      channels: [
        { key: "DASHBOARD",   name: "📚-staff-dashboard", locked: true },
        { key: "RULES",       name: "📖-rules" },
        { key: "WELCOME",     name: "⭐-welcome" },
        { key: "ANNOUNCEMENTS", name: "📢-announcements" },
        { key: "STAFF_ANNOUNCEMENTS", name: "📢-staff-announcements", locked: true },
        { key: "SESSIONS", name: "🚨-sessions" },
        { key: "TICKETS",     name: "📨-create-a-ticket" }
      ]
    },
    APPLICATIONS: {
      name: "★ ───  Applications  ─── ★",
      channels: [
        { key: "APPLICATION", name: "📄-application" },
        { key: "RESULTS",     name: "📊-results", locked: true },
        { key: "APP_RESULTS_ANNOUNCE", name: "📊-application-results" }
      ]
    },
    COMMUNITY: {
      name: "★ ───  Community  ─── ★",
      channels: [
        { key: "CHAT",        name: "💬-general-chat" },
        { key: "ROLEPLAY",    name: "🎭-roleplay-chat" },
        { key: "MEDIA",       name: "📸-media-share" },
        { key: "SUGGESTIONS", name: "💡-suggestions" },
        { key: "GIVEAWAYS",   name: "🎁-giveaways" }
      ]
    },
    DEPARTMENTS: {
      name: "★ ───  Departments  ─── ★",
      channels: [
        { key: "SAPS_CHAT",   name: "🚔-lapd-department" },
        { key: "EMS_CHAT",    name: "🚑-lafd-ems-department" },
        { key: "FIRE_CHAT",   name: "🚒-lafd-department" }
      ]
    },
    STAFF_TEAM: {
      name: "★ ───  Staff Team  ─── ★",
      locked: true,
      channels: [
        { key: "STAFF_GUIDE",   name: "📘-staff-guide" },
        { key: "STAFF_CHAT",    name: "💬-staff-chat" },
        { key: "STAFF_REQUEST", name: "🙋-staff-request" },
        { key: "INFRACTIONS",   name: "⏳-infractions" },
        { key: "PROMOTIONS",    name: "📈-promotions-demotions" },
        { key: "LOA_REQUESTS",  name: "📋-loa-requests" },
        { key: "SHIFT_LOG",     name: "🕒-shift-log" },
        { key: "BLACKLIST_LOG", name: "🚫-blacklist-log" },
        { key: "PARTNERSHIPS",  name: "🤝-partnership-apps" }
      ]
    },
    TICKET_QUEUE: {
      name: "★ ───  Ticket Queue  ─── ★",
      locked: true,
      restrictedTo: "ticketQueueRoleKeys",
      channels: [
        { key: "TICKET_QUEUE_CHANNEL", name: "🎫-ticket-queue" }
      ]
    },
    OFFICES: {
      // Individual office channels are created dynamically via the dashboard's
      // "Offices" button, each with its own chosen roles — this category just
      // holds them. It starts empty; /setup only needs to create the category.
      name: "★ ───  Offices  ─── ★",
      locked: true,
      channels: []
    },
    BOT_SYSTEM: {
      name: "★ ───  Bot System  ─── ★",
      locked: true,
      channels: [
        { key: "BOT_LOGS",   name: "⚠️-bot-logs" },
        { key: "STATS_1",    name: "📊 Members: 0", voice: true },
        { key: "STATS_2",    name: "🟢 Staff Online: 0", voice: true },
        { key: "STATS_3",    name: "🎫 Open Tickets: 0", voice: true }
      ]
    },
    VOICE: {
      name: "★ ───  Voice Channels  ─── ★",
      channels: [
        { key: "VC_SAPS", name: "🚔-lapd-radio", voice: true },
        { key: "VC_EMS",  name: "🚑-lafd-ems-radio", voice: true },
        { key: "VC_FIRE", name: "🚒-lafd-radio", voice: true },
        { key: "VC_MOD1", name: "⚖️-mod-scene-1", voice: true },
        { key: "VC_MOD2", name: "⚖️-mod-scene-2", voice: true },
        { key: "VC_MOD3", name: "⚖️-mod-scene-3", voice: true },
        { key: "VC_GEN1", name: "🔊-general-vc-1", voice: true },
        { key: "VC_GEN2", name: "🔊-general-vc-2", voice: true },
        { key: "VC_GEN3", name: "🔊-general-vc-3", voice: true }
      ]
    }
  },

  // ---------------- APPLICATION TYPES ----------------
  // Every application: has its own channel-post target, results channel,
  // ticket type, and can be toggled on/off from the dashboard.
  // Questions can also be edited/added/removed live from the dashboard —
  // overrides are stored in dataStore under settings key `appQuestions_<KEY>`.
  // "questions" = up to 5 modal fields per application (Discord modal hard limit is 5).
  // Days a rejected applicant must wait before reapplying to the SAME application type
  applicationCooldownDays: 7,
  // Preset rejection reasons shown as a dropdown; "Other" opens a free-text modal
  applicationRejectionReasons: [
    "Insufficient experience",
    "Answers too short / low effort",
    "Failed scenario questions",
    "Does not meet activity requirements",
    "Other"
  ],
  applications: {
    SAPS: {
      label: "Police (LAPD) Application", enabled: true, resultChannel: "RESULTS",
      questions: [
        { id: "q1", label: "Roblox username, age & timezone", style: "SHORT" },
        { id: "q2", label: "Radio codes / 10-code knowledge", style: "PARAGRAPH" },
        { id: "q3", label: "Define RDM, VDM, NLR, FRP, Metagaming", style: "PARAGRAPH" },
        { id: "q4", label: "Scenario: suspect flees on foot after a stop — walk through your RP", style: "PARAGRAPH" },
        { id: "q5", label: "Scenario: civilian reports an officer used excessive force. Response?", style: "PARAGRAPH" }
      ]
    },
    EMS: {
      label: "LAFD EMS Application", enabled: true, resultChannel: "RESULTS",
      questions: [
        { id: "q1", label: "Roblox username, age & timezone", style: "SHORT" },
        { id: "q2", label: "Define RDM, VDM, NLR, FRP, Metagaming", style: "PARAGRAPH" },
        { id: "q3", label: "Explain treating an unconscious player realistically", style: "PARAGRAPH" },
        { id: "q4", label: "Scenario: patient dies mid-treatment — correct NLR follow-up?", style: "PARAGRAPH" },
        { id: "q5", label: "Why do you want to join EMS specifically?", style: "PARAGRAPH" }
      ]
    },
    FIRE: {
      label: "LAFD Application", enabled: true, resultChannel: "RESULTS",
      questions: [
        { id: "q1", label: "Roblox username, age & timezone", style: "SHORT" },
        { id: "q2", label: "Define RDM, VDM, NLR, FRP, Metagaming", style: "PARAGRAPH" },
        { id: "q3", label: "Explain a structure-fire response coordinating with police/EMS", style: "PARAGRAPH" },
        { id: "q4", label: "Scenario: civilian blocks the scene and refuses to move", style: "PARAGRAPH" },
        { id: "q5", label: "Why do you want to join Fire specifically?", style: "PARAGRAPH" }
      ]
    },
    MODERATOR: {
      label: "Moderator Application", enabled: true, resultChannel: "RESULTS",
      questions: [
        { id: "q1", label: "Roblox/Discord username, age & timezone", style: "SHORT" },
        { id: "q2", label: "Prior staffing experience", style: "PARAGRAPH" },
        { id: "q3", label: "Define RDM, VDM, NLR, FRP, Metagaming + kick vs ban offenses", style: "PARAGRAPH" },
        { id: "q4", label: "Scenario: two players RDM each other, both blame the other", style: "PARAGRAPH" },
        { id: "q5", label: "Are you willing to punish friends/high-ranks if needed? Why join?", style: "PARAGRAPH" }
      ]
    },
    PARTNER: {
      label: "Partnership Application", enabled: true, resultChannel: "RESULTS",
      questions: [
        { id: "q1", label: "Server advertisement — name, description, and invite link, all in one", style: "PARAGRAPH" },
        { id: "q2", label: "Who is your representative for this partnership? (Discord username)", style: "SHORT" },
        { id: "q3", label: "Who should we ping when this partnership is announced? (mention a role/user, or type 'none')", style: "SHORT" }
      ]
    },
    STAFF: {
      label: "Staff Application", enabled: true, resultChannel: "RESULTS",
      questions: [
        { id: "q1", label: "Roblox username, Discord username, age, and timezone", style: "SHORT" },
        { id: "q2", label: "Prior staffing experience? List servers, role, how long, why you left", style: "PARAGRAPH" },
        { id: "q3", label: "What is RDM and what is VDM? Define each clearly", style: "PARAGRAPH" },
        { id: "q4", label: "What is NLR and what is FRP? Define each clearly", style: "PARAGRAPH" },
        { id: "q5", label: "What is Metagaming and what is Powergaming? Define each clearly", style: "PARAGRAPH" },
        { id: "q6", label: "Scenario: video shows one player shooting another with no prior interaction, accused claims they were shot at first off-camera. How do you investigate and reach a fair conclusion?", style: "PARAGRAPH" },
        { id: "q7", label: "Scenario: two players in a ticket, both accuse the other of RDM, no video evidence either side. How do you investigate, and what if you can't determine fault?", style: "PARAGRAPH" },
        { id: "q8", label: "Are you willing to punish friends or higher-ranks if they break the rules? Give a real example of holding someone accountable", style: "PARAGRAPH" },
        { id: "q9", label: "How many hours per week can you realistically dedicate to staffing?", style: "SHORT" },
        { id: "q10", label: "Why do you want to join the staff team here specifically?", style: "PARAGRAPH" }
      ]
    },
  },

  // ---------------- TICKET TYPES ----------------
  // "questions" = shown as a modal when the ticket is opened, before the
  // channel is created. All tickets are visible ONLY to ticketQueueRoleKeys
  // (Support Staff + Owner/Co-Owner) via the ticket queue — other staff can't
  // see a ticket's contents until a Support member Claims it.
  ticketTypes: {
    SUPPORT:  { label: "General Support", staffRole: "SUPPORT", questions: [
      { id: "q1", label: "Roblox and/or Discord username" },
      { id: "q2", label: "What do you need help with?" }
    ] },
    REPORT:   { label: "Report a Player", staffRole: "MODERATOR", questions: [
      { id: "q1", label: "Reported player's Roblox and/or Discord username" },
      { id: "q2", label: "What did they do?" },
      { id: "q3", label: "Do you have proof? (link or say 'none')" }
    ] },
    APPEAL:   { label: "Ban Appeal", staffRole: "MANAGEMENT", questions: [
      { id: "q1", label: "Your Roblox and/or Discord username" },
      { id: "q2", label: "Why were you banned?" },
      { id: "q3", label: "Why should the ban be lifted?" }
    ] },
    STAFF_APP_SUPPORT: { label: "Application Question", staffRole: "HEAD_STAFF", questions: [
      { id: "q1", label: "Which application does this relate to?" },
      { id: "q2", label: "What's your question?" }
    ] }
  },

  // Staff intake requests only; these do not re-enable old hours or punishment systems.
  staffTicketTypes: {
    STAFF_REPORT: { label: "Report Another Staff Member", staffOnly: true, staffRole: "SUPPORT", questions: [
      { id: "q1", label: "Brief summary / staff member involved" },
      { id: "q2", label: "Details, dates and relevant context" },
      { id: "q3", label: "Evidence / links (or say none)" }
    ] },
    STAFF_HOURS: { label: "Log Unlogged Hours", staffOnly: true, staffRole: "SUPPORT", questions: [
      { id: "q1", label: "Brief summary / staff member involved" },
      { id: "q2", label: "Details, dates and relevant context" },
      { id: "q3", label: "Evidence / links (or say none)" }
    ] },
    STAFF_INFRACTION: { label: "Contest an Infraction", staffOnly: true, staffRole: "SUPPORT", questions: [
      { id: "q1", label: "Brief summary / staff member involved" },
      { id: "q2", label: "Details, dates and relevant context" },
      { id: "q3", label: "Evidence / links (or say none)" }
    ] },
    STAFF_STRIKE: { label: "Contest a Strike", staffOnly: true, staffRole: "SUPPORT", questions: [
      { id: "q1", label: "Brief summary / staff member involved" },
      { id: "q2", label: "Details, dates and relevant context" },
      { id: "q3", label: "Evidence / links (or say none)" }
    ] },
    STAFF_WARNING: { label: "Contest a Warning", staffOnly: true, staffRole: "SUPPORT", questions: [
      { id: "q1", label: "Brief summary / staff member involved" },
      { id: "q2", label: "Details, dates and relevant context" },
      { id: "q3", label: "Evidence / links (or say none)" }
    ] },
    STAFF_DEMOTION: { label: "Contest a Demotion", staffOnly: true, staffRole: "SUPPORT", questions: [
      { id: "q1", label: "Brief summary / staff member involved" },
      { id: "q2", label: "Details, dates and relevant context" },
      { id: "q3", label: "Evidence / links (or say none)" }
    ] },
    STAFF_OTHER: { label: "Other Staff Support", staffOnly: true, staffRole: "SUPPORT", questions: [
      { id: "q1", label: "Brief summary / staff member involved" },
      { id: "q2", label: "Details, dates and relevant context" },
      { id: "q3", label: "Evidence / links (or say none)" }
    ] },
  },

  // ---------------- RULE SETS ----------------
  // Selectable via /rules create dropdown. Each is posted as its own embed.
  ruleSets: {
    DISCORD: {
      label: "Discord Rules",
      default: [
        "Be respectful — no harassment, hate speech, or discrimination.",
        "No NSFW, gore, or shock content.",
        "No spamming, self-promotion, or unsolicited DMs to staff.",
        "Use channels for their intended purpose.",
        "Follow Discord's Terms of Service and Community Guidelines at all times.",
        "Staff decisions are final; use the appeal ticket if you disagree.",
        "No advertising other servers, Discord invites, or external links without staff permission.",
        "Keep political, religious, and other highly controversial topics out of public channels.",
        "Do not impersonate staff, other members, or Discord/Roblox officials.",
        "English only in public channels, unless a channel is designated otherwise.",
        "Do not ping staff or @everyone/@here unless it's an emergency or you have permission.",
        "Alt accounts must be disclosed to staff — undisclosed alts may result in a ban.",
        "Any exploiting of bugs, glitches, or bot commands must be reported, not abused.",
        "No NSFW usernames, profile pictures, or status messages.",
        "Do not share personal information (yours or others') without consent — no doxxing.",
        "Do not beg for roles, ranks, partnerships, or staff positions.",
        "Voice channels must stay on-topic for the channel's purpose (e.g. no music bots outside designated channels).",
        "Screamers, jumpscares, or flashing/seizure-inducing content is strictly forbidden.",
        "Do not evade a ban, mute, kick, or timeout using an alt account.",
        "Report rule-breaking to staff via ticket — do not vigilante-moderate or argue with rule-breakers yourself.",
        "Server invite links may not be shared outside of official Los Angeles RP channels without permission."
      ]
    },
    INGAME: {
      label: "In-Game (ERLC) Rules",
      default: [
        "No RDM (Random Death Match) — you must have valid IC reason to harm another player.",
        "No VDM (Vehicle Death Match) — do not use vehicles as weapons without valid RP reason.",
        "Follow NLR (New Life Rule) — no returning to the scene of your death for 10 minutes.",
        "No FRP (Fail RP) — actions must be realistic and make sense in context.",
        "No Metagaming — do not use out-of-game info in in-game roleplay.",
        "No Powergaming — do not force RP outcomes on others without a fair chance to respond.",
        "LAPD/LAFD members must remain professional and impartial in-character.",
        "No Combat Logging — do not disconnect to avoid an ongoing RP situation or arrest.",
        "No Cop Baiting — do not intentionally provoke law enforcement without RP purpose.",
        "Fail RP includes unrealistic driving, invincibility claims, or refusing to follow valid orders.",
        "No Safe Zone abuse — do not use safe zones to avoid legitimate RP consequences.",
        "Civilians must comply with lawful orders unless there is a valid IC reason to resist.",
        "No mass RDM/VDM (\"mass shooting\" or \"mass ramming\") under any circumstances — instant ban offense.",
        "Staff/LEOs on duty must prioritize RP quality over kill count or arrest count.",
        "No Meta-Comms — do not use Discord voice/text to relay in-game info that your character wouldn't otherwise know.",
        "Vehicles must be parked realistically — no blocking roads, spawns, or intersections without RP reason.",
        "No exploiting game bugs/glitches (e.g. noclip, invincibility, infinite ammo) — report them instead.",
        "Hostage situations must allow a realistic negotiation window before escalation.",
        "No spawn killing — allow players a reasonable window after spawning before engaging.",
        "Gang/heist RP must be pre-approved or follow server-specific heist rules if posted separately.",
        "Staff have final say on any RP dispute; do not argue in-character to bypass an OOC ruling."
      ]
    }
  },

  // ---------------- STAFF GUIDE TEMPLATE ----------------
  staffGuideLinks: {
    dashboard: { label: "📚 Staff Dashboard (Melonly)", note: "Search & connect your Melonly staff dashboard link here" },
    expectations: { label: "📋 Staff Expectations", note: "Top-down list of what's expected of every staff member" }
  }
};


