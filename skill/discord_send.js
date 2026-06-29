#!/usr/bin/env node
/**
 * Send a message (and optional file attachments) to the user's Discord
 * channel via webhook.
 *
 * Usage:
 *   node discord_send.js "your message here"
 *   echo "piped content" | node discord_send.js
 *   node discord_send.js --username "Build Bot" "message"
 *   node discord_send.js --file ./shot.png "here's the screenshot"
 *   node discord_send.js --file a.png --file b.log "two files"
 *   node discord_send.js --file https://example.com/img.png "remote image"
 *
 * The webhook URL is read from `config.json` sitting next to this file
 * (written by the installer, chmod 600). Messages longer than Discord's
 * 2000-char limit are split into multiple sends. Attachments are uploaded
 * as multipart/form-data alongside the (final) message.
 *
 * `--file` takes a local path or an http(s) URL and may be repeated, up to
 * Discord's limit of 10 attachments per message. With no message text,
 * attachments are sent on their own.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");
const MAX = 2000; // Discord per-message content limit
const MAX_FILES = 10; // Discord per-message attachment limit

// Minimal extension → MIME map so Discord renders common files inline
// (images especially) instead of treating everything as octet-stream.
const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".html": "text/html",
  ".zip": "application/zip",
};

function mimeFor(name) {
  return MIME[path.extname(name).toLowerCase()] || "application/octet-stream";
}

function loadWebhook() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_PATH, "utf8");
  } catch {
    fail(
      `no config found at ${CONFIG_PATH}\n` +
        `run the installer to set your webhook: npx claude-discord-notify`
    );
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    fail(`config at ${CONFIG_PATH} is not valid JSON`);
  }
  if (!cfg.webhookUrl) {
    fail(`config at ${CONFIG_PATH} is missing "webhookUrl"`);
  }
  return cfg.webhookUrl;
}

async function post(webhookUrl, { content, username, files = [] } = {}) {
  const payload = {};
  if (content) payload.content = content;
  if (username) payload.username = username;

  // A browser-like UA avoids Cloudflare bot blocks (1010) seen with
  // default library user-agents. With files we send multipart/form-data
  // and let fetch set the Content-Type (incl. boundary) itself.
  const headers = { "User-Agent": "claude-discord-notify/1.0" };
  let body;
  if (files.length) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    files.forEach((f, i) => {
      form.append(`files[${i}]`, new Blob([f.data], { type: f.type }), f.name);
    });
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
  }

  const res = await fetch(webhookUrl, { method: "POST", headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`.trim());
  }
}

/**
 * Resolve a `--file` value (local path or http(s) URL) into
 * { name, type, data }. URLs are fetched and verified to actually load
 * before we attempt to upload them.
 */
async function loadFile(ref) {
  if (/^https?:\/\//i.test(ref)) {
    let res;
    try {
      res = await fetch(ref, {
        headers: { "User-Agent": "claude-discord-notify/1.0" },
      });
    } catch (e) {
      fail(`could not load ${ref}: ${e.message || e}`);
    }
    if (!res.ok) {
      fail(`could not load ${ref}: HTTP ${res.status} ${res.statusText}`);
    }
    const data = Buffer.from(await res.arrayBuffer());
    if (!data.length) fail(`${ref} loaded but was empty`);
    // Prefer a filename from the URL path; fall back to a generic one.
    let name = path.basename(new URL(ref).pathname) || "download";
    const type =
      res.headers.get("content-type")?.split(";")[0].trim() || mimeFor(name);
    if (!path.extname(name)) name += extFor(type);
    return { name, type, data };
  }

  // Local path.
  let data;
  try {
    data = fs.readFileSync(ref);
  } catch (e) {
    if (e.code === "ENOENT") fail(`file not found: ${ref}`);
    if (e.code === "EISDIR") fail(`not a file (it's a directory): ${ref}`);
    fail(`could not read ${ref}: ${e.message || e}`);
  }
  return { name: path.basename(ref), type: mimeFor(ref), data };
}

/** Guess an extension from a MIME type for URLs that have none. */
function extFor(type) {
  for (const [ext, mime] of Object.entries(MIME)) {
    if (mime === type) return ext;
  }
  return "";
}

/** Split text into <=n-char pieces, preferring newline boundaries. */
function chunks(text, n = MAX) {
  const out = [];
  let cur = "";
  for (let line of text.split("\n")) {
    while (line.length > n) {
      // a single line longer than the limit
      if (cur) {
        out.push(cur);
        cur = "";
      }
      out.push(line.slice(0, n));
      line = line.slice(n);
    }
    const candidate = cur ? cur + "\n" + line : line;
    if (candidate.length > n) {
      out.push(cur);
      cur = line;
    } else {
      cur = candidate;
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const parts = [];
  for await (const chunk of process.stdin) parts.push(chunk);
  return Buffer.concat(parts).toString("utf8");
}

async function main() {
  const rest = [];
  const fileRefs = [];
  let username;

  // Flags may appear in any order; everything else is message text.
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--username") {
      if (i + 1 >= args.length) fail("--username needs a value");
      username = args[++i];
    } else if (a === "--file" || a === "--attach") {
      if (i + 1 >= args.length) fail(`${a} needs a path or URL`);
      fileRefs.push(args[++i]);
    } else {
      rest.push(a);
    }
  }

  if (fileRefs.length > MAX_FILES) {
    fail(`too many attachments: ${fileRefs.length} (Discord allows ${MAX_FILES} per message)`);
  }

  let msg = rest.join(" ").trim();
  // Only fall back to stdin for the message when no attachments were given;
  // an attachment with no text is a valid send on its own.
  if (!msg && !fileRefs.length) msg = (await readStdin()).trim();
  if (!msg && !fileRefs.length) {
    process.stderr.write("error: no message or attachment provided\n");
    process.exit(2);
  }

  const webhookUrl = loadWebhook();
  const files = [];
  for (const ref of fileRefs) files.push(await loadFile(ref));

  try {
    const parts = msg ? chunks(msg).filter((p) => p.trim() !== "") : [];
    if (!parts.length) {
      // Files only (or empty message): a single post carrying the files.
      await post(webhookUrl, { content: msg, username, files });
    } else {
      // Send text first; attach files to the final message so they appear
      // after the content.
      for (let i = 0; i < parts.length; i++) {
        const last = i === parts.length - 1;
        await post(webhookUrl, {
          content: parts[i],
          username,
          files: last ? files : [],
        });
      }
    }
    const what =
      files.length && msg
        ? `message + ${files.length} attachment${files.length > 1 ? "s" : ""}`
        : files.length
          ? `${files.length} attachment${files.length > 1 ? "s" : ""}`
          : "message";
    process.stdout.write(`✅ sent ${what} to Discord\n`);
  } catch (e) {
    fail(e.message || String(e));
  }
}

main();
