"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { validateMessage } = require("./gemini-client.js");

test("accepts an object with a string type field", () => {
  const result = validateMessage({ type: "ping", payload: { n: 1 } });

  assert.deepEqual(result, {
    valid: true,
    message: { type: "ping", payload: { n: 1 } },
  });
});

test("rejects non-object input with a descriptive error", () => {
  for (const raw of [null, "ping", 42, ["type"]]) {
    const result = validateMessage(raw);

    assert.equal(result.valid, false);
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
  }
});

test("rejects an object whose type is not a string", () => {
  const result = validateMessage({ type: 7 });

  assert.equal(result.valid, false);
  assert.equal(typeof result.error, "string");
  assert.ok(result.error.length > 0);
});

test("accepts an optional payload of any shape", () => {
  assert.equal(validateMessage({ type: "ping" }).valid, true);
  assert.equal(validateMessage({ type: "ping", payload: null }).valid, true);
  assert.equal(validateMessage({ type: "ping", payload: [1, 2] }).valid, true);
  assert.equal(validateMessage({ type: "ping", payload: "texto" }).valid, true);
});
