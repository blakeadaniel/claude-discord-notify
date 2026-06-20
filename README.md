# claude-discord-notify

A [Claude Code](https://claude.com/claude-code) skill that lets Claude send messages to your **Discord** via a webhook — build notifications, summaries, "I'm done" pings, whatever you ask for.

Install is one interactive command. The only thing you provide is your Discord webhook URL.

## Install

```bash
npx claude-discord-notify
```

The installer will:

1. Ask for your Discord webhook URL.
2. Install the skill into `~/.claude/skills/discord-notify/`.
3. Save your webhook to a `chmod 600` `config.json`.
4. Optionally send a test message.

Re-run the same command any time to update the webhook.

### Getting a webhook URL

In Discord: **Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL**.
It looks like `https://discord.com/api/webhooks/<id>/<token>`.

## Usage

Once installed, just talk to Claude Code in natural language:

> "notify me on discord when the tests pass"
>
> "send that summary to my discord"

Under the hood the skill runs:

```bash
node ~/.claude/skills/discord-notify/discord_send.js "Your message here"
```

You can also pipe content in:

```bash
some-command | node ~/.claude/skills/discord-notify/discord_send.js
```

Optional custom sender name:

```bash
node ~/.claude/skills/discord-notify/discord_send.js --username "Build Bot" "Done!"
```

## Notes

- **No dependencies** — pure Node.js (≥18), uses the built-in `fetch`.
- Messages over Discord's 2000-character limit are split automatically.
- Discord markdown works: `**bold**`, `` `code` ``, code blocks, emoji.
- Your webhook is a **secret**. Anyone who has it can post to that channel. It is stored only in your local `config.json` (which is `chmod 600` and git-ignored).

## License

[MIT](./LICENSE) © Blake Daniel
