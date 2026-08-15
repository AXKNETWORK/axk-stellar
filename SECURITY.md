# Security

## Reporting

Email security@axk.org rather than opening a public issue. Include what you found, how to reproduce it, and what you think the impact is. We will confirm receipt within three working days.

Please do not test against production anchors or move funds that are not yours.

## Handling keys

Stellar secret seeds start with `S`. They are bearer credentials: anyone holding one controls the account.

- Seeds belong in `.env`, which is ignored, or in a secret manager. Never in source, never in a commit, never in an issue or a screenshot.
- CI fails the build on anything matching a seed pattern anywhere in the tree.
- A seed that has been committed is compromised even after the commit is removed. Rotate it: create a new account, move the balance, update the anchor registration.

## Scope of this repository

The code here can move USDC. Two things follow from that.

The `/v1` routes require an API key and the server refuses to start without one. CORS is not access control; it constrains browsers and does nothing to a direct HTTP client. Do not remove the guard to make local development easier, and do not run the server on a public interface without something in front of it.

The custodial model means AXK's funds account holds user balances. Compromise of that seed is a loss of funds, not a loss of data. Treat it accordingly: separate accounts for authentication and funds, limited balances on hot accounts, and threshold or institutional custody once balances matter.

## Known gaps

Stated plainly because a reader will find them anyway.

- No rate limiting on the HTTP API.
- Payment idempotency is process-local. The client re-reads the anchor's record before sending and holds a per-transaction claim, which covers a restart and two concurrent callers in one process. Running more than one instance against the same transaction needs a claim in shared storage, and this package does not provide one. `POST /v1/ramps/:userId/:txId/watch` takes no idempotency key, so a caller behind a retrying load balancer must supply that guarantee itself.
- No per-user authorization: a valid API key can start a ramp for any user id. The caller is trusted to be the AXK platform.
- The demo page under `/demo/` is a development aid and has had no hardening review.
- No Soroban contracts are deployed, so nothing here has been audited on chain.
