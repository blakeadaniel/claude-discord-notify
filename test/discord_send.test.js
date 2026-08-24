import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  chunks,
  mimeFor,
  extFor,
  post,
  MAX_RETRIES,
} from "../skill/discord_send.js";

describe("chunks", () => {
  test("returns a single chunk for short text", () => {
    assert.deepEqual(chunks("hello"), ["BROKEN_ON_PURPOSE"]);
  });

  test("returns [''] for empty text", () => {
    assert.deepEqual(chunks(""), [""]);
  });

  test("packs multiple short lines into one chunk when they fit", () => {
    assert.deepEqual(chunks("a\nb\nc", 10), ["a\nb\nc"]);
  });

  test("splits on newline boundaries once the limit is exceeded", () => {
    const text = "a".repeat(10) + "\n" + "b".repeat(10);
    assert.deepEqual(chunks(text, 15), ["a".repeat(10), "b".repeat(10)]);
  });

  test("hard-splits a single line longer than the limit", () => {
    const line = "x".repeat(25);
    assert.deepEqual(chunks(line, 10), [
      "x".repeat(10),
      "x".repeat(10),
      "x".repeat(5),
    ]);
  });

  test("never produces a chunk longer than the limit", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    for (const c of chunks(text, 20)) {
      assert.ok(c.length <= 20, `chunk exceeds limit: ${JSON.stringify(c)}`);
    }
  });

  test("defaults to Discord's 2000-char limit", () => {
    const text = "a".repeat(2500);
    const out = chunks(text);
    assert.equal(out.length, 2);
    assert.equal(out[0].length, 2000);
  });
});

describe("mimeFor", () => {
  test("maps known extensions", () => {
    assert.equal(mimeFor("shot.png"), "image/png");
    assert.equal(mimeFor("clip.mp4"), "video/mp4");
    assert.equal(mimeFor("notes.md"), "text/markdown");
  });

  test("is case-insensitive", () => {
    assert.equal(mimeFor("SHOT.PNG"), "image/png");
  });

  test("falls back to octet-stream for unknown or missing extensions", () => {
    assert.equal(mimeFor("archive.xyz"), "application/octet-stream");
    assert.equal(mimeFor("no-extension"), "application/octet-stream");
  });
});

describe("extFor", () => {
  test("finds an extension for a known mime type", () => {
    assert.equal(extFor("image/png"), ".png");
  });

  test("returns '' for an unknown mime type", () => {
    assert.equal(extFor("application/x-nonsense"), "");
  });
});

describe("post retry/backoff", () => {
  const originalFetch = global.fetch;

  function mockFetch(responses) {
    const calls = [];
    let i = 0;
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return r;
    };
    return calls;
  }

  function res({ ok, status = 200, statusText = "", bodyText = "", retryAfter } = {}) {
    return {
      ok,
      status,
      statusText,
      text: async () => bodyText,
      headers: {
        get: (name) =>
          name.toLowerCase() === "retry-after" ? retryAfter ?? null : null,
      },
    };
  }

  test("resolves without retrying on success", async (t) => {
    const calls = mockFetch([res({ ok: true, status: 204 })]);
    t.after(() => {
      global.fetch = originalFetch;
    });
    await post("https://example.com/webhook", { content: "hi" });
    assert.equal(calls.length, 1);
  });

  test("retries a 429 using the JSON retry_after and then succeeds", async (t) => {
    const calls = mockFetch([
      res({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        bodyText: JSON.stringify({ retry_after: 0.01, global: false }),
      }),
      res({ ok: true, status: 204 }),
    ]);
    t.after(() => {
      global.fetch = originalFetch;
    });
    await post("https://example.com/webhook", { content: "hi" });
    assert.equal(calls.length, 2);
  });

  test("retries a 5xx using the Retry-After header and then succeeds", async (t) => {
    const calls = mockFetch([
      res({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        retryAfter: "0",
      }),
      res({ ok: true, status: 204 }),
    ]);
    t.after(() => {
      global.fetch = originalFetch;
    });
    await post("https://example.com/webhook", { content: "hi" });
    assert.equal(calls.length, 2);
  });

  test("does not retry a non-retryable 4xx error", async (t) => {
    const calls = mockFetch([
      res({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        bodyText: "bad payload",
      }),
    ]);
    t.after(() => {
      global.fetch = originalFetch;
    });
    await assert.rejects(
      () => post("https://example.com/webhook", { content: "hi" }),
      /HTTP 400 Bad Request bad payload/
    );
    assert.equal(calls.length, 1);
  });

  test("gives up after exhausting retries and reports the final error", async (t) => {
    const calls = mockFetch([
      res({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        bodyText: JSON.stringify({ retry_after: 0.001 }),
      }),
    ]);
    t.after(() => {
      global.fetch = originalFetch;
    });
    await assert.rejects(
      () => post("https://example.com/webhook", { content: "hi" }),
      new RegExp(`HTTP 429.*gave up after ${MAX_RETRIES} retries`, "s")
    );
    assert.equal(calls.length, MAX_RETRIES + 1);
  });
});

