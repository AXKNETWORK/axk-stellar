# Working with anchors

Notes from integrating MoneyGram's sandbox. Most of this generalises to any SEP-24 anchor, and all of it cost us time to find out.

## A sandbox authenticates anybody

SEP-10 against a sandbox anchor will succeed for a Stellar account the anchor has never heard of. A returned token proves your signing works. It proves nothing about whether you are onboarded.

The distinction matters because it is easy to demonstrate a "working integration" that will fail the moment it points at production. If you need to know whether an account is actually registered, compare the token contents between a registered account and a fresh throwaway one: an anchor that attributes clients will put something in the registered one that the throwaway does not get.

## The SEP-24 account must equal the SEP-10 token account

This one is a hard 400 and the message is not obvious:

```
400 {"error":"'account' does not match the one in the token"}
```

It means the `destinationAccount` on a deposit, or `withdrawalAccount` on a withdrawal, is not the account inside the SEP-10 token you authenticated with. Partner onboarding forms often take separate Authentication, Deposit and Withdraw addresses, which invites exactly this mistake.

Whichever account signs SEP-10 is the account SEP-24 must use. `MGI_SEP10_ACCOUNT` switches which one signs, and the SEP-24 account follows it automatically rather than being configured separately, because configuring them separately is how they drift apart.

## Custodial integrations use a memo, not an account per user

One Stellar account, and an integer memo identifying the user. The memo has to be a positive integer inside 64-bit range. Non-numeric identifiers, zero, negatives and fractions are all rejected before any network call, because an anchor's rejection of a malformed memo is much harder to read than a local error.

This is what makes the model work for producers who do not hold keys. It also means the memo is the only thing separating one user's transaction from another's, so it has to come from a trustworthy source.

## The transfer window is real

On cash-out the anchor moves to `pending_user_transfer_start` and gives a deadline in `user_action_required_by`, typically thirty minutes. Send the USDC inside it. Sent after, the funds are gone and no cash is handed over at the other end.

Treat the deadline as authoritative even when it looks generous. A retry queue that was drained late is a plausible way to pay into a closed window without anyone doing anything obviously wrong.

## Never trust an in-process flag for idempotency

The obvious way to avoid double-paying is a boolean. It does not survive a restart, and the window between submitting a payment and recording it is exactly where a crash hurts.

Read the anchor's own record instead. Once it has seen your payment it stamps `stellar_transaction_id` on the transaction. Check that immediately before sending, not at the start of the flow.

## Onboarding is slower than the code

Sandbox access, production access and being registered as a client are three different things with three different timelines, and none of them are engineering. Start those conversations before you need them, and integrate a second anchor for any corridor that matters, so one slow counterparty does not hold up a launch.
