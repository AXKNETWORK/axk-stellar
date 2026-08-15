import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { requireApiKey } from "./auth";

const KEY = "a".repeat(64);

function call(guard: ReturnType<typeof requireApiKey>, headers: Record<string, string>) {
  const outcome = { status: 0, body: undefined as unknown, passed: false };
  const req = {
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const res = {
    status(code: number) {
      outcome.status = code;
      return this;
    },
    json(body: unknown) {
      outcome.body = body;
      return this;
    },
  } as unknown as Response;
  guard(req, res, () => {
    outcome.passed = true;
  });
  return outcome;
}

test("a key shorter than 32 characters is refused at startup", () => {
  // The server must not come up half-protected. Failing here means an
  // operator sees the error instead of a listening socket.
  assert.throws(() => requireApiKey("short"), /at least 32 characters/);
  assert.throws(() => requireApiKey(""), /at least 32 characters/);
  assert.throws(() => requireApiKey("b".repeat(31)), /at least 32 characters/);
});

test("the configured key is accepted from either header", () => {
  const guard = requireApiKey(KEY);
  assert.equal(call(guard, { "x-api-key": KEY }).passed, true);
  assert.equal(call(guard, { authorization: `Bearer ${KEY}` }).passed, true);
  assert.equal(call(guard, { authorization: `bearer ${KEY}` }).passed, true);
});

test("a request with no credentials is rejected", () => {
  const result = call(requireApiKey(KEY), {});
  assert.equal(result.passed, false);
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "unauthorized" });
});

test("a wrong key is rejected, whatever its length", () => {
  const guard = requireApiKey(KEY);
  for (const presented of [
    "a".repeat(63), // one character short, a prefix of the real key
    "a".repeat(65), // one character long
    "b".repeat(64), // same length, wrong value
    "",
    "Bearer",
  ]) {
    const result = call(guard, { "x-api-key": presented });
    assert.equal(result.passed, false, `accepted ${presented.length} chars`);
    assert.equal(result.status, 401);
  }
});

test("a length mismatch does not throw", () => {
  // timingSafeEqual throws on unequal buffer lengths. Both sides are hashed
  // to a fixed 32 bytes so a short key returns 401 rather than a 500.
  assert.doesNotThrow(() => call(requireApiKey(KEY), { "x-api-key": "x" }));
});

test("a non-bearer authorization scheme is not accepted", () => {
  const guard = requireApiKey(KEY);
  assert.equal(call(guard, { authorization: `Basic ${KEY}` }).passed, false);
  assert.equal(call(guard, { authorization: KEY }).passed, false);
});
