import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { decideSend, MoneyGramRamps } from "./moneygram";
import { loadConfig, type AppConfig } from "./config";

const AUTH = Keypair.random();
const FUNDS = Keypair.random();

function cfg(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({
      MGI_ENV: "sandbox",
      MGI_AUTH_SECRET: AUTH.secret(),
      MGI_FUNDS_SECRET: FUNDS.secret(),
    }),
    ...overrides,
  };
}

describe("decideSend — cash-out money decision", () => {
  const future = new Date(Date.now() + 20 * 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  test("sends when unsent and inside the window", () => {
    assert.deepEqual(decideSend({ alreadySent: false, deadline: future }), {
      send: true,
    });
  });

  test("does not double-send when the anchor already saw our payment", () => {
    // The restart case: in-memory flag is gone, but stellar_transaction_id is set.
    assert.deepEqual(decideSend({ alreadySent: true, deadline: future }), {
      send: false,
      reason: "already-sent",
    });
  });

  test("already-sent wins even when the window has closed", () => {
    assert.deepEqual(decideSend({ alreadySent: true, deadline: past }), {
      send: false,
      reason: "already-sent",
    });
  });

  test("refuses to send after the 30-minute window closes", () => {
    assert.deepEqual(decideSend({ alreadySent: false, deadline: past }), {
      send: false,
      reason: "window-closed",
    });
  });

  test("sends when the anchor gives no deadline", () => {
    assert.deepEqual(decideSend({ alreadySent: false, deadline: null }), {
      send: true,
    });
  });

  test("an unparseable deadline does not silently block settlement", () => {
    assert.deepEqual(decideSend({ alreadySent: false, deadline: "not-a-date" }), {
      send: true,
    });
  });

  test("boundary: one second before expiry still sends", () => {
    const now = Date.parse("2026-08-04T12:00:00.000Z");
    assert.deepEqual(
      decideSend({
        alreadySent: false,
        deadline: "2026-08-04T12:00:01.000Z",
        now,
      }),
      { send: true },
    );
  });
});

describe("SEP-24 account must equal the SEP-10 token account", () => {
  // MoneyGram rejects a mismatch with:
  //   400 {"error":"'account' does not match the one in the token"}
  test("defaults to the funds account for both auth and SEP-24", () => {
    const mg = new MoneyGramRamps(cfg());
    assert.equal(mg.sep24Account, FUNDS.publicKey());
    assert.equal(mg.fundsPublicKey, FUNDS.publicKey());
  });

  test("MGI_SEP10_ACCOUNT=auth moves both together, never one alone", () => {
    const mg = new MoneyGramRamps(cfg({ sep10Account: "auth" }));
    assert.equal(mg.sep24Account, AUTH.publicKey());
    assert.notEqual(mg.sep24Account, mg.fundsPublicKey);
  });

  test("the account used for SEP-24 is always the one that signs SEP-10", () => {
    for (const mode of ["funds", "auth"] as const) {
      const mg = new MoneyGramRamps(cfg({ sep10Account: mode }));
      const expected = mode === "auth" ? AUTH.publicKey() : FUNDS.publicKey();
      assert.equal(mg.sep24Account, expected, `mode=${mode}`);
    }
  });
});

describe("custodial memo (SEP-10 user id)", () => {
  const mg = () => new MoneyGramRamps(cfg());

  test("rejects a non-numeric user id", async () => {
    await assert.rejects(() => mg().start({
      kind: "withdraw", userId: "coop-alpha", amount: "25",
    }), /positive integer/);
  });

  test("rejects zero and negatives", async () => {
    for (const userId of [0, -1]) {
      await assert.rejects(() => mg().start({
        kind: "withdraw", userId, amount: "25",
      }), /positive integer/);
    }
  });

  test("rejects a fractional id", async () => {
    await assert.rejects(() => mg().start({
      kind: "withdraw", userId: 10.5, amount: "25",
    }), /positive integer/);
  });
});

describe("amount guards", () => {
  const mg = () => new MoneyGramRamps(cfg());

  test("rejects zero and negative amounts before any network call", async () => {
    for (const amount of ["0", "-5"]) {
      await assert.rejects(() => mg().start({
        kind: "withdraw", userId: 1001, amount,
      }), /positive USDC/);
    }
  });
});

describe("config safety", () => {
  test("requireSecrets rejects a public key pasted where a seed belongs", () => {
    assert.throws(
      () => new MoneyGramRamps(cfg({ fundsSecret: FUNDS.publicKey() })),
      /MGI_FUNDS_SECRET/,
    );
  });

  test("sandbox and production point at different anchors", () => {
    assert.equal(cfg().homeDomain, "extmgxanchor.moneygram.com");
    assert.equal(
      loadConfig({
        MGI_ENV: "production",
        MGI_AUTH_SECRET: AUTH.secret(),
        MGI_FUNDS_SECRET: FUNDS.secret(),
      }).homeDomain,
      "mgxanchor.moneygram.com",
    );
  });
});
