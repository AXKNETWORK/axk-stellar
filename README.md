# AXK Stellar

**Settlement and cash-out rails for verified commodity trade on Stellar**

![Stellar](https://img.shields.io/badge/Stellar-SEP--10%20%7C%20SEP--24-black)
![Node](https://img.shields.io/badge/Node-%E2%89%A520-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Soroban](https://img.shields.io/badge/Soroban-planned-lightgrey)
![License](https://img.shields.io/badge/License-MIT-yellow)

AXK settles agricultural commodity trade between African producers and international buyers. A cooperative delivers coffee, the delivery is verified, and the money has to reach several hundred farmers who do not hold crypto and want cash. This repository is the Stellar half of that: the anchor integrations that turn USDC into cash a farmer can collect, and the contracts that will hold and split the money on the way there.

[Setup](docs/setup.md) · [Architecture](docs/architecture.md) · [Anchors](docs/anchors.md) · [Roadmap](docs/roadmap.md) · [Contributing](CONTRIBUTING.md)

## Overview

The trade record, escrow state and buyer-facing product live in AXK's main platform. This repository holds only the parts that touch Stellar directly, so they can be read, tested and audited without the rest of the application around them.

Two pieces:

- **`packages/anchors`** — SEP-10 authentication and SEP-24 deposit and withdrawal against anchors, starting with MoneyGram. This is working code, running against MoneyGram's sandbox today.
- **`contracts`** — Soroban escrow, payment splitter and trade attestation, in Rust. They build to wasm and pass 33 tests. Nothing is deployed yet. See [contracts/README.md](contracts/README.md).

## Status, honestly

We would rather you read this than discover it.

| Component | State | Notes |
|---|---|---|
| SEP-10 authentication | Live | Custodial, one Stellar account with `memoId` per AXK user. Runs against MoneyGram's sandbox. |
| SEP-24 cash-out (withdraw) | Live | Interactive URL, transaction watcher, automatic USDC payment inside the transfer window. |
| SEP-24 cash-in (deposit) | Live | Same flow inbound. |
| Payment idempotency | Live, single process | Re-reads the anchor record before moving money, and holds a per-transaction claim so two concurrent watchers cannot both pay. Across two processes it needs a claim in shared storage, which the caller supplies. See [`decideSend`](packages/anchors/src/moneygram.ts) and [`locks.ts`](packages/anchors/src/locks.ts). |
| Escrow contract | Built, not deployed | Soroban. Destination fixed at creation, verifier-gated release, permissionless refund after the deadline. 16 tests. |
| Payment splitter | Built, not deployed | Soroban. Shares in basis points totalling exactly 10,000, rounding remainder assigned rather than dropped. 9 tests. |
| Attestation registry | Built, not deployed | Soroban. Write-once digest per trade, restricted to the attester, with a `matches` check for lenders. 8 tests. |
| Testnet deployment | Next | The contracts compile to wasm and pass their tests. Deploying them is the next milestone. |
| MoneyGram production | In pipeline | Commercial onboarding, which runs on its own timeline rather than ours. |
| Second anchor | In pipeline | At least one equivalent payout path per corridor. |
| Capability-aware routing | Designed | Specified in [docs/architecture.md](docs/architecture.md). Waiting on a second anchor, since with one there is nothing to route between. |

## Why it is built this way

**Custodial, with a memo per user.** Producers do not hold keys. AXK holds one Stellar account and identifies each user by an integer memo, which is what MoneyGram's custodial integration expects. A farmer never sees a seed phrase, never funds a reserve, and never loses money to a mistyped address.

**The money decision is a pure function.** `decideSend` takes the anchor's record and the transfer deadline and returns whether to pay. It has no network access and no clock of its own, so the one decision that can lose real money is testable in isolation and is tested.

**Idempotency comes from the anchor, not from memory.** An in-process "already sent" flag does not survive a restart. A crash between submitting a payment and confirming it would re-send and pay twice. So before moving USDC the client re-reads the transaction from the anchor and checks whether `stellar_transaction_id` is already stamped on it.

That re-read handles a restart but not a race. Two watchers on the same transaction would both read it before either payment landed, both see nothing stamped, and both pay. A per-transaction claim closes that within one process. Across several processes the claim has to live somewhere shared, and this package does not provide it.

**The transfer window is enforced.** MoneyGram gives a deadline in `user_action_required_by`. USDC sent after it closes is gone and no cash is handed over at the other end. The client refuses to send rather than paying into a closed window.

## Quick start

Requires Node 20 or newer.

```bash
git clone https://github.com/axknetwork/axk-stellar.git
cd axk-stellar
npm install

cp packages/anchors/.env.example packages/anchors/.env
# fill in MGI_AUTH_SECRET and MGI_FUNDS_SECRET with testnet seeds

npm test                                  # offline tests, no network
npm run anchors -- keys                   # show the public keys in use
npm run anchors -- info                   # fetch the anchor TOML and SEP-24 info
npm run anchors -- cash-out --user 100001 --amount 25
```

Full walkthrough, including how to get testnet USDC and what each transaction status means, is in [docs/setup.md](docs/setup.md).

## Layout

```
packages/anchors      SEP-10 and SEP-24 client, HTTP API, CLI
contracts             Soroban escrow, splitter and attestation
docs                  setup, architecture, anchor notes, roadmap
```

```bash
npm test                      # anchor client, 27 tests
cargo test --manifest-path contracts/Cargo.toml    # contracts, 33 tests
```

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node 20, TypeScript 5 |
| Stellar | `@stellar/typescript-wallet-sdk`, `@stellar/stellar-sdk` |
| Standards | SEP-1, SEP-10, SEP-24, SEP-9 |
| Contracts | Soroban, Rust, `soroban-sdk` 22 |
| API | Express 5, Zod |
| Tests | `node:test` via `tsx` |

## Security

Never commit a Stellar secret seed. `.env` and `.wallet-testnet.json` are ignored, and CI fails on anything shaped like a seed. Report vulnerabilities per [SECURITY.md](SECURITY.md) rather than opening a public issue.

## License

MIT. See [LICENSE](LICENSE).
