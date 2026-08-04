/** SEP-9 fields MoneyGram accepts for pre-fill (custodial amount required). */
export type Sep9Fields = {
  amount: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  mobile_number?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  address_country_code?: string;
  state_or_province?: string;
  [key: string]: string | undefined;
};

export type RampKind = "deposit" | "withdraw";

export type StartRampInput = {
  /** Positive integer ≤ 64 bits — MoneyGram custodial user memo on SEP-10. */
  userId: string | number;
  amount: string;
  kind: RampKind;
  lang?: string;
  kyc?: Omit<Sep9Fields, "amount">;
};

export type StartRampResult = {
  id: string;
  url: string;
  kind: RampKind;
  userId: string;
  amount: string;
  homeDomain: string;
};

export type TransactionView = {
  id: string;
  status: string;
  kind?: string;
  amountIn?: string;
  amountOut?: string;
  stellarTransactionId?: string;
  externalTransactionId?: string;
  moreInfoUrl?: string;
  withdrawAnchorAccount?: string;
  withdrawMemo?: string;
  withdrawMemoType?: string;
  raw: unknown;
};
