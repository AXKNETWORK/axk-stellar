const inFlight = new Set<string>();

/**
 * Process-local mutual exclusion around the send decision.
 *
 * Re-reading the anchor's record stops a restart from paying twice, but it does
 * nothing about two callers racing: both read the transaction before either
 * payment lands, both see no `stellar_transaction_id`, and both pay. A double
 * click on the demo page, a load balancer retry, or a redelivered queue message
 * is enough to cause it.
 *
 * This closes the case where both callers are in one process. It does NOT close
 * the case where they are in two, which needs a claim in shared storage. Callers
 * running more than one instance must supply that themselves; see SECURITY.md.
 */
export function tryAcquire(key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

export function release(key: string): void {
  inFlight.delete(key);
}

export function isHeld(key: string): boolean {
  return inFlight.has(key);
}
