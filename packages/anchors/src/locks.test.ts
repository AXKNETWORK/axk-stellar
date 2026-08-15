import { test } from "node:test";
import assert from "node:assert/strict";
import { tryAcquire, release, isHeld } from "./locks";

test("only one caller holds a transaction at a time", () => {
  const key = "anchor.example:tx-1";
  assert.equal(tryAcquire(key), true);
  assert.equal(tryAcquire(key), false, "a second caller acquired the same transaction");
  assert.equal(isHeld(key), true);
  release(key);
  assert.equal(isHeld(key), false);
  assert.equal(tryAcquire(key), true, "the key was not reusable after release");
  release(key);
});

test("different transactions do not block each other", () => {
  assert.equal(tryAcquire("anchor.example:tx-a"), true);
  assert.equal(tryAcquire("anchor.example:tx-b"), true);
  release("anchor.example:tx-a");
  release("anchor.example:tx-b");
});

test("the same transaction id at two anchors is two claims", () => {
  // The key carries the home domain, so a shared id across a sandbox and a
  // production anchor is not treated as one settlement.
  assert.equal(tryAcquire("sandbox.example:tx-1"), true);
  assert.equal(tryAcquire("production.example:tx-1"), true);
  release("sandbox.example:tx-1");
  release("production.example:tx-1");
});

test("releasing a key nobody holds is harmless", () => {
  assert.doesNotThrow(() => release("anchor.example:never-held"));
});
