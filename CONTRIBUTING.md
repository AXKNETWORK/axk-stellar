# Contributing

## Getting set up

See [docs/setup.md](docs/setup.md). Short version: Node 20, `npm install`, `npm test`.

## Before you open a pull request

```bash
npm run typecheck
npm test
```

Both run in CI, along with a check that refuses any Stellar secret seed in the tree.

## What we look for

**Tests come with the change.** Anything touching the payment path needs failure-mode coverage, not just the happy path. The interesting cases are the ones where money moves twice, moves late, or moves to the wrong place. `src/moneygram.test.ts` shows the shape: the decision is isolated into a pure function and the awkward cases are asserted directly.

**No network in the test suite.** Tests run offline. If you need anchor behaviour, encode it as a fixture and test the decision, not the round trip.

**Say why, not what.** A comment explaining that a function returns a value is noise. A comment explaining that the idempotency check reads the anchor's record because an in-process flag does not survive a crash is the reason the next person does not remove it. Prefer the second and skip the first.

**Small, and one thing at a time.** A pull request that fixes a bug and reformats a file is two pull requests.

## Commits

`type(scope): imperative summary`, for example `fix(anchors): refuse USDC send after the transfer window closes`. Keep the subject under about seventy characters.

## Reporting a vulnerability

Do not open an issue. See [SECURITY.md](SECURITY.md).
