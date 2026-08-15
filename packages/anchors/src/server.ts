/**
 * Minimal HTTP API for AXK desk / Frappe to call once whitelisted.
 *
 * POST /v1/ramps/cash-in   { userId, amount, kyc? }
 * POST /v1/ramps/cash-out  { userId, amount, kyc? }
 * GET  /v1/ramps/:userId/:txId
 * POST /v1/ramps/:userId/:txId/watch   { autoSendUsdc?: boolean }
 * GET  /v1/info
 * GET  /health
 * GET  /demo  — simple webview host for MoneyGram interactive URL
 */

import express from "express";
import cors from "cors";
import path from "node:path";
import { loadConfig } from "./config";
import { requireApiKey } from "./auth";
import { MoneyGramRamps } from "./moneygram";

const cfg = loadConfig();
const app = express();

app.use(
  cors({
    origin: cfg.corsOrigins,
  }),
);
app.use(express.json());
app.use("/demo", express.static(path.join(__dirname, "..", "public")));

// /health stays open for load balancers. Everything under /v1 is closed.
app.use("/v1", requireApiKey(cfg.apiKey));

app.get("/health", (_req, res) => {
  res.json({ ok: true, env: cfg.env, homeDomain: cfg.homeDomain });
});

function client(): MoneyGramRamps {
  return new MoneyGramRamps(cfg);
}

app.get("/v1/info", async (_req, res) => {
  try {
    const info = await client().info();
    res.json(info);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : String(err),
      hint: "The anchor rejected the request. Check that the wallet is onboarded with the anchor and funded.",
    });
  }
});

app.get("/v1/keys", (_req, res) => {
  try {
    const c = client();
    res.json({
      env: cfg.env,
      clientDomain: cfg.clientDomain,
      authPublicKey: c.authPublicKey,
      fundsPublicKey: c.fundsPublicKey,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/v1/ramps/cash-in", async (req, res) => {
  try {
    const { userId, amount, kyc, lang } = req.body ?? {};
    const result = await client().start({
      userId,
      amount,
      kind: "deposit",
      kyc,
      lang,
    });
    res.json({
      ...result,
      demoUrl: `/demo/index.html?url=${encodeURIComponent(result.url)}&userId=${encodeURIComponent(result.userId)}&txId=${encodeURIComponent(result.id)}`,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/v1/ramps/cash-out", async (req, res) => {
  try {
    const { userId, amount, kyc, lang } = req.body ?? {};
    const result = await client().start({
      userId,
      amount,
      kind: "withdraw",
      kyc,
      lang,
    });
    res.json({
      ...result,
      demoUrl: `/demo/index.html?url=${encodeURIComponent(result.url)}&userId=${encodeURIComponent(result.userId)}&txId=${encodeURIComponent(result.id)}`,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/v1/ramps/:userId/:txId", async (req, res) => {
  try {
    const tx = await client().getTransaction(req.params.userId, req.params.txId);
    res.json(tx);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/v1/ramps/:userId/:txId/watch", async (req, res) => {
  try {
    const autoSendUsdc = req.body?.autoSendUsdc !== false;
    const final = await client().watchAndSettle({
      userId: req.params.userId,
      transactionId: req.params.txId,
      autoSendUsdc,
    });
    res.json(final);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.listen(cfg.port, cfg.host, () => {
  console.log(
    `AXK MoneyGram ramps listening on http://${cfg.host}:${cfg.port} (${cfg.env} → ${cfg.homeDomain})`,
  );
  console.log(`Demo: http://127.0.0.1:${cfg.port}/demo/`);
});
