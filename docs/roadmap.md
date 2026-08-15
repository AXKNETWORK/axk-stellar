# Roadmap

Ordered by dependency rather than by preference. Each item lands with tests.

## Now

- **Second anchor.** One anchor is a dependency, not a rail. The goal is at least two workable payout paths per corridor.
- **Testnet deployment of the contracts.** Escrow, splitter and attestation are written and tested; getting them onto testnet with published addresses is the next step.
- **Canonical serialisation for attestation digests.** The contract stores a digest; the rule for producing it has to be published and stable before an outside party can rely on it.
- **Persistent payout state.** Transaction state currently lives with the caller. It needs to be event-sourced and durable so a restart resumes rather than restarts.

## Next

- **Capability-aware routing.** Select a rail on corridor, currency, instrument, KYC tier and provider health. Not round-robin, and never a silent substitution of one instrument for another.
- **Cross-rail idempotency.** Idempotency keys derived from the trade obligation rather than from a request, so a retry that lands on a different provider is still recognised as the same payment.
- **SEP-6 and SEP-12.** Programmatic payout where a hosted interactive flow is the wrong shape, and identity collected once rather than re-collected per anchor.
- **SEP-38.** Firm quotes, so an FX rate can be shown to a cooperative and honoured.
- **Multi-provider RPC.** Health-checked failover across RPC providers. A single provider is a single point of failure for settlement.

## Later

- **SEP-31.** Direct corridor transfers between institutions.
- **Record access for lenders.** A query surface over settled-trade attestations that does not depend on AXK being reachable.
- **Anchor Platform.** Operating a corridor directly, once one has demand that justifies it.

## Not planned here

Credit products, insurance, treasury yield and token mechanics. They depend on the verified record this repository helps produce, but they belong in the platform, not in the settlement layer.
