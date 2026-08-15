/**
 * AXK custodial MoneyGram Ramps client (SEP-10 + SEP-24).
 *
 * Source of truth:
 * https://xramps.moneygram.com/ops/dev/stellar
 *
 * Flow:
 *  1. SEP-10 authenticate with auth keypair + memoId = userId
 *  2. SEP-24 deposit (cash-in) or withdraw (cash-out) → interactive URL
 *  3. Open URL in webview; listen for COMMIT_RESULT postMessage
 *  4. Watcher → on pending_user_transfer_start:
 *       cash-out: send USDC (30 min window)
 *       cash-in: wait for inbound USDC
 *  5. cash-out: show external_transaction_id at pending_user_transfer_complete
 */

import {
  Wallet,
  SigningKeypair,
  IssuedAssetId,
  Types,
} from "@stellar/typescript-wallet-sdk";
import type { AppConfig } from "./config";
import { requireSecrets } from "./config";
import { tryAcquire, release } from "./locks";
import type {
  StartRampInput,
  StartRampResult,
  TransactionView,
} from "./types";

type AuthToken = Types.AuthToken;
type AnchorTransaction = Types.AnchorTransaction;

function asMemoId(userId: string | number): string {
  const n = typeof userId === "number" ? userId : Number(userId);
  if (!Number.isInteger(n) || n < 1 || n > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `userId must be a positive integer ≤ 64-bit range for MoneyGram custodial memo; got ${userId}`,
    );
  }
  return String(n);
}

export type SendDecision =
  | { send: true }
  | { send: false; reason: "already-sent" | "window-closed" };

/**
 * The cash-out money decision, isolated so it can be tested.
 *
 * `alreadySent` must come from the anchor's own record (stellar_transaction_id),
 * not an in-process flag — a crash between submit and confirmation would
 * otherwise re-send. `deadline` is MoneyGram's user_action_required_by; paying
 * after it closes burns USDC that will never be handed over as cash.
 */
export function decideSend(input: {
  alreadySent: boolean;
  deadline?: string | null;
  now?: number;
}): SendDecision {
  if (input.alreadySent) return { send: false, reason: "already-sent" };
  if (input.deadline) {
    const at = Date.parse(input.deadline);
    if (Number.isFinite(at) && at < (input.now ?? Date.now())) {
      return { send: false, reason: "window-closed" };
    }
  }
  return { send: true };
}

function summarize(tx: AnchorTransaction): TransactionView {
  const anyTx = tx as AnchorTransaction & Record<string, unknown>;
  return {
    id: String(anyTx.id ?? ""),
    status: String(anyTx.status ?? ""),
    kind: anyTx.kind != null ? String(anyTx.kind) : undefined,
    amountIn: anyTx.amount_in != null ? String(anyTx.amount_in) : undefined,
    amountOut: anyTx.amount_out != null ? String(anyTx.amount_out) : undefined,
    stellarTransactionId:
      anyTx.stellar_transaction_id != null
        ? String(anyTx.stellar_transaction_id)
        : undefined,
    externalTransactionId:
      anyTx.external_transaction_id != null
        ? String(anyTx.external_transaction_id)
        : undefined,
    moreInfoUrl:
      anyTx.more_info_url != null ? String(anyTx.more_info_url) : undefined,
    withdrawAnchorAccount:
      anyTx.withdraw_anchor_account != null
        ? String(anyTx.withdraw_anchor_account)
        : undefined,
    withdrawMemo:
      anyTx.withdraw_memo != null ? String(anyTx.withdraw_memo) : undefined,
    withdrawMemoType:
      anyTx.withdraw_memo_type != null
        ? String(anyTx.withdraw_memo_type)
        : undefined,
    raw: tx,
  };
}

export class MoneyGramRamps {
  readonly cfg: AppConfig;
  private readonly wallet: Wallet;
  private readonly authKp: SigningKeypair;
  private readonly fundsKp: SigningKeypair;

  constructor(cfg: AppConfig) {
    requireSecrets(cfg);
    this.cfg = cfg;
    this.wallet =
      cfg.env === "production" ? Wallet.MainNet() : Wallet.TestNet();
    this.authKp = SigningKeypair.fromSecret(cfg.authSecret);
    this.fundsKp = SigningKeypair.fromSecret(cfg.fundsSecret);
  }

