import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  promptNamedWebhooks,
  buildConfig,
  mask,
  WEBHOOK_RE,
  NAME_RE,
} from "../bin/cli.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_JS = path.join(__dirname, "..", "bin", "cli.js");

const VALID_URL =
  "https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz-1234567890";
const VALID_URL_2 =
  "https://discord.com/api/webhooks/987654321098765432/ZyXwVuTsRqPoNmLkJiHgFeDcBa-0987654321";
const VALID_URL_3 =
  "https://discord.com/api/webhooks/111111111111111111/CcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc";
const VALID_URL_4 =
  "https://discord.com/api/webhooks/222222222222222222/DdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd";

/** A fake readline interface: `.question()` pops the next scripted answer. */
function fakeRl(answers) {
  const queue = [...answers];
  return {
    question: async () => {
      if (!queue.length) throw new Error("fakeRl: ran out of scripted answers");
      return queue.shift();
    },
  };
}

describe("buildConfig", () => {
  test("omits the webhooks key entirely when there are no named webhooks", () => {
    assert.deepEqual(buildConfig(VALID_URL), { webhookUrl: VALID_URL });
    assert.deepEqual(buildConfig(VALID_URL, {}), { webhookUrl: VALID_URL });
  });

  test("includes the webhooks key when non-empty", () => {
    assert.deepEqual(buildConfig(VALID_URL, { work: VALID_URL_2 }), {
      webhookUrl: VALID_URL,
      webhooks: { work: VALID_URL_2 },
    });
  });
});

describe("mask", () => {
  test("masks the token portion of a webhook URL, leaving the id visible", () => {
    assert.equal(
      mask("https://discord.com/api/webhooks/123/AbCdEfGhIjKl"),
      "https://discord.com/api/webhooks/123/AbCd…IjKl"
    );
  });
});

describe("WEBHOOK_RE", () => {
  test("accepts valid discord.com / discordapp.com / canary / ptb webhook URLs", () => {
    assert.ok(WEBHOOK_RE.test(VALID_URL));
    assert.ok(WEBHOOK_RE.test("https://canary.discordapp.com/api/webhooks/1/abc-def"));
    assert.ok(WEBHOOK_RE.test("https://ptb.discord.com/api/v10/webhooks/1/abc_def"));
  });

  test("rejects non-webhook URLs and non-URLs", () => {
    assert.ok(!WEBHOOK_RE.test("not-a-url"));
    assert.ok(!WEBHOOK_RE.test("http://discord.com/api/webhooks/1/abc")); // http, not https
    assert.ok(!WEBHOOK_RE.test("https://evil.com/api/webhooks/1/abc"));
  });
});

describe("NAME_RE", () => {
  test("accepts letters, digits, underscore, hyphen", () => {
    assert.ok(NAME_RE.test("work"));
    assert.ok(NAME_RE.test("work-2_channel"));
    assert.ok(NAME_RE.test("ABC123"));
  });

  test("rejects spaces, symbols, and empty string", () => {
    assert.ok(!NAME_RE.test("bad name"));
    assert.ok(!NAME_RE.test("bad!"));
    assert.ok(!NAME_RE.test(""));
  });
});

