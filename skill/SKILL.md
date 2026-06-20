---
name: discord-notify
description: Send a message/notification to the user's Discord channel via webhook. Use whenever the user asks you to send, post, notify, ping, or DM them something on Discord (e.g. "send that to discord", "notify me on discord when done", "post the results to my channel").
---

# discord-notify

Sends a message to the user's Discord channel using a saved webhook.

## How to use

Run the sender with the message as an argument:

```bash
node ~/.claude/skills/discord-notify/discord_send.js "Your message here"
```

Pipe content (command output, logs, a file) into it:

```bash
some-command | node ~/.claude/skills/discord-notify/discord_send.js
```

Optional custom sender name shown in Discord:

```bash
node ~/.claude/skills/discord-notify/discord_send.js --username "Build Bot" "Done!"
```

## Notes

- Messages over Discord's 2000-character limit are split automatically into multiple sends.
- Discord markdown works: `**bold**`, `` `code` ``, ``` ```code blocks``` ```, multi-line, emoji.
- The webhook URL lives in `config.json` next to the sender (`chmod 600`). It is a **secret** — anyone with it can post to the channel. To change it, re-run `npx claude-discord-notify` or edit `config.json`.
- On success it prints `✅ sent to Discord`; on failure it prints the HTTP error and exits non-zero.