  get authPublicKey(): string {
    return this.authKp.publicKey;
  }

  get fundsPublicKey(): string {
    return this.fundsKp.publicKey;
  }

  private anchor() {
    return this.wallet.anchor({ homeDomain: this.cfg.homeDomain });
  }

  /** Fetch MoneyGram TOML + SEP-24 info (works once domain/accounts are allowlisted). */
  async info() {
    const anchor = this.anchor();
    const toml = await anchor.sep1(true);
    const sep24 = await anchor.sep24().info(true);
    return {
      env: this.cfg.env,
      homeDomain: this.cfg.homeDomain,
      tomlUrl: this.cfg.tomlUrl,
      authPublicKey: this.authPublicKey,
      fundsPublicKey: this.fundsPublicKey,
      clientDomain: this.cfg.clientDomain,
      toml,
      sep24,
    };
  }

  /**
   * SEP-10 — custodial: one Stellar account + memoId = AXK user/org numeric id.
   *
   * MoneyGram validates that the SEP-24 account equals the account inside the
   * SEP-10 token. A deposit whose `destinationAccount` is a *different* declared
   * address is rejected with:
   *   400 {"error":"'account' does not match the one in the token"}
   *
   * So we authenticate as the FUNDS account — the one that actually receives
   * cash-in USDC and sources cash-out USDC — for both directions. Verified
   * against extmgxanchor sandbox 2026-08-04 (deposit + withdraw both accepted).
   *
   * OPEN QUESTION for MoneyGram ops: the Partner Portal takes separate
   * Authentication / Deposit / Withdraw addresses. If, post-allowlist, SEP-10 is
   * restricted to the declared Authentication account, the declared Deposit
   * account must equal it or cash-in breaks again. Set MGI_SEP10_ACCOUNT=auth to
   * flip this without a code change.
   */
  private sep10Keypair(): SigningKeypair {
    return this.cfg.sep10Account === "auth" ? this.authKp : this.fundsKp;
  }

  /** The Stellar account MoneyGram sees — SEP-24 deposit/withdraw must match it. */
  get sep24Account(): string {
    return this.sep10Keypair().publicKey;
  }

  async authenticate(userId: string | number): Promise<AuthToken> {
    const sep10 = await this.anchor().sep10();
    return sep10.authenticate({
      accountKp: this.sep10Keypair(),
      memoId: asMemoId(userId),
      // Custodial: clientDomain not required by MoneyGram; harmless if portal listed a domain.
    });
  }

  /** Start cash-in (deposit) or cash-out (withdraw). Returns interactive URL for webview. */
  async start(input: StartRampInput): Promise<StartRampResult> {
    const userId = asMemoId(input.userId);
    const amount = String(input.amount);
    // Number("NaN"), Number("abc") and Number("Infinity") are not <= 0, so a
    // bare comparison lets all three through to the anchor, which answers with
    // a 500 and a parser error. Check finiteness, not just the sign.
    const parsedAmount = Number(amount);
    if (!amount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw new Error("amount must be a positive USDC string, e.g. \"25.00\"");
    }

    const authToken = await this.authenticate(userId);
    const sep24 = this.anchor().sep24();
    const extraFields: Record<string, string> = {
      amount,
      ...(input.kyc ?? {}),
    };

    // MUST equal the SEP-10 token account — see sep10Keypair() for why.
    const account = this.sep24Account;

    const interactive =
      input.kind === "deposit"
        ? await sep24.deposit({
            assetCode: "USDC",
            authToken,
            lang: input.lang ?? "en",
            destinationAccount: account,
            extraFields,
          })
        : await sep24.withdraw({
            assetCode: "USDC",
            authToken,
            lang: input.lang ?? "en",
            withdrawalAccount: account,
            extraFields,
          });

    if (!interactive.id || !interactive.url) {
      throw new Error(
        `MoneyGram SEP-24 ${input.kind} did not return id/url: ${interactive.error ?? interactive.type}`,
      );
    }

    return {
      id: interactive.id,
      url: interactive.url,
      kind: input.kind,
      userId,
      amount,
      homeDomain: this.cfg.homeDomain,
    };
  }

  async getTransaction(userId: string | number, id: string): Promise<TransactionView> {
    const authToken = await this.authenticate(userId);
    const tx = await this.anchor().sep24().getTransactionBy({ authToken, id });
    return summarize(tx);
  }

