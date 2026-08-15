# Contracts

Soroban contracts for holding, splitting and attesting a settled trade. Written in Rust, building to wasm, covered by 30 tests.

**Nothing is deployed.** They pass their tests and compile to wasm; they have not been on testnet, and they have not been audited. Do not put value near them yet.

```bash
cargo test                                        # 30 tests
cargo build --release --target wasm32-unknown-unknown
```

## Escrow

Holds a buyer's payment against one trade until delivery is verified.

```
init(verifier)
create(trade_id, buyer, destination, token, amount, deadline)
release(trade_id)     // verifier only
refund(trade_id)      // after the deadline, by anyone
get(trade_id)
```

**The destination is fixed at creation and `release` takes no address.** That is the guarantee the contract exists for. A compromised verifier can stall a release or let the deadline run out, but has no parameter through which to send the money somewhere else. `there_is_no_way_to_name_a_destination_at_release` exists to fail if anyone ever adds one.

**Refund needs no signature.** Once the deadline passes, anyone can trigger the return to the buyer. If it required a privileged caller, a buyer's money would depend on AXK still being around to sign for it. `refund_demands_no_signature_at_all` asserts the authorisation set is empty.

**A deadline already in the past is rejected at creation**, otherwise an escrow is refundable the instant it is funded while looking settled.

The state machine is `Funded → Released` or `Funded → Refunded`, and nothing else. Releasing twice, refunding a released trade, and releasing a refunded one are each tested and each refused.

## Splitter

Divides a released payment between the cooperative, its members and any financier.

```
configure(trade_id, shares)   // basis points, totalling exactly 10,000
distribute(trade_id, token, from, amount)
shares(trade_id)
```

**The parts sum to exactly the whole.** Integer division leaves a remainder, and a remainder that is dropped or left in the contract is a balance that drifts by a stroop per settlement until someone reconciles a year of it by hand. The remainder goes to the last share. `a_rounding_remainder_is_paid_out_not_dropped` splits 1,001 three ways at 3333/3333/3334 and asserts the payments total 1,001 exactly.

**A share of zero or below is refused**, not just a total that misses. Otherwise `10000 + 0` and `12000 + -2000` both total correctly while describing a split that is not one.

**A configured split cannot be rewritten**, so it cannot change after the parties agreed to it.

## Attestation registry

```
attest(trade_id, digest)
get(trade_id)
matches(trade_id, digest) -> bool
```

Stores a digest over a canonical serialisation of the trade record, never the record. A lender shown a trade hashes it and calls `matches`, confirming it is the record that settled without AXK vouching for it and without the ledger carrying commercial terms or personal data.

**Write-once.** An attestation that could be amended would prove only what AXK last chose to say. **Writing is unpermissioned**, because the value is in the digest matching, not in who submitted it, and `matches` on an unknown trade returns false rather than raising.

## What is still owed

The canonicalisation these digests are taken over has to be published and stable before the attestation means anything to an outside party. That is a specification problem, not a contract one, and it is not solved yet.

Beyond that: testnet deployment, a STRIDE threat model over the contracts and the privileged accounts, monitoring derived from it, and an external audit with findings remediated. Pause and upgrade controls are not implemented; both are admin powers and belong in the threat model before they exist in code.