describe("promptNamedWebhooks (scripted fake readline)", () => {
  test("declining via default-empty answer is a no-op, returns existing unchanged", async () => {
    const rl = fakeRl([""]);
    const result = await promptNamedWebhooks(rl, { work: VALID_URL });
    assert.deepEqual(result, { work: VALID_URL });
  });

  test("declining explicitly with 'n' when nothing exists yet returns {}", async () => {
    const rl = fakeRl(["n"]);
    const result = await promptNamedWebhooks(rl, {});
    assert.deepEqual(result, {});
  });

  test("accepting and adding one webhook", async () => {
    const rl = fakeRl(["y", "work", VALID_URL, "n"]);
    const result = await promptNamedWebhooks(rl, {});
    assert.deepEqual(result, { work: VALID_URL });
  });

  test("adding multiple webhooks in one session", async () => {
    const rl = fakeRl(["y", "work", VALID_URL, "y", "personal", VALID_URL_2, "n"]);
    const result = await promptNamedWebhooks(rl, {});
    assert.deepEqual(result, { work: VALID_URL, personal: VALID_URL_2 });
  });

  test("invalid name is rejected and re-prompted until valid", async () => {
    const rl = fakeRl(["y", "bad name!", "still bad!", "good-name", VALID_URL, "n"]);
    const result = await promptNamedWebhooks(rl, {});
    assert.deepEqual(result, { "good-name": VALID_URL });
  });

  test("invalid webhook URL is rejected and re-prompted until valid", async () => {
    const rl = fakeRl(["y", "work", "not-a-webhook-url", "still-not-one", VALID_URL, "n"]);
    const result = await promptNamedWebhooks(rl, {});
    assert.deepEqual(result, { work: VALID_URL });
  });

  test("re-using an existing name overwrites it; other names are preserved", async () => {
    const rl = fakeRl(["y", "work", VALID_URL_4, "n"]);
    const result = await promptNamedWebhooks(rl, {
      work: VALID_URL,
      personal: VALID_URL_3,
    });
    assert.deepEqual(result, { work: VALID_URL_4, personal: VALID_URL_3 });
  });
});