  /**
   * Watch a SEP-24 tx. On cash-out, when status is pending_user_transfer_start,
   * automatically submit the USDC payment (must complete within ~30 minutes).
   */
  async watchAndSettle(opts: {
    userId: string | number;
    transactionId: string;
    autoSendUsdc?: boolean;
    onUpdate?: (tx: TransactionView) => void;
  }): Promise<TransactionView> {
    const authToken = await this.authenticate(opts.userId);
    const sep24 = this.anchor().sep24();
    const stellar = this.wallet.stellar();
    const autoSend = opts.autoSendUsdc !== false;

    let usdcAsset: IssuedAssetId | null = null;
    if (this.cfg.usdcIssuer) {
      usdcAsset = new IssuedAssetId("USDC", this.cfg.usdcIssuer);
    } else {
      const info = await this.anchor().getInfo(true);
      const currency = info.currencies?.find((c) => c.code === "USDC");
      if (currency?.code && currency?.issuer) {
        usdcAsset = new IssuedAssetId(currency.code, currency.issuer);
      }
    }

    let sent = false;
    const lockKey = `${this.cfg.homeDomain}:${opts.transactionId}`;

    return new Promise<TransactionView>((resolve, reject) => {
      const watcher = sep24.watcher();
      const { stop } = watcher.watchOneTransaction({
        authToken,
        assetCode: "USDC",
        id: opts.transactionId,
        onMessage: async (transaction) => {
          const view = summarize(transaction);
          opts.onUpdate?.(view);

          if (
            autoSend &&
            !sent &&
            view.status === "pending_user_transfer_start" &&
            view.withdrawAnchorAccount
          ) {
            if (!usdcAsset) {
              stop();
              reject(new Error("USDC issuer unknown — set MGI_USDC_ISSUER"));
              return;
            }

            // Two watchers on the same transaction would both re-read, both see
            // no payment yet, and both send. The re-read below only protects a
            // restart. Whoever loses this race leaves the settling to the winner.
            if (!tryAcquire(lockKey)) return;

            // IDEMPOTENCY — the in-memory `sent` flag does not survive a restart.
            // The anchor stamps stellar_transaction_id once it sees our payment,
            // so re-read its record before moving money. Without this, a crash
            // between send and confirmation double-pays on the next watch.
            const fresh = await sep24.getTransactionBy({
              authToken,
              id: opts.transactionId,
            });
            const freshView = summarize(fresh);
            const rawDeadline = (fresh as Record<string, unknown>)
              .user_action_required_by;

            const decision = decideSend({
              alreadySent: Boolean(freshView.stellarTransactionId),
              deadline: typeof rawDeadline === "string" ? rawDeadline : null,
            });

            if (!decision.send) {
              sent = true;
              release(lockKey);
              if (decision.reason === "already-sent") {
                opts.onUpdate?.(freshView);
                return;
              }
              stop();
              reject(
                new Error(
                  `MoneyGram transfer window closed (${rawDeadline}) — not sending USDC for ${opts.transactionId}`,
                ),
              );
              return;
            }

            sent = true;
            try {
              const txBuilder = await stellar.transaction({
                sourceAddress: this.fundsKp,
                baseFee: 10000,
                timebounds: 180,
              });
              const transfer = txBuilder
                .transferWithdrawalTransaction(
                  transaction as Types.WithdrawTransaction,
                  usdcAsset,
                )
                .build();
              this.fundsKp.sign(transfer);
              await stellar.submitTransaction(transfer);
            } catch (err) {
              // Released only on failure. After a successful submission the
              // claim is held for the life of the process: the anchor does not
              // stamp stellar_transaction_id the instant we submit, so a caller
              // that acquired the lock in that gap would re-read a record still
              // showing no payment and send a second one.
              release(lockKey);
              stop();
              reject(err);
            }
          }

          if (view.status === "pending_user_transfer_complete") {
            // Reference number available for cash pickup
            opts.onUpdate?.(view);
          }
        },
        onSuccess: (transaction) => {
          stop();
          resolve(summarize(transaction));
        },
        onError: (transaction) => {
          stop();
          const view = summarize(transaction);
          reject(
            new Error(
              `MoneyGram transaction error: status=${view.status} id=${view.id}`,
            ),
          );
        },
      });
    });
  }
}
