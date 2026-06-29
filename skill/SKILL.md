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

## Attachments

To send a file (image, log, screenshot, PDF, …), pass `--file` with a path
**you** supply from the conversation — the user won't type a path, so resolve
"send me that image" to the actual file you produced or are looking at:

```bash
node ~/.claude/skills/discord-notify/discord_send.js --file /path/to/shot.png "here's the screenshot"
```

- `--file` may be repeated, up to **10** attachments per message:

  ```bash
  node ~/.claude/skills/discord-notify/discord_send.js --file a.png --file build.log "results"
  ```

- The value can be a **local path** or an **http(s) URL**. URLs are fetched and
  verified to actually load before uploading; if a URL or path can't be read,
  the send fails with a non-zero exit and nothing is posted.
- A message is optional when attaching files — `--file shot.png` with no text
  is a valid send. With text, the message is posted first and files follow.

### Supported file types

The sender assigns a MIME type from the file extension so Discord renders the
attachment correctly (images and video preview inline, audio gets a player,
etc.). Any extension works — unknown ones upload as `application/octet-stream`
(a plain download) — but these are recognized and verified to render in Discord:

| Kind   | Extensions                                  |
|--------|---------------------------------------------|
| Image  | `png` `jpg`/`jpeg` `gif` `webp` `bmp` `svg` |
| Video  | `mp4` `webm` `mov`                          |
| Audio  | `mp3` `wav` `ogg`                           |
| Docs   | `pdf` `txt` `log` `md` `csv` `html` `json`  |
| Archive| `zip`                                       |

Note: Discord previews most of the above inline; a few (e.g. `bmp`, `svg`) may
show as a download depending on the client — the upload itself still succeeds.

## Notes

- Messages over Discord's 2000-character limit are split automatically into multiple sends.
- Discord markdown works: `**bold**`, `` `code` ``, ``` ```code blocks``` ```, multi-line, emoji.
- The webhook URL lives in `config.json` next to the sender (`chmod 600`). It is a **secret** — anyone with it can post to the channel. To change it, re-run `npx claude-discord-notify` or edit `config.json`.
- On success it prints `✅ sent to Discord`; on failure it prints the HTTP error and exits non-zero.