describe("allowed_mentions", () => {
  const originalFetch = global.fetch;

  function mockFetch(responses) {
    const calls = [];
    let i = 0;
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return r;
    };
    return calls;
  }

  function res({ ok, status = 200, statusText = "", bodyText = "" } = {}) {
    return {
      ok,
      status,
      statusText,
      text: async () => bodyText,
      headers: { get: () => null },
    };
  }

  test("JSON body sends allowed_mentions: { parse: [] } alongside content", async (t) => {
    const calls = mockFetch([res({ ok: true, status: 204 })]);
    t.after(() => {
      global.fetch = originalFetch;
    });
    await post("https://example.com/webhook", { content: "hey @everyone" });
    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.content, "hey @everyone");
    assert.deepEqual(body.allowed_mentions, { parse: [] });
  });

  test("multipart payload_json also carries allowed_mentions: { parse: [] }", async (t) => {
    const calls = mockFetch([res({ ok: true, status: 204 })]);
    t.after(() => {
      global.fetch = originalFetch;
    });
    await post("https://example.com/webhook", {
      content: "hey <@&123> <@456>",
      files: [{ name: "a.txt", type: "text/plain", data: Buffer.from("hi") }],
    });
    assert.equal(calls.length, 1);
    const form = calls[0].init.body;
    const payload = JSON.parse(form.get("payload_json"));
    assert.equal(payload.content, "hey <@&123> <@456>");
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
  });

  test("every chunk of a multi-chunk (>2000 char) message carries allowed_mentions", async (t) => {
    // Respond ok to any number of calls.
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      return res({ ok: true, status: 204 });
    };
    t.after(() => {
      global.fetch = originalFetch;
    });

    // Build a message well over Discord's 2000-char limit, with an
    // @everyone mention thrown into a later line so it's not just the
    // first chunk that matters.
    const lines = [];
    for (let i = 0; i < 400; i++) {
      lines.push(i === 250 ? "@everyone line " + i : "line " + i + " ".repeat(5));
    }
    const longText = lines.join("\n");
    const parts = chunks(longText);
    assert.ok(parts.length > 1, "test setup should produce multiple chunks");

    // Mirror how main() drives post() across chunks: one post per chunk,
    // files only attached to the final one.
    const files = [{ name: "a.txt", type: "text/plain", data: Buffer.from("hi") }];
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      await post("https://example.com/webhook", {
        content: parts[i],
        files: last ? files : [],
      });
    }

    assert.equal(calls.length, parts.length);
    assert.ok(calls.length > 1, "expected more than one post() call");
    for (const [idx, call] of calls.entries()) {
      const isMultipart = call.init.body instanceof FormData;
      const payload = isMultipart
        ? JSON.parse(call.init.body.get("payload_json"))
        : JSON.parse(call.init.body);
      assert.deepEqual(
        payload.allowed_mentions,
        { parse: [] },
        `chunk ${idx} missing allowed_mentions`
      );
    }
  });

  test("attachment-only send (no content at all) still carries allowed_mentions", async (t) => {
    const calls = mockFetch([res({ ok: true, status: 204 })]);
    t.after(() => {
      global.fetch = originalFetch;
    });
    await post("https://example.com/webhook", {
      files: [{ name: "shot.png", type: "image/png", data: Buffer.from("fakepng") }],
      content: undefined,
    });
    assert.equal(calls.length, 1);
    const form = calls[0].init.body;
    const payload = JSON.parse(form.get("payload_json"));
    assert.equal("content" in payload, false, "no content key should be set");
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
  });
});
