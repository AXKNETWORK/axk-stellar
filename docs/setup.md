# Setup

Requires Node 20 or newer. Everything below runs against Stellar testnet and MoneyGram's sandbox anchor. No real money is involved.

## 1. Install

```bash
git clone https://github.com/axknetwork/axk-stellar.git
cd axk-stellar
npm install
```

## 2. Configure

```bash
cp packages/anchors/.env.example packages/anchors/.env
```

Generate a pair of testnet keys:

```bash
npm run anchors -- generate-keys
```

That prints two keypairs and an `.env` block. Paste the block into `packages/anchors/.env`. The two accounts do different jobs:

- **auth** signs the SEP-10 challenge. This is the account an anchor registers.
- **funds** holds USDC, sends it on cash-out and receives it on cash-in.

They can be the same account while you are exploring. In production they usually are not.

You also need an API key, because the HTTP server will not start without one:

```bash
openssl rand -hex 32
```

Put it in `MGI_API_KEY`.

## 3. Fund the accounts

Create the accounts on testnet and add a USDC trustline. Friendbot funds XLM:

```bash
curl "https://friendbot.stellar.org/?addr=<your G... address>"
```

For testnet USDC, use Circle's testnet faucet and the issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. The account sending USDC on cash-out needs both a trustline and a balance; the account that only authenticates needs neither.

## 4. Check it works

```bash
npm run anchors -- keys     # the public keys and what each is for
npm run anchors -- info     # the anchor's stellar.toml and SEP-24 capabilities
```

`info` reaching the anchor confirms SEP-1 and network access. It does not confirm the anchor has onboarded you: a sandbox will happily authenticate an account it has never heard of.

## 5. Run a cash-out

```bash
npm run anchors -- cash-out --user 100001 --amount 25
```

This returns an interactive URL. Open it, complete the anchor's hosted KYC, and it will move to `pending_user_transfer_start`, which means the anchor is waiting for the USDC.

Then watch it, which sends the payment automatically inside the transfer window:

```bash
npm run anchors -- watch --user 100001 --id <transaction id>
```

Add `--no-auto-send` to observe without moving anything.

## Transaction statuses worth knowing

| Status | Meaning |
|---|---|
| `incomplete` | The user has not finished the interactive flow. |
| `pending_user_transfer_start` | The anchor is waiting for your USDC. The clock is running. |
| `pending_anchor` | The anchor has the USDC and is processing. |
| `pending_user_transfer_complete` | Cash is collectable. `external_transaction_id` is the reference the user quotes. |
| `completed` | Done. |
| `error` | Check `message` on the transaction. |

## Running the HTTP API

```bash
npm run serve
```

Every route under `/v1` requires the API key, sent as `X-API-Key` or `Authorization: Bearer`:

```bash
curl -H "X-API-Key: $MGI_API_KEY" http://127.0.0.1:5055/v1/keys
```

`/health` is open so a load balancer can reach it.

A browser demo that hosts the interactive URL in an iframe is served at `/demo/`. It is a development aid, not a production surface.

## Tests

```bash
npm test
```

The suite is entirely offline. Nothing in it reaches an anchor or the network, so it runs in CI and on a plane.
