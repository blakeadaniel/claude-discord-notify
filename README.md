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

Attach a file (image, log, screenshot, PDF, …) with `--file` — repeat it for up
to 10 files, and pass either a local path or an http(s) URL:

```bash
node ~/.claude/skills/discord-notify/discord_send.js --file shot.png "here's the screenshot"
node ~/.claude/skills/discord-notify/discord_send.js --file a.png --file build.log "results"
```

In conversation you don't supply paths yourself — just say _"send me that image
on Discord"_ and Claude fills in the path to the file it's working with.

Recognized file types (assigned the right MIME so Discord renders them inline):

| Kind    | Extensions                                  |
|---------|---------------------------------------------|
| Image   | `png` `jpg`/`jpeg` `gif` `webp` `bmp` `svg` |
| Video   | `mp4` `webm` `mov`                          |
| Audio   | `mp3` `wav` `ogg`                           |
| Docs    | `pdf` `txt` `log` `md` `csv` `html` `json`  |
| Archive | `zip`                                       |

Any other extension still uploads fine — it just arrives as a generic download.

## Notes

- **No dependencies** — pure Node.js (≥18), uses the built-in `fetch` and `FormData`.
- Attachments are uploaded as multipart `multipart/form-data`; URLs are fetched and verified to load before sending. A message is optional when you attach a file.
- Messages over Discord's 2000-character limit are split automatically.
- Discord markdown works: `**bold**`, `` `code` ``, code blocks, emoji.
- Your webhook is a **secret**. Anyone who has it can post to that channel. It is stored only in your local `config.json` (which is `chmod 600` and git-ignored).

## License

[MIT](./LICENSE) © Blake Daniel
