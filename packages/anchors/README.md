# @axk/anchors

SEP-10 authentication and SEP-24 cash-in and cash-out against Stellar anchors. Currently integrates MoneyGram's sandbox.

Setup and a walkthrough are in [docs/setup.md](../../docs/setup.md). Integration notes and the traps we hit are in [docs/anchors.md](../../docs/anchors.md).

## Library

```ts
import { loadConfig, MoneyGramRamps } from "@axk/anchors";

const ramps = new MoneyGramRamps(loadConfig());

const { id, url } = await ramps.start({
  userId: 100001,
  amount: "25.00",
  kind: "withdraw",
});

// Open `url` for the user, then settle when the anchor asks for the USDC.
const final = await ramps.watchAndSettle({ userId: 100001, transactionId: id });
```

`decideSend` is exported separately. It is the pure function behind `watchAndSettle` that decides whether to release USDC, and it is where the double-payment and expired-window rules live.

## HTTP API

`npm run serve`. Every `/v1` route requires `X-API-Key` or `Authorization: Bearer`. `/health` does not.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness. Open. |
| `GET /v1/info` | Anchor `stellar.toml` and SEP-24 capabilities. |
| `GET /v1/keys` | Public keys in use and the client domain. |
| `POST /v1/ramps/cash-in` | Start a deposit. Returns an interactive URL. |
| `POST /v1/ramps/cash-out` | Start a withdrawal. Returns an interactive URL. |
| `GET /v1/ramps/:userId/:txId` | Current transaction state. |
| `POST /v1/ramps/:userId/:txId/watch` | Watch to completion, sending USDC when asked. |

## CLI

```
generate-keys              create an auth and a funds keypair
keys                       show public keys and onboarding fields
info                       fetch anchor TOML and SEP-24 info
cash-in   --user --amount  start a deposit
cash-out  --user --amount  start a withdrawal
status    --user --id      read a transaction
watch     --user --id      watch and settle, --no-auto-send to observe only
```

## Tests

`npm test`. Offline, no network. 22 tests covering the send decision, the SEP-10 and SEP-24 account equality rule, memo validation, amount guards, config safety and the API key guard.
