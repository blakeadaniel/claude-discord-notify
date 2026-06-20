#!/usr/bin/env node
/**
 * Send a message to the user's Discord channel via webhook.
 *
 * Usage:
 *   node discord_send.js "your message here"
 *   echo "piped content" | node discord_send.js
 *   node discord_send.js --username "Build Bot" "message"
 *
 * The webhook URL is read from `config.json` sitting next to this file
 * (written by the installer, chmod 600). Messages longer than Discord's
 * 2000-char limit are split into multiple sends.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");
const MAX = 2000; // Discord per-message content limit

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

async function post(webhookUrl, content, username) {
  const payload = { content };
  if (username) payload.username = username;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // A browser-like UA avoids Cloudflare bot blocks (1010) seen with
      // default library user-agents.
      "User-Agent": "claude-discord-notify/1.0",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} ${body}`.trim());
  }
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
  const args = process.argv.slice(2);
  let username;
  if (args[0] === "--username") {
    if (args.length < 2) fail("--username needs a value");
    username = args[1];
    args.splice(0, 2);
  }

  let msg = args.join(" ").trim();
  if (!msg) msg = (await readStdin()).trim();
  if (!msg) {
    process.stderr.write("error: no message provided\n");
    process.exit(2);
  }

  const webhookUrl = loadWebhook();
  try {
    for (const part of chunks(msg)) {
      if (part.trim() === "") continue;
      await post(webhookUrl, part, username);
    }
    process.stdout.write("✅ sent to Discord\n");
  } catch (e) {
    fail(e.message || String(e));
  }
}

main();
