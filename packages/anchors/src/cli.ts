#!/usr/bin/env node
/**
 * CLI for sandbox smoke tests after MoneyGram whitelist.
 *
 *   npm run dev -- info
 *   npm run dev -- cash-out --user 1001 --amount 25
 *   npm run dev -- cash-in  --user 1001 --amount 25
 *   npm run dev -- status   --user 1001 --id <txId>
 *   npm run dev -- watch    --user 1001 --id <txId>
 *   npm run dev -- keys     # print public keys to paste into Partner Portal
 */

import { Keypair } from "@stellar/stellar-sdk";
import { loadConfig } from "./config";
import { MoneyGramRamps } from "./moneygram";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const cmd = process.argv[2] ?? "help";

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(`AXK MoneyGram Ramps CLI (custodial)

Commands:
  generate-keys          Create new testnet keypairs (auth + funds)
  keys                   Show public keys from .env (for Partner Portal)
  info                   Fetch MoneyGram TOML + SEP-24 info
  cash-out               Start withdraw (USDC → cash at agent)
  cash-in                Start deposit (cash at agent → USDC)
  status                 Fetch SEP-24 transaction
  watch                  Watch tx; auto-send USDC on cash-out

Flags:
  --user <id>            Numeric AXK user/org id (SEP-10 memo)
  --amount <usdc>        e.g. 25.00  (prod min 15)
  --id <txId>            SEP-24 transaction id
  --no-auto-send         On watch, do not auto-submit USDC
`);
    return;
  }

  if (cmd === "generate-keys") {
    const auth = Keypair.random();
    const funds = Keypair.random();
    console.log(`# Paste into Partner Portal (TestNet whitelist) then .env
# Authentication wallet account (G...):
${auth.publicKey()}
# Deposit / Withdraw wallet account (G...) — can reuse auth for sandbox:
${funds.publicKey()}

# .env secrets (do NOT commit):
MGI_AUTH_SECRET=${auth.secret()}
MGI_FUNDS_SECRET=${funds.secret()}
`);
    console.log(
      "Next: fund accounts on testnet (XLM + USDC trustline) via Stellar Lab, then whitelist G addresses.",
    );
    return;
  }

  const cfg = loadConfig();

  if (cmd === "keys") {
    if (!cfg.authSecret) {
      console.log("No secrets in .env yet. Run: npm run dev -- generate-keys");
      return;
    }
    const client = new MoneyGramRamps(cfg);
    console.log(
      JSON.stringify(
        {
          env: cfg.env,
          homeDomain: cfg.homeDomain,
          clientDomain: cfg.clientDomain,
          authPublicKey: client.authPublicKey,
          fundsPublicKey: client.fundsPublicKey,
          portalFields: {
            walletType: "Custodial",
            walletName: "AXK Network",
            email: process.env.MGI_PORTAL_EMAIL ?? "ops@example.com",
            clientDomain: cfg.clientDomain,
            authenticationWalletAccount: client.authPublicKey,
            // Portal may ask for deposit/withdraw separately — same G is OK for sandbox
            depositWalletAccount: client.fundsPublicKey,
            withdrawWalletAccount: client.fundsPublicKey,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const client = new MoneyGramRamps(cfg);

  if (cmd === "info") {
    const info = await client.info();
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  const user = arg("user");
  if (!user && ["cash-out", "cash-in", "status", "watch"].includes(cmd)) {
    throw new Error("--user <numericId> is required");
  }

  if (cmd === "cash-out" || cmd === "cash-in") {
    const amount = arg("amount");
    if (!amount) throw new Error("--amount is required");
    const result = await client.start({
      userId: user!,
      amount,
      kind: cmd === "cash-in" ? "deposit" : "withdraw",
    });
    console.log(JSON.stringify(result, null, 2));
    console.log("\nOpen `url` in a browser/webview to complete MoneyGram UI.");
    console.log(`Then: npm run dev -- watch --user ${user} --id ${result.id}`);
    return;
  }

  if (cmd === "status") {
    const id = arg("id");
    if (!id) throw new Error("--id is required");
    const tx = await client.getTransaction(user!, id);
    console.log(JSON.stringify(tx, null, 2));
    return;
  }

  if (cmd === "watch") {
    const id = arg("id");
    if (!id) throw new Error("--id is required");
    const final = await client.watchAndSettle({
      userId: user!,
      transactionId: id,
      autoSendUsdc: !flag("no-auto-send"),
      onUpdate: (tx) => {
        console.log(`[${new Date().toISOString()}] ${tx.status}`, {
          externalTransactionId: tx.externalTransactionId,
          moreInfoUrl: tx.moreInfoUrl,
          stellarTransactionId: tx.stellarTransactionId,
        });
      },
    });
    console.log("Done:", JSON.stringify(final, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
