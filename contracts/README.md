# Contracts

**Nothing here is implemented.** This directory holds the design for the Soroban contracts, written down before the code so the interfaces can be argued with cheaply. There is no deployment on testnet or mainnet.

## Three contracts

### Escrow

Holds a buyer's USDC against a specific trade until delivery is verified.

The destination is fixed when the escrow is created and cannot be changed afterwards. This is the point of the contract: it means a compromised AXK operator can stall a release but cannot redirect the money. Any design where an admin can retarget funds mid-flight gives up the only guarantee worth having.

```
create(trade_id, buyer, destination, amount, deadline)
release(trade_id, verification)   // verifier role only
refund(trade_id)                  // after deadline, to the buyer, by anyone
```

Refund after the deadline is deliberately callable by anyone. If it needed a privileged caller, a buyer's money would depend on AXK still existing.

### Splitter

Divides a released amount between the cooperative, its members and any financier, atomically.

The invariant is that the parts sum exactly to the whole. Not approximately: a rounding remainder has to be assigned to a named party, not dropped or left in the contract, or the balance drifts by a stroop per settlement until someone notices a year later.

```
configure(trade_id, shares)   // shares must total 100%
distribute(trade_id, amount)
```

### Attestation registry

Write-once record that a trade settled, keyed by trade id, storing a digest over a canonical serialisation of the trade record.

The point is that a lender can be shown a trade record, hash it themselves, and confirm it matches what settled, without AXK vouching for it and without the ledger holding commercially sensitive terms. That requires the canonicalisation to be published and stable, which is the hard part and is not solved by the contract.

```
attest(trade_id, digest)      // fails if trade_id already present
get(trade_id) -> digest
```

## Design commitments

**Audited patterns, not clever ones.** Access control, pausing and upgrades come from OpenZeppelin's Stellar contracts rather than being written here.

**Roles are separated and each is tested against what it must not do.** A verifier cannot move funds. An admin cannot retarget an escrow. The tests assert the negatives, because a test that only proves the happy path proves nothing about authority.

**Pausable, upgradeable, and honest about what that means.** Both are admin powers, and an admin key is a trust assumption however it is stored. They are here because a bug in a live money contract with no pause is worse. The threat model has to state who holds those keys and under what controls.

## Before any of this holds real value

An external audit, with findings remediated and re-reviewed. A STRIDE threat model over the contracts, the privileged accounts and the orchestrator, with monitoring derived from it. Neither has been done.
