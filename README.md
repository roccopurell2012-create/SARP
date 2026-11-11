# Los Angeles RP — Simple Bot (1.1)

This version keeps the requested server tools and channel layout. Session commands are removed, following the final correction in the request.


## New in 1.1 — DMs, staff emails/IDs, and editable staff guide

Run `/setup` after updating and restarting the bot. Setup reuses existing channels/roles and updates the dashboard, create-ticket panel, application panel, and staff guide instead of posting duplicates. Older duplicate panels authored by this bot are removed; member messages are preserved. Guide-button changes publish the replacement guide/dashboard before deleting their old panels.

### Owner / Co-Owner dashboard

- **Send Bot DM** → select a current server member → type a message → Submit. The bot sends that text as a Discord DM. Failed deliveries are reported instead of claiming success. Bot logs record sender/recipient, without copying private DM content.
- **Staff Emails / IDs** → **Add / Update Email** → select the Discord member the address belongs to → enter their assigned staff email. Addresses are normalised and cannot be assigned to two members in the same server. Changing an address keeps that member's existing ID.
- **Staff Guide Settings** → **Add**, **Edit**, or **Remove** information buttons. Each button has a label and information shown privately when clicked. Up to 19 information buttons are supported. The fixed **Get Staff ID** button cannot be removed. Submitted changes immediately refresh the guide and dashboard.

Every stage of these controls checks Owner/Co-Owner access, including modal submissions and select menus. They do not depend solely on channel visibility.

### Staff members

Open **staff-guide** → **Get Staff ID** → enter the email registered to your Discord account. The bot assigns a permanent ID such as `LA-STAFF-0001`. Repeating the process returns the same ID. You must be a current staff member and the address must be assigned to your own Discord account. An email address by itself is not proof of ownership, which is why management selects its Discord owner during registration.

**No email inbox access, password, email verification link, or email delivery is used.** All interaction happens inside Discord.

### Staff Only tickets

Open Ticket → **Staff Only Tickets** → choose one of:

- Report Another Staff Member
- Log Unlogged Hours
- Contest an Infraction
- Contest a Strike
- Contest a Warning
- Contest a Demotion
- Other Staff Support

Then select priority and enter your own staff ID and the requested details. The ID field includes: “Go to staff guide to get your staff ID”. Missing, incorrect, or another member's IDs are rejected before a channel is created. Non-staff cannot open these tickets, even with a previously assigned ID. Ordinary player tickets still work without a staff ID.

The staff ID is recorded on the ticket and shown in the ticket/queue summary. Staff tickets use the existing Support Staff + Owner/Co-Owner ticket queue and claim workflow. These are requests for staff review; the bot does not restore automated infractions, strikes, warnings, hours, or demotion-appeal decisions.

### Persistent data and deployment

Keep the bot's `data/` directory on persistent storage, or set `SARP_DATA_DIR` to a persistent directory. `staff_identities.json` stores email/member/ID mappings; `settings.json` stores guide buttons and panel message IDs. Preserve these files across restarts and deployments so existing staff IDs and edits remain available. Run one bot process for this JSON-backed deployment.

After updating: `npm install`, `npm test`, `npm run deploy`, restart with `npm start`, then run `/setup` in Discord. The slash-command count remains 13; the new tools are dashboard/guide controls. The bot needs View Channel, Read Message History, Send Messages, Manage Channels, and Manage Roles as applicable; pinning guide sections also requires the corresponding permission. `/setup` grants the bot access to its managed channels.

Validation: 27 offline regression tests, including a real datastore reload in separate Node processes. Tests mock Discord interactions and message operations; no live Discord messages or tickets were sent during development.


## Features kept

- Staff dashboard with welcome, tickets, automatic welcome roles, applications/results, logging, announcements, promotions/demotions, partnerships, rules editing, offices, bot DMs, staff email/ID registration, and staff-guide settings.
- Complete ticket system: create-ticket panel, configurable types/questions, priority, private intake channels, staff queue, claiming, closing/reopening, transcripts, role escalation, transfer, ratings, and ticket statistics. Ban Appeal and Report a Player tickets remain.
- Welcome messages, member verification, and automatic welcome roles.
- Complete Discord/in-game rules system.
- Public announcements, staff announcements, and scheduled announcements.
- All current LAPD, LAFD EMS, LAFD, staff, and partnership applications, including question editing, application toggles, reviews, approval/rejection, rejection cooldowns, results, application history, and statistics. Application review decisions remain; staff performance reviews are removed.
- Partnership applications and partnership advertisements.
- Suggestions with thumbs-up/thumbs-down voting.
- Staff guide, promotions/demotions, staff role assignment, and rank-change logs.
- Private offices with selected role access.
- Bot logs for joins/leaves, role/nickname changes, message edits/deletes, audit events, and actions taken through the bot.
- Existing member/staff/ticket voice statistics.

