import { Router } from "express";
import type { AppEnv } from "../config/env";

export function createHealthRouter(env: Pick<AppEnv, "NODE_ENV" | "GITHUB_APP_NAME">) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.status(200).json({
      service: "TrustSignal GitHub App",
      app: env.GITHUB_APP_NAME,
      status: "ready",
      docs: {
        health: "/health",
        webhook: "/webhooks/github",
      },
    });
  });

  router.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "trustsignal-github-app",
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