describe("bin/cli.js end-to-end (child process, scripted stdin, temp $HOME)", () => {
  function tempHome() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "discord-notify-cli-test-"));
  }

  function configPathFor(home) {
    return path.join(home, ".claude", "skills", "discord-notify", "config.json");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Node's readline interface only captures a 'line' event into a pending
  // question() if that question is already awaiting when the line arrives;
  // any extra lines that show up in the same buffered chunk (as happens
  // when all stdin is written/closed at once) are silently dropped rather
  // than queued. So each scripted answer is written with a short delay
  // after the previous one, giving the child a turn to register its next
  // question() before the next line lands — mirroring how a human typing
  // interactively would naturally pace input.
  function runCli(home, inputLines) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI_JS], {
        env: { ...process.env, HOME: home },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));

      (async () => {
        for (const line of inputLines) {
          await sleep(40);
          child.stdin.write(line + "\n");
        }
        await sleep(40);
        child.stdin.end();
      })();
    });
  }

  test("fresh $HOME, no config: full decline leaves config.json with NO webhooks key", async () => {
    const home = tempHome();
    try {
      const { code } = await runCli(home, [VALID_URL, "n", "n"]);
      assert.equal(code, 0);
      const cfg = JSON.parse(fs.readFileSync(configPathFor(home), "utf8"));
      assert.deepEqual(cfg, { webhookUrl: VALID_URL });
      assert.equal("webhooks" in cfg, false);
      const mode = fs.statSync(configPathFor(home)).mode & 0o777;
      assert.equal(mode, 0o600);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("fresh $HOME, default-empty answer to the named-webhooks prompt also omits the key", async () => {
    const home = tempHome();
    try {
      const { code } = await runCli(home, [VALID_URL, "", "n"]);
      assert.equal(code, 0);
      const cfg = JSON.parse(fs.readFileSync(configPathFor(home), "utf8"));
      assert.deepEqual(cfg, { webhookUrl: VALID_URL });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("pre-existing single-webhookUrl config: pressing Enter keeps it unchanged (promptWebhook untouched)", async () => {
    const home = tempHome();
    const cfgPath = configPathFor(home);
    try {
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify({ webhookUrl: VALID_URL }));

      const { code, stdout } = await runCli(home, ["", "n", "n"]);
      assert.equal(code, 0);
      assert.match(stdout, /A webhook is already configured/);
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      assert.deepEqual(cfg, { webhookUrl: VALID_URL });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("re-running with existing named webhooks displays them masked and preserves ones not replaced", async () => {
    const home = tempHome();
    const cfgPath = configPathFor(home);
    try {
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(
        cfgPath,
        JSON.stringify({
          webhookUrl: VALID_URL,
          webhooks: { work: VALID_URL_2, personal: VALID_URL_3 },
        })
      );

      // Keep primary, opt in to editing named webhooks, update "work" only,
      // decline adding another, decline the test send.
      const { code, stdout } = await runCli(home, ["", "y", "work", VALID_URL_4, "n", "n"]);
      assert.equal(code, 0);
      assert.match(stdout, /Named webhooks already configured/);
      assert.match(stdout, /work:/);
      assert.match(stdout, /personal:/);
      assert.doesNotMatch(stdout, new RegExp(VALID_URL_2)); // masked, not raw
      assert.doesNotMatch(stdout, new RegExp(VALID_URL_3)); // masked, not raw

      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      assert.deepEqual(cfg.webhooks, { work: VALID_URL_4, personal: VALID_URL_3 });
      assert.equal(cfg.webhookUrl, VALID_URL);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("corrupted config (webhooks is a string, not an object) falls back gracefully instead of crashing", async () => {
    const home = tempHome();
    const cfgPath = configPathFor(home);
    try {
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(
        cfgPath,
        JSON.stringify({ webhookUrl: VALID_URL, webhooks: "not-an-object" })
      );

      const { code, stdout, stderr } = await runCli(home, ["", "n", "n"]);
      assert.equal(code, 0, stderr);
      // The corrupted value must not be treated as existing named webhooks.
      assert.doesNotMatch(stdout, /Named webhooks already configured/);
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      assert.deepEqual(cfg, { webhookUrl: VALID_URL });
      assert.equal("webhooks" in cfg, false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("corrupted config (webhooks is null) falls back gracefully instead of crashing", async () => {
    const home = tempHome();
    const cfgPath = configPathFor(home);
    try {
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify({ webhookUrl: VALID_URL, webhooks: null }));

      const { code, stdout, stderr } = await runCli(home, ["", "n", "n"]);
      assert.equal(code, 0, stderr);
      assert.doesNotMatch(stdout, /Named webhooks already configured/);
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      assert.deepEqual(cfg, { webhookUrl: VALID_URL });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  // Fast-follow fix: `typeof parsed.webhooks === "object"` alone lets an
  // array through (typeof [] === "object" in JS), which used to get
  // reinterpreted as a webhooks map keyed by numeric-string index. The
  // guard now also excludes arrays, so a corrupted array value is treated
  // the same as any other malformed webhooks field: ignored, falls back
  // to {} (declining to add named webhooks leaves no `webhooks` key at all).
  test("corrupted config (webhooks is an array) is rejected by the guard and falls back to {}", async () => {
    const home = tempHome();
    const cfgPath = configPathFor(home);
    try {
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(
        cfgPath,
        JSON.stringify({ webhookUrl: VALID_URL, webhooks: [VALID_URL_2] })
      );

      const { code, stderr } = await runCli(home, ["", "n", "n"]);
      assert.equal(code, 0, stderr);
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      assert.equal("webhooks" in cfg, false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test("invalid name and invalid URL at install time are rejected with re-prompt, then succeed", async () => {
    const home = tempHome();
    try {
      const { code, stdout } = await runCli(home, [
        VALID_URL,
        "y",
        "bad name!",
        "good-name",
        "not-a-url",
        VALID_URL_2,
        "n",
        "n",
      ]);
      assert.equal(code, 0);
      assert.match(stdout, /Invalid name/);
      assert.match(stdout, /doesn't look like a Discord webhook URL/);
      const cfg = JSON.parse(fs.readFileSync(configPathFor(home), "utf8"));
      assert.deepEqual(cfg, {
        webhookUrl: VALID_URL,
        webhooks: { "good-name": VALID_URL_2 },
      });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
