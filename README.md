# claude-discord-notify

[![CI](https://github.com/blakeadaniel/claude-discord-notify/actions/workflows/ci.yml/badge.svg)](https://github.com/blakeadaniel/claude-discord-notify/actions/workflows/ci.yml)

A [Claude Code](https://claude.com/claude-code) skill that lets Claude send messages to your **Discord** via a webhook — build notifications, summaries, "I'm done" pings, whatever you ask for.

Install is one interactive command. The only thing you provide is your Discord webhook URL.

## Install

```bash
npx claude-discord-notify
```

The installer will:

1. Ask for your Discord webhook URL (this becomes the default target).
2. Optionally let you add or update **named webhooks** — extra Discord channels
   you can target by name with `--to <name>` (e.g. a "work" channel alongside
   your default).
3. Install the skill into `~/.claude/skills/discord-notify/`.
4. Save your webhook(s) to a `chmod 600` `config.json`.
5. Optionally send a test message (to the default webhook only).

Re-run the same command any time to update the webhook, or to add/update
named webhooks. Re-running shows any existing named webhooks (masked) and
leaves the ones you don't touch untouched.

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

### Sending to a named webhook

If you configured extra named webhooks during install, target one with `--to`:

```bash
node ~/.claude/skills/discord-notify/discord_send.js --to work "deploy finished"
```

Omitting `--to` always sends to the default `webhookUrl`. `--to <name>` with a
name that isn't configured fails locally (no message is sent) with an error
listing the names that are available.

### Sending quietly (no push/desktop notification)

Pass `--quiet` (or its alias `--silent`) to suppress Discord's client-side
push/desktop notification for the message:

```bash
node ~/.claude/skills/discord-notify/discord_send.js --quiet "background sync finished"
```

The message still posts and is fully visible in the channel as normal —
only the notification ping to the client is suppressed. This is separate
from (and composes with) the always-on mention guard: `allowed_mentions`
blocks pings caused by `@everyone`/`@here`/role/user mentions written in the
message *text*, while `--quiet`/`--silent` suppresses the generic
new-message notification regardless of what the text contains. Use
`--quiet` for routine/low-priority updates you don't want to interrupt
someone with, even when the message contains no mentions at all.

### Adding a rich embed

Attach one rich, structured embed (title, description, accent color, and up
to 25 name/value fields) alongside — or instead of — plain message text:

```bash
node ~/.claude/skills/discord-notify/discord_send.js \
  --embed-title "Build passed" \
  --embed-description "All 42 tests green" \
  --embed-color "#5865F2" \
  --embed-field "Duration=3m12s" \
  --embed-field-inline "Branch=main" \
  "deploy finished"
```

| Flag | Value | Notes |
|---|---|---|
| `--embed-title <text>` | up to 256 characters | |
| `--embed-description <text>` | up to 4096 characters | |
| `--embed-color <value>` | `#RRGGBB`, bare `RRGGBB`, or a decimal integer `0`-`16777215` | sets the accent color bar on the embed |
| `--embed-field <name=value>` | repeatable | adds a full-width ("block") field |
| `--embed-field-inline <name=value>` | repeatable | adds an inline field (sits side-by-side with others) |

- **Exactly one embed per message** is supported. `--embed-field` and
  `--embed-field-inline` may each be repeated (up to 25 fields total,
  combined) and render in the order the flags are given on the command line.
- `--embed-color` checks the hex format first: a 6-character value made only
  of digits (e.g. `123456`) is read as **hex**, not decimal — pass `#`-prefixed
  or non-numeric-looking hex to be unambiguous if you mean a specific hex color.
- `--embed-field`/`--embed-field-inline` split on the **first** `=` only, so
  the name can't contain `=` but the value can (`"Formula=x=y+z"` → name
  `Formula`, value `x=y+z`).
- An embed with no message text is a valid send on its own — none of the
  embed flags require accompanying text, and text doesn't require an embed.
- With a multi-chunk message (over Discord's 2000-character limit), the
  embed is attached to the **last** chunk only, exactly like `--file`.
- **Not supported** (deliberately out of scope for this skill): embed URL,
  footer, image/thumbnail, author, timestamp, or multiple embeds per
  message — there are no `--embed-url` / `--embed-footer` /
  `--embed-image` / `--embed-thumbnail` / `--embed-author` /
  `--embed-timestamp` flags.
- Discord's documented per-embed limits are enforced locally, before any
  network request: title ≤256 chars, description ≤4096 chars, ≤25 fields,
  field name ≤256 chars, field value ≤1024 chars, and the combined total of
  title + description + all field names + all field values ≤6000 chars. A
  violation fails immediately with a specific error naming the limit that
  was exceeded — nothing is sent.
- `--dry-run` previews the embed exactly as it would be sent: title, full
  description, color shown as both hex and decimal (e.g.
  `#5865F2 (5793266)`), and every field's name, value, and inline state.

### Previewing before you send (`--dry-run`)

Pass `--dry-run` to see exactly what *would* be sent — every message chunk
(with its character count and full text), every attachment (name, MIME
type, size, and whether it came from a local path or a URL), the combined
attachment size vs. the 8MB limit, and whether `--quiet`/`--silent` would
be applied — without actually posting anything to Discord:

```bash
node ~/.claude/skills/discord-notify/discord_send.js --dry-run "preview this message"
node ~/.claude/skills/discord-notify/discord_send.js --dry-run --file shot.png "with an attachment"
```

Two things worth knowing:

- **Every validation a real send performs still runs.** Flag parsing, the
  10-attachment count check, webhook resolution (`--to`), loading every
  `--file`, and the 8MB combined-size check all happen exactly as they
  would for a real send — only the final POST(s) to Discord are skipped.
  A `--dry-run` that exits 0 means a real send would succeed; the same
  errors and exit codes surface at the same points if something's wrong.
- **`--file` URLs are still fetched over the network.** An `http(s)://`
  attachment reference is downloaded for real even under `--dry-run` —
  that's needed to report its actual size and MIME type and to exercise
  the size-limit check meaningfully. Only local paths avoid any I/O beyond
  a local file read either way.

The webhook URL itself is never printed unmasked — the report shows only
the `--to` name (or `default`) plus a masked form of the URL (e.g.
`.../AbCd…z890`), the same masking the installer uses.

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
- Rate limits (HTTP 429) and transient server errors (5xx) are retried automatically with backoff, honoring Discord's `retry_after`, before giving up.
- Attachments are uploaded as multipart `multipart/form-data`; URLs are fetched and verified to load before sending. A message is optional when you attach a file.
- Combined attachment size is capped at **8MB** per message (Discord's default non-boosted webhook limit). Oversized combined attachments are rejected locally with a clear error before any upload is attempted — no network request is made.
- Messages over Discord's 2000-character limit are split automatically.
- Discord markdown works: `**bold**`, `` `code` ``, code blocks, emoji.
- Mentions (`@everyone`, `@here`, role and user mentions) in message content are suppressed by default — they won't ping anyone.
- `--quiet`/`--silent` suppresses the client-side push/desktop notification for the message (the message still posts and is visible as normal) — independent of and composable with the always-on mention guard above.
- `--dry-run` validates everything a real send would (webhook resolution, attachment loading — including real fetches for URL attachments — and the size/count limits) and prints a full preview, but skips the final Discord post(s). The webhook URL is always shown masked.
- A single rich embed (title/description/color/fields) can be attached with `--embed-title`/`--embed-description`/`--embed-color`/`--embed-field`/`--embed-field-inline` — see "Adding a rich embed" above. Only one embed per message is supported; embed URL/footer/image/thumbnail/author/timestamp and multiple embeds are intentionally out of scope. All of Discord's per-embed length/count limits are validated locally before any network call.
- Your webhook is a **secret**. Anyone who has it can post to that channel. It is stored only in your local `config.json` (which is `chmod 600` and git-ignored).

### config.json schema

```json
{
  "webhookUrl": "https://discord.com/api/webhooks/111/aaa",
  "webhooks": {
    "work": "https://discord.com/api/webhooks/222/bbb"
  }
}
```

- `webhookUrl` (required) — the default target, used whenever `--to` is omitted.
- `webhooks` (optional) — a map of name → webhook URL for extra channels you
  can target with `--to <name>`. Omitted entirely (not even `{}`) when you
  haven't configured any named webhooks. A config with just `webhookUrl` keeps
  working exactly as before.

## License

[MIT](./LICENSE) © Blake Daniel