## Channels preserved

Every channel definition in these original categories is kept, with its original name:

| Category | Kept |
| --- | --- |
| Bulletin | Staff dashboard, rules, welcome, announcements, staff announcements, sessions room, create-a-ticket |
| Applications | Application panel, results, application-results |
| Community | General chat, roleplay chat, media, suggestions, giveaways |
| Departments | LAPD, LAFD EMS, LAFD rooms |
| Staff Team | Every original staff channel, including staff guide/chat/request, promotions-demotions, partnership applications, and the existing infraction/LOA/shift/blacklist rooms |
| Ticket Queue | Staff ticket queue |
| Offices | Offices category and dynamically created office rooms |
| Bot System | Bot logs and all three statistics voice channels |
| Voice Channels | Every original department radio, moderation scene, and general voice channel |

The legacy staff rooms and sessions room remain because the request explicitly says to keep all staff and bulletin channels. Their old automation and commands are disabled. Department rooms and department application role assignment remain; dashboard department management is removed.

Setup reuses existing channels and roles and does not delete or clone them. Statistics channels are reused even after their member counts change.

## Removed

- Sessions and session statistics commands.
- Dashboard department management and manual department assignment.
- Staff performance reviews and all Staff Training centre definitions: training materials, training schedule, performance-reviews channel, and category.
- HR and IA categories, channels, roles, dashboards, cases, investigations, evidence tools, and exit interviews.
- Infractions, LOA, blacklist, blacklist appeals, duty/shifts, hours, rosters, and leaderboards. Their legacy staff rooms remain as noted above.
- Member/staff profile commands, profile editing, and private staff notes.
- Staff termination controls.
- Edit Bot controls. Send Bot DM is restored as an Owner/Co-Owner tool in version 1.1.
- Activity checks, weekly digests, raid/spam/nuke alerts, and automatic spam penalties.
- Maintenance shutdown/startup and lockdown tools.
- Backup/restore and mass/server-wide message deletion commands.

Older controls posted in Discord for removed features display a removal message. Re-register commands to remove old slash-command entries.

## Remaining commands — 13

`/setup`, `/rules`, `/announce`, `/announce-staff`, `/schedule-announcement`, `/staffguide`, `/rank`, `/close`, `/reopen`, `/ticketstats`, `/apphistory`, `/appstats`, `/suggest`.

Tickets, applications, partnerships, and offices also use the retained dashboard/panel buttons.

## Install or replace the old bot

1. Extract this ZIP into a new folder. Replace the old source folder rather than copying files over it: otherwise the old command files may remain and load again.
2. Copy your existing `.env` and `data/` folder into the new source folder. This ZIP contains no real token or live server data. Old unused JSON files can remain; this bot does not read them.
3. Run `npm install` and `npm test`.
4. Run `npm run deploy` to replace the guild's registered slash commands with the 13 commands above.
5. Stop the old bot process and start the new version with `npm start`.
6. Run `/setup`, then `/staffguide` and `/rules`, in Discord to post the simplified panels and guide. Old panel/guide messages can be removed manually.

For a new installation, copy `.env.example` to `.env` and enter `BOT_TOKEN`, `CLIENT_ID`, and `GUILD_ID`. Enable Server Members, Message Content, and Presence intents in the Discord Developer Portal, and give the bot permission to manage roles/channels and post messages. Keep its role above roles it must assign.

This ZIP changes what the bot creates and runs. It has not edited GitHub or your live Discord server. Existing Staff Training, HR, and IA channels are not automatically deleted, so their message history remains available; remove those old categories manually if desired. The protected channel groups listed above are preserved by the code.

## Checks

Run `npm test`. Offline tests validate all 13 slash command payloads, channel preservation, repeated setup, private office creation, promotions/demotions, ticket/application menus, the staff guide, removed controls, and background tasks. They use mocked Discord objects and do not connect to Discord.

