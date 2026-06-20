#!/usr/bin/env node
/**
 * Interactive installer for the `discord-notify` Claude Code skill.
 *
 *   npx claude-discord-notify
 *
 * Prompts for a Discord webhook URL, then installs the skill into
 * ~/.claude/skills/discord-notify/ and saves the webhook to a chmod-600
 * config.json. Re-run any time to update the webhook.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_SKILL_DIR = path.join(__dirname, "..", "skill");
const SKILL_DIR = path.join(os.homedir(), ".claude", "skills", "discord-notify");
const CONFIG_PATH = path.join(SKILL_DIR, "config.json");

const WEBHOOK_RE =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/;

function log(msg = "") {
  stdout.write(msg + "\n");
}

async function ask(rl, question) {
  const answer = await rl.question(question);
  return answer.trim();
}

async function promptWebhook(rl) {
  log("");
  log("This installs the `discord-notify` skill for Claude Code.");
  log("");
  log("Get a webhook URL in Discord:");
  log("  Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL");
  log("(or pick an existing webhook). It looks like:");
  log("  https://discord.com/api/webhooks/123456789/AbCdEf...");
  log("");

  // Show the existing webhook (masked) if re-running.
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")).webhookUrl;
  } catch {
    /* none */
  }
  if (existing) {
    log(`A webhook is already configured: ${mask(existing)}`);
    log("Press Enter to keep it, or paste a new one to replace it.");
  }

  while (true) {
    const input = await ask(rl, "Discord webhook URL: ");
    if (!input && existing) return existing;
    if (WEBHOOK_RE.test(input)) return input;
    log("");
    log("⚠️  That doesn't look like a Discord webhook URL. It should start with");
    log("   https://discord.com/api/webhooks/  — please try again.");
    log("");
  }
}

function mask(url) {
  return url.replace(/\/([\w-]+)$/, (_, token) =>
    "/" + token.slice(0, 4) + "…" + token.slice(-4)
  );
}

function install(webhookUrl) {
  fs.mkdirSync(SKILL_DIR, { recursive: true });

  for (const file of ["SKILL.md", "discord_send.js"]) {
    fs.copyFileSync(path.join(PKG_SKILL_DIR, file), path.join(SKILL_DIR, file));
  }

  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ webhookUrl }, null, 2) + "\n",
    { mode: 0o600 }
  );
  fs.chmodSync(CONFIG_PATH, 0o600); // ensure mode even if file pre-existed
}

async function sendTest(webhookUrl) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "claude-discord-notify/1.0",
    },
    body: JSON.stringify({
      content:
        "👋 `discord-notify` is set up — Claude Code can now message you here.",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} ${body}`.trim());
  }
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const webhookUrl = await promptWebhook(rl);
    install(webhookUrl);

    log("");
    log(`✅ Installed skill to ${SKILL_DIR}`);
    log(`   • SKILL.md, discord_send.js`);
    log(`   • config.json (webhook saved, chmod 600)`);

    const test = (await ask(rl, "\nSend a test message to Discord now? [Y/n] "))
      .toLowerCase();
    if (test === "" || test === "y" || test === "yes") {
      try {
        await sendTest(webhookUrl);
        log("✅ Test message sent — check your Discord channel.");
      } catch (e) {
        log(`⚠️  Test send failed: ${e.message}`);
        log("   Double-check the webhook URL and re-run: npx claude-discord-notify");
      }
    }

    log("");
    log("Done! In Claude Code, just say things like:");
    log('  "notify me on discord when the build finishes"');
    log('  "send that summary to my discord"');
    log("");
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  stderr_write(`error: ${e.message || e}`);
  process.exit(1);
});

function stderr_write(msg) {
  process.stderr.write(msg + "\n");
}
