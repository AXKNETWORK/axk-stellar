import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  MGI_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  MGI_HOME_DOMAIN: z.string().optional(),
  MGI_CLIENT_DOMAIN: z.string().min(1).default("api.axk.org"),
  MGI_AUTH_SECRET: z.string().optional().default(""),
  MGI_FUNDS_SECRET: z.string().optional().default(""),
  MGI_DEPOSIT_PUBLIC: z.string().optional(),
  MGI_WITHDRAW_PUBLIC: z.string().optional(),
  // Which account signs SEP-10. MoneyGram requires the SEP-24 deposit/withdraw
  // account to equal the token account, so this also picks the SEP-24 account.
  MGI_SEP10_ACCOUNT: z.enum(["funds", "auth"]).default("funds"),
  MGI_USDC_ISSUER: z.string().optional(),
  // Shared secret for the HTTP API. No default: the server refuses to start
  // without one rather than listening unauthenticated.
  MGI_API_KEY: z.string().optional().default(""),
  PORT: z.coerce.number().default(5055),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5055"),
});

export type AppConfig = {
  env: "sandbox" | "production";
  homeDomain: string;
  clientDomain: string;
  authSecret: string;
  fundsSecret: string;
  depositPublic?: string;
  withdrawPublic?: string;
  sep10Account: "funds" | "auth";
  usdcIssuer?: string;
  apiKey: string;
  port: number;
  host: string;
  corsOrigins: string[];
  tomlUrl: string;
};

const DEFAULT_HOME: Record<"sandbox" | "production", string> = {
  sandbox: "extmgxanchor.moneygram.com",
  production: "mgxanchor.moneygram.com",
};

export function loadConfig(partial?: Partial<Record<keyof z.infer<typeof EnvSchema>, string>>): AppConfig {
  const parsed = EnvSchema.parse({ ...process.env, ...partial });
  const env = parsed.MGI_ENV;
  const homeDomain = parsed.MGI_HOME_DOMAIN || DEFAULT_HOME[env];

  return {
    env,
    homeDomain,
    clientDomain: parsed.MGI_CLIENT_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    authSecret: parsed.MGI_AUTH_SECRET,
    fundsSecret: parsed.MGI_FUNDS_SECRET || parsed.MGI_AUTH_SECRET,
    depositPublic: parsed.MGI_DEPOSIT_PUBLIC,
    withdrawPublic: parsed.MGI_WITHDRAW_PUBLIC,
    sep10Account: parsed.MGI_SEP10_ACCOUNT,
    usdcIssuer: parsed.MGI_USDC_ISSUER,
    apiKey: parsed.MGI_API_KEY,
    port: parsed.PORT,
    host: parsed.HOST,
    corsOrigins: parsed.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    tomlUrl: `https://${homeDomain}/.well-known/stellar.toml`,
  };
}

export function requireSecrets(cfg: AppConfig): void {
  if (!cfg.authSecret.startsWith("S")) {
    throw new Error(
      "MGI_AUTH_SECRET missing or invalid. Set the custodial auth seed (S...) after whitelist.",
    );
  }
  if (!cfg.fundsSecret.startsWith("S")) {
    throw new Error(
      "MGI_FUNDS_SECRET missing or invalid. Set the custodial funds seed (S...) after whitelist.",
    );
  }
}
